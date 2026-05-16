import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import {
  assertBoundedStringArray,
  assertRuntimeWorkGraphNoRawStorage,
  boundedRuntimeWorkGraphString,
  TEAM_GRAPH_EDGE_KINDS,
  TEAM_GRAPH_NODE_KINDS,
  type TeamGraphEdgeKind,
  type TeamGraphNodeKind,
} from "./runtime-work-graph.ts";

export const ORCHESTRATOR_GRAPH_DECISION_KINDS = [
  "add_nodes",
  "run_node",
  "split_node",
  "retry_node",
  "rerun_role",
  "request_context",
  "request_validation",
  "request_review",
  "request_human_decision",
  "escalate_worker",
  "repair_from_validation",
  "create_closeout",
  "mark_needs_review",
  "mark_blocked",
] as const;

export type OrchestratorGraphDecisionKind = (typeof ORCHESTRATOR_GRAPH_DECISION_KINDS)[number];

export type OrchestratorGraphNodeSpec = {
  nodeId: string;
  nodeKind: TeamGraphNodeKind;
  capabilityId?: string | null;
  executorKey?: string | null;
  workerRef?: string | null;
  requiredMetadataSchemaRef?: string | null;
  assignedRole: string;
  modelOrWorkerRef?: string | null;
  inputHandoffRefs?: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  downstreamConsumer: string;
  commitmentIdsAdvanced?: string[];
  whyThisRoleIsNeededNow?: string | null;
  exactObjective?: string | null;
  evidenceExpectation?: string | null;
  targetRefs?: string[];
  metadata?: JsonValue;
};

export type OrchestratorGraphEdgeSpec = {
  edgeId?: string;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  edgeKind: TeamGraphEdgeKind;
  reasonCodes?: string[];
  artifactRefs?: string[];
  metadata?: JsonValue;
};

export type OrchestratorGraphDecision = {
  decisionId: string;
  decisionKind: OrchestratorGraphDecisionKind;
  rationaleForDecision: string;
  targetNodeId?: string | null;
  runNodeId?: string | null;
  newNodes?: OrchestratorGraphNodeSpec[];
  newEdges?: OrchestratorGraphEdgeSpec[];
  reasonCodes: string[];
  commitmentIdsAdvanced?: string[];
  expectedEvidenceDescription?: string | null;
  runAfterAdd?: boolean;
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type OrchestratorGraphDecisionValidation = {
  valid: boolean;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
};

export type OrchestratorGraphRejectedNodeDiagnostic = {
  nodeIndex: number;
  providedNodeKind: string | null;
  providedCapabilityId: string | null;
  matchingCapabilityId: string | null;
  expectedGraphNodeKind: TeamGraphNodeKind | null;
  errorCode: string;
  message: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type OrchestratorGraphDecisionCompileResult = {
  decision: OrchestratorGraphDecision | null;
  validation: OrchestratorGraphDecisionValidation;
  rejectedNodeDiagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  reasonCodes: string[];
  acceptedAliasFields: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  semanticQualityJudgedByDeterministicCode: false;
};

export type OrchestratorGraphDecisionCompileOptions = {
  capabilityManifest?: RuntimeNodeCapabilityManifest;
  executableExecutorKeys?: string[];
  requireNodeCommitmentContracts?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? boundedRuntimeWorkGraphString(value)
    : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => boundedRuntimeWorkGraphString(item))
        .slice(0, 24)
    : [];
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function jsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(jsonValue) as JsonValue;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        jsonValue(child),
      ]),
    ) as JsonValue;
  }
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function arrayFromAny(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = stringArray(record[key]);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

function firstArrayValue(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function nodeContractFields(
  record: Record<string, unknown>,
): Pick<
  OrchestratorGraphNodeSpec,
  "commitmentIdsAdvanced" | "whyThisRoleIsNeededNow" | "exactObjective" | "evidenceExpectation"
> {
  return {
    commitmentIdsAdvanced: arrayFromAny(record, [
      "commitmentIdsAdvanced",
      "commitmentIds",
      "advancesCommitments",
    ]),
    whyThisRoleIsNeededNow:
      firstString(record, ["whyThisRoleIsNeededNow", "roleRationale", "whyNow"]) || null,
    exactObjective: firstString(record, ["exactObjective", "objective", "taskObjective"]) || null,
    evidenceExpectation:
      firstString(record, ["evidenceExpectation", "expectedEvidenceDescription"]) || null,
  };
}

function utilityMetadataFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    [
      "consideredCapabilityIds",
      "utilityRationale",
      "costRationale",
      "whyCheaperOptionsWereInsufficient",
      "whyThisIsNotDuplicateWork",
      "expectedEvidence",
      "budgetRef",
      "stopOrEscalationCondition",
      "utilityDecision",
      "costAwareUtilityDecision",
      "taskFamily",
      "workerTaskFamily",
      "nonCodexTaskFamily",
      "selectedModelQualificationProfileId",
      "modelQualificationProfileId",
      "qualificationProfileId",
      "qualificationEvidenceRefs",
      "modelQualificationEvidenceRefs",
      "escalationCondition",
    ]
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, jsonValue(record[key])]),
  );
}

