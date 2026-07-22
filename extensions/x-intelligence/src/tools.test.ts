import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { AgencyDataStore, resolveAgencyDataStateDir } from "@openclaw/agency-data/api.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import { Value } from "typebox/value";
import { afterEach, describe, expect, it } from "vitest";
import { createXIntelligenceTools } from "./tools.js";
import { createXReadTransport, XTransportError } from "./transport.js";

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

async function startServer(handler: RequestListener) {
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
              created_at: "2026-07-16T04:00:00.000Z",
              public_metrics: { like_count: 7, reply_count: 2 },
            },
          ],
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
    expect(details.analytics).toEqual({ status: "recorded", records: 3 });
    const evidence = details.evidence as { ref: string; digest: string };
    expect(evidence.ref).toMatch(/^artifacts\/business-ops\/x-acquisition-manifests-v4\//);
    const manifestPath = path.join(workspaceDir, evidence.ref);
    const manifest = await fs.readFile(manifestPath, "utf8");
    expect(manifest).toContain("x_acquisition_manifest.v4");
    expect(manifest).toContain("sha256:");
    expect(manifest).toContain("toolcall:sha256:");
    expect(manifest).not.toContain(opaqueToolCallId);
    expect(manifest).not.toContain("bounded source post");
    expect(
      await fs.stat(
        path.join(workspaceDir, "artifacts", "business-ops", "x-acquisition-manifests-v4"),
      ),
    ).toBeDefined();
    const analytics = await new AgencyDataStore(resolveAgencyDataStateDir(stateDir)).read({
      tenantId: "operator",
    });
    expect(analytics.records).toHaveLength(3);
    expect(JSON.stringify(analytics.records)).not.toContain("bounded source post");
    expect(analytics.records[0]).toMatchObject({
      subject: { entity_type: "company", entity_id: "american-atomics" },
      acquisition_manifest_ref: evidence.ref,
      observation_kind: "x_posts.recent.post",
      method_version: "x-research-method.v1",
    });
    const publicMetric = analytics.records.find(
      (record) => record.object_type === "metric_observation",
    );
    expect(publicMetric).toMatchObject({
      analytical_sample_id: expect.any(String),
      comparison_signature: expect.any(String),
    });
    expect(publicMetric).not.toHaveProperty("comparison_profile");
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
    const posts = tools.find((tool) => tool.name === "x_posts");
    const timelines = tools.find((tool) => tool.name === "x_timelines");
    expect(users).toBeDefined();
    expect(metrics).toBeDefined();
    expect(posts).toBeDefined();
    expect(timelines).toBeDefined();

    expect(
      Value.Check(posts!.parameters, {
        purpose: "source_verification",
        operation: "batch",
        ids: ["one", "two"],
      }),
    ).toBe(true);
    expect(
      Value.Check(posts!.parameters, {
        purpose: "format_study",
        operation: "format_media",
        post_ids: Array.from({ length: 11 }, (_, index) => String(index)),
      }),
    ).toBe(false);
    expect(
      Value.Check(timelines!.parameters, {
        purpose: "format_study",
        operation: "authored",
        user_id: "user-1",
        max_results: 5,
      }),
    ).toBe(true);
    expect(
      Value.Check(timelines!.parameters, {
        purpose: "format_study",
        operation: "authored",
        user_id: "user-1",
        max_results: 4,
      }),
    ).toBe(false);

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
      Value.Check(users!.parameters, {
        purpose: "influence_map",
        operation: "identity",
        ids: ["1", "2"],
      }),
    ).toBe(true);
    expect(
      Value.Check(users!.parameters, {
        purpose: "influence_map",
        operation: "identity",
        usernames: Array.from({ length: 101 }, (_, index) => `user-${index}`),
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
        metric_names: ["invented_metric"],
      }),
    ).toBe(false);
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

  it("uses the frozen user_identity_v1 fields without expansions", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-users-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-users-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const baseUrl = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/users/by/username/example");
      expect(url.searchParams.get("expansions")).toBeNull();
      expect(url.searchParams.get("tweet.fields")).toBeNull();
      expect(url.searchParams.get("user.fields")).toBe(
        "id,username,name,description,created_at,verified,public_metrics",
      );
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            id: "1",
            username: "example",
            public_metrics: { followers_count: 42, following_count: 7, tweet_count: 11 },
          },
        }),
      );
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
      analytics_context: {
        tenant_id: "operator",
        subject_type: "company",
        subject_id: "example-subject",
      },
    });

    expect(result.details).toMatchObject({ status: "complete" });
    const analytics = await new AgencyDataStore(resolveAgencyDataStateDir(stateDir)).read({
      tenantId: "operator",
    });
    expect(analytics.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object_type: "account_snapshot",
          account_id: "1",
          follower_count: 42,
        }),
      ]),
    );
    expect(analytics.records).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ object_type: "metric_observation" })]),
    );
  });

  it("hydrates an exact native XDK Post-ID batch with the expansion-free core profile", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-post-batch-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-post-batch-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const baseUrl = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets");
      expect(url.searchParams.get("ids")).toBe("post-1,post-2");
      expect(url.searchParams.get("tweet.fields")).toBe(
        "id,text,author_id,created_at,conversation_id,referenced_tweets,lang,entities,public_metrics,attachments",
      );
      expect(url.searchParams.get("expansions")).toBeNull();
      expect(url.searchParams.get("user.fields")).toBeNull();
      expect(url.searchParams.get("media.fields")).toBeNull();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "post-1" }, { id: "post-2" }] }));
    });
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:post-batch" },
      analyticsStateDir: stateDir,
      createTransport: () => createXReadTransport({ apiKey: TOKEN, baseUrl, timeoutMs: 1_000 }),
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-post-batch", {
      purpose: "source_verification",
      operation: "batch",
      ids: ["post-1", "post-2"],
    });

    expect(result.details).toMatchObject({
      status: "complete",
      profile: "post_core_v1",
      resources: { requests: 1, pages: 0, posts: 2, users: 0, media: 0 },
    });
  });

  it("fails an oversized paged response before evidence, cache, or analytics ingestion", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-page-cap-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-page-cap-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:page-cap" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          posts: {
            recent: async () => ({
              data: {
                data: Array.from({ length: 11 }, (_, index) => ({
                  id: `unexpected-${index}`,
                  text: "must not persist",
                })),
              },
              receipt: { status: 200, rateLimit: {} },
              receipts: [{ status: 200, rateLimit: {}, serializedBytes: 2_048 }],
            }),
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-page-cap", {
      purpose: "topic_pulse",
      operation: "recent",
      query: "bounded category",
      max_results: 10,
      analytics_context: {
        tenant_id: "operator",
        subject_type: "company",
        subject_id: "subject",
      },
    });

    expect(result.details).toMatchObject({
      status: "failed",
      error: { code: "unexpected_response" },
      resources: { requests: 1, pages: 1, posts: 11, serialized_bytes: 2_048 },
    });
    const details = result.details as Record<string, unknown>;
    const evidence = details.evidence as { ref: string };
    const manifest = JSON.parse(await fs.readFile(path.join(workspaceDir, evidence.ref), "utf8"));
    expect(manifest.evidence.ids).toEqual([]);
    const analytics = await new AgencyDataStore(resolveAgencyDataStateDir(stateDir)).read({
      tenantId: "operator",
    });
    expect(analytics.records).toEqual([]);
  });

  it("uses format_media_v1 only for selected Posts and fails unexpected author includes after counting the request", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "x-tools-format-media-workspace-"),
    );
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-format-media-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const baseUrl = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets");
      expect(url.searchParams.get("ids")).toBe("post-1");
      expect(url.searchParams.get("expansions")).toBe("attachments.media_keys");
      expect(url.searchParams.get("user.fields")).toBeNull();
      expect(url.searchParams.get("media.fields")).toBe(
        "media_key,type,url,preview_image_url,width,height,duration_ms,public_metrics",
      );
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [{ id: "post-1", attachments: { media_keys: ["media-1"] } }],
          includes: {
            media: [{ media_key: "media-1", type: "photo" }],
            users: [{ id: "author-1" }],
          },
        }),
      );
    });
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:format-media" },
      analyticsStateDir: stateDir,
      createTransport: () => createXReadTransport({ apiKey: TOKEN, baseUrl, timeoutMs: 1_000 }),
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-format-media", {
      purpose: "format_study",
      operation: "format_media",
      post_ids: ["post-1"],
    });

    expect(result.details).toMatchObject({
      status: "failed",
      error: { code: "unexpected_response" },
      requests: 1,
      resources: {
        requests: 1,
        posts: 1,
        users: 1,
        media: 1,
        serialized_bytes: expect.any(Number),
      },
    });
  });

  it("requires every selected Post and referenced media object and receipts rights and retention", async () => {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "x-tools-format-complete-workspace-"),
    );
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-format-complete-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:format-complete" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          posts: {
            batch: async () => ({
              data: {
                data: [
                  { id: "post-1", attachments: { media_keys: ["media-1"] } },
                  { id: "post-2" },
                ],
                includes: { media: [{ media_key: "media-1", type: "photo" }] },
              },
              receipt: { status: 200, rateLimit: {}, serializedBytes: 1_024 },
            }),
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-format-complete", {
      purpose: "format_study",
      operation: "format_media",
      post_ids: ["post-1", "post-2"],
    });

    expect(result.details).toMatchObject({
      status: "complete",
      format_media: {
        requested_post_ids: ["post-1", "post-2"],
        returned_post_ids: ["post-1", "post-2"],
        missing_post_ids: [],
        required_media_keys: ["media-1"],
        returned_media_keys: ["media-1"],
        missing_media_keys: [],
        posts_without_media: ["post-2"],
        rights: { status: "not_exposed_by_x_api" },
        retention: {
          raw_content_cache_max_hours: 24,
          evidence_manifest: "metadata_only",
        },
      },
    });

    const missing = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:format-missing" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          posts: {
            batch: async () => ({
              data: {
                data: [{ id: "post-1", attachments: { media_keys: ["media-1"] } }],
                includes: { media: [] },
              },
              receipt: { status: 200, rateLimit: {}, serializedBytes: 512 },
            }),
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    }).find((tool) => tool.name === "x_posts");
    const failed = await missing!.execute("call-format-missing", {
      purpose: "format_study",
      operation: "format_media",
      post_ids: ["post-1", "post-2"],
    });
    expect(failed.details).toMatchObject({
      status: "failed",
      error: { code: "unexpected_response" },
      format_media: {
        missing_post_ids: ["post-2"],
        missing_media_keys: ["media-1"],
      },
    });
  });

  it("caps format media at four included objects per selected Post", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-media-cap-workspace-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-media-cap-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:media-cap" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          posts: {
            batch: async () => ({
              data: {
                data: [{ id: "post-1" }],
                includes: {
                  media: Array.from({ length: 5 }, (_, index) => ({
                    media_key: `media-${index + 1}`,
                    type: "photo",
                  })),
                },
              },
              receipt: { status: 200, rateLimit: {}, serializedBytes: 1_024 },
            }),
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-media-cap", {
      purpose: "format_study",
      operation: "format_media",
      post_ids: ["post-1"],
    });

    expect(result.details).toMatchObject({
      status: "failed",
      error: { code: "unexpected_response" },
      resources: { requests: 1, posts: 1, media: 5 },
    });
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
              trustedOwnedAnalytics: {
                provider: "x",
                providerMetricClass: "analytics",
                startTime: "2026-07-16T00:00:00Z",
                endTime: "2026-07-17T00:00:00Z",
                granularity: "hourly",
                requestedMetrics: ["impressions"],
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
      resources: { requests: 3, posts: 1, users: 1 },
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
          metric_definition_id: "x.owned.analytics.impressions",
          provider_metric_class: "analytics",
          distribution: "provider_total",
          numerator: 886,
        }),
      ]),
    );
    expect(JSON.stringify(analytics.records)).not.toContain("caller-account");
    const ownedMetric = analytics.records.find(
      (record) => record.object_type === "metric_observation",
    );
    expect(ownedMetric).toMatchObject({
      analytical_sample_id: expect.any(String),
      comparison_signature: expect.any(String),
    });
    expect(ownedMetric).not.toHaveProperty("comparison_profile");
  });

  it("rejects missing owned post IDs before constructing transport or spending a request budget", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-owned-invalid-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-owned-invalid-state-"));
    tempDirs.push(workspaceDir, stateDir);
    let transportConstructions = 0;
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN, ownedMetricsApiKey: "configured-owned-token" },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:owned-invalid" },
      analyticsStateDir: stateDir,
      createTransport: () => {
        transportConstructions += 1;
        return createXReadTransport({ apiKey: TOKEN });
      },
    });
    const metrics = tools.find((tool) => tool.name === "x_metrics");

    await expect(
      metrics!.execute("call-owned-missing-posts", {
        purpose: "owned_performance",
        operation: "owned",
        start_time: "2026-07-16T00:00:00Z",
        end_time: "2026-07-17T00:00:00Z",
        metric_names: ["impressions"],
      }),
    ).rejects.toMatchObject({
      kind: "owned_metrics_post_ids_required",
      category: "request",
      requestCount: 0,
    });
    expect(transportConstructions).toBe(0);
  });

  it("sums every completed transport receipt when a multi-request operation fails", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-failure-bytes-"));
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-tools-failure-bytes-state-"));
    tempDirs.push(workspaceDir, stateDir);
    const tools = createXIntelligenceTools({
      api: fakeApi(),
      config: { apiKey: TOKEN },
      ctx: { workspaceDir, sessionKey: "agent:x-researcher:failure-bytes" },
      analyticsStateDir: stateDir,
      createTransport: () =>
        ({
          posts: {
            exact: async () => {
              throw new XTransportError("server", {
                receipts: [
                  { status: 200, rateLimit: {}, serializedBytes: 120 },
                  { status: 503, rateLimit: {}, serializedBytes: 80 },
                ],
              });
            },
          },
        }) as unknown as ReturnType<typeof createXReadTransport>,
    });
    const posts = tools.find((tool) => tool.name === "x_posts");

    const result = await posts!.execute("call-failure-bytes", {
      purpose: "source_verification",
      operation: "exact",
      id: "post-1",
    });

    expect(result.details).toMatchObject({
      status: "failed",
      requests: 2,
      resources: { requests: 2, serialized_bytes: 200 },
    });
  });
});
