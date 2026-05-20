import type { JsonValue } from "../runtime-job-repository.ts";

export type LatestRunState = {
  artifactKind: "execution_platform_latest_run_state";
  schemaVersion: "execution-platform.latest-run-state.v1";
  generatedAt: string;
  runtimeJobId: string | null;
  workItemId: string | null;
  promptHash: string | null;
  promptRef: string | null;
  promptLength: number | null;
  process: {
    isRunning: boolean;
    terminalStatus: string | null;
    adapterTerminalStatus: string | null;
    retryState: string | null;
  };
  runtimeJob: {
    state: string | null;
    attempts: number | null;
    maxAttempts: number | null;
    workerId: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  current: {
    phase: string | null;
    schedulerPhase: string | null;
    stage: string | null;
    graphId: string | null;
    nodeId: string | null;
    roleId: string | null;
    modelRef: string | null;
    providerPath: string | null;
    objective: string | null;
    blockerSummary: string | null;
    nextAction: string | null;
    eli5: string | null;
  };
  latestReasonCodes: string[];
  latestArtifactRefs: string[];
  wallTime: {
    totalMs: number | null;
    byPhase: JsonValue;
  };
  modelUsage: {
    byModel: JsonValue;
    byPhase: JsonValue;
    missingUsageEventCount: number | null;
    usageUnavailableReasons: JsonValue;
  };
  recommendedOperatorAction: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

function bounded(value: unknown, max = 700): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function boundedStrings(value: unknown, max = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => item.trim().slice(0, 260))
        .slice(0, max)
    : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function jobString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return bounded(value, 260);
}

export function buildLatestRunState(input: {
  runtimeJobId?: string | null;
  workItemId?: string | null;
  promptHash?: string | null;
  promptRef?: string | null;
  promptLength?: number | null;
  processRunning?: boolean;
  terminalStatus?: string | null;
  adapterTerminalStatus?: string | null;
  retryState?: string | null;
  runtimeJob?: Record<string, unknown> | null;
  graphId?: string | null;
  latestProgress?: Record<string, unknown> | null;
  latestReasonCodes?: string[];
  latestArtifactRefs?: string[];
  totalWallMs?: number | null;
  phaseWallClock?: JsonValue;
  modelUsageByModel?: JsonValue;
  modelUsageByPhase?: JsonValue;
  missingUsageEventCount?: number | null;
  usageUnavailableReasons?: JsonValue;
  recommendedOperatorAction?: string | null;
  generatedAt?: string;
}): LatestRunState {
  const latest = input.latestProgress ?? {};
  const job = input.runtimeJob ?? {};
  return {
    artifactKind: "execution_platform_latest_run_state",
    schemaVersion: "execution-platform.latest-run-state.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runtimeJobId: bounded(input.runtimeJobId, 260),
    workItemId: bounded(input.workItemId, 260),
    promptHash: bounded(input.promptHash, 140),
    promptRef: bounded(input.promptRef, 260),
    promptLength: numberOrNull(input.promptLength),
    process: {
      isRunning: input.processRunning === true,
      terminalStatus: bounded(input.terminalStatus, 180),
      adapterTerminalStatus: bounded(input.adapterTerminalStatus, 180),
      retryState: bounded(input.retryState, 180),
    },
    runtimeJob: {
      state: bounded(job.state, 120),
      attempts: numberOrNull(job.attempts),
      maxAttempts: numberOrNull(job.maxAttempts ?? job.max_attempts),
      workerId: bounded(job.workerId ?? job.worker_id, 180),
      startedAt: jobString(job.startedAt ?? job.started_at),
      completedAt: jobString(job.completedAt ?? job.completed_at),
    },
    current: {
      phase: bounded(latest.currentPhase, 180),
      schedulerPhase: bounded(latest.schedulerPhase, 180),
      stage: bounded(latest.stage, 180),
      graphId: bounded(input.graphId, 260),
      nodeId: bounded(latest.nodeId, 260),
      roleId: bounded(latest.roleId, 180),
      modelRef: bounded(latest.modelRef, 240),
      providerPath: bounded(latest.providerPath, 240),
      objective: bounded(latest.objective ?? latest.currentObjective, 700),
      blockerSummary: bounded(latest.blockerSummary, 700),
      nextAction: bounded(latest.nextDecisionNeeded ?? latest.nextAction, 500),
      eli5: bounded(latest.eli5Progress ?? latest.eli5, 700),
    },
    latestReasonCodes: boundedStrings(input.latestReasonCodes ?? latest.reasonCodes, 40),
    latestArtifactRefs: boundedStrings(input.latestArtifactRefs ?? latest.artifactRefs, 40),
    wallTime: {
      totalMs: numberOrNull(input.totalWallMs),
      byPhase: input.phaseWallClock ?? [],
    },
    modelUsage: {
      byModel: input.modelUsageByModel ?? [],
      byPhase: input.modelUsageByPhase ?? [],
      missingUsageEventCount: numberOrNull(input.missingUsageEventCount),
      usageUnavailableReasons: input.usageUnavailableReasons ?? [],
    },
    recommendedOperatorAction: bounded(input.recommendedOperatorAction, 700),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
