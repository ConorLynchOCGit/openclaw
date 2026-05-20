import { createHash } from "node:crypto";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  ContextSnapshotRefSchema,
  validateContextSnapshotFreshness,
  type ContextSnapshotRef,
} from "./context-snapshot.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

export const BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE = "execution.boundary_replay_checkpoint";

export const BOUNDARY_REPLAY_PLAN_ARTIFACT_TYPE = "execution.boundary_replay_plan";

export const BOUNDARY_REPLAY_CHECKPOINT_KINDS = [
  "router_payload",
  "mission_ledger",
  "commitment_packet_authoring",
  "commitment_packet_review",
  "context_scout",
  "context_synthesis",
  "graph_compile",
  "node_selection",
  "worker_execution",
  "validation_repair",
  "review_qa",
  "closeout_finalization",
  "work_queue_readback",
] as const;

export type BoundaryReplayCheckpointKind = (typeof BOUNDARY_REPLAY_CHECKPOINT_KINDS)[number];

export type BoundaryReplayCheckpoint = {
  artifactKind: "boundary_replay_checkpoint";
  schemaVersion: "execution-platform.boundary-replay-checkpoint.v1";
  checkpointId: string;
  checkpointKind: BoundaryReplayCheckpointKind;
  workflowId: string;
  runtimeJobId: string;
  graphId: string;
  sourcePromptHash: string | null;
  sourcePayloadHash: string | null;
  boundaryInputHash: string | null;
  boundaryOutputHash: string | null;
  repoRevision: string | null;
  worktreeFingerprint: string | null;
  authorityPolicyRef: string | null;
  identityBindingHash: string;
  upstreamArtifactRefs: string[];
  acceptedArtifactRefs: string[];
  staleArtifactRefs: string[];
  rejectedArtifactRefs: string[];
  contextSnapshotRefs: ContextSnapshotRef[];
  staleContextSnapshotRefs: string[];
  missingContextSnapshotRefs: string[];
  rejectedContextSnapshotRefs: string[];
  currentNodeIds: string[];
  currentCommitmentIds: string[];
  openCommitmentIds: string[];
  satisfiedCommitmentIds: string[];
  replayStartPolicy: "allowed_from_checkpoint" | "blocked_until_repair" | "diagnostic_only";
  replaySafetyStatus: "safe_to_replay" | "needs_review" | "blocked";
  replayFreshnessStatus: "fresh" | "stale" | "unknown";
  replayContinuationMode:
    | "continue_scheduler"
    | "run_node"
    | "repair_boundary"
    | "finalize_closeout"
    | "diagnostic_only";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
};

export type BoundaryReplayPlan = {
  artifactKind: "boundary_replay_plan";
  schemaVersion: "execution-platform.boundary-replay-plan.v1";
  planId: string;
  runtimeJobId: string;
  graphId: string;
  workflowId: string;
  requestedStartBoundary: BoundaryReplayCheckpointKind;
  status: "accepted" | "needs_review" | "blocked";
  requiredUpstreamCheckpointKinds: BoundaryReplayCheckpointKind[];
  latestAcceptedCheckpointRef: string | null;
  latestAcceptedCheckpointKind: BoundaryReplayCheckpointKind | null;
  exactContinuationMode: BoundaryReplayCheckpoint["replayContinuationMode"] | null;
  skippedUpstreamCheckpointKinds: BoundaryReplayCheckpointKind[];
  resumeFromArtifactRefs: string[];
  invalidReasonCodes: string[];
  acceptedCheckpointRefs: string[];
  staleCheckpointRefs: string[];
  rejectedCheckpointRefs: string[];
  contextSnapshotRefs: ContextSnapshotRef[];
  staleContextSnapshotRefs: string[];
  missingContextSnapshotRefs: string[];
  rejectedContextSnapshotRefs: string[];
  allowedRuntimeRepositories: string[];
  allowedNodeExecutors: string[];
  allowedToolKernelFamilies: string[];
  exactContinuationAction: string;
  stopConditions: string[];
  operatorReadbackSummary: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
};

export type BoundaryReplayContinuation = {
  artifactKind: "boundary_replay_production_continuation";
  schemaVersion: "execution-platform.boundary-replay-continuation.v1";
  runtimeJobId: string;
  graphId: string;
  workflowId: string;
  requestedStartBoundary: BoundaryReplayCheckpointKind;
  status: "accepted" | "needs_review" | "blocked";
  runtimeEntryPoint: "GenericOrchestrationRuntime.runSchedulerGraph";
  schedulerEntryPoint: "RuntimeWorkGraphScheduler.run";
  continuationMode: BoundaryReplayCheckpoint["replayContinuationMode"] | null;
  exactContinuationAction: string;
  skippedUpstreamCheckpointKinds: BoundaryReplayCheckpointKind[];
  resumeFromArtifactRefs: string[];
  acceptedCheckpointRefs: string[];
  requiredRuntimeRepositories: string[];
  allowedNodeExecutors: string[];
  allowedToolKernelFamilies: string[];
  stopConditions: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
};

function bounded(value: string | null | undefined, max = 260): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function unique(values: Array<string | null | undefined>, max: number, maxChars = 260): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, maxChars))
    .slice(0, max);
}

