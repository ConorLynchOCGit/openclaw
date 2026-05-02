import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CodexMemoryCaptureRunnerReport } from "../../extensions/model-memory/runtime-api.ts";
import { runCodexMemoryCaptureRuntimeHook } from "./model-memory-codex-capture-runtime.js";

function loadedReport(): CodexMemoryCaptureRunnerReport {
  return {
    status: "loaded",
    config: {
      enabled: true,
      cadence: "heartbeat",
      maxActivities: 12,
      maxCharsPerActivity: 12_000,
      maxWordsPerWindow: 500,
      documentLikeWordThreshold: 120,
      cooldownMs: 900_000,
      maxPerRun: 6,
      modelId: "openai-codex/gpt-5.4-mini",
      semanticPruning: false,
      rawToolLogsIncluded: false,
    },
    activityCounts: {
      loaded: 1,
      alreadyIngested: 0,
      attempted: 1,
      captured: 1,
      failed: 0,
      documentLike: 1,
      ordinaryTurn: 0,
      user: 1,
      assistant: 0,
      toolSummary: 0,
    },
    writeCounts: {
      write: 1,
      supersede: 0,
      attachSupport: 0,
      reject: 0,
      quarantine: 0,
    },
    idempotency: {
      skippedRefs: [],
      skippedHashes: [],
      capturedRefs: ["codex-session:test:1"],
      capturedHashes: ["hash-1"],
    },
    captures: [],
    safety: {
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
      codexTranscriptExecutedAsInstruction: false,
      deterministicSemanticFallbackUsed: false,
    },
  };
}

function fakeRuntime() {
  return {
    canonicalRepository: {},
    runtimeRepository: {},
    pool: { end: vi.fn(async () => undefined) },
  } as never;
}

describe("model-memory Codex capture runtime hook", () => {
  it("runs by default and persists a cadence checkpoint", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "codex-capture-hook-"));
    const statePath = path.join(tmpDir, "state.json");
    const runCapture = vi.fn(async () => loadedReport());
    const report = await runCodexMemoryCaptureRuntimeHook({
      cadence: "heartbeat",
      env: {
        HOME: tmpDir,
        MODEL_MEMORY_CODEX_CAPTURE_STATE_PATH: statePath,
      },
      deps: {
        createDatabaseRuntime: vi.fn(async () => fakeRuntime()),
        runCapture,
        nowMs: () => 123_000,
      },
    });

    expect(report.status).toBe("loaded");
    expect(runCapture).toHaveBeenCalledTimes(1);
    const firstCall = runCapture.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(firstCall[0]).toMatchObject({
      cadence: "heartbeat",
      nowMs: 123_000,
      projectId: "openclaw",
    });
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      lastRunAtMsByCadence: { heartbeat?: number };
    };
    expect(state.lastRunAtMsByCadence.heartbeat).toBe(123_000);
  });

  it("does not create runtime dependencies when explicitly disabled", async () => {
    const createDatabaseRuntime = vi.fn(async () => fakeRuntime());
    const report = await runCodexMemoryCaptureRuntimeHook({
      cadence: "closeout",
      env: {
        MODEL_MEMORY_CODEX_CAPTURE_ENABLED: "false",
      },
      deps: {
        createDatabaseRuntime,
        runCapture: vi.fn(async () => loadedReport()),
      },
    });

    expect(report.status).toBe("disabled");
    expect(report.reason).toBe("codex_memory_capture_disabled");
    expect(createDatabaseRuntime).not.toHaveBeenCalled();
  });

  it("passes the previous cadence checkpoint into the runner", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "codex-capture-hook-checkpoint-"));
    const statePath = path.join(tmpDir, "state.json");
    const runCapture = vi.fn(async () => loadedReport());
    const createDatabaseRuntime = vi.fn(async () => fakeRuntime());
    const env = {
      HOME: tmpDir,
      MODEL_MEMORY_CODEX_CAPTURE_STATE_PATH: statePath,
    };

    await runCodexMemoryCaptureRuntimeHook({
      cadence: "heartbeat",
      env,
      deps: { createDatabaseRuntime, runCapture, nowMs: () => 200_000 },
    });
    await runCodexMemoryCaptureRuntimeHook({
      cadence: "heartbeat",
      env,
      deps: { createDatabaseRuntime, runCapture, nowMs: () => 201_000 },
    });

    const secondCall = runCapture.mock.calls[1] as unknown as [Record<string, unknown>];
    expect(secondCall[0]).toMatchObject({
      lastRunAtMs: 200_000,
      nowMs: 201_000,
    });
  });
});
