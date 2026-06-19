import { randomUUID } from "node:crypto";
import { runTasksWithConcurrency } from "../utils/run-with-concurrency.js";
import {
  checkTaskExecutionReceipt,
  type TaskExecutionCheckResult,
} from "./task-execution-admission.js";
import type { TaskRecord, TaskStatus } from "./task-registry.types.js";

export const GBrainSignalDetectorCoverageCheckName = "gbrain.signal_detector.coverage" as const;
export type TaskExecutionCheckRunName = typeof GBrainSignalDetectorCoverageCheckName;

export const DefaultGBrainSignalCoverageAgents = [
  "main",
  "planning",
  "coding",
  "researcher",
  "reviewer",
  "operations",
  "business-ops",
] as const;

export type CheckStepStatus = "passed" | "failed" | "timed_out";
export type CheckRunStatus = "passed" | "failed";

export type ChatSubmitResult = {
  runId?: string;
  status?: string;
};

export type CheckStepFailure = {
  code: string;
  detail: string;
};

export type GBrainSignalCoverageCheckStep = {
  stepId: string;
  checkRunId: string;
  check: "gbrain.signal_detector";
  lane: string;
  status: CheckStepStatus;
  startedAt: string;
  endedAt: string;
  marker: string;
  sessionKey: string;
  idempotencyKey: string;
  submit?: ChatSubmitResult;
  taskId?: string;
  runId?: string;
  childSessionKey?: string;
  receipt?: TaskExecutionCheckResult["receipt"];
  result?: TaskExecutionCheckResult;
  failures: CheckStepFailure[];
};

export type GBrainSignalCoverageCheckRun = {
  checkRunId: string;
  check: typeof GBrainSignalDetectorCoverageCheckName;
  status: CheckRunStatus;
  startedAt: string;
  endedAt: string;
  agents: string[];
  concurrency: number;
  passedCount: number;
  failedCount: number;
  steps: GBrainSignalCoverageCheckStep[];
};

export type RunGBrainSignalDetectorCoverageCheckDeps = {
  submitChat: (params: {
    sessionKey: string;
    message: string;
    idempotencyKey: string;
  }) => Promise<ChatSubmitResult>;
  listTasks: () => Promise<TaskRecord[]>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  makeId?: () => string;
};

export type RunGBrainSignalDetectorCoverageCheckOptions = {
  checkRunId?: string;
  agents?: string[];
  submitTimeoutMs?: number;
  laneTimeoutMs?: number;
  pollIntervalMs?: number;
  concurrency?: number;
};

const DEFAULT_SUBMIT_TIMEOUT_MS = 15_000;
const DEFAULT_LANE_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_CHECK_RUN_CONCURRENCY = 3;
const DEFAULT_MAX_CONCURRENCY = 8;

const TERMINAL_STATUSES = new Set<TaskStatus>([
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "lost",
]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function normalizeAgents(agents: string[] | undefined): string[] {
  const source = agents && agents.length > 0 ? agents : [...DefaultGBrainSignalCoverageAgents];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of source) {
    const agent = raw.trim();
    if (!agent || seen.has(agent)) {
      continue;
    }
    seen.add(agent);
    normalized.push(agent);
  }
  return normalized;
}

function normalizeConcurrency(value: number | undefined, total: number): number {
  if (total <= 0) {
    return 1;
  }
  const parsed = Number.isFinite(value) ? Math.floor(value ?? 0) : 0;
  const requested =
    parsed > 0 ? Math.min(parsed, DEFAULT_MAX_CONCURRENCY) : DEFAULT_CHECK_RUN_CONCURRENCY;
  return Math.max(1, Math.min(total, requested));
}

function timeoutFailure(label: string, timeoutMs: number): CheckStepFailure {
  return {
    code: "timeout",
    detail: `${label} timed out after ${timeoutMs}ms`,
  };
}

