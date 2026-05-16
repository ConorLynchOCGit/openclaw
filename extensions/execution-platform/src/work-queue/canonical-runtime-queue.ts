import type { WorkItemArtifact, WorkItemTruth } from "./types.ts";

type RuntimeQueueDependencyState = "none" | "ready" | "blocked";

export type CanonicalRuntimeQueueItem = {
  workItemId: string;
  title: string;
  lifecycleState: string;
  actionKind: string;
  activePosition: number | null;
  closedPosition: number | null;
  parentWorkItemIds: string[];
  parentWorkflowRefs: string[];
  childWorkItemIds: string[];
  dependencyRefs: string[];
  dependencyState: RuntimeQueueDependencyState;
  blockingDependencyRefs: string[];
  assignmentRefs: string[];
  assignedRoleIds: string[];
  assignedHumanIds: string[];
  assignedWorkflowIds: string[];
  runtimeJobIds: string[];
  runtimeJobRefs: string[];
  graphRefs: string[];
  validationRefs: string[];
  humanDecisionRefs: string[];
  closeoutRefs: string[];
  evidenceRefs: string[];
  closeoutState: "present" | "missing";
  planningStatus: string | null;
  runtimeLifecycleState: string;
  validationEvidenceState: "present" | "missing" | "not_required";
  closeoutEvidenceState: "present" | "missing";
  ownerReadbackState: "ready" | "needs_review" | "missing";
  projectionFreshnessState: "fresh" | "needs_review";
  blockerReasonCodes: string[];
  limitations: string[];
  priorityNote: string | null;
  eli5Progress: string | null;
  nextStep: string | null;
  lifecycleTruthSource: "work_queue_repository";
  planningStatusIsLifecycleState: false;
  sourceTrackerLifecycleOwner: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type CanonicalRuntimeQueueProjection = {
  artifactKind: "canonical_work_queue_runtime_projection";
  active: CanonicalRuntimeQueueItem[];
  closed: CanonicalRuntimeQueueItem[];
  lifecycleTruthSource: "work_queue_repository";
  sourceTrackerMode: "db_primary_no_source_tracker";
  runtimeProjectionVersion: "v3";
  sourceTrackerLifecycleOwner: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type CanonicalRuntimeQueueCloseoutReadbackUpdate = {
  workItemId: string;
  closeoutRef: string;
  accepted?: boolean;
  lifecycleMutationAllowed?: boolean;
  graphRefs?: string[];
  validationRefs?: string[];
  humanDecisionRefs?: string[];
  followUpChildWorkItemIds?: string[];
  blockerReasonCodes?: string[];
  limitations?: string[];
  priorityNote?: string | null;
  eli5Progress?: string | null;
  nextStep?: string | null;
};

const CLOSED_QUEUE_STATUSES = new Set(["closed", "superseded", "archived"]);
const CLOSED_LIFECYCLE_STATUSES = new Set(["succeeded", "failed", "canceled"]);
const MAX_REF_COUNT = 20;
const MAX_EVIDENCE_REF_COUNT = 40;
const MAX_BLOCKER_REASON_COUNT = 10;
const DEPENDENCY_READY_STATES = new Set(["succeeded"]);
const CLOSEOUT_PROJECTION_READBACK_ARTIFACT_TYPE =
  "execution_platform.closeout_projection_readback";
const MAX_LIMITATION_COUNT = 10;
const MAX_CHILD_COUNT = 50;
const MAX_PRIORITY_NOTE_LENGTH = 160;
const CLOSEOUT_READBACK_SELF_CHILD_REF_REJECTED = "closeout_readback_self_child_ref_rejected";
const CLOSEOUT_READBACK_FOLLOW_UP_CHILD_REF_MISSING =
  "closeout_readback_follow_up_child_ref_missing";
const CLOSEOUT_READBACK_FOLLOW_UP_CHILD_REF_PENDING_LIMITATION =
  "Follow-up child refs were recorded, but one or more child items are not yet present in runtime projection truth.";
const MAX_TEXT_LENGTH = 280;
const MAX_ID_LENGTH = 200;
const RUNTIME_JOB_URI_PREFIX = "runtime-job://";
const HUMAN_ASSIGNMENT_TYPES = new Set(["user", "human", "owner", "operator"]);
const WORKFLOW_ASSIGNMENT_TYPES = new Set(["workflow", "workflow_worker", "agent_team"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function boundedString(value: string | null, maxLength = MAX_TEXT_LENGTH): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, maxLength);
}

function boundedStringArray(value: unknown, maxItems: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index)
        .slice(0, maxItems)
    : [];
}
function boundedPriorityNote(value: unknown): string | null {
  if (typeof value === "string") {
    return boundedString(value.trim(), MAX_PRIORITY_NOTE_LENGTH);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        const bounded = boundedString(entry.trim(), MAX_PRIORITY_NOTE_LENGTH);
        if (bounded) {
          return bounded;
        }
      }
    }
  }
  return null;
}
function itemUpdatedTime(truth: WorkItemTruth): number {
  return truth.item.updatedAt.getTime();
}

