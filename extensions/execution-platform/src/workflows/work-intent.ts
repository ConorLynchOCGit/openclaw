import { createHash } from "node:crypto";
import { z } from "zod";
import {
  runtimeOwnedFieldReasonCodesForRecords,
  type ModelDecisionMissingField,
  missingField,
  repairRequestForMissingFields,
  type ModelDecisionRepairRequest,
} from "../model-decision-contracts/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  evidenceModesForCapability,
  executionIntentCapabilityConflict,
  normalizeExecutionIntent,
  EvidenceModeSchema,
  ExecutionIntentSchema,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import {
  boundedRuntimeWorkGraphString,
  graphRef,
  type TeamGraphNodeKind,
} from "./runtime-work-graph.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable().default(null);
const boundedStringArray = (maxItems: number, maxChars = 260) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const WORK_INTENT_NODE_KIND = "work_intent" satisfies TeamGraphNodeKind;

export const WorkIntentResourceRequirementSchema = z
  .object({
    requirementKind: z.enum([
      "context_handoff",
      "target_refs",
      "file_snapshots",
      "new_file_intent",
      "validation_refs",
      "evidence_claims",
      "read_only_refs",
      "human_decision",
      "closeout_refs",
    ]),
    required: z.boolean(),
    source: z.enum(["runtime_derived_from_work_intent_capability_and_workflow_policy"]),
    summary: boundedString(600),
  })
  .strict();

export type WorkIntentResourceRequirement = z.infer<typeof WorkIntentResourceRequirementSchema>;

export const WorkIntentModelFieldsSchema = z
  .object({
    workUnitId: boundedString(160),
    title: boundedString(220),
    objective: boundedString(1_200),
    commitmentIds: boundedStringArray(24, 180),
    executionIntent: ExecutionIntentSchema,
    selectedCapabilityId: boundedString(180),
    consideredCapabilityIds: boundedStringArray(16, 180),
    capabilityRationale: boundedString(1_000),
    costRationale: optionalBoundedString(1_000),
    whyCheaperOptionsWereInsufficient: optionalBoundedString(1_000),
    whyThisIsNotDuplicateWork: optionalBoundedString(1_000),
    expectedOutput: boundedString(1_200),
    successCriteria: boundedStringArray(24, 400),
    contextQuestions: boundedStringArray(24, 500),
    targetRefs: boundedStringArray(32, 420),
    inputRefs: boundedStringArray(32, 420),
    validationNeeds: boundedStringArray(16, 420),
    dependencyWorkUnitIds: boundedStringArray(24, 180),
    downstreamConsumer: boundedString(260),
    stopIfMissing: boundedStringArray(16, 500),
    parallelismRationale: optionalBoundedString(1_000),
    rationale: optionalBoundedString(1_000),
  })
  .strict();

export type WorkIntentModelFields = z.infer<typeof WorkIntentModelFieldsSchema>;

