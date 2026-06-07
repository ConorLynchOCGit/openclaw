import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  validateActionGraphProposal,
  validateCompileReadinessValidation,
  validateHumanPlanningDecision,
  validatePlanningCapsuleRevision,
  validatePlanningFrameworkContractRecord,
  validatePlanningIntentRecord,
  validateProductSpecPlanningCloseout,
  validateResearchBrief,
  validateWorkflowPlanningCapsuleEvidence,
} from "./workflow-evidence-profile.ts";

export const PLANNING_SMALL_VERB_TOOL_SURFACE_SCHEMA_VERSION =
  "execution-platform.planning-small-verb-tool-surface.v1" as const;

export const PRODUCT_SPEC_PLANNING_SMALL_VERB_TOOL_IDS = [
  "planning.intent.record",
  "planning.framework_contract.record",
  "planning.research.request_brief",
  "planning.capsule.draft",
  "planning.capsule.revise",
  "planning.human_decision.request",
  "planning.action_graph.propose",
  "planning.compile_readiness.evaluate",
  "planning.closeout.summarize",
] as const;

type PlanningToolValidation = { valid: boolean; reasonCodes: string[] };

export const PLANNING_FRAMEWORK_CONTRACT_MODEL_OWNED_FIELDS = [
  "lifecyclePhaseRefs",
  "resourceContractRefs",
  "actionGateRefs",
  "evidenceExpectationRefs",
  "implementationSliceRefs",
] as const;

export const PLANNING_FRAMEWORK_CONTRACT_RUNTIME_OWNED_FIELDS = [
  "artifactKind",
  "contractId",
  "workflowId",
  "runtimeJobId",
  "authority",
  "lifecycle",
  "validationState",
  "targetSubjectRefs",
  "compatibilityFallbackAllowed",
  "runtimeSemanticJudgmentAllowed",
  "revisionRef",
  "supersededByContractId",
  "rawPromptStored",
  "rawResponseStored",
  "rawLogsStored",
] as const;

export type PlanningSmallVerbToolOutput = {
  status: "succeeded" | "needs_review";
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function bounded(value: unknown, max = 320): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, max) : "";
}

function strings(value: unknown, max = 12, maxChars = 420): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    const text = bounded(item, maxChars);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unique(values: readonly string[], max = 80): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = bounded(value, 520);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

