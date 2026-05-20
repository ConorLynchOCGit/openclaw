import { routeEvidenceFromDecision, selectModelRoute } from "../model-routing/policy.ts";
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
import { classifyModelTaskFallback, type ModelTaskFallbackFailureKind } from "./fallback.ts";
import {
  MODEL_CALL_RUNTIME_TOOL_ID,
  modelCallMetadataFromResult,
  structuredOutputFromModelCallResult,
  type ModelCallVolatileInput,
} from "./model-call-runtime-tool.ts";
import { ModelTaskContractRegistry } from "./registry.ts";
import {
  isModelTaskPayload,
  isModelTaskResult,
  modelTaskJobType,
  type ClaimedModelTask,
  type ModelTaskContractId,
  type ModelTaskPayload,
  type ModelTaskResult,
  type ModelTaskRouteEvidence,
} from "./types.ts";

export type EnqueueModelTaskInput = {
  jobId?: string;
  contractId: ModelTaskContractId;
  input: JsonValue;
  queueName?: string;
  priority?: number;
  idempotencyKey?: string;
  parentJobId?: string | null;
  parentWorkflowId?: string | null;
  workItemId?: string | null;
  routeEvidence?: Partial<ModelTaskRouteEvidence>;
};

export type CompleteModelTaskInput = {
  jobId: string;
  leaseToken: string;
  output: JsonValue;
  routeEvidence?: Partial<ModelTaskRouteEvidence>;
  scorecard?: ModelTaskResult["scorecard"];
};

export type FailModelTaskInput = {
  jobId: string;
  leaseToken: string;
  failureKind: ModelTaskFallbackFailureKind;
  message: string;
  evidence?: JsonValue;
  retryDelayMs?: number;
};

export type InvokeClaimedModelTaskRuntimeToolInput = {
  claimed: ClaimedModelTask;
  kernel: RuntimeToolKernel;
  modelId: string;
  providerRef?: string | null;
  volatileInput: Omit<ModelCallVolatileInput, "contract"> & {
    contract?: ModelCallVolatileInput["contract"];
  };
  inputSummary: string;
  idempotencyKey?: string;
  maxStructuredOutputBytes?: number;
};

export type InvokeClaimedModelTaskRuntimeToolResult = {
  invocation: RuntimeToolKernelInvokeResult;
  structuredOutput: JsonValue | null;
  modelRef: string | null;
  responseHash: string | null;
  usage: {
    promptTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  } | null;
  artifactRef: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelTaskRepositoryOptions = {
  registry?: ModelTaskContractRegistry;
};

function mergeRouteEvidence(
  base: ModelTaskRouteEvidence,
  override: Partial<ModelTaskRouteEvidence> | undefined,
): ModelTaskRouteEvidence {
  return {
    ...base,
    ...override,
    providerCallMade: override?.providerCallMade ?? base.providerCallMade ?? false,
    fallbackChain: override?.fallbackChain ?? base.fallbackChain,
  };
}

function routeEvidenceArtifact(jobId: string, metadata: JsonValue): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "model_task.route_evidence",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/model-task/route-evidence`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  };
}

function validationArtifact(jobId: string, metadata: JsonValue): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "model_task.validation",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/model-task/validation`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  };
}

function fallbackArtifact(jobId: string, metadata: JsonValue): AttachRuntimeJobArtifactInput {
  return {
    jobId,
    artifactType: "model_task.fallback_classification",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/model-task/fallback-classification`,
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
    artifactType: "model_task.runtime_tool_trace",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/model-task/runtime-tool-trace`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    metadata,
  };
}

function isObjectRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRuntimeToolTraceEvidence(artifacts: RuntimeJobArtifact[]): boolean {
  return artifacts.some((artifact) => {
    if (artifact.artifactType !== "model_task.runtime_tool_trace") {
      return false;
    }
    const metadata = artifact.metadata;
    if (!isObjectRecord(metadata)) {
      return false;
    }
    const invocationRef = metadata.invocationRef;
    return typeof invocationRef === "string" && invocationRef.startsWith("runtime-tool://");
  });
}

