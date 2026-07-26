import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  requireXOwnedMetricDefinition,
  supportedXOwnedMetricFields,
} from "./owned-metric-definitions.js";
import {
  CommonSchema,
  requireString,
  responseEnvelope,
  stringValue,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

const OWNED_METRIC_FIELD_SCHEMA = Type.Union(
  supportedXOwnedMetricFields().map((value) => Type.Literal(value)),
);

function ownedMetricsInput(args: Record<string, unknown>, signal: AbortSignal | undefined) {
  const tweetIds = Array.isArray(args.post_ids)
    ? args.post_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (tweetIds.length === 0) {
    throw new XTransportError("owned_metrics_post_ids_required");
  }
  const startTime = stringValue(args.start_time);
  const endTime = stringValue(args.end_time);
  if (!startTime || !endTime) {
    throw new XTransportError("owned_metrics_window_required");
  }
  const requestedMetrics = Array.isArray(args.metric_names)
    ? args.metric_names.filter(
        (name): name is string => typeof name === "string" && name.trim().length > 0,
      )
    : [];
  if (requestedMetrics.length === 0) {
    throw new XTransportError("owned_metrics_fields_required");
  }
  try {
    requestedMetrics.forEach(requireXOwnedMetricDefinition);
  } catch {
    throw new XTransportError("owned_metrics_unsupported_field");
  }
  return {
    tweetIds,
    signal,
    startTime,
    endTime,
    granularity: stringValue(args.granularity) ?? "total",
    requestedMetrics,
  };
}

export function createXMetricsTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_metrics",
    label: "X Metrics",
    description:
      "Read public post metrics, separately authorized owned analytics for an exact time window, or bounded project usage. Public credentials are never substituted for owned-account authorization.",
    parameters: Type.Union([
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("public"),
          post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
            minItems: 1,
            maxItems: 100,
            uniqueItems: true,
          }),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("owned"),
          post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
            minItems: 1,
            maxItems: 100,
            uniqueItems: true,
          }),
          start_time: Type.String({
            minLength: 1,
            description: "Inclusive ISO-8601 start of the owned analytics window.",
          }),
          end_time: Type.String({
            minLength: 1,
            description: "Exclusive ISO-8601 end of the owned analytics window (maximum 30 days).",
          }),
          granularity: Type.Optional(
            Type.Union([
              Type.Literal("hourly"),
              Type.Literal("daily"),
              Type.Literal("weekly"),
              Type.Literal("total"),
            ]),
          ),
          metric_names: Type.Array(OWNED_METRIC_FIELD_SCHEMA, {
            minItems: 1,
            maxItems: 50,
            description: "Owned-account analytics metrics requested from X.",
          }),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("usage"),
          days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90, default: 7 })),
        },
        { additionalProperties: false },
      ),
    ]),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const ids = Array.isArray(args.post_ids)
        ? args.post_ids.filter((id): id is string => typeof id === "string")
        : [];
      const envelope = responseEnvelope({
        requests: operation === "owned" ? 3 : 1,
        posts: operation === "usage" ? 0 : ids.length,
        users: operation === "owned" ? 1 : 0,
        media: 0,
      });
      const ownedInput = operation === "owned" ? ownedMetricsInput(args, signal) : undefined;
      const invoke = () =>
        operation === "usage"
          ? params.getTransport().metrics.usage({
              days: typeof args.days === "number" ? args.days : 7,
              signal,
            })
          : operation === "public" && ids.length > 0
            ? params.getTransport().metrics.public({
                ids,
                signal,
              })
            : operation === "owned"
              ? params.getTransport().metrics.owned(ownedInput!)
              : Promise.reject(new XTransportError("bad_request"));
      return params.execute("x_metrics", operation, args, toolCallId, invoke, {
        subjectKind: operation === "usage" ? "resource" : "post",
        subjectIds: ids,
        ...(operation === "usage" ? {} : envelope),
      });
    },
  };
}
