// Gateway Protocol schema module defines protocol validation shapes.
import { Type } from "typebox";
import { NonEmptyString } from "./primitives.js";

/**
 * Task ledger protocol schemas.
 *
 * Tasks represent long-running SDK/agent operations exposed through the gateway;
 * these schemas keep list/get/cancel payloads bounded and status values closed.
 */
/** Closed task lifecycle statuses visible in the gateway task ledger. */
export const TaskLedgerStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("timed_out"),
]);

/** Closed task completion-delivery statuses visible as bounded readback only. */
export const TaskDeliveryStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("delivered"),
  Type.Literal("session_queued"),
  Type.Literal("failed"),
  Type.Literal("parent_missing"),
  Type.Literal("not_applicable"),
]);

const TimestampSchema = Type.Union([Type.String(), Type.Integer({ minimum: 0 })]);

const TaskReadbackProgressPointerSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("artifact"),
      Type.Literal("inspect-next"),
      Type.Literal("session"),
      Type.Literal("task"),
      Type.Literal("trajectory"),
    ]),
    ref: NonEmptyString,
    label: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const TaskReadbackProgressProjectionSchema = Type.Object(
  {
    source: Type.Union([
      Type.Literal("trajectory"),
      Type.Literal("task-receipt"),
      Type.Literal("unavailable"),
    ]),
    ref: NonEmptyString,
    currentPhase: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    activeLabel: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    observedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    elapsedMs: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    durationMs: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    sourceEventType: Type.Optional(Type.String()),
    sourceEventSeq: Type.Optional(Type.Integer()),
    toolName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    command: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    exitCode: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
    validationClass: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    outputSummary: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    repairAction: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    recoveryKind: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    recoveryAction: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    recoveryReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    recoveryAttempts: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    recoveryMaxAttempts: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    compactionCount: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    compactionTokensAfter: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    toolResultTruncationAttempted: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    childRole: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    childAgentPath: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    childPhase: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    spawnReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    diffReviewed: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    note: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    pointer: Type.Optional(TaskReadbackProgressPointerSchema),
    derivedBy: NonEmptyString,
    bounded: Type.Literal(true),
  },
  { additionalProperties: false },
);

/** Public task summary returned by task list/get/cancel responses. */
export const TaskSummarySchema = Type.Object(
  {
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
    createdAt: Type.Optional(TimestampSchema),
    updatedAt: Type.Optional(TimestampSchema),
    startedAt: Type.Optional(TimestampSchema),
    endedAt: Type.Optional(TimestampSchema),
    activeProgress: Type.Optional(TaskReadbackProgressProjectionSchema),
    terminalSummary: Type.Optional(Type.String()),
    error: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Task list filters with bounded pagination. */
export const TasksListParamsSchema = Type.Object(
  {
    status: Type.Optional(Type.Union([TaskLedgerStatusSchema, Type.Array(TaskLedgerStatusSchema)])),
    agentId: Type.Optional(NonEmptyString),
    sessionKey: Type.Optional(NonEmptyString),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Task list page response. */
export const TasksListResultSchema = Type.Object(
  {
    tasks: Type.Array(TaskSummarySchema),
    nextCursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Lookup request for one task id. */
export const TasksGetParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
  },
  { additionalProperties: false },
);

/** Lookup result for one task summary. */
export const TasksGetResultSchema = Type.Object(
  {
    task: TaskSummarySchema,
  },
  { additionalProperties: false },
);

/** Cancel request for one task id with optional operator reason. */
export const TasksCancelParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Cancel result, including the task snapshot when it was found. */
export const TasksCancelResultSchema = Type.Object(
  {
    found: Type.Boolean(),
    cancelled: Type.Boolean(),
    reason: Type.Optional(Type.String()),
    task: Type.Optional(TaskSummarySchema),
  },
  { additionalProperties: false },
);
