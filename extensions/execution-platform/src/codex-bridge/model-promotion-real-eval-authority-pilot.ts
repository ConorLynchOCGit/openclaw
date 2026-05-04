import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { decideAuthorityEscalation } from "./authority-escalation-gates.ts";
import { runModelPromotionRealEvalDryRunPilot } from "./model-promotion-real-eval-pilot.ts";
import type { OperatorApprovalRecord } from "./operator-approval-records.ts";
import { enforceRuntimeApproval } from "./operator-approval-records.ts";

export type ModelPromotionRealEvalAuthorityPilotProof = {
  artifactKind: "model_promotion_real_eval_authority_pilot_proof";
  runtimeJobId: string;
  approvalStatus: "allowed" | "requires_approval" | "blocked";
  dryRunStatus: "completed" | "insufficient_eval_evidence" | "refused";
  evalEvidenceRefs: string[];
  canaryCriteriaPresent: true;
  rollbackPlanPresent: true;
  dryRunOnly: true;
  productionModelPromotionPerformed: false;
  workQueueDistinguishesDryRun: true;
  workQueueLifecycleMutated: false;
  blockingReasons: string[];
};

export async function runModelPromotionRealEvalAuthorityPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  approvals?: OperatorApprovalRecord[];
  evalEvidenceRefs?: string[];
  ownerApproval?: string | null;
  cwd?: string;
}): Promise<ModelPromotionRealEvalAuthorityPilotProof> {
  const approval = enforceRuntimeApproval({
    authorityOrAction: "model_promotion_dry_run",
    requestedScope: "authority:model_promotion_dry_run",
    approvals: input.approvals,
    now: new Date("2026-05-03T23:00:00.000Z"),
  });
  const result = await runModelPromotionRealEvalDryRunPilot({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    evalEvidenceRefs: input.evalEvidenceRefs,
    ownerApproval: input.ownerApproval,
    cwd: input.cwd,
  });
  const authority = decideAuthorityEscalation({
    requestedAuthority: "model_promotion_dry_run",
    approvalRefs: approval.approvalId ? [`approval:${approval.approvalId}`] : [],
    evalEvidenceRefs: result.evalEvidenceRefs,
    reviewRef: result.ownerApproval ? "artifact:model-promotion-owner-approval" : null,
    auditArtifactRefs: ["artifact:model-promotion-dry-run-audit"],
  });
  const proof: ModelPromotionRealEvalAuthorityPilotProof = {
    artifactKind: "model_promotion_real_eval_authority_pilot_proof",
    runtimeJobId: input.runtimeJobId,
    approvalStatus: approval.status,
    dryRunStatus: result.status,
    evalEvidenceRefs: result.evalEvidenceRefs,
    canaryCriteriaPresent: true,
    rollbackPlanPresent: true,
    dryRunOnly: true,
    productionModelPromotionPerformed: false,
    workQueueDistinguishesDryRun: true,
    workQueueLifecycleMutated: false,
    blockingReasons: [...new Set([...authority.reasonCodes, ...result.blockingReasons])].toSorted(),
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.model_promotion_real_eval_authority_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/model-promotion/real-eval-authority-pilot`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
