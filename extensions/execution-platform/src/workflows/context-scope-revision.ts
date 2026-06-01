import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ResourceRequirementStructuralShardUnitKind } from "./resource-requirement-packet.ts";
import type {
  ContextScoutBoundedRepoContextEntry,
  ContextScoutExecutionPacket,
  ContextScoutExecutionPacketCompileInput,
  ContextScoutProviderInputPreflight,
  ContextScoutSingleUnitOverProfileBlocker,
} from "./context-scout-execution-packet.ts";
import type { SourcePromptContextIndex } from "./source-prompt-context.ts";

export const CONTEXT_SCOPE_REVISION_REQUEST_ARTIFACT_TYPE =
  "execution_platform.resource_scope_revision.request";
export const CONTEXT_SCOPE_REVISION_PROPOSAL_ARTIFACT_TYPE =
  "execution_platform.resource_scope_revision.proposal";
export const CONTEXT_SCOPE_REVISION_DECISION_ARTIFACT_TYPE =
  "execution_platform.resource_scope_revision.decision";
export const CONTEXT_SCOUT_FIELD_REPAIR_REQUEST_ARTIFACT_TYPE =
  "execution_platform.resource.scout.field_repair_request";

export type ContextScopeRevisionLegalWindowKind =
  | "resource_requirement"
  | "bounded_repo_context_ref"
  | "candidate_file_ref"
  | "source_prompt_section_ref"
  | "source_prompt_excerpt_ref"
  | "source_contract_ref"
  | "validation_command_ref";

export type ContextScopeRevisionLegalWindow = {
  windowRef: string;
  sourceRef: string;
  windowKind: ContextScopeRevisionLegalWindowKind;
  declaredShardUnitKind:
    | ResourceRequirementStructuralShardUnitKind
    | "resource_scout_execution_packet";
  resourceRequirementRefs: string[];
  targetCommitmentIds: string[];
  estimatedInputBytes: number;
  boundedDescriptor: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawFileContentStored: false;
};

export type ContextScopeRevisionRequest = {
  artifactKind: "resource_scope_revision_request";
  schemaVersion: "execution-platform.context-scope-revision-request.v1";
  requestRef: string;
  requestId: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  consumerNodeIds: string[];
  workIntentRefs: string[];
  parentPacketRef: string;
  blockerRef: string;
  blockerInputBytes: number;
  blockerMaxInputBytes: number;
  blockerReasonCodes: string[];
  offendingUnitKind:
    | ResourceRequirementStructuralShardUnitKind
    | "resource_scout_execution_packet";
  offendingUnitRefs: string[];
  providerInputPreflight: ContextScoutProviderInputPreflight | null;
  legalCandidateRefs: string[];
  legalWindows: ContextScopeRevisionLegalWindow[];
  resourceRequirementSummaries: Array<{
    resourceRequirementRef: string;
    consumerNodeId: string;
    workIntentRef: string;
    contextPurpose: string;
    semanticQuestions: string[];
    candidateRepoAreaRefs: string[];
    knownTargetRefs: string[];
  }>;
  nextLegalToolIds: Array<
    | "resource.scope.select_legal_subset"
    | "resource.scope.explain_unshardable_unit"
    | "resource.frontier.accept_scope_revision"
    | "resource.scout.request_field_repair"
  >;
  status: "ready" | "blocked";
  reasonCodes: string[];
  semanticScopeChosenByModel: true;
  runtimeSemanticTruncationApplied: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawFileContentStored: false;
};

export type ContextScopeRevisionProposalToolId =
  | "resource.scope.select_legal_subset"
  | "resource.scope.explain_unshardable_unit";

export type ContextScopeRevisionProposal = {
  artifactKind: "resource_scope_revision_proposal";
  schemaVersion: "execution-platform.context-scope-revision-proposal.v1";
  proposalRef: string;
  requestRef: string;
  toolId: ContextScopeRevisionProposalToolId | "invalid";
  selectedWindowRefs: string[];
  selectedSourceRefs: string[];
  scopeRationale: string;
  excludedWindows: Array<{ windowRef: string; reason: string }>;
  unshardableRationale: string | null;
  missingContextRequests: string[];
  limitations: string[];
  confidence: number | null;
  modelAuthoredSemanticChoice: true;
  parseStatus: "parsed" | "repair_required";
  runtimeOwnedFieldViolations: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScopeRevisionDecision = {
  artifactKind: "resource_scope_revision_decision";
  schemaVersion: "execution-platform.context-scope-revision-decision.v1";
  decisionRef: string;
  requestRef: string;
  proposalRef: string;
  status: "accepted" | "repair_required" | "rejected" | "unshardable";
  selectedWindowRefs: string[];
  selectedSourceRefs: string[];
  acceptedLegalWindows: ContextScopeRevisionLegalWindow[];
  estimatedProviderInputBytes: number;
  maxInputBytes: number;
  providerInputBudgetStatus: "accepted" | "blocked" | "not_applicable";
  validationFailures: ContextScoutFieldRepairField[];
  newPacketCompileInputRef: string | null;
  nextLegalTransition:
    | "resource.frontier.accept_scope_revision"
    | "resource.scout.request_field_repair"
    | "scheduler.request_resource_requirement_for_work_intent"
    | "needs_review";
  reasonCodes: string[];
  semanticScopeChosenByModel: true;
  runtimeSemanticTruncationApplied: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawFileContentStored: false;
};

export type ContextScoutFieldRepairField = {
  fieldPath: string;
  reasonCode: string;
  expectedType: string;
  currentValueRef: string | null;
  allowedValueRefs: string[];
  repairInstruction: string;
};

export type ContextScoutFieldRepairRequest = {
  artifactKind: "resource_scout_field_repair_request";
  schemaVersion: "execution-platform.context-scout-field-repair-request.v1";
  repairRequestRef: string;
  failedArtifactRef: string | null;
  failedDecisionRef: string | null;
  inputBundleRef: string | null;
  inputBundleHash: string | null;
  repairFor:
    | "resource_scope_revision"
    | "context_shard_handoff"
    | "resource_scout_output"
    | "provider_diagnostics";
  preserveAcceptedFields: string[];
  acceptedFieldRefs: Array<{ fieldPath: string; valueRef: string }>;
  fieldRepairs: ContextScoutFieldRepairField[];
  legalCandidateRefs: string[];
  legalWindowRefs: string[];
  nextLegalToolIds: Array<
    | "resource.scope.select_legal_subset"
    | "resource.scope.explain_unshardable_unit"
    | "resource.scout.request_field_repair"
    | "resource.scout.submit_shard_handoff"
    | "resource.scout.mark_insufficient_context"
  >;
  status: "repair_required" | "no_repair_required";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawFileContentStored: false;
};

const RUNTIME_OWNED_PROPOSAL_FIELDS = new Set([
  "accepted",
  "acceptedLegalWindows",
  "blockerMaxInputBytes",
  "decisionRef",
  "estimatedProviderInputBytes",
  "graphId",
  "maxInputBytes",
  "newPacketCompileInputRef",
  "nodeId",
  "parentPacketRef",
  "providerInputBudgetStatus",
  "providerInputPreflight",
  "requestRef",
  "runtimeJobId",
  "selectedRefsAfterValidation",
  "semanticScopeChosenByModel",
  "status",
  "workflowId",
]);

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bytes(value: unknown): number {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  max = Number.POSITIVE_INFINITY,
  chars = 420,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = bounded(value, chars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown, max = 80, chars = 420): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value.map((entry) => (typeof entry === "string" ? entry : null)),
    max,
    chars,
  );
}

function confidenceValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(1, value));
}

function scopeRevisionRef(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  kind: "request" | "proposal" | "decision" | "field-repair";
  fingerprint: string;
}): string {
  return `runtime-job://${input.runtimeJobId}/runtime-work-graph/${input.graphId}/context-scope-revision/${input.kind}/${input.nodeId}/${input.fingerprint}`;
}

function proposalObjectFromText(text: string): Record<string, unknown> {
  const source = String(text ?? "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      return asRecord(JSON.parse(candidate));
    } catch {
      // Try the next bounded parse candidate.
    }
  }
  return {};
}

function legalWindow(input: {
  packet: ContextScoutExecutionPacket;
  windowKind: ContextScopeRevisionLegalWindowKind;
  sourceRef: string;
  descriptor: string;
  resourceRequirementRefs?: string[];
  targetCommitmentIds?: string[];
  estimatedInputBytes?: number;
  declaredShardUnitKind:
    | ResourceRequirementStructuralShardUnitKind
    | "resource_scout_execution_packet";
}): ContextScopeRevisionLegalWindow {
  const windowBase = {
    sourceRef: bounded(input.sourceRef, 420),
    windowKind: input.windowKind,
    resourceRequirementRefs: uniqueStrings(input.resourceRequirementRefs ?? [], 40, 420),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds ?? input.packet.targetCommitmentIds, 40, 180),
    estimatedInputBytes: Math.max(
      1,
      Math.floor(input.estimatedInputBytes ?? bytes(input.descriptor)),
    ),
    boundedDescriptor: bounded(input.descriptor, 700),
    declaredShardUnitKind: input.declaredShardUnitKind,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawFileContentStored: false as const,
  };
  return {
    ...windowBase,
    windowRef: `context-scope-window://${hashJson(windowBase).slice(0, 20)}`,
  };
}

