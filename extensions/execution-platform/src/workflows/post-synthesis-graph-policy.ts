import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";
import type {
  OrchestratorGraphDecision,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export const POST_SYNTHESIS_ROLE_OBLIGATIONS = [
  "implementation",
  "validation",
  "review",
  "docs_or_readback",
  "closeout",
] as const;

export type PostSynthesisRoleObligation = (typeof POST_SYNTHESIS_ROLE_OBLIGATIONS)[number];

export type PostSynthesisGraphQualityReport = {
  artifactKind: "post_synthesis_graph_quality_report";
  schemaVersion: "execution-platform.post-synthesis-graph-quality.v1";
  applies: boolean;
  workflowId: string;
  requiredRoleObligations: PostSynthesisRoleObligation[];
  presentRoleObligations: PostSynthesisRoleObligation[];
  missingRoleObligations: PostSynthesisRoleObligation[];
  nodeCount: number;
  edgeCount: number;
  broadCodexNodeCount: number;
  cheapOrSpecializedNodeCount: number;
  premiumNodeCount: number;
  broadCodexShare: number;
  premiumShare: number;
  nodeSummaries: Array<{
    nodeId: string;
    nodeKind: string;
    capabilityId: string | null;
    roleObligations: PostSynthesisRoleObligation[];
    costClass: string | null;
    commitmentIds: string[];
    consideredCapabilityIds: string[];
  }>;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type PostSynthesisGraphPolicyValidation = {
  valid: boolean;
  reasonCodes: string[];
  report: PostSynthesisGraphQualityReport;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type PostSynthesisRoleObligationGuidance = {
  artifactKind: "post_synthesis_role_obligation_guidance";
  schemaVersion: "execution-platform.post-synthesis-role-obligations.v1";
  applies: boolean;
  workflowId: string;
  requiredRoleObligations: Array<{
    obligation: PostSynthesisRoleObligation;
    purpose: string;
    validCapabilityIds: string[];
    preferredCapabilityIds: string[];
    escalationOnlyCapabilityIds: string[];
    validGraphNodeKinds: string[];
    requiredInNextPostSynthesisGraph: boolean;
    modelOwnedFieldsRequired: Array<
      | "workBreakdownUnits"
      | "capabilitySelectionsForWorkUnits"
      | "nodeContractDrafts"
      | "edgeOrParallelismDraft"
    >;
  }>;
  compilerOwnedFields: string[];
  modelOwnedFields: string[];
  repairInstruction: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function jsonRecord(value: JsonValue | unknown | undefined | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 240))
        .slice(0, 32)
    : [];
}

function missionIsComplex(ledger: MissionContractLedger | null): boolean {
  return Boolean(
    ledger && ledger.blockingCommitments.length + ledger.nonBlockingCommitments.length > 1,
  );
}

function isContextSynthesisAccepted(summary: RuntimeWorkGraphSchedulerSnapshotSummary): boolean {
  return summary.nodeSummaries.some(
    (node) =>
      node.nodeStatus === "succeeded" &&
      (node.nodeKind === "context_synthesis" ||
        node.assignedRole === "context_synthesis" ||
        node.capabilityId === "context_synthesis"),
  );
}

function capabilityForNode(
  node: OrchestratorGraphNodeSpec,
  manifest: RuntimeNodeCapabilityManifest,
): RuntimeNodeCapability | null {
  return node.capabilityId ? findRuntimeNodeCapability(node.capabilityId, manifest) : null;
}

function roleObligationsForCapability(
  capability: RuntimeNodeCapability,
): PostSynthesisRoleObligation[] {
  const node: OrchestratorGraphNodeSpec = {
    nodeId: capability.capabilityId,
    nodeKind: capability.graphNodeKind,
    capabilityId: capability.capabilityId,
    assignedRole: capability.roleId,
    inputHandoffRefs: [],
    expectedOutput: "",
    acceptanceCriteria: [],
    downstreamConsumer: "",
    commitmentIdsAdvanced: [],
    whyThisRoleIsNeededNow: "",
    exactObjective: "",
    evidenceExpectation: null,
    targetRefs: [],
    metadata: null,
  };
  return nodeRoleObligations(node, capability);
}

function purposeForObligation(role: PostSynthesisRoleObligation): string {
  switch (role) {
    case "implementation":
      return "Apply source/test/docs edits needed by the accepted synthesis and Mission Ledger commitments.";
    case "validation":
      return "Run or author focused validation and map validation refs back to the commitments.";
    case "review":
      return "Model-review source, validation, storage, authority, evidence, and limitations before closeout.";
    case "docs_or_readback":
      return "Produce owner-facing readback or docs evidence so the Work Queue can explain graph state, files, tests, limitations, and next action.";
    case "closeout":
      return "Generate a model-authored Closeout Capsule after accepted runtime evidence exists.";
  }
  return role satisfies never;
}

export function buildPostSynthesisRoleObligationGuidance(input: {
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): PostSynthesisRoleObligationGuidance {
  const applies = postSynthesisPolicyApplies({
    decision: {
      decisionId: "post-synthesis-guidance-probe",
      decisionKind: "add_nodes",
      rationaleForDecision: "Probe whether post-synthesis guidance applies.",
      newNodes: [
        {
          nodeId: "post-synthesis-guidance-probe",
          nodeKind: "implementation",
          capabilityId: "implementation_microtask",
          assignedRole: "implementation_engineer",
          inputHandoffRefs: [],
          expectedOutput: "",
          acceptanceCriteria: [],
          downstreamConsumer: "",
          commitmentIdsAdvanced: [],
          whyThisRoleIsNeededNow: "",
          exactObjective: "",
          evidenceExpectation: null,
          targetRefs: [],
          metadata: null,
        },
      ],
      reasonCodes: ["post_synthesis_guidance_probe"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
    snapshotSummary: input.snapshotSummary,
    missionLedger: input.missionLedger,
  });
  const requiredRoleObligations = POST_SYNTHESIS_ROLE_OBLIGATIONS.map((obligation) => {
    const matchingCapabilities = input.capabilityManifest.capabilities.filter((capability) =>
      roleObligationsForCapability(capability).includes(obligation),
    );
    const preferredCapabilities = matchingCapabilities.filter(
      (capability) =>
        capability.capabilityId !== "implementation_complex" && capability.costClass !== "premium",
    );
    const escalationOnlyCapabilities = matchingCapabilities.filter(
      (capability) =>
        capability.capabilityId === "implementation_complex" || capability.costClass === "premium",
    );
    return {
      obligation,
      purpose: purposeForObligation(obligation),
      validCapabilityIds: matchingCapabilities
        .map((capability) => capability.capabilityId)
        .slice(0, 12),
      preferredCapabilityIds: preferredCapabilities
        .map((capability) => capability.capabilityId)
        .slice(0, 12),
      escalationOnlyCapabilityIds: escalationOnlyCapabilities
        .map((capability) => capability.capabilityId)
        .slice(0, 12),
      validGraphNodeKinds: [
        ...new Set(matchingCapabilities.map((capability) => capability.graphNodeKind)),
      ].slice(0, 12),
      requiredInNextPostSynthesisGraph: applies,
      modelOwnedFieldsRequired: [
        "workBreakdownUnits",
        "capabilitySelectionsForWorkUnits",
        "nodeContractDrafts",
        "edgeOrParallelismDraft",
      ] as PostSynthesisRoleObligationGuidance["requiredRoleObligations"][number]["modelOwnedFieldsRequired"],
    };
  });
  return {
    artifactKind: "post_synthesis_role_obligation_guidance",
    schemaVersion: "execution-platform.post-synthesis-role-obligations.v1",
    applies,
    workflowId: input.snapshotSummary.workflowId,
    requiredRoleObligations,
    compilerOwnedFields: [
      "graphNodeKind",
      "nodeKind",
      "executorKey",
      "workerRef",
      "requiredMetadataSchemaRef",
      "expectedEvidence",
      "canonicalNodeId",
      "runtimeEvidenceEnums",
    ],
    modelOwnedFields: [
      "workUnitId",
      "objective",
      "commitmentIds",
      "rationale",
      "expectedOutcome",
      "selectedCapabilityId",
      "consideredCapabilityIds",
      "utilityRationale",
      "costRationale",
      "whyCheaperOptionsWereInsufficient",
      "whyThisIsNotDuplicateWork",
      "stopOrEscalationCondition",
      "roleRationale",
      "inputRefs",
      "expectedOutput",
      "successCriteria",
      "downstreamConsumer",
      "targetRefs",
      "edgesOrParallelIndependentJustification",
    ],
    repairInstruction:
      "If a post-synthesis role obligation is missing, add one work unit, one capability selection using a validCapabilityId for that obligation, and one node contract for that same workUnitId. Do not satisfy an obligation only in prose.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function nodeCommitmentIds(node: OrchestratorGraphNodeSpec): string[] {
  const metadata = jsonRecord(node.metadata);
  return [
    ...new Set([
      ...(node.commitmentIdsAdvanced ?? []),
      ...stringArray(metadata.commitmentIdsAdvanced),
      ...stringArray(metadata.targetCommitmentIds),
    ]),
  ].slice(0, 30);
}

function consideredCapabilityIds(node: OrchestratorGraphNodeSpec): string[] {
  const metadata = jsonRecord(node.metadata);
  const utility = jsonRecord(metadata.utilityDecision ?? metadata.costAwareUtilityDecision);
  return [
    ...new Set([
      ...stringArray(metadata.consideredCapabilityIds),
      ...stringArray(utility.consideredCapabilityIds),
      ...(node.capabilityId ? [node.capabilityId] : []),
    ]),
  ].slice(0, 16);
}

function whyCheaperOptionsWereInsufficient(node: OrchestratorGraphNodeSpec): string {
  const metadata = jsonRecord(node.metadata);
  const utility = jsonRecord(metadata.utilityDecision ?? metadata.costAwareUtilityDecision);
  const value =
    typeof metadata.whyCheaperOptionsWereInsufficient === "string"
      ? metadata.whyCheaperOptionsWereInsufficient
      : typeof utility.whyCheaperOptionsWereInsufficient === "string"
        ? utility.whyCheaperOptionsWereInsufficient
        : "";
  return value.trim().slice(0, 800);
}

function nodeRoleObligations(
  node: OrchestratorGraphNodeSpec,
  capability: RuntimeNodeCapability | null,
): PostSynthesisRoleObligation[] {
  const roles = new Set<PostSynthesisRoleObligation>();
  if (node.nodeKind === "implementation" || capability?.roleClass === "implementation") {
    roles.add("implementation");
  }
  if (
    ["validation", "test_review", "test_authoring", "repair"].includes(node.nodeKind) ||
    capability?.roleClass === "validation"
  ) {
    roles.add("validation");
  }
  if (
    ["reviewer", "security_review"].includes(node.nodeKind) ||
    capability?.roleClass === "review"
  ) {
    roles.add("review");
  }
  if (
    ["docs_update", "observability_readback"].includes(node.nodeKind) ||
    capability?.roleClass === "observability" ||
    capability?.roleClass === "docs"
  ) {
    roles.add("docs_or_readback");
  }
  if (node.nodeKind === "closeout" || capability?.roleClass === "closeout") {
    roles.add("closeout");
  }
  return [...roles];
}

type PostSynthesisPolicyNodeSummary = {
  nodeId: string;
  nodeKind: string;
  capabilityId: string | null;
  roleObligations: PostSynthesisRoleObligation[];
  costClass: string | null;
  commitmentIds: string[];
  consideredCapabilityIds: string[];
};

function snapshotNodeRoleObligations(input: {
  node: RuntimeWorkGraphSchedulerSnapshotSummary["nodeSummaries"][number];
  capability: RuntimeNodeCapability | null;
}): PostSynthesisRoleObligation[] {
  const roles = new Set<PostSynthesisRoleObligation>();
  if (
    input.node.nodeKind === "implementation" ||
    input.capability?.roleClass === "implementation"
  ) {
    roles.add("implementation");
  }
  if (
    ["validation", "test_review", "test_authoring", "repair"].includes(input.node.nodeKind) ||
    input.capability?.roleClass === "validation"
  ) {
    roles.add("validation");
  }
  if (
    ["reviewer", "security_review"].includes(input.node.nodeKind) ||
    input.capability?.roleClass === "review"
  ) {
    roles.add("review");
  }
  if (
    ["docs_update", "observability_readback"].includes(input.node.nodeKind) ||
    input.capability?.roleClass === "observability" ||
    input.capability?.roleClass === "docs"
  ) {
    roles.add("docs_or_readback");
  }
  if (input.node.nodeKind === "closeout" || input.capability?.roleClass === "closeout") {
    roles.add("closeout");
  }
  return [...roles];
}

function existingPostSynthesisNodeSummaries(input: {
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): PostSynthesisPolicyNodeSummary[] {
  return input.snapshotSummary.nodeSummaries.map((node) => {
    const capabilityId = node.capabilityId ?? node.metadataCapabilityId ?? null;
    const capability = capabilityId
      ? findRuntimeNodeCapability(capabilityId, input.capabilityManifest)
      : null;
    return {
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      capabilityId,
      roleObligations: snapshotNodeRoleObligations({ node, capability }),
      costClass: capability?.costClass ?? null,
      commitmentIds: node.commitmentIdsAdvanced ?? [],
      consideredCapabilityIds: capabilityId ? [capabilityId] : [],
    };
  });
}

function postSynthesisPolicyApplies(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
}): boolean {
  if (input.snapshotSummary.workflowId !== "agent_team.coding") {
    return false;
  }
  if (!missionIsComplex(input.missionLedger)) {
    return false;
  }
  if (!isContextSynthesisAccepted(input.snapshotSummary)) {
    return false;
  }
  const nodes = input.decision.newNodes ?? [];
  return nodes.some((node) =>
    [
      "implementation",
      "validation",
      "test_review",
      "test_authoring",
      "repair",
      "reviewer",
      "security_review",
      "docs_update",
      "observability_readback",
      "closeout",
    ].includes(node.nodeKind),
  );
}

export function validatePostSynthesisGraphDecision(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): PostSynthesisGraphPolicyValidation {
  const applies = postSynthesisPolicyApplies(input);
  const nodes = input.decision.newNodes ?? [];
  const nodeSummaries = nodes.map((node) => {
    const capability = capabilityForNode(node, input.capabilityManifest);
    return {
      nodeId: node.nodeId,
      nodeKind: node.nodeKind,
      capabilityId: capability?.capabilityId ?? node.capabilityId ?? null,
      roleObligations: nodeRoleObligations(node, capability),
      costClass: capability?.costClass ?? null,
      commitmentIds: nodeCommitmentIds(node),
      consideredCapabilityIds: consideredCapabilityIds(node),
    };
  });
  const existingNodeSummaries = existingPostSynthesisNodeSummaries({
    snapshotSummary: input.snapshotSummary,
    capabilityManifest: input.capabilityManifest,
  });
  const completeGraphNodeSummaries = [...existingNodeSummaries, ...nodeSummaries];
  const presentRoleObligations = [
    ...new Set(completeGraphNodeSummaries.flatMap((node) => node.roleObligations)),
  ];
  const missingRoleObligations = POST_SYNTHESIS_ROLE_OBLIGATIONS.filter(
    (role) => !presentRoleObligations.includes(role),
  );
  const broadCodexNodeCount = completeGraphNodeSummaries.filter(
    (node) => node.nodeKind === "implementation" && node.capabilityId === "implementation_complex",
  ).length;
  const broadCodexNodeIds = new Set(
    completeGraphNodeSummaries
      .filter(
        (node) =>
          node.nodeKind === "implementation" && node.capabilityId === "implementation_complex",
      )
      .map((node) => node.nodeId),
  );
  const broadCodexOutgoingEdgeCount = (input.decision.newEdges ?? []).filter(
    (edge) => edge.fromNodeId && broadCodexNodeIds.has(edge.fromNodeId),
  ).length;
  const premiumNodeCount = completeGraphNodeSummaries.filter(
    (node) => node.costClass === "premium",
  ).length;
  const cheapOrSpecializedNodeCount = completeGraphNodeSummaries.filter((node) => {
    const capability = node.capabilityId
      ? findRuntimeNodeCapability(node.capabilityId, input.capabilityManifest)
      : null;
    return Boolean(
      capability &&
      (capability.costClass === "cheap" ||
        capability.productionSelectionRequiresQualification ||
        capability.roleClass !== "implementation"),
    );
  }).length;
  const reasonCodes: string[] = [];
  if (applies) {
    for (const role of missingRoleObligations) {
      reasonCodes.push(`post_synthesis_graph_role_obligation_missing:${role}`);
    }
    if (nodes.length > 1 && broadCodexNodeCount === nodes.length) {
      reasonCodes.push("post_synthesis_graph_codex_monopoly_all_nodes_broad_implementation");
    }
    if (broadCodexNodeCount > 0 && cheapOrSpecializedNodeCount === 0) {
      reasonCodes.push("post_synthesis_graph_no_cheaper_or_specialized_node_represented");
    }
    if (broadCodexNodeCount > 0 && broadCodexOutgoingEdgeCount >= Math.max(2, nodes.length - 2)) {
      reasonCodes.push("post_synthesis_graph_broad_codex_dependency_chokepoint");
    }
    for (const node of nodes) {
      if (node.nodeKind !== "implementation" || node.capabilityId !== "implementation_complex") {
        continue;
      }
      const considered = consideredCapabilityIds(node);
      const cheaperConsidered = considered.some((capabilityId) => {
        const capability = findRuntimeNodeCapability(capabilityId, input.capabilityManifest);
        return Boolean(capability && capability.costClass !== "premium");
      });
      if (!cheaperConsidered) {
        reasonCodes.push(
          `post_synthesis_graph_codex_node_missing_cheaper_candidate:${node.nodeId}`,
        );
      }
      if (!whyCheaperOptionsWereInsufficient(node)) {
        reasonCodes.push(
          `post_synthesis_graph_codex_node_missing_cheaper_insufficiency_rationale:${node.nodeId}`,
        );
      }
    }
  }
  const report: PostSynthesisGraphQualityReport = {
    artifactKind: "post_synthesis_graph_quality_report",
    schemaVersion: "execution-platform.post-synthesis-graph-quality.v1",
    applies,
    workflowId: input.snapshotSummary.workflowId,
    requiredRoleObligations: [...POST_SYNTHESIS_ROLE_OBLIGATIONS],
    presentRoleObligations,
    missingRoleObligations,
    nodeCount: nodes.length,
    edgeCount: input.decision.newEdges?.length ?? 0,
    broadCodexNodeCount,
    cheapOrSpecializedNodeCount,
    premiumNodeCount,
    broadCodexShare: nodes.length > 0 ? broadCodexNodeCount / nodes.length : 0,
    premiumShare: nodes.length > 0 ? premiumNodeCount / nodes.length : 0,
    nodeSummaries: completeGraphNodeSummaries,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    report,
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
