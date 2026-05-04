import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createInstallDependencyAuthorityProfile,
  recordInstallDependencyAuthorityProof,
  type InstallDependencyAuthorityProfile,
} from "./install-dependency-authority-profile.ts";

export type InstallDependencyDryRunPilotResult = {
  artifactKind: "codex_bridge_install_dependency_dry_run_pilot";
  profileId: string;
  proposedChange: string;
  command: string;
  status: "completed" | "refused";
  lockfileMutated: false;
  reviewRequired: true;
  rollbackPlan: string;
  blockingReasons: string[];
};

export type InstallDependencyRealPilotResult = {
  artifactKind: "codex_bridge_install_dependency_real_pilot";
  profileId: string;
  status: "completed_controlled_fixture" | "completed_real_repo_change" | "refused";
  productionDependencyMutationPerformed: boolean;
  lockfileMutated: boolean;
  reviewArtifactRequired: true;
  rollbackPlan: string;
  limitation: string | null;
  blockingReasons: string[];
};

export async function runInstallDependencyDryRunPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile?: InstallDependencyAuthorityProfile;
  proposedChange: string;
}): Promise<InstallDependencyDryRunPilotResult> {
  const profile = input.profile ?? createInstallDependencyAuthorityProfile();
  const command = profile.allowedPackageManagerCommands[0] ?? "pnpm install --dry-run";
  const proof = await recordInstallDependencyAuthorityProof({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile,
    command,
  });
  const result: InstallDependencyDryRunPilotResult = {
    artifactKind: "codex_bridge_install_dependency_dry_run_pilot",
    profileId: profile.profileId,
    proposedChange: input.proposedChange,
    command,
    status: proof.status === "dry_run_allowed" ? "completed" : "refused",
    lockfileMutated: false,
    reviewRequired: true,
    rollbackPlan: "revert package and lockfile diff before merge",
    blockingReasons: proof.blockingReasons,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.install_dependency_dry_run_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/install-dependency/dry-run`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}

export async function runInstallDependencyRealPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile?: InstallDependencyAuthorityProfile;
  dryRun: InstallDependencyDryRunPilotResult;
  approveProductionDependencyMutation?: boolean;
}): Promise<InstallDependencyRealPilotResult> {
  const profile = input.profile ?? createInstallDependencyAuthorityProfile();
  const reasons: string[] = [];
  if (input.dryRun.status !== "completed") {
    reasons.push("dry_run_pilot_required");
  }
  if (!input.approveProductionDependencyMutation) {
    reasons.push("production_dependency_mutation_not_approved_for_this_repo");
  }
  const result: InstallDependencyRealPilotResult =
    reasons.length === 0
      ? {
          artifactKind: "codex_bridge_install_dependency_real_pilot",
          profileId: profile.profileId,
          status: "completed_controlled_fixture",
          productionDependencyMutationPerformed: false,
          lockfileMutated: false,
          reviewArtifactRequired: true,
          rollbackPlan: "controlled fixture only; no repo package rollback required",
          limitation:
            "No safe production dependency mutation was selected; real pilot completed as controlled fixture evidence without repo dependency changes.",
          blockingReasons: [],
        }
      : {
          artifactKind: "codex_bridge_install_dependency_real_pilot",
          profileId: profile.profileId,
          status: "refused",
          productionDependencyMutationPerformed: false,
          lockfileMutated: false,
          reviewArtifactRequired: true,
          rollbackPlan:
            "real dependency pilot requires approved package and lockfile rollback plan",
          limitation: "real repo dependency mutation was not performed",
          blockingReasons: reasons,
        };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.install_dependency_real_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/install-dependency/real-pilot`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
