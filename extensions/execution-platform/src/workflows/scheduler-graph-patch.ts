import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  OrchestratorGraphEdgeSpec,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import type { RequirementMap, RequirementRole } from "./requirement-map.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import { graphRef, type TeamGraphEdgeKind } from "./runtime-work-graph.ts";
import {
  validateSchedulerGraphAdmission,
  type SchedulerGraphAdmissionNode,
} from "./scheduler-graph-admission.ts";
import {
  schedulerClosurePolicyOrDefault,
  schedulerValidationPhaseForClosureRunMode,
  type SchedulerClosurePolicy,
  type SchedulerClosureRunMode,
  type SchedulerMissionTailKind,
} from "./scheduler-graph-closure-policy.ts";

export const SCHEDULER_GRAPH_PATCH_SCHEMA_VERSION = "execution-platform.scheduler-graph-patch.v1";
export const SCHEDULER_GRAPH_PATCH_ARTIFACT_TYPE = "execution_platform.scheduler_graph_patch";

export const SCHEDULER_WORK_KINDS = [
  "produce_artifact",
  "change_state",
  "validate",
  "review",
  "closeout",
  "human_decision",
] as const;

export type SchedulerWorkKind = (typeof SCHEDULER_WORK_KINDS)[number];

export const REQUIREMENT_COVERAGE_DISPOSITIONS = [
  "covered_by_node",
  "carried_as_constraint",
  "prompt_context",
  "deferred",
  "blocked",
] as const;

export type RequirementCoverageDispositionKind = (typeof REQUIREMENT_COVERAGE_DISPOSITIONS)[number];

