// Composes one read-only task lifecycle view from existing native records.
import type { TaskSummary } from "../../packages/gateway-protocol/src/index.js";
import { readSessionEntry, resolveDefaultSessionStorePath } from "../config/sessions.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { getTaskFlowById } from "../tasks/task-flow-registry.js";
import type { TaskFlowRecord } from "../tasks/task-flow-registry.types.js";
import { listTaskRecords } from "../tasks/task-registry.js";
import type { TaskEventMetadata, TaskRecord, TaskStatus } from "../tasks/task-registry.types.js";

type TaskLedgerStatus = TaskSummary["status"];
type TaskLifecycleReadback = NonNullable<TaskSummary["readback"]>;
type TaskLifecycleChild = TaskLifecycleReadback["children"][number];
type TaskLifecycleMismatch = TaskLifecycleReadback["mismatches"][number];
type TaskLifecycleSessionEntry = {
  readonly sessionId: string;
  readonly updatedAt: number;
  readonly status?: "running" | "done" | "failed" | "killed" | "timeout";
  readonly modelProvider?: string;
  readonly model?: string;
  readonly reasoningLevel?: string;
  readonly thinkingLevel?: string;
  readonly agentHarnessId?: string;
  readonly worktree?: {
    readonly id: string;
    readonly kind?: "source-inspection" | "system-change";
    readonly baseRef?: string;
  };
};

const TERMINAL_FLOW_STATUSES = new Set(["succeeded", "failed", "cancelled", "lost"]);
const MAX_READBACK_TEXT_CHARS = 2_048;

export const TASK_STATUS_TO_LEDGER_STATUS: Record<TaskStatus, TaskLedgerStatus> = {
  queued: "queued",
  running: "running",
  succeeded: "completed",
  failed: "failed",
  timed_out: "timed_out",
  cancelled: "cancelled",
  lost: "failed",
};

type TaskLifecycleReadbackContextOptions = {
  tasks?: readonly TaskRecord[];
  readSessionEntry?: (
    sessionKey: string,
    agentId?: string,
  ) => TaskLifecycleSessionEntry | undefined;
  readTaskFlow?: (flowId: string) => TaskFlowRecord | undefined;
};

export type TaskLifecycleReadbackContext = {
  tasks: readonly TaskRecord[];
  readSessionEntry: (sessionKey: string, agentId?: string) => TaskLifecycleSessionEntry | undefined;
  readTaskFlow: (flowId: string) => TaskFlowRecord | undefined;
};

function loadNativeSessionEntry(
  sessionKey: string,
  agentId?: string,
): TaskLifecycleSessionEntry | undefined {
  const resolvedAgentId = agentId?.trim() || parseAgentSessionKey(sessionKey)?.agentId;
  if (!resolvedAgentId) {
    return undefined;
  }
  try {
    return readSessionEntry(resolveDefaultSessionStorePath(resolvedAgentId), sessionKey, {
      hydrateSkillPromptRefs: false,
    });
  } catch {
    return undefined;
  }
}

export function createTaskLifecycleReadbackContext(
  opts: TaskLifecycleReadbackContextOptions = {},
): TaskLifecycleReadbackContext {
  const sessionCache = new Map<string, TaskLifecycleSessionEntry | null>();
  const flowCache = new Map<string, TaskFlowRecord | null>();
  const sessionReader = opts.readSessionEntry ?? loadNativeSessionEntry;
  const flowReader = opts.readTaskFlow ?? getTaskFlowById;
  return {
    tasks: opts.tasks ?? listTaskRecords(),
    readSessionEntry: (sessionKey, agentId) => {
      const cacheKey = `${agentId ?? ""}\u0000${sessionKey}`;
      if (!sessionCache.has(cacheKey)) {
        sessionCache.set(cacheKey, sessionReader(sessionKey, agentId) ?? null);
      }
      return sessionCache.get(cacheKey) ?? undefined;
    },
    readTaskFlow: (flowId) => {
      if (!flowCache.has(flowId)) {
        flowCache.set(flowId, flowReader(flowId) ?? null);
      }
      return flowCache.get(flowId) ?? undefined;
    },
  };
}

