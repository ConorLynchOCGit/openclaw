import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ControlledProactivitySuggestionsObserved,
  buildPhase2ControlledProactivitySuggestionReport,
  writePhase2ControlledProactivitySuggestionArtifact,
} from "./phase2-controlled-proactivity-suggestions.ts";
import {
  buildPhase2PlannerDefaultPromotionReport,
  type Phase2PlannerDefaultPromotionReport,
} from "./phase2-planner-default-promotion.ts";
import {
  buildPhase2ProactivityBoundaryReport,
  type Phase2ProactivityBoundaryReport,
} from "./phase2-proactivity-action-boundary.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-proactivity-suggestions";
const now = new Date("2026-04-26T04:00:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

async function plannerDefaultReport(): Promise<Phase2PlannerDefaultPromotionReport> {
  return buildPhase2PlannerDefaultPromotionReport({
    now,
    proofMarker: "PHASE2-CONTROLLED-PROACTIVITY-SUGGESTIONS-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
  });
}

async function boundaryReport(): Promise<Phase2ProactivityBoundaryReport> {
  return buildPhase2ProactivityBoundaryReport({
    now,
    plannerDefaultPromotionReport: await plannerDefaultReport(),
  });
}

describe("phase2 controlled proactivity suggestions", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("requires explicit operator/eval scope", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: { ...scope, purpose: "ordinary_chat" },
    });

    expect(report.decision).toBe("outside_scope_report_only");
    expect(report.suggestions).toEqual([]);
    expect(report.telemetry.matchedScope).toBe(false);
  });

  it("generates bounded suggestions inside approved scope", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: requestScope(),
    });

    expect(report.decision).toBe("controlled_suggestions_observed");
    expect(report.suggestions.length).toBeGreaterThan(0);
    expect(report.suggestions.length).toBeLessThanOrEqual(report.policy.maxSuggestionCount);
    expect(report.suggestions.every((suggestion) => suggestion.actionExecution === "none")).toBe(
      true,
    );
    assertPhase2ControlledProactivitySuggestionsObserved(report);
  });

  it("preserves provenance and treats project/docs/artifacts as evidence", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: requestScope(),
    });
    const evidence = report.suggestions.flatMap((suggestion) => suggestion.evidence);

    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((entry) => !entry.semanticTruth)).toBe(true);
    expect(
      evidence.every(
        (entry) => entry.externalImperativeTextHandling === "evidence_not_instruction",
      ),
    ).toBe(true);
    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
  });

  it("keeps suggestions operator-visible and non-user-facing", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: requestScope(),
    });

    expect(report.telemetry.userFacingProactiveMessagesSent).toBe(false);
    expect(report.telemetry.hiddenChatInjectionObserved).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    expect(
      report.suggestions.every(
        (suggestion) =>
          suggestion.operatorVisibleReportOnly &&
          !suggestion.userFacingProactiveMessage &&
          !suggestion.hiddenChatInjection,
      ),
    ).toBe(true);
  });

  it("blocks missing prerequisite reports", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: null,
      approvedScope: scope,
      requestScope: requestScope(),
    });

    expect(report.decision).toBe("blocked");
    expect(report.suggestions).toEqual([]);
    expect(report.checks.find((check) => check.checkId === "boundary:observed")?.status).toBe(
      "fail",
    );
  });

  it("rollback disables controlled suggestions", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: requestScope(),
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED: "true" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.suggestions).toEqual([]);
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.rollbackPlan.disablesControlledSuggestions).toBe(true);
  });

  it("writes bounded JSON and Markdown without prohibited content", async () => {
    const report = await buildPhase2ControlledProactivitySuggestionReport({
      now,
      boundaryReport: await boundaryReport(),
      approvedScope: scope,
      requestScope: requestScope(),
    });
    const artifact = await writePhase2ControlledProactivitySuggestionArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    const written = await fs.readFile(artifact.jsonPath, "utf8");
    expect(written).toContain(report.reportId);
    expect(written).not.toContain("raw-prompt-marker");
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
