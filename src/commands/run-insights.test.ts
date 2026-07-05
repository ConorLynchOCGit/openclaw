import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSubagentRunForTests,
  resetSubagentRegistryForTests,
} from "../agents/subagent-registry.js";
import type { GatewaySessionRow } from "../gateway/session-utils.js";
import type { DiagnosticStabilityEventRecord } from "../logging/diagnostic-stability.js";
import type { RuntimeEnv } from "../runtime.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import {
  buildRunInsightsReport,
  resolveRunInsightsOptions,
  runInsightsCommand,
} from "./run-insights.js";
import type { StatusSummary } from "./status.types.js";

const mocks = vi.hoisted(() => ({
  getStatusSummary: vi.fn(),
  getRuntimeConfig: vi.fn(() => ({})),
  resolveConfigPath: vi.fn(() => "/tmp/openclaw.json5"),
  resolveGatewayPort: vi.fn(() => 0),
  resolveIsNixMode: vi.fn(() => false),
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

vi.mock("./status.summary.js", () => ({
  getStatusSummary: mocks.getStatusSummary,
}));

vi.mock("../config/config.js", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

vi.mock("../config/paths.js", () => ({
  resolveConfigPath: mocks.resolveConfigPath,
  resolveGatewayPort: mocks.resolveGatewayPort,
  resolveIsNixMode: mocks.resolveIsNixMode,
  resolveStateDir: mocks.resolveStateDir,
}));

vi.mock("../tasks/task-registry.js", () => ({
  listTaskRecords: mocks.listTaskRecords,
}));

vi.mock("../infra/session-cost-usage.js", () => ({
  loadSessionCostSummaryFromCache: mocks.loadSessionCostSummaryFromCache,
  resolveExistingUsageSessionFile: mocks.resolveExistingUsageSessionFile,
}));

let stateDir: string | undefined;

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
      total: 0,
      active: 0,
      terminal: 0,
      failures: 0,
      byStatus: {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        timed_out: 0,
        cancelled: 0,
        lost: 0,
      },
      byRuntime: {
        subagent: 0,
        acp: 0,
        cli: 0,
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
      paths: [],
      count: 1,
      defaults: {
        model: "gpt-5.5",
        contextTokens: 100_000,
      },
      recent: [
        {
          agentId: "planning",
          key: "agent:planning:main",
          kind: "direct",
          sessionId: "sess-planning",
          updatedAt: 1_000,
          age: 60_000,
          totalTokens: 12_000,
          totalTokensFresh: true,
          inputTokens: 10_000,
          outputTokens: 2_000,
          remainingTokens: 88_000,
          percentUsed: 12,
          model: "gpt-5.5",
          configuredModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          modelSelectionReason: "configured",
          runtime: "codex",
          contextTokens: 100_000,
          promptContext: {
            skills: {
              promptChars: 5000,
              promptHash: "abc123",
              skillCount: 2,
              skillNames: ["comprehensive-plan-record", "agentic-architecture-review"],
              promptRef: {
                version: 1,
                algorithm: "sha256",
                hash: "abc123",
                bytes: 5000,
              },
            },
          },
          flags: [],
        },
      ],
      byAgent: [],
    },
  };
}

function buildGatewayRow(): GatewaySessionRow {
  return {
    key: "agent:planning:main",
    kind: "direct",
    sessionId: "sess-planning",
    agentId: "planning",
    updatedAt: 1_000,
    status: "done",
    finalAssistantText: "Full Planning-authored packet.\n\nEvidence ledger and execution slices.",
    readbackProvenance: {
      finalAssistant: {
        source: "session-transcript",
        ref: "/tmp/sess-planning.jsonl",
        bounded: false,
      },
      status: {
        source: "session-transcript",
        ref: "/tmp/sess-planning.jsonl",
        bounded: false,
      },
    },
    promptContext: {
      skills: {
        promptChars: 5000,
        promptHash: "abc123",
        skillCount: 2,
        skillNames: ["comprehensive-plan-record", "agentic-architecture-review"],
        promptRef: {
          version: 1,
          algorithm: "sha256",
          hash: "abc123",
          bytes: 5000,
        },
      },
    },
  };
}

function buildTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: "task-planning",
    runtime: "subagent",
    taskKind: "planning",
    requesterSessionKey: "agent:main:main",
    ownerKey: "agent:planning:main",
    scopeKind: "session",
    childSessionKey: "agent:planning:main",
    agentId: "planning",
    runId: "run-planning",
    label: "Planning run",
    task: "Plan the skill wiring work",
    status: "succeeded",
    deliveryStatus: "delivered",
    notifyPolicy: "done_only",
    createdAt: 1_000,
    startedAt: 1_100,
    endedAt: 2_000,
    lastEventAt: 2_000,
    terminalSummary: "Planning completed.",
    ...overrides,
  };
}

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-run-insights-"));
  mocks.resolveStateDir.mockReturnValue(stateDir);
  mocks.getStatusSummary.mockResolvedValue(buildSummary());
  mocks.listTaskRecords.mockReturnValue([]);
  mocks.resolveExistingUsageSessionFile.mockReturnValue(undefined);
  mocks.loadSessionCostSummaryFromCache.mockResolvedValue({
    summary: null,
    cacheStatus: {
      status: "fresh",
      cachedFiles: 0,
      pendingFiles: 0,
      staleFiles: 0,
    },
  });
  mocks.runtime.log.mockReset();
  mocks.runtime.error.mockReset();
  mocks.runtime.exit.mockReset();
  resetSubagentRegistryForTests();
});

