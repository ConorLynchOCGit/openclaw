import type { JsonValue } from "../runtime-job-repository.ts";

export const WORK_QUEUE_GENERATED_ITEM_LIFECYCLE_VERSION =
  "execution-platform.work-queue-generated-item-lifecycle.v1";

export const WORK_QUEUE_GENERATED_ITEM_ORIGIN_KINDS = [
  "runtime_graph_child",
  "workflow_child_action",
  "proof_diagnostic",
  "middleware_fixture",
  "closeout_followup",
] as const;

export type WorkQueueGeneratedItemOriginKind =
  (typeof WORK_QUEUE_GENERATED_ITEM_ORIGIN_KINDS)[number];

export const WORK_QUEUE_GENERATED_ITEM_TERMINAL_POLICIES = [
  "archive_with_parent",
  "close_with_parent",
  "remain_actionable",
  "debug_only",
] as const;

export type WorkQueueGeneratedItemTerminalPolicy =
  (typeof WORK_QUEUE_GENERATED_ITEM_TERMINAL_POLICIES)[number];

export const WORK_QUEUE_GENERATED_ITEM_RETENTION_POLICIES = [
  "owner_visible_until_terminal",
  "debug_hidden_from_owner_queue",
  "owner_actionable",
] as const;

export type WorkQueueGeneratedItemRetentionPolicy =
  (typeof WORK_QUEUE_GENERATED_ITEM_RETENTION_POLICIES)[number];

export type WorkQueueGeneratedItemLifecycle = {
  artifactKind: "work_queue_generated_item_lifecycle";
  schemaVersion: typeof WORK_QUEUE_GENERATED_ITEM_LIFECYCLE_VERSION;
  originKind: WorkQueueGeneratedItemOriginKind;
  terminalPolicy: WorkQueueGeneratedItemTerminalPolicy;
  retentionPolicy: WorkQueueGeneratedItemRetentionPolicy;
  ownerVisible: boolean;
  parentWorkItemId: string | null;
  owningRuntimeJobId: string | null;
  owningGraphId: string | null;
  owningNodeId: string | null;
  debugOnly: boolean;
  createdBy: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
};

export type BuildGeneratedLifecycleInput = {
  originKind: WorkQueueGeneratedItemOriginKind;
  terminalPolicy: WorkQueueGeneratedItemTerminalPolicy;
  retentionPolicy?: WorkQueueGeneratedItemRetentionPolicy;
  parentWorkItemId?: string | null;
  owningRuntimeJobId?: string | null;
  owningGraphId?: string | null;
  owningNodeId?: string | null;
  ownerVisible?: boolean;
  createdBy: string;
  reasonCodes?: string[];
};

export function buildGeneratedWorkQueueItemLifecycle(
  input: BuildGeneratedLifecycleInput,
): WorkQueueGeneratedItemLifecycle {
  const debugOnly = input.terminalPolicy === "debug_only";
  const ownerVisible = input.ownerVisible ?? !debugOnly;
  const retentionPolicy =
    input.retentionPolicy ??
    (debugOnly
      ? "debug_hidden_from_owner_queue"
      : input.terminalPolicy === "remain_actionable"
        ? "owner_actionable"
        : "owner_visible_until_terminal");
  return {
    artifactKind: "work_queue_generated_item_lifecycle",
    schemaVersion: WORK_QUEUE_GENERATED_ITEM_LIFECYCLE_VERSION,
    originKind: input.originKind,
    terminalPolicy: input.terminalPolicy,
    retentionPolicy,
    ownerVisible,
    parentWorkItemId: input.parentWorkItemId ?? null,
    owningRuntimeJobId: input.owningRuntimeJobId ?? null,
    owningGraphId: input.owningGraphId ?? null,
    owningNodeId: input.owningNodeId ?? null,
    debugOnly,
    createdBy: input.createdBy,
    reasonCodes: [...new Set(input.reasonCodes ?? [])].slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  };
}

