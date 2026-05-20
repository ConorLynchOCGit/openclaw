import type {
  AttachRuntimeJobArtifactInput,
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolKernelInvokeResult } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolExecutor } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  DB_OPERATION_EXECUTE_RUNTIME_TOOL_ID,
  dbOperationExecuteMetadataFromResult,
  type DbOperationExecuteVolatileInput,
} from "./db-operation-runtime-tool.ts";
import { classifyDbOperation } from "./policy.ts";
import type { DbOperationTelemetryRepository } from "./telemetry.ts";
import {
  dbOperationJobType,
  isDbOperationPayload,
  isDbOperationResult,
  type ClaimedDbOperation,
  type DbOperationKind,
  type DbOperationLane,
  type DbOperationPayload,
  type DbOperationResult,
  type DbOperationStatus,
  type DbOperationTelemetry,
  type DbOperationTimeoutPolicy,
  type DbPoolPressureSnapshot,
} from "./types.ts";

export type EnqueueLongDbOperationInput = {
  jobId?: string;
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  params?: JsonValue;
  queueName?: string;
  priority?: number;
  idempotencyKey?: string;
  parentJobId?: string | null;
  parentWorkflowId?: string | null;
  workItemId?: string | null;
  maxAttempts?: number;
  leaseTimeoutMs?: number;
  runTimeoutMs?: number;
  estimatedDurationMs?: number;
  pressureSnapshot?: DbPoolPressureSnapshot;
};

export type CompleteLongDbOperationInput = {
  jobId: string;
  leaseToken: string;
  output?: JsonValue;
  telemetry?: DbOperationTelemetry;
  runtimeToolTraceRequired?: boolean;
};

export type FailLongDbOperationInput = {
  jobId: string;
  leaseToken: string;
  code: string;
  message: string;
  retryDelayMs?: number;
  telemetry?: DbOperationTelemetry;
  evidence?: JsonValue;
};

export type InvokeClaimedDbOperationRuntimeToolInput = {
  claimed: ClaimedDbOperation;
  kernel: RuntimeToolKernel;
  executor?: RuntimeToolExecutor;
  inputSummary: string;
  idempotencyKey?: string;
  volatileInput?: Partial<DbOperationExecuteVolatileInput>;
};

export type InvokeClaimedDbOperationRuntimeToolResult = {
  invocation: RuntimeToolKernelInvokeResult;
  output: JsonValue;
  telemetry: DbOperationTelemetry | undefined;
  artifactRef: string;
  rawRowsStored: false;
  rawDbRowsStored: false;
};

export type DbOperationRepositoryOptions = {
  telemetry?: DbOperationTelemetryRepository;
  policy?: DbOperationTimeoutPolicy;
};

function metadataArtifact(jobId: string, metadata: JsonValue): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "db_operation.metadata",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/db-operation/metadata`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  };
}

function runtimeToolTraceArtifact(
  jobId: string,
  metadata: JsonValue,
): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "db_operation.runtime_tool_trace",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/db-operation/runtime-tool-trace`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  };
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRuntimeToolTraceEvidence(artifacts: RuntimeJobArtifact[]): boolean {
  return artifacts.some((artifact) => {
    if (artifact.artifactType !== "db_operation.runtime_tool_trace") {
      return false;
    }
    const metadata = artifact.metadata;
    if (!isRecord(metadata)) {
      return false;
    }
    const invocationRef = metadata.invocationRef;
    return typeof invocationRef === "string" && invocationRef.startsWith("runtime-tool://");
  });
}

