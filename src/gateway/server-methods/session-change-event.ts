// Shared sessions.changed broadcaster for gateway RPC and chat-command mutations.
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { buildSessionReadbackProjection } from "../../readback/finality.js";
import { loadGatewaySessionRow } from "../session-utils.js";
import { hasTrackedActiveSessionRun } from "./session-active-runs.js";
import type { GatewayRequestContext } from "./types.js";

export type SessionChangedPayload = {
  sessionKey?: string;
  agentId?: string;
  reason: string;
  compacted?: boolean;
};

export function emitSessionsChanged(
  context: Pick<
    GatewayRequestContext,
    | "broadcastToConnIds"
    | "chatAbortControllers"
    | "getRuntimeConfig"
    | "getSessionEventSubscriberConnIds"
  >,
  payload: SessionChangedPayload,
) {
  const connIds = context.getSessionEventSubscriberConnIds();
  if (connIds.size === 0) {
    return;
  }
  const sessionRow = payload.sessionKey
    ? loadGatewaySessionRow(
        payload.sessionKey,
        payload.sessionKey === "global" && payload.agentId
          ? { agentId: payload.agentId }
          : undefined,
      )
    : null;
  const omitUnscopedGlobalGoal = payload.sessionKey === "global" && !payload.agentId;
  const defaultAgentId = resolveDefaultAgentId(context.getRuntimeConfig());
  const readbackProjection = sessionRow
    ? buildSessionReadbackProjection({
        ...sessionRow,
        agentId: sessionRow.agentId,
      })
    : null;
  context.broadcastToConnIds(
    "sessions.changed",
    {
      ...payload,
      ts: Date.now(),
      ...(sessionRow
        ? {
            updatedAt: sessionRow.updatedAt ?? undefined,
            sessionId: sessionRow.sessionId,
            kind: sessionRow.kind,
            channel: sessionRow.channel,
            subject: sessionRow.subject,
            groupChannel: sessionRow.groupChannel,
            space: sessionRow.space,
            chatType: sessionRow.chatType,
            origin: sessionRow.origin,
            spawnedBy: sessionRow.spawnedBy,
            spawnedWorkspaceDir: sessionRow.spawnedWorkspaceDir,
            spawnedCwd: sessionRow.spawnedCwd,
            forkedFromParent: sessionRow.forkedFromParent,
            spawnDepth: sessionRow.spawnDepth,
            subagentRole: sessionRow.subagentRole,
            subagentControlScope: sessionRow.subagentControlScope,
            label: sessionRow.label,
            displayName: sessionRow.displayName,
            derivedTitle: sessionRow.derivedTitle,
            lastMessagePreview: sessionRow.lastMessagePreview,
            finalAssistantText: sessionRow.finalAssistantText,
            activeProgress: sessionRow.activeProgress ?? null,
            readbackProvenance: sessionRow.readbackProvenance,
            readbackSubject: readbackProjection?.readbackSubject ?? null,
            finality: readbackProjection?.finality ?? null,
            deliveryContext: sessionRow.deliveryContext,
            parentSessionKey: sessionRow.parentSessionKey,
            childSessions: sessionRow.childSessions,
            thinkingLevel: sessionRow.thinkingLevel,
            fastMode: sessionRow.fastMode,
            verboseLevel: sessionRow.verboseLevel,
            traceLevel: sessionRow.traceLevel,
            reasoningLevel: sessionRow.reasoningLevel,
            elevatedLevel: sessionRow.elevatedLevel,
            sendPolicy: sessionRow.sendPolicy,
            systemSent: sessionRow.systemSent,
            abortedLastRun: sessionRow.abortedLastRun,
            inputTokens: sessionRow.inputTokens,
            outputTokens: sessionRow.outputTokens,
            lastChannel: sessionRow.lastChannel,
            lastTo: sessionRow.lastTo,
            lastAccountId: sessionRow.lastAccountId,
            lastThreadId: sessionRow.lastThreadId,
            totalTokens: sessionRow.totalTokens,
            totalTokensFresh: sessionRow.totalTokensFresh,
            ...(omitUnscopedGlobalGoal ? {} : { goal: sessionRow.goal ?? null }),
            contextTokens: sessionRow.contextTokens,
            estimatedCostUsd: sessionRow.estimatedCostUsd,
            responseUsage: sessionRow.responseUsage,
            modelProvider: sessionRow.modelProvider,
            model: sessionRow.model,
            status: sessionRow.status,
            hasActiveRun: hasTrackedActiveSessionRun({
              context,
              requestedKey: payload.sessionKey ?? sessionRow.key,
              canonicalKey: sessionRow.key,
              agentId: sessionRow.key === "global" ? payload.agentId : undefined,
              defaultAgentId,
            }),
            startedAt: sessionRow.startedAt,
            endedAt: sessionRow.endedAt,
            runtimeMs: sessionRow.runtimeMs,
            compactionCheckpointCount: sessionRow.compactionCheckpointCount,
            latestCompactionCheckpoint: sessionRow.latestCompactionCheckpoint,
            pluginExtensions: sessionRow.pluginExtensions,
          }
        : {}),
    },
    connIds,
    { dropIfSlow: true },
  );
}
