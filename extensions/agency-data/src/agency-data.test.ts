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
import { resolveMetricIdentity } from "./schema.js";
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

function v2Metric(record: Record<string, unknown>) {
  const metric = {
    observation_window: "24h",
    channel_profile_version: "linkedin-public.v1",
    metric_profile_version: "marketing-metrics.v2",
    metric_mapping_version: "adapter-mapping.v1",
    provider_metric_class: "public",
    bucket_granularity: "aggregate",
    ...record,
  };
  const identity = resolveMetricIdentity(metric);
  if (!identity) {
    throw new Error("test metric must have a resolvable v2 identity");
  }
  return {
    ...metric,
    analytical_sample_id: identity.analytical_sample_id,
    comparison_signature: identity.comparison_signature,
  };
}

function metricQuery(record: Record<string, unknown>) {
  const identity = resolveMetricIdentity(record);
  if (!identity) {
    throw new Error("test metric must have a resolvable comparison profile");
  }
  return {
    tenant_id: "tenant-a",
    metric_definition_id: String(record.metric_definition_id),
    distribution: record.distribution as "organic" | "promoted" | "combined" | "provider_total",
    comparison_profile: identity.comparison_profile,
    trend: false,
  };
}

async function expectNoSummaryComparisonFailure(
  operation: Promise<unknown>,
  code:
    | "comparison_profile_required"
    | "comparison_signature_mismatch"
    | "analytical_sample_identity_unresolved"
    | "normalization_method_unsupported",
) {
  const error = await operation.then(
    () => {
      throw new Error("expected comparison query to fail");
    },
    (reason: unknown) => reason,
  );
  expect(error).toMatchObject({ code });
  expect(error).not.toHaveProperty("summary");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("agency-data canonical JSONL", () => {
  it("appends metric observations and preserves organic/promoted separation", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const organic = v2Metric({
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
    await ingestor.append(organic);
    await ingestor.append(
      v2Metric({
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
      }),
    );
    const result = await queryMarketingMetrics(
      new AgencyDataStore(resolveAgencyDataStateDir(root)),
      metricQuery(organic),
    );
    expect(result.summary).toMatchObject({ sample_size: 1, aggregate_rate: 0.1 });
    expect(result.summary.warnings).toContain("sample_size_below_30");
  });

  it("materializes the latest duplicate object once per tenant for metric totals", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const metric = v2Metric({
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
    });
    await ingestor.append({ ...metric, recorded_at: "2026-07-16T12:01:00.000Z" });
    await ingestor.append({ ...metric, recorded_at: "2026-07-16T12:02:00.000Z" });
    await ingestor.append(
      v2Metric({
        ...metric,
        tenant_id: "tenant-b",
        recorded_at: "2026-07-16T12:03:00.000Z",
      }),
    );

    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    const raw = await store.read();
    expect(raw.records).toHaveLength(3);
    const materialized = materializeVisibleRecords(raw.records);
    expect(materialized).toHaveLength(2);
    expect(materialized.find((record) => record.tenant_id === "tenant-a")).toMatchObject({
      numerator: 886,
      recorded_at: "2026-07-16T12:02:00.000Z",
    });

    const result = await queryMarketingMetrics(store, metricQuery(metric));
    expect(result.summary).toMatchObject({
      sample_size: 1,
      numerator_total: 886,
      denominator_total: 1,
    });
  });

  it("selects one latest v2 observation per sample before applying dates", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const first = v2Metric({
      ...base("metric_observation", "recapture-a"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.public.impressions",
      metric_family: "x_public",
      metric_name: "impressions",
      numerator: 886,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "provisional", as_of: "2026-07-16T12:01:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "x-public.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    });
    const latest = v2Metric({
      ...first,
      object_id: "recapture-b",
      recorded_at: "2026-07-16T13:01:00.000Z",
      observation_at: "2026-07-16T13:00:00.000Z",
      numerator: 900,
    });
    await ingestor.append(first);
    await ingestor.append(latest);
    await ingestor.appendCorrection({
      ...base("correction_tombstone", "recapture-a-correction"),
      target_object_id: "recapture-a",
      replacement_object_id: "recapture-b",
      reason_code: "recaptured_metric",
    });
    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));

    await expect(queryMarketingMetrics(store, metricQuery(latest))).resolves.toMatchObject({
      history_observation_count: 2,
      visible_observation_count: 1,
      analytical_sample_count: 1,
      summary: { sample_size: 1, numerator_total: 900 },
    });
    await expect(
      queryMarketingMetrics(store, {
        ...metricQuery(latest),
        from: "2026-07-16T12:00:00.000Z",
        to: "2026-07-16T12:30:00.000Z",
      }),
    ).resolves.toMatchObject({ analytical_sample_count: 0, summary: { sample_size: 0 } });
  });

  it("keeps distinct time buckets as samples while collapsing recaptures within one bucket", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const hourly = (objectId: string, bucketStart: string, numerator: number, recordedAt: string) =>
      v2Metric({
        ...base("metric_observation", objectId),
        account_id: "account-a",
        content_id: "post-a",
        metric_definition_id: "x.owned.impressions",
        metric_family: "x_owned_analytics",
        metric_name: "impressions",
        numerator,
        denominator: 1,
        unit: "count",
        completeness: 1,
        stabilization: { state: "stabilized", as_of: recordedAt },
        privacy: { classification: "restricted", restrictions: "owned_account_user_context" },
        method_version: "owned-performance.v1",
        observation_at: bucketStart,
        observation_window: "24h",
        distribution: "provider_total",
        channel_profile_version: "x.v2",
        metric_profile_version: "x-owned-metric.v2",
        metric_mapping_version: "x-owned-metric-definitions.v1",
        provider_metric_class: "analytics",
        bucket_granularity: "hourly",
        bucket_start: bucketStart,
        request_window_start: "2026-07-16T00:00:00.000Z",
        request_window_end: "2026-07-17T00:00:00.000Z",
        request_window_class: "provider_requested_window",
        recorded_at: recordedAt,
      });
    const firstBucket = hourly(
      "hour-1-first",
      "2026-07-16T01:00:00.000Z",
      10,
      "2026-07-16T01:01:00.000Z",
    );
    const firstBucketRecapture = hourly(
      "hour-1-recapture",
      "2026-07-16T01:00:00.000Z",
      12,
      "2026-07-16T01:02:00.000Z",
    );
    const secondBucket = hourly(
      "hour-2",
      "2026-07-16T02:00:00.000Z",
      20,
      "2026-07-16T02:01:00.000Z",
    );
    expect(firstBucket.analytical_sample_id).toBe(firstBucketRecapture.analytical_sample_id);
    expect(secondBucket.analytical_sample_id).not.toBe(firstBucket.analytical_sample_id);
    await ingestor.appendBatch([firstBucket, firstBucketRecapture, secondBucket]);

    await expect(
      queryMarketingMetrics(
        new AgencyDataStore(resolveAgencyDataStateDir(root)),
        metricQuery(firstBucket),
      ),
    ).resolves.toMatchObject({
      history_observation_count: 3,
      visible_observation_count: 3,
      analytical_sample_count: 2,
      summary: { sample_size: 2, numerator_total: 32 },
    });
  });

  it("rejects incomplete and reversed provider request windows", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const metric = v2Metric({
      ...base("metric_observation", "request-window"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.owned.impressions",
      metric_family: "x_owned_analytics",
      metric_name: "impressions",
      numerator: 10,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T01:00:00.000Z" },
      privacy: { classification: "restricted", restrictions: "owned_account_user_context" },
      method_version: "owned-performance.v1",
      observation_at: "2026-07-16T01:00:00.000Z",
      distribution: "provider_total",
    });

    await expect(
      ingestor.append({ ...metric, request_window_start: "2026-07-16T00:00:00.000Z" }),
    ).rejects.toThrow(
      "request_window_start, request_window_end, and request_window_class must be provided together",
    );

    const reversed = v2Metric({
      ...metric,
      request_window_start: "2026-07-17T00:00:00.000Z",
      request_window_end: "2026-07-16T00:00:00.000Z",
      request_window_class: "provider_requested_window",
    });
    await expect(ingestor.append(reversed)).rejects.toThrow(
      "request_window_start must precede request_window_end",
    );
  });

  it("breaks equal observation timestamps by recorded_at, then object_id", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const baseMetric = {
      ...base("metric_observation", "tie-a"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.public.likes",
      metric_family: "x_public",
      metric_name: "likes",
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T12:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "x-public.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    };
    const earlierRecorded = v2Metric({
      ...baseMetric,
      object_id: "tie-recorded-z",
      recorded_at: "2026-07-16T12:01:00.000Z",
      numerator: 1,
    });
    const laterRecorded = v2Metric({
      ...baseMetric,
      object_id: "tie-recorded-a",
      recorded_at: "2026-07-16T12:02:00.000Z",
      numerator: 2,
    });
    await ingestor.append(earlierRecorded);
    await ingestor.append(laterRecorded);
    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    await expect(queryMarketingMetrics(store, metricQuery(laterRecorded))).resolves.toMatchObject({
      summary: { numerator_total: 2 },
    });

    const lowerObjectId = v2Metric({
      ...baseMetric,
      object_id: "tie-object-a",
      recorded_at: "2026-07-16T12:03:00.000Z",
      numerator: 3,
    });
    const higherObjectId = v2Metric({
      ...baseMetric,
      object_id: "tie-object-z",
      recorded_at: "2026-07-16T12:03:00.000Z",
      numerator: 4,
    });
    await ingestor.append(lowerObjectId);
    await ingestor.append(higherObjectId);
    await expect(queryMarketingMetrics(store, metricQuery(higherObjectId))).resolves.toMatchObject({
      summary: { numerator_total: 4 },
    });
  });

  it("returns exact no-summary failures for omitted profiles and normalization requests", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const metric = v2Metric({
      ...base("metric_observation", "failure-codes"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.public.likes",
      metric_family: "x_public",
      metric_name: "likes",
      numerator: 5,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T12:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "x-public.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    });
    await ingestor.append(metric);
    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    await expectNoSummaryComparisonFailure(
      queryMarketingMetrics(store, {
        tenant_id: "tenant-a",
        metric_definition_id: "x.public.likes",
        distribution: "combined",
        trend: false,
      }),
      "comparison_profile_required",
    );
    await expectNoSummaryComparisonFailure(
      queryMarketingMetrics(store, {
        ...metricQuery(metric),
        normalization_method_ref: "normalization.v1",
      }),
      "normalization_method_unsupported",
    );
  });

  it("rejects new v1 metric writes and only dual-reads legacy metrics with derivable identity", async () => {
    const root = await tempStateDir();
    const metric = v2Metric({
      ...base("metric_observation", "legacy-compatible"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.public.likes",
      metric_family: "x_public",
      metric_name: "likes",
      numerator: 5,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T12:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "x-public.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    });
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    await expect(ingestor.append({ ...metric, schema_version: "agency-data/v1" })).rejects.toThrow(
      "new_v1_metric_write_rejected_at_cutover",
    );

    const store = new AgencyDataStore(resolveAgencyDataStateDir(root));
    const {
      analytical_sample_id: _sample,
      comparison_signature: _signature,
      ...legacyBase
    } = metric;
    const legacy = { ...legacyBase, recorded_at: "2026-07-16T12:00:00.000Z" };
    await fs.mkdir(store.stateDir, { recursive: true });
    await fs.writeFile(
      store.logPath,
      `${JSON.stringify({ ...legacy, schema_version: "agency-data/v1" })}\n`,
      "utf8",
    );
    await expect(queryMarketingMetrics(store, metricQuery(metric))).resolves.toMatchObject({
      analytical_sample_count: 1,
      summary: { numerator_total: 5 },
    });

    const { metric_profile_version: _profile, ...unresolved } = legacy;
    await fs.writeFile(
      store.logPath,
      `${JSON.stringify({ ...unresolved, schema_version: "agency-data/v1" })}\n`,
      "utf8",
    );
    await expectNoSummaryComparisonFailure(
      queryMarketingMetrics(store, metricQuery(metric)),
      "analytical_sample_identity_unresolved",
    );
  });

  it("fails closed when a visible metric cohort contains multiple comparison signatures", async () => {
    const root = await tempStateDir();
    const ingestor = createTrustedAgencyDataIngestion({ stateDir: root });
    const metric = v2Metric({
      ...base("metric_observation", "profile-a"),
      account_id: "account-a",
      content_id: "post-a",
      metric_definition_id: "x.public.likes",
      metric_family: "x_public",
      metric_name: "likes",
      numerator: 5,
      denominator: 1,
      unit: "count",
      completeness: 1,
      stabilization: { state: "stabilized", as_of: "2026-07-16T12:00:00.000Z" },
      privacy: { classification: "aggregate" },
      method_version: "x-public.v1",
      observation_at: "2026-07-16T12:00:00.000Z",
      distribution: "combined",
    });
    await ingestor.append(metric);
    await ingestor.append(
      v2Metric({
        ...metric,
        object_id: "profile-b",
        provider_metric_class: "provider_total",
      }),
    );
    await expectNoSummaryComparisonFailure(
      queryMarketingMetrics(
        new AgencyDataStore(resolveAgencyDataStateDir(root)),
        metricQuery(metric),
      ),
      "comparison_signature_mismatch",
    );
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
      registerTool: (_tool: unknown, options?: { name?: string }) =>
        registered.push(String(options?.name)),
      registerCli: (_registrar: unknown, options?: { descriptors?: Array<{ name: string }> }) => {
        cliDescriptors.push(...(options?.descriptors ?? []).map((entry) => entry.name));
      },
    } as unknown as OpenClawPluginApi);
    expect(registered).toEqual([
      "marketing_data_catalog",
      "marketing_metrics",
      "marketing_experiments",
    ]);
    expect(cliDescriptors).toEqual(["agency-data"]);
  });
});