export function buildContextScopeRevisionLegalWindows(input: {
  packet: ContextScoutExecutionPacket;
  blocker: ContextScoutSingleUnitOverProfileBlocker;
}): ContextScopeRevisionLegalWindow[] {
  const { packet, blocker } = input;
  const windows: ContextScopeRevisionLegalWindow[] = [];
  const blockerRefs = new Set(blocker.unitRefs);
  const matchingRequirementSummaries =
    blocker.unitKind === "resource_requirement"
      ? packet.resourceRequirementSummaries.filter((summary) =>
          blockerRefs.has(summary.resourceRequirementRef),
        )
      : packet.resourceRequirementSummaries;

  for (const summary of matchingRequirementSummaries) {
    windows.push(
      legalWindow({
        packet,
        windowKind: "resource_requirement",
        sourceRef: summary.resourceRequirementRef,
        resourceRequirementRefs: [summary.resourceRequirementRef],
        targetCommitmentIds: packet.targetCommitmentIds,
        declaredShardUnitKind: blocker.unitKind,
        descriptor: [
          `Context requirement ${summary.resourceRequirementRef}.`,
          `Consumer ${summary.consumerNodeId}.`,
          `Purpose ${summary.contextPurpose}.`,
          `Questions ${summary.semanticQuestions.join(" | ")}.`,
          `Candidate refs ${summary.candidateRepoAreaRefs.join(" | ")}.`,
          `Known targets ${summary.knownTargetRefs.join(" | ")}.`,
        ].join(" "),
      }),
    );
  }

  const requirementCandidateRefs = new Set(
    matchingRequirementSummaries.flatMap((summary) => [
      ...summary.candidateRepoAreaRefs,
      ...summary.knownTargetRefs,
    ]),
  );
  const boundedRepoEntries =
    blocker.unitKind === "bounded_repo_context_ref"
      ? packet.boundedRepoContextRefs.filter((entry) => blockerRefs.has(entry.fileRef))
      : requirementCandidateRefs.size > 0
        ? packet.boundedRepoContextRefs.filter((entry) => requirementCandidateRefs.has(entry.fileRef))
        : packet.boundedRepoContextRefs;
  for (const entry of boundedRepoEntries) {
    windows.push(
      legalWindow({
        packet,
        windowKind: "bounded_repo_context_ref",
        sourceRef: entry.fileRef,
        resourceRequirementRefs: matchingRequirementSummaries
          .filter(
            (summary) =>
              summary.candidateRepoAreaRefs.includes(entry.fileRef) ||
              summary.knownTargetRefs.includes(entry.fileRef),
          )
          .map((summary) => summary.resourceRequirementRef),
        declaredShardUnitKind: blocker.unitKind,
        estimatedInputBytes: bytes(entry),
        descriptor: `Bounded repo context ref ${entry.fileRef}. Summary: ${entry.boundedSummary}`,
      }),
    );
  }

  for (const fileRef of packet.candidateFileRefs) {
    if (
      blocker.unitKind === "bounded_repo_context_ref" &&
      !blockerRefs.has(fileRef)
    ) {
      continue;
    }
    windows.push(
      legalWindow({
        packet,
        windowKind: "candidate_file_ref",
        sourceRef: fileRef,
        declaredShardUnitKind: blocker.unitKind,
        descriptor: `Candidate file ref ${fileRef}.`,
      }),
    );
  }

  for (const section of packet.sourcePrompt.sectionSummaries) {
    if (
      blocker.unitKind === "source_prompt_section_ref" &&
      !blockerRefs.has(section.sectionRef)
    ) {
      continue;
    }
    windows.push(
      legalWindow({
        packet,
        windowKind: "source_prompt_section_ref",
        sourceRef: section.sectionRef,
        declaredShardUnitKind: blocker.unitKind,
        estimatedInputBytes: bytes(section),
        descriptor: `Source prompt section ${section.sectionRef}. Heading ${section.heading ?? "none"}. Summary ${section.boundedSummary}`,
      }),
    );
  }

  for (const excerpt of packet.sourcePrompt.providedExcerptSummaries) {
    windows.push(
      legalWindow({
        packet,
        windowKind: "source_prompt_excerpt_ref",
        sourceRef: excerpt.decisionRef,
        declaredShardUnitKind: blocker.unitKind,
        estimatedInputBytes: bytes(excerpt),
        descriptor: `Source prompt excerpt ${excerpt.decisionRef}. Section ${excerpt.sectionRef}. Summary ${excerpt.boundedExcerptSummary}`,
      }),
    );
  }

  for (const packetRef of packet.sourceContractRefs) {
    windows.push(
      legalWindow({
        packet,
        windowKind: "source_contract_ref",
        sourceRef: packetRef,
        declaredShardUnitKind: blocker.unitKind,
        descriptor: `Commitment work packet ref ${packetRef}.`,
      }),
    );
  }

  for (const validationRef of packet.validationCommandRefs) {
    windows.push(
      legalWindow({
        packet,
        windowKind: "validation_command_ref",
        sourceRef: validationRef,
        declaredShardUnitKind: blocker.unitKind,
        descriptor: `Validation command ref ${validationRef}.`,
      }),
    );
  }

  const seen = new Set<string>();
  return windows.filter((window) => {
    if (seen.has(window.windowRef)) {
      return false;
    }
    seen.add(window.windowRef);
    return true;
  });
}

export function buildContextScopeRevisionRequest(input: {
  packet: ContextScoutExecutionPacket;
  blocker: ContextScoutSingleUnitOverProfileBlocker;
  legalWindows?: ContextScopeRevisionLegalWindow[];
}): ContextScopeRevisionRequest {
  const legalWindows = input.legalWindows ?? buildContextScopeRevisionLegalWindows(input);
  const legalCandidateRefs = uniqueStrings(
    legalWindows.flatMap((window) => [window.sourceRef, window.windowRef]),
    Number.POSITIVE_INFINITY,
    700,
  );
  const workIntentRefs = uniqueStrings(
    input.packet.resourceRequirementSummaries.map((summary) => summary.workIntentRef),
    80,
    420,
  );
  const fingerprint = hashJson({
    blockerRef: input.blocker.blockerRef,
    parentPacketRef: input.packet.packetRef,
    legalWindowRefs: legalWindows.map((window) => window.windowRef),
  }).slice(0, 20);
  const requestId = `${input.packet.nodeId}:context-scope-revision`;
  return {
    artifactKind: "resource_scope_revision_request",
    schemaVersion: "execution-platform.context-scope-revision-request.v1",
    requestId,
    requestRef: scopeRevisionRef({
      runtimeJobId: input.packet.runtimeJobId,
      graphId: input.packet.graphId,
      nodeId: input.packet.nodeId,
      kind: "request",
      fingerprint,
    }),
    runtimeJobId: input.packet.runtimeJobId,
    workflowId: input.packet.workflowId,
    graphId: input.packet.graphId,
    nodeId: input.packet.nodeId,
    consumerNodeIds: input.packet.targetNodeIds.slice(0, 80),
    workIntentRefs,
    parentPacketRef: input.packet.packetRef,
    blockerRef: input.blocker.blockerRef,
    blockerInputBytes: input.blocker.inputBytes,
    blockerMaxInputBytes: input.blocker.maxInputBytes,
    blockerReasonCodes: uniqueStrings(input.blocker.reasonCodes, 100, 220),
    offendingUnitKind: input.blocker.unitKind,
    offendingUnitRefs: uniqueStrings(input.blocker.unitRefs, Number.POSITIVE_INFINITY, 700),
    providerInputPreflight: input.packet.providerInputPreflight ?? null,
    legalCandidateRefs,
    legalWindows,
    resourceRequirementSummaries: input.packet.resourceRequirementSummaries.map((summary) => ({
      resourceRequirementRef: bounded(summary.resourceRequirementRef, 420),
      consumerNodeId: bounded(summary.consumerNodeId, 180),
      workIntentRef: bounded(summary.workIntentRef, 420),
      contextPurpose: bounded(summary.contextPurpose, 180),
      semanticQuestions: uniqueStrings(summary.semanticQuestions, 12, 420),
      candidateRepoAreaRefs: uniqueStrings(summary.candidateRepoAreaRefs, 80, 420),
      knownTargetRefs: uniqueStrings(summary.knownTargetRefs, 80, 420),
    })),
    nextLegalToolIds: [
      "resource.scope.select_legal_subset",
      "resource.scope.explain_unshardable_unit",
      "resource.frontier.accept_scope_revision",
      "resource.scout.request_field_repair",
    ],
    status: legalWindows.length > 0 ? "ready" : "blocked",
    reasonCodes: uniqueStrings(
      [
        "resource_scope_revision_request_compiled",
        "resource_scope_revision_model_must_choose_semantic_subset",
        "resource_scope_revision_runtime_semantic_truncation_disallowed",
        legalWindows.length > 0
          ? "resource_scope_revision_legal_windows_available"
          : "resource_scope_revision_legal_windows_missing",
        ...input.blocker.reasonCodes,
      ],
      120,
      220,
    ),
    semanticScopeChosenByModel: true,
    runtimeSemanticTruncationApplied: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  };
}

