import {
  createWorkflowPermissionReadback,
  type WorkflowPermissionReadback,
} from "../authority/workflow-permission-readback.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import type { AgentTeamRoleExecutionEvidence } from "./agent-team-role-execution-evidence.ts";

export const AGENT_TEAM_JOB_TYPE = "executor.agent_team";

export type AgentTeamRunState =
  | "created"
  | "running"
  | "paused"
  | "redirected"
  | "canceled"
  | "needs_review"
  | "completed";

export type AgentTeamRuntimeEvidence = {
  artifactKind: "agent_team_runtime_evidence";
  teamRunId: string;
  runtimeJobId: string;
  workQueueLink: { workItemId: string; runId?: string | null } | null;
  objective: string;
  roster: Array<{
    roleId: AgentTeamRoleId;
    modelId: string;
    status: "allowed" | "needs_review" | "blocked";
  }>;
  roleAssignments: Array<{
    roleId: AgentTeamRoleId;
    modelId: string;
    assignedAt: string;
    status: "assigned" | "completed" | "blocked" | "needs_review";
  }>;
  roleExecutionEvidence?: AgentTeamRoleExecutionEvidence[];
  roleEligibility: Record<string, "allowed" | "needs_review" | "blocked">;
  activeRole: AgentTeamRoleId | null;
  handoffHistory: AgentTeamHandoffEvidence[];
  handoffState: "none" | "ready" | "paused" | "redirected" | "canceled" | "blocked";
  reviewState: "not_started" | "in_progress" | "needs_review" | "reviewed" | "blocked";
  validationState: "not_run" | "running" | "passed" | "failed" | "needs_review";
  closeoutState: "missing" | "required" | "present";
  authorityStatus: "allowed" | "needs_review" | "blocked";
  permissionEvidence: WorkflowPermissionReadback;
  modelRoutingEvidence: JsonValue;
  sourcePromptResolution?: JsonValue;
  controlState: "none" | "pending" | "applied" | "rejected";
  streamEvidenceRefs: string[];
  artifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type AgentTeamHandoffEvidence = {
  handoffId: string;
  fromRole: AgentTeamRoleId;
  toRole: AgentTeamRoleId;
  status: "ready" | "paused" | "redirected" | "canceled" | "completed" | "blocked";
  recordedAt: string;
  payloadSummary: string;
  evidenceRefs: string[];
  rawTranscriptAllowed: false;
  rawProviderPromptAllowed: false;
};

function sizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function artifactUri(runtimeJobId: string, suffix: string): string {
  return `runtime-job://${runtimeJobId}/agent-team/${suffix}`;
}

export function createAgentTeamRuntimeEvidence(input: {
  teamRunId: string;
  runtimeJobId: string;
  workQueueLink?: AgentTeamRuntimeEvidence["workQueueLink"];
  objective: string;
  roster: AgentTeamRuntimeEvidence["roster"];
  roleAssignments?: AgentTeamRuntimeEvidence["roleAssignments"];
  roleExecutionEvidence?: AgentTeamRoleExecutionEvidence[];
  roleEligibility?: AgentTeamRuntimeEvidence["roleEligibility"];
  activeRole?: AgentTeamRoleId | null;
  handoffHistory?: AgentTeamHandoffEvidence[];
  reviewState?: AgentTeamRuntimeEvidence["reviewState"];
  validationState?: AgentTeamRuntimeEvidence["validationState"];
  closeoutState?: AgentTeamRuntimeEvidence["closeoutState"];
  authorityStatus?: AgentTeamRuntimeEvidence["authorityStatus"];
  permissionEvidence?: AgentTeamRuntimeEvidence["permissionEvidence"];
  modelRoutingEvidence?: JsonValue;
  sourcePromptResolution?: JsonValue;
  controlState?: AgentTeamRuntimeEvidence["controlState"];
  streamEvidenceRefs?: string[];
  artifactRefs?: string[];
}): AgentTeamRuntimeEvidence {
  const handoffHistory = input.handoffHistory ?? [];
  const handoffState =
    handoffHistory.at(-1)?.status === "paused"
      ? "paused"
      : handoffHistory.at(-1)?.status === "redirected"
        ? "redirected"
        : handoffHistory.at(-1)?.status === "canceled"
          ? "canceled"
          : handoffHistory.at(-1)?.status === "blocked"
            ? "blocked"
            : handoffHistory.length > 0
              ? "ready"
              : "none";
  return {
    artifactKind: "agent_team_runtime_evidence",
    teamRunId: input.teamRunId,
    runtimeJobId: input.runtimeJobId,
    workQueueLink: input.workQueueLink ?? null,
    objective: input.objective,
    roster: input.roster,
    roleAssignments: input.roleAssignments ?? [],
    roleExecutionEvidence: input.roleExecutionEvidence ?? [],
    roleEligibility: input.roleEligibility ?? {},
    activeRole: input.activeRole ?? null,
    handoffHistory,
    handoffState,
    reviewState: input.reviewState ?? "not_started",
    validationState: input.validationState ?? "not_run",
    closeoutState: input.closeoutState ?? "required",
    authorityStatus: input.authorityStatus ?? "needs_review",
    permissionEvidence:
      input.permissionEvidence ??
      createWorkflowPermissionReadback({
        workflowId: "agent_team.coding",
        authorityProfile: "local_yolo",
      }),
    modelRoutingEvidence: input.modelRoutingEvidence ?? {},
    sourcePromptResolution: input.sourcePromptResolution,
    controlState: input.controlState ?? "none",
    streamEvidenceRefs: input.streamEvidenceRefs ?? [],
    artifactRefs: input.artifactRefs ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export async function recordAgentTeamRuntimeEvidence(input: {
  runtimeJobs: RuntimeJobRepository;
  evidence: AgentTeamRuntimeEvidence;
}): Promise<RuntimeJobArtifact> {
  const metadata = asJson(input.evidence);
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "agent_team.run_created",
    data: {
      teamRunId: input.evidence.teamRunId,
      objective: input.evidence.objective,
      activeRole: input.evidence.activeRole,
    },
  });
  for (const assignment of input.evidence.roleAssignments) {
    await input.runtimeJobs.recordEvent({
      jobId: input.evidence.runtimeJobId,
      eventType: "agent_team.role_assigned",
      data: asJson(assignment),
    });
  }
  for (const handoff of input.evidence.handoffHistory) {
    await input.runtimeJobs.recordEvent({
      jobId: input.evidence.runtimeJobId,
      eventType: "agent_team.handoff_recorded",
      data: asJson(handoff),
    });
  }
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "agent_team.validation_recorded",
    data: { validationState: input.evidence.validationState },
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "agent_team.review_recorded",
    data: { reviewState: input.evidence.reviewState },
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "agent_team.closeout_recorded",
    data: { closeoutState: input.evidence.closeoutState },
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "agent_team.authority_status_recorded",
    data: { authorityStatus: input.evidence.authorityStatus },
  });
  if (input.evidence.validationState === "passed" && input.evidence.closeoutState === "present") {
    await input.runtimeJobs.recordEvent({
      jobId: input.evidence.runtimeJobId,
      eventType: "agent_team.run_completed",
      data: { teamRunId: input.evidence.teamRunId },
    });
  }
  return input.runtimeJobs.attachArtifact({
    jobId: input.evidence.runtimeJobId,
    artifactType: "agent_team.runtime_evidence",
    storageKind: "metadata",
    uri: artifactUri(input.evidence.runtimeJobId, `runtime-evidence/${input.evidence.teamRunId}`),
    contentType: "application/json",
    sizeBytes: sizeBytes(metadata),
    metadata,
  });
}

export function latestAgentTeamRuntimeEvidence(
  artifacts: RuntimeJobArtifact[],
): AgentTeamRuntimeEvidence | null {
  const artifact = artifacts.findLast(
    (item) => item.artifactType === "agent_team.runtime_evidence",
  );
  return artifact?.metadata && typeof artifact.metadata === "object"
    ? (artifact.metadata as unknown as AgentTeamRuntimeEvidence)
    : null;
}
