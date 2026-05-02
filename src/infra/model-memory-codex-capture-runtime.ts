import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  parseJsonModelOutput,
  runCodexSessionMemoryCapture,
  type SemanticInterpreter,
  type SemanticInterpreterInput,
  type CodexMemoryCaptureCadence,
  type CodexMemoryCaptureRunnerReport,
} from "../../extensions/model-memory/runtime-api.js";
import {
  createModelMemoryDatabaseRuntime,
  type ModelMemoryDatabaseRuntime,
} from "../agents/model-memory.database.js";
import { OpenAICompatibleLiveJsonExecutor } from "../agents/model-memory.live-json-executor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const CODEX_CAPTURE_ENABLED_ENV = "MODEL_MEMORY_CODEX_CAPTURE_ENABLED";
const CODEX_CAPTURE_STATE_PATH_ENV = "MODEL_MEMORY_CODEX_CAPTURE_STATE_PATH";
const CODEX_CAPTURE_TIMEOUT_MS_ENV = "MODEL_MEMORY_CODEX_CAPTURE_TIMEOUT_MS";
const CODEX_CAPTURE_PROJECT_ID_ENV = "MODEL_MEMORY_CODEX_CAPTURE_PROJECT_ID";
const DEFAULT_CODEX_CAPTURE_TIMEOUT_MS = 120_000;

type CodexCaptureHookState = {
  schemaVersion: "model_memory_codex_capture_hook_state.v1";
  lastRunAtMsByCadence: Partial<Record<CodexMemoryCaptureCadence, number>>;
};

export type CodexMemoryCaptureRuntimeHookReport = {
  status: "disabled" | "cooldown" | "loaded" | "degraded";
  cadence: CodexMemoryCaptureCadence;
  reason?: string;
  statePath?: string;
  report?: CodexMemoryCaptureRunnerReport;
  traces: Array<{
    contractName: string;
    contractVersion: string;
    requestedModelId: string;
    resolvedModelId?: string;
    provider: string;
    providerModel: string;
    responseOk: boolean;
    failureStage?: string;
    failureClass?: string;
    errorMessage?: string;
  }>;
};

type RunCapture = typeof runCodexSessionMemoryCapture;
type CreateDatabaseRuntime = typeof createModelMemoryDatabaseRuntime;

type HookDeps = {
  createDatabaseRuntime?: CreateDatabaseRuntime;
  runCapture?: RunCapture;
  nowMs?: () => number;
};

const log = createSubsystemLogger("model-memory/codex-capture");

function readBooleanEnv(value: string | undefined, fallback = true): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  if (/^(?:1|true|yes|on)$/iu.test(normalized)) {
    return true;
  }
  if (/^(?:0|false|no|off)$/iu.test(normalized)) {
    return false;
  }
  return fallback;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 1_200 ? `${text.slice(0, 1_200)}...` : text;
}

function resolveStatePath(env: NodeJS.ProcessEnv): string {
  const explicit = env[CODEX_CAPTURE_STATE_PATH_ENV]?.trim();
  if (explicit) {
    return explicit;
  }
  const root =
    env.OPENCLAW_STATE_DIR?.trim() || path.join(env.HOME?.trim() || os.homedir(), ".openclaw");
  return path.join(root, "model-memory", "codex-capture-hook-state.json");
}

async function readHookState(statePath: string): Promise<CodexCaptureHookState> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<CodexCaptureHookState>;
    return {
      schemaVersion: "model_memory_codex_capture_hook_state.v1",
      lastRunAtMsByCadence: parsed.lastRunAtMsByCadence ?? {},
    };
  } catch {
    return {
      schemaVersion: "model_memory_codex_capture_hook_state.v1",
      lastRunAtMsByCadence: {},
    };
  }
}

async function writeHookState(statePath: string, state: CodexCaptureHookState) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

class CodexCaptureLiveInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: OpenAICompatibleLiveJsonExecutor) {}

  async interpret(input: SemanticInterpreterInput) {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    const parsed = parseJsonModelOutput(response, input.prompt.contract, z.unknown());
    return {
      action: "capture" as const,
      objects: Array.isArray(parsed) ? parsed : [parsed],
    };
  }
}

