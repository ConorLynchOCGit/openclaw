// Gateway Protocol schema module defines protocol validation shapes.
import type { Static } from "typebox";
import { Type } from "typebox";
import { closedObject } from "./closed-object.js";
import { NonEmptyString } from "./primitives.js";

/**
 * Task ledger protocol schemas.
 *
 * Tasks represent long-running SDK/agent operations exposed through the gateway;
 * these schemas keep list/get/cancel payloads bounded and status values closed.
 */
/** Closed task lifecycle statuses visible in the gateway task ledger. */
const TaskLedgerStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("timed_out"),
]);

/** Closed completion-delivery states from the native task registry. */
export const TaskDeliveryStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("delivered"),
  Type.Literal("session_queued"),
  Type.Literal("failed"),
  Type.Literal("parent_missing"),
  Type.Literal("not_applicable"),
]);

const TaskTerminalOutcomeSchema = Type.Union([Type.Literal("succeeded"), Type.Literal("blocked")]);

const TimestampSchema = Type.Union([Type.String(), Type.Integer({ minimum: 0 })]);

const TaskLifecycleChildSchema = closedObject({
  taskId: NonEmptyString,
  status: TaskLedgerStatusSchema,
  active: Type.Boolean(),
  kind: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
  phase: Type.Optional(Type.String()),
  attemptKind: Type.Optional(Type.Literal("follow_up")),
  operationId: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  reasoning: Type.Optional(Type.String()),
  startedAt: Type.Optional(Type.Integer({ minimum: 0 })),
  endedAt: Type.Optional(Type.Integer({ minimum: 0 })),
  lastActivityAt: Type.Optional(Type.Integer({ minimum: 0 })),
});

const TaskLifecycleMismatchSchema = closedObject({
  code: NonEmptyString,
  owners: Type.Array(NonEmptyString, { minItems: 1 }),
  evidence: Type.Array(NonEmptyString),
});

const TaskLifecycleReadbackSchema = closedObject({
  schema: Type.Literal("openclaw.task.lifecycle_readback.v1"),
  logicalStatus: TaskLedgerStatusSchema,
  nativeTaskStatus: NonEmptyString,
  logicalStartedAt: Type.Optional(Type.Integer({ minimum: 0 })),
  lastActivityAt: Type.Integer({ minimum: 0 }),
  lastRealActivityAt: Type.Integer({ minimum: 0 }),
  physical: Type.Optional(
    closedObject({
      runId: Type.Optional(Type.String()),
      sessionKey: Type.Optional(Type.String()),
      sessionStatus: Type.Optional(Type.String()),
      active: Type.Boolean(),
      startedAt: Type.Optional(Type.Integer({ minimum: 0 })),
      attemptNumber: Type.Optional(Type.Integer({ minimum: 1 })),
      continuationReason: Type.Optional(Type.String()),
      attemptId: Type.Optional(Type.String()),
      attemptStatus: Type.Optional(Type.String()),
    }),
  ),
  children: Type.Array(TaskLifecycleChildSchema),
  activeChildCount: Type.Integer({ minimum: 0 }),
  queuedChildCount: Type.Integer({ minimum: 0 }),
  terminalChildCount: Type.Integer({ minimum: 0 }),
  followupActive: Type.Boolean(),
  worktree: Type.Optional(
    closedObject({
      id: NonEmptyString,
      kind: Type.Optional(
        Type.Union([Type.Literal("source-inspection"), Type.Literal("system-change")]),
      ),
      baseRef: Type.Optional(Type.String()),
      writeOwnerTaskIds: Type.Array(NonEmptyString, { maxItems: 64, uniqueItems: true }),
      writeOwnerTaskId: Type.Optional(Type.String()),
    }),
  ),
  execution: Type.Optional(
    closedObject({
      provider: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
      reasoning: Type.Optional(Type.String()),
      profile: Type.Optional(Type.String()),
    }),
  ),
  codex: Type.Optional(
    closedObject({
      threadId: NonEmptyString,
      action: Type.Union([
        Type.Literal("started"),
        Type.Literal("resumed"),
        Type.Literal("forked"),
      ]),
      cwd: NonEmptyString,
      identityWorkspaceDir: Type.Optional(NonEmptyString),
      model: Type.Optional(Type.String()),
      modelProvider: Type.Optional(Type.String()),
      permissionProfile: Type.Optional(Type.String()),
      runtimeWorkspaceRoots: Type.Array(NonEmptyString, { maxItems: 64 }),
      instructionSources: Type.Array(NonEmptyString, { maxItems: 64 }),
      appServerVersion: Type.Optional(Type.String()),
      runtimeFingerprint: Type.Optional(Type.String()),
      systemProfile: Type.Optional(
        closedObject({
          layerVersion: NonEmptyString,
          purposeAgents: Type.Array(NonEmptyString, { maxItems: 64 }),
          capabilityRoots: Type.Array(NonEmptyString, { maxItems: 64 }),
          workbenchMcp: Type.Literal(true),
        }),
      ),
    }),
  ),
  context: Type.Optional(
    closedObject({
      nativeCompactionCount: Type.Optional(Type.Integer({ minimum: 0 })),
      lastTurnCompactions: Type.Optional(Type.Integer({ minimum: 0 })),
      requestLocalReductions: Type.Optional(
        closedObject({
          count: Type.Integer({ minimum: 0 }),
          route: Type.Optional(Type.String()),
        }),
      ),
    }),
  ),
  artifact: Type.Optional(
    closedObject({
      governingRef: Type.Optional(Type.String()),
      governingDigest: Type.Optional(Type.String()),
      observedDigest: Type.Optional(Type.String()),
      validationDigest: Type.Optional(Type.String()),
      reviewReceiptRef: Type.Optional(Type.String()),
      reviewedDigest: Type.Optional(Type.String()),
      reviewVerdict: Type.Optional(Type.String()),
      handoffTarget: Type.Optional(Type.String()),
      handoffDigest: Type.Optional(Type.String()),
      stale: Type.Boolean(),
    }),
  ),
  provider: Type.Optional(
    closedObject({
      state: Type.Optional(Type.String()),
      cause: Type.Optional(Type.String()),
      attemptId: Type.Optional(Type.String()),
    }),
  ),
  taskFlow: Type.Optional(
    closedObject({
      flowId: NonEmptyString,
      revision: Type.Integer({ minimum: 0 }),
      status: NonEmptyString,
      terminal: Type.Boolean(),
      currentStep: Type.Optional(Type.String()),
      stateLabel: Type.Optional(Type.String()),
    }),
  ),
  deliveryStatus: TaskDeliveryStatusSchema,
  mismatches: Type.Array(TaskLifecycleMismatchSchema),
});

