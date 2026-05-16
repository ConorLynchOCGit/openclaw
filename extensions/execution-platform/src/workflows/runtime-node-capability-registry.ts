import type { JsonValue } from "../runtime-job-repository.ts";
import { TEAM_GRAPH_NODE_KINDS, type TeamGraphNodeKind } from "./runtime-work-graph.ts";

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

function capability(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
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
          : input.roleClass === "research" || input.roleClass === "validation"
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

function inferModelQualificationProfileIds(
  input: Omit<
    RuntimeNodeCapability,
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "idealTaskSize"
    | "supportedWorkflowIds"
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
        displayName: "Kimi tool-using non-Codex implementation worker loop",
        modelPolicyRefs: ["policy://codex-parity/openclaw-role/implementation-standard/kimi"],
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
        roleClass: "implementation",
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

export function filterRuntimeNodeCapabilityManifestForExecutors(input: {
  executableExecutorKeys: string[];
  manifest?: RuntimeNodeCapabilityManifest;
}): RuntimeNodeCapabilityManifest {
  const executable = new Set(input.executableExecutorKeys);
  return {
    ...(input.manifest ?? buildRuntimeNodeCapabilityManifest()),
    capabilities: (input.manifest ?? buildRuntimeNodeCapabilityManifest()).capabilities.filter(
      (capability) =>
        executable.has(capability.executorKey) ||
        executable.has(`kind:${capability.graphNodeKind}`) ||
        executable.has(`role:${capability.roleId}`),
    ),
  };
}

export function runtimeNodeCapabilityManifestForModel(input?: {
  executableExecutorKeys?: string[];
}): JsonValue {
  const manifest = buildRuntimeNodeCapabilityManifest();
  return (input?.executableExecutorKeys
    ? filterRuntimeNodeCapabilityManifestForExecutors({
        executableExecutorKeys: input.executableExecutorKeys,
        manifest,
      })
    : manifest) as unknown as JsonValue;
}
