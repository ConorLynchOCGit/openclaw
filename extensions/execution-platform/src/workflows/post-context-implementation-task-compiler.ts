import type { EvidenceMode, ExecutionIntent } from "./execution-intent.ts";
import {
  buildImplementationTaskPacket,
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskFileSnapshot,
  type ImplementationTaskFileChangeIntent,
  type ImplementationTaskNewFileIntent,
  type ImplementationTaskPacket,
} from "./mission-work-packets.ts";

export type PostContextImplementationTaskCompileStatus =
  | "accepted"
  | "split_required"
  | "context_repair_required"
  | "needs_review";

export type PostContextImplementationTaskCompileResult = {
  status: PostContextImplementationTaskCompileStatus;
  packets: ImplementationTaskPacket[];
  reasonCodes: string[];
  blockerSummary: string | null;
  missingFields: string[];
  splitPlan: Array<{
    packetRef: string;
    targetFileRefs: string[];
    targetCommitmentIds: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type PostContextImplementationTaskCompilerInput = {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  workUnitId?: string | null;
  nodeTitle?: string | null;
  executionIntent?: ExecutionIntent | null;
  evidenceMode?: EvidenceMode[];
  exactEditObjective: string;
  taskSummary: string;
  expectedOutput?: string | null;
  expectedPatchShape?: string | null;
  whyThisWorkerWasSelected?: string | null;
  targetCommitmentIds: string[];
  targetFileRefs: string[];
  readableFileRefs: string[];
  missingFileRefs: string[];
  targetFileSnapshots: ImplementationTaskFileSnapshot[];
  newFileIntents?: ImplementationTaskNewFileIntent[];
  fileChangeIntents?: ImplementationTaskFileChangeIntent[];
  allowedFileRefs: string[];
  deniedFileRefs?: string[];
  contextPacketRefs: string[];
  sourceCommitmentPacketRefs?: string[];
  sourceContextHandoffRefs?: string[];
  sourcePromptExcerptRefs: string[];
  contextSynthesisRefs: string[];
  priorNodeOutputRefs: string[];
  validationCommandRefs: string[];
  validationDiscoveryPlan?: string[];
  acceptanceCriteria: string[];
  expectedEvidenceClaimKinds?: string[];
  evidenceClaimExpectations?: string[];
  stopIfMissingOrEscalate?: string[];
  budgetPolicyRefs?: string[];
  capabilityFit?: string | null;
  costAndEscalationPolicy?: string | null;
  downstreamConsumer?: string | null;
  successEvidenceDescriptions?: string[];
  existingApisAndTypes?: string[];
  knownTests?: string[];
  dependencyNotes?: string[];
  riskAndBlastRadius?: string[];
};

function bounded(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function unique(values: readonly string[] | undefined, max: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values ?? []) {
    const normalized = typeof value === "string" ? value.trim() : "";
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

function parentDirectory(fileRef: string): string {
  const normalized = fileRef.replaceAll("\\", "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
}

function splitReadableRefs(fileRefs: string[]): string[][] {
  if (fileRefs.length <= 6) {
    return [fileRefs];
  }
  const byDirectory = new Map<string, string[]>();
  for (const fileRef of fileRefs) {
    const key = parentDirectory(fileRef);
    byDirectory.set(key, [...(byDirectory.get(key) ?? []), fileRef]);
  }
  const groups = [...byDirectory.values()].toSorted((a, b) => b.length - a.length);
  if (groups.length <= 1) {
    const chunks: string[][] = [];
    for (let index = 0; index < fileRefs.length; index += 4) {
      chunks.push(fileRefs.slice(index, index + 4));
    }
    return chunks;
  }
  return groups.flatMap((group) => {
    if (group.length <= 6) {
      return [group];
    }
    const chunks: string[][] = [];
    for (let index = 0; index < group.length; index += 4) {
      chunks.push(group.slice(index, index + 4));
    }
    return chunks;
  });
}

function normalizeFileChangeIntents(
  intents: readonly ImplementationTaskFileChangeIntent[] | undefined,
  allowedFileRefs: readonly string[],
): ImplementationTaskFileChangeIntent[] {
  const allowed = new Set(allowedFileRefs);
  const seen = new Set<string>();
  const output: ImplementationTaskFileChangeIntent[] = [];
  for (const intent of intents ?? []) {
    const fileRef = typeof intent.fileRef === "string" ? intent.fileRef.trim() : "";
    if (!fileRef || !allowed.has(fileRef)) {
      continue;
    }
    const key = `${fileRef}:${intent.symbolOrRegion}:${intent.intendedChange}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      fileRef,
      symbolOrRegion: bounded(intent.symbolOrRegion, 260),
      intendedChange: bounded(intent.intendedChange, 900),
      whyThisFile: bounded(intent.whyThisFile, 900),
    });
    if (output.length >= Math.min(allowedFileRefs.length, 120)) {
      break;
    }
  }
  return output;
}

export function compilePostContextImplementationTaskPackets(
  input: PostContextImplementationTaskCompilerInput,
): PostContextImplementationTaskCompileResult {
  const reasonCodes = ["post_context_implementation_task_compiler_used"];
  const missingFields: string[] = [];
  const executionIntent = input.executionIntent ?? "unspecified";
  const evidenceMode =
    input.evidenceMode ??
    (executionIntent === "source_edit"
      ? (["changed_file_evidence", "validation_evidence"] as EvidenceMode[])
      : ([] as EvidenceMode[]));
  const readableFileRefs = unique(input.readableFileRefs, 80);
  const requestedTargetFileRefs = unique(input.targetFileRefs, 120);
  const readableFileRefSet = new Set(readableFileRefs);
  const targetCommitmentIds = unique(input.targetCommitmentIds, 16);
  const validationCommandRefs = unique(input.validationCommandRefs, 16);
  const validationDiscoveryPlan = unique(input.validationDiscoveryPlan, 12);
  const contextPacketRefs = unique(input.contextPacketRefs, 40);
  const acceptanceCriteria = unique(input.acceptanceCriteria, 16);
  const newFileIntents = (input.newFileIntents ?? []).filter(
    (intent) =>
      input.allowedFileRefs.includes(intent.fileRef) ||
      input.targetFileRefs.includes(intent.fileRef),
  );
  const newFileRefs = unique(
    newFileIntents.map((intent) => intent.fileRef),
    40,
  );
  const existingExecutableFileRefs =
    requestedTargetFileRefs.length > 0
      ? requestedTargetFileRefs.filter((ref) => readableFileRefSet.has(ref))
      : readableFileRefs;
  const missingRequestedTargetFileRefs =
    requestedTargetFileRefs.length > 0
      ? requestedTargetFileRefs.filter(
          (ref) => !readableFileRefSet.has(ref) && !newFileRefs.includes(ref),
        )
      : [];
  const missingFileRefs = unique([...input.missingFileRefs, ...missingRequestedTargetFileRefs], 80);
  const executableFileRefs = unique([...existingExecutableFileRefs, ...newFileRefs], 120);
  const targetFileSnapshots = input.targetFileSnapshots.filter((snapshot) =>
    executableFileRefs.includes(snapshot.fileRef),
  );
  const fileChangeIntents = normalizeFileChangeIntents(input.fileChangeIntents, executableFileRefs);
  const semanticIntentRefs = new Set([
    ...fileChangeIntents.map((intent) => intent.fileRef),
    ...newFileRefs,
  ]);
  const multiFileOrMultiCommitment =
    executableFileRefs.length > 1 || targetCommitmentIds.length > 1;

  if (targetCommitmentIds.length === 0) {
    missingFields.push("targetCommitmentIds");
    reasonCodes.push("post_context_task_commitment_mapping_missing");
  }
  if (executionIntent === "unspecified") {
    missingFields.push("executionIntent");
    reasonCodes.push("post_context_task_execution_intent_missing");
  }
  if (executionIntent !== "unspecified" && executionIntent !== "source_edit") {
    missingFields.push("executionIntent");
    reasonCodes.push("post_context_task_execution_intent_not_edit_required");
  }
  if (!evidenceMode.includes("changed_file_evidence")) {
    missingFields.push("evidenceMode.changed_file_evidence");
    reasonCodes.push("post_context_task_changed_file_evidence_mode_missing");
  }
  if (contextPacketRefs.length === 0) {
    missingFields.push("contextPacketRefs");
    reasonCodes.push("post_context_task_context_handoff_missing");
  }
  if (executableFileRefs.length === 0) {
    missingFields.push("readableFileRefs");
    reasonCodes.push("post_context_task_readable_file_snapshots_missing");
  }
  if (missingFileRefs.length > 0) {
    reasonCodes.push("post_context_task_missing_target_refs_block_execution");
  }
  if (validationCommandRefs.length === 0 && validationDiscoveryPlan.length === 0) {
    missingFields.push("validationCommandRefs|validationDiscoveryPlan");
    reasonCodes.push("post_context_task_validation_plan_missing");
  }
  if (acceptanceCriteria.length === 0) {
    missingFields.push("acceptanceCriteria");
    reasonCodes.push("post_context_task_acceptance_criteria_missing");
  }
  if (multiFileOrMultiCommitment && fileChangeIntents.length === 0) {
    if (newFileRefs.length === 0) {
      missingFields.push("fileChangeIntents");
      reasonCodes.push("post_context_task_semantic_microtask_refinement_required");
    }
  }
  if (executableFileRefs.length > 1) {
    const uncoveredTargetRefs = executableFileRefs.filter((ref) => !semanticIntentRefs.has(ref));
    if (uncoveredTargetRefs.length > 0) {
      missingFields.push("fileChangeIntents.coverage");
      reasonCodes.push("post_context_task_file_change_intent_coverage_missing");
    }
  }

  if (missingFields.length > 0 || missingFileRefs.length > 0) {
    return {
      status: "context_repair_required",
      packets: [],
      reasonCodes,
      blockerSummary:
        "Implementation task packet compilation blocked before worker invocation because context, semantic file-change intent, target snapshots, validation, or commitment mapping is incomplete.",
      missingFields,
      splitPlan: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  const chunks = splitReadableRefs(executableFileRefs);
  if (chunks.length > 1) {
    reasonCodes.push("post_context_task_split_required_for_file_resolved_microtasks");
  }
  const packets = chunks.map((fileRefs, index) => {
    const titleSuffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return buildImplementationTaskPacket({
      runtimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      sourceGraphNodeId: input.nodeId,
      sourceWorkUnitId: input.workUnitId ?? input.nodeId,
      microtaskId: `${input.nodeId}:implementation-task:${index + 1}`,
      microtaskTitle: bounded(
        `${input.nodeTitle ?? "Scoped implementation task"}${titleSuffix}`,
        300,
      ),
      executionIntent,
      evidenceMode,
      exactEditObjective: input.exactEditObjective,
      taskSummary: input.taskSummary,
      whyThisWorkerWasSelected:
        input.whyThisWorkerWasSelected ??
        "The scheduler selected this worker for a bounded, file-resolved implementation task after context handoff.",
      expectedOutput:
        input.expectedOutput ??
        "Changed-file refs, validation refs, and commitment-linked evidence claims.",
      expectedPatchShape:
        input.expectedPatchShape ??
        "Apply bounded source edits only to the listed file snapshots and produce validation/evidence refs.",
      targetCommitmentIds,
      targetFileRefs: fileRefs,
      targetFileSnapshots: targetFileSnapshots.filter((snapshot) =>
        fileRefs.includes(snapshot.fileRef),
      ),
      newFileIntents: newFileIntents.filter((intent) => fileRefs.includes(intent.fileRef)),
      fileChangeIntents: fileChangeIntents.filter((intent) => fileRefs.includes(intent.fileRef)),
      allowedFileRefs: unique([...input.allowedFileRefs, ...fileRefs], 80),
      allowedEditScope: fileRefs,
      mustReadRefs: fileRefs,
      likelyModifyRefs: fileRefs,
      deniedFileRefs: input.deniedFileRefs ?? [],
      contextPacketRefs,
      sourceCommitmentPacketRefs: input.sourceCommitmentPacketRefs ?? [],
      sourceContextHandoffRefs: input.sourceContextHandoffRefs ?? contextPacketRefs,
      sourcePromptExcerptRefs: input.sourcePromptExcerptRefs,
      contextSynthesisRefs: input.contextSynthesisRefs,
      priorNodeOutputRefs: input.priorNodeOutputRefs,
      validationCommandRefs,
      validationDiscoveryPlan,
      acceptanceCriteria,
      expectedEvidenceClaimKinds: input.expectedEvidenceClaimKinds ?? [
        "source_change",
        "test_validation",
      ],
      evidenceClaimExpectations:
        input.evidenceClaimExpectations ?? input.successEvidenceDescriptions ?? acceptanceCriteria,
      stopIfMissingOrEscalate: input.stopIfMissingOrEscalate ?? [
        "Request context repair before editing if any target snapshot is missing or stale.",
        "Escalate to a stronger worker only after bounded non-Codex repair cannot produce safe edits.",
      ],
      budgetPolicyRefs: input.budgetPolicyRefs ?? [
        "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
      ],
      capabilityFit:
        input.capabilityFit ??
        "Selected by post-context scheduler policy as a concrete file-resolved implementation task.",
      costAndEscalationPolicy:
        input.costAndEscalationPolicy ??
        "Use the cheapest sufficiently capable implementation lane and escalate only with explicit evidence.",
      downstreamConsumer: input.downstreamConsumer ?? "validation_and_review",
      successEvidenceDescriptions: input.successEvidenceDescriptions ?? acceptanceCriteria,
      existingApisAndTypes: input.existingApisAndTypes ?? [],
      knownTests: input.knownTests ?? [],
      dependencyNotes: input.dependencyNotes ?? [],
      riskAndBlastRadius: input.riskAndBlastRadius ?? [],
    });
  });

  const invalidPackets = packets
    .map((packet) => ({ packet, validation: validateImplementationTaskPacketForWorker(packet) }))
    .filter((entry) => entry.validation.status !== "ready");
  if (invalidPackets.length > 0) {
    return {
      status: "needs_review",
      packets,
      reasonCodes: [
        ...reasonCodes,
        "post_context_task_packet_validation_failed",
        ...unique(
          invalidPackets.flatMap((entry) => entry.validation.reasonCodes),
          30,
        ),
      ],
      blockerSummary:
        "Runtime compiled implementation task packets, but at least one packet was not worker-ready.",
      missingFields: invalidPackets.flatMap((entry) => entry.validation.reasonCodes),
      splitPlan: packets.map((packet) => ({
        packetRef: packet.packetRef,
        targetFileRefs: packet.targetFileRefs,
        targetCommitmentIds: packet.targetCommitmentIds,
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  return {
    status: chunks.length > 1 ? "split_required" : "accepted",
    packets,
    reasonCodes,
    blockerSummary:
      chunks.length > 1
        ? "The node resolves to multiple concrete implementation tasks; scheduler should materialize one executable worker node per packet."
        : null,
    missingFields: [],
    splitPlan: packets.map((packet) => ({
      packetRef: packet.packetRef,
      targetFileRefs: packet.targetFileRefs,
      targetCommitmentIds: packet.targetCommitmentIds,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
