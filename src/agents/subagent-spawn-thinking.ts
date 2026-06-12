import { normalizeThinkLevel } from "../auto-reply/thinking.shared.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const raw = value[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function resolveSubagentThinkingOverride(params: {
  cfg: OpenClawConfig;
  targetAgentConfig?: unknown;
  thinkingOverrideRaw?: string;
}) {
  const targetAgent = asRecord(params.targetAgentConfig);
  const targetSubagents = asRecord(targetAgent?.subagents);
  const defaultAgent = asRecord(params.cfg.agents?.defaults);
  const defaultSubagents = asRecord(params.cfg.agents?.defaults?.subagents);
  const resolvedThinkingDefaultRaw =
    readString(targetAgent ?? {}, "thinkingDefault") ??
    readString(targetSubagents ?? {}, "thinking") ??
    readString(defaultSubagents ?? {}, "thinking") ??
    readString(defaultAgent ?? {}, "thinkingDefault");

  const thinkingCandidateRaw = params.thinkingOverrideRaw || resolvedThinkingDefaultRaw;
  if (!thinkingCandidateRaw) {
    return {
      status: "ok" as const,
      thinkingOverride: undefined,
      initialSessionPatch: {},
    };
  }

  const normalizedThinking = normalizeThinkLevel(thinkingCandidateRaw);
  if (!normalizedThinking) {
    return {
      status: "error" as const,
      thinkingCandidateRaw,
    };
  }

  return {
    status: "ok" as const,
    thinkingOverride: normalizedThinking,
    initialSessionPatch: {
      thinkingLevel: normalizedThinking === "off" ? null : normalizedThinking,
    },
  };
}
