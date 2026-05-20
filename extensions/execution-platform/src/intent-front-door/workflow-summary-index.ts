import { createHash } from "node:crypto";
import type {
  ExecutionWorkflowContract,
  WorkQueueProjectionContract,
} from "../workflows/workflow-contract.ts";
import type { WorkflowRegistry } from "../workflows/workflow-registry.ts";
import type { ConversationRoutingContext } from "./conversation-routing-context.ts";

export const WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION = "workflow-summary-index.v1";
export const WORKFLOW_SUMMARY_MAX_DESCRIPTION_CHARS = 360;
export const WORKFLOW_SUMMARY_MAX_EXAMPLE_CHARS = 180;
export const WORKFLOW_SUMMARY_MAX_EXAMPLES = 4;
export const WORKFLOW_SUMMARY_MAX_ROUTING_HINTS = 6;
export const WORKFLOW_SUMMARY_MAX_AUTHORITY_PROFILES = 12;
export const WORKFLOW_SUMMARY_MAX_PROJECTION_FIELDS = 20;
export const WORKFLOW_SUMMARY_DEFAULT_MAX_CANDIDATES = 8;
export const WORKFLOW_SUMMARY_DEFAULT_MAX_TOTAL_CHARS = 12_000;

export type WorkflowSummaryIndexEntry = {
  schemaVersion: typeof WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION;
  workflowId: string;
  displayName: string;
  jobType: string;
  status: ExecutionWorkflowContract["status"];
  executable: boolean;
  executorKind: ExecutionWorkflowContract["executorKind"];
  descriptionSummary: string;
  positiveExamples: string[];
  negativeExamples: string[];
  routingHints: string[];
  supportedAuthorityProfiles: string[];
  defaultAuthorityProfile: string;
  sideEffectPolicySummary: {
    productionDeployAllowed: false;
    externalOutboundWriteAllowed: false;
    productionModelPromotionAllowed: false;
  };
  requiredInputSummary: {
    schemaId: string;
    requiredFields: string[];
  };
  workQueueProjectionSummary: {
    projectionId: string;
    genericFields: string[];
    extensionFields: string[];
    lifecycleMutationAllowed: false;
  };
  childWorkflowSupportSummary: {
    supportsChildWorkflows: boolean;
    childWorkflowIds: string[];
  };
  capabilitySummary: {
    executableCapabilities: string[];
    subjectDomains: string[];
    targetRefKindsSupported: string[];
    canImplementCode: boolean;
    canPlan: boolean;
    canReview: boolean;
    canResearch: boolean;
    canCreateChildProposals: boolean;
    canCompileRuntimeJobs: boolean;
    canExecuteRuntimeJobs: boolean;
    canMutateWorkQueueLifecycle: false;
  };
  modelTransportPolicyRefs: {
    roleModelPolicyRefs: string[];
    transportIds: string[];
  };
  rawStoragePolicy: {
    rawPromptStored: false;
    rawResponseStored: false;
    rawTranscriptStored: false;
  };
  reasonCodes: string[];
};

