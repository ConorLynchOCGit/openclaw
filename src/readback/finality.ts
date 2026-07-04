// Shared finality/progress readback projection for CLI, gateway, and diagnostics.
// This is a projection over native session/task/trajectory evidence, not runtime truth.
import { createHash } from "node:crypto";
import type {
  GatewaySessionRow,
  SessionReadbackProvenance,
} from "../gateway/session-utils.types.js";
import type { ReadbackProgressProjection } from "../shared/readback-progress.js";

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
};

function digestText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

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
  return progress.note ?? progress.outputSummary ?? null;
}

function buildFinalityMismatch(params: {
  status: string | null;
  finalAssistantText: string | null;
  provenance: SessionReadbackProvenance | null;
}): Record<string, unknown> | null {
  if (!params.finalAssistantText) {
    return null;
  }
  const statusSource = params.provenance?.status?.source ?? null;
  if (
    params.status === "done" &&
    statusSource === "session-transcript" &&
    params.provenance?.status?.note
  ) {
    return {
      kind: "status_corrected_from_final_assistant_text",
      status: params.status,
      note: params.provenance.status.note,
      provenance: params.provenance.status,
    };
  }
  return null;
}

export function buildSessionReadbackProjection(session: SessionReadbackLike): ReadbackProjection {
  const finalAssistantText =
    typeof session.finalAssistantText === "string" && session.finalAssistantText.length > 0
      ? session.finalAssistantText
      : null;
  const provenance = session.readbackProvenance ?? null;
  const status = session.status ?? "unknown";
  const activeProgress = session.activeProgress ?? null;
  return {
    readbackSubject: {
      scope: "session",
      sessionKey: session.key,
      taskId: null,
      agentId: session.agentId ?? null,
    },
    finality: {
      status,
      finalAssistantTextPresent: finalAssistantText !== null,
      finalAssistantTextChars: finalAssistantText?.length ?? null,
      finalAssistantTextDigest: finalAssistantText ? digestText(finalAssistantText) : null,
      finalAssistantTextPointer: finalAssistantText
        ? `openclaw sessions show ${session.key}${session.agentId ? ` --agent ${session.agentId}` : ""}`
        : null,
      provenance,
      mismatch: buildFinalityMismatch({
        status,
        finalAssistantText,
        provenance,
      }),
    },
    activeWork: {
      phase: activeProgress?.currentPhase ?? status,
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress),
      activeTool: activeProgress?.toolName ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress
        ? activeWorkSource(activeProgress)
        : status === "running"
          ? "session-store"
          : "none",
      provenance: activeProgress ?? provenance,
    },
  };
}

export function buildTaskReadbackProjection(task: TaskReadbackLike): ReadbackProjection {
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
      status: task.status ?? "unknown",
      finalAssistantTextPresent: false,
      finalAssistantTextChars: null,
      finalAssistantTextDigest: null,
      finalAssistantTextPointer: null,
      provenance: null,
      mismatch: null,
    },
    activeWork: {
      phase: activeProgress?.currentPhase ?? task.status ?? "unknown",
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress) ?? task.childSessionKey ?? null,
      activeTool: activeProgress?.toolName ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress ? activeWorkSource(activeProgress) : "task-registry",
      provenance: activeProgress,
    },
  };
}

export function buildEmptyReadbackProjection(params: {
  scope: ReadbackSubject["scope"];
  sessionKey?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  reason: string;
}): ReadbackProjection {
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
      mismatch: {
        kind: "missing_readback_evidence",
        reason: params.reason,
      },
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
  };
}
