import { describe, expect, it } from "vitest";
import {
  buildPhase2SkillCandidateLedgerReport,
  type Phase2SkillCandidateActivitySource,
} from "./phase2-skill-candidate-ledger.ts";

function userActivity(overrides: Partial<Phase2SkillCandidateActivitySource> = {}) {
  return {
    sourceId: "user-1",
    sourceKind: "user_turn" as const,
    sourceMessageId: "user-message-1",
    projectId: "openclaw",
    sessionKey: "main",
    boundedText:
      "Focus on recurring work in this repo that should eventually become reusable skills.",
    userPromptSummary:
      "Focus on recurring work in this repo that should eventually become reusable skills.",
    sourceRefs: ["chat://main/user_turn/user-message-1"],
    sourceProfileId: "explicit_user_turn" as const,
    authorityTier: "user_authoritative" as const,
    contentHash: "user-content-hash-1",
    proofHash: "user-proof-hash-1",
    noDarkDataStatus: "pass" as const,
    recordedAt: "2026-04-28T10:00:00.000Z",
    updatedAt: "2026-04-28T10:00:00.000Z",
    ...overrides,
  };
}

function assistantActivity(
  sourceMessageId: string,
  overrides: Partial<Phase2SkillCandidateActivitySource> = {},
) {
  return {
    sourceId: `assistant-${sourceMessageId}`,
    sourceKind: "assistant_turn" as const,
    sourceMessageId,
    projectId: "openclaw",
    sessionKey: "main",
    boundedText:
      "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
    userPromptSummary:
      "Review the current OpenClaw Skills Platform docs and identify concrete implementation opportunities for the skill candidate ledger.",
    sourceRefs: [`chat://main/assistant_turn/${sourceMessageId}`],
    sourceProfileId: "manual_note" as const,
    authorityTier: "tool_grounded" as const,
    contentHash: `assistant-content-${sourceMessageId}`,
    proofHash: `assistant-proof-${sourceMessageId}`,
    noDarkDataStatus: "pass" as const,
    recordedAt: "2026-04-28T10:01:00.000Z",
    updatedAt: "2026-04-28T10:01:00.000Z",
    ...overrides,
  };
}

