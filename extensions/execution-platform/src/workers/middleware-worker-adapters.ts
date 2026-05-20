import { DbOperationRepository } from "../db-operations/db-operation-repository.ts";
import {
  createDbOperationExecuteRuntimeToolExecutor,
  type DbOperationExecuteHandler,
} from "../db-operations/db-operation-runtime-tool.ts";
import { isDbOperationPayload } from "../db-operations/types.ts";
import { createDefaultModelTaskContractRegistry } from "../model-tasks/contracts.ts";
import { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import {
  isModelTaskPayload,
  modelTaskJobType,
  type ModelTaskContractId,
} from "../model-tasks/types.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { ScriptJobDefinitionRegistry } from "../script-jobs/registry.ts";
import { ScriptJobRepository } from "../script-jobs/script-job-repository.ts";
import {
  createScriptExecuteRuntimeToolExecutor,
  type ScriptExecuteHandler,
} from "../script-jobs/script-runtime-tool.ts";
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
    leaseId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    const payload = assertModelTaskPayload(input.job);
    const executed = await this.options.executor({
      job: input.job,
      payload,
      workerId: input.workerId,
    });
    const output = executed.output;
    const completed = await this.repository.completeModelTask({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output,
      routeEvidence: {
        providerCallMade: true,
        selectedModelRef: executed.modelRef ?? undefined,
        reason: "model task completed by runtime worker supervisor middleware adapter",
      },
    });
    if (completed?.state !== "succeeded") {
      return needsReviewResult({
        summary:
          "Model-task middleware worker did not produce model.call runtime tool trace evidence.",
        reasonCodes: ["model_task_middleware_runtime_tool_trace_required"],
      });
    }
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
      runtimeToolKernel: RuntimeToolKernel;
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
    leaseId: string;
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
    const definition = this.options.registry.requireScriptJobDefinition(payload.scriptId);
    const scriptHandler: ScriptExecuteHandler = async () => {
      const handled = await handler({ job: input.job, payload, workerId: input.workerId });
      return {
        output: handled.output,
        exitCode: handled.exitCode,
        validationEvidence: handled.validationEvidence,
        artifactRefs: handled.artifactRefs,
      };
    };
    const toolResult = await this.repository.invokeClaimedScriptJobRuntimeTool({
      claimed: {
        job: input.job,
        leaseId: input.leaseId,
        leaseToken: input.leaseToken,
        definition,
        script: payload,
      },
      kernel: this.options.runtimeToolKernel,
      executor: createScriptExecuteRuntimeToolExecutor({
        handlers: { [definition.handlerId]: scriptHandler },
      }),
      inputSummary: "Execute supervisor-claimed script job through script.execute runtime tool.",
    });
    if (
      toolResult.invocation.invocation.status !== "succeeded" ||
      (toolResult.exitCode ?? 0) !== 0
    ) {
      return needsReviewResult({
        summary: "Script middleware runtime tool did not produce accepted success evidence.",
        reasonCodes: ["script_middleware_runtime_tool_not_accepted"],
      });
    }
    await this.repository.completeScriptJob({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output: toolResult.output,
      exitCode: toolResult.exitCode,
      validationEvidence: toolResult.validationEvidence,
      runtimeToolTraceRequired: true,
    });
    const artifactRefs = [
      `runtime-job://${input.job.jobId}/script-job/definition`,
      `runtime-job://${input.job.jobId}/script-job/runtime-tool-trace`,
      toolResult.artifactRef,
    ];
    return completedResult({
      summary: "Script middleware worker completed through script.execute runtime tool.",
      reasonCodes: ["script_middleware_worker_completed", "script_execute_runtime_tool_required"],
      result: {
        family: "middleware_worker_adoption",
        middlewareKind: "script_job",
        scriptId: payload.scriptId,
        handlerId: payload.definitionSnapshot.handlerId,
        exitCode: toolResult.exitCode ?? null,
        runtimeToolInvocationRef: toolResult.invocation.invocationRef,
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
      runtimeToolKernel: RuntimeToolKernel;
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
    leaseId: string;
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
    const dbHandler: DbOperationExecuteHandler = async () => {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      const handled = await handler({ job: input.job, payload, workerId: input.workerId });
      const completedAt = new Date().toISOString();
      return {
        output: handled.output,
        telemetry: {
          telemetryId: `telemetry-${input.job.jobId}`,
          operationName: payload.operationName,
          operationKind: payload.operationKind,
          lane: payload.lane,
          decision: payload.classification.decision,
          outcome: "succeeded",
          timeoutBudgetMs: payload.classification.timeoutBudgetMs,
          durationMs: Math.max(0, Date.now() - startMs),
          startedAt,
          completedAt,
          pressureSnapshot: payload.pressureSnapshot,
          classification: payload.classification,
          jobId: input.job.jobId,
        },
        resultSummary: handled.summary,
      };
    };
    const toolResult = await this.repository.invokeClaimedDbOperationRuntimeTool({
      claimed: {
        job: input.job,
        leaseId: input.leaseId,
        leaseToken: input.leaseToken,
        operation: payload,
      },
      kernel: this.options.runtimeToolKernel,
      executor: createDbOperationExecuteRuntimeToolExecutor({
        handlers: { [payload.operationName]: dbHandler },
      }),
      inputSummary: "Execute supervisor-claimed DB operation through db_operation.execute.",
    });
    if (toolResult.invocation.invocation.status !== "succeeded" || !toolResult.telemetry) {
      return needsReviewResult({
        summary: "DB operation middleware runtime tool did not produce accepted success evidence.",
        reasonCodes: ["db_operation_middleware_runtime_tool_not_accepted"],
      });
    }
    await this.repository.completeLongDbOperation({
      jobId: input.job.jobId,
      leaseToken: input.leaseToken,
      output: toolResult.output,
      telemetry: toolResult.telemetry,
      runtimeToolTraceRequired: true,
    });
    const artifactRefs = [
      `runtime-job://${input.job.jobId}/db-operation/metadata`,
      `runtime-job://${input.job.jobId}/db-operation/runtime-tool-trace`,
      toolResult.artifactRef,
    ];
    return completedResult({
      summary:
        "DB operation middleware worker completed through db_operation.execute runtime tool.",
      reasonCodes: [
        "db_operation_middleware_worker_completed",
        "db_operation_execute_runtime_tool_required",
      ],
      result: {
        family: "middleware_worker_adoption",
        middlewareKind: "db_operation",
        operationName: payload.operationName,
        operationKind: payload.operationKind,
        lane: payload.lane,
        runtimeToolInvocationRef: toolResult.invocation.invocationRef,
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