export type WorkflowSummaryIndex = {
  artifactKind: "workflow_summary_index";
  schemaVersion: typeof WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION;
  workflowRegistryVersion: string;
  generatedAt: string;
  summaries: WorkflowSummaryIndexEntry[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkflowSummaryCandidateSelectionInput = {
  index: WorkflowSummaryIndex;
  context?: ConversationRoutingContext | null;
  explicitWorkflowIds?: string[];
  suggestedWorkflowIds?: string[];
  maxCandidates?: number;
  maxTotalChars?: number;
  includeDisabled?: boolean;
};

export type WorkflowSummaryCandidateSelection = {
  workflowRegistryVersion: string;
  candidates: WorkflowSummaryIndexEntry[];
  reasonCodes: string[];
  finalRouteDecisionMade: false;
  authorityGranted: false;
  runtimeJobCreated: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

function boundedText(value: string, maxLength: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function boundedTextList(values: string[], maxItems: number, maxLength: number): string[] {
  return values.slice(0, maxItems).map((value) => boundedText(value, maxLength));
}

function summarizeProjection(
  projection: WorkQueueProjectionContract,
): WorkflowSummaryIndexEntry["workQueueProjectionSummary"] {
  return {
    projectionId: projection.projectionId,
    genericFields: projection.genericFields.slice(0, WORKFLOW_SUMMARY_MAX_PROJECTION_FIELDS),
    extensionFields: projection.extensionFields.slice(0, WORKFLOW_SUMMARY_MAX_PROJECTION_FIELDS),
    lifecycleMutationAllowed: false,
  };
}

function summarizeExecutableCapabilities(contract: ExecutionWorkflowContract): string[] {
  const actionKinds = new Set(contract.permissionModel?.allowedLocalActionKinds ?? []);
  const validationKinds = new Set(contract.validationGates.map((gate) => gate.validationKind));
  const roleAuthorities = new Set(contract.roles.map((role) => role.authority));
  const roleIds = new Set(contract.roles.map((role) => role.roleId));
  const capabilities = new Set<string>();

  if (contract.workflowId === "agent_team.coding" || actionKinds.has("file_edit")) {
    capabilities.add("code_edit");
  }
  if (actionKinds.has("test_run") || validationKinds.has("focused_tests")) {
    capabilities.add("test");
  }
  if (actionKinds.has("docs_update") || contract.workflowId.includes("docs")) {
    capabilities.add("docs_update");
  }
  if (actionKinds.has("repo_read") || actionKinds.has("git_inspect")) {
    capabilities.add("plan");
  }
  if (actionKinds.has("closeout_emit") || roleAuthorities.has("closeout")) {
    capabilities.add("closeout");
  }
  if (roleAuthorities.has("review") || validationKinds.size > 0) {
    capabilities.add("review");
  }
  if (contract.workflowId.includes("web_research") || roleIds.has("web_researcher")) {
    capabilities.add("research");
  }
  if (
    (contract.childWorkflowRefs ?? []).some(
      (child) => child.allowed && child.workflowId.includes("web_research"),
    )
  ) {
    capabilities.add("research");
  }
  if (
    contract.workflowId.includes("product_spec_planning") ||
    actionKinds.has("propose_child_actions")
  ) {
    capabilities.add("plan");
    capabilities.add("action_graph_proposal");
    capabilities.add("human_decision");
  }
  if (contract.permissionModel?.approvalRequiredActionKinds.includes("create_runtime_jobs")) {
    capabilities.add("runtime_job_compile");
  }
  return Array.from(capabilities).toSorted();
}

function summarizeSubjectDomains(contract: ExecutionWorkflowContract): string[] {
  const domains = new Set<string>(["workflow", "work_queue_item"]);
  if (contract.workflowId.includes("coding")) {
    domains.add("repo");
    domains.add("spec");
    domains.add("workflow");
  }
  if (contract.workflowId.includes("product_spec_planning")) {
    domains.add("product_spec");
    domains.add("planning_capsule");
    domains.add("action_graph");
  }
  if (contract.workflowId.includes("web_research")) {
    domains.add("external_source");
    domains.add("research_brief");
  }
  if (contract.workflowId.includes("docs")) {
    domains.add("docs");
    domains.add("skills");
  }
  return Array.from(domains).toSorted();
}

export function createWorkflowSummaryIndexEntry(
  contract: ExecutionWorkflowContract,
): WorkflowSummaryIndexEntry {
  const executableCapabilities = summarizeExecutableCapabilities(contract);
  return {
    schemaVersion: WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION,
    workflowId: contract.workflowId,
    displayName: boundedText(contract.displayName, 120),
    jobType: contract.jobType,
    status: contract.status,
    executable: contract.status === "enabled",
    executorKind: contract.executorKind,
    descriptionSummary: boundedText(contract.description, WORKFLOW_SUMMARY_MAX_DESCRIPTION_CHARS),
    positiveExamples: boundedTextList(
      contract.intentPatterns.examples,
      WORKFLOW_SUMMARY_MAX_EXAMPLES,
      WORKFLOW_SUMMARY_MAX_EXAMPLE_CHARS,
    ),
    negativeExamples: boundedTextList(
      contract.intentPatterns.negativeExamples,
      WORKFLOW_SUMMARY_MAX_EXAMPLES,
      WORKFLOW_SUMMARY_MAX_EXAMPLE_CHARS,
    ),
    routingHints: boundedTextList(
      contract.intentPatterns.routingHints,
      WORKFLOW_SUMMARY_MAX_ROUTING_HINTS,
      WORKFLOW_SUMMARY_MAX_EXAMPLE_CHARS,
    ),
    supportedAuthorityProfiles: contract.supportedAuthorityProfiles.slice(
      0,
      WORKFLOW_SUMMARY_MAX_AUTHORITY_PROFILES,
    ),
    defaultAuthorityProfile: contract.defaultAuthorityProfile,
    sideEffectPolicySummary: {
      productionDeployAllowed: false,
      externalOutboundWriteAllowed: false,
      productionModelPromotionAllowed: false,
    },
    requiredInputSummary: {
      schemaId: contract.inputSchema.schemaId,
      requiredFields: contract.inputSchema.requiredFields.slice(0, 20),
    },
    workQueueProjectionSummary: summarizeProjection(contract.workQueueProjection),
    childWorkflowSupportSummary: {
      supportsChildWorkflows: Boolean(contract.childWorkflowRefs?.some((child) => child.allowed)),
      childWorkflowIds: (contract.childWorkflowRefs ?? [])
        .filter((child) => child.allowed)
        .map((child) => child.workflowId)
        .slice(0, 12),
    },
    capabilitySummary: {
      executableCapabilities,
      subjectDomains: summarizeSubjectDomains(contract),
      targetRefKindsSupported: ["workflow", "work_queue_item", "repo", "spec", "docs"].filter(
        (kind) =>
          summarizeSubjectDomains(contract).includes(kind) ||
          ["workflow", "work_queue_item"].includes(kind),
      ),
      canImplementCode: executableCapabilities.includes("code_edit"),
      canPlan: executableCapabilities.includes("plan"),
      canReview: executableCapabilities.includes("review"),
      canResearch: executableCapabilities.includes("research"),
      canCreateChildProposals: executableCapabilities.includes("action_graph_proposal"),
      canCompileRuntimeJobs: executableCapabilities.includes("runtime_job_compile"),
      canExecuteRuntimeJobs: contract.status === "enabled",
      canMutateWorkQueueLifecycle: false,
    },
    modelTransportPolicyRefs: {
      roleModelPolicyRefs: contract.roles
        .flatMap((role) => (role.modelPolicyRef ? [role.modelPolicyRef] : []))
        .slice(0, 20),
      transportIds: contract.transports.map((transport) => transport.transportId).slice(0, 20),
    },
    rawStoragePolicy: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
    },
    reasonCodes:
      contract.status === "enabled" ? ["workflow_enabled"] : [`workflow_${contract.status}`],
  };
}

export function computeWorkflowRegistryVersion(
  summaries: Pick<
    WorkflowSummaryIndexEntry,
    "workflowId" | "status" | "jobType" | "schemaVersion"
  >[],
): string {
  const hash = createHash("sha256");
  hash.update(WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION);
  for (const summary of summaries.toSorted((left, right) =>
    left.workflowId.localeCompare(right.workflowId),
  )) {
    hash.update(
      `${summary.workflowId}:${summary.jobType}:${summary.status}:${summary.schemaVersion};`,
    );
  }
  return `workflow-registry:${hash.digest("hex").slice(0, 16)}`;
}

export function buildWorkflowSummaryIndex(
  registry: WorkflowRegistry,
  options: { generatedAt?: string } = {},
): WorkflowSummaryIndex {
  const summaries = registry.workflows.map(createWorkflowSummaryIndexEntry);
  return {
    artifactKind: "workflow_summary_index",
    schemaVersion: WORKFLOW_SUMMARY_INDEX_SCHEMA_VERSION,
    workflowRegistryVersion: computeWorkflowRegistryVersion(summaries),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summaries,
    reasonCodes: ["workflow_summary_index_bounded", "summary_index_does_not_decide_final_route"],
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export function selectWorkflowSummaryCandidates(
  input: WorkflowSummaryCandidateSelectionInput,
): WorkflowSummaryCandidateSelection {
  const maxCandidates = Math.max(1, input.maxCandidates ?? WORKFLOW_SUMMARY_DEFAULT_MAX_CANDIDATES);
  const maxTotalChars = Math.max(
    1_000,
    input.maxTotalChars ?? WORKFLOW_SUMMARY_DEFAULT_MAX_TOTAL_CHARS,
  );
  const explicit = new Set([
    ...(input.explicitWorkflowIds ?? []),
    ...(input.suggestedWorkflowIds ?? []),
  ]);
  const selected: WorkflowSummaryIndexEntry[] = [];
  const reasonCodes = [
    "candidate_selection_metadata_only",
    "candidate_selection_does_not_decide_final_route",
  ];

  const ordered = input.index.summaries.toSorted((left, right) => {
    const leftExplicit = explicit.has(left.workflowId) ? 0 : 1;
    const rightExplicit = explicit.has(right.workflowId) ? 0 : 1;
    if (leftExplicit !== rightExplicit) {
      return leftExplicit - rightExplicit;
    }
    const leftExecutable = left.executable ? 0 : 1;
    const rightExecutable = right.executable ? 0 : 1;
    if (leftExecutable !== rightExecutable) {
      return leftExecutable - rightExecutable;
    }
    return left.workflowId.localeCompare(right.workflowId);
  });

  let serializedChars = 0;
  for (const candidate of ordered) {
    if (!input.includeDisabled && !candidate.executable && !explicit.has(candidate.workflowId)) {
      continue;
    }
    if (selected.length >= maxCandidates) {
      reasonCodes.push("candidate_count_bounded");
      break;
    }
    const nextLength = JSON.stringify(candidate).length;
    if (serializedChars + nextLength > maxTotalChars) {
      reasonCodes.push("candidate_size_bounded");
      break;
    }
    selected.push(candidate);
    serializedChars += nextLength;
  }

  if (
    input.context?.workflowRegistryVersion &&
    input.context.workflowRegistryVersion !== input.index.workflowRegistryVersion
  ) {
    reasonCodes.push("context_workflow_registry_version_mismatch");
  }

  return {
    workflowRegistryVersion: input.index.workflowRegistryVersion,
    candidates: selected,
    reasonCodes,
    finalRouteDecisionMade: false,
    authorityGranted: false,
    runtimeJobCreated: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
