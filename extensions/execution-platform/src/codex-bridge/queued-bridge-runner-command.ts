import { createExecutionPlatformDatabaseRuntime } from "../db/runtime.ts";
import { RuntimeJobRepository, type JsonValue } from "../runtime-job-repository.ts";
import type {
  CodeWritingPilotLiveEntrypointRepository,
  RunCodeWritingPilotLiveInput,
} from "./code-writing-pilot-live-entrypoint.ts";
import { QueuedBridgeRunner, type QueuedBridgeRunOnceResult } from "./queued-bridge-runner.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

export type QueuedBridgeRunnerCommandRuntime = {
  runtimeJobs: RuntimeJobRepository;
  close?: () => Promise<void>;
  runtimeResolverSource?: string;
  runtimeLogicalDatabase?: string;
};

export type QueuedBridgeRunnerCommandInput = {
  workerId: string;
  queueName?: string;
  runtimeJobId?: string;
  dryRun?: boolean;
  runtime?: QueuedBridgeRunnerCommandRuntime;
  createRuntime?: () => Promise<QueuedBridgeRunnerCommandRuntime>;
  entrypoint?: Pick<CodeWritingPilotLiveEntrypointRepository, "runApprovedLivePilot">;
  buildLiveInput?: (jobId: string) => Promise<RunCodeWritingPilotLiveInput>;
};

export type QueuedBridgeRunnerCommandResult = {
  artifactKind: "codex_bridge_queued_runner_command_result";
  workerId: string;
  queueName: string;
  runtimeJobIdFilter: string | null;
  dryRun: boolean;
  eligibleRuntimeJobIds: string[];
  runOnceResult: QueuedBridgeRunOnceResult | null;
  runtimeResolverSource: string | null;
  runtimeLogicalDatabase: string | null;
  daemonStarted: false;
  schedulerStarted: false;
  workQueueLifecycleMutated: false;
};

export async function createSupabaseQueuedBridgeRunnerCommandRuntime(): Promise<QueuedBridgeRunnerCommandRuntime> {
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  return {
    runtimeJobs: new RuntimeJobRepository(runtime.sqlClient),
    runtimeResolverSource: runtime.resolution.source,
    runtimeLogicalDatabase: runtime.resolution.databaseName,
    close: async () => {
      await runtime.pool.end();
    },
  };
}

export async function runQueuedBridgeRunnerCommand(
  input: QueuedBridgeRunnerCommandInput,
): Promise<QueuedBridgeRunnerCommandResult> {
  const queueName = input.queueName ?? "executor";
  const runtime =
    input.runtime ??
    (await (input.createRuntime ?? createSupabaseQueuedBridgeRunnerCommandRuntime)());
  try {
    const recent = await runtime.runtimeJobs.listRecentJobs({
      queueName,
      states: ["pending"],
      jobTypes: [CODEX_BRIDGE_JOB_TYPE],
      limit: 50,
    });
    const eligible = recent
      .filter((job) => !input.runtimeJobId || job.jobId === input.runtimeJobId)
      .map((job) => job.jobId);

    if (input.dryRun) {
      return {
        artifactKind: "codex_bridge_queued_runner_command_result",
        workerId: input.workerId,
        queueName,
        runtimeJobIdFilter: input.runtimeJobId ?? null,
        dryRun: true,
        eligibleRuntimeJobIds: eligible,
        runOnceResult: null,
        runtimeResolverSource: runtime.runtimeResolverSource ?? null,
        runtimeLogicalDatabase: runtime.runtimeLogicalDatabase ?? null,
        daemonStarted: false,
        schedulerStarted: false,
        workQueueLifecycleMutated: false,
      };
    }

    if (!input.entrypoint || !input.buildLiveInput) {
      throw new Error("entrypoint and buildLiveInput are required for non-dry-run queue command");
    }
    if (input.runtimeJobId && eligible.length === 0) {
      throw new Error(`eligible bridge job not found: ${input.runtimeJobId}`);
    }

    const runner = new QueuedBridgeRunner({
      runtimeJobs: runtime.runtimeJobs,
      workerId: input.workerId,
      queueName,
      entrypoint: input.entrypoint,
      buildLiveInput: async (job) => {
        if (input.runtimeJobId && job.jobId !== input.runtimeJobId) {
          throw new Error(`claimed unexpected bridge job: ${job.jobId}`);
        }
        return input.buildLiveInput!(job.jobId);
      },
    });
    const runOnceResult = await runner.runOnce();
    await runtime.runtimeJobs
      .recordEvent({
        jobId: runOnceResult.runtimeJobId ?? eligible[0] ?? "unknown",
        eventType: "codex_bridge.queued_runner_command_finished",
        data: {
          workerId: input.workerId,
          dryRun: false,
          claimed: runOnceResult.claimed,
          completed: runOnceResult.completed,
        } as JsonValue,
      })
      .catch(() => undefined);

    return {
      artifactKind: "codex_bridge_queued_runner_command_result",
      workerId: input.workerId,
      queueName,
      runtimeJobIdFilter: input.runtimeJobId ?? null,
      dryRun: false,
      eligibleRuntimeJobIds: eligible,
      runOnceResult,
      runtimeResolverSource: runtime.runtimeResolverSource ?? null,
      runtimeLogicalDatabase: runtime.runtimeLogicalDatabase ?? null,
      daemonStarted: false,
      schedulerStarted: false,
      workQueueLifecycleMutated: false,
    };
  } finally {
    if (!input.runtime && runtime.close) {
      await runtime.close();
    }
  }
}
