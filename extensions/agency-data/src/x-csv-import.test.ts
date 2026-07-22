import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgencyDataStore, resolveAgencyDataStateDir } from "./store.js";
import { importOwnedXMetricsCsv } from "./x-csv-import.js";

const roots: string[] = [];

async function fixture(content: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agency-data-csv-"));
  roots.push(root);
  const filePath = path.join(root, "owned-x.csv");
  await fs.writeFile(filePath, content, "utf8");
  return { root, filePath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("owned X CSV import", () => {
  it("prevalidates and idempotently appends normalized metrics and linkages", async () => {
    const { root, filePath } = await fixture(
      [
        "post_id,observed_at,metric_definition_id,metric_family,metric_name,numerator,denominator,unit,completeness,distribution,observation_window,channel_profile_version,metric_profile_version,metric_mapping_version,provider_metric_class,bucket_granularity,published_at,content_hash,content_format,topic_ids,campaign_id,variant_id,experiment_id,topic_id,audience_id,assignment_basis,utm_id,utm_source,utm_medium,utm_campaign,utm_content",
        "123,2026-07-16T12:00:00.000Z,x.public.like_count,x_public_engagement,like_count,12,1000,ratio,1,organic,24h,x-public.v1,owned-csv.v2,x-csv-mapping.v1,public,aggregate,2026-07-15T12:00:00.000Z,sha256:abc,short-post,nuclear;energy,campaign-a,variant-a,experiment-a,topic-a,investor,pre_publication,utm-123,x,social,campaign-a,variant-a",
      ].join("\n"),
    );
    const input = {
      filePath,
      approved: true,
      stateDir: root,
      tenantId: "operator",
      subject: { entityType: "company" as const, entityId: "american-atomics" },
      accountId: "account-aa",
    };
    await expect(importOwnedXMetricsCsv(input)).resolves.toMatchObject({
      parsed_rows: 1,
      appended_records: 4,
      existing_records_skipped: 0,
    });
    await expect(importOwnedXMetricsCsv(input)).resolves.toMatchObject({
      parsed_rows: 1,
      appended_records: 0,
      existing_records_skipped: 4,
    });
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read({
      tenantId: "operator",
    });
    expect(read.records).toHaveLength(4);
    expect(read.records.map((record) => record.object_type)).toEqual([
      "metric_observation",
      "content_item",
      "campaign_variant_association",
      "topic_format_audience_assignment",
    ]);
    expect(read.records[0]).toMatchObject({
      source: { provider: "x-csv", auth_mode: "import" },
      observation_window: "24h",
      distribution: "organic",
      schema_version: "agency-data/v2",
      analytical_sample_id: expect.any(String),
      comparison_signature: expect.any(String),
    });
    expect(read.records[1]).toMatchObject({
      utm_id: "utm-123",
      utm_source: "x",
      utm_medium: "social",
      utm_campaign: "campaign-a",
      utm_content: "variant-a",
    });
  });

  it("requires approval and rejects unknown content-bearing columns before append", async () => {
    const { root, filePath } = await fixture(
      "post_id,observed_at,metric_definition_id,metric_family,metric_name,numerator,denominator,unit,completeness,distribution,text\n123,2026-07-16T12:00:00Z,m,f,n,1,1,count,1,organic,raw",
    );
    const input = {
      filePath,
      approved: false,
      stateDir: root,
      tenantId: "operator",
      subject: { entityType: "company" as const, entityId: "american-atomics" },
      accountId: "account-aa",
    };
    await expect(importOwnedXMetricsCsv(input)).rejects.toThrow("explicit operator approval");
    await expect(importOwnedXMetricsCsv({ ...input, approved: true })).rejects.toThrow(
      "unsupported columns: text",
    );
    const read = await new AgencyDataStore(resolveAgencyDataStateDir(root)).read();
    expect(read.records).toEqual([]);
  });
});
