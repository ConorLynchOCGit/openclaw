import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { decideAuthorityEscalation } from "./authority-escalation-gates.ts";
import {
  runInstallDependencyDryRunPilot,
  runInstallDependencyRealPilot,
  type InstallDependencyRealPilotResult,
} from "./install-dependency-pilots.ts";
import type { OperatorApprovalRecord } from "./operator-approval-records.ts";
import { enforceRuntimeApproval } from "./operator-approval-records.ts";

export type InstallDependencyRealAuthorityPilotProof = {
  artifactKind: "install_dependency_real_authority_pilot_proof";
  runtimeJobId: string;
  approvalStatus: "allowed" | "requires_approval" | "blocked";
  dryRunProofPresent: boolean;
  commandAllowlisted: boolean;
  lockfileDiffSummary: string;
  rollbackPlan: string;
  reviewArtifactPresent: boolean;
  validationStatus: "passed" | "needs_review" | "blocked";
  realPilot: InstallDependencyRealPilotResult;
  productionDependencyMutationPerformed: boolean;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export async function runInstallDependencyRealAuthorityPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  approvals?: OperatorApprovalRecord[];
  approveProductionDependencyMutation?: boolean;
}): Promise<InstallDependencyRealAuthorityPilotProof> {
  const approval = enforceRuntimeApproval({
    authorityOrAction: "high_blast_radius_authority",
    requestedScope: "authority:install_dependency",
    approvals: input.approvals,
    now: new Date("2026-05-03T23:00:00.000Z"),
  });
  const dryRun = await runInstallDependencyDryRunPilot({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    proposedChange: "controlled fixture package metadata normalization",
  });
  const authority = decideAuthorityEscalation({
    requestedAuthority: "install_dependency",
    approvalRefs: approval.approvalId ? [`approval:${approval.approvalId}`] : [],
    profileRefs: ["install-dependency"],
    rollbackPlanRef: "artifact:install-dependency-rollback-plan",
    reviewRef: "artifact:install-dependency-review",
    auditArtifactRefs: ["artifact:install-dependency-dry-run"],
  });
  const realPilot = await runInstallDependencyRealPilot({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    dryRun,
    approveProductionDependencyMutation:
      approval.allowed &&
      authority.decision === "allowed" &&
      input.approveProductionDependencyMutation,
  });
  const proof: InstallDependencyRealAuthorityPilotProof = {
    artifactKind: "install_dependency_real_authority_pilot_proof",
    runtimeJobId: input.runtimeJobId,
    approvalStatus: approval.status,
    dryRunProofPresent: dryRun.status === "completed",
    commandAllowlisted: dryRun.blockingReasons.length === 0,
    lockfileDiffSummary: realPilot.lockfileMutated
      ? "bounded lockfile diff captured"
      : "no production lockfile mutation; controlled fixture proof only",
    rollbackPlan: realPilot.rollbackPlan,
    reviewArtifactPresent: true,
    validationStatus:
      realPilot.status === "refused"
        ? "blocked"
        : realPilot.productionDependencyMutationPerformed
          ? "passed"
          : "needs_review",
    realPilot,
    productionDependencyMutationPerformed: realPilot.productionDependencyMutationPerformed,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.install_dependency_real_authority_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/install-dependency/real-authority-pilot`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
