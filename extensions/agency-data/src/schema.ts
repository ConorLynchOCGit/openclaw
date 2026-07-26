import { createHash, randomUUID } from "node:crypto";
import {
  AGENCY_DATA_SCHEMA_VERSION,
  AGENCY_DATA_SCHEMA_VERSIONS,
  CANONICAL_OBJECT_TYPES,
  LEGACY_AGENCY_DATA_SCHEMA_VERSION,
  type Distribution,
  type MetricComparisonProfile,
  type CanonicalObjectType,
  type CanonicalRecord,
} from "./types.js";

const RAW_CONTENT_KEYS = new Set([
  "content",
  "raw_content",
  "raw_x_content",
  "text",
  "body",
  "caption",
  "message",
  "transcript",
]);

const COMMON_KEYS = [
  "schema_version",
  "object_type",
  "object_id",
  "tenant_id",
  "subject",
  "channel",
  "source",
  "source_ref",
  "acquisition_manifest_ref",
  "event_at",
  "recorded_at",
] as const;

const TYPE_KEYS: Record<CanonicalObjectType, readonly string[]> = {
  source_observation: [
    "account_id",
    "content_id",
    "observation_kind",
    "observed_at",
    "content_hash",
    "method_version",
  ],
  account_snapshot: [
    "account_id",
    "snapshot_at",
    "follower_count",
    "audience_segments",
    "method_version",
  ],
  content_item: [
    "account_id",
    "content_id",
    "published_at",
    "content_hash",
    "content_format",
    "topic_ids",
    "utm_id",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
  ],
  metric_definition: [
    "metric_definition_id",
    "metric_family",
    "metric_name",
    "numerator_label",
    "denominator_label",
    "unit",
    "method_version",
  ],
  metric_observation: [
    "account_id",
    "content_id",
    "campaign_id",
    "metric_definition_id",
    "metric_family",
    "metric_name",
    "numerator",
    "denominator",
    "unit",
    "completeness",
    "stabilization",
    "privacy",
    "method_version",
    "observation_at",
    "observation_window",
    "distribution",
    "metric_mapping_version",
    "provider_metric_class",
    "bucket_granularity",
    "bucket_start",
    "request_window_start",
    "request_window_end",
    "request_window_class",
    "channel_profile_version",
    "metric_profile_version",
    "analytical_sample_id",
    "comparison_signature",
  ],
  campaign_variant_association: [
    "account_id",
    "content_id",
    "experiment_id",
    "campaign_id",
    "variant_id",
    "associated_at",
    "utm_id",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
  ],
  topic_format_audience_assignment: [
    "account_id",
    "content_id",
    "topic_id",
    "content_format",
    "audience_id",
    "assigned_at",
    "assignment_basis",
  ],
  experiment: [
    "account_id",
    "experiment_id",
    "status",
    "started_at",
    "ended_at",
    "hypothesis_ref",
    "primary_metric_definition_id",
  ],
  recommendation: [
    "recommendation_id",
    "account_id",
    "experiment_id",
    "related_object_ids",
    "recommendation_kind",
  ],
  operator_decision: [
    "decision_id",
    "account_id",
    "experiment_id",
    "related_object_ids",
    "decision",
  ],
  approved_learning: [
    "learning_id",
    "account_id",
    "experiment_id",
    "related_object_ids",
    "learning_kind",
  ],
  correction_tombstone: ["target_object_id", "action", "reason_code", "replacement_object_id"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    throw new Error(`${field} must be a non-empty string up to 512 characters.`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${field} must be an ISO-compatible timestamp.`);
  }
  return timestamp;
}

function requireFiniteNumber(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${field} must be a finite number greater than or equal to ${minimum}.`);
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }
}

