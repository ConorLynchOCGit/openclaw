import { describe, expect, it } from "vitest";
import {
  computeAutonomy75ReadinessAudit,
  type Autonomy75StepEvidence,
  type Autonomy75StepId,
} from "./autonomy-75-readiness-audit.ts";

const STEP_IDS: Autonomy75StepId[] = [
  "supabase_mixed_transport_soak",
  "real_acp_under_load",
  "staged_outbound_readonly",
  "non_production_deploy_dry_run",
  "real_dependency_lockfile_change",
  "full_live_parallel_agent_team",
  "runtime_approval_work_queue_actions",
  "live_incident_recovery_drill",
  "authority_readiness_audit",
  "iteration_closeout",
];

function passed(stepId: Autonomy75StepId): Autonomy75StepEvidence {
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

describe("autonomy 75 readiness audit", () => {
  it("requires bounded evidence across all major autonomy dimensions", () => {
    const audit = computeAutonomy75ReadinessAudit(STEP_IDS.map(passed));

    expect(audit.scorePercent).toBe(100);
    expect(audit.reached75).toBe(true);
    expect(audit.rawPromptStored).toBe(false);
    expect(audit.workQueueLifecycleMutated).toBe(false);
  });

  it("does not claim 75 when critical live blockers remain", () => {
    const steps = STEP_IDS.map(passed);
    steps[0] = {
      ...passed("supabase_mixed_transport_soak"),
      status: "needs_review",
      runtimeBacked: false,
      environmentBacked: false,
      blockerReasonCodes: ["supabase_runtime_unavailable"],
    };

    const audit = computeAutonomy75ReadinessAudit(steps);

    expect(audit.reached75).toBe(false);
    expect(audit.criticalBlockers).toContain(
      "supabase_mixed_transport_soak:supabase_runtime_unavailable",
    );
  });

  it("scores limited environment proofs below full live evidence", () => {
    const steps = STEP_IDS.map(passed);
    steps[2] = {
      ...passed("staged_outbound_readonly"),
      status: "passed_with_limited_environment",
      environmentBacked: false,
      blockerReasonCodes: ["local_staged_endpoint_only"],
    };

    const audit = computeAutonomy75ReadinessAudit(steps);

    expect(audit.scorePercent).toBeLessThan(100);
    expect(audit.scorePercent).toBeGreaterThanOrEqual(75);
  });
});