/** Public task summary returned by task list/get/cancel responses. */
export const TaskSummarySchema = closedObject({
  id: NonEmptyString,
  kind: Type.Optional(Type.String()),
  runtime: Type.Optional(Type.String()),
  status: TaskLedgerStatusSchema,
  title: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  sessionKey: Type.Optional(Type.String()),
  childSessionKey: Type.Optional(Type.String()),
  ownerKey: Type.Optional(Type.String()),
  runId: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
  flowId: Type.Optional(Type.String()),
  parentTaskId: Type.Optional(Type.String()),
  sourceId: Type.Optional(Type.String()),
  deliveryStatus: TaskDeliveryStatusSchema,
  terminalOutcome: Type.Optional(TaskTerminalOutcomeSchema),
  createdAt: Type.Optional(TimestampSchema),
  updatedAt: Type.Optional(TimestampSchema),
  startedAt: Type.Optional(TimestampSchema),
  endedAt: Type.Optional(TimestampSchema),
  toolUseCount: Type.Optional(Type.Integer({ minimum: 0 })),
  lastToolName: Type.Optional(Type.String()),
  progressSummary: Type.Optional(Type.String()),
  terminalSummary: Type.Optional(Type.String()),
  readback: Type.Optional(TaskLifecycleReadbackSchema),
  error: Type.Optional(Type.String()),
  /** Bounded task input. Returned by tasks.get; omitted from list/event summaries. */
  prompt: Type.Optional(Type.String()),
});

/** Task list filters with bounded pagination. */
export const TasksListParamsSchema = closedObject({
  status: Type.Optional(Type.Union([TaskLedgerStatusSchema, Type.Array(TaskLedgerStatusSchema)])),
  agentId: Type.Optional(NonEmptyString),
  sessionKey: Type.Optional(NonEmptyString),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  cursor: Type.Optional(Type.String()),
});

/** Task list page response. */
export const TasksListResultSchema = closedObject({
  tasks: Type.Array(TaskSummarySchema),
  nextCursor: Type.Optional(Type.String()),
});

/** Lookup request for one task id. */
export const TasksGetParamsSchema = closedObject({
  taskId: NonEmptyString,
});

/** Lookup result for one task summary. */
export const TasksGetResultSchema = closedObject({
  task: TaskSummarySchema,
});

/** Cancel request for one task id with optional operator reason. */
export const TasksCancelParamsSchema = closedObject({
  taskId: NonEmptyString,
  reason: Type.Optional(Type.String()),
});

/** Cancel result, including the task snapshot when it was found. */
export const TasksCancelResultSchema = closedObject({
  found: Type.Boolean(),
  cancelled: Type.Boolean(),
  reason: Type.Optional(Type.String()),
  task: Type.Optional(TaskSummarySchema),
});

// Wire types derive directly from local schema consts so public d.ts graphs never
// pull in the ProtocolSchemas registry.
export type TaskSummary = Static<typeof TaskSummarySchema>;
export type TaskDeliveryStatus = Static<typeof TaskDeliveryStatusSchema>;
export type TaskLifecycleReadback = Static<typeof TaskLifecycleReadbackSchema>;
export type TasksListParams = Static<typeof TasksListParamsSchema>;
export type TasksListResult = Static<typeof TasksListResultSchema>;
export type TasksGetParams = Static<typeof TasksGetParamsSchema>;
export type TasksGetResult = Static<typeof TasksGetResultSchema>;
export type TasksCancelParams = Static<typeof TasksCancelParamsSchema>;
export type TasksCancelResult = Static<typeof TasksCancelResultSchema>;
