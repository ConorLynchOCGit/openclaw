import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ProductionObservable,
  buildPhase2ProductionObservabilityReport,
  writePhase2ProductionObservabilityArtifact,
} from "./phase2-production-observability.ts";

const TEMP_ROOT = ".artifacts/test-phase2-production-observability";
const now = new Date("2026-04-26T00:00:00.000Z");

describe("phase2 production observability", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("summarizes promoted graph, capsule, context, and hierarchical telemetry", async () => {
    const report = await buildPhase2ProductionObservabilityReport({ now });

    assertPhase2ProductionObservable(report);
    expect(report.status).toBe("healthy");
    expect(report.telemetry.observedCapabilities).toEqual([
      "runtime_graph_reads",
      "project_state_capsule_retrieval",
      "project_state_capsule_context",
      "hierarchical_retrieval",
    ]);
    expect(report.telemetry.sourceMemoryIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds).toContain("explicit_user_turn");
    expect(report.telemetry.authorityTiers).toContain("user_authoritative");
    expect(report.telemetry.proofHashes.length).toBeGreaterThan(0);
    expect(report.alerts).toEqual([]);
    expect(report.noDarkDataStatus).toBe("pass");
  });

  it("emits health alerts for missing provenance and inspection-only leakage", async () => {
    const report = await buildPhase2ProductionObservabilityReport({
      now,
      forceMissingProvenance: true,
      forceInspectionOnlyLeakage: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.alerts.map((alert) => alert.reasonCode)).toEqual(
      expect.arrayContaining(["missing_provenance", "inspection_only_leakage"]),
    );
    expect(() => assertPhase2ProductionObservable(report)).toThrow(/unhealthy/u);
  });

  it("detects budget overflow and stale-marker regressions with deterministic reason codes", async () => {
    const report = await buildPhase2ProductionObservabilityReport({
      now,
      forceBudgetOverflow: true,
      forceStaleMarkerRegression: true,
    });

    expect(report.alerts.map((alert) => alert.reasonCode)).toEqual(
      expect.arrayContaining(["budget_overflow", "stale_marker_regression"]),
    );
    expect(report.healthChecks.find((check) => check.checkId === "budget_within_limits")).toEqual(
      expect.objectContaining({ status: "fail", reasonCode: "budget_required" }),
    );
    expect(report.healthChecks.find((check) => check.checkId === "exact_recent_not_stale")).toEqual(
      expect.objectContaining({ status: "fail", reasonCode: "exact_recent_required" }),
    );
  });

  it("proves rollback restores safe single-pass fallback behavior", async () => {
    const report = await buildPhase2ProductionObservabilityReport({ now });

    expect(report.rollbackProof.fallbackMode).toBe("object_native_single_pass");
    expect(report.rollbackProof.ordinaryRetrievalSafe).toBe(true);
    expect(report.rollbackProof.defaultRetrievalChanged).toBe(false);
    expect(report.rollbackProof.defaultContextInjectionChanged).toBe(false);
    expect(report.rollbackProof.decisions).toHaveLength(4);
    expect(
      report.rollbackProof.decisions.every(
        (entry) => entry.decision === "rolled_back_to_safe_fallback",
      ),
    ).toBe(true);
  });

  it("writes bounded JSON and Markdown artifacts without prohibited raw content", async () => {
    const report = await buildPhase2ProductionObservabilityReport({ now });
    const written = await writePhase2ProductionObservabilityArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });
    const json = await fs.readFile(written.jsonPath, "utf8");
    const markdown = await fs.readFile(path.join(TEMP_ROOT, "report.md"), "utf8");

    expect(written.byteLength).toBeLessThan(512 * 1024);
    expect(json).toContain(report.reportId);
    expect(markdown).toContain("Phase 2 Production Observability Proof");
    expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
    expect(markdown.toLowerCase()).not.toContain("private-phrase-marker");
  });
});
