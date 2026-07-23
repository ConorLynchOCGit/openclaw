// X intelligence persistence contracts deliberately exclude provider payloads and identity content.
import { createHash } from "node:crypto";
import { redactSensitiveText } from "openclaw/plugin-sdk/logging-core";

export const X_ACQUISITION_MANIFEST_V4 = "x_acquisition_manifest.v4" as const;
export const X_COMPLIANCE_EVENT_V1 = "x_compliance_event.v1" as const;
export const X_CONTENT_CACHE_V1 = "x_content_cache.v1" as const;
export const X_CLAIM_LEDGER_V1 = "x_claim_ledger.v1" as const;

export const X_MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const X_MAX_CACHE_POST_TEXT_CHARS = 16_000;
export const X_MAX_CACHE_PROFILE_TEXT_CHARS = 8_000;
export const X_MAX_CACHE_MEDIA_ITEMS = 32;
export const X_MAX_EVIDENCE_ARTIFACT_BYTES = 256 * 1024;
export const X_MAX_CLAIM_LEDGER_BYTES = 128 * 1024;
export const X_MAX_COMPLIANCE_EVENT_BYTES = 32 * 1024;

const MAX_STRING_CHARS = 1_024;
const MAX_QUERY_CHARS = 4_096;
const MAX_URL_CHARS = 4_096;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 64;
const MAX_DEPTH = 8;
const MAX_CLAIM_CHARS = 4_096;
const MAX_CLAIM_LIMITATION_CHARS = 1_024;
const MAX_CLAIM_LIMITATIONS = 32;
const MAX_CLAIMS = 100;
const MAX_IDENTIFIER_CHARS = 512;

type JsonPrimitive = boolean | null | number | string;
export type XJsonValue =
  | JsonPrimitive
  | readonly XJsonValue[]
  | { readonly [key: string]: XJsonValue };

export type XAcquisitionSubjectKind = "post" | "profile" | "collection" | "query" | "resource";

export type XAcquisitionManifestV4 = Readonly<{
  schema: typeof X_ACQUISITION_MANIFEST_V4;
  versions: Readonly<{
    request: string;
    subject: string;
    purpose: string;
    method: string;
    query: string;
  }>;
  request: Readonly<{ id: string; correlationId?: string }>;
  subject: Readonly<{ kind: XAcquisitionSubjectKind; ids: readonly string[] }>;
  purpose: Readonly<{ code: string }>;
  method: Readonly<{ name: string }>;
  query: Readonly<{
    digest?: string;
    filters: Readonly<Record<string, XJsonValue>>;
    window: Readonly<{ start?: string; end?: string; limit?: number }>;
  }>;
  endpoint: Readonly<{ name: string; tool?: string; url?: string }>;
  evidence: Readonly<{
    ids: readonly string[];
    urls: readonly string[];
    hashes: readonly string[];
    citations: readonly Readonly<{ id?: string; url?: string; hash?: string }>[];
    publicMetrics: Readonly<Record<string, number>>;
  }>;
  resources: Readonly<{ requests?: number; bytes?: number; durationMs?: number }>;
  cost: Readonly<{ currency?: string; amount?: number; units?: number }>;
  errors: readonly Readonly<{ code: string; category?: string; retryable?: boolean }>[];
  pagination: Readonly<{
    page?: number;
    pageSize?: number;
    cursorHash?: string;
    hasMore?: boolean;
  }>;
  provenance: Readonly<{
    model?: Readonly<{ provider?: string; name?: string; version?: string }>;
    toolCalls: readonly Readonly<{ id?: string; name?: string; version?: string }>[];
  }>;
}>;

