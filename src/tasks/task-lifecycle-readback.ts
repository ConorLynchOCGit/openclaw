// Composes one read-only task lifecycle view from existing native records.
import type { TaskSummary } from "../../packages/gateway-protocol/src/index.js";
import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import type { ManagedWorktreeRecord } from "../agents/worktrees/types.js";
import { resolveDefaultSessionStorePath } from "../config/sessions.js";
import { loadSessionEntryReadOnly } from "../config/sessions/session-accessor.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { listTaskRecords } from "./runtime-internal.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import { getTaskFlowById } from "./task-flow-runtime-internal.js";
import type { JsonValue, TaskRecord, TaskStatus } from "./task-registry.types.js";

type TaskLedgerStatus = TaskSummary["status"];
type TaskLifecycleReadback = NonNullable<TaskSummary["readback"]>;
type TaskLifecycleChild = TaskLifecycleReadback["children"][number];
type TaskLifecycleMismatch = TaskLifecycleReadback["mismatches"][number];
type TaskLifecycleSessionEntry = {
  readonly sessionId: string;
  readonly updatedAt: number;
  readonly lastActivityAt?: number;
  readonly compactionCount?: number;
  readonly status?: "running" | "done" | "failed" | "killed" | "timeout";
  readonly modelProvider?: string;
  readonly model?: string;
  readonly reasoningLevel?: string;
  readonly thinkingLevel?: string;
  readonly agentHarnessId?: string;
  readonly pluginExtensions?: Record<string, Record<string, unknown>>;
  readonly worktree?: {
    readonly id: string;
  };
};

const TERMINAL_FLOW_STATUSES = new Set(["succeeded", "failed", "cancelled", "lost"]);
const MAX_READBACK_TEXT_CHARS = 2_048;
type TaskReadbackMetadata = Record<string, JsonValue>;

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
  readWorktree?: (worktreeId: string) => ManagedWorktreeRecord | undefined;
};

export type TaskLifecycleReadbackContext = {
  tasks: readonly TaskRecord[];
  readSessionEntry: (sessionKey: string, agentId?: string) => TaskLifecycleSessionEntry | undefined;
  readTaskFlow: (flowId: string) => TaskFlowRecord | undefined;
  readWorktree: (worktreeId: string) => ManagedWorktreeRecord | undefined;
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
    return loadSessionEntryReadOnly({
      storePath: resolveDefaultSessionStorePath(resolvedAgentId),
      sessionKey,
      agentId: resolvedAgentId,
      clone: false,
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
  const worktreeCache = new Map<string, ManagedWorktreeRecord | null>();
  const sessionReader = opts.readSessionEntry ?? loadNativeSessionEntry;
  const flowReader = opts.readTaskFlow ?? getTaskFlowById;
  const worktreeReader =
    opts.readWorktree ?? ((worktreeId: string) => getRegistryWorktree(process.env, worktreeId));
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
    readWorktree: (worktreeId) => {
      if (!worktreeCache.has(worktreeId)) {
        worktreeCache.set(worktreeId, worktreeReader(worktreeId) ?? null);
      }
      return worktreeCache.get(worktreeId) ?? undefined;
    },
  };
}

function readMetadata(task: TaskRecord): TaskReadbackMetadata | undefined {
  const detail = task.detail;
  return detail && typeof detail === "object" && !Array.isArray(detail)
    ? (detail as TaskReadbackMetadata)
    : undefined;
}

function readText(metadata: TaskReadbackMetadata | undefined, key: string): string | undefined {
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

function readBoolean(metadata: TaskReadbackMetadata | undefined, key: string): boolean | undefined {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(metadata: TaskReadbackMetadata | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

type CodexExecutionProjection = NonNullable<TaskLifecycleReadback["codex"]>;

function readCodexExecutionProjection(
  session: TaskLifecycleSessionEntry | undefined,
): CodexExecutionProjection | undefined {
  const raw = session?.pluginExtensions?.codex?.execution;
  if (!isRecord(raw) || raw.schema !== "openclaw.codex.execution.v1") {
    return undefined;
  }
  const threadId = readRecordText(raw, "threadId");
  const action =
    raw.action === "started" || raw.action === "resumed" || raw.action === "forked"
      ? raw.action
      : undefined;
  const cwd = readRecordText(raw, "cwd");
  const runtimeWorkspaceRoots = readRecordStringArray(raw, "runtimeWorkspaceRoots");
  const instructionSources = readRecordStringArray(raw, "instructionSources");
  if (!threadId || !action || !cwd || !runtimeWorkspaceRoots || !instructionSources) {
    return undefined;
  }
  const systemProfile = isRecord(raw.systemProfile)
    ? {
        layerVersion: readRecordText(raw.systemProfile, "layerVersion"),
        purposeAgents: readRecordStringArray(raw.systemProfile, "purposeAgents"),
        capabilityRoots: readRecordStringArray(raw.systemProfile, "capabilityRoots"),
        workbenchMcp: raw.systemProfile.workbenchMcp === true,
      }
    : undefined;
  const validSystemProfile =
    systemProfile?.layerVersion &&
    systemProfile.purposeAgents &&
    systemProfile.capabilityRoots &&
    systemProfile.workbenchMcp
      ? {
          layerVersion: systemProfile.layerVersion,
          purposeAgents: systemProfile.purposeAgents,
          capabilityRoots: systemProfile.capabilityRoots,
          workbenchMcp: true as const,
        }
      : undefined;
  return {
    threadId,
    action,
    cwd,
    ...(readRecordText(raw, "model") ? { model: readRecordText(raw, "model") } : {}),
    ...(readRecordText(raw, "modelProvider")
      ? { modelProvider: readRecordText(raw, "modelProvider") }
      : {}),
    ...(readRecordText(raw, "permissionProfile")
      ? { permissionProfile: readRecordText(raw, "permissionProfile") }
      : {}),
    runtimeWorkspaceRoots,
    instructionSources,
    ...(readRecordText(raw, "appServerVersion")
      ? { appServerVersion: readRecordText(raw, "appServerVersion") }
      : {}),
    ...(readRecordText(raw, "runtimeFingerprint")
      ? { runtimeFingerprint: readRecordText(raw, "runtimeFingerprint") }
      : {}),
    ...(validSystemProfile ? { systemProfile: validSystemProfile } : {}),
  };
}

function readRecordText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_READBACK_TEXT_CHARS)
    : undefined;
}

function readRecordStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value) || value.length > 64) {
    return undefined;
  }
  const strings = value.map((entry) =>
    typeof entry === "string" && entry.trim()
      ? entry.trim().slice(0, MAX_READBACK_TEXT_CHARS)
      : undefined,
  );
  return strings.every((entry): entry is string => Boolean(entry)) ? strings : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  const parentThreadId = readCodexExecutionProjection(parentSession)?.threadId;
  return Boolean(
    parentThreadId &&
    metadata?.codexNativeSubagent === true &&
    readText(metadata, "parentThreadId") === parentThreadId,
  );
}

