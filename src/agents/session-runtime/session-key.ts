import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { sanitizeForLog } from "../../terminal/ansi.js";
import {
  resolveSessionKeyForRequest,
  resolveStoredSessionKeyForSessionId,
} from "../command/session.js";
import { log } from "../pi-embedded-runner/logger.js";
import { redactRunIdentifier } from "../workspace-run.js";

export type ResolveEffectiveSessionKeyInput = {
  config?: OpenClawConfig;
  sessionId: string;
  sessionKey?: string | null;
  agentId?: string | null;
};

/**
 * Read-only sessionKey repair for callers that only have a sessionId.
 * See: https://github.com/openclaw/openclaw/issues/60552
 */
export function resolveEffectiveSessionKey(
  input: ResolveEffectiveSessionKeyInput,
): string | undefined {
  const trimmed = normalizeOptionalString(input.sessionKey);
  if (trimmed) {
    return trimmed;
  }
  if (!input.config || !input.sessionId) {
    return undefined;
  }
  try {
    const resolved = normalizeOptionalString(input.agentId)
      ? resolveStoredSessionKeyForSessionId({
          cfg: input.config,
          sessionId: input.sessionId,
          agentId: input.agentId ?? undefined,
        })
      : resolveSessionKeyForRequest({
          cfg: input.config,
          sessionId: input.sessionId,
        });
    return normalizeOptionalString(resolved.sessionKey);
  } catch (err) {
    log.warn(
      `[session-runtime] Failed to resolve sessionKey for sessionId=${redactRunIdentifier(sanitizeForLog(input.sessionId))}: ${formatErrorMessage(err)}`,
    );
    return undefined;
  }
}
