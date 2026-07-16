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
        accountId: "aa-account",
      },
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
      manifestDigest: "sha256:one",
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
        manifestDigest: "sha256:none",
        toolName: "x_posts",
        operation: "recent",
        methodVersion: "question-research.v1",
      }),
    ).resolves.toEqual({ status: "not_requested", records: 0 });
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
      },
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
      manifestDigest: "sha256:invalid",
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
        accountId: "account-conor",
      },
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
      },
      manifestRef: "artifacts/business-ops/x-acquisition-manifests-v4/owned.json",
      manifestDigest: "sha256:owned",
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
  });

  it("refuses to canonize owned analytics without an explicit account association", async () => {
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
      manifestDigest: "sha256:owned-no-account",
      toolName: "x_metrics",
      operation: "owned",
      methodVersion: "owned-performance.v1",
      authMode: "oauth",
    });

    expect(result).toMatchObject({
      status: "failed",
      records: 0,
      error: "owned X analytics require analytics_context.account_id",
    });
    expect((await new AgencyDataStore(resolveAgencyDataStateDir(root)).read()).records).toEqual([]);
  });
});
