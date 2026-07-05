import { createHash } from "node:crypto";
import type {
  GatewaySessionRow,
  SessionReadbackProvenance,
} from "../gateway/session-utils.types.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import type {
  ActiveWorkObservation,
  ChildRunObservation,
  EvidenceMismatch,
  EvidenceObservation,
  EvidenceRef,
  EvidenceSubject,
  FinalityObservation,
  HandoffDelivery,
  HandoffKind,
  HandoffObservation,
  ProvenanceRef,
  ReadbackEvidenceView,
  SkillUseObservation,
} from "./evidence-schema.js";

type SessionEvidenceInput = Pick<
  GatewaySessionRow,
  "key" | "status" | "sessionId" | "finalAssistantText" | "activeProgress" | "readbackProvenance"
> & {
  agentId?: string | null;
};

type TaskEvidenceInput = {
  taskId: string;
  status?: string | null;
  agentId?: string | null;
  requesterSessionKey?: string | null;
  ownerKey?: string | null;
  childSessionKey?: string | null;
  activeProgress?: ReadbackProgressProjection | null;
  resultSession?: {
    sessionKey: string;
    agentId?: string | null;
    finalAssistantText?: string | null;
    readbackProvenance?: SessionReadbackProvenance | null;
  } | null;
};

export type ChildRunEvidenceInput = {
  runId?: string | null;
  executionTaskId?: string | null;
  requesterSessionKey?: string | null;
  childSessionKey?: string | null;
  agentId?: string | null;
  taskName?: string | null;
  label?: string | null;
  status?: string | null;
  phase?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  elapsedMs?: number | null;
  activeTool?: string | null;
  spawnReason?: string | null;
  handoffKind?: string | null;
  handoffDeliveryState?: string | null;
  contentDigest?: string | null;
  contentChars?: number | null;
  terminalSummary?: string | null;
  errorSummary?: string | null;
};

export type SkillEvidenceInput = {
  agentId?: string | null;
  skillName?: string | null;
  skillPath?: string | null;
  skillSource?: string | null;
  activation?: string | null;
  sessionKey?: string | null;
  runId?: string | null;
  eventId?: string | null;
  createdAt?: string | null;
  toolCallId?: string | null;
};

function digestText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sessionPrimaryRef(
  sessionKey: string | null | undefined,
  agentId?: string | null,
): EvidenceRef {
  const agentPart = agentId ? ` --agent ${agentId}` : "";
  return {
    kind: "session",
    ref: sessionKey ? `openclaw sessions show ${sessionKey}${agentPart}` : "session:unknown",
  };
}

function taskPrimaryRef(taskId: string | null | undefined): EvidenceRef {
  return {
    kind: "task",
    ref: taskId ? `openclaw tasks show ${taskId}` : "task:unknown",
  };
}

function provenanceFromSession(
  provenance: SessionReadbackProvenance | null | undefined,
): ProvenanceRef[] {
  if (!provenance) {
    return [];
  }
  const refs: ProvenanceRef[] = [];
  for (const [key, value] of Object.entries(provenance)) {
    if (!value) {
      continue;
    }
    refs.push({
      kind: value.source === "session-transcript" ? "transcript" : "session",
      ref: value.ref,
      label: key,
      source: value.source,
      note: value.note ?? undefined,
    });
  }
  return refs;
}

function provenanceFromProgress(
  progress: ReadbackProgressProjection | null | undefined,
): ProvenanceRef[] {
  if (!progress) {
    return [];
  }
  const ref = progress.ref ?? progress.pointer?.ref ?? "progress:unknown";
  return [
    {
      kind: progress.source === "trajectory" ? "trajectory" : "task",
      ref,
      source: progress.source,
      observedAt: progress.observedAt ?? undefined,
      note: progress.note ?? undefined,
    },
  ];
}

function finalityState(status: string | null | undefined): FinalityObservation["state"] {
  if (status === "done" || status === "completed" || status === "succeeded") {
    return "succeeded";
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "running" || status === "active" || status === "queued") {
    return "active";
  }
  return "unknown";
}

