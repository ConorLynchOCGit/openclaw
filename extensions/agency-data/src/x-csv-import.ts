import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createTrustedAgencyDataIngestion } from "../api.js";
import { resolveMetricIdentity } from "./schema.js";
import { AgencyDataStore, resolveAgencyDataStateDir } from "./store.js";

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 10_000;
const MAX_RECORD_BYTES = 64 * 1024;

const REQUIRED_COLUMNS = [
  "post_id",
  "observed_at",
  "metric_definition_id",
  "metric_family",
  "metric_name",
  "numerator",
  "denominator",
  "unit",
  "completeness",
  "distribution",
  "observation_window",
  "channel_profile_version",
  "metric_profile_version",
  "metric_mapping_version",
  "provider_metric_class",
  "bucket_granularity",
] as const;

const OPTIONAL_COLUMNS = [
  "event_at",
  "method_version",
  "published_at",
  "content_hash",
  "content_format",
  "topic_ids",
  "campaign_id",
  "variant_id",
  "experiment_id",
  "topic_id",
  "audience_id",
  "assignment_basis",
  "utm_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

const ALLOWED_COLUMNS = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

type CsvRow = Record<string, string>;

export type OwnedXCsvImportInput = Readonly<{
  filePath: string;
  approved: boolean;
  stateDir: string;
  tenantId: string;
  subject: Readonly<{ entityType: "company" | "person"; entityId: string }>;
  accountId: string;
}>;

export type OwnedXCsvImportResult = Readonly<{
  schema: "agency-data.x-owned-csv-import.v1";
  file_digest: string;
  parsed_rows: number;
  appended_records: number;
  existing_records_skipped: number;
}>;

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function requireValue(row: CsvRow, field: string, rowNumber: number): string {
  const value = row[field]?.trim();
  if (!value) {
    throw new Error(`CSV row ${rowNumber} is missing required field ${field}.`);
  }
  return value;
}

function optionalValue(row: CsvRow, field: string): string | undefined {
  const value = row[field]?.trim();
  return value || undefined;
}

function requireTimestamp(value: string, field: string, rowNumber: number): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`CSV row ${rowNumber} has an invalid ${field} timestamp.`);
  }
  return value;
}

function requireNumber(
  value: string,
  field: string,
  rowNumber: number,
  bounds: { minimum?: number; maximum?: number } = {},
): number {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    (bounds.minimum !== undefined && number < bounds.minimum) ||
    (bounds.maximum !== undefined && number > bounds.maximum)
  ) {
    throw new Error(`CSV row ${rowNumber} has an invalid ${field} value.`);
  }
  return number;
}

function optionalUtm(row: CsvRow) {
  return Object.fromEntries(
    ["utm_id", "utm_source", "utm_medium", "utm_campaign", "utm_content"].flatMap((field) => {
      const value = optionalValue(row, field);
      return value ? [[field, value]] : [];
    }),
  );
}

function parseColumns(headers: string[]): string[] {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("CSV headers must be unique after normalization.");
  }
  const unsupported = normalized.filter((header) => !ALLOWED_COLUMNS.has(header));
  if (unsupported.length > 0) {
    throw new Error(`CSV contains unsupported columns: ${unsupported.join(", ")}.`);
  }
  const missing = REQUIRED_COLUMNS.filter((header) => !normalized.includes(header));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);
  }
  return normalized;
}

function parseRows(content: Buffer): CsvRow[] {
  try {
    return parse(content, {
      bom: true,
      columns: parseColumns,
      skip_empty_lines: true,
      trim: true,
      max_record_size: MAX_RECORD_BYTES,
      to: MAX_CSV_ROWS + 2,
    }) as CsvRow[];
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CSV ")) {
      throw error;
    }
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "invalid_structure";
    throw new Error(`CSV parsing failed (${code}).`, { cause: error });
  }
}