function compareTruthByRuntimeOrder(left: WorkItemTruth, right: WorkItemTruth): number {
  const byUpdatedAt = itemUpdatedTime(right) - itemUpdatedTime(left);
  if (byUpdatedAt !== 0) {
    return byUpdatedAt;
  }
  return left.item.workItemId.localeCompare(right.item.workItemId);
}

function compareActiveTruthByDbOrder(left: WorkItemTruth, right: WorkItemTruth): number {
  const byRank =
    (left.item.queueRank ?? Number.MAX_SAFE_INTEGER) -
    (right.item.queueRank ?? Number.MAX_SAFE_INTEGER);
  if (byRank !== 0) {
    return byRank;
  }
  return left.item.workItemId.localeCompare(right.item.workItemId);
}

function compareClosedTruthByDbOrder(left: WorkItemTruth, right: WorkItemTruth): number {
  const byClosedAt = (right.item.closedAt?.getTime() ?? 0) - (left.item.closedAt?.getTime() ?? 0);
  if (byClosedAt !== 0) {
    return byClosedAt;
  }
  return compareTruthByRuntimeOrder(left, right);
}

function closeoutRefs(truth: WorkItemTruth): string[] {
  return truth.artifacts
    .filter((artifact) => artifact.artifactType.includes("closeout"))
    .map((artifact) => artifact.uri)
    .filter((value) => value.trim().length > 0)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, MAX_REF_COUNT);
}

function runtimeJobIdFromRef(value: string): string | null {
  const normalized = value.trim();
  if (!normalized.startsWith(RUNTIME_JOB_URI_PREFIX)) {
    return null;
  }
  const runtimeJobId = normalized.slice(RUNTIME_JOB_URI_PREFIX.length).split("/")[0]?.trim() ?? "";
  return runtimeJobId.length > 0 ? runtimeJobId : null;
}

function runtimeJobIdsFromArtifacts(truth: WorkItemTruth): string[] {
  return uniqueBoundedStrings(
    truth.artifacts.flatMap((artifact) => {
      const runtimeJobIdFromUri = runtimeJobIdFromRef(artifact.uri);
      if (runtimeJobIdFromUri) {
        return [runtimeJobIdFromUri];
      }
      const metadata = asRecord(artifact.metadata);
      const runtimeJobIdFromMetadata = stringValue(metadata?.runtimeJobId);
      return runtimeJobIdFromMetadata ? [runtimeJobIdFromMetadata] : [];
    }),
    MAX_REF_COUNT,
  );
}

function runtimeJobIdsFromRefs(values: string[]): string[] {
  return uniqueBoundedStrings(
    values.flatMap((value) => {
      const runtimeJobId = runtimeJobIdFromRef(value);
      return runtimeJobId ? [runtimeJobId] : [];
    }),
    MAX_REF_COUNT,
  );
}

function planningStatusFromDb(truth: WorkItemTruth): string {
  return queueStatusForTruth(truth);
}