export function readGeneratedWorkQueueItemLifecycle(
  metadata: JsonValue | undefined,
): WorkQueueGeneratedItemLifecycle | null {
  const record = readRecord(metadata);
  const lifecycle = readRecord(record.generatedItemLifecycle as JsonValue);
  const originKind = lifecycle.originKind;
  const terminalPolicy = lifecycle.terminalPolicy;
  if (!isGeneratedOriginKind(originKind) || !isGeneratedTerminalPolicy(terminalPolicy)) {
    return null;
  }
  const retentionPolicy = isGeneratedRetentionPolicy(lifecycle.retentionPolicy)
    ? lifecycle.retentionPolicy
    : terminalPolicy === "debug_only"
      ? "debug_hidden_from_owner_queue"
      : terminalPolicy === "remain_actionable"
        ? "owner_actionable"
        : "owner_visible_until_terminal";
  return {
    artifactKind: "work_queue_generated_item_lifecycle",
    schemaVersion: WORK_QUEUE_GENERATED_ITEM_LIFECYCLE_VERSION,
    originKind,
    terminalPolicy,
    retentionPolicy,
    ownerVisible: lifecycle.ownerVisible === true,
    parentWorkItemId:
      typeof lifecycle.parentWorkItemId === "string" ? lifecycle.parentWorkItemId : null,
    owningRuntimeJobId:
      typeof lifecycle.owningRuntimeJobId === "string" ? lifecycle.owningRuntimeJobId : null,
    owningGraphId: typeof lifecycle.owningGraphId === "string" ? lifecycle.owningGraphId : null,
    owningNodeId: typeof lifecycle.owningNodeId === "string" ? lifecycle.owningNodeId : null,
    debugOnly: terminalPolicy === "debug_only" || lifecycle.debugOnly === true,
    createdBy: typeof lifecycle.createdBy === "string" ? lifecycle.createdBy : "unknown",
    reasonCodes: Array.isArray(lifecycle.reasonCodes)
      ? lifecycle.reasonCodes.filter((entry): entry is string => typeof entry === "string")
      : [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  };
}

export function mergeGeneratedLifecycleMetadata(
  metadata: JsonValue | undefined,
  lifecycle: WorkQueueGeneratedItemLifecycle,
): JsonValue {
  return {
    ...readRecord(metadata),
    generatedItemLifecycle: lifecycle,
    generatedOriginKind: lifecycle.originKind,
    generatedTerminalPolicy: lifecycle.terminalPolicy,
    generatedRetentionPolicy: lifecycle.retentionPolicy,
    generatedDebugOnly: lifecycle.debugOnly,
    generatedOwnerVisible: lifecycle.ownerVisible,
    parentWorkItemId: lifecycle.parentWorkItemId,
    owningRuntimeJobId: lifecycle.owningRuntimeJobId,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
  };
}

export function isGeneratedDebugOnly(metadata: JsonValue | undefined): boolean {
  const lifecycle = readGeneratedWorkQueueItemLifecycle(metadata);
  if (lifecycle) {
    return lifecycle.terminalPolicy === "debug_only" || lifecycle.debugOnly;
  }
  const record = readRecord(metadata);
  return record.generatedTerminalPolicy === "debug_only" || record.terminalPolicy === "debug_only";
}

export function readGeneratedTerminalPolicy(
  metadata: JsonValue | undefined,
): WorkQueueGeneratedItemTerminalPolicy | null {
  const lifecycle = readGeneratedWorkQueueItemLifecycle(metadata);
  if (lifecycle) {
    return lifecycle.terminalPolicy;
  }
  const record = readRecord(metadata);
  return isGeneratedTerminalPolicy(record.generatedTerminalPolicy)
    ? record.generatedTerminalPolicy
    : isGeneratedTerminalPolicy(record.terminalPolicy)
      ? record.terminalPolicy
      : null;
}

function readRecord(value: JsonValue | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isGeneratedOriginKind(value: unknown): value is WorkQueueGeneratedItemOriginKind {
  return (
    typeof value === "string" &&
    WORK_QUEUE_GENERATED_ITEM_ORIGIN_KINDS.includes(value as WorkQueueGeneratedItemOriginKind)
  );
}

function isGeneratedTerminalPolicy(value: unknown): value is WorkQueueGeneratedItemTerminalPolicy {
  return (
    typeof value === "string" &&
    WORK_QUEUE_GENERATED_ITEM_TERMINAL_POLICIES.includes(
      value as WorkQueueGeneratedItemTerminalPolicy,
    )
  );
}

function isGeneratedRetentionPolicy(
  value: unknown,
): value is WorkQueueGeneratedItemRetentionPolicy {
  return (
    typeof value === "string" &&
    WORK_QUEUE_GENERATED_ITEM_RETENTION_POLICIES.includes(
      value as WorkQueueGeneratedItemRetentionPolicy,
    )
  );
}
