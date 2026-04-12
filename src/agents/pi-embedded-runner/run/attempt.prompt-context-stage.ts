import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionSystemPromptReport } from "../../../config/sessions/types.js";
import type {
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
  PluginHookBeforePromptBuildResult,
} from "../../../plugins/types.js";
import { buildSystemPromptReport } from "../../system-prompt-report.js";
import { applySystemPromptOverrideToSession } from "../system-prompt.js";
import {
  assembleAttemptManagedContext,
  type AttemptContextEngine,
} from "./attempt.context-engine-helpers.js";
import type { PromptBuildHookRunner } from "./attempt.prompt-helpers.js";

type AttemptPromptContextSession = {
  messages: AgentMessage[];
  agent: {
    replaceMessages: (messages: AgentMessage[]) => void;
    setSystemPrompt: (prompt: string) => void;
  };
};

type SystemPromptReportBase = Omit<
  Parameters<typeof buildSystemPromptReport>[0],
  "systemPrompt" | "segmentPlanInput"
>;

export type AttemptPromptContextStageResult = {
  messages: AgentMessage[];
  effectivePrompt: string;
  systemPrompt: string;
  systemPromptReport: SessionSystemPromptReport;
  contextEngineSystemPromptAddition?: string;
  hookResult: PluginHookBeforePromptBuildResult;
};

export async function prepareAttemptPromptContextStage(params: {
  session: AttemptPromptContextSession;
  contextEngine?: AttemptContextEngine;
  sessionId: string;
  sessionKey?: string;
  tokenBudget?: number;
  modelId: string;
  prompt: string;
  baseSystemPrompt: string;
  hookCtx: PluginHookAgentContext;
  hookRunner?: PromptBuildHookRunner | null;
  legacyBeforeAgentStartResult?: PluginHookBeforeAgentStartResult;
  systemPromptReportBase: SystemPromptReportBase;
  currentPrompt: string;
  onLog: (message: string) => void;
}): Promise<AttemptPromptContextStageResult> {
  const managedContext = await assembleAttemptManagedContext({
    contextEngine: params.contextEngine,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    messages: params.session.messages,
    tokenBudget: params.tokenBudget,
    modelId: params.modelId,
    prompt: params.prompt,
    baseSystemPrompt: params.baseSystemPrompt,
    hookCtx: params.hookCtx,
    hookRunner: params.hookRunner,
    legacyBeforeAgentStartResult: params.legacyBeforeAgentStartResult,
  });

  if (managedContext.messages !== params.session.messages) {
    params.session.agent.replaceMessages(managedContext.messages);
  }
  if (managedContext.contextEngineSystemPromptAddition) {
    params.onLog(
      `context engine: assembled system prompt addition (${managedContext.contextEngineSystemPromptAddition.length} chars)`,
    );
  }
  if (managedContext.hookResult?.prependContext) {
    params.onLog(
      `hooks: prepended context to prompt (${managedContext.hookResult.prependContext.length} chars)`,
    );
  }
  const legacySystemPrompt =
    typeof managedContext.hookResult?.systemPrompt === "string"
      ? managedContext.hookResult.systemPrompt.trim()
      : "";
  if (legacySystemPrompt) {
    params.onLog(`hooks: applied systemPrompt override (${legacySystemPrompt.length} chars)`);
  }
  if (
    managedContext.hookResult?.prependSystemContext ||
    managedContext.hookResult?.appendSystemContext
  ) {
    const prependSystemLen = managedContext.hookResult.prependSystemContext?.trim().length ?? 0;
    const appendSystemLen = managedContext.hookResult.appendSystemContext?.trim().length ?? 0;
    params.onLog(
      `hooks: applied prependSystemContext/appendSystemContext (${prependSystemLen}+${appendSystemLen} chars)`,
    );
  }

  applySystemPromptOverrideToSession(
    params.session as Parameters<typeof applySystemPromptOverrideToSession>[0],
    managedContext.systemPrompt,
  );

  return {
    messages: managedContext.messages,
    effectivePrompt: managedContext.prompt,
    systemPrompt: managedContext.systemPrompt,
    systemPromptReport: buildSystemPromptReport({
      ...params.systemPromptReportBase,
      systemPrompt: managedContext.systemPrompt,
      segmentPlanInput: {
        tokenBudget: params.tokenBudget,
        contextEngineSystemPromptAddition: managedContext.contextEngineSystemPromptAddition,
        hookPrependSystemContext: managedContext.hookResult?.prependSystemContext,
        hookAppendSystemContext: managedContext.hookResult?.appendSystemContext,
        hookSystemPromptOverride:
          typeof managedContext.hookResult?.systemPrompt === "string"
            ? managedContext.hookResult.systemPrompt
            : undefined,
        promptPrependContext: managedContext.hookResult?.prependContext,
        currentPrompt: params.currentPrompt,
        messages: managedContext.messages,
      },
    }),
    ...(managedContext.contextEngineSystemPromptAddition
      ? { contextEngineSystemPromptAddition: managedContext.contextEngineSystemPromptAddition }
      : {}),
    hookResult: managedContext.hookResult,
  };
}
