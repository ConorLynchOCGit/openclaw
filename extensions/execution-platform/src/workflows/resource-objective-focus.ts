import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

export const RESOURCE_OBJECTIVE_FOCUS_ARTIFACT_TYPE =
  "execution_platform.resource_objective_focus" as const;
export const RESOURCE_OBJECTIVE_FOCUS_LEGAL_REF_UNIVERSE_ARTIFACT_TYPE =
  "execution_platform.resource_objective_focus.legal_ref_universe" as const;
export const RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION =
  "execution-platform.resource-objective-focus.v1" as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedString = (max: number) => z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 420) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const ResourceUseKindSchema = z.enum([
  "resource_grounding",
  "domain_resource_selection",
  "domain_action_planning",
  "validation_planning",
  "evidence_closure",
  "review_support",
]);
export type ResourceUseKind = z.infer<typeof ResourceUseKindSchema>;

export const ResourceObjectiveFocusTransitionSchema = z.enum([
  "worker.context.request_more",
  "resource.scout.choose_search_query",
  "resource.scout.choose_file_from_listing",
  "resource.scout.choose_window_from_matches",
  "resource.scout.submit_exact_handles",
  "resource.scout.mark_narrowing_blocked",
  "resource.requirement.block_broad_payload",
  "resource.demand.open",
  "resource.demand.mark_blocked",
]);
export type ResourceObjectiveFocusTransition = z.infer<
  typeof ResourceObjectiveFocusTransitionSchema
>;

export const ResourceObjectiveFocusLegalRefKindSchema = z.enum([
  "source_prompt_section",
  "owner_constraint",
  "project_fact",
  "research_brief",
  "planning_capsule",
  "action_graph_candidate",
  "compile_readiness_input",
  "human_decision_ref",
  "workflow_manifest_ref",
  "proof_artifact_ref",
  "closeout_ref",
  "repo_area",
  "candidate_resource_ref",
  "memory_pack",
  "validation_ref",
  "resource_requirement",
  "bounded_file_window",
  "symbol",
  "other",
]);
export type ResourceObjectiveFocusLegalRefKind = z.infer<
  typeof ResourceObjectiveFocusLegalRefKindSchema
>;

export const ResourceObjectiveFocusLegalRefHandleSchema = z
  .object({
    handle: boundedString(420),
    ref: boundedString(420),
    kind: ResourceObjectiveFocusLegalRefKindSchema,
    boundedLabel: boundedString(320),
    byteEstimate: z.number().int().min(0).max(10_000_000).default(0),
    authorityScopeRefs: stringList(12, 420),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawFileContentStored: z.literal(false),
  })
  .strict();
export type ResourceObjectiveFocusLegalRefHandle = z.infer<
  typeof ResourceObjectiveFocusLegalRefHandleSchema
>;

