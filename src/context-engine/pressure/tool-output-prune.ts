import {
  resolveLiveToolResultMaxChars,
  truncateOversizedToolResultsInSession,
} from "../../agents/pi-embedded-runner/tool-result-truncation.js";
import { resolveStateDir } from "../../config/paths.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { PruneResult } from "./types.js";

export async function pruneToolOutputsForContextPressure(params: {
  reason: string;
  provider?: string;
  modelId?: string;
  sessionFile: string;
  sessionId: string;
  sessionKey?: string;
  contextWindowTokens: number;
  config?: OpenClawConfig;
  agentId?: string | null;
  log?: {
    info?: (message: string) => void;
  };
}): Promise<PruneResult> {
  const toolResultMaxChars = resolveLiveToolResultMaxChars({
    contextWindowTokens: params.contextWindowTokens,
    cfg: params.config,
    agentId: params.agentId ?? undefined,
  });
  const startedAt = Date.now();
  const result = await truncateOversizedToolResultsInSession({
    sessionFile: params.sessionFile,
    contextWindowTokens: params.contextWindowTokens,
    maxCharsOverride: toolResultMaxChars,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    stateRoot: resolveStateDir(process.env),
  });
  const durationMs = Date.now() - startedAt;
  const providerLabel =
    params.provider && params.modelId ? ` provider=${params.provider}/${params.modelId}` : "";
  if (result.truncated) {
    params.log?.info?.(
      `[context-pressure-prune] prune-only recovery succeeded ` +
        `reason=${params.reason}${providerLabel} ` +
        `contextWindow=${params.contextWindowTokens} toolResultMaxChars=${toolResultMaxChars} ` +
        `truncatedCount=${result.truncatedCount ?? 0} durationMs=${durationMs}`,
    );
  } else {
    params.log?.info?.(
      `[context-pressure-prune] prune-only recovery found no rewrite ` +
        `reason=${params.reason}${providerLabel} ` +
        `contextWindow=${params.contextWindowTokens} toolResultMaxChars=${toolResultMaxChars} ` +
        `durationMs=${durationMs} resultReason=${result.reason ?? "none"}`,
    );
  }
  return {
    truncated: result.truncated,
    truncatedCount: result.truncatedCount,
    reason: result.reason,
    durationMs,
  };
}
