import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import {
  decidePhase2ProactivityContextMatch,
  resolvePhase2ProactivityActiveContext,
} from "./phase2-proactivity-active-context.ts";
import {
  buildPhase2ProactivityHeartbeatReviewReport,
  writePhase2ProactivityHeartbeatReviewArtifact,
} from "./phase2-proactivity-heartbeat-review-loop.ts";
import { buildPhase2ProactivityInboxReport } from "./phase2-proactivity-inbox.ts";
import {
  buildPhase2ProactivityProductCorrectnessReport,
  writePhase2ProactivityProductCorrectnessArtifact,
} from "./phase2-proactivity-product-correctness.ts";
import { buildPhase2ProductProactivitySurfacingReport } from "./phase2-product-proactivity-presentation.ts";

function modelBriefJsonOutput() {
  return JSON.stringify({
    schemaVersion: "model_authored_proactivity_brief_output.v1",
    decision: "surface",
    kindCode: "follow_up",
    titleWords: ["Product", "correctness", "validation", "follow-up"],
    oneLinePurposeWords: [
      "Confirms",
      "the",
      "proactivity",
      "surface",
      "shows",
      "a",
      "concrete",
      "reviewable",
      "plan",
    ],
    recommendedNextStepWords: [
      "Review",
      "the",
      "product",
      "correctness",
      "card",
      "and",
      "confirm",
      "the",
      "counts",
    ],
    primaryActionLabelWords: ["Plan", "this"],
    statusLabelWords: null,
    detailSummaryWords: ["Bounded", "product", "correctness", "evidence", "is", "available"],
    hiddenDiagnostics: { whyDemotedOrRepairedWords: null, limitations: [] },
    qualityReasons: [],
  });
}

class FakeModelBriefExecutor implements JsonModelExecutor {
  async execute(request: JsonModelExecutionRequest) {
    return {
      outputText: modelBriefJsonOutput(),
      resolvedModelId: request.contract.modelId,
      usage: { promptTokens: 120, outputTokens: 80 },
    };
  }
}

async function buildLiveInboxReport(now: Date) {
  const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
    now,
    sources: [
      {
        sourceId: "product-correctness-live-source-1",
        sourceType: "session_runtime_event",
        signalKind: "active_work_state",
        projectId: "openclaw",
        sessionKey: "main",
        boundedSummary:
          "OpenClaw product correctness validation has a concrete live proactivity item.",
        sourceRefs: [
          "gateway://model-memory/proactivity/live-event/product-correctness-live-source-1",
        ],
        sourceProfileId: "manual_note",
        authorityTier: "tool_grounded",
        freshness: "recent",
        conflictState: "clear",
        noDarkDataStatus: "pass",
      },
    ],
    modelReviewedOpportunities: [
      {
        sourceId: "product-correctness-live-source-1",
        workItemKind: "planning_request",
        title: "Product correctness validation follow-up",
        whyNow:
          "A model-reviewed candidate identified a concrete product correctness validation item.",
        proposedNextStep: "Review the product correctness card and confirm the counts.",
        expectedUserValue: "Keeps product correctness validation tied to reviewed evidence.",
        evidenceSummary:
          "OpenClaw product correctness validation has a concrete live proactivity item.",
        confidence: "high",
      },
    ],
  });
  const productSurfacingReport = await buildPhase2ProductProactivitySurfacingReport({
    now,
    liveDetectionReport,
    modelBriefOptions: {
      enabled: true,
      executor: new FakeModelBriefExecutor(),
      modelId: "openai-codex/gpt-5.4",
    },
  });
  return buildPhase2ProactivityInboxReport({ now, productSurfacingReport });
}