afterEach(() => {
  resetSubagentRegistryForTests();
  if (stateDir) {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

describe("resolveRunInsightsOptions", () => {
  it("rejects invalid numeric filters before command execution", () => {
    expect(resolveRunInsightsOptions({ limit: "0" })).toEqual({
      ok: false,
      message: "limit must be a positive integer",
    });
    expect(resolveRunInsightsOptions({ active: "nope" })).toEqual({
      ok: false,
      message: "active must be a positive integer",
    });
  });

  it("normalizes filters and clamps the bounded limit", () => {
    expect(
      resolveRunInsightsOptions({ agent: " planning ", session: " sess ", limit: 100 }),
    ).toEqual({
      ok: true,
      value: {
        agent: "planning",
        session: "sess",
        limit: 50,
        includeBackground: false,
      },
    });
  });
});

describe("buildRunInsightsReport", () => {
  it("projects finality from native session transcript evidence", () => {
    const gatewayRows = new Map<string, GatewaySessionRow>([
      ["agent:planning:main", buildGatewayRow()],
    ]);
    const report = buildRunInsightsReport(
      buildSummary(),
      {
        session: "agent:planning:main",
        limit: 10,
        includeBackground: false,
      },
      { gatewaySessionRows: gatewayRows, taskRecords: [] },
    );

    expect(report.finality.finalAssistantTextPresent).toBe(true);
    expect(report.finality.finalAssistantTextChars).toBeGreaterThan(20);
    expect(report.finality.finalAssistantTextPointer).toContain("openclaw sessions show");
    expect(report).not.toHaveProperty("finalAssistantText");
  });

  it("projects completed task finality from child transcript evidence instead of result text", () => {
    const report = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:main:main", limit: 10, includeBackground: false },
      {
        gatewaySessionRows: new Map([["agent:planning:main", buildGatewayRow()]]),
        taskRecords: [
          buildTask({
            requesterSessionKey: "agent:main:main",
            childSessionKey: "agent:planning:main",
            status: "succeeded",
          }),
        ],
      },
    );

    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]?.finality).toMatchObject({
      finalAssistantTextPresent: true,
      finalAssistantTextChars:
        "Full Planning-authored packet.\n\nEvidence ledger and execution slices.".length,
      finalAssistantTextPointer: "openclaw sessions show agent:planning:main --agent planning",
    });
  });

  it("uses active task evidence when the scoped parent session has no fresh active work", () => {
    const summary = buildSummary();
    summary.sessions.recent = [
      {
        ...summary.sessions.recent[0],
        agentId: "main",
        key: "agent:main:main",
        kind: "direct",
        sessionId: "sess-main",
        updatedAt: 1_000,
        status: "running",
        promptContext: null,
      },
    ];
    const report = buildRunInsightsReport(
      summary,
      { session: "agent:main:main", limit: 10, includeBackground: false },
      {
        gatewaySessionRows: new Map([
          [
            "agent:main:main",
            {
              ...buildGatewayRow(),
              key: "agent:main:main",
              agentId: "main",
              sessionId: "sess-main",
              status: "running",
              finalAssistantText: null,
              activeProgress: null,
            },
          ],
        ]),
        taskRecords: [
          buildTask({
            status: "running",
            deliveryStatus: "pending",
            requesterSessionKey: "agent:main:main",
            childSessionKey: "agent:planning:main",
            progressSummary: "Planning is inspecting source refs.",
            executionReceipt: {
              schema: "openclaw.task.execution_receipt.v1",
              eventCount: 1,
              updatedAt: 1_500,
              latestEvent: {
                at: 1_500,
                kind: "progress",
                summary: "Planning is reading source refs.",
                metadata: {
                  toolName: "read",
                },
              },
            },
          }),
        ],
      },
    );

    expect(report.activeWork).toMatchObject({
      phase: "running",
      activeTool: "read",
      source: "task-run-event",
    });
  });

  it("keeps background deploy receipts out of scoped readback unless requested", () => {
    const deployDir = path.join(stateDir!, "deploy");
    fs.mkdirSync(deployDir, { recursive: true });
    fs.writeFileSync(
      path.join(deployDir, "events.ndjson"),
      `${JSON.stringify({
        eventId: "deploy-1",
        eventType: "deploy.promote",
        status: "succeeded",
        sourceCommit: "abc",
        durationMs: 42_000,
      })}\n`,
    );

    const scoped = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:planning:main", limit: 10, includeBackground: false },
      { gatewaySessionRows: new Map(), taskRecords: [] },
    );
    const withBackground = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:planning:main", limit: 10, includeBackground: true },
      { gatewaySessionRows: new Map(), taskRecords: [] },
    );

    expect(scoped.deployEvents).toHaveLength(0);
    expect(scoped.summary.backgroundSignalsIncluded).toBe(false);
    expect(withBackground.deployEvents).toHaveLength(1);
    expect(withBackground.costs.deployKnownDurationMs).toBe(42_000);
  });

  it("reports child runs as native child evidence without advisory profiles", () => {
    addSubagentRunForTests({
      runId: "child-1",
      childSessionKey: "agent:codebase-researcher:child",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "agent:planning:main",
      task: "Inspect the skill wiring refs and stop after exact findings.",
      taskName: "source scout",
      label: "codebase scout",
      cleanup: "keep",
      createdAt: 1_200,
      startedAt: 1_300,
      endedAt: 2_000,
      completion: {
        required: true,
        resultText: "Finding: skill reads are visible in ordinary read telemetry.",
        capturedAt: 2_000,
      },
      delivery: {
        status: "delivered",
        deliveredAt: 2_050,
      },
    });

    const report = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:planning:main", limit: 10, includeBackground: false },
      {
        gatewaySessionRows: new Map(),
        taskRecords: [
          buildTask({
            taskId: "task-parent",
            requesterSessionKey: "agent:planning:main",
            ownerKey: "agent:planning:main",
            childSessionKey: "agent:planning:main",
          }),
        ],
      },
    );

    expect(report.childRuns).toHaveLength(1);
    expect(report.childRuns[0]).toMatchObject({
      runId: "child-1",
      childSessionKey: "agent:codebase-researcher:child",
      agentId: "codebase-researcher",
      contentTruncated: false,
    });
    expect(report).not.toHaveProperty("diagnosticSummary");
    expect(report).not.toHaveProperty("performanceProfile");
    expect(report).not.toHaveProperty("attention");
  });

  it("reports visible skills separately from native skill.used evidence", () => {
    const skillUsed: DiagnosticStabilityEventRecord = {
      seq: 1,
      ts: 2_000,
      type: "skill.used",
      sessionKey: "agent:planning:main",
      sessionId: "sess-planning",
      agentId: "planning",
      target: "comprehensive-plan-record",
      source: "ordinary_read",
      action: "read",
      readStatus: "full",
      linesRead: 775,
      totalLines: 775,
      bytesRead: 32_000,
    };

    const report = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:planning:main", limit: 10, includeBackground: false },
      {
        gatewaySessionRows: new Map([["agent:planning:main", buildGatewayRow()]]),
        taskRecords: [],
        diagnosticSkillEvents: [skillUsed],
      },
    );

    expect(report.skillReads).toHaveLength(1);
    expect(report.skillReads[0]).toMatchObject({
      sessionKey: "agent:planning:main",
      skillName: "comprehensive-plan-record",
      readEvidence: "skill_used",
      readStatus: "full",
      linesRead: 775,
      totalLines: 775,
      bytesRead: 32_000,
      usedSkillNames: ["comprehensive-plan-record"],
    });
  });

  it("does not attach skill.used evidence to a scoped session by agent id alone", () => {
    const report = buildRunInsightsReport(
      buildSummary(),
      { session: "agent:planning:main", limit: 10, includeBackground: false },
      {
        gatewaySessionRows: new Map([["agent:planning:main", buildGatewayRow()]]),
        taskRecords: [],
        diagnosticSkillEvents: [
          {
            seq: 1,
            ts: 2_000,
            type: "skill.used",
            agentId: "planning",
            target: "comprehensive-plan-record",
            source: "ordinary_read",
            action: "read",
            readStatus: "full",
            linesRead: 775,
            totalLines: 775,
            bytesRead: 32_000,
          },
        ],
      },
    );

    expect(report.skillReads).toHaveLength(1);
    expect(report.skillReads[0]).toMatchObject({
      sessionKey: "agent:planning:main",
      skillName: null,
      readEvidence: "catalog_only",
      readStatus: "visible_only",
      usedSkillNames: [],
    });
  });
});

