import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { AgencyDataStore, resolveAgencyDataStateDir } from "@openclaw/agency-data/api.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
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
        account_id: "456",
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
