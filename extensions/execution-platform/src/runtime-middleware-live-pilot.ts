import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  buildCloseoutCapsuleId,
  recordCloseoutCapsuleArtifact,
  parseCloseoutCapsule,
  type CloseoutCapsuleFactualRefs,
} from "./codex-bridge/closeout-capsule.ts";
import type {
  CloseoutCapsuleReporterInput,
  CloseoutCapsuleReporterResult,
} from "./codex-bridge/model-closeout-capsule-reporter.ts";
import { DbOperationRepository } from "./db-operations/db-operation-repository.ts";
import {
  createDbOperationExecuteRuntimeToolExecutor,
  type DbOperationExecuteHandler,
} from "./db-operations/db-operation-runtime-tool.ts";
import {
  type DbOperationKind,
  type DbOperationLane,
  type DbOperationTelemetry,
} from "./db-operations/types.ts";
import {
  evaluateWorkQueueLiveLinkageGate,
  inspectExecutionPlatformDbReadiness,
  resolveExecutionPlatformDbBoundaryContract,
  type ExecutionPlatformDbReadinessReport,
} from "./db/runtime-boundary.ts";
import { createExecutionPlatformDatabaseRuntime } from "./db/runtime.ts";
import { createDefaultModelTaskContractRegistry } from "./model-tasks/contracts.ts";
import { ModelTaskRepository } from "./model-tasks/model-task-repository.ts";
import type { ModelTaskContractId } from "./model-tasks/types.ts";
import type { JsonValue, RuntimeJobRepository } from "./runtime-job-repository.ts";
import type { RuntimeToolKernel } from "./runtime-tool-call/runtime-tool-kernel.ts";
import { ScriptJobDefinitionRegistry } from "./script-jobs/registry.ts";
import { ScriptJobRepository } from "./script-jobs/script-job-repository.ts";
import {
  createScriptExecuteRuntimeToolExecutor,
  type ScriptExecuteHandler,
} from "./script-jobs/script-runtime-tool.ts";
import { createValidationLaneEvidence } from "./script-jobs/validation-lanes.ts";
import { buildWorkQueueExecutionReadModel } from "./work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "./work-queue/work-queue-repository.ts";

export const RUNTIME_MIDDLEWARE_LIVE_PILOT_VERSION =
  "execution-platform.runtime-middleware-live-pilot.v1";

const MODEL_TASK_LIVE_OUTPUT_SCHEMA_VERSION =
  "execution-platform.model-task-middleware-live-output.v1";

const ModelTaskLiveOutputSchema = z
  .object({
    boundedResultSummary: z.string().trim().min(20).max(1200),
    qualityAssessment: z.string().trim().min(20).max(1200),
    validationSummary: z.string().trim().min(20).max(1000),
    eli5Progress: z.string().trim().min(20).max(1000),
    evidenceRefs: z.array(z.string().trim().min(1).max(260)).max(10),
    limitations: z.array(z.string().trim().min(1).max(500)).max(8),
  })
  .strict();

const MODEL_TASK_LIVE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "boundedResultSummary",
    "qualityAssessment",
    "validationSummary",
    "eli5Progress",
    "evidenceRefs",
    "limitations",
  ],
  properties: {
    boundedResultSummary: { type: "string", minLength: 20, maxLength: 1200 },
    qualityAssessment: { type: "string", minLength: 20, maxLength: 1200 },
    validationSummary: { type: "string", minLength: 20, maxLength: 1000 },
    eli5Progress: { type: "string", minLength: 20, maxLength: 1000 },
    evidenceRefs: { type: "array", items: { type: "string", maxLength: 260 }, maxItems: 10 },
    limitations: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 8 },
  },
};

export type RuntimeMiddlewareJsonModelExecutor = {
  execute(request: {
    contract: {
      contractName: string;
      contractVersion: string;
      modelId: string;
    };
    systemPrompt: string;
    userPrompt: string;
    responseFormat: "json";
    responseOptions?: {
      transport?: {
        type: "json_schema";
        name: string;
        strict: boolean;
        schema: unknown;
      };
      maxOutputTokens?: number;
      reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      verbosity?: "low" | "medium" | "high";
    };
  }): Promise<{
    outputText: string;
    resolvedModelId?: string;
    usage?: {
      promptTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
    };
  }>;
};

export type RuntimeMiddlewareCloseoutReporter = {
  createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
};

export type AllowlistedCommandResult = {
  exitCode: number;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutSha256: string;
  stderrSha256: string;
  timedOut: boolean;
};

export type AllowlistedCommandRunner = (input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}) => Promise<AllowlistedCommandResult>;