function readMetadata(task: TaskRecord): TaskEventMetadata | undefined {
  return task.executionReceipt?.latestEvent?.metadata;
}

function readText(metadata: TaskEventMetadata | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, MAX_READBACK_TEXT_CHARS);
}

function readBoolean(metadata: TaskEventMetadata | undefined, key: string): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function taskLastActivityAt(task: TaskRecord): number {
  return task.lastEventAt ?? task.endedAt ?? task.startedAt ?? task.createdAt;
}

function isTaskActive(task: TaskRecord): boolean {
  return task.status === "queued" || task.status === "running";
}

function taskSessionKey(task: TaskRecord): string | undefined {
  return task.childSessionKey ?? task.ownerKey ?? task.requesterSessionKey;
}

function isRelatedChild(
  parent: TaskRecord,
  parentSession: TaskLifecycleSessionEntry | undefined,
  candidate: TaskRecord,
): boolean {
  if (candidate.taskId === parent.taskId) {
    return false;
  }
  if (candidate.parentTaskId === parent.taskId) {
    return true;
  }
  const metadata = readMetadata(candidate);
  return Boolean(
    parentSession?.sessionId &&
    metadata?.codexNativeSubagent === true &&
    readText(metadata, "parentThreadId") === parentSession.sessionId,
  );
}

function mapChild(task: TaskRecord): TaskLifecycleChild {
  const metadata = readMetadata(task);
  return {
    taskId: task.taskId,
    status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
    active: isTaskActive(task),
    ...(task.taskKind || task.runtime ? { kind: task.taskKind ?? task.runtime } : {}),
    ...(task.runId ? { runId: task.runId } : {}),
    ...(task.childSessionKey ? { sessionKey: task.childSessionKey } : {}),
    ...(readText(metadata, "childPhase") ? { phase: readText(metadata, "childPhase") } : {}),
    ...(readText(metadata, "childRole") ? { role: readText(metadata, "childRole") } : {}),
    ...(readText(metadata, "childModel") ? { model: readText(metadata, "childModel") } : {}),
    ...(readText(metadata, "childReasoningEffort")
      ? { reasoning: readText(metadata, "childReasoningEffort") }
      : {}),
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.endedAt !== undefined ? { endedAt: task.endedAt } : {}),
    lastActivityAt: taskLastActivityAt(task),
  };
}

function readStateLabel(flow: TaskFlowRecord): string | undefined {
  if (!flow.stateJson || typeof flow.stateJson !== "object" || Array.isArray(flow.stateJson)) {
    return undefined;
  }
  const value = flow.stateJson.state;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_READBACK_TEXT_CHARS)
    : undefined;
}

function mismatch(
  code: string,
  owners: string[],
  evidence: Array<string | undefined>,
): TaskLifecycleMismatch {
  return {
    code,
    owners,
    evidence: evidence.filter((value): value is string => Boolean(value)),
  };
}