async function closeDatabaseRuntime(runtime: ModelMemoryDatabaseRuntime | undefined) {
  try {
    await runtime?.pool.end();
  } catch {
    /* best effort */
  }
}

export async function runCodexMemoryCaptureRuntimeHook(input: {
  cfg?: OpenClawConfig;
  cadence: CodexMemoryCaptureCadence;
  env?: NodeJS.ProcessEnv;
  projectId?: string;
  deps?: HookDeps;
}): Promise<CodexMemoryCaptureRuntimeHookReport> {
  const env = input.env ?? process.env;
  const cadence = input.cadence;
  const enabled = readBooleanEnv(env[CODEX_CAPTURE_ENABLED_ENV], true);
  const traces: CodexMemoryCaptureRuntimeHookReport["traces"] = [];
  const statePath = resolveStatePath(env);
  if (!enabled) {
    return {
      status: "disabled",
      cadence,
      reason: "codex_memory_capture_disabled",
      statePath,
      traces,
    };
  }

  const nowMs = input.deps?.nowMs?.() ?? Date.now();
  const state = await readHookState(statePath);
  let runtime: ModelMemoryDatabaseRuntime | undefined;
  try {
    const createRuntime = input.deps?.createDatabaseRuntime ?? createModelMemoryDatabaseRuntime;
    runtime = await createRuntime({ config: input.cfg, env });
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: input.cfg,
      requestTimeoutMs: readPositiveInteger(
        env[CODEX_CAPTURE_TIMEOUT_MS_ENV],
        DEFAULT_CODEX_CAPTURE_TIMEOUT_MS,
      ),
      onTrace(trace) {
        traces.push({
          contractName: trace.contractName,
          contractVersion: trace.contractVersion,
          requestedModelId: trace.requestedModelId,
          resolvedModelId: trace.resolvedModelId,
          provider: trace.provider,
          providerModel: trace.providerModel,
          responseOk: trace.responseOk,
          failureStage: trace.failureStage,
          failureClass: trace.failureClass,
          errorMessage: trace.errorMessage ? boundedErrorMessage(trace.errorMessage) : undefined,
        });
      },
    });
    const report = await (input.deps?.runCapture ?? runCodexSessionMemoryCapture)({
      canonicalRepository: runtime.canonicalRepository,
      runtimeRepository: runtime.runtimeRepository,
      interpreter: new CodexCaptureLiveInterpreter(executor),
      env,
      cadence,
      projectId:
        input.projectId ??
        env[CODEX_CAPTURE_PROJECT_ID_ENV]?.trim() ??
        env.OPENCLAW_PROJECT_ID?.trim() ??
        "openclaw",
      lastRunAtMs: state.lastRunAtMsByCadence[cadence],
      nowMs,
      rebuildRuntime: false,
      closeoutJobId: cadence === "closeout" ? `codex-capture-closeout-${nowMs}` : undefined,
    });
    if (report.status === "loaded" || report.status === "degraded") {
      state.lastRunAtMsByCadence[cadence] = nowMs;
      await writeHookState(statePath, state);
    }
    const hookReport = {
      status: report.status,
      cadence,
      reason: report.reason,
      statePath,
      report,
      traces,
    };
    if (report.status === "loaded") {
      log.info("codex memory capture hook completed", {
        cadence,
        attempted: report.activityCounts.attempted,
        writes: report.writeCounts.write + report.writeCounts.supersede,
        skipped: report.activityCounts.alreadyIngested,
      });
    } else {
      log.warn("codex memory capture hook degraded", {
        cadence,
        reason: report.reason,
        status: report.status,
      });
    }
    return hookReport;
  } catch (error) {
    const reason = boundedErrorMessage(error);
    log.warn("codex memory capture hook failed open", { cadence, reason });
    return {
      status: "degraded",
      cadence,
      reason,
      statePath,
      traces,
    };
  } finally {
    await closeDatabaseRuntime(runtime);
  }
}