function queueStatusForTruth(truth: WorkItemTruth): string {
  return (
    truth.item.queueStatus ??
    (CLOSED_LIFECYCLE_STATUSES.has(truth.item.lifecycleState) ? "closed" : "active")
  );
}

function projectionSubstates(input: {
  truth: WorkItemTruth;
  runtimeJobIds: string[];
  validationRefs: string[];
  closeoutRefs: string[];
  blockerReasonCodes: string[];
  eli5Progress: string | null;
  nextStep: string | null;
}): Pick<
  CanonicalRuntimeQueueItem,
  | "planningStatus"
  | "runtimeLifecycleState"
  | "validationEvidenceState"
  | "closeoutEvidenceState"
  | "ownerReadbackState"
  | "projectionFreshnessState"
> {
  const lifecycleState = input.truth.item.lifecycleState;
  const runtimeEvidenceExpected =
    input.runtimeJobIds.length > 0 ||
    ["running", "succeeded", "failed", "canceled"].includes(lifecycleState);
  const validationEvidenceState =
    input.validationRefs.length > 0
      ? "present"
      : runtimeEvidenceExpected
        ? "missing"
        : "not_required";
  const closeoutEvidenceState = input.closeoutRefs.length > 0 ? "present" : "missing";
  const ownerReadbackState =
    closeoutEvidenceState === "present" && (input.eli5Progress || input.nextStep)
      ? "ready"
      : closeoutEvidenceState === "present" || runtimeEvidenceExpected
        ? "needs_review"
        : "missing";
  return {
    planningStatus: planningStatusFromDb(input.truth),
    runtimeLifecycleState: lifecycleState,
    validationEvidenceState,
    closeoutEvidenceState,
    ownerReadbackState,
    projectionFreshnessState:
      input.blockerReasonCodes.length === 0 && validationEvidenceState !== "missing"
        ? "fresh"
        : "needs_review",
  };
}

function refreshedProjectedSubstates(
  item: Pick<
    CanonicalRuntimeQueueItem,
    | "runtimeJobIds"
    | "validationRefs"
    | "closeoutRefs"
    | "blockerReasonCodes"
    | "eli5Progress"
    | "nextStep"
    | "lifecycleState"
  >,
): Pick<
  CanonicalRuntimeQueueItem,
  | "validationEvidenceState"
  | "closeoutEvidenceState"
  | "ownerReadbackState"
  | "projectionFreshnessState"
> {
  const runtimeEvidenceExpected =
    item.runtimeJobIds.length > 0 ||
    ["running", "succeeded", "failed", "canceled"].includes(item.lifecycleState);
  const validationEvidenceState =
    item.validationRefs.length > 0
      ? "present"
      : runtimeEvidenceExpected
        ? "missing"
        : "not_required";
  const closeoutEvidenceState = item.closeoutRefs.length > 0 ? "present" : "missing";
  const ownerReadbackState =
    closeoutEvidenceState === "present" && (item.eli5Progress || item.nextStep)
      ? "ready"
      : closeoutEvidenceState === "present" || runtimeEvidenceExpected
        ? "needs_review"
        : "missing";
  return {
    validationEvidenceState,
    closeoutEvidenceState,
    ownerReadbackState,
    projectionFreshnessState:
      item.blockerReasonCodes.length === 0 && validationEvidenceState !== "missing"
        ? "fresh"
        : "needs_review",
  };
}

function blockingDependencyRefs(
  truth: WorkItemTruth,
  lifecycleByWorkItemId: Map<string, string>,
): string[] {
  return truth.dependencies
    .map((dependency) => dependency.dependsOnWorkItemId)
    .filter((dependsOnWorkItemId) => {
      const dependencyState = lifecycleByWorkItemId.get(dependsOnWorkItemId);
      return !dependencyState || !DEPENDENCY_READY_STATES.has(dependencyState);
    })
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, MAX_REF_COUNT);
}

function mergeReasonCode(
  reasonCodesByWorkItemId: Map<string, string[]>,
  workItemId: string,
  reasonCode: string,
): void {
  const reasonCodes = new Set(reasonCodesByWorkItemId.get(workItemId) ?? []);
  reasonCodes.add(reasonCode);
  reasonCodesByWorkItemId.set(workItemId, [...reasonCodes].slice(0, MAX_BLOCKER_REASON_COUNT));
}

