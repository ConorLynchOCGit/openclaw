import { createHash } from "node:crypto";
import { DbOperationRepository } from "../../../../extensions/execution-platform/src/db-operations/db-operation-repository.ts";
import type {
  DbOperationKind,
  DbOperationLane,
} from "../../../../extensions/execution-platform/src/db-operations/types.ts";
import { createExecutionPlatformDatabaseRuntime } from "../../../../extensions/execution-platform/src/db/runtime.ts";
import { createDefaultModelTaskContractRegistry } from "../../../../extensions/execution-platform/src/model-tasks/contracts.ts";
import { ModelTaskRepository } from "../../../../extensions/execution-platform/src/model-tasks/model-task-repository.ts";
import type { ModelTaskContractId } from "../../../../extensions/execution-platform/src/model-tasks/types.ts";
import {
  RuntimeJobRepository,
  type JsonValue,
} from "../../../../extensions/execution-platform/src/runtime-job-repository.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../../../plugin-sdk/model-memory.js";

type ExecutionRuntimeHandle = {
  runtimeJobs: RuntimeJobRepository;
  modelTasks: ModelTaskRepository;
  dbOperations: DbOperationRepository;
};

let executionRuntimePromise: Promise<ExecutionRuntimeHandle> | undefined;

function isTruthy(value: string | undefined): boolean {
  return /^(?:1|true|yes|on)$/iu.test(value?.trim() ?? "");
}

function isTestRuntime(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VITEST ||
    env.VITEST_WORKER_ID ||
    env.VITEST_POOL_ID ||
    env.NODE_ENV === "test" ||
    env.npm_lifecycle_event === "test:file" ||
    process.argv.some((arg) => /\b(?:vitest|test-projects)\b/u.test(arg)),
  );
}

export function shouldUseModelMemoryRuntimeMiddleware(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isTruthy(env.OPENCLAW_MODEL_MEMORY_RUNTIME_MIDDLEWARE_DISABLED)) {
    return false;
  }
  if (isTestRuntime(env)) {
    return false;
  }
  return true;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value), "utf8")
    .digest("hex");
}

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function sanitizeContractName(value: string): string {
  return value
    .replace(/[^a-z0-9_.-]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64);
}

export function modelMemoryContractToModelTaskContractId(
  contractName: string,
): ModelTaskContractId {
  const normalized = contractName.toLowerCase();
  if (normalized.includes("retrieval_final_inclusion")) {
    return "retrieval.final_inclusion_review";
  }
  if (normalized.includes("retrieval_context_quality")) {
    return "retrieval.final_inclusion_review";
  }
  if (normalized.includes("retrieval_request")) {
    return "retrieval.request_interpretation";
  }
  if (normalized.includes("proactivity") && normalized.includes("merge")) {
    return "proactivity.merge_adjudication";
  }
  if (normalized.includes("proactivity")) {
    return "proactivity.opportunity_extraction";
  }
  if (normalized.includes("skillifier")) {
    return "skillifier.structured_json";
  }
  if (normalized.includes("opportunity_seed") || normalized.includes("closeout")) {
    return "closeout.opportunity_seed_extraction";
  }
  if (normalized.includes("memory") || normalized.includes("semantic")) {
    return "model_memory.capture_interpretation";
  }
  return "model_memory.structured_json";
}

async function executionRuntime(): Promise<ExecutionRuntimeHandle> {
  executionRuntimePromise ??= (async () => {
    const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    return {
      runtimeJobs,
      modelTasks: new ModelTaskRepository(runtimeJobs, {
        registry: createDefaultModelTaskContractRegistry(),
      }),
      dbOperations: new DbOperationRepository(runtimeJobs),
    };
  })();
  return executionRuntimePromise;
}

