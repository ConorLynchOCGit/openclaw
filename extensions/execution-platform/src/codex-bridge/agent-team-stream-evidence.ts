import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type AgentTeamStreamEventKind =
  | "role_started"
  | "role_finished"
  | "handoff_created"
  | "handoff_applied"
  | "validation_started"
  | "validation_finished"
  | "review_started"
  | "review_finished"
  | "closeout_started"
  | "closeout_finished"
  | "control_observed"
  | "control_applied"
  | "control_rejected"
  | "model_call_started"
  | "model_call_finished";

export type AgentTeamStreamEventStatus = "started" | "succeeded" | "failed" | "needs_review";

export type AgentTeamStreamEvidenceEvent = {
  artifactKind: "agent_team_stream_event";
  streamEventId: string;
  runtimeJobId: string;
  teamRunId: string;
  roleId: AgentTeamRoleId | null;
  modelCandidateId: string | null;
  eventKind: AgentTeamStreamEventKind;
  occurredAt: string;
  status: AgentTeamStreamEventStatus;
  summary: string;
  reasonCodes: string[];
  artifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogStored: false;
};

export type AgentTeamStreamEvidenceSummary = {
  artifactKind: "agent_team_stream_summary";
  runtimeJobId: string;
  teamRunId: string;
  eventCount: number;
  latestSummary: string | null;
  perKindCounts: Partial<Record<AgentTeamStreamEventKind, number>>;
  roleEventCounts: Record<string, number>;
  blockerReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogStored: false;
};

const PROHIBITED_RAW_MARKERS =
  /\b(raw\s*(prompt|response|transcript|log)|BEGIN\s+RAW|secret|api[_-]?key|sk-[A-Za-z0-9])/iu;

function sizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

export function createAgentTeamStreamEvent(
  input: Omit<
    AgentTeamStreamEvidenceEvent,
    | "artifactKind"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawTranscriptStored"
    | "rawLogStored"
  >,
): AgentTeamStreamEvidenceEvent {
  if (PROHIBITED_RAW_MARKERS.test(input.summary)) {
    throw new Error("agent-team stream event summary contains prohibited raw/private content");
  }
  return {
    artifactKind: "agent_team_stream_event",
    ...input,
    reasonCodes: input.reasonCodes.slice(0, 10),
    artifactRefs: input.artifactRefs.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogStored: false,
  };
}

export async function recordAgentTeamStreamEvent(input: {
  runtimeJobs: RuntimeJobRepository;
  event: AgentTeamStreamEvidenceEvent;
}): Promise<RuntimeJobEvent> {
  return input.runtimeJobs.recordEvent({
    jobId: input.event.runtimeJobId,
    eventType: "agent_team.stream_event",
    data: asJson(input.event),
  });
}

export function summarizeAgentTeamStreamEvents(
  events: AgentTeamStreamEvidenceEvent[],
): AgentTeamStreamEvidenceSummary {
  const perKindCounts: Partial<Record<AgentTeamStreamEventKind, number>> = {};
  const roleEventCounts: Record<string, number> = {};
  const blockerReasonCodes = new Set<string>();
  for (const event of events) {
    perKindCounts[event.eventKind] = (perKindCounts[event.eventKind] ?? 0) + 1;
    if (event.roleId) {
      roleEventCounts[event.roleId] = (roleEventCounts[event.roleId] ?? 0) + 1;
    }
    if (event.status === "failed" || event.status === "needs_review") {
      for (const reason of event.reasonCodes) {
        blockerReasonCodes.add(reason);
      }
    }
  }
  return {
    artifactKind: "agent_team_stream_summary",
    runtimeJobId: events[0]?.runtimeJobId ?? "unknown-runtime-job",
    teamRunId: events[0]?.teamRunId ?? "unknown-team-run",
    eventCount: events.length,
    latestSummary: events.at(-1)?.summary ?? null,
    perKindCounts,
    roleEventCounts,
    blockerReasonCodes: [...blockerReasonCodes].toSorted().slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogStored: false,
  };
}

export async function recordAgentTeamStreamSummary(input: {
  runtimeJobs: RuntimeJobRepository;
  summary: AgentTeamStreamEvidenceSummary;
}): Promise<RuntimeJobArtifact> {
  const metadata = asJson(input.summary);
  return input.runtimeJobs.attachArtifact({
    jobId: input.summary.runtimeJobId,
    artifactType: "agent_team.stream_summary",
    storageKind: "metadata",
    uri: `runtime-job://${input.summary.runtimeJobId}/agent-team/stream-summary/${input.summary.teamRunId}`,
    contentType: "application/json",
    sizeBytes: sizeBytes(metadata),
    metadata,
  });
}

export function latestAgentTeamStreamSummary(
  artifacts: RuntimeJobArtifact[],
): AgentTeamStreamEvidenceSummary | null {
  const artifact = artifacts.findLast((item) => item.artifactType === "agent_team.stream_summary");
  return artifact?.metadata && typeof artifact.metadata === "object"
    ? (artifact.metadata as unknown as AgentTeamStreamEvidenceSummary)
    : null;
}