export function buildContextScopeRevisionPrompt(request: ContextScopeRevisionRequest): string {
  const modelFacingRequest = {
    requestRef: request.requestRef,
    blockerRef: request.blockerRef,
    blockerInputBytes: request.blockerInputBytes,
    blockerMaxInputBytes: request.blockerMaxInputBytes,
    offendingUnitKind: request.offendingUnitKind,
    offendingUnitRefs: request.offendingUnitRefs,
    legalWindows: request.legalWindows.map((window) => ({
      windowRef: window.windowRef,
      sourceRef: window.sourceRef,
      windowKind: window.windowKind,
      estimatedInputBytes: window.estimatedInputBytes,
      resourceRequirementRefs: window.resourceRequirementRefs,
      targetCommitmentIds: window.targetCommitmentIds,
      boundedDescriptor: window.boundedDescriptor,
    })),
    resourceRequirementSummaries: request.resourceRequirementSummaries,
    maxInputBytes: request.blockerMaxInputBytes,
    allowedTools: [
      "resource.scope.select_legal_subset",
      "resource.scope.explain_unshardable_unit",
    ],
  };
  return [
    "You are revising a resource scout scope for one over-profile unit.",
    "Choose the smallest semantically useful subset from legalWindows, or explain why the unit is unshardable.",
    "Use only windowRef/sourceRef values from legalWindows. Do not invent refs.",
    "Do not write runtime-owned fields such as requestRef, decisionRef, maxInputBytes, accepted, providerInputPreflight, runtimeJobId, graphId, or nodeId.",
    "Return strict JSON only.",
    "Keep the output compact: select 1-6 windows, list at most 4 excludedWindows, and keep rationale under 120 words.",
    'For a usable narrower scope return: {"toolId":"resource.scope.select_legal_subset","selectedWindowRefs":["context-scope-window://..."],"selectedSourceRefs":["..."],"scopeRationale":"why this exact subset keeps the needed semantics","excludedWindows":[{"windowRef":"...","reason":"why excluded"}],"missingContextRequests":[],"limitations":[],"confidence":0.8}',
    'If no legal subset can fit without losing required semantics return: {"toolId":"resource.scope.explain_unshardable_unit","unshardableRationale":"why all legal subsets would lose the required semantics","missingContextRequests":["exact missing split handle or upstream context needed"],"limitations":["blocking limitation"],"confidence":0.7}',
    `contextScopeRevisionRequest: ${JSON.stringify(modelFacingRequest)}`,
  ].join("\n");
}

