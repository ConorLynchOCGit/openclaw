import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildToolResultProofLiveCapture } from "../extensions/model-memory/src/mmv2/tool-result-proof-capture.ts";
import {
  buildPhase2EntryDecisionReport,
  renderPhase2EntryDecisionMarkdown,
  runPhase2EntryNoDarkDataPack,
  runPhase2EntryRetrievalEvalMatrix,
  type Phase2EntryGateBlocker,
  type Phase2EntryGateWarning,
  type Phase2EntrySeverity,
} from "../extensions/model-memory/src/phase2-entry-validation.ts";
import {
  buildLexicalBaselineRetrievalRequest,
  type RetrievalEnvelope,
  type RetrievalRequestInterpreter,
} from "../extensions/model-memory/src/retrieval-request-interpreter.ts";
import { InMemoryRetrievalStore } from "../extensions/model-memory/src/retrieval-store.ts";
import { buildRetrievalPackArtifact } from "../extensions/model-memory/src/runtime/context/retrieval-packs.ts";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.ts";
import {
  loadSanitizedModelMemoryRunnerConfig,
  resolveModelMemoryRunnerDatabaseMode,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.ts";
import {
  executeSessionTurnProof,
  SESSION_TURN_PROOF_PROMPTS,
  SESSION_TURN_PROOF_REQUEST_SEED,
  SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
} from "../src/agents/model-memory.session-turn-proof.ts";
import {
  executeRetrieval,
  listRuntimeMemoryRecords,
  rebuildDerivedRuntimeState,
} from "../src/plugin-sdk/model-memory.ts";

type JsonRecord = Record<string, unknown>;

type CommandResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

type GateSummary = {
  db: {
    overallSeverity: string;
    redCount: number;
    yellowCount: number;
    pgStatStatementsAvailable: boolean;
    pgStatStatementsReason?: string;
  };
  recovery: {
    phase2EntrySafe: boolean;
    overallReconcileClass: string;
    blockingSurfaceIds: string[];
  };
};

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function readArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string) {
  await writeFile(filePath, value, "utf8");
}

async function runCommand(
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
) {
  return await new Promise<CommandResult>((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timeout =
      typeof options?.timeoutMs === "number" && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
              if (!settled) {
                child.kill("SIGKILL");
              }
            }, 5_000).unref?.();
          }, options.timeoutMs)
        : undefined;
    child.on("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      settled = true;
      resolve({
        ok: false,
        status: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error instanceof Error ? error.message : String(error)}`,
      });
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (status) => {
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        ok: status === 0 && !timedOut,
        status,
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr ? "\n" : ""}Timed out after ${options?.timeoutMs}ms`
          : stderr,
      });
    });
  });
}