function closeoutProjectionUpdateFromArtifact(
  artifact: WorkItemArtifact,
): CanonicalRuntimeQueueCloseoutReadbackUpdate | null {
  if (artifact.artifactType !== CLOSEOUT_PROJECTION_READBACK_ARTIFACT_TYPE) {
    return null;
  }
  const metadata = asRecord(artifact.metadata);
  const metadataWorkItemId = stringValue(metadata?.workItemId)?.slice(0, MAX_ID_LENGTH) ?? null;
  if (metadataWorkItemId && metadataWorkItemId !== artifact.workItemId) {
    throw new Error("closeout_projection_work_item_id_mismatch");
  }
  const workItemId = metadataWorkItemId ?? artifact.workItemId;
  const closeoutRef = stringValue(metadata?.closeoutRef) ?? artifact.uri;
  if (!closeoutRef) {
    throw new Error("closeout_projection_missing_required_refs");
  }
  if (
    metadata?.lifecycleMutationAllowed === true ||
    metadata?.workQueueLifecycleMutationAllowed === true ||
    metadata?.workQueueLifecycleMutated === true
  ) {
    throw new Error("closeout_projection_lifecycle_mutation_rejected");
  }
  return {
    workItemId,
    closeoutRef,
    accepted: metadata?.accepted === false ? false : undefined,
    lifecycleMutationAllowed: metadata?.lifecycleMutationAllowed === true,
    graphRefs: boundedStringArray(metadata?.graphRefs, MAX_REF_COUNT),
    validationRefs: boundedStringArray(metadata?.validationRefs, MAX_REF_COUNT),
    humanDecisionRefs: boundedStringArray(metadata?.humanDecisionRefs, MAX_REF_COUNT),
    followUpChildWorkItemIds: boundedStringArray(
      metadata?.followUpChildWorkItemIds,
      MAX_CHILD_COUNT,
    ),
    blockerReasonCodes: boundedStringArray(metadata?.blockerReasonCodes, MAX_BLOCKER_REASON_COUNT),
    limitations: boundedStringArray(metadata?.limitations, MAX_LIMITATION_COUNT),
    priorityNote: boundedPriorityNote(metadata?.priorityNote ?? metadata?.priorityNotes),
    eli5Progress: boundedString(
      metadata?.eli5Progress === null ? null : stringValue(metadata?.eli5Progress),
    ),
    nextStep: boundedString(metadata?.nextStep === null ? null : stringValue(metadata?.nextStep)),
  };
}

function evidenceRefsForItem(input: {
  runtimeJobRefs: string[];
  graphRefs: string[];
  validationRefs: string[];
  humanDecisionRefs: string[];
  closeoutRefs: string[];
}): string[] {
  return uniqueBoundedStrings(
    [
      ...input.runtimeJobRefs,
      ...input.graphRefs,
      ...input.validationRefs,
      ...input.humanDecisionRefs,
      ...input.closeoutRefs,
    ],
    MAX_EVIDENCE_REF_COUNT,
  );
}

