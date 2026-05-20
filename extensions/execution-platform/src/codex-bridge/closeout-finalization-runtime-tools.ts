import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolKernel,
  RuntimeToolKernelInvokeResult,
} from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolAuthorityClass,
  RuntimeToolExecutor,
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";

export const CLOSEOUT_FINALIZATION_RUNTIME_TOOL_IDS = [
  "closeout.collect_evidence_packet",
  "closeout.review_mission_completion",
  "closeout.review_workflow_evidence_profile",
  "closeout.review_validation_qa_evidence",
  "closeout.review_tool_trace_coverage",
  "closeout.review_work_queue_readback",
  "closeout.review_maximality",
  "closeout.compile_finalization_handoff",
  "closeout.accept_finalization",
  "closeout.reject_finalization",
] as const;

export type CloseoutFinalizationRuntimeToolId =
  (typeof CLOSEOUT_FINALIZATION_RUNTIME_TOOL_IDS)[number];

export type CloseoutFinalizationToolInvocationSummary = {
  toolId: CloseoutFinalizationRuntimeToolId;
  invocationRef: string;
  status: RuntimeToolStatus;
  outputRef: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
};

export type CloseoutEvidencePacket = {
  artifactKind: "closeout_finalization_evidence_packet";
  packetRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeIds: string[];
  missionLedgerRefs: string[];
  acceptedCommitmentIds: string[];
  openCommitmentIds: string[];
  rejectedCommitmentIds: string[];
  workflowEvidenceProfileRef: string | null;
  workflowEvidenceProfileAccepted: boolean;
  validationRequired: boolean;
  validationQaEvidencePacketRefs: string[];
  validationRefs: string[];
  runtimeExecutionSpanRefs: string[];
  runtimeToolInvocationRefs: string[];
  workerToolTraceRefs: string[];
  sourceChangeRefs: string[];
  reviewRefs: string[];
  workQueueReadbackRefs: string[];
  closeoutCapsuleRef: string | null;
  closeoutSource: "model" | "degraded_system_fallback" | "unknown";
  closeoutTaskSuccess: string | null;
  completionReviewRef: string | null;
  completionReviewAccepted: boolean;
  limitationRefs: string[];
  artifactIndexRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogsStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
  runtimeLifecycleMutated: false;
  authorityGranted: false;
  controlsApplied: false;
};

