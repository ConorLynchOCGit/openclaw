import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ContextSnapshotRef } from "./context-snapshot.ts";
import type { EvidenceMode, ExecutionIntent } from "./execution-intent.ts";
import {
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskFileSnapshot,
  type ImplementationTaskFileChangeIntent,
  type ImplementationTaskNewFileIntent,
  type ImplementationTaskPacket,
} from "./mission-work-packets.ts";
import {
  compilePostContextImplementationTaskPackets,
  type PostContextImplementationTaskCompileResult,
} from "./post-context-implementation-task-compiler.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

const ContextLimitationSchema = z
  .object({
    limitation: boundedString(900),
    blocking: z.boolean().default(true),
  })
  .strict();

const ContextLimitationWaiverSchema = z
  .object({
    consumerNodeId: boundedString(180),
    workUnitId: z.string().trim().max(180).nullable().default(null),
    limitation: boundedString(900),
    evidenceRefs: stringList(16, 320),
  })
  .strict();

export const IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS = 100;
export const IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS = 120;
export const IMPLEMENTATION_CONTEXT_PACKET_MAX_VALIDATION_REFS = 40;
export const IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS = 80;
export const IMPLEMENTATION_CONTEXT_PACKET_MAX_CANDIDATE_FILE_REFS = 120;

export const ImplementationResourceMaterializationStatusSchema = z.enum([
  "accepted",
  "split_required",
  "context_repair_required",
  "resource_repair_required",
  "needs_review",
]);

export type ImplementationResourceMaterializationStatus = z.infer<
  typeof ImplementationResourceMaterializationStatusSchema
>;

export type ResourceMaterializationSchemaDiagnostic = {
  path: string;
  code: string;
  message: string;
  maximum?: number | null;
  received?: number | null;
};

export type ImplementationResourceMaterializationResult = {
  artifactKind: "implementation_resource_materialization_result";
  schemaVersion: "execution-platform.implementation-resource-materialization-result.v1";
  status: ImplementationResourceMaterializationStatus;
  packetRef: string | null;
  blockingReasonCodes: string[];
  nonblockingReasonCodes: string[];
  schemaDiagnostics: ResourceMaterializationSchemaDiagnostic[];
  inputCounts: Record<string, number>;
  outputCounts: Record<string, number>;
  maxBounds: {
    resolvedTargetFileRefs: number;
    targetFileSnapshots: number;
    validationCommandRefs: number;
    contextPacketRefs: number;
    candidateConcreteFileRefs: number;
  };
  suggestedSplits: Array<{
    splitId: string;
    targetFileRefs: string[];
    reasonCodes: string[];
  }>;
  targetCommitmentIds: string[];
  targetNodeIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
};

export const ImplementationContextReadinessStatusSchema = z.enum([
  "ready_as_single_task",
  "split_required",
  "context_repair_required",
  "human_decision_required",
  "codex_integration_required",
  "needs_review",
]);

export type ImplementationContextReadinessStatus = z.infer<
  typeof ImplementationContextReadinessStatusSchema
>;

export const ImplementationContextPacketSchema = z
  .object({
    packetKind: z.literal("implementation_context_packet"),
    schemaVersion: z.literal("execution-platform.implementation-context-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(320),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    sourceWorkUnitId: boundedString(180),
    readinessStatus: ImplementationContextReadinessStatusSchema,
    reasonCodes: stringList(80, 180),
    blockerSummary: z.string().trim().max(1_200).nullable(),
    repairAction: z
      .enum([
        "none",
        "request_context_repair",
        "split_into_file_resolved_tasks",
        "request_human_decision",
        "escalate_to_codex_integration",
        "needs_operator_review",
      ])
      .default("none"),
    exactEditObjective: boundedString(1_200),
    taskSummary: boundedString(2_500),
    targetCommitmentIds: stringList(24, 180),
    contextPacketRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS, 320),
    sourceCommitmentPacketRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS, 320),
    sourceContextHandoffRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS, 320),
    sourcePromptExcerptRefs: stringList(40, 320),
    contextSynthesisRefs: stringList(40, 320),
    priorNodeOutputRefs: stringList(40, 320),
    originalTargetRefs: stringList(100, 320),
    resolvedTargetFileRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS, 320),
    readableTargetFileRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS, 320),
    missingTargetRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS, 320),
    unreadableTargetRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS, 320),
    directoryOnlyTargetRefs: stringList(40, 320),
    directoryDiscoverySeeds: stringList(40, 320),
    candidateConcreteFileRefs: stringList(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_CANDIDATE_FILE_REFS,
      320,
    ),
    newFileIntents: z.array(z.any()).max(40).default([]),
    newFileParentSnapshotRefs: stringList(40, 320),
    newFileParentMissingRefs: stringList(40, 320),
    targetFileSnapshots: z
      .array(z.any())
      .max(IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS)
      .default([]),
    targetFileSnapshotRefs: stringList(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
      320,
    ),
    targetFileSnapshotHashes: stringList(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
      140,
    ),
    repoRootRef: boundedString(320),
    repoRevision: z.string().trim().max(180).nullable().default(null),
    worktreeFingerprint: z.string().trim().max(180).nullable().default(null),
    freshnessSummary: boundedString(900),
    allowedEditScope: stringList(120, 320),
    mustReadRefs: stringList(120, 320),
    likelyModifyRefs: stringList(120, 320),
    deniedFileRefs: stringList(80, 320),
    existingApisAndTypes: stringList(80, 700),
    knownTests: stringList(80, 500),
    relatedTestRefs: stringList(80, 320),
    dependencyNotes: stringList(80, 700),
    expectedPatchShape: boundedString(1_200),
    validationCommandRefs: stringList(IMPLEMENTATION_CONTEXT_PACKET_MAX_VALIDATION_REFS, 320),
    validationDiscoveryPlan: stringList(24, 700),
    acceptanceCriteria: stringList(32, 700),
    evidenceClaimExpectations: stringList(32, 700),
    stopIfMissingOrEscalate: stringList(24, 700),
    blockingLimitations: stringList(80, 900),
    nonblockingLimitations: stringList(80, 900),
    contextLimitations: z.array(ContextLimitationSchema).max(80).default([]),
    contextLimitationWaivers: z.array(ContextLimitationWaiverSchema).max(40).default([]),
    requiredContextSnapshotRefs: z.array(z.any()).max(80).default([]),
    providedContextSnapshotRefs: z.array(z.any()).max(80).default([]),
    contextFreshnessStatus: z
      .enum(["fresh", "stale", "missing", "rejected", "unknown"])
      .default("unknown"),
    contextRefreshAction: z
      .enum([
        "none",
        "request_excerpt",
        "rerun_context_scout",
        "rerun_context_synthesis",
        "refresh_replay_checkpoint",
        "block_implementation",
        "ask_human",
      ])
      .default("block_implementation"),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
  })
  .strict();

