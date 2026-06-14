/**
 * LLM-based slug generator for session memory filenames
 */

import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { extractAssistantText } from "../agents/pi-embedded-utils.js";
import {
  completeWithPreparedSimpleCompletionModel,
  prepareSimpleCompletionModelForAgent,
} from "../agents/simple-completion-runtime.js";
import { resolveAgentTimeoutMs } from "../agents/timeout.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

const log = createSubsystemLogger("llm-slug-generator");
const DEFAULT_SLUG_GENERATOR_TIMEOUT_MS = 15_000;

function resolveSlugGeneratorTimeoutMs(cfg: OpenClawConfig): number {
  const configuredTimeoutSeconds = cfg.agents?.defaults?.timeoutSeconds;
  if (typeof configuredTimeoutSeconds !== "number" || !Number.isFinite(configuredTimeoutSeconds)) {
    return DEFAULT_SLUG_GENERATOR_TIMEOUT_MS;
  }
  return resolveAgentTimeoutMs({ cfg });
}

/**
 * Generate a short 1-2 word filename slug from session content using LLM
 */
export async function generateSlugViaLLM(params: {
  sessionContent: string;
  cfg: OpenClawConfig;
}): Promise<string | null> {
  try {
    const agentId = resolveDefaultAgentId(params.cfg);

    const prompt = `Based on this conversation, generate a short 1-2 word filename slug (lowercase, hyphen-separated, no file extension).

Conversation summary:
${params.sessionContent.slice(0, 2000)}

Reply with ONLY the slug, nothing else. Examples: "vendor-pitch", "api-design", "bug-fix"`;

    const prepared = await prepareSimpleCompletionModelForAgent({
      cfg: params.cfg,
      agentId,
      allowMissingApiKeyModes: ["aws-sdk"],
    });
    if ("error" in prepared) {
      log.error(`Failed to prepare slug model: ${prepared.error}`);
      return null;
    }

    const timeoutMs = resolveSlugGeneratorTimeoutMs(params.cfg);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text = "";
    try {
      const result = await completeWithPreparedSimpleCompletionModel({
        model: prepared.model,
        auth: prepared.auth,
        context: {
          messages: [
            {
              role: "user",
              content: prompt,
              timestamp: Date.now(),
            },
          ],
        },
        options: {
          maxTokens: 64,
          signal: controller.signal,
        },
      });
      text = extractAssistantText(result);
    } finally {
      clearTimeout(timer);
    }

    const slug = normalizeLowercaseStringOrEmpty(text)
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    return slug || null;
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    log.error(`Failed to generate slug: ${message}`);
    return null;
  }
}
