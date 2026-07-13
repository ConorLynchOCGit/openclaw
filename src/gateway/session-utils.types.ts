// Gateway session response aliases use the shared transport contract consumed by the UI.
import type { SessionEntry } from "../config/sessions/types.js";
import type {
  GatewayAgentRuntime,
  GatewaySessionRow,
  GatewayThinkingLevelOption,
  SessionsListResultBase,
  SessionsPatchResultBase,
} from "../shared/session-types.js";

export type {
  GatewayAgentRow,
  GatewaySessionCodexExecutionEvidence,
  GatewaySessionCodexNativeChildRun,
  GatewaySessionCodexTeamUsage,
  GatewaySessionUsage,
  GatewaySessionRow,
  ReadbackFieldProvenance,
  SessionCompactionCheckpointPreview,
  SessionReadbackProvenance,
  SessionRunStatus,
} from "../shared/session-types.js";
export type { ReadbackProgressProjection } from "../shared/readback-progress.js";

export type GatewaySessionsDefaults = {
  modelProvider: string | null;
  model: string | null;
  contextTokens: number | null;
  thinkingLevels?: GatewayThinkingLevelOption[];
  thinkingOptions?: string[];
  thinkingDefault?: string;
};

export type SessionPreviewItem = {
  role: "user" | "assistant" | "tool" | "system" | "other";
  text: string;
};

export type SessionsPreviewEntry = {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
};

export type SessionsPreviewResult = {
  ts: number;
  previews: SessionsPreviewEntry[];
};

export type SessionsListResult = SessionsListResultBase<GatewaySessionsDefaults, GatewaySessionRow>;

export type SessionsPatchResult = SessionsPatchResultBase<SessionEntry> & {
  entry: SessionEntry;
  resolved?: {
    modelProvider?: string;
    model?: string;
    agentRuntime?: GatewayAgentRuntime;
  };
};
