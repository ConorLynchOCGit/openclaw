import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import {
  CommonSchema,
  PageSchema,
  USER_IDENTITY_FIELDS,
  pageArgs,
  requireString,
  responseEnvelope,
  stringValue,
  type ToolCommon,
  type XToolBuilderParams,
} from "./tool-shared.js";
import { XTransportError } from "./transport.js";

export function createXUsersTool(params: XToolBuilderParams): AnyAgentTool {
  return {
    name: "x_users",
    label: "X Users",
    description:
      "Discover X accounts, resolve stable identity, or inspect bounded follower/following relationships. Resolve candidates to stable IDs before qualification.",
    parameters: Type.Union([
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("search"),
          query: Type.String({
            minLength: 1,
            maxLength: 50,
            description: "Name, username, or profile-bio keywords; not a post-search query.",
          }),
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("identity"),
          id: Type.String({ minLength: 1, maxLength: 64 }),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("identity"),
          username: Type.String({ minLength: 1, maxLength: 64 }),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("identity"),
          ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
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
          operation: Type.Literal("identity"),
          usernames: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
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
          operation: Type.Literal("followers"),
          id: Type.String({ minLength: 1, maxLength: 64 }),
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          ...CommonSchema,
          operation: Type.Literal("following"),
          id: Type.String({ minLength: 1, maxLength: 64 }),
          ...PageSchema,
        },
        { additionalProperties: false },
      ),
    ]),
    execute: async (toolCallId, raw, signal) => {
      const args = raw as ToolCommon & Record<string, unknown>;
      const operation = requireString(args, "operation");
      const query = stringValue(args.query);
      const id = stringValue(args.id);
      const username = stringValue(args.username);
      const ids = Array.isArray(args.ids)
        ? args.ids.filter((value): value is string => typeof value === "string")
        : [];
      const usernames = Array.isArray(args.usernames)
        ? args.usernames.filter((value): value is string => typeof value === "string")
        : [];
      const page = pageArgs(args);
      const requestedUserLimit =
        operation === "identity" ? Math.max(ids.length, usernames.length, 1) : page.maxResults;
      const envelope = responseEnvelope({
        requests: 1,
        posts: 0,
        users: requestedUserLimit,
        media: 0,
      });
      const common = {
        ...page,
        signal,
        userFields: USER_IDENTITY_FIELDS,
      };
      const invoke = () => {
        switch (operation) {
          case "search":
            return params.getTransport().users.search({ ...common, query: query ?? "" });
          case "identity":
            return ids.length > 0 || usernames.length > 0
              ? params.getTransport().users.identityBatch({
                  ...common,
                  ...(ids.length > 0 ? { ids } : { usernames }),
                })
              : params.getTransport().users.identity({ ...common, id, username });
          case "followers":
            return params.getTransport().users.followers({ ...common, id: id ?? "" });
          case "following":
            return params.getTransport().users.following({ ...common, id: id ?? "" });
          default:
            throw new XTransportError("bad_request");
        }
      };
      return params.execute("x_users", operation, args, toolCallId, invoke, {
        subjectKind: "profile",
        subjectIds: ids.length > 0 ? ids : id ? [id] : [],
        queryText: query ?? username ?? (usernames.length > 0 ? usernames.join(",") : undefined),
        pageSize: ["search", "followers", "following"].includes(operation)
          ? page.maxResults
          : undefined,
        profile: "user_identity_v1",
        ...envelope,
      });
    },
  };
}
