import type {
  WorkItemQueueStatus,
  WorkItemTruth,
  WorkQueueConvergenceSlicePlanningStatus,
  WorkQueueConvergenceSliceProjection,
} from "./types.ts";

const CLOSED_STATUSES = new Set<WorkItemQueueStatus>(["closed", "superseded", "archived"]);
const CLOSED_LIFECYCLE_STATUSES = new Set(["succeeded", "failed", "canceled"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index)
        .slice(0, maxItems)
    : [];
}

function planningStatusFromQueueStatus(
  queueStatus: WorkItemQueueStatus,
): WorkQueueConvergenceSlicePlanningStatus {
  switch (queueStatus) {
    case "closed":
      return "completed";
    case "blocked":
      return "blocked";
    case "needs_review":
      return "needs_review";
    case "superseded":
      return "superseded";
    case "active":
    case "archived":
      return "planned";
  }
  return "planned";
}

export function projectDbPrimaryWorkQueueItem(input: {
  truth: WorkItemTruth;
  activePosition?: number | null;
  closedPosition?: number | null;
}): WorkQueueConvergenceSliceProjection | null {
  const { truth } = input;
  const queueStatus =
    truth.item.queueStatus ??
    (CLOSED_LIFECYCLE_STATUSES.has(truth.item.lifecycleState) ? "closed" : "active");
  const metadata = asRecord(truth.item.metadata);
  const runtimeJobIds = [
    ...new Set([
      ...(truth.item.closedByRuntimeJobId ? [truth.item.closedByRuntimeJobId] : []),
      ...truth.runs
        .map((run) => run.runtimeJobId)
        .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
    ]),
  ].slice(0, 20);
  const artifactRefs = [
    ...stringArray(metadata?.artifactRefs, 40),
    ...truth.artifacts.map((artifact) => artifact.uri),
  ]
    .filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index)
    .slice(0, 40);
  const blockerReasonCodes = stringArray(metadata?.blockerReasonCodes, 20);
  const sourceDocRefs = stringArray(metadata?.sourceDocRefs, 20);
  const dependsOnSliceIds = truth.dependencies
    .map((dependency) => dependency.dependsOnWorkItemId)
    .slice(0, 50);
  const activePosition =
    input.activePosition ??
    (CLOSED_STATUSES.has(queueStatus) ? null : (truth.item.queueRank ?? null));
  const closedPosition = input.closedPosition ?? null;
  const position = activePosition ?? closedPosition;
  const activeQueueId = stringValue(metadata?.activeQueueId) ?? truth.item.workItemId;
  const title = truth.item.title;

  return {
    artifactKind: "work_queue_convergence_slice_projection",
    trackerVersion: "work-queue-db-primary.v1",
    trackerKind: "active_queue_item",
    sliceId: truth.item.workItemId,
    title,
    track: stringValue(metadata?.track) ?? "execution-platform",
    wave: stringValue(metadata?.wave) ?? "db-primary-work-queue",
    planningStatus: planningStatusFromQueueStatus(queueStatus),
    priority: numberValue(metadata?.priority) ?? truth.item.queueRank ?? 1000,
    legacySliceId: stringValue(metadata?.legacySliceId),
    previousSliceId: stringValue(metadata?.previousSliceId),
    historicalSliceId: stringValue(metadata?.historicalSliceId),
    activeQueueId,
    activeQueuePosition: activePosition,
    remainingQueuePosition: activePosition,
    remainingQueueLabel: activePosition
      ? `remaining-queue-${String(activePosition).padStart(2, "0")}`
      : null,
    supersededByActiveQueueId: stringValue(metadata?.supersededByActiveQueueId),
    dependsOnSliceIds,
    dependsOnActiveQueueIds: dependsOnSliceIds.filter((id) => id.includes(".active-queue-")),
    dependsOnHistoricalSliceIds: dependsOnSliceIds.filter((id) => id.includes(".slice-")),
    sourceDocRefs,
    artifactRefs,
    runtimeJobRefs: runtimeJobIds.map((runtimeJobId) => `runtime-job://${runtimeJobId}`),
    blockerReasonCodes,
    nextAction: stringValue(metadata?.nextAction),
    ownerSystemArea: stringValue(metadata?.ownerSystemArea) ?? "execution-platform",
    createdAt: truth.item.createdAt.toISOString(),
    updatedAt: truth.item.updatedAt.toISOString(),
    planningStateSource: "work_queue_db",
    queueStatus,
    queuePosition: position,
    runtimeState: {
      lifecycleState: truth.item.lifecycleState,
      runCount: truth.runs.length,
      runtimeJobIds,
      lifecycleTruthSource: "work_queue_repository",
      planningStatusIsLifecycleState: false,
      validationEvidenceState: truth.item.validationRef ? "present" : "not_required",
      closeoutEvidenceState:
        truth.item.closeoutCapsuleRef || truth.item.closedByCloseoutRef ? "present" : "missing",
      ownerReadbackState:
        truth.item.ownerReadbackRef || truth.item.closeoutCapsuleRef ? "ready" : "missing",
      projectionFreshnessState: blockerReasonCodes.length === 0 ? "fresh" : "needs_review",
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}
