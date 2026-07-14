// Projects the current managed TaskFlow checkpoint into a bounded agent turn context.

const ACTIVE_TASK_FLOW_STATUSES = new Set(["queued", "running", "waiting", "blocked"]);
const MAX_TASK_FLOW_CONTEXT_CHARS = 16_000;

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

export function buildManagedTaskFlowTurnContext(
  record: TaskFlowTurnContextRecord | undefined,
): string | undefined {
  if (
    !record ||
    record.syncMode !== "managed" ||
    !record.controllerId ||
    !ACTIVE_TASK_FLOW_STATUSES.has(record.status)
  ) {
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