export const RuntimeCompiledWorkIntentSchema = z
  .object({
    artifactKind: z.literal("runtime_compiled_work_intent"),
    schemaVersion: z.literal("execution-platform.work-intent.v1"),
    workIntentId: boundedString(220),
    workIntentRef: boundedString(420),
    graphId: boundedString(180).nullable(),
    decisionId: boundedString(180),
    nodeId: boundedString(220),
    nodeKind: z.literal(WORK_INTENT_NODE_KIND),
    modelFields: WorkIntentModelFieldsSchema,
    selectedCapabilityId: boundedString(180),
    selectedCapabilityRoleClass: boundedString(120),
    selectedCapabilityGraphNodeKind: boundedString(120),
    selectedCapabilityExecutorKey: boundedString(220),
    selectedCapabilityWorkerRef: boundedString(220),
    evidenceMode: z.array(EvidenceModeSchema).max(12),
    resourceRequirements: z.array(WorkIntentResourceRequirementSchema).max(16),
    nextLegalTransitions: boundedStringArray(12, 180),
    readinessStatus: z.enum(["work_intent", "blocked"]),
    reasonCodes: boundedStringArray(80, 240),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type RuntimeCompiledWorkIntent = z.infer<typeof RuntimeCompiledWorkIntentSchema>;

export type WorkIntentCapabilityValidation = {
  valid: boolean;
  selectedCapability: RuntimeNodeCapability | null;
  executionIntent: ExecutionIntent | null;
  evidenceMode: EvidenceMode[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type WorkIntentRepairDiagnostic = {
  path: string;
  errorCode: string;
  message: string;
  validValues?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CompiledWorkIntentGraphNode = {
  nodeId: string;
  nodeKind: typeof WORK_INTENT_NODE_KIND;
  assignedRole: "work_intent";
  modelOrWorkerRef: null;
  inputHandoffRefs: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  downstreamConsumer: string;
  commitmentIdsAdvanced: string[];
  whyThisRoleIsNeededNow: string | null;
  exactObjective: string;
  evidenceExpectation: string | null;
  targetRefs: string[];
  metadata: JsonValue;
};

export type WorkIntentCompileResult = {
  workIntent: RuntimeCompiledWorkIntent | null;
  node: CompiledWorkIntentGraphNode | null;
  capabilityValidation: WorkIntentCapabilityValidation;
  diagnostics: WorkIntentRepairDiagnostic[];
  repairRequest: ModelDecisionRepairRequest;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  semanticQualityJudgedByDeterministicCode: false;
};

function unique(values: Array<string | null | undefined>, max = 32): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const bounded = boundedRuntimeWorkGraphString(value ?? "", 420);
    if (!bounded || seen.has(bounded)) {
      continue;
    }
    seen.add(bounded);
    output.push(bounded);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function slug(value: string, fallback: string): string {
  const slugged = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100);
  return slugged || fallback;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function modelFieldMissingDiagnostic(input: {
  path: string;
  expectedType: string;
  message: string;
  validValues?: string[];
}): WorkIntentRepairDiagnostic {
  return {
    path: input.path,
    errorCode: "work_intent_required_model_field_missing",
    message: input.message,
    validValues: input.validValues,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function missingFieldsForDiagnostics(
  diagnostics: WorkIntentRepairDiagnostic[],
): ModelDecisionMissingField[] {
  return diagnostics.map((diagnostic) =>
    missingField(
      diagnostic.path,
      diagnostic.validValues ? "registered enum value" : "valid model-authored semantic field",
      diagnostic.message,
      diagnostic.validValues?.[0],
      diagnostic.validValues,
    ),
  );
}

function resourceRequirementsFor(input: {
  executionIntent: ExecutionIntent;
  capability: RuntimeNodeCapability;
  evidenceMode: EvidenceMode[];
}): WorkIntentResourceRequirement[] {
  const requirements: WorkIntentResourceRequirement[] = [];
  const add = (
    requirementKind: WorkIntentResourceRequirement["requirementKind"],
    required: boolean,
    summary: string,
  ) => {
    requirements.push({
      requirementKind,
      required,
      source: "runtime_derived_from_work_intent_capability_and_workflow_policy",
      summary: boundedRuntimeWorkGraphString(summary, 600),
    });
  };

  add("evidence_claims", true, "Evidence claims must map output to WorkIntent commitment ids.");

  if (input.executionIntent === "source_edit") {
    add("context_handoff", true, "Source edits require accepted node-scoped context handoff refs.");
    add(
      "target_refs",
      true,
      "Source edits require concrete target refs or explicit new-file intent.",
    );
    add(
      "file_snapshots",
      true,
      "Source edits require target file snapshots before worker invocation.",
    );
    add("new_file_intent", false, "New file creation is allowed only when explicitly compiled.");
    add("validation_refs", true, "Source edits require validation refs or validation discovery.");
    return requirements;
  }

  if (input.executionIntent === "source_grounding") {
    add("read_only_refs", true, "Source grounding produces read-only evidence from bounded refs.");
    add(
      "context_handoff",
      input.capability.requiresContext,
      "Read-only work may require context handoff refs, but never changed-file evidence.",
    );
    return requirements;
  }

  if (input.executionIntent === "context_supply") {
    add("context_handoff", true, "Context supply must produce accepted context handoff evidence.");
    add("target_refs", false, "Target refs are optional until a downstream consumer needs them.");
    return requirements;
  }

  if (input.executionIntent === "validation") {
    add("validation_refs", true, "Validation work requires validation command or result refs.");
    return requirements;
  }

  if (input.executionIntent === "human_decision") {
    add("human_decision", true, "Human decision work requires a human task decision ref.");
    return requirements;
  }

  if (input.executionIntent === "closeout") {
    add("closeout_refs", true, "Closeout work requires bounded closeout evidence refs.");
    return requirements;
  }

  if (input.evidenceMode.includes("changed_file_evidence")) {
    add("target_refs", true, "Changed-file evidence requires concrete target refs.");
    add("file_snapshots", true, "Changed-file evidence requires target snapshots.");
  } else {
    add("read_only_refs", true, "This work can progress through bounded read-only refs.");
  }
  return requirements;
}

function validateWorkIntentCapability(input: {
  modelFields: WorkIntentModelFields | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): WorkIntentCapabilityValidation {
  if (!input.modelFields) {
    return {
      valid: false,
      selectedCapability: null,
      executionIntent: null,
      evidenceMode: [],
      reasonCodes: ["work_intent_model_fields_invalid"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const capability = findRuntimeNodeCapability(
    input.modelFields.selectedCapabilityId,
    input.capabilityManifest,
  );
  if (!capability) {
    return {
      valid: false,
      selectedCapability: null,
      executionIntent: input.modelFields.executionIntent,
      evidenceMode: [],
      reasonCodes: [
        `work_intent_selected_capability_unknown:${input.modelFields.selectedCapabilityId}`,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const conflict = executionIntentCapabilityConflict({
    executionIntent: input.modelFields.executionIntent,
    capability,
  });
  const evidenceMode = evidenceModesForCapability({
    capability,
    executionIntent: input.modelFields.executionIntent,
  });
  return {
    valid: !conflict,
    selectedCapability: capability,
    executionIntent: input.modelFields.executionIntent,
    evidenceMode,
    reasonCodes: conflict
      ? [`work_intent_execution_intent_capability_conflict:${conflict}`]
      : ["work_intent_capability_validated"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function compileWorkIntent(input: {
  decisionId: string;
  graphId?: string | null;
  workUnitId: string;
  title?: string | null;
  objective: string;
  commitmentIds: string[];
  executionIntent: unknown;
  selectedCapabilityId: string;
  consideredCapabilityIds?: string[];
  capabilityRationale: string;
  costRationale?: string | null;
  whyCheaperOptionsWereInsufficient?: string | null;
  whyThisIsNotDuplicateWork?: string | null;
  expectedOutput: string;
  successCriteria: string[];
  contextQuestions?: string[];
  targetRefs?: string[];
  inputRefs?: string[];
  validationNeeds?: string[];
  dependencyWorkUnitIds?: string[];
  downstreamConsumer: string;
  stopIfMissing?: string[];
  parallelismRationale?: string | null;
  rationale?: string | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
  sourceRecord?: unknown;
  sourcePath?: string;
}): WorkIntentCompileResult {
  const diagnostics: WorkIntentRepairDiagnostic[] = [];
  const runtimeOwnedReasonCodes = input.sourceRecord
    ? runtimeOwnedFieldReasonCodesForRecords({
        records: [input.sourceRecord],
        pathPrefix: input.sourcePath ?? "workIntent",
        boundaryKind: "scheduler_staged_protocol",
        codePrefix: "work_intent_runtime_owned_field_rejected",
      })
    : [];
  const executionIntent = normalizeExecutionIntent(input.executionIntent);
  if (!executionIntent || executionIntent === "unspecified") {
    diagnostics.push(
      modelFieldMissingDiagnostic({
        path: `${input.sourcePath ?? "workIntent"}.executionIntent`,
        expectedType: "ExecutionIntent",
        message:
          "WorkIntent requires explicit model-authored executionIntent; runtime must not infer it from capability, prose, filename, or workflow name.",
        validValues: [
          "source_grounding",
          "context_supply",
          "resource_materialization",
          "source_edit",
          "validation",
          "review",
          "docs",
          "readback",
          "closeout",
          "human_decision",
        ],
      }),
    );
  }
  const parsed = WorkIntentModelFieldsSchema.safeParse({
    workUnitId: input.workUnitId,
    title: input.title || input.workUnitId,
    objective: input.objective,
    commitmentIds: unique(input.commitmentIds, 24),
    executionIntent: executionIntent ?? "source_grounding",
    selectedCapabilityId: input.selectedCapabilityId,
    consideredCapabilityIds: unique(
      input.consideredCapabilityIds && input.consideredCapabilityIds.length > 0
        ? input.consideredCapabilityIds
        : [input.selectedCapabilityId],
      16,
    ),
    capabilityRationale: input.capabilityRationale,
    costRationale: input.costRationale ?? null,
    whyCheaperOptionsWereInsufficient: input.whyCheaperOptionsWereInsufficient ?? null,
    whyThisIsNotDuplicateWork: input.whyThisIsNotDuplicateWork ?? null,
    expectedOutput: input.expectedOutput,
    successCriteria: unique(input.successCriteria, 24),
    contextQuestions: unique(input.contextQuestions ?? [], 24),
    targetRefs: unique(input.targetRefs ?? [], 32),
    inputRefs: unique(input.inputRefs ?? [], 32),
    validationNeeds: unique(input.validationNeeds ?? [], 16),
    dependencyWorkUnitIds: unique(input.dependencyWorkUnitIds ?? [], 24),
    downstreamConsumer: input.downstreamConsumer,
    stopIfMissing: unique(input.stopIfMissing ?? [], 16),
    parallelismRationale: input.parallelismRationale ?? null,
    rationale: input.rationale ?? null,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: `${input.sourcePath ?? "workIntent"}.${issue.path.join(".")}`,
        errorCode: "work_intent_model_field_invalid",
        message: issue.message,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
    }
  }

  const modelFields = parsed.success && executionIntent ? parsed.data : null;
  const capabilityValidation = validateWorkIntentCapability({
    modelFields,
    capabilityManifest: input.capabilityManifest,
  });
  if (!capabilityValidation.valid) {
    for (const code of capabilityValidation.reasonCodes) {
      if (code.startsWith("work_intent_selected_capability_unknown")) {
        diagnostics.push({
          path: `${input.sourcePath ?? "workIntent"}.selectedCapabilityId`,
          errorCode: "work_intent_selected_capability_unknown",
          message: "Selected capability must exist in the runtime capability manifest.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
      }
      if (code.startsWith("work_intent_execution_intent_capability_conflict")) {
        diagnostics.push({
          path: `${input.sourcePath ?? "workIntent"}.executionIntent`,
          errorCode: "work_intent_execution_intent_capability_conflict",
          message:
            "Selected capability does not structurally support the model-authored execution intent.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
      }
    }
  }

  const reasonCodes = unique(
    [
      "work_intent_compile_attempted",
      ...runtimeOwnedReasonCodes,
      ...capabilityValidation.reasonCodes,
      ...diagnostics.map((diagnostic) => diagnostic.errorCode),
    ],
    80,
  );
  const missingFields = missingFieldsForDiagnostics(diagnostics);
  const repairRequest = repairRequestForMissingFields({
    failedDecisionId: input.decisionId || null,
    missingFields,
    rejectedReasonCodes: reasonCodes,
    acceptedFields: modelFields
      ? [
          "workUnitId",
          "objective",
          "commitmentIds",
          "executionIntent",
          "selectedCapabilityId",
          "expectedOutput",
          "successCriteria",
          "downstreamConsumer",
        ]
      : [],
  });

  if (
    !modelFields ||
    !capabilityValidation.selectedCapability ||
    !capabilityValidation.executionIntent ||
    runtimeOwnedReasonCodes.length > 0 ||
    !capabilityValidation.valid
  ) {
    return {
      workIntent: null,
      node: null,
      capabilityValidation,
      diagnostics,
      repairRequest,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      semanticQualityJudgedByDeterministicCode: false,
    };
  }

  const capability = capabilityValidation.selectedCapability;
  const workIntentId = slug(
    `${input.decisionId}:${modelFields.workUnitId}:${capability.capabilityId}`,
    `work-intent-${hashValue(modelFields).slice(0, 12)}`,
  );
  const nodeId = slug(
    `work-intent-${modelFields.workUnitId}`,
    `work-intent-${hashValue(modelFields).slice(0, 12)}`,
  );
  const workIntentRef = graphRef("work-intent", `${nodeId}/${hashValue(modelFields).slice(0, 16)}`);
  const resourceRequirements = resourceRequirementsFor({
    executionIntent: modelFields.executionIntent,
    capability,
    evidenceMode: capabilityValidation.evidenceMode,
  });
  const nextLegalTransitions =
    modelFields.executionIntent === "source_edit"
      ? ["request_context_repair", "compile_node_execution_packet", "split_work_unit"]
      : modelFields.executionIntent === "context_supply"
        ? ["dispatch_context_scout", "mark_context_ready"]
        : ["produce_read_only_evidence", "request_context_repair", "needs_review"];
  const compiled: RuntimeCompiledWorkIntent = {
    artifactKind: "runtime_compiled_work_intent",
    schemaVersion: "execution-platform.work-intent.v1",
    workIntentId,
    workIntentRef,
    graphId: input.graphId ?? null,
    decisionId: input.decisionId,
    nodeId,
    nodeKind: WORK_INTENT_NODE_KIND,
    modelFields,
    selectedCapabilityId: capability.capabilityId,
    selectedCapabilityRoleClass: capability.roleClass,
    selectedCapabilityGraphNodeKind: capability.graphNodeKind,
    selectedCapabilityExecutorKey: capability.executorKey,
    selectedCapabilityWorkerRef: capability.workerRef,
    evidenceMode: capabilityValidation.evidenceMode,
    resourceRequirements,
    nextLegalTransitions,
    readinessStatus: "work_intent",
    reasonCodes: unique([...reasonCodes, "work_intent_compiled"], 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  const summary = summarizeWorkIntentForReadback(compiled);
  const node: CompiledWorkIntentGraphNode = {
    nodeId,
    nodeKind: WORK_INTENT_NODE_KIND,
    assignedRole: "work_intent",
    modelOrWorkerRef: null,
    inputHandoffRefs: modelFields.inputRefs,
    expectedOutput: modelFields.expectedOutput,
    acceptanceCriteria: modelFields.successCriteria,
    downstreamConsumer: modelFields.downstreamConsumer,
    commitmentIdsAdvanced: modelFields.commitmentIds,
    whyThisRoleIsNeededNow: modelFields.capabilityRationale,
    exactObjective: modelFields.objective,
    evidenceExpectation: capabilityValidation.evidenceMode.join(","),
    targetRefs: modelFields.targetRefs,
    metadata: {
      workIntentCompiled: true,
      stagedSchedulerProtocolCompiled: true,
      genericSchedulerProtocolCompiled: true,
      workIntentId,
      workIntentRef,
      workIntentSummary: summary,
      workUnitId: modelFields.workUnitId,
      workUnitTitle: modelFields.title,
      executionIntent: modelFields.executionIntent,
      evidenceMode: capabilityValidation.evidenceMode,
      selectedCapabilityId: capability.capabilityId,
      workIntentSelectedCapabilityId: capability.capabilityId,
      targetCapabilityRoleClass: capability.roleClass,
      targetCapabilityGraphNodeKind: capability.graphNodeKind,
      targetCapabilityExecutorKey: capability.executorKey,
      targetCapabilityWorkerRef: capability.workerRef,
      targetCapabilityRequiredMetadataSchemaRef: capability.requiredMetadataSchemaRef,
      selectedCapabilityCanRunAsExecutable: capability.canRunAsExecutable,
      selectedCapabilityRequiresNodeExecutionPacket: capability.requiredNodeExecutionPacket,
      resourceRequirementKinds: resourceRequirements.map(
        (requirement) => requirement.requirementKind,
      ),
      requiredResourcePacketKind: capability.requiredResourcePacketKind,
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      expectedEvidence: capability.evidenceProducedKinds,
      nextLegalTransitions,
      readinessStatus: "work_intent",
      lifecycleState: "work_intent",
      commitmentIdsAdvanced: modelFields.commitmentIds,
      targetCommitmentIds: modelFields.commitmentIds,
      contextQuestions: modelFields.contextQuestions,
      validationNeeds: modelFields.validationNeeds,
      stopIfMissing: modelFields.stopIfMissing,
      dependencyWorkUnitIds: modelFields.dependencyWorkUnitIds,
      expectedDownstreamConsumer: modelFields.downstreamConsumer,
      utilityRationale: modelFields.capabilityRationale,
      costRationale: modelFields.costRationale,
      whyCheaperOptionsWereInsufficient: modelFields.whyCheaperOptionsWereInsufficient,
      whyThisIsNotDuplicateWork: modelFields.whyThisIsNotDuplicateWork,
      consideredCapabilityIds: modelFields.consideredCapabilityIds,
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue,
  };
  return {
    workIntent: compiled,
    node,
    capabilityValidation,
    diagnostics,
    repairRequest,
    reasonCodes: compiled.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    semanticQualityJudgedByDeterministicCode: false,
  };
}

export function summarizeWorkIntentForReadback(workIntent: RuntimeCompiledWorkIntent): {
  workIntentId: string;
  workIntentRef: string;
  title: string;
  objective: string;
  executionIntent: ExecutionIntent;
  selectedCapabilityId: string;
  selectedCapabilityRoleClass: string;
  evidenceMode: EvidenceMode[];
  targetCommitmentIds: string[];
  resourceRequirementKinds: string[];
  readinessStatus: "work_intent" | "blocked";
  nextLegalTransitions: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
} {
  return {
    workIntentId: workIntent.workIntentId,
    workIntentRef: workIntent.workIntentRef,
    title: boundedRuntimeWorkGraphString(workIntent.modelFields.title, 220),
    objective: boundedRuntimeWorkGraphString(workIntent.modelFields.objective, 360),
    executionIntent: workIntent.modelFields.executionIntent,
    selectedCapabilityId: workIntent.selectedCapabilityId,
    selectedCapabilityRoleClass: workIntent.selectedCapabilityRoleClass,
    evidenceMode: workIntent.evidenceMode,
    targetCommitmentIds: workIntent.modelFields.commitmentIds.slice(0, 24),
    resourceRequirementKinds: workIntent.resourceRequirements
      .map((requirement) => requirement.requirementKind)
      .slice(0, 16),
    readinessStatus: workIntent.readinessStatus,
    nextLegalTransitions: workIntent.nextLegalTransitions.slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
