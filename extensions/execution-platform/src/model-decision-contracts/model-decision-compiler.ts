import type { JsonValue } from "../runtime-job-repository.ts";

export type ModelDecisionMissingField = {
  path: string;
  expectedType: string;
  whyRequired: string;
  repairExample?: JsonValue;
  validAlternatives?: JsonValue;
};

export type ModelDecisionRepairRequest = {
  artifactKind: "model_decision_repair_request";
  failedDecisionId: string | null;
  missingFields: ModelDecisionMissingField[];
  preserveFields: string[];
  acceptedFields: string[];
  rejectedReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelDecisionCompileDiagnostic = {
  path: string;
  code: string;
  message: string;
  expectedType?: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelDecisionCompileResult<T> = {
  canonical: T | null;
  acceptedAliasFields: string[];
  diagnostics: ModelDecisionCompileDiagnostic[];
  repairRequest: ModelDecisionRepairRequest;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type StructuralAliasGroup = {
  canonicalField: string;
  aliases: string[];
};

export const MODEL_CONTRACT_COMPILER_VERSION = "execution-platform.model-contract-compiler.v1";

export type ModelContractBoundaryKind =
  | "router_front_door"
  | "mission_ledger"
  | "commitment_work_packet"
  | "context_scout"
  | "context_repair"
  | "scheduler_staged_protocol"
  | "capability_selection"
  | "resource_materialization"
  | "worker_file_edit_loop"
  | "validation_qa"
  | "review_readback"
  | "closeout_finalization";

export const MODEL_CONTRACT_RUNTIME_OWNED_FIELDS = [
  "nodeId",
  "nodeKind",
  "graphNodeKind",
  "executorKey",
  "workerRef",
  "requiredMetadataSchemaRef",
  "canonicalNodeId",
  "runtimeNodeId",
  "runtimeJobId",
  "workItemId",
  "artifactRef",
  "artifactRefs",
  "payloadRef",
  "payloadRefs",
  "storageRef",
  "storageRefs",
  "evidenceKind",
  "evidenceKinds",
  "expectedEvidence",
  "expectedEvidenceKinds",
  "evidenceMode",
  "evidenceModes",
  "selectedNodeKind",
  "selectedExecutorKey",
  "workQueueLifecycleState",
  "queueStatus",
  "lifecycleState",
  "authorityGranted",
  "controlsApplied",
  "runtimeLifecycleMutated",
  "modelPromotionPerformed",
] as const;

export type ModelContractRuntimeOwnedField = (typeof MODEL_CONTRACT_RUNTIME_OWNED_FIELDS)[number];

export const MODEL_CONTRACT_RAW_STORAGE_FLAG_FIELDS = [
  "rawPromptStored",
  "rawResponseStored",
  "rawProviderLogStored",
  "rawToolLogStored",
  "rawCommandLogsStored",
  "rawDbRowsStored",
  "rawTranscriptStored",
  "rawLogsStored",
  "secretsStored",
] as const;

export type ModelContractRawStorageFlagField =
  (typeof MODEL_CONTRACT_RAW_STORAGE_FLAG_FIELDS)[number];

export type ModelContractRequiredSemanticField = {
  path: string;
  aliases: string[];
  expectedType: "string" | "string[]" | "object" | "array";
  whyRequired: string;
  repairExample?: JsonValue;
  validAlternatives?: JsonValue;
};

export type ModelContractBoundaryDefinition = {
  artifactKind: "model_contract_boundary_definition";
  compilerVersion: typeof MODEL_CONTRACT_COMPILER_VERSION;
  boundaryKind: ModelContractBoundaryKind;
  title: string;
  modelAuthoredSemanticFields: string[];
  runtimeOwnedFields: ModelContractRuntimeOwnedField[];
  acceptedStructuralAliases: StructuralAliasGroup[];
  requiredSemanticFields: ModelContractRequiredSemanticField[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelContractBoundaryCompileResult = {
  artifactKind: "model_contract_boundary_compile_result";
  compilerVersion: typeof MODEL_CONTRACT_COMPILER_VERSION;
  boundaryKind: ModelContractBoundaryKind;
  accepted: boolean;
  diagnostics: ModelDecisionCompileDiagnostic[];
  repairRequest: ModelDecisionRepairRequest;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const RAW_STORAGE_FLAG_FIELD_SET = new Set<string>(MODEL_CONTRACT_RAW_STORAGE_FLAG_FIELDS);

const COMMON_RUNTIME_OWNED_ALLOWED_ALTERNATIVES = [
  "objective",
  "rationale",
  "roleRationale",
  "commitmentIds",
  "targetCommitmentIds",
  "selectedCapabilityId",
  "inputRefs",
  "targetRefs",
  "expectedOutput",
  "successCriteria",
  "downstreamConsumer",
] as const;

function boundary(
  input: Omit<
    ModelContractBoundaryDefinition,
    | "artifactKind"
    | "compilerVersion"
    | "runtimeOwnedFields"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
  > & { runtimeOwnedFields?: ModelContractRuntimeOwnedField[] },
): ModelContractBoundaryDefinition {
  return {
    artifactKind: "model_contract_boundary_definition",
    compilerVersion: MODEL_CONTRACT_COMPILER_VERSION,
    runtimeOwnedFields: input.runtimeOwnedFields ?? [...MODEL_CONTRACT_RUNTIME_OWNED_FIELDS],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    ...input,
  };
}

export function buildModelContractBoundaryRegistry(): ModelContractBoundaryDefinition[] {
  return [
    boundary({
      boundaryKind: "router_front_door",
      title: "Router And Front Door",
      modelAuthoredSemanticFields: [
        "intent",
        "requestedActions",
        "constraints",
        "confidence",
        "routeRationale",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "intent", aliases: ["intent", "objective", "ownerIntent"] },
        { canonicalField: "requestedActions", aliases: ["requestedActions", "actions"] },
        { canonicalField: "constraints", aliases: ["constraints", "boundaries"] },
      ],
      requiredSemanticFields: [
        {
          path: "intent",
          aliases: ["intent", "objective", "ownerIntent"],
          expectedType: "string",
          whyRequired:
            "The router needs the model-authored owner intent before runtime compiles an execution request.",
          repairExample: "Implement the Product/Spec Planning workflow plugin.",
        },
      ],
    }),
    boundary({
      boundaryKind: "mission_ledger",
      title: "Mission Ledger",
      modelAuthoredSemanticFields: [
        "ownerObjective",
        "constraints",
        "commitments",
        "evidenceExpectations",
        "risks",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "ownerObjective", aliases: ["ownerObjective", "objective"] },
        { canonicalField: "commitments", aliases: ["commitments", "obligations"] },
      ],
      requiredSemanticFields: [
        {
          path: "ownerObjective",
          aliases: ["ownerObjective", "objective"],
          expectedType: "string",
          whyRequired:
            "Mission Ledger creation needs the owner objective; runtime owns ids and persistence.",
        },
      ],
    }),
    boundary({
      boundaryKind: "commitment_work_packet",
      title: "Commitment Work Packet",
      modelAuthoredSemanticFields: [
        "commitmentSummary",
        "workerHandoff",
        "contextQuestions",
        "implementationExpectations",
        "validationNeeds",
        "stopIfMissing",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "workerHandoff", aliases: ["workerHandoff", "handoff", "packetBrief"] },
        { canonicalField: "contextQuestions", aliases: ["contextQuestions", "questions"] },
      ],
      requiredSemanticFields: [
        {
          path: "workerHandoff",
          aliases: ["workerHandoff", "handoff", "packetBrief"],
          expectedType: "string",
          whyRequired:
            "A worker packet needs substantive model-authored handoff content; runtime compiles packet shape.",
        },
      ],
    }),
    boundary({
      boundaryKind: "context_scout",
      title: "Context Scout",
      modelAuthoredSemanticFields: [
        "contextObjective",
        "findings",
        "verifiedRefs",
        "limitations",
        "nextQuestions",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "findings", aliases: ["findings", "contextFindings", "summary"] },
        { canonicalField: "verifiedRefs", aliases: ["verifiedRefs", "targetRefs", "fileRefs"] },
      ],
      requiredSemanticFields: [
        {
          path: "findings",
          aliases: ["findings", "contextFindings", "summary"],
          expectedType: "string",
          whyRequired:
            "Context scout output must contain model-authored findings; runtime verifies refs structurally.",
        },
      ],
    }),
    boundary({
      boundaryKind: "context_repair",
      title: "Context Repair Intent",
      modelAuthoredSemanticFields: [
        "failedNodeIds",
        "targetCommitmentIds",
        "missingContextQuestions",
        "contextObjective",
        "rationale",
      ],
      acceptedStructuralAliases: [
        {
          canonicalField: "missingContextQuestions",
          aliases: ["missingContextQuestions", "questions", "missingFacts"],
        },
      ],
      requiredSemanticFields: [
        {
          path: "missingContextQuestions",
          aliases: ["missingContextQuestions", "questions", "missingFacts"],
          expectedType: "string[]",
          whyRequired:
            "Context repair must say which missing facts to resolve; runtime compiles repair nodes and edges.",
        },
      ],
    }),
    boundary({
      boundaryKind: "scheduler_staged_protocol",
      title: "Staged Scheduler Protocol",
      modelAuthoredSemanticFields: [
        "workUnitId",
        "objective",
        "rationale",
        "commitmentIds",
        "selectedCapabilityId",
        "utilityRationale",
        "costRationale",
        "expectedOutput",
        "successCriteria",
        "downstreamConsumer",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "workUnitId", aliases: ["workUnitId", "unitId", "id"] },
        {
          canonicalField: "selectedCapabilityId",
          aliases: ["selectedCapabilityId", "capabilityId", "capabilityRef"],
        },
        { canonicalField: "objective", aliases: ["objective", "exactObjective", "taskObjective"] },
      ],
      requiredSemanticFields: [
        {
          path: "objective",
          aliases: ["objective", "exactObjective", "taskObjective"],
          expectedType: "string",
          whyRequired:
            "The scheduler needs a semantic work objective; runtime compiles executable graph schema.",
        },
      ],
    }),
    boundary({
      boundaryKind: "capability_selection",
      title: "Capability Selection",
      modelAuthoredSemanticFields: [
        "selectedCapabilityId",
        "targetCommitmentIds",
        "utilityRationale",
        "costRationale",
        "stopOrEscalationCondition",
      ],
      acceptedStructuralAliases: [
        {
          canonicalField: "selectedCapabilityId",
          aliases: ["selectedCapabilityId", "capabilityId", "capabilityRef"],
        },
      ],
      requiredSemanticFields: [
        {
          path: "selectedCapabilityId",
          aliases: ["selectedCapabilityId", "capabilityId", "capabilityRef"],
          expectedType: "string",
          whyRequired:
            "The model selects a capability id; runtime derives node kind, executor, worker, and evidence fields.",
        },
      ],
    }),
    boundary({
      boundaryKind: "resource_materialization",
      title: "Resource Materialization",
      modelAuthoredSemanticFields: [
        "targetRefs",
        "resourceNeeds",
        "missingResources",
        "readinessLimitations",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "targetRefs", aliases: ["targetRefs", "fileRefs", "sourceRefs"] },
      ],
      requiredSemanticFields: [],
    }),
    boundary({
      boundaryKind: "worker_file_edit_loop",
      title: "Worker File Edit Loop",
      modelAuthoredSemanticFields: [
        "inspectRequest",
        "editPlan",
        "patchIntent",
        "validationRepairIntent",
        "evidenceClaimSummary",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "editPlan", aliases: ["editPlan", "plan"] },
        { canonicalField: "patchIntent", aliases: ["patchIntent", "changes"] },
      ],
      requiredSemanticFields: [],
    }),
    boundary({
      boundaryKind: "validation_qa",
      title: "Validation And QA",
      modelAuthoredSemanticFields: [
        "validationPlan",
        "failureClassification",
        "commitmentMapping",
        "repairPlan",
        "acceptanceJudgment",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "validationPlan", aliases: ["validationPlan", "plan"] },
        {
          canonicalField: "failureClassification",
          aliases: ["failureClassification", "classification"],
        },
      ],
      requiredSemanticFields: [],
    }),
    boundary({
      boundaryKind: "review_readback",
      title: "Review And Readback",
      modelAuthoredSemanticFields: [
        "reviewFindings",
        "riskAssessment",
        "operatorSummary",
        "limitations",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "reviewFindings", aliases: ["reviewFindings", "findings"] },
      ],
      requiredSemanticFields: [],
    }),
    boundary({
      boundaryKind: "closeout_finalization",
      title: "Closeout Finalization",
      modelAuthoredSemanticFields: [
        "closeoutSummary",
        "evidenceAssessment",
        "residualRisk",
        "maximalityReview",
      ],
      acceptedStructuralAliases: [
        { canonicalField: "closeoutSummary", aliases: ["closeoutSummary", "summary"] },
        { canonicalField: "evidenceAssessment", aliases: ["evidenceAssessment", "assessment"] },
      ],
      requiredSemanticFields: [
        {
          path: "closeoutSummary",
          aliases: ["closeoutSummary", "summary"],
          expectedType: "string",
          whyRequired:
            "Production closeout requires a model-authored closeout summary; runtime verifies evidence refs and lifecycle state.",
        },
      ],
    }),
  ];
}