describe("phase2 proactivity product correctness", () => {
  it("surfaces only exact active-context matches and explains mismatches", () => {
    const context = resolvePhase2ProactivityActiveContext({
      userId: "conor",
      recipientId: "conor",
      projectId: "openclaw",
      sessionKey: "main",
      operatorId: "operator-conor",
      taskId: "ux-remediation",
    });

    expect(
      decidePhase2ProactivityContextMatch({
        activeContext: context,
        candidateScope: {
          projectId: "openclaw",
          sessionKey: "main",
          taskId: "ux-remediation",
        },
      }),
    ).toMatchObject({ decision: "surface_inline", exactMatch: true });

    const mismatch = decidePhase2ProactivityContextMatch({
      activeContext: context,
      candidateScope: { projectId: "other-project", sessionKey: "other-session" },
    });

    expect(mismatch.decision).toBe("keep_in_inbox");
    expect(mismatch.reasonCodes).toContain("project_mismatch");
    expect(mismatch.reasonCodes).toContain("session_mismatch");
    expect(mismatch.whyNotShownDiagnostics.join(" ")).toContain(
      "candidate session=other-session, active session=main",
    );
  });

  it("rejects wildcard active context instead of using broad surfacing", () => {
    const context = resolvePhase2ProactivityActiveContext({
      projectId: "global",
      sessionKey: "*",
    });
    const decision = decidePhase2ProactivityContextMatch({
      activeContext: context,
      candidateScope: { projectId: "openclaw", sessionKey: "main" },
    });

    expect(context.wildcardRejected).toBe(true);
    expect(decision.decision).toBe("blocked");
    expect(decision.reasonCodes).toContain("wildcard_global_context_rejected");
  });

  it("generates concrete heartbeat review suggestions without autonomous send", async () => {
    const report = await buildPhase2ProactivityHeartbeatReviewReport({
      now: new Date("2026-04-27T04:00:00.000Z"),
    });

    expect(report.reviewQuestion).toBe("What would help this user today?");
    expect(report.decision).toBe("concrete_suggestions_generated");
    expect(report.suggestions.length).toBeGreaterThan(0);
    expect(report.suggestions[0]).toMatchObject({
      approvalRequired: true,
      automaticSendAllowed: false,
      externalTextHandling: "evidence_not_instruction",
    });
    expect(report.suggestions[0]?.planTitle).not.toMatch(/suggestion available/i);
    expect(report.suggestions[0]?.proposedMessage).toContain("Do you want");
  });

  it("requires concrete plan cards, layered diagnostics, and reconciled counts", async () => {
    const now = new Date("2026-04-27T04:00:00.000Z");
    const inboxReport = await buildLiveInboxReport(now);
    const report = await buildPhase2ProactivityProductCorrectnessReport({
      now,
      inboxReport,
      uiEvidence: {
        compactEntryPointVisible: true,
        actionableDefaultVisible: true,
        filterClickChangedVisibleItems: true,
        concretePlanVisible: true,
        editBeforeSendVisible: true,
        approveSendClicked: true,
        chatInjectObserved: true,
        successFeedbackVisible: true,
        failureFeedbackVisible: true,
        viewSentMessageVisible: true,
        diagnosticsSeparated: true,
        contextMismatchDiagnosticVisible: true,
        inlineExactMatchVisible: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("product_correctness_green");
    expect(report.telemetry.concretePlanCardCount).toBeGreaterThan(0);
    expect(report.telemetry.actionableCount).toBeGreaterThan(0);
    expect(report.telemetry.diagnosticCount).toBeGreaterThan(0);
    expect(report.telemetry.automaticSendAllowed).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks when UI evidence says filters or send feedback are broken", async () => {
    const report = await buildPhase2ProactivityProductCorrectnessReport({
      uiEvidence: {
        compactEntryPointVisible: true,
        actionableDefaultVisible: true,
        filterClickChangedVisibleItems: false,
        concretePlanVisible: true,
        editBeforeSendVisible: true,
        approveSendClicked: true,
        chatInjectObserved: false,
        successFeedbackVisible: false,
        failureFeedbackVisible: false,
        viewSentMessageVisible: false,
        diagnosticsSeparated: true,
        contextMismatchDiagnosticVisible: true,
        inlineExactMatchVisible: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("blocked");
    expect(report.checks.find((check) => check.reasonCode === "filters_are_buttons")?.status).toBe(
      "fail",
    );
    expect(
      report.checks.find((check) => check.reasonCode === "success_failure_feedback_visible")
        ?.status,
    ).toBe("fail");
  });

  it("writers emit bounded JSON and Markdown only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-product-correctness-"));
    try {
      const heartbeat = await buildPhase2ProactivityHeartbeatReviewReport();
      const correctness = await buildPhase2ProactivityProductCorrectnessReport({
        heartbeatReviewReport: heartbeat,
      });
      const heartbeatArtifact = await writePhase2ProactivityHeartbeatReviewArtifact({
        report: heartbeat,
        artifactDir: dir,
      });
      const correctnessArtifact = await writePhase2ProactivityProductCorrectnessArtifact({
        report: correctness,
        artifactDir: dir,
      });

      const heartbeatJson = await readFile(heartbeatArtifact.jsonPath, "utf8");
      const correctnessMarkdown = await readFile(correctnessArtifact.markdownPath, "utf8");
      expect(JSON.parse(heartbeatJson)).toMatchObject({ reportId: heartbeat.reportId });
      expect(correctnessMarkdown).toContain("Phase 2 Proactivity Product Correctness");
      expect(heartbeatJson.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(correctnessMarkdown.toLowerCase()).not.toContain("secret-marker");
      expect(correctnessArtifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
