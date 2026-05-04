import { routeEvidenceFromDecision, selectModelRoute } from "../model-routing/policy.ts";
import type {
  AttachRuntimeJobArtifactInput,
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { classifyModelTaskFallback, type ModelTaskFallbackFailureKind } from "./fallback.ts";
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
    providerCallMade: false,
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

  async completeModelTask(input: CompleteModelTaskInput): Promise<RuntimeJob | null> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isModelTaskPayload(job.payload)) {
      throw new Error(`model task job not found: ${input.jobId}`);
    }
    const contract = this.registry.require(job.payload.contractId);
    const outputValidation = this.registry.validateOutput(contract.id, input.output);
    const routeEvidence = mergeRouteEvidence(job.payload.routeEvidence, input.routeEvidence);
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
