import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { decideAuthorityEscalation } from "./authority-escalation-gates.ts";
import { runDeployNonProductionDryRunPilot } from "./deploy-non-production-dry-run-pilot.ts";
import type { OperatorApprovalRecord } from "./operator-approval-records.ts";
import { enforceRuntimeApproval } from "./operator-approval-records.ts";

export type DeployNonProductionRealTargetDryRunProof = {
  artifactKind: "deploy_non_production_real_target_dry_run_proof";
  runtimeJobId: string;
  approvalStatus: "allowed" | "requires_approval" | "blocked";
  targetStatus: "completed" | "non_production_deploy_target_unavailable" | "refused";
  preflightOnly: true;
  rollbackPlanPresent: boolean;
  healthChecksPresent: boolean;
  productionDeployPerformed: false;
  dryRunAccidentalSideEffectsPrevented: true;
  workQueueLifecycleMutated: false;
  blockingReasons: string[];
};

export async function runDeployNonProductionRealTargetDryRun(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  approvals?: OperatorApprovalRecord[];
  targetEnvironment?: "staging" | "local_mock" | "production" | null;
  env?: NodeJS.ProcessEnv;
}): Promise<DeployNonProductionRealTargetDryRunProof> {
  const approval = enforceRuntimeApproval({
    authorityOrAction: "deploy_dry_run",
    requestedScope: "authority:deploy_dry_run:non_production",
    approvals: input.approvals,
    now: new Date("2026-05-03T23:00:00.000Z"),
  });
  const result = await runDeployNonProductionDryRunPilot({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    targetEnvironment: input.targetEnvironment,
    env: input.env,
  });
  const authority = decideAuthorityEscalation({
    requestedAuthority: "deploy_dry_run",
    approvalRefs: approval.approvalId ? [`approval:${approval.approvalId}`] : [],
    rollbackPlanRef: result.rollbackPlanPresent ? "artifact:deploy-rollback-plan" : null,
    reviewRef: result.preflightRecorded ? "artifact:deploy-dry-run-review" : null,
    auditArtifactRefs: ["artifact:deploy-dry-run-audit"],
  });
  const proof: DeployNonProductionRealTargetDryRunProof = {
    artifactKind: "deploy_non_production_real_target_dry_run_proof",
    runtimeJobId: input.runtimeJobId,
    approvalStatus: approval.status,
    targetStatus: result.status,
    preflightOnly: true,
    rollbackPlanPresent: result.rollbackPlanPresent,
    healthChecksPresent: result.healthChecksPresent,
    productionDeployPerformed: false,
    dryRunAccidentalSideEffectsPrevented: true,
    workQueueLifecycleMutated: false,
    blockingReasons: [...new Set([...authority.reasonCodes, ...result.blockingReasons])].toSorted(),
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.deploy_non_production_real_target_dry_run",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/deploy/non-production-real-target-dry-run`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
