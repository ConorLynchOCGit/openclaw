import { z } from "zod";

export const PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_KIND =
  "product_spec_planning_worker_contract" as const;
export const PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE =
  "agent_team.product_spec_planning_worker_contract" as const;
export const PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION = "v1" as const;

export const PRODUCT_SPEC_PLANNING_MODES = [
  "plan_only",
  "child_action_graph_proposal",
  "compile_ready",
] as const;
export type ProductSpecPlanningMode = (typeof PRODUCT_SPEC_PLANNING_MODES)[number];

const PRODUCT_SPEC_PLANNING_MODE_INPUTS = [
  "plan_only",
  "child_action_graph_proposal",
  "child_action_graph_proposals",
  "compile_ready",
] as const;

export const PRODUCT_SPEC_PLANNING_OUTPUT_KINDS = [
  "plan_only_output",
  "child_action_graph_proposal_output",
  "compile_ready_output",
] as const;
export type ProductSpecPlanningOutputKind = (typeof PRODUCT_SPEC_PLANNING_OUTPUT_KINDS)[number];

export const PRODUCT_SPEC_PLANNING_FIRST_CLASS_WORKFLOW_REFS = [
  "workflow://agent_team.product_spec_planning",
  "workflow://single_agent.web_research",
  "workflow://workflow.docs_skills",
  "workflow://agent_team.architecture",
  "workflow://agent_team.coding",
  "workflow://agent_team.qa_test",
  "workflow://human_operator",
] as const;

export const PRODUCT_SPEC_PLANNING_SCHEDULER_NODE_TYPES = [
  "planning_orchestrator",
  "web_research",
  "planning_capsule_draft",
  "planning_capsule_revision",
  "human_planning_decision",
  "action_graph_proposal",
  "compile_runtime_plan",
  "planning_closeout",
] as const;
export type ProductSpecPlanningSchedulerNodeType =
  (typeof PRODUCT_SPEC_PLANNING_SCHEDULER_NODE_TYPES)[number];

export const PRODUCT_SPEC_PLANNING_CHILD_ACTION_WORKFLOWS = [
  "agent_team.coding",
  "single_agent.web_research",
  "workflow.docs_skills",
  "agent_team.qa_test",
  "agent_team.architecture",
  "human_operator",
] as const;
export type ProductSpecPlanningChildActionWorkflow =
  (typeof PRODUCT_SPEC_PLANNING_CHILD_ACTION_WORKFLOWS)[number];

const PRODUCT_SPEC_PLANNING_IMPLEMENTATION_HINTS = [
  "implementation plan",
  "implementation planning",
  "implementation roadmap",
  "implementation steps",
  "implementation tasks",
  "plan implementation",
  "plan the implementation",
  "child action graph",
  "child action graph proposal",
] as const;

const PRODUCT_SPEC_PLANNING_RUNTIME_GRAPH_REF_HINT = "/runtime-work-graph/";

const PRODUCT_SPEC_PLANNING_MODE_BY_OWNER_DECISION_PREFIX: ReadonlyArray<{
  prefix: string;
  mode: ProductSpecPlanningMode;
}> = [
  {
    prefix: "owner-decision://product-spec-planning/default-child-action-graph-proposal",
    mode: "child_action_graph_proposal",
  },
  {
    prefix: "owner-decision://product-spec-planning/default-child-action-graph-proposals",
    mode: "child_action_graph_proposal",
  },
  {
    prefix: "owner-decision://product-spec-planning/default-plan-only",
    mode: "plan_only",
  },
  {
    prefix: "owner-decision://product-spec-planning/default-compile-ready",
    mode: "compile_ready",
  },
];

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const boundedStringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

function planningModeFromInput(input: (typeof PRODUCT_SPEC_PLANNING_MODE_INPUTS)[number]) {
  return input === "child_action_graph_proposals" ? "child_action_graph_proposal" : input;
}

function outputKindForPlanningMode(
  planningMode: ProductSpecPlanningMode,
): ProductSpecPlanningOutputKind {
  if (planningMode === "plan_only") {
    return "plan_only_output";
  }
  if (planningMode === "compile_ready") {
    return "compile_ready_output";
  }
  return "child_action_graph_proposal_output";
}

