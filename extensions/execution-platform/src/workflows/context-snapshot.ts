import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

export const CONTEXT_SNAPSHOT_SOURCE_KINDS = [
  "source_prompt_index",
  "source_prompt_excerpt",
  "mission_ledger",
  "commitment_work_packet",
  "context_scout_handoff",
  "context_synthesis",
  "file_snapshot",
  "repo_search_result",
  "validation_result",
  "boundary_replay_checkpoint",
  "memory_context_pack",
] as const;

export const CONTEXT_SNAPSHOT_FRESHNESS_STATUSES = [
  "fresh",
  "stale",
  "missing",
  "rejected",
  "unknown",
] as const;

export const CONTEXT_SNAPSHOT_REFRESH_ACTIONS = [
  "none",
  "request_excerpt",
  "rerun_context_scout",
  "rerun_context_synthesis",
  "refresh_replay_checkpoint",
  "block_implementation",
  "ask_human",
] as const;

export const ContextSnapshotRefSchema = z
  .object({
    artifactKind: z.literal("context_snapshot_ref"),
    schemaVersion: z.literal("execution-platform.context-snapshot-ref.v1"),
    snapshotRef: boundedString(320),
    sourceRef: boundedString(320),
    sourceKind: z.enum(CONTEXT_SNAPSHOT_SOURCE_KINDS),
    capturedAt: boundedString(80),
    repoRevision: z.string().max(160).nullable(),
    worktreeFingerprint: z.string().max(160).nullable(),
    sourcePromptHash: z.string().max(120).nullable(),
    sourcePayloadHash: z.string().max(120).nullable(),
    runtimeJobId: z.string().max(180).nullable(),
    workflowId: z.string().max(180).nullable(),
    graphId: z.string().max(180).nullable(),
    nodeId: z.string().max(180).nullable(),
    commitmentIds: stringList(60, 180),
    targetRefs: stringList(80, 260),
    scopeSummary: z.string().max(900),
    stalenessPolicy: z.string().max(500),
    expiresAt: z.string().max(80).nullable(),
    maxAgeMs: z.number().int().positive().nullable(),
    freshnessStatus: z.enum(CONTEXT_SNAPSHOT_FRESHNESS_STATUSES),
    refreshRequired: z.boolean(),
    refreshAction: z.enum(CONTEXT_SNAPSHOT_REFRESH_ACTIONS),
    reasonCodes: stringList(40, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
  })
  .strict();

export type ContextSnapshotRef = z.infer<typeof ContextSnapshotRefSchema>;
export type ContextSnapshotSourceKind = (typeof CONTEXT_SNAPSHOT_SOURCE_KINDS)[number];
export type ContextSnapshotFreshnessStatus = (typeof CONTEXT_SNAPSHOT_FRESHNESS_STATUSES)[number];
export type ContextSnapshotRefreshAction = (typeof CONTEXT_SNAPSHOT_REFRESH_ACTIONS)[number];

export type ContextSnapshotFreshnessValidation = {
  valid: boolean;
  freshnessStatus: ContextSnapshotFreshnessStatus;
  requiredRefreshAction: ContextSnapshotRefreshAction;
  freshRefs: string[];
  staleRefs: string[];
  missingRefs: string[];
  rejectedRefs: string[];
  unknownRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bounded(value: string | null | undefined, max = 260): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function unique(values: Array<string | null | undefined>, max = 40, maxChars = 260): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, maxChars))
    .slice(0, max);
}

function nowIso(value?: string | Date | null): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

function snapshotId(input: {
  sourceKind: ContextSnapshotSourceKind;
  sourceRef: string;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  repoRevision?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
}): string {
  return sha256(
    JSON.stringify({
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      sourcePromptHash: input.sourcePromptHash ?? null,
      sourcePayloadHash: input.sourcePayloadHash ?? null,
      repoRevision: input.repoRevision ?? null,
      graphId: input.graphId ?? null,
      nodeId: input.nodeId ?? null,
    }),
  ).slice(0, 24);
}