export type XAcquisitionManifestV4Input = Readonly<{
  versions: XAcquisitionManifestV4["versions"];
  request: XAcquisitionManifestV4["request"];
  subject: XAcquisitionManifestV4["subject"];
  purpose: XAcquisitionManifestV4["purpose"];
  method: XAcquisitionManifestV4["method"];
  query: Readonly<{
    /** Accepted only as input and reduced to a digest before persistence. */
    text?: string;
    digest?: string;
    filters: Readonly<Record<string, XJsonValue>>;
    window: XAcquisitionManifestV4["query"]["window"];
  }>;
  endpoint: XAcquisitionManifestV4["endpoint"];
  evidence: XAcquisitionManifestV4["evidence"];
  resources: XAcquisitionManifestV4["resources"];
  cost: XAcquisitionManifestV4["cost"];
  errors: XAcquisitionManifestV4["errors"];
  pagination: XAcquisitionManifestV4["pagination"];
  provenance: Readonly<{
    model?: XAcquisitionManifestV4["provenance"]["model"];
    /** Compatibility input for one source call; output is always the plural form. */
    toolCall?: Readonly<{ id?: string; name?: string; version?: string }>;
    toolCalls?: readonly Readonly<{ id?: string; name?: string; version?: string }>[];
  }>;
}>;

export type XComplianceEventType =
  | "refresh"
  | "edit"
  | "deletion"
  | "protection"
  | "suspension"
  | "tombstone"
  | "takedown";

export type XComplianceEventV1 = Readonly<{
  schema: typeof X_COMPLIANCE_EVENT_V1;
  eventId: string;
  type: XComplianceEventType;
  occurredAt: string;
  subject: Readonly<{ kind: XAcquisitionSubjectKind; ids: readonly string[] }>;
  reasonCodes: readonly string[];
  manifestDigest?: string;
}>;

export type XComplianceEventV1Input = Omit<XComplianceEventV1, "schema">;

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

export type XClaimEvidenceStatus = "support" | "contrary";
export type XClaimInvalidationState = "active" | "invalidated" | "superseded";

export type XClaimLedgerSourceV1 = Readonly<{
  sourceId: string;
  status: XClaimEvidenceStatus;
  evidenceDigest: string | null;
}>;

// Claim text, confidence, and relationships are model-authored. Structural validation never derives them.
export type XClaimLedgerEntryV1 = Readonly<{
  claimId: string;
  statement: string;
  sources: readonly XClaimLedgerSourceV1[];
  asOf: string;
  confidence: number;
  limitations: readonly string[];
  invalidation: Readonly<{
    state: XClaimInvalidationState;
    at: string | null;
    reason: string | null;
  }>;
}>;

export type XClaimLedgerV1 = Readonly<{
  schema: typeof X_CLAIM_LEDGER_V1;
  ledgerId: string;
  authoredAt: string;
  methodVersion: string;
  model: Readonly<{ provider: string; name: string; version: string | null }>;
  claims: readonly XClaimLedgerEntryV1[];
}>;

export type XClaimLedgerV1Input = Omit<XClaimLedgerV1, "schema">;

/** Strict response shape owned here for model-authored claim-ledger output. */
export const X_CLAIM_LEDGER_V1_SCHEMA = {
  $id: X_CLAIM_LEDGER_V1,
  type: "object",
  additionalProperties: false,
  required: ["schema", "ledgerId", "authoredAt", "methodVersion", "model", "claims"],
  properties: {
    schema: { const: X_CLAIM_LEDGER_V1 },
    ledgerId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
    authoredAt: { type: "string", minLength: 1, maxLength: 64 },
    methodVersion: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
    model: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "name", "version"],
      properties: {
        provider: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
        name: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
        version: {
          anyOf: [
            { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
            { type: "null" },
          ],
        },
      },
    },
    claims: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CLAIMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "claimId",
          "statement",
          "sources",
          "asOf",
          "confidence",
          "limitations",
          "invalidation",
        ],
        properties: {
          claimId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
          statement: { type: "string", minLength: 1, maxLength: MAX_CLAIM_CHARS },
          sources: {
            type: "array",
            minItems: 1,
            maxItems: MAX_ARRAY_ITEMS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sourceId", "status", "evidenceDigest"],
              properties: {
                sourceId: { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
                status: { enum: ["support", "contrary"] },
                evidenceDigest: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: MAX_IDENTIFIER_CHARS },
                    { type: "null" },
                  ],
                },
              },
            },
          },
          asOf: { type: "string", minLength: 1, maxLength: 64 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          limitations: {
            type: "array",
            maxItems: MAX_CLAIM_LIMITATIONS,
            items: { type: "string", minLength: 1, maxLength: MAX_CLAIM_LIMITATION_CHARS },
          },
          invalidation: {
            type: "object",
            additionalProperties: false,
            required: ["state", "at", "reason"],
            properties: {
              state: { enum: ["active", "invalidated", "superseded"] },
              at: {
                anyOf: [{ type: "string", minLength: 1, maxLength: 64 }, { type: "null" }],
              },
              reason: {
                anyOf: [
                  { type: "string", minLength: 1, maxLength: MAX_CLAIM_LIMITATION_CHARS },
                  { type: "null" },
                ],
              },
            },
          },
        },
      },
    },
  },
} as const;

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