function buildArtifactReadback(
  metadata: TaskEventMetadata | undefined,
  mismatches: TaskLifecycleMismatch[],
): TaskLifecycleReadback["artifact"] {
  const governingRef = readText(metadata, "governingArtifactRef");
  const governingDigest = readText(metadata, "governingArtifactDigest");
  const observedDigest = readText(metadata, "observedArtifactDigest");
  const validationDigest = readText(metadata, "validationDigest");
  const reviewReceiptRef = readText(metadata, "reviewReceiptRef");
  const reviewedDigest = readText(metadata, "reviewedDigest");
  const reviewVerdict = readText(metadata, "reviewVerdict");
  const handoffTarget = readText(metadata, "handoffTarget");
  const handoffDigest = readText(metadata, "handoffDigest");
  const stale =
    Boolean(validationDigest && observedDigest && validationDigest !== observedDigest) ||
    Boolean(reviewedDigest && governingDigest && reviewedDigest !== governingDigest) ||
    Boolean(handoffDigest && reviewedDigest && handoffDigest !== reviewedDigest);
  if (
    !governingRef &&
    !governingDigest &&
    !observedDigest &&
    !validationDigest &&
    !reviewReceiptRef &&
    !reviewedDigest &&
    !reviewVerdict &&
    !handoffTarget &&
    !handoffDigest
  ) {
    return undefined;
  }
  if (validationDigest && observedDigest && validationDigest !== observedDigest) {
    mismatches.push(
      mismatch(
        "validation_digest_stale",
        ["validation", "worktree"],
        [`validation:${validationDigest}`, `observed:${observedDigest}`],
      ),
    );
  }
  if (reviewedDigest && governingDigest && reviewedDigest !== governingDigest) {
    mismatches.push(
      mismatch(
        "review_digest_stale",
        ["review", "artifact"],
        [`reviewed:${reviewedDigest}`, `governing:${governingDigest}`],
      ),
    );
  }
  if (handoffDigest && reviewedDigest && handoffDigest !== reviewedDigest) {
    mismatches.push(
      mismatch(
        "handoff_digest_mismatch",
        ["handoff", "review"],
        [`handoff:${handoffDigest}`, `reviewed:${reviewedDigest}`],
      ),
    );
  }
  return {
    ...(governingRef ? { governingRef } : {}),
    ...(governingDigest ? { governingDigest } : {}),
    ...(observedDigest ? { observedDigest } : {}),
    ...(validationDigest ? { validationDigest } : {}),
    ...(reviewReceiptRef ? { reviewReceiptRef } : {}),
    ...(reviewedDigest ? { reviewedDigest } : {}),
    ...(reviewVerdict ? { reviewVerdict } : {}),
    ...(handoffTarget ? { handoffTarget } : {}),
    ...(handoffDigest ? { handoffDigest } : {}),
    stale,
  };
}

