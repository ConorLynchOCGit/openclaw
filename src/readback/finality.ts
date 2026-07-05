// Compatibility readback projection for CLI, gateway, and diagnostics.
// The authoritative read model is the on-demand ReadbackEvidenceView adapter.
import type {
  GatewaySessionRow,
  SessionReadbackProvenance,
} from "../gateway/session-utils.types.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";
import {
  buildEmptyReadbackEvidenceView,
  buildSessionReadbackEvidenceView,
  buildTaskReadbackEvidenceView,
} from "./evidence-adapter.js";
import type { ReadbackEvidenceView } from "./evidence-schema.js";
import { selectActiveWork, selectFinality } from "./evidence-selectors.js";

export type ReadbackSubject = {
  scope: "session" | "task" | "run" | "global";
  sessionKey: string | null;
  taskId: string | null;
  agentId: string | null;
};

export type ReadbackFinality = {
  status: string | null;
  finalAssistantTextPresent: boolean;
  finalAssistantTextChars: number | null;
  finalAssistantTextDigest: string | null;
  finalAssistantTextPointer: string | null;
  provenance: SessionReadbackProvenance | null;
  mismatch: Record<string, unknown> | null;
};

export type ReadbackActiveWork = {
  phase: string | null;
  childRole: string | null;
  childSessionKey: string | null;
  activeTool: string | null;
  waitReason: string | null;
  source:
    | "trajectory"
    | "task-run-event"
    | "subagent-registry"
    | "task-registry"
    | "session-store"
    | "none"
    | "unknown";
  provenance: ReadbackProgressProjection | SessionReadbackProvenance | null;
};

export type ReadbackProjection = {
  readbackSubject: ReadbackSubject;
  finality: ReadbackFinality;
  activeWork: ReadbackActiveWork;
  readbackEvidenceView: ReadbackEvidenceView;
};

type SessionReadbackLike = Pick<
  GatewaySessionRow,
  "key" | "status" | "sessionId" | "finalAssistantText" | "activeProgress" | "readbackProvenance"
> & {
  agentId?: string | null;
};

type TaskReadbackLike = {
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

function activeWorkSource(
  progress: ReadbackProgressProjection | null | undefined,
): ReadbackActiveWork["source"] {
  if (!progress) {
    return "none";
  }
  return progress.source;
}

function pointerSessionKey(progress: ReadbackProgressProjection | null | undefined): string | null {
  return progress?.pointer?.kind === "session" ? progress.pointer.ref : null;
}

function progressWaitReason(
  progress: ReadbackProgressProjection | null | undefined,
): string | null {
  if (!progress) {
    return null;
  }
  if (progress.currentPhase === "queued" || progress.currentPhase === "waiting_on_child") {
    return progress.note ?? null;
  }
  return null;
}

export function buildSessionReadbackProjection(session: SessionReadbackLike): ReadbackProjection {
  const view = buildSessionReadbackEvidenceView(session);
  const finalityObservation = selectFinality(view);
  const activeWorkObservation = selectActiveWork(view);
  const activeProgress = session.activeProgress ?? null;
  return {
    readbackSubject: {
      scope: "session",
      sessionKey: session.key,
      taskId: null,
      agentId: session.agentId ?? null,
    },
    finality: {
      status: session.status ?? finalityObservation?.state ?? "unknown",
      finalAssistantTextPresent: finalityObservation?.payload.finalAssistantTextPresent ?? false,
      finalAssistantTextChars: finalityObservation?.payload.finalAssistantTextChars ?? null,
      finalAssistantTextDigest: finalityObservation?.payload.finalAssistantTextDigest ?? null,
      finalAssistantTextPointer: finalityObservation?.payload.finalAssistantTextRef?.ref ?? null,
      provenance: session.readbackProvenance ?? null,
      mismatch: view.mismatches[0] ?? null,
    },
    activeWork: {
      phase: activeWorkObservation?.payload.phase ?? activeProgress?.currentPhase ?? null,
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress),
      activeTool: activeWorkObservation?.payload.activeTool ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress
        ? activeWorkSource(activeProgress)
        : session.status === "running"
          ? "session-store"
          : "none",
      provenance: activeProgress ?? session.readbackProvenance ?? null,
    },
    readbackEvidenceView: view,
  };
}

export function buildTaskReadbackProjection(task: TaskReadbackLike): ReadbackProjection {
  const view = buildTaskReadbackEvidenceView(task);
  const finalityObservation = selectFinality(view);
  const activeWorkObservation = selectActiveWork(view);
  const activeProgress = task.activeProgress ?? null;
  const sessionKey = task.requesterSessionKey ?? task.ownerKey ?? null;
  return {
    readbackSubject: {
      scope: "task",
      sessionKey,
      taskId: task.taskId,
      agentId: task.agentId ?? null,
    },
    finality: {
      status: task.status ?? finalityObservation?.state ?? "unknown",
      finalAssistantTextPresent: finalityObservation?.payload.finalAssistantTextPresent ?? false,
      finalAssistantTextChars: finalityObservation?.payload.finalAssistantTextChars ?? null,
      finalAssistantTextDigest: finalityObservation?.payload.finalAssistantTextDigest ?? null,
      finalAssistantTextPointer: finalityObservation?.payload.finalAssistantTextRef?.ref ?? null,
      provenance: null,
      mismatch: null,
    },
    activeWork: {
      phase:
        activeWorkObservation?.payload.phase ??
        activeProgress?.currentPhase ??
        task.status ??
        "unknown",
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress) ?? task.childSessionKey ?? null,
      activeTool: activeWorkObservation?.payload.activeTool ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress ? activeWorkSource(activeProgress) : "task-registry",
      provenance: activeProgress,
    },
    readbackEvidenceView: view,
  };
}

export function buildEmptyReadbackProjection(params: {
  scope: ReadbackSubject["scope"];
  sessionKey?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  reason: string;
}): ReadbackProjection {
  const view = buildEmptyReadbackEvidenceView({
    kind:
      params.scope === "task"
        ? "task"
        : params.scope === "global"
          ? "global"
          : params.scope === "run"
            ? "run"
            : "session",
    sessionKey: params.sessionKey,
    taskId: params.taskId,
    agentId: params.agentId,
    reason: params.reason,
  });
  return {
    readbackSubject: {
      scope: params.scope,
      sessionKey: params.sessionKey ?? null,
      taskId: params.taskId ?? null,
      agentId: params.agentId ?? null,
    },
    finality: {
      status: null,
      finalAssistantTextPresent: false,
      finalAssistantTextChars: null,
      finalAssistantTextDigest: null,
      finalAssistantTextPointer: null,
      provenance: null,
      mismatch: view.mismatches[0] ?? null,
    },
    activeWork: {
      phase: null,
      childRole: null,
      childSessionKey: null,
      activeTool: null,
      waitReason: params.reason,
      source: "unknown",
      provenance: null,
    },
    readbackEvidenceView: view,
  };
}
