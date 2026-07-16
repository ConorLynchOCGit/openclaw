export const AGENCY_DATA_SCHEMA_VERSION = "agency-data/v1";

export const CANONICAL_OBJECT_TYPES = [
  "source_observation",
  "account_snapshot",
  "content_item",
  "metric_definition",
  "metric_observation",
  "campaign_variant_association",
  "topic_format_audience_assignment",
  "experiment",
  "recommendation",
  "operator_decision",
  "approved_learning",
  "correction_tombstone",
] as const;

export type CanonicalObjectType = (typeof CANONICAL_OBJECT_TYPES)[number];
export type Distribution = "organic" | "promoted" | "combined" | "provider_total";

export type CanonicalRecord = {
  schema_version: typeof AGENCY_DATA_SCHEMA_VERSION;
  object_type: CanonicalObjectType;
  object_id: string;
  tenant_id: string;
  subject: { entity_type: "company" | "person"; entity_id: string };
  channel: string;
  source: { provider: string; auth_mode: "oauth" | "token" | "import" | "manual" };
  source_ref: { source_id: string; uri?: string; captured_at?: string };
  event_at: string;
  recorded_at: string;
  [key: string]: unknown;
};

export type ReadResult = {
  records: CanonicalRecord[];
  scanned: number;
  malformed_rows: number;
  truncated: boolean;
};
