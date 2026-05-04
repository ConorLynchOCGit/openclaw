import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type DeployAuthorityProfile = {
  artifactKind: "codex_bridge_deploy_authority_profile";
  profileId: string;
  targetEnvironment: "local_mock" | "staging" | "production";
  deployCommands: string[];
  dryRunOnly: boolean;
  approvalRequired: true;
  preflightRequired: true;
  healthChecksRequired: true;
  rollbackPlanRequired: true;
  postDeployEvidenceRequired: true;
  timeoutMs: number;
  maxOutputBytes: number;
  hiddenDeploysAllowed: false;
  outboundSendingAllowed: false;
  modelPromotionAllowed: false;
};

export type DeployAuthorityProof = {
  artifactKind: "codex_bridge_deploy_authority_proof";
  profileId: string;
  targetEnvironment: DeployAuthorityProfile["targetEnvironment"];
  command: string;
  status: "dry_run_preflight_recorded" | "local_mock_recorded" | "refused";
  blockingReasons: string[];
  realDeployPerformed: false;
  rollbackPlanPresent: boolean;
  healthChecksPresent: boolean;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
};

export function createDeployAuthorityProfile(
  input: Partial<
    Pick<
      DeployAuthorityProfile,
      | "profileId"
      | "targetEnvironment"
      | "deployCommands"
      | "dryRunOnly"
      | "timeoutMs"
      | "maxOutputBytes"
    >
  > = {},
): DeployAuthorityProfile {
  return {
    artifactKind: "codex_bridge_deploy_authority_profile",
    profileId: input.profileId ?? "deploy-authority-v1",
    targetEnvironment: input.targetEnvironment ?? "local_mock",
    deployCommands: input.deployCommands ?? ["deploy --dry-run"],
    dryRunOnly: input.dryRunOnly ?? true,
    approvalRequired: true,
    preflightRequired: true,
    healthChecksRequired: true,
    rollbackPlanRequired: true,
    postDeployEvidenceRequired: true,
    timeoutMs: input.timeoutMs ?? 300_000,
    maxOutputBytes: input.maxOutputBytes ?? 256 * 1024,
    hiddenDeploysAllowed: false,
    outboundSendingAllowed: false,
    modelPromotionAllowed: false,
  };
}

export function validateDeployAuthorityProfile(profile: DeployAuthorityProfile): {
  valid: boolean;
  blockingReasons: string[];
} {
  const reasons: string[] = [];
  if (!profile.targetEnvironment) {
    reasons.push("target_environment_required");
  }
  if (profile.deployCommands.length === 0) {
    reasons.push("deploy_command_required");
  }
  if (
    !profile.approvalRequired ||
    !profile.preflightRequired ||
    !profile.rollbackPlanRequired ||
    !profile.healthChecksRequired
  ) {
    reasons.push("approval_preflight_rollback_and_health_checks_required");
  }
  if (profile.targetEnvironment === "production" && profile.dryRunOnly) {
    reasons.push("production_deploy_remains_dry_run_only");
  }
  if (profile.hiddenDeploysAllowed) {
    reasons.push("hidden_deploys_not_allowed");
  }
  if (profile.outboundSendingAllowed) {
    reasons.push("outbound_sending_not_allowed");
  }
  if (profile.modelPromotionAllowed) {
    reasons.push("model_promotion_not_allowed");
  }
  return { valid: reasons.length === 0, blockingReasons: [...new Set(reasons)] };
}

export async function recordDeployAuthorityProof(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile: DeployAuthorityProfile;
  command: string;
  localMock?: boolean;
}): Promise<DeployAuthorityProof> {
  const validation = validateDeployAuthorityProfile(input.profile);
  const reasons = [
    ...validation.blockingReasons,
    ...(input.profile.deployCommands.includes(input.command) ? [] : ["command_not_allowlisted"]),
    ...(input.profile.dryRunOnly && !/dry-run|plan|preview/u.test(input.command) && !input.localMock
      ? ["dry_run_or_local_mock_required"]
      : []),
  ];
  const proof: DeployAuthorityProof = {
    artifactKind: "codex_bridge_deploy_authority_proof",
    profileId: input.profile.profileId,
    targetEnvironment: input.profile.targetEnvironment,
    command: input.command,
    status:
      reasons.length === 0
        ? input.localMock
          ? "local_mock_recorded"
          : "dry_run_preflight_recorded"
        : "refused",
    blockingReasons: reasons,
    realDeployPerformed: false,
    rollbackPlanPresent: input.profile.rollbackPlanRequired,
    healthChecksPresent: input.profile.healthChecksRequired,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.deploy_authority_proof",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/deploy/${input.profile.profileId}`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