export class ModelTaskRepository {
  private readonly registry: ModelTaskContractRegistry;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: ModelTaskRepositoryOptions = {},
  ) {
    this.registry = options.registry ?? new ModelTaskContractRegistry();
  }

  getContract(contractId: ModelTaskContractId) {
    return this.registry.get(contractId);
  }

  listContracts() {
    return this.registry.list();
  }

  validateTaskInput(contractId: ModelTaskContractId, input: JsonValue) {
    return this.registry.validateInput(contractId, input);
  }

  validateTaskOutput(contractId: ModelTaskContractId, output: JsonValue) {
    return this.registry.validateOutput(contractId, output);
  }

  async enqueueModelTask(input: EnqueueModelTaskInput): Promise<RuntimeJob> {
    const contract = this.registry.require(input.contractId);
    const inputValidation = this.registry.validateInput(input.contractId, input.input);
    if (!inputValidation.ok) {
      throw new Error(
        `model task input failed contract validation for ${input.contractId}: ${inputValidation.issues.join("; ")}`,
      );
    }
    const routeEvidence = mergeRouteEvidence(
      routeEvidenceFromDecision(
        selectModelRoute({
          contractId: contract.id,
          policy: contract.routePolicy,
        }),
      ),
      input.routeEvidence,
    );
    const payload: ModelTaskPayload = {
      family: "model_task",
      contractId: contract.id,
      input: input.input,
      routePolicy: contract.routePolicy,
      routeEvidence,
      validation: {
        input: inputValidation,
      },
      scorecard: contract.scorecard,
    };
    const job = await this.runtimeJobs.enqueueJob({
      jobId: input.jobId,
      jobType: modelTaskJobType(contract.id),
      queueName: input.queueName,
      priority: input.priority,
      payload,
      idempotencyScope: `model_task:${contract.id}`,
      idempotencyKey: input.idempotencyKey,
      parentJobId: input.parentJobId,
      parentWorkflowId: input.parentWorkflowId,
      workItemId: input.workItemId,
      maxAttempts: contract.routePolicy.maxAttempts,
      runTimeoutMs: contract.routePolicy.timeoutMs,
    });
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "model_task.enqueued",
      data: {
        contractId: contract.id,
        validation: inputValidation,
        routeEvidence,
      },
    });
    await this.runtimeJobs.attachArtifact(routeEvidenceArtifact(job.jobId, routeEvidence));
    return job;
  }

  async claimModelTask(input: {
    workerId: string;
    queueName?: string;
    contractIds?: ModelTaskContractId[];
  }): Promise<ClaimedModelTask | null> {
    const contractIds = input.contractIds ?? this.registry.list().map((contract) => contract.id);
    const claimed = await this.runtimeJobs.claimNextJob({
      workerId: input.workerId,
      queueName: input.queueName,
      jobTypes: contractIds.map(modelTaskJobType),
    });
    if (!claimed) {
      return null;
    }
    if (!isModelTaskPayload(claimed.job.payload)) {
      throw new Error(`claimed runtime job is not a model task: ${claimed.job.jobId}`);
    }
    const contract = this.registry.require(claimed.job.payload.contractId);
    return {
      ...claimed,
      contract,
      task: claimed.job.payload,
    };
  }

  async invokeClaimedModelTaskRuntimeTool(
    input: InvokeClaimedModelTaskRuntimeToolInput,
  ): Promise<InvokeClaimedModelTaskRuntimeToolResult> {
    const job = input.claimed.job;
    if (!isModelTaskPayload(job.payload)) {
      throw new Error(`claimed runtime job is not a model task: ${job.jobId}`);
    }
    const contract = this.registry.require(job.payload.contractId);
    const volatileInput: ModelCallVolatileInput = {
      ...input.volatileInput,
      contract: input.volatileInput.contract ?? {
        contractName: `execution_platform_model_task_${contract.id}`,
        contractVersion: "execution-platform.model-task-runtime-tool.v1",
        modelId: input.modelId,
      },
      parseJsonOutput: input.volatileInput.parseJsonOutput ?? true,
      maxStructuredOutputBytes:
        input.volatileInput.maxStructuredOutputBytes ?? input.maxStructuredOutputBytes ?? 24_000,
    };
    const invocation = await input.kernel.invoke({
      toolId: MODEL_CALL_RUNTIME_TOOL_ID,
      runtimeJobId: job.jobId,
      roleRef: `model_task:${contract.id}`,
      modelRef: input.modelId,
      providerRef: input.providerRef ?? job.payload.routeEvidence.selected?.provider ?? null,
      idempotencyScope: `model_task:${contract.id}:model-call`,
      idempotencyKey: input.idempotencyKey ?? `${job.jobId}:model-call`,
      inputSummary: input.inputSummary,
      volatileInput,
      budget: {
        timeoutMs: contract.routePolicy.timeoutMs,
        maxOutputTokens:
          typeof volatileInput.responseOptions?.maxOutputTokens === "number"
            ? volatileInput.responseOptions.maxOutputTokens
            : null,
        metadata: {
          contractId: contract.id,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      },
      metadata: {
        contractId: contract.id,
        modelTaskJobId: job.jobId,
        providerRef: input.providerRef ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
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
    });
    const metadata = modelCallMetadataFromResult(invocation.result);
    const artifactRef = `runtime-job://${job.jobId}/model-task/runtime-tool-trace`;
    await this.runtimeJobs.attachArtifact(
      runtimeToolTraceArtifact(job.jobId, {
        invocationRef: invocation.invocationRef,
        invocationId: invocation.invocation.invocationId,
        toolId: invocation.invocation.toolId,
        toolFamily: invocation.invocation.toolFamily,
        status: invocation.invocation.status,
        modelRef: metadata?.modelRef ?? input.modelId,
        providerRef: metadata?.providerRef ?? input.providerRef ?? null,
        responseHash: metadata?.responseHash ?? invocation.invocation.outputHash ?? null,
        usage: metadata?.usage ?? null,
        reasonCodes: invocation.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
      }),
    );
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "model_task.runtime_tool_invoked",
      data: {
        contractId: contract.id,
        invocationRef: invocation.invocationRef,
        toolId: invocation.invocation.toolId,
        status: invocation.invocation.status,
        modelRef: metadata?.modelRef ?? input.modelId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    return {
      invocation,
      structuredOutput: structuredOutputFromModelCallResult(invocation.result),
      modelRef: metadata?.modelRef ?? input.modelId,
      responseHash: metadata?.responseHash ?? invocation.invocation.outputHash,
      usage: metadata?.usage ?? null,
      artifactRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  async completeModelTask(input: CompleteModelTaskInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isModelTaskPayload(job.payload)) {
      throw new Error(`model task job not found: ${input.jobId}`);
    }
    const contract = this.registry.require(job.payload.contractId);
    const outputValidation = this.registry.validateOutput(contract.id, input.output);
    const routeEvidence = mergeRouteEvidence(job.payload.routeEvidence, input.routeEvidence);
    if (routeEvidence.providerCallMade) {
      const artifacts = await this.runtimeJobs.listArtifacts(job.jobId);
      if (!hasRuntimeToolTraceEvidence(artifacts)) {
        const fallback = classifyModelTaskFallback({
          failureKind: "transport_error",
          evidence: {
            reasonCode: "model_task_provider_call_missing_runtime_tool_trace",
            providerCallMade: true,
          },
        });
        await this.runtimeJobs.recordEvent({
          jobId: job.jobId,
          eventType: "model_task.provider_evidence_missing",
          data: {
            contractId: contract.id,
            routeEvidence,
            fallback,
          },
        });
        await this.runtimeJobs.attachArtifact(
          fallbackArtifact(job.jobId, {
            routeEvidence,
            fallback,
          }),
        );
        return this.runtimeJobs.failJob({
          leaseToken: input.leaseToken,
          error: {
            code: "model_task_provider_call_missing_runtime_tool_trace",
            contractId: contract.id,
            routeEvidence,
            fallback,
          },
        });
      }
    }
    if (!outputValidation.ok) {
      const fallback = classifyModelTaskFallback({
        failureKind: "schema_validation_failure",
        evidence: { validation: outputValidation },
      });
      await this.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "model_task.output_invalid",
        data: {
          contractId: contract.id,
          validation: outputValidation,
          fallback,
        },
      });
      await this.runtimeJobs.attachArtifact(
        fallbackArtifact(job.jobId, {
          validation: outputValidation,
          fallback,
        }),
      );
      return this.runtimeJobs.failJob({
        leaseToken: input.leaseToken,
        error: {
          code: "model_task_output_invalid",
          contractId: contract.id,
          validation: outputValidation,
          fallback,
        },
      });
    }
    const result: ModelTaskResult = {
      family: "model_task",
      contractId: contract.id,
      output: input.output,
      routeEvidence,
      validation: {
        output: outputValidation,
      },
      scorecard: input.scorecard ?? contract.scorecard,
    };
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "model_task.output_validated",
      data: {
        contractId: contract.id,
        validation: outputValidation,
        routeEvidence,
        scorecard: result.scorecard,
      },
    });
    await this.runtimeJobs.attachArtifact(
      validationArtifact(job.jobId, {
        input: job.payload.validation.input,
        output: outputValidation,
        routeEvidence,
        scorecard: result.scorecard,
      }),
    );
    return this.runtimeJobs.completeJob({
      leaseToken: input.leaseToken,
      result,
    });
  }

  async failModelTask(input: FailModelTaskInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isModelTaskPayload(job.payload)) {
      throw new Error(`model task job not found: ${input.jobId}`);
    }
    const fallback = classifyModelTaskFallback({
      failureKind: input.failureKind,
      evidence: input.evidence,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "model_task.failure_classified",
      data: {
        contractId: job.payload.contractId,
        message: input.message,
        fallback,
      },
    });
    await this.runtimeJobs.attachArtifact(
      fallbackArtifact(input.jobId, {
        message: input.message,
        fallback,
      }),
    );
    return this.runtimeJobs.failJob({
      leaseToken: input.leaseToken,
      error: {
        code: "model_task_failed",
        contractId: job.payload.contractId,
        message: input.message,
        fallback,
      },
      retryDelayMs: input.retryDelayMs,
    });
  }

  async readModelTaskStatus(jobId: string): Promise<{
    job: RuntimeJob | null;
    task: ModelTaskPayload | null;
    result: ModelTaskResult | null;
    evidence: {
      events: RuntimeJobEvent[];
      artifacts: RuntimeJobArtifact[];
    };
  }> {
    const job = await this.runtimeJobs.getJob(jobId);
    return {
      job,
      task: job && isModelTaskPayload(job.payload) ? job.payload : null,
      result: job && isModelTaskResult(job.result) ? job.result : null,
      evidence: {
        events: await this.runtimeJobs.listEvents(jobId),
        artifacts: await this.runtimeJobs.listArtifacts(jobId),
      },
    };
  }
}
