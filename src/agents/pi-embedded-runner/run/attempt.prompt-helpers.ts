import type { OpenClawConfig } from "../../../config/config.js";
import type { SessionSourceResolutionReport } from "../../../config/sessions/types.js";
import type {
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
  PluginHookBeforePromptBuildResult,
} from "../../../plugins/types.js";
import { isCronSessionKey, isSubagentSessionKey } from "../../../routing/session-key.js";
import { joinPresentTextSegments } from "../../../shared/text/join-segments.js";
import type { BootstrapBudgetAnalysis } from "../../bootstrap-budget.js";
import { resolveCoverageGatedAnswerPolicy } from "../../source-resolution.js";
import { resolveEffectiveToolFsWorkspaceOnly } from "../../tool-fs-policy.js";
import type { CompactEmbeddedPiSessionParams } from "../compact.js";
import { buildEmbeddedCompactionRuntimeContext } from "../compaction-runtime-context.js";
import { log } from "../logger.js";
import { shouldInjectHeartbeatPromptForTrigger } from "./trigger-policy.js";
import type { EmbeddedRunAttemptParams } from "./types.js";

export type PromptBuildHookRunner = {
  hasHooks: (hookName: "before_prompt_build" | "before_agent_start") => boolean;
  runBeforePromptBuild: (
    event: { prompt: string; messages: unknown[] },
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforePromptBuildResult | undefined>;
  runBeforeAgentStart: (
    event: { prompt: string; messages: unknown[] },
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforeAgentStartResult | undefined>;
};

export async function resolvePromptBuildHookResult(params: {
  prompt: string;
  messages: unknown[];
  hookCtx: PluginHookAgentContext;
  hookRunner?: PromptBuildHookRunner | null;
  legacyBeforeAgentStartResult?: PluginHookBeforeAgentStartResult;
}): Promise<PluginHookBeforePromptBuildResult> {
  const promptBuildResult = params.hookRunner?.hasHooks("before_prompt_build")
    ? await params.hookRunner
        .runBeforePromptBuild(
          {
            prompt: params.prompt,
            messages: params.messages,
          },
          params.hookCtx,
        )
        .catch((hookErr: unknown) => {
          log.warn(`before_prompt_build hook failed: ${String(hookErr)}`);
          return undefined;
        })
    : undefined;
  const legacyResult =
    params.legacyBeforeAgentStartResult ??
    (params.hookRunner?.hasHooks("before_agent_start")
      ? await params.hookRunner
          .runBeforeAgentStart(
            {
              prompt: params.prompt,
              messages: params.messages,
            },
            params.hookCtx,
          )
          .catch((hookErr: unknown) => {
            log.warn(
              `before_agent_start hook (legacy prompt build path) failed: ${String(hookErr)}`,
            );
            return undefined;
          })
      : undefined);
  return {
    systemPrompt: promptBuildResult?.systemPrompt ?? legacyResult?.systemPrompt,
    prependContext: joinPresentTextSegments([
      promptBuildResult?.prependContext,
      legacyResult?.prependContext,
    ]),
    prependSystemContext: joinPresentTextSegments([
      promptBuildResult?.prependSystemContext,
      legacyResult?.prependSystemContext,
    ]),
    appendSystemContext: joinPresentTextSegments([
      promptBuildResult?.appendSystemContext,
      legacyResult?.appendSystemContext,
    ]),
  };
}

export function resolvePromptModeForSession(sessionKey?: string): "minimal" | "full" {
  if (!sessionKey) {
    return "full";
  }
  return isSubagentSessionKey(sessionKey) || isCronSessionKey(sessionKey) ? "minimal" : "full";
}

export function shouldInjectHeartbeatPrompt(params: {
  isDefaultAgent: boolean;
  trigger?: EmbeddedRunAttemptParams["trigger"];
}): boolean {
  return params.isDefaultAgent && shouldInjectHeartbeatPromptForTrigger(params.trigger);
}

export function resolveAttemptFsWorkspaceOnly(params: {
  config?: OpenClawConfig;
  sessionAgentId: string;
}): boolean {
  return resolveEffectiveToolFsWorkspaceOnly({
    cfg: params.config,
    agentId: params.sessionAgentId,
  });
}

export function prependSystemPromptAddition(params: {
  systemPrompt: string;
  systemPromptAddition?: string;
}): string {
  if (!params.systemPromptAddition) {
    return params.systemPrompt;
  }
  return `${params.systemPromptAddition}\n\n${params.systemPrompt}`;
}

export function buildWorkspaceNotesForAttempt(params: {
  hasWorkspaceBootstrapFile: boolean;
  bootstrapAnalysis: Pick<BootstrapBudgetAnalysis, "hasTruncation">;
  mainMemoryRouting: {
    sourceResolution: Pick<
      SessionSourceResolutionReport,
      "questionKind" | "authoritativeSource" | "coverageRequirement" | "coverageState"
    >;
  };
}): string[] | undefined {
  const notes: string[] = [];
  if (params.hasWorkspaceBootstrapFile) {
    notes.push("Reminder: commit your changes in this workspace after edits.");
  }
  const sourceResolution = params.mainMemoryRouting.sourceResolution;
  const coveragePolicy = resolveCoverageGatedAnswerPolicy({ sourceResolution });
  if (
    sourceResolution.questionKind === "implementation" ||
    sourceResolution.questionKind === "mixed"
  ) {
    notes.push(
      "This turn needs canonical implementation truth. Treat `repo_canonical_doc` under `imports/*/content/...` as authoritative and use workspace memory only as continuity or supporting context.",
    );
  }
  if (params.bootstrapAnalysis.hasTruncation) {
    notes.push(
      "Project Context was truncated in bootstrap for this run. Treat injected workspace context as partial and read authoritative files directly before answering exact repo-coupled questions.",
    );
  }
  if (coveragePolicy.mustContinueReading) {
    notes.push(
      "Exact answers are coverage-gated for this turn. If canonical source coverage is still unread or partial, continue reading until verified or explicitly say coverage is incomplete instead of answering with certainty.",
    );
  }
  return notes.length > 0 ? notes : undefined;
}

/** Build runtime context passed into context-engine afterTurn hooks. */
export function buildAfterTurnRuntimeContext(params: {
  attempt: Pick<
    EmbeddedRunAttemptParams,
    | "sessionKey"
    | "messageChannel"
    | "messageProvider"
    | "agentAccountId"
    | "currentChannelId"
    | "currentThreadTs"
    | "currentMessageId"
    | "config"
    | "skillsSnapshot"
    | "senderIsOwner"
    | "senderId"
    | "provider"
    | "modelId"
    | "thinkLevel"
    | "reasoningLevel"
    | "bashElevated"
    | "extraSystemPrompt"
    | "ownerNumbers"
    | "authProfileId"
  >;
  workspaceDir: string;
  agentDir: string;
}): Partial<CompactEmbeddedPiSessionParams> {
  return buildEmbeddedCompactionRuntimeContext({
    sessionKey: params.attempt.sessionKey,
    messageChannel: params.attempt.messageChannel,
    messageProvider: params.attempt.messageProvider,
    agentAccountId: params.attempt.agentAccountId,
    currentChannelId: params.attempt.currentChannelId,
    currentThreadTs: params.attempt.currentThreadTs,
    currentMessageId: params.attempt.currentMessageId,
    authProfileId: params.attempt.authProfileId,
    workspaceDir: params.workspaceDir,
    agentDir: params.agentDir,
    config: params.attempt.config,
    skillsSnapshot: params.attempt.skillsSnapshot,
    senderIsOwner: params.attempt.senderIsOwner,
    senderId: params.attempt.senderId,
    provider: params.attempt.provider,
    modelId: params.attempt.modelId,
    thinkLevel: params.attempt.thinkLevel,
    reasoningLevel: params.attempt.reasoningLevel,
    bashElevated: params.attempt.bashElevated,
    extraSystemPrompt: params.attempt.extraSystemPrompt,
    ownerNumbers: params.attempt.ownerNumbers,
  });
}
