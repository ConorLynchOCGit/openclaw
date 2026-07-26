import { redactSensitiveText } from "openclaw/plugin-sdk/logging-core";
import type { XComplianceEventType } from "./compliance-contract.js";
import {
  assertAllowedKeys,
  assertSafeInput,
  boundedInteger,
  compact,
  deepFreeze,
  normalizeIdentifierList,
  normalizeUrl,
  optionalDigest,
  optionalString,
  requiredIdentifier,
  requiredString,
  requiredTimestamp,
} from "./contract-helpers.js";

export const X_CONTENT_CACHE_V1 = "x_content_cache.v1" as const;

export const X_MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const X_MAX_CACHE_POST_TEXT_CHARS = 16_000;
export const X_MAX_CACHE_PROFILE_TEXT_CHARS = 8_000;
export const X_MAX_CACHE_MEDIA_ITEMS = 32;

export type XContentCacheMediaMetadata = Readonly<{
  contentType?: string;
  url?: string;
  hash?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
}>;

export type XContentCacheRecordV1 = Readonly<{
  schema: typeof X_CONTENT_CACHE_V1;
  state: "active";
  cachedAt: number;
  expiresAt: number;
  postText?: string;
  profileText?: string;
  media: readonly XContentCacheMediaMetadata[];
}>;

export type XContentCacheTombstoneV1 = Readonly<{
  schema: typeof X_CONTENT_CACHE_V1;
  state: "tombstone";
  cachedAt: number;
  expiresAt: number;
  reasonCode: string;
  compliance?: Readonly<{
    eventId: string;
    type: Exclude<XComplianceEventType, "refresh" | "edit">;
    occurredAt: string;
    reasonCodes: readonly string[];
    manifestDigest?: string;
  }>;
}>;

export type XContentCacheEntryV1 = XContentCacheRecordV1 | XContentCacheTombstoneV1;

export type XContentCacheInput = Readonly<{
  postText?: string;
  profileText?: string;
  media?: readonly XContentCacheMediaMetadata[];
}>;

function assertSafeCacheInput(value: XContentCacheInput): void {
  for (const [key, child] of Object.entries(value)) {
    if (key !== "postText" && key !== "profileText" && key !== "media") {
      throw new Error(`content cache input contains forbidden field: ${key}`);
    }
    if (key === "media") {
      if (!Array.isArray(child)) {
        throw new Error("media must be an array");
      }
      child.forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`media[${index}] must be an object`);
        }
        const allowedKeys = new Set([
          "contentType",
          "url",
          "hash",
          "bytes",
          "width",
          "height",
          "durationMs",
        ]);
        for (const mediaKey of Object.keys(item)) {
          if (!allowedKeys.has(mediaKey)) {
            throw new Error(`content cache media contains forbidden field: ${mediaKey}`);
          }
        }
        assertSafeInput(item);
      });
    } else if (child !== undefined && typeof child !== "string") {
      throw new Error(`${key} must be a string`);
    }
  }
}

function redactCacheText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.length > max) {
    throw new Error(`${field} exceeds ${max} characters`);
  }
  return redactSensitiveText(value, { mode: "tools" });
}

export function createContentCacheRecord(params: {
  input: XContentCacheInput;
  cachedAt: number;
  ttlMs: number;
}): XContentCacheRecordV1 {
  assertSafeCacheInput(params.input);
  if (!Number.isSafeInteger(params.cachedAt) || params.cachedAt < 0) {
    throw new Error("cachedAt must be a non-negative safe integer");
  }
  if (
    !Number.isSafeInteger(params.ttlMs) ||
    params.ttlMs <= 0 ||
    params.ttlMs > X_MAX_CACHE_TTL_MS
  ) {
    throw new Error(`ttlMs must be between 1 and ${X_MAX_CACHE_TTL_MS}`);
  }
  const media = params.input.media ?? [];
  if (media.length > X_MAX_CACHE_MEDIA_ITEMS) {
    throw new Error(`media exceeds ${X_MAX_CACHE_MEDIA_ITEMS} items`);
  }
  const postText = redactCacheText(params.input.postText, "postText", X_MAX_CACHE_POST_TEXT_CHARS);
  const profileText = redactCacheText(
    params.input.profileText,
    "profileText",
    X_MAX_CACHE_PROFILE_TEXT_CHARS,
  );
  if (!postText && !profileText && media.length === 0) {
    throw new Error("content cache entry must contain text or media metadata");
  }
  return deepFreeze({
    schema: X_CONTENT_CACHE_V1,
    state: "active",
    cachedAt: params.cachedAt,
    expiresAt: params.cachedAt + params.ttlMs,
    ...compact({ postText, profileText }),
    media: media.map((item) =>
      compact({
        contentType: optionalString(item.contentType, "media.contentType"),
        url: normalizeUrl(item.url, "media.url"),
        hash: optionalString(item.hash, "media.hash"),
        bytes: boundedInteger(item.bytes, "media.bytes"),
        width: boundedInteger(item.width, "media.width"),
        height: boundedInteger(item.height, "media.height"),
        durationMs: boundedInteger(item.durationMs, "media.durationMs"),
      }),
    ),
  });
}

export function createContentCacheTombstone(params: {
  cachedAt: number;
  ttlMs: number;
  reasonCode: string;
  compliance?: XContentCacheTombstoneV1["compliance"];
}): XContentCacheTombstoneV1 {
  if (!Number.isSafeInteger(params.cachedAt) || params.cachedAt < 0) {
    throw new Error("cachedAt must be a non-negative safe integer");
  }
  if (
    !Number.isSafeInteger(params.ttlMs) ||
    params.ttlMs <= 0 ||
    params.ttlMs > X_MAX_CACHE_TTL_MS
  ) {
    throw new Error(`ttlMs must be between 1 and ${X_MAX_CACHE_TTL_MS}`);
  }
  const compliance = params.compliance
    ? (() => {
        assertAllowedKeys(
          params.compliance,
          ["eventId", "type", "occurredAt", "reasonCodes", "manifestDigest"],
          "content cache tombstone compliance",
        );
        const terminalTypes: readonly NonNullable<
          XContentCacheTombstoneV1["compliance"]
        >["type"][] = ["deletion", "protection", "suspension", "tombstone", "takedown"];
        if (!terminalTypes.includes(params.compliance.type)) {
          throw new Error("content cache tombstone compliance type must be terminal");
        }
        return {
          eventId: requiredIdentifier(params.compliance.eventId, "compliance.eventId"),
          type: params.compliance.type,
          occurredAt: requiredTimestamp(params.compliance.occurredAt, "compliance.occurredAt"),
          reasonCodes: normalizeIdentifierList(
            params.compliance.reasonCodes,
            "compliance.reasonCodes",
            16,
          ),
          ...compact({
            manifestDigest: optionalDigest(
              params.compliance.manifestDigest,
              "compliance.manifestDigest",
            ),
          }),
        };
      })()
    : undefined;
  return deepFreeze({
    schema: X_CONTENT_CACHE_V1,
    state: "tombstone",
    cachedAt: params.cachedAt,
    expiresAt: params.cachedAt + params.ttlMs,
    reasonCode: requiredString(params.reasonCode, "reasonCode", 128),
    ...compact({ compliance }),
  });
}