export function createContextSnapshotRef(input: {
  sourceRef: string;
  sourceKind: ContextSnapshotSourceKind;
  capturedAt?: string | Date | null;
  repoRevision?: string | null;
  worktreeFingerprint?: string | null;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  commitmentIds?: string[];
  targetRefs?: string[];
  scopeSummary?: string | null;
  stalenessPolicy?: string | null;
  expiresAt?: string | null;
  maxAgeMs?: number | null;
  freshnessStatus?: ContextSnapshotFreshnessStatus;
  refreshRequired?: boolean;
  refreshAction?: ContextSnapshotRefreshAction;
  reasonCodes?: string[];
}): ContextSnapshotRef {
  const capturedAt = nowIso(input.capturedAt);
  const freshnessStatus = input.freshnessStatus ?? "fresh";
  const refreshRequired =
    input.refreshRequired ??
    (freshnessStatus === "stale" ||
      freshnessStatus === "missing" ||
      freshnessStatus === "rejected" ||
      freshnessStatus === "unknown");
  const refreshAction =
    input.refreshAction ??
    (refreshRequired
      ? input.sourceKind === "source_prompt_excerpt"
        ? "request_excerpt"
        : input.sourceKind === "context_scout_handoff"
          ? "rerun_context_scout"
          : input.sourceKind === "context_synthesis"
            ? "rerun_context_synthesis"
            : input.sourceKind === "boundary_replay_checkpoint"
              ? "refresh_replay_checkpoint"
              : "block_implementation"
      : "none");
  const id = snapshotId({
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    sourcePromptHash: input.sourcePromptHash,
    sourcePayloadHash: input.sourcePayloadHash,
    repoRevision: input.repoRevision,
    graphId: input.graphId,
    nodeId: input.nodeId,
  });
  return ContextSnapshotRefSchema.parse({
    artifactKind: "context_snapshot_ref",
    schemaVersion: "execution-platform.context-snapshot-ref.v1",
    snapshotRef: `context-snapshot://${input.sourceKind}/${id}`,
    sourceRef: bounded(input.sourceRef, 320),
    sourceKind: input.sourceKind,
    capturedAt,
    repoRevision: input.repoRevision ? bounded(input.repoRevision, 160) : null,
    worktreeFingerprint: input.worktreeFingerprint ? bounded(input.worktreeFingerprint, 160) : null,
    sourcePromptHash: input.sourcePromptHash ? bounded(input.sourcePromptHash, 120) : null,
    sourcePayloadHash: input.sourcePayloadHash ? bounded(input.sourcePayloadHash, 120) : null,
    runtimeJobId: input.runtimeJobId ? bounded(input.runtimeJobId, 180) : null,
    workflowId: input.workflowId ? bounded(input.workflowId, 180) : null,
    graphId: input.graphId ? bounded(input.graphId, 180) : null,
    nodeId: input.nodeId ? bounded(input.nodeId, 180) : null,
    commitmentIds: unique(input.commitmentIds ?? [], 60, 180),
    targetRefs: unique(input.targetRefs ?? [], 80),
    scopeSummary: bounded(input.scopeSummary, 900),
    stalenessPolicy: bounded(
      input.stalenessPolicy ??
        "Fresh when source refs, prompt hash, payload hash, and repo revision match the current runtime boundary.",
      500,
    ),
    expiresAt: input.expiresAt ? bounded(input.expiresAt, 80) : null,
    maxAgeMs: input.maxAgeMs ?? null,
    freshnessStatus,
    refreshRequired,
    refreshAction,
    reasonCodes: unique(input.reasonCodes ?? [`context_snapshot_${freshnessStatus}`], 40, 180),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  });
}

export function summarizeContextSnapshotRef(ref: ContextSnapshotRef): JsonValue {
  return {
    snapshotRef: ref.snapshotRef,
    sourceRef: ref.sourceRef,
    sourceKind: ref.sourceKind,
    capturedAt: ref.capturedAt,
    repoRevision: ref.repoRevision,
    worktreeFingerprint: ref.worktreeFingerprint,
    sourcePromptHash: ref.sourcePromptHash,
    sourcePayloadHash: ref.sourcePayloadHash,
    runtimeJobId: ref.runtimeJobId,
    workflowId: ref.workflowId,
    graphId: ref.graphId,
    nodeId: ref.nodeId,
    commitmentIds: ref.commitmentIds,
    targetRefs: ref.targetRefs.slice(0, 20),
    scopeSummary: ref.scopeSummary,
    freshnessStatus: ref.freshnessStatus,
    refreshRequired: ref.refreshRequired,
    refreshAction: ref.refreshAction,
    reasonCodes: ref.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  } satisfies JsonValue;
}

export function normalizeContextSnapshotRefs(value: unknown): ContextSnapshotRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ContextSnapshotRefSchema.safeParse(item))
    .filter((result): result is z.ZodSafeParseSuccess<ContextSnapshotRef> => result.success)
    .map((result) => result.data)
    .slice(0, 120);
}

export function mergeContextSnapshotRefs(...groups: ContextSnapshotRef[][]): ContextSnapshotRef[] {
  const byRef = new Map<string, ContextSnapshotRef>();
  for (const ref of groups.flat()) {
    byRef.set(ref.snapshotRef, ref);
  }
  return [...byRef.values()].slice(0, 120);
}

