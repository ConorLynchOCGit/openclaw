export type ProductionDefaultAuthorityStatus =
  | "default_enabled"
  | "approval_required"
  | "locked"
  | "suspended";

export type ProductionDefaultEnablementDecision = {
  artifactKind: "execution_production_default_enablement_decision";
  workflowId: string | null;
  authorityProfile: string | null;
  status: ProductionDefaultAuthorityStatus;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type ProductionAuthorityRuntimeState = {
  state: ProductionDefaultAuthorityStatus;
  configuredScope: string[];
  auditRefs: string[];
  killSwitchActive?: boolean;
};

const defaultEnabledWorkflows = new Set([
  "agent_team.coding",
  "single_agent.web_research",
  "agent_team.architecture",
  "workflow.docs_skills",
]);
const defaultEnabledAuthorities = new Set([
  "read_only",
  "local_yolo",
  "rebuild",
  "outbound_readonly",
]);
const approvalRequiredAuthorities = new Set([
  "install_dependency",
  "deploy_dry_run",
  "model_promotion_dry_run",
  "security_override",
  "model_roster_change",
  "high_risk_redirect",
  "supervisor_service_mode",
]);
const lockedAuthorities = new Set([
  "deploy_production",
  "production_deploy",
  "external_outbound_write",
  "production_model_promotion",
  "raw_prompt_response_storage",
  "unbounded_crawling",
]);

export function decideProductionDefaultEnablement(input: {
  workflowId?: string | null;
  authorityProfile?: string | null;
  sideEffectClass?: string | null;
  productionAuthorityStates?: Partial<
    Record<
      "production_deploy" | "external_outbound_write" | "production_model_promotion",
      ProductionAuthorityRuntimeState
    >
  >;
}): ProductionDefaultEnablementDecision {
  const workflowId = input.workflowId ?? null;
  const authorityProfile = input.authorityProfile ?? null;
  const reasonCodes: string[] = [];
  const productionState = productionAuthorityState(authorityProfile);
  if (productionState) {
    if (productionState.killSwitchActive) {
      reasonCodes.push("production_authority_kill_switch_active");
      return decision("suspended");
    }
    if (productionState.state === "default_enabled") {
      reasonCodes.push("production_authority_default_enabled_by_runtime_unlock");
      return decision("default_enabled");
    }
    reasonCodes.push("production_authority_not_default_enabled");
    return decision(productionState.state);
  }
  if (
    lockedAuthorities.has(authorityProfile ?? "") ||
    input.sideEffectClass === "production_side_effect"
  ) {
    reasonCodes.push("production_default_locked_authority");
    return decision("locked");
  }
  if (approvalRequiredAuthorities.has(authorityProfile ?? "")) {
    reasonCodes.push("production_default_requires_approval");
    return decision("approval_required");
  }
  if (!workflowId || !defaultEnabledWorkflows.has(workflowId)) {
    reasonCodes.push("workflow_not_default_enabled");
    return decision("approval_required");
  }
  if (!defaultEnabledAuthorities.has(authorityProfile ?? "read_only")) {
    reasonCodes.push("authority_not_default_enabled");
    return decision("approval_required");
  }
  if (workflowId === "single_agent.web_research" && authorityProfile !== "outbound_readonly") {
    reasonCodes.push("web_research_requires_outbound_readonly_default_scope");
    return decision("approval_required");
  }
  reasonCodes.push("workflow_and_authority_default_enabled");
  return decision("default_enabled");

  function decision(status: ProductionDefaultAuthorityStatus): ProductionDefaultEnablementDecision {
    return {
      artifactKind: "execution_production_default_enablement_decision",
      workflowId,
      authorityProfile,
      status,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  function productionAuthorityState(
    authority: string | null,
  ): ProductionAuthorityRuntimeState | null {
    if (authority === "production_deploy" || authority === "deploy_production") {
      return input.productionAuthorityStates?.production_deploy ?? null;
    }
    if (authority === "external_outbound_write") {
      return input.productionAuthorityStates?.external_outbound_write ?? null;
    }
    if (authority === "production_model_promotion") {
      return input.productionAuthorityStates?.production_model_promotion ?? null;
    }
    return null;
  }
}
