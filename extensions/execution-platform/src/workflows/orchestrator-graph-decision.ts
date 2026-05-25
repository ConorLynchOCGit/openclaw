import { createHash } from "node:crypto";
import {
  firstStructuralString,
  firstStructuralStringArray,
  flattenModelDecisionFields,
  missingField,
  repairRequestForMissingFields,
  runtimeOwnedFieldReasonCodesForRecords,
  type ModelDecisionMissingField,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import { normalizeExecutionIntent, type ExecutionIntent } from "./execution-intent.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
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
import {
  WORK_INTENT_NODE_KIND,
  compileWorkIntent,
  type CompiledWorkIntentGraphNode,
} from "./work-intent.ts";

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
  requestContextIntent?: RequestContextIntent | null;
  runAfterAdd?: boolean;
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type RequestContextIntent = {
  failedNodeIds: string[];
  targetNodeIds: string[];
  targetCommitmentIds: string[];
  missingContextQuestions: string[];
  contextObjective: string;
  downstreamConsumer: string;
  successCriteria: string[];
  inputRefs: string[];
  targetRefs: string[];
  selectedCapabilityId: string;
  stopIfMissing: string[];
  rationale: string;
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
  workUnitId?: string;
  selectedCapabilityId?: string;
  executionIntent?: ExecutionIntent;
  compatibilityReason?: string;
  path?: string;
  validValues?: string[];
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
  repairRequest: ModelDecisionRepairRequest;
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
  requireStagedProtocolForNodeCreation?: boolean;
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

function targetNodeIdFromDecisionRecord(record: Record<string, unknown>): string | null {
  const repairTarget = asRecord(record.repairTarget);
  const explicitTargetNodeId =
    firstString(record, ["targetNodeId", "targetNodeRef", "repairTargetNodeId", "nodeId"]) ||
    firstString(repairTarget, ["targetNodeId", "targetNodeRef", "repairTargetNodeId", "nodeId"]);
  if (explicitTargetNodeId) {
    return explicitTargetNodeId;
  }
  return (
    arrayFromAny(repairTarget, ["targetNodeIds", "targetNodeRefs", "nodeIds", "nodeRefs"])[0] ??
    arrayFromAny(record, ["targetNodeIds", "targetNodeRefs", "nodeIds", "nodeRefs"])[0] ??
    null
  );
}

function slugRuntimeId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return slug || fallback;
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
  const commitmentIds = firstStructuralStringArray(record, [
    "commitmentIdsAdvanced",
    "commitmentIds",
    "advancesCommitments",
    "targetCommitmentIds",
  ]).value;
  const roleRationale = firstStructuralString(record, [
    "whyThisRoleIsNeededNow",
    "roleRationale",
    "whyNow",
    "whyThisNodeWasChosen",
  ]).value;
  const exactObjective = firstStructuralString(record, [
    "exactObjective",
    "objective",
    "taskObjective",
  ]).value;
  const evidenceExpectation = firstStructuralString(record, [
    "evidenceExpectation",
    "expectedEvidenceDescription",
  ]).value;
  return {
    commitmentIdsAdvanced: commitmentIds,
    whyThisRoleIsNeededNow: roleRationale || null,
    exactObjective: exactObjective || null,
    evidenceExpectation: evidenceExpectation || null,
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
      "dependsOnNodeIds",
      "dependencyNodeIds",
      "upstreamNodeIds",
      "afterNodeIds",
      "requiresNodeIds",
      "dependencies",
      "dependsOn",
    ]
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, jsonValue(record[key])]),
  );
}

function mergeNodeDetailFields(record: Record<string, unknown>): Record<string, unknown> {
  return flattenModelDecisionFields(record);
}

