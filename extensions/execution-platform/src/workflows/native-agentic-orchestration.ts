import { createHash } from "node:crypto";
import type { AnyAgentTool } from "../../../../src/agents/pi-tools.types.js";
import {
  createStartExecutionSessionTool,
  type StartExecutionSessionToolInput,
} from "../../../../src/agents/tools/start-execution-session-tool.js";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";

export const ACCEPTED_AGENT_RUN_JOB_TYPE = "openclaw.accepted_agent_run" as const;
export const NATIVE_EXECUTION_SESSION_JOB_TYPE = ACCEPTED_AGENT_RUN_JOB_TYPE;
export const NATIVE_EXECUTION_SESSION_QUEUE = "native-execution" as const;
export const NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION =
  "openclaw.accepted-agent-run.payload.v1" as const;
export const RUNTIME_EXECUTION_EVENT_ENVELOPE_SCHEMA_VERSION =
  "openclaw.runtime-execution-event-envelope.v1" as const;

export const START_EXECUTION_SESSION_VISIBLE_KEYS = [
  "objective",
  "refs",
  "constraints",
  "validationSignal",
] as const;

export type NativeExecutionRef = {
  ref: string;
  type?: string;
  kind?: string;
  source?: string;
};

export type StartExecutionSessionVisibleInput = {
  objective: string;
  refs: Array<string | NativeExecutionRef>;
  constraints?: string | string[];
  validationSignal?: string;
};

export type NormalizedStartExecutionSessionVisibleInput = {
  objective: string;
  refs: NativeExecutionRef[];
  constraints: string[];
  validationSignal: string | null;
};

export type NativeExecutionSessionEventKind =
  | "execution_session_started"
  | "execution_session_resumed"
  | "child_session_started"
  | "child_session_completed"
  | "child_session_failed"
  | "tool_call_recorded"
  | "mutation_recorded"
  | "validation_recorded"
  | "critic_recorded"
  | "artifact_recorded"
  | "finish_recorded"
  | "control_recorded"
  | "waiting_for_human"
  | "launch_timing_recorded"
  | "agent_launch_recorded"
  | "provider_request_recorded"
  | "provider_wait_lock_handoff_recorded"
  | "turn_reduced";

export type NativeExecutionChildRelation = "blocking" | "background";

export type RuntimeExecutionEventEnvelope = {
  schemaVersion: typeof RUNTIME_EXECUTION_EVENT_ENVELOPE_SCHEMA_VERSION;
  runtimeJobId: string;
  sessionId: string;
  eventKind: NativeExecutionSessionEventKind;
  parentSessionId: string | null;
  childSessionId: string | null;
  childRelation: NativeExecutionChildRelation | null;
  timestamp: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
};

export type RuntimeExecutionEventEnvelopeInput = {
  runtimeJobId: string;
  sessionId: string;
  eventKind: NativeExecutionSessionEventKind;
  parentSessionId?: string | null;
  childSessionId?: string | null;
  childRelation?: NativeExecutionChildRelation | null;
  timestamp?: string | Date;
};

