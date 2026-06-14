import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  buildRuntimeExecutionEventData,
  type NativeExecutionSessionEventKind,
  type RuntimeExecutionEventEnvelope,
} from "./native-agentic-orchestration.ts";

export type NativeExecutionControlKind =
  | "pause"
  | "resume"
  | "cancel"
  | "redirect"
  | "waiting_for_human";

export type NativeExecutionControlInput = {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  sessionId: string;
  controlKind: NativeExecutionControlKind;
  reason?: string | null;
  message?: string | null;
  targetSessionIds?: string[];
  redirectMessage?: string | null;
  question?: string | null;
  actorId?: string | null;
  now?: () => Date;
};

export type NativeExecutionControlResult = {
  status: "recorded" | "canceled";
  runtimeJob: RuntimeJob;
  event: RuntimeJobEvent;
  reasonCodes: string[];
};

const MAX_CONTROL_TEXT_CHARS = 2_000;
const MAX_CONTROL_TARGETS = 20;

function boundedString(value: string | null | undefined, maxChars: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxChars) : null;
}

function boundedTargetSessionIds(
  values: string[] | undefined,
  fallbackSessionId: string,
): string[] {
  const targets = values?.length ? values : [fallbackSessionId];
  return Array.from(
    new Set(
      targets
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, MAX_CONTROL_TARGETS),
    ),
  );
}

function eventTypeForControl(controlKind: NativeExecutionControlKind): string {
  return controlKind === "waiting_for_human"
    ? "execution.waiting_for_human"
    : `execution.control.${controlKind}`;
}

function eventKindForControl(
  controlKind: NativeExecutionControlKind,
): NativeExecutionSessionEventKind {
  return controlKind === "waiting_for_human" ? "waiting_for_human" : "control_recorded";
}

function buildControlEventData(input: {
  runtimeJobId: string;
  sessionId: string;
  controlKind: NativeExecutionControlKind;
  reason: string | null;
  message: string | null;
  targetSessionIds: string[];
  redirectMessage: string | null;
  question: string | null;
  actorId: string | null;
  timestamp: string;
  reasonCodes: string[];
}): RuntimeExecutionEventEnvelope & Record<string, JsonValue> {
  return buildRuntimeExecutionEventData({
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    eventKind: eventKindForControl(input.controlKind),
    parentSessionId: null,
    childSessionId: null,
    childRelation: null,
    timestamp: input.timestamp,
    extra: {
      controlKind: input.controlKind,
      reason: input.reason,
      message: input.message,
      targetSessionIds: input.targetSessionIds,
      redirectMessage: input.redirectMessage,
      waitingForHumanQuestion: input.question,
      actorId: input.actorId,
      reasonCodes: input.reasonCodes,
      workQueueLifecycleMutationAllowed: false,
    },
  });
}

export async function applyNativeExecutionControl(
  input: NativeExecutionControlInput,
): Promise<NativeExecutionControlResult> {
  const runtimeJobId = boundedString(input.runtimeJobId, 200);
  const sessionId = boundedString(input.sessionId, 300);
  if (!runtimeJobId) {
    throw new Error("native execution control requires runtimeJobId");
  }
  if (!sessionId) {
    throw new Error("native execution control requires sessionId");
  }
  const now = input.now ?? (() => new Date());
  const reason = boundedString(input.reason, MAX_CONTROL_TEXT_CHARS);
  const message = boundedString(input.message, MAX_CONTROL_TEXT_CHARS);
  const redirectMessage = boundedString(input.redirectMessage, MAX_CONTROL_TEXT_CHARS);
  const question = boundedString(input.question, MAX_CONTROL_TEXT_CHARS);
  const actorId = boundedString(input.actorId, 300);
  const targetSessionIds = boundedTargetSessionIds(input.targetSessionIds, sessionId);
  const reasonCodes = [
    "native_execution_control_recorded",
    `native_execution_control_kind:${input.controlKind}`,
    input.controlKind === "cancel"
      ? "native_execution_control_cancel_terminalizes_runtime_job"
      : null,
    input.controlKind === "redirect" ? "native_execution_control_redirect_appends_steering" : null,
    input.controlKind === "waiting_for_human"
      ? "native_execution_control_waiting_for_human_question_recorded"
      : null,
  ].filter((value): value is string => Boolean(value));
  let runtimeJob = await input.runtimeJobs.getJob(runtimeJobId);
  if (!runtimeJob) {
    throw new Error(`runtime job ${runtimeJobId} was not found for native execution control`);
  }
  if (input.controlKind === "cancel") {
    runtimeJob =
      (await input.runtimeJobs.cancelJob(runtimeJobId, reason ?? "native execution canceled")) ??
      runtimeJob;
  }
  const event = await input.runtimeJobs.recordEvent({
    jobId: runtimeJobId,
    eventType: eventTypeForControl(input.controlKind),
    data: buildControlEventData({
      runtimeJobId,
      sessionId,
      controlKind: input.controlKind,
      reason,
      message,
      targetSessionIds,
      redirectMessage,
      question,
      actorId,
      timestamp: now().toISOString(),
      reasonCodes,
    }),
  });
  return {
    status: input.controlKind === "cancel" ? "canceled" : "recorded",
    runtimeJob,
    event,
    reasonCodes,
  };
}