function commonRecord(
  input: OwnedXCsvImportInput,
  row: CsvRow,
  postId: string,
  observedAt: string,
) {
  return {
    tenant_id: input.tenantId,
    subject: {
      entity_type: input.subject.entityType,
      entity_id: input.subject.entityId,
    },
    channel: "x",
    source: { provider: "x-csv", auth_mode: "import" },
    source_ref: {
      source_id: postId,
      uri: `https://x.com/i/web/status/${postId}`,
      captured_at: observedAt,
    },
    event_at: optionalValue(row, "event_at") ?? observedAt,
  };
}

function recordsForRow(
  input: OwnedXCsvImportInput,
  row: CsvRow,
  rowNumber: number,
  fileDigest: string,
): Record<string, unknown>[] {
  const postId = requireValue(row, "post_id", rowNumber);
  const observedAt = requireTimestamp(
    requireValue(row, "observed_at", rowNumber),
    "observed_at",
    rowNumber,
  );
  const eventAt = requireTimestamp(
    optionalValue(row, "event_at") ?? observedAt,
    "event_at",
    rowNumber,
  );
  const methodVersion = optionalValue(row, "method_version") ?? "x-owned-csv.v1";
  const distribution = requireValue(row, "distribution", rowNumber);
  if (!new Set(["organic", "promoted", "combined"]).has(distribution)) {
    throw new Error(`CSV row ${rowNumber} has an invalid distribution value.`);
  }
  const observationWindow = requireValue(row, "observation_window", rowNumber);
  if (!new Set(["1h", "24h", "72h", "7d", "28d", "custom"]).has(observationWindow)) {
    throw new Error(`CSV row ${rowNumber} has an invalid observation_window value.`);
  }
  const identity = sha256(
    JSON.stringify({ fileDigest, rowNumber, postId, metric: row.metric_definition_id }),
  ).slice(7, 47);
  const common = { ...commonRecord(input, row, postId, observedAt), event_at: eventAt };
  const metric = {
    ...common,
    object_type: "metric_observation",
    object_id: `x-csv-metric-${identity}`,
    account_id: input.accountId,
    content_id: postId,
    metric_definition_id: requireValue(row, "metric_definition_id", rowNumber),
    metric_family: requireValue(row, "metric_family", rowNumber),
    metric_name: requireValue(row, "metric_name", rowNumber),
    numerator: requireNumber(requireValue(row, "numerator", rowNumber), "numerator", rowNumber, {
      minimum: 0,
    }),
    denominator: requireNumber(
      requireValue(row, "denominator", rowNumber),
      "denominator",
      rowNumber,
      { minimum: 0 },
    ),
    unit: requireValue(row, "unit", rowNumber),
    completeness: requireNumber(
      requireValue(row, "completeness", rowNumber),
      "completeness",
      rowNumber,
      { minimum: 0, maximum: 1 },
    ),
    stabilization: { state: "provisional", as_of: observedAt },
    privacy: { classification: "aggregate" },
    method_version: methodVersion,
    observation_at: observedAt,
    observation_window: observationWindow,
    distribution,
    channel_profile_version: requireValue(row, "channel_profile_version", rowNumber),
    metric_profile_version: requireValue(row, "metric_profile_version", rowNumber),
    metric_mapping_version: requireValue(row, "metric_mapping_version", rowNumber),
    provider_metric_class: requireValue(row, "provider_metric_class", rowNumber),
    bucket_granularity: requireValue(row, "bucket_granularity", rowNumber),
  };
  const metricIdentity = resolveMetricIdentity(metric);
  if (!metricIdentity) {
    throw new Error(`CSV row ${rowNumber} has unresolved v2 metric identity.`);
  }
  const records: Record<string, unknown>[] = [
    {
      ...metric,
      analytical_sample_id: metricIdentity.analytical_sample_id,
      comparison_signature: metricIdentity.comparison_signature,
    },
  ];

  const publishedAt = optionalValue(row, "published_at");
  const contentHash = optionalValue(row, "content_hash");
  const contentFormat = optionalValue(row, "content_format");
  const topicIds = optionalValue(row, "topic_ids")
    ?.split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  if (publishedAt || contentHash || contentFormat || topicIds) {
    if (!publishedAt || !contentHash || !contentFormat || !topicIds?.length) {
      throw new Error(
        `CSV row ${rowNumber} must provide published_at, content_hash, content_format, and topic_ids together.`,
      );
    }
    records.push({
      ...common,
      object_type: "content_item",
      object_id: `x-csv-content-${sha256(`${fileDigest}\0${postId}`).slice(7, 47)}`,
      account_id: input.accountId,
      content_id: postId,
      published_at: requireTimestamp(publishedAt, "published_at", rowNumber),
      content_hash: contentHash,
      content_format: contentFormat,
      topic_ids: topicIds,
      ...optionalUtm(row),
    });
  }

  const campaignId = optionalValue(row, "campaign_id");
  const variantId = optionalValue(row, "variant_id");
  const experimentId = optionalValue(row, "experiment_id");
  if (campaignId || variantId || experimentId) {
    if (!campaignId || !variantId || !experimentId) {
      throw new Error(
        `CSV row ${rowNumber} must provide campaign_id, variant_id, and experiment_id together.`,
      );
    }
    records.push({
      ...common,
      object_type: "campaign_variant_association",
      object_id: `x-csv-campaign-${sha256(`${fileDigest}\0${postId}\0${campaignId}`).slice(7, 47)}`,
      account_id: input.accountId,
      content_id: postId,
      experiment_id: experimentId,
      campaign_id: campaignId,
      variant_id: variantId,
      associated_at: observedAt,
      ...optionalUtm(row),
    });
  }

  const topicId = optionalValue(row, "topic_id");
  const audienceId = optionalValue(row, "audience_id");
  const assignmentBasis = optionalValue(row, "assignment_basis");
  if (topicId || audienceId || assignmentBasis) {
    if (!topicId || !audienceId || !contentFormat || !assignmentBasis) {
      throw new Error(
        `CSV row ${rowNumber} must provide topic_id, content_format, audience_id, and assignment_basis together.`,
      );
    }
    records.push({
      ...common,
      object_type: "topic_format_audience_assignment",
      object_id: `x-csv-assignment-${sha256(`${fileDigest}\0${postId}\0${topicId}`).slice(7, 47)}`,
      account_id: input.accountId,
      content_id: postId,
      topic_id: topicId,
      content_format: contentFormat,
      audience_id: audienceId,
      assigned_at: observedAt,
      assignment_basis: assignmentBasis,
    });
  }
  return records;
}

