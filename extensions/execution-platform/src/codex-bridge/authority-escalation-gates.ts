export type RuntimeAuthorityKind =
  | "local_yolo"
  | "rebuild"
  | "install_dependency"
  | "outbound_network"
  | "deploy_dry_run"
  | "model_promotion_dry_run";

export type AuthorityEscalationDecision = {
  artifactKind: "authority_escalation_decision";
  requestedAuthority: RuntimeAuthorityKind;
  currentAuthorities: RuntimeAuthorityKind[];
  decision: "allowed" | "blocked" | "requires_approval";
  reasonCodes: string[];
  approvalRefs: string[];
  auditArtifactRefs: string[];
  reviewRequired: boolean;
  rollbackPlanRequired: boolean;
  noHiddenEscalation: true;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function decideAuthorityEscalation(input: {
  requestedAuthority: RuntimeAuthorityKind;
  currentAuthorities?: RuntimeAuthorityKind[];
  approvalRefs?: string[];
  profileRefs?: string[];
  rollbackPlanRef?: string | null;
  reviewRef?: string | null;
  auditArtifactRefs?: string[];
  targetConfigured?: boolean;
  evalEvidenceRefs?: string[];
}): AuthorityEscalationDecision {
  const currentAuthorities = input.currentAuthorities ?? [];
  const approvalRefs = input.approvalRefs ?? [];
  const auditArtifactRefs = input.auditArtifactRefs ?? [];
  const reasonCodes: string[] = [];
  let decision: AuthorityEscalationDecision["decision"] = "allowed";

  if (currentAuthorities.includes(input.requestedAuthority)) {
    reasonCodes.push("authority_already_granted");
  }

  if (input.requestedAuthority !== "local_yolo" && approvalRefs.length === 0) {
    reasonCodes.push("operator_approval_required");
  }
  if (input.requestedAuthority === "rebuild" && !(input.profileRefs ?? []).includes("rebuild-v2")) {
    reasonCodes.push("rebuild_profile_required");
  }
  if (
    input.requestedAuthority === "install_dependency" &&
    !(input.profileRefs ?? []).includes("install-dependency")
  ) {
    reasonCodes.push("install_dependency_profile_required");
  }
  if (input.requestedAuthority === "outbound_network" && input.targetConfigured !== true) {
    reasonCodes.push("outbound_allowlist_target_required");
  }
  if (input.requestedAuthority === "deploy_dry_run" && !input.rollbackPlanRef) {
    reasonCodes.push("deploy_rollback_plan_required");
  }
  if (
    input.requestedAuthority === "model_promotion_dry_run" &&
    (input.evalEvidenceRefs ?? []).length === 0
  ) {
    reasonCodes.push("model_eval_evidence_required");
  }
  if (
    ["install_dependency", "deploy_dry_run", "model_promotion_dry_run"].includes(
      input.requestedAuthority,
    )
  ) {
    if (!input.reviewRef) {
      reasonCodes.push("review_required");
    }
  }

  if (reasonCodes.some((reason) => reason.endsWith("_required"))) {
    decision = approvalRefs.length > 0 ? "blocked" : "requires_approval";
  }
  if (input.requestedAuthority === "local_yolo" && reasonCodes.length === 0) {
    decision = "allowed";
  }

  return {
    artifactKind: "authority_escalation_decision",
    requestedAuthority: input.requestedAuthority,
    currentAuthorities,
    decision,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    approvalRefs,
    auditArtifactRefs,
    reviewRequired: input.requestedAuthority !== "local_yolo",
    rollbackPlanRequired: ["install_dependency", "deploy_dry_run"].includes(
      input.requestedAuthority,
    ),
    noHiddenEscalation: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