export class DbOperationRepository {
  private readonly knownOperationNames = new Set<string>();

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly options: DbOperationRepositoryOptions = {},
  ) {}

  async enqueueLongDbOperation(input: EnqueueLongDbOperationInput): Promise<RuntimeJob> {
    const classification = classifyDbOperation({
      operationKind: input.operationKind,
      lane: input.lane,
      estimatedDurationMs: input.estimatedDurationMs,
      pressureSnapshot: input.pressureSnapshot,
      policy: this.options.policy,
    });
    if (classification.decision === "rejected" || classification.decision === "deferred") {
      throw new Error(
        `db operation cannot be enqueued while ${classification.decision}: ${classification.reason}`,
      );
    }
    const payload: DbOperationPayload = {
      family: "db_operation",
      operationName: input.operationName,
      operationKind: input.operationKind,
      lane: input.lane,
      params: input.params ?? {},
      classification,
      pressureSnapshot: input.pressureSnapshot,
    };
    const job = await this.runtimeJobs.enqueueJob({
      jobId: input.jobId,
      jobType: dbOperationJobType(input.operationName),
      queueName: input.queueName,
      priority: input.priority,
      payload,
      idempotencyScope: `db_operation:${input.operationName}`,
      idempotencyKey: input.idempotencyKey,
      parentJobId: input.parentJobId,
      parentWorkflowId: input.parentWorkflowId,
      workItemId: input.workItemId,
      maxAttempts: input.maxAttempts,
      leaseTimeoutMs: input.leaseTimeoutMs,
      runTimeoutMs: input.runTimeoutMs,
    });
    this.knownOperationNames.add(input.operationName);
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "db_operation.enqueued",
      data: {
        operationName: input.operationName,
        operationKind: input.operationKind,
        lane: input.lane,
        classification,
      },
    });
    await this.runtimeJobs.attachArtifact(metadataArtifact(job.jobId, payload));
    return job;
  }

  async claimLongDbOperation(input: {
    workerId: string;
    queueName?: string;
    operationNames?: string[];
  }): Promise<ClaimedDbOperation | null> {
    const operationNames = input.operationNames ?? Array.from(this.knownOperationNames);
    if (operationNames.length === 0) {
      return null;
    }
    const claimed = await this.runtimeJobs.claimNextJob({
      workerId: input.workerId,
      queueName: input.queueName,
      jobTypes: operationNames.map(dbOperationJobType),
    });
    if (!claimed) {
      return null;
    }
    if (!isDbOperationPayload(claimed.job.payload)) {
      throw new Error(`claimed runtime job is not a db operation: ${claimed.job.jobId}`);
    }
    return {
      ...claimed,
      operation: claimed.job.payload,
    };
  }

  async completeLongDbOperation(input: CompleteLongDbOperationInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isDbOperationPayload(job.payload)) {
      throw new Error(`db operation job not found: ${input.jobId}`);
    }
    if (input.runtimeToolTraceRequired) {
      const artifacts = await this.runtimeJobs.listArtifacts(job.jobId);
      if (!hasRuntimeToolTraceEvidence(artifacts)) {
        return this.failLongDbOperation({
          jobId: input.jobId,
          leaseToken: input.leaseToken,
          code: "db_operation_runtime_tool_trace_missing",
          message:
            "DB operation completion requires db_operation.execute runtime tool trace evidence",
          evidence: {
            operationName: job.payload.operationName,
            runtimeToolTraceRequired: true,
          },
        });
      }
    }
    const result: DbOperationResult = {
      family: "db_operation",
      operationName: job.payload.operationName,
      operationKind: job.payload.operationKind,
      lane: job.payload.lane,
      output: input.output ?? {},
      telemetry: input.telemetry,
    };
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "db_operation.completed",
      data: {
        operationName: job.payload.operationName,
        telemetry: input.telemetry ?? null,
      },
    });
    if (input.telemetry) {
      this.options.telemetry?.recordDbOperationTelemetry({
        ...input.telemetry,
        jobId: input.jobId,
      });
    }
    return this.runtimeJobs.completeJob({
      leaseToken: input.leaseToken,
      result,
    });
  }

  async invokeClaimedDbOperationRuntimeTool(
    input: InvokeClaimedDbOperationRuntimeToolInput,
  ): Promise<InvokeClaimedDbOperationRuntimeToolResult> {
    const job = input.claimed.job;
    if (!isDbOperationPayload(job.payload)) {
      throw new Error(`claimed runtime job is not a db operation: ${job.jobId}`);
    }
    const invokeInput = {
      toolId: DB_OPERATION_EXECUTE_RUNTIME_TOOL_ID,
      runtimeJobId: job.jobId,
      roleRef: `db_operation:${job.payload.operationName}`,
      idempotencyScope: `db_operation:${job.payload.operationName}:db-operation-execute`,
      idempotencyKey: input.idempotencyKey ?? `${job.jobId}:db-operation-execute`,
      inputSummary: input.inputSummary,
      volatileInput: {
        operation: job.payload,
        ...input.volatileInput,
      },
      budget: {
        timeoutMs: job.payload.classification.timeoutBudgetMs,
        metadata: {
          operationName: job.payload.operationName,
          operationKind: job.payload.operationKind,
          lane: job.payload.lane,
          rawRowsStored: false,
          rawDbRowsStored: false,
        },
      },
      metadata: {
        operationName: job.payload.operationName,
        operationKind: job.payload.operationKind,
        lane: job.payload.lane,
        rawRowsStored: false,
        rawDbRowsStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      runtimeLifecycleMutated: false,
    } as const;
    const invocation = input.executor
      ? await input.kernel.invokeWithExecutor(invokeInput, input.executor)
      : await input.kernel.invoke(invokeInput);
    const metadata = dbOperationExecuteMetadataFromResult(invocation.result);
    const artifactRef = `runtime-job://${job.jobId}/db-operation/runtime-tool-trace`;
    await this.runtimeJobs.attachArtifact(
      runtimeToolTraceArtifact(job.jobId, {
        invocationRef: invocation.invocationRef,
        invocationId: invocation.invocation.invocationId,
        toolId: invocation.invocation.toolId,
        toolFamily: invocation.invocation.toolFamily,
        status: invocation.invocation.status,
        operationName: job.payload.operationName,
        operationKind: job.payload.operationKind,
        lane: job.payload.lane,
        decision: metadata?.decision ?? job.payload.classification.decision,
        outcome: metadata?.outcome ?? invocation.invocation.status,
        timeoutBudgetMs: metadata?.timeoutBudgetMs ?? job.payload.classification.timeoutBudgetMs,
        durationMs: metadata?.durationMs ?? null,
        rowCount: metadata?.rowCount ?? null,
        resultHash: metadata?.resultHash ?? invocation.invocation.outputHash,
        telemetryRef: metadata?.telemetryRef ?? null,
        reasonCodes: invocation.reasonCodes,
        rawRowsStored: false,
        rawDbRowsStored: false,
      }),
    );
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "db_operation.runtime_tool_invoked",
      data: {
        operationName: job.payload.operationName,
        invocationRef: invocation.invocationRef,
        status: invocation.invocation.status,
        rawRowsStored: false,
        rawDbRowsStored: false,
      },
    });
    return {
      invocation,
      output: (metadata?.output as JsonValue | undefined) ?? {},
      telemetry: metadata?.telemetry as DbOperationTelemetry | undefined,
      artifactRef,
      rawRowsStored: false,
      rawDbRowsStored: false,
    };
  }

  async failLongDbOperation(input: FailLongDbOperationInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isDbOperationPayload(job.payload)) {
      throw new Error(`db operation job not found: ${input.jobId}`);
    }
    const error = {
      code: input.code,
      message: input.message,
      operationName: job.payload.operationName,
      telemetry: input.telemetry ?? null,
      evidence: input.evidence ?? null,
    };
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "db_operation.failed",
      data: error,
    });
    if (input.telemetry) {
      this.options.telemetry?.recordDbOperationTelemetry({
        ...input.telemetry,
        jobId: input.jobId,
      });
    }
    return this.runtimeJobs.failJob({
      leaseToken: input.leaseToken,
      error,
      retryDelayMs: input.retryDelayMs,
    });
  }

  async readDbOperationStatus(jobId: string): Promise<
    DbOperationStatus & {
      evidence: {
        events: RuntimeJobEvent[];
        artifacts: RuntimeJobArtifact[];
      };
    }
  > {
    const job = await this.runtimeJobs.getJob(jobId);
    return {
      job,
      operation: job && isDbOperationPayload(job.payload) ? job.payload : null,
      result: job && isDbOperationResult(job.result) ? job.result : null,
      telemetry: this.options.telemetry?.readRecentDbOperationTelemetry({ jobId }) ?? [],
      evidence: {
        events: await this.runtimeJobs.listEvents(jobId),
        artifacts: await this.runtimeJobs.listArtifacts(jobId),
      },
    };
  }
}
