import { createHash } from "node:crypto";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  recordWorkQueueExecutionAction,
  decideWorkQueueExecutionAction,
  type WorkQueueExecutionActionKind,
} from "../work-queue/execution-actions.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import {
  intentValidationMetadata,
  validateIntentForExecution,
  type IntentValidationResult,
  type IntentValidatorApprovalRef,
} from "./intent-validator.ts";
import {
  HeuristicIntentRouterProvider,
  ModelAssistedIntentRouter,
  recordIntentRouterDecision,
  type IntentRouterProvider,
  type ModelAssistedIntentRouterDecision,
} from "./model-assisted-intent-router.ts";
import {
  compileIntentToRuntimeJobRequest,
  type CompiledExecutionRequest,
} from "./request-compiler.ts";

export type NativeExecutionRpcAuth = {
  actorId: string;
  authenticated: boolean;
  role: "operator" | "admin" | "service";
  sessionId?: string | null;
  sourceRoute?: "ux" | "terminal" | "work_queue" | "agent_handoff" | "http" | "service" | null;
};

export type NativeExecutionSubmitRequest = {
  prompt: string;
  auth: NativeExecutionRpcAuth;
  workItemId?: string | null;
  approvalRefs?: IntentValidatorApprovalRef[];
  sourceRoute?: NativeExecutionRpcAuth["sourceRoute"];
};

