import { describe, expect, it } from "vitest";
import {
  buildPhase2EntryDecisionReport,
  runPhase2EntryNoDarkDataPack,
  runPhase2EntryRetrievalEvalMatrix,
} from "./phase2-entry-validation.ts";

describe("phase2 entry validation", () => {
  it("passes the deterministic retrieval eval matrix", () => {
    const report = runPhase2EntryRetrievalEvalMatrix();
    expect(report.summary.failed).toBe(0);
    expect(report.summary.total).toBeGreaterThanOrEqual(10);
  });

  it("passes the deterministic no-dark-data adversarial pack", async () => {
    const report = await runPhase2EntryNoDarkDataPack();
    expect(report.summary.failed).toBe(0);
    expect(report.summary.total).toBeGreaterThanOrEqual(4);
  });

  it("keeps phase 2 blocked when recovery or pg_stat_statements gates are red", () => {
    const decision = buildPhase2EntryDecisionReport({
      dbBaseline: {
        pgStatStatementsAvailable: false,
        pgStatStatementsReason: "not_installed",
        maintenanceOverallSeverity: "green",
        maintenanceRedCount: 0,
        maintenanceYellowCount: 0,
      },
      recoveryBaseline: {
        phase2EntrySafe: false,
        overallReconcileClass: "rebuild_required",
        blockingSurfaceIds: ["runtime_dirty"],
      },
      loadTest: {
        severity: "green",
        blockers: [],
        warnings: [],
      },
      retrievalEvals: {
        summary: {
          total: 11,
          passed: 11,
          failed: 0,
          failedCaseIds: [],
        },
      },
      noDarkData: {
        summary: {
          total: 4,
          passed: 4,
          failed: 0,
          failedCaseIds: [],
        },
      },
      liveValidation: {
        severity: "green",
        blockers: [],
        warnings: [],
      },
    });

    expect(decision.status).toBe("red");
    expect(decision.authorizedToBeginPhase2).toBe(false);
    expect(decision.blockers.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["pg_stat_statements_unavailable", "recovery_gate_not_safe"]),
    );
  });
});