describe("phase2 skill candidate ledger", () => {
  it("creates one canonical skill candidate from repeated assistant work", async () => {
    const report = await buildPhase2SkillCandidateLedgerReport({
      now: new Date("2026-04-28T10:05:00.000Z"),
      activities: [
        userActivity(),
        assistantActivity("assistant-1"),
        assistantActivity("assistant-2"),
      ],
      assistantCandidates: [
        {
          opportunityId: "assistant-opportunity-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-1",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "Recent skills work keeps repeating in the same repo context.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-1"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-1"],
          proofHashes: ["assistant-proof-assistant-1"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:01:00.000Z",
        },
        {
          opportunityId: "assistant-opportunity-2",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-2",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "The same skills work surfaced again in the active session.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-2"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-2"],
          proofHashes: ["assistant-proof-assistant-2"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:02:00.000Z",
        },
      ],
    });

    expect(report.decision).toBe("skill_candidates_ready");
    expect(report.records).toHaveLength(1);
    expect(report.opportunities).toHaveLength(1);
    expect(report.records[0]).toMatchObject({
      sourceRuntime: "openclaw_session",
      candidateType: "repeated_work_pattern",
      lifecycleStatus: "detected",
      installTargets: ["workspace_skills_dir"],
    });
    expect(report.records[0]?.suggestedSkillName).toContain("skill-candidate-ledger-integration");
    expect(report.records[0]?.recurrenceCount).toBe(2);
    expect(report.opportunities[0]?.skillCandidate.skillCandidateId).toBe(
      report.records[0]?.skillCandidateId,
    );
  });

  it("preserves the canonical candidate id across rebuilds", async () => {
    const previous = await buildPhase2SkillCandidateLedgerReport({
      now: new Date("2026-04-28T10:05:00.000Z"),
      activities: [assistantActivity("assistant-1"), assistantActivity("assistant-2")],
      assistantCandidates: [
        {
          opportunityId: "assistant-opportunity-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-1",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "Recent skills work keeps repeating in the same repo context.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-1"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-1"],
          proofHashes: ["assistant-proof-assistant-1"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:01:00.000Z",
        },
        {
          opportunityId: "assistant-opportunity-2",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-2",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "The same skills work surfaced again in the active session.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-2"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-2"],
          proofHashes: ["assistant-proof-assistant-2"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:02:00.000Z",
        },
      ],
    });

    const current = await buildPhase2SkillCandidateLedgerReport({
      now: new Date("2026-04-28T10:10:00.000Z"),
      activities: [assistantActivity("assistant-1"), assistantActivity("assistant-2")],
      assistantCandidates: [
        {
          opportunityId: "assistant-opportunity-repeat-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-1",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "Recent skills work keeps repeating in the same repo context.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-1"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-1"],
          proofHashes: ["assistant-proof-assistant-1"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:06:00.000Z",
        },
        {
          opportunityId: "assistant-opportunity-repeat-2",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-2",
          projectId: "openclaw",
          sessionKey: "main",
          workItemKind: "planning_request",
          title: "Skill candidate ledger integration",
          whyNow: "The same skills work surfaced again in the active session.",
          proposedNextStep:
            "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
          expectedUserValue:
            "Converts repeated skills work into one reusable flow instead of rediscovering it.",
          evidenceSummary: "Derived from bounded assistant output only.",
          confidence: "high",
          limitations: ["bounded_assistant_output_extraction_only"],
          sourceRefs: ["chat://main/assistant_turn/assistant-2"],
          sourceProfileIds: ["manual_note"],
          authorityTiers: ["tool_grounded"],
          contentHashes: ["assistant-content-assistant-2"],
          proofHashes: ["assistant-proof-assistant-2"],
          completionSignals: [],
          supersessionSignals: [],
          blockedReasonCodes: [],
          noDarkDataStatus: "pass",
          generatedAt: "2026-04-28T10:07:00.000Z",
        },
      ],
      previousRecords: previous.records,
    });

    expect(current.records).toHaveLength(1);
    expect(current.records[0]?.skillCandidateId).toBe(previous.records[0]?.skillCandidateId);
    expect(current.records[0]?.createdAt).toBe(previous.records[0]?.createdAt);
  });

  it("does not create skill candidates from activity text without model-reviewed opportunities", async () => {
    const report = await buildPhase2SkillCandidateLedgerReport({
      now: new Date("2026-04-28T10:15:00.000Z"),
      activities: [
        userActivity({
          sourceId: "user-skill-activity-1",
          sourceMessageId: "user-skill-activity-1",
          boundedText:
            "Stay on the same skill-candidate area and explain whether the repeated workflow signal should update the existing skill candidate.",
          userPromptSummary:
            "Stay on the same skill-candidate area and explain whether the repeated workflow signal should update the existing skill candidate.",
        }),
        assistantActivity("assistant-activity-1", {
          boundedText:
            "The repeated workflow signal should reinforce the existing skill candidate instead of opening a new one when the reusable workflow shape stays the same.",
          userPromptSummary:
            "Stay on the same skill-candidate area and identify the strongest repeated workflow signal.",
          recordedAt: "2026-04-28T10:11:00.000Z",
          updatedAt: "2026-04-28T10:11:00.000Z",
        }),
        assistantActivity("assistant-activity-2", {
          boundedText:
            "It should update the existing skill candidate by default because the same reusable workflow is recurring again in bounded operator work.",
          userPromptSummary:
            "Stay on the same topic and explain whether the repeated workflow signal should update the existing skill candidate.",
          recordedAt: "2026-04-28T10:12:00.000Z",
          updatedAt: "2026-04-28T10:12:00.000Z",
        }),
      ],
      assistantCandidates: [],
    });

    expect(report.decision).toBe("no_skill_candidates");
    expect(report.records).toHaveLength(0);
    expect(report.opportunities).toHaveLength(0);
  });
});