export type ImplementationContextPacket = z.infer<typeof ImplementationContextPacketSchema>;

export type ImplementationContextSnapshotCompilerInput = {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  sourceWorkUnitId?: string | null;
  repoRoot: string;
  repoRevision?: string | null;
  worktreeFingerprint?: string | null;
  executionIntent?: ExecutionIntent | null;
  evidenceMode?: EvidenceMode[];
  exactEditObjective: string;
  taskSummary: string;
  targetCommitmentIds: string[];
  targetRefs: string[];
  allowedFileRefs: string[];
  deniedFileRefs?: string[];
  newFileIntents?: ImplementationTaskNewFileIntent[];
  fileChangeIntents?: ImplementationTaskFileChangeIntent[];
  contextPacketRefs: string[];
  sourceCommitmentPacketRefs?: string[];
  sourceContextHandoffRefs?: string[];
  sourcePromptExcerptRefs?: string[];
  contextSynthesisRefs?: string[];
  priorNodeOutputRefs?: string[];
  validationCommandRefs?: string[];
  validationDiscoveryPlan?: string[];
  acceptanceCriteria?: string[];
  evidenceClaimExpectations?: string[];
  expectedEvidenceClaimKinds?: string[];
  expectedPatchShape?: string | null;
  stopIfMissingOrEscalate?: string[];
  existingApisAndTypes?: string[];
  knownTests?: string[];
  relatedTestRefs?: string[];
  dependencyNotes?: string[];
  riskAndBlastRadius?: string[];
  successEvidenceDescriptions?: string[];
  capabilityFit?: string | null;
  costAndEscalationPolicy?: string | null;
  downstreamConsumer?: string | null;
  whyThisWorkerWasSelected?: string | null;
  expectedOutput?: string | null;
  budgetPolicyRefs?: string[];
  contextLimitations?: Array<{ limitation: string; blocking: boolean }>;
  contextLimitationWaivers?: Array<{
    consumerNodeId: string;
    workUnitId?: string | null;
    limitation: string;
    evidenceRefs: string[];
  }>;
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
};

