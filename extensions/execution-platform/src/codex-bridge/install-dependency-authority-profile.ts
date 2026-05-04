import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type InstallDependencyAuthorityProfile = {
  artifactKind: "codex_bridge_install_dependency_authority_profile";
  profileId: string;
  allowedPackageManagerCommands: string[];
  dryRunOnly: boolean;
  packageScope: string[];
  lockfileMutationAllowed: boolean;
  maxAttempts: number;
  timeoutMs: number;
  maxOutputBytes: number;
  reviewRequired: true;
  rollbackPlanRequired: true;
  dependencyRiskSummaryRequired: true;
  hiddenInstallsAllowed: false;
  deployAllowed: false;
  outboundSendingAllowed: false;
  modelPromotionAllowed: false;
};

export type InstallDependencyAuthorityProof = {
  artifactKind: "codex_bridge_install_dependency_authority_proof";
  profileId: string;
  command: string;
  status: "dry_run_allowed" | "refused";
  blockingReasons: string[];
  lockfileMutated: false;
  deployPerformed: false;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
};

export function createInstallDependencyAuthorityProfile(
  input: Partial<
    Pick<
      InstallDependencyAuthorityProfile,
      | "profileId"
      | "allowedPackageManagerCommands"
      | "dryRunOnly"
      | "packageScope"
      | "lockfileMutationAllowed"
      | "maxAttempts"
      | "timeoutMs"
      | "maxOutputBytes"
    >
  > = {},
): InstallDependencyAuthorityProfile {
  return {
    artifactKind: "codex_bridge_install_dependency_authority_profile",
    profileId: input.profileId ?? "install-dependency-authority-v1",
    allowedPackageManagerCommands: input.allowedPackageManagerCommands ?? [
      "pnpm install --lockfile-only --dry-run",
    ],
    dryRunOnly: input.dryRunOnly ?? true,
    packageScope: input.packageScope ?? ["package.json", "pnpm-lock.yaml"],
    lockfileMutationAllowed: input.lockfileMutationAllowed ?? false,
    maxAttempts: input.maxAttempts ?? 1,
    timeoutMs: input.timeoutMs ?? 120_000,
    maxOutputBytes: input.maxOutputBytes ?? 256 * 1024,
    reviewRequired: true,
    rollbackPlanRequired: true,
    dependencyRiskSummaryRequired: true,
    hiddenInstallsAllowed: false,
    deployAllowed: false,
    outboundSendingAllowed: false,
    modelPromotionAllowed: false,
  };
}

export function validateInstallDependencyAuthorityProfile(
  profile: InstallDependencyAuthorityProfile,
): { valid: boolean; blockingReasons: string[] } {
  const reasons: string[] = [];
  if (profile.allowedPackageManagerCommands.length === 0) {
    reasons.push("allowed_package_manager_command_required");
  }
  if (profile.allowedPackageManagerCommands.some((command) => !command.trim())) {
    reasons.push("blank_package_manager_command");
  }
  if (profile.maxAttempts < 1 || profile.maxAttempts > 2) {
    reasons.push("bounded_attempts_required");
  }
  if (!profile.reviewRequired || !profile.rollbackPlanRequired) {
    reasons.push("review_and_rollback_required");
  }
  if (profile.hiddenInstallsAllowed) {
    reasons.push("hidden_installs_not_allowed");
  }
  if (!profile.dryRunOnly && !profile.lockfileMutationAllowed) {
    reasons.push("real_install_requires_explicit_lockfile_authority");
  }
  if (profile.deployAllowed) {
    reasons.push("deploy_not_allowed");
  }
  if (profile.outboundSendingAllowed) {
    reasons.push("outbound_sending_not_allowed");
  }
  if (profile.modelPromotionAllowed) {
    reasons.push("model_promotion_not_allowed");
  }
  return { valid: reasons.length === 0, blockingReasons: [...new Set(reasons)] };
}

export async function recordInstallDependencyAuthorityProof(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile: InstallDependencyAuthorityProfile;
  command: string;
}): Promise<InstallDependencyAuthorityProof> {
  const validation = validateInstallDependencyAuthorityProfile(input.profile);
  const commandAllowed = input.profile.allowedPackageManagerCommands.includes(input.command);
  const dryRunCommand = /\b(dry-run|--check|--frozen-lockfile)\b/u.test(input.command);
  const blockingReasons = [
    ...validation.blockingReasons,
    ...(commandAllowed ? [] : ["command_not_allowlisted"]),
    ...(input.profile.dryRunOnly && !dryRunCommand ? ["dry_run_command_required"] : []),
  ];
  const proof: InstallDependencyAuthorityProof = {
    artifactKind: "codex_bridge_install_dependency_authority_proof",
    profileId: input.profile.profileId,
    command: input.command,
    status: blockingReasons.length === 0 ? "dry_run_allowed" : "refused",
    blockingReasons,
    lockfileMutated: false,
    deployPerformed: false,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.install_dependency_authority_proof",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/install-dependency/${input.profile.profileId}`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
