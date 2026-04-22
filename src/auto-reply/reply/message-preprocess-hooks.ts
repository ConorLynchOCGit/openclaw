import { recordModelMemoryCaptureSeamEvidence } from "../../agents/model-memory.capture-seams.js";
import { recordModelMemoryProductionHookProbe } from "../../agents/model-memory.hook-probe.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { fireAndForgetHook } from "../../hooks/fire-and-forget.js";
import { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.js";
import {
  deriveInboundMessageHookContext,
  toInternalMessagePreprocessedContext,
  toInternalMessageTranscribedContext,
} from "../../hooks/message-hook-mappers.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type { FinalizedMsgContext } from "../templating.js";

export function emitPreAgentMessageHooks(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  isFastTestEnv: boolean;
}): void {
  if (params.isFastTestEnv) {
    return;
  }
  const sessionKey = normalizeOptionalString(params.ctx.SessionKey);
  if (!sessionKey) {
    return;
  }

  const canonical = deriveInboundMessageHookContext(params.ctx);
  const preprocessedContext = toInternalMessagePreprocessedContext(canonical, params.cfg);
  if (canonical.transcript) {
    fireAndForgetHook(
      triggerInternalHook(
        createInternalHookEvent(
          "message",
          "transcribed",
          sessionKey,
          toInternalMessageTranscribedContext(canonical, params.cfg),
        ),
      ),
      "get-reply: message:transcribed internal hook failed",
    );
  }

  fireAndForgetHook(
    recordModelMemoryProductionHookProbe({
      hookName: "message:preprocessed",
      triggerSurface: "auto_reply.message_preprocess",
      payload: preprocessedContext,
      context: { sessionKey },
      config: params.cfg,
    }),
    "get-reply: message:preprocessed production probe failed",
  );
  fireAndForgetHook(
    recordModelMemoryCaptureSeamEvidence({
      seamName: "message:preprocessed",
      triggerSurface: "auto_reply.message_preprocess",
      payload: preprocessedContext,
      context: { sessionKey },
      config: params.cfg,
    }),
    "get-reply: message:preprocessed capture seam evidence failed",
  );

  fireAndForgetHook(
    triggerInternalHook(
      createInternalHookEvent("message", "preprocessed", sessionKey, preprocessedContext),
    ),
    "get-reply: message:preprocessed internal hook failed",
  );
}