function normalizeActivePhase(
  phase: string | null | undefined,
  fallbackStatus: string | null | undefined,
): ActiveWorkObservation["payload"]["phase"] {
  const value = phase ?? fallbackStatus ?? "running";
  if (value === "queued") {
    return "queued";
  }
  if (value === "waiting_on_child") {
    return "waiting_on_child";
  }
  if (value === "synthesizing_after_child_work") {
    return "synthesizing_after_child_work";
  }
  if (value === "reviewing") {
    return "reviewing";
  }
  if (value === "finalizing") {
    return "finalizing";
  }
  if (value === "done" || value === "completed" || value === "succeeded") {
    return "succeeded";
  }
  if (value === "failed" || value === "error") {
    return "failed";
  }
  return "running";
}

function isWaitPhase(phase: ActiveWorkObservation["payload"]["phase"]): boolean {
  return phase === "queued" || phase === "waiting_on_child";
}

function pointerSessionKey(progress: ReadbackProgressProjection | null | undefined): string | null {
  return progress?.pointer?.kind === "session" ? progress.pointer.ref : null;
}

function mismatchForSessionFinality(params: {
  subject: EvidenceSubject;
  status: string | null;
  finalAssistantText: string | null;
  provenance: SessionReadbackProvenance | null;
}): EvidenceMismatch[] {
  if (!params.finalAssistantText) {
    return [];
  }
  const statusSource = params.provenance?.status?.source ?? null;
  if (
    params.status === "done" &&
    statusSource === "session-transcript" &&
    params.provenance?.status?.note
  ) {
    return [
      {
        mismatchId: `finality:${params.subject.sessionKey ?? "unknown"}:status-corrected`,
        kind: "status_conflict",
        severity: "info",
        label: "Status corrected from final assistant transcript evidence.",
        preview: params.provenance.status.note,
        observations: [sessionPrimaryRef(params.subject.sessionKey, params.subject.agentId)],
        provenance: [
          {
            kind: "transcript",
            ref: params.provenance.status.ref,
            source: params.provenance.status.source,
            note: params.provenance.status.note,
          },
        ],
      },
    ];
  }
  return [];
}

export function buildSessionReadbackEvidenceView(
  session: SessionEvidenceInput,
): ReadbackEvidenceView {
  const finalAssistantText =
    typeof session.finalAssistantText === "string" && session.finalAssistantText.length > 0
      ? session.finalAssistantText
      : null;
  const status = session.status ?? "unknown";
  const provenance = session.readbackProvenance ?? null;
  const subject: EvidenceSubject = {
    kind: "session",
    sessionKey: session.key,
    agentId: session.agentId ?? undefined,
  };
  const primaryRef = sessionPrimaryRef(session.key, session.agentId);
  const finality: FinalityObservation = {
    type: "finality",
    subject,
    state: finalityState(status),
    label: finalAssistantText ? "Final assistant text found" : "Final assistant text unavailable",
    primaryRef,
    provenance: provenanceFromSession(provenance),
    payload: {
      finalAssistantTextPresent: finalAssistantText !== null,
      ...(finalAssistantText ? { finalAssistantText } : {}),
      finalAssistantTextChars: finalAssistantText?.length,
      finalAssistantTextDigest: finalAssistantText ? digestText(finalAssistantText) : undefined,
      finalAssistantTextRef: finalAssistantText ? primaryRef : undefined,
      resultPresent: finalAssistantText !== null,
      resultRef: finalAssistantText ? primaryRef : undefined,
      ownerAgentId: session.agentId ?? undefined,
    },
  };
  const activeProgress = session.activeProgress ?? null;
  const phase = normalizeActivePhase(activeProgress?.currentPhase, status);
  const activeWork: ActiveWorkObservation = {
    type: "active_work",
    subject,
    state:
      phase === "succeeded"
        ? "succeeded"
        : phase === "failed"
          ? "failed"
          : activeProgress
            ? "active"
            : "unknown",
    label: activeProgress?.activeLabel ?? phase,
    primaryRef,
    provenance: provenanceFromProgress(activeProgress),
    observedAt: activeProgress?.observedAt ?? undefined,
    payload: {
      phase,
      activeAgentId: session.agentId ?? undefined,
      activeChildRunId: pointerSessionKey(activeProgress) ?? undefined,
      activeTool: activeProgress?.toolName ?? undefined,
      activeToolEvidence: activeProgress?.toolName ? "available" : "unavailable",
      waitReason: isWaitPhase(phase) ? (activeProgress?.note ?? undefined) : undefined,
      resultPreview: isWaitPhase(phase)
        ? undefined
        : (activeProgress?.outputSummary ?? activeProgress?.note ?? undefined),
    },
  };
  return {
    subject,
    observations: [finality, activeWork],
    mismatches: mismatchForSessionFinality({
      subject,
      status,
      finalAssistantText,
      provenance,
    }),
    buildProvenance: provenanceFromSession(provenance),
  };
}