export type CloseoutFinalizationHandoff = {
  artifactKind: "closeout_finalization_handoff";
  handoffRef: string;
  evidencePacketRef: string;
  closeoutCapsuleRef: string;
  acceptedFinalizationToolRefs: string[];
  missingEvidenceRefs: string[];
  missingEvidenceReasonCodes: string[];
  maximalityReviewSummary: string;
  limitationsSummary: string;
  eli5Summary: string;
  recommendedNextAction: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

type CloseoutFinalizationToolConfig = {
  family: RuntimeToolFamily;
  authorityClass: RuntimeToolAuthorityClass;
  schemaRef: string;
};

const CLOSEOUT_FINALIZATION_TOOL_CONFIG: Record<
  CloseoutFinalizationRuntimeToolId,
  CloseoutFinalizationToolConfig
> = Object.fromEntries(
  CLOSEOUT_FINALIZATION_RUNTIME_TOOL_IDS.map((toolId) => [
    toolId,
    {
      family: "closeout.finalize",
      authorityClass: "bounded_runtime_write",
      schemaRef: `runtime-tool://closeout-finalization/${toolId.replace("closeout.", "").replaceAll("_", "-")}/v1`,
    } satisfies CloseoutFinalizationToolConfig,
  ]),
) as Record<CloseoutFinalizationRuntimeToolId, CloseoutFinalizationToolConfig>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bounded(value: string, max = 1_200): string {
  return value.trim().slice(0, max);
}

function uniqueBounded(values: readonly string[] | undefined, max: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function stringArray(value: JsonValue | undefined, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .slice(0, maxItems)
    : [];
}

function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function packetFromMetadata(metadata: Record<string, JsonValue>): CloseoutEvidencePacket | null {
  const packet = metadata.evidencePacket;
  if (packet && typeof packet === "object" && !Array.isArray(packet)) {
    const record = packet as Record<string, JsonValue>;
    if (record.artifactKind === "closeout_finalization_evidence_packet") {
      return record as unknown as CloseoutEvidencePacket;
    }
  }
  if (metadata.artifactKind === "closeout_finalization_evidence_packet") {
    return metadata as unknown as CloseoutEvidencePacket;
  }
  return null;
}

function missingEvidenceReasonCodes(packet: CloseoutEvidencePacket | null): string[] {
  if (!packet) {
    return ["closeout_finalization_evidence_packet_missing"];
  }
  return [
    ...(packet.missionLedgerRefs.length > 0
      ? []
      : ["closeout_finalization_mission_ledger_missing"]),
    ...(packet.workflowEvidenceProfileRef && packet.workflowEvidenceProfileAccepted
      ? []
      : ["closeout_finalization_workflow_evidence_profile_missing_or_rejected"]),
    ...(packet.validationRequired &&
    packet.validationQaEvidencePacketRefs.length === 0 &&
    packet.validationRefs.length === 0
      ? ["closeout_finalization_validation_qa_evidence_missing"]
      : []),
    ...(packet.runtimeExecutionSpanRefs.length > 0
      ? []
      : ["closeout_finalization_runtime_execution_span_refs_missing"]),
    ...(packet.runtimeToolInvocationRefs.length > 0
      ? []
      : ["closeout_finalization_runtime_tool_refs_missing"]),
    ...(packet.workQueueReadbackRefs.length > 0
      ? []
      : ["closeout_finalization_work_queue_readback_missing"]),
    ...(packet.closeoutCapsuleRef ? [] : ["closeout_finalization_closeout_capsule_missing"]),
    ...(packet.closeoutSource === "model"
      ? []
      : ["closeout_finalization_model_authored_closeout_missing"]),
    ...(packet.closeoutTaskSuccess === "satisfied"
      ? []
      : ["closeout_finalization_closeout_not_satisfied"]),
    ...(packet.completionReviewRef && packet.completionReviewAccepted
      ? []
      : ["closeout_finalization_completion_review_missing_or_rejected"]),
    ...(packet.openCommitmentIds.length === 0
      ? []
      : ["closeout_finalization_blocking_commitments_open"]),
    ...(packet.rawPromptStored ||
    packet.rawResponseStored ||
    packet.rawProviderLogStored ||
    packet.rawToolLogStored ||
    packet.rawCommandLogsStored ||
    packet.rawDbRowsStored ||
    packet.secretsStored
      ? ["closeout_finalization_raw_storage_rejected"]
      : []),
    ...(packet.authorityGranted ||
    packet.controlsApplied ||
    packet.runtimeLifecycleMutated ||
    packet.workQueueLifecycleMutated
      ? ["closeout_finalization_authority_or_lifecycle_mutation_rejected"]
      : []),
  ];
}

function defaultCloseoutFinalizationExecutor(
  toolId: CloseoutFinalizationRuntimeToolId,
): RuntimeToolExecutor {
  return {
    async execute(input) {
      const metadata = jsonObject(input.metadata);
      const packet = packetFromMetadata(metadata);
      const missing = missingEvidenceReasonCodes(packet);
      const accepting = toolId === "closeout.accept_finalization";
      const rejecting = toolId === "closeout.reject_finalization";
      const status =
        accepting && missing.length > 0
          ? "needs_review"
          : rejecting && missing.length === 0
            ? "needs_review"
            : "succeeded";
      const outputRef =
        accepting && packet?.closeoutCapsuleRef
          ? `runtime-job://${packet.runtimeJobId}/closeout-finalization/accepted`
          : `runtime-tool-output://${input.invocationId ?? toolId}`;
      return {
        status,
        outputRef,
        outputHash: `sha256:${sha256(JSON.stringify({ toolId, metadata, missing }))}`,
        outputSummary:
          accepting && status === "succeeded"
            ? "Closeout finalization accepted from bounded runtime evidence."
            : accepting
              ? "Closeout finalization needs review because required evidence is missing or rejected."
              : rejecting
                ? "Closeout finalization rejection recorded with bounded missing evidence reasons."
                : `${toolId} recorded bounded closeout finalization evidence.`,
        reasonCodes: [
          `${toolId.replaceAll(".", "_")}_recorded`,
          ...(accepting && status === "succeeded" ? ["closeout_finalization_accepted"] : []),
          ...(accepting && status !== "succeeded" ? ["closeout_finalization_not_accepted"] : []),
          ...(rejecting ? ["closeout_finalization_rejected"] : []),
          ...missing,
        ],
        metadata: {
          ...metadata,
          closeoutFinalizationRuntimeToolRecorded: true,
          missingEvidenceReasonCodes: missing,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogsStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        } as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
    },
  };
}

export function buildCloseoutFinalizationRuntimeToolDefinition(
  toolId: CloseoutFinalizationRuntimeToolId,
) {
  const config = CLOSEOUT_FINALIZATION_TOOL_CONFIG[toolId];
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey: `execution-platform.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: 120_000,
    enabled: true,
    metadata: {
      artifactKind: "closeout_finalization_runtime_tool_definition",
      modelJudgesSufficiency: true,
      runtimeOwnsRefsAndAcceptanceShape: true,
      degradedSystemCloseoutSuccessAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
}

export function registerCloseoutFinalizationRuntimeTools(input: {
  registry: RuntimeToolRegistry;
}): void {
  for (const toolId of CLOSEOUT_FINALIZATION_RUNTIME_TOOL_IDS) {
    input.registry.register(
      buildCloseoutFinalizationRuntimeToolDefinition(toolId),
      defaultCloseoutFinalizationExecutor(toolId),
    );
  }
}

export async function invokeCloseoutFinalizationRuntimeTool(input: {
  kernel: RuntimeToolKernel;
  toolId: CloseoutFinalizationRuntimeToolId;
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  roleRef?: string | null;
  modelRef?: string | null;
  providerRef?: string | null;
  idempotencyScope: string;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  metadata?: JsonValue;
}): Promise<CloseoutFinalizationToolInvocationSummary> {
  const result: RuntimeToolKernelInvokeResult = await input.kernel.invoke({
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    roleRef: input.roleRef ?? null,
    modelRef: input.modelRef ?? null,
    providerRef: input.providerRef ?? null,
    idempotencyScope: input.idempotencyScope,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    inputHash: input.inputHash ?? null,
    inputSummary: bounded(input.inputSummary),
    metadata: input.metadata ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  });
  return {
    toolId: input.toolId,
    invocationRef: result.invocationRef,
    status: result.invocation.status,
    outputRef: result.invocation.outputRef,
    reasonCodes: result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
  };
}

export function buildCloseoutEvidencePacket(input: {
  packetRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeIds?: string[];
  missionLedgerRefs?: string[];
  acceptedCommitmentIds?: string[];
  openCommitmentIds?: string[];
  rejectedCommitmentIds?: string[];
  workflowEvidenceProfileRef?: string | null;
  workflowEvidenceProfileAccepted?: boolean;
  validationRequired?: boolean;
  validationQaEvidencePacketRefs?: string[];
  validationRefs?: string[];
  runtimeExecutionSpanRefs?: string[];
  runtimeToolInvocationRefs?: string[];
  workerToolTraceRefs?: string[];
  sourceChangeRefs?: string[];
  reviewRefs?: string[];
  workQueueReadbackRefs?: string[];
  closeoutCapsuleRef?: string | null;
  closeoutSource?: "model" | "degraded_system_fallback" | "unknown";
  closeoutTaskSuccess?: string | null;
  completionReviewRef?: string | null;
  completionReviewAccepted?: boolean;
  limitationRefs?: string[];
  artifactIndexRefs?: string[];
}): CloseoutEvidencePacket {
  return {
    artifactKind: "closeout_finalization_evidence_packet",
    packetRef: input.packetRef,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeIds: uniqueBounded(input.nodeIds, 40),
    missionLedgerRefs: uniqueBounded(input.missionLedgerRefs, 20),
    acceptedCommitmentIds: uniqueBounded(input.acceptedCommitmentIds, 30),
    openCommitmentIds: uniqueBounded(input.openCommitmentIds, 30),
    rejectedCommitmentIds: uniqueBounded(input.rejectedCommitmentIds, 30),
    workflowEvidenceProfileRef: input.workflowEvidenceProfileRef ?? null,
    workflowEvidenceProfileAccepted: input.workflowEvidenceProfileAccepted === true,
    validationRequired: input.validationRequired === true,
    validationQaEvidencePacketRefs: uniqueBounded(input.validationQaEvidencePacketRefs, 20),
    validationRefs: uniqueBounded(input.validationRefs, 30),
    runtimeExecutionSpanRefs: uniqueBounded(input.runtimeExecutionSpanRefs, 50),
    runtimeToolInvocationRefs: uniqueBounded(input.runtimeToolInvocationRefs, 50),
    workerToolTraceRefs: uniqueBounded(input.workerToolTraceRefs, 30),
    sourceChangeRefs: uniqueBounded(input.sourceChangeRefs, 30),
    reviewRefs: uniqueBounded(input.reviewRefs, 30),
    workQueueReadbackRefs: uniqueBounded(input.workQueueReadbackRefs, 20),
    closeoutCapsuleRef: input.closeoutCapsuleRef ?? null,
    closeoutSource: input.closeoutSource ?? "unknown",
    closeoutTaskSuccess: input.closeoutTaskSuccess ?? null,
    completionReviewRef: input.completionReviewRef ?? null,
    completionReviewAccepted: input.completionReviewAccepted === true,
    limitationRefs: uniqueBounded(input.limitationRefs, 20),
    artifactIndexRefs: uniqueBounded(input.artifactIndexRefs, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
    authorityGranted: false,
    controlsApplied: false,
  };
}

export function buildCloseoutFinalizationHandoff(input: {
  handoffRef: string;
  evidencePacket: CloseoutEvidencePacket;
  acceptedFinalizationToolRefs: string[];
  missingEvidenceReasonCodes?: string[];
  maximalityReviewSummary?: string | null;
  limitationsSummary?: string | null;
  eli5Summary?: string | null;
  recommendedNextAction?: string | null;
}): CloseoutFinalizationHandoff {
  const missingReasonCodes =
    input.missingEvidenceReasonCodes ?? missingEvidenceReasonCodes(input.evidencePacket);
  return {
    artifactKind: "closeout_finalization_handoff",
    handoffRef: input.handoffRef,
    evidencePacketRef: input.evidencePacket.packetRef,
    closeoutCapsuleRef: input.evidencePacket.closeoutCapsuleRef ?? "missing",
    acceptedFinalizationToolRefs: uniqueBounded(input.acceptedFinalizationToolRefs, 20),
    missingEvidenceRefs: missingReasonCodes,
    missingEvidenceReasonCodes: missingReasonCodes,
    maximalityReviewSummary: bounded(input.maximalityReviewSummary ?? "Maximality review pending."),
    limitationsSummary: bounded(input.limitationsSummary ?? "No additional limitations recorded."),
    eli5Summary: bounded(
      input.eli5Summary ??
        "OpenClaw checked that the final closeout has the required evidence before calling the work done.",
    ),
    recommendedNextAction: bounded(
      input.recommendedNextAction ??
        (missingReasonCodes.length === 0
          ? "Proceed to the next Work Queue item."
          : "Resolve the missing closeout finalization evidence."),
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function closeoutFinalizationMissingReasonCodes(packet: CloseoutEvidencePacket): string[] {
  return missingEvidenceReasonCodes(packet);
}

export function assertCloseoutFinalizationCanAccept(packet: CloseoutEvidencePacket): void {
  const missing = missingEvidenceReasonCodes(packet);
  if (missing.length > 0) {
    throw new Error(`closeout_finalization_not_acceptable:${missing.join(",")}`);
  }
}

export function summarizeCloseoutFinalizationToolMetadata(metadata: JsonValue | undefined): {
  evidencePacketRef: string | null;
  closeoutCapsuleRef: string | null;
  missingEvidenceReasonCodes: string[];
} {
  const record = jsonObject(metadata);
  const packet = packetFromMetadata(record);
  return {
    evidencePacketRef: packet?.packetRef ?? stringValue(record.evidencePacketRef),
    closeoutCapsuleRef: packet?.closeoutCapsuleRef ?? stringValue(record.closeoutCapsuleRef),
    missingEvidenceReasonCodes: stringArray(record.missingEvidenceReasonCodes, 30),
  };
}
