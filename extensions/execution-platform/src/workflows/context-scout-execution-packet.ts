import { createHash } from "node:crypto";
import { modelTaskPolicyFor } from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { CommitmentWorkPacket } from "./mission-work-packets.ts";
import type {
  SourcePromptContextIndex,
  SourcePromptExcerptDecision,
} from "./source-prompt-context.ts";

export const CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE =
  "execution_platform.context_scout_execution_packet";

export type ContextScoutExecutionPacketCompileStatus = "ready" | "needs_review" | "blocked";

export type ContextScoutBrokerRequestSummary = {
  requestRef: string;
  status: string;
  consumerNodeId: string;
  semanticQuestion: string;
  candidateResourceRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextScoutExecutionPacket = {
  artifactKind: "context_scout_execution_packet";
  schemaVersion: "execution-platform.context-scout-execution-packet.v1";
  packetId: string;
  packetRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  targetNodeIds: string[];
  targetCommitmentIds: string[];
  objectiveSummary: string;
  nodeObjective: string;
  downstreamConsumer: string;
  contextBrokerRequest: ContextScoutBrokerRequestSummary | null;
  commitmentPacketRefs: string[];
  commitmentPacketSummaries: Array<{
    packetRef: string;
    commitmentId: string;
    workerObjective: string;
    contextScoutObjective: string;
    requiredContextQuestions: string[];
    expectedContextScoutOutput: string;
    likelyRepoAreas: string[];
    stopIfMissing: string[];
    acceptanceCriteria: string[];
  }>;
  sourcePrompt: {
    promptHash: string | null;
    promptLength: number | null;
    resolutionStatus: string | null;
    sectionRefs: string[];
    sectionSummaries: Array<{
      sectionRef: string;
      heading: string | null;
      boundedSummary: string;
    }>;
    excerptDecisionRefs: string[];
    providedExcerptSummaries: Array<{
      decisionRef: string;
      sectionRef: string;
      boundedExcerptSummary: string;
      status: "provided" | "denied";
    }>;
    rawPromptStored: false;
  };
  boundedRepoContextRefs: Array<{
    fileRef: string;
    evidenceHash: string;
    boundedSummary: string;
    rawFileContentStored: false;
  }>;
  candidateFileRefs: string[];
  validationCommandRefs: string[];
  requestedOutputShape: "context_scout_handoff_json";
  modelTaskClass: "local_semantic_extraction";
  modelPolicyRef: string;
  providerTimeoutMs: number;
  maxInputBytes: number;
  estimatedPromptBytes: number;
  status: ContextScoutExecutionPacketCompileStatus;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScoutExecutionPacketCompileResult = {
  status: ContextScoutExecutionPacketCompileStatus;
  packet: ContextScoutExecutionPacket;
  prompt: string;
  reasonCodes: string[];
};

export type ContextScoutBoundedRepoContextEntry = {
  fileRef: string;
  evidenceHash: string;
  boundedSummary: string;
  rawFileContentStored: false;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  max: number,
  chars = 260,
): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, chars))
    .slice(0, max);
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 40, chars = 320): string[] {
  return Array.isArray(value)
    ? uniqueStrings(
        value.filter((entry): entry is string => typeof entry === "string"),
        max,
        chars,
      )
    : [];
}

