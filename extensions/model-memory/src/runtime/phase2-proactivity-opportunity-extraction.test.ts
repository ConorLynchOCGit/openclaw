import { describe, expect, it } from "vitest";
import { buildPhase2ProactivityOpportunityExtractionReport } from "./phase2-proactivity-opportunity-extraction.ts";

describe("phase2 proactivity opportunity extraction", () => {
  it("extracts concrete opportunities from assistant planning output", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      now: new Date("2026-04-27T15:00:00.000Z"),
      sources: [
        {
          sourceId: "assistant-plan-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-assistant-1",
          sourceRunId: "run-assistant-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText: [
            "Potential next steps:",
            "1. Plan the generator reset so roadmap review results become inbox opportunities automatically.",
            "2. Investigate stale proactivity items that still surface after the work is already done.",
          ].join("\n"),
          userPromptSummary:
            "Review the roadmap and active work to generate potential proactivity plans.",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates).toHaveLength(2);
    expect(report.candidates[0]).toMatchObject({
      sourceKind: "assistant_turn",
      sourceMessageId: "msg-assistant-1",
      projectId: "openclaw",
      sessionKey: "main",
      noDarkDataStatus: "pass",
    });
    expect(report.candidates.map((candidate) => candidate.proposedNextStep)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("roadmap review results become inbox opportunities automatically"),
        expect.stringContaining("stale proactivity items"),
      ]),
    );
  });

  it("blocks generic placeholder output from becoming opportunities", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-placeholder-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-assistant-placeholder-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "A suggestion is available. Review the memory-derived suggestion when convenient.",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-placeholder-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
    expect(
      report.checks.find((check) => check.reasonCode === "generic_placeholder_blocked")?.status,
    ).toBe("pass");
  });

  it("treats bounded implementation next steps as concrete opportunities", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-implement-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-assistant-implement-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText: [
            "1. **Title:** Runtime-authoritative assistant-output proactivity capture",
            "- **Why now:** The live workflow still drops normal assistant answers before they become same-session opportunities.",
            "- **Proposed next step:** Implement a bounded runtime packet that captures assistant final answers at session-persistence time and writes canonical proactivity opportunity records without relying on UI-originated chat-activity callbacks.",
          ].join("\n"),
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-implement-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.title).toBe(
      "Runtime packet that captures assistant final answers at session-persistence",
    );
    expect(report.candidates[0]?.proposedNextStep).toContain(
      "captures assistant final answers at session-persistence time",
    );
  });

  it("does not use prompt scaffolding as the user-facing why-now text", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-prompt-shaped-why-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-prompt-shaped-why-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "Move assistant-output proactivity capture into the runtime path: Implement a bounded runtime packet that records assistant final answers into the canonical proactivity ledger at session-persistence time.",
          userPromptSummary:
            "Review the current OpenClaw proactivity reset work and identify the top 5 concrete next opportunities.",
          sourceRefs: ["chat://main/assistant_turn/msg-prompt-shaped-why-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.whyNow).toBe(
      "Recent work in openclaw surfaced this as a concrete next step worth reviewing now.",
    );
  });

  it("cleans system metadata out of primary surfaced fields", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-cleanup-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-cleanup-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText: [
            "1. **Title:** Planner candidate-plan generation",
            "- **Why now:** System: [2026-04-27 20:15 UTC] [Post-compaction context refresh] The current candidate-plan path still leaks junk into user-facing copy. Source: chat://main/assistant_turn/msg-cleanup-1.",
            "- **Proposed next step:** Planner candidate-plan generation: strip sender metadata, Source: chat:// refs, and HEARTBEAT boilerplate from surfaced copy.",
            "- **Expected user value:** Keeps surfaced proactivity readable.",
            '- **Evidence summary:** Sender (untrusted metadata): {"label":"openclaw-control-ui","id":"openclaw-control-ui"}',
          ].join("\n"),
          sourceRefs: ["chat://main/assistant_turn/msg-cleanup-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates[0]).toMatchObject({
      title: "Planner candidate-plan generation",
      whyNow: "The current candidate-plan path still leaks junk into user-facing copy.",
      expectedUserValue: "Keeps surfaced proactivity readable.",
    });
    expect(report.candidates[0]?.proposedNextStep).not.toContain("Source:");
    expect(report.candidates[0]?.evidenceSummary).toBe(
      "Extracted from bounded assistant turn output.",
    );
  });

  it("suppresses system-only heartbeat/control-plane candidates", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-heartbeat-control-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-heartbeat-control-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "Read HEARTBEAT.md if it exists. HEARTBEAT_OK. Canonically verify the active session's planning state.",
          userPromptSummary:
            "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.",
          sourceRefs: ["chat://main/assistant_turn/msg-heartbeat-control-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
  });

  it("suppresses internal proof and plan-handoff candidates from assistant output", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-proof-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-proof-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "Acknowledged. Proof marker: TEST-PROOF. Status: staged proposal approved for audit only.",
          userPromptSummary:
            "Operator Phase 2 staged action approval proof. Proof marker: TEST-PROOF. Approve the staged proposal for audit only. Do not execute.",
          sourceRefs: ["chat://main/assistant_turn/msg-proof-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
        {
          sourceId: "assistant-handoff-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-handoff-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "## Bounded plan: Heartbeat proactivity review\n### Scope\nDecide the next bounded repo move for making heartbeat less legacy and more runtime-authoritative.",
          userPromptSummary:
            "Start a bounded plan this for this proactive work item. Heartbeat proactivity review. Context to use: heartbeat.",
          sourceRefs: ["chat://main/assistant_turn/msg-handoff-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
  });
});
