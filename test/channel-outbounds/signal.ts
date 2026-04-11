import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import {
  resolveOutboundSendDep,
  type OutboundSendDeps,
} from "../../src/infra/outbound/send-deps.js";

type SignalSendResult = { messageId: string; timestamp?: number };
type SignalSend = (
  to: string,
  text: string,
  opts?: {
    cfg?: unknown;
    mediaUrl?: string;
    maxBytes?: number;
    accountId?: string;
    textMode?: "plain";
    textStyles?: unknown[];
    mediaLocalRoots?: readonly string[];
  },
) => Promise<SignalSendResult>;

const DEFAULT_SIGNAL_TEXT_LIMIT = 4000;

function resolveSignalSender(deps: OutboundSendDeps | null | undefined): SignalSend {
  const send = resolveOutboundSendDep<SignalSend>(deps, "signal");
  if (!send) {
    throw new Error("Signal send dependency was not provided");
  }
  return send;
}

function resolveSignalTextChunkLimit(cfg: unknown): number {
  const configured = (cfg as { channels?: { signal?: { textChunkLimit?: unknown } } })?.channels
    ?.signal?.textChunkLimit;
  return Number.isFinite(configured) && Number(configured) > 0
    ? Number(configured)
    : DEFAULT_SIGNAL_TEXT_LIMIT;
}

function resolveSignalMediaMaxBytes(cfg: unknown): number | undefined {
  const configured = (cfg as { channels?: { signal?: { mediaMaxMb?: unknown } } })?.channels?.signal
    ?.mediaMaxMb;
  return Number.isFinite(configured) && Number(configured) > 0
    ? Number(configured) * 1024 * 1024
    : undefined;
}

function chunkSignalText(text: string, limit: number): string[] {
  if (!text) {
    return [];
  }
  if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/u);
  let current = "";
  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      continue;
    }
    if (!current) {
      if (paragraph.length <= limit) {
        current = paragraph;
        continue;
      }
      for (let index = 0; index < paragraph.length; index += limit) {
        chunks.push(paragraph.slice(index, index + limit));
      }
      continue;
    }
    const candidate = `${current}\n\n${paragraph}`;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    flush();
    if (paragraph.length <= limit) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += limit) {
      chunks.push(paragraph.slice(index, index + limit));
    }
  }

  flush();
  return chunks.length > 0 ? chunks : [text];
}

const attachSignalChannel = (result: SignalSendResult) => ({
  channel: "signal" as const,
  ...result,
});

export const signalOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => chunkSignalText(text, limit),
  chunkerMode: "text",
  textChunkLimit: DEFAULT_SIGNAL_TEXT_LIMIT,
  resolveEffectiveTextChunkLimit: ({ cfg, fallbackLimit }) =>
    resolveSignalTextChunkLimit(cfg) ?? fallbackLimit,
  sendFormattedText: async ({ cfg, to, text, deps, accountId, abortSignal }) => {
    const send = resolveSignalSender(deps);
    const chunks = chunkSignalText(text, resolveSignalTextChunkLimit(cfg));
    const results = [];
    for (const chunk of chunks) {
      abortSignal?.throwIfAborted();
      results.push(
        attachSignalChannel(
          await send(to, chunk, {
            cfg,
            accountId: accountId ?? undefined,
            textMode: "plain",
            textStyles: [],
          }),
        ),
      );
    }
    return results;
  },
  sendFormattedMedia: async ({
    cfg,
    to,
    text,
    mediaUrl,
    deps,
    accountId,
    mediaLocalRoots,
    abortSignal,
  }) => {
    abortSignal?.throwIfAborted();
    const send = resolveSignalSender(deps);
    return attachSignalChannel(
      await send(to, text, {
        cfg,
        mediaUrl,
        mediaLocalRoots,
        maxBytes: resolveSignalMediaMaxBytes(cfg),
        accountId: accountId ?? undefined,
        textMode: "plain",
        textStyles: [],
      }),
    );
  },
  sendText: async ({ cfg, to, text, deps, accountId }) => {
    const send = resolveSignalSender(deps);
    return attachSignalChannel(
      await send(to, text, {
        cfg,
        accountId: accountId ?? undefined,
        maxBytes: resolveSignalMediaMaxBytes(cfg),
      }),
    );
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, deps, accountId, mediaLocalRoots }) => {
    const send = resolveSignalSender(deps);
    return attachSignalChannel(
      await send(to, text, {
        cfg,
        mediaUrl,
        mediaLocalRoots,
        maxBytes: resolveSignalMediaMaxBytes(cfg),
        accountId: accountId ?? undefined,
      }),
    );
  },
};
