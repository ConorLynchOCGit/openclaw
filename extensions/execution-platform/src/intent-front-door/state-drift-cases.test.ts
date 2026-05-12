import { describe, expect, it } from "vitest";
import { evaluateStateDriftCases, STATE_DRIFT_CASES } from "./state-drift-cases.ts";

describe("StateDriftCases", () => {
  it("covers the required stale authority and state drift cases", () => {
    const kinds = new Set(STATE_DRIFT_CASES.map((driftCase) => driftCase.kind));

    expect(kinds).toEqual(
      new Set([
        "stale_authority_snapshot",
        "changed_approval_state",
        "suspended_authority",
        "locked_authority_after_route",
        "workflow_registry_version_changed",
        "workflow_disabled_after_route",
        "workflow_side_effect_policy_changed",
        "auth_session_version_changed",
        "selected_work_queue_item_stale",
        "active_runtime_job_no_longer_active",
        "target_runtime_job_unauthorized",
        "pending_clarification_expired",
        "pending_approval_expired",
        "cached_route_stale_context",
      ]),
    );
  });

  it("keeps stale state from creating jobs, controls, authority, or lifecycle mutation", () => {
    const evaluation = evaluateStateDriftCases();

    expect(evaluation.status).toBe("passed");
    expect(evaluation.runtimeJobsCreated).toBe(false);
    expect(evaluation.providerCallsMade).toBe(false);
    expect(evaluation.workQueueLifecycleMutated).toBe(false);
    expect(evaluation.rawPromptStored).toBe(false);
    expect(evaluation.rawResponseStored).toBe(false);
  });

  it("uses safe non-success outcomes for every drift case", () => {
    expect(
      STATE_DRIFT_CASES.every((driftCase) =>
        ["blocked", "clarification_required", "approval_required", "needs_review"].includes(
          driftCase.expectedOutcome,
        ),
      ),
    ).toBe(true);

    expect(
      STATE_DRIFT_CASES.find((driftCase) => driftCase.kind === "stale_authority_snapshot")
        ?.expectedReasonCodes,
    ).toContain("authority_snapshot_stale");
    expect(
      STATE_DRIFT_CASES.find((driftCase) => driftCase.kind === "target_runtime_job_unauthorized")
        ?.expectedOutcome,
    ).toBe("blocked");
    expect(
      STATE_DRIFT_CASES.find((driftCase) => driftCase.kind === "selected_work_queue_item_stale")
        ?.expectedOutcome,
    ).toBe("clarification_required");
  });
});
