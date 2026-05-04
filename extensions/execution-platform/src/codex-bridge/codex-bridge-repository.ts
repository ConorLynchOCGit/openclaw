import {
  boundDiagnosticJson,
  summarizeArtifacts,
  summarizeRuntimeEvents,
} from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  classifyAutobailoutEligibility,
  classifyCompletionState,
  createAutobailoutPlan,
  createAutobailoutPolicy,
  createCompletedWorkArtifactMetadata,
  createEnvironmentContract,
  createExecutionSupervisorContract,
  createTrustPolicy,
  finalizePromptArtifact,
} from "./policy.ts";
import { normalizeCodexBridgeStreamEvent } from "./stream.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  CODEX_BRIDGE_QUEUE,
  type AutobailoutPlan,
  type AutobailoutPolicy,
  type CodexBridgeCompletionState,
  type CodexBridgeExecutionStatus,
  type CodexBridgeExecutorKind,
  type CodexBridgeJobPayload,
  type CodexBridgeNormalizedStreamEvent,
  type CodexBridgePromptSource,
  type CompletedWorkArtifactKind,
  type RawCodexBridgeStreamEvent,
  type TrustProfileId,
  isCodexBridgeJobPayload,
} from "./types.ts";

export type EnqueueFakeCodexBridgeJobInput = {
  jobId?: string;
  executorKind: CodexBridgeExecutorKind;
  promptSource: CodexBridgePromptSource;
  trustProfileId?: TrustProfileId;
  autobailoutPolicy?: Partial<AutobailoutPolicy>;
  queueName?: string;
  priority?: number;
  idempotencyKey?: string;
  parentJobId?: string | null;
  parentWorkflowId?: string | null;
  workQueueLink?: {
    workItemId: string;
    runId?: string | null;
    stepId?: string | null;
  };
};

export type CodexBridgeRepositoryOptions = {
  now?: () => Date;
  maxInlineCompletedWorkBytes?: number;
};

const DEFAULT_MAX_INLINE_COMPLETED_WORK_BYTES = 8 * 1024;

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue | undefined, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function stringByteLength(value: string | undefined): number {
  return Buffer.byteLength(value ?? "", "utf8");
}

function normalizedEventsFromRuntime(events: Array<{ data: JsonValue }>) {
  return events
    .map((event) => {
      const data = event.data as Record<string, unknown>;
      return data.normalized as CodexBridgeNormalizedStreamEvent | undefined;
    })
    .filter((event): event is CodexBridgeNormalizedStreamEvent => Boolean(event));
}

