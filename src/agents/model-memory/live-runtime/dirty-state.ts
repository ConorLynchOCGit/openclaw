import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { classifyMemoryIngestionFailure, type MemoryIngestionFailureClass } from "../../../plugin-sdk/model-memory.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { emitModelMemoryActivityFeedEvent } from "../../model-memory.activity-feed.js";
import {
  createModelMemoryRuntimeDirtyStore,
  markModelMemoryRuntimeDirtyAndSchedule,
  resetModelMemoryRuntimeDirtyStoreForTests,
  type ModelMemoryRuntimeDirtyEvent,
  type ModelMemoryRuntimeDirtyEventType,
  type ModelMemoryRuntimeDirtyReason,
  type ModelMemoryRuntimeDirtyState,
  type ModelMemoryRuntimeDirtyStatus,
} from "../../model-memory.runtime-dirty.js";

const log = createSubsystemLogger("model-memory/live-runtime");

export type ModelMemoryRuntimeDirtySnapshot = ModelMemoryRuntimeDirtyState;
export type ModelMemoryRuntimeDirtyMarkResult = {
  state: ModelMemoryRuntimeDirtySnapshot;
  scheduled: boolean;
  schedulerReason:
    | "write_threshold"
    | "age_threshold"
    | "manual_admin_request"
    | "disabled"
    | "already_active"
    | "deferred";
};

function mapRuntimeDirtyStatusToActivityStatus(
  status: ModelMemoryRuntimeDirtyStatus,
  eventType: ModelMemoryRuntimeDirtyEventType,
) {
  if (eventType === "runtime_rebuild_completed" || eventType === "runtime_dirty_cleared") {
    return "completed" as const;
  }
  if (eventType === "runtime_rebuild_failed") {
    return "failed" as const;
  }
  if (
    eventType === "runtime_rebuild_scheduled" ||
    eventType === "runtime_rebuild_admin_requested"
  ) {
    return "scheduled" as const;
  }
  if (eventType === "runtime_rebuild_started" || status === "rebuilding") {
    return "rebuilding" as const;
  }
  if (
    eventType === "runtime_rebuild_coalesced" ||
    eventType === "runtime_rebuild_skipped_lock_busy"
  ) {
    return "deferred" as const;
  }
  return status === "failed" ? ("failed" as const) : ("deferred" as const);
}

async function emitRuntimeDirtyActivity(input: {
  config?: OpenClawConfig;
  kind?: "ordinary_turn_capture" | "tool_result_capture" | "projection";
  eventType: ModelMemoryRuntimeDirtyEventType | "runtime_rebuild_deferred";
  state: ModelMemoryRuntimeDirtyState;
  event?: ModelMemoryRuntimeDirtyEvent;
  captureJobId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  schedulerReason?: string;
}) {
  await emitModelMemoryActivityFeedEvent({
    kind: input.kind ?? "ordinary_turn_capture",
    status:
      input.eventType === "runtime_rebuild_deferred"
        ? "deferred"
        : mapRuntimeDirtyStatusToActivityStatus(input.state.status, input.eventType),
    eventType: input.eventType,
    config: input.config,
    sessionId: input.sessionId ?? input.event?.sessionId,
    sessionKey: input.sessionKey ?? input.event?.sessionKey,
    agentId: input.agentId ?? input.event?.agentId,
    stableId: input.captureJobId ?? input.event?.captureJobId ?? input.state.dirtyId,
    safeLabels: {
      reason: input.state.dirtyReason,
      schedulerReason: input.schedulerReason ?? input.event?.schedulerReason,
      failureClass: input.event?.failureClass ?? input.state.lastFailureClass,
      stage: input.event?.failureStage ?? input.state.lastFailureStage,
    },
    ids: {
      dirtyId: input.state.dirtyId,
      captureJobId: input.captureJobId ?? input.event?.captureJobId,
      memoryTraceIds: input.event?.traceIds ?? input.state.traceIds,
      memoryIds: input.state.affectedMemoryIds,
      sourceIds: input.state.affectedSourceIds,
      eventIds: input.state.affectedEventIds,
      projectionTargetIds: input.state.affectedProjectionTargetIds,
    },
    metrics: {
      writeCountSinceLastRebuild: input.state.writeCountSinceLastRebuild,
      rebuildAttemptCount: input.state.rebuildAttemptCount,
      lastRebuildDurationMs: input.state.lastRebuildDurationMs,
    },
  }).catch(() => undefined);
}

