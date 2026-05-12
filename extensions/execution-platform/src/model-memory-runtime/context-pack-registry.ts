import { MODEL_MEMORY_RUNTIME_WIRING_VERSION } from "./types.ts";

export type CanonicalContextPackKind =
  | "retrieval_pack"
  | "projection_pack"
  | "stable_memory_pack"
  | "tool_result_summary_pack"
  | "closeout_capsule_pack"
  | "workflow_runtime_state_pack"
  | "work_queue_readback_pack"
  | "skill_context_pack";

export type ContextPackRouteEligibility =
  | "protocol"
  | "triage"
  | "chat_send"
  | "status"
  | "advanced_intent_front_door"
  | "workflow_execution"
  | "clarification"
  | "control";

export type ContextPackWorkflowEligibility =
  | "ordinary_chat"
  | "agent_team.coding"
  | "single_agent.web_research"
  | "workflow.docs_skills"
  | "agent_team.qa_test"
  | "agent_team.architecture"
  | "work_queue.readback"
  | "closeout.proactivity";

export type CanonicalContextPackDefinition = {
  packId: string;
  kind: CanonicalContextPackKind;
  source: string;
  owner: "model-memory" | "execution-platform" | "work-queue" | "workflow-runtime";
  routeEligibility: ContextPackRouteEligibility[];
  workflowEligibility: ContextPackWorkflowEligibility[];
  insertionPoint:
    | "after_chat_lane_allowed"
    | "advanced_front_door_context"
    | "worker_supervisor_context"
    | "work_queue_readback"
    | "closeout_capsule_synthesis";
  maxTokens: number;
  freshnessRule: "current_turn_only" | "fresh_runtime_ref" | "active_memory_only" | "not_stale";
  duplicateSuppressionKey: "ref" | "source_hash" | "runtime_job_ref" | "capsule_hash";
  qualityEvalRequirement:
    | "capture_recall_followup"
    | "workflow_output_improvement"
    | "source_ref_relevance"
    | "owner_readback_usefulness"
    | "skill_usage_relevance";
  failureBehavior: "skip_pack" | "trim_pack" | "needs_review";
  rawStorageAllowed: false;
  grantsAuthority: false;
  grantsRuntimeSuccess: false;
  mutatesWorkQueueLifecycle: false;
};

export type ContextPackRegistryProof = {
  artifactKind: "context_pack_registry_proof";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "passed" | "failed";
  totalPacks: number;
  packIds: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
};

const CHAT_ROUTES: ContextPackRouteEligibility[] = ["chat_send", "status"];
const ADVANCED_ROUTES: ContextPackRouteEligibility[] = [
  "advanced_intent_front_door",
  "workflow_execution",
  "clarification",
];