export function validatePlanningFrameworkContractModelInput(input: unknown): {
  valid: boolean;
  reasonCodes: string[];
  modelInputFieldNames: string[];
  rawPromptStored: false;
  rawResponseStored: false;
} {
  const body = record(input);
  const fieldNames = unique(Object.keys(body), 48);
  const allowedFields = new Set<string>(PLANNING_FRAMEWORK_CONTRACT_MODEL_OWNED_FIELDS);
  const runtimeOwnedFields = new Set<string>(PLANNING_FRAMEWORK_CONTRACT_RUNTIME_OWNED_FIELDS);
  const reasonCodes: string[] = [];
  for (const field of PLANNING_FRAMEWORK_CONTRACT_MODEL_OWNED_FIELDS) {
    if (strings(body[field], 24, 520).length === 0) {
      reasonCodes.push(`planning_framework_contract_model_input_${field}_missing`);
    }
  }
  for (const fieldName of fieldNames) {
    if (runtimeOwnedFields.has(fieldName)) {
      reasonCodes.push(`planning_framework_contract_model_input_runtime_owned_field:${fieldName}`);
      continue;
    }
    if (!allowedFields.has(fieldName)) {
      reasonCodes.push(`planning_framework_contract_model_input_unknown_field:${fieldName}`);
    }
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes:
      reasonCodes.length === 0
        ? ["planning_framework_contract_model_input_valid"]
        : unique(reasonCodes, 80),
    modelInputFieldNames: fieldNames,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function planningArtifactFromInput(
  toolId: string,
  input: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
) {
  const runtimeOwned = record(metadata.runtimeOwnedFields);
  const workflowId =
    bounded(runtimeOwned.workflowId, 180) ||
    bounded(metadata.workflowId, 180) ||
    bounded(input.workflowId, 180) ||
    "agent_team.product_spec_planning";
  const runtimeJobId =
    bounded(runtimeOwned.runtimeJobId, 180) ||
    bounded(metadata.runtimeJobId, 180) ||
    bounded(input.runtimeJobId, 180) ||
    "unknown-runtime-job";
  if (toolId === "planning.intent.record") {
    return {
      artifactKind: "planning_intent_record",
      intentId: bounded(input.intentId, 180) || "planning-intent",
      workflowId,
      runtimeJobId,
      authority: input.authority === "human" ? "human" : "model",
      lifecycle: bounded(input.lifecycle, 80) || "submitted",
      validationState: bounded(input.validationState, 80) || "pending",
      objectiveRef: bounded(input.objectiveRef, 520),
      targetSubjectRefs: strings(input.targetSubjectRefs, 12, 520),
      scopeRef: bounded(input.scopeRef, 520),
      constraintRefs: strings(input.constraintRefs, 24, 520),
      nonGoalRefs: strings(input.nonGoalRefs, 24, 520),
      authorityLimitRefs: strings(input.authorityLimitRefs, 24, 520),
      uncertaintyRefs: strings(input.uncertaintyRefs, 24, 520),
      evidenceExpectationRefs: strings(input.evidenceExpectationRefs, 24, 520),
      researchNeeded: Boolean(input.researchNeeded),
      humanDecisionNeeded: Boolean(input.humanDecisionNeeded),
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByIntentId: bounded(input.supersededByIntentId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.framework_contract.record") {
    return {
      artifactKind: "planning_framework_contract",
      contractId:
        bounded(runtimeOwned.contractId, 180) ||
        bounded(metadata.contractId, 180) ||
        "planning-framework-contract",
      workflowId,
      runtimeJobId,
      authority: runtimeOwned.authority === "human" ? "human" : "model",
      lifecycle: bounded(runtimeOwned.lifecycle, 80) || "accepted",
      validationState: bounded(runtimeOwned.validationState, 80) || "valid",
      targetSubjectRefs:
        strings(runtimeOwned.targetSubjectRefs, 12, 520).length > 0
          ? strings(runtimeOwned.targetSubjectRefs, 12, 520)
          : strings(metadata.targetSubjectRefs, 12, 520),
      lifecyclePhaseRefs: strings(input.lifecyclePhaseRefs, 24, 520),
      resourceContractRefs: strings(input.resourceContractRefs, 24, 520),
      actionGateRefs: strings(input.actionGateRefs, 24, 520),
      evidenceExpectationRefs: strings(input.evidenceExpectationRefs, 24, 520),
      implementationSliceRefs: strings(input.implementationSliceRefs, 24, 520),
      compatibilityFallbackAllowed: false,
      runtimeSemanticJudgmentAllowed: false,
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByContractId: bounded(input.supersededByContractId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.research.request_brief") {
    return {
      artifactKind: "research_brief",
      briefId: bounded(input.briefId, 180) || "research-brief",
      workflowId,
      runtimeJobId,
      authority: input.authority === "human" ? "human" : "model",
      lifecycle: bounded(input.lifecycle, 80) || "submitted",
      validationState: bounded(input.validationState, 80) || "pending",
      topicRef: bounded(input.topicRef, 520),
      findingRefs: strings(input.findingRefs, 24, 520),
      limitationRefs: strings(input.limitationRefs, 24, 520),
      validatedAt: null,
      supersededByBriefId: bounded(input.supersededByBriefId, 180) || null,
      revisionRef: bounded(input.revisionRef, 520) || null,
      previousRevisionRef: bounded(input.previousRevisionRef, 520) || null,
      limitations: [],
      reasonCodes: [],
      priorBriefRef: bounded(input.priorBriefRef, 520) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.capsule.draft") {
    return {
      artifactKind: "planning_capsule",
      capsuleId: bounded(input.capsuleId, 180) || "planning-capsule",
      workflowId,
      runtimeJobId,
      authority: input.authority === "human" ? "human" : "model",
      lifecycle: bounded(input.lifecycle, 80) || "submitted",
      validationState: bounded(input.validationState, 80) || "pending",
      planRefs: strings(input.planRefs, 24, 520),
      dependencyRefs: strings(input.dependencyRefs, 24, 520),
      limitationRefs: strings(input.limitationRefs, 24, 520),
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByCapsuleId: bounded(input.supersededByCapsuleId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.capsule.revise") {
    return {
      artifactKind: "planning_capsule_revision",
      revisionId: bounded(input.revisionId, 180) || "planning-capsule-revision",
      workflowId,
      runtimeJobId,
      authority: input.authority === "human" ? "human" : "model",
      lifecycle: bounded(input.lifecycle, 80) || "submitted",
      validationState: bounded(input.validationState, 80) || "pending",
      capsuleRef: bounded(input.capsuleRef, 520),
      previousCapsuleRef: bounded(input.previousCapsuleRef, 520),
      changeSummaryRef: bounded(input.changeSummaryRef, 520),
      changedSectionRefs: strings(input.changedSectionRefs, 24, 520),
      limitationRefs: strings(input.limitationRefs, 24, 520),
      humanDecisionRefs: strings(input.humanDecisionRefs, 24, 520),
      researchInfluenceRefs: strings(input.researchInfluenceRefs, 24, 520),
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByRevisionId: bounded(input.supersededByRevisionId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.human_decision.request") {
    return {
      artifactKind: "human_decision",
      decisionId: bounded(input.decisionId, 180) || "human-decision",
      workflowId,
      runtimeJobId,
      authority: "human",
      lifecycle: bounded(input.lifecycle, 80) || "pending",
      validationState: bounded(input.validationState, 80) || "pending",
      decisionPromptRef: bounded(input.decisionPromptRef, 520),
      boundedOptionsRef: bounded(input.boundedOptionsRef, 520),
      pauseRef: bounded(input.pauseRef, 520) || null,
      resumeRef: bounded(input.resumeRef, 520) || null,
      decisionRationaleRef: bounded(input.decisionRationaleRef, 520) || null,
      rawOwnerResponseStored: false,
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByDecisionId: bounded(input.supersededByDecisionId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.action_graph.propose") {
    return {
      artifactKind: "action_graph_proposal",
      proposalId: bounded(input.proposalId, 180) || "action-graph-proposal",
      workflowId,
      runtimeJobId,
      authority: input.authority === "human" ? "human" : "model",
      lifecycle: bounded(input.lifecycle, 80) || "submitted",
      validationState: bounded(input.validationState, 80) || "pending",
      compileReadinessRef: bounded(input.compileReadinessRef, 520),
      childExecutionAutoStart: false,
      nodeProposalRefs: strings(input.nodeProposalRefs, 80, 520),
      edgeProposalRefs: strings(input.edgeProposalRefs, 80, 520),
      limitationRefs: strings(input.limitationRefs, 24, 520),
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByProposalId: bounded(input.supersededByProposalId, 180) || null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  if (toolId === "planning.compile_readiness.evaluate") {
    return {
      artifactKind: "compile_readiness",
      validationId: bounded(input.validationId, 180) || "compile-readiness",
      workflowId,
      runtimeJobId,
      authority: "runtime",
      lifecycle: bounded(input.lifecycle, 80) || "validated",
      validationState: bounded(input.validationState, 80) || "valid",
      proposalRef: bounded(input.proposalRef, 520),
      valid: input.valid !== false,
      invalidReasons: strings(input.invalidReasons, 12, 120),
      checkedNodeRefs: strings(input.checkedNodeRefs, 80, 520),
      checkedEdgeRefs: strings(input.checkedEdgeRefs, 80, 520),
      limitationRefs: strings(input.limitationRefs, 24, 520),
      revisionRef: bounded(input.revisionRef, 520) || null,
      supersededByValidationId: bounded(input.supersededByValidationId, 180) || null,
      limitations: [],
      reasonCodes: [],
      revisionRefs: [],
      invalidReasonCategories: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
  }
  return {
    artifactKind: "product_spec_planning_closeout",
    closeoutId: bounded(input.closeoutId, 180) || "product-spec-closeout",
    workflowId,
    runtimeJobId,
    authority: input.authority === "human" ? "human" : "model",
    lifecycle: bounded(input.lifecycle, 80) || "submitted",
    validationState: bounded(input.validationState, 80) || "pending",
    missionLedgerRef: bounded(input.missionLedgerRef, 520),
    planningIntentRef: bounded(input.planningIntentRef, 520),
    planningCapsuleRefs: strings(input.planningCapsuleRefs, 24, 520),
    actionGraphProposalRefs: strings(input.actionGraphProposalRefs, 24, 520),
    compileReadinessRefs: strings(input.compileReadinessRefs, 24, 520),
    humanDecisionRefs: strings(input.humanDecisionRefs, 24, 520),
    researchBriefRefs: strings(input.researchBriefRefs, 24, 520),
    commitmentEvidenceRefs: strings(input.commitmentEvidenceRefs, 24, 520),
    limitationRefs: strings(input.limitationRefs, 24, 520),
    eli5SummaryRef: bounded(input.eli5SummaryRef, 520),
    childExecutionStarted: false,
    revisionRef: bounded(input.revisionRef, 520) || null,
    supersededByCloseoutId: bounded(input.supersededByCloseoutId, 180) || null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

function validatePlanningArtifact(toolId: string, artifact: unknown): PlanningToolValidation {
  if (toolId === "planning.intent.record") {
    return validatePlanningIntentRecord(artifact);
  }
  if (toolId === "planning.framework_contract.record") {
    return validatePlanningFrameworkContractRecord(artifact);
  }
  if (toolId === "planning.research.request_brief") {
    return validateResearchBrief(artifact);
  }
  if (toolId === "planning.capsule.draft") {
    return validateWorkflowPlanningCapsuleEvidence(artifact);
  }
  if (toolId === "planning.capsule.revise") {
    return validatePlanningCapsuleRevision(artifact);
  }
  if (toolId === "planning.human_decision.request") {
    return validateHumanPlanningDecision(artifact);
  }
  if (toolId === "planning.action_graph.propose") {
    return validateActionGraphProposal(artifact);
  }
  if (toolId === "planning.compile_readiness.evaluate") {
    return validateCompileReadinessValidation(artifact);
  }
  return validateProductSpecPlanningCloseout(artifact);
}

function planningArtifactRef(toolId: string, artifact: Record<string, unknown>): string {
  if (toolId === "planning.intent.record") {
    return `planning-intent://${bounded(artifact.intentId, 180)}`;
  }
  if (toolId === "planning.framework_contract.record") {
    return `planning-framework-contract://${bounded(artifact.contractId, 180)}`;
  }
  if (toolId === "planning.research.request_brief") {
    return `research-brief://${bounded(artifact.briefId, 180)}`;
  }
  if (toolId === "planning.capsule.draft") {
    return `planning-capsule://${bounded(artifact.capsuleId, 180)}`;
  }
  if (toolId === "planning.capsule.revise") {
    return `planning-capsule-revision://${bounded(artifact.revisionId, 180)}`;
  }
  if (toolId === "planning.human_decision.request") {
    return `human-decision://${bounded(artifact.decisionId, 180)}`;
  }
  if (toolId === "planning.action_graph.propose") {
    return `action-graph-proposal://${bounded(artifact.proposalId, 180)}`;
  }
  if (toolId === "planning.compile_readiness.evaluate") {
    return `compile-readiness://${bounded(artifact.validationId, 180)}`;
  }
  return `product-spec-closeout://${bounded(artifact.closeoutId, 180)}`;
}

export function compilePlanningSmallVerbToolOutput(input: {
  toolId: string;
  volatileInput?: unknown;
  metadata?: JsonValue;
}): PlanningSmallVerbToolOutput {
  const metadata = record(input.metadata);
  const body = record(input.volatileInput ?? metadata.input ?? metadata.planningArtifact);
  if (!(PRODUCT_SPEC_PLANNING_SMALL_VERB_TOOL_IDS as readonly string[]).includes(input.toolId)) {
    const outputRef = `runtime-tool-output://${input.toolId || "unknown-planning-tool"}/rejected`;
    return {
      status: "needs_review",
      outputRef,
      outputHash: `sha256:${hashValue({ toolId: input.toolId, status: "rejected" })}`,
      outputSummary: "Rejected non-planning small verb at Product/Spec planning tool compiler.",
      reasonCodes: ["planning_small_verb_tool_id_not_supported"],
      metadata: {
        artifactKind: "planning_small_verb_tool_output",
        toolId: input.toolId,
        status: "rejected",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      } satisfies JsonValue,
    };
  }
  if (input.toolId === "planning.framework_contract.record") {
    const modelInputValidation = validatePlanningFrameworkContractModelInput(body);
    if (!modelInputValidation.valid) {
      const outputRef = "runtime-tool-output://planning/framework-contract-record/needs-review";
      return {
        status: "needs_review",
        outputRef,
        outputHash: `sha256:${hashValue({
          toolId: input.toolId,
          reasonCodes: modelInputValidation.reasonCodes,
          modelInputFieldNames: modelInputValidation.modelInputFieldNames,
        })}`,
        outputSummary:
          "planning.framework_contract.record received model output that did not match the small-verb model-owned input contract.",
        reasonCodes: unique(
          ["planning_framework_contract_model_input_invalid", ...modelInputValidation.reasonCodes],
          80,
        ),
        metadata: {
          artifactKind: "planning_small_verb_tool_output",
          schemaVersion: PLANNING_SMALL_VERB_TOOL_SURFACE_SCHEMA_VERSION,
          toolId: input.toolId,
          status: "needs_review",
          modelInputFieldNames: modelInputValidation.modelInputFieldNames,
          runtimeOwnedFieldsApplied: false,
          semanticQualityJudgedByDeterministicCode: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          hiddenReasoningStored: false,
        } satisfies JsonValue,
      };
    }
  }

  const artifact = record(planningArtifactFromInput(input.toolId, body, metadata));
  const validation = validatePlanningArtifact(input.toolId, artifact);
  const artifactRef = planningArtifactRef(input.toolId, artifact);
  const artifactHash = `sha256:${hashValue(artifact)}`;
  const artifactByteCount = Buffer.byteLength(JSON.stringify(artifact), "utf8");
  const outputRef = validation.valid
    ? artifactRef
    : `runtime-tool-output://${input.toolId}/${artifactHash.slice(7, 23)}/needs-review`;
  return {
    status: validation.valid ? "succeeded" : "needs_review",
    outputRef,
    outputHash: artifactHash,
    outputSummary: validation.valid
      ? `${input.toolId} compiled a bounded Product/Spec planning artifact manifest.`
      : `${input.toolId} needs model repair before a Product/Spec planning artifact can be accepted.`,
    reasonCodes: unique(
      [
        validation.valid
          ? "planning_small_verb_artifact_valid"
          : "planning_small_verb_artifact_invalid",
        `${input.toolId.replaceAll(".", "_")}_compiled`,
        ...validation.reasonCodes,
      ],
      80,
    ),
    metadata: {
      artifactKind: "planning_small_verb_tool_output",
      schemaVersion: PLANNING_SMALL_VERB_TOOL_SURFACE_SCHEMA_VERSION,
      toolId: input.toolId,
      status: validation.valid ? "accepted" : "needs_review",
      planningArtifactKind: bounded(artifact.artifactKind, 180) || "unknown",
      planningArtifactRef: artifactRef,
      planningArtifactHash: artifactHash,
      planningArtifactByteCount: artifactByteCount,
      planningArtifactPayloadRef: `artifact-payload://${artifactRef.replace("://", "/")}/${artifactHash.slice(7, 23)}`,
      runtimeOwnedFieldsApplied: input.toolId === "planning.framework_contract.record",
      modelInputFieldNames: unique(Object.keys(body), 32),
      reasonCodes: validation.reasonCodes.slice(0, 24),
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
    } satisfies JsonValue,
  };
}