export type ImplementationContextCompileResult = {
  status: ImplementationContextReadinessStatus;
  packet: ImplementationContextPacket;
  resourceMaterialization: ImplementationResourceMaterializationResult;
  implementationTaskCompile: PostContextImplementationTaskCompileResult | null;
  implementationTaskPackets: ImplementationTaskPacket[];
  reasonCodes: string[];
  blockerSummary: string | null;
  repairAction: ImplementationContextPacket["repairAction"];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string | null | undefined, max: number): string {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function unique(values: readonly (string | null | undefined)[] | undefined, max = 40): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values ?? []) {
    const normalized = bounded(value, 320);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function normalizedLimitation(value: string): string {
  return bounded(value, 900).toLowerCase();
}

function contextLimitationHasConsumerWaiver(input: {
  limitation: string;
  nodeId: string;
  workUnitId: string;
  waivers: Array<{
    consumerNodeId: string;
    workUnitId?: string | null;
    limitation: string;
    evidenceRefs: string[];
  }>;
}): boolean {
  const limitation = normalizedLimitation(input.limitation);
  return input.waivers.some((waiver) => {
    const consumerMatches =
      waiver.consumerNodeId === "all" || waiver.consumerNodeId === input.nodeId;
    const workUnitMatches = !waiver.workUnitId || waiver.workUnitId === input.workUnitId;
    const limitationMatches = normalizedLimitation(waiver.limitation) === limitation;
    return (
      consumerMatches &&
      workUnitMatches &&
      limitationMatches &&
      Array.isArray(waiver.evidenceRefs) &&
      waiver.evidenceRefs.some((ref) => ref.trim().length > 0)
    );
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function schemaDiagnostics(error: z.ZodError): ResourceMaterializationSchemaDiagnostic[] {
  return error.issues.slice(0, 24).map((issue) => ({
    path: issue.path.join(".") || "root",
    code: issue.code,
    message: issue.message,
    maximum: "maximum" in issue && typeof issue.maximum === "number" ? issue.maximum : null,
    received: "received" in issue && typeof issue.received === "number" ? issue.received : null,
  }));
}

function splitFileRefs(
  fileRefs: string[],
  maxPerSplit: number,
): ImplementationResourceMaterializationResult["suggestedSplits"] {
  const splits: ImplementationResourceMaterializationResult["suggestedSplits"] = [];
  const byDirectory = new Map<string, string[]>();
  for (const fileRef of fileRefs) {
    const directory = parentDirectory(fileRef);
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), fileRef]);
  }
  for (const [directory, directoryFileRefs] of byDirectory.entries()) {
    for (let offset = 0; offset < directoryFileRefs.length; offset += maxPerSplit) {
      const targetFileRefs = directoryFileRefs.slice(offset, offset + maxPerSplit);
      if (targetFileRefs.length === 0) {
        continue;
      }
      splits.push({
        splitId: `target-file-ref-split-${splits.length + 1}`,
        targetFileRefs,
        reasonCodes: [
          "implementation_context_split_required_for_file_resolved_task",
          `implementation_context_split_parent_directory:${directory}`,
          `implementation_context_split_target_ref_count:${targetFileRefs.length}`,
        ],
      });
    }
  }
  return splits.slice(0, 24);
}

function normalizeRepoFileRef(fileRef: string, repoRoot: string): string | null {
  const candidate = fileRef
    .trim()
    .replace(/^file:\/\//u, "")
    .replaceAll("\\", "/");
  if (!candidate || candidate.includes("\0")) {
    return null;
  }
  const relative = path.isAbsolute(candidate)
    ? path.relative(repoRoot, candidate).replaceAll("\\", "/")
    : candidate;
  const normalized = path.posix.normalize(relative).replace(/^\.\//u, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === "..") {
    return null;
  }
  return normalized;
}

function parentDirectory(fileRef: string): string {
  const normalized = fileRef.replaceAll("\\", "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : ".";
}

function isAllowed(fileRef: string, allowedFileRefs: string[]): boolean {
  return allowedFileRefs.some((allowed) => {
    const normalized = allowed.replaceAll("\\", "/");
    return fileRef === normalized || (normalized.endsWith("/") && fileRef.startsWith(normalized));
  });
}

async function listDirectoryCandidates(input: {
  repoRoot: string;
  directoryRef: string;
  allowedFileRefs: string[];
  maxFiles?: number;
}): Promise<string[]> {
  const maxFiles = input.maxFiles ?? 40;
  const root = path.join(input.repoRoot, input.directoryRef);
  const output: string[] = [];
  async function walk(currentAbs: string, currentRef: string, depth: number): Promise<void> {
    if (output.length >= maxFiles || depth > 3) {
      return;
    }
    const entries = await readdir(currentAbs, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (output.length >= maxFiles) {
        return;
      }
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }
      const childRef = path.posix.join(currentRef, entry.name);
      if (!isAllowed(childRef, input.allowedFileRefs)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(path.join(currentAbs, entry.name), childRef, depth + 1);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss)$/iu.test(entry.name)) {
        output.push(childRef);
      }
    }
  }
  await walk(root, input.directoryRef.replace(/\/$/u, ""), 0);
  return unique(output, maxFiles);
}

async function snapshotFile(input: {
  repoRoot: string;
  fileRef: string;
}): Promise<ImplementationTaskFileSnapshot | null> {
  const absolute = path.join(input.repoRoot, input.fileRef);
  const bytes = await readFile(absolute).catch(() => null);
  if (!bytes) {
    return null;
  }
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return {
    fileRef: input.fileRef,
    snapshotRef: `repo-snapshot://${contentHash.slice(0, 24)}/${encodeURIComponent(input.fileRef)}`,
    contentHash: `sha256:${contentHash}`,
    byteCount: bytes.byteLength,
    sourceKind: "repo_file",
    freshnessStatus: "fresh",
    rawContentStored: false,
  };
}

async function snapshotDirectory(input: {
  repoRoot: string;
  directoryRef: string;
  allowedFileRefs: string[];
}): Promise<string | null> {
  const normalized = input.directoryRef === "." ? "." : input.directoryRef.replace(/\/$/u, "");
  if (normalized !== "." && !isAllowed(`${normalized}/`, input.allowedFileRefs)) {
    return null;
  }
  const entries = await readdir(path.join(input.repoRoot, normalized)).catch(() => null);
  if (!entries) {
    return null;
  }
  const hash = hashValue({ directoryRef: normalized, entries: entries.toSorted().slice(0, 200) });
  return `repo-directory-snapshot://${hash.slice(0, 24)}/${encodeURIComponent(normalized)}`;
}

export async function compileImplementationContextSnapshotPacket(
  input: ImplementationContextSnapshotCompilerInput,
): Promise<ImplementationContextCompileResult> {
  const reasonCodes = ["implementation_context_snapshot_compiler_used"];
  const blockingLimitations: string[] = [];
  const nonblockingLimitations: string[] = [];
  const allowedFileRefs = unique(input.allowedFileRefs, 160);
  const normalizedTargets = unique(
    input.targetRefs
      .map((ref) => normalizeRepoFileRef(ref, input.repoRoot))
      .filter((ref): ref is string => Boolean(ref)),
    120,
  );
  const directoryOnlyTargetRefs: string[] = [];
  const candidateConcreteFileRefs: string[] = [];
  const readableTargetFileRefs: string[] = [];
  const missingTargetRefs: string[] = [];
  const unreadableTargetRefs: string[] = [];
  const targetFileSnapshots: ImplementationTaskFileSnapshot[] = [];
  const newFileIntents = input.newFileIntents ?? [];
  const normalizedInputFileChangeIntents = (input.fileChangeIntents ?? [])
    .map((intent) => {
      const fileRef = normalizeRepoFileRef(intent.fileRef, input.repoRoot);
      if (!fileRef || !isAllowed(fileRef, allowedFileRefs)) {
        return null;
      }
      return {
        fileRef,
        symbolOrRegion: bounded(intent.symbolOrRegion, 260),
        intendedChange: bounded(intent.intendedChange, 900),
        whyThisFile: bounded(intent.whyThisFile, 900),
      } satisfies ImplementationTaskFileChangeIntent;
    })
    .filter((intent): intent is ImplementationTaskFileChangeIntent => Boolean(intent))
    .slice(0, 40);
  const fileChangeIntentRefs = new Set(
    normalizedInputFileChangeIntents.map((intent) => intent.fileRef),
  );
  const newFileIntentRefs = new Set(
    newFileIntents
      .map((intent) => normalizeRepoFileRef(intent.fileRef, input.repoRoot))
      .filter((ref): ref is string => Boolean(ref)),
  );
  const newFileParentSnapshotRefs: string[] = [];
  const newFileParentMissingRefs: string[] = [];
  const targetFileSnapshotRefs = new Set<string>();

  async function addReadableTargetSnapshot(fileRef: string): Promise<void> {
    if (targetFileSnapshotRefs.has(fileRef)) {
      return;
    }
    const snapshot = await snapshotFile({ repoRoot: input.repoRoot, fileRef });
    if (snapshot) {
      readableTargetFileRefs.push(fileRef);
      targetFileSnapshots.push(snapshot);
      targetFileSnapshotRefs.add(fileRef);
    } else {
      unreadableTargetRefs.push(fileRef);
    }
  }

  for (const targetRef of normalizedTargets) {
    const allowed = isAllowed(targetRef, allowedFileRefs);
    if (!allowed) {
      unreadableTargetRefs.push(targetRef);
      continue;
    }
    const info = await stat(path.join(input.repoRoot, targetRef)).catch(() => null);
    if (info?.isDirectory()) {
      const dirRef = targetRef.endsWith("/") ? targetRef : `${targetRef}/`;
      directoryOnlyTargetRefs.push(dirRef);
      const candidates = await listDirectoryCandidates({
        repoRoot: input.repoRoot,
        directoryRef: targetRef,
        allowedFileRefs,
        maxFiles: 50,
      });
      const intentRefsWithinDirectory = [...fileChangeIntentRefs].filter((fileRef) =>
        fileRef.startsWith(dirRef),
      );
      candidateConcreteFileRefs.push(...candidates, ...intentRefsWithinDirectory);
      for (const candidate of intentRefsWithinDirectory.slice(0, 24)) {
        await addReadableTargetSnapshot(candidate);
      }
      continue;
    }
    if (info?.isFile()) {
      await addReadableTargetSnapshot(targetRef);
      continue;
    }
    if (!newFileIntentRefs.has(targetRef)) {
      missingTargetRefs.push(targetRef);
    }
  }

  for (const intent of newFileIntents) {
    const normalized = normalizeRepoFileRef(intent.fileRef, input.repoRoot);
    if (!normalized || !isAllowed(normalized, allowedFileRefs)) {
      newFileParentMissingRefs.push(intent.fileRef);
      continue;
    }
    const parent = parentDirectory(normalized);
    const parentSnapshot = await snapshotDirectory({
      repoRoot: input.repoRoot,
      directoryRef: parent,
      allowedFileRefs,
    });
    if (parentSnapshot) {
      newFileParentSnapshotRefs.push(parentSnapshot);
    } else {
      newFileParentMissingRefs.push(parent);
    }
  }

  const targetCommitmentIds = unique(input.targetCommitmentIds, 24);
  const contextPacketRefs = unique(input.contextPacketRefs, 80);
  const validationCommandRefs = unique(input.validationCommandRefs ?? [], 40);
  const validationDiscoveryPlan = unique(input.validationDiscoveryPlan ?? [], 24);
  const acceptanceCriteria = unique(input.acceptanceCriteria ?? [], 32);
  const evidenceClaimExpectations = unique(
    input.evidenceClaimExpectations ?? acceptanceCriteria,
    32,
  );
  const sourceWorkUnitId = bounded(input.sourceWorkUnitId ?? input.nodeId, 180);
  const contextLimitationWaivers = (input.contextLimitationWaivers ?? [])
    .map((waiver) => ({
      consumerNodeId: bounded(waiver.consumerNodeId, 180),
      workUnitId: waiver.workUnitId ? bounded(waiver.workUnitId, 180) : null,
      limitation: bounded(waiver.limitation, 900),
      evidenceRefs: unique(waiver.evidenceRefs, 16),
    }))
    .filter(
      (waiver) =>
        waiver.consumerNodeId.length > 0 &&
        waiver.limitation.length > 0 &&
        waiver.evidenceRefs.length > 0,
    )
    .slice(0, 40);
  const contextLimitations = (input.contextLimitations ?? [])
    .map((limitation) => {
      const boundedLimitation = bounded(limitation.limitation, 900);
      if (!boundedLimitation) {
        return null;
      }
      if (limitation.blocking) {
        return { limitation: boundedLimitation, blocking: true };
      }
      const waived = contextLimitationHasConsumerWaiver({
        limitation: boundedLimitation,
        nodeId: input.nodeId,
        workUnitId: sourceWorkUnitId,
        waivers: contextLimitationWaivers,
      });
      return { limitation: boundedLimitation, blocking: !waived };
    })
    .filter((limitation): limitation is { limitation: string; blocking: boolean } =>
      Boolean(limitation),
    )
    .slice(0, 80);
  const blockingContextLimitations = contextLimitations
    .filter((limitation) => limitation.blocking)
    .map((limitation) => limitation.limitation);
  const nonblockingContextLimitations = contextLimitations
    .filter((limitation) => !limitation.blocking)
    .map((limitation) => limitation.limitation);
  const resolvedTargetFileRefs = unique(
    [...readableTargetFileRefs, ...newFileIntentRefs],
    Math.max(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
      IMPLEMENTATION_CONTEXT_PACKET_MAX_CANDIDATE_FILE_REFS,
    ),
  );
  const resolvedTargetFileRefCount = resolvedTargetFileRefs.length;
  const targetFileSnapshotCount = targetFileSnapshots.length;
  const packetBoundExceeded =
    resolvedTargetFileRefCount > IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS ||
    targetFileSnapshotCount > IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS ||
    validationCommandRefs.length > IMPLEMENTATION_CONTEXT_PACKET_MAX_VALIDATION_REFS ||
    contextPacketRefs.length > IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS;

  if (targetCommitmentIds.length === 0) {
    reasonCodes.push("implementation_context_commitment_mapping_missing");
    blockingLimitations.push("No commitment ids are mapped to this implementation node.");
  }
  if (contextPacketRefs.length === 0) {
    reasonCodes.push("implementation_context_handoff_missing");
    blockingLimitations.push(
      "No accepted context handoff refs are available for this implementation node.",
    );
  }
  if (blockingContextLimitations.length > 0) {
    reasonCodes.push("implementation_context_blocking_context_limitation");
    if ((input.contextLimitations ?? []).some((limitation) => !limitation.blocking)) {
      reasonCodes.push("implementation_context_nonblocking_context_limitation_waiver_missing");
    }
    blockingLimitations.push(...blockingContextLimitations);
  }
  if (nonblockingContextLimitations.length > 0) {
    reasonCodes.push("implementation_context_nonblocking_context_limitation_waived");
    nonblockingLimitations.push(...nonblockingContextLimitations);
  }
  if (validationCommandRefs.length === 0 && validationDiscoveryPlan.length === 0) {
    reasonCodes.push("implementation_context_validation_plan_missing");
    blockingLimitations.push(
      "No validation command refs or validation discovery plan are available.",
    );
  }
  if (acceptanceCriteria.length === 0) {
    reasonCodes.push("implementation_context_acceptance_criteria_missing");
    blockingLimitations.push("No acceptance criteria are available for the implementation task.");
  }
  if (missingTargetRefs.length > 0) {
    reasonCodes.push("implementation_context_target_refs_missing");
    blockingLimitations.push(`Missing target refs: ${missingTargetRefs.slice(0, 8).join(", ")}`);
  }
  if (unreadableTargetRefs.length > 0) {
    reasonCodes.push("implementation_context_target_refs_unreadable_or_out_of_scope");
    blockingLimitations.push(
      `Unreadable or out-of-scope target refs: ${unreadableTargetRefs.slice(0, 8).join(", ")}`,
    );
  }
  if (newFileParentMissingRefs.length > 0) {
    reasonCodes.push("implementation_context_new_file_parent_snapshot_missing");
    blockingLimitations.push(
      `New-file parent snapshots missing: ${newFileParentMissingRefs.slice(0, 8).join(", ")}`,
    );
  }
  if (directoryOnlyTargetRefs.length > 0) {
    reasonCodes.push("implementation_context_directory_refs_are_discovery_seeds");
    nonblockingLimitations.push(
      `Directory refs are discovery seeds, not executable targets: ${directoryOnlyTargetRefs
        .slice(0, 8)
        .join(", ")}`,
    );
  }
  if (readableTargetFileRefs.length === 0 && newFileIntentRefs.size === 0) {
    reasonCodes.push("implementation_context_no_executable_target_snapshots");
    blockingLimitations.push(
      "No readable target snapshots or explicit new-file intents are available.",
    );
  }
  if (packetBoundExceeded) {
    reasonCodes.push("implementation_context_resource_packet_bounds_exceeded");
    if (resolvedTargetFileRefCount > IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS) {
      reasonCodes.push(
        `implementation_context_resolved_target_file_refs_exceeds_packet_bound:${resolvedTargetFileRefCount}:${IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS}`,
      );
    }
    if (targetFileSnapshotCount > IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS) {
      reasonCodes.push(
        `implementation_context_target_file_snapshots_exceeds_packet_bound:${targetFileSnapshotCount}:${IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS}`,
      );
    }
    nonblockingLimitations.push(
      `Resource materialization exceeded packet bounds and must split before worker invocation: resolvedTargetFileRefs=${resolvedTargetFileRefCount}/${IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS}, targetFileSnapshots=${targetFileSnapshotCount}/${IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS}.`,
    );
  }

  let status: ImplementationContextReadinessStatus = "ready_as_single_task";
  let repairAction: ImplementationContextPacket["repairAction"] = "none";
  if (blockingLimitations.length > 0) {
    status = "context_repair_required";
    repairAction = "request_context_repair";
  } else if (packetBoundExceeded) {
    status = "split_required";
    repairAction = "split_into_file_resolved_tasks";
  } else if (
    directoryOnlyTargetRefs.length > 0 ||
    readableTargetFileRefs.length > 6 ||
    new Set(readableTargetFileRefs.map(parentDirectory)).size > 1
  ) {
    status = "split_required";
    repairAction = "split_into_file_resolved_tasks";
  }

  const boundedResolvedTargetFileRefs = resolvedTargetFileRefs.slice(
    0,
    IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
  );
  const boundedReadableTargetFileRefs = unique(
    readableTargetFileRefs,
    IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
  );
  const boundedTargetFileSnapshots = targetFileSnapshots.slice(
    0,
    IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
  );
  const suggestedSplits = splitFileRefs(
    resolvedTargetFileRefs,
    Math.min(6, IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS),
  );
  const packetId = `${input.nodeId}:implementation-context`;
  const packetBase = {
    packetKind: "implementation_context_packet" as const,
    schemaVersion: "execution-platform.implementation-context-packet.v1" as const,
    packetId,
    packetRef: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    sourceWorkUnitId,
    readinessStatus: status,
    reasonCodes,
    blockerSummary: blockingLimitations.length > 0 ? blockingLimitations.join("; ") : null,
    repairAction,
    exactEditObjective: bounded(input.exactEditObjective, 1_200),
    taskSummary: bounded(input.taskSummary, 2_500),
    targetCommitmentIds,
    contextPacketRefs,
    sourceCommitmentPacketRefs: unique(input.sourceCommitmentPacketRefs ?? [], 80),
    sourceContextHandoffRefs: unique(input.sourceContextHandoffRefs ?? contextPacketRefs, 80),
    sourcePromptExcerptRefs: unique(input.sourcePromptExcerptRefs ?? [], 40),
    contextSynthesisRefs: unique(input.contextSynthesisRefs ?? [], 40),
    priorNodeOutputRefs: unique(input.priorNodeOutputRefs ?? [], 40),
    originalTargetRefs: normalizedTargets.slice(
      0,
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
    ),
    resolvedTargetFileRefs: boundedResolvedTargetFileRefs,
    readableTargetFileRefs: boundedReadableTargetFileRefs,
    missingTargetRefs: unique(missingTargetRefs, 100),
    unreadableTargetRefs: unique(unreadableTargetRefs, 100),
    directoryOnlyTargetRefs: unique(directoryOnlyTargetRefs, 40),
    directoryDiscoverySeeds: unique(directoryOnlyTargetRefs, 40),
    candidateConcreteFileRefs: unique(
      candidateConcreteFileRefs,
      IMPLEMENTATION_CONTEXT_PACKET_MAX_CANDIDATE_FILE_REFS,
    ),
    newFileIntents,
    newFileParentSnapshotRefs: unique(newFileParentSnapshotRefs, 40),
    newFileParentMissingRefs: unique(newFileParentMissingRefs, 40),
    targetFileSnapshots: boundedTargetFileSnapshots,
    targetFileSnapshotRefs: unique(
      boundedTargetFileSnapshots.map((snapshot) => snapshot.snapshotRef),
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
    ),
    targetFileSnapshotHashes: unique(
      boundedTargetFileSnapshots.map((snapshot) => snapshot.contentHash),
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
    ),
    repoRootRef: `repo-root://${hashValue(input.repoRoot).slice(0, 16)}`,
    repoRevision: input.repoRevision ?? null,
    worktreeFingerprint: input.worktreeFingerprint ?? null,
    freshnessSummary:
      "Target refs and snapshots were resolved from the current repo worktree immediately before worker invocation.",
    allowedEditScope: unique(
      [...boundedReadableTargetFileRefs, ...newFileIntentRefs],
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
    ),
    mustReadRefs: unique(
      boundedReadableTargetFileRefs,
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
    ),
    likelyModifyRefs: unique(
      [...boundedReadableTargetFileRefs, ...newFileIntentRefs],
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
    ),
    deniedFileRefs: unique(input.deniedFileRefs ?? [], 80),
    existingApisAndTypes: unique(input.existingApisAndTypes ?? [], 80),
    knownTests: unique(input.knownTests ?? [], 80),
    relatedTestRefs: unique(input.relatedTestRefs ?? input.knownTests ?? [], 80),
    dependencyNotes: unique(input.dependencyNotes ?? [], 80),
    expectedPatchShape: bounded(
      input.expectedPatchShape ??
        "Apply bounded edits only to target snapshots/new-file intents and return changed-file refs, validation refs, and commitment-linked evidence claims.",
      1_200,
    ),
    validationCommandRefs,
    validationDiscoveryPlan,
    acceptanceCriteria,
    evidenceClaimExpectations,
    stopIfMissingOrEscalate: unique(
      input.stopIfMissingOrEscalate ?? [
        "Do not edit if any target snapshot is missing, stale, unreadable, or outside scope.",
        "Request context repair with exact missing refs before worker invocation.",
      ],
      24,
    ),
    blockingLimitations: unique(blockingLimitations, 80),
    nonblockingLimitations: unique(nonblockingLimitations, 80),
    contextLimitations,
    contextLimitationWaivers,
    requiredContextSnapshotRefs: input.requiredContextSnapshotRefs ?? [],
    providedContextSnapshotRefs: input.providedContextSnapshotRefs ?? [],
    contextFreshnessStatus: blockingContextLimitations.length > 0 ? "missing" : "fresh",
    contextRefreshAction: blockingLimitations.length > 0 ? "block_implementation" : "none",
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
  };
  const packetCandidate = {
    ...packetBase,
    packetRef: `runtime-work-graph://implementation-context-packet/${packetId}/${hashValue(packetBase).slice(0, 16)}`,
  };
  const parsedPacket = ImplementationContextPacketSchema.safeParse(packetCandidate);
  const packet = parsedPacket.success
    ? parsedPacket.data
    : ImplementationContextPacketSchema.parse({
        ...packetBase,
        readinessStatus: "needs_review",
        reasonCodes: [
          ...reasonCodes,
          "implementation_context_packet_schema_validation_failed",
          ...schemaDiagnostics(parsedPacket.error).map(
            (diagnostic) => `schema:${diagnostic.path}:${diagnostic.code}`,
          ),
        ].slice(0, 80),
        blockerSummary:
          "ImplementationContextPacket failed schema validation before worker invocation.",
        repairAction: "needs_operator_review",
        originalTargetRefs: unique(normalizedTargets, 20),
        resolvedTargetFileRefs: [],
        readableTargetFileRefs: [],
        missingTargetRefs: unique(missingTargetRefs, 20),
        unreadableTargetRefs: unique(unreadableTargetRefs, 20),
        candidateConcreteFileRefs: [],
        targetFileSnapshots: [],
        targetFileSnapshotRefs: [],
        targetFileSnapshotHashes: [],
        allowedEditScope: [],
        mustReadRefs: [],
        likelyModifyRefs: [],
        blockingLimitations: [
          "ImplementationContextPacket failed schema validation before worker invocation.",
        ],
        nonblockingLimitations: [],
        contextFreshnessStatus: "rejected",
        contextRefreshAction: "block_implementation",
        packetRef: `runtime-work-graph://implementation-context-packet/${packetId}/schema-invalid-${hashValue(
          schemaDiagnostics(parsedPacket.error),
        ).slice(0, 12)}`,
      });

  const resourceMaterialization: ImplementationResourceMaterializationResult = {
    artifactKind: "implementation_resource_materialization_result",
    schemaVersion: "execution-platform.implementation-resource-materialization-result.v1",
    status:
      packet.readinessStatus === "ready_as_single_task"
        ? "accepted"
        : packet.readinessStatus === "split_required"
          ? "split_required"
          : packet.readinessStatus === "context_repair_required"
            ? "context_repair_required"
            : "needs_review",
    packetRef: packet.packetRef,
    blockingReasonCodes:
      packet.readinessStatus === "ready_as_single_task" ||
      packet.readinessStatus === "split_required"
        ? []
        : packet.reasonCodes.slice(0, 40),
    nonblockingReasonCodes: packet.reasonCodes.slice(0, 40),
    schemaDiagnostics: parsedPacket.success ? [] : schemaDiagnostics(parsedPacket.error),
    inputCounts: {
      targetRefs: input.targetRefs.length,
      allowedFileRefs: input.allowedFileRefs.length,
      normalizedTargets: normalizedTargets.length,
      readableTargetFileRefs: readableTargetFileRefs.length,
      candidateConcreteFileRefs: candidateConcreteFileRefs.length,
      resolvedTargetFileRefs: resolvedTargetFileRefCount,
      targetFileSnapshots: targetFileSnapshotCount,
      validationCommandRefs: validationCommandRefs.length,
      contextPacketRefs: contextPacketRefs.length,
    },
    outputCounts: {
      resolvedTargetFileRefs: packet.resolvedTargetFileRefs.length,
      readableTargetFileRefs: packet.readableTargetFileRefs.length,
      targetFileSnapshots: packet.targetFileSnapshots.length,
      targetFileSnapshotRefs: packet.targetFileSnapshotRefs.length,
      implementationTaskPackets: 0,
    },
    maxBounds: {
      resolvedTargetFileRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
      targetFileSnapshots: IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_SNAPSHOTS,
      validationCommandRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_VALIDATION_REFS,
      contextPacketRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS,
      candidateConcreteFileRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_CANDIDATE_FILE_REFS,
    },
    suggestedSplits,
    targetCommitmentIds,
    targetNodeIds: [input.nodeId],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
  status = packet.readinessStatus;
  repairAction = packet.repairAction;

  let implementationTaskCompile: PostContextImplementationTaskCompileResult | null = null;
  if (status === "ready_as_single_task" || status === "split_required") {
    implementationTaskCompile = compilePostContextImplementationTaskPackets({
      runtimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      nodeId: input.nodeId,
      workUnitId: input.sourceWorkUnitId ?? input.nodeId,
      nodeTitle: input.nodeId,
      executionIntent: input.executionIntent,
      evidenceMode: input.evidenceMode,
      exactEditObjective: packet.exactEditObjective,
      taskSummary: packet.taskSummary,
      expectedOutput: input.expectedOutput ?? null,
      expectedPatchShape: packet.expectedPatchShape,
      whyThisWorkerWasSelected: input.whyThisWorkerWasSelected ?? null,
      targetCommitmentIds: packet.targetCommitmentIds,
      targetFileRefs: packet.resolvedTargetFileRefs,
      readableFileRefs: packet.readableTargetFileRefs,
      missingFileRefs: [],
      targetFileSnapshots: boundedTargetFileSnapshots,
      newFileIntents: packet.newFileIntents,
      allowedFileRefs: unique([...allowedFileRefs, ...packet.allowedEditScope], 160),
      deniedFileRefs: packet.deniedFileRefs,
      contextPacketRefs: packet.contextPacketRefs,
      sourceCommitmentPacketRefs: packet.sourceCommitmentPacketRefs,
      sourceContextHandoffRefs: packet.sourceContextHandoffRefs,
      sourcePromptExcerptRefs: packet.sourcePromptExcerptRefs,
      contextSynthesisRefs: packet.contextSynthesisRefs,
      priorNodeOutputRefs: packet.priorNodeOutputRefs,
      validationCommandRefs: packet.validationCommandRefs,
      validationDiscoveryPlan: packet.validationDiscoveryPlan,
      acceptanceCriteria: packet.acceptanceCriteria,
      expectedEvidenceClaimKinds: input.expectedEvidenceClaimKinds ?? [
        "source_change",
        "test_validation",
      ],
      evidenceClaimExpectations: packet.evidenceClaimExpectations,
      fileChangeIntents: normalizedInputFileChangeIntents,
      stopIfMissingOrEscalate: packet.stopIfMissingOrEscalate,
      budgetPolicyRefs: input.budgetPolicyRefs,
      capabilityFit: input.capabilityFit,
      costAndEscalationPolicy: input.costAndEscalationPolicy,
      downstreamConsumer: input.downstreamConsumer,
      successEvidenceDescriptions:
        input.successEvidenceDescriptions ?? packet.evidenceClaimExpectations,
      existingApisAndTypes: packet.existingApisAndTypes,
      knownTests: packet.knownTests,
      dependencyNotes: packet.dependencyNotes,
      riskAndBlastRadius: input.riskAndBlastRadius ?? [],
    });
  }

  const implementationTaskPackets = implementationTaskCompile?.packets ?? [];
  const splitPrecedesTaskPacketRepair =
    status === "split_required" &&
    implementationTaskCompile?.status === "context_repair_required" &&
    resourceMaterialization.suggestedSplits.length > 1;

  if (implementationTaskCompile?.status === "needs_review") {
    status = "needs_review";
    repairAction = "needs_operator_review";
  } else if (
    implementationTaskCompile?.status === "context_repair_required" &&
    !splitPrecedesTaskPacketRepair
  ) {
    status = "context_repair_required";
    repairAction = "request_context_repair";
  } else if (splitPrecedesTaskPacketRepair) {
    reasonCodes.push("implementation_context_split_precedes_context_repair");
    repairAction = "split_into_file_resolved_tasks";
  }
  const finalResourceMaterialization: ImplementationResourceMaterializationResult = {
    ...resourceMaterialization,
    status:
      status === "ready_as_single_task"
        ? "accepted"
        : status === "split_required"
          ? "split_required"
          : status === "context_repair_required"
            ? "context_repair_required"
            : status === "human_decision_required"
              ? "needs_review"
              : "needs_review",
    blockingReasonCodes:
      status === "ready_as_single_task" || status === "split_required"
        ? []
        : [
            ...resourceMaterialization.blockingReasonCodes,
            ...(implementationTaskCompile?.reasonCodes ?? []),
          ].slice(0, 40),
    outputCounts: {
      ...resourceMaterialization.outputCounts,
      implementationTaskPackets: implementationTaskPackets.length,
    },
  };
  return {
    status,
    packet,
    resourceMaterialization: finalResourceMaterialization,
    implementationTaskCompile,
    implementationTaskPackets,
    reasonCodes: [...reasonCodes, ...(implementationTaskCompile?.reasonCodes ?? [])],
    blockerSummary: packet.blockerSummary ?? implementationTaskCompile?.blockerSummary ?? null,
    repairAction,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function summarizeImplementationContextPacketForReadback(
  packet: ImplementationContextPacket,
): JsonValue {
  return {
    implementationContextPacketRef: packet.packetRef,
    implementationContextReadinessStatus: packet.readinessStatus,
    implementationContextReasonCodes: packet.reasonCodes,
    implementationContextRepairAction: packet.repairAction,
    implementationContextBlockerSummary: packet.blockerSummary,
    resolvedTargetFileRefs: packet.resolvedTargetFileRefs.slice(0, 30),
    readableTargetFileRefs: packet.readableTargetFileRefs.slice(0, 30),
    missingTargetRefs: packet.missingTargetRefs.slice(0, 30),
    unreadableTargetRefs: packet.unreadableTargetRefs.slice(0, 30),
    directoryOnlyTargetRefs: packet.directoryOnlyTargetRefs.slice(0, 20),
    candidateConcreteFileRefs: packet.candidateConcreteFileRefs.slice(0, 40),
    targetFileSnapshotRefs: packet.targetFileSnapshotRefs.slice(0, 30),
    targetFileSnapshotHashes: packet.targetFileSnapshotHashes.slice(0, 30),
    newFileParentSnapshotRefs: packet.newFileParentSnapshotRefs.slice(0, 20),
    newFileParentMissingRefs: packet.newFileParentMissingRefs.slice(0, 20),
    contextPacketRefs: packet.contextPacketRefs.slice(0, 20),
    validationRefs: packet.validationCommandRefs.slice(0, 20),
    validationDiscoveryPlan: packet.validationDiscoveryPlan.slice(0, 10),
    allowedEditScope: packet.allowedEditScope.slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

const MATERIALIZATION_METRIC_KEY_MAP: Record<string, string> = {
  targetRefs: "targetRef",
  allowedFileRefs: "allowedFileRef",
  normalizedTargets: "normalizedTarget",
  readableTargetFileRefs: "readableTargetFileRef",
  candidateConcreteFileRefs: "candidateConcreteFileRef",
  resolvedTargetFileRefs: "resolvedTargetFileRef",
  targetFileSnapshots: "targetFileSnapshot",
  validationCommandRefs: "validationCommandRef",
  contextPacketRefs: "contextPacketRef",
  targetFileSnapshotRefs: "targetFileSnapshotRef",
  implementationTaskPackets: "implementationTaskPacket",
};

function manifestSafeMaterializationMetricRecord(
  values: Record<string, number>,
  suffix: "Count" | "Max",
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const metricBase =
        MATERIALIZATION_METRIC_KEY_MAP[key] ??
        key
          .replace(/Refs$/u, "Ref")
          .replace(/Snapshots$/u, "Snapshot")
          .replace(/Packets$/u, "Packet")
          .replace(/Targets$/u, "Target")
          .replace(/s$/u, "");
      const safeKey = `${metricBase.replace(/[^A-Za-z0-9_]/gu, "")}${suffix}`;
      return [safeKey || `unknown${suffix}`, value];
    }),
  );
}

export function summarizeImplementationResourceMaterializationForReadback(
  materialization: ImplementationResourceMaterializationResult,
): JsonValue {
  return {
    implementationResourceMaterializationStatus: materialization.status,
    implementationResourceMaterializationPacketRef: materialization.packetRef,
    implementationResourceMaterializationBlockingReasonCodes:
      materialization.blockingReasonCodes.slice(0, 40),
    implementationResourceMaterializationNonblockingReasonCodes:
      materialization.nonblockingReasonCodes.slice(0, 40),
    implementationResourceMaterializationSchemaDiagnostics: materialization.schemaDiagnostics.slice(
      0,
      20,
    ),
    implementationResourceMaterializationInputCounts: manifestSafeMaterializationMetricRecord(
      materialization.inputCounts,
      "Count",
    ),
    implementationResourceMaterializationOutputCounts: manifestSafeMaterializationMetricRecord(
      materialization.outputCounts,
      "Count",
    ),
    implementationResourceMaterializationMaxBounds: manifestSafeMaterializationMetricRecord(
      materialization.maxBounds,
      "Max",
    ),
    implementationResourceMaterializationSuggestedSplitIds: materialization.suggestedSplits
      .map((split) => split.splitId)
      .slice(0, 40),
    implementationResourceMaterializationSuggestedSplitCount:
      materialization.suggestedSplits.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function compileImplementationContextToolOutput(input: {
  toolId: string;
  volatileInput: unknown;
  metadata?: JsonValue | null;
}): {
  status: "succeeded" | "needs_review";
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
} {
  const metadata = asRecord(input.metadata ?? null);
  const volatile = asRecord(input.volatileInput);
  const packet = asRecord(
    volatile.implementationContextPacket ?? metadata.implementationContextPacket,
  );
  const taskPackets = Array.isArray(volatile.implementationTaskPackets)
    ? volatile.implementationTaskPackets
    : Array.isArray(metadata.implementationTaskPackets)
      ? metadata.implementationTaskPackets
      : [];
  const parsed = ImplementationContextPacketSchema.safeParse(packet);
  const baseReason = `${input.toolId.replaceAll(".", "_")}_recorded`;
  if (!parsed.success) {
    return {
      status: "needs_review",
      outputRef: `runtime-tool-output://${input.toolId}/invalid-implementation-context-packet`,
      outputHash: `implementation-context:${input.toolId}:invalid`,
      outputSummary: "ImplementationContextPacket could not be parsed.",
      reasonCodes: [
        baseReason,
        "implementation_context_packet_parse_failed",
        ...parsed.error.issues.map((issue) => `schema:${issue.path.join(".") || "root"}`),
      ].slice(0, 60),
      metadata: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    };
  }
  const taskValidations = taskPackets
    .map((packetValue) => {
      const maybePacket = asRecord(packetValue);
      try {
        return validateImplementationTaskPacketForWorker(
          maybePacket as unknown as ImplementationTaskPacket,
        );
      } catch {
        return null;
      }
    })
    .filter((value): value is ReturnType<typeof validateImplementationTaskPacketForWorker> =>
      Boolean(value),
    );
  const blocked =
    parsed.data.blockingLimitations.length > 0 ||
    parsed.data.readinessStatus === "context_repair_required" ||
    parsed.data.readinessStatus === "needs_review" ||
    taskValidations.some((validation) => validation.status === "invalid");
  return {
    status: blocked ? "needs_review" : "succeeded",
    outputRef: parsed.data.packetRef,
    outputHash: `implementation-context:${hashValue({ toolId: input.toolId, packet: parsed.data })}`,
    outputSummary: `Implementation context packet readiness is ${parsed.data.readinessStatus}.`,
    reasonCodes: [
      baseReason,
      ...parsed.data.reasonCodes,
      ...taskValidations.flatMap((validation) => validation.reasonCodes),
    ].slice(0, 80),
    metadata: {
      implementationContextPacket: parsed.data as unknown as JsonValue,
      implementationTaskPackets: taskPackets as JsonValue,
      readinessStatus: parsed.data.readinessStatus,
      repairAction: parsed.data.repairAction,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue,
  };
}