export type RuntimeMiddlewarePilotResult = {
  artifactKind:
    | "model_task_middleware_pilot_result"
    | "script_middleware_pilot_result"
    | "db_operation_middleware_pilot_result";
  pilotVersion: typeof RUNTIME_MIDDLEWARE_LIVE_PILOT_VERSION;
  status: "completed" | "blocked" | "needs_review";
  mode: "runtime_only" | "runtime_with_work_queue_fixture";
  runtimeJobId: string;
  middlewareKind: "model_task" | "script_job" | "db_operation";
  boundedInputSummary: string;
  boundedOutputSummary: string;
  artifactRefs: string[];
  workQueueReadback: JsonValue | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  runtimeJobsCreated: boolean;
  authorityGranted: false;
  controlsApplied: false;
  deployPerformed: false;
  outboundSendPerformed: false;
  dependencyInstallPerformed: false;
  modelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

export async function runModelTaskMiddlewareLiveCompletion(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  executor: RuntimeMiddlewareJsonModelExecutor;
  runtimeToolKernel: RuntimeToolKernel;
  closeoutReporter?: RuntimeMiddlewareCloseoutReporter | null;
  runtimeJobId?: string;
  contractId?: ModelTaskContractId;
  createWorkQueueFixture?: boolean;
  modelId?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  maxOutputTokens?: number;
  closeoutMode?: "inline_model_output" | "reporter" | "none";
}): Promise<RuntimeMiddlewarePilotResult & { closeoutCapsuleRef: string | null }> {
  if (
    !input.runtimeToolKernel ||
    typeof (input.runtimeToolKernel as { invoke?: unknown }).invoke !== "function"
  ) {
    throw new Error("model_task_runtime_tool_kernel_required");
  }
  const contractId = input.contractId ?? "outcome_pack_review.structured_json";
  const boundedInputSummary =
    "Use the approved model-task middleware path to produce bounded live completion evidence.";
  const runtimeJobId =
    input.runtimeJobId ?? `model-task-live-completion-${sha256(contractId).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `model-task-live-completion-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "model_task_middleware",
      title: "Model-task middleware live completion",
      metadata: { workQueueLifecycleMutated: false, rawPromptStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-completion",
      reasonCodes: ["middleware_fixture_created_for_live_completion_proof"],
    });
  }
  const repository = new ModelTaskRepository(input.runtimeJobs, {
    registry: createDefaultModelTaskContractRegistry(),
  });
  await repository.enqueueModelTask({
    jobId: runtimeJobId,
    contractId,
    queueName: "model-task",
    workItemId,
    idempotencyKey: `${contractId}:${runtimeJobId}:live-completion`,
    input: {
      task: "Produce bounded middleware live completion summary.",
      input: { sourceRef: "runtime-middleware-live-completion" },
      constraints: [
        "Use approved model executor path",
        "No authority grant",
        "No raw prompt or response storage",
      ],
    },
    routeEvidence: {
      providerCallMade: false,
      reason: "queued before approved provider execution",
    },
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "model_task_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimModelTask({
    workerId: "model-task-live-completion-worker",
    queueName: "model-task",
    contractIds: [contractId],
  });
  if (!claimed) {
    throw new Error("model_task_middleware_job_not_claimed");
  }
  const modelId = input.modelId ?? "openai-codex/gpt-5.4";
  const modelCall = await withLeaseRenewal(input.runtimeJobs, claimed.leaseToken, () =>
    repository.invokeClaimedModelTaskRuntimeTool({
      claimed,
      kernel: input.runtimeToolKernel,
      modelId,
      providerRef: "codex_app_server_json_executor",
      inputSummary:
        "Run the approved model.call runtime tool for bounded model-task middleware completion.",
      volatileInput: {
        contract: {
          contractName: "execution_platform_model_task_middleware_live_completion",
          contractVersion: MODEL_TASK_LIVE_OUTPUT_SCHEMA_VERSION,
          modelId,
        },
        systemPrompt: [
          "You are completing a bounded OpenClaw Execution Platform model-task middleware proof.",
          "Return only strict JSON matching the supplied schema.",
          "Do not include raw prompts, raw responses, transcripts, provider logs, command logs, secrets, or hidden reasoning.",
          "Use only the supplied runtime job id and bounded task facts as current proof context.",
          "Do not cite or rely on prior artifact files, previous runtime jobs, or workspace state.",
          "Summarize the proof in human-readable language and cite only bounded evidence refs.",
        ].join("\n"),
        userPrompt: JSON.stringify(
          {
            boundedTaskSummary: boundedInputSummary,
            runtimeJobId,
            contractId,
            currentProofOnly: true,
            prohibitedInference:
              "Do not mention any runtime job id other than the supplied runtimeJobId.",
            expectedSafety: {
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              authorityGranted: false,
              runtimeJobsCreatedByModel: false,
              workQueueLifecycleMutated: false,
            },
          },
          null,
          2,
        ),
        responseFormat: "json",
        responseOptions: {
          maxOutputTokens: input.maxOutputTokens ?? 3_000,
          reasoningEffort: input.reasoningEffort ?? "low",
          verbosity: "low",
          transport: {
            type: "json_schema",
            name: "execution_platform_model_task_middleware_live_completion",
            strict: true,
            schema: MODEL_TASK_LIVE_OUTPUT_JSON_SCHEMA,
          },
        },
      },
    }),
  );
  if (modelCall.invocation.invocation.status !== "succeeded" || !modelCall.structuredOutput) {
    await repository.failModelTask({
      jobId: runtimeJobId,
      leaseToken: claimed.leaseToken,
      failureKind:
        modelCall.invocation.invocation.status === "failed"
          ? "provider_failure"
          : "transport_error",
      message: "model.call runtime tool did not return accepted structured output",
      evidence: {
        invocationRef: modelCall.invocation.invocationRef,
        status: modelCall.invocation.invocation.status,
        reasonCodes: modelCall.invocation.reasonCodes,
      },
    });
    throw new Error("model_task_runtime_tool_model_call_not_accepted");
  }
  const output = ModelTaskLiveOutputSchema.parse(modelCall.structuredOutput);
  const modelRef = modelCall.modelRef ?? modelId;
  const modelEvidenceRef = `runtime-job://${runtimeJobId}/model-task/live-provider-evidence`;
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "model_task.live_provider_evidence",
    storageKind: "metadata",
    uri: modelEvidenceRef,
    contentType: "application/json",
    metadata: {
      providerPath: "model_call_runtime_tool",
      modelRef,
      responseHash: modelCall.responseHash,
      usage: modelCall.usage,
      runtimeToolInvocationRef: modelCall.invocation.invocationRef,
      schemaValid: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
  await repository.completeModelTask({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: {
      result: {
        ...output,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      confidence: "high",
      evidence: [modelEvidenceRef, ...output.evidenceRefs].slice(0, 12),
    },
    routeEvidence: {
      providerCallMade: true,
      selectedModelRef: modelRef,
      reason: "model.call runtime tool completed strict JSON model-task middleware output",
      tokenUsage: {
        inputTokens: modelCall.usage?.promptTokens,
        outputTokens: modelCall.usage?.outputTokens,
        totalTokens:
          modelCall.usage?.promptTokens !== undefined || modelCall.usage?.outputTokens !== undefined
            ? (modelCall.usage?.promptTokens ?? 0) + (modelCall.usage?.outputTokens ?? 0)
            : undefined,
      },
    },
  });
  let closeoutCapsuleRef: string | null = null;
  const factualRefs: CloseoutCapsuleFactualRefs = {
    runtimeJobId,
    teamRunId: null,
    workflowId: "execution-platform.middleware.model-task",
    status: "succeeded",
    roles: [
      {
        roleId: "model_task_middleware_executor",
        agentId: "model-task-live-completion-worker",
        modelRef,
        status: "succeeded",
      },
    ],
    fileRefs: [],
    artifactRefs: [modelEvidenceRef],
    validationRefs: [`runtime-job://${runtimeJobId}/model-task/output-validation`],
    runtimeEventRefs: [`runtime-job://${runtimeJobId}/events/model-task`],
  };
  const closeoutMode = input.closeoutMode ?? "inline_model_output";
  if (closeoutMode === "reporter" && input.closeoutReporter) {
    const capsuleResult = await input.closeoutReporter.createCapsule({
      objectiveSummary: boundedInputSummary,
      factualRefs,
      boundedRoleEvidence: [
        {
          roleId: "model_task_middleware_executor",
          agentId: "model-task-live-completion-worker",
          modelRef,
          modelRunRef: modelEvidenceRef,
          askedToDo: boundedInputSummary,
          evidenceSummary: output.boundedResultSummary,
          artifactRefs: [modelEvidenceRef],
          validationRefs: factualRefs.validationRefs,
          limitations: output.limitations,
        },
      ],
      boundedResultEvidence: {
        completed: true,
        needsReview: false,
        failed: false,
        findings: [output.qualityAssessment, output.validationSummary].slice(0, 8),
        requiredFixes: [],
        limitations: output.limitations,
      },
    });
    await recordCloseoutCapsuleArtifact({
      runtimeJobs: input.runtimeJobs,
      capsule: capsuleResult.capsule,
    });
    closeoutCapsuleRef = `runtime-job://${runtimeJobId}/closeout-capsule/${capsuleResult.capsule.capsuleId}`;
  } else if (closeoutMode === "inline_model_output") {
    const createdAt = new Date().toISOString();
    const capsuleId = buildCloseoutCapsuleId({ runtimeJobId, createdAt });
    const noOpSeed = {
      seedId: `${runtimeJobId}-middleware-no-op`,
      kind: "no_op" as const,
      title: "No middleware follow-up required",
      rationale:
        "The bounded middleware live-completion proof did not identify a required follow-up beyond normal validation.",
      recommendedNextStep: "Proceed to the next middleware or workflow proof slice.",
      evidenceRefs: [modelEvidenceRef],
      confidence: "medium" as const,
    };
    const capsule = parseCloseoutCapsule({
      artifactKind: "execution_platform_closeout_capsule",
      schemaVersion: "execution-platform.closeout-capsule.v1",
      capsuleId,
      createdAt,
      modelRef,
      humanReport: {
        source: "model",
        reportMarkdown: [
          "## Model-Task Middleware Live Completion",
          "",
          output.boundedResultSummary,
          "",
          `Quality: ${output.qualityAssessment}`,
          "",
          `Validation: ${output.validationSummary}`,
        ].join("\n"),
        eli5Progress: output.eli5Progress,
        limitations: output.limitations,
      },
      structuredSummary: {
        taskSuccess: "satisfied",
        qualityAssessment: clampText(output.qualityAssessment, 1_000),
        workflowFitAssessment:
          "Model-task middleware used the runtime job boundary and approved model executor path for bounded completion evidence.",
        agentModelFitAssessment: `The model task completed with ${modelRef} through the approved JSON executor path.`,
        missingWork: [],
        validationSummary: clampText(output.validationSummary, 1_000),
        riskSummary:
          output.limitations.length > 0
            ? clampText(output.limitations.slice(0, 4).join("; "), 1_000)
            : "No additional bounded runtime limitations were reported by the model task.",
        opportunitySeedIds: [noOpSeed.seedId],
      },
      roleCloseouts: [
        {
          roleId: "model_task_middleware_executor",
          agentId: "model-task-live-completion-worker",
          modelRef,
          modelRunRef: modelEvidenceRef,
          source: "model",
          askedToDo: boundedInputSummary,
          actuallyDid: output.boundedResultSummary,
          whatIWasAskedToDo: boundedInputSummary,
          whatIActuallyDid: output.boundedResultSummary,
          evidenceRefs: [modelEvidenceRef],
          filesOrArtifactsTouched: [modelEvidenceRef],
          validationIPerformed: clampText(output.validationSummary, 800),
          worked: [clampText(output.qualityAssessment, 500)],
          failedOrWeak:
            output.limitations.length > 0
              ? output.limitations.slice(0, 4)
              : ["No weakness reported."],
          wouldImproveNext: [
            "Use this live middleware evidence in the broader owner-visible Work Queue readback.",
          ],
          recommendedNextStep: "Proceed to script and DB middleware live-completion proofs.",
          skillOrProcessOpportunitySeeds: [noOpSeed],
          opportunitySeeds: [noOpSeed],
          confidence: "high",
          limitations: output.limitations,
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      ],
      opportunitySeeds: [noOpSeed],
      factualRefs,
      safetyFlags: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        workQueueLifecycleMutatedDirectly: false,
        authorityGrantedByCloseout: false,
        runtimeJobCreatedByCloseout: false,
      },
    });
    await recordCloseoutCapsuleArtifact({ runtimeJobs: input.runtimeJobs, capsule });
    closeoutCapsuleRef = `runtime-job://${runtimeJobId}/closeout-capsule/${capsule.capsuleId}`;
  }
  const result = await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "model_task_middleware_pilot_result",
    middlewareKind: "model_task",
    boundedInputSummary,
    boundedOutputSummary: output.boundedResultSummary,
  });
  return { ...result, closeoutCapsuleRef };
}

export async function runModelTaskMiddlewarePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  contractId?: ModelTaskContractId;
  createWorkQueueFixture?: boolean;
}): Promise<RuntimeMiddlewarePilotResult> {
  const contractId = input.contractId ?? "outcome_pack_review.structured_json";
  const boundedInputSummary = "Review bounded middleware evidence with fixture structured output.";
  const runtimeJobId =
    input.runtimeJobId ?? `model-task-live-use-${sha256(contractId).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `model-task-live-use-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "model_task_middleware",
      title: "Model-task middleware pilot",
      metadata: { workQueueLifecycleMutated: false, rawPromptStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-pilot",
      reasonCodes: ["middleware_fixture_created_for_pilot_proof"],
    });
  }
  const repository = new ModelTaskRepository(input.runtimeJobs, {
    registry: createDefaultModelTaskContractRegistry(),
  });
  await repository.enqueueModelTask({
    jobId: runtimeJobId,
    contractId,
    queueName: "model-task",
    workItemId,
    idempotencyKey: `${contractId}:${runtimeJobId}`,
    input: {
      task: "Produce bounded fixture review summary.",
      input: { sourceRef: "runtime-middleware-live-pilot" },
      constraints: ["No provider call", "No authority grant", "No raw storage"],
    },
    routeEvidence: {
      providerCallMade: false,
      reason: "fixture model task output supplied by runtime pilot",
    },
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "model_task_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimModelTask({
    workerId: "model-task-live-use-worker",
    queueName: "model-task",
    contractIds: [contractId],
  });
  if (!claimed) {
    throw new Error("model_task_middleware_job_not_claimed");
  }
  await repository.completeModelTask({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: {
      result: {
        boundedOutputSummary: "Model-task middleware completed through runtime job boundary.",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      confidence: "high",
      evidence: ["runtime-job-boundary"],
    },
    routeEvidence: {
      providerCallMade: false,
      reason: "fixture output; approved provider path not invoked in this slice",
    },
  });
  return await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "model_task_middleware_pilot_result",
    middlewareKind: "model_task",
    boundedInputSummary,
    boundedOutputSummary: "Model-task middleware completed with bounded fixture output.",
  });
}

