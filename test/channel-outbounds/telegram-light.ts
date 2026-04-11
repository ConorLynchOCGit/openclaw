import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import {
  resolveOutboundSendDep,
  type OutboundSendDeps,
} from "../../src/infra/outbound/send-deps.js";

type TelegramSendResult = { messageId: string; chatId?: string };
type TelegramSend = (
  to: string,
  text: string,
  opts?: {
    cfg?: unknown;
    mediaUrl?: string;
    verbose?: boolean;
    buttons?: unknown;
    textMode?: string;
    accountId?: string;
    messageThreadId?: number | string;
    replyToId?: string;
  },
) => Promise<TelegramSendResult>;

function resolveTelegramSender(deps: OutboundSendDeps | null | undefined): TelegramSend {
  const send = resolveOutboundSendDep<TelegramSend>(deps, "telegram");
  if (!send) {
    throw new Error("Telegram send dependency was not provided");
  }
  return send;
}

const attachTelegramChannel = (result: TelegramSendResult) => ({
  channel: "telegram" as const,
  ...result,
});

function resolveMessageThreadId(threadId: string | number | null | undefined) {
  if (threadId == null || threadId === "") {
    return undefined;
  }
  const parsed = typeof threadId === "number" ? threadId : Number.parseInt(String(threadId), 10);
  return Number.isFinite(parsed) ? parsed : threadId;
}

export const telegramLightOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  sendText: async ({ cfg, to, text, deps, accountId, replyToId, threadId }) => {
    const send = resolveTelegramSender(deps);
    return attachTelegramChannel(
      await send(to, text, {
        cfg,
        verbose: false,
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
        messageThreadId: resolveMessageThreadId(threadId),
      }),
    );
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, deps, accountId, replyToId, threadId }) => {
    const send = resolveTelegramSender(deps);
    return attachTelegramChannel(
      await send(to, text, {
        cfg,
        mediaUrl,
        verbose: false,
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
        messageThreadId: resolveMessageThreadId(threadId),
      }),
    );
  },
  sendPayload: async ({ cfg, to, payload, deps, accountId, replyToId, threadId }) => {
    const send = resolveTelegramSender(deps);
    const channelData = payload.channelData as { telegram?: { buttons?: unknown } } | undefined;
    const buttons = channelData?.telegram?.buttons;
    const baseOptions = {
      cfg,
      verbose: false,
      accountId: accountId ?? undefined,
      replyToId: replyToId ?? undefined,
      messageThreadId: resolveMessageThreadId(threadId),
      textMode: "html",
    };
    const mediaUrls =
      Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0
        ? payload.mediaUrls
        : payload.mediaUrl
          ? [payload.mediaUrl]
          : [];
    if (mediaUrls.length === 0) {
      return attachTelegramChannel(
        await send(to, payload.text ?? "", {
          ...baseOptions,
          ...(buttons ? { buttons } : {}),
        }),
      );
    }

    let lastResult: TelegramSendResult | null = null;
    for (const [index, mediaUrl] of mediaUrls.entries()) {
      lastResult = await send(to, index === 0 ? (payload.text ?? "") : "", {
        ...baseOptions,
        mediaUrl,
        ...(index === 0 && buttons ? { buttons } : {}),
      });
    }
    return attachTelegramChannel(lastResult ?? { messageId: "" });
  },
};