function assertNoRawContent(
  value: unknown,
  path = "record",
  ancestors = new WeakSet<object>(),
  depth = 0,
): void {
  if (depth > 8) {
    throw new Error(`${path} exceeds the maximum canonical record nesting depth.`);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error(`${path} cannot contain a cyclic reference.`);
    }
    ancestors.add(value);
    value.forEach((item, index) =>
      assertNoRawContent(item, `${path}[${index}]`, ancestors, depth + 1),
    );
    ancestors.delete(value);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (ancestors.has(value)) {
    throw new Error(`${path} cannot contain a cyclic reference.`);
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (RAW_CONTENT_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `${path}.${key} is forbidden; canonical marketing data cannot contain raw content.`,
      );
    }
    assertNoRawContent(child, `${path}.${key}`, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function requireOptionalString(value: unknown, field: string): void {
  if (value !== undefined) {
    requireString(value, field);
  }
}

function requireStringArray(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error(`${field} must be an array of 1-100 non-empty strings.`);
  }
  value.forEach((entry, index) => requireString(entry, `${field}[${index}]`));
}

function validateBase(record: Record<string, unknown>): asserts record is CanonicalRecord {
  assertExactKeys(
    record,
    [...COMMON_KEYS, ...(TYPE_KEYS[record.object_type as CanonicalObjectType] ?? [])],
    "record",
  );
  if (
    !AGENCY_DATA_SCHEMA_VERSIONS.includes(
      record.schema_version as CanonicalRecord["schema_version"],
    )
  ) {
    throw new Error(`schema_version must equal ${AGENCY_DATA_SCHEMA_VERSIONS.join(" or ")}.`);
  }
  if (!CANONICAL_OBJECT_TYPES.includes(record.object_type as CanonicalObjectType)) {
    throw new Error("object_type is not a supported canonical agency-data object.");
  }
  requireString(record.object_id, "object_id");
  requireString(record.tenant_id, "tenant_id");
  requireString(record.channel, "channel");
  requireTimestamp(record.event_at, "event_at");
  requireTimestamp(record.recorded_at, "recorded_at");
  requireOptionalString(record.acquisition_manifest_ref, "acquisition_manifest_ref");

  if (!isRecord(record.subject)) {
    throw new Error("subject must be an object.");
  }
  assertExactKeys(record.subject, ["entity_type", "entity_id"], "subject");
  if (record.subject.entity_type !== "company" && record.subject.entity_type !== "person") {
    throw new Error("subject.entity_type must be company or person.");
  }
  requireString(record.subject.entity_id, "subject.entity_id");

  if (!isRecord(record.source)) {
    throw new Error("source must be an object.");
  }
  assertExactKeys(record.source, ["provider", "auth_mode"], "source");
  requireString(record.source.provider, "source.provider");
  if (!["oauth", "token", "import", "manual"].includes(String(record.source.auth_mode))) {
    throw new Error("source.auth_mode must be oauth, token, import, or manual.");
  }

  if (!isRecord(record.source_ref)) {
    throw new Error("source_ref must be an object.");
  }
  assertExactKeys(record.source_ref, ["source_id", "uri", "captured_at"], "source_ref");
  requireString(record.source_ref.source_id, "source_ref.source_id");
  requireOptionalString(record.source_ref.uri, "source_ref.uri");
  if (record.source_ref.captured_at !== undefined) {
    requireTimestamp(record.source_ref.captured_at, "source_ref.captured_at");
  }
}

function requireAccount(record: Record<string, unknown>): void {
  requireString(record.account_id, "account_id");
}

function requireContentWhenPresent(record: Record<string, unknown>): void {
  if (record.content_id !== undefined) {
    requireString(record.content_id, "content_id");
  }
}

function validateUtmFields(record: Record<string, unknown>): void {
  for (const field of ["utm_id", "utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    requireOptionalString(record[field], field);
  }
}

function metricIdentityPart(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function identityDigest(prefix: string, values: readonly unknown[]): string {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;
}

export function comparisonProfileFromMetric(
  record: Record<string, unknown>,
): MetricComparisonProfile | undefined {
  const required = [
    "channel",
    "channel_profile_version",
    "metric_definition_id",
    "metric_family",
    "metric_name",
    "unit",
    "method_version",
    "metric_profile_version",
    "metric_mapping_version",
    "provider_metric_class",
    "observation_window",
    "bucket_granularity",
  ] as const;
  const values = Object.fromEntries(
    required.map((field) => [field, metricIdentityPart(record[field])]),
  );
  if (Object.values(values).some((value) => value === undefined)) {
    return undefined;
  }
  const distribution = record.distribution;
  if (
    distribution !== "organic" &&
    distribution !== "promoted" &&
    distribution !== "combined" &&
    distribution !== "provider_total"
  ) {
    return undefined;
  }
  const hasRequestWindowStart = record.request_window_start !== undefined;
  const hasRequestWindowEnd = record.request_window_end !== undefined;
  const requestWindowClass = metricIdentityPart(record.request_window_class);
  if (
    (hasRequestWindowStart || hasRequestWindowEnd || requestWindowClass !== undefined) &&
    !(hasRequestWindowStart && hasRequestWindowEnd && requestWindowClass)
  ) {
    return undefined;
  }
  return {
    channel: values.channel!,
    channel_profile_version: values.channel_profile_version!,
    metric_definition_id: values.metric_definition_id!,
    metric_family: values.metric_family!,
    metric_name: values.metric_name!,
    unit: values.unit!,
    method_version: values.method_version!,
    metric_profile_version: values.metric_profile_version!,
    metric_mapping_version: values.metric_mapping_version!,
    provider_metric_class: values.provider_metric_class!,
    distribution: distribution as Distribution,
    observation_window: values.observation_window!,
    bucket_granularity: values.bucket_granularity!,
    ...(requestWindowClass ? { request_window_class: requestWindowClass } : {}),
  };
}

export function deriveComparisonSignature(profile: MetricComparisonProfile): string {
  return identityDigest("agency-data/v2/comparison", [
    profile.channel,
    profile.channel_profile_version,
    profile.metric_definition_id,
    profile.metric_family,
    profile.metric_name,
    profile.unit,
    profile.method_version,
    profile.metric_profile_version,
    profile.metric_mapping_version,
    profile.provider_metric_class,
    profile.distribution,
    profile.observation_window,
    profile.bucket_granularity,
    profile.request_window_class ?? null,
  ]);
}

export function deriveAnalyticalSampleId(
  record: Record<string, unknown>,
  profile: MetricComparisonProfile,
): string | undefined {
  const tenantId = metricIdentityPart(record.tenant_id);
  const subject = isRecord(record.subject) ? record.subject : undefined;
  const subjectType = subject && metricIdentityPart(subject.entity_type);
  const subjectId = subject && metricIdentityPart(subject.entity_id);
  const accountId = metricIdentityPart(record.account_id);
  const contentId = metricIdentityPart(record.content_id) ?? null;
  const bucketStart = metricIdentityPart(record.bucket_start) ?? null;
  const requestWindowStart = metricIdentityPart(record.request_window_start) ?? null;
  const requestWindowEnd = metricIdentityPart(record.request_window_end) ?? null;
  if (!tenantId || !subjectType || !subjectId || !accountId) {
    return undefined;
  }
  return identityDigest("agency-data/v2/sample", [
    tenantId,
    subjectType,
    subjectId,
    profile.channel,
    accountId,
    contentId,
    profile.metric_definition_id,
    profile.distribution,
    profile.observation_window,
    bucketStart,
    requestWindowStart,
    requestWindowEnd,
  ]);
}

export function resolveMetricIdentity(record: Record<string, unknown>):
  | {
      analytical_sample_id: string;
      comparison_signature: string;
      comparison_profile: MetricComparisonProfile;
    }
  | undefined {
  const comparisonProfile = comparisonProfileFromMetric(record);
  if (!comparisonProfile) {
    return undefined;
  }
  const analyticalSampleId = deriveAnalyticalSampleId(record, comparisonProfile);
  if (!analyticalSampleId) {
    return undefined;
  }
  return {
    analytical_sample_id: analyticalSampleId,
    comparison_signature: deriveComparisonSignature(comparisonProfile),
    comparison_profile: comparisonProfile,
  };
}

function validateMetric(record: Record<string, unknown>): void {
  requireAccount(record);
  requireContentWhenPresent(record);
  requireString(record.metric_definition_id, "metric_definition_id");
  requireString(record.metric_family, "metric_family");
  requireString(record.metric_name, "metric_name");
  requireFiniteNumber(record.numerator, "numerator");
  requireFiniteNumber(record.denominator, "denominator");
  requireString(record.unit, "unit");
  const completeness = requireFiniteNumber(record.completeness, "completeness");
  if (completeness > 1) {
    throw new Error("completeness must be between 0 and 1.");
  }
  if (!isRecord(record.stabilization)) {
    throw new Error("stabilization must be an object.");
  }
  assertExactKeys(record.stabilization, ["state", "as_of"], "stabilization");
  if (!["provisional", "stabilized"].includes(String(record.stabilization.state))) {
    throw new Error("stabilization.state must be provisional or stabilized.");
  }
  requireTimestamp(record.stabilization.as_of, "stabilization.as_of");
  if (!isRecord(record.privacy)) {
    throw new Error("privacy must be an object.");
  }
  assertExactKeys(record.privacy, ["classification", "restrictions"], "privacy");
  if (
    !["aggregate", "pseudonymous", "restricted"].includes(String(record.privacy.classification))
  ) {
    throw new Error("privacy.classification must be aggregate, pseudonymous, or restricted.");
  }
  requireOptionalString(record.privacy.restrictions, "privacy.restrictions");
  requireString(record.method_version, "method_version");
  requireTimestamp(record.observation_at, "observation_at");
  const observationWindow = record.observation_window;
  if (
    observationWindow !== undefined &&
    (typeof observationWindow !== "string" ||
      !["1h", "24h", "72h", "7d", "28d", "custom"].includes(observationWindow))
  ) {
    throw new Error("observation_window must be 1h, 24h, 72h, 7d, 28d, or custom.");
  }
  if (
    typeof record.distribution !== "string" ||
    !["organic", "promoted", "combined", "provider_total"].includes(record.distribution)
  ) {
    throw new Error("distribution must be organic, promoted, combined, or provider_total.");
  }
  requireOptionalString(record.metric_mapping_version, "metric_mapping_version");
  requireOptionalString(record.provider_metric_class, "provider_metric_class");
  requireOptionalString(record.bucket_granularity, "bucket_granularity");
  if (record.bucket_start !== undefined) {
    requireTimestamp(record.bucket_start, "bucket_start");
  }
  if (record.request_window_start !== undefined) {
    requireTimestamp(record.request_window_start, "request_window_start");
  }
  if (record.request_window_end !== undefined) {
    requireTimestamp(record.request_window_end, "request_window_end");
  }
  requireOptionalString(record.request_window_class, "request_window_class");
  const hasRequestWindowStart = record.request_window_start !== undefined;
  const hasRequestWindowEnd = record.request_window_end !== undefined;
  const hasRequestWindowClass = record.request_window_class !== undefined;
  if (
    (hasRequestWindowStart || hasRequestWindowEnd || hasRequestWindowClass) &&
    !(hasRequestWindowStart && hasRequestWindowEnd && hasRequestWindowClass)
  ) {
    throw new Error(
      "request_window_start, request_window_end, and request_window_class must be provided together.",
    );
  }
  if (
    hasRequestWindowStart &&
    Date.parse(record.request_window_start as string) >=
      Date.parse(record.request_window_end as string)
  ) {
    throw new Error("request_window_start must precede request_window_end.");
  }
  requireOptionalString(record.channel_profile_version, "channel_profile_version");
  requireOptionalString(record.metric_profile_version, "metric_profile_version");

  if (record.schema_version === AGENCY_DATA_SCHEMA_VERSION) {
    const identity = resolveMetricIdentity(record);
    if (!identity) {
      throw new Error(
        "v2 metric_observation has unresolved analytical sample identity or comparison signature.",
      );
    }
    requireString(record.analytical_sample_id, "analytical_sample_id");
    requireString(record.comparison_signature, "comparison_signature");
    if (record.analytical_sample_id !== identity.analytical_sample_id) {
      throw new Error("analytical_sample_id does not bind the required v2 sample identity.");
    }
    if (record.comparison_signature !== identity.comparison_signature) {
      throw new Error("comparison_signature does not bind the required v2 comparison profile.");
    }
  }
}

function validateByType(record: Record<string, unknown>): void {
  switch (record.object_type) {
    case "source_observation":
      requireOptionalString(record.account_id, "account_id");
      requireContentWhenPresent(record);
      requireString(record.observation_kind, "observation_kind");
      requireTimestamp(record.observed_at, "observed_at");
      requireOptionalString(record.content_hash, "content_hash");
      requireString(record.method_version, "method_version");
      break;
    case "account_snapshot":
      requireAccount(record);
      requireTimestamp(record.snapshot_at, "snapshot_at");
      requireString(record.method_version, "method_version");
      requireFiniteNumber(record.follower_count, "follower_count");
      if (record.audience_segments !== undefined) {
        requireStringArray(record.audience_segments, "audience_segments");
      }
      break;
    case "content_item":
      requireAccount(record);
      requireString(record.content_id, "content_id");
      requireTimestamp(record.published_at, "published_at");
      requireString(record.content_hash, "content_hash");
      requireString(record.content_format, "content_format");
      requireStringArray(record.topic_ids, "topic_ids");
      validateUtmFields(record);
      break;
    case "metric_definition":
      for (const field of [
        "metric_definition_id",
        "metric_family",
        "metric_name",
        "numerator_label",
        "denominator_label",
        "unit",
        "method_version",
      ]) {
        requireString(record[field], field);
      }
      break;
    case "metric_observation":
      validateMetric(record);
      break;
    case "campaign_variant_association":
      requireAccount(record);
      requireContentWhenPresent(record);
      requireString(record.experiment_id, "experiment_id");
      requireString(record.campaign_id, "campaign_id");
      requireString(record.variant_id, "variant_id");
      requireTimestamp(record.associated_at, "associated_at");
      validateUtmFields(record);
      break;
    case "topic_format_audience_assignment":
      requireAccount(record);
      requireContentWhenPresent(record);
      requireString(record.topic_id, "topic_id");
      requireString(record.content_format, "content_format");
      requireString(record.audience_id, "audience_id");
      requireTimestamp(record.assigned_at, "assigned_at");
      if (!["pre_publication", "retrospective"].includes(String(record.assignment_basis))) {
        throw new Error("assignment_basis must be pre_publication or retrospective.");
      }
      break;
    case "experiment":
      requireAccount(record);
      requireString(record.experiment_id, "experiment_id");
      requireString(record.status, "status");
      requireTimestamp(record.started_at, "started_at");
      if (record.ended_at !== undefined) {
        requireTimestamp(record.ended_at, "ended_at");
      }
      requireOptionalString(record.hypothesis_ref, "hypothesis_ref");
      requireOptionalString(record.primary_metric_definition_id, "primary_metric_definition_id");
      break;
    case "recommendation":
      requireAccount(record);
      requireString(record.recommendation_id, "recommendation_id");
      requireOptionalString(record.experiment_id, "experiment_id");
      requireStringArray(record.related_object_ids, "related_object_ids");
      requireString(record.recommendation_kind, "recommendation_kind");
      break;
    case "operator_decision":
      requireAccount(record);
      requireString(record.decision_id, "decision_id");
      requireOptionalString(record.experiment_id, "experiment_id");
      requireStringArray(record.related_object_ids, "related_object_ids");
      requireString(record.decision, "decision");
      break;
    case "approved_learning":
      requireAccount(record);
      requireString(record.learning_id, "learning_id");
      requireOptionalString(record.experiment_id, "experiment_id");
      requireStringArray(record.related_object_ids, "related_object_ids");
      requireString(record.learning_kind, "learning_kind");
      break;
    case "correction_tombstone":
      requireString(record.target_object_id, "target_object_id");
      if (record.target_object_id === record.object_id) {
        throw new Error("correction_tombstone cannot target itself.");
      }
      if (record.action !== "correction" && record.action !== "tombstone") {
        throw new Error("action must be correction or tombstone.");
      }
      requireString(record.reason_code, "reason_code");
      if (record.action === "correction") {
        requireString(record.replacement_object_id, "replacement_object_id");
        if (
          record.replacement_object_id === record.target_object_id ||
          record.replacement_object_id === record.object_id
        ) {
          throw new Error("replacement_object_id must identify a distinct canonical record.");
        }
      }
      if (record.action === "tombstone" && record.replacement_object_id !== undefined) {
        throw new Error("tombstone cannot include replacement_object_id.");
      }
      break;
  }
}

export function validateCanonicalRecord(
  input: unknown,
  options: { mode?: "read" | "write" } = {},
): CanonicalRecord {
  if (!isRecord(input)) {
    throw new Error("Canonical record must be an object.");
  }
  assertNoRawContent(input);
  validateBase(input);
  validateByType(input);
  if (
    options.mode !== "read" &&
    input.object_type === "metric_observation" &&
    input.schema_version !== AGENCY_DATA_SCHEMA_VERSION
  ) {
    throw new Error("new_v1_metric_write_rejected_at_cutover");
  }
  return input;
}

export function createCanonicalRecord(input: Record<string, unknown>): CanonicalRecord {
  const now = new Date().toISOString();
  const record: Record<string, unknown> = {
    ...input,
    schema_version:
      input.schema_version ??
      (input.object_type === "metric_observation"
        ? AGENCY_DATA_SCHEMA_VERSION
        : LEGACY_AGENCY_DATA_SCHEMA_VERSION),
    object_id: input.object_id ?? randomUUID(),
    recorded_at: input.recorded_at ?? now,
  };
  return validateCanonicalRecord(record);
}