const FORBIDDEN_FILTER_KEYS = new Set([
  "body",
  "content",
  "posttext",
  "postbody",
  "profilebio",
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

const REDACTED_FILTER_KEYS = new Set([
  "bio",
  "description",
  "location",
  "name",
  "profile",
  "query",
  "screenname",
  "text",
  "username",
]);

const SENSITIVE_QUERY_PARAMETER =
  /^(?:access_?token|api_?key|auth|authorization|client_?secret|credential|key|password|secret|sig|signature|token)$/i;
const DIGEST = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9._-]*$/i;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertAllowedKeys(value: unknown, allowed: readonly string[], field: string): void {
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

function assertSafeInput(value: unknown, depth = 0): void {
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

function requiredString(value: unknown, field: string, max = MAX_STRING_CHARS): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return boundedString(value, field, max);
}

function optionalString(value: unknown, field: string, max = MAX_STRING_CHARS): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field, max);
}

function boundedString(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new Error(`${field} exceeds ${max} characters`);
  }
  return normalized;
}

function requiredIdentifier(value: unknown, field: string, max = MAX_IDENTIFIER_CHARS): string {
  // These values are opaque source/runtime identities. Preserve them exactly;
  // semantic restrictions here previously rejected valid model-authored method labels.
  return requiredString(value, field, max);
}

function optionalIdentifier(
  value: unknown,
  field: string,
  max = MAX_IDENTIFIER_CHARS,
): string | undefined {
  return value === undefined ? undefined : requiredIdentifier(value, field, max);
}

function requiredDigest(value: unknown, field: string): string {
  const digest = requiredString(value, field, MAX_IDENTIFIER_CHARS);
  if (!DIGEST.test(digest)) {
    throw new Error(`${field} must be an algorithm-prefixed digest`);
  }
  return digest;
}

function optionalDigest(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredDigest(value, field);
}

function requiredTimestamp(value: unknown, field: string): string {
  const timestamp = requiredString(value, field, 64);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`);
  }
  return timestamp;
}

function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function assertArtifactSize(value: object, field: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(stableJsonStringify(value), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${field} exceeds ${maxBytes} bytes`);
  }
}

function boundedInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function boundedNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function compact<T extends Record<string, unknown>>(value: T): T {
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

function normalizeManifestFilter(value: unknown, field: string, key = "", depth = 0): XJsonValue {
  if (depth > MAX_DEPTH) {
    throw new Error(`${field} exceeds the maximum nesting depth`);
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must contain finite numbers`);
    }
    return value;
  }
  if (typeof value === "string") {
    const text = requiredString(value, field, MAX_QUERY_CHARS);
    const redacted = redactSensitiveText(text, { mode: "tools" });
    if (redacted !== text) {
      return redacted;
    }
    if (REDACTED_FILTER_KEYS.has(normalizedKey(key)) || /\s/.test(text)) {
      return digestText(text);
    }
    return text;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`${field} exceeds ${MAX_ARRAY_ITEMS} items`);
    }
    return value.map((child) => normalizeManifestFilter(child, field, key, depth + 1));
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
      .map(([childKey, child]) => {
        const normalized = normalizedKey(childKey);
        if (FORBIDDEN_FILTER_KEYS.has(normalized)) {
          throw new Error(`${field} contains forbidden field: ${childKey}`);
        }
        return [
          requiredIdentifier(childKey, `${field} key`, 128),
          normalizeManifestFilter(child, field, childKey, depth + 1),
        ];
      }),
  );
}

function normalizeStringList(
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

function normalizeIdentifierList(
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

function normalizeDigestList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > MAX_ARRAY_ITEMS) {
    throw new Error(`${field} exceeds ${MAX_ARRAY_ITEMS} items`);
  }
  return Array.from(new Set(value.map((item) => requiredDigest(item, field)))).toSorted();
}

function normalizeUrl(
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

function normalizeSubject(
  value: XAcquisitionManifestV4Input["subject"],
): XAcquisitionManifestV4["subject"] {
  const kinds: readonly XAcquisitionSubjectKind[] = [
    "post",
    "profile",
    "collection",
    "query",
    "resource",
  ];
  if (!kinds.includes(value.kind)) {
    throw new Error("subject.kind is invalid");
  }
  return { kind: value.kind, ids: normalizeIdentifierList(value.ids, "subject.ids") };
}

function deepFreeze<T>(value: T): T {
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

export function createAcquisitionManifest(
  input: XAcquisitionManifestV4Input,
): XAcquisitionManifestV4 {
  assertAllowedKeys(
    input,
    [
      "versions",
      "request",
      "subject",
      "purpose",
      "method",
      "query",
      "endpoint",
      "evidence",
      "resources",
      "cost",
      "errors",
      "pagination",
      "provenance",
    ],
    "manifest",
  );
  assertAllowedKeys(
    input.versions,
    ["request", "subject", "purpose", "method", "query"],
    "versions",
  );
  assertAllowedKeys(input.request, ["id", "correlationId"], "request");
  assertAllowedKeys(input.subject, ["kind", "ids"], "subject");
  assertAllowedKeys(input.purpose, ["code"], "purpose");
  assertAllowedKeys(input.method, ["name"], "method");
  assertAllowedKeys(input.query, ["text", "digest", "filters", "window"], "query");
  assertAllowedKeys(input.query.window, ["start", "end", "limit"], "query.window");
  assertAllowedKeys(input.endpoint, ["name", "tool", "url"], "endpoint");
  assertAllowedKeys(
    input.evidence,
    ["ids", "urls", "hashes", "citations", "publicMetrics"],
    "evidence",
  );
  assertAllowedKeys(input.resources, ["requests", "bytes", "durationMs"], "resources");
  assertAllowedKeys(input.cost, ["currency", "amount", "units"], "cost");
  assertAllowedKeys(input.pagination, ["page", "pageSize", "cursorHash", "hasMore"], "pagination");
  assertAllowedKeys(input.provenance, ["model", "toolCall", "toolCalls"], "provenance");

  const filters = normalizeManifestFilter(input.query.filters, "query.filters");
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    throw new Error("query.filters must be an object");
  }
  const queryText = optionalString(input.query.text, "query.text", MAX_QUERY_CHARS);
  const suppliedQueryDigest = optionalDigest(input.query.digest, "query.digest");
  const queryDigest = queryText ? digestText(queryText) : suppliedQueryDigest;
  if (queryText && suppliedQueryDigest && suppliedQueryDigest !== queryDigest) {
    throw new Error("query.digest does not match query.text");
  }
  const citations = input.evidence.citations;
  if (citations.length > MAX_ARRAY_ITEMS) {
    throw new Error(`evidence.citations exceeds ${MAX_ARRAY_ITEMS} items`);
  }
  const publicMetricsEntries = Object.entries(input.evidence.publicMetrics);
  if (publicMetricsEntries.length > MAX_OBJECT_KEYS) {
    throw new Error(`evidence.publicMetrics exceeds ${MAX_OBJECT_KEYS} keys`);
  }
  const errors = input.errors;
  if (errors.length > MAX_ARRAY_ITEMS) {
    throw new Error(`errors exceeds ${MAX_ARRAY_ITEMS} items`);
  }
  const inputToolCalls = [
    ...(input.provenance.toolCall ? [input.provenance.toolCall] : []),
    ...(input.provenance.toolCalls ?? []),
  ];
  if (inputToolCalls.length > MAX_ARRAY_ITEMS) {
    throw new Error(`provenance.toolCalls exceeds ${MAX_ARRAY_ITEMS} items`);
  }
  const toolCalls = Array.from(
    new Map(
      inputToolCalls.map((toolCall, index) => {
        assertAllowedKeys(toolCall, ["id", "name", "version"], `provenance.toolCalls[${index}]`);
        const normalized = compact({
          id: optionalIdentifier(toolCall.id, `provenance.toolCalls[${index}].id`),
          name: optionalIdentifier(toolCall.name, `provenance.toolCalls[${index}].name`),
          version: optionalIdentifier(toolCall.version, `provenance.toolCalls[${index}].version`),
        });
        if (Object.keys(normalized).length === 0) {
          throw new Error(`provenance.toolCalls[${index}] must identify a tool call`);
        }
        return [stableJsonStringify(normalized), normalized] as const;
      }),
    ).values(),
  ).toSorted((left, right) => stableJsonStringify(left).localeCompare(stableJsonStringify(right)));
  const normalizedModel = input.provenance.model
    ? (() => {
        assertAllowedKeys(
          input.provenance.model,
          ["provider", "name", "version"],
          "provenance.model",
        );
        const model = compact({
          provider: optionalIdentifier(
            input.provenance.model.provider,
            "provenance.model.provider",
          ),
          name: optionalIdentifier(input.provenance.model.name, "provenance.model.name"),
          version: optionalIdentifier(input.provenance.model.version, "provenance.model.version"),
        });
        return Object.keys(model).length > 0 ? model : undefined;
      })()
    : undefined;
  const manifest: XAcquisitionManifestV4 = {
    schema: X_ACQUISITION_MANIFEST_V4,
    versions: {
      request: requiredIdentifier(input.versions.request, "versions.request"),
      subject: requiredIdentifier(input.versions.subject, "versions.subject"),
      purpose: requiredIdentifier(input.versions.purpose, "versions.purpose"),
      method: requiredIdentifier(input.versions.method, "versions.method"),
      query: requiredIdentifier(input.versions.query, "versions.query"),
    },
    request: compact({
      id: requiredIdentifier(input.request.id, "request.id"),
      correlationId: optionalIdentifier(input.request.correlationId, "request.correlationId"),
    }),
    subject: normalizeSubject(input.subject),
    purpose: { code: requiredIdentifier(input.purpose.code, "purpose.code") },
    method: { name: requiredIdentifier(input.method.name, "method.name") },
    query: {
      ...compact({ digest: queryDigest }),
      filters: filters as Readonly<Record<string, XJsonValue>>,
      window: compact({
        start:
          input.query.window.start === undefined
            ? undefined
            : requiredTimestamp(input.query.window.start, "query.window.start"),
        end:
          input.query.window.end === undefined
            ? undefined
            : requiredTimestamp(input.query.window.end, "query.window.end"),
        limit: boundedInteger(input.query.window.limit, "query.window.limit"),
      }),
    },
    endpoint: compact({
      name: requiredIdentifier(input.endpoint.name, "endpoint.name"),
      tool: optionalIdentifier(input.endpoint.tool, "endpoint.tool"),
      url: normalizeUrl(input.endpoint.url, "endpoint.url", { endpoint: true }),
    }),
    evidence: {
      ids: normalizeIdentifierList(input.evidence.ids, "evidence.ids"),
      urls: Array.from(
        new Set(
          input.evidence.urls.map((url) =>
            normalizeUrl(url, "evidence.urls", { xIdentitySafe: true }),
          ),
        ),
      )
        .filter((url): url is string => Boolean(url))
        .toSorted(),
      hashes: normalizeDigestList(input.evidence.hashes, "evidence.hashes"),
      citations: citations
        .map((citation, index) => {
          assertAllowedKeys(citation, ["id", "url", "hash"], `citation[${index}]`);
          const normalized = compact({
            id: optionalIdentifier(citation.id, `citation[${index}].id`),
            url: normalizeUrl(citation.url, `citation[${index}].url`, { xIdentitySafe: true }),
            hash: optionalDigest(citation.hash, `citation[${index}].hash`),
          });
          if (Object.keys(normalized).length === 0) {
            throw new Error(`citation[${index}] must contain an id, URL, or digest`);
          }
          return normalized;
        })
        .toSorted((left, right) =>
          stableJsonStringify(left).localeCompare(stableJsonStringify(right)),
        ),
      publicMetrics: Object.fromEntries(
        publicMetricsEntries
          .map(
            ([key, value]) =>
              [
                requiredIdentifier(key, "publicMetrics key", 128),
                boundedNumber(value, `publicMetrics.${key}`) ?? 0,
              ] as const,
          )
          .toSorted(([left], [right]) => left.localeCompare(right)),
      ),
    },
    resources: compact({
      requests: boundedInteger(input.resources.requests, "resources.requests"),
      bytes: boundedInteger(input.resources.bytes, "resources.bytes"),
      durationMs: boundedInteger(input.resources.durationMs, "resources.durationMs"),
    }),
    cost: compact({
      currency: optionalIdentifier(input.cost.currency, "cost.currency", 16),
      amount: boundedNumber(input.cost.amount, "cost.amount"),
      units: boundedNumber(input.cost.units, "cost.units"),
    }),
    errors: errors
      .map((error) =>
        compact({
          code: requiredIdentifier(error.code, "error.code"),
          category: optionalIdentifier(error.category, "error.category"),
          retryable: optionalBoolean(error.retryable, "error.retryable"),
        }),
      )
      .toSorted((left, right) =>
        stableJsonStringify(left).localeCompare(stableJsonStringify(right)),
      ),
    pagination: compact({
      page: boundedInteger(input.pagination.page, "pagination.page"),
      pageSize: boundedInteger(input.pagination.pageSize, "pagination.pageSize"),
      cursorHash: optionalDigest(input.pagination.cursorHash, "pagination.cursorHash"),
      hasMore: optionalBoolean(input.pagination.hasMore, "pagination.hasMore"),
    }),
    provenance: { ...compact({ model: normalizedModel }), toolCalls },
  };
  assertArtifactSize(manifest, "acquisition manifest", X_MAX_EVIDENCE_ARTIFACT_BYTES);
  return deepFreeze(manifest);
}

export function createComplianceEvent(input: XComplianceEventV1Input): XComplianceEventV1 {
  assertSafeInput(input);
  assertAllowedKeys(
    input,
    ["eventId", "type", "occurredAt", "subject", "reasonCodes", "manifestDigest"],
    "compliance event",
  );
  const types: readonly XComplianceEventType[] = [
    "refresh",
    "edit",
    "deletion",
    "protection",
    "suspension",
    "tombstone",
    "takedown",
  ];
  if (!types.includes(input.type)) {
    throw new Error("compliance event type is invalid");
  }
  const event: XComplianceEventV1 = {
    schema: X_COMPLIANCE_EVENT_V1,
    eventId: requiredIdentifier(input.eventId, "eventId"),
    type: input.type,
    occurredAt: requiredTimestamp(input.occurredAt, "occurredAt"),
    subject: normalizeSubject(input.subject),
    reasonCodes: normalizeIdentifierList(input.reasonCodes, "reasonCodes", 16),
    ...compact({ manifestDigest: optionalDigest(input.manifestDigest, "manifestDigest") }),
  };
  assertArtifactSize(event, "compliance event", X_MAX_COMPLIANCE_EVENT_BYTES);
  return deepFreeze(event);
}

export function createClaimLedger(input: XClaimLedgerV1Input): XClaimLedgerV1 {
  assertSafeInput(input);
  assertAllowedKeys(
    input,
    ["ledgerId", "authoredAt", "methodVersion", "model", "claims"],
    "claim ledger",
  );
  assertAllowedKeys(input.model, ["provider", "name", "version"], "claim ledger model");
  if (!Array.isArray(input.claims) || input.claims.length < 1 || input.claims.length > MAX_CLAIMS) {
    throw new Error(`claims must contain between 1 and ${MAX_CLAIMS} items`);
  }

  const claimIds = new Set<string>();
  const claims = input.claims.map((claim, claimIndex) => {
    assertAllowedKeys(
      claim,
      ["claimId", "statement", "sources", "asOf", "confidence", "limitations", "invalidation"],
      `claims[${claimIndex}]`,
    );
    const claimId = requiredIdentifier(claim.claimId, `claims[${claimIndex}].claimId`);
    if (claimIds.has(claimId)) {
      throw new Error(`claims contains duplicate claimId: ${claimId}`);
    }
    claimIds.add(claimId);
    if (
      !Array.isArray(claim.sources) ||
      claim.sources.length < 1 ||
      claim.sources.length > MAX_ARRAY_ITEMS
    ) {
      throw new Error(
        `claims[${claimIndex}].sources must contain between 1 and ${MAX_ARRAY_ITEMS} items`,
      );
    }
    const sourceIds = new Set<string>();
    const sources = claim.sources.map((source: XClaimLedgerSourceV1, sourceIndex: number) => {
      assertAllowedKeys(
        source,
        ["sourceId", "status", "evidenceDigest"],
        `claims[${claimIndex}].sources[${sourceIndex}]`,
      );
      const sourceId = requiredIdentifier(
        source.sourceId,
        `claims[${claimIndex}].sources[${sourceIndex}].sourceId`,
      );
      if (sourceIds.has(sourceId)) {
        throw new Error(`claims[${claimIndex}].sources contains duplicate sourceId: ${sourceId}`);
      }
      sourceIds.add(sourceId);
      if (source.status !== "support" && source.status !== "contrary") {
        throw new Error(`claims[${claimIndex}].sources[${sourceIndex}].status is invalid`);
      }
      return {
        sourceId,
        status: source.status,
        evidenceDigest:
          source.evidenceDigest === null
            ? null
            : requiredDigest(
                source.evidenceDigest,
                `claims[${claimIndex}].sources[${sourceIndex}].evidenceDigest`,
              ),
      };
    });

    if (typeof claim.confidence !== "number" || !Number.isFinite(claim.confidence)) {
      throw new Error(`claims[${claimIndex}].confidence must be a finite number`);
    }
    if (claim.confidence < 0 || claim.confidence > 1) {
      throw new Error(`claims[${claimIndex}].confidence must be between 0 and 1`);
    }
    const limitations = normalizeStringList(
      claim.limitations,
      `claims[${claimIndex}].limitations`,
      MAX_CLAIM_LIMITATIONS,
    ).map((limitation) =>
      boundedString(limitation, `claims[${claimIndex}].limitations`, MAX_CLAIM_LIMITATION_CHARS),
    );
    assertAllowedKeys(
      claim.invalidation,
      ["state", "at", "reason"],
      `claims[${claimIndex}].invalidation`,
    );
    const invalidationState = claim.invalidation.state;
    if (!(["active", "invalidated", "superseded"] as const).includes(invalidationState)) {
      throw new Error(`claims[${claimIndex}].invalidation.state is invalid`);
    }
    const invalidationAt =
      claim.invalidation.at === null
        ? null
        : requiredTimestamp(claim.invalidation.at, `claims[${claimIndex}].invalidation.at`);
    const invalidationReason =
      claim.invalidation.reason === null
        ? null
        : requiredString(
            claim.invalidation.reason,
            `claims[${claimIndex}].invalidation.reason`,
            MAX_CLAIM_LIMITATION_CHARS,
          );
    if (
      invalidationState === "active" &&
      (invalidationAt !== null || invalidationReason !== null)
    ) {
      throw new Error(`claims[${claimIndex}] active invalidation must not include at or reason`);
    }
    if (
      invalidationState !== "active" &&
      (invalidationAt === null || invalidationReason === null)
    ) {
      throw new Error(`claims[${claimIndex}] inactive claim requires invalidation at and reason`);
    }

    return {
      claimId,
      statement: requiredString(
        claim.statement,
        `claims[${claimIndex}].statement`,
        MAX_CLAIM_CHARS,
      ),
      sources,
      asOf: requiredTimestamp(claim.asOf, `claims[${claimIndex}].asOf`),
      confidence: claim.confidence,
      limitations,
      invalidation: {
        state: invalidationState,
        at: invalidationAt,
        reason: invalidationReason,
      },
    };
  });

  const ledger: XClaimLedgerV1 = {
    schema: X_CLAIM_LEDGER_V1,
    ledgerId: requiredIdentifier(input.ledgerId, "ledgerId"),
    authoredAt: requiredTimestamp(input.authoredAt, "authoredAt"),
    methodVersion: requiredIdentifier(input.methodVersion, "methodVersion"),
    model: {
      provider: requiredIdentifier(input.model.provider, "model.provider"),
      name: requiredIdentifier(input.model.name, "model.name"),
      version:
        input.model.version === null
          ? null
          : requiredIdentifier(input.model.version, "model.version"),
    },
    claims,
  };
  assertArtifactSize(ledger, "claim ledger", X_MAX_CLAIM_LEDGER_BYTES);
  return deepFreeze(ledger);
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