export const ResourceObjectiveFocusStoragePolicySchema = z
  .object({
    boundedRefsOnly: z.literal(true),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();

export const ResourceObjectiveFocusLegalRefUniverseSchema = z
  .object({
    artifactKind: z.literal("resource_objective_focus_legal_ref_universe"),
    schemaVersion: z.literal(RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION),
    legalRefUniverseRef: boundedString(520),
    legalRefUniverseHash: boundedString(140),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    workIntentRef: nullableBoundedString(520),
    nodeExecutionContractRef: nullableBoundedString(520),
    sourceContextBrokerRequestRef: nullableBoundedString(520),
    handles: z.array(ResourceObjectiveFocusLegalRefHandleSchema).min(1).max(500),
    maxSelectableHandles: z.number().int().min(1).max(40).default(8),
    maxSemanticQuestions: z.number().int().min(1).max(8).default(3),
    reasonCodes: stringList(100, 220),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: ResourceObjectiveFocusStoragePolicySchema,
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type ResourceObjectiveFocusLegalRefUniverse = z.infer<
  typeof ResourceObjectiveFocusLegalRefUniverseSchema
>;

export const ResourceObjectiveFocusSchema = z
  .object({
    artifactKind: z.literal("resource_objective_focus"),
    schemaVersion: z.literal(RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION),
    focusRef: boundedString(520),
    focusHash: boundedString(140),
    status: z.enum(["accepted", "blocked", "unanswerable"]),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    consumerBranchId: nullableBoundedString(180),
    workIntentRef: boundedString(520),
    nodeExecutionContractRef: nullableBoundedString(520),
    currentObjectiveSlot: boundedString(220),
    resourceUseKind: ResourceUseKindSchema,
    nextUnknown: boundedString(1_200),
    expectedUse: boundedString(1_200),
    legalRefUniverseRef: boundedString(520),
    selectedRefHandles: stringList(40, 420),
    selectedSemanticQuestions: stringList(8, 500),
    maxInitialRefSelections: z.number().int().min(1).max(40),
    maxSemanticQuestions: z.number().int().min(1).max(8),
    stopWhenAnswered: boundedString(700),
    nextLegalTransitions: z.array(ResourceObjectiveFocusTransitionSchema).min(1).max(12),
    reasonCodes: stringList(120, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: ResourceObjectiveFocusStoragePolicySchema,
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type ResourceObjectiveFocus = z.infer<typeof ResourceObjectiveFocusSchema>;

export type ResourceObjectiveFocusLegalRefUniverseManifest = {
  artifactKind: "resource_objective_focus_legal_ref_universe_manifest";
  schemaVersion: typeof RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION;
  legalRefUniverseRef: string;
  legalRefUniverseHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  workIntentRef: string | null;
  nodeExecutionContractRef: string | null;
  sourceContextBrokerRequestRef: string | null;
  handleCount: number;
  handlesByKind: Record<string, number>;
  maxSelectableHandles: number;
  maxSemanticQuestions: number;
  byteCount: number;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ResourceObjectiveFocusManifest = {
  artifactKind: "resource_objective_focus_manifest";
  schemaVersion: typeof RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION;
  focusRef: string;
  focusHash: string;
  status: ResourceObjectiveFocus["status"];
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  consumerBranchId: string | null;
  workIntentRef: string;
  nodeExecutionContractRef: string | null;
  currentObjectiveSlot: string;
  resourceUseKind: ResourceUseKind;
  legalRefUniverseRef: string;
  selectedRefHandleCount: number;
  selectedSemanticQuestionCount: number;
  maxInitialRefSelections: number;
  maxSemanticQuestions: number;
  nextLegalTransitions: ResourceObjectiveFocusTransition[];
  byteCount: number;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ResourceObjectiveFocusCompileResult = {
  status: "succeeded" | "needs_review";
  focus: ResourceObjectiveFocus | null;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse | null;
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function byteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function strings(value: unknown, max = 40, maxChars = 420): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = bounded(item, maxChars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function withHash<T extends Record<string, unknown>, K extends string>(
  body: T,
  hashKey: K,
): T & Record<K, string> {
  return { ...body, [hashKey]: hashValue({ ...body, [hashKey]: "pending" }) } as T &
    Record<K, string>;
}

function storagePolicy() {
  return {
    boundedRefsOnly: true as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
}

function normalizeHandle(input: {
  ref: string;
  kind?: string | null;
  boundedLabel?: string | null;
  byteEstimate?: number | null;
  authorityScopeRefs?: string[];
}): ResourceObjectiveFocusLegalRefHandle | null {
  const ref = bounded(input.ref, 420);
  if (!ref) {
    return null;
  }
  const kind = ResourceObjectiveFocusLegalRefKindSchema.safeParse(input.kind).success
    ? (input.kind as ResourceObjectiveFocusLegalRefKind)
    : "other";
  const handle = `${kind}:${hashValue(ref).slice(0, 16)}`;
  return ResourceObjectiveFocusLegalRefHandleSchema.parse({
    handle,
    ref,
    kind,
    boundedLabel: bounded(input.boundedLabel ?? ref, 320) || ref.slice(0, 320),
    byteEstimate:
      typeof input.byteEstimate === "number" && Number.isFinite(input.byteEstimate)
        ? Math.max(0, Math.floor(input.byteEstimate))
        : 0,
    authorityScopeRefs: strings(input.authorityScopeRefs, 12, 420),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawFileContentStored: false,
  });
}

function handlesByKind(handles: ResourceObjectiveFocusLegalRefHandle[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const handle of handles) {
    counts[handle.kind] = (counts[handle.kind] ?? 0) + 1;
  }
  return counts;
}

export function buildResourceObjectiveFocusLegalRefUniverse(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  workIntentRef?: string | null;
  nodeExecutionContractRef?: string | null;
  sourceContextBrokerRequestRef?: string | null;
  refs: Array<{
    ref: string;
    kind?: ResourceObjectiveFocusLegalRefKind | string | null;
    boundedLabel?: string | null;
    byteEstimate?: number | null;
    authorityScopeRefs?: string[];
  }>;
  maxSelectableHandles?: number;
  maxSemanticQuestions?: number;
  reasonCodes?: string[];
}): ResourceObjectiveFocusLegalRefUniverse {
  const seen = new Set<string>();
  const handles: ResourceObjectiveFocusLegalRefHandle[] = [];
  for (const item of input.refs) {
    const handle = normalizeHandle(item);
    if (!handle || seen.has(handle.handle)) {
      continue;
    }
    seen.add(handle.handle);
    handles.push(handle);
  }
  const universeRef = `runtime-job://${bounded(input.runtimeJobId, 180)}/resource-objective-focus/legal-ref-universe/${bounded(
    input.graphId,
    140,
  )}/${bounded(input.consumerNodeId, 140)}/${hashValue(handles.map((entry) => entry.handle)).slice(
    0,
    18,
  )}`;
  const body = {
    artifactKind: "resource_objective_focus_legal_ref_universe" as const,
    schemaVersion: RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION,
    legalRefUniverseRef: universeRef,
    legalRefUniverseHash: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    workIntentRef: input.workIntentRef ? bounded(input.workIntentRef, 520) : null,
    nodeExecutionContractRef: input.nodeExecutionContractRef
      ? bounded(input.nodeExecutionContractRef, 520)
      : null,
    sourceContextBrokerRequestRef: input.sourceContextBrokerRequestRef
      ? bounded(input.sourceContextBrokerRequestRef, 520)
      : null,
    handles,
    maxSelectableHandles: Math.max(1, Math.min(input.maxSelectableHandles ?? 8, 40)),
    maxSemanticQuestions: Math.max(1, Math.min(input.maxSemanticQuestions ?? 3, 8)),
    reasonCodes: strings(
      [
        "resource_objective_focus_legal_ref_universe_compiled",
        "resource_objective_focus_runtime_did_not_rank_refs",
        ...(input.reasonCodes ?? []),
      ],
      100,
      220,
    ),
    semanticQualityJudgedByDeterministicCode: false as const,
    storagePolicy: storagePolicy(),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  return ResourceObjectiveFocusLegalRefUniverseSchema.parse(
    withHash(body, "legalRefUniverseHash"),
  );
}

export function buildResourceObjectiveFocusLegalRefUniverseManifest(
  universe: ResourceObjectiveFocusLegalRefUniverse,
): ResourceObjectiveFocusLegalRefUniverseManifest {
  return {
    artifactKind: "resource_objective_focus_legal_ref_universe_manifest",
    schemaVersion: RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION,
    legalRefUniverseRef: universe.legalRefUniverseRef,
    legalRefUniverseHash: universe.legalRefUniverseHash,
    runtimeJobId: universe.runtimeJobId,
    workflowId: universe.workflowId,
    graphId: universe.graphId,
    consumerNodeId: universe.consumerNodeId,
    workIntentRef: universe.workIntentRef,
    nodeExecutionContractRef: universe.nodeExecutionContractRef,
    sourceContextBrokerRequestRef: universe.sourceContextBrokerRequestRef,
    handleCount: universe.handles.length,
    handlesByKind: handlesByKind(universe.handles),
    maxSelectableHandles: universe.maxSelectableHandles,
    maxSemanticQuestions: universe.maxSemanticQuestions,
    byteCount: byteCount(universe),
    reasonCodes: universe.reasonCodes.slice(0, 40),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildResourceObjectiveFocusManifest(
  focus: ResourceObjectiveFocus,
): ResourceObjectiveFocusManifest {
  return {
    artifactKind: "resource_objective_focus_manifest",
    schemaVersion: RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION,
    focusRef: focus.focusRef,
    focusHash: focus.focusHash,
    status: focus.status,
    runtimeJobId: focus.runtimeJobId,
    workflowId: focus.workflowId,
    graphId: focus.graphId,
    consumerNodeId: focus.consumerNodeId,
    consumerBranchId: focus.consumerBranchId,
    workIntentRef: focus.workIntentRef,
    nodeExecutionContractRef: focus.nodeExecutionContractRef,
    currentObjectiveSlot: focus.currentObjectiveSlot,
    resourceUseKind: focus.resourceUseKind,
    legalRefUniverseRef: focus.legalRefUniverseRef,
    selectedRefHandleCount: focus.selectedRefHandles.length,
    selectedSemanticQuestionCount: focus.selectedSemanticQuestions.length,
    maxInitialRefSelections: focus.maxInitialRefSelections,
    maxSemanticQuestions: focus.maxSemanticQuestions,
    nextLegalTransitions: focus.nextLegalTransitions,
    byteCount: byteCount(focus),
    reasonCodes: focus.reasonCodes.slice(0, 50),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function resourceObjectiveFocusMetadata(focus: ResourceObjectiveFocus): JsonValue {
  return buildResourceObjectiveFocusManifest(focus) satisfies JsonValue;
}

export function resourceObjectiveFocusLegalRefUniverseMetadata(
  universe: ResourceObjectiveFocusLegalRefUniverse,
): JsonValue {
  return buildResourceObjectiveFocusLegalRefUniverseManifest(universe) satisfies JsonValue;
}

export function compileResourceObjectiveFocus(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  consumerBranchId?: string | null;
  workIntentRef: string | null;
  nodeExecutionContractRef?: string | null;
  currentObjectiveSlot: string | null;
  resourceUseKind: string | null;
  nextUnknown: string | null;
  expectedUse: string | null;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
  selectedRefHandles: string[];
  selectedSemanticQuestions: string[];
  maxInitialRefSelections?: number | null;
  maxSemanticQuestions?: number | null;
  stopWhenAnswered?: string | null;
  nextLegalTransitions?: string[];
  unanswerable?: boolean;
  reasonCodes?: string[];
}): ResourceObjectiveFocus {
  const resourceUseKind = ResourceUseKindSchema.safeParse(input.resourceUseKind).success
    ? (input.resourceUseKind as ResourceUseKind)
    : null;
  const effectiveResourceUseKind = resourceUseKind ?? "resource_grounding";
  const maxInitialRefSelections = Math.max(
    1,
    Math.min(
      input.maxInitialRefSelections ?? input.legalRefUniverse.maxSelectableHandles,
      input.legalRefUniverse.maxSelectableHandles,
      40,
    ),
  );
  const maxSemanticQuestions = Math.max(
    1,
    Math.min(
      input.maxSemanticQuestions ?? input.legalRefUniverse.maxSemanticQuestions,
      input.legalRefUniverse.maxSemanticQuestions,
      8,
    ),
  );
  const selectedRefHandles = strings(input.selectedRefHandles, maxInitialRefSelections, 420);
  const selectedSemanticQuestions = strings(
    input.selectedSemanticQuestions,
    maxSemanticQuestions,
    500,
  );
  const legalHandles = new Set(input.legalRefUniverse.handles.map((handle) => handle.handle));
  const illegalHandles = selectedRefHandles.filter((handle) => !legalHandles.has(handle));
  const missingFields = [
    input.runtimeJobId ? null : "runtimeJobId",
    input.workflowId ? null : "workflowId",
    input.graphId ? null : "graphId",
    input.consumerNodeId ? null : "consumerNodeId",
    input.workIntentRef ? null : "workIntentRef",
    input.currentObjectiveSlot ? null : "currentObjectiveSlot",
    effectiveResourceUseKind ? null : "resourceUseKind",
    input.nextUnknown ? null : "nextUnknown",
    input.expectedUse ? null : "expectedUse",
    selectedRefHandles.length > 0 || input.unanswerable ? null : "selectedRefHandles",
    selectedSemanticQuestions.length > 0 || input.unanswerable ? null : "selectedSemanticQuestions",
  ].filter((field): field is string => Boolean(field));
  const status: ResourceObjectiveFocus["status"] = input.unanswerable
    ? "unanswerable"
    : missingFields.length > 0 || illegalHandles.length > 0
      ? "blocked"
      : "accepted";
  const focusId = hashValue({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    consumerNodeId: input.consumerNodeId,
    workIntentRef: input.workIntentRef,
    currentObjectiveSlot: input.currentObjectiveSlot,
    resourceUseKind: effectiveResourceUseKind,
    selectedRefHandles,
    selectedSemanticQuestions,
    status,
  }).slice(0, 24);
  const focusRef = `runtime-job://${bounded(input.runtimeJobId, 180)}/resource-objective-focus/${bounded(
    input.graphId,
    140,
  )}/${bounded(input.consumerNodeId, 140)}/${focusId}`;
  const body = {
    artifactKind: "resource_objective_focus" as const,
    schemaVersion: RESOURCE_OBJECTIVE_FOCUS_SCHEMA_VERSION,
    focusRef,
    focusHash: "pending",
    status,
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    consumerBranchId: input.consumerBranchId ? bounded(input.consumerBranchId, 180) : null,
    workIntentRef: bounded(input.workIntentRef, 520),
    nodeExecutionContractRef: input.nodeExecutionContractRef
      ? bounded(input.nodeExecutionContractRef, 520)
      : null,
    currentObjectiveSlot: bounded(input.currentObjectiveSlot, 220),
    resourceUseKind: effectiveResourceUseKind,
    nextUnknown: bounded(input.nextUnknown, 1_200),
    expectedUse: bounded(input.expectedUse, 1_200),
    legalRefUniverseRef: input.legalRefUniverse.legalRefUniverseRef,
    selectedRefHandles,
    selectedSemanticQuestions,
    maxInitialRefSelections,
    maxSemanticQuestions,
    stopWhenAnswered:
      bounded(input.stopWhenAnswered, 700) ||
      "Stop when the selected unknown can be answered from the selected legal refs.",
    nextLegalTransitions: (
      input.nextLegalTransitions && input.nextLegalTransitions.length > 0
        ? input.nextLegalTransitions
        : [
            status === "accepted"
              ? "resource.demand.open"
              : "worker.context.request_more",
            "resource.demand.mark_blocked",
          ]
    ).filter((transition): transition is ResourceObjectiveFocusTransition =>
      ResourceObjectiveFocusTransitionSchema.safeParse(transition).success,
    ),
    reasonCodes: strings(
      [
        "resource_objective_focus_compiled",
        "resource_objective_focus_model_authored_semantic_focus_required",
        "resource_objective_focus_runtime_validated_legal_ref_handles",
        status === "accepted"
          ? "resource_objective_focus_accepted"
          : status === "unanswerable"
            ? "resource_objective_focus_model_marked_unanswerable"
            : "resource_objective_focus_blocked",
        ...missingFields.map((field) => `resource_objective_focus_missing_${field}`),
        ...illegalHandles.map(() => "resource_objective_focus_selected_ref_not_legal"),
        ...(resourceUseKind ? [] : ["resource_objective_focus_resource_use_kind_defaulted"]),
        ...(input.reasonCodes ?? []),
      ],
      120,
      220,
    ),
    semanticJudgmentOwner: "model_or_human" as const,
    semanticQualityJudgedByDeterministicCode: false as const,
    storagePolicy: storagePolicy(),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  return ResourceObjectiveFocusSchema.parse(withHash(body, "focusHash"));
}

export function normalizeResourceObjectiveFocusSelectedRefHandles(input: {
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
  selectedRefHandles?: unknown;
  selectedRefs?: unknown;
  refs?: unknown;
  maxInitialRefSelections?: number | null;
}): string[] {
  const maxInitialRefSelections = Math.max(
    1,
    Math.min(
      input.maxInitialRefSelections ?? input.legalRefUniverse.maxSelectableHandles,
      input.legalRefUniverse.maxSelectableHandles,
      40,
    ),
  );
  const handleByHandle = new Map(
    input.legalRefUniverse.handles.map((handle) => [handle.handle, handle.handle]),
  );
  const handleByRef = new Map(
    input.legalRefUniverse.handles.map((handle) => [handle.ref, handle.handle]),
  );
  const candidates = strings(
    [
      ...strings(input.selectedRefHandles, 80, 420),
      ...strings(input.selectedRefs, 80, 420),
      ...strings(input.refs, 80, 420),
    ],
    120,
    420,
  );
  const selectedRefHandles: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = handleByHandle.get(candidate) ?? handleByRef.get(candidate) ?? candidate;
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    selectedRefHandles.push(normalized);
    if (selectedRefHandles.length >= maxInitialRefSelections) {
      break;
    }
  }
  return selectedRefHandles;
}

export function selectedRefsFromResourceObjectiveFocus(input: {
  focus: ResourceObjectiveFocus;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
  kinds?: ResourceObjectiveFocusLegalRefKind[];
}): string[] {
  const selected = new Set(input.focus.selectedRefHandles);
  const allowedKinds = input.kinds ? new Set(input.kinds) : null;
  return input.legalRefUniverse.handles
    .filter((handle) => selected.has(handle.handle))
    .filter((handle) => !allowedKinds || allowedKinds.has(handle.kind))
    .map((handle) => handle.ref);
}

export function compileResourceObjectiveFocusToolOutput(input: {
  toolId: string;
  volatileInput?: JsonValue;
  metadata?: JsonValue;
}): ResourceObjectiveFocusCompileResult {
  const payload = { ...asRecord(input.metadata), ...asRecord(input.volatileInput) };
  const legalRefUniverse =
    ResourceObjectiveFocusLegalRefUniverseSchema.safeParse(payload.legalRefUniverse).success
      ? (payload.legalRefUniverse as ResourceObjectiveFocusLegalRefUniverse)
      : buildResourceObjectiveFocusLegalRefUniverse({
          runtimeJobId: bounded(String(payload.runtimeJobId ?? "unknown-runtime-job"), 180),
          workflowId: bounded(String(payload.workflowId ?? "unknown-workflow"), 180),
          graphId: bounded(String(payload.graphId ?? "unknown-graph"), 180),
          consumerNodeId: bounded(String(payload.consumerNodeId ?? "unknown-consumer"), 180),
          workIntentRef:
            typeof payload.workIntentRef === "string" ? payload.workIntentRef : null,
          nodeExecutionContractRef:
            typeof payload.nodeExecutionContractRef === "string"
              ? payload.nodeExecutionContractRef
              : null,
          sourceContextBrokerRequestRef:
            typeof payload.sourceContextBrokerRequestRef === "string"
              ? payload.sourceContextBrokerRequestRef
              : null,
          refs: (Array.isArray(payload.legalRefs) ? payload.legalRefs : []).flatMap((entry) => {
            const record = asRecord(entry);
            return typeof record.ref === "string"
              ? [
                  {
                    ref: record.ref,
                    kind: typeof record.kind === "string" ? record.kind : "other",
                    boundedLabel:
                      typeof record.boundedLabel === "string" ? record.boundedLabel : record.ref,
                    byteEstimate:
                      typeof record.byteEstimate === "number" ? record.byteEstimate : 0,
                    authorityScopeRefs: strings(record.authorityScopeRefs, 12, 420),
                  },
                ]
              : [];
          }),
          reasonCodes: ["resource_objective_focus_tool_legal_ref_universe_compiled"],
        });
  const unanswerable = input.toolId === "resource.scout.mark_narrowing_blocked";
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: legalRefUniverse.runtimeJobId,
    workflowId: legalRefUniverse.workflowId,
    graphId: legalRefUniverse.graphId,
    consumerNodeId: legalRefUniverse.consumerNodeId,
    consumerBranchId:
      typeof payload.consumerBranchId === "string" ? payload.consumerBranchId : null,
    workIntentRef:
      typeof payload.workIntentRef === "string"
        ? payload.workIntentRef
        : legalRefUniverse.workIntentRef,
    nodeExecutionContractRef:
      typeof payload.nodeExecutionContractRef === "string"
        ? payload.nodeExecutionContractRef
        : legalRefUniverse.nodeExecutionContractRef,
    currentObjectiveSlot:
      typeof payload.currentObjectiveSlot === "string" ? payload.currentObjectiveSlot : null,
    resourceUseKind: typeof payload.resourceUseKind === "string" ? payload.resourceUseKind : null,
    nextUnknown: typeof payload.nextUnknown === "string" ? payload.nextUnknown : null,
    expectedUse: typeof payload.expectedUse === "string" ? payload.expectedUse : null,
    legalRefUniverse,
    selectedRefHandles: normalizeResourceObjectiveFocusSelectedRefHandles({
      legalRefUniverse,
      selectedRefHandles: payload.selectedRefHandles,
      selectedRefs: payload.selectedRefs ?? payload.selectedRefRefs,
      refs: payload.refs,
      maxInitialRefSelections:
        typeof payload.maxInitialRefSelections === "number"
          ? payload.maxInitialRefSelections
          : null,
    }),
    selectedSemanticQuestions: strings(payload.selectedSemanticQuestions, 8, 500),
    maxInitialRefSelections:
      typeof payload.maxInitialRefSelections === "number"
        ? payload.maxInitialRefSelections
        : null,
    maxSemanticQuestions:
      typeof payload.maxSemanticQuestions === "number" ? payload.maxSemanticQuestions : null,
    stopWhenAnswered: typeof payload.stopWhenAnswered === "string" ? payload.stopWhenAnswered : null,
    nextLegalTransitions: strings(payload.nextLegalTransitions, 12, 180),
    unanswerable,
    reasonCodes: [`${input.toolId.replaceAll(".", "_")}_recorded`],
  });
  const status = focus.status === "accepted" || focus.status === "unanswerable"
    ? "succeeded"
    : "needs_review";
  return {
    status,
    focus,
    legalRefUniverse,
    outputRef: focus.focusRef,
    outputHash: focus.focusHash,
    outputSummary: `${input.toolId} produced ${focus.status} resource objective focus with ${focus.selectedRefHandles.length} selected ref handles.`,
    reasonCodes: focus.reasonCodes,
    metadata: {
      artifactKind: "resource_objective_focus_tool_output",
      toolId: bounded(input.toolId, 180),
      status: focus.status,
      focusManifest: buildResourceObjectiveFocusManifest(focus),
      legalRefUniverseManifest: buildResourceObjectiveFocusLegalRefUniverseManifest(legalRefUniverse),
      repairMissingFields: focus.reasonCodes
        .filter((code) => code.startsWith("resource_objective_focus_missing_"))
        .map((code) => code.replace("resource_objective_focus_missing_", ""))
        .slice(0, 20),
      nextLegalTransitions:
        focus.status === "accepted"
          ? ["resource.demand.open"]
          : ["worker.context.request_more", "resource.scout.mark_narrowing_blocked"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } satisfies JsonValue,
  };
}

export function assertResourceObjectiveFocusManifestMetadata(value: JsonValue): void {
  const encoded = JSON.stringify(value);
  const metadataBytes = Buffer.byteLength(encoded, "utf8");
  const bodyKeyPattern =
    /"(handles|selectedSemanticQuestions|nextUnknown|expectedUse|legalRefs|rawPrompt|rawResponse|lineNumberedContent|boundedContent)"\s*:/u;
  if (metadataBytes > 8_000) {
    throw new Error(`resource_objective_focus_manifest_metadata_overflow:${metadataBytes}`);
  }
  if (bodyKeyPattern.test(encoded)) {
    throw new Error("resource_objective_focus_manifest_contains_body_fields");
  }
}