export function projectCanonicalRuntimeQueue(
  truths: WorkItemTruth[],
): CanonicalRuntimeQueueProjection {
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();
  const parentWorkflowRefsByChild = new Map<string, string[]>();
  const knownWorkItemIds = new Set(truths.map((truth) => truth.item.workItemId));
  for (const truth of truths) {
    for (const dependency of truth.dependencies) {
      parentsByChild.set(truth.item.workItemId, [
        ...(parentsByChild.get(truth.item.workItemId) ?? []),
        dependency.dependsOnWorkItemId,
      ]);
      childrenByParent.set(dependency.dependsOnWorkItemId, [
        ...(childrenByParent.get(dependency.dependsOnWorkItemId) ?? []),
        truth.item.workItemId,
      ]);
    }
    for (const link of truth.parentWorkflowLinks) {
      parentWorkflowRefsByChild.set(truth.item.workItemId, [
        ...(parentWorkflowRefsByChild.get(truth.item.workItemId) ?? []),
        `${link.parentWorkflowKind}:${link.parentWorkflowId}`,
      ]);
      parentsByChild.set(truth.item.workItemId, [
        ...(parentsByChild.get(truth.item.workItemId) ?? []),
        link.parentWorkflowId,
      ]);
      childrenByParent.set(link.parentWorkflowId, [
        ...(childrenByParent.get(link.parentWorkflowId) ?? []),
        truth.item.workItemId,
      ]);
    }
  }

  const lifecycleByWorkItemId = new Map(
    truths.map((truth) => [truth.item.workItemId, truth.item.lifecycleState]),
  );
  const sorted = truths.toSorted(compareTruthByRuntimeOrder);
  const activeTruths = sorted
    .filter((truth) => !CLOSED_QUEUE_STATUSES.has(queueStatusForTruth(truth)))
    .toSorted(compareActiveTruthByDbOrder);
  const closedTruths = sorted
    .filter((truth) => CLOSED_QUEUE_STATUSES.has(queueStatusForTruth(truth)))
    .toSorted(compareClosedTruthByDbOrder);

  const mapItem = (
    truth: WorkItemTruth,
    activePosition: number | null,
    closedPosition: number | null,
  ): CanonicalRuntimeQueueItem => {
    const unresolvedDependencyRefs = blockingDependencyRefs(truth, lifecycleByWorkItemId);
    const itemCloseoutRefs = closeoutRefs(truth);
    const runtimeJobIds = uniqueBoundedStrings(
      [
        ...truth.runs
          .map((run) => run.runtimeJobId)
          .filter((runtimeJobId): runtimeJobId is string => Boolean(runtimeJobId)),
        ...runtimeJobIdsFromArtifacts(truth),
      ],
      MAX_REF_COUNT,
    );
    const runtimeJobRefs = runtimeJobIds.map(
      (runtimeJobId) => `${RUNTIME_JOB_URI_PREFIX}${runtimeJobId}`,
    );
    const graphRefs = truth.artifacts
      .filter(
        (artifact) =>
          artifact.artifactType.includes("task_graph") ||
          artifact.uri.includes("/runtime-work-graph/"),
      )
      .map((artifact) => artifact.uri)
      .filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index)
      .slice(0, MAX_REF_COUNT);
    const validationRefs = truth.artifacts
      .filter(
        (artifact) =>
          artifact.artifactType.includes("validation") || artifact.uri.includes("/validation/"),
      )
      .map((artifact) => artifact.uri)
      .filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index)
      .slice(0, MAX_REF_COUNT);
    const humanDecisionRefs = truth.artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.human_scope_decision")
      .map((artifact) => artifact.uri)
      .filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index)
      .slice(0, MAX_REF_COUNT);
    const substates = projectionSubstates({
      truth,
      runtimeJobIds,
      validationRefs,
      closeoutRefs: itemCloseoutRefs,
      blockerReasonCodes: [],
      eli5Progress: null,
      nextStep: null,
    });
    return {
      workItemId: truth.item.workItemId,
      title: truth.item.title,
      lifecycleState: truth.item.lifecycleState,
      actionKind: truth.item.itemType,
      activePosition,
      closedPosition,
      parentWorkItemIds: [...new Set(parentsByChild.get(truth.item.workItemId) ?? [])]
        .filter((parentWorkItemId) => knownWorkItemIds.has(parentWorkItemId))
        .slice(0, 20),
      parentWorkflowRefs: [
        ...new Set(parentWorkflowRefsByChild.get(truth.item.workItemId) ?? []),
      ].slice(0, MAX_REF_COUNT),
      childWorkItemIds: [...new Set(childrenByParent.get(truth.item.workItemId) ?? [])].slice(
        0,
        50,
      ),
      dependencyRefs: uniqueBoundedStrings(
        truth.dependencies.map((dependency) => dependency.dependsOnWorkItemId),
        20,
      ),
      dependencyState:
        truth.dependencies.length === 0
          ? "none"
          : unresolvedDependencyRefs.length === 0
            ? "ready"
            : "blocked",
      blockingDependencyRefs: unresolvedDependencyRefs,
      assignmentRefs: uniqueBoundedStrings(
        truth.assignments.map(
          (assignment) => `${assignment.assigneeType}:${assignment.assigneeId}:${assignment.role}`,
        ),
        MAX_REF_COUNT,
      ),
      assignedRoleIds: uniqueBoundedStrings(
        truth.assignments.map((assignment) => `${assignment.role}:${assignment.assigneeId}`),
        12,
      ),
      assignedHumanIds: uniqueBoundedStrings(
        truth.assignments
          .filter((assignment) => isHumanAssignmentType(assignment.assigneeType))
          .map((assignment) => assignment.assigneeId),
        12,
      ),
      assignedWorkflowIds: uniqueBoundedStrings(
        truth.assignments
          .filter((assignment) => isWorkflowAssignmentType(assignment.assigneeType))
          .map((assignment) => assignment.assigneeId),
        12,
      ),
      runtimeJobIds,
      runtimeJobRefs,
      graphRefs,
      validationRefs,
      humanDecisionRefs,
      closeoutRefs: itemCloseoutRefs,
      evidenceRefs: evidenceRefsForItem({
        runtimeJobRefs,
        graphRefs,
        validationRefs,
        humanDecisionRefs,
        closeoutRefs: itemCloseoutRefs,
      }),
      closeoutState: itemCloseoutRefs.length > 0 ? "present" : "missing",
      ...substates,
      blockerReasonCodes: [],
      limitations: [],
      priorityNote: null,
      eli5Progress: null,
      nextStep: null,
      lifecycleTruthSource: "work_queue_repository",
      planningStatusIsLifecycleState: false,
      sourceTrackerLifecycleOwner: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    };
  };

  let projection: CanonicalRuntimeQueueProjection = {
    artifactKind: "canonical_work_queue_runtime_projection",
    active: activeTruths.map((truth, index) => mapItem(truth, index + 1, null)),
    closed: closedTruths.map((truth, index) => mapItem(truth, null, index + 1)),
    lifecycleTruthSource: "work_queue_repository",
    sourceTrackerMode: "db_primary_no_source_tracker",
    runtimeProjectionVersion: "v3",
    sourceTrackerLifecycleOwner: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };

  const closeoutProjectionReasonCodesByWorkItemId = new Map<string, string[]>();
  for (const truth of sorted) {
    const closeoutProjectionArtifacts = truth.artifacts
      .filter((candidate) => candidate.artifactType === CLOSEOUT_PROJECTION_READBACK_ARTIFACT_TYPE)
      .toSorted((left, right) => {
        const byCreatedAt = left.createdAt.getTime() - right.createdAt.getTime();
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }
        return left.artifactId.localeCompare(right.artifactId);
      });
    for (const artifact of closeoutProjectionArtifacts) {
      let update: CanonicalRuntimeQueueCloseoutReadbackUpdate | null;
      try {
        update = closeoutProjectionUpdateFromArtifact(artifact);
      } catch (error) {
        mergeReasonCode(
          closeoutProjectionReasonCodesByWorkItemId,
          truth.item.workItemId,
          error instanceof Error ? error.message : "closeout_projection_readback_invalid_shape",
        );
        continue;
      }
      if (update) {
        try {
          projection = applyCloseoutReadbackToCanonicalRuntimeQueue({ projection, update });
        } catch (error) {
          mergeReasonCode(
            closeoutProjectionReasonCodesByWorkItemId,
            truth.item.workItemId,
            error instanceof Error ? error.message : "closeout_projection_readback_apply_failed",
          );
        }
      }
    }
  }

  if (closeoutProjectionReasonCodesByWorkItemId.size > 0) {
    const includeReasonCodes = (item: CanonicalRuntimeQueueItem): CanonicalRuntimeQueueItem => {
      const reasonCodes = closeoutProjectionReasonCodesByWorkItemId.get(item.workItemId);
      if (!reasonCodes || reasonCodes.length === 0) {
        return item;
      }
      return {
        ...item,
        blockerReasonCodes: [...new Set([...item.blockerReasonCodes, ...reasonCodes])].slice(
          0,
          MAX_BLOCKER_REASON_COUNT,
        ),
      };
    };
    projection = {
      ...projection,
      active: projection.active.map(includeReasonCodes),
      closed: projection.closed.map(includeReasonCodes),
    };
  }

  return projection;
}

