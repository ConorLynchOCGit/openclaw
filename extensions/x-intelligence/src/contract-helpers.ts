import { createHash } from "node:crypto";

export const MAX_STRING_CHARS = 1_024;
export const MAX_QUERY_CHARS = 4_096;
export const MAX_URL_CHARS = 4_096;
export const MAX_ARRAY_ITEMS = 100;
export const MAX_OBJECT_KEYS = 64;
export const MAX_DEPTH = 8;
export const MAX_IDENTIFIER_CHARS = 512;

type JsonPrimitive = boolean | null | number | string;
export type XJsonValue =
  | JsonPrimitive
  | readonly XJsonValue[]
  | { readonly [key: string]: XJsonValue };

const FORBIDDEN_KEYS = new Set([
  "body",
  "content",
  "posttext",
  "postbody",
  "profilebio",
  "bio",
  "username",
  "location",
  "rawpayload",
  "rawproviderpayload",
  "providerpayload",
  "payload",
  "credentials",
  "credential",
  "secret",
  "secrets",
  "token",
  "accesstoken",
  "apikey",
  "authorization",
  "cookie",
  "password",
  "headers",
]);

const SENSITIVE_QUERY_PARAMETER =
  /^(?:access_?token|api_?key|auth|authorization|client_?secret|credential|key|password|secret|sig|signature|token)$/i;
const DIGEST = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9._-]*$/i;

export function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function assertAllowedKeys(value: unknown, allowed: readonly string[], field: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${field} contains forbidden field: ${key}`);
    }
  }
}

export function assertSafeInput(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new Error("x intelligence input exceeds the maximum nesting depth");
  }
  if (typeof value === "string") {
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      throw new Error(`x intelligence input contains forbidden field: ${key}`);
    }
    assertSafeInput(child, depth + 1);
  }
}

export function requiredString(value: unknown, field: string, max = MAX_STRING_CHARS): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return boundedString(value, field, max);
}

export function optionalString(
  value: unknown,
  field: string,
  max = MAX_STRING_CHARS,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field, max);
}

export function boundedString(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new Error(`${field} exceeds ${max} characters`);
  }
  return normalized;
}

export function requiredIdentifier(
  value: unknown,
  field: string,
  max = MAX_IDENTIFIER_CHARS,
): string {
  // These values are opaque source/runtime identities. Preserve them exactly;
  // semantic restrictions here previously rejected valid model-authored method labels.
  return requiredString(value, field, max);
}

export function optionalIdentifier(
  value: unknown,
  field: string,
  max = MAX_IDENTIFIER_CHARS,
): string | undefined {
  return value === undefined ? undefined : requiredIdentifier(value, field, max);
}

export function requiredDigest(value: unknown, field: string): string {
  const digest = requiredString(value, field, MAX_IDENTIFIER_CHARS);
  if (!DIGEST.test(digest)) {
    throw new Error(`${field} must be an algorithm-prefixed digest`);
  }
  return digest;
}

export function optionalDigest(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredDigest(value, field);
}

export function requiredTimestamp(value: unknown, field: string): string {
  const timestamp = requiredString(value, field, 64);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`);
  }
  return timestamp;
}

export function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function assertArtifactSize(value: object, field: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(stableJsonStringify(value), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${field} exceeds ${maxBytes} bytes`);
  }
}

export function boundedInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

export function boundedNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

export function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function normalizeJson(value: unknown, field: string, depth = 0): XJsonValue {
  if (depth > MAX_DEPTH) {
    throw new Error(`${field} exceeds the maximum nesting depth`);
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return boundedString(value, field, MAX_STRING_CHARS);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must contain finite numbers`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`${field} exceeds ${MAX_ARRAY_ITEMS} items`);
    }
    return value.map((child) => normalizeJson(child, field, depth + 1));
  }
  if (!value || typeof value !== "object") {
    throw new Error(`${field} must be JSON-compatible`);
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    throw new Error(`${field} exceeds ${MAX_OBJECT_KEYS} keys`);
  }
  return Object.fromEntries(
    entries
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [
        boundedString(key, `${field} key`, MAX_STRING_CHARS),
        normalizeJson(child, field, depth + 1),
      ]),
  );
}

export function normalizeStringList(
  value: unknown,
  field: string,
  max = MAX_ARRAY_ITEMS,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > max) {
    throw new Error(`${field} exceeds ${max} items`);
  }
  return Array.from(new Set(value.map((item) => requiredString(item, field)))).toSorted();
}

export function normalizeIdentifierList(
  value: unknown,
  field: string,
  max = MAX_ARRAY_ITEMS,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > max) {
    throw new Error(`${field} exceeds ${max} items`);
  }
  return Array.from(new Set(value.map((item) => requiredIdentifier(item, field)))).toSorted();
}

export function normalizeDigestList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > MAX_ARRAY_ITEMS) {
    throw new Error(`${field} exceeds ${MAX_ARRAY_ITEMS} items`);
  }
  return Array.from(new Set(value.map((item) => requiredDigest(item, field)))).toSorted();
}

export function normalizeUrl(
  value: unknown,
  field: string,
  options: { endpoint?: boolean; xIdentitySafe?: boolean } = {},
): string | undefined {
  const raw = optionalString(value, field, MAX_URL_CHARS);
  if (!raw) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${field} must use http or https`);
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_QUERY_PARAMETER.test(key)) {
      url.searchParams.delete(key);
    }
  }
  if (options.endpoint) {
    url.search = "";
  }
  if (options.xIdentitySafe && /^(?:www\.)?(?:x|twitter)\.com$/i.test(url.hostname)) {
    const statusId = url.pathname.match(/\/status\/(\d{1,32})(?:\/|$)/)?.[1];
    if (statusId) {
      return `https://x.com/i/web/status/${statusId}`;
    }
    const userId = url.pathname.match(/^\/i\/user\/(\d{1,32})(?:\/|$)/)?.[1];
    return userId ? `https://x.com/i/user/${userId}` : undefined;
  }
  return url.toString();
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

/** Serialize a validated artifact with recursively sorted object keys. */
export function stableJsonStringify(value: XJsonValue | object): string {
  const normalized = normalizeJson(value, "artifact");
  return JSON.stringify(normalized);
}