export async function runScriptMiddlewarePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  createWorkQueueFixture?: boolean;
  proofOnly: true;
}): Promise<RuntimeMiddlewarePilotResult> {
  if (!input.proofOnly) {
    throw new Error("script_middleware_pilot_retired_use_script_execute_runtime_tool");
  }
  const scriptId = "execution-platform.safe-artifact-index";
  const runtimeJobId = input.runtimeJobId ?? `script-live-use-${sha256(scriptId).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `script-live-use-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "script_middleware",
      title: "Script middleware pilot",
      metadata: { workQueueLifecycleMutated: false, rawLogsStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-pilot",
      reasonCodes: ["middleware_fixture_created_for_pilot_proof"],
    });
  }
  const registry = new ScriptJobDefinitionRegistry([
    {
      scriptId,
      description: "Bounded artifact index proof helper.",
      handlerId: "safe.artifact.index.fixture",
      allowedLanes: ["proof"],
      timeoutMs: 30_000,
      artifactPolicy: { maxMetadataBytes: 4096, maxInlineTextBytes: 1024 },
    },
  ]);
  const repository = new ScriptJobRepository(input.runtimeJobs, { registry });
  await repository.enqueueScriptJob({
    jobId: runtimeJobId,
    scriptId,
    lane: "proof",
    queueName: "script-job",
    workItemId,
    idempotencyKey: `${scriptId}:${runtimeJobId}`,
    input: { boundedInputSummary: "Count expected proof artifacts by ref only." },
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "script_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimScriptJob({
    workerId: "script-live-use-worker",
    queueName: "script-job",
    scriptIds: [scriptId],
  });
  if (!claimed) {
    throw new Error("script_middleware_job_not_claimed");
  }
  const evidence = createValidationLaneEvidence({
    laneId: "proof",
    outcome: "passed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 1,
    summary: "Safe artifact index proof completed without shell execution.",
    artifactRefs: [`runtime-job://${runtimeJobId}/script-job/definition`],
  });
  await repository.completeScriptJob({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: {
      boundedOutputSummary: "Script middleware completed allowlisted proof helper.",
      rawStdoutStored: false,
      rawStderrStored: false,
    },
    exitCode: 0,
    validationEvidence: evidence,
  });
  return await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "script_middleware_pilot_result",
    middlewareKind: "script_job",
    boundedInputSummary: "Allowlisted script proof helper.",
    boundedOutputSummary: "Script middleware completed with bounded output.",
  });
}