export type NativeExecutionSessionPayload = {
  artifactKind: "openclaw.accepted_agent_run";
  schemaVersion: typeof NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION;
  runtimeGenerationId: string;
  agentId: string;
  envelope: "chat" | "runtime_job" | "proof" | "child_agent";
  policyRef: string | null;
  objective: string;
  refs: NativeExecutionRef[];
  constraints: string[];
  validationSignal: string | null;
  session: {
    sessionId: string;
    agentProfile: string;
    parentSessionId: string | null;
    childRelation: NativeExecutionChildRelation | null;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
  runRequest?: JsonValue;
};

export type NativeExecutionSessionTaskMessage = {
  sessionId: string;
  agentProfile: string;
  text: string;
};

export type EnsureNativeExecutionSessionInput = {
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  taskMessage: NativeExecutionSessionTaskMessage;
  refs: NativeExecutionRef[];
  parentSessionId: string | null;
  childRelation: NativeExecutionChildRelation | null;
};

export type EnsureNativeExecutionSessionResult = {
  sessionId: string;
  sessionKey?: string | null;
};

export type NativeExecutionSessionRuntimeOptions = {
  jobId?: string;
  queueName?: string;
  priority?: number;
  parentRuntimeJobId?: string | null;
  parentSessionId?: string | null;
  childRelation?: NativeExecutionChildRelation | null;
  workItemId?: string | null;
  idempotencyScope?: string;
  idempotencyKey?: string;
  sessionId?: string;
  agentProfile?: string;
  resumeRuntimeJobId?: string;
  resumeRequestId?: string;
};

export type StartNativeExecutionSessionInput = {
  runtimeJobs: RuntimeJobRepository;
  request: StartExecutionSessionVisibleInput;
  runtime?: NativeExecutionSessionRuntimeOptions;
  ensureSession?: (
    input: EnsureNativeExecutionSessionInput,
  ) => Promise<EnsureNativeExecutionSessionResult>;
  now?: () => Date;
};

export type StartNativeExecutionSessionResult = {
  status: "started" | "already_started" | "resumed" | "already_resumed";
  runtimeJob: RuntimeJob;
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  taskMessage: NativeExecutionSessionTaskMessage;
  refs: NativeExecutionRef[];
  event: RuntimeJobEvent;
};

export type NativeExecutionSessionStartToolOptions = {
  runtimeJobs: RuntimeJobRepository;
  runtime?: NativeExecutionSessionRuntimeOptions;
  ensureSession?: (
    input: EnsureNativeExecutionSessionInput,
  ) => Promise<EnsureNativeExecutionSessionResult>;
  now?: () => Date;
};

export type NativeExecutionProgressSnapshot = {
  activeChildSessions?: number;
  totalChildSessions?: number;
  openBlockingChildSessions?: number;
  failedChildSessions?: number;
  wallClockMs?: number;
  tokenCount?: number;
  spendUsd?: number;
  repairAttempts?: number;
  validationCycles?: number;
  noProgressTurns?: number;
  repeatedToolCalls?: number;
  msSinceMeaningfulProgress?: number | null;
  meaningfulProgressNow?: boolean;
};

export type NativeExecutionProgressSafetyPolicy = {
  activeChildWarningThreshold?: number;
  activeChildEscalationThreshold?: number;
  totalChildWarningThreshold?: number;
  noProgressTurnThreshold?: number;
  repeatedToolCallThreshold?: number;
  repairAttemptThreshold?: number;
  validationCycleThreshold?: number;
  wallClockWarningMs?: number;
  tokenWarningThreshold?: number;
  spendWarningUsd?: number;
  staleProgressMs?: number;
};

export type NativeExecutionProgressSafetyEvaluation = {
  status: "continue" | "warn" | "escalate";
  progressSensitive: true;
  fixedBudgetTermination: false;
  meaningfulProgressNow: boolean;
  reasonCodes: string[];
  warnings: string[];
  escalations: string[];
};

const MAX_OBJECTIVE_CHARS = 8_000;
const MAX_REF_CHARS = 2_048;
const MAX_REF_FIELD_CHARS = 160;
const MAX_REFS = 80;
const MAX_CONSTRAINTS = 40;
const MAX_CONSTRAINT_CHARS = 1_000;
const MAX_VALIDATION_SIGNAL_CHARS = 2_000;
const DEFAULT_AGENT_PROFILE = "execution-orchestrator";
const DEFAULT_PROGRESS_SAFETY_POLICY: Required<NativeExecutionProgressSafetyPolicy> = {
  activeChildWarningThreshold: 4,
  activeChildEscalationThreshold: 8,
  totalChildWarningThreshold: 16,
  noProgressTurnThreshold: 4,
  repeatedToolCallThreshold: 6,
  repairAttemptThreshold: 5,
  validationCycleThreshold: 4,
  wallClockWarningMs: 30 * 60 * 1000,
  tokenWarningThreshold: 180_000,
  spendWarningUsd: 10,
  staleProgressMs: 10 * 60 * 1000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedNonEmptyString(value: unknown, maxChars: number, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must be non-empty`);
  }
  if (trimmed.length > maxChars) {
    throw new Error(`${name} must be ${maxChars} characters or fewer`);
  }
  return trimmed;
}

function optionalBoundedString(value: unknown, maxChars: number, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return boundedNonEmptyString(value, maxChars, name);
}

function normalizeConstraints(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length > MAX_CONSTRAINTS) {
    throw new Error(`constraints must include at most ${MAX_CONSTRAINTS} entries`);
  }
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of entries) {
    const normalized = boundedNonEmptyString(entry, MAX_CONSTRAINT_CHARS, "constraint");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output;
}

function normalizeRef(value: string | NativeExecutionRef, index: number): NativeExecutionRef {
  if (typeof value === "string") {
    return { ref: boundedNonEmptyString(value, MAX_REF_CHARS, `refs[${index}]`) };
  }
  if (!isRecord(value)) {
    throw new Error(`refs[${index}] must be a string or ref object`);
  }
  const allowed = new Set(["ref", "type", "kind", "source"]);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error(`refs[${index}] has unsupported fields: ${extra.join(", ")}`);
  }
  const ref = boundedNonEmptyString(value.ref, MAX_REF_CHARS, `refs[${index}].ref`);
  const type = optionalBoundedString(value.type, MAX_REF_FIELD_CHARS, `refs[${index}].type`);
  const kind = optionalBoundedString(value.kind, MAX_REF_FIELD_CHARS, `refs[${index}].kind`);
  const source = optionalBoundedString(value.source, MAX_REF_FIELD_CHARS, `refs[${index}].source`);
  return {
    ref,
    ...(type ? { type } : {}),
    ...(kind ? { kind } : {}),
    ...(source ? { source } : {}),
  };
}

export function normalizeNativeExecutionRefs(
  refs: StartExecutionSessionVisibleInput["refs"],
): NativeExecutionRef[] {
  if (!Array.isArray(refs)) {
    throw new Error("refs must be an array");
  }
  if (refs.length === 0) {
    throw new Error("refs must include at least one bounded source pointer");
  }
  if (refs.length > MAX_REFS) {
    throw new Error(`refs must include at most ${MAX_REFS} entries`);
  }
  const seen = new Set<string>();
  const output: NativeExecutionRef[] = [];
  for (const [index, ref] of refs.entries()) {
    const normalized = normalizeRef(ref, index);
    const key = JSON.stringify(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
  }
  return output;
}

export function assertStartExecutionSessionVisibleInput(
  value: unknown,
): asserts value is StartExecutionSessionVisibleInput {
  if (!isRecord(value)) {
    throw new Error("start_execution_session input must be an object");
  }
  const allowed = new Set<string>(START_EXECUTION_SESSION_VISIBLE_KEYS);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error(
      `start_execution_session visible input only accepts objective, refs, constraints, and validationSignal; unsupported fields: ${extra.join(", ")}`,
    );
  }
  boundedNonEmptyString(value.objective, MAX_OBJECTIVE_CHARS, "objective");
  normalizeNativeExecutionRefs(value.refs as StartExecutionSessionVisibleInput["refs"]);
  normalizeConstraints(value.constraints as StartExecutionSessionVisibleInput["constraints"]);
  if (value.validationSignal !== undefined) {
    boundedNonEmptyString(value.validationSignal, MAX_VALIDATION_SIGNAL_CHARS, "validationSignal");
  }
}

export function normalizeStartExecutionSessionVisibleInput(
  value: unknown,
): NormalizedStartExecutionSessionVisibleInput {
  assertStartExecutionSessionVisibleInput(value);
  return {
    objective: boundedNonEmptyString(value.objective, MAX_OBJECTIVE_CHARS, "objective"),
    refs: normalizeNativeExecutionRefs(value.refs),
    constraints: normalizeConstraints(value.constraints),
    validationSignal:
      value.validationSignal === undefined
        ? null
        : boundedNonEmptyString(
            value.validationSignal,
            MAX_VALIDATION_SIGNAL_CHARS,
            "validationSignal",
          ),
  };
}

function stableHash(value: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function sessionSlugFromHash(hash: string): string {
  return `native_exec_${hash.slice(0, 32)}`;
}

export function buildNativeExecutionSessionPayload(input: {
  request: ReturnType<typeof normalizeStartExecutionSessionVisibleInput>;
  runtimeGenerationId?: string;
  agentId?: string;
  envelope?: NativeExecutionSessionPayload["envelope"];
  policyRef?: string | null;
  sessionId: string;
  agentProfile: string;
  parentSessionId: string | null;
  childRelation: NativeExecutionChildRelation | null;
  runRequest?: JsonValue;
}): NativeExecutionSessionPayload {
  return {
    artifactKind: "openclaw.accepted_agent_run",
    schemaVersion: NATIVE_EXECUTION_SESSION_PAYLOAD_SCHEMA_VERSION,
    runtimeGenerationId: input.runtimeGenerationId ?? "runtime-generation:legacy-unset",
    agentId: input.agentId ?? input.agentProfile,
    envelope: input.envelope ?? (input.parentSessionId ? "child_agent" : "runtime_job"),
    policyRef: input.policyRef ?? null,
    objective: input.request.objective,
    refs: input.request.refs,
    constraints: input.request.constraints,
    validationSignal: input.request.validationSignal,
    session: {
      sessionId: input.sessionId,
      agentProfile: input.agentProfile,
      parentSessionId: input.parentSessionId,
      childRelation: input.childRelation,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
    ...(input.runRequest ? { runRequest: input.runRequest } : {}),
  };
}

export function buildNativeExecutionTaskMessage(input: {
  sessionId: string;
  agentProfile: string;
  request: ReturnType<typeof normalizeStartExecutionSessionVisibleInput>;
}): NativeExecutionSessionTaskMessage {
  const lines = [
    "OpenClaw native execution session",
    "",
    `Objective: ${input.request.objective}`,
    "",
    "Refs:",
    ...input.request.refs.map((ref) => {
      const details = [
        ref.type ? `type=${ref.type}` : null,
        ref.kind ? `kind=${ref.kind}` : null,
        ref.source ? `source=${ref.source}` : null,
      ].filter(Boolean);
      return `- ${ref.ref}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
    }),
  ];
  if (input.request.constraints.length > 0) {
    lines.push("", "Constraints:", ...input.request.constraints.map((entry) => `- ${entry}`));
  }
  if (input.request.validationSignal) {
    lines.push("", `Validation signal: ${input.request.validationSignal}`);
  }
  return {
    sessionId: input.sessionId,
    agentProfile: input.agentProfile,
    text: lines.join("\n"),
  };
}

