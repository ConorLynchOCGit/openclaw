import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  CommonSchema,
  requireString,
  responseEnvelope,
  stringValue,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

export function createXCountsTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_counts",
    label: "X Counts",
    description:
      "Read equivalent-window X post counts for a focused query. Use recent only for a window that begins within X's current rolling seven-day horizon; use all for frozen or older windows. Use matching query families, granularity, and windows for comparisons.",
    parameters: Type.Object(
      {
        ...CommonSchema,
        operation: Type.Union([Type.Literal("recent"), Type.Literal("all")]),
        query: Type.String({ minLength: 1, maxLength: 1_024 }),
        start_time: Type.Optional(Type.String()),
        end_time: Type.Optional(Type.String()),
        granularity: Type.Optional(
          Type.Union([Type.Literal("minute"), Type.Literal("hour"), Type.Literal("day")]),
        ),
        pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
      },
      { additionalProperties: false },
    ),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const query = requireString(args, "query");
      const envelope = responseEnvelope({ requests: 1, counts: 1, posts: 0, users: 0, media: 0 });
      const input = {
        query,
        signal,
        startTime: stringValue(args.start_time),
        endTime: stringValue(args.end_time),
        granularity: args.granularity as "minute" | "hour" | "day" | undefined,
        paginationToken: stringValue(args.pagination_token),
      };
      return params.execute(
        "x_counts",
        operation,
        args,
        toolCallId,
        () =>
          operation === "recent"
            ? params.getTransport().counts.recent(input)
            : operation === "all"
              ? params.getTransport().counts.all(input)
              : Promise.reject(new XTransportError("bad_request")),
        { subjectKind: "query", queryText: query, profile: "count_v1", ...envelope },
      );
    },
  };
}