export function buildTaskLifecycleReadback(
  task: TaskRecord,
  context: TaskLifecycleReadbackContext = createTaskLifecycleReadbackContext(),
): TaskLifecycleReadback {
  const metadata = readMetadata(task);
  const sessionKey = taskSessionKey(task);
  const session = sessionKey ? context.readSessionEntry(sessionKey, task.agentId) : undefined;
  const children = context.tasks
    .filter((candidate) => isRelatedChild(task, session, candidate))
    .toSorted((a, b) => taskLastActivityAt(a) - taskLastActivityAt(b))
    .map(mapChild);
  const activeChildren = children.filter((child) => child.status === "running");
  const queuedChildren = children.filter((child) => child.status === "queued");
  const terminalChildren = children.length - activeChildren.length - queuedChildren.length;
  const followupActive = children.some(
    (child) =>
      child.active &&
      (child.phase === "followup_task" ||
        child.phase === "child_followup" ||
        readBoolean(metadata, "followupTask") === true),
  );
  const mismatches: TaskLifecycleMismatch[] = [];
  const logicalStatus = TASK_STATUS_TO_LEDGER_STATUS[task.status];
  const logicalTerminal = logicalStatus !== "queued" && logicalStatus !== "running";
  if (logicalTerminal && activeChildren.length + queuedChildren.length > 0) {
    mismatches.push(
      mismatch(
        "terminal_parent_has_active_children",
        ["task-registry", "child-task-registry"],
        [task.taskId, ...activeChildren.map((child) => child.taskId)],
      ),
    );
  }
  if (
    (logicalStatus === "running" || logicalStatus === "queued") &&
    session?.status &&
    session.status !== "running" &&
    children.every((child) => !child.active)
  ) {
    mismatches.push(
      mismatch(
        "logical_task_physical_session_disagreement",
        ["task-registry", "session-store"],
        [`task:${task.status}`, `session:${session.status}`],
      ),
    );
  }

  const artifact = buildArtifactReadback(metadata, mismatches);
  const flow = task.parentFlowId ? context.readTaskFlow(task.parentFlowId) : undefined;
  const taskFlow = flow
    ? {
        flowId: flow.flowId,
        revision: flow.revision,
        status: flow.status,
        terminal: TERMINAL_FLOW_STATUSES.has(flow.status),
        ...(flow.currentStep ? { currentStep: flow.currentStep } : {}),
        ...(readStateLabel(flow) ? { stateLabel: readStateLabel(flow) } : {}),
      }
    : undefined;
  const writeOwnerTaskId =
    readText(metadata, "writeOwnerTaskId") ??
    (activeChildren.length === 1
      ? activeChildren[0]?.taskId
      : task.status === "running" && activeChildren.length === 0
        ? task.taskId
        : undefined);
  const worktree = session?.worktree
    ? {
        id: session.worktree.id,
        ...(session.worktree.kind ? { kind: session.worktree.kind } : {}),
        ...(session.worktree.baseRef ? { baseRef: session.worktree.baseRef } : {}),
        ...(writeOwnerTaskId ? { writeOwnerTaskId } : {}),
      }
    : undefined;
  const providerState = readText(metadata, "providerState");
  const providerCause = readText(metadata, "providerCause");
  const providerAttemptId =
    readText(metadata, "providerAttemptId") ?? readText(metadata, "latestAttemptId");
  const attemptStatus =
    readText(metadata, "providerAttemptStatus") ?? readText(metadata, "latestAttemptStatus");
  const provider =
    providerState || providerCause || providerAttemptId
      ? {
          ...(providerState ? { state: providerState } : {}),
          ...(providerCause ? { cause: providerCause } : {}),
          ...(providerAttemptId ? { attemptId: providerAttemptId } : {}),
        }
      : undefined;
  const executionProvider = readText(metadata, "provider") ?? session?.modelProvider;
  const executionModel =
    readText(metadata, "model") ?? readText(metadata, "childModel") ?? session?.model;
  const executionReasoning =
    readText(metadata, "reasoning") ??
    readText(metadata, "childReasoningEffort") ??
    session?.reasoningLevel ??
    session?.thinkingLevel;
  const executionProfile = readText(metadata, "profile") ?? session?.agentHarnessId;
  const execution =
    executionProvider || executionModel || executionReasoning || executionProfile
      ? {
          ...(executionProvider ? { provider: executionProvider } : {}),
          ...(executionModel ? { model: executionModel } : {}),
          ...(executionReasoning ? { reasoning: executionReasoning } : {}),
          ...(executionProfile ? { profile: executionProfile } : {}),
        }
      : undefined;
  const sessionActive = session?.status === "running";
  const physicalActive =
    task.status === "running" ||
    task.status === "queued" ||
    sessionActive ||
    activeChildren.length + queuedChildren.length > 0;

  return {
    schema: "openclaw.task.lifecycle_readback.v1",
    logicalStatus,
    nativeTaskStatus: task.status,
    lastActivityAt: Math.max(
      taskLastActivityAt(task),
      session?.updatedAt ?? 0,
      ...children.map((child) => child.lastActivityAt ?? 0),
    ),
    physical: {
      ...(task.runId ? { runId: task.runId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(session?.status ? { sessionStatus: session.status } : {}),
      active: physicalActive,
      ...(providerAttemptId ? { attemptId: providerAttemptId } : {}),
      ...(attemptStatus ? { attemptStatus } : {}),
    },
    children,
    activeChildCount: activeChildren.length,
    queuedChildCount: queuedChildren.length,
    terminalChildCount: terminalChildren,
    followupActive,
    ...(worktree ? { worktree } : {}),
    ...(execution ? { execution } : {}),
    ...(artifact ? { artifact } : {}),
    ...(provider ? { provider } : {}),
    ...(taskFlow ? { taskFlow } : {}),
    deliveryStatus: task.deliveryStatus,
    mismatches,
  };
}