function isEnvelopeRecord(value: JsonValue): value is RuntimeExecutionEventEnvelope & {
  [key: string]: JsonValue;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, JsonValue>;
  return (
    record.schemaVersion === RUNTIME_EXECUTION_EVENT_ENVELOPE_SCHEMA_VERSION &&
    typeof record.runtimeJobId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.eventKind === "string" &&
    typeof record.timestamp === "string" &&
    record.rawPromptStored === false &&
    record.rawResponseStored === false &&
    record.rawProviderLogStored === false &&
    record.rawToolLogStored === false &&
    record.secretsStored === false
  );
}

export function isRuntimeExecutionEventEnvelope(
  value: JsonValue,
): value is RuntimeExecutionEventEnvelope {
  return isEnvelopeRecord(value);
}

export function buildRuntimeExecutionEventEnvelope(
  input: RuntimeExecutionEventEnvelopeInput,
): RuntimeExecutionEventEnvelope {
  const timestamp =
    input.timestamp instanceof Date
      ? input.timestamp.toISOString()
      : typeof input.timestamp === "string" && input.timestamp.trim()
        ? input.timestamp.trim()
        : new Date().toISOString();
  return {
    schemaVersion: RUNTIME_EXECUTION_EVENT_ENVELOPE_SCHEMA_VERSION,
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    eventKind: input.eventKind,
    parentSessionId: input.parentSessionId ?? null,
    childSessionId: input.childSessionId ?? null,
    childRelation: input.childRelation ?? null,
    timestamp,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
  };
}