export async function runScriptMiddlewareLiveCompletion(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeToolKernel: RuntimeToolKernel;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  createWorkQueueFixture?: boolean;
  commandRunner?: AllowlistedCommandRunner;
  cwd?: string;
}): Promise<RuntimeMiddlewarePilotResult> {
  if (
    !input.runtimeToolKernel ||
    typeof (input.runtimeToolKernel as { invoke?: unknown }).invoke !== "function"
  ) {
    throw new Error("script_runtime_tool_kernel_required");
  }
  const scriptId = "execution-platform.node-check.starter-workflow-soak";
  const runtimeJobId =
    input.runtimeJobId ?? `script-live-completion-${sha256(scriptId).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `script-live-completion-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "script_middleware",
      title: "Script middleware live completion",
      metadata: { workQueueLifecycleMutated: false, rawLogsStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-completion",
      reasonCodes: ["middleware_fixture_created_for_live_completion_proof"],
    });
  }
  const registry = new ScriptJobDefinitionRegistry([
    {
      scriptId,
      description: "Allowlisted static syntax check for starter workflow soak runner.",
      handlerId: "safe.node.check.script",
      allowedLanes: ["proof"],
      timeoutMs: 60_000,
      artifactPolicy: { maxMetadataBytes: 4096, maxInlineTextBytes: 1024 },
    },
  ]);
  const repository = new ScriptJobRepository(input.runtimeJobs, { registry });
  await repository.enqueueScriptJob({
    jobId: runtimeJobId,
    scriptId,
    lane: "proof",
    queueName: "script-job",
    workItemId,
    idempotencyKey: `${scriptId}:${runtimeJobId}:live-completion`,
    input: {
      boundedInputSummary:
        "Run allowlisted node --check against starter workflow live quality soak runner.",
    },
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "script_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimScriptJob({
    workerId: "script-live-completion-worker",
    queueName: "script-job",
    scriptIds: [scriptId],
  });
  if (!claimed) {
    throw new Error("script_middleware_job_not_claimed");
  }
  const cwd = input.cwd ?? process.cwd();
  const command = process.execPath;
  const args = ["--check", "scripts/execution-platform-run-starter-workflow-live-quality-soak.mjs"];
  const commandEvidenceRef = `runtime-job://${runtimeJobId}/script-job/allowlisted-command-evidence`;
  const scriptHandler: ScriptExecuteHandler = async () => {
    const commandResult = await (input.commandRunner ?? runAllowlistedNodeCheckCommand)({
      command,
      args,
      cwd,
      timeoutMs: 60_000,
    });
    const evidence = createValidationLaneEvidence({
      laneId: "proof",
      outcome: commandResult.exitCode === 0 && !commandResult.timedOut ? "passed" : "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: commandResult.durationMs,
      summary:
        commandResult.exitCode === 0 && !commandResult.timedOut
          ? "Allowlisted node syntax check completed successfully."
          : "Allowlisted node syntax check failed or timed out.",
      artifactRefs: [commandEvidenceRef],
    });
    return {
      output: {
        boundedOutputSummary:
          commandResult.exitCode === 0 && !commandResult.timedOut
            ? "Script middleware completed allowlisted node syntax check with bounded evidence."
            : "Script middleware recorded allowlisted command failure with bounded evidence.",
        rawStdoutStored: false,
        rawStderrStored: false,
      },
      exitCode: commandResult.exitCode,
      validationEvidence: evidence,
      commandRef:
        "node --check scripts/execution-platform-run-starter-workflow-live-quality-soak.mjs",
      durationMs: commandResult.durationMs,
      stdoutBytes: commandResult.stdoutBytes,
      stderrBytes: commandResult.stderrBytes,
      stdoutSha256: commandResult.stdoutSha256,
      stderrSha256: commandResult.stderrSha256,
      timedOut: commandResult.timedOut,
      artifactRefs: [commandEvidenceRef],
    };
  };
  const scriptToolResult = await withLeaseRenewal(input.runtimeJobs, claimed.leaseToken, () =>
    repository.invokeClaimedScriptJobRuntimeTool({
      claimed,
      kernel: input.runtimeToolKernel,
      executor: createScriptExecuteRuntimeToolExecutor({
        handlers: { "safe.node.check.script": scriptHandler },
      }),
      inputSummary: "Run allowlisted node syntax check through script.execute runtime tool.",
    }),
  );
  const metadata = scriptToolResult;
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "script_job.allowlisted_command_evidence",
    storageKind: "metadata",
    uri: commandEvidenceRef,
    contentType: "application/json",
    metadata: {
      scriptId,
      commandRef:
        "node --check scripts/execution-platform-run-starter-workflow-live-quality-soak.mjs",
      exitCode: metadata.exitCode ?? null,
      durationMs: null,
      stdoutBytes: null,
      stderrBytes: null,
      stdoutSha256: null,
      stderrSha256: null,
      timedOut: false,
      runtimeToolInvocationRef: scriptToolResult.invocation.invocationRef,
      rawStdoutStored: false,
      rawStderrStored: false,
      rawCommandLogStored: false,
    },
  });
  if (
    scriptToolResult.invocation.invocation.status !== "succeeded" ||
    scriptToolResult.exitCode !== 0
  ) {
    await repository.failScriptJob({
      jobId: runtimeJobId,
      leaseToken: claimed.leaseToken,
      code: "script_execute_runtime_tool_failed",
      message: "script.execute runtime tool did not return accepted success evidence",
      evidence: {
        invocationRef: scriptToolResult.invocation.invocationRef,
        status: scriptToolResult.invocation.invocation.status,
      },
    });
    throw new Error("script_execute_runtime_tool_not_accepted");
  }
  await repository.completeScriptJob({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: scriptToolResult.output,
    exitCode: scriptToolResult.exitCode,
    validationEvidence: scriptToolResult.validationEvidence,
    runtimeToolTraceRequired: true,
  });
  return await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "script_middleware_pilot_result",
    middlewareKind: "script_job",
    boundedInputSummary: "Allowlisted script middleware command.",
    boundedOutputSummary: "Script middleware completed allowlisted command with bounded evidence.",
  });
}

export async function runDbOperationMiddlewarePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  operationName?: string;
  operationKind?: DbOperationKind;
  lane?: DbOperationLane;
  boundedOutput?: JsonValue;
  createWorkQueueFixture?: boolean;
  proofOnly: true;
}): Promise<RuntimeMiddlewarePilotResult> {
  if (!input.proofOnly) {
    throw new Error("db_operation_middleware_pilot_retired_use_db_operation_execute_runtime_tool");
  }
  const operationName = input.operationName ?? "execution_platform.readiness.inspect";
  const runtimeJobId =
    input.runtimeJobId ?? `db-operation-live-use-${sha256(operationName).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `db-operation-live-use-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "db_operation_middleware",
      title: "DB operation middleware pilot",
      metadata: { workQueueLifecycleMutated: false, rawRowsStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-pilot",
      reasonCodes: ["middleware_fixture_created_for_pilot_proof"],
    });
  }
  const repository = new DbOperationRepository(input.runtimeJobs);
  await repository.enqueueLongDbOperation({
    jobId: runtimeJobId,
    operationName,
    operationKind: input.operationKind ?? "read",
    lane: input.lane ?? "background",
    queueName: "db-operation",
    workItemId,
    idempotencyKey: `${operationName}:${runtimeJobId}`,
    params: { boundedInputSummary: "Inspect runtime DB readiness summary only." },
    estimatedDurationMs: 100,
    maxAttempts: 1,
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "db_operation_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimLongDbOperation({
    workerId: "db-operation-live-use-worker",
    queueName: "db-operation",
    operationNames: [operationName],
  });
  if (!claimed) {
    throw new Error("db_operation_middleware_job_not_claimed");
  }
  const telemetry: DbOperationTelemetry = {
    telemetryId: `telemetry-${runtimeJobId}`,
    operationName,
    operationKind: claimed.operation.operationKind,
    lane: claimed.operation.lane,
    decision: claimed.operation.classification.decision,
    outcome: "succeeded",
    timeoutBudgetMs: claimed.operation.classification.timeoutBudgetMs,
    durationMs: 1,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    classification: claimed.operation.classification,
    jobId: runtimeJobId,
  };
  await repository.completeLongDbOperation({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: input.boundedOutput ?? {
      boundedResultSummary: "DB operation middleware recorded bounded readiness evidence.",
      rawRowsStored: false,
    },
    telemetry,
  });
  return await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "db_operation_middleware_pilot_result",
    middlewareKind: "db_operation",
    boundedInputSummary: "DB operation readiness inspection.",
    boundedOutputSummary: "DB operation middleware completed with bounded result summary.",
  });
}

