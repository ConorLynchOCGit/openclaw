import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  CommonSchema,
  requireString,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

export function createXTrendsTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_trends",
    label: "X Trends",
    description:
      "Read current candidate trends by location or, when user-context entitlement exists, personalized trends. Treat trends as discovery candidates requiring relevance and count checks.",
    parameters: Type.Object(
      {
        ...CommonSchema,
        operation: Type.Union([Type.Literal("by_location"), Type.Literal("personalized")]),
        woeid: Type.Optional(Type.Integer({ minimum: 1 })),
        max_results: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
      },
      { additionalProperties: false },
    ),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const maxResults = typeof args.max_results === "number" ? args.max_results : 25;
      const woeid = typeof args.woeid === "number" ? args.woeid : undefined;
      const invoke = () =>
        operation === "by_location" && woeid
          ? params.getTransport().trends.byLocation({
              woeid,
              maxResults,
              signal,
              trendFields: ["trend_name", "tweet_count"],
            })
          : operation === "personalized"
            ? params.getTransport().trends.personalized({
                signal,
                trendFields: ["category", "post_count", "trend_name", "trending_since"],
              })
            : Promise.reject(new XTransportError("bad_request"));
      return params.execute("x_trends", operation, args, toolCallId, invoke, {
        subjectKind: "resource",
        subjectIds: woeid ? [String(woeid)] : [],
        pageSize: maxResults,
      });
    },
  };
}