export function buildTaskReadbackEvidenceView(task: TaskEvidenceInput): ReadbackEvidenceView {
  const activeProgress = task.activeProgress ?? null;
  const resultSession = task.resultSession ?? null;
  const finalAssistantText =
    typeof resultSession?.finalAssistantText === "string" &&
    resultSession.finalAssistantText.length > 0
      ? resultSession.finalAssistantText
      : null;
  const resultPrimaryRef = resultSession
    ? sessionPrimaryRef(resultSession.sessionKey, resultSession.agentId ?? task.agentId)
    : null;
  const sessionKey = task.requesterSessionKey ?? task.ownerKey ?? undefined;
  const subject: EvidenceSubject = {
    kind: "task",
    sessionKey,
    taskId: task.taskId,
    agentId: task.agentId ?? undefined,
  };
  const primaryRef = taskPrimaryRef(task.taskId);
  const phase = normalizeActivePhase(activeProgress?.currentPhase, task.status);
  const finality: FinalityObservation = {
    type: "finality",
    subject,
    state: finalityState(task.status),
    label: "Task finality evidence",
    primaryRef,
    provenance: [
      ...provenanceFromSession(resultSession?.readbackProvenance),
      ...(resultPrimaryRef ? [resultPrimaryRef] : []),
    ],
    payload: {
      finalAssistantTextPresent: finalAssistantText !== null,
      finalAssistantTextChars: finalAssistantText?.length,
      finalAssistantTextDigest: finalAssistantText ? digestText(finalAssistantText) : undefined,
      finalAssistantTextRef: resultPrimaryRef ?? undefined,
      resultPresent: finalAssistantText !== null,
      resultRef: resultPrimaryRef ?? undefined,
      ownerAgentId: task.agentId ?? undefined,
    },
  };
  const activeWork: ActiveWorkObservation = {
    type: "active_work",
    subject,
    state:
      phase === "succeeded"
        ? "succeeded"
        : phase === "failed"
          ? "failed"
          : activeProgress
            ? "active"
            : "unknown",
    label: activeProgress?.activeLabel ?? phase,
    primaryRef,
    provenance: provenanceFromProgress(activeProgress),
    observedAt: activeProgress?.observedAt ?? undefined,
    payload: {
      phase,
      activeAgentId: task.agentId ?? undefined,
      activeChildRunId: pointerSessionKey(activeProgress) ?? task.childSessionKey ?? undefined,
      activeTool: activeProgress?.toolName ?? undefined,
      activeToolEvidence: activeProgress?.toolName ? "available" : "unavailable",
      waitReason: isWaitPhase(phase) ? (activeProgress?.note ?? undefined) : undefined,
      resultPreview: isWaitPhase(phase)
        ? undefined
        : (activeProgress?.outputSummary ?? activeProgress?.note ?? undefined),
    },
  };
  return {
    subject,
    observations: [finality, activeWork],
    mismatches: [],
    buildProvenance: provenanceFromProgress(activeProgress),
  };
}

