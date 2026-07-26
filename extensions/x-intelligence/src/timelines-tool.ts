import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  CommonSchema,
  POST_CORE_FIELDS,
  TimelinePageSchema,
  pageArgs,
  requireString,
  responseEnvelope,
  stringValue,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

export function createXTimelinesTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_timelines",
    label: "X Timelines",
    description:
      "Read a bounded authored-post panel for one stable X user ID. Use authored for public analysis; reverse_chronological may require user-context entitlement.",
    parameters: Type.Object(
      {
        ...CommonSchema,
        operation: Type.Union([Type.Literal("authored"), Type.Literal("reverse_chronological")]),
        user_id: Type.String({ minLength: 1, maxLength: 64 }),
        start_time: Type.Optional(Type.String()),
        end_time: Type.Optional(Type.String()),
        ...TimelinePageSchema,
      },
      { additionalProperties: false },
    ),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const id = requireString(args, "user_id");
      const page = pageArgs(args);
      const envelope = responseEnvelope({
        requests: 1,
        posts: page.maxResults,
        users: 0,
        media: 0,
      });
      const input = {
        ...page,
        id,
        signal,
        startTime: stringValue(args.start_time),
        endTime: stringValue(args.end_time),
        tweetFields: POST_CORE_FIELDS,
      };
      return params.execute(
        "x_timelines",
        operation,
        args,
        toolCallId,
        () =>
          operation === "authored"
            ? params.getTransport().timelines.authored(input)
            : operation === "reverse_chronological"
              ? params.getTransport().timelines.reverseChronological(input)
              : Promise.reject(new XTransportError("bad_request")),
        {
          subjectKind: "profile",
          subjectIds: [id],
          pageSize: page.maxResults,
          profile: "post_core_v1",
          ...envelope,
        },
      );
    },
  };
}