function uniqueResolvedPlanningModesFromDecisionRefs(
  decisionRefs: readonly string[],
): ProductSpecPlanningMode[] {
  const modes = new Set<ProductSpecPlanningMode>();
  for (const decisionRef of decisionRefs) {
    const resolvedMode = resolveProductSpecPlanningModeFromDecisionRef(decisionRef);
    if (resolvedMode) {
      modes.add(resolvedMode);
    }
  }
  return [...modes];
}

function isRuntimeWorkGraphRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("runtime-work-graph://") ||
    (normalized.startsWith("runtime-job://") &&
      normalized.includes(PRODUCT_SPEC_PLANNING_RUNTIME_GRAPH_REF_HINT))
  );
}

export function normalizeProductSpecPlanningMode(
  mode: string | null | undefined,
): ProductSpecPlanningMode | null {
  if (!mode) {
    return null;
  }
  if (mode === "plan_only" || mode === "child_action_graph_proposal") {
    return mode;
  }
  if (mode === "compile_ready") {
    return "compile_ready";
  }
  if (mode === "child_action_graph_proposals") {
    return "child_action_graph_proposal";
  }
  return null;
}

const ProductSpecPlanningModeSchema = z
  .enum(PRODUCT_SPEC_PLANNING_MODE_INPUTS)
  .transform(planningModeFromInput)
  .pipe(z.enum(PRODUCT_SPEC_PLANNING_MODES));

export const ProductSpecPlanningWorkerContractSchema = z
  .object({
    artifactKind: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_KIND),
    contractVersion: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION),
    planningMode: ProductSpecPlanningModeSchema,
    planningOutputKind: z.enum(PRODUCT_SPEC_PLANNING_OUTPUT_KINDS),
    workflowRefs: boundedStringList(12, 260),
    childActionProposalRefs: boundedStringList(20, 260),
    humanDecisionRefs: boundedStringList(12, 260),
    validationRefs: boundedStringList(20, 260),
    limitations: boundedStringList(10, 500),
    eli5Progress: boundedString(1_000),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
    workQueueLifecycleMutationAllowed: z.literal(false),
  })
  .strict();

export const ProductSpecPlanningResearchBriefSchema = z
  .object({
    artifactKind: z.literal("product_spec_planning_research_brief"),
    contractVersion: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION),
    researchBriefId: boundedString(160),
    sourceRefs: boundedStringList(24, 260).default([]),
    citationRefs: boundedStringList(24, 260),
    boundedClaims: boundedStringList(24, 600),
    assumptions: boundedStringList(12, 500).default([]),
    freshnessEvidence: boundedStringList(12, 260),
    staleExternalAssumptionFlags: boundedStringList(12, 260),
    researchLimitations: boundedStringList(12, 500),
    influencedPlanningCapsule: z.boolean(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawPageStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ProductSpecPlanningResearchBrief = z.infer<
  typeof ProductSpecPlanningResearchBriefSchema
>;

export type ProductSpecPlanningResearchBriefValidation = {
  accepted: boolean;
  researchBrief: ProductSpecPlanningResearchBrief | null;
  reasonCodes: string[];
};

export const ProductSpecPlanningCapsuleSchema = z
  .object({
    artifactKind: z.literal("product_spec_planning_capsule"),
    contractVersion: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION),
    capsuleId: boundedString(160),
    capsuleVersion: z.number().int().min(1).max(99),
    previousCapsuleRef: boundedString(260).nullable(),
    ownerObjectiveSummary: boundedString(1_200),
    workflowSelected: z.literal("agent_team.product_spec_planning"),
    planningMode: z.enum(PRODUCT_SPEC_PLANNING_MODES),
    problemStatement: boundedString(1_200),
    productGoals: boundedStringList(20, 500),
    nonGoals: boundedStringList(20, 500),
    userOperatorImpact: boundedString(1_200),
    technicalApproach: boundedString(2_000),
    affectedSystems: boundedStringList(20, 260),
    risksAndOpenQuestions: boundedStringList(24, 500),
    validationStrategy: boundedStringList(20, 500),
    rolloutRollbackNotes: boundedStringList(12, 500),
    researchInfluenceRefs: boundedStringList(20, 260),
    staleExternalAssumptionFlags: boundedStringList(12, 260),
    humanDecisionRefs: boundedStringList(12, 260),
    actionGraphProposalRefs: boundedStringList(24, 260),
    compileReadinessState: z.enum([
      "not_requested",
      "needs_validation",
      "blocked",
      "compile_ready",
    ]),
    limitations: boundedStringList(12, 500),
    eli5Progress: boundedString(1_000),
    modelAuthored: z.literal(true),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
    workQueueLifecycleMutationAllowed: z.literal(false),
  })
  .strict();

export type ProductSpecPlanningCapsule = z.infer<typeof ProductSpecPlanningCapsuleSchema>;

export const ProductSpecPlanningHumanDecisionRequestSchema = z
  .object({
    artifactKind: z.literal("product_spec_planning_human_decision_request"),
    contractVersion: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION),
    decisionRequestId: boundedString(160),
    concreteDecisionNeeded: boundedString(1_000),
    whyDecisionMatters: boundedString(1_000),
    optionsAndTradeoffs: boundedStringList(8, 600),
    whatHappensAfterEachOption: boundedStringList(8, 600),
    evidenceRefs: boundedStringList(20, 260),
    promptSummary: boundedString(1_000).optional(),
    requiredResponseShape: boundedString(600).optional(),
    blockingGraphRefs: boundedStringList(20, 260).default([]),
    resumeRefs: boundedStringList(12, 260).default([]),
    boundedResponseRefs: boundedStringList(12, 260).default([]),
    decisionRefs: boundedStringList(12, 260).default([]),
    deadlineExpiresAt: boundedString(80).nullable(),
    boundedResponseRefHandling: boundedString(600),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
    workQueueLifecycleMutationAllowed: z.literal(false),
  })
  .strict();

