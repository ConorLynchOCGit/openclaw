import {
  createCanonicalMemoryRecord,
  mergeCanonicalMemoryFacets,
  type CanonicalMemoryApplicability,
  type CanonicalMemoryCompatibility,
  type CanonicalMemoryConfidence,
  type CanonicalMemoryFacetMap,
  type CanonicalMemoryKind,
  type CanonicalMemoryProvenance,
  type CanonicalMemoryRecord,
  type CanonicalMemoryRecency,
  type CanonicalMemoryScope,
  type CanonicalMemoryStability,
  type CanonicalMemoryValidationStatus,
} from "openclaw/plugin-sdk/memory-canonical-core";

export const COMPATIBILITY_MEMORY_FAMILY_IDS = [
  "response_style",
  "project_fact",
  "recurring_procedure",
  "workflow_improvement",
  "project_rule",
  "unmet_need",
] as const;

export type CompatibilityMemoryFamilyId = (typeof COMPATIBILITY_MEMORY_FAMILY_IDS)[number];

type CompatibilityMemoryFamilyDefinition = {
  kind: CanonicalMemoryKind;
  defaultTags: readonly string[];
  defaultFacets: CanonicalMemoryFacetMap;
  scopeModel: "global" | "project" | "mixed";
  storageKinds: readonly string[];
  promptSection: "behavior" | "project" | "procedure";
  directIntentClasses?: readonly ("fact" | "rule" | "need" | "procedure" | "style")[];
  queryClasses?: readonly string[];
  captureCategory?:
    | "project_fact"
    | "recurring_procedure"
    | "workflow_improvement"
    | "project_rule"
    | "unmet_need";
  captureSource?:
    | "explicit_project_fact"
    | "explicit_recurring_procedure"
    | "explicit_workflow_improvement"
    | "explicit_project_rule"
    | "explicit_unmet_need";
  captureClasses?: readonly string[];
  phrasePatternProofFamilyId?: "workflow_phrase_pattern" | "response_style_phrase_pattern";
};

const COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS: Record<
  CompatibilityMemoryFamilyId,
  CompatibilityMemoryFamilyDefinition
> = {
  response_style: {
    kind: "user",
    defaultTags: ["response_style", "preference", "user"],
    defaultFacets: {
      response_style: true,
      preference: true,
    },
    scopeModel: "global",
    storageKinds: ["memory_object", "phrase_pattern"],
    promptSection: "behavior",
    directIntentClasses: ["style"],
    phrasePatternProofFamilyId: "response_style_phrase_pattern",
  },
  project_fact: {
    kind: "project",
    defaultTags: ["project_fact", "fact", "project"],
    defaultFacets: {
      fact: true,
      project_scope: true,
    },
    scopeModel: "project",
    storageKinds: ["memory_object"],
    promptSection: "project",
    directIntentClasses: ["fact"],
    captureCategory: "project_fact",
    captureSource: "explicit_project_fact",
    captureClasses: ["explicit_project_fact"],
  },
  recurring_procedure: {
    kind: "feedback",
    defaultTags: ["recurring_procedure", "procedure", "validated_approach", "feedback"],
    defaultFacets: {
      procedure: true,
      validated_approach: true,
    },
    scopeModel: "mixed",
    storageKinds: ["procedure_candidate", "validated_procedure"],
    promptSection: "procedure",
    directIntentClasses: ["procedure"],
    queryClasses: ["clear_checklist_ask", "nearby_procedure_ask"],
    captureCategory: "recurring_procedure",
    captureSource: "explicit_recurring_procedure",
    captureClasses: ["explicit_recurring_procedure"],
  },
  workflow_improvement: {
    kind: "feedback",
    defaultTags: ["workflow_improvement", "workflow_guidance", "feedback"],
    defaultFacets: {
      workflow_guidance: true,
      validated_approach: true,
    },
    scopeModel: "project",
    storageKinds: ["memory_object", "phrase_pattern"],
    promptSection: "behavior",
    queryClasses: ["nearby_workflow_guidance_ask"],
    captureCategory: "workflow_improvement",
    captureSource: "explicit_workflow_improvement",
    captureClasses: [
      "workflow_tool_gotcha",
      "workflow_environment_constraint",
      "workflow_api_workaround",
      "workflow_generalized_guidance",
    ],
    phrasePatternProofFamilyId: "workflow_phrase_pattern",
  },
  project_rule: {
    kind: "feedback",
    defaultTags: ["project_rule", "rule", "feedback"],
    defaultFacets: {
      project_rule: true,
      rule: true,
    },
    scopeModel: "project",
    storageKinds: ["memory_object"],
    promptSection: "project",
    directIntentClasses: ["rule"],
    captureCategory: "project_rule",
    captureSource: "explicit_project_rule",
    captureClasses: ["project_rule_guidance"],
  },
  unmet_need: {
    kind: "project",
    defaultTags: ["unmet_need", "open_need", "project"],
    defaultFacets: {
      open_need: true,
      project_scope: true,
    },
    scopeModel: "project",
    storageKinds: ["memory_object"],
    promptSection: "project",
    directIntentClasses: ["need"],
    captureCategory: "unmet_need",
    captureSource: "explicit_unmet_need",
    captureClasses: ["unmet_need_recommendation"],
  },
};