export function parseContextScopeRevisionProposal(input: {
  request: ContextScopeRevisionRequest;
  responseText: string;
}): ContextScopeRevisionProposal {
  const record = proposalObjectFromText(input.responseText);
  const toolValue = record.toolId ?? record.tool;
  const toolId: ContextScopeRevisionProposal["toolId"] =
    toolValue === "resource.scope.select_legal_subset" ||
    toolValue === "resource.scope.explain_unshardable_unit"
      ? toolValue
      : "invalid";
  const runtimeOwnedFieldViolations = Object.keys(record).filter((key) =>
    RUNTIME_OWNED_PROPOSAL_FIELDS.has(key),
  );
  const selectedWindowRefs = asStringArray(
    record.selectedWindowRefs ?? record.selectedWindows ?? record.selectedWindowRef,
    120,
    700,
  );
  const selectedSourceRefs = asStringArray(
    record.selectedSourceRefs ?? record.selectedRefs ?? record.selectedSourceRef,
    120,
    700,
  );
  const excludedWindows = Array.isArray(record.excludedWindows)
    ? record.excludedWindows
        .map((entry) => asRecord(entry))
        .map((entry) => ({
          windowRef: bounded(
            typeof entry.windowRef === "string" ? entry.windowRef : null,
            700,
          ),
          reason: bounded(typeof entry.reason === "string" ? entry.reason : null, 700),
        }))
        .filter((entry) => entry.windowRef && entry.reason)
        .slice(0, 120)
    : [];
  const scopeRationale =
    typeof record.scopeRationale === "string" ? bounded(record.scopeRationale, 1_200) : "";
  const unshardableRationale =
    typeof record.unshardableRationale === "string"
      ? bounded(record.unshardableRationale, 1_200)
      : null;
  const reasonCodes = uniqueStrings(
    [
      "resource_scope_revision_proposal_parsed",
      `resource_scope_revision_proposal_tool:${toolId}`,
      ...(toolId === "invalid" ? ["resource_scope_revision_tool_id_invalid"] : []),
      ...(toolId === "resource.scope.select_legal_subset" && selectedWindowRefs.length === 0
        ? ["resource_scope_revision_selected_window_refs_missing"]
        : []),
      ...(toolId === "resource.scope.select_legal_subset" && !scopeRationale
        ? ["resource_scope_revision_scope_rationale_missing"]
        : []),
      ...(toolId === "resource.scope.explain_unshardable_unit" && !unshardableRationale
        ? ["resource_scope_revision_unshardable_rationale_missing"]
        : []),
      ...(runtimeOwnedFieldViolations.length > 0
        ? ["resource_scope_revision_runtime_owned_fields_rejected"]
        : []),
    ],
    80,
    220,
  );
  const parseStatus: ContextScopeRevisionProposal["parseStatus"] =
    toolId !== "invalid" &&
    runtimeOwnedFieldViolations.length === 0 &&
    (toolId === "resource.scope.explain_unshardable_unit"
      ? Boolean(unshardableRationale)
      : selectedWindowRefs.length > 0 && Boolean(scopeRationale))
      ? "parsed"
      : "repair_required";
  const proposalBase = {
    requestRef: input.request.requestRef,
    toolId,
    selectedWindowRefs,
    selectedSourceRefs,
    scopeRationale,
    excludedWindows,
    unshardableRationale,
    missingContextRequests: asStringArray(record.missingContextRequests, 24, 700),
    limitations: asStringArray(record.limitations, 24, 700),
    confidence: confidenceValue(record.confidence),
    parseStatus,
    runtimeOwnedFieldViolations,
    reasonCodes,
  };
  return {
    artifactKind: "resource_scope_revision_proposal",
    schemaVersion: "execution-platform.context-scope-revision-proposal.v1",
    proposalRef: scopeRevisionRef({
      runtimeJobId: input.request.runtimeJobId,
      graphId: input.request.graphId,
      nodeId: input.request.nodeId,
      kind: "proposal",
      fingerprint: hashJson(proposalBase).slice(0, 20),
    }),
    ...proposalBase,
    modelAuthoredSemanticChoice: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function compileContextScopeRevisionDecision(input: {
  request: ContextScopeRevisionRequest;
  proposal: ContextScopeRevisionProposal;
  providerEnvelopeReserveBytes?: number | null;
}): ContextScopeRevisionDecision {
  const legalWindowsByRef = new Map(
    input.request.legalWindows.map((window) => [window.windowRef, window]),
  );
  const legalSourceRefs = new Set(input.request.legalWindows.map((window) => window.sourceRef));
  const failures: ContextScoutFieldRepairField[] = [];
  for (const field of input.proposal.runtimeOwnedFieldViolations) {
    failures.push({
      fieldPath: field,
      reasonCode: "resource_scope_revision_runtime_owned_field_present",
      expectedType: "field_absent",
      currentValueRef: field,
      allowedValueRefs: [],
      repairInstruction:
        "Remove runtime-owned fields. The model may choose semantic scope only.",
    });
  }
  if (input.proposal.toolId === "invalid") {
    failures.push({
      fieldPath: "toolId",
      reasonCode: "resource_scope_revision_tool_id_invalid",
      expectedType:
        "resource.scope.select_legal_subset | resource.scope.explain_unshardable_unit",
      currentValueRef: null,
      allowedValueRefs: [
        "resource.scope.select_legal_subset",
        "resource.scope.explain_unshardable_unit",
      ],
      repairInstruction: "Choose one legal scope-revision tool.",
    });
  }
  if (input.proposal.toolId === "resource.scope.select_legal_subset") {
    if (input.proposal.selectedWindowRefs.length === 0) {
      failures.push({
        fieldPath: "selectedWindowRefs",
        reasonCode: "resource_scope_revision_selected_window_refs_missing",
        expectedType: "nonempty_array_of_legal_window_refs",
        currentValueRef: null,
        allowedValueRefs: input.request.legalWindows.map((window) => window.windowRef),
        repairInstruction:
          "Select at least one legal window ref, or explain the unit as unshardable.",
      });
    }
    if (!input.proposal.scopeRationale) {
      failures.push({
        fieldPath: "scopeRationale",
        reasonCode: "resource_scope_revision_scope_rationale_missing",
        expectedType: "nonempty_string",
        currentValueRef: null,
        allowedValueRefs: [],
        repairInstruction:
          "Explain why the selected legal subset preserves the needed semantics.",
      });
    }
  }
  if (
    input.proposal.toolId === "resource.scope.explain_unshardable_unit" &&
    !input.proposal.unshardableRationale
  ) {
    failures.push({
      fieldPath: "unshardableRationale",
      reasonCode: "resource_scope_revision_unshardable_rationale_missing",
      expectedType: "nonempty_string",
      currentValueRef: null,
      allowedValueRefs: [],
      repairInstruction:
        "Explain exactly why no legal narrower scope can preserve the required semantics.",
    });
  }
  const invalidWindowRefs = input.proposal.selectedWindowRefs.filter(
    (windowRef) => !legalWindowsByRef.has(windowRef),
  );
  for (const windowRef of invalidWindowRefs) {
    failures.push({
      fieldPath: "selectedWindowRefs",
      reasonCode: "resource_scope_revision_selected_window_ref_not_legal",
      expectedType: "legal_window_ref",
      currentValueRef: windowRef,
      allowedValueRefs: input.request.legalWindows.map((window) => window.windowRef),
      repairInstruction: "Replace the selected window with one of the legal window refs.",
    });
  }
  const invalidSourceRefs = input.proposal.selectedSourceRefs.filter(
    (sourceRef) => !legalSourceRefs.has(sourceRef),
  );
  for (const sourceRef of invalidSourceRefs) {
    failures.push({
      fieldPath: "selectedSourceRefs",
      reasonCode: "resource_scope_revision_selected_source_ref_not_legal",
      expectedType: "legal_source_ref",
      currentValueRef: sourceRef,
      allowedValueRefs: input.request.legalWindows.map((window) => window.sourceRef),
      repairInstruction: "Replace the selected source ref with a legal source ref.",
    });
  }
  const acceptedLegalWindows = input.proposal.selectedWindowRefs.flatMap((windowRef) => {
    const window = legalWindowsByRef.get(windowRef);
    return window ? [window] : [];
  });
  const selectedSourceRefs = uniqueStrings(
    [
      ...input.proposal.selectedSourceRefs.filter((sourceRef) => legalSourceRefs.has(sourceRef)),
      ...acceptedLegalWindows.map((window) => window.sourceRef),
    ],
    Number.POSITIVE_INFINITY,
    700,
  );
  const estimatedProviderInputBytes =
    acceptedLegalWindows.length === 0
      ? 0
      : Math.max(0, Math.floor(input.providerEnvelopeReserveBytes ?? 0)) +
        bytes({
          requestRef: input.request.requestRef,
          selectedWindows: acceptedLegalWindows,
          resourceRequirementSummaries: input.request.resourceRequirementSummaries,
        });
  if (
    input.proposal.toolId === "resource.scope.select_legal_subset" &&
    acceptedLegalWindows.length > 0 &&
    estimatedProviderInputBytes > input.request.blockerMaxInputBytes
  ) {
    failures.push({
      fieldPath: "selectedWindowRefs",
      reasonCode: "resource_scope_revision_selected_subset_still_over_profile",
      expectedType: `selected_subset_estimated_bytes <= ${input.request.blockerMaxInputBytes}`,
      currentValueRef: `estimated_bytes:${estimatedProviderInputBytes}`,
      allowedValueRefs: input.request.legalWindows.map((window) => window.windowRef),
      repairInstruction:
        "Choose a narrower legal subset or explain why the unit is unshardable.",
    });
  }
  const status: ContextScopeRevisionDecision["status"] =
    input.proposal.toolId === "resource.scope.explain_unshardable_unit" &&
    failures.length === 0
      ? "unshardable"
      : failures.length > 0 || input.proposal.parseStatus === "repair_required"
        ? "repair_required"
        : "accepted";
  const nextLegalTransition: ContextScopeRevisionDecision["nextLegalTransition"] =
    status === "accepted"
      ? "resource.frontier.accept_scope_revision"
      : status === "repair_required"
        ? "resource.scout.request_field_repair"
        : status === "unshardable"
          ? "scheduler.request_resource_requirement_for_work_intent"
          : "needs_review";
  const providerInputBudgetStatus: ContextScopeRevisionDecision["providerInputBudgetStatus"] =
    status === "accepted"
      ? "accepted"
      : estimatedProviderInputBytes > input.request.blockerMaxInputBytes
        ? "blocked"
        : "not_applicable";
  const decisionBase = {
    requestRef: input.request.requestRef,
    proposalRef: input.proposal.proposalRef,
    status,
    selectedWindowRefs: acceptedLegalWindows.map((window) => window.windowRef),
    selectedSourceRefs,
    estimatedProviderInputBytes,
    maxInputBytes: input.request.blockerMaxInputBytes,
    providerInputBudgetStatus,
    validationFailures: failures,
    nextLegalTransition,
  };
  return {
    artifactKind: "resource_scope_revision_decision",
    schemaVersion: "execution-platform.context-scope-revision-decision.v1",
    decisionRef: scopeRevisionRef({
      runtimeJobId: input.request.runtimeJobId,
      graphId: input.request.graphId,
      nodeId: input.request.nodeId,
      kind: "decision",
      fingerprint: hashJson(decisionBase).slice(0, 20),
    }),
    ...decisionBase,
    acceptedLegalWindows,
    newPacketCompileInputRef:
      status === "accepted"
        ? `${input.request.parentPacketRef}/scope-revision/${hashJson(decisionBase).slice(0, 16)}`
        : null,
    reasonCodes: uniqueStrings(
      [
        "resource_scope_revision_decision_compiled",
        `resource_scope_revision_decision_status:${status}`,
        `resource_scope_revision_provider_budget_status:${providerInputBudgetStatus}`,
        ...(failures.length > 0 ? ["resource_scope_revision_field_specific_repair_required"] : []),
        ...(status === "accepted"
          ? ["resource_scope_revision_model_selected_legal_subset_accepted"]
          : []),
        ...(status === "unshardable"
          ? ["resource_scope_revision_model_marked_unit_unshardable"]
          : []),
        ...input.proposal.reasonCodes,
      ],
      120,
      220,
    ),
    semanticScopeChosenByModel: true,
    runtimeSemanticTruncationApplied: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  };
}

export function buildContextScoutFieldRepairRequest(input: {
  repairFor: ContextScoutFieldRepairRequest["repairFor"];
  failedArtifactRef?: string | null;
  failedDecisionRef?: string | null;
  inputBundleRef?: string | null;
  inputBundleHash?: string | null;
  preserveAcceptedFields?: string[];
  acceptedFieldRefs?: Array<{ fieldPath: string; valueRef: string }>;
  fieldRepairs: ContextScoutFieldRepairField[];
  legalCandidateRefs?: string[];
  legalWindows?: ContextScopeRevisionLegalWindow[];
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  reasonCodes?: string[];
}): ContextScoutFieldRepairRequest {
  const legalCandidateRefs = uniqueStrings(input.legalCandidateRefs ?? [], 160, 700);
  const legalWindowRefs = uniqueStrings(
    (input.legalWindows ?? []).map((window) => window.windowRef),
    160,
    700,
  );
  const fieldRepairs = input.fieldRepairs.map((field) => ({
    fieldPath: bounded(field.fieldPath, 420),
    reasonCode: bounded(field.reasonCode, 220),
    expectedType: bounded(field.expectedType, 420),
    currentValueRef: field.currentValueRef ? bounded(field.currentValueRef, 700) : null,
    allowedValueRefs: uniqueStrings(field.allowedValueRefs, 160, 700),
    repairInstruction: bounded(field.repairInstruction, 900),
  }));
  const requestBase = {
    failedArtifactRef: input.failedArtifactRef ?? null,
    failedDecisionRef: input.failedDecisionRef ?? null,
    inputBundleRef: input.inputBundleRef ?? null,
    inputBundleHash: input.inputBundleHash ?? null,
    repairFor: input.repairFor,
    preserveAcceptedFields: uniqueStrings(input.preserveAcceptedFields ?? [], 80, 420),
    acceptedFieldRefs: (input.acceptedFieldRefs ?? [])
      .map((entry) => ({
        fieldPath: bounded(entry.fieldPath, 420),
        valueRef: bounded(entry.valueRef, 700),
      }))
      .slice(0, 120),
    fieldRepairs,
    legalCandidateRefs,
    legalWindowRefs,
  };
  const status = fieldRepairs.length > 0 ? "repair_required" : "no_repair_required";
  return {
    artifactKind: "resource_scout_field_repair_request",
    schemaVersion: "execution-platform.context-scout-field-repair-request.v1",
    repairRequestRef: scopeRevisionRef({
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      nodeId: input.nodeId,
      kind: "field-repair",
      fingerprint: hashJson(requestBase).slice(0, 20),
    }),
    ...requestBase,
    nextLegalToolIds: [
      "resource.scope.select_legal_subset",
      "resource.scope.explain_unshardable_unit",
      "resource.scout.request_field_repair",
      "resource.scout.submit_shard_handoff",
      "resource.scout.mark_insufficient_context",
    ],
    status,
    reasonCodes: uniqueStrings(
      [
        "resource_scout_field_repair_request_compiled",
        `resource_scout_field_repair_status:${status}`,
        ...(fieldRepairs.length > 0 ? ["resource_scout_field_specific_repair_required"] : []),
        ...(input.reasonCodes ?? []),
      ],
      120,
      220,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  };
}

export function buildContextScopeRevisionRepairRequest(input: {
  request: ContextScopeRevisionRequest;
  decision: ContextScopeRevisionDecision;
  inputBundleRef?: string | null;
  inputBundleHash?: string | null;
}): ContextScoutFieldRepairRequest {
  return buildContextScoutFieldRepairRequest({
    repairFor: "resource_scope_revision",
    failedArtifactRef: input.decision.proposalRef,
    failedDecisionRef: input.decision.decisionRef,
    inputBundleRef: input.inputBundleRef ?? input.request.requestRef,
    inputBundleHash: input.inputBundleHash ?? `sha256:${hashText(input.request.requestRef)}`,
    preserveAcceptedFields: [
      "toolId",
      "scopeRationale",
      "unshardableRationale",
      "missingContextRequests",
      "limitations",
      "confidence",
    ],
    acceptedFieldRefs: input.decision.selectedWindowRefs.map((windowRef) => ({
      fieldPath: "selectedWindowRefs",
      valueRef: windowRef,
    })),
    fieldRepairs: input.decision.validationFailures,
    legalCandidateRefs: input.request.legalCandidateRefs,
    legalWindows: input.request.legalWindows,
    runtimeJobId: input.request.runtimeJobId,
    graphId: input.request.graphId,
    nodeId: input.request.nodeId,
    reasonCodes: input.decision.reasonCodes,
  });
}

export function contextScopeRevisionCompileInputFromDecision(input: {
  originalInput: ContextScoutExecutionPacketCompileInput;
  decision: ContextScopeRevisionDecision;
}): ContextScoutExecutionPacketCompileInput {
  if (input.decision.status !== "accepted") {
    throw new Error("resource_scope_revision_decision_not_accepted");
  }
  const selectedSourceRefs = new Set(input.decision.selectedSourceRefs);
  const selectedRequirementRefs = new Set(
    input.decision.acceptedLegalWindows.flatMap((window) => window.resourceRequirementRefs),
  );
  const resourceRequirementPackets =
    selectedRequirementRefs.size > 0
      ? input.originalInput.resourceRequirementPackets.filter((packet) =>
          selectedRequirementRefs.has(packet.resourceRequirementRef),
        )
      : input.originalInput.resourceRequirementPackets;
  const boundedRepoContextIndex = filterBoundedRepoContextEntries(
    input.originalInput.boundedRepoContextIndex,
    selectedSourceRefs,
  );
  const candidateFileRefs = filterStringRefs(
    input.originalInput.candidateFileRefs,
    selectedSourceRefs,
  );
  return {
    ...input.originalInput,
    nodeId: `${input.originalInput.nodeId}__scope_revision`,
    resourceRequirementPackets,
    boundedRepoContextIndex:
      boundedRepoContextIndex.length > 0
        ? boundedRepoContextIndex
        : input.originalInput.boundedRepoContextIndex,
    candidateFileRefs:
      candidateFileRefs.length > 0 ? candidateFileRefs : input.originalInput.candidateFileRefs,
    sourcePromptContextIndex: filterSourcePromptIndex(
      input.originalInput.sourcePromptContextIndex,
      selectedSourceRefs,
    ),
    targetCommitmentIds: uniqueStrings(
      [
        ...input.originalInput.targetCommitmentIds,
        ...input.decision.acceptedLegalWindows.flatMap((window) => window.targetCommitmentIds),
      ],
      40,
      180,
    ),
    requestedTimeoutMs: input.originalInput.requestedTimeoutMs,
  };
}

function filterBoundedRepoContextEntries(
  entries: ContextScoutBoundedRepoContextEntry[],
  refs: Set<string>,
): ContextScoutBoundedRepoContextEntry[] {
  if (refs.size === 0) {
    return entries;
  }
  return entries.filter((entry) => refs.has(entry.fileRef));
}

function filterStringRefs(values: string[], refs: Set<string>): string[] {
  if (refs.size === 0) {
    return values;
  }
  return values.filter((value) => refs.has(value));
}

function filterSourcePromptIndex(
  index: SourcePromptContextIndex | null,
  refs: Set<string>,
): SourcePromptContextIndex | null {
  if (!index || refs.size === 0) {
    return index;
  }
  const sections = index.sections.filter((section) => refs.has(section.sectionRef));
  if (sections.length === 0) {
    return index;
  }
  return {
    ...index,
    sections,
  };
}

export function contextScopeRevisionRequestMetadata(
  request: ContextScopeRevisionRequest,
): JsonValue {
  return {
    requestRef: request.requestRef,
    blockerRef: request.blockerRef,
    parentPacketRef: request.parentPacketRef,
    nodeId: request.nodeId,
    consumerNodeIds: request.consumerNodeIds.slice(0, 24),
    workIntentRefs: request.workIntentRefs.slice(0, 24),
    blockerInputBytes: request.blockerInputBytes,
    blockerMaxInputBytes: request.blockerMaxInputBytes,
    offendingUnitKind: request.offendingUnitKind,
    offendingUnitRefs: request.offendingUnitRefs.slice(0, 24),
    legalWindowCount: request.legalWindows.length,
    legalCandidateRefCount: request.legalCandidateRefs.length,
    nextLegalToolIds: request.nextLegalToolIds,
    status: request.status,
    reasonCodes: request.reasonCodes.slice(0, 80),
    semanticScopeChosenByModel: true,
    runtimeSemanticTruncationApplied: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  } satisfies JsonValue;
}

export function assertContextScopeRevisionManifestMetadata(value: JsonValue): void {
  const serialized = JSON.stringify(value);
  const byteCount = Buffer.byteLength(serialized, "utf8");
  if (byteCount > 12_000) {
    throw new Error(`resource_scope_revision_manifest_metadata_overflow:${byteCount}`);
  }
  const forbiddenBodyFields = [
    "legalWindows",
    "resourceRequirementSummaries",
    "providerInputPreflight",
    "boundedDescriptor",
    "scopeRationale",
    "excludedWindows",
    "unshardableRationale",
    "missingContextRequests",
    "limitations",
    "acceptedLegalWindows",
    "validationFailures",
    "rawPrompt",
    "rawResponse",
    "lineNumberedContent",
    "boundedContent",
    "fullBody",
    "fileContent",
  ];
  for (const field of forbiddenBodyFields) {
    if (serialized.includes(`"${field}"`)) {
      throw new Error(`resource_scope_revision_manifest_contains_body_field:${field}`);
    }
  }
}

export function contextScopeRevisionProposalMetadata(
  proposal: ContextScopeRevisionProposal,
): JsonValue {
  return {
    proposalRef: proposal.proposalRef,
    requestRef: proposal.requestRef,
    toolId: proposal.toolId,
    selectedWindowRefCount: proposal.selectedWindowRefs.length,
    selectedSourceRefCount: proposal.selectedSourceRefs.length,
    excludedWindowCount: proposal.excludedWindows.length,
    unshardable: Boolean(proposal.unshardableRationale),
    missingContextRequestCount: proposal.missingContextRequests.length,
    limitationCount: proposal.limitations.length,
    confidence: proposal.confidence,
    parseStatus: proposal.parseStatus,
    runtimeOwnedFieldViolations: proposal.runtimeOwnedFieldViolations,
    reasonCodes: proposal.reasonCodes.slice(0, 80),
    modelAuthoredSemanticChoice: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function contextScopeRevisionDecisionMetadata(
  decision: ContextScopeRevisionDecision,
): JsonValue {
  return {
    decisionRef: decision.decisionRef,
    requestRef: decision.requestRef,
    proposalRef: decision.proposalRef,
    status: decision.status,
    selectedWindowRefCount: decision.selectedWindowRefs.length,
    selectedSourceRefCount: decision.selectedSourceRefs.length,
    estimatedProviderInputBytes: decision.estimatedProviderInputBytes,
    maxInputBytes: decision.maxInputBytes,
    providerInputBudgetStatus: decision.providerInputBudgetStatus,
    validationFailureCount: decision.validationFailures.length,
    validationFailurePaths: decision.validationFailures.map((failure) => failure.fieldPath).slice(0, 24),
    newPacketCompileInputRef: decision.newPacketCompileInputRef,
    nextLegalTransition: decision.nextLegalTransition,
    reasonCodes: decision.reasonCodes.slice(0, 80),
    semanticScopeChosenByModel: true,
    runtimeSemanticTruncationApplied: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  } satisfies JsonValue;
}

export function contextScoutFieldRepairRequestMetadata(
  request: ContextScoutFieldRepairRequest,
): JsonValue {
  return {
    repairRequestRef: request.repairRequestRef,
    failedArtifactRef: request.failedArtifactRef,
    failedDecisionRef: request.failedDecisionRef,
    inputBundleRef: request.inputBundleRef,
    inputBundleHash: request.inputBundleHash,
    repairFor: request.repairFor,
    preserveAcceptedFields: request.preserveAcceptedFields.slice(0, 40),
    acceptedFieldRefCount: request.acceptedFieldRefs.length,
    fieldRepairCount: request.fieldRepairs.length,
    fieldRepairPaths: request.fieldRepairs.map((field) => field.fieldPath).slice(0, 24),
    legalCandidateRefCount: request.legalCandidateRefs.length,
    legalWindowRefCount: request.legalWindowRefs.length,
    nextLegalToolIds: request.nextLegalToolIds,
    status: request.status,
    reasonCodes: request.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  } satisfies JsonValue;
}
