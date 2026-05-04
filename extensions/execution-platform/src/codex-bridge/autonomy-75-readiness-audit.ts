export type Autonomy75StepId =
  | "supabase_mixed_transport_soak"
  | "real_acp_under_load"
  | "staged_outbound_readonly"
  | "non_production_deploy_dry_run"
  | "real_dependency_lockfile_change"
  | "full_live_parallel_agent_team"
  | "runtime_approval_work_queue_actions"
  | "live_incident_recovery_drill"
  | "authority_readiness_audit"
  | "iteration_closeout";

export type Autonomy75StepStatus =
  | "passed"
  | "passed_with_limited_environment"
  | "needs_review"
  | "blocked";

export type Autonomy75StepEvidence = {
  stepId: Autonomy75StepId;
  status: Autonomy75StepStatus;
  evidenceRefs: string[];
  runtimeBacked: boolean;
  environmentBacked: boolean;
  workQueueReadback: boolean;
  closeoutOrNeedsReview: boolean;
  blockerReasonCodes: string[];
};

export type Autonomy75AuditDimension = {
  stepId: Autonomy75StepId;
  weight: number;
  earned: number;
  status: Autonomy75StepStatus;
  evidenceRefs: string[];
  blockerReasonCodes: string[];
};

export type Autonomy75ReadinessAudit = {
  artifactKind: "autonomy_75_readiness_audit";
  targetPercent: 75;
  scorePercent: number;
  reached75: boolean;
  dimensions: Autonomy75AuditDimension[];
  criticalBlockers: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  productionDeployOccurred: false;
  externalOutboundWriteOrSendOccurred: false;
  productionModelPromotionOccurred: false;
};

const STEP_WEIGHTS: Record<Autonomy75StepId, number> = {
  supabase_mixed_transport_soak: 13,
  real_acp_under_load: 12,
  staged_outbound_readonly: 8,
  non_production_deploy_dry_run: 8,
  real_dependency_lockfile_change: 9,
  full_live_parallel_agent_team: 13,
  runtime_approval_work_queue_actions: 10,
  live_incident_recovery_drill: 10,
  authority_readiness_audit: 9,
  iteration_closeout: 8,
};

function completionFactor(evidence: Autonomy75StepEvidence): number {
  if (evidence.status === "blocked") {
    return 0;
  }
  if (evidence.status === "needs_review") {
    return 0.35;
  }
  if (evidence.status === "passed_with_limited_environment") {
    return 0.65;
  }
  let factor = 1;
  if (!evidence.runtimeBacked) {
    factor -= 0.2;
  }
  if (!evidence.environmentBacked) {
    factor -= 0.2;
  }
  if (!evidence.workQueueReadback) {
    factor -= 0.1;
  }
  if (!evidence.closeoutOrNeedsReview) {
    factor -= 0.1;
  }
  return Math.max(0, factor);
}

function criticalBlockers(steps: Autonomy75StepEvidence[]): string[] {
  const blockers = new Set<string>();
  for (const step of steps) {
    if (step.status === "blocked") {
      blockers.add(`${step.stepId}:blocked`);
    }
    for (const reason of step.blockerReasonCodes) {
      if (
        [
          "supabase_runtime_unavailable",
          "acp_real_endpoint_unavailable",
          "real_dependency_change_not_performed",
          "work_queue_lifecycle_mutated",
          "raw_prompt_or_response_stored",
        ].includes(reason)
      ) {
        blockers.add(`${step.stepId}:${reason}`);
      }
    }
  }
  return [...blockers].toSorted();
}

export function computeAutonomy75ReadinessAudit(
  steps: Autonomy75StepEvidence[],
): Autonomy75ReadinessAudit {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const dimensions = (Object.keys(STEP_WEIGHTS) as Autonomy75StepId[]).map((stepId) => {
    const step =
      byId.get(stepId) ??
      ({
        stepId,
        status: "blocked",
        evidenceRefs: [],
        runtimeBacked: false,
        environmentBacked: false,
        workQueueReadback: false,
        closeoutOrNeedsReview: false,
        blockerReasonCodes: ["missing_step_evidence"],
      } satisfies Autonomy75StepEvidence);
    const weight = STEP_WEIGHTS[stepId];
    return {
      stepId,
      weight,
      earned: Number((weight * completionFactor(step)).toFixed(2)),
      status: step.status,
      evidenceRefs: step.evidenceRefs.slice(0, 10),
      blockerReasonCodes: step.blockerReasonCodes.slice(0, 10),
    };
  });
  const scorePercent = Number(
    dimensions.reduce((total, dimension) => total + dimension.earned, 0).toFixed(2),
  );
  const blockers = criticalBlockers(steps);
  return {
    artifactKind: "autonomy_75_readiness_audit",
    targetPercent: 75,
    scorePercent,
    reached75: scorePercent >= 75 && blockers.length === 0,
    dimensions,
    criticalBlockers: blockers,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    productionDeployOccurred: false,
    externalOutboundWriteOrSendOccurred: false,
    productionModelPromotionOccurred: false,
  };
}