describe("runInsightsCommand", () => {
  it("emits the reduced JSON report", async () => {
    mocks.listTaskRecords.mockReturnValue([buildTask()]);

    await runInsightsCommand(
      { json: true, session: "agent:planning:main" },
      mocks.runtime as RuntimeEnv,
    );

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    const payload = JSON.parse(String(mocks.runtime.log.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      schema: "openclaw.run_insights.v1",
      authority: "advisory_readback",
    });
    expect(payload).toHaveProperty("finality");
    expect(payload).toHaveProperty("activeWork");
    expect(payload).toHaveProperty("childRuns");
    expect(payload).toHaveProperty("skillReads");
    expect(payload).not.toHaveProperty("diagnosticSummary");
    expect(payload).not.toHaveProperty("performanceProfile");
    expect(payload).not.toHaveProperty("attention");
  });

  it("does not treat nested child session keys as usage session ids", async () => {
    addSubagentRunForTests({
      runId: "child-nested",
      childSessionKey: "agent:codebase-researcher:subagent:child-nested",
      requesterSessionKey: "agent:planning:main",
      requesterDisplayKey: "agent:planning:main",
      task: "Inspect native event readback refs.",
      taskName: "codebase scout",
      label: "codebase scout",
      cleanup: "keep",
      createdAt: 1_200,
      startedAt: 1_300,
      endedAt: 1_900,
      completion: {
        required: true,
        resultText: "Finding packet",
        capturedAt: 1_900,
      },
      delivery: {
        status: "delivered",
        deliveredAt: 1_950,
      },
    });
    mocks.listTaskRecords.mockReturnValue([
      buildTask({
        taskId: "task-parent",
        requesterSessionKey: "agent:planning:main",
        ownerKey: "agent:planning:main",
        childSessionKey: "agent:planning:main",
      }),
    ]);

    await runInsightsCommand(
      { json: true, session: "agent:planning:main" },
      mocks.runtime as RuntimeEnv,
    );

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    const payload = JSON.parse(String(mocks.runtime.log.mock.calls[0][0])) as {
      childRuns?: Array<{ childSessionKey?: string; usage?: unknown }>;
    };
    expect(payload.childRuns?.[0]?.childSessionKey).toBe(
      "agent:codebase-researcher:subagent:child-nested",
    );
    expect(payload.childRuns?.[0]?.usage).toBeNull();
    for (const call of mocks.resolveExistingUsageSessionFile.mock.calls) {
      expect(call[0]?.sessionId).not.toMatch(/^agent:/u);
    }
  });
});
