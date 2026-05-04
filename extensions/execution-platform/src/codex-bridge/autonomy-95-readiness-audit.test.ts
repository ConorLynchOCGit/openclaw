import { describe, expect, it } from "vitest";
import {
  computeAutonomy95ReadinessAudit,
  type Autonomy95StepEvidence,
  type Autonomy95StepId,
} from "./autonomy-95-readiness-audit.ts";

const STEP_IDS: Autonomy95StepId[] = [
  "worktree_gateway_safety",
  "org_staging_target_config",
  "org_staged_outbound_readonly",
  "org_non_production_deploy_dry_run",
  "repeated_live_provider_parallel_team_runs",
  "repeatable_install_dependency_operation",
  "long_supervisor_service_soak",
  "cross_transport_recovery_under_load",
  "model_degradation_auto_demotion_operational",
  "work_queue_operations_e2e",
  "tailscale_human_loop_operations_rehearsal",
  "model_promotion_eval_cadence_dry_run",
];

function passed(stepId: Autonomy95StepId): Autonomy95StepEvidence {
  return {
    stepId,
    status: "passed",
    evidenceRefs: [`artifact:${stepId}`],
    runtimeBacked: true,
    environmentBacked: true,
    workQueueReadback: true,
    closeoutOrNeedsReview: true,
    liveGatewayStable: true,
    blockerReasonCodes: [],
  };
}

describe("autonomy 95 readiness audit", () => {
  it("allows a 95 percent claim only with all production-operability dimensions", () => {
    const audit = computeAutonomy95ReadinessAudit(STEP_IDS.map(passed));

    expect(audit.scorePercent).toBe(100);
    expect(audit.reached95).toBe(true);
    expect(audit.hardExternalBlockers).toEqual([]);
  });

  it("does not claim 95 when organization staging targets are missing", () => {
    const steps = STEP_IDS.map(passed);
    steps[1] = {
      ...passed("org_staging_target_config"),
      status: "passed_with_blocker",
      environmentBacked: false,
      blockerReasonCodes: [
        "missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
        "missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
      ],
    };

    const audit = computeAutonomy95ReadinessAudit(steps);

    expect(audit.reached95).toBe(false);
    expect(audit.hardExternalBlockers).toEqual([
      "org_staging_target_config:missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
      "org_staging_target_config:missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
    ]);
  });

  it("treats missing Tailscale safe bridge as a hard 95 blocker", () => {
    const steps = STEP_IDS.map(passed);
    steps[10] = {
      ...passed("tailscale_human_loop_operations_rehearsal"),
      status: "passed_with_blocker",
      environmentBacked: false,
      blockerReasonCodes: ["tailscale_safe_bridge_missing"],
    };

    const audit = computeAutonomy95ReadinessAudit(steps);

    expect(audit.reached95).toBe(false);
    expect(audit.hardExternalBlockers).toEqual([
      "tailscale_human_loop_operations_rehearsal:tailscale_safe_bridge_missing",
    ]);
  });
});
