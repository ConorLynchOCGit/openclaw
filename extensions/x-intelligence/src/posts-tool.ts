import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  CommonSchema,
  FORMAT_MEDIA_EXPANSIONS,
  MEDIA_FIELDS,
  PageSchema,
  POST_CORE_FIELDS,
  pageArgs,
  requireString,
  responseEnvelope,
  stringValue,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

export function createXPostsTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_posts",
    label: "X Posts",
    description:
      "Read bounded X posts or hydrate one post, conversation, quote set, or reply set. Use recent only for a window that begins within X's current rolling seven-day horizon; use archive for frozen or older windows. Use focused queries and continuation tokens rather than broad post dumps.",
    parameters: Type.Union([
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Union([Type.Literal("recent"), Type.Literal("archive")]),
          query: Type.String({ minLength: 1, maxLength: 1_024 }),
          start_time: Type.Optional(Type.String()),
          end_time: Type.Optional(Type.String()),
          sort_order: Type.Optional(
            Type.Union([Type.Literal("recency"), Type.Literal("relevancy")]),
          ),
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
      ...(["exact", "thread", "quotes", "replies"] as const).map((operation) =>
        Type.Object(
          {
            ...CommonSchema,
            operation: Type.Literal(operation),
            id: Type.String({ minLength: 1, maxLength: 64 }),
            ...(operation === "exact" ? {} : PageSchema),
          },
          { additionalProperties: false },
        ),
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("batch"),
          ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
            minItems: 1,
            maxItems: 100,
            uniqueItems: true,
            description: "Exact stable X Post IDs to hydrate through the XDK batch endpoint.",
          }),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("format_media"),
          post_ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
            minItems: 1,
            maxItems: 10,
            uniqueItems: true,
            description:
              "Already selected direct-X-qualified Posts only; no author or referenced-Post expansion.",
          }),
        },
        { additionalProperties: false },
      ),
    ]),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const query = stringValue(args.query);
      const id = stringValue(args.id);
      const requestedPostIds = operation === "batch" ? args.ids : args.post_ids;
      const postIds = Array.isArray(requestedPostIds)
        ? requestedPostIds.filter((value): value is string => typeof value === "string")
        : [];
      const page = pageArgs(args);
      const requestedPostLimit = ["recent", "archive", "thread", "quotes", "replies"].includes(
        operation,
      )
        ? page.maxResults
        : operation === "exact"
          ? 1
          : postIds.length;
      const envelope = responseEnvelope({
        requests: 1,
        posts: requestedPostLimit,
        users: 0,
        media: operation === "format_media" ? requestedPostLimit * 4 : 0,
      });
      const common = {
        ...page,
        signal,
        startTime: stringValue(args.start_time),
        endTime: stringValue(args.end_time),
        sortOrder: args.sort_order as "recency" | "relevancy" | undefined,
        tweetFields: POST_CORE_FIELDS,
      };
      const invoke = () => {
        switch (operation) {
          case "recent":
            if ((query?.length ?? 0) > 512) {
              throw new XTransportError("bad_request");
            }
            return params.getTransport().posts.recent({ ...common, query: query ?? "" });
          case "archive":
            return params.getTransport().posts.archive({ ...common, query: query ?? "" });
          case "exact":
            return params.getTransport().posts.exact({ ...common, id: id ?? "" });
          case "batch":
            return params.getTransport().posts.batch({ ...common, ids: postIds });
          case "format_media":
            return params.getTransport().posts.batch({
              ...common,
              ids: postIds,
              expansions: FORMAT_MEDIA_EXPANSIONS,
              mediaFields: MEDIA_FIELDS,
            });
          case "thread":
            return params.getTransport().posts.thread({ ...common, id: id ?? "" });
          case "quotes":
            return params.getTransport().posts.quotes({ ...common, id: id ?? "" });
          case "replies":
            return params.getTransport().posts.replies({ ...common, id: id ?? "" });
          default:
            throw new XTransportError("bad_request");
        }
      };
      return params.execute("x_posts", operation, args, toolCallId, invoke, {
        subjectKind: query ? "query" : id ? "post" : "resource",
        subjectIds: postIds.length > 0 ? postIds : id ? [id] : [],
        queryText: query,
        pageSize: ["recent", "archive", "thread", "quotes", "replies"].includes(operation)
          ? page.maxResults
          : undefined,
        profile: operation === "format_media" ? "format_media_v1" : "post_core_v1",
        ...envelope,
      });
    },
  };
}