const CAPTURE_CLASS_TO_COMPATIBILITY_MEMORY_FAMILY_ID = new Map<
  string,
  CompatibilityMemoryFamilyId
>();
const WORKFLOW_LESSON_FAMILY_TO_COMPATIBILITY_MEMORY_FAMILY_ID = new Map<
  string,
  Extract<CompatibilityMemoryFamilyId, "workflow_improvement" | "project_rule" | "unmet_need">
>([
  ["generalized_workflow_lesson", "workflow_improvement"],
  ["generalized_project_rule", "project_rule"],
  ["generalized_unmet_need", "unmet_need"],
]);

for (const [familyId, definition] of Object.entries(
  COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS,
) as Array<[CompatibilityMemoryFamilyId, CompatibilityMemoryFamilyDefinition]>) {
  for (const captureClass of definition.captureClasses ?? []) {
    CAPTURE_CLASS_TO_COMPATIBILITY_MEMORY_FAMILY_ID.set(captureClass, familyId);
  }
}

function resolveCompatibilityMemoryScope(
  familyId: CompatibilityMemoryFamilyId,
  projectId?: string,
): CanonicalMemoryScope {
  const scopeModel = COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS[familyId].scopeModel;
  if (scopeModel === "global") {
    return { kind: "global" };
  }
  if (scopeModel === "project") {
    return projectId ? { kind: "project", projectId } : { kind: "project" };
  }
  return projectId ? { kind: "mixed", projectId } : { kind: "mixed" };
}

function mergeTags(
  defaultTags: readonly string[],
  tags: readonly string[] | undefined,
): readonly string[] {
  return [...new Set([...defaultTags, ...(tags ?? [])])];
}

function buildCompatibility(
  familyId: CompatibilityMemoryFamilyId,
  overrides: Partial<CanonicalMemoryCompatibility> | undefined,
): CanonicalMemoryCompatibility {
  const definition = COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS[familyId];
  return {
    storageKinds: definition.storageKinds,
    ...(definition.captureClasses ? { captureClasses: definition.captureClasses } : {}),
    ...(definition.captureCategory ? { captureCategory: definition.captureCategory } : {}),
    ...(definition.captureSource ? { captureSource: definition.captureSource } : {}),
    ...(definition.phrasePatternProofFamilyId
      ? { phrasePatternProofFamilyId: definition.phrasePatternProofFamilyId }
      : {}),
    ...overrides,
  };
}

function buildApplicability(
  familyId: CompatibilityMemoryFamilyId,
  overrides: CanonicalMemoryApplicability | undefined,
): CanonicalMemoryApplicability {
  const definition = COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS[familyId];
  return {
    promptSections: [definition.promptSection],
    ...(definition.directIntentClasses
      ? { directIntentClasses: definition.directIntentClasses }
      : {}),
    ...(definition.queryClasses ? { queryClasses: definition.queryClasses } : {}),
    ...overrides,
  };
}

export type BuildCanonicalMemoryRecordForCompatibilityFamilyParams = {
  familyId: CompatibilityMemoryFamilyId;
  subject: string;
  statement: string;
  projectId?: string;
  confidence?: CanonicalMemoryConfidence;
  validationStatus?: CanonicalMemoryValidationStatus;
  stability?: CanonicalMemoryStability;
  recency?: CanonicalMemoryRecency;
  provenance?: CanonicalMemoryProvenance;
  tags?: readonly string[];
  facets?: CanonicalMemoryFacetMap;
  applicability?: CanonicalMemoryApplicability;
  compatibility?: Partial<CanonicalMemoryCompatibility>;
};

export function buildCanonicalMemoryRecordForCompatibilityFamily(
  params: BuildCanonicalMemoryRecordForCompatibilityFamilyParams,
): CanonicalMemoryRecord {
  const definition = COMPATIBILITY_MEMORY_FAMILY_DEFINITIONS[params.familyId];
  return createCanonicalMemoryRecord({
    kind: definition.kind,
    subject: params.subject,
    statement: params.statement,
    scope: resolveCompatibilityMemoryScope(params.familyId, params.projectId),
    confidence: params.confidence,
    validationStatus: params.validationStatus,
    stability: params.stability,
    recency: params.recency,
    provenance: params.provenance,
    tags: mergeTags(definition.defaultTags, params.tags),
    facets: mergeCanonicalMemoryFacets(definition.defaultFacets, params.facets),
    applicability: buildApplicability(params.familyId, params.applicability),
    compatibility: buildCompatibility(params.familyId, params.compatibility),
  });
}

export function getCompatibilityMemoryFamilyIdByCaptureClass(
  captureClass: string,
): CompatibilityMemoryFamilyId | null {
  return CAPTURE_CLASS_TO_COMPATIBILITY_MEMORY_FAMILY_ID.get(captureClass) ?? null;
}

export function getCompatibilityMemoryFamilyIdByWorkflowLessonFamily(
  lessonFamily: string,
): Extract<
  CompatibilityMemoryFamilyId,
  "workflow_improvement" | "project_rule" | "unmet_need"
> | null {
  return WORKFLOW_LESSON_FAMILY_TO_COMPATIBILITY_MEMORY_FAMILY_ID.get(lessonFamily) ?? null;
}
