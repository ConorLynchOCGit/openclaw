import { describe, expect, it } from "vitest";
import { buildPhase2ProactivityGrowthLoopReport } from "./phase2-proactivity-growth-loops.ts";
import type { Phase2OpportunityExtractionSource } from "./phase2-proactivity-opportunity-extraction.ts";
import type { Phase2OpportunityLedgerEntry } from "./phase2-proactivity-opportunity-ledger.ts";

function source(
  params: Partial<Phase2OpportunityExtractionSource>,
): Phase2OpportunityExtractionSource {
  return {
    sourceId: params.sourceId ?? "source-1",
    sourceKind: params.sourceKind ?? "user_turn",
    sourceMessageId: params.sourceMessageId ?? "msg-1",
    projectId: params.projectId ?? "openclaw",
    sessionKey: params.sessionKey ?? "main",
    boundedText:
      params.boundedText ??
      "Review the roadmap and active work to generate potential proactivity plans.",
    userPromptSummary: params.userPromptSummary ?? "Review the roadmap and active work",
    sourceRefs: params.sourceRefs ?? ["chat://main/user_turn/msg-1"],
    sourceProfileId: params.sourceProfileId ?? "explicit_user_turn",
    authorityTier: params.authorityTier ?? "user_authoritative",
    contentHash: params.contentHash ?? "content-1",
    proofHash: params.proofHash ?? "proof-1",
    noDarkDataStatus: "pass",
  };
}

function ledgerEntry(params: Partial<Phase2OpportunityLedgerEntry>): Phase2OpportunityLedgerEntry {
  return {
    opportunityId: params.opportunityId ?? "opp-1",
    workItemId: params.workItemId ?? "work-1",
    candidateId: params.candidateId ?? "cand-1",
    queueItemId: params.queueItemId ?? "queue-1",
    sourceFamily: params.sourceFamily ?? "assistant_output",
    projectId: params.projectId ?? "openclaw",
    sessionKey: params.sessionKey ?? "main",
    title: params.title ?? "Runtime seam reset for assistant capture",
    whyNow:
      params.whyNow ??
      "Assistant answers still need to become same-session proactive opportunities reliably.",
    proposedNextStep:
      params.proposedNextStep ??
      "Move same-session proactivity creation into the runtime write path.",
    expectedUserValue:
      params.expectedUserValue ??
      "Makes normal workflow generate useful proactive items without inbox fishing.",
    evidenceSummary:
      params.evidenceSummary ??
      "Recent same-session prompts and heartbeat surfacing showed the runtime seam is still the clearest gap.",
    confidence: params.confidence ?? "high",
    workItemKind: params.workItemKind ?? "planning_request",
    status: params.status ?? "open",
    sourceRefs: params.sourceRefs ?? ["chat://main/assistant_turn/msg-final"],
    sourceProfileIds: params.sourceProfileIds ?? ["cited_assistant_answer"],
    authorityTiers: params.authorityTiers ?? ["cited_soft"],
    contentHashes: params.contentHashes ?? ["content-1"],
    proofHashes: params.proofHashes ?? ["proof-1"],
    blockedReasonCodes: params.blockedReasonCodes ?? [],
    resolvedByChatMessageId: params.resolvedByChatMessageId ?? null,
    supersededByOpportunityId: params.supersededByOpportunityId ?? null,
    attentionRequired: params.attentionRequired ?? true,
    staleLabels: params.staleLabels ?? [],
    conflictLabels: params.conflictLabels ?? [],
    noDarkDataStatus: "pass",
    generatedAt: params.generatedAt ?? "2026-04-27T22:00:00.000Z",
    updatedAt: params.updatedAt ?? "2026-04-27T22:00:00.000Z",
    opportunityClass: params.opportunityClass,
  };
}

