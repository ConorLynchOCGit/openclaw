export type Autonomy95StepId =
  | "worktree_gateway_safety"
  | "org_staging_target_config"
  | "org_staged_outbound_readonly"
  | "org_non_production_deploy_dry_run"
  | "repeated_live_provider_parallel_team_runs"
  | "repeatable_install_dependency_operation"
  | "long_supervisor_service_soak"
  | "cross_transport_recovery_under_load"
  | "model_degradation_auto_demotion_operational"
  | "work_queue_operations_e2e"
  | "tailscale_human_loop_operations_rehearsal"
  | "model_promotion_eval_cadence_dry_run";

export type Autonomy95StepStatus = "passed" | "passed_with_blocker" | "needs_review" | "blocked";

export type Autonomy95StepEvidence = {
  stepId: Autonomy95StepId;
  status: Autonomy95StepStatus;
  evidenceRefs: string[];
  runtimeBacked: boolean;
  environmentBacked: boolean;
  workQueueReadback: boolean;
  closeoutOrNeedsReview: boolean;
  liveGatewayStable: boolean;
  blockerReasonCodes: string[];
};

export type Autonomy95ReadinessAuditDimension = {
  stepId: Autonomy95StepId;
  weight: number;
  earned: number;
  status: Autonomy95StepStatus;
  evidenceRefs: string[];
  blockerReasonCodes: string[];
};

export type Autonomy95ReadinessAudit = {
  artifactKind: "autonomy_95_readiness_audit";
  targetPercent: 95;
  scorePercent: number;
  reached95: boolean;
  dimensions: Autonomy95ReadinessAuditDimension[];
  hardExternalBlockers: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  productionDeployOccurred: false;
  externalOutboundWriteOrSendOccurred: false;
  productionModelPromotionOccurred: false;
};

const STEP_WEIGHTS: Record<Autonomy95StepId, number> = {
  worktree_gateway_safety: 8,
  org_staging_target_config: 10,
  org_staged_outbound_readonly: 9,
  org_non_production_deploy_dry_run: 9,
  repeated_live_provider_parallel_team_runs: 13,
  repeatable_install_dependency_operation: 7,
  long_supervisor_service_soak: 9,
  cross_transport_recovery_under_load: 9,
  model_degradation_auto_demotion_operational: 7,
  work_queue_operations_e2e: 7,
  tailscale_human_loop_operations_rehearsal: 7,
  model_promotion_eval_cadence_dry_run: 5,
};

const HARD_EXTERNAL_BLOCKERS = new Set([
  "missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
  "missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
  "org_staged_outbound_target_unavailable",
  "org_non_production_deploy_target_unavailable",
  "gateway_pairing_required",
  "gateway_unhealthy_after_config",
  "tailscale_safe_bridge_missing",
  "live_provider_team_runs_missing",
]);

function completionFactor(evidence: Autonomy95StepEvidence): number {
  if (evidence.status === "blocked") {
    return 0;
  }
  if (evidence.status === "needs_review") {
    return 0.35;
  }
  if (evidence.status === "passed_with_blocker") {
    return 0.5;
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
  if (!evidence.liveGatewayStable) {
    factor -= 0.2;
  }
  return Math.max(0, factor);
}

function hardExternalBlockers(steps: Autonomy95StepEvidence[]): string[] {
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

export function computeAutonomy95ReadinessAudit(
  steps: Autonomy95StepEvidence[],
): Autonomy95ReadinessAudit {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const dimensions = (Object.keys(STEP_WEIGHTS) as Autonomy95StepId[]).map((stepId) => {
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
        liveGatewayStable: false,
        blockerReasonCodes: ["missing_step_evidence"],
      } satisfies Autonomy95StepEvidence);
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
    artifactKind: "autonomy_95_readiness_audit",
    targetPercent: 95,
    scorePercent,
    reached95: scorePercent >= 95 && blockers.length === 0,
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