export function buildEmptyReadbackEvidenceView(params: {
  kind: EvidenceSubject["kind"];
  sessionKey?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  reason: string;
}): ReadbackEvidenceView {
  const subject: EvidenceSubject = {
    kind: params.kind,
    sessionKey: params.sessionKey ?? undefined,
    taskId: params.taskId ?? undefined,
    agentId: params.agentId ?? undefined,
  };
  const primaryRef: EvidenceRef =
    params.kind === "task"
      ? taskPrimaryRef(params.taskId)
      : sessionPrimaryRef(params.sessionKey, params.agentId);
  return {
    subject,
    observations: [
      {
        type: "finality",
        subject,
        state: "unknown",
        label: "Missing readback evidence",
        preview: params.reason,
        primaryRef,
        provenance: [],
        payload: {
          finalAssistantTextPresent: false,
          resultPresent: false,
        },
      },
      {
        type: "active_work",
        subject,
        state: "unavailable",
        label: "Active work evidence unavailable",
        preview: params.reason,
        primaryRef,
        provenance: [],
        payload: {
          phase: "running",
          activeToolEvidence: "unavailable",
        },
      },
    ],
    mismatches: [
      {
        mismatchId: `${params.kind}:${params.sessionKey ?? params.taskId ?? "unknown"}:missing`,
        kind: "finality_conflict",
        severity: "warn",
        label: "Missing readback evidence",
        preview: params.reason,
        observations: [primaryRef],
        provenance: [],
      },
    ],
  };
}

function normalizeChildState(status: string | null | undefined): ChildRunObservation["state"] {
  if (status === "done" || status === "completed" || status === "succeeded") {
    return "succeeded";
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "running" || status === "active" || status === "queued") {
    return "active";
  }
  return "unknown";
}

function normalizeChildPhase(
  phase: string | null | undefined,
  status: string | null | undefined,
): ChildRunObservation["payload"]["phase"] {
  const value = phase ?? status ?? "running";
  if (value === "queued") {
    return "queued";
  }
  if (value === "synthesizing" || value === "synthesizing_after_child_work") {
    return "synthesizing";
  }
  if (value === "done" || value === "completed" || value === "succeeded") {
    return "succeeded";
  }
  if (value === "failed" || value === "error") {
    return "failed";
  }
  return "running";
}

function normalizeHandoffKind(value: string | null | undefined): HandoffKind | undefined {
  if (
    value === "domain_final" ||
    value === "context_pack" ||
    value === "review_packet" ||
    value === "implementation_closeout" ||
    value === "evidence_packet"
  ) {
    return value;
  }
  return undefined;
}

