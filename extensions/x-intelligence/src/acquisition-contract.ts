import { redactSensitiveText } from "openclaw/plugin-sdk/logging-core";
import {
  MAX_ARRAY_ITEMS,
  MAX_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_QUERY_CHARS,
  assertAllowedKeys,
  assertArtifactSize,
  boundedInteger,
  boundedNumber,
  compact,
  deepFreeze,
  digestText,
  normalizeDigestList,
  normalizeIdentifierList,
  normalizeUrl,
  normalizedKey,
  optionalBoolean,
  optionalDigest,
  optionalIdentifier,
  optionalString,
  requiredIdentifier,
  requiredString,
  requiredTimestamp,
  stableJsonStringify,
  type XJsonValue,
} from "./contract-helpers.js";

export const X_ACQUISITION_MANIFEST_V4 = "x_acquisition_manifest.v4" as const;
export const X_MAX_EVIDENCE_ARTIFACT_BYTES = 256 * 1024;

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
  resources: Readonly<{
    requests?: number;
    retries?: number;
    retryDelayMs?: number;
    bytes?: number;
    durationMs?: number;
  }>;
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

export function normalizeAcquisitionSubject(
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
  assertAllowedKeys(
    input.resources,
    ["requests", "retries", "retryDelayMs", "bytes", "durationMs"],
    "resources",
  );
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
    subject: normalizeAcquisitionSubject(input.subject),
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
      retries: boundedInteger(input.resources.retries, "resources.retries"),
      retryDelayMs: boundedInteger(input.resources.retryDelayMs, "resources.retryDelayMs"),
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
