import type { JsonValue } from "../runtime-job-repository.ts";

export const WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE =
  "execution.workflow_evidence_profile_evaluation";

export type WorkflowEvidenceClass =
  | "runtime_graph"
  | "scheduler_tool_trace"
  | "worker_tool_trace"
  | "model_call_trace"
  | "script_validation_trace"
  | "source_change"
  | "validation"
  | "review"
  | "research_brief"
  | "planning_capsule"
  | "action_graph_proposal"
  | "compile_readiness"
  | "human_decision"
  | "closeout"
  | "work_queue_readback";

export type WorkflowEvidenceProfile = {
  profileId: string;
  workflowId: string;
  displayName: string;
  requiredEvidenceClasses: WorkflowEvidenceClass[];
  optionalEvidenceClasses: WorkflowEvidenceClass[];
  cleanSuccessAllowed: boolean;
  closeoutMustBeModelAuthored: boolean;
  deepCompletionReviewRequired: boolean;
  ownerReadbackRequired: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type WorkflowEvidenceProfileEvaluationStatus = "accepted" | "needs_review" | "failed";

export type WorkflowEvidenceProfileEvaluationInput = {
  workflowId: string;
  runtimeJobId: string;
  workItemId?: string | null;
  evidenceClassRefs: Partial<Record<WorkflowEvidenceClass, string[]>>;
  closeoutSource?: "model" | "degraded_system_fallback" | "unknown";
  degradedCloseout?: boolean;
  reasonCodes?: string[];
  limitations?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored?: false;
};

export type WorkflowEvidenceProfileEvaluation = {
  artifactKind: "workflow_evidence_profile_evaluation";
  profileId: string;
  workflowId: string;
  runtimeJobId: string;
  workItemId: string | null;
  status: WorkflowEvidenceProfileEvaluationStatus;
  accepted: boolean;
  requiredEvidenceClasses: WorkflowEvidenceClass[];
  optionalEvidenceClasses: WorkflowEvidenceClass[];
  acceptedEvidenceClasses: WorkflowEvidenceClass[];
  missingEvidenceClasses: WorkflowEvidenceClass[];
  evidenceClassRefs: Partial<Record<WorkflowEvidenceClass, string[]>>;
  closeoutSource: "model" | "degraded_system_fallback" | "unknown";
  deepCompletionReviewRequired: boolean;
  ownerReadbackRequired: boolean;
  cleanSuccessAllowed: boolean;
  reasonCodes: string[];
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type ArtifactAuthority = "model" | "human" | "runtime";
export type ArtifactLifecycle =
  | "draft"
  | "submitted"
  | "accepted"
  | "superseded"
  | "pending"
  | "paused"
  | "resumed"
  | "approved"
  | "rejected"
  | "validated"
  | "failed";
export type ArtifactValidationState = "pending" | "valid" | "invalid";

type RuntimeArtifactStorageFlags = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export function validateArtifactStorageFlags(flags: Partial<RuntimeArtifactStorageFlags>): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasons: string[] = [];
  if (flags.rawPromptStored !== false) {
    reasons.push("artifact_contract.raw_prompt_must_be_false");
  }
  if (flags.rawResponseStored !== false) {
    reasons.push("artifact_contract.raw_response_must_be_false");
  }
  if (flags.rawLogsStored !== false) {
    reasons.push("artifact_contract.raw_logs_must_be_false");
  }
  return { valid: reasons.length === 0, reasonCodes: reasons };
}

export type ResearchBrief = RuntimeArtifactStorageFlags & {
  artifactKind: "research_brief";
  briefId: string;
  workflowId: string;
  runtimeJobId: string;
  authority: Extract<ArtifactAuthority, "model" | "human">;
  lifecycle: Extract<ArtifactLifecycle, "draft" | "submitted" | "accepted" | "superseded">;
  validationState: ArtifactValidationState;
  validatedAt: string | null;
  supersededByBriefId: string | null;
  revisionRef: string | null;
  previousRevisionRef: string | null;
  limitations: string[];
  reasonCodes: string[];
  priorBriefRef: string | null;
  topicRef: string;
  findingRefs: string[];
  limitationRefs: string[];
};

export type WorkflowPlanningCapsuleEvidence = RuntimeArtifactStorageFlags & {
  artifactKind: "planning_capsule";
  capsuleId: string;
  workflowId: string;
  runtimeJobId: string;
  authority: Extract<ArtifactAuthority, "model" | "human">;
  lifecycle: Extract<ArtifactLifecycle, "draft" | "submitted" | "accepted" | "superseded">;
  validationState: ArtifactValidationState;
  planRefs: string[];
  dependencyRefs: string[];
  limitationRefs: string[];
  revisionRef: string | null;
  supersededByCapsuleId: string | null;
};

export type HumanPlanningDecision = RuntimeArtifactStorageFlags & {
  artifactKind: "human_decision";
  decisionId: string;
  workflowId: string;
  runtimeJobId: string;
  authority: "human";
  lifecycle: Extract<
    ArtifactLifecycle,
    "pending" | "paused" | "resumed" | "approved" | "rejected" | "superseded"
  >;
  validationState: ArtifactValidationState;
  decisionPromptRef: string;
  boundedOptionsRef: string;
  pauseRef: string | null;
  resumeRef: string | null;
  decisionRationaleRef: string | null;
  rawOwnerResponseStored: false;
  revisionRef: string | null;
  supersededByDecisionId: string | null;
};

export type ActionGraphProposal = RuntimeArtifactStorageFlags & {
  artifactKind: "action_graph_proposal";
  proposalId: string;
  workflowId: string;
  runtimeJobId: string;
  authority: ArtifactAuthority;
  lifecycle: Extract<
    ArtifactLifecycle,
    "draft" | "submitted" | "accepted" | "superseded" | "validated" | "failed"
  >;
  validationState: ArtifactValidationState;
  validatedAt?: string | null;
  compileReadinessValidated?: boolean;
  autoStartChildExecutionAllowed?: false;
  limitations: string[];
  reasonCodes?: string[];
  revisionRefs: string[];
  compileReadinessRef: string;
  childExecutionAutoStart: false;
  previousRevisionRef?: string | null;
  priorProposalRef?: string | null;
  nodeProposalRefs: string[];
  edgeProposalRefs: string[];
  limitationRefs: string[];
  revisionRef: string | null;
  supersededByProposalId: string | null;
};

export type CompileReadinessInvalidReason =
  | "missing_node_definitions"
  | "missing_edge_bindings"
  | "capability_unavailable"
  | "role_unassigned"
  | "validation_failed"
  | "dependency_cycle"
  | "raw_storage_detected"
  | "authority_mismatch";

export type CompileReadinessInvalidReasonCategory =
  | "missing_dependency"
  | "type_mismatch"
  | "unresolved_reference"
  | "policy_violation"
  | "authority_conflict"
  | "raw_storage_detected"
  | "lifecycle_invariant_broken"
  | "revision_chain_broken"
  | "schema_violation"
  | "lifecycle_invariant_breach"
  | "limitation_unacknowledged";

export type CompileReadinessValidation = RuntimeArtifactStorageFlags & {
  artifactKind: "compile_readiness";
  validationId: string;
  workflowId: string;
  runtimeJobId: string;
  authority: "runtime";
  lifecycle: Extract<
    ArtifactLifecycle,
    "draft" | "pending" | "validated" | "failed" | "superseded"
  >;
  validationState: ArtifactValidationState;
  validatedAt?: string | null;
  limitations: string[];
  reasonCodes?: string[];
  revisionRefs: string[];
  invalidReasonCategories: CompileReadinessInvalidReasonCategory[];
  proposalRef: string;
  priorValidationRef?: string | null;
  previousRevisionRef?: string | null;
  valid: boolean;
  invalidReasons: CompileReadinessInvalidReason[];
  checkedNodeRefs: string[];
  checkedEdgeRefs: string[];
  limitationRefs: string[];
  revisionRef: string | null;
  supersededByValidationId: string | null;
};

const MAX_REFS_PER_CLASS = 12;
const MAX_REASON_CODES = 24;
const MAX_LIMITATIONS = 12;

function uniqueBounded(values: readonly string[] | undefined, max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rejectRawStorage(
  artifact: Record<string, unknown>,
  reasonCodes: string[],
  prefix: string,
): void {
  if (artifact.rawPromptStored !== false) {
    reasonCodes.push(`${prefix}_raw_prompt_storage_forbidden`);
  }
  if (artifact.rawResponseStored !== false) {
    reasonCodes.push(`${prefix}_raw_response_storage_forbidden`);
  }
  if (artifact.rawLogsStored !== false) {
    reasonCodes.push(`${prefix}_raw_logs_storage_forbidden`);
  }
}

function requireCommonArtifactFields(
  artifact: Record<string, unknown>,
  input: {
    idField: string;
    idReason: string;
    prefix: string;
    authorities: readonly string[];
    lifecycles: readonly string[];
  },
  reasonCodes: string[],
): void {
  if (!nonEmptyString(artifact[input.idField])) {
    reasonCodes.push(input.idReason);
  }
  if (!nonEmptyString(artifact.workflowId)) {
    reasonCodes.push(`${input.prefix}_workflow_id_missing`);
  }
  if (!nonEmptyString(artifact.runtimeJobId)) {
    reasonCodes.push(`${input.prefix}_runtime_job_id_missing`);
  }
  if (!input.authorities.includes(String(artifact.authority))) {
    reasonCodes.push(`${input.prefix}_authority_invalid`);
  }
  if (!input.lifecycles.includes(String(artifact.lifecycle))) {
    reasonCodes.push(`${input.prefix}_lifecycle_invalid`);
  }
  if (!["pending", "valid", "invalid"].includes(String(artifact.validationState))) {
    reasonCodes.push(`${input.prefix}_validation_state_invalid`);
  }
  rejectRawStorage(artifact, reasonCodes, input.prefix);
}

export function validateResearchBrief(brief: unknown): { valid: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const artifact = objectRecord(brief);
  if (!artifact) {
    return { valid: false, reasonCodes: ["research_brief_not_object"] };
  }
  requireCommonArtifactFields(
    artifact,
    {
      idField: "briefId",
      idReason: "research_brief_id_missing",
      prefix: "research_brief",
      authorities: ["model", "human"],
      lifecycles: ["draft", "submitted", "accepted", "superseded"],
    },
    reasonCodes,
  );
  if (!nonEmptyString(artifact.topicRef)) {
    reasonCodes.push("research_brief_topic_ref_missing");
  }
  if (!stringArray(artifact.findingRefs)) {
    reasonCodes.push("research_brief_finding_refs_must_be_array");
  }
  if (!stringArray(artifact.limitationRefs)) {
    reasonCodes.push("research_brief_limitation_refs_must_be_array");
  }
  if (artifact.lifecycle === "superseded" && !nonEmptyString(artifact.supersededByBriefId)) {
    reasonCodes.push("research_brief_superseded_missing_ref");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function validateWorkflowPlanningCapsuleEvidence(capsule: unknown): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const artifact = objectRecord(capsule);
  if (!artifact) {
    return { valid: false, reasonCodes: ["planning_capsule_not_object"] };
  }
  requireCommonArtifactFields(
    artifact,
    {
      idField: "capsuleId",
      idReason: "planning_capsule_id_missing",
      prefix: "planning_capsule",
      authorities: ["model", "human"],
      lifecycles: ["draft", "submitted", "accepted", "superseded"],
    },
    reasonCodes,
  );
  if (!stringArray(artifact.planRefs) || artifact.planRefs.length === 0) {
    reasonCodes.push("planning_capsule_plan_refs_missing");
  }
  if (!stringArray(artifact.dependencyRefs)) {
    reasonCodes.push("planning_capsule_dependency_refs_must_be_array");
  }
  if (!stringArray(artifact.limitationRefs)) {
    reasonCodes.push("planning_capsule_limitation_refs_must_be_array");
  }
  if (artifact.lifecycle === "superseded" && !nonEmptyString(artifact.supersededByCapsuleId)) {
    reasonCodes.push("planning_capsule_superseded_missing_ref");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function validateHumanPlanningDecision(decision: unknown): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const artifact = objectRecord(decision);
  if (!artifact) {
    return { valid: false, reasonCodes: ["human_planning_decision_not_object"] };
  }
  requireCommonArtifactFields(
    artifact,
    {
      idField: "decisionId",
      idReason: "human_planning_decision_id_missing",
      prefix: "human_planning_decision",
      authorities: ["human"],
      lifecycles: ["pending", "paused", "resumed", "approved", "rejected", "superseded"],
    },
    reasonCodes,
  );
  if (!nonEmptyString(artifact.decisionPromptRef)) {
    reasonCodes.push("human_planning_decision_prompt_ref_missing");
  }
  if (!nonEmptyString(artifact.boundedOptionsRef)) {
    reasonCodes.push("human_planning_decision_bounded_options_ref_missing");
  }
  if (artifact.lifecycle === "paused" && !nonEmptyString(artifact.pauseRef)) {
    reasonCodes.push("human_planning_decision_pause_ref_missing");
  }
  if (artifact.lifecycle === "resumed" && !nonEmptyString(artifact.resumeRef)) {
    reasonCodes.push("human_planning_decision_resume_ref_missing");
  }
  if (artifact.rawOwnerResponseStored !== false) {
    reasonCodes.push("human_planning_decision_raw_owner_response_storage_forbidden");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function validateActionGraphProposal(proposal: unknown): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const artifact = objectRecord(proposal);
  if (!artifact) {
    return { valid: false, reasonCodes: ["action_graph_proposal_not_object"] };
  }
  requireCommonArtifactFields(
    artifact,
    {
      idField: "proposalId",
      idReason: "action_graph_proposal_id_missing",
      prefix: "action_graph_proposal",
      authorities: ["model", "human"],
      lifecycles: ["draft", "submitted", "accepted", "superseded"],
    },
    reasonCodes,
  );
  if (!nonEmptyString(artifact.compileReadinessRef)) {
    reasonCodes.push("action_graph_proposal_compile_readiness_ref_missing");
  }
  if (artifact.childExecutionAutoStart !== false) {
    reasonCodes.push("action_graph_proposal_child_execution_auto_start_must_be_false");
  }
  if (!stringArray(artifact.nodeProposalRefs) || artifact.nodeProposalRefs.length === 0) {
    reasonCodes.push("action_graph_proposal_node_refs_missing");
  }
  if (!stringArray(artifact.edgeProposalRefs)) {
    reasonCodes.push("action_graph_proposal_edge_refs_must_be_array");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function validateCompileReadinessValidation(validation: unknown): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const artifact = objectRecord(validation);
  if (!artifact) {
    return { valid: false, reasonCodes: ["compile_readiness_validation_not_object"] };
  }
  requireCommonArtifactFields(
    artifact,
    {
      idField: "validationId",
      idReason: "compile_readiness_validation_id_missing",
      prefix: "compile_readiness_validation",
      authorities: ["runtime"],
      lifecycles: ["draft", "validated", "failed", "superseded"],
    },
    reasonCodes,
  );
  if (!nonEmptyString(artifact.proposalRef)) {
    reasonCodes.push("compile_readiness_validation_proposal_ref_missing");
  }
  if (typeof artifact.valid !== "boolean") {
    reasonCodes.push("compile_readiness_validation_valid_boolean_required");
  }
  const allowedInvalidReasons = new Set<CompileReadinessInvalidReason>([
    "missing_node_definitions",
    "missing_edge_bindings",
    "capability_unavailable",
    "role_unassigned",
    "validation_failed",
    "dependency_cycle",
    "raw_storage_detected",
    "authority_mismatch",
  ]);
  if (!Array.isArray(artifact.invalidReasons)) {
    reasonCodes.push("compile_readiness_validation_invalid_reasons_must_be_array");
  } else {
    for (const reason of artifact.invalidReasons) {
      if (!allowedInvalidReasons.has(reason as CompileReadinessInvalidReason)) {
        reasonCodes.push(
          `compile_readiness_validation_invalid_reason_unrecognized:${String(reason)}`,
        );
      }
    }
  }
  if (
    artifact.valid === false &&
    Array.isArray(artifact.invalidReasons) &&
    artifact.invalidReasons.length === 0
  ) {
    reasonCodes.push("compile_readiness_validation_invalid_requires_reason");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

function refsFor(
  refs: Partial<Record<WorkflowEvidenceClass, string[]>>,
): Partial<Record<WorkflowEvidenceClass, string[]>> {
  const normalized: Partial<Record<WorkflowEvidenceClass, string[]>> = {};
  for (const [evidenceClass, values] of Object.entries(refs) as Array<
    [WorkflowEvidenceClass, string[] | undefined]
  >) {
    const bounded = uniqueBounded(values, MAX_REFS_PER_CLASS);
    if (bounded.length > 0) {
      normalized[evidenceClass] = bounded;
    }
  }
  return normalized;
}

export function listWorkflowEvidenceProfiles(): WorkflowEvidenceProfile[] {
  return [
    {
      profileId: "workflow-evidence-profile.agent-team-coding.v1",
      workflowId: "agent_team.coding",
      displayName: "Coding Team",
      requiredEvidenceClasses: [
        "runtime_graph",
        "scheduler_tool_trace",
        "worker_tool_trace",
        "source_change",
        "validation",
        "review",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["model_call_trace", "script_validation_trace", "human_decision"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["coding_team_profile_requires_graph_tools_edits_validation_review_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.product-spec-planning.v1",
      workflowId: "agent_team.product_spec_planning",
      displayName: "Product/Spec Planning",
      requiredEvidenceClasses: [
        "runtime_graph",
        "scheduler_tool_trace",
        "planning_capsule",
        "action_graph_proposal",
        "compile_readiness",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["research_brief", "human_decision", "model_call_trace"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["product_spec_profile_requires_planning_capsule_compile_readiness_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.architecture-red-team.v1",
      workflowId: "agent_team.architecture_red_team",
      displayName: "Architecture Red-Team And Research Gate",
      requiredEvidenceClasses: [
        "runtime_graph",
        "scheduler_tool_trace",
        "model_call_trace",
        "research_brief",
        "review",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["planning_capsule", "action_graph_proposal", "human_decision"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: [
        "architecture_red_team_profile_requires_boundaries_research_code_gap_review_closeout",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.web-research.v1",
      workflowId: "workflow.web_research",
      displayName: "Web Research",
      requiredEvidenceClasses: [
        "model_call_trace",
        "research_brief",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["review"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["web_research_profile_requires_bounded_research_brief_and_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.single-agent-web-research.v1",
      workflowId: "single_agent.web_research",
      displayName: "Web Research Agent",
      requiredEvidenceClasses: [
        "model_call_trace",
        "research_brief",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["review"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["web_research_agent_profile_requires_bounded_research_brief_and_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.docs-skills.v1",
      workflowId: "workflow.docs_skills",
      displayName: "Docs/Skills",
      requiredEvidenceClasses: [
        "model_call_trace",
        "validation",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["source_change", "review"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["docs_skills_profile_requires_model_trace_validation_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.qa-test.v1",
      workflowId: "workflow.qa_test",
      displayName: "QA/Test",
      requiredEvidenceClasses: [
        "script_validation_trace",
        "validation",
        "review",
        "closeout",
        "work_queue_readback",
      ],
      optionalEvidenceClasses: ["model_call_trace"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["qa_test_profile_requires_validation_trace_review_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.architecture.v1",
      workflowId: "workflow.architecture",
      displayName: "Architecture/Spec Review",
      requiredEvidenceClasses: ["model_call_trace", "review", "closeout", "work_queue_readback"],
      optionalEvidenceClasses: ["planning_capsule"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["architecture_profile_requires_model_trace_review_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.design.v1",
      workflowId: "workflow.design",
      displayName: "Design",
      requiredEvidenceClasses: ["model_call_trace", "review", "closeout", "work_queue_readback"],
      optionalEvidenceClasses: ["research_brief", "planning_capsule", "human_decision"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["design_profile_requires_model_trace_review_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.marketing.v1",
      workflowId: "workflow.marketing",
      displayName: "Marketing",
      requiredEvidenceClasses: ["model_call_trace", "review", "closeout", "work_queue_readback"],
      optionalEvidenceClasses: ["research_brief", "planning_capsule", "human_decision"],
      cleanSuccessAllowed: true,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["marketing_profile_requires_model_trace_review_closeout"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    {
      profileId: "workflow-evidence-profile.generic-dispatch-blocked.v1",
      workflowId: "generic.workflow_fallback",
      displayName: "Generic Workflow Dispatch",
      requiredEvidenceClasses: ["closeout", "work_queue_readback"],
      optionalEvidenceClasses: [],
      cleanSuccessAllowed: false,
      closeoutMustBeModelAuthored: true,
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      reasonCodes: ["generic_workflow_dispatch_cannot_produce_clean_success"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
  ];
}

export function workflowEvidenceProfileForWorkflow(workflowId: string): WorkflowEvidenceProfile {
  const profile = listWorkflowEvidenceProfiles().find(
    (candidate) => candidate.workflowId === workflowId,
  );
  if (profile) {
    return profile;
  }
  return {
    ...listWorkflowEvidenceProfiles().find(
      (candidate) => candidate.workflowId === "generic.workflow_fallback",
    )!,
    workflowId,
  };
}

export function evaluateWorkflowEvidenceProfile(
  input: WorkflowEvidenceProfileEvaluationInput,
): WorkflowEvidenceProfileEvaluation {
  if (input.rawPromptStored || input.rawResponseStored || input.rawLogsStored) {
    return {
      artifactKind: "workflow_evidence_profile_evaluation",
      profileId: "workflow-evidence-profile.raw-storage-rejected.v1",
      workflowId: input.workflowId,
      runtimeJobId: input.runtimeJobId,
      workItemId: input.workItemId ?? null,
      status: "failed",
      accepted: false,
      requiredEvidenceClasses: [],
      optionalEvidenceClasses: [],
      acceptedEvidenceClasses: [],
      missingEvidenceClasses: [],
      evidenceClassRefs: {},
      closeoutSource: input.closeoutSource ?? "unknown",
      deepCompletionReviewRequired: true,
      ownerReadbackRequired: true,
      cleanSuccessAllowed: false,
      reasonCodes: ["workflow_evidence_profile_raw_storage_rejected"],
      limitations: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const profile = workflowEvidenceProfileForWorkflow(input.workflowId);
  const normalizedRefs = refsFor(input.evidenceClassRefs);
  const acceptedEvidenceClasses = profile.requiredEvidenceClasses.filter(
    (evidenceClass) => (normalizedRefs[evidenceClass]?.length ?? 0) > 0,
  );
  const missingEvidenceClasses = profile.requiredEvidenceClasses.filter(
    (evidenceClass) => (normalizedRefs[evidenceClass]?.length ?? 0) === 0,
  );
  const closeoutSource = input.closeoutSource ?? "unknown";
  const degradedCloseout =
    input.degradedCloseout === true ||
    closeoutSource === "degraded_system_fallback" ||
    closeoutSource === "unknown";
  const reasonCodes = uniqueBounded(
    [
      ...profile.reasonCodes,
      ...(input.reasonCodes ?? []),
      ...(profile.cleanSuccessAllowed ? [] : ["workflow_profile_clean_success_not_allowed"]),
      ...(missingEvidenceClasses.length > 0
        ? missingEvidenceClasses.map(
            (evidenceClass) => `workflow_evidence_missing:${evidenceClass}`,
          )
        : ["workflow_evidence_profile_required_classes_present"]),
      ...(profile.closeoutMustBeModelAuthored && degradedCloseout
        ? ["model_authored_closeout_required_before_success"]
        : []),
    ],
    MAX_REASON_CODES,
  );
  const accepted =
    profile.cleanSuccessAllowed &&
    missingEvidenceClasses.length === 0 &&
    (!profile.closeoutMustBeModelAuthored || !degradedCloseout);
  return {
    artifactKind: "workflow_evidence_profile_evaluation",
    profileId: profile.profileId,
    workflowId: input.workflowId,
    runtimeJobId: input.runtimeJobId,
    workItemId: input.workItemId ?? null,
    status: accepted ? "accepted" : "needs_review",
    accepted,
    requiredEvidenceClasses: profile.requiredEvidenceClasses,
    optionalEvidenceClasses: profile.optionalEvidenceClasses,
    acceptedEvidenceClasses,
    missingEvidenceClasses,
    evidenceClassRefs: normalizedRefs,
    closeoutSource,
    deepCompletionReviewRequired: profile.deepCompletionReviewRequired,
    ownerReadbackRequired: profile.ownerReadbackRequired,
    cleanSuccessAllowed: profile.cleanSuccessAllowed,
    reasonCodes,
    limitations: uniqueBounded(input.limitations, MAX_LIMITATIONS),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function workflowEvidenceProfileEvaluationArtifactMetadata(
  evaluation: WorkflowEvidenceProfileEvaluation,
): JsonValue {
  return {
    ...evaluation,
    evidenceClassRefs: evaluation.evidenceClassRefs as JsonValue,
  } as JsonValue;
}
