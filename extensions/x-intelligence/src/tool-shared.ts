import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";
import { XTransportError, type XReadResult, type XReadTransport } from "./transport.js";

export const POST_CORE_FIELDS = [
  "id",
  "text",
  "author_id",
  "created_at",
  "conversation_id",
  "referenced_tweets",
  "lang",
  "entities",
  "public_metrics",
  "attachments",
];

export const USER_IDENTITY_FIELDS = [
  "id",
  "username",
  "name",
  "description",
  "created_at",
  "verified",
  "public_metrics",
];

export const MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "width",
  "height",
  "duration_ms",
  "public_metrics",
];

export const FORMAT_MEDIA_EXPANSIONS = ["attachments.media_keys"];

const PURPOSES = [
  "question_research",
  "topic_pulse",
  "influence_map",
  "format_study",
  "source_verification",
  "owned_performance",
] as const;

const PurposeSchema = Type.Union(PURPOSES.map((value) => Type.Literal(value)));

export const CommonSchema = {
  purpose: PurposeSchema,
  method_version: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Version of the research method using this source operation.",
    }),
  ),
  query_version: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Version of the query family or comparison design.",
    }),
  ),
  analytics_context: Type.Optional(
    Type.Object(
      {
        tenant_id: Type.String({ minLength: 1, maxLength: 128 }),
        subject_type: Type.Union([Type.Literal("company"), Type.Literal("person")]),
        subject_id: Type.String({ minLength: 1, maxLength: 128 }),
      },
      {
        additionalProperties: false,
        description:
          "Explicit canonical analytics association. Omit for source research that must not write Agency Data.",
      },
    ),
  ),
};

export const PageSchema = {
  max_results: Type.Optional(Type.Integer({ minimum: 10, maximum: 100, default: 25 })),
  pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
};

export const TimelinePageSchema = {
  max_results: Type.Optional(Type.Integer({ minimum: 5, maximum: 100, default: 25 })),
  pagination_token: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
};

export type ToolCommon = {
  purpose: (typeof PURPOSES)[number];
  method_version?: string;
  query_version?: string;
  analytics_context?: {
    tenant_id: string;
    subject_type: "company" | "person";
    subject_id: string;
  };
};

export type SourceOperationOptions = {
  subjectKind: "post" | "profile" | "collection" | "query" | "resource";
  subjectIds?: string[];
  queryText?: string;
  pageSize?: number;
  profile?: "post_core_v1" | "format_media_v1" | "user_identity_v1" | "count_v1";
  maxPosts?: number;
  maxUsers?: number;
  maxMedia?: number;
};

export type XToolExecute = (
  toolName: string,
  operation: string,
  args: ToolCommon & Record<string, unknown>,
  toolCallId: string,
  invoke: () => Promise<XReadResult>,
  options: SourceOperationOptions,
) => ReturnType<AnyAgentTool["execute"]>;

export type XToolBuilderParams = {
  getTransport: () => XReadTransport;
  execute: XToolExecute;
};

type ResponseEnvelope = Readonly<{
  requests: number;
  posts?: number;
  users?: number;
  counts?: number;
  media?: number;
}>;

export function responseEnvelope(params: ResponseEnvelope) {
  return {
    ...(params.posts !== undefined ? { maxPosts: params.posts } : {}),
    ...(params.users !== undefined ? { maxUsers: params.users } : {}),
    ...(params.media !== undefined ? { maxMedia: params.media } : {}),
  };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = stringValue(args[key]);
  if (!value) {
    throw new XTransportError("bad_request");
  }
  return value;
}

export function pageArgs(args: Record<string, unknown>) {
  return {
    maxResults: typeof args.max_results === "number" ? args.max_results : 25,
    paginationToken: stringValue(args.pagination_token),
  };
}
