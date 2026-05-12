export const WORKFLOW_MIDDLEWARE_ADOPTION_VERSION =
  "execution-platform.workflow-middleware-adoption.v1";

export type MiddlewareKind = "model_task" | "script_job" | "db_operation";

export type WorkflowMiddlewareAdoptionRequirement = {
  workflowId: string;
  requiredMiddlewareKinds: MiddlewareKind[];
  temporaryExceptionReason?: string | null;
};

export type WorkflowMiddlewareAdoptionInput = {
  workflowId: string;
  runtimeJobId: string | null;
  runtimeState: string | null;
  modelTaskRefs: string[];
  scriptJobRefs: string[];
  dbOperationRefs: string[];
  artifactRefs: string[];
  reasonCodes: string[];
  directModelCallRefs: string[];
  directScriptCallRefs: string[];
  directDbCallRefs: string[];
  rawPromptStored: boolean;
  rawResponseStored: boolean;
  rawProviderLogStored: boolean;
  rawCommandLogStored: boolean;
  rawDbRowsStored: boolean;
  workQueueLifecycleMutated: boolean;
};

export type WorkflowMiddlewareAdoptionResult = {
  artifactKind: "workflow_middleware_adoption_result";
  adoptionVersion: typeof WORKFLOW_MIDDLEWARE_ADOPTION_VERSION;
  workflowId: string;
  runtimeJobId: string | null;
  accepted: boolean;
  status: "passed" | "needs_review" | "blocked";
  requiredMiddlewareKinds: MiddlewareKind[];
  observedMiddlewareKinds: MiddlewareKind[];
  missingMiddlewareKinds: MiddlewareKind[];
  directBypassDetected: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export const CURRENT_WORKFLOW_MIDDLEWARE_REQUIREMENTS: WorkflowMiddlewareAdoptionRequirement[] = [
  {
    workflowId: "agent_team.coding",
    requiredMiddlewareKinds: ["model_task", "script_job"],
  },
  {
    workflowId: "single_agent.web_research",
    requiredMiddlewareKinds: ["model_task"],
  },
  {
    workflowId: "workflow.research_to_coding_handoff",
    requiredMiddlewareKinds: ["model_task"],
  },
  {
    workflowId: "workflow.docs_skills",
    requiredMiddlewareKinds: ["model_task"],
  },
  {
    workflowId: "agent_team.qa_test",
    requiredMiddlewareKinds: ["model_task", "script_job"],
  },
  {
    workflowId: "agent_team.architecture",
    requiredMiddlewareKinds: ["model_task"],
  },
];

export function evaluateWorkflowMiddlewareAdoption(input: {
  requirement: WorkflowMiddlewareAdoptionRequirement;
  evidence: WorkflowMiddlewareAdoptionInput;
}): WorkflowMiddlewareAdoptionResult {
  const observedMiddlewareKinds: MiddlewareKind[] = [
    ...(input.evidence.modelTaskRefs.length > 0 ? (["model_task"] as const) : []),
    ...(input.evidence.scriptJobRefs.length > 0 ? (["script_job"] as const) : []),
    ...(input.evidence.dbOperationRefs.length > 0 ? (["db_operation"] as const) : []),
  ];
  const missingMiddlewareKinds = input.requirement.requiredMiddlewareKinds.filter(
    (kind) => !observedMiddlewareKinds.includes(kind),
  );
  const directBypassDetected =
    input.evidence.directModelCallRefs.length > 0 ||
    input.evidence.directScriptCallRefs.length > 0 ||
    input.evidence.directDbCallRefs.length > 0;
  const reasonCodes = [
    ...(input.evidence.runtimeState === "succeeded" ? [] : ["workflow_runtime_not_succeeded"]),
    ...missingMiddlewareKinds.map((kind) => `required_middleware_missing:${kind}`),
    ...(directBypassDetected ? ["unapproved_direct_middleware_bypass_detected"] : []),
    ...(input.requirement.temporaryExceptionReason
      ? [`temporary_middleware_exception:${input.requirement.temporaryExceptionReason}`]
      : []),
    ...(input.evidence.rawPromptStored ||
    input.evidence.rawResponseStored ||
    input.evidence.rawProviderLogStored ||
    input.evidence.rawCommandLogStored ||
    input.evidence.rawDbRowsStored
      ? ["raw_storage_flag_detected"]
      : []),
    ...(input.evidence.workQueueLifecycleMutated ? ["work_queue_lifecycle_mutated"] : []),
  ];
  const accepted =
    reasonCodes.length === 0 &&
    missingMiddlewareKinds.length === 0 &&
    !directBypassDetected &&
    input.evidence.runtimeState === "succeeded";
  const hardBlocked = reasonCodes.some((reason) =>
    [
      "raw_storage_flag_detected",
      "work_queue_lifecycle_mutated",
      "unapproved_direct_middleware_bypass_detected",
    ].includes(reason),
  );
  return {
    artifactKind: "workflow_middleware_adoption_result",
    adoptionVersion: WORKFLOW_MIDDLEWARE_ADOPTION_VERSION,
    workflowId: input.requirement.workflowId,
    runtimeJobId: input.evidence.runtimeJobId,
    accepted,
    status: accepted ? "passed" : hardBlocked ? "blocked" : "needs_review",
    requiredMiddlewareKinds: input.requirement.requiredMiddlewareKinds,
    observedMiddlewareKinds,
    missingMiddlewareKinds,
    directBypassDetected,
    reasonCodes: accepted ? ["workflow_middleware_adoption_passed"] : reasonCodes.slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function evaluateCurrentWorkflowMiddlewareAdoption(
  evidence: WorkflowMiddlewareAdoptionInput[],
): WorkflowMiddlewareAdoptionResult[] {
  return CURRENT_WORKFLOW_MIDDLEWARE_REQUIREMENTS.map((requirement) => {
    const workflowEvidence =
      evidence.find((item) => item.workflowId === requirement.workflowId) ??
      missingWorkflowEvidence(requirement.workflowId);
    return evaluateWorkflowMiddlewareAdoption({ requirement, evidence: workflowEvidence });
  });
}

function missingWorkflowEvidence(workflowId: string): WorkflowMiddlewareAdoptionInput {
  return {
    workflowId,
    runtimeJobId: null,
    runtimeState: null,
    modelTaskRefs: [],
    scriptJobRefs: [],
    dbOperationRefs: [],
    artifactRefs: [],
    reasonCodes: ["workflow_middleware_evidence_missing"],
    directModelCallRefs: [],
    directScriptCallRefs: [],
    directDbCallRefs: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}