export type SchedulerGraphPatchNodeSeed = {
  nodeSeedId: string;
  objective: string;
  coveredRequirementIds: string[];
  workKind: SchedulerWorkKind;
  executionIntent: string;
  capabilityId: string;
  promptSourceRefOverrides: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerGraphPatchEdgeSeed = {
  edgeSeedId: string;
  fromNodeSeedId: string | null;
  toNodeSeedId: string | null;
  edgeKind: TeamGraphEdgeKind;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerRequirementCoverageDisposition = {
  requirementId: string;
  disposition: RequirementCoverageDispositionKind;
  nodeSeedIds: string[];
  diagnosticRef: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerGraphPatch = {
  artifactKind: "scheduler_graph_patch";
  schemaVersion: typeof SCHEDULER_GRAPH_PATCH_SCHEMA_VERSION;
  patchId: string;
  patchRef: string;
  patchHash: string;
  graphId: string;
  sourceRequirementMapRef: string;
  sourceRequirementMapHash: string;
  patchMode: "initial_graph" | "graph_amendment";
  nodeSeeds: SchedulerGraphPatchNodeSeed[];
  edges: SchedulerGraphPatchEdgeSeed[];
  requirementCoverage: SchedulerRequirementCoverageDisposition[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type SchedulerGraphAmendmentRequest = {
  artifactKind: "scheduler_graph_amendment_request";
  schemaVersion: "execution-platform.scheduler-graph-amendment-request.v1";
  requestId: string;
  graphId: string;
  amendmentKind:
    | "add_requirements"
    | "repair_blocked_node"
    | "reschedule_after_evidence"
    | "replace_blocked_node";
  affectedRequirementIds: string[];
  affectedNodeIds: string[];
  rationale: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type SchedulerGraphPatchDiagnostic = {
  diagnosticKind:
    | "missing_node_seed_field"
    | "missing_requirement_coverage"
    | "unknown_capability"
    | "invalid_dependency"
    | "invalid_admission"
    | "empty_patch";
  reasonCode: string;
  affectedNodeSeedIds: string[];
  affectedRequirementIds: string[];
  missingFieldPaths: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type SchedulerGraphPatchCompileInput = {
  graphId: string;
  iteration: number;
  requirementMap: RequirementMap;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  patchMode?: "initial_graph" | "graph_amendment";
  schedulerClosurePolicy?: SchedulerClosurePolicy | null;
  closureRunMode?: SchedulerClosureRunMode;
  existingNodesById?: ReadonlyMap<string, SchedulerGraphAdmissionNode>;
  workUnits: Record<string, unknown>[];
  capabilitySelections: Record<string, unknown>[];
  nodeContracts: Record<string, unknown>[];
  dependencyEdges: Record<string, unknown>[];
};

export type SchedulerGraphPatchCompileResult = {
  patch: SchedulerGraphPatch | null;
  nodeSpecs: OrchestratorGraphNodeSpec[];
  edgeSpecs: OrchestratorGraphEdgeSpec[];
  diagnostics: SchedulerGraphPatchDiagnostic[];
  valid: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stringValue(value: unknown, max = 1_200): string {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/gu, " ").slice(0, max)
    : "";
}

function stringArray(value: unknown, maxItems = 40, maxChars = 360): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    const text = stringValue(item, maxChars);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output;
}

function uniqueStrings(values: Array<string | null | undefined>, maxItems = 80): string[] {
  return stringArray(values, maxItems);
}

function safeId(value: string, fallback: string): string {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 140);
  return safe || fallback;
}

function workKindForExecutionIntent(intent: string): SchedulerWorkKind {
  if (intent === "validation") {
    return "validate";
  }
  if (intent === "review" || intent === "readback") {
    return "review";
  }
  if (intent === "closeout") {
    return "closeout";
  }
  if (intent === "human_decision") {
    return "human_decision";
  }
  if (["source_edit", "implementation", "docs", "test_authoring"].includes(intent)) {
    return "change_state";
  }
  return "produce_artifact";
}

function edgeKindForTargetWorkKind(workKind: SchedulerWorkKind): TeamGraphEdgeKind {
  if (workKind === "validate") {
    return "validation_depends_on";
  }
  if (workKind === "review") {
    return "review_depends_on";
  }
  if (workKind === "closeout") {
    return "closeout_depends_on";
  }
  return "depends_on";
}

function requirementById(
  requirementMap: RequirementMap,
): Map<string, RequirementMap["requirements"][number]> {
  return new Map(
    requirementMap.requirements.map((requirement) => [requirement.requirementId, requirement]),
  );
}

function roleCoverageDisposition(role: RequirementRole): RequirementCoverageDispositionKind {
  if (role === "constraint" || role === "non_goal") {
    return "carried_as_constraint";
  }
  if (role === "context") {
    return "prompt_context";
  }
  return "covered_by_node";
}

function capabilityFromSelection(input: {
  workUnitId: string;
  selection: Record<string, unknown> | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): RuntimeNodeCapability | null {
  const capabilityId = stringValue(
    input.selection?.selectedCapabilityId ?? input.selection?.capabilityId,
    180,
  );
  return capabilityId ? findRuntimeNodeCapability(capabilityId, input.capabilityManifest) : null;
}

function nodeContractForWorkUnit(input: {
  workUnitId: string;
  workUnit: Record<string, unknown>;
  contract: Record<string, unknown> | null;
}): {
  objective: string;
  expectedOutput: string;
  acceptanceCriteria: string[];
  executionIntent: string;
  inputRefs: string[];
  targetSubjectRefs: string[];
  authorityScopeRefs: string[];
  evidenceExpectation: string;
  requirementIds: string[];
  commitmentIds: string[];
  sourceMaterialRequirementKinds: string[];
  validationCommandRefs: string[];
  validationDiscoveryPlan: string[];
} {
  const workUnit = input.workUnit;
  const contract = input.contract ?? {};
  const objective =
    stringValue(contract.objective) ||
    stringValue(workUnit.objective ?? workUnit.title) ||
    `Execute scheduler node ${input.workUnitId}.`;
  const expectedOutput =
    stringValue(contract.expectedOutput ?? contract.expectedOutcome) ||
    stringValue(workUnit.expectedOutput ?? workUnit.expectedOutcome) ||
    stringValue(workUnit.evidenceExpectation) ||
    "Produce evidence refs mapped to covered requirements.";
  const acceptanceCriteria = uniqueStrings(
    [
      ...stringArray(contract.successCriteria, 16, 700),
      ...stringArray(workUnit.successCriteria, 16, 700),
      expectedOutput,
    ],
    16,
  );
  const executionIntent =
    stringValue(contract.executionIntent, 120) ||
    stringValue(workUnit.executionIntent, 120) ||
    "source_edit";
  const requirementIds = uniqueStrings(
    [
      ...stringArray(workUnit.requirementIds, 40, 160),
      ...stringArray(workUnit.sourceRequirementIds, 40, 160),
      stringValue(workUnit.requirementId, 160),
      stringValue(workUnit.sourceRequirementId, 160),
    ],
    40,
  );
  const commitmentIds = uniqueStrings(
    [...stringArray(workUnit.commitmentIds, 40, 160), ...requirementIds],
    40,
  );
  const inputRefs = uniqueStrings(
    [
      ...stringArray(contract.inputRefs, 80, 360),
      ...stringArray(workUnit.inputRefs, 80, 360),
      ...stringArray(workUnit.sourceRefs, 80, 360),
    ],
    80,
  );
  const targetSubjectRefs = uniqueStrings(
    [
      ...stringArray(workUnit.targetSubjectRefs, 40, 320),
      ...stringArray(contract.targetSubjectRefs, 40, 320),
    ],
    40,
  );
  const authorityScopeRefs = uniqueStrings(
    [
      ...stringArray(workUnit.authorityScopeRefs, 120, 360),
      ...stringArray(contract.authorityScopeRefs, 120, 360),
      ...stringArray(workUnit.allowedFileRefs, 120, 360),
      ...stringArray(contract.allowedFileRefs, 120, 360),
    ],
    120,
  );
  return {
    objective,
    expectedOutput,
    acceptanceCriteria,
    executionIntent,
    inputRefs,
    targetSubjectRefs,
    authorityScopeRefs,
    evidenceExpectation: stringValue(workUnit.evidenceExpectation) || expectedOutput,
    requirementIds,
    commitmentIds,
    sourceMaterialRequirementKinds: uniqueStrings(
      [
        ...stringArray(workUnit.sourceMaterialRequirementKinds, 24, 180),
        ...stringArray(contract.sourceMaterialRequirementKinds, 24, 180),
      ],
      24,
    ),
    validationCommandRefs: uniqueStrings(
      [
        ...stringArray(workUnit.validationCommandRefs, 16, 260),
        ...stringArray(contract.validationCommandRefs, 16, 260),
      ],
      16,
    ),
    validationDiscoveryPlan: uniqueStrings(
      [
        ...stringArray(workUnit.validationDiscoveryPlan, 12, 700),
        ...stringArray(contract.validationDiscoveryPlan, 12, 700),
      ],
      12,
    ),
  };
}

export function buildSchedulerGraphNodeMetadata(input: {
  nodeSeedId: string;
  workUnitId: string;
  requirementMap: RequirementMap;
  contract: ReturnType<typeof nodeContractForWorkUnit>;
  capability: RuntimeNodeCapability;
  workKind: SchedulerWorkKind;
  broadAuthorityRefs: string[];
  sourceRefs: string[];
}): JsonValue {
  const evidenceMode =
    input.workKind === "change_state"
      ? ["changed_file_evidence", "validation_evidence"]
      : ["validation_evidence"];
  return {
    schedulerGraphPatchNodeSeedId: input.nodeSeedId,
    schedulerGraphPatchWorkUnitId: input.workUnitId,
    sourceRequirementMapRef: input.requirementMap.mapRef,
    sourceRequirementMapHash: input.requirementMap.mapHash,
    coveredRequirementIds: input.contract.requirementIds,
    sourceRequirementIds: input.contract.requirementIds,
    targetCommitmentIds: input.contract.commitmentIds,
    commitmentIdsAdvanced: input.contract.commitmentIds,
    capabilityId: input.capability.capabilityId,
    selectedCapabilityId: input.capability.capabilityId,
    executorKey: input.capability.executorKey,
    workerRef: input.capability.workerRef,
    executionIntent: input.contract.executionIntent,
    evidenceMode,
    authorityScopeRefs: input.broadAuthorityRefs,
    allowedFileRefs: input.broadAuthorityRefs,
    allowedEditScope: input.broadAuthorityRefs,
    sourceContextRefs: input.sourceRefs,
    sourcePromptExcerptRefs: input.sourceRefs,
    validationCommandRefs: input.contract.validationCommandRefs,
    validationDiscoveryPlan: input.contract.validationDiscoveryPlan,
    expectedEvidenceClaimKinds:
      input.workKind === "change_state" ? ["source_change", "test_validation"] : ["validation"],
    evidenceClaimExpectations: input.contract.acceptanceCriteria,
    stopIfMissingOrEscalate: [
      "Use runner-owned worker context search/open/refine/accept tools before editing when exact target windows are missing.",
      "Escalate with a typed blocker if bounded context search, patch, validation, or evidence closure cannot proceed.",
    ],
    schedulerGraphPatchCompiled: true,
    nodeLifecycleRunnerOwnsExecution: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}

export function buildMissionTailNodeMetadata(input: {
  tailKind: SchedulerMissionTailKind;
  requirementMap: RequirementMap;
  closureRunMode: SchedulerClosureRunMode;
  validationPhase?: string | null;
}): JsonValue {
  return {
    missionTailKind: input.tailKind,
    sourceRequirementMapRef: input.requirementMap.mapRef,
    sourceRequirementMapHash: input.requirementMap.mapHash,
    closureRunMode: input.closureRunMode,
    ...(input.tailKind === "validation" && input.validationPhase
      ? { validationPhase: input.validationPhase }
      : {}),
    schedulerGraphPatchCompiled: true,
    nodeLifecycleRunnerOwnsExecution: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}

const MISSION_TAIL_OBJECTIVE_BY_KIND: Record<SchedulerMissionTailKind, string> = {
  validation:
    "Run mission-level validation after all implementation and test-authoring work has produced worker-local evidence.",
  review:
    "Review completed implementation, test-authoring, and validation evidence against the accepted requirements.",
  closeout:
    "Close out the mission after implementation, validation, and review evidence are accepted.",
};

const MISSION_TAIL_EXPECTED_OUTPUT_BY_KIND: Record<SchedulerMissionTailKind, string> = {
  validation:
    "Accepted validation evidence covering all implementation work and validation requirements.",
  review:
    "Accepted review evidence verifying requirement coverage, implementation quality, and validation evidence.",
  closeout:
    "Owner-facing closeout evidence with accepted requirement coverage, validation, review, and remaining blockers.",
};

function requirementsForTailKind(input: {
  requirementMap: RequirementMap;
  tailKind: SchedulerMissionTailKind;
}): RequirementMap["requirements"] {
  return input.requirementMap.requirements.filter((requirement) => {
    if (input.tailKind === "validation") {
      return requirement.role === "validation";
    }
    if (input.tailKind === "review") {
      return requirement.role === "review";
    }
    return requirement.role === "closeout";
  });
}

function tailNodeKindForCapability(
  capability: RuntimeNodeCapability,
  tailKind: SchedulerMissionTailKind,
) {
  if (tailKind === "validation" && capability.graphNodeKind !== "validation") {
    return capability.graphNodeKind;
  }
  return capability.graphNodeKind;
}

function downstreamConsumerForTailKind(tailKind: SchedulerMissionTailKind): string {
  if (tailKind === "validation") {
    return "mission_review";
  }
  if (tailKind === "review") {
    return "mission_closeout";
  }
  return "mission_completion";
}

function workKindForTailKind(tailKind: SchedulerMissionTailKind): SchedulerWorkKind {
  if (tailKind === "validation") {
    return "validate";
  }
  if (tailKind === "review") {
    return "review";
  }
  return "closeout";
}

function tailExecutionIntent(tailKind: SchedulerMissionTailKind): string {
  return tailKind === "closeout" ? "closeout" : tailKind;
}

function tailNodeSeedId(tailKind: SchedulerMissionTailKind): string {
  return `seed-mission-${tailKind}`;
}

export function compileSchedulerGraphPatch(
  input: SchedulerGraphPatchCompileInput,
): SchedulerGraphPatchCompileResult {
  const diagnostics: SchedulerGraphPatchDiagnostic[] = [];
  const requirementsById = requirementById(input.requirementMap);
  const workUnitsById = new Map(
    input.workUnits
      .map((workUnit) => [stringValue(workUnit.workUnitId, 180), workUnit] as const)
      .filter(([workUnitId]) => Boolean(workUnitId)),
  );
  const capabilitySelectionsByWorkUnitId = new Map(
    input.capabilitySelections
      .map((selection) => [stringValue(selection.workUnitId, 180), selection] as const)
      .filter(([workUnitId]) => Boolean(workUnitId)),
  );
  const contractsByWorkUnitId = new Map(
    input.nodeContracts
      .map((contract) => [stringValue(contract.workUnitId, 180), contract] as const)
      .filter(([workUnitId]) => Boolean(workUnitId)),
  );
  const nodeSeeds: SchedulerGraphPatchNodeSeed[] = [];
  const nodeSpecs: OrchestratorGraphNodeSpec[] = [];
  const seedIdByWorkUnitId = new Map<string, string>();
  const nodeWorkKindBySeedId = new Map<string, SchedulerWorkKind>();
  const closurePolicy = schedulerClosurePolicyOrDefault(input.schedulerClosurePolicy);
  const closureRunMode = input.closureRunMode ?? "standard";
  const tailValidationPhase = schedulerValidationPhaseForClosureRunMode({
    policy: closurePolicy,
    closureRunMode,
  });
  for (const [workUnitId, workUnit] of workUnitsById) {
    const selection = capabilitySelectionsByWorkUnitId.get(workUnitId) ?? null;
    const capability = capabilityFromSelection({
      workUnitId,
      selection,
      capabilityManifest: input.capabilityManifest,
    });
    if (!capability) {
      diagnostics.push({
        diagnosticKind: "unknown_capability",
        reasonCode: `scheduler_graph_patch_capability_missing_or_unknown:${workUnitId}`,
        affectedNodeSeedIds: [],
        affectedRequirementIds: stringArray(workUnit.requirementIds, 40, 160),
        missingFieldPaths: [`capabilitySelectionsByWorkUnitId.${workUnitId}.selectedCapabilityId`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      continue;
    }
    const contract = nodeContractForWorkUnit({
      workUnitId,
      workUnit,
      contract: contractsByWorkUnitId.get(workUnitId) ?? null,
    });
    const missingFields = [
      contract.objective ? null : "objective",
      contract.expectedOutput ? null : "expectedOutput",
      contract.acceptanceCriteria.length > 0 ? null : "acceptanceCriteria",
      contract.requirementIds.length > 0 ? null : "coveredRequirementIds",
      contract.commitmentIds.length > 0 ? null : "targetCommitmentIds",
    ].filter((field): field is string => Boolean(field));
    if (missingFields.length > 0) {
      diagnostics.push({
        diagnosticKind: "missing_node_seed_field",
        reasonCode: `scheduler_graph_patch_node_seed_fields_missing:${workUnitId}`,
        affectedNodeSeedIds: [`seed-${safeId(workUnitId, "node")}`],
        affectedRequirementIds: contract.requirementIds,
        missingFieldPaths: missingFields,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      continue;
    }
    const nodeSeedId = `seed-${safeId(workUnitId, `node-${nodeSeeds.length + 1}`)}`;
    const workKind = workKindForExecutionIntent(contract.executionIntent);
    const requirements = contract.requirementIds
      .map((requirementId) => requirementsById.get(requirementId))
      .filter((requirement): requirement is RequirementMap["requirements"][number] =>
        Boolean(requirement),
      );
    const sourceRefs = uniqueStrings(
      [
        input.requirementMap.sourcePromptBodyRef,
        ...requirements.flatMap((requirement) => requirement.sourceRefs),
        ...contract.inputRefs,
      ],
      80,
    );
    const broadAuthorityRefs =
      contract.authorityScopeRefs.length > 0
        ? contract.authorityScopeRefs
        : workKind === "change_state"
          ? ["repo-scope://workspace"]
          : [input.requirementMap.sourcePromptBodyRef];
    nodeSeeds.push({
      nodeSeedId,
      objective: contract.objective,
      coveredRequirementIds: contract.requirementIds,
      workKind,
      executionIntent: contract.executionIntent,
      capabilityId: capability.capabilityId,
      promptSourceRefOverrides: sourceRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    seedIdByWorkUnitId.set(workUnitId, nodeSeedId);
    nodeWorkKindBySeedId.set(nodeSeedId, workKind);
    nodeSpecs.push({
      nodeId: nodeSeedId,
      nodeKind: capability.graphNodeKind,
      capabilityId: capability.capabilityId,
      executorKey: capability.executorKey,
      workerRef: capability.workerRef,
      requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      assignedRole: capability.roleId,
      modelOrWorkerRef: capability.workerRef,
      inputHandoffRefs: sourceRefs,
      expectedOutput: contract.expectedOutput,
      acceptanceCriteria: contract.acceptanceCriteria,
      downstreamConsumer:
        workKind === "change_state"
          ? "validation_and_review"
          : workKind === "validate"
            ? "review_and_closeout"
            : "closeout",
      commitmentIdsAdvanced: contract.commitmentIds,
      whyThisRoleIsNeededNow:
        stringValue(selection?.utilityRationale ?? selection?.roleRationale, 900) ||
        `SchedulerGraphPatch selected ${capability.capabilityId} for ${workUnitId}.`,
      exactObjective: contract.objective,
      evidenceExpectation: contract.evidenceExpectation,
      targetRefs: contract.targetSubjectRefs,
      metadata: buildSchedulerGraphNodeMetadata({
        nodeSeedId,
        workUnitId,
        requirementMap: input.requirementMap,
        contract,
        capability,
        workKind,
        broadAuthorityRefs,
        sourceRefs,
      }),
    });
  }
  const coreNodeSeedIds = nodeSeeds
    .filter((seed) => seed.workKind === "change_state" || seed.executionIntent === "test_authoring")
    .map((seed) => seed.nodeSeedId);
  const tailSeedIdByKind = new Map<SchedulerMissionTailKind, string>();
  if (coreNodeSeedIds.length > 0 && (input.patchMode ?? "initial_graph") === "initial_graph") {
    for (const tailKind of closurePolicy.tailKinds) {
      const capabilityId = closurePolicy.tailCapabilityIds[tailKind];
      const capability = findRuntimeNodeCapability(capabilityId, input.capabilityManifest);
      if (!capability) {
        diagnostics.push({
          diagnosticKind: "unknown_capability",
          reasonCode: `scheduler_graph_patch_tail_capability_missing_or_unknown:${tailKind}:${capabilityId}`,
          affectedNodeSeedIds: [],
          affectedRequirementIds: [],
          missingFieldPaths: [`schedulerClosurePolicy.tailCapabilityIds.${tailKind}`],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        continue;
      }
      const nodeSeedId = tailNodeSeedId(tailKind);
      const requirements = requirementsForTailKind({
        requirementMap: input.requirementMap,
        tailKind,
      });
      const requirementIds = requirements.map((requirement) => requirement.requirementId);
      const sourceRefs = uniqueStrings(
        [
          input.requirementMap.sourcePromptBodyRef,
          ...requirements.flatMap((requirement) => requirement.sourceRefs),
        ],
        80,
      );
      const workKind = workKindForTailKind(tailKind);
      const executionIntent = tailExecutionIntent(tailKind);
      nodeSeeds.push({
        nodeSeedId,
        objective: MISSION_TAIL_OBJECTIVE_BY_KIND[tailKind],
        coveredRequirementIds: requirementIds,
        workKind,
        executionIntent,
        capabilityId: capability.capabilityId,
        promptSourceRefOverrides: sourceRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      tailSeedIdByKind.set(tailKind, nodeSeedId);
      nodeWorkKindBySeedId.set(nodeSeedId, workKind);
      nodeSpecs.push({
        nodeId: nodeSeedId,
        nodeKind: tailNodeKindForCapability(capability, tailKind),
        capabilityId: capability.capabilityId,
        executorKey: capability.executorKey,
        workerRef: capability.workerRef,
        requiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
        assignedRole: capability.roleId,
        modelOrWorkerRef: capability.workerRef,
        inputHandoffRefs: sourceRefs,
        expectedOutput: MISSION_TAIL_EXPECTED_OUTPUT_BY_KIND[tailKind],
        acceptanceCriteria: [MISSION_TAIL_EXPECTED_OUTPUT_BY_KIND[tailKind]],
        downstreamConsumer: downstreamConsumerForTailKind(tailKind),
        commitmentIdsAdvanced: requirementIds,
        whyThisRoleIsNeededNow: `SchedulerGraphPatch compiler derived the mission ${tailKind} tail from closure policy.`,
        exactObjective: MISSION_TAIL_OBJECTIVE_BY_KIND[tailKind],
        evidenceExpectation: MISSION_TAIL_EXPECTED_OUTPUT_BY_KIND[tailKind],
        targetRefs: [],
        metadata: buildMissionTailNodeMetadata({
          tailKind,
          requirementMap: input.requirementMap,
          closureRunMode,
          validationPhase: tailKind === "validation" ? tailValidationPhase : null,
        }),
      });
    }
  }
  if (nodeSeeds.length === 0) {
    diagnostics.push({
      diagnosticKind: "empty_patch",
      reasonCode: "scheduler_graph_patch_node_seeds_missing",
      affectedNodeSeedIds: [],
      affectedRequirementIds: input.requirementMap.requirements.map(
        (requirement) => requirement.requirementId,
      ),
      missingFieldPaths: ["nodeSeeds"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }

  const coverageByRequirementId = new Map<string, SchedulerRequirementCoverageDisposition>();
  for (const requirement of input.requirementMap.requirements) {
    coverageByRequirementId.set(requirement.requirementId, {
      requirementId: requirement.requirementId,
      disposition: roleCoverageDisposition(requirement.role),
      nodeSeedIds: [],
      diagnosticRef: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }
  for (const nodeSeed of nodeSeeds) {
    for (const requirementId of nodeSeed.coveredRequirementIds) {
      const current = coverageByRequirementId.get(requirementId);
      if (!current) {
        continue;
      }
      coverageByRequirementId.set(requirementId, {
        ...current,
        disposition: "covered_by_node",
        nodeSeedIds: uniqueStrings([...current.nodeSeedIds, nodeSeed.nodeSeedId], 12),
      });
    }
  }
  const requirementCoverage = [...coverageByRequirementId.values()];
  const missingCoveredRequirements = requirementCoverage.filter(
    (coverage) =>
      coverage.nodeSeedIds.length === 0 &&
      !["carried_as_constraint", "prompt_context", "deferred", "blocked"].includes(
        coverage.disposition,
      ),
  );
  if (missingCoveredRequirements.length > 0) {
    diagnostics.push({
      diagnosticKind: "missing_requirement_coverage",
      reasonCode: "scheduler_graph_patch_requirement_coverage_missing",
      affectedNodeSeedIds: [],
      affectedRequirementIds: missingCoveredRequirements.map((coverage) => coverage.requirementId),
      missingFieldPaths: ["requirementCoverage[].nodeSeedIds"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }

  const edges: SchedulerGraphPatchEdgeSeed[] = [];
  const edgeSpecs: OrchestratorGraphEdgeSpec[] = [];
  const edgeSeedKeySet = new Set<string>();
  const edgeRecords = input.dependencyEdges.length > 0 ? input.dependencyEdges : [];
  for (const [index, edge] of edgeRecords.entries()) {
    const fromWorkUnitId = stringValue(edge.fromWorkUnitId ?? edge.fromNodeId, 180);
    const toWorkUnitId = stringValue(edge.toWorkUnitId ?? edge.toNodeId, 180);
    const fromNodeSeedId = seedIdByWorkUnitId.get(fromWorkUnitId) ?? null;
    const toNodeSeedId = seedIdByWorkUnitId.get(toWorkUnitId) ?? null;
    if (!fromNodeSeedId || !toNodeSeedId) {
      diagnostics.push({
        diagnosticKind: "invalid_dependency",
        reasonCode: `scheduler_graph_patch_dependency_endpoint_unknown:${fromWorkUnitId}->${toWorkUnitId}`,
        affectedNodeSeedIds: [fromNodeSeedId, toNodeSeedId].filter((id): id is string =>
          Boolean(id),
        ),
        affectedRequirementIds: [],
        missingFieldPaths: ["edges[].fromNodeSeedId", "edges[].toNodeSeedId"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      continue;
    }
    const targetWorkKind = nodeWorkKindBySeedId.get(toNodeSeedId) ?? "produce_artifact";
    const edgeKind = edgeKindForTargetWorkKind(targetWorkKind);
    const edgeSeedId = `edge-${safeId(fromNodeSeedId, "from")}-to-${safeId(toNodeSeedId, "to")}`;
    const normalizedEdgeKey = `${fromNodeSeedId}->${toNodeSeedId}`;
    if (edgeSeedKeySet.has(normalizedEdgeKey)) {
      continue;
    }
    edgeSeedKeySet.add(normalizedEdgeKey);
    edges.push({
      edgeSeedId,
      fromNodeSeedId,
      toNodeSeedId,
      edgeKind,
      reasonCodes: uniqueStrings(
        ["scheduler_graph_patch_dependency_edge", ...stringArray(edge.reasonCodes, 12, 180)],
        16,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    edgeSpecs.push({
      edgeId: edgeSeedId || `edge-${index + 1}`,
      fromNodeId: fromNodeSeedId,
      toNodeId: toNodeSeedId,
      edgeKind,
      reasonCodes: ["scheduler_graph_patch_dependency_edge"],
      artifactRefs: [],
      metadata: {
        schedulerGraphPatchEdgeSeedId: edgeSeedId,
        fromNodeSeedId,
        toNodeSeedId,
        fromWorkUnitId,
        toWorkUnitId,
        runtimeOwnedGraphPatchEdge: true,
        rawPromptStored: false,
        rawResponseStored: false,
      } satisfies JsonValue,
    });
  }
  const appendTailEdge = (inputEdge: {
    fromNodeSeedId: string;
    toNodeSeedId: string;
    edgeKind: TeamGraphEdgeKind;
    reasonCode: string;
  }) => {
    const normalizedEdgeKey = `${inputEdge.fromNodeSeedId}->${inputEdge.toNodeSeedId}`;
    if (edgeSeedKeySet.has(normalizedEdgeKey)) {
      return;
    }
    edgeSeedKeySet.add(normalizedEdgeKey);
    const edgeSeedId = `edge-${safeId(inputEdge.fromNodeSeedId, "from")}-to-${safeId(
      inputEdge.toNodeSeedId,
      "to",
    )}`;
    edges.push({
      edgeSeedId,
      fromNodeSeedId: inputEdge.fromNodeSeedId,
      toNodeSeedId: inputEdge.toNodeSeedId,
      edgeKind: inputEdge.edgeKind,
      reasonCodes: [inputEdge.reasonCode],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    edgeSpecs.push({
      edgeId: edgeSeedId,
      fromNodeId: inputEdge.fromNodeSeedId,
      toNodeId: inputEdge.toNodeSeedId,
      edgeKind: inputEdge.edgeKind,
      reasonCodes: [inputEdge.reasonCode],
      artifactRefs: [],
      metadata: {
        schedulerGraphPatchEdgeSeedId: edgeSeedId,
        fromNodeSeedId: inputEdge.fromNodeSeedId,
        toNodeSeedId: inputEdge.toNodeSeedId,
        runtimeOwnedMissionTailEdge: true,
        rawPromptStored: false,
        rawResponseStored: false,
      } satisfies JsonValue,
    });
  };
  const validationTailSeedId = tailSeedIdByKind.get("validation") ?? null;
  const reviewTailSeedId = tailSeedIdByKind.get("review") ?? null;
  const closeoutTailSeedId = tailSeedIdByKind.get("closeout") ?? null;
  if (validationTailSeedId) {
    for (const coreSeedId of coreNodeSeedIds) {
      appendTailEdge({
        fromNodeSeedId: coreSeedId,
        toNodeSeedId: validationTailSeedId,
        edgeKind: "validation_depends_on",
        reasonCode: "scheduler_graph_patch_mission_validation_depends_on_core",
      });
    }
  }
  if (reviewTailSeedId) {
    for (const dependencySeedId of validationTailSeedId
      ? [validationTailSeedId]
      : coreNodeSeedIds) {
      appendTailEdge({
        fromNodeSeedId: dependencySeedId,
        toNodeSeedId: reviewTailSeedId,
        edgeKind: "review_depends_on",
        reasonCode: "scheduler_graph_patch_mission_review_depends_on_validation",
      });
    }
  }
  if (closeoutTailSeedId) {
    const closeoutDependencySeedIds = reviewTailSeedId
      ? [reviewTailSeedId]
      : validationTailSeedId
        ? [validationTailSeedId]
        : coreNodeSeedIds;
    for (const dependencySeedId of closeoutDependencySeedIds) {
      appendTailEdge({
        fromNodeSeedId: dependencySeedId,
        toNodeSeedId: closeoutTailSeedId,
        edgeKind: "closeout_depends_on",
        reasonCode: "scheduler_graph_patch_mission_closeout_depends_on_review",
      });
    }
  }
  const admission = validateSchedulerGraphAdmission({
    nodes: nodeSpecs,
    edges: edgeSpecs,
    existingNodesById: input.existingNodesById,
    schedulerClosurePolicy: closurePolicy,
    closureRunMode,
  });
  if (!admission.valid) {
    for (const admissionDiagnostic of admission.diagnostics) {
      diagnostics.push({
        diagnosticKind: "invalid_admission",
        reasonCode: admissionDiagnostic.reasonCode,
        affectedNodeSeedIds: admissionDiagnostic.affectedNodeIds,
        affectedRequirementIds: [],
        missingFieldPaths: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
    }
  }

  const patchId = `scheduler-graph-patch-${input.iteration}-${hashValue({
    graphId: input.graphId,
    requirementMapHash: input.requirementMap.mapHash,
    nodeSeeds,
    edges,
  }).slice(0, 16)}`;
  const patchRef = graphRef("scheduler-graph-patch", patchId);
  const bodyWithoutHash = {
    artifactKind: "scheduler_graph_patch" as const,
    schemaVersion:
      SCHEDULER_GRAPH_PATCH_SCHEMA_VERSION as typeof SCHEDULER_GRAPH_PATCH_SCHEMA_VERSION,
    patchId,
    patchRef,
    patchHash: "pending",
    graphId: input.graphId,
    sourceRequirementMapRef: input.requirementMap.mapRef,
    sourceRequirementMapHash: input.requirementMap.mapHash,
    patchMode: input.patchMode ?? "initial_graph",
    nodeSeeds,
    edges,
    requirementCoverage,
    reasonCodes: uniqueStrings([
      "scheduler_graph_patch_compiled",
      "scheduler_graph_patch_semantic_seed_identity",
      "scheduler_graph_patch_requirement_map_source",
      "scheduler_graph_patch_mission_tail_policy_applied",
      `scheduler_graph_patch_closure_run_mode:${closureRunMode}`,
      `scheduler_graph_patch_node_seed_count:${nodeSeeds.length}`,
      `scheduler_graph_patch_edge_count:${edges.length}`,
    ]),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  const patch: SchedulerGraphPatch = {
    ...bodyWithoutHash,
    patchHash: hashValue({ ...bodyWithoutHash, patchHash: null }),
  };
  const reasonCodes = uniqueStrings([
    ...patch.reasonCodes,
    ...diagnostics.map((diagnostic) => diagnostic.reasonCode),
  ]);
  return {
    patch: diagnostics.length === 0 ? patch : null,
    nodeSpecs: diagnostics.length === 0 ? nodeSpecs : [],
    edgeSpecs: diagnostics.length === 0 ? edgeSpecs : [],
    diagnostics,
    valid: diagnostics.length === 0,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