export function buildRuntimeExecutionEventData(
  input: RuntimeExecutionEventEnvelopeInput & {
    extra?: Record<string, JsonValue>;
  },
): RuntimeExecutionEventEnvelope & Record<string, JsonValue> {
  return {
    ...input.extra,
    ...buildRuntimeExecutionEventEnvelope(input),
  };
}

function buildEventData(input: {
  runtimeJobId: string;
  sessionId: string;
  eventKind: NativeExecutionSessionEventKind;
  parentSessionId: string | null;
  childSessionId: string | null;
  childRelation: NativeExecutionChildRelation | null;
  timestamp: string;
  request: ReturnType<typeof normalizeStartExecutionSessionVisibleInput>;
  taskMessageRef: string;
  requestId: string;
  status: "started" | "resumed";
}): JsonValue {
  return buildRuntimeExecutionEventData({
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    eventKind: input.eventKind,
    parentSessionId: input.parentSessionId,
    childSessionId: input.childSessionId,
    childRelation: input.childRelation,
    timestamp: input.timestamp,
    extra: {
      objective: input.request.objective,
      refs: input.request.refs as unknown as JsonValue,
      constraints: input.request.constraints,
      validationSignal: input.request.validationSignal,
      taskMessageRef: input.taskMessageRef,
      requestId: input.requestId,
      status: input.status,
    },
  });
}