describe("phase2 proactivity growth loops", () => {
  it("builds reverse prompts, maintenance jobs, and working buffer state from active work", async () => {
    const report = await buildPhase2ProactivityGrowthLoopReport({
      now: new Date("2026-04-27T22:30:00.000Z"),
      projectId: "openclaw",
      sessionKey: "main",
      activitySources: [
        source({ sourceKind: "user_turn" }),
        source({
          sourceId: "source-2",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-final",
          boundedText:
            "Move same-session proactivity creation into the runtime write path, then switch heartbeat to ledger-first sourcing.",
          sourceRefs: ["chat://main/assistant_turn/msg-final"],
          sourceProfileId: "cited_assistant_answer",
          authorityTier: "cited_soft",
          contentHash: "content-2",
          proofHash: "proof-2",
        }),
      ],
      ledgerEntries: [ledgerEntry({})],
      recurringPatternReport: {
        schemaVersion: "phase2_proactivity_recurring_pattern_report.v1",
        reportId: "recurring-1",
        generatedAt: "2026-04-27T22:30:00.000Z",
        decision: "pattern_opportunities_ready",
        thresholds: [],
        patterns: [],
        opportunities: [
          {
            opportunityId: "pattern-opp-1",
            patternId: "pattern-1",
            projectId: "openclaw",
            sessionKey: "main",
            workItemKind: "planning_request",
            title: "Follow up on repeated ask",
            whyNow: "The same ask recurred enough times to justify a bounded follow-up.",
            proposedNextStep: "Prepare the follow-up automation brief.",
            expectedUserValue: "Reduces repeated explanation and manual repetition.",
            evidenceSummary: "Repeated asks crossed the threshold.",
            confidence: "high",
            sourceRefs: ["chat://main/user_turn/msg-1"],
            sourceProfileIds: ["explicit_user_turn"],
            authorityTiers: ["user_authoritative"],
            contentHashes: ["pattern-content"],
            proofHashes: ["pattern-proof"],
            blockedReasonCodes: [],
            noDarkDataStatus: "pass",
          },
        ],
        checks: [],
        telemetry: {
          schemaVersion: "phase2_proactivity_recurring_pattern.v1",
          reportId: "recurring-1",
          sourceCount: 2,
          patternCount: 1,
          opportunityCount: 1,
          sourceRefs: ["chat://main/user_turn/msg-1"],
          contentHashes: ["pattern-content"],
          proofHashes: ["pattern-proof"],
          noDarkDataStatus: "pass",
        },
        rollbackPlan: {
          rollbackId: "rollback-1",
          killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_RECURRING_PATTERN_DISABLED",
          targetMode: "no_pattern_generated_opportunities",
          disablesPatternLoop: true,
        },
        noDarkDataStatus: "pass",
      },
    });

    expect(report.reversePrompts.length).toBeGreaterThan(1);
    expect(
      report.opportunities.some((opportunity) => opportunity.opportunityClass === "reverse_prompt"),
    ).toBe(true);
    expect(
      report.opportunities.some((opportunity) => opportunity.opportunityClass === "delight"),
    ).toBe(true);
    expect(report.maintenanceJobs.length).toBeGreaterThan(0);
    expect(report.workingBuffer.summaryLines.length).toBeGreaterThan(0);
    expect(report.recoveryState.reasonCode).toBe("live_state_available");
  });

  it("rebuilds a recovery prompt from previous working buffer when live state is thin", async () => {
    const report = await buildPhase2ProactivityGrowthLoopReport({
      now: new Date("2026-04-27T23:00:00.000Z"),
      projectId: "openclaw",
      sessionKey: "main",
      activitySources: [],
      ledgerEntries: [],
      previousWorkingBuffer: {
        workingBufferId: "buffer-1",
        projectId: "openclaw",
        sessionKey: "main",
        activeOpportunityIds: ["old-opp"],
        activeReversePromptIds: ["old-rp"],
        activeMaintenanceJobIds: ["old-job"],
        summaryLines: ["Recover the runtime seam reset thread and re-surface it in heartbeat."],
        capturedAt: "2026-04-27T22:00:00.000Z",
        noDarkDataStatus: "pass",
      },
    });

    expect(report.recoveryState.recoveredFromBuffer).toBe(true);
    expect(
      report.opportunities.some((opportunity) => opportunity.opportunityClass === "recovery"),
    ).toBe(true);
    expect(report.reversePrompts.some((prompt) => prompt.kind === "recovery_prompt")).toBe(true);
  });
});