function boundedRequestMetadata(request: JsonModelExecutionRequest): JsonValue {
  return {
    contractName: request.contract.contractName,
    contractVersion: request.contract.contractVersion,
    modelRef: request.contract.modelId,
    systemPromptHash: sha256(request.systemPrompt),
    userPromptHash: sha256(request.userPrompt),
    responseFormat: request.responseFormat,
    responseOptions: request.responseOptions
      ? {
          transportType: request.responseOptions.transport?.type ?? null,
          transportName:
            request.responseOptions.transport?.type === "json_schema"
              ? request.responseOptions.transport.name
              : null,
          maxOutputTokens: request.responseOptions.maxOutputTokens ?? null,
          reasoningEffort: request.responseOptions.reasoningEffort ?? null,
          verbosity: request.responseOptions.verbosity ?? null,
        }
      : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export class RuntimeMiddlewareBackedJsonExecutor implements JsonModelExecutor {
  constructor(private readonly underlying: JsonModelExecutor) {}

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    if (!shouldUseModelMemoryRuntimeMiddleware()) {
      return this.underlying.execute(request);
    }
    const runtime = await executionRuntime();
    const contractId = modelMemoryContractToModelTaskContractId(request.contract.contractName);
    const requestHash = sha256({
      contract: request.contract,
      systemPromptHash: sha256(request.systemPrompt),
      userPromptHash: sha256(request.userPrompt),
      responseOptions: request.responseOptions ?? null,
    });
    const jobId = [
      "model-memory-runtime",
      sanitizeContractName(request.contract.contractName),
      requestHash.slice(0, 16),
      Date.now().toString(36),
    ].join("-");
    await runtime.modelTasks.enqueueModelTask({
      jobId,
      contractId,
      queueName: "model-task",
      idempotencyKey: `${contractId}:${requestHash}:${Date.now().toString(36)}`,
      input: {
        task: `Execute Model Memory ${request.contract.contractName} through model-task middleware.`,
        input: boundedRequestMetadata(request),
        constraints: [
          "No raw prompts, raw responses, transcripts, provider logs, tool logs, or secrets are persisted.",
          "Model Memory output cannot grant authority, mutate Work Queue lifecycle, deploy, send outbound, or promote models.",
        ],
      },
      routeEvidence: {
        providerCallMade: false,
        selectedModelRef: request.contract.modelId,
        reason: "model-memory live runtime enqueued model call through model-task middleware",
      },
    });
    const claimed = await runtime.runtimeJobs.claimNextJob({
      workerId: "model-memory-runtime-model-task-worker",
      queueName: "model-task",
      jobTypes: [`model_task.${contractId}`],
      runtimeJobId: jobId,
    });
    if (!claimed || claimed.job.jobId !== jobId) {
      throw new Error("model_memory_runtime_model_task_claim_failed");
    }
    const startedAt = Date.now();
    try {
      const response = await this.underlying.execute(request);
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const modelRef = response.resolvedModelId ?? request.contract.modelId;
      const evidenceRef = `runtime-job://${jobId}/model-memory/model-task-provider-evidence`;
      await runtime.runtimeJobs.attachArtifact({
        jobId,
        artifactType: "model_memory.model_task_provider_evidence",
        storageKind: "metadata",
        uri: evidenceRef,
        contentType: "application/json",
        metadata: {
          contractName: request.contract.contractName,
          modelRef,
          responseHash: sha256(response.outputText),
          latencyMs,
          usage: response.usage ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await runtime.modelTasks.completeModelTask({
        jobId,
        leaseToken: claimed.leaseToken,
        output: {
          result: {
            boundedOutputSummary: `Model Memory ${request.contract.contractName} completed through model-task middleware.`,
            responseHash: sha256(response.outputText),
            modelRef,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          confidence: "high",
          evidence: [evidenceRef],
        },
        routeEvidence: {
          providerCallMade: true,
          selectedModelRef: modelRef,
          reason: "model-memory runtime model-task middleware completed provider call",
        },
      });
      return response;
    } catch (error) {
      await runtime.modelTasks.failModelTask({
        jobId,
        leaseToken: claimed.leaseToken,
        failureKind: "provider_failure",
        message: String(error instanceof Error ? error.message : error).slice(0, 400),
        evidence: {
          contractName: request.contract.contractName,
          reasonCodes: ["model_memory_runtime_model_task_failed"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      throw error;
    }
  }
}

export function createRuntimeMiddlewareBackedJsonExecutor<T extends JsonModelExecutor>(
  executor: T,
): JsonModelExecutor {
  return shouldUseModelMemoryRuntimeMiddleware()
    ? new RuntimeMiddlewareBackedJsonExecutor(executor)
    : executor;
}

export async function recordModelMemoryRuntimeDbOperationEvidence(input: {
  operationName: string;
  operationKind: DbOperationKind;
  lane: DbOperationLane;
  boundedSummary: string;
  params?: JsonValue;
}): Promise<{ jobId: string; evidenceRef: string } | null> {
  if (!shouldUseModelMemoryRuntimeMiddleware()) {
    return null;
  }
  const runtime = await executionRuntime();
  const jobId = [
    "model-memory-db",
    sanitizeContractName(input.operationName),
    sha256({ operationName: input.operationName, params: input.params ?? null }).slice(0, 12),
    Date.now().toString(36),
  ].join("-");
  await runtime.dbOperations.enqueueLongDbOperation({
    jobId,
    operationName: input.operationName,
    operationKind: input.operationKind,
    lane: input.lane,
    queueName: "db-operation",
    idempotencyKey: `${input.operationName}:${jobId}`,
    params: {
      boundedSummary: input.boundedSummary,
      ...(input.params && typeof input.params === "object" && !Array.isArray(input.params)
        ? input.params
        : {}),
      rawDbRowsStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    estimatedDurationMs: 100,
  });
  const claimed = await runtime.dbOperations.claimLongDbOperation({
    workerId: "model-memory-runtime-db-operation-worker",
    queueName: "db-operation",
    operationNames: [input.operationName],
  });
  if (!claimed || claimed.job.jobId !== jobId) {
    throw new Error("model_memory_runtime_db_operation_claim_failed");
  }
  await runtime.dbOperations.completeLongDbOperation({
    jobId,
    leaseToken: claimed.leaseToken,
    output: asJsonValue({
      boundedSummary: input.boundedSummary,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    }),
  });
  return {
    jobId,
    evidenceRef: `runtime-job://${jobId}/db-operation/metadata`,
  };
}
