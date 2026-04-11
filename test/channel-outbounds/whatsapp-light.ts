import type { ChannelOutboundAdapter } from "../../src/channels/plugins/types.js";
import {
  resolveOutboundSendDep,
  type OutboundSendDeps,
} from "../../src/infra/outbound/send-deps.js";

type WhatsAppSendResult = { messageId: string; toJid?: string };
type WhatsAppSend = (
  to: string,
  text: string,
  opts?: {
    cfg?: unknown;
    mediaUrl?: string;
    verbose?: boolean;
    mediaLocalRoots?: readonly string[];
    accountId?: string;
  },
) => Promise<WhatsAppSendResult>;

const DEFAULT_WHATSAPP_TEXT_LIMIT = 4000;

function normalizeWhatsAppText(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/u, "").replace(/^[ \t]+/u, "");
}

function resolveWhatsAppSender(deps: OutboundSendDeps | null | undefined): WhatsAppSend {
  const send = resolveOutboundSendDep<WhatsAppSend>(deps, "whatsapp");
  if (!send) {
    throw new Error("WhatsApp send dependency was not provided");
  }
  return send;
}

function chunkWhatsAppText(text: string, limit: number): string[] {
  if (!text) {
    return [];
  }
  if (!Number.isFinite(limit) || limit <= 0 || text.length <= limit) {
    return [text];
  }
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += limit) {
    chunks.push(text.slice(index, index + limit));
  }
  return chunks;
}

const attachWhatsAppChannel = (result: WhatsAppSendResult) => ({
  channel: "whatsapp" as const,
  ...result,
});

export const whatsappLightOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => chunkWhatsAppText(text, limit),
  chunkerMode: "text",
  textChunkLimit: DEFAULT_WHATSAPP_TEXT_LIMIT,
  sendText: async ({ cfg, to, text, deps, accountId }) => {
    const send = resolveWhatsAppSender(deps);
    return attachWhatsAppChannel(
      await send(to, normalizeWhatsAppText(text), {
        cfg,
        verbose: false,
        accountId: accountId ?? undefined,
      }),
    );
  },
  sendMedia: async ({ cfg, to, text, mediaUrl, deps, accountId, mediaLocalRoots }) => {
    const send = resolveWhatsAppSender(deps);
    return attachWhatsAppChannel(
      await send(to, normalizeWhatsAppText(text), {
        cfg,
        mediaUrl,
        mediaLocalRoots,
        verbose: false,
        accountId: accountId ?? undefined,
      }),
    );
  },
};
