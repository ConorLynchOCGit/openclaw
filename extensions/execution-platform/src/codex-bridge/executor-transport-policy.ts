import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import type { AcpRuntimeEndpointReadiness } from "./acp-runtime-config.ts";

export type ExecutorTransportKind = "local_codex" | "openrouter_model_lane" | "acp_endpoint";
export type ExecutorTransportPolicyState = "preferred" | "fallback" | "blocked";
export type ExecutorTransportJobType = "executor.codex_bridge" | "executor.agent_team";

export type ExecutorTransportPolicyInput = {
  transportKind: ExecutorTransportKind;
  jobType: ExecutorTransportJobType;
  roleId?: string | null;
  requestedModelId?: string | null;
  acpReadiness?: AcpRuntimeEndpointReadiness | null;
  modelRosterDecision?: ModelRosterEnforcementDecision | null;
  rawPromptStorageRequested?: boolean;
  deployRequested?: boolean;
  outboundRequested?: boolean;
  modelPromotionRequested?: boolean;
};

export type ExecutorTransportPolicyDecision = {
  artifactKind: "executor_transport_policy_decision";
  transportKind: ExecutorTransportKind;
  jobType: ExecutorTransportJobType;
  state: ExecutorTransportPolicyState;
  allowed: boolean;
  preferred: boolean;
  fallbackOnly: boolean;
  requiredReadinessEvidence: string[];
  reasonCodes: string[];
  noGlobalWinner: true;
  rawPromptStored: false;
  rawResponseStored: false;
  deployPerformed: false;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
};

export function decideExecutorTransportPolicy(
  input: ExecutorTransportPolicyInput,
): ExecutorTransportPolicyDecision {
  const reasonCodes: string[] = [];
  const requiredReadinessEvidence: string[] = [];
  let state: ExecutorTransportPolicyState = "preferred";

  if (input.rawPromptStorageRequested) {
    reasonCodes.push("raw_prompt_storage_not_allowed");
  }
  if (input.deployRequested) {
    reasonCodes.push("deploy_authority_not_granted");
  }
  if (input.outboundRequested) {
    reasonCodes.push("outbound_authority_not_granted");
  }
  if (input.modelPromotionRequested) {
    reasonCodes.push("model_promotion_authority_not_granted");
  }

  if (input.transportKind === "acp_endpoint") {
    requiredReadinessEvidence.push("acp_runtime_endpoint_readiness");
    if (!input.acpReadiness?.readyForSupervisorTransport) {
      reasonCodes.push("acp_endpoint_readiness_required");
    }
  }

  if (input.transportKind === "openrouter_model_lane") {
    requiredReadinessEvidence.push("model_roster_enforcement_decision");
    if (!input.modelRosterDecision?.allowed) {
      reasonCodes.push("qualified_model_roster_decision_required");
    }
    if (input.requestedModelId === "deepseek/deepseek-v4-pro" && input.roleId !== "test_engineer") {
      reasonCodes.push("v4_pro_only_allowed_for_test_engineer");
    }
  }

  if (input.transportKind === "local_codex" && input.jobType !== "executor.codex_bridge") {
    state = "fallback";
  }

  const allowed = reasonCodes.length === 0;
  if (!allowed) {
    state = "blocked";
  }

  return {
    artifactKind: "executor_transport_policy_decision",
    transportKind: input.transportKind,
    jobType: input.jobType,
    state,
    allowed,
    preferred: state === "preferred",
    fallbackOnly: state === "fallback",
    requiredReadinessEvidence,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    noGlobalWinner: true,
    rawPromptStored: false,
    rawResponseStored: false,
    deployPerformed: false,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
  };
}
