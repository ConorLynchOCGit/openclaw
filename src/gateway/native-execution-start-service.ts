import {
  buildNativeExecutionSessionPayload,
  buildRuntimeExecutionEventData,
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  NATIVE_EXECUTION_SESSION_QUEUE,
  type NativeExecutionSessionRuntimeOptions,
  type StartExecutionSessionVisibleInput,
  type StartNativeExecutionSessionResult,
} from "../../extensions/execution-platform/runtime-api.js";
import type {
  JsonValue,
  RuntimeJobRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import type { OpenClawAcceptedAgentRun } from "../agents/openclaw-agent-runtime-contracts.js";
import type { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";

type NativeExecutionStartServiceInput = {
  runtimeJobs: RuntimeJobRepository;
  request: StartExecutionSessionVisibleInput;
  runtime?: NativeExecutionSessionRuntimeOptions;
};

type NativeExecutionPreflightResult = {
  artifactKind: "openclaw.runtime_generation.acceptance";
  accepted: boolean;
  runtimeGenerationId: string | null;
  error: JsonValue | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

export type NativeExecutionReadinessResult = {
  artifactKind: "openclaw.native_execution.readiness";
  schemaVersion: "openclaw.native-execution.readiness.v1";
  accepted: boolean;
  status: "ready" | "not_ready";
  runtimeUid: number | null;
  runtimeGid: number | null;
  configPath: string;
  configSnapshotId: string;
  catalogSnapshotId: string;
  runtimeRoots: JsonValue;
  agentChecks: JsonValue[];
  assetChecks: JsonValue[];
  reasonCodes: string[];
  nativeDoctorReadOnly: true;
  providerCatalogRefreshed: false;
  runtimeJobCreated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

function jsonRecord(value: JsonValue): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}

function nativeExecutionStartEventMatches(input: {
  event: { eventType: string; data: JsonValue };
  sessionId: string;
  requestId: string;
}): boolean {
  if (input.event.eventType !== "execution.session.started") {
    return false;
  }
  const data = jsonRecord(input.event.data);
  return data?.sessionId === input.sessionId && data.requestId === input.requestId;
}

function safeErrorJson(error: unknown): JsonValue {
  const record =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown; message?: unknown })
      : {};
  return {
    errorName:
      typeof record.name === "string"
        ? record.name.slice(0, 120)
        : error instanceof Error
          ? error.name.slice(0, 120)
          : "Error",
    errorCode: typeof record.code === "string" ? record.code.slice(0, 120) : null,
    errorMessage:
      typeof record.message === "string"
        ? record.message.slice(0, 500)
        : error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
  };
}

export async function commitAcceptedNativeExecutionJob(input: {
  runtimeJobs: RuntimeJobRepository;
  accepted: OpenClawAcceptedAgentRun;
  runtime?: NativeExecutionSessionRuntimeOptions;
  now?: () => Date;
}): Promise<StartNativeExecutionSessionResult> {
  const accepted = input.accepted;
  const payload = buildNativeExecutionSessionPayload({
    request: accepted.request,
    runtimeGenerationId: accepted.runtimeGenerationId,
    agentId: accepted.agentId,
    envelope: accepted.envelope,
    policyRef: accepted.policyRef,
    sessionId: accepted.sessionId,
    agentProfile: accepted.agentId,
    parentSessionId: accepted.parentSessionId,
    childRelation: accepted.childRelation,
    runRequest: accepted.runRequest as unknown as JsonValue,
  });
  const job = await input.runtimeJobs.enqueueJob({
    jobId: input.runtime?.jobId,
    jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
    queueName: input.runtime?.queueName ?? NATIVE_EXECUTION_SESSION_QUEUE,
    priority: input.runtime?.priority,
    payload: payload as JsonValue,
    idempotencyScope: accepted.idempotencyScope,
    idempotencyKey: accepted.idempotencyKey,
    parentJobId: input.runtime?.parentRuntimeJobId ?? null,
    workItemId: input.runtime?.workItemId ?? null,
  });
  const jobPayload = jsonRecord(job.payload);
  if (jobPayload?.artifactKind !== "openclaw.accepted_agent_run") {
    throw new Error(
      "native execution idempotency conflict: existing job is not an accepted agent run",
    );
  }
  if (jobPayload?.runtimeGenerationId !== accepted.runtimeGenerationId) {
    throw new Error(
      "native execution idempotency conflict: existing job references a different runtime generation",
    );
  }
  const existing = (await input.runtimeJobs.listEvents(job.jobId, 500)).find((event) =>
    nativeExecutionStartEventMatches({
      event,
      sessionId: accepted.sessionId,
      requestId: accepted.idempotencyKey,
    }),
  );
  const event =
    existing ??
    (await input.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.session.started",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: job.jobId,
        sessionId: accepted.sessionId,
        eventKind: accepted.parentSessionId ? "child_session_started" : "execution_session_started",
        parentSessionId: accepted.parentSessionId,
        childSessionId: accepted.parentSessionId ? accepted.sessionId : null,
        childRelation: accepted.parentSessionId ? accepted.childRelation : null,
        timestamp: (input.now ?? (() => new Date()))().toISOString(),
        extra: {
          objective: accepted.request.objective,
          refs: accepted.request.refs as unknown as JsonValue,
          constraints: accepted.request.constraints,
          validationSignal: accepted.request.validationSignal,
          taskMessageRef: `native-session://${accepted.sessionId}/task/start`,
          requestId: accepted.idempotencyKey,
          status: "started",
          runtimeGenerationId: accepted.runtimeGenerationId,
          agentId: accepted.agentId,
          envelope: accepted.envelope,
          policyRef: accepted.policyRef,
          configSnapshotId: accepted.metadata.configSnapshotId,
          catalogSnapshotId: accepted.metadata.catalogSnapshotId,
          promptProfileHash: accepted.metadata.promptProfileHash,
          toolPolicyHash: accepted.metadata.toolPolicyHash,
        },
      }),
    }));
  return {
    status: existing ? "already_started" : "started",
    runtimeJob: job,
    runtimeJobId: job.jobId,
    sessionId: accepted.sessionId,
    agentProfile: accepted.agentId,
    taskMessage: accepted.taskMessage,
    refs: accepted.request.refs,
    event,
  };
}

