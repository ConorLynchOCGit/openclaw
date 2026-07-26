import { createHash } from "node:crypto";
import {
  createTrustedAgencyDataIngestion,
  resolveMetricIdentity,
} from "@openclaw/agency-data/api.js";
import {
  requireXOwnedMetricDefinition,
  X_OWNED_METRIC_DEFINITIONS_VERSION,
} from "./owned-metric-definitions.js";
import type { XJson, XReadResult } from "./transport.js";

export type XAnalyticsContext = Readonly<{
  tenantId: string;
  subject: Readonly<{ entityType: "company" | "person"; entityId: string }>;
}>;

export type XAnalyticsIngestionResult = Readonly<{
  status: "recorded" | "not_requested" | "failed";
  records: number;
  error?: string;
}>;

type IngestInput = Readonly<{
  context?: XAnalyticsContext;
  result: XReadResult;
  manifestRef: string;
  toolName: string;
  operation: string;
  methodVersion: string;
  observedAt?: string;
  authMode?: "oauth" | "token";
}>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function valueString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function objectsFrom(value: XJson): Record<string, unknown>[] {
  const root = asRecord(value);
  if (!root) {
    return [];
  }
  const primary = Array.isArray(root.data) ? root.data : root.data ? [root.data] : [];
  const includes = asRecord(root.includes);
  const related = includes
    ? ["tweets", "users"].flatMap((key) =>
        Array.isArray(includes[key]) ? (includes[key] as unknown[]) : [],
      )
    : [];
  return [...primary, ...related]
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "agency_data_ingestion_failed";
  let normalized = "";
  let previousWasWhitespace = false;
  for (const character of message) {
    const isWhitespace = character.trim().length === 0;
    if (!isWhitespace) {
      normalized += character;
      previousWasWhitespace = false;
    } else if (!previousWasWhitespace && normalized.length > 0) {
      normalized += " ";
      previousWasWhitespace = true;
    }
    if (normalized.length >= 240) {
      break;
    }
  }
  return normalized.trimEnd();
}

function withMetricIdentity(record: Record<string, unknown>): Record<string, unknown> {
  const identity = resolveMetricIdentity(record);
  if (!identity) {
    throw new Error("Agency Data rejected a metric without an explicit v2 comparison identity");
  }
  return {
    ...record,
    analytical_sample_id: identity.analytical_sample_id,
    comparison_signature: identity.comparison_signature,
  };
}

function ownedTimestampedMetricRecords(params: {
  item: Record<string, unknown>;
  accountId: string | undefined;
  verifiedPostIds: ReadonlySet<string>;
  subjectIdentity: readonly [string, string];
  base: Record<string, unknown>;
  methodVersion: string;
  observedAt: string;
  trustedAnalytics: XReadResult["trustedOwnedAnalytics"];
}): Record<string, unknown>[] {
  if (!Array.isArray(params.item.timestamped_metrics)) {
    return [];
  }
  const contentId = valueString(params.item.id);
  if (!contentId) {
    return [];
  }
  if (!params.accountId || !params.verifiedPostIds.has(contentId)) {
    throw new Error("owned X analytics require provider-verified ownership");
  }
  const accountId = params.accountId;
  const uri = `https://x.com/i/web/status/${contentId}`;
  if (!params.trustedAnalytics) {
    throw new Error("owned X analytics require trusted provider request context");
  }
  const trustedAnalytics = params.trustedAnalytics;
  const observationWindow = observationWindowFor(trustedAnalytics.granularity);
  return params.item.timestamped_metrics.flatMap((rawBucket) => {
    const bucket = asRecord(rawBucket);
    const timestamp = valueString(bucket?.timestamp);
    const metrics = asRecord(bucket?.metrics);
    if (!timestamp || Number.isNaN(Date.parse(timestamp)) || !metrics) {
      throw new Error("owned X analytics returned a malformed timestamped metric bucket");
    }
    return Object.entries(metrics).flatMap(([metricName, rawValue]) => {
      const metricValue = finiteNumber(rawValue);
      if (metricValue === undefined) {
        throw new Error(`owned X analytics returned a malformed value for ${metricName}`);
      }
      const definition = requireXOwnedMetricDefinition(metricName);
      if (trustedAnalytics.providerMetricClass !== definition.providerMetricClass) {
        throw new Error(
          `owned X analytics class ${trustedAnalytics.providerMetricClass} cannot map ${metricName}`,
        );
      }
      if (!trustedAnalytics.requestedMetrics.includes(metricName)) {
        throw new Error(`owned X analytics returned an unrequested field: ${metricName}`);
      }
      return [
        withMetricIdentity({
          ...params.base,
          object_type: "metric_observation",
          object_id: `x-owned-metric-${digest(
            ...params.subjectIdentity,
            accountId,
            contentId,
            timestamp,
            metricName,
            params.methodVersion,
            observationWindow,
            definition.providerMetricClass,
            definition.distribution,
          ).slice(0, 40)}`,
          source_ref: { source_id: contentId, uri, captured_at: params.observedAt },
          account_id: accountId,
          content_id: contentId,
          metric_definition_id: definition.metricDefinitionId,
          metric_family: definition.metricFamily,
          metric_name: definition.metricName,
          numerator: metricValue,
          denominator: definition.denominator,
          unit: definition.unit,
          completeness: 1,
          stabilization: { state: "provisional", as_of: params.observedAt },
          privacy: {
            classification: "restricted",
            restrictions: "owned_account_user_context",
          },
          method_version: params.methodVersion,
          metric_mapping_version: X_OWNED_METRIC_DEFINITIONS_VERSION,
          provider_metric_class: definition.providerMetricClass,
          channel_profile_version: "x.v2",
          metric_profile_version: "x-owned-metric.v2",
          observation_at: timestamp,
          observation_window: observationWindow,
          bucket_granularity: trustedAnalytics.granularity,
          bucket_start: timestamp,
          request_window_start: trustedAnalytics.startTime,
          request_window_end: trustedAnalytics.endTime,
          request_window_class: "provider_requested_window",
          distribution: definition.distribution,
        }),
      ];
    });
  });
}

