import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";

export type AgentTeamFailureKind =
  | "missing_required_handoff_field"
  | "invalid_validation_claim"
  | "scope_drift"
  | "unsafe_authority_request"
  | "incomplete_review";

export type AgentTeamRecoveryOutcome = "repaired" | "needs_review" | "blocked";

export type AgentTeamFailureRecoveryArtifact = {
  artifactKind: "agent_team_failure_recovery";
  recoveryId: string;
  runtimeJobId: string;
  teamRunId: string;
  failedRole: AgentTeamRoleId;
  recoveryRole: AgentTeamRoleId;
  failureKind: AgentTeamFailureKind;
  detectedAt: string;
  failureSummary: string;
  repairAction: string | null;
  validationRerunRequired: boolean;
  validationRerunStatus: "not_required" | "passed" | "failed" | "needs_review";
  outcome: AgentTeamRecoveryOutcome;
  needsReviewReason: string | null;
  falseSuccessClaimed: false;
  scopeDriftDetected: boolean;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

const UNSAFE_CONTENT =
  /\b(raw\s*(prompt|response|transcript|log)|secret|api[_-]?key|deploy|model\s*promotion)\b/iu;

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function sizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function createAgentTeamFailureRecoveryArtifact(input: {
  recoveryId: string;
  runtimeJobId: string;
  teamRunId: string;
  failedRole: AgentTeamRoleId;
  recoveryRole: AgentTeamRoleId;
  failureKind: AgentTeamFailureKind;
  detectedAt: string;
  failureSummary: string;
  repairAction?: string | null;
  validationRerunRequired?: boolean;
  validationRerunStatus?: AgentTeamFailureRecoveryArtifact["validationRerunStatus"];
  outcome: AgentTeamRecoveryOutcome;
  needsReviewReason?: string | null;
  scopeDriftDetected?: boolean;
}): AgentTeamFailureRecoveryArtifact {
  if (UNSAFE_CONTENT.test(input.failureSummary) || UNSAFE_CONTENT.test(input.repairAction ?? "")) {
    throw new Error("agent-team failure recovery contains prohibited raw/private content");
  }
  if (input.outcome === "repaired" && input.validationRerunStatus === "failed") {
    throw new Error("repaired recovery cannot retain failed validation");
  }
  if (input.failureKind === "scope_drift" && input.outcome === "repaired") {
    throw new Error("scope drift cannot be silently repaired; it must be needs_review or blocked");
  }
  return {
    artifactKind: "agent_team_failure_recovery",
    recoveryId: input.recoveryId,
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId,
    failedRole: input.failedRole,
    recoveryRole: input.recoveryRole,
    failureKind: input.failureKind,
    detectedAt: input.detectedAt,
    failureSummary: input.failureSummary,
    repairAction: input.repairAction ?? null,
    validationRerunRequired: input.validationRerunRequired ?? input.outcome === "repaired",
    validationRerunStatus: input.validationRerunStatus ?? "not_required",
    outcome: input.outcome,
    needsReviewReason: input.needsReviewReason ?? null,
    falseSuccessClaimed: false,
    scopeDriftDetected: input.scopeDriftDetected ?? input.failureKind === "scope_drift",
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export async function recordAgentTeamFailureRecoveryArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  artifact: AgentTeamFailureRecoveryArtifact;
}): Promise<RuntimeJobArtifact> {
  const metadata = asJson(input.artifact);
  await input.runtimeJobs.recordEvent({
    jobId: input.artifact.runtimeJobId,
    eventType: "agent_team.failure_recovery_recorded",
    data: {
      recoveryId: input.artifact.recoveryId,
      failureKind: input.artifact.failureKind,
      outcome: input.artifact.outcome,
      validationRerunStatus: input.artifact.validationRerunStatus,
    },
  });
  return input.runtimeJobs.attachArtifact({
    jobId: input.artifact.runtimeJobId,
    artifactType: "agent_team.failure_recovery",
    storageKind: "metadata",
    uri: `runtime-job://${input.artifact.runtimeJobId}/agent-team/failure-recovery/${input.artifact.recoveryId}`,
    contentType: "application/json",
    sizeBytes: sizeBytes(metadata),
    metadata,
  });
}

export function latestAgentTeamFailureRecovery(
  artifacts: RuntimeJobArtifact[],
): AgentTeamFailureRecoveryArtifact | null {
  const artifact = artifacts.findLast(
    (item) => item.artifactType === "agent_team.failure_recovery",
  );
  return artifact?.metadata && typeof artifact.metadata === "object"
    ? (artifact.metadata as unknown as AgentTeamFailureRecoveryArtifact)
    : null;
}
