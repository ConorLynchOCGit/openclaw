import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import type { OutboundDeliveryResult } from "../../src/infra/outbound/deliver.js";
import {
  resolveOutboundSendDep,
  type OutboundSendDeps,
} from "../../src/infra/outbound/send-deps.js";

type SendResult = Omit<OutboundDeliveryResult, "channel">;
type GenericSend = (
  to: string,
  text: string,
  opts?: Record<string, unknown>,
) => Promise<SendResult>;

function resolveSender(
  deps: OutboundSendDeps | null | undefined,
  channelId: "discord" | "imessage" | "slack" | "telegram",
): GenericSend {
  const send = resolveOutboundSendDep<GenericSend>(deps, channelId);
  if (!send) {
    throw new Error(`${channelId} send dependency was not provided`);
  }
  return send;
}

export function createLightDirectOutbound(
  channelId: "discord" | "imessage" | "slack" | "telegram",
): ChannelOutboundAdapter {
  const attachChannel = (result: SendResult): OutboundDeliveryResult => ({
    channel: channelId,
    ...result,
  });
  const buildThreadOptions = (threadId: string | number | null | undefined) => {
    if (threadId == null || threadId === "") {
      return {};
    }
    if (channelId === "telegram") {
      const parsedThreadId =
        typeof threadId === "number" ? threadId : Number.parseInt(String(threadId), 10);
      return Number.isFinite(parsedThreadId)
        ? { messageThreadId: parsedThreadId }
        : { messageThreadId: threadId };
    }
    return { threadId };
  };
  return {
    deliveryMode: "direct",
    sendText: async ({ cfg, to, text, deps, accountId, replyToId, threadId }) => {
      const send = resolveSender(deps, channelId);
      return attachChannel(
        await send(to, text, {
          cfg,
          accountId: accountId ?? undefined,
          replyToId: replyToId ?? undefined,
          ...buildThreadOptions(threadId),
        }),
      );
    },
    sendMedia: async ({
      cfg,
      to,
      text,
      mediaUrl,
      deps,
      accountId,
      replyToId,
      threadId,
      mediaLocalRoots,
    }) => {
      const send = resolveSender(deps, channelId);
      return attachChannel(
        await send(to, text, {
          cfg,
          mediaUrl,
          mediaLocalRoots,
          accountId: accountId ?? undefined,
          replyToId: replyToId ?? undefined,
          ...buildThreadOptions(threadId),
        }),
      );
    },
  };
}
