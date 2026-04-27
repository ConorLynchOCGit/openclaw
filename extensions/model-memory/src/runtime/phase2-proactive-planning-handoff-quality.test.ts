import { describe, expect, it } from "vitest";
import {
  assertPhase2ProactiveHandoffQualityEnabled,
  buildPhase2ProactiveHandoffQualityReport,
  buildProactiveHandoffText,
  expectedOutputForHandoff,
} from "./phase2-proactive-planning-handoff-quality.ts";

const basePayload = {
  workItemId: "work-item-1",
  candidateId: "candidate-1",
  actionType: "plan_this" as const,
  workItemKind: "planning_request" as const,
  title: "Advance live signal coverage",
  whyNow: "Normal OpenClaw work now emits live proactivity signals.",
  boundedContextSummary: "Live signal coverage needs a concrete acceptance plan.",
  evidenceSummary: "Evidence comes from bounded source refs and proof hashes.",
  sourceRefs: ["gateway://system-events/main/ordinary_chat_turn/source-1"],
  sourceProfileIds: ["tool_result_capture" as const],
  authorityTiers: ["tool_grounded" as const],
  contentHashes: ["content-hash-1"],
  proofHashes: ["proof-hash-1"],
  limitations: ["bounded_summary_only"],
  safetyBoundary: "No edits, sends, or action execution without explicit approval.",
  usesChatInject: false as const,
  executesAction: false as const,
  autonomousSending: false as const,
};

describe("phase2 proactive planning handoff quality", () => {
  it("maps intent CTAs to useful expected output contracts", () => {
    expect(expectedOutputForHandoff("plan_this")).toBe("concise_plan_options_risks_next_steps");
    expect(expectedOutputForHandoff("investigate")).toBe(
      "findings_evidence_uncertainty_next_safe_step",
    );
    expect(expectedOutputForHandoff("draft_next_steps")).toBe(
      "drafted_next_steps_and_user_decision",
    );
    expect(expectedOutputForHandoff("start_scoped_task")).toBe("execution_proposal_only");
  });

  it("builds bounded handoff text with goal, evidence, constraints, and safety boundary", () => {
    const text = buildProactiveHandoffText({
      ...basePayload,
      expectedOutput: "concise_plan_options_risks_next_steps",
    });
    expect(text).toContain("Goal: produce concise plan options risks next steps");
    expect(text).toContain("Evidence summary");
    expect(text).toContain("Constraints");
    expect(text).toContain("Safety boundary");
    expect(text.toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("accepts planning, investigation, and drafting handoffs without chat.inject", async () => {
    const report = await buildPhase2ProactiveHandoffQualityReport({
      payloads: [
        basePayload,
        { ...basePayload, workItemId: "work-item-2", actionType: "investigate" },
        { ...basePayload, workItemId: "work-item-3", actionType: "draft_next_steps" },
      ],
    });
    assertPhase2ProactiveHandoffQualityEnabled(report);
    expect(report.telemetry).toMatchObject({
      handoffCount: 3,
      planningCount: 1,
      investigationCount: 1,
      draftingCount: 1,
      chatInjectObservedForNonMessage: false,
      actionExecutionObserved: false,
    });
    expect(report.payloads[1]?.expectedOutput).toBe("findings_evidence_uncertainty_next_safe_step");
  });

  it("blocks chat.inject and action execution for non-message handoffs", async () => {
    const report = await buildPhase2ProactiveHandoffQualityReport({
      payloads: [basePayload],
      forceChatInjectForNonMessage: true,
      forceActionExecution: true,
    });
    expect(report.decision).toBe("blocked");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: "chat_inject_for_non_message_blocked",
          status: "fail",
        }),
        expect.objectContaining({ reasonCode: "action_execution_disabled", status: "fail" }),
      ]),
    );
  });
});