export function partitionContextSnapshotRefs(refs: ContextSnapshotRef[]): {
  freshRefs: ContextSnapshotRef[];
  staleRefs: ContextSnapshotRef[];
  missingRefs: ContextSnapshotRef[];
  rejectedRefs: ContextSnapshotRef[];
  unknownRefs: ContextSnapshotRef[];
} {
  return {
    freshRefs: refs.filter((ref) => ref.freshnessStatus === "fresh"),
    staleRefs: refs.filter((ref) => ref.freshnessStatus === "stale"),
    missingRefs: refs.filter((ref) => ref.freshnessStatus === "missing"),
    rejectedRefs: refs.filter((ref) => ref.freshnessStatus === "rejected"),
    unknownRefs: refs.filter((ref) => ref.freshnessStatus === "unknown"),
  };
}

export function validateContextSnapshotFreshness(input: {
  requiredRefs?: ContextSnapshotRef[];
  providedRefs?: ContextSnapshotRef[];
  requiredSourceKinds?: ContextSnapshotSourceKind[];
  currentRepoRevision?: string | null;
  currentWorktreeFingerprint?: string | null;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  now?: string | Date | null;
}): ContextSnapshotFreshnessValidation {
  const providedRefs = mergeContextSnapshotRefs(input.providedRefs ?? []);
  const requiredRefs = mergeContextSnapshotRefs(input.requiredRefs ?? []);
  const refs = mergeContextSnapshotRefs(requiredRefs, providedRefs);
  const reasonCodes: string[] = [];
  const nowMs = Date.parse(nowIso(input.now));
  if (requiredRefs.length > 0 && providedRefs.length === 0) {
    reasonCodes.push("context_snapshot_required_refs_missing");
  }
  for (const requiredKind of input.requiredSourceKinds ?? []) {
    if (!refs.some((ref) => ref.sourceKind === requiredKind)) {
      reasonCodes.push(`context_snapshot_required_source_kind_missing:${requiredKind}`);
    }
  }
  const staleRefs = new Set<string>();
  const missingRefs = new Set<string>();
  const rejectedRefs = new Set<string>();
  const unknownRefs = new Set<string>();
  for (const ref of refs) {
    if (ref.freshnessStatus === "missing") {
      missingRefs.add(ref.snapshotRef);
    }
    if (ref.freshnessStatus === "rejected") {
      rejectedRefs.add(ref.snapshotRef);
    }
    if (ref.freshnessStatus === "unknown") {
      unknownRefs.add(ref.snapshotRef);
    }
    if (ref.freshnessStatus === "stale") {
      staleRefs.add(ref.snapshotRef);
    }
    if (
      input.currentRepoRevision &&
      ref.repoRevision &&
      ref.repoRevision !== input.currentRepoRevision
    ) {
      staleRefs.add(ref.snapshotRef);
      reasonCodes.push(`context_snapshot_repo_revision_mismatch:${ref.snapshotRef}`);
    }
    if (
      input.currentWorktreeFingerprint &&
      ref.worktreeFingerprint &&
      ref.worktreeFingerprint !== input.currentWorktreeFingerprint
    ) {
      staleRefs.add(ref.snapshotRef);
      reasonCodes.push(`context_snapshot_worktree_fingerprint_mismatch:${ref.snapshotRef}`);
    }
    if (
      input.sourcePromptHash &&
      ref.sourcePromptHash &&
      ref.sourcePromptHash !== input.sourcePromptHash
    ) {
      staleRefs.add(ref.snapshotRef);
      reasonCodes.push(`context_snapshot_source_prompt_hash_mismatch:${ref.snapshotRef}`);
    }
    if (
      input.sourcePayloadHash &&
      ref.sourcePayloadHash &&
      ref.sourcePayloadHash !== input.sourcePayloadHash
    ) {
      staleRefs.add(ref.snapshotRef);
      reasonCodes.push(`context_snapshot_source_payload_hash_mismatch:${ref.snapshotRef}`);
    }
    if (ref.expiresAt && Date.parse(ref.expiresAt) <= nowMs) {
      staleRefs.add(ref.snapshotRef);
      reasonCodes.push(`context_snapshot_expired:${ref.snapshotRef}`);
    }
    if (ref.maxAgeMs && Number.isFinite(ref.maxAgeMs)) {
      const capturedAtMs = Date.parse(ref.capturedAt);
      if (Number.isFinite(capturedAtMs) && nowMs - capturedAtMs > ref.maxAgeMs) {
        staleRefs.add(ref.snapshotRef);
        reasonCodes.push(`context_snapshot_max_age_exceeded:${ref.snapshotRef}`);
      }
    }
  }
  if (refs.length === 0) {
    reasonCodes.push("context_snapshot_refs_missing");
    missingRefs.add("context-snapshot://missing/context");
  }
  const partitioned = partitionContextSnapshotRefs(refs);
  for (const ref of partitioned.staleRefs) {
    staleRefs.add(ref.snapshotRef);
  }
  for (const ref of partitioned.missingRefs) {
    missingRefs.add(ref.snapshotRef);
  }
  for (const ref of partitioned.rejectedRefs) {
    rejectedRefs.add(ref.snapshotRef);
  }
  for (const ref of partitioned.unknownRefs) {
    unknownRefs.add(ref.snapshotRef);
  }
  const requiredRefreshAction: ContextSnapshotRefreshAction =
    missingRefs.size > 0 || unknownRefs.size > 0
      ? "block_implementation"
      : rejectedRefs.size > 0
        ? "ask_human"
        : staleRefs.size > 0
          ? "refresh_replay_checkpoint"
          : "none";
  const freshnessStatus: ContextSnapshotFreshnessStatus =
    missingRefs.size > 0
      ? "missing"
      : rejectedRefs.size > 0
        ? "rejected"
        : staleRefs.size > 0
          ? "stale"
          : unknownRefs.size > 0
            ? "unknown"
            : "fresh";
  const valid = freshnessStatus === "fresh" && reasonCodes.length === 0;
  return {
    valid,
    freshnessStatus,
    requiredRefreshAction,
    freshRefs: refs
      .filter((ref) => ref.freshnessStatus === "fresh" && !staleRefs.has(ref.snapshotRef))
      .map((ref) => ref.snapshotRef)
      .slice(0, 80),
    staleRefs: [...staleRefs].slice(0, 80),
    missingRefs: [...missingRefs].slice(0, 80),
    rejectedRefs: [...rejectedRefs].slice(0, 80),
    unknownRefs: [...unknownRefs].slice(0, 80),
    reasonCodes: unique(
      [
        ...reasonCodes,
        valid ? "context_snapshot_freshness_valid" : `context_snapshot_${freshnessStatus}`,
      ],
      80,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function deriveContextSnapshotRefsFromSourcePromptIndex(input: {
  sourceRef: string;
  promptHash: string;
  promptLength: number;
  sectionRefs?: string[];
  capturedAt?: string | Date | null;
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
}): ContextSnapshotRef[] {
  const indexSnapshot = createContextSnapshotRef({
    sourceRef: input.sourceRef,
    sourceKind: "source_prompt_index",
    capturedAt: input.capturedAt,
    sourcePromptHash: input.promptHash,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    scopeSummary: `Source prompt index for ${input.promptLength} characters.`,
    targetRefs: input.sectionRefs ?? [],
    reasonCodes: ["context_snapshot_source_prompt_index"],
  });
  return [
    indexSnapshot,
    ...(input.sectionRefs ?? []).map((sectionRef) =>
      createContextSnapshotRef({
        sourceRef: sectionRef,
        sourceKind: "source_prompt_excerpt",
        capturedAt: input.capturedAt,
        sourcePromptHash: input.promptHash,
        runtimeJobId: input.runtimeJobId,
        workflowId: input.workflowId,
        graphId: input.graphId,
        scopeSummary: "Bounded source prompt section ref.",
        reasonCodes: ["context_snapshot_source_prompt_section"],
      }),
    ),
  ].slice(0, 80);
}

export function deriveContextSnapshotRefsFromArtifactRefs(input: {
  artifactRefs: string[];
  sourceKind: ContextSnapshotSourceKind;
  capturedAt?: string | Date | null;
  repoRevision?: string | null;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  commitmentIds?: string[];
  scopeSummary?: string | null;
}): ContextSnapshotRef[] {
  return unique(input.artifactRefs, 80).map((sourceRef) =>
    createContextSnapshotRef({
      sourceRef,
      sourceKind: input.sourceKind,
      capturedAt: input.capturedAt,
      repoRevision: input.repoRevision,
      sourcePromptHash: input.sourcePromptHash,
      sourcePayloadHash: input.sourcePayloadHash,
      runtimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      nodeId: input.nodeId,
      commitmentIds: input.commitmentIds ?? [],
      scopeSummary: input.scopeSummary ?? `Bounded ${input.sourceKind} context ref.`,
      reasonCodes: [`context_snapshot_${input.sourceKind}`],
    }),
  );
}
