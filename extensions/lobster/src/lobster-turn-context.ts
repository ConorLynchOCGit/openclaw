// Projects the current managed TaskFlow checkpoint into a bounded agent turn context.

const ACTIVE_TASK_FLOW_STATUSES = new Set(["queued", "running", "waiting", "blocked"]);
const TERMINAL_TASK_FLOW_STATUSES = new Set(["succeeded", "failed", "cancelled", "lost"]);
const MAX_TASK_FLOW_CONTEXT_CHARS = 16_000;
const MAX_TASK_FLOW_CLOSEOUT_POINTER_CHARS = 4_000;

export type TaskFlowTurnContextRecord = {
  flowId: string;
  syncMode: string;
  ownerKey: string;
  controllerId?: string;
  revision: number;
  status: string;
  goal: string;
  currentStep?: string;
  blockedTaskId?: string;
  blockedSummary?: string;
  stateJson?: unknown;
  waitJson?: unknown;
  updatedAt: number;
};

function buildCheckpoint(record: TaskFlowTurnContextRecord, includeState: boolean) {
  return {
    schema: "openclaw.taskflow.turn_context.v1",
    flowId: record.flowId,
    controllerId: record.controllerId,
    revision: record.revision,
    status: record.status,
    goal: record.goal,
    currentStep: record.currentStep,
    blockedTaskId: record.blockedTaskId,
    blockedSummary: record.blockedSummary,
    ...(includeState
      ? {
          stateJson: record.stateJson ?? null,
          waitJson: record.waitJson ?? null,
        }
      : {}),
    updatedAt: record.updatedAt,
  };
}

type GoverningArtifact = {
  ref?: string;
  digest?: string;
};

export type TaskFlowCloseoutHandoff = {
  stateJson: {
    continuitySchema: "openclaw.taskflow.correction.v1";
    priorFlowId: string;
    priorFlowRevision: number;
    governingArtifactsDigest: string;
    governingArtifactCount: number;
  };
  governingArtifacts: GoverningArtifact[];
};

function buildCompactCloseoutPointer(
  record: TaskFlowTurnContextRecord,
  handoff: TaskFlowCloseoutHandoff,
): string {
  const explanation =
    "No active managed TaskFlow exists. A native reset may create a fresh physical model context while retaining this exact owner session key. That same owner may use the linked state below to create a new correction flow. The runtime validates owner key, requester origin, terminal flow, revision, and governing artifacts. A different session may not adopt the flow. Do not resume or replace the terminal flow. Transcript remains audit history.";
  const basePointer = {
    schema: "openclaw.taskflow.closeout_pointer.v1",
    priorFlow: {
      flowId: record.flowId,
      controllerId: record.controllerId,
      revision: record.revision,
      status: record.status,
    },
    correctionEpisode: {
      kind: "managed_taskflow",
      handoffScope: "same_owner_session_key_and_requester_origin",
      stateJson: handoff.stateJson,
    },
  };
  const visibleArtifacts = [...handoff.governingArtifacts];
  while (true) {
    const boundedPointer = JSON.stringify(
      {
        ...basePointer,
        governingArtifacts: visibleArtifacts,
        ...(visibleArtifacts.length < handoff.governingArtifacts.length
          ? {
              governingArtifactsOmitted:
                handoff.governingArtifacts.length - visibleArtifacts.length,
            }
          : {}),
      },
      null,
      2,
    );
    const boundedContext = [
      "<openclaw_taskflow_closeout_pointer>",
      explanation,
      boundedPointer,
      "</openclaw_taskflow_closeout_pointer>",
    ].join("\n");
    if (
      boundedContext.length <= MAX_TASK_FLOW_CLOSEOUT_POINTER_CHARS ||
      visibleArtifacts.length === 0
    ) {
      return boundedContext;
    }
    visibleArtifacts.pop();
  }
}

export function buildManagedTaskFlowTurnContext(
  record: TaskFlowTurnContextRecord | undefined,
  closeoutHandoff?: TaskFlowCloseoutHandoff,
): string | undefined {
  if (!record || record.syncMode !== "managed" || !record.controllerId) {
    return undefined;
  }

  if (TERMINAL_TASK_FLOW_STATUSES.has(record.status)) {
    return closeoutHandoff ? buildCompactCloseoutPointer(record, closeoutHandoff) : undefined;
  }
  if (!ACTIVE_TASK_FLOW_STATUSES.has(record.status)) {
    return undefined;
  }

  const checkpoint = buildCheckpoint(record, true);
  const serialized = JSON.stringify(checkpoint, null, 2);
  const boundedCheckpoint =
    serialized.length <= MAX_TASK_FLOW_CONTEXT_CHARS
      ? serialized
      : JSON.stringify(
          {
            ...buildCheckpoint(record, false),
            stateProjection: {
              omitted: true,
              serializedChars: serialized.length,
              maxChars: MAX_TASK_FLOW_CONTEXT_CHARS,
              reason: "managed TaskFlow checkpoint exceeds the turn-context projection cap",
            },
          },
          null,
          2,
        );

  return [
    "<openclaw_taskflow_checkpoint>",
    "This is the latest session-owned managed TaskFlow checkpoint. Its revision is current workflow continuity; exact artifact refs/digests present in the projected state govern, and older transcript proposals are audit history that must not supersede it.",
    boundedCheckpoint,
    "</openclaw_taskflow_checkpoint>",
  ].join("\n");
}
