import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importFreshModule } from "../helpers/import-fresh.js";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("test planner executor", () => {
  it("treats the default unit surface as full-suite scope for landing reuse", async () => {
    const { resolveTestSuiteScope } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=full-suite-scope");

    expect(
      resolveTestSuiteScope(
        {
          requestedSurfaces: ["unit"],
          explicitRequestedSurfaces: [],
          fileFilters: [],
          passthroughOptionArgs: [],
          passthroughMetadataOnly: false,
          selectedUnits: [{ id: "unit-a" }, { id: "unit-b" }],
        },
        {
          results: [{ explicitEntryFilters: [] }, { explicitEntryFilters: [] }],
        },
      ),
    ).toEqual({
      kind: "full-suite",
      reusableForLanding: true,
    });

    expect(
      resolveTestSuiteScope(
        {
          requestedSurfaces: ["unit"],
          explicitRequestedSurfaces: ["unit"],
          fileFilters: [],
          passthroughOptionArgs: [],
          passthroughMetadataOnly: false,
          selectedUnits: [{ id: "unit-a" }, { id: "unit-b" }],
        },
        {
          results: [{ explicitEntryFilters: [] }, { explicitEntryFilters: [] }],
        },
      ),
    ).toEqual({
      kind: "targeted",
      reusableForLanding: false,
    });
  });

  it("keeps planner-generated explicit entry filters reusable for the default full-suite run", async () => {
    const { resolveTestSuiteScope } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=full-suite-entry-filters");

    expect(
      resolveTestSuiteScope(
        {
          requestedSurfaces: ["unit"],
          explicitRequestedSurfaces: [],
          fileFilters: [],
          passthroughOptionArgs: [],
          passthroughMetadataOnly: false,
          selectedUnits: [{ id: "unit-a" }, { id: "unit-b" }, { id: "unit-c" }],
        },
        {
          results: [
            { explicitEntryFilters: ["src/a.test.ts"] },
            { explicitEntryFilters: ["src/b.test.ts"] },
            { explicitEntryFilters: ["src/c.test.ts"] },
          ],
        },
      ),
    ).toEqual({
      kind: "full-suite",
      reusableForLanding: true,
    });
  });

  it("falls back to child exit when close never arrives", async () => {
    vi.useRealTimers();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fakeChild = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      pid: 12345,
      kill: vi.fn(),
    });
    const spawnMock = vi.fn(() => {
      setTimeout(() => {
        fakeChild.emit("exit", 0, null);
      }, 0);
      return fakeChild;
    });
    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
    }));

    const { executePlan, createExecutionArtifacts } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=exit-fallback");
    const artifacts = createExecutionArtifacts({ OPENCLAW_TEST_CLOSE_GRACE_MS: "10" });
    const executePromise = executePlan(
      {
        failurePolicy: "fail-fast",
        passthroughMetadataOnly: true,
        passthroughOptionArgs: [],
        runtimeCapabilities: { isWindowsCi: false, isCI: false, isWindows: false },
      },
      {
        env: { OPENCLAW_TEST_CLOSE_GRACE_MS: "10" },
        artifacts,
      },
    );

    await expect(executePromise).resolves.toMatchObject({
      exitCode: 0,
      summary: {
        failedRunCount: 0,
      },
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    artifacts.cleanupTempArtifacts();
  });

  it("collects failures across planned units when failure policy is collect-all", async () => {
    vi.useRealTimers();
    const children = [1, 2].map((pid, index) => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      return Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        pid,
        kill: vi.fn(),
        index,
      });
    });
    let childIndex = 0;
    const spawnMock = vi.fn(() => {
      const child = children[childIndex];
      childIndex += 1;
      setTimeout(() => {
        child.stdout.write(
          child.index === 0
            ? " ❯ src/alpha.test.ts (1 test | 1 failed)\n"
            : " ❯ src/beta.test.ts (1 test | 1 failed)\n",
        );
        child.emit("exit", 1, null);
        child.emit("close", 1, null);
      }, 0);
      return child;
    });
    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
    }));

    const { executePlan, createExecutionArtifacts } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=collect-all");
    const artifacts = createExecutionArtifacts({});
    const report = await executePlan(
      {
        failurePolicy: "collect-all",
        passthroughMetadataOnly: false,
        passthroughOptionArgs: [],
        targetedUnits: [],
        parallelUnits: [
          { id: "unit-a", args: ["vitest", "run", "src/alpha.test.ts"] },
          { id: "unit-b", args: ["vitest", "run", "src/beta.test.ts"] },
        ],
        serialUnits: [],
        serialPrefixUnits: [],
        shardCount: 1,
        shardIndexOverride: null,
        topLevelSingleShardAssignments: new Map(),
        runtimeCapabilities: { isWindowsCi: false, isCI: false, isWindows: false },
        topLevelParallelEnabled: false,
        topLevelParallelLimit: 1,
        deferredRunConcurrency: 1,
        passthroughRequiresSingleRun: false,
      },
      {
        env: {},
        artifacts,
      },
    );

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(report.exitCode).toBe(1);
    expect(report.summary.failedRunCount).toBe(2);
    expect(report.summary.failedTestFileCount).toBe(2);
    expect(report.results.map((result) => result.classification)).toEqual([
      "test-failure",
      "test-failure",
    ]);

    artifacts.cleanupTempArtifacts();
  });

  it("injects a valid localstorage file path into child NODE_OPTIONS", async () => {
    vi.useRealTimers();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fakeChild = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      pid: 123,
      kill: vi.fn(),
    });
    let capturedEnv;
    const spawnMock = vi.fn((_command, _args, options) => {
      capturedEnv = options?.env;
      setTimeout(() => {
        fakeChild.emit("exit", 0, null);
        fakeChild.emit("close", 0, null);
      }, 0);
      return fakeChild;
    });
    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
    }));

    const { executePlan, createExecutionArtifacts } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=localstorage-file");
    const artifacts = createExecutionArtifacts({
      NODE_OPTIONS: "--max_old_space_size=4096 --localstorage-file",
    });
    await expect(
      executePlan(
        {
          failurePolicy: "fail-fast",
          passthroughMetadataOnly: false,
          passthroughOptionArgs: [],
          targetedUnits: [],
          parallelUnits: [{ id: "unit-a", args: ["vitest", "run", "src/alpha.test.ts"] }],
          serialUnits: [],
          serialPrefixUnits: [],
          shardCount: 1,
          shardIndexOverride: null,
          topLevelSingleShardAssignments: new Map(),
          runtimeCapabilities: { isWindowsCi: false, isCI: false, isWindows: false },
          topLevelParallelEnabled: false,
          topLevelParallelLimit: 1,
          deferredRunConcurrency: 1,
          passthroughRequiresSingleRun: false,
        },
        {
          env: {
            NODE_OPTIONS: "--max_old_space_size=4096 --localstorage-file",
          },
          artifacts,
        },
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(capturedEnv?.NODE_OPTIONS).toContain("--max_old_space_size=4096");
    expect(capturedEnv?.NODE_OPTIONS).toMatch(
      /--localstorage-file=[^\s]+\.localstorage\.json(?:\s|$)/u,
    );
    expect(capturedEnv?.NODE_OPTIONS).not.toMatch(/(^|\s)--localstorage-file(?=\s|$)/u);

    artifacts.cleanupTempArtifacts();
  });

  it("captures batch decomposition and phase breakdowns in the final result", async () => {
    vi.useRealTimers();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const fakeChild = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      pid: 456,
      kill: vi.fn(),
    });
    const spawnMock = vi.fn(() => {
      setTimeout(() => {
        stdout.write(
          " Duration  12.50s (transform 1.00s, setup 250ms, collect 9.50s, tests 1.75s)\n",
        );
        fakeChild.emit("exit", 0, null);
        fakeChild.emit("close", 0, null);
      }, 0);
      return fakeChild;
    });
    const writeObservedTimingHistory = vi.fn(() => ({
      historyPath: "/tmp/test-timings.unit.json",
      payload: {},
    }));
    const writeObservedMemoryHistory = vi.fn(() => ({
      historyPath: "/tmp/test-memory.unit.json",
      payload: {},
    }));
    vi.doMock("node:child_process", () => ({
      spawn: spawnMock,
    }));
    vi.doMock("../../scripts/test-planner/timing-history.mjs", () => ({
      writeObservedTimingHistory,
      writeObservedMemoryHistory,
    }));

    const { executePlan, createExecutionArtifacts } = await importFreshModule<
      typeof import("../../scripts/test-planner/executor.mjs")
    >(import.meta.url, "../../scripts/test-planner/executor.mjs?scope=batch-decomposition");
    const artifacts = createExecutionArtifacts({});
    const report = await executePlan(
      {
        failurePolicy: "fail-fast",
        passthroughMetadataOnly: false,
        passthroughOptionArgs: [],
        targetedUnits: [],
        parallelUnits: [
          {
            id: "unit-fast-batch-demo",
            args: ["vitest", "run", "--config", "vitest.unit.config.ts"],
            includeFiles: ["src/alpha.test.ts", "src/beta.test.ts"],
            batchDecomposition: {
              fileCount: 2,
              observedFileCount: 1,
              fixtureFileCount: 0,
              defaultEstimateFileCount: 1,
              estimateSourceCounts: {
                "local-observed": 1,
                "default-estimate": 1,
              },
              dominantGroupingKey: "src",
              dominantGroupingFileCount: 2,
              files: [
                {
                  file: "src/alpha.test.ts",
                  estimatedDurationMs: 9000,
                  estimateSource: "local-observed",
                  observedRuns: 2,
                  groupingKey: "src/alpha",
                },
                {
                  file: "src/beta.test.ts",
                  estimatedDurationMs: 3000,
                  estimateSource: "default-estimate",
                  observedRuns: 0,
                  groupingKey: "src/beta",
                },
              ],
            },
          },
        ],
        serialUnits: [],
        serialPrefixUnits: [],
        shardCount: 1,
        shardIndexOverride: null,
        topLevelSingleShardAssignments: new Map(),
        runtimeCapabilities: { isWindowsCi: false, isCI: false, isWindows: false },
        topLevelParallelEnabled: false,
        topLevelParallelLimit: 1,
        deferredRunConcurrency: 1,
        passthroughRequiresSingleRun: false,
      },
      {
        env: {},
        artifacts,
      },
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(report.exitCode).toBe(0);
    expect(report.results[0]).toMatchObject({
      unitId: "unit-fast-batch-demo",
      batchPhaseBreakdown: {
        totalMs: 12_500,
        importSetupMs: 10_750,
        testBodyMs: 1_750,
        dominance: "import-setup-dominated",
      },
      batchDecompositionSummary: {
        fileCount: 2,
        dominantGroupingKey: "src",
        topEstimatedFiles: [
          expect.objectContaining({ file: "src/alpha.test.ts", estimatedDurationMs: 9000 }),
          expect.objectContaining({ file: "src/beta.test.ts", estimatedDurationMs: 3000 }),
        ],
      },
    });
    expect(writeObservedTimingHistory).toHaveBeenCalledWith(
      "vitest.unit.config.ts",
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/alpha.test.ts",
          observationMode: "batch-coarse",
        }),
        expect.objectContaining({
          file: "src/beta.test.ts",
          observationMode: "batch-coarse",
        }),
      ]),
    );

    artifacts.cleanupTempArtifacts();
  });
});
