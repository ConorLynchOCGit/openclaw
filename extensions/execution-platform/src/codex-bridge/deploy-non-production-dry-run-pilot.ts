import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createDeployAuthorityProfile,
  recordDeployAuthorityProof,
} from "./deploy-authority-profile.ts";

export type DeployNonProductionDryRunPilotResult = {
  artifactKind: "codex_bridge_deploy_non_production_dry_run_pilot";
  status: "completed" | "non_production_deploy_target_unavailable" | "refused";
  targetEnvironment: "staging" | "local_mock" | null;
  targetConfigured: boolean;
  preflightRecorded: boolean;
  rollbackPlanPresent: boolean;
  healthChecksPresent: boolean;
  realDeployPerformed: false;
  blockingReasons: string[];
};

export async function runDeployNonProductionDryRunPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  targetEnvironment?: "staging" | "local_mock" | "production" | null;
  dryRunCommand?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<DeployNonProductionDryRunPilotResult> {
  const configuredTarget =
    input.targetEnvironment ??
    (input.env?.OPENCLAW_NON_PRODUCTION_DEPLOY_TARGET === "staging" ? "staging" : null);
  if (!configuredTarget) {
    return {
      artifactKind: "codex_bridge_deploy_non_production_dry_run_pilot",
      status: "non_production_deploy_target_unavailable",
      targetEnvironment: null,
      targetConfigured: false,
      preflightRecorded: false,
      rollbackPlanPresent: true,
      healthChecksPresent: true,
      realDeployPerformed: false,
      blockingReasons: ["non_production_deploy_target_unavailable"],
    };
  }
  if (configuredTarget === "production") {
    return {
      artifactKind: "codex_bridge_deploy_non_production_dry_run_pilot",
      status: "refused",
      targetEnvironment: null,
      targetConfigured: true,
      preflightRecorded: false,
      rollbackPlanPresent: true,
      healthChecksPresent: true,
      realDeployPerformed: false,
      blockingReasons: ["production_target_not_allowed"],
    };
  }
  const command = input.dryRunCommand ?? "deploy --dry-run";
  const proof = await recordDeployAuthorityProof({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile: createDeployAuthorityProfile({
      profileId: "deploy-non-production-dry-run",
      targetEnvironment: configuredTarget,
      deployCommands: [command],
      dryRunOnly: true,
    }),
    command,
    localMock: configuredTarget === "local_mock",
  });
  const result: DeployNonProductionDryRunPilotResult = {
    artifactKind: "codex_bridge_deploy_non_production_dry_run_pilot",
    status: proof.status === "refused" ? "refused" : "completed",
    targetEnvironment: configuredTarget,
    targetConfigured: true,
    preflightRecorded: proof.status !== "refused",
    rollbackPlanPresent: proof.rollbackPlanPresent,
    healthChecksPresent: proof.healthChecksPresent,
    realDeployPerformed: false,
    blockingReasons: proof.blockingReasons,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.deploy_non_production_dry_run_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/deploy/non-production-dry-run`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
