import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createDeployAuthorityProfile,
  recordDeployAuthorityProof,
  type DeployAuthorityProfile,
} from "./deploy-authority-profile.ts";

export type DeployDryRunPilotResult = {
  artifactKind: "codex_bridge_deploy_dry_run_pilot";
  profileId: string;
  targetEnvironment: string;
  status: "completed" | "refused";
  preflightPassed: boolean;
  rollbackPlanPresent: boolean;
  healthChecksPresent: boolean;
  realDeployPerformed: false;
  blockingReasons: string[];
};

export async function runDeployDryRunPilot(
  input: {
    runtimeJobs?: RuntimeJobRepository;
    runtimeJobId?: string;
    profile?: DeployAuthorityProfile;
  } = {},
): Promise<DeployDryRunPilotResult> {
  const profile = input.profile ?? createDeployAuthorityProfile();
  const command = profile.deployCommands[0] ?? "deploy --dry-run";
  const proof = await recordDeployAuthorityProof({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile,
    command,
    localMock: profile.targetEnvironment === "local_mock",
  });
  const result: DeployDryRunPilotResult = {
    artifactKind: "codex_bridge_deploy_dry_run_pilot",
    profileId: profile.profileId,
    targetEnvironment: profile.targetEnvironment,
    status: proof.status === "refused" ? "refused" : "completed",
    preflightPassed: proof.status !== "refused",
    rollbackPlanPresent: proof.rollbackPlanPresent,
    healthChecksPresent: proof.healthChecksPresent,
    realDeployPerformed: false,
    blockingReasons: proof.blockingReasons,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.deploy_dry_run_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/deploy/dry-run`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
