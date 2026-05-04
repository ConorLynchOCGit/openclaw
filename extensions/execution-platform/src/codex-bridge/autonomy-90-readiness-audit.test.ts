import { describe, expect, it } from "vitest";
import {
  computeAutonomy90ReadinessAudit,
  type Autonomy90StepEvidence,
  type Autonomy90StepId,
} from "./autonomy-90-readiness-audit.ts";

const STEP_IDS: Autonomy90StepId[] = [
  "long_always_on_supervisor_soak",
  "organization_staging_targets",
  "production_grade_work_queue_actions",
  "high_blast_radius_approval_enforcement",
  "repeated_live_parallel_agent_team_runs",
  "model_degradation_auto_demotion",
  "cross_transport_recovery_under_load",
  "repeatable_install_dependency_authority",
  "model_promotion_real_eval_cadence_dry_run",
  "human_in_loop_operations_rehearsal",
];

function passed(stepId: Autonomy90StepId): Autonomy90StepEvidence {
  return {
    stepId,
    status: "passed",
    evidenceRefs: [`artifact:${stepId}`],
    runtimeBacked: true,
    environmentBacked: true,
    workQueueReadback: true,
    closeoutOrNeedsReview: true,
    blockerReasonCodes: [],
  };
}

describe("autonomy 90 readiness audit", () => {
  it("allows a 90 percent claim only when all major production-operation dimensions pass", () => {
    const audit = computeAutonomy90ReadinessAudit(STEP_IDS.map(passed));

    expect(audit.scorePercent).toBe(100);
    expect(audit.reached90).toBe(true);
    expect(audit.hardExternalBlockers).toEqual([]);
  });

  it("does not claim 90 when organization staging config is missing", () => {
    const steps = STEP_IDS.map(passed);
    steps[1] = {
      ...passed("organization_staging_targets"),
      status: "passed_with_blocker",
      environmentBacked: false,
      blockerReasonCodes: [
        "missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
        "missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
      ],
    };

    const audit = computeAutonomy90ReadinessAudit(steps);

    expect(audit.reached90).toBe(false);
    expect(audit.hardExternalBlockers).toEqual([
      "organization_staging_targets:missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET",
      "organization_staging_targets:missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL",
    ]);
  });

  it("scores runtime-only proofs below environment-backed production evidence", () => {
    const steps = STEP_IDS.map(passed);
    steps[4] = {
      ...passed("repeated_live_parallel_agent_team_runs"),
      environmentBacked: false,
      blockerReasonCodes: ["provider_calls_not_made"],
    };

    const audit = computeAutonomy90ReadinessAudit(steps);

    expect(audit.scorePercent).toBeLessThan(100);
    expect(audit.rawPromptStored).toBe(false);
    expect(audit.workQueueLifecycleMutated).toBe(false);
  });
});