export function classifyCaptureFailure(error: unknown): MemoryIngestionFailureClass {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /runtime[-_\s]?dirty/iu.test(message) &&
    /\b(?:EACCES|EPERM|permission denied|read-only|readonly)\b/iu.test(message)
  ) {
    return "runtime_dirty_persistence";
  }
  return classifyMemoryIngestionFailure(message);
}

export function buildPoolPressureError(
  lane: "capture" | "rebuild",
  reasons: string[] | undefined,
) {
  return new Error(
    `pool_pressure: model-memory ${lane} lane deferred due to database pool pressure${
      reasons && reasons.length > 0 ? ` (${reasons.slice(0, 4).join(", ")})` : ""
    }`,
  );
}

export async function markModelMemoryRuntimeDirty(input: {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  reason: ModelMemoryRuntimeDirtyReason;
  traceIds?: string[];
  captureJobId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  kind?: "ordinary_turn_capture" | "tool_result_capture" | "projection";
  memoryIds?: string[];
  sourceIds?: string[];
  eventIds?: string[];
  projectionTargetIds?: string[];
  markedAt?: Date;
  rebuild?: (state: ModelMemoryRuntimeDirtyState) => Promise<void>;
}): Promise<ModelMemoryRuntimeDirtyMarkResult> {
  const store = createModelMemoryRuntimeDirtyStore({ env: input.env });
  try {
    const result = await markModelMemoryRuntimeDirtyAndSchedule({
      store,
      env: input.env,
      dirty: {
        reason: input.reason,
        traceIds: input.traceIds,
        captureJobId: input.captureJobId,
        sessionId: input.sessionId,
        sessionKey: input.sessionKey,
        agentId: input.agentId,
        memoryIds: input.memoryIds,
        sourceIds: input.sourceIds,
        eventIds: input.eventIds,
        projectionTargetIds: input.projectionTargetIds,
        markedAt: input.markedAt,
      },
      rebuild: input.rebuild,
      onEvent: async (event) => {
        await emitRuntimeDirtyActivity({
          config: input.config,
          kind: input.kind,
          state: await store.getState(),
          event,
          eventType: event.eventType,
          captureJobId: input.captureJobId,
          sessionId: input.sessionId,
          sessionKey: input.sessionKey,
          agentId: input.agentId,
        });
      },
    });
    if (result.schedulerReason === "deferred" || result.schedulerReason === "disabled") {
      await emitRuntimeDirtyActivity({
        config: input.config,
        kind: input.kind,
        state: result.state,
        eventType: "runtime_rebuild_deferred",
        captureJobId: input.captureJobId,
        sessionId: input.sessionId,
        sessionKey: input.sessionKey,
        agentId: input.agentId,
        schedulerReason: result.schedulerReason,
      });
    }
    return {
      state: result.state,
      scheduled: result.scheduled,
      schedulerReason: result.schedulerReason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureClass = classifyCaptureFailure(error);
    log.warn("model-memory runtime dirty marker failed", {
      failureClass,
      error: message,
    });
    throw new Error(`${failureClass}: runtime_dirty marker failed`, { cause: error });
  }
}

export function mapRuntimeDirtyResultToCloseoutState(result: ModelMemoryRuntimeDirtyMarkResult): {
  status: "marked" | "deferred" | "failed" | "not_required";
  reason?: string;
} {
  if (result.state.status === "failed") {
    return {
      status: "failed",
      reason: [result.state.lastFailureClass, result.state.lastFailureStage]
        .filter(Boolean)
        .join(":"),
    };
  }
  if (result.schedulerReason === "deferred" || result.schedulerReason === "disabled") {
    return {
      status: "deferred",
      reason: result.schedulerReason,
    };
  }
  return {
    status: "marked",
    reason: result.state.dirtyReason,
  };
}

export function getModelMemoryRuntimeDirtySnapshot(
  input: {
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<ModelMemoryRuntimeDirtySnapshot> {
  return createModelMemoryRuntimeDirtyStore({ env: input.env }).getState();
}

export function resetModelMemoryRuntimeDirtyStateForTests(
  input: {
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<void> {
  return resetModelMemoryRuntimeDirtyStoreForTests({ env: input.env });
}