function observationWindowFor(
  granularity: NonNullable<XReadResult["trustedOwnedAnalytics"]>["granularity"],
): "1h" | "24h" | "7d" | "custom" {
  if (granularity === "hourly") {
    return "1h";
  }
  if (granularity === "daily") {
    return "24h";
  }
  if (granularity === "weekly") {
    return "7d";
  }
  return "custom";
}

function publicMetricWindow(item: Record<string, unknown>, observedAt: string) {
  const createdAt = valueString(item.created_at);
  const createdEpoch = createdAt ? Date.parse(createdAt) : Number.NaN;
  const observedEpoch = Date.parse(observedAt);
  if (
    !createdAt ||
    !Number.isFinite(createdEpoch) ||
    !Number.isFinite(observedEpoch) ||
    observedEpoch < createdEpoch
  ) {
    return undefined;
  }
  const ageMs = observedEpoch - createdEpoch;
  const hourMs = 60 * 60 * 1_000;
  const dayMs = 24 * hourMs;
  const ageBand =
    ageMs < hourMs
      ? "lt_1h"
      : ageMs < 6 * hourMs
        ? "1h_to_6h"
        : ageMs < dayMs
          ? "6h_to_24h"
          : ageMs < 3 * dayMs
            ? "1d_to_3d"
            : ageMs < 7 * dayMs
              ? "3d_to_7d"
              : ageMs < 30 * dayMs
                ? "7d_to_30d"
                : ageMs < 90 * dayMs
                  ? "30d_to_90d"
                  : "gte_90d";
  return {
    observationWindow: "custom",
    bucketGranularity: `post_age_band_${ageBand}`,
  } as const;
}

