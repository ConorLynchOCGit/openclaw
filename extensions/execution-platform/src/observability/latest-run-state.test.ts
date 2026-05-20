import { describe, expect, it } from "vitest";
import { buildLatestRunState } from "./latest-run-state.ts";

describe("latest run state", () => {
  it("builds a compact compaction-safe operator state without raw storage", () => {
    const state = buildLatestRunState({
      runtimeJobId: "job-1",
      workItemId: "work-1",
      promptHash: "sha256:prompt",
      promptRef: "source-prompt://prompt",
      promptLength: 12_345,
      processRunning: false,
      terminalStatus: "needs_review",
      adapterTerminalStatus: "needs_review",
      retryState: "retry_scheduled",
      runtimeJob: {
        state: "pending",
        attempts: 1,
        maxAttempts: 2,
        workerId: null,
        startedAt: "2026-05-20T00:00:00.000Z",
        completedAt: null,
      },
      graphId: "graph-1",
      latestProgress: {
        stage: "context_synthesis_group_expansion",
        currentPhase: "group_guidance_missing",
        schedulerPhase: "context_synthesis_repair_needed",
        nodeId: "node-1",
        roleId: "context_synthesis",
        modelRef: "openai-codex/gpt-5.5",
        providerPath: "codex_app_server",
        currentObjective: "Repair group guidance.",
        blockerSummary: "groupPlanningGuidance missing",
        nextDecisionNeeded: "focused_repair",
        eli5Progress: "OpenClaw needs a field repair before implementation.",
        reasonCodes: ["context_synthesis_group_planning_guidance_missing"],
        artifactRefs: ["runtime-job://job-1/context-synthesis/input-manifest/ref"],
      },
      totalWallMs: 123_456,
      phaseWallClock: [{ phase: "context_synthesis", wallMs: 1000 }],
      modelUsageByModel: [{ modelRef: "openai-codex/gpt-5.5", usageKind: "estimated" }],
      missingUsageEventCount: 1,
      usageUnavailableReasons: [{ reason: "codex_app_server_usage_not_returned", count: 1 }],
      recommendedOperatorAction: "Replay from context synthesis after repair.",
    });

    expect(state).toMatchObject({
      artifactKind: "execution_platform_latest_run_state",
      runtimeJobId: "job-1",
      process: {
        isRunning: false,
        terminalStatus: "needs_review",
        adapterTerminalStatus: "needs_review",
        retryState: "retry_scheduled",
      },
      current: {
        phase: "group_guidance_missing",
        nodeId: "node-1",
        blockerSummary: "groupPlanningGuidance missing",
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
    expect(JSON.stringify(state)).not.toContain("raw prompt");
  });
});
