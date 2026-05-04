import type {
  AgentTeamRoleQualificationStatus,
  AgentTeamRoleTargetId,
} from "./agent-team-role-evals.ts";
import type { RequestedModelCandidate } from "./model-candidate-validation-plan.ts";

export type ModelRosterRoleId =
  | "orchestrator"
  | "context_scout"
  | "implementation_engineer"
  | "test_engineer"
  | "reviewer"
  | "security_privacy_reviewer"
  | "observability_scribe"
  | "docs_skills_writer";

export type ModelRosterRequestedAuthority =
  | "orchestration"
  | "implementation"
  | "testing"
  | "review"
  | "observe"
  | "final_acceptance"
  | "deploy"
  | "outbound_send"
  | "model_promotion";

export type ModelRosterEnforcementInput = {
  roleId: ModelRosterRoleId;
  requestedModelId: string;
  requestedAuthority: ModelRosterRequestedAuthority;
  candidates: RequestedModelCandidate[];
  roleQualificationStatus?: AgentTeamRoleQualificationStatus;
  roleTargetId?: AgentTeamRoleTargetId;
  evidenceRefs?: string[];
  operatorOverride?: {
    overrideId: string;
    approvedBy: string;
    reason: string;
    evidenceRefs: string[];
  } | null;
  globalReplacementClaimed?: boolean;
};

export type ModelRosterEnforcementDecision = {
  artifactKind: "model_roster_enforcement_decision";
  roleId: ModelRosterRoleId;
  requestedModelId: string;
  requestedAuthority: ModelRosterRequestedAuthority;
  allowed: boolean;
  status: "allowed" | "blocked" | "needs_review";
  reasonCodes: string[];
  candidateId: string | null;
  roleTargetId: AgentTeamRoleTargetId | null;
  operatorOverrideApplied: boolean;
  noGlobalWinner: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

const LOCAL_CODEX_MODELS = new Set(["local-codex-operator-session", "frontier-reviewer-lane"]);

const HIGH_BLAST_RADIUS_AUTHORITIES = new Set<ModelRosterRequestedAuthority>([
  "deploy",
  "outbound_send",
  "model_promotion",
]);

function candidateForModel(
  candidates: RequestedModelCandidate[],
  modelId: string,
): RequestedModelCandidate | null {
  return candidates.find((candidate) => candidate.openRouterModelId === modelId) ?? null;
}

function hasBoundedOverride(input: ModelRosterEnforcementInput): boolean {
  const override = input.operatorOverride;
  return Boolean(
    override?.overrideId.trim() &&
    override.approvedBy.trim() &&
    override.reason.trim() &&
    override.evidenceRefs.length > 0,
  );
}

export function enforceModelRoster(
  input: ModelRosterEnforcementInput,
): ModelRosterEnforcementDecision {
  const reasonCodes: string[] = [];
  const candidate = candidateForModel(input.candidates, input.requestedModelId);
  const overrideApplied = hasBoundedOverride(input);

  if (input.globalReplacementClaimed) {
    reasonCodes.push("global_model_replacement_not_allowed");
  }
  if (HIGH_BLAST_RADIUS_AUTHORITIES.has(input.requestedAuthority)) {
    reasonCodes.push("high_blast_radius_authority_not_allowed_by_model_roster");
  }
  if (LOCAL_CODEX_MODELS.has(input.requestedModelId)) {
    if (
      !(
        (input.roleId === "orchestrator" && input.requestedAuthority === "orchestration") ||
        (input.roleId === "reviewer" && input.requestedAuthority === "review") ||
        input.requestedAuthority === "final_acceptance"
      )
    ) {
      reasonCodes.push("local_codex_role_not_allowed");
    }
  } else if (!candidate) {
    reasonCodes.push("model_candidate_not_found");
  }

  if (candidate?.openRouterModelId === "deepseek/deepseek-v4-pro") {
    if (input.roleQualificationStatus !== "qualified" && !overrideApplied) {
      reasonCodes.push("deepseek_v4_pro_not_role_qualified");
    }
  }
  if (candidate?.openRouterModelId === "deepseek/deepseek-v4-flash") {
    if (input.requestedModelId === "deepseek/deepseek-v4-pro") {
      reasonCodes.push("deepseek_v4_flash_must_not_alias_pro");
    }
    if (!["test_engineer", "context_scout", "observability_scribe"].includes(input.roleId)) {
      reasonCodes.push("deepseek_v4_flash_role_not_allowed");
    }
  }
  if (candidate?.openRouterModelId === "moonshotai/kimi-k2.6") {
    if (!["implementation_engineer", "docs_skills_writer"].includes(input.roleId)) {
      reasonCodes.push("kimi_2_6_role_not_allowed");
    }
  }
  if (input.requestedAuthority === "final_acceptance" && input.roleId !== "orchestrator") {
    reasonCodes.push("assist_role_final_acceptance_not_allowed");
  }
  if (
    input.roleTargetId?.includes("implementation") &&
    input.roleQualificationStatus === "shadow_only" &&
    input.requestedAuthority === "implementation"
  ) {
    reasonCodes.push("shadow_implementation_authority_not_allowed");
  }
  if ((input.evidenceRefs ?? []).length === 0 && !overrideApplied) {
    reasonCodes.push("model_roster_evidence_required");
  }

  const hardBlocked = reasonCodes.some(
    (reason) =>
      reason !== "deepseek_v4_pro_not_role_qualified" &&
      reason !== "model_roster_evidence_required",
  );
  const allowed = reasonCodes.length === 0 || (overrideApplied && !hardBlocked);
  return {
    artifactKind: "model_roster_enforcement_decision",
    roleId: input.roleId,
    requestedModelId: input.requestedModelId,
    requestedAuthority: input.requestedAuthority,
    allowed,
    status: allowed ? "allowed" : hardBlocked ? "blocked" : "needs_review",
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    candidateId: candidate?.candidateId ?? null,
    roleTargetId: input.roleTargetId ?? null,
    operatorOverrideApplied: overrideApplied && allowed,
    noGlobalWinner: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}