function normalizeDelivery(value: string | null | undefined): HandoffDelivery | undefined {
  if (
    value === "model_visible_full" ||
    value === "linked" ||
    value === "partial" ||
    value === "failed" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

export function buildChildRunObservation(params: {
  subject: EvidenceSubject;
  child: ChildRunEvidenceInput;
}): ChildRunObservation {
  const childId =
    params.child.runId ?? params.child.childSessionKey ?? params.child.executionTaskId ?? "unknown";
  const primaryRef: EvidenceRef = {
    kind: params.child.executionTaskId ? "task" : "session",
    ref: params.child.executionTaskId
      ? `openclaw tasks show ${params.child.executionTaskId}`
      : `openclaw sessions show ${childId}`,
  };
  const stableIds = [
    params.child.runId,
    params.child.childSessionKey,
    params.child.executionTaskId,
  ].filter(Boolean);
  return {
    type: "child_run",
    subject: params.subject,
    state: normalizeChildState(params.child.status),
    label: params.child.label ?? params.child.taskName ?? params.child.agentId ?? "child run",
    preview: params.child.terminalSummary ?? params.child.errorSummary ?? undefined,
    primaryRef,
    provenance: [primaryRef],
    payload: {
      parentTaskId: params.subject.taskId,
      parentSessionKey: params.subject.sessionKey,
      ownerAgentId: params.subject.agentId ?? "unknown",
      childAgentId: params.child.agentId ?? "unknown",
      childRole: params.child.label ?? params.child.taskName ?? undefined,
      childSessionKey: params.child.childSessionKey ?? undefined,
      nativeTaskId: params.child.executionTaskId ?? undefined,
      phase: normalizeChildPhase(params.child.phase, params.child.status),
      spawnedAt: params.child.createdAt ?? undefined,
      startedAt: params.child.startedAt ?? undefined,
      endedAt: params.child.endedAt ?? undefined,
      elapsedMs: params.child.elapsedMs ?? undefined,
      activeTool: params.child.activeTool ?? undefined,
      activeToolEvidence: params.child.activeTool ? "available" : "unavailable",
      spawnReason: params.child.spawnReason ?? undefined,
      handoffKind: normalizeHandoffKind(params.child.handoffKind),
      resultRef: primaryRef,
      resultDigest: params.child.contentDigest ?? undefined,
      delivery: normalizeDelivery(params.child.handoffDeliveryState),
      mergeConfidence: stableIds.length > 0 ? "exact" : "none",
    },
  };
}

export function buildHandoffObservation(params: {
  subject: EvidenceSubject;
  child: ChildRunEvidenceInput;
}): HandoffObservation | null {
  const kind = normalizeHandoffKind(params.child.handoffKind);
  if (!kind || !params.child.agentId) {
    return null;
  }
  const sourceTaskId = params.child.executionTaskId ?? undefined;
  const contentRef: EvidenceRef | undefined = sourceTaskId
    ? { kind: "task", ref: `openclaw tasks show ${sourceTaskId}` }
    : params.child.childSessionKey
      ? { kind: "session", ref: `openclaw sessions show ${params.child.childSessionKey}` }
      : undefined;
  return {
    type: "handoff",
    subject: params.subject,
    state: params.child.status === "failed" ? "failed" : "succeeded",
    label: `${kind} handoff`,
    primaryRef: contentRef ?? taskPrimaryRef(sourceTaskId),
    provenance: contentRef ? [contentRef] : [],
    payload: {
      kind,
      ownerAgentId: params.child.agentId,
      sourceTaskId,
      sourceSessionKey: params.child.childSessionKey ?? undefined,
      contentChars: params.child.contentChars ?? undefined,
      contentDigest: params.child.contentDigest ?? undefined,
      contentRef,
      delivery: normalizeDelivery(params.child.handoffDeliveryState) ?? "unknown",
      fidelity: "unknown",
    },
  };
}

export function buildSkillUseObservation(input: SkillEvidenceInput): SkillUseObservation | null {
  const skillName = input.skillName ?? null;
  const skillPath = input.skillPath ?? input.skillSource ?? null;
  const agentId = input.agentId ?? null;
  if (!skillName || !skillPath || !agentId) {
    return null;
  }
  const subject: EvidenceSubject = {
    kind: input.sessionKey ? "session" : input.runId ? "run" : "global",
    runId: input.runId ?? undefined,
    sessionKey: input.sessionKey ?? undefined,
    agentId,
  };
  const primaryRef: EvidenceRef = {
    kind: "skill",
    ref: skillPath,
    label: skillName,
  };
  const diagnosticRef: ProvenanceRef = {
    kind: "diagnostic",
    ref: input.eventId ?? input.toolCallId ?? skillPath,
    source: "skill.used",
    observedAt: input.createdAt ?? undefined,
  };
  return {
    type: "skill_use",
    subject,
    state: "succeeded",
    label: `${skillName} read`,
    primaryRef,
    provenance: [primaryRef, diagnosticRef],
    observedAt: input.createdAt ?? undefined,
    payload: {
      agentId,
      skillName,
      skillPath,
      readStatus: "full",
      evidenceSource: "skill.used",
    },
  };
}

export function withAdditionalObservations(
  view: ReadbackEvidenceView,
  observations: readonly (EvidenceObservation | null | undefined)[],
): ReadbackEvidenceView {
  return {
    ...view,
    observations: [
      ...view.observations,
      ...(observations.filter(Boolean) as EvidenceObservation[]),
    ],
  };
}
