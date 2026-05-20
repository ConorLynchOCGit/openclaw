import type { JsonValue } from "../runtime-job-repository.ts";
import { TEAM_GRAPH_NODE_KINDS, type TeamGraphNodeKind } from "./runtime-work-graph.ts";

export const RUNTIME_NODE_CAPABILITY_PHASES = [
  "planning",
  "decomposition",
  "capability_selection",
  "context_synthesis",
  "execution",
  "validation",
  "review",
  "human_decision",
  "finalization",
  "closeout",
] as const;

export type RuntimeNodeCapabilityPhase = (typeof RUNTIME_NODE_CAPABILITY_PHASES)[number];

export type RuntimeNodeCapability = {
  capabilityId: string;
  graphNodeKind: TeamGraphNodeKind;
  executorKey: string;
  workerRef: string;
  requiredMetadataSchemaRef: string;
  roleClass:
    | "orchestration"
    | "context"
    | "implementation"
    | "validation"
    | "review"
    | "research"
    | "planning"
    | "docs"
    | "human"
    | "closeout"
    | "observability";
  /**
   * Compatibility alias for older readback/proof artifacts. New code should use
   * capabilityId for model choice and graphNodeKind for executable nodes.
   */
  nodeType: string;
  roleId: string;
  workflowId: string;
  supportedWorkflowIds: string[];
  supportedPhases: RuntimeNodeCapabilityPhase[];
  displayName: string;
  modelPolicyRefs: string[];
  modelQualificationProfileIds: string[];
  productionSelectionRequiresQualification: boolean;
  allowedAdapters: string[];
  writable: boolean;
  canInspectRepo: boolean;
  canEditSource: boolean;
  canWriteTests: boolean;
  canRunValidation: boolean;
  canDoWebResearch: boolean;
  canCreatePlanningCapsules: boolean;
  canProposeChildActions: boolean;
  canCompileRuntimeJobs: boolean;
  canRequestHumanInput: boolean;
  canReviewSecurityPrivacy: boolean;
  preferredTaskSize: "micro" | "small" | "medium" | "large";
  idealTaskSize: "micro" | "small" | "medium" | "large";
  maxTaskSize: "micro" | "small" | "medium" | "large";
  maxRecommendedFileCount: number;
  maxRecommendedDiffSize: number;
  maxRecommendedContextRefs: number;
  contextCapacity: "none" | "small" | "medium" | "large" | "very_large";
  expectedStrength: "low" | "medium" | "high" | "very_high" | "specialized" | "human_authoritative";
  expectedWeaknesses: string[];
  estimatedTokenCostClass: "none" | "low" | "medium" | "high" | "very_high";
  expectedDollarCostClass: "none" | "low" | "medium" | "high" | "very_high";
  parallelizable: boolean;
  retryable: boolean;
  repairable: boolean;
  failureModes: string[];
  evidenceProducedKinds: Array<
    | "source_change"
    | "test_validation"
    | "review"
    | "docs"
    | "readback"
    | "artifact"
    | "human_decision"
    | "closeout"
    | "research_brief"
    | "planning_capsule"
    | "action_graph"
    | "context_handoff"
  >;
  commitmentFitKinds: string[];
  defaultBudgetPolicy: {
    timeoutMs: number;
    maxOutputTokens: number | null;
    maxCostUsd: number | null;
    retryLimit: number;
  };
  validationResponsibilities: string[];
  escalationTargets: string[];
  costClass: "cheap" | "standard" | "premium";
  latencyClass: "fast" | "medium" | "slow";
  authorityBoundaries: string[];
  knownLimitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeNodeCapabilityManifest = {
  artifactKind: "runtime_node_capability_manifest";
  schemaVersion: "execution-platform.runtime-node-capabilities.v2";
  capabilities: RuntimeNodeCapability[];
  semanticRoutingPerformed: false;
  authorityGranted: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ProviderCapabilityProfile = {
  artifactKind: "provider_capability_profile";
  schemaVersion: "execution-platform.provider-capability-profile.v1";
  profileId: string;
  capabilityId: string;
  graphNodeKind: TeamGraphNodeKind;
  executorKey: string;
  workerRef: string;
  requiredMetadataSchemaRef: string;
  workflowId: string;
  supportedWorkflowIds: string[];
  supportedPhases: RuntimeNodeCapabilityPhase[];
  roleClass: RuntimeNodeCapability["roleClass"];
  roleId: string;
  displayName: string;
  modelPolicyRefs: string[];
  modelQualificationProfileIds: string[];
  productionSelectable: boolean;
  productionSelectionRequiresQualification: boolean;
  qualificationEvidenceRequired: boolean;
  allowedAdapters: string[];
  toolProfileRefs: string[];
  authorityBoundaries: string[];
  writable: boolean;
  canInspectRepo: boolean;
  canEditSource: boolean;
  canWriteTests: boolean;
  canRunValidation: boolean;
  canDoWebResearch: boolean;
  canCreatePlanningCapsules: boolean;
  canProposeChildActions: boolean;
  canCompileRuntimeJobs: boolean;
  canRequestHumanInput: boolean;
  canReviewSecurityPrivacy: boolean;
  preferredTaskSize: RuntimeNodeCapability["preferredTaskSize"];
  idealTaskSize: RuntimeNodeCapability["idealTaskSize"];
  maxTaskSize: RuntimeNodeCapability["maxTaskSize"];
  maxRecommendedFileCount: number;
  maxRecommendedDiffSize: number;
  maxRecommendedContextRefs: number;
  contextCapacity: RuntimeNodeCapability["contextCapacity"];
  expectedStrength: RuntimeNodeCapability["expectedStrength"];
  expectedWeaknesses: string[];
  estimatedTokenCostClass: RuntimeNodeCapability["estimatedTokenCostClass"];
  expectedDollarCostClass: RuntimeNodeCapability["expectedDollarCostClass"];
  costClass: RuntimeNodeCapability["costClass"];
  latencyClass: RuntimeNodeCapability["latencyClass"];
  parallelizable: boolean;
  retryable: boolean;
  repairable: boolean;
  failureModes: string[];
  evidenceProducedKinds: RuntimeNodeCapability["evidenceProducedKinds"];
  qualifiedEvidenceKinds: RuntimeNodeCapability["evidenceProducedKinds"];
  commitmentFitKinds: string[];
  defaultBudgetPolicy: RuntimeNodeCapability["defaultBudgetPolicy"];
  validationResponsibilities: string[];
  escalationTargets: string[];
  knownLimitations: string[];
  runtimeDerivedFromCapabilityManifest: true;
  semanticRoutingPerformed: false;
  authorityGranted: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ProviderCapabilityProfileRegistry = {
  artifactKind: "provider_capability_profile_registry";
  schemaVersion: "execution-platform.provider-capability-profile-registry.v1";
  profiles: ProviderCapabilityProfile[];
  runtimeDerivedFromCapabilityManifest: true;
  semanticRoutingPerformed: false;
  authorityGranted: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function capability(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
    | "supportedPhases"
    | "maxTaskSize"
    | "contextCapacity"
    | "expectedStrength"
    | "expectedWeaknesses"
    | "estimatedTokenCostClass"
    | "expectedDollarCostClass"
    | "parallelizable"
    | "retryable"
    | "repairable"
    | "failureModes"
    | "evidenceProducedKinds"
    | "commitmentFitKinds"
    | "defaultBudgetPolicy"
    | "modelQualificationProfileIds"
    | "productionSelectionRequiresQualification"
  >,
): RuntimeNodeCapability {
  if (!TEAM_GRAPH_NODE_KINDS.includes(input.graphNodeKind)) {
    throw new Error(`capability_graph_node_kind_invalid:${input.capabilityId}`);
  }
  return {
    ...input,
    supportedWorkflowIds: [input.workflowId],
    supportedPhases: inferSupportedPhases(input),
    modelQualificationProfileIds: inferModelQualificationProfileIds(input),
    productionSelectionRequiresQualification:
      input.allowedAdapters.includes("model_agnostic_file_edit_worker") ||
      input.allowedAdapters.includes("model_agnostic_tool_worker_loop") ||
      input.allowedAdapters.includes("non_codex_tool_using_worker_loop") ||
      input.workerRef.startsWith("worker.kimi.") ||
      input.workerRef.startsWith("worker.non-codex."),
    idealTaskSize: input.preferredTaskSize,
    maxTaskSize:
      input.costClass === "premium" || input.preferredTaskSize === "large"
        ? "large"
        : input.preferredTaskSize === "medium"
          ? "medium"
          : input.preferredTaskSize === "small"
            ? "small"
            : "micro",
    contextCapacity:
      input.maxRecommendedContextRefs >= 40
        ? "very_large"
        : input.maxRecommendedContextRefs >= 24
          ? "large"
          : input.maxRecommendedContextRefs >= 12
            ? "medium"
            : input.maxRecommendedContextRefs > 0
              ? "small"
              : "none",
    expectedStrength:
      input.roleClass === "human"
        ? "human_authoritative"
        : input.costClass === "premium"
          ? "very_high"
          : input.roleClass === "research" ||
              input.roleClass === "validation" ||
              input.roleClass === "docs"
            ? "specialized"
            : input.costClass === "standard"
              ? "high"
              : "medium",
    expectedWeaknesses: input.knownLimitations,
    estimatedTokenCostClass:
      input.costClass === "premium"
        ? "very_high"
        : input.costClass === "standard"
          ? "medium"
          : "low",
    expectedDollarCostClass:
      input.costClass === "premium" ? "high" : input.costClass === "standard" ? "medium" : "low",
    parallelizable: !["orchestration", "human", "closeout"].includes(input.roleClass),
    retryable: input.roleClass !== "human",
    repairable: ["implementation", "validation", "planning"].includes(input.roleClass),
    failureModes: input.knownLimitations.map((limitation) => `limitation:${limitation}`),
    evidenceProducedKinds: inferEvidenceKinds(input),
    commitmentFitKinds: inferCommitmentFitKinds(input),
    defaultBudgetPolicy: {
      timeoutMs:
        input.costClass === "premium"
          ? 3_600_000
          : input.costClass === "standard"
            ? 900_000
            : 600_000,
      maxOutputTokens:
        input.costClass === "premium" ? 32_000 : input.costClass === "standard" ? 16_000 : 12_000,
      maxCostUsd: input.costClass === "premium" ? 3 : input.costClass === "standard" ? 1 : 0.25,
      retryLimit:
        input.roleClass === "implementation" ? 1 : input.roleClass === "validation" ? 2 : 0,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function providerProfileId(capability: RuntimeNodeCapability): string {
  return `capability-profile://${capability.workflowId}/${capability.capabilityId}.v1`;
}

export function capabilityProductionSelectable(capability: RuntimeNodeCapability): boolean {
  return (
    !capability.allowedAdapters.includes("contract_only") &&
    !capability.authorityBoundaries.includes("not_selectable_in_production") &&
    capability.executorKey.length > 0 &&
    capability.workerRef.length > 0 &&
    capability.requiredMetadataSchemaRef.startsWith("schema://")
  );
}

export function providerCapabilityProfileForCapability(
  capability: RuntimeNodeCapability,
): ProviderCapabilityProfile {
  return {
    artifactKind: "provider_capability_profile",
    schemaVersion: "execution-platform.provider-capability-profile.v1",
    profileId: providerProfileId(capability),
    capabilityId: capability.capabilityId,
    graphNodeKind: capability.graphNodeKind,
    executorKey: capability.executorKey,
    workerRef: capability.workerRef,
    requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
    workflowId: capability.workflowId,
    supportedWorkflowIds: capability.supportedWorkflowIds,
    supportedPhases: capability.supportedPhases,
    roleClass: capability.roleClass,
    roleId: capability.roleId,
    displayName: capability.displayName,
    modelPolicyRefs: capability.modelPolicyRefs,
    modelQualificationProfileIds: capability.modelQualificationProfileIds,
    productionSelectable: capabilityProductionSelectable(capability),
    productionSelectionRequiresQualification: capability.productionSelectionRequiresQualification,
    qualificationEvidenceRequired: capability.productionSelectionRequiresQualification,
    allowedAdapters: capability.allowedAdapters,
    toolProfileRefs: capability.allowedAdapters.map((adapter) => `tool-profile://${adapter}`),
    authorityBoundaries: capability.authorityBoundaries,
    writable: capability.writable,
    canInspectRepo: capability.canInspectRepo,
    canEditSource: capability.canEditSource,
    canWriteTests: capability.canWriteTests,
    canRunValidation: capability.canRunValidation,
    canDoWebResearch: capability.canDoWebResearch,
    canCreatePlanningCapsules: capability.canCreatePlanningCapsules,
    canProposeChildActions: capability.canProposeChildActions,
    canCompileRuntimeJobs: capability.canCompileRuntimeJobs,
    canRequestHumanInput: capability.canRequestHumanInput,
    canReviewSecurityPrivacy: capability.canReviewSecurityPrivacy,
    preferredTaskSize: capability.preferredTaskSize,
    idealTaskSize: capability.idealTaskSize,
    maxTaskSize: capability.maxTaskSize,
    maxRecommendedFileCount: capability.maxRecommendedFileCount,
    maxRecommendedDiffSize: capability.maxRecommendedDiffSize,
    maxRecommendedContextRefs: capability.maxRecommendedContextRefs,
    contextCapacity: capability.contextCapacity,
    expectedStrength: capability.expectedStrength,
    expectedWeaknesses: capability.expectedWeaknesses,
    estimatedTokenCostClass: capability.estimatedTokenCostClass,
    expectedDollarCostClass: capability.expectedDollarCostClass,
    costClass: capability.costClass,
    latencyClass: capability.latencyClass,
    parallelizable: capability.parallelizable,
    retryable: capability.retryable,
    repairable: capability.repairable,
    failureModes: capability.failureModes,
    evidenceProducedKinds: capability.evidenceProducedKinds,
    qualifiedEvidenceKinds: capability.evidenceProducedKinds,
    commitmentFitKinds: capability.commitmentFitKinds,
    defaultBudgetPolicy: capability.defaultBudgetPolicy,
    validationResponsibilities: capability.validationResponsibilities,
    escalationTargets: capability.escalationTargets,
    knownLimitations: capability.knownLimitations,
    runtimeDerivedFromCapabilityManifest: true,
    semanticRoutingPerformed: false,
    authorityGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function buildProviderCapabilityProfileRegistry(
  manifest = buildRuntimeNodeCapabilityManifest(),
): ProviderCapabilityProfileRegistry {
  return {
    artifactKind: "provider_capability_profile_registry",
    schemaVersion: "execution-platform.provider-capability-profile-registry.v1",
    profiles: manifest.capabilities.map(providerCapabilityProfileForCapability),
    runtimeDerivedFromCapabilityManifest: true,
    semanticRoutingPerformed: false,
    authorityGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function inferSupportedPhases(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
    | "supportedPhases"
    | "maxTaskSize"
    | "contextCapacity"
    | "expectedStrength"
    | "expectedWeaknesses"
    | "estimatedTokenCostClass"
    | "expectedDollarCostClass"
    | "parallelizable"
    | "retryable"
    | "repairable"
    | "failureModes"
    | "evidenceProducedKinds"
    | "commitmentFitKinds"
    | "defaultBudgetPolicy"
    | "modelQualificationProfileIds"
    | "productionSelectionRequiresQualification"
  >,
): RuntimeNodeCapabilityPhase[] {
  if (input.nodeType === "context_synthesis") {
    return ["context_synthesis", "execution"];
  }
  if (input.roleClass === "orchestration") {
    return ["planning", "decomposition", "capability_selection", "execution"];
  }
  if (
    input.roleClass === "context" ||
    input.roleClass === "implementation" ||
    input.roleClass === "docs"
  ) {
    return ["execution"];
  }
  if (input.roleClass === "validation") {
    return ["execution", "validation"];
  }
  if (input.roleClass === "review") {
    return ["review", "finalization"];
  }
  if (input.roleClass === "research" || input.roleClass === "planning") {
    return ["execution", "validation"];
  }
  if (input.roleClass === "human") {
    return ["human_decision", "execution"];
  }
  if (input.roleClass === "closeout") {
    return ["finalization", "closeout"];
  }
  return ["execution"];
}

function inferModelQualificationProfileIds(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
    | "supportedPhases"
    | "maxTaskSize"
    | "contextCapacity"
    | "expectedStrength"
    | "expectedWeaknesses"
    | "estimatedTokenCostClass"
    | "expectedDollarCostClass"
    | "parallelizable"
    | "retryable"
    | "repairable"
    | "failureModes"
    | "evidenceProducedKinds"
    | "commitmentFitKinds"
    | "defaultBudgetPolicy"
    | "modelQualificationProfileIds"
    | "productionSelectionRequiresQualification"
  >,
): string[] {
  const refs = new Set<string>();
  for (const ref of input.modelPolicyRefs) {
    if (ref.includes("qwen3-coder-next") || ref.includes("/qwen")) {
      refs.add("openrouter.qwen.qwen3-coder-next");
    }
    if (ref.includes("/kimi")) {
      refs.add("openrouter.moonshotai.kimi-k2.6");
    }
    if (ref.includes("deepseek-v4-flash")) {
      refs.add("openrouter.deepseek.deepseek-v4-flash");
    }
    if (ref.includes("deepseek-v4-pro")) {
      refs.add("openrouter.deepseek.deepseek-v4-pro");
    }
    if (ref.includes("gpt-5.5") || ref.includes("openai-codex")) {
      refs.add("codex.policy.strongest-coding");
    }
  }
  if (input.workerRef.includes("kimi")) {
    refs.add("openrouter.moonshotai.kimi-k2.6");
  }
  if (input.workerRef.includes("non-codex")) {
    if (input.roleClass === "implementation") {
      refs.add("openrouter.moonshotai.kimi-k2.6");
    }
    if (input.roleClass === "context" || input.roleClass === "validation") {
      refs.add("openrouter.deepseek.deepseek-v4-flash");
      refs.add("openrouter.deepseek.deepseek-v4-pro");
    }
    if (input.roleClass === "implementation" && input.canWriteTests) {
      refs.add("openrouter.deepseek.deepseek-v4-pro");
    }
  }
  if (
    input.allowedAdapters.includes("model_agnostic_file_edit_worker") ||
    input.allowedAdapters.includes("model_agnostic_tool_worker_loop")
  ) {
    if (input.roleClass === "implementation" || input.canEditSource || input.canWriteTests) {
      refs.add("openrouter.moonshotai.kimi-k2.6");
    }
    if (input.roleClass === "context" || input.roleClass === "validation") {
      refs.add("openrouter.deepseek.deepseek-v4-flash");
      refs.add("openrouter.deepseek.deepseek-v4-pro");
    }
  }
  if (input.workerRef.includes("codex") || input.allowedAdapters.includes("codex_app_server")) {
    refs.add("codex.policy.strongest-coding");
  }
  return [...refs].slice(0, 8);
}

function inferEvidenceKinds(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
    | "supportedPhases"
    | "maxTaskSize"
    | "contextCapacity"
    | "expectedStrength"
    | "expectedWeaknesses"
    | "estimatedTokenCostClass"
    | "expectedDollarCostClass"
    | "parallelizable"
    | "retryable"
    | "repairable"
    | "failureModes"
    | "evidenceProducedKinds"
    | "commitmentFitKinds"
    | "defaultBudgetPolicy"
    | "modelQualificationProfileIds"
    | "productionSelectionRequiresQualification"
  >,
): RuntimeNodeCapability["evidenceProducedKinds"] {
  const kinds = new Set<RuntimeNodeCapability["evidenceProducedKinds"][number]>();
  if (input.canInspectRepo) {
    kinds.add("context_handoff");
  }
  if (input.canEditSource) {
    kinds.add("source_change");
  }
  if (input.canWriteTests || input.canRunValidation) {
    kinds.add("test_validation");
  }
  if (input.canDoWebResearch) {
    kinds.add("research_brief");
  }
  if (input.canCreatePlanningCapsules) {
    kinds.add("planning_capsule");
  }
  if (input.canProposeChildActions) {
    kinds.add("action_graph");
  }
  if (input.canRequestHumanInput) {
    kinds.add("human_decision");
  }
  if (input.roleClass === "review") {
    kinds.add("review");
  }
  if (input.roleClass === "closeout") {
    kinds.add("closeout");
  }
  if (input.roleClass === "observability") {
    kinds.add("readback");
  }
  if (input.roleClass === "docs") {
    kinds.add("docs");
  }
  if (kinds.size === 0) {
    kinds.add("artifact");
  }
  return [...kinds];
}

function inferCommitmentFitKinds(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
    | "supportedPhases"
    | "maxTaskSize"
    | "contextCapacity"
    | "expectedStrength"
    | "expectedWeaknesses"
    | "estimatedTokenCostClass"
    | "expectedDollarCostClass"
    | "parallelizable"
    | "retryable"
    | "repairable"
    | "failureModes"
    | "evidenceProducedKinds"
    | "commitmentFitKinds"
    | "defaultBudgetPolicy"
    | "modelQualificationProfileIds"
    | "productionSelectionRequiresQualification"
  >,
): string[] {
  return [
    input.roleClass,
    ...input.validationResponsibilities,
    ...(input.canEditSource ? ["source_change"] : []),
    ...(input.canDoWebResearch ? ["external_research"] : []),
    ...(input.canCreatePlanningCapsules ? ["planning"] : []),
  ].slice(0, 16);
}

export function buildRuntimeNodeCapabilityManifest(): RuntimeNodeCapabilityManifest {
  return {
    artifactKind: "runtime_node_capability_manifest",
    schemaVersion: "execution-platform.runtime-node-capabilities.v2",
    semanticRoutingPerformed: false,
    authorityGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    capabilities: [
      capability({
        capabilityId: "orchestrator_decision",
        graphNodeKind: "orchestrator_plan",
        executorKey: "role:orchestrator",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/orchestrator-decision.v2",
        roleClass: "orchestration",
        nodeType: "orchestrator_decision",
        roleId: "orchestrator",
        workflowId: "agent_team.coding",
        displayName: "GPT 5.5 graph orchestrator",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/orchestrator/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["select_next_node", "split_work", "respond_to_ledger_delta"],
        escalationTargets: ["human_decision", "implementation_complex", "mark_needs_review"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["no_direct_file_write", "no_runtime_lifecycle_mutation"],
        knownLimitations: ["planning_quality_depends_on_bounded_evidence"],
      }),
      capability({
        capabilityId: "context_synthesis",
        graphNodeKind: "context_synthesis",
        executorKey: "kind:context_synthesis",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/context-synthesis.v1",
        roleClass: "planning",
        nodeType: "context_synthesis",
        roleId: "context_synthesis",
        workflowId: "agent_team.coding",
        displayName: "Context synthesis and dependency-aware implementation graph planner",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/context-synthesis/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 60,
        validationResponsibilities: [
          "consume_accepted_context_handoffs",
          "group_commitments_into_worker_ready_units",
          "map_context_handoffs_to_downstream_nodes",
          "identify_dependencies_and_parallelism",
          "block_implementation_until_ready",
        ],
        escalationTargets: ["context_scout", "human_decision", "implementation_complex"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["no_direct_file_write", "no_runtime_lifecycle_mutation"],
        knownLimitations: ["requires_accepted_context_handoffs_for_complex_missions"],
      }),
      capability({
        capabilityId: "implementation_microtask",
        graphNodeKind: "implementation",
        executorKey: "kind:implementation",
        workerRef: "worker.kimi.file-implementation",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/implementation-microtask.v2",
        roleClass: "implementation",
        nodeType: "implementation_microtask",
        roleId: "implementation_engineer",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex tool-using implementation worker loop",
        modelPolicyRefs: [
          "policy://codex-parity/openclaw-role/implementation-standard/qwen-controller",
          "policy://codex-parity/openclaw-role/implementation-standard/kimi-patch-reasoning-none",
          "policy://codex-parity/openclaw-role/implementation-standard/qwen-validation-repair",
          "policy://codex-parity/openclaw-role/implementation-standard/qwen-evidence",
        ],
        allowedAdapters: [
          "worker.kimi.file-implementation",
          "model_agnostic_file_edit_worker",
          "non_codex_tool_using_worker_loop",
        ],
        writable: true,
        canInspectRepo: true,
        canEditSource: true,
        canWriteTests: true,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 6,
        maxRecommendedDiffSize: 1_200,
        maxRecommendedContextRefs: 18,
        validationResponsibilities: [
          "request_bounded_context",
          "search_allowed_repo_scope",
          "read_bounded_file_snapshots",
          "inspect_related_tests",
          "select_compound_coding_tool_when_context_is_sufficient",
          "execute_compound_inspect_edit_validate_evidence_operation",
          "execute_ordered_edit_steps",
          "run_focused_validation",
          "repair_within_budget_or_escalate",
          "emit_commitment_evidence_claims",
        ],
        escalationTargets: ["implementation_complex", "context_scout", "test_review"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["approved_file_scope_only", "no_shell_commands_except_validation"],
        knownLimitations: [
          "not_for_large_architectural_refactors",
          "requires_bounded_tool_results_and_file_snapshots",
          "escalates_after_repeated_same_failure",
          "router_and_context_scout_qwen_defaults_require_stage_latency_gates_before_promotion",
        ],
      }),
      capability({
        capabilityId: "implementation_complex",
        graphNodeKind: "implementation",
        executorKey: "kind:implementation",
        workerRef: "worker.codex.parity-runtime-adapter",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/implementation-complex.v2",
        roleClass: "implementation",
        nodeType: "implementation_complex",
        roleId: "implementation_engineer",
        workflowId: "agent_team.coding",
        displayName: "Codex parity complex implementation",
        modelPolicyRefs: [
          "policy://codex-parity/openclaw-role/implementation-complex/openai-codex/gpt-5.5",
        ],
        allowedAdapters: ["worker.codex.parity-runtime-adapter"],
        writable: true,
        canInspectRepo: true,
        canEditSource: true,
        canWriteTests: true,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 30,
        maxRecommendedDiffSize: 5_000,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["run_required_validation", "repair_validation_failures"],
        escalationTargets: ["human_decision", "reviewer", "mark_needs_review"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["approved_repo_scope_only", "no_deploy", "no_outbound_send"],
        knownLimitations: ["long_running_calls_need_progress_heartbeats"],
      }),
      capability({
        capabilityId: "context_scout",
        graphNodeKind: "context_scout",
        executorKey: "role:context_scout",
        workerRef: "openrouter_model_lane",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/context-scout.v2",
        roleClass: "context",
        nodeType: "context_scout",
        roleId: "context_scout",
        workflowId: "agent_team.coding",
        displayName: "Bounded repo context scout",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/context-scout"],
        allowedAdapters: ["openrouter_model_lane"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 20,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 30,
        validationResponsibilities: ["identify_files", "summarize_patterns", "handoff_edit_points"],
        escalationTargets: ["orchestrator", "implementation_microtask"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["read_only"],
        knownLimitations: ["does_not_apply_edits"],
      }),
      capability({
        capabilityId: "non_codex_context_scout",
        graphNodeKind: "context_scout",
        executorKey: "kind:non_codex_context_scout",
        workerRef: "worker.non-codex.context-scout",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/non-codex-context-scout.v1",
        roleClass: "context",
        nodeType: "non_codex_context_scout",
        roleId: "context_scout",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex tool-using context scout",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/context-scout/non-codex"],
        allowedAdapters: ["model_agnostic_tool_worker_loop"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 20,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 30,
        validationResponsibilities: [
          "search_allowed_repo_scope",
          "read_bounded_file_snapshots",
          "emit_context_handoff_refs",
        ],
        escalationTargets: ["implementation_microtask", "implementation_complex"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["read_only", "no_file_edits"],
        knownLimitations: ["does_not_apply_edits", "must_not_close_source_edit_commitments"],
      }),
      capability({
        capabilityId: "test_authoring",
        graphNodeKind: "test_authoring",
        executorKey: "kind:test_authoring",
        workerRef: "model_agnostic_file_edit_worker",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/test-authoring.v2",
        roleClass: "validation",
        nodeType: "test_authoring",
        roleId: "test_engineer",
        workflowId: "agent_team.coding",
        displayName: "Test engineer file-edit authoring",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/test-engineer"],
        allowedAdapters: ["model_agnostic_file_edit_worker"],
        writable: true,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: true,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 3,
        maxRecommendedDiffSize: 500,
        maxRecommendedContextRefs: 16,
        validationResponsibilities: ["write_focused_tests", "repair_test_failures"],
        escalationTargets: ["implementation_complex", "reviewer"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["test_files_preferred", "no_test_weakening_without_review"],
        knownLimitations: ["must_not_count_skipped_or_weakened_tests_as_success"],
      }),
      capability({
        capabilityId: "non_codex_test_writer",
        graphNodeKind: "test_authoring",
        executorKey: "kind:non_codex_test_writer",
        workerRef: "worker.non-codex.test-writer",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/non-codex-test-writer.v1",
        roleClass: "validation",
        nodeType: "non_codex_test_writer",
        roleId: "test_engineer",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex tool-using test writer",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/test-writer/non-codex"],
        allowedAdapters: ["model_agnostic_tool_worker_loop"],
        writable: true,
        canInspectRepo: true,
        canEditSource: true,
        canWriteTests: true,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 4,
        maxRecommendedDiffSize: 900,
        maxRecommendedContextRefs: 16,
        validationResponsibilities: [
          "write_focused_tests",
          "run_focused_validation",
          "emit_commitment_evidence_claims",
        ],
        escalationTargets: ["implementation_microtask", "implementation_complex"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["test_or_adjacent_files_only", "no_test_weakening_without_review"],
        knownLimitations: ["not_for_broad_test_strategy_without_planner"],
      }),
      capability({
        capabilityId: "non_codex_docs_editor",
        graphNodeKind: "docs_update",
        executorKey: "kind:non_codex_docs_editor",
        workerRef: "worker.non-codex.docs-editor",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/non-codex-docs-editor.v1",
        roleClass: "docs",
        nodeType: "non_codex_docs_editor",
        roleId: "docs_skills_writer",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex tool-using docs editor",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/docs-editor/non-codex"],
        allowedAdapters: ["model_agnostic_tool_worker_loop"],
        writable: true,
        canInspectRepo: true,
        canEditSource: true,
        canWriteTests: false,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 6,
        maxRecommendedDiffSize: 1_600,
        maxRecommendedContextRefs: 20,
        validationResponsibilities: [
          "edit_docs_specs_or_runbooks",
          "run_format_validation_when_available",
          "emit_commitment_evidence_claims",
        ],
        escalationTargets: ["implementation_complex"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["docs_and_specs_only"],
        knownLimitations: ["does_not_execute_application_code_changes"],
      }),
      capability({
        capabilityId: "non_codex_validation_failure_explainer",
        graphNodeKind: "test_review",
        executorKey: "kind:non_codex_validation_failure_explainer",
        workerRef: "worker.non-codex.validation-failure-explainer",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/non-codex-validation-explainer.v1",
        roleClass: "validation",
        nodeType: "non_codex_validation_failure_explainer",
        roleId: "test_engineer",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex validation failure explainer",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/validation-explainer/non-codex"],
        allowedAdapters: ["model_agnostic_tool_worker_loop"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 8,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 16,
        validationResponsibilities: ["explain_bounded_validation_failure", "recommend_repair"],
        escalationTargets: ["implementation_microtask", "implementation_complex"],
        costClass: "cheap",
        latencyClass: "fast",
        authorityBoundaries: ["read_only", "cannot_mark_source_edit_complete"],
        knownLimitations: ["diagnostic_only"],
      }),
      capability({
        capabilityId: "validation_run",
        graphNodeKind: "validation",
        executorKey: "kind:validation",
        workerRef: "script-middleware",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/validation-run.v2",
        roleClass: "validation",
        nodeType: "validation_run",
        roleId: "test_engineer",
        workflowId: "agent_team.coding",
        displayName: "Focused validation runner",
        modelPolicyRefs: [],
        allowedAdapters: ["script-middleware"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 8,
        validationResponsibilities: [
          "run_focused_validation",
          "record_validation_refs",
          "emit_commitment_evidence_claims",
        ],
        escalationTargets: ["non_codex_validation_failure_explainer", "implementation_microtask"],
        costClass: "cheap",
        latencyClass: "fast",
        authorityBoundaries: ["approved_validation_commands_only", "bounded_log_summaries_only"],
        knownLimitations: ["cannot_repair_failures_without_follow_up_node"],
      }),
      capability({
        capabilityId: "reviewer",
        graphNodeKind: "reviewer",
        executorKey: "kind:reviewer",
        workerRef: "worker.reviewer.runtime",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/reviewer.v2",
        roleClass: "review",
        nodeType: "reviewer",
        roleId: "reviewer",
        workflowId: "agent_team.coding",
        displayName: "Workflow reviewer",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/reviewer"],
        allowedAdapters: ["worker.reviewer.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 20,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 24,
        validationResponsibilities: [
          "review_commitment_evidence",
          "check_storage_authority_bounds",
          "surface_limitations",
        ],
        escalationTargets: ["implementation_microtask", "implementation_complex", "human_decision"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["read_only", "cannot_mark_runtime_success"],
        knownLimitations: ["quality_judgment_requires_model_review"],
      }),
      capability({
        capabilityId: "observability_readback",
        graphNodeKind: "observability_readback",
        executorKey: "kind:observability_readback",
        workerRef: "worker.observability.runtime",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/observability-readback.v2",
        roleClass: "observability",
        nodeType: "observability_readback",
        roleId: "observability_scribe",
        workflowId: "agent_team.coding",
        displayName: "Owner-facing workflow readback",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/observability"],
        allowedAdapters: ["worker.observability.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 12,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 20,
        validationResponsibilities: [
          "surface_runtime_graph_state",
          "summarize_open_commitments",
          "emit_owner_readback_refs",
        ],
        escalationTargets: ["reviewer", "coding_closeout"],
        costClass: "cheap",
        latencyClass: "fast",
        authorityBoundaries: ["read_only", "bounded_refs_only"],
        knownLimitations: ["diagnostic_readback_only"],
      }),
      capability({
        capabilityId: "coding_closeout",
        graphNodeKind: "closeout",
        executorKey: "kind:closeout",
        workerRef: "worker.closeout.model-authored",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/coding-closeout.v2",
        roleClass: "closeout",
        nodeType: "coding_closeout",
        roleId: "closeout_synthesizer",
        workflowId: "agent_team.coding",
        displayName: "Coding workflow model-authored closeout",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/closeout/gpt-5.5"],
        allowedAdapters: ["closeout.generate"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 12,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 32,
        validationResponsibilities: [
          "synthesize_model_authored_closeout",
          "cite_runtime_evidence_refs",
          "avoid_degraded_success",
        ],
        escalationTargets: ["mark_needs_review"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["no_runtime_lifecycle_mutation", "bounded_refs_only"],
        knownLimitations: ["requires_accepted_runtime_evidence"],
      }),
      capability({
        capabilityId: "non_codex_frontend_editor",
        graphNodeKind: "implementation",
        executorKey: "kind:non_codex_frontend_editor",
        workerRef: "worker.non-codex.frontend-editor",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/non-codex-frontend-editor.v1",
        roleClass: "implementation",
        nodeType: "non_codex_frontend_editor",
        roleId: "frontend_implementation_engineer",
        workflowId: "agent_team.coding",
        displayName: "Non-Codex frontend editor contract",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/frontend-editor/non-codex"],
        allowedAdapters: ["contract_only"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 0,
        validationResponsibilities: ["contract_only_until_ui_validation_tools_are_wired"],
        escalationTargets: ["implementation_complex"],
        costClass: "cheap",
        latencyClass: "medium",
        authorityBoundaries: ["not_selectable_in_production"],
        knownLimitations: ["contract_only_not_runnable"],
      }),
      capability({
        capabilityId: "human_decision",
        graphNodeKind: "human_task",
        executorKey: "kind:human_task",
        workerRef: "work_queue_human_task",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/human-decision.v2",
        roleClass: "human",
        nodeType: "human_decision",
        roleId: "human_operator",
        workflowId: "agent_team.coding",
        displayName: "Human operator decision",
        modelPolicyRefs: [],
        allowedAdapters: ["work_queue_human_task"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "micro",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 8,
        validationResponsibilities: ["bounded_decision_ref_only"],
        escalationTargets: ["orchestrator"],
        costClass: "standard",
        latencyClass: "slow",
        authorityBoundaries: ["human_input_does_not_bypass_policy"],
        knownLimitations: ["requires_owner_response_to_resume"],
      }),
      capability({
        capabilityId: "planning_orchestrator",
        graphNodeKind: "orchestrator_plan",
        executorKey: "role:orchestrator",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/planning-orchestrator.v2",
        roleClass: "orchestration",
        nodeType: "planning_orchestrator",
        roleId: "planning_orchestrator",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Product/spec planning orchestrator",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/orchestrator/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: true,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["draft_planning_graph", "sequence_research_and_planning"],
        escalationTargets: ["human_planning_decision", "planning_closeout", "mark_needs_review"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["no_direct_file_write", "no_runtime_lifecycle_mutation"],
        knownLimitations: ["external_assumptions_require_research_or_staleness_flags"],
      }),
      capability({
        capabilityId: "web_research",
        graphNodeKind: "web_research",
        executorKey: "kind:web_research",
        workerRef: "worker.web-research.runtime",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/research-brief.v2",
        roleClass: "research",
        nodeType: "web_research",
        roleId: "web_researcher",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Bounded web research brief",
        modelPolicyRefs: ["policy://execution-platform/workflow/web-research"],
        allowedAdapters: ["worker.web-research.runtime"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: true,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 16,
        validationResponsibilities: ["produce_bounded_citations", "flag_stale_assumptions"],
        escalationTargets: ["planning_capsule_draft", "human_planning_decision"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["bounded_citation_refs_only", "no_raw_page_storage"],
        knownLimitations: ["requires_current_provider_access"],
      }),
      capability({
        capabilityId: "planning_capsule_draft",
        graphNodeKind: "planning_capsule",
        executorKey: "kind:planning_capsule",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/planning-capsule.v2",
        roleClass: "planning",
        nodeType: "planning_capsule_draft",
        roleId: "product_spec_planner",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Planning Capsule draft",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/planning/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["draft_problem_solution_scope", "cite_research_influence"],
        escalationTargets: ["planning_capsule_revision", "human_planning_decision"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["plan_only_until_compiled"],
        knownLimitations: ["does_not_create_runtime_jobs_directly"],
      }),
      capability({
        capabilityId: "planning_capsule_revision",
        graphNodeKind: "planning_capsule",
        executorKey: "kind:planning_capsule",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/planning-capsule-revision.v2",
        roleClass: "planning",
        nodeType: "planning_capsule_revision",
        roleId: "product_spec_planner",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Planning Capsule revision",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/planning/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 32,
        validationResponsibilities: ["revise_from_human_or_research_feedback"],
        escalationTargets: ["action_graph_proposal", "planning_closeout"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["plan_only_until_compiled"],
        knownLimitations: ["requires_revision_refs"],
      }),
      capability({
        capabilityId: "human_planning_decision",
        graphNodeKind: "human_task",
        executorKey: "kind:human_task",
        workerRef: "work_queue_human_task",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/human-planning-decision.v2",
        roleClass: "human",
        nodeType: "human_planning_decision",
        roleId: "human_operator",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Human planning decision",
        modelPolicyRefs: [],
        allowedAdapters: ["work_queue_human_task"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "micro",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 8,
        validationResponsibilities: ["bounded_owner_decision_ref_only"],
        escalationTargets: ["planning_capsule_revision", "planning_closeout"],
        costClass: "standard",
        latencyClass: "slow",
        authorityBoundaries: ["human_input_does_not_bypass_policy"],
        knownLimitations: ["requires_owner_response_to_resume"],
      }),
      capability({
        capabilityId: "action_graph_proposal",
        graphNodeKind: "action_graph_compile",
        executorKey: "kind:action_graph_compile",
        workerRef: "worker.plan-to-runtime-compiler",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/action-graph-proposal.v2",
        roleClass: "planning",
        nodeType: "action_graph_proposal",
        roleId: "plan_to_runtime_compiler",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Action graph proposal",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/planning/gpt-5.5"],
        allowedAdapters: ["worker.plan-to-runtime-compiler"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 24,
        validationResponsibilities: [
          "validate_child_action_shape",
          "preserve_authority_boundaries",
        ],
        escalationTargets: ["compile_runtime_plan", "human_planning_decision"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["proposal_only_until_approved"],
        knownLimitations: ["does_not_execute_children_directly"],
      }),
      capability({
        capabilityId: "compile_runtime_plan",
        graphNodeKind: "compiler",
        executorKey: "kind:compiler",
        workerRef: "worker.plan-to-runtime-compiler",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/compile-runtime-plan.v2",
        roleClass: "planning",
        nodeType: "compile_runtime_plan",
        roleId: "plan_to_runtime_compiler",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Compile runtime plan",
        modelPolicyRefs: [],
        allowedAdapters: ["worker.plan-to-runtime-compiler"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 24,
        validationResponsibilities: ["validate_compile_readiness_without_creating_jobs"],
        escalationTargets: ["human_planning_decision", "planning_closeout"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: [
          "compile_readiness_only",
          "no_runtime_job_creation_without_later_authority",
        ],
        knownLimitations: ["invalid_authority_or_dependency_blocks_compile_readiness"],
      }),
      capability({
        capabilityId: "planning_closeout",
        graphNodeKind: "closeout",
        executorKey: "kind:closeout",
        workerRef: "codex_app_server",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/planning-closeout.v2",
        roleClass: "closeout",
        nodeType: "planning_closeout",
        roleId: "closeout_synthesizer",
        workflowId: "agent_team.product_spec_planning",
        displayName: "Planning closeout",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/closeout/gpt-5.5"],
        allowedAdapters: ["codex_app_server"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 24,
        validationResponsibilities: ["summarize_plan_state", "surface_limitations_and_eli5"],
        escalationTargets: ["human_planning_decision"],
        costClass: "premium",
        latencyClass: "medium",
        authorityBoundaries: ["report_only"],
        knownLimitations: ["cannot claim runtime execution without evidence"],
      }),
      capability({
        capabilityId: "architecture_mapper",
        graphNodeKind: "architecture_spec",
        executorKey: "kind:architecture_spec",
        workerRef: "worker.architecture-red-team.mapper",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/architecture-red-team-mapper.v1",
        roleClass: "planning",
        nodeType: "architecture_mapper",
        roleId: "architecture_mapper",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Architecture boundary mapper",
        modelPolicyRefs: ["policy://architecture-red-team/mapper/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 40,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 48,
        validationResponsibilities: ["map_boundaries", "separate_model_and_runtime_ownership"],
        escalationTargets: ["assumption_extractor", "code_auditor"],
        costClass: "premium",
        latencyClass: "medium",
        authorityBoundaries: ["read_only", "bounded_refs_only"],
        knownLimitations: ["does_not_modify_code_or_grant_proof_readiness"],
      }),
      capability({
        capabilityId: "assumption_extractor",
        graphNodeKind: "reviewer",
        executorKey: "kind:reviewer",
        workerRef: "worker.architecture-red-team.assumption-extractor",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/assumption-extractor.v1",
        roleClass: "review",
        nodeType: "assumption_extractor",
        roleId: "assumption_extractor",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Architecture assumption extractor",
        modelPolicyRefs: ["policy://architecture-red-team/assumption-extractor/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 32,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["surface_falsifiable_assumptions", "assign_risk_level"],
        escalationTargets: ["falsifiable_question_author", "model_contract_critic"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["read_only", "model_judges_risk_semantics"],
        knownLimitations: ["runtime_validates_shape_only"],
      }),
      capability({
        capabilityId: "falsifiable_question_author",
        graphNodeKind: "planning_capsule",
        executorKey: "kind:planning_capsule",
        workerRef: "worker.architecture-red-team.question-author",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/falsifiable-question-author.v1",
        roleClass: "planning",
        nodeType: "falsifiable_question_author",
        roleId: "falsifiable_question_author",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Falsifiable question author",
        modelPolicyRefs: ["policy://architecture-red-team/question-author/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: true,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 24,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 32,
        validationResponsibilities: ["turn_assumptions_into_falsifiable_questions"],
        escalationTargets: ["narrow_web_researcher", "code_auditor"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["read_only"],
        knownLimitations: ["question_quality_requires_model_review"],
      }),
      capability({
        capabilityId: "narrow_web_researcher",
        graphNodeKind: "web_research",
        executorKey: "kind:web_research",
        workerRef: "worker.architecture-red-team.web-research",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/narrow-research-brief.v1",
        roleClass: "research",
        nodeType: "narrow_web_researcher",
        roleId: "narrow_web_researcher",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Narrow architecture research brief",
        modelPolicyRefs: ["policy://architecture-red-team/narrow-web-research"],
        allowedAdapters: ["worker.web-research.runtime"],
        writable: false,
        canInspectRepo: false,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: true,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 0,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 16,
        validationResponsibilities: ["produce_bounded_research_brief", "cite_source_refs"],
        escalationTargets: ["code_auditor", "final_recommendation_reviewer"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["bounded_citation_refs_only", "no_raw_page_storage"],
        knownLimitations: ["external_sources_can_be_stale_or_inapplicable"],
      }),
      capability({
        capabilityId: "code_auditor",
        graphNodeKind: "reviewer",
        executorKey: "kind:reviewer",
        workerRef: "worker.architecture-red-team.code-auditor",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/architecture-code-auditor.v1",
        roleClass: "review",
        nodeType: "code_auditor",
        roleId: "code_auditor",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Architecture code gap auditor",
        modelPolicyRefs: ["policy://architecture-red-team/code-auditor/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "large",
        maxRecommendedFileCount: 60,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 60,
        validationResponsibilities: ["map_code_gaps", "cite_repo_refs", "avoid_patch_work"],
        escalationTargets: ["model_contract_critic", "runtime_evidence_critic"],
        costClass: "premium",
        latencyClass: "slow",
        authorityBoundaries: ["read_only", "no_file_edits"],
        knownLimitations: ["audit_quality_depends_on_available_refs"],
      }),
      capability({
        capabilityId: "model_contract_critic",
        graphNodeKind: "reviewer",
        executorKey: "kind:reviewer",
        workerRef: "worker.architecture-red-team.model-contract-critic",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/model-contract-critic.v1",
        roleClass: "review",
        nodeType: "model_contract_critic",
        roleId: "model_contract_critic",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Model/runtime contract critic",
        modelPolicyRefs: ["policy://architecture-red-team/model-contract-critic/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 32,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["detect_model_invented_runtime_schema"],
        escalationTargets: ["runtime_evidence_critic", "work_queue_planner"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["read_only"],
        knownLimitations: ["cannot_validate_semantics_without_model_review"],
      }),
      capability({
        capabilityId: "runtime_evidence_critic",
        graphNodeKind: "observability_readback",
        executorKey: "kind:observability_readback",
        workerRef: "worker.architecture-red-team.runtime-evidence-critic",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/runtime-evidence-critic.v1",
        roleClass: "observability",
        nodeType: "runtime_evidence_critic",
        roleId: "runtime_evidence_critic",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Runtime evidence and readback critic",
        modelPolicyRefs: ["policy://architecture-red-team/runtime-evidence-critic"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 28,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 36,
        validationResponsibilities: ["check_evidence_claims", "check_owner_readback_gaps"],
        escalationTargets: ["work_queue_planner", "final_recommendation_reviewer"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["read_only", "cannot_mark_success"],
        knownLimitations: ["diagnostic_only"],
      }),
      capability({
        capabilityId: "work_queue_planner",
        graphNodeKind: "action_graph_compile",
        executorKey: "kind:action_graph_compile",
        workerRef: "worker.architecture-red-team.work-queue-planner",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/red-team-work-queue-planner.v1",
        roleClass: "planning",
        nodeType: "work_queue_planner",
        roleId: "work_queue_planner",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Red-team work queue planner",
        modelPolicyRefs: ["policy://architecture-red-team/work-queue-planner"],
        allowedAdapters: ["worker.plan-to-runtime-compiler"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: true,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: true,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 16,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 24,
        validationResponsibilities: ["split_preproof_and_postproof_actions"],
        escalationTargets: ["human_decision", "final_recommendation_reviewer"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["proposal_only", "no_work_queue_lifecycle_mutation"],
        knownLimitations: ["does_not_execute_queue_items"],
      }),
      capability({
        capabilityId: "final_recommendation_reviewer",
        graphNodeKind: "reviewer",
        executorKey: "kind:reviewer",
        workerRef: "worker.architecture-red-team.final-reviewer",
        requiredMetadataSchemaRef:
          "schema://runtime-work-graph/node-metadata/red-team-final-reviewer.v1",
        roleClass: "review",
        nodeType: "final_recommendation_reviewer",
        roleId: "final_recommendation_reviewer",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Architecture red-team final reviewer",
        modelPolicyRefs: ["policy://architecture-red-team/final-reviewer/gpt-5.5"],
        allowedAdapters: ["worker.architecture-red-team.runtime"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: true,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: true,
        preferredTaskSize: "medium",
        maxRecommendedFileCount: 24,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 40,
        validationResponsibilities: ["judge_sufficiency", "decide_proof_readiness"],
        escalationTargets: ["red_team_closeout", "human_decision"],
        costClass: "premium",
        latencyClass: "medium",
        authorityBoundaries: ["model_judgment_only", "runtime_validates_blockers"],
        knownLimitations: ["cannot_override_p0_blockers_without_owner_ref"],
      }),
      capability({
        capabilityId: "red_team_closeout",
        graphNodeKind: "closeout",
        executorKey: "kind:closeout",
        workerRef: "worker.closeout.model-authored",
        requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/red-team-closeout.v1",
        roleClass: "closeout",
        nodeType: "red_team_closeout",
        roleId: "red_team_closeout",
        workflowId: "agent_team.architecture_red_team",
        displayName: "Architecture red-team model-authored closeout",
        modelPolicyRefs: ["policy://architecture-red-team/closeout/gpt-5.5"],
        allowedAdapters: ["closeout.generate"],
        writable: false,
        canInspectRepo: true,
        canEditSource: false,
        canWriteTests: false,
        canRunValidation: false,
        canDoWebResearch: false,
        canCreatePlanningCapsules: false,
        canProposeChildActions: false,
        canCompileRuntimeJobs: false,
        canRequestHumanInput: false,
        canReviewSecurityPrivacy: false,
        preferredTaskSize: "small",
        maxRecommendedFileCount: 12,
        maxRecommendedDiffSize: 0,
        maxRecommendedContextRefs: 32,
        validationResponsibilities: ["cite_gate_evidence_refs", "surface_readiness_decision"],
        escalationTargets: ["mark_needs_review"],
        costClass: "standard",
        latencyClass: "medium",
        authorityBoundaries: ["bounded_refs_only", "cannot_claim_proof_success"],
        knownLimitations: ["requires_accepted_gate_validation"],
      }),
    ],
  };
}

export function buildRuntimeCapabilityIndex(
  manifest = buildRuntimeNodeCapabilityManifest(),
): Map<string, RuntimeNodeCapability> {
  return new Map(
    manifest.capabilities.flatMap((capability) => [
      [capability.capabilityId, capability] as const,
      [capability.nodeType, capability] as const,
    ]),
  );
}

export function findRuntimeNodeCapability(
  capabilityId: string,
  manifest = buildRuntimeNodeCapabilityManifest(),
): RuntimeNodeCapability | null {
  return buildRuntimeCapabilityIndex(manifest).get(capabilityId) ?? null;
}

export function isRuntimeCapabilityId(
  capabilityId: string,
  manifest = buildRuntimeNodeCapabilityManifest(),
): boolean {
  return Boolean(findRuntimeNodeCapability(capabilityId, manifest));
}

export function findProviderCapabilityProfile(
  capabilityOrProfileId: string,
  registry = buildProviderCapabilityProfileRegistry(),
): ProviderCapabilityProfile | null {
  return (
    registry.profiles.find(
      (profile) =>
        profile.capabilityId === capabilityOrProfileId ||
        profile.profileId === capabilityOrProfileId,
    ) ?? null
  );
}

export type ProviderCapabilityProfileRegistryValidation = {
  valid: boolean;
  reasonCodes: string[];
  profileCount: number;
  productionSelectableProfileIds: string[];
  diagnosticOnlyProfileIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export function validateProviderCapabilityProfileRegistry(
  registry = buildProviderCapabilityProfileRegistry(),
): ProviderCapabilityProfileRegistryValidation {
  const reasonCodes: string[] = [];
  const seenProfileIds = new Set<string>();
  const seenCapabilityIds = new Set<string>();
  const productionSelectableProfileIds: string[] = [];
  const diagnosticOnlyProfileIds: string[] = [];

  for (const profile of registry.profiles) {
    if (seenProfileIds.has(profile.profileId)) {
      reasonCodes.push(`provider_capability_profile_duplicate_profile_id:${profile.profileId}`);
    }
    if (seenCapabilityIds.has(profile.capabilityId)) {
      reasonCodes.push(
        `provider_capability_profile_duplicate_capability_id:${profile.capabilityId}`,
      );
    }
    seenProfileIds.add(profile.profileId);
    seenCapabilityIds.add(profile.capabilityId);

    if (!TEAM_GRAPH_NODE_KINDS.includes(profile.graphNodeKind)) {
      reasonCodes.push(`provider_capability_profile_graph_node_kind_invalid:${profile.profileId}`);
    }
    if (!profile.executorKey.match(/^(kind|role):/u)) {
      reasonCodes.push(`provider_capability_profile_executor_key_invalid:${profile.profileId}`);
    }
    if (!profile.workerRef) {
      reasonCodes.push(`provider_capability_profile_worker_ref_missing:${profile.profileId}`);
    }
    if (!profile.requiredMetadataSchemaRef.startsWith("schema://")) {
      reasonCodes.push(`provider_capability_profile_schema_ref_invalid:${profile.profileId}`);
    }
    if (profile.rawPromptStored || profile.rawResponseStored || profile.rawProviderLogStored) {
      reasonCodes.push(`provider_capability_profile_raw_storage_flag_invalid:${profile.profileId}`);
    }
    if (profile.productionSelectable) {
      productionSelectableProfileIds.push(profile.profileId);
      if (profile.allowedAdapters.includes("contract_only")) {
        reasonCodes.push(
          `provider_capability_profile_contract_only_marked_production:${profile.profileId}`,
        );
      }
      if (profile.authorityBoundaries.includes("not_selectable_in_production")) {
        reasonCodes.push(
          `provider_capability_profile_not_selectable_marked_production:${profile.profileId}`,
        );
      }
      if (
        profile.productionSelectionRequiresQualification &&
        profile.modelQualificationProfileIds.length === 0
      ) {
        reasonCodes.push(
          `provider_capability_profile_qualification_refs_missing:${profile.profileId}`,
        );
      }
    } else {
      diagnosticOnlyProfileIds.push(profile.profileId);
    }
  }

  return {
    valid: reasonCodes.length === 0,
    reasonCodes:
      reasonCodes.length === 0
        ? ["provider_capability_profile_registry_valid"]
        : [...new Set(reasonCodes)],
    profileCount: registry.profiles.length,
    productionSelectableProfileIds,
    diagnosticOnlyProfileIds,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function filterRuntimeNodeCapabilityManifestForExecutors(input: {
  executableExecutorKeys: string[];
  manifest?: RuntimeNodeCapabilityManifest;
  workflowId?: string | null;
  phase?: RuntimeNodeCapabilityPhase | null;
}): RuntimeNodeCapabilityManifest {
  const executable = new Set(input.executableExecutorKeys);
  return {
    ...(input.manifest ?? buildRuntimeNodeCapabilityManifest()),
    capabilities: (input.manifest ?? buildRuntimeNodeCapabilityManifest()).capabilities.filter(
      (capability) =>
        executable.has(capability.executorKey) &&
        (!input.workflowId || capability.supportedWorkflowIds.includes(input.workflowId)) &&
        capabilitySelectableInPhase(capability, input.phase ?? null),
    ),
  };
}

export function capabilitySelectableInPhase(
  capability: RuntimeNodeCapability,
  phase: RuntimeNodeCapabilityPhase | null,
): boolean {
  if (!phase || capability.supportedPhases.includes(phase)) {
    return true;
  }
  if (phase === "context_synthesis") {
    return capability.capabilityId === "context_synthesis";
  }
  if (phase === "decomposition") {
    if (capability.capabilityId === "implementation_complex") {
      return false;
    }
    return [
      "context",
      "implementation",
      "validation",
      "review",
      "research",
      "planning",
      "docs",
      "human",
      "observability",
      "orchestration",
      "closeout",
    ].includes(capability.roleClass);
  }
  if (phase === "capability_selection") {
    if (capability.capabilityId === "implementation_complex") {
      return false;
    }
    return [
      "context",
      "implementation",
      "validation",
      "review",
      "research",
      "planning",
      "docs",
      "human",
      "observability",
      "orchestration",
      "closeout",
    ].includes(capability.roleClass);
  }
  return false;
}

export type RuntimeCapabilityExecutorCoverage = {
  workflowId: string;
  valid: boolean;
  requiredCapabilityIds: string[];
  coveredCapabilityIds: string[];
  missingCapabilityIds: string[];
  requiredExecutorKeys: string[];
  coveredExecutorKeys: string[];
  missingExecutorKeys: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export function validateRuntimeCapabilityExecutorCoverage(input: {
  workflowId: string;
  executableExecutorKeys: string[];
  manifest?: RuntimeNodeCapabilityManifest;
}): RuntimeCapabilityExecutorCoverage {
  const manifest = input.manifest ?? buildRuntimeNodeCapabilityManifest();
  const executable = new Set(input.executableExecutorKeys);
  const workflowCapabilities = manifest.capabilities.filter(
    (capability) => capability.workflowId === input.workflowId,
  );
  const coveredCapabilityIds: string[] = [];
  const missingCapabilityIds: string[] = [];
  const coveredExecutorKeys = new Set<string>();
  const missingExecutorKeys = new Set<string>();

  for (const capability of workflowCapabilities) {
    const acceptedKeys = [
      capability.executorKey,
      `kind:${capability.graphNodeKind}`,
      `role:${capability.roleId}`,
    ];
    const matchedKey = acceptedKeys.find((key) => executable.has(key));
    if (matchedKey) {
      coveredCapabilityIds.push(capability.capabilityId);
      coveredExecutorKeys.add(matchedKey);
    } else {
      missingCapabilityIds.push(capability.capabilityId);
      missingExecutorKeys.add(capability.executorKey);
    }
  }

  const reasonCodes =
    missingCapabilityIds.length === 0
      ? ["runtime_capability_executor_coverage_complete"]
      : [
          "runtime_capability_executor_coverage_missing",
          ...missingCapabilityIds.map((capabilityId) => `missing_capability:${capabilityId}`),
          ...[...missingExecutorKeys].map((executorKey) => `missing_executor:${executorKey}`),
        ];

  return {
    workflowId: input.workflowId,
    valid: missingCapabilityIds.length === 0,
    requiredCapabilityIds: workflowCapabilities.map((capability) => capability.capabilityId),
    coveredCapabilityIds,
    missingCapabilityIds,
    requiredExecutorKeys: [
      ...new Set(workflowCapabilities.map((capability) => capability.executorKey)),
    ],
    coveredExecutorKeys: [...coveredExecutorKeys],
    missingExecutorKeys: [...missingExecutorKeys],
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function runtimeNodeCapabilityManifestForModel(input?: {
  executableExecutorKeys?: string[];
  workflowId?: string | null;
  phase?: RuntimeNodeCapabilityPhase | null;
}): JsonValue {
  const manifest = buildRuntimeNodeCapabilityManifest();
  const filtered = input?.executableExecutorKeys
    ? filterRuntimeNodeCapabilityManifestForExecutors({
        executableExecutorKeys: input.executableExecutorKeys,
        workflowId: input.workflowId,
        phase: input.phase,
        manifest,
      })
    : manifest;
  return {
    artifactKind: filtered.artifactKind,
    schemaVersion: filtered.schemaVersion,
    semanticRoutingPerformed: false,
    authorityGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    modelVisibleRuntimeOwnedFieldsOmitted: true,
    capabilities: filtered.capabilities.map((capability) => {
      const profile = providerCapabilityProfileForCapability(capability);
      return {
        capabilityId: capability.capabilityId,
        providerCapabilityProfileId: profile.profileId,
        displayName: capability.displayName,
        roleClass: capability.roleClass,
        supportedWorkflowIds: capability.supportedWorkflowIds,
        supportedPhases: capability.supportedPhases,
        writable: capability.writable,
        canInspectRepo: capability.canInspectRepo,
        canEditSource: capability.canEditSource,
        canWriteTests: capability.canWriteTests,
        canRunValidation: capability.canRunValidation,
        canDoWebResearch: capability.canDoWebResearch,
        canCreatePlanningCapsules: capability.canCreatePlanningCapsules,
        canProposeChildActions: capability.canProposeChildActions,
        canCompileRuntimeJobs: capability.canCompileRuntimeJobs,
        canRequestHumanInput: capability.canRequestHumanInput,
        canReviewSecurityPrivacy: capability.canReviewSecurityPrivacy,
        preferredTaskSize: capability.preferredTaskSize,
        idealTaskSize: capability.idealTaskSize,
        maxTaskSize: capability.maxTaskSize,
        maxRecommendedFileCount: capability.maxRecommendedFileCount,
        maxRecommendedDiffSize: capability.maxRecommendedDiffSize,
        maxRecommendedContextRefs: capability.maxRecommendedContextRefs,
        contextCapacity: capability.contextCapacity,
        expectedStrength: capability.expectedStrength,
        expectedWeaknesses: capability.expectedWeaknesses,
        costClass: capability.costClass,
        latencyClass: capability.latencyClass,
        estimatedTokenCostClass: capability.estimatedTokenCostClass,
        expectedDollarCostClass: capability.expectedDollarCostClass,
        parallelizable: capability.parallelizable,
        retryable: capability.retryable,
        repairable: capability.repairable,
        evidenceProducedKinds: capability.evidenceProducedKinds,
        qualifiedEvidenceKinds: profile.qualifiedEvidenceKinds,
        commitmentFitKinds: capability.commitmentFitKinds,
        validationResponsibilities: capability.validationResponsibilities,
        escalationTargets: capability.escalationTargets,
        authorityBoundaries: capability.authorityBoundaries,
        toolProfileRefs: profile.toolProfileRefs,
        knownLimitations: capability.knownLimitations,
        productionSelectable: profile.productionSelectable,
        productionSelectionRequiresQualification:
          capability.productionSelectionRequiresQualification,
        modelQualificationProfileIds: capability.modelQualificationProfileIds,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }),
  } satisfies JsonValue;
}
