// Compact result projection shared by native task/session readback commands.

export const COMPACT_RESULT_PROJECTION_SCHEMA = "openclaw.compact-result.v1" as const;

export type CompactResultChildRef = {
  taskId?: string;
  runId?: string;
  sessionKey?: string;
  fullResultRef?: string;
  resultArtifactRefs?: string[];
  agentId?: string;
  status?: string;
  terminalOutcome?: string;
  progressSummary?: string;
  terminalSummary?: string;
};

export type CompactResultProjection = {
  schema: typeof COMPACT_RESULT_PROJECTION_SCHEMA;
  source: "task" | "session";
  lookup?: string;
  taskId?: string;
  runId?: string;
  status?: string;
  terminalOutcome?: string;
  deliveryStatus?: string;
  agentId?: string;
  sessionKey?: string;
  childSessionKey?: string;
  parentTaskId?: string;
  label?: string;
  startedAt?: number;
  endedAt?: number;
  lastEventAt?: number;
  progressSummary?: string;
  terminalSummary?: string;
  finalAssistantText?: string;
  fullResultRef?: string;
  resultArtifactRefs: string[];
  childResultRefs: CompactResultChildRef[];
  receipt?: unknown;
  projectionWarnings: string[];
};

export function compactProjectionText(
  value: string | undefined,
  maxChars = 2_000,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}
