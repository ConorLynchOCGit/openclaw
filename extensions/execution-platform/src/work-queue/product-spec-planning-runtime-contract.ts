export {
  PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_KIND as PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_ARTIFACT_KIND,
  PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE as PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_ARTIFACT_TYPE,
  PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_VERSION as PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_VERSION,
  PRODUCT_SPEC_PLANNING_MODES as PRODUCT_SPEC_PLANNING_RUNTIME_MODES,
  PRODUCT_SPEC_PLANNING_OUTPUT_KINDS as PRODUCT_SPEC_PLANNING_RUNTIME_OUTPUT_KINDS,
  PRODUCT_SPEC_PLANNING_FIRST_CLASS_WORKFLOW_REFS as PRODUCT_SPEC_PLANNING_RUNTIME_FIRST_CLASS_WORKFLOW_REFS,
  ProductSpecPlanningWorkerContractSchema as ProductSpecPlanningRuntimeContractSchema,
  parseProductSpecPlanningWorkerContract as parseProductSpecPlanningRuntimeContract,
  validateProductSpecPlanningWorkerContract as validateProductSpecPlanningRuntimeContract,
  normalizeProductSpecPlanningMode as normalizeProductSpecPlanningRuntimeMode,
  resolveProductSpecPlanningModeFromDecisionRef as resolveProductSpecPlanningRuntimeModeFromDecisionRef,
  resolveProductSpecPlanningModeForPrompt as resolveProductSpecPlanningRuntimeModeForPrompt,
  resolveProductSpecPlanningDefaultModeFromDecision as resolveProductSpecPlanningRuntimeDefaultModeFromDecision,
  createProductSpecPlanningWorkerContract as createProductSpecPlanningRuntimeContract,
} from "./product-spec-planning-worker-contract.ts";

export type {
  ProductSpecPlanningMode as ProductSpecPlanningRuntimeMode,
  ProductSpecPlanningOutputKind as ProductSpecPlanningRuntimeOutputKind,
  ProductSpecPlanningWorkerContract as ProductSpecPlanningRuntimeContract,
  ProductSpecPlanningWorkerContractValidation as ProductSpecPlanningRuntimeContractValidation,
} from "./product-spec-planning-worker-contract.ts";

export const PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CANONICAL_REFS = [
  "workflow://agent_team.product_spec_planning",
  "workflow://single_agent.web_research",
  "workflow://workflow.docs_skills",
  "workflow://agent_team.architecture",
  "workflow://agent_team.coding",
  "workflow://agent_team.qa_test",
] as const;

export const PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_STORAGE_POLICY = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawLogsStored: false,
  workQueueLifecycleMutationAllowed: false,
} as const;

export const PRODUCT_SPEC_PLANNING_RUNTIME_CONTRACT_CLOSEOUT_POLICY = {
  compileBoundaryRequired: true,
  childActionsAutoExecuted: false,
  missionLedgerGateRequired: true,
} as const;
