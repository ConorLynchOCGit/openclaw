import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createModelPromotionAuthorityProfile,
  recordModelPromotionDryRunDecision,
  type ModelPromotionAuthorityProfile,
} from "./model-promotion-authority-profile.ts";

export type ModelPromotionDryRunPilotResult = {
  artifactKind: "codex_bridge_model_promotion_dry_run_pilot";
  profileId: string;
  status: "completed" | "refused";
  evalEvidenceRefs: string[];
  productionPromotionPerformed: false;
  silentPromotionPerformed: false;
  blockingReasons: string[];
  limitation: string | null;
};

export async function runModelPromotionDryRunPilot(
  input: {
    runtimeJobs?: RuntimeJobRepository;
    runtimeJobId?: string;
    profile?: ModelPromotionAuthorityProfile;
    evalEvidenceRefs?: string[];
  } = {},
): Promise<ModelPromotionDryRunPilotResult> {
  const profile = input.profile ?? createModelPromotionAuthorityProfile();
  const evalEvidenceRefs =
    input.evalEvidenceRefs && input.evalEvidenceRefs.length > 0
      ? input.evalEvidenceRefs
      : [".artifacts/execution-platform/full-production-yolo-pilot-proof-summary.json"];
  const decision = await recordModelPromotionDryRunDecision({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile,
    candidateModelId: "candidate-local-evaluator",
    baselineModelId: "baseline-local-evaluator",
    evalEvidenceRefs,
    canaryCriteria: ["quality >= baseline", "no regression on execution-platform proofs"],
    ownerApproval: "operator",
    rollbackPlan: "restore baseline model route",
  });
  const result: ModelPromotionDryRunPilotResult = {
    artifactKind: "codex_bridge_model_promotion_dry_run_pilot",
    profileId: profile.profileId,
    status: decision.status === "dry_run_review_recorded" ? "completed" : "refused",
    evalEvidenceRefs,
    productionPromotionPerformed: false,
    silentPromotionPerformed: false,
    blockingReasons: decision.blockingReasons,
    limitation: evalEvidenceRefs[0]?.includes("placeholder")
      ? "placeholder evidence is insufficient for production promotion"
      : null,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.model_promotion_dry_run_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/model-promotion/dry-run`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
