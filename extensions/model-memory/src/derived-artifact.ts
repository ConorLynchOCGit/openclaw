import fs from "node:fs/promises";
import path from "node:path";
import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { sha256JsonValue } from "./hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "./source-authority.ts";

export const DERIVED_ARTIFACT_CORE_SCHEMA_VERSION = "derived_artifact_core.v1" as const;

export type DerivedArtifactFamily =
  | "projection"
  | "capsule"
  | "runtime_graph"
  | "maintenance_report"
  | "retrieval_pack"
  | "context_artifact";

export type DerivedArtifactRole =
  | "workspace_bootstrap"
  | "read_model"
  | "operator_report"
  | "generation_context"
  | "runtime_diagnostic"
  | "retrieval_context";

export type DerivedArtifactFreshness = {
  status: "fresh" | "stale";
  reason?: string | null;
};

export type DerivedArtifactSourceRef = {
  sourceId: string;
  segmentId?: string;
  sourceType?: string;
  sourceIngestEventId?: string;
  contentHash?: string;
};

export type DerivedArtifactPaths = {
  markdownPath?: string;
  jsonPath?: string;
  digestPath?: string;
};

export type DerivedArtifactLifecycleExclusionReason =
  | "inactive"
  | "superseded"
  | "deleted"
  | "quarantined"
  | "provisional"
  | "conflict_hold"
  | "expired"
  | "stale"
  | "inspection_only";

export type DerivedArtifactSourceMetadata = {
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
};

export type DerivedArtifactRolePolicy = {
  family: DerivedArtifactFamily;
  artifactType: string;
  roles: DerivedArtifactRole[];
  generationContextAuthority: "primary" | "not_authority" | "thin_renderer_only";
  notes: string[];
};

export type DerivedArtifactEnvelope = {
  schemaVersion: typeof DERIVED_ARTIFACT_CORE_SCHEMA_VERSION;
  artifactId: string;
  family: DerivedArtifactFamily;
  artifactType: string;
  roles: DerivedArtifactRole[];
  targetId?: string;
  scopeKey?: string;
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  contentHash: string;
  derivationHash?: string;
  compiledAt: string;
  freshness: DerivedArtifactFreshness;
  staleMarkers: string[];
  conflictMarkers: string[];
  lifecycleExclusionReasons: DerivedArtifactLifecycleExclusionReason[];
  artifactPaths: DerivedArtifactPaths;
};

export type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

const PROHIBITED_DERIVED_ARTIFACT_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

export const DERIVED_ARTIFACT_ROLE_POLICIES = [
  {
    family: "capsule",
    artifactType: "project_state",
    roles: ["generation_context", "operator_report"],
    generationContextAuthority: "primary",
    notes: ["Owns rich project-state generation/context compilation for broad project prompts."],
  },
  {
    family: "projection",
    artifactType: "project_page",
    roles: ["read_model", "operator_report", "workspace_bootstrap"],
    generationContextAuthority: "thin_renderer_only",
    notes: [
      "Not an independent rich project-state compiler when a project_state capsule is available.",
    ],
  },
] as const satisfies readonly DerivedArtifactRolePolicy[];

export function getDerivedArtifactRolePolicy(input: {
  family: DerivedArtifactFamily;
  artifactType: string;
}): DerivedArtifactRolePolicy {
  const policy = DERIVED_ARTIFACT_ROLE_POLICIES.find(
    (entry) => entry.family === input.family && entry.artifactType === input.artifactType,
  );
  if (policy) {
    return {
      family: policy.family,
      artifactType: policy.artifactType,
      roles: [...policy.roles],
      generationContextAuthority: policy.generationContextAuthority,
      notes: [...policy.notes],
    };
  }
  return {
    family: input.family,
    artifactType: input.artifactType,
    roles:
      input.family === "capsule"
        ? ["generation_context", "operator_report"]
        : ["read_model", "operator_report"],
    generationContextAuthority: input.family === "capsule" ? "primary" : "not_authority",
    notes: ["Default derived artifact role policy."],
  };
}

export function isDerivedArtifactGenerationContextAuthority(input: {
  family: DerivedArtifactFamily;
  artifactType: string;
  richerCapsuleAvailable?: boolean;
}): boolean {
  const policy = getDerivedArtifactRolePolicy(input);
  if (
    input.family === "projection" &&
    input.artifactType === "project_page" &&
    input.richerCapsuleAvailable
  ) {
    return false;
  }
  return policy.generationContextAuthority === "primary";
}

export function buildDerivedArtifactId(input: {
  family: DerivedArtifactFamily;
  artifactType: string;
  targetId?: string;
  scopeKey?: string;
  seed?: unknown;
}): string {
  return buildDeterministicUuid(
    "derived-artifact",
    JSON.stringify({
      family: input.family,
      artifactType: input.artifactType,
      targetId: input.targetId ?? null,
      scopeKey: input.scopeKey ?? null,
      seed: input.seed ?? null,
    }),
  );
}

export function hashDerivedArtifactValue(value: unknown): string {
  return sha256JsonValue(value);
}

export function uniqueSortedStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].toSorted();
}

export function uniqueSortedDefined<T extends string>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].toSorted();
}

export function dedupeDerivedSourceRefs(
  sourceRefs: Array<DerivedArtifactSourceRef | undefined>,
): DerivedArtifactSourceRef[] {
  const byKey = new Map<string, DerivedArtifactSourceRef>();
  for (const sourceRef of sourceRefs) {
    if (!sourceRef?.sourceId) {
      continue;
    }
    const key = hashDerivedArtifactValue(sourceRef);
    if (!byKey.has(key)) {
      byKey.set(key, { ...sourceRef });
    }
  }
  return [...byKey.values()].toSorted((left, right) =>
    `${left.sourceId}:${left.segmentId ?? ""}`.localeCompare(
      `${right.sourceId}:${right.segmentId ?? ""}`,
    ),
  );
}

