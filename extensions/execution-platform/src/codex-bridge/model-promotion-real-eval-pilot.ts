import { access } from "node:fs/promises";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createModelPromotionAuthorityProfile,
  recordModelPromotionDryRunDecision,
} from "./model-promotion-authority-profile.ts";

export type ModelPromotionRealEvalDryRunPilotResult = {
  artifactKind: "codex_bridge_model_promotion_real_eval_dry_run_pilot";
  status: "completed" | "insufficient_eval_evidence" | "refused";
  evalEvidenceRefs: string[];
  realEvalEvidenceUsed: boolean;
  ownerApproval: string | null;
  productionPromotionPerformed: false;
  blockingReasons: string[];
};

async function existingRefs(refs: string[], cwd: string): Promise<string[]> {
  const existing: string[] = [];
  for (const ref of refs) {
    if (ref.startsWith("runtime-job://")) {
      existing.push(ref);
      continue;
    }
    await access(`${cwd}/${ref}`)
      .then(() => existing.push(ref))
      .catch(() => undefined);
  }
  return existing;
}

export async function runModelPromotionRealEvalDryRunPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  cwd?: string;
  evalEvidenceRefs?: string[];
  ownerApproval?: string | null;
}): Promise<ModelPromotionRealEvalDryRunPilotResult> {
  const cwd = input.cwd ?? "/root/services/openclaw-roles/live";
  const candidates = input.evalEvidenceRefs ?? [
    ".artifacts/execution-platform/full-production-yolo-pilot-proof-summary.json",
    ".artifacts/execution-platform/productionization-10-step-summary.json",
  ];
  const refs = await existingRefs(candidates, cwd);
  const decision = await recordModelPromotionDryRunDecision({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile: createModelPromotionAuthorityProfile({
      profileId: "model-promotion-real-eval-dry-run",
    }),
    candidateModelId: "candidate-executor-model",
    baselineModelId: "local-codex-baseline",
    evalEvidenceRefs: refs.length > 0 ? refs : ["insufficient-local-eval-placeholder"],
    canaryCriteria: ["validation pass rate >= baseline", "no authority violations"],
    ownerApproval: input.ownerApproval ?? "operator-dry-run-approval",
    rollbackPlan: "retain baseline model route; do not promote production model",
  });
  const result: ModelPromotionRealEvalDryRunPilotResult = {
    artifactKind: "codex_bridge_model_promotion_real_eval_dry_run_pilot",
    status:
      decision.status === "refused"
        ? "refused"
        : refs.length > 0
          ? "completed"
          : "insufficient_eval_evidence",
    evalEvidenceRefs: decision.evalEvidenceRefs,
    realEvalEvidenceUsed: refs.length > 0,
    ownerApproval: decision.ownerApproval,
    productionPromotionPerformed: false,
    blockingReasons: refs.length > 0 ? decision.blockingReasons : ["real_eval_evidence_missing"],
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.model_promotion_real_eval_dry_run_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/model-promotion/real-eval-dry-run`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
