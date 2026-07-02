import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { buildRunInsightsReport, runInsightsCommand } from "./run-insights.js";
import type { StatusSummary } from "./status.types.js";

const mocks = vi.hoisted(() => ({
  getStatusSummary: vi.fn(),
  getRuntimeConfig: vi.fn(() => ({})),
  resolveConfigPath: vi.fn(),
  resolveStateDir: vi.fn(),
  listTaskRecords: vi.fn(),
  loadSessionCostSummaryFromCache: vi.fn(),
  resolveExistingUsageSessionFile: vi.fn(),
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

const getStatusSummary = mocks.getStatusSummary;
const listTaskRecords = mocks.listTaskRecords;
const loadSessionCostSummaryFromCache = mocks.loadSessionCostSummaryFromCache;
const resolveExistingUsageSessionFile = mocks.resolveExistingUsageSessionFile;
const resolveConfigPath = mocks.resolveConfigPath;
const resolveStateDir = mocks.resolveStateDir;
const runtime = mocks.runtime;

let stateDir: string | undefined;

vi.mock("./status.summary.js", () => ({
  getStatusSummary: mocks.getStatusSummary,
}));

vi.mock("../config/config.js", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

vi.mock("../config/paths.js", () => ({
  resolveConfigPath: mocks.resolveConfigPath,
  resolveStateDir: mocks.resolveStateDir,
}));

vi.mock("../tasks/task-registry.js", () => ({
  listTaskRecords: mocks.listTaskRecords,
}));

vi.mock("../infra/session-cost-usage.js", () => ({
  loadSessionCostSummaryFromCache: mocks.loadSessionCostSummaryFromCache,
  resolveExistingUsageSessionFile: mocks.resolveExistingUsageSessionFile,
}));

function buildSummary(): StatusSummary {
  return {
    runtimeVersion: "test",
    heartbeat: {
      defaultAgentId: "main",
      agents: [],
    },
    channelSummary: [],
    queuedSystemEvents: [],
    tasks: {
      total: 7,
      active: 2,
      terminal: 5,
      failures: 1,
      byStatus: {
        queued: 0,
        running: 2,
        succeeded: 4,
        failed: 1,
        timed_out: 0,
        cancelled: 0,
        lost: 0,
      },
      byRuntime: {
        subagent: 3,
        acp: 0,
        cli: 4,
        cron: 0,
      },
    },
    taskAudit: {
      total: 0,
      warnings: 0,
      errors: 0,
      byCode: {
        stale_queued: 0,
        stale_running: 0,
        lost: 0,
        delivery_failed: 0,
        missing_cleanup: 0,
        inconsistent_timestamps: 0,
      },
    },
    sessions: {
      paths: ["/tmp/coding-sessions.json"],
      count: 3,
      defaults: {
        model: "gpt-5.5",
        contextTokens: 100000,
      },
      recent: [
        {
          agentId: "coding",
          key: "agent:coding:main",
          kind: "direct",
          sessionId: "sess-coding",
          updatedAt: 1_000,
          age: 5 * 60_000,
          abortedLastRun: true,
          totalTokens: 92_000,
          totalTokensFresh: true,
          inputTokens: 90_000,
          outputTokens: 2_000,
          remainingTokens: 8_000,
          percentUsed: 92,
          model: "gpt-5.5",
          configuredModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          modelSelectionReason: "configured",
          runtime: "codex",
          contextTokens: 100_000,
          flags: ["aborted"],
        },
        {
          agentId: "planning",
          key: "agent:planning:main",
          kind: "direct",
          sessionId: "sess-planning",
          updatedAt: 900,
          age: 180 * 60_000,
          totalTokens: 10_000,
          totalTokensFresh: false,
          remainingTokens: 90_000,
          percentUsed: 10,
          model: "gpt-5.5",
          configuredModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          modelSelectionReason: "configured",
          runtime: "openclaw",
          contextTokens: 100_000,
          flags: [],
        },
      ],
      byAgent: [
        {
          agentId: "coding",
          path: "/tmp/coding-sessions.json",
          count: 1,
          recent: [
            {
              agentId: "coding",
              key: "agent:coding:main",
              kind: "direct",
              sessionId: "sess-coding",
              updatedAt: 1_000,
              age: 5 * 60_000,
              abortedLastRun: true,
              totalTokens: 92_000,
              totalTokensFresh: true,
              inputTokens: 90_000,
              outputTokens: 2_000,
              remainingTokens: 8_000,
              percentUsed: 92,
              model: "gpt-5.5",
              configuredModel: "gpt-5.5",
              selectedModel: "gpt-5.5",
              modelSelectionReason: "configured",
              runtime: "codex",
              contextTokens: 100_000,
              flags: ["aborted"],
            },
          ],
        },
      ],
    },
  } as unknown as StatusSummary;
}

describe("runInsightsCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-run-insights-"));
    fs.mkdirSync(path.join(stateDir, "deploy"), { recursive: true });
    const buildArtifactPath = path.join(stateDir, "deploy-controller-build-test.json");
    const promoteArtifactPath = path.join(stateDir, "deploy-controller-promote-test.json");
    fs.writeFileSync(
      buildArtifactPath,
      JSON.stringify(
        {
          schema: "openclaw-next.deploy-controller.build-candidate.v1",
          timingsMs: {
            total: 180_000,
          },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      promoteArtifactPath,
      JSON.stringify(
        {
          schema: "openclaw-next.deploy-controller.promote.v1",
          timingsMs: {
            total: 240_000,
            checks: [
              {
                id: "openclaw-native-checks",
                durationMs: 91_000,
                status: "passed",
                exitCode: 0,
              },
              {
                id: "business-ops-surface-check",
                durationMs: 44_000,
                status: "passed",
                exitCode: 0,
              },
            ],
          },
          failedCount: 0,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(stateDir, "deploy", "events.ndjson"),
      [
        JSON.stringify({
          schema: "openclaw-next.deploy-controller.deploy-event.v1",
          generatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
          eventId: "deploy-build-test",
          eventType: "deploy.build",
          status: "built",
          imageRef: "openclaw-next/gateway:candidate-test",
          imageDigest: "sha256:builddigest",
          sourceCommit: "abc1234567890",
          buildProfile: "full",
          buildEpisode: {
            id: "candidate-test",
          },
          artifactRefs: [
            {
              kind: "deploy-controller-artifact",
              path: buildArtifactPath,
            },
          ],
        }),
        JSON.stringify({
          schema: "openclaw-next.deploy-controller.deploy-event.v1",
          generatedAt: new Date(Date.now() - 60_000).toISOString(),
          eventId: "deploy-promote-test",
          eventType: "deploy.promote",
          status: "passed",
          imageRef: "openclaw-next/gateway:candidate-test",
          imageDigest: "sha256:promoteddigest",
          sourceCommit: "def1234567890",
          buildProfile: "full",
          previousImageDigest: "sha256:previousdigest",
          buildEpisode: {
            id: "candidate-test",
          },
          artifactRefs: [
            {
              kind: "deploy-controller-artifact",
              path: "/srv/openclaw-next/artifacts/host-only-promote.json",
            },
          ],
          artifactSummary: {
            path: "/srv/openclaw-next/artifacts/host-only-promote.json",
            readable: true,
            skippedReason: null,
            durationMs: 240_000,
            failedCount: 0,
            slowestChecks: [
              {
                id: "openclaw-native-checks",
                durationMs: 91_000,
                status: "passed",
                exitCode: 0,
              },
            ],
          },
        }),
      ].join("\n"),
    );
    resolveConfigPath.mockReturnValue(path.join(stateDir, "openclaw.json"));
    resolveStateDir.mockReturnValue(stateDir);
    runtime.exit.mockImplementation(() => {});
    getStatusSummary.mockResolvedValue(buildSummary());
    resolveExistingUsageSessionFile.mockReturnValue("/tmp/sess-coding.jsonl");
    loadSessionCostSummaryFromCache.mockResolvedValue({
      cacheStatus: {
        status: "fresh",
        cachedFiles: 1,
        pendingFiles: 0,
        staleFiles: 0,
      },
      summary: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        totalCost: 0.1234,
        inputCost: 0,
        outputCost: 0,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        missingCostEntries: 0,
        durationMs: 7 * 60_000,
        messageCounts: {
          total: 4,
          user: 1,
          assistant: 1,
          toolCalls: 55,
          toolResults: 2,
          errors: 1,
        },
        toolUsage: {
          totalCalls: 55,
          uniqueTools: 2,
          tools: [
            { name: "read", count: 40 },
            { name: "grep", count: 15 },
          ],
        },
      },
    });
    const taskStartedAt = Date.now() - 11 * 60_000;
    const longValidationSummary = `Running validation proof over source refs ${"with repeated diagnostic text ".repeat(25)}`;
    listTaskRecords.mockReturnValue([
      {
        taskId: "task-coding-child",
        runtime: "subagent",
        taskKind: "source_scout",
        agentId: "coding",
        runId: "run-coding-child",
        label: "codebase scout",
        requesterSessionKey: "agent:coding:main",
        ownerKey: "agent:coding:main",
        scopeKind: "session",
        childSessionKey: "agent:coding:child:1",
        task: "inspect source",
        status: "running",
        deliveryStatus: "pending",
        notifyPolicy: "done_only",
        createdAt: taskStartedAt,
        startedAt: taskStartedAt,
        lastEventAt: taskStartedAt,
        progressSummary: longValidationSummary,
        executionReceipt: {
          schema: "openclaw.task.execution_receipt.v1",
          eventCount: 1,
          updatedAt: taskStartedAt,
          latestEvent: {
            at: taskStartedAt,
            kind: "progress",
            summary: `reading bounded source refs ${"without raw transcript dump ".repeat(25)}`,
          },
        },
      },
      {
        taskId: "task-delivery-watch",
        runtime: "subagent",
        taskKind: "review",
        agentId: "coding",
        runId: "run-delivery-watch",
        label: "review closeout",
        requesterSessionKey: "agent:coding:main",
        ownerKey: "agent:coding:main",
        scopeKind: "session",
        task: "review output",
        status: "succeeded",
        deliveryStatus: "session_queued",
        notifyPolicy: "done_only",
        createdAt: Date.now() - 2 * 60_000,
        startedAt: Date.now() - 2 * 60_000,
        endedAt: Date.now() - 60_000,
      },
      {
        taskId: "task-codex-native-child",
        runtime: "subagent",
        taskKind: "codex-native",
        agentId: "coding",
        runId: "codex-thread:project-explorer-1",
        label: "project_explorer",
        requesterSessionKey: "agent:coding:main",
        ownerKey: "agent:coding:main",
        scopeKind: "session",
        task: "Inspect run intelligence readback owner files.",
        status: "running",
        deliveryStatus: "not_applicable",
        notifyPolicy: "silent",
        createdAt: taskStartedAt + 1_000,
        startedAt: taskStartedAt + 1_000,
        lastEventAt: taskStartedAt + 1_000,
        progressSummary: "Codex native subagent spawned.",
        executionReceipt: {
          schema: "openclaw.task.execution_receipt.v1",
          eventCount: 1,
          updatedAt: taskStartedAt + 1_000,
          latestEvent: {
            at: taskStartedAt + 1_000,
            kind: "running",
            summary: "Codex native subagent spawned.",
            metadata: {
              codexNativeSubagent: true,
              parentThreadId: "parent-thread",
              childThreadId: "project-explorer-1",
              childPhase: "child_spawned",
              childRole: "project_explorer",
              childAgentPath: "agents/project_explorer.toml",
              spawnReason: "Inspect run intelligence readback owner files.",
            },
          },
        },
      },
    ]);
  });

  afterEach(() => {
    if (stateDir) {
      fs.rmSync(stateDir, { recursive: true, force: true });
      stateDir = undefined;
    }
  });

  it("emits bounded JSON run performance evidence from status summaries", async () => {
    await runInsightsCommand(
      {
        json: true,
        agent: "coding",
        active: "60",
        limit: "5",
      },
      runtime,
    );

    expect(getStatusSummary).toHaveBeenCalledWith({
      includeSensitive: true,
      includeChannelSummary: false,
    });
    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.schema).toBe("openclaw.run_insights.v1");
    expect(payload.authority).toContain("not lifecycle truth");
    expect(payload.advisory.missingEvidenceLanguage).toContain("unknown");
    expect(payload.filters).toEqual({
      agent: "coding",
      session: null,
      task: null,
      activeMinutes: 60,
      limit: 5,
    });
    expect(payload.deployEvidenceScope).toEqual({
      scope: "global_unscoped",
      filteredBy: [],
      limitApplied: 5,
      reason:
        "native deploy receipts do not carry agent/session/task keys, so run-insights applies only the bounded tail limit to deploy/build/promote evidence",
    });
    expect(payload.summary.tasks.failures).toBe(1);
    expect(payload.summary.tasks.childTasksDisplayed).toBe(2);
    expect(payload.summary.tasks.deliveryIssues).toBe(1);
    expect(payload.summary.deploy).toMatchObject({
      recentDisplayed: 2,
      lastEventType: "deploy.promote",
      lastPromotedImageDigest: "sha256:promoteddigest",
      recentFailures: 0,
    });
    expect(payload.sessions).toHaveLength(1);
    expect(payload.tasks).toHaveLength(3);
    expect(payload.tasks.map((task: { taskId: string }) => task.taskId)).toEqual([
      "task-coding-child",
      "task-delivery-watch",
      "task-codex-native-child",
    ]);
    expect(payload.deployEvents.map((event: { eventId: string }) => event.eventId)).toEqual([
      "deploy-promote-test",
      "deploy-build-test",
    ]);
    expect(payload.deployEvents[0].artifactSummary).toMatchObject({
      readable: true,
      durationMs: 240_000,
      failedCount: 0,
      path: "/srv/openclaw-next/artifacts/host-only-promote.json",
    });
    expect(payload.deployEvents[0].artifactSummary.slowestChecks[0]).toMatchObject({
      id: "openclaw-native-checks",
      durationMs: 91_000,
      status: "passed",
      exitCode: 0,
    });
    expect(payload.performanceProfile.retryBuildProofCost).toMatchObject({
      deployReceiptCount: 2,
      totalKnownDurationMs: 420_000,
      totalKnownDuration: "7m",
    });
    expect(payload.performanceProfile.retryBuildProofCost.slowestReceipt).toMatchObject({
      eventType: "deploy.promote",
      durationMs: 240_000,
    });
    expect(payload.performanceProfile.validationBuildBottlenecks).toEqual([]);
    expect(
      payload.performanceProfile.advisoryInefficiencyFlags.map(
        (item: { code: string }) => item.code,
      ),
    ).toEqual(expect.arrayContaining(["high_context_pressure", "tool_heavy_session"]));
    expect(payload.performanceProfile.timeline.length).toBeGreaterThan(0);
    expect(payload.diagnosticSummary.currentOrLastKnownPhase).toMatchObject({
      source: "task",
      evidenceQuality: "evidence_backed",
      confidence: "high",
      pointer: "openclaw tasks show task-coding-child",
    });
    expect(payload.diagnosticSummary.parentWaitState).toMatchObject({
      waitClass: "active_child",
      evidenceQuality: "evidence_backed",
      pointer: "openclaw tasks show task-coding-child",
    });
    expect(payload.diagnosticSummary.childWork).toMatchObject({
      displayedChildTasks: 2,
      activeChildTasks: 2,
      evidenceQuality: "evidence_backed",
    });
    expect(payload.diagnosticSummary.validationBuildPromotion).toMatchObject({
      bottlenecks: 0,
      deployReceipts: 2,
    });
    expect(payload.diagnosticSummary.evidenceQuality).toMatchObject({
      heuristic: expect.any(Number),
      scoped: 1,
    });
    expect(payload.diagnosticSummary.operatorNextAction).toMatchObject({
      label: "Inspect native task evidence",
      pointer: "openclaw tasks show task-coding-child",
    });
    expect(payload.sessions[0].usage.toolCalls).toBe(55);
    expect(payload.sessions[0].usage.topTools).toEqual([
      { name: "read", count: 40 },
      { name: "grep", count: 15 },
    ]);
    expect(payload.sessions[0].pointer).toBe(
      "openclaw sessions show agent:coding:main --agent coding",
    );
    expect(payload.tasks[0].pointer).toBe("openclaw tasks show task-coding-child");
    expect(payload.tasks[0].progressSummary).toContain("Running validation proof over source refs");
    expect(payload.tasks[0].progressSummary).toContain(
      "[truncated; use pointer for full evidence]",
    );
    expect(payload.tasks[0].progressSummary.length).toBeLessThanOrEqual(360);
    expect(payload.tasks[0].latestEvent.summary).toContain(
      "[truncated; use pointer for full evidence]",
    );
    expect(payload.tasks[0].latestEvent.summary.length).toBeLessThanOrEqual(360);
    expect(payload.tasks[0].activeProgress).toMatchObject({
      source: "task-run-event",
      currentPhase: "running",
      activeLabel: "codebase scout",
      sourceEventType: "task.progress",
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(payload.tasks[0].attention).toMatchObject({
      waitClass: "active_child",
      pointer: "openclaw tasks show task-coding-child",
    });
    expect(payload.performanceProfile.childSessionEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task-codex-native-child",
          childSessionKey: "",
          childRole: "project_explorer",
          childAgentPath: "agents/project_explorer.toml",
          childPhase: "child_spawned",
          spawnReason: "Inspect run intelligence readback owner files.",
        }),
      ]),
    );
    expect(payload.attention.whyWorkMayFeelSlow.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining([
        "active_task_work",
        "context_pressure",
        "tool_volume",
        "task_active_child",
        "task_delivery",
      ]),
    );
    expect(
      payload.attention.validationAndPromotion.map((item: { code: string }) => item.code),
    ).toEqual(expect.arrayContaining(["deploy_receipt_activity"]));
    expect(payload.attention.evidencePointers).toEqual(
      expect.arrayContaining([
        "openclaw sessions show agent:coding:main --agent coding",
        "openclaw tasks show task-coding-child",
        payload.deployEvents[0].artifactSummary.path,
      ]),
    );
    expect(payload.signals.map((signal: { code: string }) => signal.code)).toEqual(
      expect.arrayContaining([
        "task_failures_present",
        "active_tasks_present",
        "active_child_task",
        "task_delivery_issue",
        "session_aborted_last_run",
        "high_context_pressure",
        "tool_heavy_session",
        "session_usage_errors",
        "long_active_task",
      ]),
    );
  });

  it("keeps terminal child failure receipts visible without transcript archaeology", () => {
    const now = Date.UTC(2026, 6, 1, 6, 0, 0);
    const terminalChild: TaskRecord = {
      taskId: "task-terminal-child",
      runtime: "subagent",
      taskKind: "codex-native",
      agentId: "coding",
      runId: "codex-thread:test-engineer-1",
      label: "test_engineer",
      requesterSessionKey: "agent:coding:main",
      ownerKey: "agent:coding:main",
      scopeKind: "session",
      task: "Codex native subagent role: test_engineer",
      status: "failed",
      deliveryStatus: "delivered",
      notifyPolicy: "silent",
      createdAt: now - 90_000,
      startedAt: now - 90_000,
      endedAt: now - 15_000,
      lastEventAt: now - 15_000,
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 3,
        updatedAt: now - 15_000,
        latestEvent: {
          at: now - 15_000,
          kind: "failed",
          summary: "context overflow before post-patch validation closeout",
          metadata: {
            childRole: "test_engineer",
            childAgentPath: "agents/test_engineer.toml",
            childPhase: "context_overflow",
            spawnReason: "Review validation strategy for the implementation batch.",
            outputSummary: "Context overflow before final validation packet.",
          },
        },
      },
    };

    const payload = buildRunInsightsReport(buildSummary(), {
      limit: 5,
      now,
      taskRecords: [terminalChild],
    });

    expect(payload.tasks[0].activeProgress).toMatchObject({
      source: "task-run-event",
      currentPhase: "context_overflow",
      activeLabel: "test_engineer",
      sourceEventType: "task.failed",
      childRole: "test_engineer",
      childAgentPath: "agents/test_engineer.toml",
      childPhase: "context_overflow",
      spawnReason: "Review validation strategy for the implementation batch.",
      outputSummary: "Context overflow before final validation packet.",
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(payload.performanceProfile.childSessionEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task-terminal-child",
          childRole: "test_engineer",
          childPhase: "context_overflow",
          status: "failed",
        }),
      ]),
    );
  });

  it("projects terminal child task errors when no execution receipt is present", () => {
    const now = Date.UTC(2026, 6, 1, 6, 0, 0);
    const failedChild: TaskRecord = {
      taskId: "task-failed-child-no-receipt",
      runtime: "cli",
      taskKind: "cli",
      agentId: "codebase-researcher",
      runId: "child-run-1",
      label: "repo scout",
      requesterSessionKey: "agent:codebase-researcher:subagent:child-1",
      childSessionKey: "agent:codebase-researcher:subagent:child-1",
      ownerKey: "agent:planning:main",
      scopeKind: "session",
      task: "Inspect repo current state.",
      status: "failed",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
      createdAt: now - 120_000,
      startedAt: now - 110_000,
      endedAt: now - 10_000,
      lastEventAt: now - 10_000,
      error:
        "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session.",
    };

    const payload = buildRunInsightsReport(buildSummary(), {
      session: "agent:codebase-researcher:subagent:child-1",
      limit: 5,
      now,
      taskRecords: [failedChild],
    });

    expect(payload.tasks[0].activeProgress).toMatchObject({
      source: "task-run-event",
      currentPhase: "failed",
      activeLabel: "repo scout",
      sourceEventType: "task.failed",
      childRole: "codebase-researcher",
      childPhase: "failed",
      outputSummary: expect.stringContaining("Context overflow"),
      note: expect.stringContaining("Context overflow"),
      pointer: {
        kind: "task",
        ref: "task-failed-child-no-receipt",
        label: "terminal task error",
      },
      derivedBy: "resolveTaskReadbackProgressProjection",
      bounded: true,
    });
    expect(payload.diagnosticSummary.currentOrLastKnownPhase).toMatchObject({
      source: "task",
      pointer: "openclaw tasks show task-failed-child-no-receipt",
      evidenceQuality: "evidence_backed",
    });
  });

  it("uses scoped terminal task evidence before unscoped deploy receipts for phase readback", () => {
    const now = Date.UTC(2026, 6, 1, 6, 0, 0);
    const completedCodingTask: TaskRecord = {
      taskId: "task-completed-coding-no-receipt",
      runtime: "subagent",
      taskKind: "openclaw-agent",
      agentId: "coding",
      requesterSessionKey: "agent:coding:old-proof",
      childSessionKey: "agent:coding:old-proof",
      ownerKey: "agent:main:old-proof",
      scopeKind: "session",
      task: "Implement bounded readback feature.",
      status: "succeeded",
      deliveryStatus: "delivered",
      notifyPolicy: "silent",
      createdAt: now - 240_000,
      startedAt: now - 230_000,
      endedAt: now - 30_000,
      lastEventAt: now - 30_000,
    };

    const payload = buildRunInsightsReport(buildSummary(), {
      session: "agent:coding:old-proof",
      limit: 5,
      now,
      taskRecords: [completedCodingTask],
    });

    expect(payload.tasks).toHaveLength(1);
    expect(payload.deployEvents.length).toBeGreaterThan(0);
    expect(payload.diagnosticSummary.currentOrLastKnownPhase).toMatchObject({
      label: "succeeded",
      source: "task",
      pointer: "openclaw tasks show task-completed-coding-no-receipt",
      evidenceQuality: "evidence_backed",
      confidence: "high",
    });
  });

  it("uses gateway session row readback for scoped session status, final answer, and progress", () => {
    const now = Date.UTC(2026, 6, 1, 6, 0, 0);
    const payload = buildRunInsightsReport(buildSummary(), {
      agent: "coding",
      session: "agent:coding:main",
      limit: 5,
      now,
      taskRecords: [],
      gatewaySessionRows: new Map([
        [
          "agent:coding:main",
          {
            key: "agent:coding:main",
            kind: "direct",
            updatedAt: now - 1_000,
            status: "done",
            model: "gpt-5.5",
            inputTokens: 12,
            outputTokens: 3,
            totalTokens: 15,
            totalTokensFresh: true,
            finalAssistantText: "Final closeout exists.",
            activeProgress: {
              source: "task-run-event",
              ref: "task-event:task-coding-main:1:progress",
              currentPhase: "succeeded",
              activeLabel: "coding",
              observedAt: new Date(now - 1_000).toISOString(),
              sourceEventType: "task.progress",
              pointer: {
                kind: "task",
                ref: "task-coding-main",
                label: "task run receipt",
              },
              derivedBy: "resolveTaskReadbackProgressProjection",
              bounded: true,
            },
            readbackProvenance: {
              status: {
                source: "session-transcript",
                ref: "session:sess-coding",
                derivedBy: "buildGatewaySessionRow",
                bounded: true,
              },
              finalAssistantText: {
                source: "session-transcript",
                ref: "session:sess-coding",
                derivedBy: "readLastAssistantTextFromTranscript",
                bounded: true,
              },
            },
          },
        ],
      ]),
    });

    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      key: "agent:coding:main",
      status: "done",
      hasFinalAssistantText: true,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
    });
    expect(payload.sessions[0].activeProgress).toMatchObject({
      source: "task-run-event",
      currentPhase: "succeeded",
    });
    expect(payload.sessions[0].readbackProvenance).toMatchObject({
      status: {
        source: "session-transcript",
        bounded: true,
      },
      finalAssistantText: {
        source: "session-transcript",
        bounded: true,
      },
    });
  });

  it("does not classify successful terminal planning proof tasks as active validation work", () => {
    const now = Date.UTC(2026, 6, 1, 6, 0, 0);
    const completedPlanningTask: TaskRecord = {
      taskId: "task-completed-planning-proof",
      runtime: "subagent",
      taskKind: "openclaw-agent",
      agentId: "planning",
      runId: "planning-proof-finished",
      label: "Planning proof plan",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      task: "Plan proof work and produce a validation-ready execution brief.",
      status: "succeeded",
      deliveryStatus: "delivered",
      notifyPolicy: "silent",
      createdAt: now - 180_000,
      startedAt: now - 170_000,
      endedAt: now - 60_000,
      lastEventAt: now - 60_000,
      terminalSummary: "Planning proof artifact completed.",
      executionReceipt: {
        schema: "openclaw.task.execution_receipt.v1",
        eventCount: 2,
        updatedAt: now - 60_000,
        latestEvent: {
          at: now - 60_000,
          kind: "succeeded",
          summary: "Planning proof artifact completed.",
        },
      },
    };

    const payload = buildRunInsightsReport(buildSummary(), {
      limit: 5,
      now,
      taskRecords: [completedPlanningTask],
    });

    expect(payload.tasks[0].attention).toMatchObject({
      waitClass: null,
      reason: null,
    });
    expect(
      payload.performanceProfile.validationBuildBottlenecks.map((item) => item.code),
    ).not.toContain("task_validation_or_promotion");
    expect(payload.attention.validationAndPromotion.map((item) => item.code)).not.toContain(
      "task_validation_or_promotion",
    );
  });

  it("focuses run insight readback by session and task", async () => {
    await runInsightsCommand(
      {
        json: true,
        session: "agent:coding:main",
        task: "task-coding-child",
        limit: "10",
      },
      runtime,
    );

    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.filters).toEqual({
      agent: null,
      session: "agent:coding:main",
      task: "task-coding-child",
      activeMinutes: null,
      limit: 10,
    });
    expect(payload.sessions.map((session: { key: string }) => session.key)).toEqual([
      "agent:coding:main",
    ]);
    expect(payload.tasks.map((task: { taskId: string }) => task.taskId)).toEqual([
      "task-coding-child",
    ]);
    expect(payload.deployEvents.map((event: { eventId: string }) => event.eventId)).toEqual([
      "deploy-promote-test",
      "deploy-build-test",
    ]);
    expect(payload.deployEvidenceScope).toMatchObject({
      scope: "global_unscoped",
      filteredBy: [],
      limitApplied: 10,
    });
  });

  it("matches session filters case-insensitively without changing readback keys", async () => {
    await runInsightsCommand(
      {
        json: true,
        session: "AGENT:CODING:MAIN",
        limit: "10",
      },
      runtime,
    );

    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.filters.session).toBe("AGENT:CODING:MAIN");
    expect(payload.sessions.map((session: { key: string }) => session.key)).toEqual([
      "agent:coding:main",
    ]);
    expect(payload.tasks.map((task: { taskId: string }) => task.taskId)).toEqual([
      "task-coding-child",
      "task-delivery-watch",
      "task-codex-native-child",
    ]);
  });

  it("uses injected time for deterministic report timestamps", () => {
    const now = Date.UTC(2026, 6, 1, 5, 30, 0);
    const payload = buildRunInsightsReport(buildSummary(), {
      activeMinutes: 60,
      limit: 1,
      now,
      taskRecords: [],
    });

    expect(payload.generatedAt).toBe("2026-07-01T05:30:00.000Z");
  });

  it("prints human readback without crawling raw transcripts", async () => {
    await runInsightsCommand({}, runtime);

    const output = runtime.log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Run Insights");
    expect(output).toContain("Run Insights is advisory readback over native evidence");
    expect(output).toContain("Missing Evidence");
    expect(output).toContain("Deploy Evidence Scope: global_unscoped");
    expect(output).toContain("native deploy receipts do not carry agent/session/task keys");
    expect(output).toContain("tools=55/2");
    expect(output).toContain("cost=$0.1234");
    expect(output).toContain("Diagnostic Summary");
    expect(output).toContain("Phase:");
    expect(output).toContain("Evidence quality:");
    expect(output).toContain("Next action: Inspect native task evidence");
    expect(output).toContain("Why Work May Feel Slow");
    expect(output).toContain("task_active_child");
    expect(output).toContain("Validation / Promotion Watch");
    expect(output).toContain("deploy_receipt_activity");
    expect(output).toContain("Performance Profile");
    expect(output).toContain("Retry/build/proof cost: receipts=2 knownDuration=7m");
    expect(output).toContain("Recent Tasks");
    expect(output).toContain("attention=active_child");
    expect(output).toContain("active=phase=running");
    expect(output).toContain("Recent Deploy Events");
    expect(output).toContain("deploy.promote status=passed");
    expect(output).toContain("duration=4m");
    expect(output).toContain("slowest=openclaw-native-checks:2m");
    expect(output).toContain("openclaw tasks audit --json");
  });

  it("rejects invalid numeric options before reading status summaries", async () => {
    await runInsightsCommand({ limit: "nope" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith("--limit must be a positive integer.");
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(getStatusSummary).not.toHaveBeenCalled();
    expect(loadSessionCostSummaryFromCache).not.toHaveBeenCalled();
  });

  it("rejects empty focus filters before reading status summaries", async () => {
    await runInsightsCommand({ session: " " }, runtime);

    expect(runtime.error).toHaveBeenCalledWith("--session must not be empty.");
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(getStatusSummary).not.toHaveBeenCalled();
    expect(loadSessionCostSummaryFromCache).not.toHaveBeenCalled();
  });
});