function inferChildPhase(task: TaskRecord): string {
  const progress = task.progressSummary?.trim().toLowerCase() ?? "";
  if (isTaskActive(task)) {
    if (progress.includes("received more input")) {
      return "followup_task";
    }
    if (progress.includes("initializing")) {
      return "child_initializing";
    }
    if (progress.includes("idle")) {
      return "child_idle";
    }
    if (progress.includes("active")) {
      return "child_active";
    }
    return task.status === "queued" ? "child_queued" : "child_running";
  }
  if (task.status === "succeeded") {
    return task.terminalOutcome === "blocked" ? "child_blocked" : "child_completed";
  }
  if (task.status === "cancelled") {
    return "child_cancelled";
  }
  return "child_failed";
}

function mapChild(
  task: TaskRecord,
  parentSession: TaskLifecycleSessionEntry | undefined,
): TaskLifecycleChild {
  const metadata = readMetadata(task);
  const attemptKind =
    readText(metadata, "childAttemptKind") === "follow_up" ? ("follow_up" as const) : undefined;
  const operationId = readText(metadata, "childOperationId");
  const role =
    readText(metadata, "childRole") ??
    (task.label && task.label !== "Codex subagent" ? task.label : undefined);
  return {
    taskId: task.taskId,
    status: TASK_STATUS_TO_LEDGER_STATUS[task.status],
    active: isTaskActive(task),
    ...(task.taskKind || task.runtime ? { kind: task.taskKind ?? task.runtime } : {}),
    ...(task.runId ? { runId: task.runId } : {}),
    ...(task.childSessionKey ? { sessionKey: task.childSessionKey } : {}),
    phase: readText(metadata, "childPhase") ?? inferChildPhase(task),
    ...(attemptKind ? { attemptKind } : {}),
    ...(operationId ? { operationId } : {}),
    ...(role ? { role } : {}),
    ...((readText(metadata, "childModel") ?? parentSession?.model)
      ? { model: readText(metadata, "childModel") ?? parentSession?.model }
      : {}),
    ...((readText(metadata, "childReasoningEffort") ??
    parentSession?.reasoningLevel ??
    parentSession?.thinkingLevel)
      ? {
          reasoning:
            readText(metadata, "childReasoningEffort") ??
            parentSession?.reasoningLevel ??
            parentSession?.thinkingLevel,
        }
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
  metadata: TaskReadbackMetadata | undefined,
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
    .map((child) => mapChild(child, session));
  const activeChildren = children.filter((child) => child.status === "running");
  const queuedChildren = children.filter((child) => child.status === "queued");
  const terminalChildren = children.length - activeChildren.length - queuedChildren.length;
  const followupActive = children.some(
    (child) =>
      child.active &&
      (child.attemptKind === "follow_up" ||
        child.phase === "followup_task" ||
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
  const declaredWriteOwnerTaskId = readText(metadata, "writeOwnerTaskId");
  const writeOwnerTaskIds = [
    ...new Set([
      ...(declaredWriteOwnerTaskId ? [declaredWriteOwnerTaskId] : []),
      ...activeChildren.map((child) => child.taskId),
      ...(task.status === "running" && activeChildren.length === 0 ? [task.taskId] : []),
    ]),
  ].toSorted();
  const writeOwnerTaskId = writeOwnerTaskIds.length === 1 ? writeOwnerTaskIds[0] : undefined;
  const managedWorktree = session?.worktree ? context.readWorktree(session.worktree.id) : undefined;
  if (session?.worktree && !managedWorktree) {
    mismatches.push(
      mismatch(
        "session_worktree_registry_missing",
        ["session-store", "worktree-registry"],
        [session.worktree.id],
      ),
    );
  }
  const codex = readCodexExecutionProjection(session);
  if (codex && managedWorktree && codex.cwd !== managedWorktree.path) {
    mismatches.push(
      mismatch(
        "codex_worktree_cwd_mismatch",
        ["codex", "worktree-registry"],
        [`codex:${codex.cwd}`, `worktree:${managedWorktree.path}`],
      ),
    );
  }
  if (
    codex?.systemProfile &&
    managedWorktree &&
    (codex.runtimeWorkspaceRoots.length !== 1 ||
      codex.runtimeWorkspaceRoots[0] !== managedWorktree.path)
  ) {
    mismatches.push(
      mismatch(
        "codex_runtime_root_mismatch",
        ["codex", "worktree-registry"],
        [...codex.runtimeWorkspaceRoots, `worktree:${managedWorktree.path}`],
      ),
    );
  }
  const worktree = session?.worktree
    ? {
        id: session.worktree.id,
        ...(managedWorktree?.baseRef ? { baseRef: managedWorktree.baseRef } : {}),
        writeOwnerTaskIds,
        ...(writeOwnerTaskId ? { writeOwnerTaskId } : {}),
      }
    : undefined;
  const providerState = readText(metadata, "providerState");
  const providerCause = readText(metadata, "providerCause");
  const providerAttemptId =
    readText(metadata, "providerAttemptId") ?? readText(metadata, "latestAttemptId");
  const attemptStatus =
    readText(metadata, "providerAttemptStatus") ?? readText(metadata, "latestAttemptStatus");
  const physicalAttemptStartedAt = readNumber(metadata, "physicalAttemptStartedAt");
  const providerAttemptNumber = readNumber(metadata, "providerAttemptNumber");
  const continuationReason = readText(metadata, "continuationReason");
  const provider =
    providerState || providerCause || providerAttemptId
      ? {
          ...(providerState ? { state: providerState } : {}),
          ...(providerCause ? { cause: providerCause } : {}),
          ...(providerAttemptId ? { attemptId: providerAttemptId } : {}),
        }
      : undefined;
  const executionProvider =
    readText(metadata, "provider") ?? codex?.modelProvider ?? session?.modelProvider;
  const executionModel =
    readText(metadata, "model") ??
    readText(metadata, "childModel") ??
    codex?.model ??
    session?.model;
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
  const lastTurnCompactions = readNumber(metadata, "lastTurnCompactions");
  const requestLocalReductionCount = readNumber(metadata, "requestLocalReductionCount");
  const requestLocalReductionRoute = readText(metadata, "requestLocalReductionRoute");
  const contextManagement =
    session?.compactionCount !== undefined ||
    lastTurnCompactions !== undefined ||
    requestLocalReductionCount !== undefined
      ? {
          ...(session?.compactionCount !== undefined
            ? { nativeCompactionCount: Math.max(0, Math.floor(session.compactionCount)) }
            : {}),
          ...(lastTurnCompactions !== undefined
            ? { lastTurnCompactions: Math.max(0, Math.floor(lastTurnCompactions)) }
            : {}),
          ...(requestLocalReductionCount !== undefined
            ? {
                requestLocalReductions: {
                  count: Math.max(0, Math.floor(requestLocalReductionCount)),
                  ...(requestLocalReductionRoute ? { route: requestLocalReductionRoute } : {}),
                },
              }
            : {}),
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
    ...(task.startedAt !== undefined ? { logicalStartedAt: task.startedAt } : {}),
    lastActivityAt: Math.max(
      taskLastActivityAt(task),
      session?.updatedAt ?? 0,
      ...children.map((child) => child.lastActivityAt ?? 0),
    ),
    lastRealActivityAt: Math.max(
      taskLastActivityAt(task),
      session?.lastActivityAt ?? 0,
      ...children.map((child) => child.lastActivityAt ?? 0),
    ),
    physical: {
      ...(task.runId ? { runId: task.runId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(session?.status ? { sessionStatus: session.status } : {}),
      active: physicalActive,
      ...(physicalAttemptStartedAt !== undefined
        ? { startedAt: Math.max(0, Math.floor(physicalAttemptStartedAt)) }
        : {}),
      ...(providerAttemptNumber !== undefined
        ? { attemptNumber: Math.max(1, Math.floor(providerAttemptNumber)) }
        : {}),
      ...(continuationReason ? { continuationReason } : {}),
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
    ...(codex ? { codex } : {}),
    ...(contextManagement ? { context: contextManagement } : {}),
    ...(artifact ? { artifact } : {}),
    ...(provider ? { provider } : {}),
    ...(taskFlow ? { taskFlow } : {}),
    deliveryStatus: task.deliveryStatus,
    mismatches,
  };
}