function compactContextSnapshotRefsForCheckpoint(refs: ContextSnapshotRef[]): ContextSnapshotRef[] {
  return refs.slice(0, 24).map((ref) => ({
    ...ref,
    snapshotRef: bounded(ref.snapshotRef, 320),
    sourceRef: bounded(ref.sourceRef, 320),
    repoRevision: ref.repoRevision ? bounded(ref.repoRevision, 160) : null,
    worktreeFingerprint: ref.worktreeFingerprint ? bounded(ref.worktreeFingerprint, 160) : null,
    sourcePromptHash: ref.sourcePromptHash ? bounded(ref.sourcePromptHash, 120) : null,
    sourcePayloadHash: ref.sourcePayloadHash ? bounded(ref.sourcePayloadHash, 120) : null,
    runtimeJobId: ref.runtimeJobId ? bounded(ref.runtimeJobId, 180) : null,
    workflowId: ref.workflowId ? bounded(ref.workflowId, 180) : null,
    graphId: ref.graphId ? bounded(ref.graphId, 180) : null,
    nodeId: ref.nodeId ? bounded(ref.nodeId, 180) : null,
    commitmentIds: unique(ref.commitmentIds, 12, 140),
    targetRefs: unique(ref.targetRefs, 16, 180),
    scopeSummary: bounded(ref.scopeSummary, 180),
    stalenessPolicy: bounded(ref.stalenessPolicy, 160),
    reasonCodes: unique(ref.reasonCodes, 12, 140),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonHash(value: unknown): string {
  return `sha256:${sha256(JSON.stringify(value))}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? unique(
        value.map((item) => (typeof item === "string" ? item : null)),
        max,
      )
    : [];
}

function contextSnapshotArray(value: unknown): ContextSnapshotRef[] {
  return Array.isArray(value)
    ? value
        .map((item) => ContextSnapshotRefSchema.safeParse(item))
        .filter((result): result is { success: true; data: ContextSnapshotRef } => result.success)
        .map((result) => result.data)
        .slice(0, 120)
    : [];
}

function checkpointArtifactRef(input: {
  runtimeJobId: string;
  graphId: string;
  checkpointKind: BoundaryReplayCheckpointKind;
  checkpointId: string;
}): string {
  return `runtime-job://${input.runtimeJobId}/boundary-replay/${input.graphId}/${input.checkpointKind}/${input.checkpointId}`;
}

export function buildBoundaryReplayCheckpoint(input: {
  checkpointId?: string;
  checkpointKind: BoundaryReplayCheckpointKind;
  workflowId: string;
  runtimeJobId: string;
  graphId: string;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  boundaryInputHash?: string | null;
  boundaryOutputHash?: string | null;
  repoRevision?: string | null;
  worktreeFingerprint?: string | null;
  authorityPolicyRef?: string | null;
  upstreamArtifactRefs?: string[];
  acceptedArtifactRefs?: string[];
  staleArtifactRefs?: string[];
  rejectedArtifactRefs?: string[];
  contextSnapshotRefs?: ContextSnapshotRef[];
  currentNodeIds?: string[];
  currentCommitmentIds?: string[];
  openCommitmentIds?: string[];
  satisfiedCommitmentIds?: string[];
  replayStartPolicy?: BoundaryReplayCheckpoint["replayStartPolicy"];
  replaySafetyStatus?: BoundaryReplayCheckpoint["replaySafetyStatus"];
  replayFreshnessStatus?: BoundaryReplayCheckpoint["replayFreshnessStatus"];
  replayContinuationMode?: BoundaryReplayCheckpoint["replayContinuationMode"];
  reasonCodes?: string[];
}): BoundaryReplayCheckpoint {
  const fingerprint = sha256(
    JSON.stringify({
      checkpointKind: input.checkpointKind,
      workflowId: input.workflowId,
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      acceptedArtifactRefs: unique(input.acceptedArtifactRefs ?? [], 40),
      currentNodeIds: unique(input.currentNodeIds ?? [], 40),
      currentCommitmentIds: unique(input.currentCommitmentIds ?? [], 40),
    }),
  ).slice(0, 16);
  const originalContextSnapshotRefs = input.contextSnapshotRefs ?? [];
  const contextSnapshotRefs = compactContextSnapshotRefsForCheckpoint(originalContextSnapshotRefs);
  const contextFreshness = validateContextSnapshotFreshness({
    providedRefs: originalContextSnapshotRefs,
    sourcePromptHash: input.sourcePromptHash ?? null,
    sourcePayloadHash: input.sourcePayloadHash ?? null,
  });
  const boundaryInputHash =
    input.boundaryInputHash ??
    jsonHash({
      checkpointKind: input.checkpointKind,
      upstreamArtifactRefs: unique(input.upstreamArtifactRefs ?? [], 80),
      currentNodeIds: unique(input.currentNodeIds ?? [], 60, 180),
      currentCommitmentIds: unique(input.currentCommitmentIds ?? [], 60, 180),
      sourcePromptHash: input.sourcePromptHash ?? null,
      sourcePayloadHash: input.sourcePayloadHash ?? null,
    });
  const boundaryOutputHash =
    input.boundaryOutputHash ??
    jsonHash({
      checkpointKind: input.checkpointKind,
      acceptedArtifactRefs: unique(input.acceptedArtifactRefs ?? [], 80),
      staleArtifactRefs: unique(input.staleArtifactRefs ?? [], 40),
      rejectedArtifactRefs: unique(input.rejectedArtifactRefs ?? [], 40),
      replayContinuationMode: input.replayContinuationMode ?? "continue_scheduler",
    });
  const identityBindingHash = jsonHash({
    checkpointKind: input.checkpointKind,
    workflowId: input.workflowId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    sourcePromptHash: input.sourcePromptHash ?? null,
    sourcePayloadHash: input.sourcePayloadHash ?? null,
    boundaryInputHash,
    boundaryOutputHash,
    repoRevision: input.repoRevision ?? null,
    worktreeFingerprint: input.worktreeFingerprint ?? null,
    authorityPolicyRef: input.authorityPolicyRef ?? null,
  });
  return {
    artifactKind: "boundary_replay_checkpoint",
    schemaVersion: "execution-platform.boundary-replay-checkpoint.v1",
    checkpointId:
      input.checkpointId ??
      `${bounded(input.checkpointKind, 80)}-${bounded(input.runtimeJobId, 80)}-${fingerprint}`,
    checkpointKind: input.checkpointKind,
    workflowId: bounded(input.workflowId, 180),
    runtimeJobId: bounded(input.runtimeJobId, 180),
    graphId: bounded(input.graphId, 180),
    sourcePromptHash: input.sourcePromptHash ? bounded(input.sourcePromptHash, 120) : null,
    sourcePayloadHash: input.sourcePayloadHash ? bounded(input.sourcePayloadHash, 120) : null,
    boundaryInputHash: bounded(boundaryInputHash, 120),
    boundaryOutputHash: bounded(boundaryOutputHash, 120),
    repoRevision: input.repoRevision ? bounded(input.repoRevision, 160) : null,
    worktreeFingerprint: input.worktreeFingerprint ? bounded(input.worktreeFingerprint, 160) : null,
    authorityPolicyRef: input.authorityPolicyRef ? bounded(input.authorityPolicyRef, 220) : null,
    identityBindingHash,
    upstreamArtifactRefs: unique(input.upstreamArtifactRefs ?? [], 80),
    acceptedArtifactRefs: unique(input.acceptedArtifactRefs ?? [], 80),
    staleArtifactRefs: unique(input.staleArtifactRefs ?? [], 40),
    rejectedArtifactRefs: unique(input.rejectedArtifactRefs ?? [], 40),
    contextSnapshotRefs,
    staleContextSnapshotRefs:
      originalContextSnapshotRefs.length > 0 ? contextFreshness.staleRefs.slice(0, 40) : [],
    missingContextSnapshotRefs:
      originalContextSnapshotRefs.length > 0 ? contextFreshness.missingRefs.slice(0, 40) : [],
    rejectedContextSnapshotRefs:
      originalContextSnapshotRefs.length > 0 ? contextFreshness.rejectedRefs.slice(0, 40) : [],
    currentNodeIds: unique(input.currentNodeIds ?? [], 60, 180),
    currentCommitmentIds: unique(input.currentCommitmentIds ?? [], 60, 180),
    openCommitmentIds: unique(input.openCommitmentIds ?? [], 60, 180),
    satisfiedCommitmentIds: unique(input.satisfiedCommitmentIds ?? [], 60, 180),
    replayStartPolicy: input.replayStartPolicy ?? "allowed_from_checkpoint",
    replaySafetyStatus: input.replaySafetyStatus ?? "safe_to_replay",
    replayFreshnessStatus:
      input.replayFreshnessStatus ??
      (originalContextSnapshotRefs.length === 0
        ? "fresh"
        : contextFreshness.freshnessStatus === "fresh"
          ? "fresh"
          : contextFreshness.freshnessStatus === "stale"
            ? "stale"
            : "unknown"),
    replayContinuationMode: input.replayContinuationMode ?? "continue_scheduler",
    reasonCodes: unique(
      [
        ...(input.reasonCodes ?? ["boundary_replay_checkpoint_recorded"]),
        ...(originalContextSnapshotRefs.length > contextSnapshotRefs.length
          ? ["boundary_replay_context_snapshot_refs_compacted"]
          : []),
        ...(!contextFreshness.valid && originalContextSnapshotRefs.length > 0
          ? contextFreshness.reasonCodes
          : []),
      ],
      40,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
  };
}

export function validateBoundaryReplayCheckpoint(checkpoint: BoundaryReplayCheckpoint): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  if (!BOUNDARY_REPLAY_CHECKPOINT_KINDS.includes(checkpoint.checkpointKind)) {
    reasonCodes.push("boundary_replay_checkpoint_kind_invalid");
  }
  if (!checkpoint.runtimeJobId || !checkpoint.graphId || !checkpoint.workflowId) {
    reasonCodes.push("boundary_replay_checkpoint_identity_missing");
  }
  if (!checkpoint.identityBindingHash) {
    reasonCodes.push("boundary_replay_checkpoint_identity_binding_hash_missing");
  }
  if (
    checkpoint.replayStartPolicy === "allowed_from_checkpoint" &&
    (!checkpoint.boundaryInputHash || !checkpoint.boundaryOutputHash)
  ) {
    reasonCodes.push("boundary_replay_checkpoint_boundary_hashes_missing");
  }
  if (
    checkpoint.rawPromptStored ||
    checkpoint.rawResponseStored ||
    checkpoint.rawProviderLogStored ||
    checkpoint.rawToolLogStored ||
    checkpoint.rawCommandLogsStored ||
    checkpoint.rawDbRowsStored ||
    checkpoint.authorityGranted ||
    checkpoint.workQueueLifecycleMutated
  ) {
    reasonCodes.push("boundary_replay_checkpoint_storage_or_authority_flag_invalid");
  }
  if (
    checkpoint.replayStartPolicy === "allowed_from_checkpoint" &&
    checkpoint.replaySafetyStatus !== "safe_to_replay"
  ) {
    reasonCodes.push("boundary_replay_checkpoint_policy_safety_mismatch");
  }
  if (
    checkpoint.replayStartPolicy === "allowed_from_checkpoint" &&
    checkpoint.acceptedArtifactRefs.length === 0
  ) {
    reasonCodes.push("boundary_replay_checkpoint_accepted_artifacts_missing");
  }
  if (
    checkpoint.replayStartPolicy === "allowed_from_checkpoint" &&
    (checkpoint.staleContextSnapshotRefs.length > 0 ||
      checkpoint.missingContextSnapshotRefs.length > 0 ||
      checkpoint.rejectedContextSnapshotRefs.length > 0 ||
      checkpoint.replayFreshnessStatus !== "fresh")
  ) {
    reasonCodes.push("boundary_replay_checkpoint_context_freshness_invalid");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

function checkpointFromArtifact(artifact: RuntimeJobArtifact): BoundaryReplayCheckpoint | null {
  const metadata = asRecord(artifact.metadata);
  if (metadata.artifactKind !== "boundary_replay_checkpoint") {
    return null;
  }
  const checkpointKind = stringValue(metadata.checkpointKind);
  if (
    !checkpointKind ||
    !BOUNDARY_REPLAY_CHECKPOINT_KINDS.includes(checkpointKind as BoundaryReplayCheckpointKind)
  ) {
    return null;
  }
  return {
    artifactKind: "boundary_replay_checkpoint",
    schemaVersion: "execution-platform.boundary-replay-checkpoint.v1",
    checkpointId: stringValue(metadata.checkpointId) ?? artifact.artifactId,
    checkpointKind: checkpointKind as BoundaryReplayCheckpointKind,
    workflowId: stringValue(metadata.workflowId) ?? "",
    runtimeJobId: stringValue(metadata.runtimeJobId) ?? artifact.jobId,
    graphId: stringValue(metadata.graphId) ?? "",
    sourcePromptHash: stringValue(metadata.sourcePromptHash),
    sourcePayloadHash: stringValue(metadata.sourcePayloadHash),
    boundaryInputHash: stringValue(metadata.boundaryInputHash),
    boundaryOutputHash: stringValue(metadata.boundaryOutputHash),
    repoRevision: stringValue(metadata.repoRevision),
    worktreeFingerprint: stringValue(metadata.worktreeFingerprint),
    authorityPolicyRef: stringValue(metadata.authorityPolicyRef),
    identityBindingHash: stringValue(metadata.identityBindingHash) ?? "",
    upstreamArtifactRefs: stringArray(metadata.upstreamArtifactRefs, 80),
    acceptedArtifactRefs: stringArray(metadata.acceptedArtifactRefs, 80),
    staleArtifactRefs: stringArray(metadata.staleArtifactRefs, 40),
    rejectedArtifactRefs: stringArray(metadata.rejectedArtifactRefs, 40),
    contextSnapshotRefs: contextSnapshotArray(metadata.contextSnapshotRefs),
    staleContextSnapshotRefs: stringArray(metadata.staleContextSnapshotRefs, 80),
    missingContextSnapshotRefs: stringArray(metadata.missingContextSnapshotRefs, 80),
    rejectedContextSnapshotRefs: stringArray(metadata.rejectedContextSnapshotRefs, 80),
    currentNodeIds: stringArray(metadata.currentNodeIds, 60),
    currentCommitmentIds: stringArray(metadata.currentCommitmentIds, 60),
    openCommitmentIds: stringArray(metadata.openCommitmentIds, 60),
    satisfiedCommitmentIds: stringArray(metadata.satisfiedCommitmentIds, 60),
    replayStartPolicy:
      metadata.replayStartPolicy === "blocked_until_repair" ||
      metadata.replayStartPolicy === "diagnostic_only"
        ? metadata.replayStartPolicy
        : "allowed_from_checkpoint",
    replaySafetyStatus:
      metadata.replaySafetyStatus === "blocked" || metadata.replaySafetyStatus === "needs_review"
        ? metadata.replaySafetyStatus
        : "safe_to_replay",
    replayFreshnessStatus:
      metadata.replayFreshnessStatus === "stale" || metadata.replayFreshnessStatus === "unknown"
        ? metadata.replayFreshnessStatus
        : "fresh",
    replayContinuationMode:
      metadata.replayContinuationMode === "run_node" ||
      metadata.replayContinuationMode === "repair_boundary" ||
      metadata.replayContinuationMode === "finalize_closeout" ||
      metadata.replayContinuationMode === "diagnostic_only"
        ? metadata.replayContinuationMode
        : "continue_scheduler",
    reasonCodes: stringArray(metadata.reasonCodes, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
  };
}

function latestCheckpointByKind(
  checkpoints: Array<{ artifactRef: string; checkpoint: BoundaryReplayCheckpoint }>,
): Map<
  BoundaryReplayCheckpointKind,
  { artifactRef: string; checkpoint: BoundaryReplayCheckpoint }
> {
  const byKind = new Map<
    BoundaryReplayCheckpointKind,
    { artifactRef: string; checkpoint: BoundaryReplayCheckpoint }
  >();
  for (const item of checkpoints) {
    byKind.set(item.checkpoint.checkpointKind, item);
  }
  return byKind;
}

function checkpointMatchesReplayIdentity(input: {
  checkpoint: BoundaryReplayCheckpoint;
  runtimeJobId: string;
  graphId: string;
  workflowId: string;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  repoRevision?: string | null;
  worktreeFingerprint?: string | null;
  authorityPolicyRef?: string | null;
}): string[] {
  const reasonCodes: string[] = [];
  if (input.checkpoint.runtimeJobId !== input.runtimeJobId) {
    reasonCodes.push("boundary_replay_identity_mismatch:runtime_job_id");
  }
  if (input.checkpoint.graphId !== input.graphId) {
    reasonCodes.push("boundary_replay_identity_mismatch:graph_id");
  }
  if (input.checkpoint.workflowId !== input.workflowId) {
    reasonCodes.push("boundary_replay_identity_mismatch:workflow_id");
  }
  if (input.sourcePromptHash && input.checkpoint.sourcePromptHash !== input.sourcePromptHash) {
    reasonCodes.push("boundary_replay_identity_mismatch:source_prompt_hash");
  }
  if (input.sourcePayloadHash && input.checkpoint.sourcePayloadHash !== input.sourcePayloadHash) {
    reasonCodes.push("boundary_replay_identity_mismatch:source_payload_hash");
  }
  if (input.repoRevision && input.checkpoint.repoRevision !== input.repoRevision) {
    reasonCodes.push("boundary_replay_identity_mismatch:repo_revision");
  }
  if (
    input.worktreeFingerprint &&
    input.checkpoint.worktreeFingerprint !== input.worktreeFingerprint
  ) {
    reasonCodes.push("boundary_replay_identity_mismatch:worktree_fingerprint");
  }
  if (
    input.authorityPolicyRef &&
    input.checkpoint.authorityPolicyRef !== input.authorityPolicyRef
  ) {
    reasonCodes.push("boundary_replay_identity_mismatch:authority_policy_ref");
  }
  return reasonCodes;
}

function checkpointAcceptedForReplay(input: {
  checkpoint: BoundaryReplayCheckpoint;
  runtimeJobId: string;
  graphId: string;
  workflowId: string;
  sourcePromptHash?: string | null;
  sourcePayloadHash?: string | null;
  repoRevision?: string | null;
  worktreeFingerprint?: string | null;
  authorityPolicyRef?: string | null;
}): { accepted: boolean; reasonCodes: string[] } {
  const validation = validateBoundaryReplayCheckpoint(input.checkpoint);
  const reasonCodes = [
    ...validation.reasonCodes,
    ...checkpointMatchesReplayIdentity(input),
    ...(input.checkpoint.replayStartPolicy === "allowed_from_checkpoint"
      ? []
      : ["boundary_replay_checkpoint_not_allowed_from_checkpoint"]),
    ...(input.checkpoint.replaySafetyStatus === "safe_to_replay"
      ? []
      : ["boundary_replay_checkpoint_safety_not_safe"]),
    ...(input.checkpoint.replayFreshnessStatus === "fresh"
      ? []
      : ["boundary_replay_checkpoint_freshness_not_fresh"]),
  ];
  return { accepted: reasonCodes.length === 0, reasonCodes };
}

function continuationActionForCheckpoint(
  checkpoint: BoundaryReplayCheckpoint | null,
  requestedStartBoundary: BoundaryReplayCheckpointKind,
): string {
  if (!checkpoint) {
    return `Repair or regenerate accepted ${requestedStartBoundary} checkpoint before replay.`;
  }
  switch (checkpoint.replayContinuationMode) {
    case "run_node":
      return `Resume production scheduler at ${requestedStartBoundary} and run the recorded ready node(s): ${checkpoint.currentNodeIds.join(", ") || "none recorded"}.`;
    case "repair_boundary":
      return `Resume production scheduler at ${requestedStartBoundary} and repair only the blocked boundary/branch before continuing.`;
    case "finalize_closeout":
      return `Resume production scheduler at ${requestedStartBoundary} and finalize closeout using accepted closeout/finalization refs.`;
    case "diagnostic_only":
      return `Do not execute from ${requestedStartBoundary}; checkpoint is diagnostic-only and requires owner/runtime review.`;
    case "continue_scheduler":
    default:
      return `Continue production scheduler from ${requestedStartBoundary}.`;
  }
}

export class BoundaryReplayService {
  constructor(
    private readonly options: {
      runtimeJobs: RuntimeJobRepository;
      runtimeWorkGraphs: RuntimeWorkGraphRepository;
    },
  ) {}

  async recordCheckpoint(input: {
    runtimeJob: RuntimeJob;
    checkpoint: BoundaryReplayCheckpoint;
  }): Promise<{
    checkpoint: BoundaryReplayCheckpoint;
    artifactRef: string;
    graphCheckpointRef: string;
  }> {
    const validation = validateBoundaryReplayCheckpoint(input.checkpoint);
    const checkpoint =
      validation.valid || input.checkpoint.replayStartPolicy !== "allowed_from_checkpoint"
        ? input.checkpoint
        : {
            ...input.checkpoint,
            replayStartPolicy: "blocked_until_repair" as const,
            replaySafetyStatus: "needs_review" as const,
            reasonCodes: [
              ...input.checkpoint.reasonCodes,
              ...validation.reasonCodes,
              "boundary_replay_checkpoint_recorded_as_blocked",
            ].slice(0, 40),
          };
    const artifactRef = checkpointArtifactRef({
      runtimeJobId: checkpoint.runtimeJobId,
      graphId: checkpoint.graphId,
      checkpointKind: checkpoint.checkpointKind,
      checkpointId: checkpoint.checkpointId,
    });
    const existingArtifacts = await this.options.runtimeJobs.listArtifacts(input.runtimeJob.jobId);
    if (
      !existingArtifacts.some(
        (artifact) =>
          artifact.artifactType === BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE &&
          artifact.uri === artifactRef,
      )
    ) {
      await this.options.runtimeJobs.attachArtifact({
        jobId: input.runtimeJob.jobId,
        artifactType: BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: artifactRef,
        contentType: "application/json",
        sha256: jsonHash(checkpoint),
        metadata: checkpoint as unknown as JsonValue,
      });
    }
    const graphCheckpointId = `boundary-replay-${checkpoint.checkpointId}`.slice(0, 180);
    const existingGraphCheckpoint = (
      await this.options.runtimeWorkGraphs.readGraphSnapshot(checkpoint.graphId)
    )?.checkpoints.find((candidate) => candidate.checkpointId === graphCheckpointId);
    const graphCheckpoint =
      existingGraphCheckpoint ??
      (await this.options.runtimeWorkGraphs.recordCheckpoint({
        checkpointId: graphCheckpointId,
        graphId: checkpoint.graphId,
        checkpointKind: `boundary_replay_${checkpoint.checkpointKind}`,
        stateSummary: `Boundary replay checkpoint ${checkpoint.checkpointKind}: ${checkpoint.replayStartPolicy}; ${checkpoint.replayContinuationMode}.`,
        artifactRefs: [artifactRef, ...checkpoint.acceptedArtifactRefs].slice(0, 20),
      }));
    await this.options.runtimeJobs.recordEvent({
      jobId: input.runtimeJob.jobId,
      eventType: "execution.boundary_replay_checkpoint",
      data: {
        checkpointRef: artifactRef,
        graphCheckpointRef: `runtime-work-graph://checkpoint/${graphCheckpoint.checkpointId}`,
        checkpointKind: checkpoint.checkpointKind,
        replayStartPolicy: checkpoint.replayStartPolicy,
        replaySafetyStatus: checkpoint.replaySafetyStatus,
        replayFreshnessStatus: checkpoint.replayFreshnessStatus,
        replayContinuationMode: checkpoint.replayContinuationMode,
        contextSnapshotRefs: checkpoint.contextSnapshotRefs
          .map((ref) => ref.snapshotRef)
          .slice(0, 40),
        staleContextSnapshotRefs: checkpoint.staleContextSnapshotRefs.slice(0, 40),
        missingContextSnapshotRefs: checkpoint.missingContextSnapshotRefs.slice(0, 40),
        rejectedContextSnapshotRefs: checkpoint.rejectedContextSnapshotRefs.slice(0, 40),
        reasonCodes: checkpoint.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as unknown as JsonValue,
    });
    return {
      checkpoint,
      artifactRef,
      graphCheckpointRef: `runtime-work-graph://checkpoint/${graphCheckpoint.checkpointId}`,
    };
  }

  async listCheckpoints(input: {
    runtimeJobId: string;
    graphId?: string | null;
  }): Promise<Array<{ artifactRef: string; checkpoint: BoundaryReplayCheckpoint }>> {
    const artifacts = await this.options.runtimeJobs.listArtifacts(input.runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === BOUNDARY_REPLAY_CHECKPOINT_ARTIFACT_TYPE)
      .map((artifact) => ({
        artifactRef: artifact.uri,
        checkpoint: checkpointFromArtifact(artifact),
      }))
      .filter(
        (item): item is { artifactRef: string; checkpoint: BoundaryReplayCheckpoint } =>
          Boolean(item.checkpoint) &&
          (!input.graphId || item.checkpoint?.graphId === input.graphId),
      );
  }

  async buildReplayPlan(input: {
    runtimeJobId: string;
    graphId: string;
    workflowId: string;
    requestedStartBoundary: BoundaryReplayCheckpointKind;
    sourcePromptHash?: string | null;
    sourcePayloadHash?: string | null;
    repoRevision?: string | null;
    worktreeFingerprint?: string | null;
    authorityPolicyRef?: string | null;
    contextSnapshotRefs?: ContextSnapshotRef[];
    allowedNodeExecutors?: string[];
    allowedToolKernelFamilies?: string[];
  }): Promise<BoundaryReplayPlan> {
    const checkpoints = await this.listCheckpoints({
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
    });
    const requiredUpstreamCheckpointKinds = BOUNDARY_REPLAY_CHECKPOINT_KINDS.slice(
      0,
      BOUNDARY_REPLAY_CHECKPOINT_KINDS.indexOf(input.requestedStartBoundary) + 1,
    );
    const relevant = checkpoints.filter((item) =>
      requiredUpstreamCheckpointKinds.includes(item.checkpoint.checkpointKind),
    );
    const latestByKind = latestCheckpointByKind(relevant);
    const accepted = requiredUpstreamCheckpointKinds
      .map((kind) => latestByKind.get(kind))
      .filter((item): item is { artifactRef: string; checkpoint: BoundaryReplayCheckpoint } => {
        if (!item) {
          return false;
        }
        return checkpointAcceptedForReplay({
          checkpoint: item.checkpoint,
          runtimeJobId: input.runtimeJobId,
          graphId: input.graphId,
          workflowId: input.workflowId,
          sourcePromptHash: input.sourcePromptHash,
          sourcePayloadHash: input.sourcePayloadHash,
          repoRevision: input.repoRevision,
          worktreeFingerprint: input.worktreeFingerprint,
          authorityPolicyRef: input.authorityPolicyRef,
        }).accepted;
      });
    const acceptedKinds = new Set(accepted.map((item) => item.checkpoint.checkpointKind));
    const missingUpstreamKinds = requiredUpstreamCheckpointKinds.filter(
      (kind) => !acceptedKinds.has(kind),
    );
    const requested = latestByKind.get(input.requestedStartBoundary) ?? null;
    const stale = relevant.filter((item) => item.checkpoint.replayFreshnessStatus === "stale");
    const rejected = relevant.filter((item) => {
      return !checkpointAcceptedForReplay({
        checkpoint: item.checkpoint,
        runtimeJobId: input.runtimeJobId,
        graphId: input.graphId,
        workflowId: input.workflowId,
        sourcePromptHash: input.sourcePromptHash,
        sourcePayloadHash: input.sourcePayloadHash,
        repoRevision: input.repoRevision,
        worktreeFingerprint: input.worktreeFingerprint,
        authorityPolicyRef: input.authorityPolicyRef,
      }).accepted;
    });
    const invalidReasonCodes = [
      ...new Set(
        relevant.flatMap((item) =>
          checkpointAcceptedForReplay({
            checkpoint: item.checkpoint,
            runtimeJobId: input.runtimeJobId,
            graphId: input.graphId,
            workflowId: input.workflowId,
            sourcePromptHash: input.sourcePromptHash,
            sourcePayloadHash: input.sourcePayloadHash,
            repoRevision: input.repoRevision,
            worktreeFingerprint: input.worktreeFingerprint,
            authorityPolicyRef: input.authorityPolicyRef,
          }).reasonCodes.map((code) => `${item.checkpoint.checkpointKind}:${code}`),
        ),
      ),
    ].slice(0, 60);
    const status =
      missingUpstreamKinds.length === 0 && requested
        ? "accepted"
        : requested
          ? "needs_review"
          : "blocked";
    const latestAcceptedCheckpointRef =
      status === "accepted" && requested ? requested.artifactRef : null;
    const exactContinuationMode =
      status === "accepted" && requested ? requested.checkpoint.replayContinuationMode : null;
    const reasonCodes = [
      "boundary_replay_plan_compiled",
      status === "accepted"
        ? "boundary_replay_requested_checkpoint_accepted"
        : status === "needs_review"
          ? "boundary_replay_requested_checkpoint_not_accepted"
          : "boundary_replay_requested_checkpoint_missing",
      ...missingUpstreamKinds.map((kind) => `boundary_replay_upstream_checkpoint_missing:${kind}`),
      ...invalidReasonCodes.slice(0, 12),
    ];
    return {
      artifactKind: "boundary_replay_plan",
      schemaVersion: "execution-platform.boundary-replay-plan.v1",
      planId: `${input.runtimeJobId}:${input.graphId}:${input.requestedStartBoundary}:${sha256(
        JSON.stringify({
          accepted: accepted.map((item) => item.artifactRef),
          stale: stale.map((item) => item.artifactRef),
          rejected: rejected.map((item) => item.artifactRef),
        }),
      ).slice(0, 12)}`,
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      workflowId: input.workflowId,
      requestedStartBoundary: input.requestedStartBoundary,
      status,
      requiredUpstreamCheckpointKinds,
      latestAcceptedCheckpointRef,
      latestAcceptedCheckpointKind:
        status === "accepted" && requested ? requested.checkpoint.checkpointKind : null,
      exactContinuationMode,
      skippedUpstreamCheckpointKinds: status === "accepted" ? requiredUpstreamCheckpointKinds : [],
      resumeFromArtifactRefs:
        status === "accepted" && requested
          ? requested.checkpoint.acceptedArtifactRefs.slice(0, 40)
          : [],
      invalidReasonCodes,
      acceptedCheckpointRefs: accepted.map((item) => item.artifactRef).slice(0, 40),
      staleCheckpointRefs: stale.map((item) => item.artifactRef).slice(0, 40),
      rejectedCheckpointRefs: rejected.map((item) => item.artifactRef).slice(0, 40),
      contextSnapshotRefs: (input.contextSnapshotRefs ?? []).slice(0, 120),
      staleContextSnapshotRefs: [
        ...new Set(relevant.flatMap((item) => item.checkpoint.staleContextSnapshotRefs)),
      ].slice(0, 80),
      missingContextSnapshotRefs: [
        ...new Set(relevant.flatMap((item) => item.checkpoint.missingContextSnapshotRefs)),
      ].slice(0, 80),
      rejectedContextSnapshotRefs: [
        ...new Set(relevant.flatMap((item) => item.checkpoint.rejectedContextSnapshotRefs)),
      ].slice(0, 80),
      allowedRuntimeRepositories: [
        "RuntimeJobRepository",
        "RuntimeWorkGraphRepository",
        "RuntimeToolKernel",
        "WorkflowDefinitionRegistry",
        "WorkflowPluginRegistry",
        "GenericOrchestrationRuntime",
      ],
      allowedNodeExecutors: unique(input.allowedNodeExecutors ?? [], 40, 180),
      allowedToolKernelFamilies: unique(input.allowedToolKernelFamilies ?? [], 40, 180),
      exactContinuationAction:
        status === "accepted"
          ? continuationActionForCheckpoint(
              requested?.checkpoint ?? null,
              input.requestedStartBoundary,
            )
          : `Repair or regenerate accepted ${input.requestedStartBoundary} checkpoint before replay.`,
      stopConditions: [
        "Stop if runtime job id, graph id, workflow id, source prompt hash, or payload hash mismatch.",
        "Stop if checkpoint is stale, rejected, diagnostic-only, missing accepted artifact refs, or carries stale/missing/rejected context snapshots.",
        "Stop if continuation would bypass production scheduler/node executors.",
      ],
      operatorReadbackSummary:
        status === "accepted"
          ? `${input.requestedStartBoundary} checkpoint accepted for production replay continuation through GenericOrchestrationRuntime and RuntimeWorkGraphScheduler.`
          : `${input.requestedStartBoundary} checkpoint is not accepted; replay cannot continue safely.`,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
    };
  }

  async recordReplayPlan(input: {
    runtimeJob: RuntimeJob;
    plan: BoundaryReplayPlan;
  }): Promise<{ plan: BoundaryReplayPlan; artifactRef: string }> {
    const artifactRef = `runtime-job://${input.runtimeJob.jobId}/boundary-replay-plan/${input.plan.graphId}/${input.plan.requestedStartBoundary}/${sha256(input.plan.planId).slice(0, 16)}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.runtimeJob.jobId,
      artifactType: BOUNDARY_REPLAY_PLAN_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: artifactRef,
      contentType: "application/json",
      sha256: jsonHash(input.plan),
      metadata: input.plan as unknown as JsonValue,
    });
    await this.options.runtimeJobs.recordEvent({
      jobId: input.runtimeJob.jobId,
      eventType: "execution.boundary_replay_plan",
      data: {
        planRef: artifactRef,
        requestedStartBoundary: input.plan.requestedStartBoundary,
        status: input.plan.status,
        acceptedCheckpointRefs: input.plan.acceptedCheckpointRefs.slice(0, 20),
        latestAcceptedCheckpointRef: input.plan.latestAcceptedCheckpointRef,
        exactContinuationMode: input.plan.exactContinuationMode,
        exactContinuationAction: input.plan.exactContinuationAction,
        skippedUpstreamCheckpointKinds: input.plan.skippedUpstreamCheckpointKinds,
        resumeFromArtifactRefs: input.plan.resumeFromArtifactRefs.slice(0, 20),
        invalidReasonCodes: input.plan.invalidReasonCodes.slice(0, 40),
        staleCheckpointRefs: input.plan.staleCheckpointRefs.slice(0, 20),
        rejectedCheckpointRefs: input.plan.rejectedCheckpointRefs.slice(0, 20),
        contextSnapshotRefs: input.plan.contextSnapshotRefs
          .map((ref) => ref.snapshotRef)
          .slice(0, 40),
        staleContextSnapshotRefs: input.plan.staleContextSnapshotRefs.slice(0, 40),
        missingContextSnapshotRefs: input.plan.missingContextSnapshotRefs.slice(0, 40),
        rejectedContextSnapshotRefs: input.plan.rejectedContextSnapshotRefs.slice(0, 40),
        reasonCodes: input.plan.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as unknown as JsonValue,
    });
    return { plan: input.plan, artifactRef };
  }

  buildProductionContinuation(input: { plan: BoundaryReplayPlan }): BoundaryReplayContinuation {
    return {
      artifactKind: "boundary_replay_production_continuation",
      schemaVersion: "execution-platform.boundary-replay-continuation.v1",
      runtimeJobId: input.plan.runtimeJobId,
      graphId: input.plan.graphId,
      workflowId: input.plan.workflowId,
      requestedStartBoundary: input.plan.requestedStartBoundary,
      status: input.plan.status,
      runtimeEntryPoint: "GenericOrchestrationRuntime.runSchedulerGraph",
      schedulerEntryPoint: "RuntimeWorkGraphScheduler.run",
      continuationMode: input.plan.exactContinuationMode,
      exactContinuationAction: input.plan.exactContinuationAction,
      skippedUpstreamCheckpointKinds: input.plan.skippedUpstreamCheckpointKinds,
      resumeFromArtifactRefs: input.plan.resumeFromArtifactRefs,
      acceptedCheckpointRefs: input.plan.acceptedCheckpointRefs,
      requiredRuntimeRepositories: input.plan.allowedRuntimeRepositories,
      allowedNodeExecutors: input.plan.allowedNodeExecutors,
      allowedToolKernelFamilies: input.plan.allowedToolKernelFamilies,
      stopConditions: input.plan.stopConditions,
      reasonCodes: [
        ...(input.plan.status === "accepted"
          ? ["boundary_replay_production_continuation_accepted"]
          : ["boundary_replay_production_continuation_not_accepted"]),
        ...input.plan.reasonCodes,
      ].slice(0, 60),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
    };
  }

  async recordProductionContinuation(input: {
    runtimeJob: RuntimeJob;
    continuation: BoundaryReplayContinuation;
  }): Promise<{ continuation: BoundaryReplayContinuation; artifactRef: string }> {
    const artifactRef = `runtime-job://${input.runtimeJob.jobId}/boundary-replay-continuation/${input.continuation.graphId}/${input.continuation.requestedStartBoundary}/${sha256(
      JSON.stringify(input.continuation),
    ).slice(0, 16)}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.runtimeJob.jobId,
      artifactType: "execution.boundary_replay_continuation",
      storageKind: "metadata",
      uri: artifactRef,
      contentType: "application/json",
      sha256: jsonHash(input.continuation),
      metadata: input.continuation as unknown as JsonValue,
    });
    await this.options.runtimeJobs.recordEvent({
      jobId: input.runtimeJob.jobId,
      eventType: "execution.boundary_replay_continuation",
      data: {
        continuationRef: artifactRef,
        requestedStartBoundary: input.continuation.requestedStartBoundary,
        status: input.continuation.status,
        runtimeEntryPoint: input.continuation.runtimeEntryPoint,
        schedulerEntryPoint: input.continuation.schedulerEntryPoint,
        exactContinuationMode: input.continuation.continuationMode,
        exactContinuationAction: input.continuation.exactContinuationAction,
        skippedUpstreamCheckpointKinds: input.continuation.skippedUpstreamCheckpointKinds,
        resumeFromArtifactRefs: input.continuation.resumeFromArtifactRefs.slice(0, 20),
        acceptedCheckpointRefs: input.continuation.acceptedCheckpointRefs.slice(0, 20),
        reasonCodes: input.continuation.reasonCodes.slice(0, 40),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as unknown as JsonValue,
    });
    return { continuation: input.continuation, artifactRef };
  }
}