function eventMatches(input: {
  event: RuntimeJobEvent;
  eventType: string;
  sessionId: string;
  requestId?: string;
}): boolean {
  if (input.event.eventType !== input.eventType) {
    return false;
  }
  const data = input.event.data;
  if (!isEnvelopeRecord(data)) {
    return false;
  }
  if (data.sessionId !== input.sessionId) {
    return false;
  }
  if (input.requestId) {
    return (data as Record<string, JsonValue>).requestId === input.requestId;
  }
  return true;
}

function jsonRecord(value: JsonValue): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : null;
}

function sessionIdFromRuntimeJob(job: RuntimeJob): string | null {
  const payload = jsonRecord(job.payload);
  const session = jsonRecord(jsonRecord(payload?.session ?? null)?.session ?? null);
  const directSession = jsonRecord(payload?.session ?? null);
  const fromDirect =
    directSession && typeof directSession.sessionId === "string" ? directSession.sessionId : null;
  const fromNested = session && typeof session.sessionId === "string" ? session.sessionId : null;
  return fromDirect ?? fromNested;
}

function relationOrNull(value: NativeExecutionChildRelation | null | undefined) {
  return value === "blocking" || value === "background" ? value : null;
}

function positiveNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function evaluateNativeExecutionProgressSafety(
  snapshot: NativeExecutionProgressSnapshot,
  policy: NativeExecutionProgressSafetyPolicy = {},
): NativeExecutionProgressSafetyEvaluation {
  const effective = { ...DEFAULT_PROGRESS_SAFETY_POLICY, ...policy };
  const meaningfulProgressNow = snapshot.meaningfulProgressNow === true;
  const staleProgress =
    typeof snapshot.msSinceMeaningfulProgress === "number" &&
    snapshot.msSinceMeaningfulProgress >= effective.staleProgressMs;
  const warnings: string[] = [];
  const escalations: string[] = [];
  const reasonCodes: string[] = ["native_execution_progress_sensitive_safety_evaluated"];

  if (positiveNumber(snapshot.activeChildSessions) >= effective.activeChildWarningThreshold) {
    warnings.push("many_active_child_sessions");
    reasonCodes.push("native_execution_many_active_child_sessions");
  }
  if (positiveNumber(snapshot.activeChildSessions) >= effective.activeChildEscalationThreshold) {
    escalations.push("active_child_session_fanout_without_current_progress");
    reasonCodes.push("native_execution_active_child_fanout_escalation");
  }
  if (positiveNumber(snapshot.totalChildSessions) >= effective.totalChildWarningThreshold) {
    warnings.push("large_total_child_session_count");
    reasonCodes.push("native_execution_large_total_child_session_count");
  }
  if (positiveNumber(snapshot.noProgressTurns) >= effective.noProgressTurnThreshold) {
    escalations.push("repeated_no_progress_turns");
    reasonCodes.push("native_execution_repeated_no_progress_escalation");
  }
  if (positiveNumber(snapshot.repeatedToolCalls) >= effective.repeatedToolCallThreshold) {
    escalations.push("repeated_tool_calls_without_progress");
    reasonCodes.push("native_execution_repeated_tool_calls_escalation");
  }
  if (positiveNumber(snapshot.repairAttempts) >= effective.repairAttemptThreshold) {
    escalations.push("repair_loop_without_progress");
    reasonCodes.push("native_execution_repair_loop_escalation");
  }
  if (positiveNumber(snapshot.validationCycles) >= effective.validationCycleThreshold) {
    escalations.push("validation_repair_loop_without_progress");
    reasonCodes.push("native_execution_validation_loop_escalation");
  }
  if (staleProgress && !meaningfulProgressNow) {
    escalations.push("stale_meaningful_progress");
    reasonCodes.push("native_execution_stale_progress_escalation");
  }
  if (positiveNumber(snapshot.openBlockingChildSessions) > 0) {
    warnings.push("open_blocking_child_sessions");
    reasonCodes.push("native_execution_open_blocking_children");
  }
  if (positiveNumber(snapshot.failedChildSessions) > 0) {
    warnings.push("failed_child_sessions_present");
    reasonCodes.push("native_execution_failed_children_present");
  }
  if (positiveNumber(snapshot.wallClockMs) >= effective.wallClockWarningMs) {
    warnings.push("long_running_execution");
    reasonCodes.push("native_execution_long_running_warning");
  }
  if (positiveNumber(snapshot.tokenCount) >= effective.tokenWarningThreshold) {
    warnings.push("high_token_pressure");
    reasonCodes.push("native_execution_token_pressure_warning");
  }
  if (positiveNumber(snapshot.spendUsd) >= effective.spendWarningUsd) {
    warnings.push("high_spend_pressure");
    reasonCodes.push("native_execution_spend_pressure_warning");
  }

  if (meaningfulProgressNow && escalations.length > 0) {
    warnings.push(...escalations.map((entry) => `${entry}_deferred_due_to_current_progress`));
    reasonCodes.push("native_execution_escalation_deferred_due_to_current_progress");
    escalations.length = 0;
  }

  return {
    status: escalations.length > 0 ? "escalate" : warnings.length > 0 ? "warn" : "continue",
    progressSensitive: true,
    fixedBudgetTermination: false,
    meaningfulProgressNow,
    reasonCodes: uniqueStrings(reasonCodes),
    warnings: uniqueStrings(warnings),
    escalations: uniqueStrings(escalations),
  };
}