export const CANONICAL_CONTEXT_PACK_REGISTRY: CanonicalContextPackDefinition[] = [
  {
    packId: "context-pack.retrieval.v1",
    kind: "retrieval_pack",
    source: "hybrid_retrieval_runtime",
    owner: "model-memory",
    routeEligibility: [...CHAT_ROUTES, ...ADVANCED_ROUTES],
    workflowEligibility: [
      "ordinary_chat",
      "agent_team.coding",
      "single_agent.web_research",
      "workflow.docs_skills",
      "agent_team.qa_test",
      "agent_team.architecture",
    ],
    insertionPoint: "after_chat_lane_allowed",
    maxTokens: 2_000,
    freshnessRule: "active_memory_only",
    duplicateSuppressionKey: "ref",
    qualityEvalRequirement: "source_ref_relevance",
    failureBehavior: "skip_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.projection.v1",
    kind: "projection_pack",
    source: "materialized_projection_digest",
    owner: "model-memory",
    routeEligibility: [...CHAT_ROUTES, ...ADVANCED_ROUTES],
    workflowEligibility: ["ordinary_chat", "agent_team.coding", "agent_team.architecture"],
    insertionPoint: "advanced_front_door_context",
    maxTokens: 1_500,
    freshnessRule: "not_stale",
    duplicateSuppressionKey: "source_hash",
    qualityEvalRequirement: "workflow_output_improvement",
    failureBehavior: "trim_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.stable-memory.v1",
    kind: "stable_memory_pack",
    source: "durable_memory_summary",
    owner: "model-memory",
    routeEligibility: [...CHAT_ROUTES, ...ADVANCED_ROUTES],
    workflowEligibility: ["ordinary_chat", "workflow.docs_skills", "agent_team.architecture"],
    insertionPoint: "after_chat_lane_allowed",
    maxTokens: 1_000,
    freshnessRule: "active_memory_only",
    duplicateSuppressionKey: "ref",
    qualityEvalRequirement: "capture_recall_followup",
    failureBehavior: "skip_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.tool-result-summary.v1",
    kind: "tool_result_summary_pack",
    source: "bounded_tool_result_summary",
    owner: "execution-platform",
    routeEligibility: ["advanced_intent_front_door", "workflow_execution"],
    workflowEligibility: ["agent_team.coding", "single_agent.web_research", "agent_team.qa_test"],
    insertionPoint: "worker_supervisor_context",
    maxTokens: 800,
    freshnessRule: "current_turn_only",
    duplicateSuppressionKey: "source_hash",
    qualityEvalRequirement: "workflow_output_improvement",
    failureBehavior: "skip_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.closeout-capsule.v1",
    kind: "closeout_capsule_pack",
    source: "model_authored_closeout_capsule_ref",
    owner: "execution-platform",
    routeEligibility: ["advanced_intent_front_door", "workflow_execution", "status"],
    workflowEligibility: ["work_queue.readback", "closeout.proactivity", "agent_team.coding"],
    insertionPoint: "closeout_capsule_synthesis",
    maxTokens: 1_500,
    freshnessRule: "fresh_runtime_ref",
    duplicateSuppressionKey: "capsule_hash",
    qualityEvalRequirement: "owner_readback_usefulness",
    failureBehavior: "needs_review",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.workflow-runtime-state.v1",
    kind: "workflow_runtime_state_pack",
    source: "runtime_job_state_refs",
    owner: "workflow-runtime",
    routeEligibility: ["workflow_execution", "status", "control"],
    workflowEligibility: [
      "agent_team.coding",
      "single_agent.web_research",
      "workflow.docs_skills",
      "agent_team.qa_test",
      "agent_team.architecture",
    ],
    insertionPoint: "worker_supervisor_context",
    maxTokens: 1_200,
    freshnessRule: "fresh_runtime_ref",
    duplicateSuppressionKey: "runtime_job_ref",
    qualityEvalRequirement: "workflow_output_improvement",
    failureBehavior: "needs_review",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.work-queue-readback.v1",
    kind: "work_queue_readback_pack",
    source: "work_queue_projection_refs",
    owner: "work-queue",
    routeEligibility: ["status", "control", "workflow_execution"],
    workflowEligibility: ["work_queue.readback", "agent_team.coding", "agent_team.qa_test"],
    insertionPoint: "work_queue_readback",
    maxTokens: 1_200,
    freshnessRule: "fresh_runtime_ref",
    duplicateSuppressionKey: "runtime_job_ref",
    qualityEvalRequirement: "owner_readback_usefulness",
    failureBehavior: "trim_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
  {
    packId: "context-pack.skill-context.v1",
    kind: "skill_context_pack",
    source: "active_skill_snapshot_refs",
    owner: "model-memory",
    routeEligibility: ["advanced_intent_front_door", "workflow_execution"],
    workflowEligibility: [
      "agent_team.coding",
      "single_agent.web_research",
      "workflow.docs_skills",
      "agent_team.qa_test",
      "agent_team.architecture",
    ],
    insertionPoint: "worker_supervisor_context",
    maxTokens: 1_000,
    freshnessRule: "not_stale",
    duplicateSuppressionKey: "source_hash",
    qualityEvalRequirement: "skill_usage_relevance",
    failureBehavior: "skip_pack",
    rawStorageAllowed: false,
    grantsAuthority: false,
    grantsRuntimeSuccess: false,
    mutatesWorkQueueLifecycle: false,
  },
];

export function packsForRouteAndWorkflow(input: {
  route: ContextPackRouteEligibility;
  workflow?: ContextPackWorkflowEligibility;
}): CanonicalContextPackDefinition[] {
  return CANONICAL_CONTEXT_PACK_REGISTRY.filter((definition) => {
    if (!definition.routeEligibility.includes(input.route)) {
      return false;
    }
    return input.workflow ? definition.workflowEligibility.includes(input.workflow) : true;
  });
}

export function buildContextPackRegistryProof(): ContextPackRegistryProof {
  const ids = new Set<string>();
  const failures: string[] = [];
  for (const definition of CANONICAL_CONTEXT_PACK_REGISTRY) {
    if (ids.has(definition.packId)) {
      failures.push(`duplicate_pack_id:${definition.packId}`);
    }
    ids.add(definition.packId);
    if (
      definition.routeEligibility.includes("protocol") ||
      definition.routeEligibility.includes("triage")
    ) {
      failures.push(`unsafe_protocol_or_triage_eligibility:${definition.packId}`);
    }
    if (
      definition.rawStorageAllowed ||
      definition.grantsAuthority ||
      definition.grantsRuntimeSuccess ||
      definition.mutatesWorkQueueLifecycle
    ) {
      failures.push(`unsafe_pack_flags:${definition.packId}`);
    }
  }
  return {
    artifactKind: "context_pack_registry_proof",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status: failures.length === 0 ? "passed" : "failed",
    totalPacks: CANONICAL_CONTEXT_PACK_REGISTRY.length,
    packIds: [...ids],
    reasonCodes: failures.length === 0 ? ["canonical_context_pack_registry_valid"] : failures,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
  };
}