function mergeNodeDetailFields(record: Record<string, unknown>): Record<string, unknown> {
  const metadata = asRecord(record.metadata);
  const taskDetails = asRecord(record.taskDetails);
  return { ...metadata, ...taskDetails, ...record };
}

function capabilityDiagnostic(input: {
  nodeIndex: number;
  providedNodeKind: string | null;
  providedCapabilityId: string | null;
  matchingCapabilityId: string | null;
  expectedGraphNodeKind: TeamGraphNodeKind | null;
  errorCode: string;
  message: string;
}): OrchestratorGraphRejectedNodeDiagnostic {
  return {
    ...input,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function normalizeNode(
  value: unknown,
  nodeIndex = 0,
  options: Required<Pick<OrchestratorGraphDecisionCompileOptions, "capabilityManifest">>,
): {
  node: OrchestratorGraphNodeSpec | null;
  diagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  acceptedAliasFields: string[];
  reasonCodes: string[];
} {
  const record = asRecord(value);
  const diagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
  const acceptedAliasFields: string[] = [];
  const reasonCodes: string[] = [];
  const normalized = mergeNodeDetailFields(record);
  const providedNodeKind = firstString(normalized, ["nodeKind", "graphNodeKind"]);
  const providedCapabilityId = firstString(normalized, [
    "capabilityId",
    "capability",
    "capabilityRef",
    "nodeType",
  ]);
  const nodeKindIsExecutable = TEAM_GRAPH_NODE_KINDS.includes(
    providedNodeKind as TeamGraphNodeKind,
  );
  const capabilityFromExplicit = providedCapabilityId
    ? findRuntimeNodeCapability(providedCapabilityId, options.capabilityManifest)
    : null;
  const capabilityFromNodeKind = providedNodeKind
    ? findRuntimeNodeCapability(providedNodeKind, options.capabilityManifest)
    : null;
  const capability = capabilityFromExplicit || capabilityFromNodeKind || null;
  let nodeKind: TeamGraphNodeKind | null = nodeKindIsExecutable
    ? (providedNodeKind as TeamGraphNodeKind)
    : null;
  if (!nodeKind && capability) {
    nodeKind = capability.graphNodeKind;
    diagnostics.push(
      capabilityDiagnostic({
        nodeIndex,
        providedNodeKind: providedNodeKind || null,
        providedCapabilityId: providedCapabilityId || null,
        matchingCapabilityId: capability.capabilityId,
        expectedGraphNodeKind: capability.graphNodeKind,
        errorCode: "capability_id_compiled_to_graph_node_kind",
        message:
          "The model selected a capability where the runtime needs an executable graph node kind; deterministic compiler converted it without judging task quality.",
      }),
    );
  }
  if (providedCapabilityId && capabilityFromExplicit) {
    acceptedAliasFields.push("capabilityId");
  }
  if (providedNodeKind && !nodeKindIsExecutable && capabilityFromNodeKind) {
    acceptedAliasFields.push("nodeKind_as_capabilityId");
  }
  if (!nodeKind) {
    diagnostics.push(
      capabilityDiagnostic({
        nodeIndex,
        providedNodeKind: providedNodeKind || null,
        providedCapabilityId: providedCapabilityId || null,
        matchingCapabilityId: null,
        expectedGraphNodeKind: null,
        errorCode: "node_kind_not_executable_and_capability_missing",
        message:
          "The node did not provide an executable graphNodeKind or a known capabilityId that can be compiled.",
      }),
    );
    reasonCodes.push("node_kind_not_executable_and_capability_missing");
    return { node: null, diagnostics, acceptedAliasFields, reasonCodes };
  }
  return {
    node: {
      nodeId: firstString(normalized, ["nodeId", "id"]),
      nodeKind,
      capabilityId: (capability?.capabilityId ?? providedCapabilityId) || null,
      executorKey: (capability?.executorKey ?? firstString(normalized, ["executorKey"])) || null,
      workerRef:
        (capability?.workerRef ?? firstString(normalized, ["workerRef", "modelOrWorkerRef"])) ||
        null,
      requiredMetadataSchemaRef:
        (capability?.requiredMetadataSchemaRef ??
          firstString(normalized, ["requiredMetadataSchemaRef"])) ||
        null,
      assignedRole: firstString(normalized, ["assignedRole", "roleId"]) || capability?.roleId || "",
      modelOrWorkerRef:
        firstString(normalized, ["modelOrWorkerRef", "workerRef", "modelRef"]) ||
        capability?.workerRef ||
        null,
      inputHandoffRefs: arrayFromAny(normalized, [
        "inputHandoffRefs",
        "handoffRefs",
        "evidenceRefs",
      ]),
      expectedOutput: firstString(normalized, [
        "expectedOutput",
        "expectedResult",
        "outputContract",
      ]),
      acceptanceCriteria: arrayFromAny(normalized, [
        "acceptanceCriteria",
        "successCriteria",
        "validationCriteria",
      ]),
      downstreamConsumer: firstString(normalized, [
        "downstreamConsumer",
        "consumer",
        "nextConsumer",
      ]),
      ...nodeContractFields(normalized),
      targetRefs: arrayFromAny(normalized, [
        "targetRefs",
        "fileRefs",
        "sourceRefs",
        "artifactRefs",
      ]),
      metadata: jsonValue({
        ...asRecord(record.metadata ?? {}),
        ...nodeContractFields(normalized),
        ...utilityMetadataFields(normalized),
        capabilityId: (capability?.capabilityId ?? providedCapabilityId) || null,
        graphNodeKind: nodeKind,
        executorKey: (capability?.executorKey ?? firstString(normalized, ["executorKey"])) || null,
        workerRef: (capability?.workerRef ?? firstString(normalized, ["workerRef"])) || null,
        requiredMetadataSchemaRef:
          (capability?.requiredMetadataSchemaRef ??
            firstString(normalized, ["requiredMetadataSchemaRef"])) ||
          null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }) as JsonValue,
    },
    diagnostics,
    acceptedAliasFields,
    reasonCodes,
  };
}

function nodesFromSelectedCapabilities(
  value: unknown,
  options: Required<Pick<OrchestratorGraphDecisionCompileOptions, "capabilityManifest">>,
): {
  nodes: OrchestratorGraphNodeSpec[];
  diagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  acceptedAliasFields: string[];
  reasonCodes: string[];
} {
  if (!Array.isArray(value)) {
    return { nodes: [], diagnostics: [], acceptedAliasFields: [], reasonCodes: [] };
  }
  const nodes: OrchestratorGraphNodeSpec[] = [];
  const diagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
  const acceptedAliasFields: string[] = [];
  const reasonCodes: string[] = [];
  for (const [index, selected] of value.entries()) {
    const record = asRecord(selected);
    const normalized = mergeNodeDetailFields(record);
    const capabilityId = firstString(record, ["capabilityId", "capability", "capabilityRef"]);
    const capability = capabilityId
      ? findRuntimeNodeCapability(capabilityId, options.capabilityManifest)
      : null;
    if (!capability) {
      diagnostics.push(
        capabilityDiagnostic({
          nodeIndex: index,
          providedNodeKind: null,
          providedCapabilityId: capabilityId || null,
          matchingCapabilityId: null,
          expectedGraphNodeKind: null,
          errorCode: "selected_capability_unknown",
          message: "Selected capability could not be found in the runtime capability manifest.",
        }),
      );
      reasonCodes.push("selected_capability_unknown");
      continue;
    }
    acceptedAliasFields.push("selectedCapabilities");
    nodes.push({
      nodeId:
        firstString(normalized, ["nodeId", "id"]) || `${capability.capabilityId}-${index + 1}`,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      assignedRole: firstString(normalized, ["assignedRole", "roleId"]) || capability.roleId,
      modelOrWorkerRef:
        firstString(normalized, ["modelOrWorkerRef", "workerRef"]) || capability.workerRef,
      inputHandoffRefs: arrayFromAny(normalized, [
        "inputHandoffRefs",
        "handoffRefs",
        "evidenceRefs",
      ]),
      expectedOutput: firstString(normalized, ["expectedOutput", "objective", "outputContract"]),
      acceptanceCriteria: arrayFromAny(normalized, [
        "acceptanceCriteria",
        "successCriteria",
        "validationCriteria",
      ]),
      downstreamConsumer: firstString(normalized, [
        "downstreamConsumer",
        "consumer",
        "nextConsumer",
      ]),
      ...nodeContractFields(normalized),
      targetRefs: arrayFromAny(normalized, [
        "targetRefs",
        "fileRefs",
        "sourceRefs",
        "artifactRefs",
      ]),
      metadata: jsonValue({
        taskDetails: jsonValue(record.taskDetails ?? {}),
        ...nodeContractFields(normalized),
        ...utilityMetadataFields(normalized),
        capabilityId: capability.capabilityId,
        graphNodeKind: capability.graphNodeKind,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }) as JsonValue,
    });
  }
  return { nodes, diagnostics, acceptedAliasFields, reasonCodes };
}

function normalizeEdge(value: unknown): OrchestratorGraphEdgeSpec | null {
  const record = asRecord(value);
  const edgeKind = stringValue(record.edgeKind);
  if (!TEAM_GRAPH_EDGE_KINDS.includes(edgeKind as TeamGraphEdgeKind)) {
    return null;
  }
  return {
    edgeId: stringValue(record.edgeId) || undefined,
    fromNodeId: stringValue(record.fromNodeId) || null,
    toNodeId: stringValue(record.toNodeId) || null,
    edgeKind: edgeKind as TeamGraphEdgeKind,
    reasonCodes: stringArray(record.reasonCodes),
    artifactRefs: stringArray(record.artifactRefs),
    metadata: jsonValue(record.metadata ?? {}) as JsonValue,
  };
}

function edgeValuesFromDecision(record: Record<string, unknown>): unknown[] {
  return firstArrayValue(record, [
    "newEdges",
    "edges",
    "handoffEdges",
    "dependencyEdges",
    "nodeEdges",
  ]);
}

function explicitNodeDependencyEdges(
  nodes: OrchestratorGraphNodeSpec[],
): OrchestratorGraphEdgeSpec[] {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const edges: OrchestratorGraphEdgeSpec[] = [];
  for (const node of nodes) {
    const metadata = asRecord(node.metadata);
    const dependencies = arrayFromAny(metadata, [
      "dependsOnNodeIds",
      "dependencyNodeIds",
      "upstreamNodeIds",
      "afterNodeIds",
      "requiresNodeIds",
    ]);
    for (const dependency of dependencies) {
      if (!nodeIds.has(dependency) || dependency === node.nodeId) {
        continue;
      }
      edges.push({
        edgeId: `${dependency}-to-${node.nodeId}`,
        fromNodeId: dependency,
        toNodeId: node.nodeId,
        edgeKind: "handoff",
        reasonCodes: ["explicit_node_dependency_compiled"],
        artifactRefs: [],
        metadata: {
          source: "orchestrator_node_dependency_field",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
  }
  return edges;
}

function decisionMetadata(record: Record<string, unknown>): JsonValue {
  const metadata = asRecord(record.metadata ?? {});
  return jsonValue({
    ...metadata,
    ...Object.fromEntries(
      [
        "parallelIndependentNodesJustification",
        "decompositionStructureJustification",
        "decompositionStructureRationale",
        "executionMode",
        "utilityDecision",
        "costAwareUtilityDecision",
      ]
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, jsonValue(record[key])]),
    ),
  }) as JsonValue;
}

export function normalizeOrchestratorGraphDecision(
  value: unknown,
): OrchestratorGraphDecision | null {
  return compileOrchestratorGraphDecision(value).decision;
}

export function compileOrchestratorGraphDecision(
  value: unknown,
  options: OrchestratorGraphDecisionCompileOptions = {},
): OrchestratorGraphDecisionCompileResult {
  const capabilityManifest = options.capabilityManifest ?? buildRuntimeNodeCapabilityManifest();
  const record = asRecord(value);
  const decisionKind = stringValue(record.decisionKind);
  if (!ORCHESTRATOR_GRAPH_DECISION_KINDS.includes(decisionKind as OrchestratorGraphDecisionKind)) {
    const validation = {
      valid: false,
      reasonCodes: ["decision_kind_invalid"],
      semanticQualityJudgedByDeterministicCode: false,
    } satisfies OrchestratorGraphDecisionValidation;
    return {
      decision: null,
      validation,
      rejectedNodeDiagnostics: [],
      reasonCodes: validation.reasonCodes,
      acceptedAliasFields: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      semanticQualityJudgedByDeterministicCode: false,
    };
  }
  const nodeResults = Array.isArray(record.newNodes)
    ? record.newNodes.map((node, index) => normalizeNode(node, index, { capabilityManifest }))
    : [];
  const selectedCapabilityNodes = nodesFromSelectedCapabilities(record.selectedCapabilities, {
    capabilityManifest,
  });
  const newNodes = [
    ...nodeResults
      .map((result) => result.node)
      .filter((node): node is OrchestratorGraphNodeSpec => Boolean(node)),
    ...selectedCapabilityNodes.nodes,
  ];
  const rejectedNodeDiagnostics = [
    ...nodeResults.flatMap((result) => result.diagnostics),
    ...selectedCapabilityNodes.diagnostics,
  ];
  const acceptedAliasFields = [
    ...nodeResults.flatMap((result) => result.acceptedAliasFields),
    ...selectedCapabilityNodes.acceptedAliasFields,
  ];
  const compileReasonCodes = [
    ...nodeResults.flatMap((result) => result.reasonCodes),
    ...selectedCapabilityNodes.reasonCodes,
  ];
  const explicitEdges = edgeValuesFromDecision(record);
  const newEdges =
    explicitEdges.length > 0
      ? explicitEdges
          .map(normalizeEdge)
          .filter((edge): edge is OrchestratorGraphEdgeSpec => Boolean(edge))
      : [];
  const compiledDependencyEdges = explicitNodeDependencyEdges(newNodes);
  const decision: OrchestratorGraphDecision = {
    decisionId: stringValue(record.decisionId),
    decisionKind: decisionKind as OrchestratorGraphDecisionKind,
    rationaleForDecision: stringValue(record.rationaleForDecision),
    targetNodeId: stringValue(record.targetNodeId) || null,
    runNodeId: stringValue(record.runNodeId) || null,
    newNodes,
    newEdges: [...newEdges, ...compiledDependencyEdges],
    reasonCodes: stringArray(record.reasonCodes),
    commitmentIdsAdvanced: stringArray(record.commitmentIdsAdvanced),
    expectedEvidenceDescription:
      typeof record.expectedEvidenceDescription === "string"
        ? boundedRuntimeWorkGraphString(record.expectedEvidenceDescription)
        : null,
    runAfterAdd: booleanValue(record.runAfterAdd),
    metadata: decisionMetadata(record),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
  const validation = validateOrchestratorGraphDecision(decision, {
    executableExecutorKeys: options.executableExecutorKeys,
    requireNodeCommitmentContracts: options.requireNodeCommitmentContracts,
  });
  return {
    decision,
    validation,
    rejectedNodeDiagnostics,
    reasonCodes: [...compileReasonCodes, ...validation.reasonCodes],
    acceptedAliasFields,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    semanticQualityJudgedByDeterministicCode: false,
  };
}

export function validateOrchestratorGraphDecision(
  decision: OrchestratorGraphDecision,
  options: { executableExecutorKeys?: string[]; requireNodeCommitmentContracts?: boolean } = {},
): OrchestratorGraphDecisionValidation {
  const reasonCodes: string[] = [];
  try {
    assertRuntimeWorkGraphNoRawStorage(decision, "orchestrator graph decision");
    assertBoundedStringArray(decision.reasonCodes, "orchestrator graph decision reason codes");
  } catch (error) {
    reasonCodes.push(error instanceof Error ? error.message : "raw_or_unbounded_decision_rejected");
  }
  if (!decision.decisionId) {
    reasonCodes.push("decision_id_missing");
  }
  if (!decision.rationaleForDecision) {
    reasonCodes.push("decision_rationale_missing");
  }
  if (decision.expectedEvidenceDescription && decision.expectedEvidenceDescription.length > 1_000) {
    reasonCodes.push("decision_expected_evidence_description_unbounded");
  }
  if (["run_node", "retry_node", "repair_from_validation"].includes(decision.decisionKind)) {
    if (!decision.runNodeId && !decision.targetNodeId) {
      reasonCodes.push("decision_target_node_missing");
    }
  }
  if (
    [
      "add_nodes",
      "split_node",
      "request_context",
      "request_validation",
      "request_review",
      "request_human_decision",
      "escalate_worker",
      "rerun_role",
    ].includes(decision.decisionKind) &&
    (decision.newNodes ?? []).length === 0
  ) {
    reasonCodes.push("decision_new_nodes_missing");
  }
  for (const node of decision.newNodes ?? []) {
    if (!node.nodeId) {
      reasonCodes.push("node_id_missing");
    }
    if (!node.assignedRole) {
      reasonCodes.push(`node_assigned_role_missing:${node.nodeId || "unknown"}`);
    }
    if (!node.expectedOutput) {
      reasonCodes.push(`node_expected_output_missing:${node.nodeId || "unknown"}`);
    }
    if (!node.downstreamConsumer) {
      reasonCodes.push(`node_downstream_consumer_missing:${node.nodeId || "unknown"}`);
    }
    if (node.acceptanceCriteria.length === 0) {
      reasonCodes.push(`node_acceptance_criteria_missing:${node.nodeId || "unknown"}`);
    }
    if (options.requireNodeCommitmentContracts) {
      if ((node.commitmentIdsAdvanced ?? []).length === 0) {
        reasonCodes.push(`node_commitment_ids_missing:${node.nodeId || "unknown"}`);
      }
      if (!node.whyThisRoleIsNeededNow) {
        reasonCodes.push(`node_role_rationale_missing:${node.nodeId || "unknown"}`);
      }
      if (!node.exactObjective) {
        reasonCodes.push(`node_exact_objective_missing:${node.nodeId || "unknown"}`);
      }
      if (!node.evidenceExpectation) {
        reasonCodes.push(`node_evidence_expectation_missing:${node.nodeId || "unknown"}`);
      }
    }
    if (
      node.executorKey &&
      options.executableExecutorKeys &&
      !options.executableExecutorKeys.includes(node.executorKey)
    ) {
      reasonCodes.push(`node_executor_key_not_registered:${node.executorKey}`);
    }
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
  };
}
