import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type AgentTeamRoleExecutionTransportKind =
  | "live_model"
  | "codex_app_server"
  | "codex_parity_runtime_adapter"
  | "acp_codex"
  | "injected"
  | "fixture";

export type AgentTeamRoleExecutionEvidence = {
  roleId: AgentTeamRoleId;
  agentId: string;
  modelRef: string;
  providerPath: string;
  transportKind: AgentTeamRoleExecutionTransportKind;
  modelRunRef: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  assignedTaskSummary: string;
  producedArtifactRefs: string[];
  inlineRoleReportRef?: string;
  rawPromptStored: false;
  rawResponseStored: false;
};
