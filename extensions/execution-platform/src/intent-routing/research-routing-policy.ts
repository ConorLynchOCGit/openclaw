import type { StructuredIntentRouterOutput } from "./intent-router-schema.ts";

export type ResearchRoutingDisposition =
  | "mandatory"
  | "optional"
  | "blocked"
  | "clarification_required"
  | "not_needed";

export type ResearchRoutingPolicyResult = {
  artifactKind: "execution_research_routing_policy_result";
  disposition: ResearchRoutingDisposition;
  reasonCodes: string[];
  childWorkflowId: "single_agent.web_research" | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

const explicitResearchPattern =
  /\b(research|search|browse|verify|look up|lookup|find current|current docs|latest docs)\b/iu;
const unstableFactPattern =
  /\b(latest|current|recent|today|pricing|prices|schedule|law|regulation|security advisory|api docs|provider|model availability|browser support)\b/iu;
const optionalPlanningPattern =
  /\b(plan|architecture|architect|spec|design|new build|implementation plan)\b/iu;
const blockedPattern =
  /\b(send|post|publish|buy|purchase|scrape and store|store full|raw page|raw transcript|secret|credential)\b/iu;
const broadPattern = /\b(best|current)\b/iu;

export function evaluateResearchRoutingPolicy(input: {
  objectiveSummary: string;
  workflowId?: string | null;
  requestedAuthority?: string | null;
  sideEffectClass?: string | null;
}): ResearchRoutingPolicyResult {
  const text = input.objectiveSummary.toLowerCase();
  const reasonCodes: string[] = [];
  if (blockedPattern.test(text) || input.sideEffectClass === "production_side_effect") {
    reasonCodes.push("research_blocked_side_effect_or_raw_storage");
    return result("blocked");
  }
  if (
    input.requestedAuthority &&
    !["read_only", "outbound_readonly", "local_yolo"].includes(input.requestedAuthority)
  ) {
    reasonCodes.push("research_blocked_authority_not_read_only");
    return result("blocked");
  }
  if (explicitResearchPattern.test(text) || unstableFactPattern.test(text)) {
    const hasSpecificTarget =
      /\b(openai|supabase|browser|api|provider|model|pricing|docs|documentation|security)\b/iu.test(
        text,
      );
    if (broadPattern.test(text) && !hasSpecificTarget) {
      reasonCodes.push("research_target_ambiguous");
      return result("clarification_required");
    }
    reasonCodes.push(
      explicitResearchPattern.test(text)
        ? "research_explicitly_requested"
        : "research_required_for_unstable_current_fact",
    );
    return result("mandatory");
  }
  if (
    optionalPlanningPattern.test(text) ||
    input.workflowId === "agent_team.architecture" ||
    input.workflowId === "workflow.docs_skills"
  ) {
    reasonCodes.push("research_optional_for_planning_or_docs");
    return result("optional");
  }
  reasonCodes.push("research_not_needed_for_stable_local_task");
  return result("not_needed");

  function result(disposition: ResearchRoutingDisposition): ResearchRoutingPolicyResult {
    return {
      artifactKind: "execution_research_routing_policy_result",
      disposition,
      reasonCodes: [...new Set(reasonCodes)].slice(0, 20),
      childWorkflowId:
        disposition === "mandatory" || disposition === "optional"
          ? "single_agent.web_research"
          : null,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
}

export function researchPolicyMetadata(decision: StructuredIntentRouterOutput) {
  return evaluateResearchRoutingPolicy({
    objectiveSummary: decision.objectiveSummary,
    workflowId: decision.workflowId,
    requestedAuthority: decision.requestedAuthority,
    sideEffectClass: decision.sideEffectClass,
  });
}