export function createXAgencyDataAdapter(params: { stateDir: string; now?: () => string }) {
  const ingestion = createTrustedAgencyDataIngestion({ stateDir: params.stateDir });
  const now = params.now ?? (() => new Date().toISOString());

  return {
    async ingest(input: IngestInput): Promise<XAnalyticsIngestionResult> {
      if (!input.context) {
        return { status: "not_requested", records: 0 };
      }
      const observedAt = input.observedAt ?? now();
      const subjectIdentity = [
        input.context.subject.entityType,
        input.context.subject.entityId,
      ] as const;
      const verifiedPostIds = new Set(input.result.trustedOwnership?.verifiedPostIds ?? []);
      const base = {
        tenant_id: input.context.tenantId,
        subject: {
          entity_type: input.context.subject.entityType,
          entity_id: input.context.subject.entityId,
        },
        channel: "x",
        source: { provider: "x", auth_mode: input.authMode ?? "token" },
        acquisition_manifest_ref: input.manifestRef,
        event_at: observedAt,
        recorded_at: observedAt,
      } as const;
      const records: Record<string, unknown>[] = [];
      try {
        for (const item of objectsFrom(input.result.data)) {
          const id = valueString(item.id);
          if (!id) {
            continue;
          }
          const text = valueString(item.text);
          const description = valueString(item.description);
          const authorId = valueString(item.author_id);
          const uri = text ? `https://x.com/i/web/status/${id}` : undefined;
          const contentHash = text
            ? `sha256:${digest(text)}`
            : description
              ? `sha256:${digest(description)}`
              : undefined;
          const sourceObjectKind = text
            ? "post"
            : valueString(item.username) || description
              ? "profile"
              : "source_object";
          const observedAccountId =
            sourceObjectKind === "profile"
              ? id
              : sourceObjectKind === "post"
                ? authorId
                : undefined;
          const observationKind = `${input.toolName}.${input.operation}.${sourceObjectKind}`;
          records.push({
            ...base,
            object_type: "source_observation",
            object_id: `x-source-${digest(
              ...subjectIdentity,
              id,
              observationKind,
              observedAt,
              input.methodVersion,
            ).slice(0, 40)}`,
            source_ref: { source_id: id, ...(uri ? { uri } : {}), captured_at: observedAt },
            ...(observedAccountId ? { account_id: observedAccountId } : {}),
            ...(text ? { content_id: id } : {}),
            observation_kind: observationKind,
            observed_at: observedAt,
            method_version: input.methodVersion,
            ...(contentHash ? { content_hash: contentHash } : {}),
          });

          records.push(
            ...ownedTimestampedMetricRecords({
              item,
              accountId: input.result.trustedOwnership?.accountId,
              verifiedPostIds,
              subjectIdentity,
              base,
              methodVersion: input.methodVersion,
              observedAt,
              trustedAnalytics: input.result.trustedOwnedAnalytics,
            }),
          );

          const publicMetrics = asRecord(item.public_metrics);
          const metricWindow = publicMetricWindow(item, observedAt);
          if (publicMetrics && sourceObjectKind === "post" && observedAccountId && metricWindow) {
            for (const [metricName, rawValue] of Object.entries(publicMetrics)) {
              const metricValue = finiteNumber(rawValue);
              if (metricValue === undefined) {
                continue;
              }
              records.push(
                withMetricIdentity({
                  ...base,
                  object_type: "metric_observation",
                  object_id: `x-metric-${digest(
                    ...subjectIdentity,
                    observedAccountId,
                    id,
                    metricName,
                    String(metricValue),
                    input.methodVersion,
                    metricWindow.bucketGranularity,
                    "combined",
                  ).slice(0, 40)}`,
                  source_ref: { source_id: id, ...(uri ? { uri } : {}), captured_at: observedAt },
                  account_id: observedAccountId,
                  ...(text ? { content_id: id } : {}),
                  metric_definition_id: `x.public.${metricName}`,
                  metric_family: "x_public_engagement",
                  metric_name: metricName,
                  numerator: metricValue,
                  denominator: 1,
                  unit: "count",
                  completeness: 1,
                  stabilization: { state: "provisional", as_of: observedAt },
                  privacy: { classification: "aggregate" },
                  method_version: input.methodVersion,
                  channel_profile_version: "x.v2",
                  metric_profile_version: "x-public-metric.v2",
                  metric_mapping_version: "x-public-metric.v2",
                  provider_metric_class: "public_post_metric",
                  observation_at: observedAt,
                  observation_window: metricWindow.observationWindow,
                  bucket_granularity: metricWindow.bucketGranularity,
                  // Public metrics can combine organic and promoted activity.
                  // Only separately authorized sources may split them.
                  distribution: "combined",
                }),
              );
            }
          }

          const followers = publicMetrics ? finiteNumber(publicMetrics.followers_count) : undefined;
          if (followers !== undefined) {
            records.push({
              ...base,
              object_type: "account_snapshot",
              object_id: `x-account-${digest(
                ...subjectIdentity,
                id,
                observedAt,
                input.methodVersion,
              ).slice(0, 40)}`,
              source_ref: { source_id: id, captured_at: observedAt },
              account_id: id,
              snapshot_at: observedAt,
              follower_count: followers,
              method_version: input.methodVersion,
            });
          }
        }
        if (records.length > 0) {
          await ingestion.appendBatch(records);
        }
        return { status: "recorded", records: records.length };
      } catch (error) {
        return { status: "failed", records: 0, error: boundedError(error) };
      }
    },
  };
}
