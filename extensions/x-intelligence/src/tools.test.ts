import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { AgencyDataStore, resolveAgencyDataStateDir } from "@openclaw/agency-data/api.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import { Value } from "typebox/value";
import { afterEach, describe, expect, it } from "vitest";
import { createXIntelligenceTools } from "./tools.js";
import { createXReadTransport } from "./transport.js";

const TOKEN = "x-tool-test-token-that-must-not-leak";
const tempDirs: string[] = [];
let server: Server | undefined;

afterEach(async () => {
  server?.close();
  server = undefined;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function memoryStore<T>(): PluginStateKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async registerIfAbsent(key, value) {
      if (values.has(key)) {
        return false;
      }
      values.set(key, value);
      return true;
    },
    async lookup(key) {
      return values.get(key);
    },
    async consume(key) {
      const value = values.get(key);
      values.delete(key);
      return value;
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return Array.from(values, ([key, value]) => ({ key, value, createdAt: 0 }));
    },
    async clear() {
      values.clear();
    },
  };
}

function fakeApi(): OpenClawPluginApi {
  const store = memoryStore();
  return {
    runtime: { state: { openKeyedStore: () => store } },
  } as unknown as OpenClawPluginApi;
}

async function startServer(handler: Parameters<typeof createServer>[0]) {
  server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server did not bind");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("x intelligence model tools", () => {
  it("returns bounded source evidence while keeping copied content out of the immutable manifest", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "x-rate-limit-remaining": "99",
      });
      response.end(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: `bounded source post ${TOKEN}`,
              author_id: "456",
              public_metrics: { like_count: 7, reply_count: 2 },
            },
          ],
          includes: {
            users: [{ id: "456", username: "example", description: "source profile" }],
          },
          meta: { result_count: 1, next_token: "next-page" },
        }),
      );
    });
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:test" },
      analyticsStateDir: stateDir,
      createTransport: () => createXReadTransport({ apiKey: TOKEN, baseUrl, timeoutMs: 1_000 }),
    });
    const tool = tools.find((candidate) => candidate.name === "x_posts");
    expect(tool).toBeDefined();

    const opaqueToolCallId = "call_native|fc_opaque:123";
    const result = await tool!.execute(opaqueToolCallId, {
      purpose: "topic_pulse",
      operation: "recent",
      query: "nuclear energy",
      max_results: 10,
      analytics_context: {
        tenant_id: "operator",
        subject_type: "company",
        subject_id: "american-atomics",
      },
    });
    const details = result.details as Record<string, unknown>;
    expect(details.status, JSON.stringify(details)).toBe("complete");
    expect(JSON.stringify(details)).not.toContain(TOKEN);
    expect(details.continuation).toEqual({ available: true, pagination_token: "next-page" });
    expect(details.analytics).toEqual({ status: "recorded", records: 4 });
    const evidence = details.evidence as { ref: string; digest: string };
    expect(evidence.ref).toMatch(/^artifacts\/business-ops\/x-acquisition-manifests-v4\//);
    const manifestPath = path.join(workspaceDir, evidence.ref);
    const manifest = await fs.readFile(manifestPath, "utf8");
    expect(manifest).toContain("x_acquisition_manifest.v4");
    expect(manifest).toContain("sha256:");
    expect(manifest).toContain("toolcall:sha256:");
    expect(manifest).not.toContain(opaqueToolCallId);
    expect(manifest).not.toContain("bounded source post");
    expect(manifest).not.toContain("source profile");
    expect(
      await fs.stat(
        path.join(workspaceDir, "artifacts", "business-ops", "x-acquisition-manifests-v4"),
      ),
    ).toBeDefined();
    const analytics = await new AgencyDataStore(resolveAgencyDataStateDir(stateDir)).read({
      tenantId: "operator",
    });
    expect(analytics.records).toHaveLength(4);
    expect(JSON.stringify(analytics.records)).not.toContain("bounded source post");
    expect(analytics.records[0]).toMatchObject({
      subject: { entity_type: "company", entity_id: "american-atomics" },
      acquisition_manifest_ref: evidence.ref,
      observation_kind: "x_posts.recent.post",
      method_version: "x-research-method.v1",
    });
  });

  it("registers only the six read-only source tools", () => {
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir: "/tmp" },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "x_posts",
      "x_counts",
      "x_users",
      "x_timelines",
      "x_trends",
      "x_metrics",
    ]);
    expect(JSON.stringify(tools.map((tool) => tool.parameters))).not.toMatch(
      /publish|create_post|delete_post|follow_user|send_message|schedule_post/,
    );
    expect(JSON.stringify(tools[0]?.parameters)).toContain("analytics_context");
  });

  it("publishes operation-specific user and metric schemas", () => {
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir: "/tmp" },
    });
    const users = tools.find((tool) => tool.name === "x_users");
    const metrics = tools.find((tool) => tool.name === "x_metrics");
    expect(users).toBeDefined();
    expect(metrics).toBeDefined();

    expect(
      Value.Check(users!.parameters, {
        purpose: "influence_map",
        operation: "search",
        query: "nuclear energy",
        max_results: 10,
      }),
    ).toBe(true);
    expect(Value.Check(users!.parameters, { purpose: "influence_map", operation: "search" })).toBe(
      false,
    );
    expect(
      Value.Check(users!.parameters, {
        purpose: "influence_map",
        operation: "identity",
        username: "example",
      }),
    ).toBe(true);
    expect(
      Value.Check(users!.parameters, {
        purpose: "influence_map",
        operation: "identity",
        id: "1",
        username: "example",
      }),
    ).toBe(false);

    expect(
      Value.Check(metrics!.parameters, {
        purpose: "format_study",
        operation: "public",
        post_ids: ["1"],
      }),
    ).toBe(true);
    expect(
      Value.Check(metrics!.parameters, {
        purpose: "owned_performance",
        operation: "owned",
        post_ids: ["1"],
        start_time: "2026-07-01T00:00:00Z",
        end_time: "2026-07-08T00:00:00Z",
        metric_names: ["impressions"],
        analytics_context: {
          tenant_id: "operator",
          subject_type: "company",
          subject_id: "american-atomics",
          account_id: "caller-account",
        },
      }),
    ).toBe(false);
    expect(JSON.stringify(metrics!.parameters)).not.toContain('"account_id"');
    expect(
      Value.Check(metrics!.parameters, {
        purpose: "owned_performance",
        operation: "owned",
        post_ids: ["1"],
        metric_names: ["impressions"],
      }),
    ).toBe(false);
    expect(
      Value.Check(metrics!.parameters, {
        purpose: "owned_performance",
        operation: "owned",
        post_ids: ["1"],
        start_time: "2026-07-01T00:00:00Z",
        end_time: "2026-07-08T00:00:00Z",
        granularity: "daily",
        metric_names: ["impressions"],
      }),
    ).toBe(true);
    expect(
      Value.Check(metrics!.parameters, {
        purpose: "owned_performance",
        operation: "usage",
        days: 7,
        post_ids: ["1"],
      }),
    ).toBe(false);
  });

  it("uses user-specific expansions for identity lookup", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-users-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-users-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const baseUrl = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/users/by/username/example");
      expect(url.searchParams.get("expansions")).toBe("pinned_tweet_id");
      expect(url.searchParams.get("expansions")).not.toContain("author_id");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: { id: "1", username: "example" } }));
    });
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:identity" },
      analyticsStateDir: stateDir,
      createTransport: () => createXReadTransport({ apiKey: TOKEN, baseUrl, timeoutMs: 1_000 }),
    });
    const users = tools.find((tool) => tool.name === "x_users");

    const result = await users!.execute("call-user-identity", {
      purpose: "influence_map",
      operation: "identity",
      username: "example",
    });

    expect(result.details).toMatchObject({ status: "complete" });
  });

  it("uses trusted ownership for Agency Data and receipts all owned provider requests", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-owned-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-owned-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const api = fakeApi();
    const tools = createXIntelligenceTools({
      api,
      config: { apiKey: TOKEN, ownedMetricsApiKey: "configured-owned-token" },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:owned" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          metrics: {
            owned: async () => ({
              data: {
                data: [
                  {
                    id: "post-owned-1",
                    timestamped_metrics: [
                      {
                        timestamp: "2026-07-16T11:00:00.000Z",
                        metrics: { impressions: 886 },
                      },
                    ],
                  },
                ],
              },
              receipt: { status: 200, rateLimit: {}, resourceId: "analytics" },
              receipts: [
                { status: 200, rateLimit: {}, resourceId: "identity" },
                { status: 200, rateLimit: {}, resourceId: "posts" },
                { status: 200, rateLimit: {}, resourceId: "analytics" },
              ],
              trustedOwnership: {
                provider: "x",
                accountId: "provider-account",
                verifiedPostIds: ["post-owned-1"],
                verification: "authenticated_user_and_post_authors",
              },
            }),
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    });
    const metrics = tools.find((tool) => tool.name === "x_metrics");

    const result = await metrics!.execute("call-owned-metrics", {
      purpose: "owned_performance",
      operation: "owned",
      post_ids: ["post-owned-1"],
      start_time: "2026-07-16T00:00:00Z",
      end_time: "2026-07-17T00:00:00Z",
      granularity: "hourly",
      metric_names: ["impressions"],
      analytics_context: {
        tenant_id: "operator",
        subject_type: "company",
        subject_id: "american-atomics",
        account_id: "caller-account",
      },
    });

    const details = result.details as Record<string, unknown>;
    expect(details).toMatchObject({
      status: "complete",
      analytics: { status: "recorded", records: 2 },
      resources: { requests: 3 },
    });
    const evidence = details.evidence as { ref: string };
    const manifest = JSON.parse(await fs.readFile(path.join(workspaceDir, evidence.ref), "utf8"));
    expect(manifest.resources.requests).toBe(3);
    const analytics = await new AgencyDataStore(resolveAgencyDataStateDir(stateDir)).read({
      tenantId: "operator",
    });
    expect(analytics.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object_type: "metric_observation",
          account_id: "provider-account",
          numerator: 886,
        }),
      ]),
    );
    expect(JSON.stringify(analytics.records)).not.toContain("caller-account");
  });

  it("returns a truthful no-decision receipt without a provider call when the purpose budget is exhausted", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-budget-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-budget-state-"));
    tempDirs.push(workspaceDir, stateDir);
    let requests = 0;
    const baseUrl = await startServer((_request, response) => {
      requests += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], meta: { result_count: 0 } }));
    });
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN, episodeBudgets: { topic_pulse: 1 } },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:budget" },
      analyticsStateDir: stateDir,
      createTransport: () => createXReadTransport({ apiKey: TOKEN, baseUrl, timeoutMs: 1_000 }),
    });
    const tool = tools.find((candidate) => candidate.name === "x_posts");
    expect(tool).toBeDefined();

    const input = {
      purpose: "topic_pulse",
      operation: "recent",
      query: "nuclear energy",
      max_results: 10,
    };
    const first = await tool!.execute("call-budget-1", input);
    const second = await tool!.execute("call-budget-2", input);

    expect(first.details).toMatchObject({ status: "complete" });
    expect(second.details).toMatchObject({
      status: "partial",
      verdict: "no_decision",
      error: { code: "episode_budget_exhausted" },
      budget: { allowed: false, limit: 1, used: 1, remaining: 0 },
      resources: { requests: 0 },
    });
    expect(requests).toBe(1);
  });
});
