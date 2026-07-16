import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgencyDataStore, resolveAgencyDataStateDir } from "@openclaw/agency-data/api.js";
import { afterEach, describe, expect, it } from "vitest";
import { createXAgencyDataAdapter } from "./agency-data-adapter.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("X to Agency Data trusted adapter", () => {
  it("records normalized source and metric rows without exposing a model write tool", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({
      stateDir: root,
      now: () => "2026-07-16T05:00:00.000Z",
    });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "company", entityId: "american-atomics" },
        accountId: "request-context-account",
      } as never,
      result: {
        data: {
          data: [
            {
              id: "post-1",
              author_id: "aa-account",
              text: "Transient source text",
              public_metrics: { like_count: 12, reply_count: 3 },
            },
          ],
        },
        receipt: { status: 200, rateLimit: {} },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/one.json",
      toolName: "x_posts",
      operation: "recent",
      methodVersion: "topic-pulse.v1",
    });

    expect(result).toEqual({ status: "recorded", records: 3 });
    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    const read = await store.read({ tenantId: "operator" });
    expect(read.records.map((record) => record.object_type)).toEqual([
      "source_observation",
      "metric_observation",
      "metric_observation",
    ]);
    const serialized = JSON.stringify(read.records);
    expect(serialized).not.toContain("Transient source text");
    expect(serialized).toContain("sha256:");
    expect(serialized).toContain("american-atomics");
    expect(serialized).toContain("aa-account");
    expect(serialized).not.toContain("request-context-account");
    expect(read.records.filter((record) => record.object_type === "metric_observation")).toEqual(
      expect.arrayContaining([expect.objectContaining({ distribution: "combined" })]),
    );
  });

  it("does not write when explicit tenant and subject context is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-none-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({ stateDir: root });
    await expect(
      adapter.ingest({
        result: { data: { data: [] }, receipt: { status: 200, rateLimit: {} } },
        manifestRef: "artifacts/none.json",
        toolName: "x_posts",
        operation: "recent",
        methodVersion: "question-research.v1",
      }),
    ).resolves.toEqual({ status: "not_requested", records: 0 });
  });

  it("attributes profile metrics to the returned stable profile id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-profile-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({
      stateDir: root,
      now: () => "2026-07-16T06:00:00.000Z",
    });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "company", entityId: "american-atomics" },
        accountId: "request-context-account",
      } as never,
      result: {
        data: {
          data: {
            id: "returned-profile-id",
            username: "AmericanAtomics",
            description: "Transient profile description",
            public_metrics: { followers_count: 1200, tweet_count: 80 },
          },
        },
        receipt: { status: 200, rateLimit: {} },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/profile.json",
      toolName: "x_users",
      operation: "lookup",
      methodVersion: "influence-map.v1",
    });

    expect(result).toEqual({ status: "recorded", records: 4 });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "operator",
    });
    expect(read.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          object_type: "source_observation",
          account_id: "returned-profile-id",
        }),
        expect.objectContaining({
          object_type: "metric_observation",
          account_id: "returned-profile-id",
          metric_definition_id: "x.public.followers_count",
        }),
        expect.objectContaining({
          object_type: "account_snapshot",
          account_id: "returned-profile-id",
        }),
      ]),
    );
    expect(JSON.stringify(read.records)).not.toContain("request-context-account");
    expect(JSON.stringify(read.records)).not.toContain("Transient profile description");
  });

  it("does not borrow request account context for public post metrics without author identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-post-author-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({ stateDir: root });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "person", entityId: "conor-lynch" },
        accountId: "owned-account-context",
      } as never,
      result: {
        data: {
          data: {
            id: "post-without-author",
            text: "Transient post body",
            public_metrics: { like_count: 9 },
          },
        },
        receipt: { status: 200, rateLimit: {} },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/post.json",
      toolName: "x_posts",
      operation: "recent",
      methodVersion: "topic-pulse.v1",
    });

    expect(result).toEqual({ status: "recorded", records: 1 });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "operator",
    });
    expect(read.records).toEqual([
      expect.objectContaining({
        object_type: "source_observation",
        content_id: "post-without-author",
      }),
    ]);
    expect(read.records[0]).not.toHaveProperty("account_id");
  });

  it("prevalidates the whole derived batch so one invalid metric leaves no partial rows", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-atomic-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({ stateDir: root });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "person", entityId: "conor-lynch" },
        accountId: "conor-account",
      } as never,
      result: {
        data: {
          data: [
            {
              id: "post-1",
              author_id: "conor-account",
              text: "Transient source text",
              public_metrics: { like_count: 12, ["x".repeat(513)]: 1 },
            },
          ],
        },
        receipt: { status: 200, rateLimit: {} },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/invalid.json",
      toolName: "x_posts",
      operation: "recent",
      methodVersion: "topic-pulse.v1",
    });

    expect(result).toMatchObject({ status: "failed", records: 0 });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read();
    expect(read.records).toEqual([]);
  });

  it("normalizes timestamped owned analytics without copying source bodies", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-owned-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({
      stateDir: root,
      now: () => "2026-07-16T12:00:00.000Z",
    });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "person", entityId: "conor-lynch" },
        accountId: "caller-supplied-account",
      } as never,
      result: {
        data: {
          data: [
            {
              id: "post-owned-1",
              timestamped_metrics: [
                {
                  timestamp: "2026-07-16T11:00:00.000Z",
                  metrics: { impressions: 500, engagements: 25 },
                },
              ],
            },
          ],
        },
        receipt: { status: 200, rateLimit: {} },
        trustedOwnership: {
          provider: "x",
          accountId: "account-conor",
          verifiedPostIds: ["post-owned-1"],
          verification: "authenticated_user_and_post_authors",
        },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/owned.json",
      toolName: "x_metrics",
      operation: "owned",
      methodVersion: "owned-performance.v1",
      authMode: "oauth",
      observationWindow: "1h",
      distribution: "combined",
    });

    expect(result).toEqual({ status: "recorded", records: 3 });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "operator",
    });
    const metrics = read.records.filter((record) => record.object_type === "metric_observation");
    expect(metrics).toHaveLength(2);
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_id: "account-conor",
          content_id: "post-owned-1",
          metric_definition_id: "x.owned.impressions",
          numerator: 500,
          distribution: "combined",
          observation_window: "1h",
          privacy: {
            classification: "restricted",
            restrictions: "owned_account_user_context",
          },
        }),
      ]),
    );
    expect(JSON.stringify(read.records)).not.toContain("timestamped_metrics");
    expect(JSON.stringify(read.records)).not.toContain("caller-supplied-account");
  });

  it("keeps analytical ids stable across captures and distinct across observation times", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-identity-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({ stateDir: root });
    const context = {
      tenantId: "operator",
      subject: { entityType: "company" as const, entityId: "american-atomics" },
    };
    const providerResult = (timestamp: string) => ({
      data: {
        data: [
          {
            id: "post-owned-886",
            timestamped_metrics: [{ timestamp, metrics: { impressions: 886 } }],
          },
        ],
      },
      receipt: { status: 200, rateLimit: {} },
      trustedOwnership: {
        provider: "x" as const,
        accountId: "provider-account",
        verifiedPostIds: ["post-owned-886"],
        verification: "authenticated_user_and_post_authors" as const,
      },
    });
    const ingest = (manifest: string, capturedAt: string, observationAt: string) =>
      adapter.ingest({
        context,
        result: providerResult(observationAt),
        manifestRef: `artifacts/business-ops/x-acquisition-manifests-v4/${manifest}.json`,
        toolName: "x_metrics",
        operation: "owned",
        methodVersion: "owned-performance.v1",
        observedAt: capturedAt,
        authMode: "oauth",
        distribution: "combined",
      });

    await ingest("capture-one", "2026-07-16T12:01:00.000Z", "2026-07-16T12:00:00.000Z");
    await ingest("capture-two", "2026-07-16T12:02:00.000Z", "2026-07-16T12:00:00.000Z");
    await ingest("capture-three", "2026-07-16T13:01:00.000Z", "2026-07-16T13:00:00.000Z");

    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "operator",
    });
    const metrics = read.records.filter((record) => record.object_type === "metric_observation");
    expect(metrics).toHaveLength(3);
    expect(metrics[0]?.object_id).toBe(metrics[1]?.object_id);
    expect(metrics[2]?.object_id).not.toBe(metrics[0]?.object_id);
    expect(metrics.map((record) => record.acquisition_manifest_ref)).toEqual([
      "artifacts/business-ops/x-acquisition-manifests-v4/capture-one.json",
      "artifacts/business-ops/x-acquisition-manifests-v4/capture-two.json",
      "artifacts/business-ops/x-acquisition-manifests-v4/capture-three.json",
    ]);
  });

  it("refuses to canonize owned analytics without provider-verified ownership", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "x-agency-data-owned-account-"));
    roots.push(root);
    const adapter = createXAgencyDataAdapter({ stateDir: root });
    const result = await adapter.ingest({
      context: {
        tenantId: "operator",
        subject: { entityType: "company", entityId: "american-atomics" },
      },
      result: {
        data: {
          data: [
            {
              id: "post-owned-2",
              timestamped_metrics: [
                { timestamp: "2026-07-16T11:00:00.000Z", metrics: { impressions: 10 } },
              ],
            },
          ],
        },
        receipt: { status: 200, rateLimit: {} },
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/owned-no-account.json",
      toolName: "x_metrics",
      operation: "owned",
      methodVersion: "owned-performance.v1",
      authMode: "oauth",
    });

    expect(result).toMatchObject({
      status: "failed",
      records: 0,
      error: "owned X analytics require provider-verified ownership",
    });
    expect((await new AgencyDataStore(resolveAgencyDataStateDir(root)).read()).records).toEqual([]);
  });
});
