import { onWorkQueueEvent } from "../../extensions/execution-platform/src/work-queue/work-queue-events.ts";
import { loadConfig } from "../config/config.js";
import { onAgentEvent } from "../infra/agent-events.js";
import { onHeartbeatEvent } from "../infra/heartbeat-events.js";
import { onSessionLifecycleEvent } from "../sessions/session-lifecycle-events.js";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import { getExecutionPlatformRuntime } from "./execution-platform-http.js";
import {
  createAgentEventHandler,
  type ChatRunState,
  type SessionEventSubscriberRegistry,
  type SessionMessageSubscriberRegistry,
  type ToolEventRecipientRegistry,
} from "./server-chat.js";
import {
  createLifecycleEventBroadcastHandler,
  createTranscriptUpdateBroadcastHandler,
} from "./server-session-events.js";
import type { WorkQueueEventSubscriberRegistry } from "./work-queue-event-subscriptions.js";

export function startGatewayEventSubscriptions(params: {
  minimalTestGateway: boolean;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
  broadcastToConnIds: (
    event: string,
    payload: unknown,
    connIds: ReadonlySet<string>,
    opts?: { dropIfSlow?: boolean },
  ) => void;
  nodeSendToSession: (sessionKey: string, event: string, payload: unknown) => void;
  agentRunSeq: Map<string, number>;
  chatRunState: ChatRunState;
  resolveSessionKeyForRun: (runId: string) => string | undefined;
  clearAgentRunContext: (runId: string) => void;
  toolEventRecipients: ToolEventRecipientRegistry;
  sessionEventSubscribers: SessionEventSubscriberRegistry;
  sessionMessageSubscribers: SessionMessageSubscriberRegistry;
  workQueueEventSubscribers: WorkQueueEventSubscriberRegistry;
  chatAbortControllers: Map<string, unknown>;
}) {
  const agentUnsub = params.minimalTestGateway
    ? null
    : onAgentEvent(
        createAgentEventHandler({
          broadcast: params.broadcast,
          broadcastToConnIds: params.broadcastToConnIds,
          nodeSendToSession: params.nodeSendToSession,
          agentRunSeq: params.agentRunSeq,
          chatRunState: params.chatRunState,
          resolveSessionKeyForRun: params.resolveSessionKeyForRun,
          clearAgentRunContext: params.clearAgentRunContext,
          toolEventRecipients: params.toolEventRecipients,
          sessionEventSubscribers: params.sessionEventSubscribers,
          isChatSendRunActive: (runId) => params.chatAbortControllers.has(runId),
        }),
      );

  const heartbeatUnsub = params.minimalTestGateway
    ? null
    : onHeartbeatEvent((evt) => {
        params.broadcast("heartbeat", evt, { dropIfSlow: true });
      });

  const transcriptUnsub = params.minimalTestGateway
    ? null
    : onSessionTranscriptUpdate(
        createTranscriptUpdateBroadcastHandler({
          broadcastToConnIds: params.broadcastToConnIds,
          sessionEventSubscribers: params.sessionEventSubscribers,
          sessionMessageSubscribers: params.sessionMessageSubscribers,
        }),
      );

  const lifecycleUnsub = params.minimalTestGateway
    ? null
    : onSessionLifecycleEvent(
        createLifecycleEventBroadcastHandler({
          broadcastToConnIds: params.broadcastToConnIds,
          sessionEventSubscribers: params.sessionEventSubscribers,
        }),
      );

  const workQueueUnsub = params.minimalTestGateway
    ? null
    : onWorkQueueEvent((event) => {
        const connIds = params.workQueueEventSubscribers.getMatching(event);
        if (connIds.size === 0) {
          return;
        }
        params.broadcastToConnIds("work_queue.changed", event, connIds, { dropIfSlow: true });
      });

  let workQueueOutboxPollTimer: NodeJS.Timeout | null = null;
  let workQueueOutboxStopped = false;
  let workQueueOutboxPolling = false;
  let lastWorkQueueEventCursor = 0;

  if (!params.minimalTestGateway) {
    const startWorkQueueOutboxPolling = async () => {
      try {
        const { workQueueEvents: eventStore } = await getExecutionPlatformRuntime(loadConfig());
        workQueueOutboxPollTimer = setInterval(() => {
          if (workQueueOutboxStopped || workQueueOutboxPolling) {
            return;
          }
          workQueueOutboxPolling = true;
          void eventStore
            .listEvents({ afterCursor: lastWorkQueueEventCursor, limit: 200 })
            .then((replay) => {
              for (const event of replay.events) {
                lastWorkQueueEventCursor = Math.max(lastWorkQueueEventCursor, event.cursor);
                const connIds = params.workQueueEventSubscribers.getMatching(event);
                if (connIds.size === 0) {
                  continue;
                }
                params.broadcastToConnIds("work_queue.changed", event, connIds, {
                  dropIfSlow: true,
                });
              }
            })
            .catch(() => {
              // The durable outbox is readback/observability. A transient polling failure must not
              // affect runtime lifecycle truth or disconnect authenticated clients.
            })
            .finally(() => {
              workQueueOutboxPolling = false;
            });
        }, 1_000);
        workQueueOutboxPollTimer.unref?.();
      } catch {
        // If the DB boundary is temporarily unavailable, direct in-process event push still works,
        // and the durable poller retries without poisoning the gateway process.
        if (!workQueueOutboxStopped) {
          const retryTimer = setTimeout(() => {
            void startWorkQueueOutboxPolling();
          }, 2_000);
          retryTimer.unref?.();
        }
      }
    };
    void startWorkQueueOutboxPolling();
  }

  return {
    agentUnsub,
    heartbeatUnsub,
    transcriptUnsub,
    lifecycleUnsub,
    workQueueUnsub: () => {
      workQueueOutboxStopped = true;
      if (workQueueOutboxPollTimer) {
        clearInterval(workQueueOutboxPollTimer);
      }
      workQueueUnsub?.();
    },
  };
}
