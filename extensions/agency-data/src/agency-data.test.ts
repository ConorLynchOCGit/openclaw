import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createTrustedAgencyDataIngestion } from "../api.js";
import plugin from "../index.js";
import {
  MAX_MODEL_RESULT_BYTES,
  queryMarketingDataCatalog,
  queryMarketingMetrics,
} from "./queries.js";
import { AgencyDataStore, materializeVisibleRecords, resolveAgencyDataStateDir } from "./store.js";

const tempDirs: string[] = [];

async function tempStateDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agency-data-test-"));
  tempDirs.push(dir);
  return dir;
}

function base(type: string, id: string) {
  return {
    object_type: type,
    object_id: id,
    tenant_id: "tenant-a",
    subject: { entity_type: "company", entity_id: "company-a" },
    channel: "linkedin",
    source: { provider: "adapter", auth_mode: "oauth" },
    source_ref: { source_id: `source-${id}` },
    event_at: "2026-07-16T00:00:00.000Z",
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("agency-data canonical JSONL", () => {
  it("appends metric observations and preserves organic/promoted separation", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    await ingestor.append({
      ...base("metric_observation", "organic-1"),
      account_id: "account-a",
      content_id: "content-a",
      metric_definition_id: "engagement-rate",
      metric_family: "engagement",
      metric_name: "rate",
      numerator: 10,
      denominator: 100,
      unit: "ratio",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T00:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "v1",
      observation_at: "2026-07-16T00:00:00.000Z",
      distribution: "organic",
    });
    await ingestor.append({
      ...base("metric_observation", "promoted-1"),
      account_id: "account-a",
      content_id: "content-a",
      metric_definition_id: "engagement-rate",
      metric_family: "engagement",
      metric_name: "rate",
      numerator: 90,
      denominator: 100,
      unit: "ratio",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T00:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "v1",
      observation_at: "2026-07-16T00:00:00.000Z",
      distribution: "promoted",
    });
    const result = await queryMarketingMetrics(
      new AgencyDataStore(resolveAgencyDataStateDir(root)),
      {
        tenant_id: "tenant-a",
        metric_definition_id: "engagement-rate",
        distribution: "organic",
        trend: false,
      },
    );
    expect(result.summary).toMatchObject({ sample_size: 1, aggregate_rate: 0.1 });
    expect(result.summary.warnings).toContain("sample_size_below_30");
  });

  it("materializes the latest duplicate object once per tenant for metric totals", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const metric = {
      ...base("metric_observation", "x-impressions-post-1-at-noon"),
      account_id: "account-a",
      content_id: "post-1",
      metric_definition_id: "x.owned.impressions",
      metric_family: "x_owned_analytics",
      metric_name: "impressions",
      numerator: 886,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "provisional", as_of: "2026-07-16T12:01:00.000Z" },
      privacy: { classification: "restricted", restrictions: "owned_account_user_context" },
      method_version: "owned-performance.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    };
    await ingestor.append({ ...metric, recorded_at: "2026-07-16T12:01:00.000Z" });
    await ingestor.append({ ...metric, recorded_at: "2026-07-16T12:02:00.000Z" });
    await ingestor.append({
      ...metric,
      tenant_id: "tenant-b",
      recorded_at: "2026-07-16T12:03:00.000Z",
    });

    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    const raw = await store.read();
    expect(raw.records).toHaveLength(3);
    const materialized = materializeVisibleRecords(raw.records);
    expect(materialized).toHaveLength(2);
    expect(materialized.find((record) => record.tenant_id === "tenant-a")).toMatchObject({
      numerator: 886,
      recorded_at: "2026-07-16T12:02:00.000Z",
    });

    const result = await queryMarketingMetrics(store, {
      tenant_id: "tenant-a",
      metric_definition_id: "x.owned.impressions",
      distribution: "combined",
      trend: false,
    });
    expect(result.summary).toMatchObject({
      sample_size: 1,
      numerator_total: 886,
      denominator_total: 1,
    });
  });

  it("rejects raw content and uses a tombstone rather than mutation", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    await expect(
      ingestor.append({
        ...base("content_item", "bad"),
        account_id: "account-a",
        content_id: "content-a",
        published_at: "2026-07-16T00:00:00.000Z",
        content_hash: "sha256:abc",
        content_format: "post",
        topic_ids: ["topic-a"],
        text: "raw post",
      }),
    ).rejects.toThrow("forbidden");
    await ingestor.append({
      ...base("content_item", "content-1"),
      account_id: "account-a",
      content_id: "content-a",
      published_at: "2026-07-16T00:00:00.000Z",
      content_hash: "sha256:abc",
      content_format: "post",
      topic_ids: ["topic-a"],
    });
    await ingestor.appendTombstone({
      ...base("correction_tombstone", "tombstone-1"),
      target_object_id: "content-1",
      reason_code: "source_retracted",
    });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "tenant-a",
    });
    expect(read.records).toHaveLength(2);
    expect(materializeVisibleRecords(read.records)).toEqual([]);
  });

  it("keeps a target visible until its tenant-local correction replacement exists", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    await ingestor.append({
      ...base("content_item", "original"),
      account_id: "account-a",
      content_id: "content-a",
      published_at: "2026-07-16T00:00:00.000Z",
      content_hash: "sha256:original",
      content_format: "post",
      topic_ids: ["topic-a"],
    });
    await ingestor.appendCorrection({
      ...base("correction_tombstone", "correction-1"),
      target_object_id: "original",
      replacement_object_id: "replacement",
      reason_code: "source_corrected",
    });

    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    expect(
      materializeVisibleRecords((await store.read()).records).map((record) => record.object_id),
    ).toEqual(["original"]);

    await ingestor.append({
      ...base("content_item", "replacement"),
      account_id: "account-a",
      content_id: "content-a",
      published_at: "2026-07-16T00:00:00.000Z",
      content_hash: "sha256:replacement",
      content_format: "post",
      topic_ids: ["topic-a"],
    });
    expect(
      materializeVisibleRecords((await store.read()).records).map((record) => record.object_id),
    ).toEqual(["replacement"]);
  });

  it("serializes concurrent appends into complete JSONL rows", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        ingestor.append({
          ...base("source_observation", `observation-${index}`),
          observation_kind: "account_sync",
          observed_at: "2026-07-16T00:00:00.000Z",
          method_version: "account-sync.v1",
        }),
      ),
    );
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read();
    expect(read).toMatchObject({ scanned: 20, malformed_rows: 0, truncated: false });
    expect(new Set(read.records.map((record) => record.object_id)).size).toBe(20);
  });

  it("bounds catalog output by serialized bytes as well as record count", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    for (let index = 0; index < 5; index += 1) {
      await ingestor.append({
        ...base("content_item", `large-${index}`),
        account_id: "account-a",
        content_id: `content-${index}`,
        published_at: "2026-07-16T00:00:00.000Z",
        content_hash: `sha256:${index}`,
        content_format: "post",
        topic_ids: Array.from({ length: 80 }, (_, topic) => `${topic}-${"x".repeat(490)}`),
      });
    }
    const result = await queryMarketingDataCatalog(
      new AgencyDataStore(resolveAgencyDataStateDir(root)),
      { tenant_id: "tenant-a", object_types: ["content_item"], max_results: 200 },
    );
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(
      MAX_MODEL_RESULT_BYTES,
    );
    expect(result.results_truncated).toBe(true);
  });

  it("registers exactly the three read-only model tools", () => {
    const registered: string[] = [];
    const cliDescriptors: string[] = [];
    plugin.register({
      registerTool: (_tool, options) => registered.push(String(options?.name)),
      registerCli: (_registrar, options) => {
        cliDescriptors.push(...(options?.descriptors ?? []).map((entry) => entry.name));
      },
    } as OpenClawPluginApi);
    expect(registered).toEqual([
      "marketing_data_catalog",
      "marketing_metrics",
      "marketing_experiments",
    ]);
    expect(cliDescriptors).toEqual(["agency-data"]);
  });
});