export async function runDbOperationMiddlewareLiveCompletion(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeToolKernel: RuntimeToolKernel;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  createWorkQueueFixture?: boolean;
  readiness: ExecutionPlatformDbReadinessReport;
}): Promise<RuntimeMiddlewarePilotResult> {
  if (
    !input.runtimeToolKernel ||
    typeof (input.runtimeToolKernel as { invoke?: unknown }).invoke !== "function"
  ) {
    throw new Error("db_operation_runtime_tool_kernel_required");
  }
  const gate = evaluateWorkQueueLiveLinkageGate({ readiness: input.readiness });
  if (!gate.enabled) {
    return {
      artifactKind: "db_operation_middleware_pilot_result",
      pilotVersion: RUNTIME_MIDDLEWARE_LIVE_PILOT_VERSION,
      status: "blocked",
      mode: "runtime_only",
      runtimeJobId: input.runtimeJobId ?? "db-operation-live-completion-blocked",
      middlewareKind: "db_operation",
      boundedInputSummary: "DB operation middleware live boundary check.",
      boundedOutputSummary: `DB operation middleware blocked by ${gate.decision}.`,
      artifactRefs: [],
      workQueueReadback: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      dependencyInstallPerformed: false,
      modelPromotionPerformed: false,
      workQueueLifecycleMutated: false,
    };
  }
  const operationName = "execution_platform.runtime_db_boundary.live_readiness";
  const runtimeJobId =
    input.runtimeJobId ??
    `db-operation-live-completion-${sha256(input.readiness.boundary.boundaryKind).slice(0, 12)}`;
  const workItemId =
    input.createWorkQueueFixture && input.workQueue
      ? `db-operation-live-use-work-item-${sha256(runtimeJobId).slice(0, 12)}`
      : null;
  if (workItemId && input.workQueue) {
    await input.workQueue.createGeneratedWorkItem({
      workItemId,
      itemType: "db_operation_middleware",
      title: "DB operation middleware live completion",
      metadata: { workQueueLifecycleMutated: false, rawRowsStored: false },
      generatedOriginKind: "middleware_fixture",
      generatedTerminalPolicy: "debug_only",
      createdBy: "runtime-middleware-live-completion",
      reasonCodes: ["middleware_fixture_created_for_live_completion_proof"],
    });
  }
  const repository = new DbOperationRepository(input.runtimeJobs);
  await repository.enqueueLongDbOperation({
    jobId: runtimeJobId,
    operationName,
    operationKind: "read",
    lane: "background",
    queueName: "db-operation",
    workItemId,
    idempotencyKey: `${operationName}:${runtimeJobId}:live-completion`,
    params: { boundedInputSummary: "Inspect approved runtime DB readiness summary only." },
    estimatedDurationMs: 100,
    maxAttempts: 1,
  });
  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: { runKind: "db_operation_middleware", workQueueLifecycleMutationAllowed: false },
    });
  }
  const claimed = await repository.claimLongDbOperation({
    workerId: "db-operation-live-completion-worker",
    queueName: "db-operation",
    operationNames: [operationName],
  });
  if (!claimed) {
    throw new Error("db_operation_middleware_job_not_claimed");
  }
  const dbHandler: DbOperationExecuteHandler = () => {
    const startedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();
    return {
      output: {
        boundedResultSummary:
          "DB middleware completed approved runtime DB boundary readiness proof.",
        boundaryKind: input.readiness.boundary.boundaryKind,
        readinessState: input.readiness.readinessState,
        workQueueLiveLinkageMayAttach: input.readiness.workQueueLiveLinkageMayAttach,
        reasonCodes: input.readiness.reasonCodes.slice(0, 20),
        missingTables: input.readiness.missingTables,
        missingMigrationRefs: input.readiness.missingMigrationRefs,
        rawRowsStored: false,
        rawDbRowsStored: false,
        rawLogsStored: false,
      },
      telemetry: {
        telemetryId: `telemetry-${runtimeJobId}`,
        operationName,
        operationKind: claimed.operation.operationKind,
        lane: claimed.operation.lane,
        decision: claimed.operation.classification.decision,
        outcome: "succeeded",
        timeoutBudgetMs: claimed.operation.classification.timeoutBudgetMs,
        durationMs: 1,
        startedAt,
        completedAt,
        classification: claimed.operation.classification,
        jobId: runtimeJobId,
      },
      resultSummary: "DB middleware completed approved runtime DB boundary readiness proof.",
      rowCount: 0,
    };
  };
  const dbToolResult = await withLeaseRenewal(input.runtimeJobs, claimed.leaseToken, () =>
    repository.invokeClaimedDbOperationRuntimeTool({
      claimed,
      kernel: input.runtimeToolKernel,
      executor: createDbOperationExecuteRuntimeToolExecutor({
        handlers: { [operationName]: dbHandler },
      }),
      inputSummary: "Run approved DB readiness inspection through db_operation.execute.",
    }),
  );
  if (dbToolResult.invocation.invocation.status !== "succeeded" || !dbToolResult.telemetry) {
    await repository.failLongDbOperation({
      jobId: runtimeJobId,
      leaseToken: claimed.leaseToken,
      code: "db_operation_execute_runtime_tool_failed",
      message: "db_operation.execute runtime tool did not return accepted success evidence",
      evidence: {
        invocationRef: dbToolResult.invocation.invocationRef,
        status: dbToolResult.invocation.invocation.status,
      },
    });
    throw new Error("db_operation_execute_runtime_tool_not_accepted");
  }
  await repository.completeLongDbOperation({
    jobId: runtimeJobId,
    leaseToken: claimed.leaseToken,
    output: dbToolResult.output,
    telemetry: dbToolResult.telemetry,
    runtimeToolTraceRequired: true,
  });
  return await middlewareResult({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    workItemId,
    runtimeJobId,
    artifactKind: "db_operation_middleware_pilot_result",
    middlewareKind: "db_operation",
    boundedInputSummary: "DB operation middleware live boundary check.",
    boundedOutputSummary: "DB middleware completed approved runtime DB boundary readiness proof.",
  });
}

