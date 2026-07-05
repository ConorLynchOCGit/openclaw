// Compatibility readback projection for CLI, gateway, and diagnostics.
// Finality stays anchored to the native session transcript/lifecycle record;
// task rows and progress summaries are bounded readback projections only.
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
  source: "trajectory" | "task-run-event" | "session-store" | "none" | "unknown";
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

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finalityPointer(params: {
  sessionKey: string | null | undefined;
  agentId?: string | null;
}): string | null {
  if (!params.sessionKey) {
    return null;
  }
  return `openclaw sessions show ${params.sessionKey}${
    params.agentId ? ` --agent ${params.agentId}` : ""
  }`;
}

function statusConflictMismatch(
  provenance: SessionReadbackProvenance | null | undefined,
  params?: { compatibilityStatus?: string | null; finalAssistantTextPresent?: boolean },
): Record<string, unknown> | null {
  if (
    params?.finalAssistantTextPresent &&
    params.compatibilityStatus &&
    params.compatibilityStatus !== "done" &&
    params.compatibilityStatus !== "completed" &&
    params.compatibilityStatus !== "succeeded"
  ) {
    return {
      kind: "status_conflict",
      severity: "info",
      label: "Compatibility status demoted because transcript final assistant evidence exists.",
      preview: `compatibilityStatus=${params.compatibilityStatus}`,
      provenance: provenance?.status ?? null,
    };
  }
  const status = provenance?.status;
  if (status?.source !== "session-transcript" || !status.note) {
    return null;
  }
  return {
    kind: "status_conflict",
    severity: "info",
    label: "Status corrected from final assistant transcript evidence.",
    preview: status.note,
    provenance: status,
  };
}

export function buildSessionReadbackProjection(session: SessionReadbackLike): ReadbackProjection {
  const activeProgress = session.activeProgress ?? null;
  const finalAssistantText =
    typeof session.finalAssistantText === "string" && session.finalAssistantText.length > 0
      ? session.finalAssistantText
      : null;
  return {
    readbackSubject: {
      scope: "session",
      sessionKey: session.key,
      taskId: null,
      agentId: session.agentId ?? null,
    },
    finality: {
      status: finalAssistantText ? "done" : (session.status ?? "unknown"),
      finalAssistantTextPresent: finalAssistantText !== null,
      finalAssistantTextChars: finalAssistantText?.length ?? null,
      finalAssistantTextDigest: finalAssistantText ? digestText(finalAssistantText) : null,
      finalAssistantTextPointer: finalAssistantText
        ? finalityPointer({ sessionKey: session.key, agentId: session.agentId })
        : null,
      provenance: session.readbackProvenance ?? null,
      mismatch: statusConflictMismatch(session.readbackProvenance, {
        compatibilityStatus: session.status ?? null,
        finalAssistantTextPresent: finalAssistantText !== null,
      }),
    },
    activeWork: {
      phase: activeProgress?.currentPhase ?? null,
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress),
      activeTool: activeProgress?.toolName ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress
        ? activeWorkSource(activeProgress)
        : session.status === "running"
          ? "session-store"
          : "none",
      provenance: activeProgress ?? session.readbackProvenance ?? null,
    },
  };
}

export function buildTaskReadbackProjection(task: TaskReadbackLike): ReadbackProjection {
  const activeProgress = task.activeProgress ?? null;
  const sessionKey = task.requesterSessionKey ?? task.ownerKey ?? null;
  const finalAssistantText =
    typeof task.resultSession?.finalAssistantText === "string" &&
    task.resultSession.finalAssistantText.length > 0
      ? task.resultSession.finalAssistantText
      : null;
  return {
    readbackSubject: {
      scope: "task",
      sessionKey,
      taskId: task.taskId,
      agentId: task.agentId ?? null,
    },
    finality: {
      status: finalAssistantText ? "done" : (task.status ?? "unknown"),
      finalAssistantTextPresent: finalAssistantText !== null,
      finalAssistantTextChars: finalAssistantText?.length ?? null,
      finalAssistantTextDigest: finalAssistantText ? digestText(finalAssistantText) : null,
      finalAssistantTextPointer: finalAssistantText
        ? finalityPointer({
            sessionKey: task.resultSession?.sessionKey ?? task.childSessionKey ?? sessionKey,
            agentId: task.resultSession?.agentId ?? task.agentId,
          })
        : null,
      provenance: task.resultSession?.readbackProvenance ?? null,
      mismatch: statusConflictMismatch(task.resultSession?.readbackProvenance, {
        compatibilityStatus: task.status ?? null,
        finalAssistantTextPresent: finalAssistantText !== null,
      }),
    },
    activeWork: {
      phase: activeProgress?.currentPhase ?? null,
      childRole: activeProgress?.childRole ?? null,
      childSessionKey: pointerSessionKey(activeProgress),
      activeTool: activeProgress?.toolName ?? null,
      waitReason: progressWaitReason(activeProgress),
      source: activeProgress ? activeWorkSource(activeProgress) : "none",
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
        kind: "missing_evidence",
        severity: "info",
        label: params.reason,
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