export class CodexBridgeRepository {
  private readonly now: () => Date;
  private readonly maxInlineCompletedWorkBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodexBridgeRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxInlineCompletedWorkBytes =
      options.maxInlineCompletedWorkBytes ?? DEFAULT_MAX_INLINE_COMPLETED_WORK_BYTES;
  }

  async enqueueFakeCodexBridgeJob(input: EnqueueFakeCodexBridgeJobInput): Promise<RuntimeJob> {
    const prompt = finalizePromptArtifact(input.promptSource, this.now().toISOString());
    const payload: CodexBridgeJobPayload = {
      family: "codex_bridge",
      executorKind: input.executorKind,
      executionMode: "fake_stream_proof",
      prompt,
      trustPolicy: createTrustPolicy(input.trustProfileId ?? "observe_only"),
      autobailoutPolicy: createAutobailoutPolicy(input.autobailoutPolicy),
      supervisor: createExecutionSupervisorContract(),
      environment: createEnvironmentContract(),
      workQueueLink: input.workQueueLink,
    };
    const job = await this.runtimeJobs.enqueueJob({
      jobId: input.jobId,
      jobType: CODEX_BRIDGE_JOB_TYPE,
      queueName: input.queueName ?? CODEX_BRIDGE_QUEUE,
      priority: input.priority,
      payload,
      idempotencyScope: CODEX_BRIDGE_JOB_TYPE,
      idempotencyKey: input.idempotencyKey,
      parentJobId: input.parentJobId,
      parentWorkflowId: input.parentWorkflowId,
      workItemId: input.workQueueLink?.workItemId ?? null,
    });
    await this.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "codex_bridge.enqueued",
      data: {
        executorKind: input.executorKind,
        executionMode: "fake_stream_proof",
        promptId: prompt.promptId,
        workQueueLink: input.workQueueLink ?? null,
        liveExecutorCallMade: false,
      },
    });
    await this.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "codex_bridge.finalized_prompt",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/codex-bridge/finalized-prompt`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(prompt as unknown as JsonValue),
      metadata: boundDiagnosticJson(prompt),
    });
    await this.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "codex_bridge.environment_contract",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/codex-bridge/environment-contract`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(payload.environment as unknown as JsonValue),
      metadata: boundDiagnosticJson(payload.environment),
    });
    return job;
  }

  async ingestFakeCodexCliStreamEvent(input: {
    jobId: string;
    event: Extract<RawCodexBridgeStreamEvent, { source: "codex_cli" }>;
  }) {
    return this.recordNormalizedStreamEvent(input.jobId, input.event);
  }

  async ingestFakeAcpStreamEvent(input: {
    jobId: string;
    event: Extract<RawCodexBridgeStreamEvent, { jsonrpc: "2.0" }>;
  }) {
    return this.recordNormalizedStreamEvent(input.jobId, input.event);
  }

  async recordNormalizedStreamEvent(
    jobId: string,
    event: RawCodexBridgeStreamEvent,
  ): Promise<CodexBridgeNormalizedStreamEvent> {
    const normalized = normalizeCodexBridgeStreamEvent(event);
    await this.runtimeJobs.recordEvent({
      jobId,
      eventType: "codex_bridge.stream_event",
      data: {
        raw: boundDiagnosticJson(event),
        normalized: boundDiagnosticJson(normalized),
      },
    });
    return normalized;
  }

  async attachCompletedWorkArtifact(input: {
    jobId: string;
    completedWorkKind: CompletedWorkArtifactKind;
    summary: string;
    inlineText?: string;
    pointerUri?: string;
    metadata?: JsonValue;
  }): Promise<RuntimeJobArtifact> {
    if (stringByteLength(input.inlineText) > this.maxInlineCompletedWorkBytes) {
      throw new Error(
        `completed work inline text exceeds ${this.maxInlineCompletedWorkBytes} bytes`,
      );
    }
    const metadata = createCompletedWorkArtifactMetadata(input);
    assertJsonByteLength(
      metadata as unknown as JsonValue,
      this.maxInlineCompletedWorkBytes * 2,
      "completed work metadata",
    );
    return this.runtimeJobs.attachArtifact({
      jobId: input.jobId,
      artifactType: `codex_bridge.completed_work.${input.completedWorkKind}`,
      storageKind: "metadata",
      uri:
        input.pointerUri ?? `runtime-job://${input.jobId}/codex-bridge/${input.completedWorkKind}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(metadata as unknown as JsonValue),
      metadata: metadata as unknown as JsonValue,
    });
  }

  async classifyRebuildFailureAndCreateAutobailoutPlan(input: {
    jobId: string;
    failureSummary: string;
    failureLogs: string[];
    priorStreamEvidenceRefs: string[];
    rebuildEvidenceRefs: string[];
  }): Promise<{
    classification: ReturnType<typeof classifyAutobailoutEligibility>;
    plan: AutobailoutPlan | null;
  }> {
    const job = await this.runtimeJobs.getJob(input.jobId);
    if (!job || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`codex bridge job not found: ${input.jobId}`);
    }
    const classification = classifyAutobailoutEligibility({
      trustPolicy: job.payload.trustPolicy,
      autobailoutPolicy: job.payload.autobailoutPolicy,
      repoPath: job.payload.environment.repoPath,
      originalObjective: job.payload.prompt.objective,
      failureLogs: input.failureLogs,
      priorStreamEvidenceRefs: input.priorStreamEvidenceRefs,
      rebuildEvidenceRefs: input.rebuildEvidenceRefs,
    });
    let plan: AutobailoutPlan | null = null;
    if (classification.eligible) {
      plan = createAutobailoutPlan({
        classification,
        originalObjective: job.payload.prompt.objective,
        failureSummary: input.failureSummary,
        policy: job.payload.autobailoutPolicy,
        evidenceRefs: [...input.priorStreamEvidenceRefs, ...input.rebuildEvidenceRefs],
      });
      await this.runtimeJobs.attachArtifact({
        jobId: input.jobId,
        artifactType: "codex_bridge.autobailout_plan",
        storageKind: "metadata",
        uri: `runtime-job://${input.jobId}/codex-bridge/autobailout-plan`,
        contentType: "application/json",
        sizeBytes: jsonByteLength(plan as unknown as JsonValue),
        metadata: plan as unknown as JsonValue,
      });
    }
    await this.runtimeJobs.recordEvent({
      jobId: input.jobId,
      eventType: "codex_bridge.autobailout_classified",
      data: {
        classification: classification as unknown as JsonValue,
        planCreated: plan !== null,
        liveExecutionStarted: false,
      },
    });
    return { classification, plan };
  }

  async readCodexBridgeExecutionStatus(jobId: string): Promise<CodexBridgeExecutionStatus> {
    const job = await this.runtimeJobs.getJob(jobId);
    const events = await this.runtimeJobs.listEvents(jobId, 500);
    const artifacts = await this.runtimeJobs.listArtifacts(jobId);
    const payload = job && isCodexBridgeJobPayload(job.payload) ? job.payload : null;
    const oversight = this.createOversightSummary(jobId, payload, events, artifacts);
    return {
      job,
      payload,
      completionState: oversight.completionState,
      events,
      artifacts,
      oversight,
    };
  }

  private createOversightSummary(
    jobId: string,
    payload: CodexBridgeJobPayload | null,
    events: RuntimeJobEvent[],
    artifacts: RuntimeJobArtifact[],
  ) {
    const streamEvents = normalizedEventsFromRuntime(
      events.filter((event) => event.eventType === "codex_bridge.stream_event"),
    ).toSorted((left, right) => left.sequence - right.sequence);
    const eventKinds = streamEvents.map((event) => event.eventKind);
    const validationPassed = streamEvents.some(
      (event) =>
        event.eventKind === "validation_completed" &&
        typeof event.data === "object" &&
        event.data !== null &&
        !Array.isArray(event.data) &&
        event.data.success === true,
    );
    const bailoutRequired =
      streamEvents.some((event) => event.eventKind === "rebuild_failed") ||
      artifacts.some((artifact) => artifact.artifactType === "codex_bridge.autobailout_plan");
    const completionState: CodexBridgeCompletionState = classifyCompletionState({
      eventKinds,
      validationPassed,
      bailoutRequired,
    });
    return {
      jobId,
      completionState,
      streamEvents,
      assistantUpdates: streamEvents
        .filter((event) => event.eventKind === "assistant_update")
        .map((event) => event.summary),
      toolOutputs: streamEvents
        .filter((event) => event.eventKind === "tool_call_output")
        .map((event) => event.summary),
      errors: streamEvents
        .filter((event) => event.eventKind === "error" || event.eventKind === "rebuild_failed")
        .map((event) => event.summary),
      finalResponse:
        streamEvents.findLast((event) => event.eventKind === "final_response")?.summary ?? null,
      repoPath: payload?.environment.repoPath ?? null,
      safeUiBridgePresent: payload?.environment.safeUiBridge.tailscaleRequired ?? false,
      eventDiagnostics: summarizeRuntimeEvents(events),
      artifactDiagnostics: summarizeArtifacts(artifacts),
    };
  }
}