export type NativeExecutionSubmitResult = {
  artifactKind: "native_execution_submit_result";
  accepted: boolean;
  status: "accepted" | "rejected";
  runtimeJobId: string | null;
  routeDecision: ModelAssistedIntentRouterDecision | null;
  validation: IntentValidationResult | null;
  compiledRequest: CompiledExecutionRequest | null;
  workflowId: string | null;
  jobType: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionRpcDependencies = {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository;
  registry?: WorkflowRegistry;
  intentRouterProvider?: IntentRouterProvider;
  queueName?: string;
};

function authReasons(auth: NativeExecutionRpcAuth): string[] {
  const reasons: string[] = [];
  if (!auth.authenticated) {
    reasons.push("authenticated_operator_required");
  }
  if (!auth.actorId.trim()) {
    reasons.push("operator_actor_id_required");
  }
  return reasons;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export class NativeExecutionRpcService {
  private readonly registry: WorkflowRegistry;
  private readonly provider: IntentRouterProvider;

  constructor(private readonly dependencies: NativeExecutionRpcDependencies) {
    this.registry = dependencies.registry ?? DEFAULT_EXECUTION_WORKFLOW_REGISTRY;
    this.provider = dependencies.intentRouterProvider ?? new HeuristicIntentRouterProvider();
  }

  async submit(request: NativeExecutionSubmitRequest): Promise<NativeExecutionSubmitResult> {
    const reasons = authReasons(request.auth);
    if (reasons.length > 0) {
      return this.submitResult({ reasonCodes: reasons });
    }
    const router = new ModelAssistedIntentRouter(this.provider, this.registry);
    const routeDecision = await router.route({ prompt: request.prompt });
    const validation = validateIntentForExecution({
      routeDecision: routeDecision.routeDecision,
      registry: this.registry,
      approvalRefs: request.approvalRefs,
    });
    if (!validation.accepted || !validation.workflow) {
      return this.submitResult({
        routeDecision,
        validation,
        workflowId: validation.workflow?.workflowId ?? routeDecision.routeDecision.workflowId,
        jobType: validation.workflow?.jobType ?? routeDecision.routeDecision.jobType,
        reasonCodes: validation.reasonCodes,
      });
    }
    const workflow = getWorkflowContract(this.registry, validation.workflow.workflowId);
    if (!workflow) {
      return this.submitResult({
        routeDecision,
        validation,
        reasonCodes: ["workflow_not_registered_after_validation"],
      });
    }
    const idempotencyKey = shortHash(
      `${routeDecision.promptHash}:${request.workItemId ?? request.auth.sessionId ?? request.auth.actorId}`,
    );
    const requestId = `native-exec-${idempotencyKey}`;
    const compiled = compileIntentToRuntimeJobRequest({
      requestId,
      routerDecision: routeDecision,
      validation,
      workflow,
      operator: { actorId: request.auth.actorId, sessionId: request.auth.sessionId },
      workItemId: request.workItemId,
      approvalRefs: request.approvalRefs?.map((approval) => approval.approvalId),
      queueName: this.dependencies.queueName,
      idempotencyKey,
    });
    const job = await this.dependencies.runtimeJobs.enqueueJob(compiled.runtimeJobCreateRequest);
    if (this.dependencies.workQueue && request.workItemId?.trim()) {
      const existingTruth = await this.dependencies.workQueue.readWorkItemTruth(request.workItemId);
      if (!existingTruth) {
        await this.dependencies.workQueue.createWorkItem({
          workItemId: request.workItemId,
          itemType: "execution_workflow",
          title: compiled.objectiveSummary,
          metadata: {
            workflowId: compiled.workflowId,
            jobType: compiled.jobType,
            route: routeDecision.routeDecision.route,
            promptHash: compiled.promptHash,
            sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          actorId: request.auth.actorId,
        });
      }
      await this.dependencies.workQueue.createWorkRun({
        workItemId: request.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: {
          workflowId: compiled.workflowId,
          jobType: compiled.jobType,
          genericWorkflow: true,
          nativeExecutionSubmit: true,
          sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
          workQueueLifecycleMutated: false,
        },
      });
    }
    await this.dependencies.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_request_compiled",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/compiled-request/${compiled.requestId}`,
      contentType: "application/json",
      metadata: compiled as unknown as JsonValue,
    });
    await recordIntentRouterDecision({
      runtimeJobs: this.dependencies.runtimeJobs,
      runtimeJobId: job.jobId,
      decision: routeDecision,
    });
    await this.dependencies.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.intent_validation",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/intent-validation`,
      contentType: "application/json",
      metadata: intentValidationMetadata(validation),
    });
    await this.dependencies.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.workflow_request_submitted",
      data: {
        workflowId: compiled.workflowId,
        jobType: compiled.jobType,
        promptHash: compiled.promptHash,
        sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
        rawPromptStored: false,
      },
    });
    return this.submitResult({
      accepted: true,
      runtimeJobId: job.jobId,
      routeDecision,
      validation,
      compiledRequest: compiled,
      workflowId: compiled.workflowId,
      jobType: compiled.jobType,
    });
  }

  async status(runtimeJobId: string): Promise<{ runtimeJob: RuntimeJob | null }> {
    return { runtimeJob: await this.dependencies.runtimeJobs.getJob(runtimeJobId) };
  }

  async applyControl(input: {
    actionKind: WorkQueueExecutionActionKind;
    actionId: string;
    workItemId: string;
    runtimeJobId: string;
    auth: NativeExecutionRpcAuth;
    metadata?: Record<string, JsonValue>;
  }) {
    const decision = decideWorkQueueExecutionAction({
      actionId: input.actionId,
      actionKind: input.actionKind,
      workItemId: input.workItemId,
      runtimeJobId: input.runtimeJobId,
      actorId: input.auth.actorId,
      authenticated: input.auth.authenticated,
      metadata: input.metadata,
    });
    if (decision.accepted) {
      await recordWorkQueueExecutionAction({
        runtimeJobs: this.dependencies.runtimeJobs,
        runtimeJobId: input.runtimeJobId,
        decision,
      });
    }
    return decision;
  }

  async readWorkQueueProjection(workItemId: string): Promise<JsonValue> {
    if (!this.dependencies.workQueue) {
      return { status: "unavailable", reasonCodes: ["work_queue_repository_not_configured"] };
    }
    const model = await buildWorkQueueExecutionReadModel({
      workQueue: this.dependencies.workQueue,
      runtimeJobs: this.dependencies.runtimeJobs,
      workItemId,
    });
    return summarizeWorkQueueExecutionForUi(model);
  }

  async readCloseout(runtimeJobId: string): Promise<JsonValue> {
    const artifacts = await this.dependencies.runtimeJobs.listArtifacts(runtimeJobId);
    const closeoutRefs = artifacts
      .filter(
        (artifact) =>
          artifact.artifactType.includes("closeout") ||
          artifact.artifactType.includes("work_episode") ||
          (artifact.metadata &&
            typeof artifact.metadata === "object" &&
            "closeoutState" in artifact.metadata),
      )
      .map((artifact) => artifact.uri)
      .slice(0, 20);
    return {
      runtimeJobId,
      closeoutRefs,
      closeoutState:
        artifacts
          .map((artifact) =>
            artifact.metadata && typeof artifact.metadata === "object"
              ? (artifact.metadata as { closeoutState?: unknown }).closeoutState
              : null,
          )
          .find((state) => typeof state === "string") ?? null,
    };
  }

  private submitResult(
    input: Partial<NativeExecutionSubmitResult> = {},
  ): NativeExecutionSubmitResult {
    return {
      artifactKind: "native_execution_submit_result",
      accepted: false,
      status: input.accepted ? "accepted" : "rejected",
      runtimeJobId: null,
      routeDecision: null,
      validation: null,
      compiledRequest: null,
      workflowId: null,
      jobType: null,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }
}
