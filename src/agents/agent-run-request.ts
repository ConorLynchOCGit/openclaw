import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";

export type AgentRunTrigger = "cron" | "heartbeat" | "manual" | "memory" | "overflow" | "user";

export type AgentRunRequest = {
  agentId: string | null;
  input: {
    prompt: string;
    trigger?: AgentRunTrigger | null;
  };
  promptProfile?: string | null;
  toolPolicy?: {
    visibleToolNames?: readonly string[];
    requiredToolNames?: readonly string[];
  } | null;
  modelProfile?: {
    provider?: string | null;
    model?: string | null;
    thinkingLevel?: ThinkLevel | null;
    reasoningLevel?: ReasoningLevel | null;
  } | null;
  workspace: {
    canonicalSourceRoot: string | null;
    runtimeWorkspaceDir: string;
    transcriptRoot: string | null;
    artifactRoot: string | null;
  };
  transcript: {
    sessionId: string;
    sessionKey?: string | null;
    sessionFile: string;
  };
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
};