export function getModelContractBoundaryDefinition(
  boundaryKind: ModelContractBoundaryKind,
): ModelContractBoundaryDefinition {
  const definition = buildModelContractBoundaryRegistry().find(
    (entry) => entry.boundaryKind === boundaryKind,
  );
  if (!definition) {
    throw new Error(`model_contract_boundary_unknown:${boundaryKind}`);
  }
  return definition;
}

function boundedString(value: string, max = 1_200): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function structuralPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function diagnostic(input: {
  path: string;
  code: string;
  message: string;
  expectedType?: string;
}): ModelDecisionCompileDiagnostic {
  return {
    path: input.path,
    code: input.code,
    message: input.message,
    expectedType: input.expectedType,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function collectForbiddenFieldDiagnostics(input: {
  value: unknown;
  path: string;
  runtimeOwnedFields: ReadonlySet<string>;
}): ModelDecisionCompileDiagnostic[] {
  if (Array.isArray(input.value)) {
    return input.value.flatMap((item, index) =>
      collectForbiddenFieldDiagnostics({
        value: item,
        path: `${input.path}[${index}]`,
        runtimeOwnedFields: input.runtimeOwnedFields,
      }),
    );
  }
  const record = asRecord(input.value);
  if (Object.keys(record).length === 0) {
    return [];
  }
  const diagnostics: ModelDecisionCompileDiagnostic[] = [];
  for (const [key, value] of Object.entries(record)) {
    const path = structuralPath(input.path, key);
    if (input.runtimeOwnedFields.has(key)) {
      diagnostics.push(
        diagnostic({
          path,
          code: "model_contract_runtime_owned_field_rejected",
          message:
            "Model output supplied a runtime-owned field. The model should provide semantic intent; runtime compiles ids, executor fields, refs, evidence enums, lifecycle, and authority.",
          expectedType: "omit runtime-owned field",
        }),
      );
    }
    if (RAW_STORAGE_FLAG_FIELD_SET.has(key) && value === true) {
      diagnostics.push(
        diagnostic({
          path,
          code: "model_contract_raw_storage_flag_rejected",
          message:
            "Model contract outputs must not claim raw prompt, response, provider, tool, command, DB, transcript, log, or secret storage.",
          expectedType: "false",
        }),
      );
    }
    diagnostics.push(
      ...collectForbiddenFieldDiagnostics({
        value,
        path,
        runtimeOwnedFields: input.runtimeOwnedFields,
      }),
    );
  }
  return diagnostics;
}

function requiredSemanticFieldDiagnostics(input: {
  value: unknown;
  requiredSemanticFields: ModelContractRequiredSemanticField[];
}): ModelDecisionCompileDiagnostic[] {
  const record = flattenModelDecisionFields(input.value);
  const diagnostics: ModelDecisionCompileDiagnostic[] = [];
  for (const requiredField of input.requiredSemanticFields) {
    const aliases = requiredField.aliases.length > 0 ? requiredField.aliases : [requiredField.path];
    const matched =
      requiredField.expectedType === "string"
        ? firstStructuralString(record, aliases).value.length > 0
        : requiredField.expectedType === "string[]"
          ? firstStructuralStringArray(record, aliases).value.length > 0
          : aliases.some((alias) => {
              const value = record[alias];
              if (requiredField.expectedType === "array") {
                return Array.isArray(value) && value.length > 0;
              }
              return Object.keys(asRecord(value)).length > 0;
            });
    if (!matched) {
      diagnostics.push(
        diagnostic({
          path: requiredField.path,
          code: "model_contract_required_semantic_field_missing",
          message: requiredField.whyRequired,
          expectedType: requiredField.expectedType,
        }),
      );
    }
  }
  return diagnostics;
}

export function firstStructuralString(
  record: Record<string, unknown>,
  keys: string[],
): { value: string; acceptedAlias: string | null } {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { value: boundedString(value), acceptedAlias: key };
    }
  }
  return { value: "", acceptedAlias: null };
}