export async function startNativeExecutionSession(
  input: StartNativeExecutionSessionInput,
): Promise<StartNativeExecutionSessionResult> {
  const request = normalizeStartExecutionSessionVisibleInput(input.request);
  const agentProfile = input.runtime?.agentProfile?.trim() || DEFAULT_AGENT_PROFILE;
  const parentSessionId = input.runtime?.parentSessionId?.trim() || null;
  const childRelation = relationOrNull(input.runtime?.childRelation);
  const now = input.now ?? (() => new Date());
  const requestHash = stableHash({
    objective: request.objective,
    refs: request.refs,
    constraints: request.constraints,
    validationSignal: request.validationSignal,
    parentRuntimeJobId: input.runtime?.parentRuntimeJobId ?? null,
    parentSessionId,
    childRelation,
    agentProfile,
  });
  const sessionId = input.runtime?.sessionId?.trim() || sessionSlugFromHash(requestHash);
  const taskMessage = buildNativeExecutionTaskMessage({ sessionId, agentProfile, request });

  if (input.runtime?.resumeRuntimeJobId?.trim()) {
    const runtimeJobId = input.runtime.resumeRuntimeJobId.trim();
    const job = await input.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      throw new Error(`runtime job ${runtimeJobId} was not found for native execution resume`);
    }
    const resumedSessionId =
      input.runtime.sessionId?.trim() || sessionIdFromRuntimeJob(job) || sessionId;
    const resumedTaskMessage = buildNativeExecutionTaskMessage({
      sessionId: resumedSessionId,
      agentProfile,
      request,
    });
    await input.ensureSession?.({
      runtimeJobId: job.jobId,
      sessionId: resumedSessionId,
      agentProfile,
      taskMessage: resumedTaskMessage,
      refs: request.refs,
      parentSessionId,
      childRelation,
    });
    const requestId =
      input.runtime.resumeRequestId?.trim() ||
      stableHash({ resumeRuntimeJobId: job.jobId, request, sessionId: resumedSessionId }).slice(
        0,
        32,
      );
    const existing = (await input.runtimeJobs.listEvents(job.jobId, 500)).find((event) =>
      eventMatches({
        event,
        eventType: "execution.session.resumed",
        sessionId: resumedSessionId,
        requestId,
      }),
    );
    if (existing) {
      return {
        status: "already_resumed",
        runtimeJob: job,
        runtimeJobId: job.jobId,
        sessionId: resumedSessionId,
        agentProfile,
        taskMessage: resumedTaskMessage,
        refs: request.refs,
        event: existing,
      };
    }
    const event = await input.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.session.resumed",
      data: buildEventData({
        runtimeJobId: job.jobId,
        sessionId: resumedSessionId,
        eventKind: "execution_session_resumed",
        parentSessionId,
        childSessionId: parentSessionId ? resumedSessionId : null,
        childRelation: parentSessionId ? childRelation : null,
        timestamp: now().toISOString(),
        request,
        taskMessageRef: `native-session://${resumedSessionId}/task/start`,
        requestId,
        status: "resumed",
      }),
    });
    return {
      status: "resumed",
      runtimeJob: job,
      runtimeJobId: job.jobId,
      sessionId: resumedSessionId,
      agentProfile,
      taskMessage: resumedTaskMessage,
      refs: request.refs,
      event,
    };
  }

  const payload = buildNativeExecutionSessionPayload({
    request,
    sessionId,
    agentProfile,
    parentSessionId,
    childRelation,
  });
  const idempotencyScope = input.runtime?.idempotencyScope ?? NATIVE_EXECUTION_SESSION_JOB_TYPE;
  const idempotencyKey = input.runtime?.idempotencyKey ?? `native-execution:${requestHash}`;
  const job = await input.runtimeJobs.enqueueJob({
    jobId: input.runtime?.jobId,
    jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
    queueName: input.runtime?.queueName ?? NATIVE_EXECUTION_SESSION_QUEUE,
    priority: input.runtime?.priority,
    payload: payload as JsonValue,
    idempotencyScope,
    idempotencyKey,
    parentJobId: input.runtime?.parentRuntimeJobId ?? null,
    workItemId: input.runtime?.workItemId ?? null,
  });
  await input.ensureSession?.({
    runtimeJobId: job.jobId,
    sessionId,
    agentProfile,
    taskMessage,
    refs: request.refs,
    parentSessionId,
    childRelation,
  });
  const existing = (await input.runtimeJobs.listEvents(job.jobId, 500)).find((event) =>
    eventMatches({
      event,
      eventType: "execution.session.started",
      sessionId,
    }),
  );
  if (existing) {
    return {
      status: "already_started",
      runtimeJob: job,
      runtimeJobId: job.jobId,
      sessionId,
      agentProfile,
      taskMessage,
      refs: request.refs,
      event: existing,
    };
  }
  const event = await input.runtimeJobs.recordEvent({
    jobId: job.jobId,
    eventType: "execution.session.started",
    data: buildEventData({
      runtimeJobId: job.jobId,
      sessionId,
      eventKind: parentSessionId ? "child_session_started" : "execution_session_started",
      parentSessionId,
      childSessionId: parentSessionId ? sessionId : null,
      childRelation: parentSessionId ? childRelation : null,
      timestamp: now().toISOString(),
      request,
      taskMessageRef: `native-session://${sessionId}/task/start`,
      requestId: idempotencyKey,
      status: "started",
    }),
  });
  return {
    status: "started",
    runtimeJob: job,
    runtimeJobId: job.jobId,
    sessionId,
    agentProfile,
    taskMessage,
    refs: request.refs,
    event,
  };
}

export function createNativeExecutionSessionStartTool(
  options: NativeExecutionSessionStartToolOptions,
): AnyAgentTool {
  return createStartExecutionSessionTool({
    startExecutionSession: async (request: StartExecutionSessionToolInput) => {
      const result = await startNativeExecutionSession({
        runtimeJobs: options.runtimeJobs,
        request,
        runtime: options.runtime,
        ensureSession: options.ensureSession,
        now: options.now,
      });
      return {
        status: result.status,
        runtimeJobId: result.runtimeJobId,
        sessionId: result.sessionId,
        agentProfile: result.agentProfile,
        eventType: result.event.eventType,
      };
    },
  });
}
