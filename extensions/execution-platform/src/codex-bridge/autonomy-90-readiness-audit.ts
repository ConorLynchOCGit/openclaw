export type Autonomy90StepId =
  | "long_always_on_supervisor_soak"
  | "organization_staging_targets"
  | "production_grade_work_queue_actions"
  | "high_blast_radius_approval_enforcement"
  | "repeated_live_parallel_agent_team_runs"
  | "model_degradation_auto_demotion"
  | "cross_transport_recovery_under_load"
  | "repeatable_install_dependency_authority"
  | "model_promotion_real_eval_cadence_dry_run"
  | "human_in_loop_operations_rehearsal";

export type Autonomy90StepStatus = "passed" | "passed_with_blocker" | "needs_review" | "blocked";

export type Autonomy90StepEvidence = {
  stepId: Autonomy90StepId;
  status: Autonomy90StepStatus;
  evidenceRefs: string[];
  runtimeBacked: boolean;
  environmentBacked: boolean;
  workQueueReadback: boolean;
  closeoutOrNeedsReview: boolean;
  blockerReasonCodes: string[];
};

export type Autonomy90ReadinessAuditDimension = {
  stepId: Autonomy90StepId;
  weight: number;
  earned: number;
  status: Autonomy90StepStatus;
  evidenceRefs: string[];
  blockerReasonCodes: string[];
};

export type Autonomy90ReadinessAudit = {
  artifactKind: "autonomy_90_readiness_audit";
  targetPercent: 90;
  scorePercent: number;
  reached90: boolean;
  dimensions: Autonomy90ReadinessAuditDimension[];
  hardExternalBlockers: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  productionDeployOccurred: false;
  externalOutboundWriteOrSendOccurred: false;
  productionModelPromotionOccurred: false;
};

const STEP_WEIGHTS: Record<Autonomy90StepId, number> = {
  long_always_on_supervisor_soak: 12,
  organization_staging_targets: 14,
  production_grade_work_queue_actions: 10,
  high_blast_radius_approval_enforcement: 10,
  repeated_live_parallel_agent_team_runs: 12,
  model_degradation_auto_demotion: 9,
  cross_transport_recovery_under_load: 10,
  repeatable_install_dependency_authority: 8,
  model_promotion_real_eval_cadence_dry_run: 8,
  human_in_loop_operations_rehearsal: 7,
};

const HARD_EXTERNAL_BLOCKERS = new Set([
  "missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
  "missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
  "organization_staging_target_unavailable",
  "organization_deploy_target_unavailable",
]);

function completionFactor(evidence: Autonomy90StepEvidence): number {
  if (evidence.status === "blocked") {
    return 0;
  }
  if (evidence.status === "needs_review") {
    return 0.35;
  }
  if (evidence.status === "passed_with_blocker") {
    return 0.55;
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

function hardExternalBlockers(steps: Autonomy90StepEvidence[]): string[] {
  const blockers = new Set<string>();
  for (const step of steps) {
    for (const reason of step.blockerReasonCodes) {
      if (HARD_EXTERNAL_BLOCKERS.has(reason)) {
        blockers.add(`${step.stepId}:${reason}`);
      }
    }
  }
  return [...blockers].toSorted();
}

export function computeAutonomy90ReadinessAudit(
  steps: Autonomy90StepEvidence[],
): Autonomy90ReadinessAudit {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const dimensions = (Object.keys(STEP_WEIGHTS) as Autonomy90StepId[]).map((stepId) => {
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
      } satisfies Autonomy90StepEvidence);
    const weight = STEP_WEIGHTS[stepId];
    return {
      stepId,
      weight,
      earned: Number((weight * completionFactor(step)).toFixed(2)),
      status: step.status,
      evidenceRefs: step.evidenceRefs.slice(0, 12),
      blockerReasonCodes: step.blockerReasonCodes.slice(0, 12),
    };
  });
  const scorePercent = Number(
    dimensions.reduce((total, dimension) => total + dimension.earned, 0).toFixed(2),
  );
  const blockers = hardExternalBlockers(steps);
  return {
    artifactKind: "autonomy_90_readiness_audit",
    targetPercent: 90,
    scorePercent,
    reached90: scorePercent >= 90 && blockers.length === 0,
    dimensions,
    hardExternalBlockers: blockers,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    productionDeployOccurred: false,
    externalOutboundWriteOrSendOccurred: false,
    productionModelPromotionOccurred: false,
  };
}
