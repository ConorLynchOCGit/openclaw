import { describe, expect, it } from "vitest";
import {
  assertPhase2LiveSignalCoverageExpanded,
  buildPhase2LiveSignalCoverageReport,
  classifySystemEventForProactivity,
  convertCoverageSourceToLiveSignalSource,
  type Phase2LiveSignalCoverageSource,
  type Phase2LiveSignalCoverageSeam,
} from "./phase2-live-signal-coverage-expansion.ts";

function source(seam: Phase2LiveSignalCoverageSeam): Phase2LiveSignalCoverageSource {
  return {
    sourceId: `source-${seam}`,
    seam,
    reasonCode:
      seam === "failed_command"
        ? "failed_command_observed"
        : seam === "gateway_error"
          ? "gateway_error_observed"
          : seam === "repeated_user_friction"
            ? "repeated_friction_observed"
            : seam === "unresolved_question"
              ? "unresolved_question_observed"
              : seam === "task_state_change"
                ? "task_state_changed"
                : seam === "maintenance_output"
                  ? "maintenance_candidate_observed"
                  : seam === "project_state_capsule"
                    ? "project_state_update_observed"
                    : seam === "heartbeat_event"
                      ? "heartbeat_followup_observed"
                      : seam === "session_transition"
                        ? "session_transition_observed"
                        : seam === "workflow_transition"
                          ? "workflow_transition_observed"
                          : "ordinary_turn_has_open_loop",
    projectId: "openclaw",
    sessionKey: "main",
    boundedSummary: `${seam} produced a concrete OpenClaw follow-up that should become a proactive work item.`,
    sourceRefs: [`gateway://coverage/${seam}`],
    sourceProfileId: seam === "ordinary_chat_turn" ? "explicit_user_turn" : "tool_result_capture",
    authorityTier: seam === "ordinary_chat_turn" ? "user_authoritative" : "tool_grounded",
    freshness: "recent",
    conflictState: "clear",
  };
}

describe("phase2 live signal coverage expansion", () => {
  it("classifies ordinary chat, task, error, command, friction, question, and transitions", () => {
    expect(
      classifySystemEventForProactivity({ text: "Can we resolve this open question?" }),
    ).toMatchObject({ seam: "unresolved_question", reasonCode: "unresolved_question_observed" });
    expect(classifySystemEventForProactivity({ text: "Exec finished (code 1)" })).toMatchObject({
      seam: "failed_command",
      reasonCode: "failed_command_observed",
    });
    expect(
      classifySystemEventForProactivity({ text: "Gateway degraded error observed" }),
    ).toMatchObject({ seam: "gateway_error", reasonCode: "gateway_error_observed" });
    expect(
      classifySystemEventForProactivity({ text: "This repeated friction happened again" }),
    ).toMatchObject({
      seam: "repeated_user_friction",
      reasonCode: "repeated_friction_observed",
    });
    expect(
      classifySystemEventForProactivity({ text: "Task blocked follow-up is ready" }),
    ).toMatchObject({ seam: "task_state_change", reasonCode: "task_state_changed" });
    expect(classifySystemEventForProactivity({ text: "Workflow boundary reached" })).toMatchObject({
      seam: "workflow_transition",
      reasonCode: "workflow_transition_observed",
    });
    expect(
      classifySystemEventForProactivity({ text: "A normal chat turn needs planning" }),
    ).toMatchObject({
      seam: "ordinary_chat_turn",
      reasonCode: "ordinary_turn_has_open_loop",
    });
  });

  it("converts required seams into live signal sources with reason-code limitations", () => {
    const converted = convertCoverageSourceToLiveSignalSource(source("failed_command"));
    expect(converted).toMatchObject({
      sourceType: "gateway_delivery_or_error_event",
      signalKind: "recent_failure",
      sourceRefs: ["gateway://coverage/failed_command"],
    });
    expect(converted.limitations).toContain("coverage_reason:failed_command_observed");
  });

  it("builds a coverage report from normal live source seams", async () => {
    const report = await buildPhase2LiveSignalCoverageReport({
      sources: [
        source("ordinary_chat_turn"),
        source("task_state_change"),
        source("failed_command"),
        source("repeated_user_friction"),
        source("unresolved_question"),
        source("session_transition"),
        source("maintenance_output"),
        source("project_state_capsule"),
      ],
    });
    assertPhase2LiveSignalCoverageExpanded(report);
    expect(report.telemetry.seams).toContain("ordinary_chat_turn");
    expect(report.telemetry.reasonCodes).toContain("failed_command_observed");
    expect(report.telemetry.convertedSourceCount).toBeGreaterThan(0);
    expect(report.detectionReport.opportunities).toHaveLength(0);
    expect(
      report.detectionReport.checks.find(
        (check) => check.reasonCode === "model_reviewed_opportunity_required",
      )?.status,
    ).toBe("fail");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("blocks missing provenance and no-dark-data failures", async () => {
    const missing = await buildPhase2LiveSignalCoverageReport({
      sources: [{ ...source("ordinary_chat_turn"), sourceRefs: [] }],
    });
    expect(missing.decision).toBe("blocked");
    expect(missing.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ reasonCode: "source_ref_required" })]),
    );
    const noDarkData = await buildPhase2LiveSignalCoverageReport({
      sources: [source("ordinary_chat_turn")],
      forceNoDarkDataFail: true,
    });
    expect(noDarkData.decision).toBe("blocked");
    expect(noDarkData.telemetry.noDarkDataStatus).toBe("fail");
  });
});