export async function inspectLiveDbReadinessForDbOperationMiddleware(): Promise<JsonValue> {
  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    return {
      boundaryKind: readiness.boundary.boundaryKind,
      runtimeSubstrateRef: readiness.boundary.runtimeSubstrateRef,
      databaseName: readiness.boundary.databaseName,
      readinessState: readiness.readinessState,
      schemaPresent: readiness.schemaPresent,
      missingTables: readiness.missingTables,
      writeAccessAllowed: readiness.writeAccessAllowed,
      reasonCodes: readiness.reasonCodes,
      rawRowsStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
  } finally {
    await runtime?.pool.end();
  }
}

async function middlewareResult(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  workItemId: string | null;
  runtimeJobId: string;
  artifactKind: RuntimeMiddlewarePilotResult["artifactKind"];
  middlewareKind: RuntimeMiddlewarePilotResult["middlewareKind"];
  boundedInputSummary: string;
  boundedOutputSummary: string;
}): Promise<RuntimeMiddlewarePilotResult> {
  const artifacts = await input.runtimeJobs.listArtifacts(input.runtimeJobId);
  const workQueueReadback =
    input.workItemId && input.workQueue
      ? await buildWorkQueueExecutionReadModel({
          workQueue: input.workQueue,
          runtimeJobs: input.runtimeJobs,
          workItemId: input.workItemId,
        }).then((model) => model.runtimeJobs.at(-1)?.middleware ?? null)
      : null;
  return {
    artifactKind: input.artifactKind,
    pilotVersion: RUNTIME_MIDDLEWARE_LIVE_PILOT_VERSION,
    status: "completed",
    mode: input.workItemId ? "runtime_with_work_queue_fixture" : "runtime_only",
    runtimeJobId: input.runtimeJobId,
    middlewareKind: input.middlewareKind,
    boundedInputSummary: input.boundedInputSummary,
    boundedOutputSummary: input.boundedOutputSummary,
    artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 20),
    workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 13)).trimEnd()} [truncated]`;
}

async function withLeaseRenewal<T>(
  runtimeJobs: RuntimeJobRepository,
  leaseToken: string,
  work: () => Promise<T>,
): Promise<T> {
  const interval = setInterval(() => {
    void runtimeJobs.renewLease({ leaseToken, extendByMs: 120_000 });
  }, 10_000);
  try {
    await runtimeJobs.renewLease({ leaseToken, extendByMs: 120_000 });
    return await work();
  } finally {
    clearInterval(interval);
  }
}

async function runAllowlistedNodeCheckCommand(input: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<AllowlistedCommandResult> {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    execFile(
      input.command,
      input.args,
      {
        cwd: input.cwd,
        timeout: input.timeoutMs,
        maxBuffer: 64 * 1024,
      },
      (error, stdout, stderr) => {
        const durationMs = Math.max(0, Date.now() - startedAt);
        const stdoutText = stdout;
        const stderrText = stderr;
        const exitCode =
          typeof (error as { code?: unknown } | null)?.code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        const timedOut = Boolean((error as { killed?: boolean } | null)?.killed);
        resolve({
          exitCode,
          durationMs,
          stdoutBytes: Buffer.byteLength(stdoutText, "utf8"),
          stderrBytes: Buffer.byteLength(stderrText, "utf8"),
          stdoutSha256: sha256(stdoutText),
          stderrSha256: sha256(stderrText),
          timedOut,
        });
      },
    );
  });
}