function capabilityDiagnostic(input: {
  nodeIndex: number;
  providedNodeKind: string | null;
  providedCapabilityId: string | null;
  matchingCapabilityId: string | null;
  expectedGraphNodeKind: TeamGraphNodeKind | null;
  workUnitId?: string;
  selectedCapabilityId?: string;
  executionIntent?: ExecutionIntent;
  compatibilityReason?: string;
  path?: string;
  validValues?: string[];
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

function missingFieldsForDecision(
  decision: OrchestratorGraphDecision | null,
): ModelDecisionMissingField[] {
  if (!decision) {
    return [
      missingField(
        "decisionKind",
        "OrchestratorGraphDecisionKind",
        "The scheduler needs a concrete action kind before it can compile graph work.",
        "add_nodes",
      ),
    ];
  }
  const fields: ModelDecisionMissingField[] = [];
  if (!decision.decisionId) {
    fields.push(
      missingField(
        "decisionId",
        "string",
        "Repair and trace continuity require a stable decision id.",
        "decision-001",
      ),
    );
  }
  if (!decision.rationaleForDecision) {
    fields.push(
      missingField(
        "rationaleForDecision",
        "string",
        "Owner-facing readback and repair diagnostics need the model-authored reason for this decision.",
        "Decompose the complex mission into parallel context scouts before implementation.",
      ),
    );
  }
  if (decision.decisionKind === "request_context") {
    const intent = decision.requestContextIntent ?? null;
    if (!intent) {
      fields.push(
        missingField(
          "requestContextIntent",
          "object",
          "Context repair must be model-authored semantic intent; runtime compiles graph nodes, ids, executors, and edges.",
          {
            failedNodeIds: ["implementation-1"],
            targetNodeIds: ["implementation-1"],
            targetCommitmentIds: ["commitment-1"],
            missingContextQuestions: ["Which files implement the workflow registration?"],
            contextObjective: "Find bounded repo files and handoff guidance for implementation-1.",
            downstreamConsumer: "implementation-1",
            successCriteria: ["Verified existing file refs", "Concrete handoff summary"],
          },
        ),
      );
      return fields;
    }
    if (
      intent.targetNodeIds.length === 0 &&
      intent.failedNodeIds.length === 0 &&
      intent.targetCommitmentIds.length === 0
    ) {
      fields.push(
        missingField(
          "requestContextIntent.targetNodeIds",
          "string[]",
          "Runtime needs either the node that should receive repaired context or the commitment ids needing sharper context.",
          ["implementation-1"],
        ),
      );
    }
    if (intent.targetCommitmentIds.length === 0) {
      fields.push(
        missingField(
          "requestContextIntent.targetCommitmentIds",
          "string[]",
          "Context repair must stay tied to Mission Ledger commitments.",
          ["commitment-1"],
        ),
      );
    }
    if (intent.missingContextQuestions.length === 0) {
      fields.push(
        missingField(
          "requestContextIntent.missingContextQuestions",
          "string[]",
          "The context scout needs concrete questions to answer, not a generic repair label.",
          ["Which existing files register the workflow plugin?"],
        ),
      );
    }
    if (!intent.contextObjective) {
      fields.push(
        missingField(
          "requestContextIntent.contextObjective",
          "string",
          "The context scout needs a bounded objective for the repaired handoff.",
          "Find workflow registry, scheduler executor, and readback files for the blocked implementation node.",
        ),
      );
    }
    return fields;
  }
  for (const [index, node] of (decision.newNodes ?? []).entries()) {
    const prefix = `newNodes[${index}]`;
    if (!node.nodeId) {
      fields.push(
        missingField(
          `${prefix}.nodeId`,
          "string",
          "Every graph node needs a stable id.",
          "context-1",
        ),
      );
    }
    if (!node.assignedRole) {
      fields.push(
        missingField(
          `${prefix}.assignedRole`,
          "string",
          "The scheduler needs the intended role to dispatch the node to the right executor.",
          "context_scout",
        ),
      );
    }
    if (!node.expectedOutput) {
      fields.push(
        missingField(
          `${prefix}.expectedHumanReadableOutput`,
          "string",
          "Downstream workers and owner readback need an inspectable output contract.",
          "Bounded context handoff with target files and risks.",
        ),
      );
    }
    if (!node.downstreamConsumer) {
      fields.push(
        missingField(
          `${prefix}.downstreamConsumer`,
          "string",
          "The scheduler needs to know who consumes this node's output.",
          "implementation_engineer",
        ),
      );
    }
    if (node.acceptanceCriteria.length === 0) {
      fields.push(
        missingField(
          `${prefix}.successCriteria`,
          "string[]",
          "The scheduler needs model-authored success criteria before executing the node.",
          ["Cites target refs", "Identifies risks"],
        ),
      );
    }
    if ((node.commitmentIdsAdvanced ?? []).length === 0) {
      fields.push(
        missingField(
          `${prefix}.commitmentIds`,
          "string[]",
          "Every complex-mission node must advance at least one Mission Ledger commitment.",
          ["workflow-canonical-surface"],
        ),
      );
    }
    if (!node.whyThisRoleIsNeededNow) {
      fields.push(
        missingField(
          `${prefix}.roleRationale`,
          "string",
          "The scheduler needs the model-authored reason this role is the right next unit of work.",
          "Implementation needs repo facts before editing.",
        ),
      );
    }
    if (!node.exactObjective) {
      fields.push(
        missingField(
          `${prefix}.objective`,
          "string",
          "The worker needs a concrete objective, not a generic role label.",
          "Identify the target workflow registration files and scheduler integration points.",
        ),
      );
    }
  }
  return fields;
}

function missingFieldsForRejectedDiagnostics(
  diagnostics: OrchestratorGraphRejectedNodeDiagnostic[],
): ModelDecisionMissingField[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.path && diagnostic.errorCode.includes("missing"))
    .map((diagnostic) =>
      missingField(
        diagnostic.path!,
        "valid model-authored semantic field",
        diagnostic.message,
        diagnostic.validValues?.[0],
        diagnostic.validValues,
      ),
    );
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
        "expectedHumanReadableOutput",
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
      expectedOutput: firstString(normalized, [
        "expectedOutput",
        "expectedHumanReadableOutput",
        "objective",
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

function requestedCapabilityIdFromEscalationDecision(record: Record<string, unknown>): string {
  const costAwareDecision = flattenModelDecisionFields(asRecord(record.costAwareUtilityDecision));
  const utilityDecision = flattenModelDecisionFields(asRecord(record.utilityDecision));
  const escalationContract = flattenModelDecisionFields(
    asRecord(record.escalationContract ?? record.contract ?? record.repairContract),
  );
  return (
    firstString(record, [
      "requestedCapabilityId",
      "selectedCapabilityId",
      "toCapabilityId",
      "targetCapabilityId",
      "escalationCapabilityId",
      "capabilityId",
      "capability",
      "capabilityRef",
    ]) ||
    firstString(costAwareDecision, [
      "requestedCapabilityId",
      "selectedCapabilityId",
      "toCapabilityId",
      "targetCapabilityId",
      "escalationCapabilityId",
      "capabilityId",
      "capability",
      "capabilityRef",
    ]) ||
    firstString(utilityDecision, [
      "requestedCapabilityId",
      "selectedCapabilityId",
      "toCapabilityId",
      "targetCapabilityId",
      "escalationCapabilityId",
      "capabilityId",
      "capability",
      "capabilityRef",
    ]) ||
    firstString(escalationContract, [
      "requestedCapabilityId",
      "selectedCapabilityId",
      "toCapabilityId",
      "targetCapabilityId",
      "escalationCapabilityId",
      "capabilityId",
      "capability",
      "capabilityRef",
    ])
  );
}

function compileEscalationIntent(
  record: Record<string, unknown>,
  options: Required<Pick<OrchestratorGraphDecisionCompileOptions, "capabilityManifest">>,
): {
  nodes: OrchestratorGraphNodeSpec[];
  edges: OrchestratorGraphEdgeSpec[];
  acceptedAliasFields: string[];
  reasonCodes: string[];
} {
  if (stringValue(record.decisionKind) !== "escalate_worker") {
    return { nodes: [], edges: [], acceptedAliasFields: [], reasonCodes: [] };
  }
  const hasModelAuthoredNodeEnvelope =
    (Array.isArray(record.newNodes) && record.newNodes.length > 0) ||
    (Array.isArray(record.selectedCapabilities) && record.selectedCapabilities.length > 0) ||
    stagedWorkUnits(stagedSourceRecord(record).source).length > 0;
  if (hasModelAuthoredNodeEnvelope) {
    return { nodes: [], edges: [], acceptedAliasFields: [], reasonCodes: [] };
  }

  const requestedCapabilityId = requestedCapabilityIdFromEscalationDecision(record);
  if (!requestedCapabilityId) {
    return {
      nodes: [],
      edges: [],
      acceptedAliasFields: [],
      reasonCodes: ["escalate_worker_requested_capability_missing"],
    };
  }
  const capability = findRuntimeNodeCapability(requestedCapabilityId, options.capabilityManifest);
  if (!capability) {
    return {
      nodes: [],
      edges: [],
      acceptedAliasFields: [],
      reasonCodes: [`escalate_worker_requested_capability_unknown:${requestedCapabilityId}`],
    };
  }

  const targetNodeId = targetNodeIdFromDecisionRecord(record);
  if (!targetNodeId) {
    return {
      nodes: [],
      edges: [],
      acceptedAliasFields: [],
      reasonCodes: ["escalate_worker_target_node_missing"],
    };
  }
  const escalationContract = flattenModelDecisionFields(
    asRecord(record.escalationContract ?? record.contract ?? record.repairContract),
  );
  const mergedRecord = {
    ...escalationContract,
    ...record,
  };

  const targetCommitmentIds = [
    ...new Set([
      ...arrayFromAny(record, ["targetCommitmentIds", "commitmentIdsAdvanced", "commitmentIds"]),
      ...arrayFromAny(escalationContract, [
        "targetCommitmentIds",
        "commitmentIdsAdvanced",
        "commitmentIds",
        "advancesCommitments",
      ]),
    ]),
  ].slice(0, 24);
  const escalationObjective =
    firstString(mergedRecord, [
      "escalationObjective",
      "objective",
      "exactObjective",
      "repairObjective",
      "taskObjective",
    ]) || stringValue(record.rationaleForDecision);
  const successCriteria = [
    ...new Set([
      ...arrayFromAny(record, ["successCriteria", "acceptanceCriteria", "validationCriteria"]),
      ...arrayFromAny(escalationContract, [
        "successCriteria",
        "acceptanceCriteria",
        "validationCriteria",
      ]),
    ]),
  ].slice(0, 12);
  const inputRefs = [
    ...new Set([
      ...arrayFromAny(record, [
        "inputRefs",
        "inputHandoffRefs",
        "handoffRefs",
        "evidenceRefs",
        "artifactRefs",
      ]),
      ...arrayFromAny(escalationContract, [
        "inputRefs",
        "inputHandoffRefs",
        "handoffRefs",
        "evidenceRefs",
        "artifactRefs",
      ]),
    ]),
  ].slice(0, 24);
  const splitInputRefs = splitStagedInputRefs(inputRefs);
  const nodeId = sanitizeId(
    `${capability.capabilityId}-escalation-${targetNodeId}`,
    `${capability.capabilityId}-escalation`,
  );
  const node = escalationNodeFromCapability({
    capability,
    nodeId,
    targetNodeId,
    targetCommitmentIds,
    escalationObjective,
    successCriteria,
    splitInputRefs,
    record: mergedRecord,
  });
  return {
    nodes: [node],
    edges: [
      {
        edgeId: `${targetNodeId}-to-${nodeId}`,
        fromNodeId: targetNodeId,
        toNodeId: nodeId,
        edgeKind: "escalation",
        reasonCodes: ["runtime_compiled_escalate_worker_edge"],
        artifactRefs: [],
        metadata: jsonValue({
          source: "runtime_compiled_escalate_worker_intent",
          requestedCapabilityId: capability.capabilityId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }) as JsonValue,
      },
    ],
    acceptedAliasFields: ["escalate_worker.intent"],
    reasonCodes: ["escalate_worker_intent_compiled"],
  };
}

function requestContextIntentFromRecord(
  record: Record<string, unknown>,
): RequestContextIntent | null {
  const source = flattenModelDecisionFields(
    asRecord(
      record.requestContextIntent ??
        record.contextRequestIntent ??
        record.contextRequest ??
        record.repairIntent,
    ),
  );
  const merged = {
    ...source,
    ...Object.fromEntries(
      [
        "failedNodeIds",
        "targetNodeIds",
        "targetCommitmentIds",
        "commitmentIdsAdvanced",
        "missingContextQuestions",
        "contextObjective",
        "downstreamConsumer",
        "successCriteria",
        "inputRefs",
        "targetRefs",
        "selectedCapabilityId",
        "capabilityId",
        "stopIfMissing",
        "rationale",
      ]
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, record[key]]),
    ),
  };
  const explicitTargetNodeId = targetNodeIdFromDecisionRecord(record);
  const failedNodeIds = arrayFromAny(merged, [
    "failedNodeIds",
    "blockedNodeIds",
    "sourceNodeIds",
    "repairTargetNodeIds",
  ]);
  const targetNodeIds = [
    ...new Set([
      ...arrayFromAny(merged, ["targetNodeIds", "downstreamNodeIds", "nodeIds"]),
      ...(explicitTargetNodeId ? [explicitTargetNodeId] : []),
    ]),
  ].slice(0, 24);
  const contextObjective = firstString(merged, [
    "contextObjective",
    "objective",
    "repairObjective",
    "requestedContextObjective",
  ]);
  const explicitMissingContextQuestions = arrayFromAny(merged, [
    "missingContextQuestions",
    "contextQuestions",
    "requiredContextQuestions",
    "questions",
  ]);
  const singleContextQuestion = firstString(merged, [
    "missingContextQuestion",
    "contextQuestion",
    "requiredContextQuestion",
    "question",
  ]);
  const modelAuthoredContextObjective =
    contextObjective ||
    firstString(record, [
      "contextObjective",
      "repairObjective",
      "requestedContextObjective",
      "rationaleForDecision",
      "expectedEvidenceDescription",
    ]);
  const missingContextQuestions =
    explicitMissingContextQuestions.length > 0
      ? explicitMissingContextQuestions
      : singleContextQuestion
        ? [singleContextQuestion]
        : modelAuthoredContextObjective
          ? [modelAuthoredContextObjective]
          : [];
  const targetCommitmentIds = arrayFromAny(merged, [
    "targetCommitmentIds",
    "commitmentIdsAdvanced",
    "commitmentIds",
  ]);
  if (
    failedNodeIds.length === 0 &&
    targetNodeIds.length === 0 &&
    !modelAuthoredContextObjective &&
    missingContextQuestions.length === 0 &&
    targetCommitmentIds.length === 0
  ) {
    return null;
  }
  return {
    failedNodeIds,
    targetNodeIds,
    targetCommitmentIds,
    missingContextQuestions,
    contextObjective: modelAuthoredContextObjective,
    downstreamConsumer:
      firstString(merged, ["downstreamConsumer", "consumer", "blockedConsumer"]) ||
      targetNodeIds[0] ||
      "implementation_and_validation",
    successCriteria: arrayFromAny(merged, [
      "successCriteria",
      "acceptanceCriteria",
      "validationCriteria",
    ]),
    inputRefs: arrayFromAny(merged, [
      "inputRefs",
      "inputHandoffRefs",
      "handoffRefs",
      "evidenceRefs",
    ]),
    targetRefs: arrayFromAny(merged, ["targetRefs", "fileRefs", "sourceRefs", "artifactRefs"]),
    selectedCapabilityId:
      firstString(merged, [
        "selectedCapabilityId",
        "capabilityId",
        "requestedCapabilityId",
        "capability",
      ]) || "context_scout",
    stopIfMissing: arrayFromAny(merged, ["stopIfMissing", "stopConditions", "blockers"]),
    rationale: firstString(merged, ["rationale", "whyNeeded", "roleRationale"]) || "",
  };
}

function compileRequestContextIntent(
  record: Record<string, unknown>,
  options: Required<Pick<OrchestratorGraphDecisionCompileOptions, "capabilityManifest">>,
): {
  intent: RequestContextIntent | null;
  nodes: OrchestratorGraphNodeSpec[];
  edges: OrchestratorGraphEdgeSpec[];
  acceptedAliasFields: string[];
  reasonCodes: string[];
} {
  if (stringValue(record.decisionKind) !== "request_context") {
    return { intent: null, nodes: [], edges: [], acceptedAliasFields: [], reasonCodes: [] };
  }
  const intent = requestContextIntentFromRecord(record);
  const reasonCodes: string[] = [];
  if (!intent) {
    return {
      intent: null,
      nodes: [],
      edges: [],
      acceptedAliasFields: [],
      reasonCodes: ["request_context_intent_missing"],
    };
  }
  const capability = findRuntimeNodeCapability(
    intent.selectedCapabilityId || "context_scout",
    options.capabilityManifest,
  );
  if (!capability) {
    return {
      intent,
      nodes: [],
      edges: [],
      acceptedAliasFields: ["requestContextIntent"],
      reasonCodes: [`request_context_capability_unknown:${intent.selectedCapabilityId}`],
    };
  }
  if (capability.graphNodeKind !== "context_scout" || capability.roleClass !== "context") {
    reasonCodes.push(`request_context_capability_not_context_invalid:${capability.capabilityId}`);
  }
  const targetNodeIds = [...new Set([...intent.targetNodeIds, ...intent.failedNodeIds])].slice(
    0,
    24,
  );
  if (targetNodeIds.length === 0 && intent.targetCommitmentIds.length === 0) {
    reasonCodes.push("request_context_target_node_missing");
  }
  if (intent.targetCommitmentIds.length === 0) {
    reasonCodes.push("request_context_commitment_ids_missing");
  }
  if (intent.missingContextQuestions.length === 0) {
    reasonCodes.push("request_context_questions_missing");
  }
  if (!intent.contextObjective) {
    reasonCodes.push("request_context_objective_missing");
  }
  if (blockingCompileReasonCodes(reasonCodes).length > 0) {
    return {
      intent,
      nodes: [],
      edges: [],
      acceptedAliasFields: ["requestContextIntent"],
      reasonCodes,
    };
  }
  const baseNodeId = `${slugRuntimeId(
    targetNodeIds[0] ?? intent.targetCommitmentIds[0] ?? "context",
    "context",
  )}-context-repair`;
  const nodeId = slugRuntimeId(
    firstString(record, ["contextNodeId", "repairNodeId"]) || baseNodeId,
    baseNodeId,
  );
  const successCriteria =
    intent.successCriteria.length > 0
      ? intent.successCriteria
      : [
          "Produces verified existing repo file refs.",
          "Answers each missing context question.",
          "Emits a model-authored handoff summary for the blocked downstream node.",
        ];
  const whyThisIsNotDuplicateWork =
    intent.rationale ||
    `This context request targets unresolved question(s) for ${[
      ...targetNodeIds,
      ...intent.targetCommitmentIds,
    ]
      .slice(0, 4)
      .join(", ")}: ${intent.missingContextQuestions.slice(0, 2).join(" | ")}`;
  const costRationale =
    firstString(record, ["costRationale"]) ||
    "Context scout is the cheapest context-class capability for resolving missing bounded repo context before implementation.";
  const stopOrEscalationCondition =
    intent.stopIfMissing[0] ||
    "Return to orchestrator if the context scout cannot produce verified repo refs and a bounded handoff.";
  const expectedEvidence = capability.evidenceProducedKinds.length
    ? capability.evidenceProducedKinds
    : ["context_handoff"];
  const node: OrchestratorGraphNodeSpec = {
    nodeId,
    nodeKind: capability.graphNodeKind,
    capabilityId: capability.capabilityId,
    executorKey: capability.executorKey,
    workerRef: capability.workerRef,
    requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
    assignedRole: capability.roleId,
    modelOrWorkerRef: capability.workerRef,
    inputHandoffRefs: intent.inputRefs,
    expectedOutput: `Context handoff resolving: ${intent.missingContextQuestions
      .slice(0, 4)
      .join(" | ")}`,
    acceptanceCriteria: successCriteria,
    downstreamConsumer: intent.downstreamConsumer,
    commitmentIdsAdvanced: intent.targetCommitmentIds,
    whyThisRoleIsNeededNow:
      intent.rationale || "Downstream implementation is blocked on missing bounded repo context.",
    exactObjective: intent.contextObjective,
    evidenceExpectation: "Bounded context handoff packet with verified refs and limitations.",
    targetRefs: intent.targetRefs,
    metadata: jsonValue({
      genericSchedulerProtocolCompiled: true,
      schedulerProtocolCompiler: "request_context_intent",
      schedulerCompiledFromDecisionKind: "request_context",
      requestContextIntent: jsonValue(intent),
      targetNodeIds,
      failedNodeIds: intent.failedNodeIds,
      missingContextQuestions: intent.missingContextQuestions,
      stopIfMissing: intent.stopIfMissing,
      capabilityId: capability.capabilityId,
      graphNodeKind: capability.graphNodeKind,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      consideredCapabilityIds: [capability.capabilityId],
      utilityRationale:
        intent.rationale || "Resolve missing bounded repo context before implementation.",
      costRationale,
      whyThisIsNotDuplicateWork,
      stopOrEscalationCondition,
      expectedEvidence,
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      costAwareUtilityDecision: {
        decisionId: `${nodeId}:utility`,
        consideredCapabilityIds: [capability.capabilityId],
        selectedCapabilityId: capability.capabilityId,
        selectedProviderCapabilityProfileId: null,
        selectedNodeKind: capability.graphNodeKind,
        selectedExecutorKey: capability.executorKey,
        targetCommitmentIds: intent.targetCommitmentIds,
        utilityRationale:
          intent.rationale || "Resolve missing bounded repo context before implementation.",
        costRationale,
        whyCheaperOptionsWereInsufficient: null,
        whyThisIsNotDuplicateWork,
        expectedEvidence,
        selectedModelQualificationProfileId: null,
        qualificationEvidenceRefs: [],
        expectedDownstreamConsumer: intent.downstreamConsumer,
        budgetRef: null,
        stopOrEscalationCondition,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      requestContextRepairMode:
        targetNodeIds.length > 0
          ? "target_node_context_repair"
          : "pre_implementation_commitment_context_refinement",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }) as JsonValue,
  };
  const edges = targetNodeIds.map((targetNodeId) => ({
    edgeId: `${nodeId}-context-supplies-${targetNodeId}`,
    fromNodeId: nodeId,
    toNodeId: targetNodeId,
    edgeKind: "context_supplies" as const,
    reasonCodes: ["request_context_intent_runtime_compiled_edge"],
    artifactRefs: [],
    metadata: {
      schedulerCompiledFromDecisionKind: "request_context",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  }));
  return {
    intent,
    nodes: [node],
    edges,
    acceptedAliasFields: [
      record.contextRequest !== undefined ? "contextRequest" : "requestContextIntent",
    ],
    reasonCodes: ["request_context_intent_compiled", ...reasonCodes],
  };
}

function escalationNodeFromCapability(input: {
  capability: RuntimeNodeCapability;
  nodeId: string;
  targetNodeId: string;
  targetCommitmentIds: string[];
  escalationObjective: string;
  successCriteria: string[];
  splitInputRefs: { targetRefs: string[]; inputHandoffRefs: string[] };
  record: Record<string, unknown>;
}): OrchestratorGraphNodeSpec {
  const fallbackSuccessCriteria = [
    "Produce bounded implementation evidence for the target commitments.",
    "Run or report required validation for the edited surface.",
    "Emit evidence claims tied to the target commitments and prior failed node.",
  ];
  const acceptanceCriteria =
    input.successCriteria.length > 0 ? input.successCriteria : fallbackSuccessCriteria;
  const downstreamConsumer =
    firstString(input.record, ["downstreamConsumer", "consumer", "expectedDownstreamConsumer"]) ||
    "validation";
  const qualificationEvidenceRefs = input.capability.productionSelectionRequiresQualification
    ? qualificationEvidenceForCapability(input.capability.capabilityId)
    : [];
  return {
    nodeId: input.nodeId,
    nodeKind: input.capability.graphNodeKind,
    capabilityId: input.capability.capabilityId,
    executorKey: input.capability.executorKey,
    workerRef: input.capability.workerRef,
    requiredMetadataSchemaRef: input.capability.requiredMetadataSchemaRef,
    assignedRole: input.capability.roleId,
    modelOrWorkerRef: input.capability.workerRef,
    inputHandoffRefs: [
      ...new Set([input.targetNodeId, ...input.splitInputRefs.inputHandoffRefs]),
    ].slice(0, 24),
    expectedOutput:
      firstString(input.record, ["expectedOutput", "expectedHumanReadableOutput"]) ||
      `Escalated worker output for ${input.targetNodeId}: ${input.escalationObjective}`,
    acceptanceCriteria,
    downstreamConsumer,
    commitmentIdsAdvanced: input.targetCommitmentIds,
    whyThisRoleIsNeededNow:
      stringValue(input.record.rationaleForDecision) ||
      `The previous node ${input.targetNodeId} requires escalation to ${input.capability.capabilityId}.`,
    exactObjective: input.escalationObjective,
    evidenceExpectation: null,
    targetRefs: input.splitInputRefs.targetRefs,
    metadata: jsonValue({
      schedulerCompiledFromDecisionKind: "escalate_worker",
      stagedSchedulerProtocolCompiled: true,
      targetNodeId: input.targetNodeId,
      sourceNodeId: input.targetNodeId,
      targetCommitmentIds: input.targetCommitmentIds,
      commitmentIdsAdvanced: input.targetCommitmentIds,
      selectedCapabilityId: input.capability.capabilityId,
      capabilityId: input.capability.capabilityId,
      graphNodeKind: input.capability.graphNodeKind,
      executorKey: input.capability.executorKey,
      workerRef: input.capability.workerRef,
      requiredMetadataSchemaRef: input.capability.requiredMetadataSchemaRef,
      taskFamily: taskFamilyForCapability(input.capability.capabilityId),
      workerTaskFamily: taskFamilyForCapability(input.capability.capabilityId),
      nonCodexTaskFamily: taskFamilyForCapability(input.capability.capabilityId),
      escalationObjective: input.escalationObjective,
      expectedOutput:
        firstString(input.record, ["expectedOutput", "expectedHumanReadableOutput"]) ||
        `Escalated worker output for ${input.targetNodeId}: ${input.escalationObjective}`,
      acceptanceCriteria,
      targetRefs: input.splitInputRefs.targetRefs,
      inputHandoffRefs: [
        ...new Set([input.targetNodeId, ...input.splitInputRefs.inputHandoffRefs]),
      ].slice(0, 24),
      consideredCapabilityIds: arrayFromAny(input.record, [
        "consideredCapabilityIds",
        "consideredCapabilities",
      ]).length
        ? arrayFromAny(input.record, ["consideredCapabilityIds", "consideredCapabilities"])
        : [input.capability.capabilityId],
      utilityRationale:
        firstString(input.record, ["utilityRationale"]) ||
        stringValue(input.record.rationaleForDecision),
      costRationale:
        firstString(input.record, ["costRationale"]) ||
        `Runtime compiled escalation to ${input.capability.capabilityId} from the capability manifest after the source node needed review.`,
      whyCheaperOptionsWereInsufficient:
        firstString(input.record, ["whyCheaperOptionsWereInsufficient"]) || null,
      whyThisIsNotDuplicateWork:
        firstString(input.record, ["whyThisIsNotDuplicateWork"]) ||
        `This node escalates unresolved work from ${input.targetNodeId}; it is not a duplicate successful edit.`,
      stopOrEscalationCondition:
        firstString(input.record, ["stopOrEscalationCondition", "escalationCondition"]) ||
        "Return to the orchestrator if the escalated worker cannot produce accepted evidence.",
      selectedModelQualificationProfileId:
        firstString(input.record, [
          "selectedModelQualificationProfileId",
          "modelQualificationProfileId",
          "qualificationProfileId",
        ]) ||
        input.capability.modelQualificationProfileIds[0] ||
        null,
      qualificationEvidenceRefs,
      expectedEvidence: input.capability.evidenceProducedKinds,
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }) as JsonValue,
  };
}

type StagedWorkBreakdownUnit = {
  workUnitId: string;
  title: string;
  objective: string;
  commitmentIds: string[];
  rationale: string;
  expectedOutcome: string;
  successCriteria: string[];
  targetRefs: string[];
  inputRefs: string[];
  dependencyWorkUnitIds: string[];
  executionIntent: ExecutionIntent;
};

function stagedSourceRecord(record: Record<string, unknown>): {
  source: Record<string, unknown>;
  sourceLabel: string;
  nested: boolean;
} {
  const nested = asRecord(record.stagedScheduler ?? record.stagedSchedulerProtocol);
  if (Object.keys(nested).length > 0) {
    return { source: nested, sourceLabel: "stagedScheduler", nested: true };
  }
  return { source: record, sourceLabel: "topLevel", nested: false };
}

function runtimeOwnedFieldReasonCodes(input: { records: unknown[]; pathPrefix: string }): string[] {
  return runtimeOwnedFieldReasonCodesForRecords({
    records: input.records,
    pathPrefix: input.pathPrefix,
    boundaryKind: "scheduler_staged_protocol",
    codePrefix: "staged_scheduler_runtime_owned_field_rejected",
  });
}

type StagedCapabilitySelection = {
  workUnitId: string;
  capabilityId: string;
  consideredCapabilityIds: string[];
  utilityRationale: string;
  costRationale: string;
  whyCheaperOptionsWereInsufficient: string | null;
  whyThisIsNotDuplicateWork: string;
  stopOrEscalationCondition: string;
  selectedModelQualificationProfileId: string | null;
  qualificationEvidenceRefs: string[];
};

type StagedNodeContract = {
  workUnitId: string;
  roleRationale: string;
  objective: string;
  inputRefs: string[];
  expectedOutput: string;
  successCriteria: string[];
  downstreamConsumer: string;
  targetRefs: string[];
  dependencyWorkUnitIds: string[];
  executionIntent: ExecutionIntent;
};

function firstRecordArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function sanitizeId(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || fallback;
}

function stagedWorkUnits(record: Record<string, unknown>): StagedWorkBreakdownUnit[] {
  return firstRecordArray(record, [
    "workBreakdownUnits",
    "commitmentWorkBreakdown",
    "commitmentWorkBreakdownUnits",
    "workUnits",
    "decompositionWorkUnits",
  ])
    .map((value, index) => {
      const unit = flattenModelDecisionFields(asRecord(value));
      const workUnitId = sanitizeId(
        firstString(unit, ["workUnitId", "unitId", "id", "nodeId"]) || `work-unit-${index + 1}`,
        `work-unit-${index + 1}`,
      );
      return {
        workUnitId,
        title: firstString(unit, ["title", "name"]) || workUnitId,
        objective: firstString(unit, ["objective", "taskObjective", "exactObjective"]),
        commitmentIds: arrayFromAny(unit, [
          "commitmentIds",
          "targetCommitmentIds",
          "commitmentIdsAdvanced",
        ]),
        rationale: firstString(unit, ["rationale", "whyNeeded", "roleRationale"]),
        expectedOutcome: firstString(unit, [
          "expectedOutcome",
          "expectedOutput",
          "expectedHumanReadableOutput",
        ]),
        successCriteria: arrayFromAny(unit, [
          "successCriteria",
          "acceptanceCriteria",
          "validationCriteria",
          "completionCriteria",
        ]),
        targetRefs: arrayFromAny(unit, ["targetRefs", "fileRefs", "sourceRefs", "artifactRefs"]),
        inputRefs: arrayFromAny(unit, ["inputRefs", "inputHandoffRefs", "handoffRefs"]),
        dependencyWorkUnitIds: arrayFromAny(unit, [
          "dependsOnWorkUnitIds",
          "dependencyWorkUnitIds",
          "upstreamWorkUnitIds",
          "afterWorkUnitIds",
          "requiresWorkUnitIds",
          "dependsOn",
          "dependencies",
        ]),
        executionIntent:
          normalizeExecutionIntent(
            firstString(unit, [
              "executionIntent",
              "workIntent",
              "nodeExecutionIntent",
              "taskExecutionIntent",
            ]),
          ) ?? "unspecified",
      } satisfies StagedWorkBreakdownUnit;
    })
    .filter((unit) => unit.workUnitId && unit.objective);
}

function isRepoTargetRef(ref: string): boolean {
  return (
    ref.startsWith("extensions/") ||
    ref.startsWith("src/") ||
    ref.startsWith("ui/") ||
    ref.startsWith("scripts/") ||
    ref.startsWith("docs/") ||
    ref.startsWith("packages/")
  );
}

function splitStagedInputRefs(inputRefs: string[]): {
  targetRefs: string[];
  inputHandoffRefs: string[];
} {
  const targetRefs: string[] = [];
  const inputHandoffRefs: string[] = [];
  for (const ref of inputRefs) {
    if (isRepoTargetRef(ref)) {
      targetRefs.push(ref);
    } else {
      inputHandoffRefs.push(ref);
    }
  }
  return {
    targetRefs: [...new Set(targetRefs)].slice(0, 24),
    inputHandoffRefs: [...new Set(inputHandoffRefs)].slice(0, 24),
  };
}

function stagedAcceptanceCriteria(input: {
  contract: StagedNodeContract;
  unit: StagedWorkBreakdownUnit;
}): string[] {
  const criteria =
    input.contract.successCriteria.length > 0
      ? input.contract.successCriteria
      : input.unit.successCriteria.length > 0
        ? input.unit.successCriteria
        : input.unit.expectedOutcome
          ? [`Produces expected outcome: ${input.unit.expectedOutcome}`]
          : [];
  return [...new Set(criteria)].slice(0, 12);
}

function stagedCapabilitySelections(record: Record<string, unknown>): StagedCapabilitySelection[] {
  return firstRecordArray(record, [
    "capabilitySelectionsForWorkUnits",
    "capabilitySelections",
    "selectedCapabilitiesForWorkUnits",
  ])
    .map((value, index) => {
      const selection = flattenModelDecisionFields(asRecord(value));
      const workUnitId = sanitizeId(
        firstString(selection, ["workUnitId", "unitId", "id", "nodeId"]) ||
          `work-unit-${index + 1}`,
        `work-unit-${index + 1}`,
      );
      return {
        workUnitId,
        capabilityId: firstString(selection, [
          "selectedCapabilityId",
          "capabilityId",
          "capability",
          "capabilityRef",
        ]),
        consideredCapabilityIds: arrayFromAny(selection, [
          "consideredCapabilityIds",
          "consideredCapabilities",
        ]),
        utilityRationale: firstString(selection, ["utilityRationale", "rationale"]),
        costRationale: firstString(selection, ["costRationale"]),
        whyCheaperOptionsWereInsufficient:
          firstString(selection, ["whyCheaperOptionsWereInsufficient"]) || null,
        whyThisIsNotDuplicateWork: firstString(selection, ["whyThisIsNotDuplicateWork"]),
        stopOrEscalationCondition: firstString(selection, [
          "stopOrEscalationCondition",
          "escalationCondition",
        ]),
        selectedModelQualificationProfileId:
          firstString(selection, [
            "selectedModelQualificationProfileId",
            "modelQualificationProfileId",
            "qualificationProfileId",
          ]) || null,
        qualificationEvidenceRefs: arrayFromAny(selection, [
          "qualificationEvidenceRefs",
          "modelQualificationEvidenceRefs",
        ]),
      } satisfies StagedCapabilitySelection;
    })
    .filter((selection) => selection.workUnitId && selection.capabilityId);
}

function stagedNodeContracts(record: Record<string, unknown>): StagedNodeContract[] {
  return firstRecordArray(record, [
    "nodeContractDrafts",
    "nodeContracts",
    "workUnitContracts",
    "nodeContractDefinitions",
  ])
    .map((value, index) => {
      const contract = flattenModelDecisionFields(asRecord(value));
      const workUnitId = sanitizeId(
        firstString(contract, ["workUnitId", "unitId", "id", "nodeId"]) || `work-unit-${index + 1}`,
        `work-unit-${index + 1}`,
      );
      return {
        workUnitId,
        roleRationale: firstString(contract, [
          "roleRationale",
          "whyThisRoleIsNeededNow",
          "whyNeeded",
        ]),
        objective: firstString(contract, ["objective", "exactObjective", "taskObjective"]),
        inputRefs: arrayFromAny(contract, ["inputRefs", "inputHandoffRefs", "handoffRefs"]),
        expectedOutput: firstString(contract, [
          "expectedOutput",
          "expectedHumanReadableOutput",
          "outputContract",
        ]),
        successCriteria: arrayFromAny(contract, [
          "successCriteria",
          "acceptanceCriteria",
          "validationCriteria",
        ]),
        downstreamConsumer: firstString(contract, [
          "downstreamConsumer",
          "consumer",
          "expectedDownstreamConsumer",
        ]),
        targetRefs: arrayFromAny(contract, [
          "targetRefs",
          "fileRefs",
          "sourceRefs",
          "artifactRefs",
        ]),
        dependencyWorkUnitIds: arrayFromAny(contract, [
          "dependsOnWorkUnitIds",
          "dependencyWorkUnitIds",
          "upstreamWorkUnitIds",
          "afterWorkUnitIds",
          "requiresWorkUnitIds",
          "dependsOn",
          "dependencies",
        ]),
        executionIntent:
          normalizeExecutionIntent(
            firstString(contract, [
              "executionIntent",
              "workIntent",
              "nodeExecutionIntent",
              "taskExecutionIntent",
            ]),
          ) ?? "unspecified",
      } satisfies StagedNodeContract;
    })
    .filter((contract) => contract.workUnitId);
}

function stagedEdgeValues(record: Record<string, unknown>): {
  edges: OrchestratorGraphEdgeSpec[];
  parallelIndependentNodesJustification: string;
} {
  const structure = asRecord(
    record.edgeOrParallelismDraft ??
      record.edgeOrParallelism ??
      record.graphStructure ??
      record.structureReview,
  );
  const source = Object.keys(structure).length > 0 ? structure : record;
  const edges = firstRecordArray(source, [
    "edges",
    "newEdges",
    "handoffEdges",
    "dependencyEdges",
    "nodeEdges",
  ])
    .map(normalizeEdge)
    .filter((edge): edge is OrchestratorGraphEdgeSpec => Boolean(edge));
  const parallelIndependentNodesJustification = firstString(source, [
    "parallelIndependentNodesJustification",
    "parallelismRationale",
    "parallelJustification",
  ]);
  return { edges, parallelIndependentNodesJustification };
}

function qualificationEvidenceForCapability(capabilityId: string): string[] {
  if (capabilityId.includes("implementation_microtask")) {
    return [
      "model-profile://qwen/controller-worker-loop",
      "model-profile://kimi/file-edit-worker-loop",
    ];
  }
  if (capabilityId.includes("test_authoring")) {
    return ["model-profile://test-authoring/validated"];
  }
  return [`model-profile://${capabilityId}/runtime-capability-manifest`];
}

function orchestratorNodeFromWorkIntent(
  node: CompiledWorkIntentGraphNode,
): OrchestratorGraphNodeSpec {
  return {
    nodeId: node.nodeId,
    nodeKind: node.nodeKind,
    assignedRole: node.assignedRole,
    modelOrWorkerRef: node.modelOrWorkerRef,
    inputHandoffRefs: node.inputHandoffRefs,
    expectedOutput: node.expectedOutput,
    acceptanceCriteria: node.acceptanceCriteria,
    downstreamConsumer: node.downstreamConsumer,
    commitmentIdsAdvanced: node.commitmentIdsAdvanced,
    whyThisRoleIsNeededNow: node.whyThisRoleIsNeededNow,
    exactObjective: node.exactObjective,
    evidenceExpectation: node.evidenceExpectation,
    targetRefs: node.targetRefs,
    metadata: node.metadata,
  };
}

function taskFamilyForCapability(capabilityId: string): string {
  if (capabilityId === "implementation_microtask") {
    return "small_source_edit";
  }
  if (capabilityId === "non_codex_context_scout" || capabilityId === "context_scout") {
    return "repo_context_scout";
  }
  if (capabilityId === "test_authoring" || capabilityId === "non_codex_test_writer") {
    return "test_writing_edit";
  }
  if (capabilityId === "non_codex_docs_editor") {
    return "docs_spec_edit";
  }
  if (capabilityId === "non_codex_validation_failure_explainer") {
    return "validation_failure_explanation";
  }
  if (capabilityId === "non_codex_frontend_editor") {
    return "frontend_scoped_edit";
  }
  if (capabilityId === "implementation_complex") {
    return "complex_codex_escalation";
  }
  return capabilityId;
}

function nodesFromStagedSchedulerProtocol(
  record: Record<string, unknown>,
  options: Required<Pick<OrchestratorGraphDecisionCompileOptions, "capabilityManifest">>,
): {
  nodes: OrchestratorGraphNodeSpec[];
  edges: OrchestratorGraphEdgeSpec[];
  diagnostics: OrchestratorGraphRejectedNodeDiagnostic[];
  acceptedAliasFields: string[];
  reasonCodes: string[];
  parallelIndependentNodesJustification: string;
} {
  const staged = stagedSourceRecord(record);
  const source = staged.source;
  const workUnits = stagedWorkUnits(source);
  const selections = stagedCapabilitySelections(source);
  const contracts = stagedNodeContracts(source);
  if (workUnits.length === 0 && selections.length === 0 && contracts.length === 0) {
    return {
      nodes: [],
      edges: [],
      diagnostics: [],
      acceptedAliasFields: [],
      reasonCodes: [],
      parallelIndependentNodesJustification: "",
    };
  }
  const diagnostics: OrchestratorGraphRejectedNodeDiagnostic[] = [];
  const reasonCodes: string[] = [
    ...runtimeOwnedFieldReasonCodes({
      records: firstRecordArray(source, [
        "workBreakdownUnits",
        "commitmentWorkBreakdown",
        "commitmentWorkBreakdownUnits",
        "workUnits",
        "decompositionWorkUnits",
      ]),
      pathPrefix: `${staged.sourceLabel}.workBreakdownUnits`,
    }),
    ...runtimeOwnedFieldReasonCodes({
      records: firstRecordArray(source, [
        "capabilitySelectionsForWorkUnits",
        "capabilitySelections",
        "selectedCapabilitiesForWorkUnits",
      ]),
      pathPrefix: `${staged.sourceLabel}.capabilitySelectionsForWorkUnits`,
    }),
    ...runtimeOwnedFieldReasonCodes({
      records: firstRecordArray(source, [
        "nodeContractDrafts",
        "nodeContracts",
        "workUnitContracts",
        "nodeContractDefinitions",
      ]),
      pathPrefix: `${staged.sourceLabel}.nodeContractDrafts`,
    }),
  ];
  const selectionByUnit = new Map(selections.map((selection) => [selection.workUnitId, selection]));
  const contractByUnit = new Map(contracts.map((contract) => [contract.workUnitId, contract]));
  const nodes: OrchestratorGraphNodeSpec[] = [];
  for (const [index, unit] of workUnits.entries()) {
    const selection = selectionByUnit.get(unit.workUnitId);
    const contract = contractByUnit.get(unit.workUnitId);
    if (!selection) {
      reasonCodes.push(`staged_capability_selection_missing:${unit.workUnitId}`);
      continue;
    }
    if (!contract) {
      reasonCodes.push(`staged_node_contract_missing:${unit.workUnitId}`);
      continue;
    }
    const capability = findRuntimeNodeCapability(
      selection.capabilityId,
      options.capabilityManifest,
    );
    if (!capability) {
      diagnostics.push(
        capabilityDiagnostic({
          nodeIndex: index,
          providedNodeKind: null,
          providedCapabilityId: selection.capabilityId,
          matchingCapabilityId: null,
          expectedGraphNodeKind: null,
          errorCode: "staged_selected_capability_unknown",
          message: "Staged capability selection could not be found in the runtime manifest.",
        }),
      );
      reasonCodes.push(`staged_selected_capability_unknown:${selection.capabilityId}`);
      continue;
    }
    const modelAuthoredExecutionIntent =
      contract.executionIntent !== "unspecified" ? contract.executionIntent : unit.executionIntent;
    const splitInputRefs = splitStagedInputRefs([...unit.inputRefs, ...contract.inputRefs]);
    const targetRefs = [
      ...new Set([...contract.targetRefs, ...unit.targetRefs, ...splitInputRefs.targetRefs]),
    ].slice(0, 24);
    const acceptanceCriteria = stagedAcceptanceCriteria({ contract, unit });
    const expectedOutput = contract.expectedOutput || unit.expectedOutcome;
    const roleRationale = contract.roleRationale || unit.rationale || selection.utilityRationale;
    const exactObjective = contract.objective || unit.objective;
    const workIntent = compileWorkIntent({
      decisionId: firstString(record, ["decisionId"]) || "model-decision",
      workUnitId: unit.workUnitId,
      title: unit.title,
      objective: exactObjective,
      commitmentIds: unit.commitmentIds,
      executionIntent: modelAuthoredExecutionIntent,
      selectedCapabilityId: selection.capabilityId,
      consideredCapabilityIds: selection.consideredCapabilityIds,
      capabilityRationale: roleRationale,
      costRationale:
        selection.costRationale ||
        `Runtime will validate ${capability.capabilityId} through the capability manifest before executable graph promotion.`,
      whyCheaperOptionsWereInsufficient: selection.whyCheaperOptionsWereInsufficient,
      whyThisIsNotDuplicateWork:
        selection.whyThisIsNotDuplicateWork ||
        `This staged work unit ${unit.workUnitId} has not produced accepted evidence yet.`,
      expectedOutput,
      successCriteria: acceptanceCriteria,
      contextQuestions: [],
      targetRefs,
      inputRefs: splitInputRefs.inputHandoffRefs,
      validationNeeds: [],
      dependencyWorkUnitIds: [
        ...new Set([...unit.dependencyWorkUnitIds, ...contract.dependencyWorkUnitIds]),
      ],
      downstreamConsumer: contract.downstreamConsumer,
      stopIfMissing: selection.stopOrEscalationCondition
        ? [selection.stopOrEscalationCondition]
        : [],
      parallelismRationale: stagedEdgeValues(source).parallelIndependentNodesJustification,
      rationale: unit.rationale || selection.utilityRationale,
      capabilityManifest: options.capabilityManifest,
      sourceRecord: {
        workUnit: unit,
        capabilitySelection: selection,
        nodeContractDraft: contract,
      },
      sourcePath: `${staged.sourceLabel}.workIntent[${index}]`,
    });
    diagnostics.push(
      ...workIntent.diagnostics.map((diagnostic) =>
        capabilityDiagnostic({
          nodeIndex: index,
          providedNodeKind: WORK_INTENT_NODE_KIND,
          providedCapabilityId: selection.capabilityId,
          matchingCapabilityId: capability.capabilityId,
          expectedGraphNodeKind: WORK_INTENT_NODE_KIND,
          workUnitId: unit.workUnitId,
          selectedCapabilityId: selection.capabilityId,
          executionIntent:
            workIntent.capabilityValidation.executionIntent ?? modelAuthoredExecutionIntent,
          compatibilityReason: diagnostic.errorCode,
          path: diagnostic.path,
          validValues: diagnostic.validValues,
          errorCode: diagnostic.errorCode,
          message: diagnostic.message,
        }),
      ),
    );
    reasonCodes.push(
      ...workIntent.reasonCodes.map((code) => `staged_work_intent:${unit.workUnitId}:${code}`),
    );
    if (!workIntent.node) {
      continue;
    }
    nodes.push(orchestratorNodeFromWorkIntent(workIntent.node));
  }
  const nodeIdByWorkUnit = new Map(
    nodes
      .map((node) => {
        const metadata = asRecord(node.metadata);
        return [stringValue(metadata.workUnitId), node.nodeId] as const;
      })
      .filter(([workUnitId]) => Boolean(workUnitId)),
  );
  const stagedStructure = stagedEdgeValues(source);
  const edges = stagedStructure.edges.map((edge, index) => {
    const fromNodeId = edge.fromNodeId
      ? (nodeIdByWorkUnit.get(edge.fromNodeId) ?? edge.fromNodeId)
      : null;
    const toNodeId = edge.toNodeId ? (nodeIdByWorkUnit.get(edge.toNodeId) ?? edge.toNodeId) : null;
    return {
      ...edge,
      edgeId: edge.edgeId ?? `${fromNodeId ?? "start"}-to-${toNodeId ?? `node-${index + 1}`}`,
      fromNodeId,
      toNodeId,
      reasonCodes: [...(edge.reasonCodes ?? []), "staged_scheduler_edge_compiled"],
      metadata: jsonValue({
        ...asRecord(edge.metadata),
        stagedSchedulerProtocolCompiled: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }) as JsonValue,
    } satisfies OrchestratorGraphEdgeSpec;
  });
  const runtimeDerivedEdges =
    edges.length === 0 ? runtimeDerivedStagedEdges({ nodes, workUnits, contracts }) : [];
  return {
    nodes,
    edges: [...edges, ...runtimeDerivedEdges],
    diagnostics,
    acceptedAliasFields: staged.nested
      ? ["stagedSchedulerProtocol", "stagedScheduler"]
      : ["stagedSchedulerProtocol"],
    reasonCodes: [
      "staged_scheduler_graph_compiled",
      ...(runtimeDerivedEdges.length > 0
        ? ["staged_scheduler_runtime_derived_edges_compiled"]
        : []),
      ...reasonCodes,
    ],
    parallelIndependentNodesJustification: stagedStructure.parallelIndependentNodesJustification,
  };
}

function normalizeEdge(value: unknown): OrchestratorGraphEdgeSpec | null {
  const record = asRecord(value);
  const edgeKind = stringValue(record.edgeKind ?? record.kind ?? record.type) || "handoff";
  if (!TEAM_GRAPH_EDGE_KINDS.includes(edgeKind as TeamGraphEdgeKind)) {
    return null;
  }
  const fromNodeId =
    stringValue(
      record.fromNodeId ??
        record.sourceNodeId ??
        record.source ??
        record.from ??
        record.fromWorkUnitId ??
        record.sourceWorkUnitId ??
        record.upstreamWorkUnitId ??
        record.dependsOnWorkUnitId,
    ) || null;
  const toNodeId =
    stringValue(
      record.toNodeId ??
        record.targetNodeId ??
        record.target ??
        record.to ??
        record.toWorkUnitId ??
        record.targetWorkUnitId ??
        record.downstreamWorkUnitId,
    ) || null;
  if (!fromNodeId && !toNodeId) {
    return null;
  }
  return {
    edgeId: stringValue(record.edgeId) || undefined,
    fromNodeId,
    toNodeId,
    edgeKind: edgeKind as TeamGraphEdgeKind,
    reasonCodes: stringArray(record.reasonCodes),
    artifactRefs: stringArray(record.artifactRefs),
    metadata: jsonValue(record.metadata ?? {}) as JsonValue,
  };
}

function canonicalRuntimeEdgeId(input: {
  decisionId: string;
  edge: OrchestratorGraphEdgeSpec;
  index: number;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        decisionId: input.decisionId,
        index: input.index,
        modelEdgeId: input.edge.edgeId ?? null,
        fromNodeId: input.edge.fromNodeId ?? null,
        toNodeId: input.edge.toNodeId ?? null,
        edgeKind: input.edge.edgeKind,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `edge-${digest}-${input.index + 1}`;
}

function canonicalizeDecisionEdges(input: {
  decisionId: string;
  edges: OrchestratorGraphEdgeSpec[];
}): OrchestratorGraphEdgeSpec[] {
  return input.edges.map((edge, index) => {
    const modelAuthoredEdgeId = edge.edgeId ?? null;
    return {
      ...edge,
      edgeId: canonicalRuntimeEdgeId({ decisionId: input.decisionId, edge, index }),
      metadata: jsonValue({
        ...asRecord(edge.metadata),
        modelAuthoredEdgeId,
        runtimeCanonicalEdgeId: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }) as JsonValue,
    };
  });
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
      "dependencies",
      "dependsOn",
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

type OrchestratorNodeRoleClass = RuntimeNodeCapability["roleClass"] | "other";

const RUNTIME_NODE_ROLE_CLASSES = new Set<RuntimeNodeCapability["roleClass"]>([
  "orchestration",
  "context",
  "implementation",
  "validation",
  "review",
  "research",
  "planning",
  "docs",
  "human",
  "closeout",
  "observability",
]);

function roleClassForKnownNodeKind(nodeKind: string): OrchestratorNodeRoleClass {
  switch (nodeKind) {
    case "work_intent":
      return "orchestration";
    case "context_scout":
      return "context";
    case "implementation":
      return "implementation";
    case "validation":
    case "test_review":
    case "test_authoring":
    case "repair":
      return "validation";
    case "reviewer":
    case "security_review":
      return "review";
    case "orchestrator_plan":
    case "context_synthesis":
      return "planning";
    case "web_research":
      return "research";
    case "docs_update":
      return "docs";
    case "human_task":
      return "human";
    case "closeout":
      return "closeout";
    case "observability_readback":
      return "observability";
    default:
      return "other";
  }
}

function nodeRoleClass(node: OrchestratorGraphNodeSpec): OrchestratorNodeRoleClass {
  const capabilityId = node.capabilityId ?? stringValue(asRecord(node.metadata).capabilityId);
  const capability = capabilityId ? findRuntimeNodeCapability(capabilityId) : null;
  if (capability) {
    return capability.roleClass;
  }
  const explicitRoleClass = asRecord(node.metadata).roleClass;
  return typeof explicitRoleClass === "string" &&
    RUNTIME_NODE_ROLE_CLASSES.has(explicitRoleClass as RuntimeNodeCapability["roleClass"])
    ? (explicitRoleClass as RuntimeNodeCapability["roleClass"])
    : typeof asRecord(node.metadata).targetCapabilityRoleClass === "string" &&
        RUNTIME_NODE_ROLE_CLASSES.has(
          asRecord(node.metadata).targetCapabilityRoleClass as RuntimeNodeCapability["roleClass"],
        )
      ? (asRecord(node.metadata).targetCapabilityRoleClass as RuntimeNodeCapability["roleClass"])
      : roleClassForKnownNodeKind(node.nodeKind);
}

function nodeMatchesDownstreamConsumer(node: OrchestratorGraphNodeSpec, consumer: string): boolean {
  const normalized = sanitizeId(consumer, "").replace(/[-:_.]+/g, "");
  if (!normalized) {
    return false;
  }
  const metadata = asRecord(node.metadata);
  return [
    node.nodeId,
    node.nodeKind,
    node.assignedRole,
    node.capabilityId ?? "",
    node.executorKey ?? "",
    node.workerRef ?? "",
    typeof metadata.workUnitId === "string" ? metadata.workUnitId : "",
    typeof metadata.taskFamily === "string" ? metadata.taskFamily : "",
    typeof metadata.targetCapabilityRoleClass === "string"
      ? metadata.targetCapabilityRoleClass
      : "",
    typeof metadata.targetCapabilityGraphNodeKind === "string"
      ? metadata.targetCapabilityGraphNodeKind
      : "",
    typeof metadata.targetCapabilityWorkerRef === "string"
      ? metadata.targetCapabilityWorkerRef
      : "",
    typeof metadata.targetCapabilityExecutorKey === "string"
      ? metadata.targetCapabilityExecutorKey
      : "",
  ].some((value) =>
    sanitizeId(value, "")
      .replace(/[-:_.]+/g, "")
      .includes(normalized),
  );
}

function edgeKey(edge: Pick<OrchestratorGraphEdgeSpec, "fromNodeId" | "toNodeId" | "edgeKind">) {
  return `${edge.fromNodeId ?? ""}->${edge.toNodeId ?? ""}:${edge.edgeKind}`;
}

function runtimeDerivedStagedEdges(input: {
  nodes: OrchestratorGraphNodeSpec[];
  workUnits: StagedWorkBreakdownUnit[];
  contracts: StagedNodeContract[];
}): OrchestratorGraphEdgeSpec[] {
  const nodeIdByWorkUnit = new Map(
    input.nodes
      .map((node) => {
        const metadata = asRecord(node.metadata);
        return [stringValue(metadata.workUnitId), node.nodeId] as const;
      })
      .filter(([workUnitId]) => Boolean(workUnitId)),
  );
  const unitById = new Map(input.workUnits.map((unit) => [unit.workUnitId, unit]));
  const contractByUnit = new Map(
    input.contracts.map((contract) => [contract.workUnitId, contract]),
  );
  const edges: OrchestratorGraphEdgeSpec[] = [];
  const addEdge = (
    fromNodeId: string | null | undefined,
    toNodeId: string | null | undefined,
    edgeKind: TeamGraphEdgeKind,
    reasonCode: string,
  ) => {
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      return;
    }
    const candidate = { fromNodeId, toNodeId, edgeKind };
    if (edges.some((edge) => edgeKey(edge) === edgeKey(candidate))) {
      return;
    }
    edges.push({
      edgeId: `${fromNodeId}-to-${toNodeId}`,
      fromNodeId,
      toNodeId,
      edgeKind,
      reasonCodes: [reasonCode],
      artifactRefs: [],
      metadata: {
        source: "runtime_derived_staged_scheduler_structure",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  };

  for (const node of input.nodes) {
    const metadata = asRecord(node.metadata);
    const workUnitId = stringValue(metadata.workUnitId);
    const declaredDependencies = [
      ...(unitById.get(workUnitId)?.dependencyWorkUnitIds ?? []),
      ...(contractByUnit.get(workUnitId)?.dependencyWorkUnitIds ?? []),
      ...(node.inputHandoffRefs ?? []),
    ];
    for (const dependency of declaredDependencies) {
      const fromNodeId = nodeIdByWorkUnit.get(dependency) ?? dependency;
      if (input.nodes.some((candidate) => candidate.nodeId === fromNodeId)) {
        addEdge(fromNodeId, node.nodeId, "handoff", "runtime_derived_explicit_dependency_edge");
      }
    }
  }

  for (const source of input.nodes) {
    if (!source.downstreamConsumer) {
      continue;
    }
    for (const target of input.nodes) {
      if (nodeMatchesDownstreamConsumer(target, source.downstreamConsumer)) {
        addEdge(
          source.nodeId,
          target.nodeId,
          "handoff",
          "runtime_derived_downstream_consumer_edge",
        );
      }
    }
  }

  if (edges.length > 0) {
    return edges;
  }

  const byRole = new Map<string, OrchestratorGraphNodeSpec[]>();
  for (const node of input.nodes) {
    const roleClass = nodeRoleClass(node);
    byRole.set(roleClass, [...(byRole.get(roleClass) ?? []), node]);
  }
  const connect = (
    upstreamRole: string,
    downstreamRole: string,
    edgeKind: TeamGraphEdgeKind,
    reasonCode: string,
  ) => {
    for (const upstream of byRole.get(upstreamRole) ?? []) {
      for (const downstream of byRole.get(downstreamRole) ?? []) {
        addEdge(upstream.nodeId, downstream.nodeId, edgeKind, reasonCode);
      }
    }
  };
  connect(
    "context",
    "implementation",
    "handoff",
    "runtime_derived_role_order_context_to_implementation",
  );
  connect("context", "validation", "handoff", "runtime_derived_role_order_context_to_validation");
  connect(
    "implementation",
    "validation",
    "handoff",
    "runtime_derived_role_order_implementation_to_validation",
  );
  connect(
    "implementation",
    "review",
    "handoff",
    "runtime_derived_role_order_implementation_to_review",
  );
  connect("validation", "review", "handoff", "runtime_derived_role_order_validation_to_review");
  connect(
    "validation",
    "observability",
    "handoff",
    "runtime_derived_role_order_validation_to_readback",
  );
  connect("review", "observability", "handoff", "runtime_derived_role_order_review_to_readback");
  connect(
    "observability",
    "closeout",
    "closeout_source",
    "runtime_derived_role_order_readback_to_closeout",
  );
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
        "targetNodeRefs",
        "targetNodeIds",
        "repairTarget",
        "repairObjective",
        "successCriteria",
        "reviewObjective",
        "escalationContract",
      ]
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, jsonValue(record[key])]),
    ),
  }) as JsonValue;
}

function blockingCompileReasonCodes(reasonCodes: string[]): string[] {
  return reasonCodes.filter(
    (code) =>
      code.includes("_missing") ||
      code.includes("_unknown") ||
      code.includes("_invalid") ||
      code.includes("_rejected") ||
      code.includes("_conflict") ||
      code.includes("_not_allowed") ||
      code.includes("runtime_owned_field") ||
      code.includes("staged_scheduler_model_authored_runtime_envelope_not_allowed"),
  );
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
      repairRequest: repairRequestForMissingFields({
        failedDecisionId: null,
        missingFields: missingFieldsForDecision(null),
        rejectedReasonCodes: validation.reasonCodes,
      }),
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
  const stagedSchedulerNodes = nodesFromStagedSchedulerProtocol(record, {
    capabilityManifest,
  });
  const escalationIntentNodes = compileEscalationIntent(record, { capabilityManifest });
  const requestContextIntentNodes = compileRequestContextIntent(record, { capabilityManifest });
  const requestContextHasModelAuthoredRuntimeEnvelope =
    decisionKind === "request_context" &&
    ((Array.isArray(record.newNodes) && record.newNodes.length > 0) ||
      (Array.isArray(record.selectedCapabilities) && record.selectedCapabilities.length > 0) ||
      stagedWorkUnits(stagedSourceRecord(record).source).length > 0);
  const ignoreRequestContextRuntimeEnvelope =
    requestContextHasModelAuthoredRuntimeEnvelope && requestContextIntentNodes.nodes.length > 0;
  const modelAuthoredRuntimeEnvelopeReasonCodes =
    !ignoreRequestContextRuntimeEnvelope &&
    options.requireStagedProtocolForNodeCreation &&
    ((Array.isArray(record.newNodes) && record.newNodes.length > 0) ||
      (Array.isArray(record.selectedCapabilities) && record.selectedCapabilities.length > 0))
      ? ["staged_scheduler_model_authored_runtime_envelope_not_allowed"]
      : [];
  const requestContextModelAuthoredEnvelopeReasonCodes =
    requestContextHasModelAuthoredRuntimeEnvelope
      ? ignoreRequestContextRuntimeEnvelope
        ? ["request_context_model_authored_runtime_envelope_ignored"]
        : ["request_context_model_authored_runtime_envelope_not_allowed"]
      : [];
  const nodeResultReasonCodes = ignoreRequestContextRuntimeEnvelope
    ? []
    : nodeResults.flatMap((result) => result.reasonCodes);
  const selectedCapabilityReasonCodes = ignoreRequestContextRuntimeEnvelope
    ? []
    : selectedCapabilityNodes.reasonCodes;
  const stagedSchedulerReasonCodes = ignoreRequestContextRuntimeEnvelope
    ? []
    : stagedSchedulerNodes.reasonCodes;
  const newNodes = [
    ...(ignoreRequestContextRuntimeEnvelope
      ? []
      : nodeResults
          .map((result) => result.node)
          .filter((node): node is OrchestratorGraphNodeSpec => Boolean(node))),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : selectedCapabilityNodes.nodes),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : stagedSchedulerNodes.nodes),
    ...escalationIntentNodes.nodes,
    ...requestContextIntentNodes.nodes,
  ];
  const rejectedNodeDiagnostics = [
    ...(ignoreRequestContextRuntimeEnvelope
      ? []
      : nodeResults.flatMap((result) => result.diagnostics)),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : selectedCapabilityNodes.diagnostics),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : stagedSchedulerNodes.diagnostics),
  ];
  const acceptedAliasFields = [
    ...(ignoreRequestContextRuntimeEnvelope
      ? []
      : nodeResults.flatMap((result) => result.acceptedAliasFields)),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : selectedCapabilityNodes.acceptedAliasFields),
    ...(ignoreRequestContextRuntimeEnvelope ? [] : stagedSchedulerNodes.acceptedAliasFields),
    ...escalationIntentNodes.acceptedAliasFields,
    ...requestContextIntentNodes.acceptedAliasFields,
  ];
  const compileReasonCodes = [
    ...nodeResultReasonCodes,
    ...selectedCapabilityReasonCodes,
    ...stagedSchedulerReasonCodes,
    ...escalationIntentNodes.reasonCodes,
    ...requestContextIntentNodes.reasonCodes,
    ...modelAuthoredRuntimeEnvelopeReasonCodes,
    ...requestContextModelAuthoredEnvelopeReasonCodes,
  ];
  const explicitEdges = edgeValuesFromDecision(record);
  const newEdges =
    explicitEdges.length > 0
      ? explicitEdges
          .map(normalizeEdge)
          .filter((edge): edge is OrchestratorGraphEdgeSpec => Boolean(edge))
      : [];
  const compiledDependencyEdges = explicitNodeDependencyEdges(newNodes);
  const decisionId = stringValue(record.decisionId);
  const decision: OrchestratorGraphDecision = {
    decisionId,
    decisionKind: decisionKind as OrchestratorGraphDecisionKind,
    rationaleForDecision: stringValue(record.rationaleForDecision),
    targetNodeId: targetNodeIdFromDecisionRecord(record),
    runNodeId:
      stringValue(record.runNodeId) ||
      (escalationIntentNodes.nodes.length === 1 ? escalationIntentNodes.nodes[0]?.nodeId : null) ||
      null,
    newNodes,
    newEdges: canonicalizeDecisionEdges({
      decisionId: decisionId || "model-decision",
      edges: [
        ...newEdges,
        ...stagedSchedulerNodes.edges,
        ...escalationIntentNodes.edges,
        ...requestContextIntentNodes.edges,
        ...compiledDependencyEdges,
      ],
    }),
    reasonCodes: stringArray(record.reasonCodes),
    commitmentIdsAdvanced: stringArray(record.commitmentIdsAdvanced),
    expectedEvidenceDescription:
      typeof record.expectedEvidenceDescription === "string"
        ? boundedRuntimeWorkGraphString(record.expectedEvidenceDescription)
        : null,
    requestContextIntent: requestContextIntentNodes.intent,
    runAfterAdd:
      booleanValue(record.runAfterAdd) ||
      escalationIntentNodes.nodes.length > 0 ||
      requestContextIntentNodes.nodes.length > 0,
    metadata: jsonValue({
      ...asRecord(decisionMetadata(record)),
      ...(requestContextIntentNodes.nodes.length > 0
        ? {
            genericSchedulerProtocolCompiled: true,
            schedulerProtocolCompiler: "request_context_intent",
          }
        : {}),
      ...(stagedSchedulerNodes.parallelIndependentNodesJustification
        ? {
            parallelIndependentNodesJustification:
              stagedSchedulerNodes.parallelIndependentNodesJustification,
          }
        : {}),
      ...(stagedSchedulerNodes.nodes.length > 0
        ? {
            stagedSchedulerProtocolCompiled: true,
            stagedWorkUnitCount: stagedSchedulerNodes.nodes.length,
          }
        : {}),
    }) as JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
  const validationBase = validateOrchestratorGraphDecision(decision, {
    executableExecutorKeys: options.executableExecutorKeys,
    requireNodeCommitmentContracts: options.requireNodeCommitmentContracts,
  });
  const blockingReasonCodes = blockingCompileReasonCodes(compileReasonCodes);
  const validation = {
    ...validationBase,
    valid: validationBase.valid && blockingReasonCodes.length === 0,
    reasonCodes: [...validationBase.reasonCodes, ...blockingReasonCodes],
  } satisfies OrchestratorGraphDecisionValidation;
  return {
    decision,
    validation,
    rejectedNodeDiagnostics,
    repairRequest: repairRequestForMissingFields({
      failedDecisionId: decision.decisionId || null,
      missingFields: [
        ...missingFieldsForDecision(decision),
        ...missingFieldsForRejectedDiagnostics(rejectedNodeDiagnostics),
      ],
      preserveFields: [
        ...(decision.decisionId ? ["decisionId"] : []),
        ...(decision.rationaleForDecision ? ["rationaleForDecision"] : []),
        ...(decision.requestContextIntent ? ["requestContextIntent"] : []),
        ...newNodes.flatMap((node, index) => {
          const prefix = `newNodes[${index}]`;
          return [
            ...(node.nodeId ? [`${prefix}.nodeId`] : []),
            ...(node.capabilityId ? [`${prefix}.capabilityId`] : []),
            ...(node.commitmentIdsAdvanced?.length ? [`${prefix}.commitmentIds`] : []),
            ...(node.whyThisRoleIsNeededNow ? [`${prefix}.roleRationale`] : []),
            ...(node.exactObjective ? [`${prefix}.objective`] : []),
            ...(node.expectedOutput ? [`${prefix}.expectedHumanReadableOutput`] : []),
            ...(node.acceptanceCriteria.length ? [`${prefix}.successCriteria`] : []),
            ...(node.downstreamConsumer ? [`${prefix}.downstreamConsumer`] : []),
          ];
        }),
      ],
      acceptedFields: acceptedAliasFields,
      rejectedReasonCodes: [...compileReasonCodes, ...validation.reasonCodes],
    }),
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
