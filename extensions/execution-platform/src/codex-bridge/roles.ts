import {
  type AlternativeModelCandidate,
  type AlternativeModelEligibility,
  type FutureSubagentRoleContract,
  type ModelLanePolicy,
  type ModelLaneId,
} from "./types.ts";

export const REQUIRED_LIVE_EXECUTION_SKILL_DOCS = [
  "openclaw-engineering-standards",
  "repo-boundary-and-path-awareness",
  "tailscale-safe-ui-bridge",
  "deterministic-vs-model-judgment-guardrail",
  "prohibited-semantic-drift-guardrail",
  "execution-platform-runtime-truth",
  "work-queue-lifecycle-semantics",
  "rebuild-and-container-recovery",
  "codex-bailout-protocol",
  "validation-and-proof-policy",
  "artifact-and-stream-capture-policy",
  "orchestrator-role-contract",
  "implementer-role-contract",
  "tester-role-contract",
  "reviewer-role-contract",
  "bailout-role-contract",
  "docs-skills-writer-role-contract",
] as const;

export const MODEL_LANE_POLICIES: ModelLanePolicy[] = [
  {
    laneId: "frontier_orchestrator",
    description: "High-authority orchestration, decomposition, and final tradeoff calls.",
    allowedFamilies: ["Frontier GPT"],
    liveAuthorityAllowed: false,
    frontierGptRequired: true,
    promotionRequired: true,
  },
  {
    laneId: "strong_coding",
    description: "High-quality implementation and rebuild bailout work.",
    allowedFamilies: ["Frontier GPT"],
    liveAuthorityAllowed: false,
    frontierGptRequired: true,
    promotionRequired: true,
  },
  {
    laneId: "mini_worker_shadow",
    description: "Lower-authority drafting, summarization, and bounded test support.",
    allowedFamilies: ["GPT mini/nano lanes"],
    liveAuthorityAllowed: false,
    frontierGptRequired: false,
    promotionRequired: true,
  },
  {
    laneId: "nano_classifier_shadow",
    description: "Cheap classification and routing support with no write authority.",
    allowedFamilies: ["GPT mini/nano lanes"],
    liveAuthorityAllowed: false,
    frontierGptRequired: false,
    promotionRequired: true,
  },
  {
    laneId: "alternative_shadow_eval",
    description: "DeepSeek/Qwen/MiniMax/OpenRouter qualitative shadow evaluation.",
    allowedFamilies: ["DeepSeek", "Qwen", "MiniMax", "OpenRouter-hosted candidates"],
    liveAuthorityAllowed: false,
    frontierGptRequired: false,
    promotionRequired: true,
  },
  {
    laneId: "soak_flood_candidate",
    description: "Manufactured high-volume role fixtures for fast model invalidation.",
    allowedFamilies: ["DeepSeek", "Qwen", "MiniMax", "OpenRouter-hosted candidates"],
    liveAuthorityAllowed: false,
    frontierGptRequired: false,
    promotionRequired: true,
  },
];

const COMMON_PROHIBITED_ACTIONS = [
  "live execution before role docs and skills are accepted",
  "provider calls during proof harness",
  "shell execution from job payload",
  "bypassing runtime job truth",
  "treating process exit as task success",
];

function role(input: Omit<FutureSubagentRoleContract, "liveAuthorityGranted">) {
  return {
    ...input,
    liveAuthorityGranted: false,
  } satisfies FutureSubagentRoleContract;
}