export type ProductSpecPlanningHumanDecisionRequest = z.infer<
  typeof ProductSpecPlanningHumanDecisionRequestSchema
>;

const ProductSpecPlanningActionStorageBoundarySchema = z
  .object({
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();

const PRODUCT_SPEC_PLANNING_ACTION_AUTHORITY_BOUNDARIES = [
  "proposal_only",
  "read_only",
  "requires_human_approval",
  "requires_compiler_authority",
] as const;

export const ProductSpecPlanningActionGraphProposalSchema = z
  .object({
    artifactKind: z.literal("product_spec_planning_action_graph_proposal"),
    contractVersion: z.literal(PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION),
    proposalId: boundedString(160),
    planningMode: z.enum(["child_action_graph_proposal", "compile_ready"]),
    proposedChildActions: z
      .array(
        z
          .object({
            actionId: boundedString(120),
            title: boundedString(180),
            objective: boundedString(1_000),
            assignedWorkflow: z.enum(PRODUCT_SPEC_PLANNING_CHILD_ACTION_WORKFLOWS),
            assignedRoleOrOwner: boundedString(160),
            dependencies: boundedStringList(20, 120),
            expectedEvidenceRefs: boundedStringList(20, 260),
            requiredContextRefs: boundedStringList(20, 260),
            validationExpectations: boundedStringList(12, 500),
            authorityBoundary: z.enum(PRODUCT_SPEC_PLANNING_ACTION_AUTHORITY_BOUNDARIES),
            storageBoundary: ProductSpecPlanningActionStorageBoundarySchema,
            runtimeJobCompileReadiness: z.enum(["not_requested", "blocked", "compile_ready"]),
            blockersOrRisks: boundedStringList(12, 500),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    dependencyValidationRef: boundedString(260),
    compileReadinessState: z.enum(["needs_validation", "blocked", "compile_ready"]),
    validationRefs: boundedStringList(20, 260),
    childActionsExecuted: z.literal(false),
    runtimeJobsCreated: z.literal(false),
    workQueueLifecycleMutationAllowed: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
  })
  .strict();

export type ProductSpecPlanningActionGraphProposal = z.infer<
  typeof ProductSpecPlanningActionGraphProposalSchema
>;

export type ProductSpecPlanningWorkerContract = z.infer<
  typeof ProductSpecPlanningWorkerContractSchema
>;

export type ProductSpecPlanningWorkerContractValidation = {
  accepted: boolean;
  contract: ProductSpecPlanningWorkerContract | null;
  reasonCodes: string[];
};

export function parseProductSpecPlanningWorkerContract(
  value: unknown,
): ProductSpecPlanningWorkerContract {
  return ProductSpecPlanningWorkerContractSchema.parse(value);
}

export function validateProductSpecPlanningResearchBrief(
  value: unknown,
): ProductSpecPlanningResearchBriefValidation {
  const parsed = ProductSpecPlanningResearchBriefSchema.safeParse(value);
  if (!parsed.success) {
    return {
      accepted: false,
      researchBrief: null,
      reasonCodes: [
        "product_spec_planning_research_brief_schema_invalid",
        ...parsed.error.issues.slice(0, 10).map((issue) => {
          const suffix = issue.path.join("_") || "root";
          return `product_spec_planning_research_brief_invalid_${suffix}`;
        }),
      ],
    };
  }
  const researchBrief = parsed.data;
  const reasonCodes: string[] = [];
  if (researchBrief.boundedClaims.length > 0 && researchBrief.citationRefs.length === 0) {
    reasonCodes.push("product_spec_planning_research_brief_citation_refs_missing");
  }
  if (researchBrief.boundedClaims.length > 0 && researchBrief.sourceRefs.length === 0) {
    reasonCodes.push("product_spec_planning_research_brief_source_refs_missing");
  }
  if (researchBrief.assumptions.length === 0) {
    reasonCodes.push("product_spec_planning_research_brief_assumptions_missing");
  }
  if (
    [...researchBrief.citationRefs, ...researchBrief.sourceRefs].some((ref) =>
      /raw-page|raw_content|provider-log|tool-log/iu.test(ref),
    )
  ) {
    reasonCodes.push("product_spec_planning_research_brief_raw_source_ref_not_allowed");
  }
  return {
    accepted: reasonCodes.length === 0,
    researchBrief,
    reasonCodes,
  };
}

function hasProductSpecPlanningRawStorageRef(ref: string): boolean {
  return /raw[-_ ]?(page|content|prompt|response|transcript|log|db[-_ ]?row)|provider[-_ ]?log|tool[-_ ]?log|command[-_ ]?log|hidden[-_ ]?reasoning|secret/iu.test(
    ref,
  );
}

function productSpecPlanningActionGraphPreparseReasonCodes(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.proposedChildActions)) {
    return [];
  }
  const allowedAuthorityBoundaries = new Set<string>(
    PRODUCT_SPEC_PLANNING_ACTION_AUTHORITY_BOUNDARIES,
  );
  return record.proposedChildActions.flatMap((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return [];
    }
    const actionRecord = action as Record<string, unknown>;
    const authorityBoundary = actionRecord.authorityBoundary;
    if (
      typeof authorityBoundary !== "string" ||
      allowedAuthorityBoundaries.has(authorityBoundary)
    ) {
      return [];
    }
    const actionId =
      typeof actionRecord.actionId === "string" && actionRecord.actionId.trim().length > 0
        ? actionRecord.actionId.trim()
        : `index_${index}`;
    return [`product_spec_planning_action_graph_invalid_authority:${actionId}`];
  });
}

export function validateProductSpecPlanningActionGraphProposal(value: unknown) {
  const parsed = ProductSpecPlanningActionGraphProposalSchema.safeParse(value);
  const invalidResult = (reasonCodes: string[]) => ({
    accepted: false,
    compileReady: false,
    proposal: null,
    proposedChildActionRefs: [],
    reasonCodes,
    runtimeJobsCreated: false as const,
    childActionsExecuted: false as const,
    workQueueLifecycleMutationAllowed: false as const,
  });
  if (!parsed.success) {
    return invalidResult([
      "product_spec_planning_action_graph_proposal_schema_invalid",
      ...productSpecPlanningActionGraphPreparseReasonCodes(value),
      ...parsed.error.issues.slice(0, 10).map((issue) => {
        const suffix = issue.path.join("_") || "root";
        return `product_spec_planning_action_graph_proposal_invalid_${suffix}`;
      }),
    ]);
  }
  const proposal = parsed.data;
  const reasonCodes: string[] = [];
  const ids = new Set(proposal.proposedChildActions.map((action) => action.actionId));
  if (ids.size !== proposal.proposedChildActions.length) {
    reasonCodes.push("product_spec_planning_action_graph_duplicate_action_id");
  }
  for (const action of proposal.proposedChildActions) {
    const actionCompileReady = action.runtimeJobCompileReadiness === "compile_ready";
    if (actionCompileReady && action.expectedEvidenceRefs.length === 0) {
      reasonCodes.push(
        `product_spec_planning_action_graph_evidence_refs_missing:${action.actionId}`,
      );
    }
    if (actionCompileReady && action.requiredContextRefs.length === 0) {
      reasonCodes.push(
        `product_spec_planning_action_graph_context_refs_missing:${action.actionId}`,
      );
    }
    if (
      [...action.expectedEvidenceRefs, ...action.requiredContextRefs].some((ref) =>
        hasProductSpecPlanningRawStorageRef(ref),
      )
    ) {
      reasonCodes.push(
        `product_spec_planning_action_graph_raw_storage_ref_not_allowed:${action.actionId}`,
      );
    }
    for (const dependency of action.dependencies) {
      if (!ids.has(dependency)) {
        reasonCodes.push(`product_spec_planning_action_graph_missing_dependency:${dependency}`);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(proposal.proposedChildActions.map((action) => [action.actionId, action]));
  const visit = (actionId: string): void => {
    if (visited.has(actionId)) {
      return;
    }
    if (visiting.has(actionId)) {
      reasonCodes.push(`product_spec_planning_action_graph_dependency_cycle:${actionId}`);
      return;
    }
    visiting.add(actionId);
    for (const dependency of byId.get(actionId)?.dependencies ?? []) {
      if (byId.has(dependency)) {
        visit(dependency);
      }
    }
    visiting.delete(actionId);
    visited.add(actionId);
  };
  for (const actionId of ids) {
    visit(actionId);
  }
  const compileReady =
    reasonCodes.length === 0 &&
    proposal.compileReadinessState === "compile_ready" &&
    proposal.proposedChildActions.every(
      (action) => action.runtimeJobCompileReadiness === "compile_ready",
    );
  if (proposal.compileReadinessState === "compile_ready" && !compileReady) {
    reasonCodes.push("product_spec_planning_action_graph_compile_ready_blocked");
  }
  return {
    accepted: reasonCodes.length === 0,
    compileReady,
    proposal,
    proposedChildActionRefs: proposal.proposedChildActions.map(
      (action) => `action-graph-proposal://${proposal.proposalId}/${action.actionId}`,
    ),
    reasonCodes,
    runtimeJobsCreated: false as const,
    childActionsExecuted: false as const,
    workQueueLifecycleMutationAllowed: false as const,
  };
}

export function validateProductSpecPlanningWorkerContract(
  value: unknown,
): ProductSpecPlanningWorkerContractValidation {
  const parsed = ProductSpecPlanningWorkerContractSchema.safeParse(value);
  if (!parsed.success) {
    return {
      accepted: false,
      contract: null,
      reasonCodes: [
        "product_spec_planning_worker_contract_schema_invalid",
        ...parsed.error.issues.slice(0, 10).map((issue) => {
          const suffix = issue.path.join("_") || "root";
          return `product_spec_planning_worker_contract_invalid_${suffix}`;
        }),
      ],
    };
  }
  const contract = parsed.data;
  const reasonCodes: string[] = [];
  if (contract.planningOutputKind !== outputKindForPlanningMode(contract.planningMode)) {
    reasonCodes.push("product_spec_planning_worker_contract_mode_output_mismatch");
  }
  if (contract.planningMode === "plan_only" && contract.childActionProposalRefs.length > 0) {
    reasonCodes.push("product_spec_planning_worker_contract_plan_only_has_child_action_refs");
  }
  if (contract.planningMode !== "plan_only" && contract.childActionProposalRefs.length === 0) {
    reasonCodes.push("product_spec_planning_worker_contract_child_action_refs_missing");
  }
  if (contract.humanDecisionRefs.length === 0) {
    reasonCodes.push("product_spec_planning_worker_contract_human_decision_refs_missing");
  }
  if (
    contract.humanDecisionRefs.length > 0 &&
    !contract.humanDecisionRefs.some(
      (ref) => resolveProductSpecPlanningModeFromDecisionRef(ref) !== null,
    )
  ) {
    reasonCodes.push("product_spec_planning_worker_contract_human_decision_default_missing");
  }
  const resolvedDecisionModes = uniqueResolvedPlanningModesFromDecisionRefs(
    contract.humanDecisionRefs,
  );
  if (resolvedDecisionModes.length > 1) {
    reasonCodes.push("product_spec_planning_worker_contract_human_decision_defaults_conflict");
  } else if (
    resolvedDecisionModes.length === 1 &&
    contract.planningMode !== resolvedDecisionModes[0]
  ) {
    reasonCodes.push("product_spec_planning_worker_contract_mode_human_decision_default_mismatch");
  }

  if (!contract.workflowRefs.some((ref) => ref.startsWith("workflow://"))) {
    reasonCodes.push("product_spec_planning_worker_contract_workflow_ref_missing");
  }
  if (
    !contract.workflowRefs.some((ref) =>
      PRODUCT_SPEC_PLANNING_FIRST_CLASS_WORKFLOW_REFS.some((prefix) => ref.startsWith(prefix)),
    )
  ) {
    reasonCodes.push("product_spec_planning_worker_contract_workflow_not_first_class");
  }
  const invalidChildActionProposalRefs = contract.childActionProposalRefs.filter(
    (ref) => !isRuntimeWorkGraphRef(ref),
  );
  if (invalidChildActionProposalRefs.length > 0) {
    reasonCodes.push("product_spec_planning_worker_contract_child_action_refs_invalid");
  }
  if (
    contract.planningMode !== "plan_only" &&
    !contract.workflowRefs.some((ref) => isRuntimeWorkGraphRef(ref))
  ) {
    reasonCodes.push("product_spec_planning_worker_contract_runtime_graph_ref_missing");
  }

  return {
    accepted: reasonCodes.length === 0,
    contract,
    reasonCodes,
  };
}

export function resolveProductSpecPlanningModeFromDecisionRef(
  boundedDecisionRef: string | null | undefined,
): ProductSpecPlanningMode | null {
  const decisionRef = boundedDecisionRef?.trim().toLowerCase();
  if (!decisionRef) {
    return null;
  }
  const mapped = PRODUCT_SPEC_PLANNING_MODE_BY_OWNER_DECISION_PREFIX.find((entry) =>
    decisionRef.startsWith(entry.prefix),
  );
  return mapped?.mode ?? null;
}

export function resolveProductSpecPlanningModeForPrompt(input: {
  boundedDecisionRef: string | null | undefined;
  objectiveSummary: string | null | undefined;
  fallbackMode?: ProductSpecPlanningMode;
}): ProductSpecPlanningMode {
  const fallbackMode = input.fallbackMode ?? "plan_only";
  const decisionMode = resolveProductSpecPlanningModeFromDecisionRef(input.boundedDecisionRef);
  if (decisionMode) {
    return decisionMode;
  }
  const objective = input.objectiveSummary?.toLowerCase() ?? "";
  const asksForImplementationPlanning = PRODUCT_SPEC_PLANNING_IMPLEMENTATION_HINTS.some((hint) =>
    objective.includes(hint),
  );
  return asksForImplementationPlanning ? "child_action_graph_proposal" : fallbackMode;
}

export function resolveProductSpecPlanningDefaultModeFromDecision(input: {
  boundedDecisionRef: string | null | undefined;
  fallbackMode?: ProductSpecPlanningMode;
}): ProductSpecPlanningMode {
  const fallbackMode = input.fallbackMode ?? "plan_only";
  return resolveProductSpecPlanningModeFromDecisionRef(input.boundedDecisionRef) ?? fallbackMode;
}

export function createProductSpecPlanningWorkerContract(input: {
  planningMode: ProductSpecPlanningMode;
  workflowRefs: string[];
  childActionProposalRefs?: string[];
  humanDecisionRefs: string[];
  validationRefs: string[];
  limitations: string[];
  eli5Progress: string;
}): ProductSpecPlanningWorkerContract {
  const planningOutputKind: ProductSpecPlanningOutputKind = outputKindForPlanningMode(
    input.planningMode,
  );
  const contract = parseProductSpecPlanningWorkerContract({
    artifactKind: PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_KIND,
    contractVersion: PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION,
    planningMode: input.planningMode,
    planningOutputKind,
    workflowRefs: input.workflowRefs,
    childActionProposalRefs:
      input.planningMode === "plan_only" ? [] : (input.childActionProposalRefs ?? []),
    humanDecisionRefs: input.humanDecisionRefs,
    validationRefs: input.validationRefs,
    limitations: input.limitations,
    eli5Progress: input.eli5Progress,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  });
  const validation = validateProductSpecPlanningWorkerContract(contract);
  if (!validation.accepted) {
    throw new Error(
      `product_spec_planning_worker_contract_invalid:${validation.reasonCodes.join(",")}`,
    );
  }
  return contract;
}
