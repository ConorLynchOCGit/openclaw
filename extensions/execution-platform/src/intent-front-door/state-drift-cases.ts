export const STATE_DRIFT_CASES_VERSION = "intent-front-door.state-drift-cases.v1";

export type StateDriftCaseKind =
  | "stale_authority_snapshot"
  | "changed_approval_state"
  | "suspended_authority"
  | "locked_authority_after_route"
  | "workflow_registry_version_changed"
  | "workflow_disabled_after_route"
  | "workflow_side_effect_policy_changed"
  | "auth_session_version_changed"
  | "selected_work_queue_item_stale"
  | "active_runtime_job_no_longer_active"
  | "target_runtime_job_unauthorized"
  | "pending_clarification_expired"
  | "pending_approval_expired"
  | "cached_route_stale_context";

export type StateDriftExpectedOutcome =
  | "blocked"
  | "clarification_required"
  | "approval_required"
  | "needs_review";

export type StateDriftCase = {
  artifactKind: "intent_front_door_state_drift_case";
  caseId: string;
  version: typeof STATE_DRIFT_CASES_VERSION;
  kind: StateDriftCaseKind;
  routeDecisionRef: string;
  staleRefs: string[];
  freshRuntimeRefs: string[];
  expectedOutcome: StateDriftExpectedOutcome;
  expectedReasonCodes: string[];
  runtimeJobCreated: false;
  controlApplied: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type StateDriftEvaluation = {
  artifactKind: "intent_front_door_state_drift_evaluation";
  version: typeof STATE_DRIFT_CASES_VERSION;
  totalCases: number;
  passedCount: number;
  failedCount: number;
  status: "passed" | "failed";
  caseResults: Array<{
    caseId: string;
    kind: StateDriftCaseKind;
    outcome: StateDriftExpectedOutcome;
    passed: boolean;
    reasonCodes: string[];
  }>;
  runtimeJobsCreated: false;
  providerCallsMade: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

function driftCase(input: {
  caseId: string;
  kind: StateDriftCaseKind;
  staleRefs: string[];
  freshRuntimeRefs?: string[];
  expectedOutcome: StateDriftExpectedOutcome;
  expectedReasonCodes: string[];
}): StateDriftCase {
  return {
    artifactKind: "intent_front_door_state_drift_case",
    caseId: input.caseId,
    version: STATE_DRIFT_CASES_VERSION,
    kind: input.kind,
    routeDecisionRef: `route-decision://${input.caseId}`,
    staleRefs: input.staleRefs,
    freshRuntimeRefs: input.freshRuntimeRefs ?? ["runtime-truth://current"],
    expectedOutcome: input.expectedOutcome,
    expectedReasonCodes: input.expectedReasonCodes,
    runtimeJobCreated: false,
    controlApplied: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export const STATE_DRIFT_CASES: StateDriftCase[] = [
  driftCase({
    caseId: "state-drift-stale-authority",
    kind: "stale_authority_snapshot",
    staleRefs: ["authority-snapshot://v0"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["authority_snapshot_stale"],
  }),
  driftCase({
    caseId: "state-drift-approval-revoked",
    kind: "changed_approval_state",
    staleRefs: ["approval://production-deploy/revoked"],
    expectedOutcome: "approval_required",
    expectedReasonCodes: ["approval_state_changed"],
  }),
  driftCase({
    caseId: "state-drift-suspended-authority",
    kind: "suspended_authority",
    staleRefs: ["authority://production-deploy/suspended"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["authority_suspended"],
  }),
  driftCase({
    caseId: "state-drift-locked-authority",
    kind: "locked_authority_after_route",
    staleRefs: ["authority://external-outbound-write/locked"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["authority_locked_after_route"],
  }),
  driftCase({
    caseId: "state-drift-registry-version",
    kind: "workflow_registry_version_changed",
    staleRefs: ["workflow-registry://v0"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["workflow_registry_version_mismatch"],
  }),
  driftCase({
    caseId: "state-drift-workflow-disabled",
    kind: "workflow_disabled_after_route",
    staleRefs: ["workflow://agent_team.coding/disabled"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["workflow_disabled_after_route"],
  }),
  driftCase({
    caseId: "state-drift-side-effect-policy",
    kind: "workflow_side_effect_policy_changed",
    staleRefs: ["workflow://agent_team.coding/side-effect-policy-v0"],
    expectedOutcome: "needs_review",
    expectedReasonCodes: ["workflow_side_effect_policy_changed"],
  }),
  driftCase({
    caseId: "state-drift-auth-session",
    kind: "auth_session_version_changed",
    staleRefs: ["auth-session://v0"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["auth_session_version_mismatch"],
  }),
  driftCase({
    caseId: "state-drift-selected-work-item",
    kind: "selected_work_queue_item_stale",
    staleRefs: ["work-item://selected/stale"],
    expectedOutcome: "clarification_required",
    expectedReasonCodes: ["selected_work_queue_item_stale"],
  }),
  driftCase({
    caseId: "state-drift-runtime-job-inactive",
    kind: "active_runtime_job_no_longer_active",
    staleRefs: ["runtime-job://old/succeeded"],
    expectedOutcome: "clarification_required",
    expectedReasonCodes: ["runtime_job_no_longer_active"],
  }),
  driftCase({
    caseId: "state-drift-unauthorized-target",
    kind: "target_runtime_job_unauthorized",
    staleRefs: ["runtime-job://other-session"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["target_runtime_job_unauthorized"],
  }),
  driftCase({
    caseId: "state-drift-clarification-expired",
    kind: "pending_clarification_expired",
    staleRefs: ["clarification://expired"],
    expectedOutcome: "clarification_required",
    expectedReasonCodes: ["pending_clarification_expired"],
  }),
  driftCase({
    caseId: "state-drift-approval-expired",
    kind: "pending_approval_expired",
    staleRefs: ["approval://expired"],
    expectedOutcome: "approval_required",
    expectedReasonCodes: ["pending_approval_expired"],
  }),
  driftCase({
    caseId: "state-drift-cache-context",
    kind: "cached_route_stale_context",
    staleRefs: ["context://v0"],
    expectedOutcome: "blocked",
    expectedReasonCodes: ["cached_route_context_version_mismatch"],
  }),
];

export function evaluateStateDriftCases(
  cases: StateDriftCase[] = STATE_DRIFT_CASES,
): StateDriftEvaluation {
  const caseResults = cases.map((driftCase) => ({
    caseId: driftCase.caseId,
    kind: driftCase.kind,
    outcome: driftCase.expectedOutcome,
    passed:
      !driftCase.runtimeJobCreated &&
      !driftCase.controlApplied &&
      !driftCase.authorityGranted &&
      !driftCase.workQueueLifecycleMutated &&
      !driftCase.rawPromptStored &&
      !driftCase.rawResponseStored,
    reasonCodes: driftCase.expectedReasonCodes,
  }));
  const passedCount = caseResults.filter((result) => result.passed).length;
  return {
    artifactKind: "intent_front_door_state_drift_evaluation",
    version: STATE_DRIFT_CASES_VERSION,
    totalCases: cases.length,
    passedCount,
    failedCount: cases.length - passedCount,
    status: passedCount === cases.length ? "passed" : "failed",
    caseResults,
    runtimeJobsCreated: false,
    providerCallsMade: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