export function applyCloseoutReadbackToCanonicalRuntimeQueue(input: {
  projection: CanonicalRuntimeQueueProjection;
  update: CanonicalRuntimeQueueCloseoutReadbackUpdate;
}): CanonicalRuntimeQueueProjection {
  if (input.update.accepted === false) {
    throw new Error("closeout_readback_requires_accepted_capsule");
  }
  if (input.update.lifecycleMutationAllowed === true) {
    throw new Error("closeout_readback_lifecycle_mutation_rejected");
  }
  if (!input.update.workItemId.trim() || !input.update.closeoutRef.trim()) {
    throw new Error("closeout_readback_missing_required_refs");
  }

  const workItemId = input.update.workItemId.trim().slice(0, MAX_ID_LENGTH);
  const closeoutRef = input.update.closeoutRef.trim();
  let matched = false;
  const requestedFollowUpChildWorkItemIds = boundedStringArray(
    input.update.followUpChildWorkItemIds,
    MAX_CHILD_COUNT,
  );
  const followUpChildWorkItemIds = requestedFollowUpChildWorkItemIds.filter(
    (childWorkItemId) => childWorkItemId !== workItemId,
  );
  const knownWorkItemIds = new Set(
    [...input.projection.active, ...input.projection.closed].map((item) => item.workItemId),
  );
  const missingFollowUpChildWorkItemIds = followUpChildWorkItemIds.filter(
    (childWorkItemId) => !knownWorkItemIds.has(childWorkItemId),
  );
  const rejectedSelfChildReference =
    followUpChildWorkItemIds.length !== requestedFollowUpChildWorkItemIds.length;
  const graphRefs = boundedStringArray(input.update.graphRefs, MAX_REF_COUNT);
  const validationRefs = boundedStringArray(input.update.validationRefs, MAX_REF_COUNT);
  const humanDecisionRefs = boundedStringArray(input.update.humanDecisionRefs, MAX_REF_COUNT);
  const blockerReasonCodes = boundedStringArray(
    input.update.blockerReasonCodes,
    MAX_BLOCKER_REASON_COUNT,
  );
  const limitations = boundedStringArray(input.update.limitations, MAX_LIMITATION_COUNT);
  const priorityNote = boundedPriorityNote(input.update.priorityNote);
  const eli5Progress = boundedString(input.update.eli5Progress ?? null);
  const nextStep = boundedString(input.update.nextStep ?? null);
  const runtimeJobIdsFromCloseoutReadback = runtimeJobIdsFromRefs([
    closeoutRef,
    ...graphRefs,
    ...validationRefs,
    ...humanDecisionRefs,
  ]);
  const updateItem = (item: CanonicalRuntimeQueueItem): CanonicalRuntimeQueueItem => {
    if (item.workItemId !== workItemId) {
      return item;
    }
    matched = true;
    const graphRefsWithUpdate = [...new Set([...item.graphRefs, ...graphRefs])].slice(
      0,
      MAX_REF_COUNT,
    );
    const validationRefsWithUpdate = [
      ...new Set([...item.validationRefs, ...validationRefs]),
    ].slice(0, MAX_REF_COUNT);
    const humanDecisionRefsWithUpdate = [
      ...new Set([...item.humanDecisionRefs, ...humanDecisionRefs]),
    ].slice(0, MAX_REF_COUNT);
    const closeoutRefsWithUpdate = [...new Set([closeoutRef, ...item.closeoutRefs])].slice(
      0,
      MAX_REF_COUNT,
    );
    const runtimeJobIdsWithUpdate = uniqueBoundedStrings(
      [...item.runtimeJobIds, ...runtimeJobIdsFromCloseoutReadback],
      MAX_REF_COUNT,
    );
    const runtimeJobRefsWithUpdate = runtimeJobIdsWithUpdate.map(
      (runtimeJobId) => `${RUNTIME_JOB_URI_PREFIX}${runtimeJobId}`,
    );
    const updatedItem: CanonicalRuntimeQueueItem = {
      ...item,
      childWorkItemIds: [...new Set([...item.childWorkItemIds, ...followUpChildWorkItemIds])].slice(
        0,
        MAX_CHILD_COUNT,
      ),
      runtimeJobIds: runtimeJobIdsWithUpdate,
      runtimeJobRefs: runtimeJobRefsWithUpdate,
      graphRefs: graphRefsWithUpdate,
      validationRefs: validationRefsWithUpdate,
      humanDecisionRefs: humanDecisionRefsWithUpdate,
      closeoutRefs: closeoutRefsWithUpdate,
      evidenceRefs: evidenceRefsForItem({
        runtimeJobRefs: runtimeJobRefsWithUpdate,
        graphRefs: graphRefsWithUpdate,
        validationRefs: validationRefsWithUpdate,
        humanDecisionRefs: humanDecisionRefsWithUpdate,
        closeoutRefs: closeoutRefsWithUpdate,
      }),
      closeoutState: "present",
      blockerReasonCodes: [
        ...new Set([...item.blockerReasonCodes, ...blockerReasonCodes]),
        ...(rejectedSelfChildReference ? [CLOSEOUT_READBACK_SELF_CHILD_REF_REJECTED] : []),
        ...(missingFollowUpChildWorkItemIds.length > 0
          ? [CLOSEOUT_READBACK_FOLLOW_UP_CHILD_REF_MISSING]
          : []),
      ].slice(0, MAX_BLOCKER_REASON_COUNT),
      limitations: [
        ...new Set([
          ...item.limitations,
          ...limitations,
          ...(missingFollowUpChildWorkItemIds.length > 0
            ? [CLOSEOUT_READBACK_FOLLOW_UP_CHILD_REF_PENDING_LIMITATION]
            : []),
        ]),
      ].slice(0, MAX_LIMITATION_COUNT),
      priorityNote: priorityNote ?? item.priorityNote,
      eli5Progress: eli5Progress ?? item.eli5Progress,
      nextStep: nextStep ?? item.nextStep,
    };
    return {
      ...updatedItem,
      ...refreshedProjectedSubstates(updatedItem),
    };
  };

  let updatedProjection: CanonicalRuntimeQueueProjection = {
    ...input.projection,
    active: input.projection.active.map(updateItem),
    closed: input.projection.closed.map(updateItem),
  };
  if (!matched) {
    throw new Error("closeout_readback_target_work_item_missing");
  }

  if (followUpChildWorkItemIds.length > 0) {
    const followUpChildWorkItemIdSet = new Set(followUpChildWorkItemIds);
    const linkParentRefForKnownChild = (
      item: CanonicalRuntimeQueueItem,
    ): CanonicalRuntimeQueueItem => {
      if (!followUpChildWorkItemIdSet.has(item.workItemId)) {
        return item;
      }
      return {
        ...item,
        parentWorkItemIds: [...new Set([workItemId, ...item.parentWorkItemIds])].slice(0, 20),
      };
    };
    updatedProjection = {
      ...updatedProjection,
      active: updatedProjection.active.map(linkParentRefForKnownChild),
      closed: updatedProjection.closed.map(linkParentRefForKnownChild),
    };
  }

  return updatedProjection;
}
function uniqueBoundedStrings(values: string[], maxItems: number): string[] {
  return values
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
    .slice(0, maxItems);
}

function isHumanAssignmentType(value: string): boolean {
  return HUMAN_ASSIGNMENT_TYPES.has(value.trim().toLowerCase());
}

function isWorkflowAssignmentType(value: string): boolean {
  return WORKFLOW_ASSIGNMENT_TYPES.has(value.trim().toLowerCase());
}