export async function importOwnedXMetricsCsv(
  input: OwnedXCsvImportInput,
): Promise<OwnedXCsvImportResult> {
  if (!input.approved) {
    throw new Error("Owned X CSV import requires explicit operator approval.");
  }
  if (path.extname(input.filePath).toLowerCase() !== ".csv") {
    throw new Error("Owned X backfill input must be a .csv file.");
  }
  const content = await fs.readFile(input.filePath);
  if (content.byteLength < 1 || content.byteLength > MAX_CSV_BYTES) {
    throw new Error(`Owned X CSV must contain 1-${MAX_CSV_BYTES} bytes.`);
  }
  const rows = parseRows(content);
  if (rows.length < 1 || rows.length > MAX_CSV_ROWS) {
    throw new Error(`Owned X CSV must contain 1-${MAX_CSV_ROWS} data rows.`);
  }
  const fileDigest = sha256(content);
  const records = rows.flatMap((row, index) => recordsForRow(input, row, index + 2, fileDigest));
  const store = new AgencyDataStore(resolveAgencyDataStateDir(input.stateDir));
  const existing = await store.read({ tenantId: input.tenantId });
  if (existing.truncated) {
    throw new Error("Agency Data is too large to prove CSV import idempotency safely.");
  }
  const existingIds = new Set(existing.records.map((record) => record.object_id));
  const pending = records.filter((record) => !existingIds.has(String(record.object_id)));
  if (pending.length > 0) {
    await createTrustedAgencyDataIngestion({ stateDir: input.stateDir }).appendBatch(pending);
  }
  return {
    schema: "agency-data.x-owned-csv-import.v1",
    file_digest: fileDigest,
    parsed_rows: rows.length,
    appended_records: pending.length,
    existing_records_skipped: records.length - pending.length,
  };
}
