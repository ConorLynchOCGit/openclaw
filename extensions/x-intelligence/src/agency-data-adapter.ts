import { createHash } from "node:crypto";
import { createTrustedAgencyDataIngestion } from "@openclaw/agency-data/api.js";
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
  return message.replace(/\s+/g, " ").slice(0, 240);
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
        {
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
          observation_at: timestamp,
          observation_window: observationWindow,
          bucket_granularity: trustedAnalytics.granularity,
          bucket_start: timestamp,
          request_window_start: trustedAnalytics.startTime,
          request_window_end: trustedAnalytics.endTime,
          distribution: definition.distribution,
        },
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
          if (publicMetrics && observedAccountId) {
            for (const [metricName, rawValue] of Object.entries(publicMetrics)) {
              const metricValue = finiteNumber(rawValue);
              if (metricValue === undefined) {
                continue;
              }
              records.push({
                ...base,
                object_type: "metric_observation",
                object_id: `x-metric-${digest(
                  ...subjectIdentity,
                  observedAccountId,
                  id,
                  metricName,
                  String(metricValue),
                  input.methodVersion,
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
                observation_at: observedAt,
                // Public metrics can combine organic and promoted activity.
                // Only separately authorized sources may split them.
                distribution: "combined",
              });
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