export function firstStructuralStringArray(
  record: Record<string, unknown>,
  keys: string[],
  maxItems = 24,
): { value: string[]; acceptedAlias: string | null } {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const strings = value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => boundedString(item, 260))
      .slice(0, maxItems);
    if (strings.length > 0) {
      return { value: strings, acceptedAlias: key };
    }
  }
  return { value: [], acceptedAlias: null };
}

export function flattenModelDecisionFields(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return {
    ...asRecord(record.metadata),
    ...asRecord(record.taskDetails),
    ...asRecord(record.nodeContract),
    ...record,
  };
}

export function repairRequestForMissingFields(input: {
  failedDecisionId?: string | null;
  missingFields: ModelDecisionMissingField[];
  preserveFields?: string[];
  acceptedFields?: string[];
  rejectedReasonCodes?: string[];
}): ModelDecisionRepairRequest {
  return {
    artifactKind: "model_decision_repair_request",
    failedDecisionId: input.failedDecisionId ?? null,
    missingFields: input.missingFields.slice(0, 30),
    preserveFields: [...new Set(input.preserveFields ?? [])].slice(0, 40),
    acceptedFields: [...new Set(input.acceptedFields ?? [])].slice(0, 40),
    rejectedReasonCodes: [...new Set(input.rejectedReasonCodes ?? [])].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function missingField(
  path: string,
  expectedType: string,
  whyRequired: string,
  repairExample?: JsonValue,
  validAlternatives?: JsonValue,
): ModelDecisionMissingField {
  return { path, expectedType, whyRequired, repairExample, validAlternatives };
}

export function diagnosticsFromMissingFields(
  missingFields: ModelDecisionMissingField[],
): ModelDecisionCompileDiagnostic[] {
  return missingFields.map((field) => ({
    path: field.path,
    code: "model_decision_required_field_missing",
    message: field.whyRequired,
    expectedType: field.expectedType,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  }));
}

function missingFieldFromDiagnostic(
  issue: ModelDecisionCompileDiagnostic,
): ModelDecisionMissingField {
  return missingField(
    issue.path,
    issue.expectedType ?? "valid model-authored semantic field",
    issue.message,
    issue.code === "model_contract_runtime_owned_field_rejected"
      ? "Remove this field from the model payload."
      : undefined,
    issue.code === "model_contract_runtime_owned_field_rejected"
      ? [...COMMON_RUNTIME_OWNED_ALLOWED_ALTERNATIVES]
      : undefined,
  );
}

export function runtimeOwnedFieldDiagnosticsForRecords(input: {
  records: readonly unknown[];
  pathPrefix: string;
  boundaryKind?: ModelContractBoundaryKind;
  runtimeOwnedFields?: readonly string[];
}): ModelDecisionCompileDiagnostic[] {
  const definition = input.boundaryKind
    ? getModelContractBoundaryDefinition(input.boundaryKind)
    : null;
  const runtimeOwnedFields = new Set<string>(
    input.runtimeOwnedFields ??
      definition?.runtimeOwnedFields ??
      MODEL_CONTRACT_RUNTIME_OWNED_FIELDS,
  );
  return input.records.flatMap((value, index) =>
    collectForbiddenFieldDiagnostics({
      value,
      path: `${input.pathPrefix}[${index}]`,
      runtimeOwnedFields,
    }),
  );
}

export function runtimeOwnedFieldReasonCodesForRecords(input: {
  records: readonly unknown[];
  pathPrefix: string;
  boundaryKind?: ModelContractBoundaryKind;
  runtimeOwnedFields?: readonly string[];
  codePrefix?: string;
}): string[] {
  const codePrefix = input.codePrefix ?? "model_contract_runtime_owned_field_rejected";
  return runtimeOwnedFieldDiagnosticsForRecords(input)
    .filter((issue) => issue.code === "model_contract_runtime_owned_field_rejected")
    .map((issue) => `${codePrefix}:${issue.path}`);
}

export function compileModelContractBoundary(input: {
  boundaryKind: ModelContractBoundaryKind;
  value: unknown;
  failedDecisionId?: string | null;
  pathPrefix?: string;
  requiredSemanticFields?: ModelContractRequiredSemanticField[];
  preserveFields?: string[];
  acceptedFields?: string[];
}): ModelContractBoundaryCompileResult {
  const definition = getModelContractBoundaryDefinition(input.boundaryKind);
  const pathPrefix = input.pathPrefix ?? input.boundaryKind;
  const diagnostics = [
    ...collectForbiddenFieldDiagnostics({
      value: input.value,
      path: pathPrefix,
      runtimeOwnedFields: new Set<string>(definition.runtimeOwnedFields),
    }),
    ...requiredSemanticFieldDiagnostics({
      value: input.value,
      requiredSemanticFields: input.requiredSemanticFields ?? definition.requiredSemanticFields,
    }),
  ];
  const reasonCodes = [
    "model_contract_boundary_compiled",
    `model_contract_boundary:${input.boundaryKind}`,
    ...diagnostics.map((issue) => `${issue.code}:${issue.path}`),
  ].slice(0, 80);
  return {
    artifactKind: "model_contract_boundary_compile_result",
    compilerVersion: MODEL_CONTRACT_COMPILER_VERSION,
    boundaryKind: input.boundaryKind,
    accepted: diagnostics.length === 0,
    diagnostics,
    repairRequest: repairRequestForMissingFields({
      failedDecisionId: input.failedDecisionId ?? null,
      missingFields: diagnostics.map(missingFieldFromDiagnostic),
      preserveFields: input.preserveFields,
      acceptedFields: input.acceptedFields,
      rejectedReasonCodes: reasonCodes,
    }),
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