export function contextScoutBrokerRequestSummaryFromMetadata(
  metadata: unknown,
): ContextScoutBrokerRequestSummary | null {
  const record = asRecord(metadata);
  const requestRef =
    typeof record.contextBrokerRequestRef === "string" ? record.contextBrokerRequestRef.trim() : "";
  if (!requestRef) {
    return null;
  }
  return {
    requestRef: bounded(requestRef, 420),
    status:
      typeof record.contextBrokerRequestStatus === "string"
        ? bounded(record.contextBrokerRequestStatus, 120)
        : typeof record.contextBrokerStatus === "string"
          ? bounded(record.contextBrokerStatus, 120)
          : "context_scout_required",
    consumerNodeId:
      typeof record.contextBrokerConsumerNodeId === "string"
        ? bounded(record.contextBrokerConsumerNodeId, 180)
        : typeof record.targetWorkNodeId === "string"
          ? bounded(record.targetWorkNodeId, 180)
          : "unknown_consumer",
    semanticQuestion:
      typeof record.contextBrokerSemanticQuestion === "string"
        ? bounded(record.contextBrokerSemanticQuestion, 1_200)
        : typeof record.exactObjective === "string"
          ? bounded(record.exactObjective, 1_200)
          : "Supply node-scoped context for the target consumer.",
    candidateResourceRefs: stringArray(
      record.contextBrokerCandidateResourceRefs ?? record.targetRefs,
      40,
      320,
    ),
    reasonCodes: stringArray(record.contextBrokerReasonCodes, 40, 180),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function packetRef(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  packetId: string;
}): string {
  return `runtime-job://${input.runtimeJobId}/runtime-work-graph/${input.graphId}/context-scout/execution-packet/${input.nodeId}/${input.packetId}`;
}

function modelPolicySummary(): { policyRef: string; maxInputBytes: number; timeoutMs: number } {
  const policy = modelTaskPolicyFor("local_semantic_extraction");
  return {
    policyRef: policy.policyRef,
    maxInputBytes: policy.maxInputBytes ?? 32_000,
    timeoutMs: policy.timeoutMs,
  };
}

export function deriveContextScoutProviderTimeoutMs(input: {
  nodeBudgetMs: number;
  requestedTimeoutMs?: number | null;
}): { timeoutMs: number; reasonCodes: string[] } {
  const policy = modelPolicySummary();
  const nodeBudgetMs = Math.max(1, Math.floor(input.nodeBudgetMs));
  const requestedTimeoutMs =
    typeof input.requestedTimeoutMs === "number" && Number.isFinite(input.requestedTimeoutMs)
      ? Math.max(1, Math.floor(input.requestedTimeoutMs))
      : policy.timeoutMs;
  return {
    timeoutMs: Math.max(1, Math.min(nodeBudgetMs, requestedTimeoutMs, policy.timeoutMs)),
    reasonCodes: [
      "context_scout_provider_timeout_derived_from_model_task_policy",
      `context_scout_provider_timeout_ms:${Math.max(
        1,
        Math.min(nodeBudgetMs, requestedTimeoutMs, policy.timeoutMs),
      )}`,
      `context_scout_policy_hard_timeout_ms:${policy.timeoutMs}`,
    ],
  };
}

export function buildContextScoutPromptFromExecutionPacket(
  packet: ContextScoutExecutionPacket,
): string {
  return [
    "You are the OpenClaw context_scout node.",
    "Use only bounded runtime-provided evidence from contextScoutExecutionPacket. Do not invent repo paths.",
    "If the packet lacks enough bounded context, request exact missing context in limitations instead of guessing.",
    "Return strict JSON only with relevantFiles, existingPatterns, risks, recommendedEditPoints, validationSuggestions, handoffSummaryForImplementation, confidence, limitations.",
    "A valid handoff must contain model-authored implementation substance tied to the packet objective, not just copied file refs.",
    "Use exact fileRef values from boundedRepoContextRefs for relevantFiles and recommendedEditPoints.",
    "Name specific file areas or symbols from bounded summaries; do not use runtime_verified_context as a symbol.",
    packet.contextBrokerRequest
      ? "This scout was dispatched by a contextBrokerRequest. Answer contextBrokerRequest.semanticQuestion for contextBrokerRequest.consumerNodeId and do not broaden the handoff."
      : "If no contextBrokerRequest is present, keep the handoff scoped to targetNodeIds and target commitments.",
    'Required JSON shape: {"relevantFiles":[{"path":"relative/file.ts","whyRelevant":"why this exact existing file matters","keySymbolsOrFunctions":["symbol or area"]}],"existingPatterns":["concrete pattern from bounded repo summaries"],"risks":["concrete implementation or validation risk"],"recommendedEditPoints":[{"path":"relative/file.ts","symbolOrRegion":"specific symbol or file area","reason":"why downstream worker should inspect or edit it"}],"validationSuggestions":["specific test/build/readback command or check"],"handoffSummaryForImplementation":"detailed worker handoff grounded in the files above","confidence":0.8,"limitations":[]}',
    `contextScoutExecutionPacket: ${JSON.stringify(packet)}`,
  ].join("\n");
}

function trimPacketToBudget(packet: ContextScoutExecutionPacket): ContextScoutExecutionPacket {
  const policy = modelPolicySummary();
  let current = packet;
  let prompt = buildContextScoutPromptFromExecutionPacket(current);
  if (bytes(prompt) <= policy.maxInputBytes) {
    return current;
  }
  const commitmentBudgets = [
    {
      count: 12,
      workerObjectiveChars: 700,
      contextObjectiveChars: 700,
      questionCount: 8,
      outputChars: 520,
      repoAreaCount: 10,
      stopCount: 6,
      acceptanceCount: 8,
    },
    {
      count: 8,
      workerObjectiveChars: 560,
      contextObjectiveChars: 560,
      questionCount: 6,
      outputChars: 420,
      repoAreaCount: 8,
      stopCount: 5,
      acceptanceCount: 6,
    },
    {
      count: 6,
      workerObjectiveChars: 460,
      contextObjectiveChars: 460,
      questionCount: 5,
      outputChars: 360,
      repoAreaCount: 6,
      stopCount: 4,
      acceptanceCount: 5,
    },
    {
      count: 4,
      workerObjectiveChars: 360,
      contextObjectiveChars: 360,
      questionCount: 4,
      outputChars: 300,
      repoAreaCount: 5,
      stopCount: 3,
      acceptanceCount: 4,
    },
    {
      count: 3,
      workerObjectiveChars: 300,
      contextObjectiveChars: 300,
      questionCount: 3,
      outputChars: 240,
      repoAreaCount: 4,
      stopCount: 3,
      acceptanceCount: 3,
    },
    {
      count: 2,
      workerObjectiveChars: 260,
      contextObjectiveChars: 260,
      questionCount: 3,
      outputChars: 220,
      repoAreaCount: 4,
      stopCount: 2,
      acceptanceCount: 3,
    },
    {
      count: 1,
      workerObjectiveChars: 240,
      contextObjectiveChars: 240,
      questionCount: 2,
      outputChars: 200,
      repoAreaCount: 3,
      stopCount: 2,
      acceptanceCount: 2,
    },
  ];
  const repoBudgets = [32, 24, 16, 10, 6];
  const sectionBudgets = [12, 8, 5, 3, 1, 0];
  for (const commitmentBudget of commitmentBudgets) {
    for (const repoBudget of repoBudgets) {
      for (const sectionBudget of sectionBudgets) {
        current = {
          ...packet,
          commitmentPacketSummaries: packet.commitmentPacketSummaries
            .slice(0, commitmentBudget.count)
            .map((summary) => ({
              ...summary,
              workerObjective: bounded(
                summary.workerObjective,
                commitmentBudget.workerObjectiveChars,
              ),
              contextScoutObjective: bounded(
                summary.contextScoutObjective,
                commitmentBudget.contextObjectiveChars,
              ),
              requiredContextQuestions: uniqueStrings(
                summary.requiredContextQuestions,
                commitmentBudget.questionCount,
                220,
              ),
              expectedContextScoutOutput: bounded(
                summary.expectedContextScoutOutput,
                commitmentBudget.outputChars,
              ),
              likelyRepoAreas: uniqueStrings(
                summary.likelyRepoAreas,
                commitmentBudget.repoAreaCount,
                220,
              ),
              stopIfMissing: uniqueStrings(summary.stopIfMissing, commitmentBudget.stopCount, 220),
              acceptanceCriteria: uniqueStrings(
                summary.acceptanceCriteria,
                commitmentBudget.acceptanceCount,
                220,
              ),
            })),
          boundedRepoContextRefs: packet.boundedRepoContextRefs
            .slice(0, repoBudget)
            .map((entry) => ({
              ...entry,
              boundedSummary: bounded(entry.boundedSummary, repoBudget <= 6 ? 420 : 620),
            })),
          candidateFileRefs: packet.candidateFileRefs.slice(0, Math.max(20, repoBudget * 2)),
          sourcePrompt: {
            ...packet.sourcePrompt,
            sectionRefs: packet.sourcePrompt.sectionRefs.slice(0, Math.max(0, sectionBudget)),
            sectionSummaries: packet.sourcePrompt.sectionSummaries
              .slice(0, Math.max(0, sectionBudget))
              .map((section) => ({
                ...section,
                boundedSummary: bounded(section.boundedSummary, sectionBudget <= 3 ? 240 : 320),
              })),
            providedExcerptSummaries: packet.sourcePrompt.providedExcerptSummaries.slice(0, 4),
          },
          reasonCodes: [
            ...packet.reasonCodes,
            "context_scout_execution_packet_budget_compacted_by_runtime",
            `context_scout_execution_packet_commitment_summary_budget:${commitmentBudget.count}`,
            `context_scout_execution_packet_repo_ref_budget:${repoBudget}`,
            `context_scout_execution_packet_source_section_budget:${sectionBudget}`,
          ],
        };
        prompt = buildContextScoutPromptFromExecutionPacket(current);
        if (bytes(prompt) <= policy.maxInputBytes) {
          return {
            ...current,
            estimatedPromptBytes: bytes(prompt),
          };
        }
      }
    }
  }
  return {
    ...current,
    estimatedPromptBytes: bytes(prompt),
    status: "blocked",
    reasonCodes: [
      ...current.reasonCodes,
      "context_scout_execution_packet_exceeds_model_task_policy_after_compaction",
      `context_scout_execution_packet_prompt_bytes:${bytes(prompt)}`,
      `context_scout_execution_packet_max_input_bytes:${policy.maxInputBytes}`,
    ],
  };
}

export function compileContextScoutExecutionPacket(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  targetNodeIds?: string[];
  targetCommitmentIds: string[];
  objectiveSummary: string;
  nodeObjective: string;
  downstreamConsumer?: string | null;
  contextBrokerRequest?: ContextScoutBrokerRequestSummary | null;
  commitmentWorkPackets: CommitmentWorkPacket[];
  sourcePromptContextIndex: SourcePromptContextIndex | null;
  sourcePromptExcerptDecisions?: SourcePromptExcerptDecision[];
  boundedRepoContextIndex: ContextScoutBoundedRepoContextEntry[];
  candidateFileRefs: string[];
  validationCommandRefs: string[];
  nodeBudgetMs: number;
  requestedTimeoutMs?: number | null;
}): ContextScoutExecutionPacketCompileResult {
  const policy = modelPolicySummary();
  const timeout = deriveContextScoutProviderTimeoutMs({
    nodeBudgetMs: input.nodeBudgetMs,
    requestedTimeoutMs: input.requestedTimeoutMs,
  });
  const targetCommitmentIds = uniqueStrings(input.targetCommitmentIds, 24);
  const packetId = sha256Text(
    JSON.stringify({
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      nodeId: input.nodeId,
      targetCommitmentIds,
      commitmentPacketRefs: input.commitmentWorkPackets.map((packet) => packet.packetRef),
      boundedRepoContextRefs: input.boundedRepoContextIndex.map((entry) => entry.fileRef),
    }),
  ).slice(0, 20);
  const ref = packetRef({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    packetId,
  });
  const excerptDecisions = input.sourcePromptExcerptDecisions ?? [];
  const base: ContextScoutExecutionPacket = {
    artifactKind: "context_scout_execution_packet",
    schemaVersion: "execution-platform.context-scout-execution-packet.v1",
    packetId,
    packetRef: ref,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    targetNodeIds: uniqueStrings(input.targetNodeIds ?? [], 24),
    targetCommitmentIds,
    objectiveSummary: bounded(input.objectiveSummary, 1_200),
    nodeObjective: bounded(input.nodeObjective, 1_200),
    downstreamConsumer: bounded(input.downstreamConsumer ?? "implementation_and_validation", 260),
    contextBrokerRequest: input.contextBrokerRequest
      ? {
          requestRef: bounded(input.contextBrokerRequest.requestRef, 420),
          status: bounded(input.contextBrokerRequest.status, 120),
          consumerNodeId: bounded(input.contextBrokerRequest.consumerNodeId, 180),
          semanticQuestion: bounded(input.contextBrokerRequest.semanticQuestion, 1_200),
          candidateResourceRefs: uniqueStrings(
            input.contextBrokerRequest.candidateResourceRefs,
            40,
            320,
          ),
          reasonCodes: uniqueStrings(input.contextBrokerRequest.reasonCodes, 40, 180),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }
      : null,
    commitmentPacketRefs: input.commitmentWorkPackets
      .map((packet) => packet.packetRef)
      .slice(0, 24),
    commitmentPacketSummaries: input.commitmentWorkPackets.slice(0, 12).map((packet) => ({
      packetRef: bounded(packet.packetRef, 320),
      commitmentId: bounded(packet.commitmentId, 160),
      workerObjective: bounded(packet.workerObjective, 900),
      contextScoutObjective: bounded(packet.contextScoutObjective, 900),
      requiredContextQuestions: uniqueStrings(packet.requiredContextQuestions, 10, 260),
      expectedContextScoutOutput: bounded(packet.expectedContextScoutOutput.join(" | "), 700),
      likelyRepoAreas: uniqueStrings(packet.likelyRepoAreas, 16, 260),
      stopIfMissing: uniqueStrings(packet.stopIfMissing, 8, 260),
      acceptanceCriteria: uniqueStrings(packet.acceptanceCriteria, 10, 260),
    })),
    sourcePrompt: {
      promptHash: input.sourcePromptContextIndex?.promptHash ?? null,
      promptLength: input.sourcePromptContextIndex?.promptLength ?? null,
      resolutionStatus: input.sourcePromptContextIndex?.resolutionStatus ?? null,
      sectionRefs:
        input.sourcePromptContextIndex?.sections
          .map((section) => section.sectionRef)
          .slice(0, 16) ?? [],
      sectionSummaries:
        input.sourcePromptContextIndex?.sections.slice(0, 16).map((section) => ({
          sectionRef: bounded(section.sectionRef, 260),
          heading: section.heading ? bounded(section.heading, 180) : null,
          boundedSummary: bounded(section.boundedSummary, 360),
        })) ?? [],
      excerptDecisionRefs: excerptDecisions
        .map((decision) => `source-prompt://${decision.promptHash}/${decision.requestId}`)
        .slice(0, 12),
      providedExcerptSummaries: excerptDecisions.slice(0, 8).map((decision) => ({
        decisionRef: `source-prompt://${decision.promptHash}/${decision.requestId}`,
        sectionRef: bounded(decision.sectionRef, 260),
        boundedExcerptSummary: bounded(decision.boundedExcerptSummary, 500),
        status: decision.status,
      })),
      rawPromptStored: false,
    },
    boundedRepoContextRefs: input.boundedRepoContextIndex.slice(0, 40).map((entry) => ({
      fileRef: bounded(entry.fileRef, 260),
      evidenceHash: bounded(entry.evidenceHash, 90),
      boundedSummary: bounded(entry.boundedSummary, 800),
      rawFileContentStored: false,
    })),
    candidateFileRefs: uniqueStrings(input.candidateFileRefs, 80),
    validationCommandRefs: uniqueStrings(input.validationCommandRefs, 12, 320),
    requestedOutputShape: "context_scout_handoff_json",
    modelTaskClass: "local_semantic_extraction",
    modelPolicyRef: policy.policyRef,
    providerTimeoutMs: timeout.timeoutMs,
    maxInputBytes: policy.maxInputBytes,
    estimatedPromptBytes: 0,
    status: "ready",
    reasonCodes: [
      "context_scout_execution_packet_compiled",
      ...timeout.reasonCodes,
      input.sourcePromptContextIndex
        ? "context_scout_execution_packet_source_prompt_index_ref_used"
        : "context_scout_execution_packet_source_prompt_index_missing",
      input.boundedRepoContextIndex.length > 0
        ? "context_scout_execution_packet_repo_context_refs_ready"
        : "context_scout_execution_packet_repo_context_refs_missing",
      input.contextBrokerRequest
        ? "context_scout_execution_packet_context_broker_request_ref_used"
        : "context_scout_execution_packet_context_broker_request_missing",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const compacted = trimPacketToBudget(base);
  const prompt = buildContextScoutPromptFromExecutionPacket(compacted);
  const status: ContextScoutExecutionPacketCompileStatus =
    compacted.status === "blocked"
      ? "blocked"
      : input.boundedRepoContextIndex.length === 0
        ? "needs_review"
        : "ready";
  const packet: ContextScoutExecutionPacket = {
    ...compacted,
    status,
    estimatedPromptBytes: bytes(prompt),
    reasonCodes: [
      ...compacted.reasonCodes,
      status === "ready"
        ? "context_scout_execution_packet_within_model_task_policy"
        : status === "needs_review"
          ? "context_scout_execution_packet_lacks_repo_context"
          : "context_scout_execution_packet_blocked",
    ],
  };
  return {
    status,
    packet,
    prompt: buildContextScoutPromptFromExecutionPacket(packet),
    reasonCodes: packet.reasonCodes,
  };
}

export function contextScoutExecutionPacketMetadata(
  packet: ContextScoutExecutionPacket,
): JsonValue {
  return {
    packetRef: packet.packetRef,
    packetId: packet.packetId,
    status: packet.status,
    targetCommitmentIds: packet.targetCommitmentIds,
    targetNodeIds: packet.targetNodeIds,
    contextBrokerRequestRef: packet.contextBrokerRequest?.requestRef ?? null,
    contextBrokerStatus: packet.contextBrokerRequest?.status ?? null,
    contextBrokerConsumerNodeId: packet.contextBrokerRequest?.consumerNodeId ?? null,
    contextBrokerReasonCodes: packet.contextBrokerRequest?.reasonCodes ?? [],
    commitmentPacketRefs: packet.commitmentPacketRefs,
    boundedRepoContextRefs: packet.boundedRepoContextRefs.map((entry) => entry.fileRef),
    candidateFileRefs: packet.candidateFileRefs,
    sourcePromptHash: packet.sourcePrompt.promptHash,
    sourcePromptSectionRefs: packet.sourcePrompt.sectionRefs,
    estimatedPromptBytes: packet.estimatedPromptBytes,
    maxInputBytes: packet.maxInputBytes,
    providerTimeoutMs: packet.providerTimeoutMs,
    modelPolicyRef: packet.modelPolicyRef,
    reasonCodes: packet.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}