export class NativeExecutionStartService {
  private readonly agentRuntime: OpenClawAgentRuntime;

  constructor(private readonly options: { agentRuntime: OpenClawAgentRuntime }) {
    this.agentRuntime = options.agentRuntime;
  }

  async readiness(): Promise<NativeExecutionReadinessResult> {
    const runtimeStatus = this.agentRuntime.status();
    return {
      artifactKind: "openclaw.native_execution.readiness",
      schemaVersion: "openclaw.native-execution.readiness.v1",
      accepted: runtimeStatus.accepted,
      status: runtimeStatus.status,
      runtimeUid: typeof process.getuid === "function" ? process.getuid() : null,
      runtimeGid: typeof process.getgid === "function" ? process.getgid() : null,
      configPath: runtimeStatus.configPath,
      configSnapshotId: runtimeStatus.configSnapshotId,
      catalogSnapshotId: runtimeStatus.catalogSnapshotId,
      runtimeRoots: runtimeStatus.runtimeRoots as unknown as JsonValue,
      agentChecks: runtimeStatus.agentChecks,
      assetChecks: [],
      reasonCodes: ["runtime_generation_status_projected", ...runtimeStatus.reasonCodes],
      nativeDoctorReadOnly: true,
      providerCatalogRefreshed: false,
      runtimeJobCreated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    };
  }

  async preflight(
    input: NativeExecutionStartServiceInput,
  ): Promise<NativeExecutionPreflightResult> {
    try {
      const accepted = this.agentRuntime.acceptNativeExecutionSession({
        request: input.request,
        runtime: input.runtime,
        envelope: input.runtime?.parentSessionId ? "child_agent" : "runtime_job",
      });
      return {
        artifactKind: "openclaw.runtime_generation.acceptance",
        accepted: true,
        runtimeGenerationId: accepted.runtimeGenerationId,
        error: null,
        reasonCodes: [
          "runtime_generation_acceptance_passed",
          `runtime_generation:${accepted.runtimeGenerationId}`,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      };
    } catch (error) {
      return {
        artifactKind: "openclaw.runtime_generation.acceptance",
        accepted: false,
        runtimeGenerationId: null,
        error: safeErrorJson(error),
        reasonCodes: [
          "runtime_generation_acceptance_failed",
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      };
    }
  }

  async start(input: NativeExecutionStartServiceInput): Promise<StartNativeExecutionSessionResult> {
    const accepted = this.agentRuntime.acceptNativeExecutionSession({
      request: input.request,
      runtime: input.runtime,
      envelope: input.runtime?.parentSessionId ? "child_agent" : "runtime_job",
    });
    return await commitAcceptedNativeExecutionJob({
      runtimeJobs: input.runtimeJobs,
      accepted,
      runtime: input.runtime,
    });
  }
}