export const FUTURE_SUBAGENT_ROLE_CONTRACTS: FutureSubagentRoleContract[] = [
  role({
    roleId: "orchestrator",
    title: "Orchestrator",
    authorityLevel: "draft_only",
    expectedModelLane: "frontier_orchestrator",
    inputs: ["user objective", "Work Queue truth", "runtime diagnostics", "role outputs"],
    outputs: ["execution plan", "delegation graph", "final acceptance decision"],
    requiredSkills: [
      "openclaw-engineering-standards",
      "execution-platform-runtime-truth",
      "work-queue-lifecycle-semantics",
    ],
    validationDuties: ["verify scope", "sequence workers", "require proof artifacts"],
    escalationTriggers: ["ambiguous authority", "destructive change", "failed validation"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "architect_spec_writer",
    title: "Architect / Spec Writer",
    authorityLevel: "draft_only",
    expectedModelLane: "frontier_orchestrator",
    inputs: ["objective", "existing docs", "repo structure"],
    outputs: ["technical spec", "interface contract", "risk register"],
    requiredSkills: ["openclaw-engineering-standards", "repo-boundary-and-path-awareness"],
    validationDuties: ["keep specs grounded in repo patterns", "identify non-goals"],
    escalationTriggers: ["architecture decision without source evidence"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "implementation_engineer",
    title: "Implementation Engineer",
    authorityLevel: "patch_proposal",
    expectedModelLane: "strong_coding",
    inputs: ["approved plan", "owned file scope", "validation commands"],
    outputs: ["patch", "implementation notes", "validation output"],
    requiredSkills: ["openclaw-engineering-standards", "repo-boundary-and-path-awareness"],
    validationDuties: ["run focused tests", "avoid unrelated refactors"],
    escalationTriggers: ["dirty conflicting files", "missing test harness"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "test_engineer",
    title: "Test Engineer",
    authorityLevel: "patch_proposal",
    expectedModelLane: "alternative_shadow_eval",
    inputs: ["feature contract", "risk list", "existing tests"],
    outputs: ["focused tests", "coverage notes", "edge-case matrix"],
    requiredSkills: ["validation-and-proof-policy", "repo-boundary-and-path-awareness"],
    validationDuties: ["prove deterministic behavior", "avoid brittle sleeps"],
    escalationTriggers: ["untestable behavior", "missing fixtures"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "reviewer",
    title: "Reviewer",
    authorityLevel: "review_only",
    expectedModelLane: "frontier_orchestrator",
    inputs: ["patch", "tests", "docs", "runtime evidence"],
    outputs: ["findings", "risk calls", "accept/revise recommendation"],
    requiredSkills: ["openclaw-engineering-standards", "validation-and-proof-policy"],
    validationDuties: ["prioritize defects", "identify missing proof"],
    escalationTriggers: ["security risk", "runtime truth bypass"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "refactor_engineer",
    title: "Refactor Engineer",
    authorityLevel: "patch_proposal",
    expectedModelLane: "strong_coding",
    inputs: ["approved refactor scope", "tests", "ownership boundary"],
    outputs: ["small refactor patch", "behavior-preservation evidence"],
    requiredSkills: ["openclaw-engineering-standards", "repo-boundary-and-path-awareness"],
    validationDuties: ["prove no behavior drift", "keep API compatibility"],
    escalationTriggers: ["scope creep", "unclear ownership"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "rebuild_bailout_engineer",
    title: "Rebuild / Bailout Engineer",
    authorityLevel: "draft_only",
    expectedModelLane: "strong_coding",
    inputs: ["failure logs", "rebuild evidence", "original objective"],
    outputs: ["bailout diagnosis", "bounded patch proposal", "retry plan"],
    requiredSkills: ["rebuild-and-container-recovery", "codex-bailout-protocol"],
    validationDuties: ["preserve supervisor continuity", "bound retries"],
    escalationTriggers: ["rebuild loop", "unsafe command request"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "observability_scribe",
    title: "Observability Scribe",
    authorityLevel: "observe_only",
    expectedModelLane: "mini_worker_shadow",
    inputs: ["stream events", "runtime diagnostics", "artifacts"],
    outputs: ["timeline summary", "evidence map", "handoff notes"],
    requiredSkills: ["artifact-and-stream-capture-policy", "execution-platform-runtime-truth"],
    validationDuties: ["keep summaries bounded", "redact secrets"],
    escalationTriggers: ["secret-looking payload", "missing event sequence"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "docs_skills_writer",
    title: "Docs / Skills Writer",
    authorityLevel: "draft_only",
    expectedModelLane: "alternative_shadow_eval",
    inputs: ["accepted design", "role contract", "examples"],
    outputs: ["skill draft", "role doc", "eval checklist"],
    requiredSkills: ["openclaw-engineering-standards", "artifact-and-stream-capture-policy"],
    validationDuties: ["write clear triggers", "include safety boundaries"],
    escalationTriggers: ["unclear activation boundary"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
  role({
    roleId: "guardrail_auditor",
    title: "Guardrail Auditor",
    authorityLevel: "review_only",
    expectedModelLane: "nano_classifier_shadow",
    inputs: ["prompt", "stream", "patch", "role output"],
    outputs: ["guardrail findings", "escalation recommendation"],
    requiredSkills: [
      "deterministic-vs-model-judgment-guardrail",
      "prohibited-semantic-drift-guardrail",
    ],
    validationDuties: ["flag prohibited drift", "avoid semantic judgment as deterministic truth"],
    escalationTriggers: ["policy uncertainty", "model confidence without evidence"],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
  }),
];

export function listFutureSubagentRoleContracts(): FutureSubagentRoleContract[] {
  return FUTURE_SUBAGENT_ROLE_CONTRACTS.map((contract) => ({
    ...contract,
    inputs: [...contract.inputs],
    outputs: [...contract.outputs],
    requiredSkills: [...contract.requiredSkills],
    validationDuties: [...contract.validationDuties],
    escalationTriggers: [...contract.escalationTriggers],
    prohibitedActions: [...contract.prohibitedActions],
  }));
}

export function listModelLanePolicies(): ModelLanePolicy[] {
  return MODEL_LANE_POLICIES.map((policy) => ({
    ...policy,
    allowedFamilies: [...policy.allowedFamilies],
  }));
}

export function getModelLanePolicy(laneId: ModelLaneId): ModelLanePolicy {
  const policy = MODEL_LANE_POLICIES.find((candidate) => candidate.laneId === laneId);
  if (!policy) {
    throw new Error(`unknown model lane: ${laneId}`);
  }
  return {
    ...policy,
    allowedFamilies: [...policy.allowedFamilies],
  };
}

export function validateAlternativeModelCandidateForRole(
  candidate: AlternativeModelCandidate,
): AlternativeModelEligibility {
  const role = FUTURE_SUBAGENT_ROLE_CONTRACTS.find(
    (contract) => contract.roleId === candidate.targetRoleId,
  );
  if (!role) {
    return {
      eligible: false,
      mode: "shadow_eval_only",
      reasons: ["unknown_role"],
    };
  }
  const lane = getModelLanePolicy(role.expectedModelLane);
  const reasons: string[] = [];
  if (lane.frontierGptRequired) {
    reasons.push("role_requires_frontier_gpt_lane");
  }
  if (!lane.allowedFamilies.includes(candidate.family)) {
    reasons.push("candidate_family_not_allowed_for_lane");
  }
  if (candidate.promotedForRole) {
    return {
      eligible: reasons.length === 0,
      mode: "promoted_for_role",
      reasons,
    };
  }
  return {
    eligible: reasons.length === 0,
    mode:
      role.expectedModelLane === "soak_flood_candidate" ? "soak_flood_only" : "shadow_eval_only",
    reasons,
  };
}
