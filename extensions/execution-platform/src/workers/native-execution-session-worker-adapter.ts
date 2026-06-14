import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  buildNativeExecutionTaskMessage,
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION,
  type NativeExecutionSessionPayload,
  type NativeExecutionSessionTaskMessage,
} from "../workflows/native-agentic-orchestration.ts";
import type {
  RuntimeWorkerSupervisorAdapter,
  RuntimeWorkerSupervisorAdapterResult,
} from "./runtime-worker-supervisor.ts";

export const NATIVE_EXECUTION_SESSION_WORKER_ADAPTER_ID =
  "worker.openclaw.native-execution-session" as const;

export type NativeExecutionSessionWorkerRunResult = {
  status: "completed" | "needs_review" | "blocked" | "failed" | "deferred";
  summary: string;
  sessionId: string;
  agentProfile: string;
  artifactRefs?: string[];
  completedWorkEvidenceRefs?: string[];
  reasonCodes: string[];
  retryDelayMs?: number;
  result?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionSessionWorkerRunner = {
  run(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
    payload: NativeExecutionSessionPayload;
    taskMessage: NativeExecutionSessionTaskMessage;
  }): Promise<NativeExecutionSessionWorkerRunResult>;
};

export type NativeExecutionSessionWorkerAdapterOptions = {
  runtimeJobs: RuntimeJobRepository;
  runner: NativeExecutionSessionWorkerRunner;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function asNativeExecutionSessionPayload(value: JsonValue): NativeExecutionSessionPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const session = isRecord(value.session) ? value.session : null;
  const sessionId = stringValue(session?.sessionId);
  const agentProfile = stringValue(session?.agentProfile);
  const objective = stringValue(value.objective);
  if (
    value.artifactKind !== "openclaw.accepted_agent_run" ||
    value.schemaVersion !== NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION ||
    !objective ||
    !sessionId ||
    !agentProfile ||
    !Array.isArray(value.refs)
  ) {
    return null;
  }
  const refs = recordArray(value.refs)
    .map((entry) => {
      const ref = stringValue(entry.ref);
      return ref
        ? {
            ref,
            ...(stringValue(entry.type) ? { type: stringValue(entry.type)! } : {}),
            ...(stringValue(entry.kind) ? { kind: stringValue(entry.kind)! } : {}),
            ...(stringValue(entry.source) ? { source: stringValue(entry.source)! } : {}),
          }
        : null;
    })
    .filter((entry): entry is NativeExecutionSessionPayload["refs"][number] => Boolean(entry));
  if (refs.length === 0) {
    return null;
  }
  const childRelation =
    session?.childRelation === "blocking" || session?.childRelation === "background"
      ? session.childRelation
      : null;
  const parentSessionId = stringValue(session?.parentSessionId);
  return {
    artifactKind: "openclaw.accepted_agent_run",
    schemaVersion: NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION,
    runtimeGenerationId:
      stringValue(value.runtimeGenerationId) ?? "runtime-generation:legacy-unset",
    agentId: stringValue(value.agentId) ?? agentProfile,
    envelope:
      value.envelope === "chat" ||
      value.envelope === "runtime_job" ||
      value.envelope === "proof" ||
      value.envelope === "child_agent"
        ? value.envelope
        : parentSessionId
          ? "child_agent"
          : "runtime_job",
    policyRef: stringValue(value.policyRef),
    objective,
    refs,
    constraints: stringArray(value.constraints),
    validationSignal: stringValue(value.validationSignal),
    session: {
      sessionId,
      agentProfile,
      parentSessionId,
      childRelation,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
    ...(value.runRequest !== undefined ? { runRequest: value.runRequest as JsonValue } : {}),
  };
}

function boundedRefs(...refs: Array<readonly string[] | undefined>): string[] {
  return [...new Set(refs.flatMap((value) => value ?? []))]
    .filter((ref) => typeof ref === "string" && ref.trim().length > 0)
    .map((ref) => ref.slice(0, 260))
    .slice(0, 60);
}

export class NativeExecutionSessionWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId = NATIVE_EXECUTION_SESSION_WORKER_ADAPTER_ID;
  readonly jobTypes = [NATIVE_EXECUTION_SESSION_JOB_TYPE];

  constructor(private readonly options: NativeExecutionSessionWorkerAdapterOptions) {}

  canHandle(job: RuntimeJob): boolean {
    return (
      job.jobType === NATIVE_EXECUTION_SESSION_JOB_TYPE &&
      asNativeExecutionSessionPayload(job.payload) !== null
    );
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    if (input.job.jobType !== NATIVE_EXECUTION_SESSION_JOB_TYPE) {
      return this.needsReview({
        summary: "Runtime job type is not a native execution session.",
        reasonCodes: ["native_execution_session_worker_job_type_not_supported"],
      });
    }
    const payload = asNativeExecutionSessionPayload(input.job.payload);
    if (!payload) {
      return this.needsReview({
        summary:
          "Native execution session payload is missing required objective, refs, or session fields.",
        reasonCodes: ["native_execution_session_worker_payload_invalid"],
      });
    }
    if (payload.runtimeGenerationId === "runtime-generation:legacy-unset") {
      return this.needsReview({
        summary: "Native execution session payload is missing the resident runtime generation id.",
        reasonCodes: ["native_execution_session_worker_runtime_generation_missing"],
      });
    }
    if (!isRecord(payload.runRequest)) {
      return this.needsReview({
        summary: "Native execution session payload is missing the executable accepted run request.",
        reasonCodes: ["native_execution_session_worker_run_request_missing"],
      });
    }
    if (
      payload.rawPromptStored ||
      payload.rawResponseStored ||
      payload.rawProviderLogStored ||
      payload.rawToolLogStored ||
      payload.secretsStored
    ) {
      return this.needsReview({
        summary: "Native execution session payload violated storage safety flags.",
        reasonCodes: ["native_execution_session_worker_payload_storage_flags_rejected"],
      });
    }
    const taskMessage = buildNativeExecutionTaskMessage({
      sessionId: payload.session.sessionId,
      agentProfile: payload.session.agentProfile,
      request: {
        objective: payload.objective,
        refs: payload.refs,
        constraints: payload.constraints,
        validationSignal: payload.validationSignal,
      },
    });
    const run = await this.options.runner.run({
      job: input.job,
      workerId: input.workerId,
      leaseToken: input.leaseToken,
      payload,
      taskMessage,
    });
    const artifactRefs = boundedRefs(run.artifactRefs);
    const completedWorkEvidenceRefs = boundedRefs(run.completedWorkEvidenceRefs, run.artifactRefs);
    if (
      run.rawPromptStored ||
      run.rawResponseStored ||
      run.rawLogsStored ||
      run.workQueueLifecycleMutated
    ) {
      return this.needsReview({
        summary:
          "Native execution session runner violated storage or Work Queue lifecycle safety flags.",
        reasonCodes: ["native_execution_session_worker_runner_safety_flags_rejected"],
        artifactRefs,
        completedWorkEvidenceRefs,
      });
    }
    if (run.status === "completed" && completedWorkEvidenceRefs.length === 0) {
      return this.needsReview({
        summary: "Native execution session claimed completion without runtime evidence refs.",
        reasonCodes: ["native_execution_session_worker_completed_without_evidence"],
        artifactRefs,
      });
    }
    return {
      status: run.status,
      summary: run.summary.slice(0, 1_000),
      result:
        run.result ??
        ({
          status: run.status,
          sessionId: run.sessionId,
          agentProfile: run.agentProfile,
          artifactRefs,
          completedWorkEvidenceRefs,
          reasonCodes: run.reasonCodes.slice(0, 30),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        } satisfies JsonValue),
      artifactRefs,
      completedWorkEvidenceRefs,
      reasonCodes: run.reasonCodes.slice(0, 30),
      retryDelayMs: run.retryDelayMs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private needsReview(input: {
    summary: string;
    reasonCodes: string[];
    artifactRefs?: string[];
    completedWorkEvidenceRefs?: string[];
  }): RuntimeWorkerSupervisorAdapterResult {
    return {
      status: "needs_review",
      summary: input.summary,
      artifactRefs: input.artifactRefs ?? [],
      completedWorkEvidenceRefs: input.completedWorkEvidenceRefs ?? [],
      reasonCodes: input.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