async function withTimeout<T>(
  action: Promise<T>,
  params: { timeoutMs: number; label: string },
): Promise<{ ok: true; value: T } | { ok: false; failure: CheckStepFailure }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(params.label)), params.timeoutMs);
    });
    return { ok: true, value: await Promise.race([action, timeout]) };
  } catch {
    return { ok: false, failure: timeoutFailure(params.label, params.timeoutMs) };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function findMatchingSignalTask(tasks: TaskRecord[], marker: string): TaskRecord | undefined {
  return tasks
    .filter(
      (task) =>
        task.runtime === "subagent" &&
        task.label === "plugin:gbrain-context" &&
        typeof task.childSessionKey === "string" &&
        task.childSessionKey.includes(marker),
    )
    .toSorted((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

async function runCoverageStep(params: {
  checkRunId: string;
  lane: string;
  deps: RunGBrainSignalDetectorCoverageCheckDeps;
  submitTimeoutMs: number;
  laneTimeoutMs: number;
  pollIntervalMs: number;
}): Promise<GBrainSignalCoverageCheckStep> {
  const now = params.deps.now ?? Date.now;
  const sleep = params.deps.sleep ?? defaultSleep;
  const startedAtMs = now();
  const stepId = `${params.checkRunId}:${params.lane}`;
  const marker = `${params.checkRunId}-${params.lane}`;
  const sessionKey = `agent:${params.lane}:${marker}`;
  const idempotencyKey = marker;
  const base = {
    stepId,
    checkRunId: params.checkRunId,
    check: "gbrain.signal_detector" as const,
    lane: params.lane,
    startedAt: iso(startedAtMs),
    marker,
    sessionKey,
    idempotencyKey,
  };

  const submitResult = await withTimeout(
    params.deps.submitChat({
      sessionKey,
      idempotencyKey,
      message: `Native CheckRun ${params.checkRunId} proof for agent lane ${params.lane}. This is a source-attributed proof_event for the OpenClaw native single-flow execution check. Capture only durable proof-event memory needed to verify GBrain signal capture, route receipt, and source attribution. Do not store secrets, raw logs, credentials, or unrelated runtime payloads.`,
    }),
    { timeoutMs: params.submitTimeoutMs, label: "chat.send" },
  );

  if (!submitResult.ok) {
    return {
      ...base,
      status: "failed",
      endedAt: iso(now()),
      failures: [submitResult.failure],
    };
  }

  const deadline = startedAtMs + params.laneTimeoutMs;
  let lastTask: TaskRecord | undefined;
  let lastCheck: TaskExecutionCheckResult | undefined;
  while (now() < deadline) {
    const listResult = await withTimeout(params.deps.listTasks(), {
      timeoutMs: Math.min(params.pollIntervalMs, params.laneTimeoutMs),
      label: "tasks.list",
    });
    if (!listResult.ok) {
      return {
        ...base,
        status: "failed",
        endedAt: iso(now()),
        submit: submitResult.value,
        failures: [listResult.failure],
      };
    }
    lastTask = findMatchingSignalTask(listResult.value, marker) ?? lastTask;
    if (lastTask) {
      lastCheck = checkTaskExecutionReceipt({
        check: "gbrain.signal_detector",
        lookup: lastTask.taskId,
        task: lastTask,
      });
      if (lastCheck.passed) {
        return {
          ...base,
          status: "passed",
          endedAt: iso(now()),
          submit: submitResult.value,
          taskId: lastTask.taskId,
          ...(lastTask.runId ? { runId: lastTask.runId } : {}),
          ...(lastTask.childSessionKey ? { childSessionKey: lastTask.childSessionKey } : {}),
          ...(lastCheck.receipt ? { receipt: lastCheck.receipt } : {}),
          result: lastCheck,
          failures: [],
        };
      }
      if (
        TERMINAL_STATUSES.has(lastTask.status) &&
        lastTask.executionReceipt?.phase === "finalized"
      ) {
        return {
          ...base,
          status: "failed",
          endedAt: iso(now()),
          submit: submitResult.value,
          taskId: lastTask.taskId,
          ...(lastTask.runId ? { runId: lastTask.runId } : {}),
          ...(lastTask.childSessionKey ? { childSessionKey: lastTask.childSessionKey } : {}),
          ...(lastCheck.receipt ? { receipt: lastCheck.receipt } : {}),
          result: lastCheck,
          failures: lastCheck.failures,
        };
      }
    }
    await sleep(params.pollIntervalMs);
  }

  return {
    ...base,
    status: "timed_out",
    endedAt: iso(now()),
    submit: submitResult.value,
    ...(lastTask?.taskId ? { taskId: lastTask.taskId } : {}),
    ...(lastTask?.runId ? { runId: lastTask.runId } : {}),
    ...(lastTask?.childSessionKey ? { childSessionKey: lastTask.childSessionKey } : {}),
    ...(lastCheck ? { result: lastCheck } : {}),
    failures: [timeoutFailure("matching plugin:gbrain-context child task", params.laneTimeoutMs)],
  };
}

export async function runGBrainSignalDetectorCoverageCheck(
  deps: RunGBrainSignalDetectorCoverageCheckDeps,
  opts: RunGBrainSignalDetectorCoverageCheckOptions = {},
): Promise<GBrainSignalCoverageCheckRun> {
  const now = deps.now ?? Date.now;
  const makeId = deps.makeId ?? (() => `gbrain-signal-coverage-${Date.now()}-${randomUUID()}`);
  const startedAtMs = now();
  const checkRunId = opts.checkRunId?.trim() || makeId();
  const agents = normalizeAgents(opts.agents);
  const submitTimeoutMs = opts.submitTimeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS;
  const laneTimeoutMs = opts.laneTimeoutMs ?? DEFAULT_LANE_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const concurrency = normalizeConcurrency(opts.concurrency, agents.length);

  const stepResult = await runTasksWithConcurrency({
    tasks: agents.map(
      (lane) => async () =>
        runCoverageStep({
          checkRunId,
          lane,
          deps,
          submitTimeoutMs,
          laneTimeoutMs,
          pollIntervalMs,
        }),
    ),
    limit: concurrency,
    errorMode: "continue",
  });
  const steps = stepResult.results.filter((step): step is GBrainSignalCoverageCheckStep =>
    Boolean(step),
  );

  const passedCount = steps.filter((step) => step.status === "passed").length;
  const failedCount = steps.length - passedCount;
  return {
    checkRunId,
    check: GBrainSignalDetectorCoverageCheckName,
    status: failedCount === 0 ? "passed" : "failed",
    startedAt: iso(startedAtMs),
    endedAt: iso(now()),
    agents,
    concurrency,
    passedCount,
    failedCount,
    steps,
  };
}
