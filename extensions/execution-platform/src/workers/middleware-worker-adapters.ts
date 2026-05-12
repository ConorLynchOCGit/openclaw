import { DbOperationRepository } from "../db-operations/db-operation-repository.ts";
import { isDbOperationPayload } from "../db-operations/types.ts";
import { createDefaultModelTaskContractRegistry } from "../model-tasks/contracts.ts";
import { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import {
  isModelTaskPayload,
  modelTaskJobType,
  type ModelTaskContractId,
} from "../model-tasks/types.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { ScriptJobDefinitionRegistry } from "../script-jobs/registry.ts";
import { ScriptJobRepository } from "../script-jobs/script-job-repository.ts";
import { isScriptJobPayload, type ScriptJobResult } from "../script-jobs/types.ts";
import type {
  RuntimeWorkerSupervisorAdapter,
  RuntimeWorkerSupervisorAdapterResult,
} from "./runtime-worker-supervisor.ts";

export const MODEL_TASK_MIDDLEWARE_WORKER_ADAPTER_ID = "worker.middleware.model-task";
export const SCRIPT_MIDDLEWARE_WORKER_ADAPTER_ID = "worker.middleware.script-job";
export const DB_OPERATION_MIDDLEWARE_WORKER_ADAPTER_ID = "worker.middleware.db-operation";

export type MiddlewareModelTaskExecutor = (input: {
  job: RuntimeJob;
  payload: ReturnType<typeof assertModelTaskPayload>;
  workerId: string;
}) => Promise<{
  output: JsonValue;
  modelRef?: string | null;
  modelRunRef?: string | null;
  artifactRefs?: string[];
  summary?: string;
}>;

export type MiddlewareScriptHandler = (input: {
  job: RuntimeJob;
  payload: ReturnType<typeof assertScriptJobPayload>;
  workerId: string;
}) => Promise<{
  output?: JsonValue;
  exitCode?: number;
  validationEvidence?: ScriptJobResult["validationEvidence"];
  artifactRefs?: string[];
  summary?: string;
}>;

export type MiddlewareDbOperationHandler = (input: {
  job: RuntimeJob;
  payload: ReturnType<typeof assertDbOperationPayload>;
  workerId: string;
}) => Promise<{
  output?: JsonValue;
  artifactRefs?: string[];
  summary?: string;
}>;

export class ModelTaskMiddlewareWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId = MODEL_TASK_MIDDLEWARE_WORKER_ADAPTER_ID;
  readonly jobTypes: string[];
  private readonly repository: ModelTaskRepository;

  constructor(
    private readonly options: {
      runtimeJobs: RuntimeJobRepository;
      executor: MiddlewareModelTaskExecutor;
      contractIds?: ModelTaskContractId[];
    },
  ) {
    const registry = createDefaultModelTaskContractRegistry();
    this.repository = new ModelTaskRepository(options.runtimeJobs, { registry });
    this.jobTypes = (options.contractIds ?? registry.list().map((contract) => contract.id)).map(
      modelTaskJobType,
    );
  }

  canHandle(job: RuntimeJob): boolean {
    return isModelTaskPayload(job.payload) && this.jobTypes.includes(job.jobType);
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    const payload = assertModelTaskPayload(input.job);
    const executed = await this.options.executor({
      job: input.job,
      payload,
      workerId: input.workerId,
    });
    const output = executed.output;
    await this.repository.completeModelTask({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output,
      routeEvidence: {
        providerCallMade: true,
        selectedModelRef: executed.modelRef ?? undefined,
        reason: "model task completed by runtime worker supervisor middleware adapter",
      },
    });
    const artifactRefs = [
      `runtime-job://${input.job.jobId}/model-task/validation`,
      ...(executed.artifactRefs ?? []),
      ...(executed.modelRunRef ? [executed.modelRunRef] : []),
    ];
    return completedResult({
      summary: executed.summary ?? "Model-task middleware worker completed through supervisor.",
      reasonCodes: ["model_task_middleware_worker_completed"],
      result: {
        family: "middleware_worker_adoption",
        middlewareKind: "model_task",
        contractId: payload.contractId,
        modelRef: executed.modelRef ?? null,
        modelRunRef: executed.modelRunRef ?? null,
        artifactRefs: artifactRefs.slice(0, 30),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      artifactRefs,
    });
  }
}

export class ScriptMiddlewareWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId = SCRIPT_MIDDLEWARE_WORKER_ADAPTER_ID;
  readonly jobTypes: string[];
  private readonly repository: ScriptJobRepository;

  constructor(
    private readonly options: {
      runtimeJobs: RuntimeJobRepository;
      registry: ScriptJobDefinitionRegistry;
      handlers: Record<string, MiddlewareScriptHandler>;
    },
  ) {
    this.repository = new ScriptJobRepository(options.runtimeJobs, { registry: options.registry });
    this.jobTypes = options.registry
      .listScriptJobDefinitions()
      .map((definition) => `script_job.${definition.scriptId}`);
  }

  canHandle(job: RuntimeJob): boolean {
    return isScriptJobPayload(job.payload) && this.jobTypes.includes(job.jobType);
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    const payload = assertScriptJobPayload(input.job);
    if (hasCommandShapedFields(payload.input)) {
      return needsReviewResult({
        summary: "Script middleware rejected command-shaped payload fields.",
        reasonCodes: ["script_middleware_arbitrary_command_payload_rejected"],
      });
    }
    const handler = this.options.handlers[payload.definitionSnapshot.handlerId];
    if (!handler) {
      return needsReviewResult({
        summary: "Script middleware handler is not registered.",
        reasonCodes: ["script_middleware_handler_not_registered"],
      });
    }
    const handled = await handler({ job: input.job, payload, workerId: input.workerId });
    await this.repository.completeScriptJob({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output: handled.output,
      exitCode: handled.exitCode,
      validationEvidence: handled.validationEvidence,
    });
    const artifactRefs = [
      `runtime-job://${input.job.jobId}/script-job/definition`,
      ...(handled.artifactRefs ?? []),
    ];
    return completedResult({
      summary: handled.summary ?? "Script middleware worker completed allowlisted handler.",
      reasonCodes: ["script_middleware_worker_completed"],
      result: {
        family: "middleware_worker_adoption",
        middlewareKind: "script_job",
        scriptId: payload.scriptId,
        handlerId: payload.definitionSnapshot.handlerId,
        exitCode: handled.exitCode ?? null,
        artifactRefs: artifactRefs.slice(0, 30),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      artifactRefs,
    });
  }
}

export class DbOperationMiddlewareWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId = DB_OPERATION_MIDDLEWARE_WORKER_ADAPTER_ID;
  readonly jobTypes: string[];
  private readonly repository: DbOperationRepository;

  constructor(
    private readonly options: {
      runtimeJobs: RuntimeJobRepository;
      operationNames: string[];
      handlers: Record<string, MiddlewareDbOperationHandler>;
      dbBoundaryAccepted: boolean;
    },
  ) {
    this.repository = new DbOperationRepository(options.runtimeJobs);
    this.jobTypes = options.operationNames.map((operationName) => `db_operation.${operationName}`);
  }

  canHandle(job: RuntimeJob): boolean {
    return isDbOperationPayload(job.payload) && this.jobTypes.includes(job.jobType);
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    const payload = assertDbOperationPayload(input.job);
    if (!this.options.dbBoundaryAccepted) {
      return needsReviewResult({
        summary: "DB operation middleware blocked because runtime DB boundary is not accepted.",
        reasonCodes: ["db_operation_middleware_boundary_not_accepted"],
      });
    }
    const handler = this.options.handlers[payload.operationName];
    if (!handler) {
      return needsReviewResult({
        summary: "DB operation middleware handler is not registered.",
        reasonCodes: ["db_operation_middleware_handler_not_registered"],
      });
    }
    const handled = await handler({ job: input.job, payload, workerId: input.workerId });
    await this.repository.completeLongDbOperation({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output: handled.output,
    });
    const artifactRefs = [
      `runtime-job://${input.job.jobId}/db-operation/metadata`,
      ...(handled.artifactRefs ?? []),
    ];
    return completedResult({
      summary: handled.summary ?? "DB operation middleware worker completed approved operation.",
      reasonCodes: ["db_operation_middleware_worker_completed"],
      result: {
        family: "middleware_worker_adoption",
        middlewareKind: "db_operation",
        operationName: payload.operationName,
        operationKind: payload.operationKind,
        lane: payload.lane,
        artifactRefs: artifactRefs.slice(0, 30),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      artifactRefs,
    });
  }
}

function assertModelTaskPayload(job: RuntimeJob) {
  if (!isModelTaskPayload(job.payload)) {
    throw new Error(`runtime job is not a model task: ${job.jobId}`);
  }
  return job.payload;
}

function assertScriptJobPayload(job: RuntimeJob) {
  if (!isScriptJobPayload(job.payload)) {
    throw new Error(`runtime job is not a script job: ${job.jobId}`);
  }
  return job.payload;
}

function assertDbOperationPayload(job: RuntimeJob) {
  if (!isDbOperationPayload(job.payload)) {
    throw new Error(`runtime job is not a db operation: ${job.jobId}`);
  }
  return job.payload;
}

function hasCommandShapedFields(value: JsonValue): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const forbidden = new Set([
    "command",
    "commands",
    "shellCommand",
    "shellCommands",
    "rawCommand",
    "rawCommands",
    "exec",
    "spawn",
  ]);
  return Object.keys(value).some((key) => forbidden.has(key));
}

function completedResult(input: {
  summary: string;
  reasonCodes: string[];
  result: JsonValue;
  artifactRefs: string[];
}): RuntimeWorkerSupervisorAdapterResult {
  return {
    status: "completed",
    summary: input.summary,
    result: input.result,
    artifactRefs: input.artifactRefs.slice(0, 30),
    completedWorkEvidenceRefs: input.artifactRefs.slice(0, 30),
    reasonCodes: input.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function needsReviewResult(input: {
  summary: string;
  reasonCodes: string[];
}): RuntimeWorkerSupervisorAdapterResult {
  return {
    status: "needs_review",
    summary: input.summary,
    reasonCodes: input.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