export function aggregateDerivedSourceMetadata(
  entries: Array<{
    sourceMemoryIds?: string[];
    sourceEventIds?: string[];
    sourceEdgeIds?: string[];
    sourceRefs?: DerivedArtifactSourceRef[];
    authorityTier?: SourceAuthorityTier;
    authorityTiers?: SourceAuthorityTier[];
    sourceProfileId?: SourceProfileId;
    sourceProfileIds?: SourceProfileId[];
  }>,
): DerivedArtifactSourceMetadata {
  return {
    sourceMemoryIds: uniqueSortedStrings(entries.flatMap((entry) => entry.sourceMemoryIds ?? [])),
    sourceEventIds: uniqueSortedStrings(entries.flatMap((entry) => entry.sourceEventIds ?? [])),
    sourceEdgeIds: uniqueSortedStrings(entries.flatMap((entry) => entry.sourceEdgeIds ?? [])),
    sourceRefs: dedupeDerivedSourceRefs(entries.flatMap((entry) => entry.sourceRefs ?? [])),
    authorityTiers: uniqueSortedDefined(
      entries.flatMap((entry) => [entry.authorityTier, ...(entry.authorityTiers ?? [])]),
    ),
    sourceProfileIds: uniqueSortedDefined(
      entries.flatMap((entry) => [entry.sourceProfileId, ...(entry.sourceProfileIds ?? [])]),
    ),
  };
}

export function buildDerivedFreshness(input: {
  staleMarkers?: string[];
  reasonWhenStale?: string;
  freshReason?: string | null;
}): DerivedArtifactFreshness {
  if ((input.staleMarkers ?? []).length > 0) {
    return {
      status: "stale",
      reason: input.reasonWhenStale ?? uniqueSortedStrings(input.staleMarkers ?? []).join(","),
    };
  }
  return { status: "fresh", reason: input.freshReason ?? undefined };
}

export function buildDerivedConflictMarkers(values: Array<string | null | undefined>): string[] {
  return uniqueSortedStrings(values);
}

export function buildDerivedStaleMarkers(values: Array<string | null | undefined>): string[] {
  return uniqueSortedStrings(values);
}

export function deriveLifecycleExclusion(input: {
  lifecycleState?: string | null;
  status?: string | null;
  invalidAt?: string | null;
  authorityTier?: SourceAuthorityTier;
  now?: Date;
}): DerivedArtifactLifecycleExclusionReason | undefined {
  if (input.authorityTier === "inspection_only") {
    return "inspection_only";
  }
  const state = input.lifecycleState ?? input.status;
  if (
    state === "inactive" ||
    state === "superseded" ||
    state === "deleted" ||
    state === "quarantined" ||
    state === "provisional" ||
    state === "conflict_hold" ||
    state === "expired"
  ) {
    return state;
  }
  if (state === "stale") {
    return "stale";
  }
  if (
    typeof input.invalidAt === "string" &&
    Date.parse(input.invalidAt) <= (input.now ?? new Date()).getTime()
  ) {
    return "stale";
  }
  return undefined;
}

export function normalizeDerivedArtifactFileId(
  value: string,
  fallback = "derived-artifact",
): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || fallback;
}

export function normalizeDerivedArtifactRelativePath(input: {
  relativePath: string;
  allowedPrefixes: string[];
  allowedExtensions: string[];
}): string {
  const normalized = input.relativePath.replaceAll("\\", "/").replace(/^\/+/u, "");
  const hasAllowedPrefix = input.allowedPrefixes.some((prefix) => normalized.startsWith(prefix));
  const hasAllowedExtension = input.allowedExtensions.some((extension) =>
    normalized.endsWith(extension),
  );
  if (normalized.includes("..") || !hasAllowedPrefix || !hasAllowedExtension) {
    throw new Error(`unsafe derived artifact path: ${input.relativePath}`);
  }
  return normalized;
}

function assertNoProhibitedDerivedArtifactFields(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoProhibitedDerivedArtifactFields(entry, [...pathParts, String(index)]),
    );
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_DERIVED_ARTIFACT_KEYS.has(key)) {
      throw new Error(`unsafe derived artifact field: ${[...pathParts, key].join(".")}`);
    }
    assertNoProhibitedDerivedArtifactFields(nested, [...pathParts, key]);
  }
}

export function cloneJsonLike<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeBoundedDerivedJsonArtifact(input: {
  artifactDir: string;
  artifactId: string;
  suffix: string;
  value: unknown;
  maxBytes?: number;
  fallbackFileId?: string;
}): Promise<{ path: string; contentHash: string; byteLength: number }> {
  assertNoProhibitedDerivedArtifactFields(input.value);
  const artifactId = normalizeDerivedArtifactFileId(input.artifactId, input.fallbackFileId);
  const suffix = normalizeDerivedArtifactFileId(input.suffix, "artifact");
  const artifactPath = path.join(input.artifactDir, `${artifactId}.${suffix}.json`);
  const serialized = `${JSON.stringify(input.value, null, 2)}\n`;
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > (input.maxBytes ?? 512 * 1024)) {
    throw new Error(`derived artifact exceeds byte limit: ${byteLength}`);
  }
  await atomicWriteFile(artifactPath, serialized);
  return {
    path: artifactPath,
    contentHash: hashDerivedArtifactValue(serialized),
    byteLength,
  };
}