async function runJsonScript(args: string[], outputPath: string, timeoutMs?: number) {
  const result = await runCommand(args, { cwd: repoRoot(), timeoutMs });
  const payload = {
    command: args.join(" "),
    ok: result.ok,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
  await writeJson(outputPath, payload);
  if (!result.ok) {
    throw new Error(`command failed: ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  const trimmed = result.stdout.trim();
  return JSON.parse(trimmed.replace(/^```json\s*/iu, "").replace(/\s*```$/iu, ""));
}

async function runScriptAndReadReport(
  args: string[],
  commandOutputPath: string,
  timeoutMs?: number,
) {
  const result = await runCommand(args, { cwd: repoRoot(), timeoutMs });
  await writeJson(commandOutputPath, {
    command: args.join(" "),
    ok: result.ok,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  });
  if (!result.ok) {
    throw new Error(`command failed: ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout.trim());
  const reportPath = typeof parsed.report === "string" ? parsed.report : undefined;
  if (!reportPath) {
    throw new Error(`missing report path from ${args.join(" ")}`);
  }
  return JSON.parse(await readFile(reportPath, "utf8"));
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function pollGatewayHealth(iterations: number, delayMs: number) {
  const samples: Array<{
    ok: boolean;
    status?: number;
    latencyMs: number;
    error?: string;
  }> = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch("http://127.0.0.1:28789/healthz");
      const latencyMs = Date.now() - startedAt;
      samples.push({
        ok: response.ok,
        status: response.status,
        latencyMs,
      });
    } catch (error) {
      samples.push({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (index < iterations - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  const latencies = samples.filter((sample) => sample.ok).map((sample) => sample.latencyMs);
  return {
    iterations,
    successCount: samples.filter((sample) => sample.ok).length,
    failureCount: samples.filter((sample) => !sample.ok).length,
    p95LatencyMs: percentile(latencies, 0.95),
    samples,
  };
}

async function persistToolResultProofCapture(
  runtime: Awaited<ReturnType<typeof createModelMemoryDatabaseRuntime>>,
  index: number,
) {
  const built = buildToolResultProofLiveCapture({
    toolName: "phase2_entry_tool_result",
    toolCallId: `tool-call-${index}`,
    runId: `phase2-entry-run-${index}`,
    sessionId: "phase2-entry-load-test",
    sessionKey: "agent:main:phase2-entry-load-test",
    agentId: "phase2-entry-validation",
    observedAt: new Date(),
    result: {
      status: "success",
      artifactPath: `.artifacts/model-memory/phase2-entry-validation/tool-${index}.json`,
      fileCount: index + 1,
      url: `https://example.com/phase2-entry/${index}`,
    },
  });
  if (!built) {
    return {
      ok: false,
      reason: "no_bounded_fact",
      latencyMs: 0,
    };
  }

  const repoBase = runtime.canonicalRepository as typeof runtime.canonicalRepository & {
    withDbLane?: (lane: "capture" | "rebuild" | "retrieval" | "admin" | "default") => unknown;
    withTransaction?: (
      work: (repository: {
        persistSource: (source: unknown) => Promise<unknown>;
        persistSourceWindows: (windows: unknown[]) => Promise<unknown>;
        persistLiveMemoryBatch: (batch: unknown) => Promise<unknown>;
      }) => Promise<unknown>,
    ) => Promise<unknown>;
    persistSource: (source: unknown) => Promise<unknown>;
    persistSourceWindows: (windows: unknown[]) => Promise<unknown>;
    persistLiveMemoryBatch: (batch: unknown) => Promise<unknown>;
  };
  const captureRepo = (repoBase.withDbLane?.("capture") as typeof repoBase | undefined) ?? repoBase;
  const startedAt = Date.now();
  if (typeof captureRepo.withTransaction === "function") {
    await captureRepo.withTransaction(async (transactionRepository) => {
      await transactionRepository.persistSource(built.source);
      await transactionRepository.persistSourceWindows(built.windows);
      await transactionRepository.persistLiveMemoryBatch(built.liveMemoryBatch);
    });
  } else {
    await captureRepo.persistSource(built.source);
    await captureRepo.persistSourceWindows(built.windows);
    await captureRepo.persistLiveMemoryBatch(built.liveMemoryBatch);
  }
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    sourceId: built.source.id,
    memoryCount: built.liveMemoryBatch.durableMemories.length,
  };
}

async function runRetrievalIteration(
  runtime: Awaited<ReturnType<typeof createModelMemoryDatabaseRuntime>>,
  iteration: number,
) {
  const startedAt = Date.now();
  const [memoryObjects, projectionVersions] = await Promise.all([
    listRuntimeMemoryRecords(runtime.canonicalRepository),
    runtime.runtimeRepository.listProjectionVersions(),
  ]);
  const envelope: RetrievalEnvelope = {
    queryText: "What is the current phase 2 readiness validation state for model memory?",
    requestPurpose: "phase2_entry_load_test",
    sessionId: `phase2-entry-load-retrieval-${iteration}`,
    agentId: "phase2-entry-validation",
    maxResults: 5,
    scope: {
      projectId: "model-memory",
      sessionKey: "agent:main:phase2-entry-load-test",
    },
  };
  const interpreter: RetrievalRequestInterpreter = {
    async interpret({ envelope }) {
      return {
        action: "retrieve",
        request: buildLexicalBaselineRetrievalRequest(envelope),
      };
    },
  };
  const store = new InMemoryRetrievalStore();
  const execution = await executeRetrieval({
    envelope,
    interpreter,
    memoryObjects,
    modelId: "deterministic/lexical",
    store,
    createdAt: new Date(),
    projectionVersions,
  });
  if (!execution) {
    throw new Error("retrieval unexpectedly skipped during phase2 entry load test");
  }
  const artifact = buildRetrievalPackArtifact({
    retrievalRequest: execution.retrievalRequest,
    retrievalResultSet: execution.retrievalResultSet,
    retrievalResultItems: execution.retrievalResultItems,
    memoryObjects,
    retrievalPlan: execution.retrievalPlan,
    retrievalCandidates: execution.retrievalCandidates,
    retrievalExclusions: execution.retrievalExclusions,
    selectedProjectionDigests: execution.selectedProjectionDigests,
    buildPolicyVersion: "phase2_entry_load_test.v1",
  });
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    selectedCount: execution.retrievalResultItems.filter((item) => item.selectedForContext).length,
    selectedProjectionCount: execution.selectedProjectionDigests.length,
    renderedLength: artifact.renderedText?.length ?? 0,
  };
}

async function runControlledLoadTest(outputDir: string) {
  const strictCaptureModelRef =
    process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() || "openai-codex/gpt-5.4-mini";
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory phase2 entry load test",
  });
  const databaseMode = resolveModelMemoryRunnerDatabaseMode({
    defaultMode: "targeted_trace_scratch_db",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-phase2-entry-load-",
  });
  const runtime = await createModelMemoryDatabaseRuntime({
    config,
    databaseMode,
  });
  const blockers: Phase2EntryGateBlocker[] = [];
  const warnings: Phase2EntryGateWarning[] = [];

  try {
    const ordinaryStartedAt = Date.now();
    const ordinaryTurnProof = await withTimeout(
      executeSessionTurnProof({
        runtime,
        config,
        modelRef: strictCaptureModelRef,
        candidateModelRef: strictCaptureModelRef,
        requestSeed: SESSION_TURN_PROOF_REQUEST_SEED,
        requestTimeoutMs: SESSION_TURN_PROOF_REQUEST_TIMEOUT_MS,
        prompts: SESSION_TURN_PROOF_PROMPTS.slice(0, 1),
      }),
      240_000,
      "phase2 entry ordinary-turn seed",
    );
    const ordinaryLatencyMs = Date.now() - ordinaryStartedAt;
    await writeJson(path.join(outputDir, "ordinary-turn-seed-report.json"), ordinaryTurnProof);
    const baselineRebuildStartedAt = Date.now();
    const baselineRebuild = await rebuildDerivedRuntimeState({
      canonicalRepository: runtime.canonicalRepository,
      runtimeRepository: runtime.runtimeRepository,
    });
    await writeJson(path.join(outputDir, "baseline-runtime-rebuild-report.json"), {
      generated_at: new Date().toISOString(),
      latencyMs: Date.now() - baselineRebuildStartedAt,
      memoryObjectCount: baselineRebuild.memoryObjects.length,
      projectionVersionCount: baselineRebuild.projectionVersions.length,
      projectionTargetCount: baselineRebuild.projectionTargets.length,
    });

    const toolCapturePromise = (async () => {
      const samples = [];
      for (let index = 0; index < 3; index += 1) {
        samples.push(await persistToolResultProofCapture(runtime, index));
      }
      return samples;
    })();
    const rebuildPromise = (async () => {
      const samples: Array<{
        ok: boolean;
        latencyMs: number;
        memoryObjectCount?: number;
        error?: string;
      }> = [];
      for (let index = 0; index < 4; index += 1) {
        const startedAt = Date.now();
        try {
          const rebuild = await rebuildDerivedRuntimeState({
            canonicalRepository: runtime.canonicalRepository,
            runtimeRepository: runtime.runtimeRepository,
          });
          samples.push({
            ok: true,
            latencyMs: Date.now() - startedAt,
            memoryObjectCount: rebuild.memoryObjects.length,
          });
        } catch (error) {
          samples.push({
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return samples;
    })();
    const retrievalPromise = (async () => {
      const samples = [];
      for (let index = 0; index < 4; index += 1) {
        try {
          samples.push(await runRetrievalIteration(runtime, index));
        } catch (error) {
          samples.push({
            ok: false,
            latencyMs: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return samples;
    })();
    const gatewayPromise = pollGatewayHealth(5, 400);

    const [toolCaptureSamples, rebuildSamples, retrievalSamples, gatewayHealth] = await Promise.all(
      [toolCapturePromise, rebuildPromise, retrievalPromise, gatewayPromise],
    );

    const retrievalLatencies = retrievalSamples
      .filter((sample) => sample.ok)
      .map((sample) => sample.latencyMs);
    const toolCaptureLatencies = toolCaptureSamples
      .filter((sample) => sample.ok)
      .map((sample) => sample.latencyMs);
    const rebuildLatencies = rebuildSamples
      .filter((sample) => sample.ok)
      .map((sample) => sample.latencyMs);

    if (ordinaryTurnProof.totals.promptsFailed > 0) {
      blockers.push({
        id: "load_ordinary_turn_failed",
        title: "Ordinary-turn scratch capture failed during controlled load seed",
        evidence: `prompts_failed=${ordinaryTurnProof.totals.promptsFailed}`,
      });
    }
    if (toolCaptureSamples.some((sample) => !sample.ok)) {
      blockers.push({
        id: "load_tool_result_failed",
        title: "Tool-result proof capture failed during controlled load pass",
        evidence: "one or more deterministic tool-result captures failed",
      });
    }
    if (rebuildSamples.some((sample) => !sample.ok)) {
      blockers.push({
        id: "load_rebuild_failed",
        title: "Projection/runtime rebuild failed during controlled load pass",
        evidence: "one or more rebuild iterations failed",
      });
    }
    if (retrievalSamples.some((sample) => !sample.ok)) {
      blockers.push({
        id: "load_retrieval_failed",
        title: "Retrieval pack assembly failed during controlled load pass",
        evidence: "one or more retrieval iterations failed",
      });
    }
    if (retrievalSamples.every((sample) => sample.ok && sample.selectedCount === 0)) {
      warnings.push({
        id: "load_retrieval_zero_selected",
        title: "Retrieval stayed empty during controlled load pass",
        evidence: "retrieval iterations completed but selectedCount stayed zero",
      });
    }
    if (gatewayHealth.failureCount > 0) {
      blockers.push({
        id: "load_gateway_health_failed",
        title: "Gateway health degraded during controlled load pass",
        evidence: `gateway_health_failures=${gatewayHealth.failureCount}`,
      });
    }

    const report = {
      schema_version: "phase2_entry_load_test.v1",
      generated_at: new Date().toISOString(),
      scope: "isolated_scratch_db",
      limitations: [
        "ordinary-turn workload is seeded first because session-turn proof resets the scratch DB before capture",
        "a single baseline rebuild materializes the served runtime before the concurrent phase begins",
        "concurrent phase covers tool-result capture, rebuild, retrieval pack assembly, and gateway health against the scratch corpus",
      ],
      ordinary_turn_seed: {
        promptCount: ordinaryTurnProof.promptRuns.length,
        promptsCompleted: ordinaryTurnProof.totals.promptsCompleted,
        promptsFailed: ordinaryTurnProof.totals.promptsFailed,
        capturedClaimCount: ordinaryTurnProof.totals.capturedClaimCount,
        latencyMs: ordinaryLatencyMs,
      },
      tool_result_capture: {
        sampleCount: toolCaptureSamples.length,
        successCount: toolCaptureSamples.filter((sample) => sample.ok).length,
        p95LatencyMs: percentile(toolCaptureLatencies, 0.95),
        samples: toolCaptureSamples,
      },
      rebuild: {
        sampleCount: rebuildSamples.length,
        successCount: rebuildSamples.filter((sample) => sample.ok).length,
        p95LatencyMs: percentile(rebuildLatencies, 0.95),
        samples: rebuildSamples,
      },
      retrieval: {
        sampleCount: retrievalSamples.length,
        successCount: retrievalSamples.filter((sample) => sample.ok).length,
        p95LatencyMs: percentile(retrievalLatencies, 0.95),
        selectedCountMax: Math.max(...retrievalSamples.map((sample) => sample.selectedCount ?? 0)),
        samples: retrievalSamples,
      },
      gateway_health: gatewayHealth,
      blockers,
      warnings,
      severity: blockers.length > 0 ? "red" : warnings.length > 0 ? "yellow" : "green",
    };
    await writeJson(path.join(outputDir, "load-test-report.json"), report);
    await writeText(
      path.join(outputDir, "load-test-report.md"),
      [
        "# Phase-2 Entry Load Test",
        "",
        `- severity: ${report.severity}`,
        `- ordinary_turn_prompts_completed: ${report.ordinary_turn_seed.promptsCompleted}`,
        `- tool_result_success_count: ${report.tool_result_capture.successCount}/${report.tool_result_capture.sampleCount}`,
        `- rebuild_success_count: ${report.rebuild.successCount}/${report.rebuild.sampleCount}`,
        `- retrieval_success_count: ${report.retrieval.successCount}/${report.retrieval.sampleCount}`,
        `- gateway_health_success_count: ${report.gateway_health.successCount}/${report.gateway_health.iterations}`,
      ].join("\n") + "\n",
    );
    return report;
  } finally {
    await runtime.pool.end();
  }
}

function summarizeBaselineReports(dbReport: JsonRecord, recoveryReport: JsonRecord): GateSummary {
  const maintenanceHealth = (dbReport.maintenanceHealth ?? {}) as JsonRecord;
  const maintenanceSummary = (maintenanceHealth.summary ?? {}) as JsonRecord;
  const pgStatStatements = (dbReport.pgStatStatements ?? {}) as JsonRecord;
  const recovery = (recoveryReport.recovery ?? {}) as JsonRecord;
  const recoverySummary = (recovery.summary ?? {}) as JsonRecord;
  const overallSeverity =
    typeof maintenanceSummary.overallSeverity === "string"
      ? maintenanceSummary.overallSeverity
      : "unavailable";
  const overallReconcileClass =
    typeof recoverySummary.overallReconcileClass === "string"
      ? recoverySummary.overallReconcileClass
      : "unknown";
  return {
    db: {
      overallSeverity,
      redCount: Number(maintenanceSummary.redCount ?? 0),
      yellowCount: Number(maintenanceSummary.yellowCount ?? 0),
      pgStatStatementsAvailable: Boolean(pgStatStatements.available),
      pgStatStatementsReason:
        typeof pgStatStatements.reason === "string"
          ? pgStatStatements.reason
          : typeof pgStatStatements.detail === "string"
            ? pgStatStatements.detail
            : undefined,
    },
    recovery: {
      phase2EntrySafe: Boolean(recoverySummary.phase2EntrySafe),
      overallReconcileClass,
      blockingSurfaceIds: Array.isArray(recoverySummary.blockingSurfaceIds)
        ? recoverySummary.blockingSurfaceIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    },
  };
}

async function main() {
  const root = repoRoot();
  const argv = process.argv.slice(2);
  const artifactRoot = path.resolve(
    root,
    readArgValue(argv, "--artifact-root") ??
      `.artifacts/model-memory/phase2-entry-validation/${new Date().toISOString().slice(0, 10)}`,
  );
  const baselineDir = path.join(artifactRoot, "baseline");
  const loadTestDir = path.join(artifactRoot, "load-test");
  const retrievalEvalDir = path.join(artifactRoot, "retrieval-evals");
  const noDarkDataDir = path.join(artifactRoot, "no-dark-data");
  const liveValidationDir = path.join(artifactRoot, "live-validation");
  const finalReportDir = path.join(artifactRoot, "final-report");
  await Promise.all([
    ensureDir(baselineDir),
    ensureDir(loadTestDir),
    ensureDir(retrievalEvalDir),
    ensureDir(noDarkDataDir),
    ensureDir(liveValidationDir),
    ensureDir(finalReportDir),
  ]);

  const baselineDbReport = await runJsonScript(
    ["node", "--import", "tsx", "scripts/model-memory-phase2-db-gates.ts"],
    path.join(baselineDir, "db-gates-command.json"),
    120_000,
  );
  const baselineRecoveryReport = await runJsonScript(
    ["node", "--import", "tsx", "scripts/model-memory-phase2-recovery-gates.ts"],
    path.join(baselineDir, "recovery-gates-command.json"),
    120_000,
  );
  await writeJson(path.join(baselineDir, "db-gates.json"), baselineDbReport);
  await writeJson(path.join(baselineDir, "recovery-gates.json"), baselineRecoveryReport);
  const baselineSummary = summarizeBaselineReports(baselineDbReport, baselineRecoveryReport);
  await writeJson(path.join(baselineDir, "baseline-summary.json"), baselineSummary);

  const loadTestReport = await runControlledLoadTest(loadTestDir);

  const retrievalEvalReport = runPhase2EntryRetrievalEvalMatrix();
  await writeJson(path.join(retrievalEvalDir, "retrieval-evals.json"), retrievalEvalReport);
  await writeText(
    path.join(retrievalEvalDir, "retrieval-evals.md"),
    [
      "# Phase-2 Entry Retrieval Evals",
      "",
      `- total: ${retrievalEvalReport.summary.total}`,
      `- passed: ${retrievalEvalReport.summary.passed}`,
      `- failed: ${retrievalEvalReport.summary.failed}`,
      `- failed_case_ids: ${retrievalEvalReport.summary.failedCaseIds.join(", ") || "none"}`,
    ].join("\n") + "\n",
  );

  const noDarkDataReport = await runPhase2EntryNoDarkDataPack();
  await writeJson(path.join(noDarkDataDir, "no-dark-data-report.json"), noDarkDataReport);
  await writeText(
    path.join(noDarkDataDir, "no-dark-data-report.md"),
    [
      "# Phase-2 Entry No-Dark-Data Pack",
      "",
      `- total: ${noDarkDataReport.summary.total}`,
      `- passed: ${noDarkDataReport.summary.passed}`,
      `- failed: ${noDarkDataReport.summary.failed}`,
      `- failed_case_ids: ${noDarkDataReport.summary.failedCaseIds.join(", ") || "none"}`,
    ].join("\n") + "\n",
  );

  const liveBlockers: Phase2EntryGateBlocker[] = [];
  const liveWarnings: Phase2EntryGateWarning[] = [];

  let memmechReport: JsonRecord | undefined;
  try {
    memmechReport = await runScriptAndReadReport(
      [
        "node",
        "scripts/model-memory-memmech-live-proof.mjs",
        "--output-dir",
        path.join(liveValidationDir, "memmech-live-proof"),
      ],
      path.join(liveValidationDir, "memmech-live-proof.command.json"),
      240_000,
    );
    await writeJson(path.join(liveValidationDir, "memmech-live-proof.report.json"), memmechReport);
    const acceptance = (memmechReport.acceptance ?? {}) as JsonRecord;
    if (!acceptance.captureWritten) {
      liveBlockers.push({
        id: "live_capture_not_written",
        title: "Live ordinary-turn capture did not emit capture_written proof",
        evidence: "memmech.acceptance.captureWritten=false",
      });
    }
    if (!acceptance.durableApprovedRowCreated) {
      liveBlockers.push({
        id: "live_durable_row_missing",
        title: "Live ordinary-turn capture did not prove durable approved-row creation",
        evidence: "memmech.acceptance.durableApprovedRowCreated=false",
      });
    }
    if (!acceptance.noStorePrivacyTempNoRows) {
      liveBlockers.push({
        id: "live_no_store_leak",
        title: "Live no-store/privacy probe created durable rows",
        evidence: "memmech.acceptance.noStorePrivacyTempNoRows=false",
      });
    }
    if (!acceptance.rootHashesUnchanged) {
      liveBlockers.push({
        id: "live_root_hashes_changed",
        title: "Live proof mutated root workspace memory files",
        evidence: "memmech.acceptance.rootHashesUnchanged=false",
      });
    }
    const noDarkDataScan = (memmechReport.no_dark_data_scan ?? {}) as JsonRecord;
    if (Array.isArray(noDarkDataScan.leaked) && noDarkDataScan.leaked.length > 0) {
      liveBlockers.push({
        id: "live_no_dark_data_leak",
        title: "Live memmech proof detected dark-data leakage",
        evidence: `leaked_patterns=${noDarkDataScan.leaked.join(",")}`,
      });
    }
  } catch (error) {
    liveBlockers.push({
      id: "live_memmech_failed",
      title: "Live memmech proof failed",
      evidence: error instanceof Error ? error.message : String(error),
    });
  }

  let captureSeamsReport: JsonRecord | undefined;
  try {
    captureSeamsReport = await runScriptAndReadReport(
      [
        "node",
        "scripts/model-memory-capture-seams-live-proof.mjs",
        "--output-dir",
        path.join(liveValidationDir, "capture-seams"),
      ],
      path.join(liveValidationDir, "capture-seams.command.json"),
      60_000,
    );
    await writeJson(path.join(liveValidationDir, "capture-seams.report.json"), captureSeamsReport);
    const activeSeams = Array.isArray(captureSeamsReport.activeSeams)
      ? captureSeamsReport.activeSeams
      : [];
    for (const seamName of ["tool_result_persist", "after_tool_call"]) {
      const seam = activeSeams.find(
        (entry): entry is JsonRecord =>
          !!entry && typeof entry === "object" && (entry as JsonRecord).seamName === seamName,
      );
      if (!seam || seam.status !== "active_proven") {
        const seamStatus = typeof seam?.status === "string" ? seam.status : "missing";
        liveBlockers.push({
          id: `live_seam_${seamName}_blocked`,
          title: `Live capture seam ${seamName} is not active_proven`,
          evidence: `status=${seamStatus}`,
        });
      }
    }
    const noDarkData = (captureSeamsReport.noDarkData ?? {}) as JsonRecord;
    if (Array.isArray(noDarkData.leaked) && noDarkData.leaked.length > 0) {
      liveBlockers.push({
        id: "live_capture_seams_dark_data_leak",
        title: "Capture seams live proof detected dark-data leakage",
        evidence: `leaked_patterns=${noDarkData.leaked.join(",")}`,
      });
    }
  } catch (error) {
    liveBlockers.push({
      id: "live_capture_seams_failed",
      title: "Live capture-seams proof failed",
      evidence: error instanceof Error ? error.message : String(error),
    });
  }

  let projectionBehaviorReport: JsonRecord | undefined;
  try {
    projectionBehaviorReport = await runScriptAndReadReport(
      [
        "node",
        "scripts/model-memory-live-projection-behavior-proof.mjs",
        "--output-dir",
        path.join(liveValidationDir, "projection-live-behavior"),
      ],
      path.join(liveValidationDir, "projection-live-behavior.command.json"),
      600_000,
    );
    await writeJson(
      path.join(liveValidationDir, "projection-live-behavior.report.json"),
      projectionBehaviorReport,
    );
    const proofCount = Number(projectionBehaviorReport.proof_count ?? 0);
    const passedCount = Number(projectionBehaviorReport.passed_count ?? 0);
    if (proofCount === 0 || passedCount === 0) {
      liveBlockers.push({
        id: "live_projection_proof_empty",
        title: "Projection live behavior proof produced no passed proofs",
        evidence: `proof_count=${proofCount}; passed_count=${passedCount}`,
      });
    } else if (passedCount < proofCount) {
      liveWarnings.push({
        id: "live_projection_partial_failures",
        title: "Projection live behavior proof has partial failures",
        evidence: `proof_count=${proofCount}; passed_count=${passedCount}`,
      });
    }
  } catch (error) {
    liveBlockers.push({
      id: "live_projection_behavior_failed",
      title: "Live projection behavior proof failed",
      evidence: error instanceof Error ? error.message : String(error),
    });
  }

  const postDbReport = await runJsonScript(
    ["node", "--import", "tsx", "scripts/model-memory-phase2-db-gates.ts"],
    path.join(liveValidationDir, "post-db-gates-command.json"),
    120_000,
  );
  const postRecoveryReport = await runJsonScript(
    ["node", "--import", "tsx", "scripts/model-memory-phase2-recovery-gates.ts"],
    path.join(liveValidationDir, "post-recovery-gates-command.json"),
    120_000,
  );
  await writeJson(path.join(liveValidationDir, "post-db-gates.json"), postDbReport);
  await writeJson(path.join(liveValidationDir, "post-recovery-gates.json"), postRecoveryReport);
  const postBaselineSummary = summarizeBaselineReports(postDbReport, postRecoveryReport);
  if (!postBaselineSummary.recovery.phase2EntrySafe) {
    liveWarnings.push({
      id: "live_post_run_recovery_still_blocked",
      title: "Post-run recovery gate still reports blocked runtime state",
      evidence: `overall_reconcile_class=${postBaselineSummary.recovery.overallReconcileClass}`,
    });
  }

  const liveValidationReport = {
    schema_version: "phase2_entry_live_validation.v1",
    generated_at: new Date().toISOString(),
    memmech: memmechReport,
    capture_seams: captureSeamsReport,
    projection_behavior: projectionBehaviorReport,
    post_run_baseline: postBaselineSummary,
    blockers: liveBlockers,
    warnings: liveWarnings,
    severity:
      liveBlockers.length > 0
        ? ("red" satisfies Phase2EntrySeverity)
        : liveWarnings.length > 0
          ? ("yellow" satisfies Phase2EntrySeverity)
          : ("green" satisfies Phase2EntrySeverity),
  };
  await writeJson(
    path.join(liveValidationDir, "live-validation-summary.json"),
    liveValidationReport,
  );

  const decision = buildPhase2EntryDecisionReport({
    dbBaseline: {
      pgStatStatementsAvailable: baselineSummary.db.pgStatStatementsAvailable,
      pgStatStatementsReason: baselineSummary.db.pgStatStatementsReason,
      maintenanceOverallSeverity: baselineSummary.db.overallSeverity,
      maintenanceRedCount: baselineSummary.db.redCount,
      maintenanceYellowCount: baselineSummary.db.yellowCount,
    },
    recoveryBaseline: {
      phase2EntrySafe: baselineSummary.recovery.phase2EntrySafe,
      overallReconcileClass: baselineSummary.recovery.overallReconcileClass,
      blockingSurfaceIds: baselineSummary.recovery.blockingSurfaceIds,
    },
    loadTest: {
      severity: loadTestReport.severity,
      blockers: loadTestReport.blockers,
      warnings: loadTestReport.warnings,
    },
    retrievalEvals: retrievalEvalReport,
    noDarkData: noDarkDataReport,
    liveValidation: {
      severity: liveValidationReport.severity,
      blockers: liveValidationReport.blockers,
      warnings: liveValidationReport.warnings,
    },
  });

  const finalReport = {
    schema_version: "phase2_entry_validation_pack.v1",
    generated_at: new Date().toISOString(),
    artifact_root: artifactRoot,
    baseline: baselineSummary,
    load_test: loadTestReport,
    retrieval_evals: retrievalEvalReport.summary,
    no_dark_data: noDarkDataReport.summary,
    live_validation: {
      severity: liveValidationReport.severity,
      blockerCount: liveValidationReport.blockers.length,
      warningCount: liveValidationReport.warnings.length,
      postRunBaseline: postBaselineSummary,
    },
    decision,
    nextLane:
      decision.status === "green"
        ? "phase2"
        : "clear remaining phase-2 entry blockers from the latest report and rerun the phase-2 entry validation pack",
  };
  await writeJson(path.join(finalReportDir, "phase2-entry-report.json"), finalReport);
  await writeText(
    path.join(finalReportDir, "phase2-entry-report.md"),
    renderPhase2EntryDecisionMarkdown({
      artifactRoot,
      dbBaseline: baselineSummary.db,
      recoveryBaseline: baselineSummary.recovery,
      loadTest: {
        severity: loadTestReport.severity,
        blockers: loadTestReport.blockers,
        warnings: loadTestReport.warnings,
      },
      retrievalEvals: retrievalEvalReport,
      noDarkData: noDarkDataReport,
      liveValidation: {
        severity: liveValidationReport.severity,
        blockers: liveValidationReport.blockers,
        warnings: liveValidationReport.warnings,
        postRunBaseline: postBaselineSummary,
      },
      decision,
    }),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifactRoot,
        report: path.join(finalReportDir, "phase2-entry-report.json"),
        status: decision.status,
        phase2Authorized: decision.authorizedToBeginPhase2,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
