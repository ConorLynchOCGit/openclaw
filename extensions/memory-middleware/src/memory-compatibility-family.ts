import {
  createCanonicalMemoryRecord,
  mergeCanonicalMemoryFacets,
  type CanonicalMemoryApplicability,
  type CanonicalMemoryCompatibility,
  type CanonicalMemoryConfidence,
  type CanonicalMemoryFacetMap,
  type CanonicalMemoryProvenance,
  type CanonicalMemoryRecord,
  type CanonicalMemoryRecency,
  type CanonicalMemoryScope,
  type CanonicalMemoryStability,
  type CanonicalMemoryValidationStatus,
} from "openclaw/plugin-sdk/memory-canonical-core";
import {
  getMemoryProfile,
  getMemoryProfileByCaptureClass,
  getMemoryProfileIdByWorkflowLessonFamily,
  MEMORY_PROFILE_IDS,
  type MemoryProfileId,
} from "openclaw/plugin-sdk/memory-profile-registry";

export const COMPATIBILITY_MEMORY_FAMILY_IDS = MEMORY_PROFILE_IDS;

export type CompatibilityMemoryFamilyId = MemoryProfileId;

function resolveCompatibilityMemoryScope(
  familyId: CompatibilityMemoryFamilyId,
  projectId?: string,
): CanonicalMemoryScope {
  const scopeModel = getMemoryProfile(familyId).scopeModel;
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
  const profile = getMemoryProfile(familyId);
  return {
    storageKinds: profile.storageKinds,
    ...(profile.capture ? { captureClasses: profile.capture.captureClasses } : {}),
    ...(profile.capture ? { captureCategory: profile.capture.category } : {}),
    ...(profile.capture ? { captureSource: profile.capture.source } : {}),
    ...(profile.proof.phrasePattern
      ? { phrasePatternProofFamilyId: profile.proof.phrasePattern.familyId }
      : {}),
    ...overrides,
  };
}

function buildApplicability(
  familyId: CompatibilityMemoryFamilyId,
  overrides: CanonicalMemoryApplicability | undefined,
): CanonicalMemoryApplicability {
  const profile = getMemoryProfile(familyId);
  return {
    promptSections: [profile.application.promptSection],
    ...(profile.retrieval.directIntentClass
      ? { directIntentClasses: [profile.retrieval.directIntentClass] }
      : {}),
    ...(profile.semanticRouting.enabledQueryClasses.length > 0
      ? { queryClasses: profile.semanticRouting.enabledQueryClasses }
      : {}),
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
  const profile = getMemoryProfile(params.familyId);
  return createCanonicalMemoryRecord({
    kind: profile.canonicalKind,
    subject: params.subject,
    statement: params.statement,
    scope: resolveCompatibilityMemoryScope(params.familyId, params.projectId),
    confidence: params.confidence,
    validationStatus: params.validationStatus,
    stability: params.stability,
    recency: params.recency,
    provenance: params.provenance,
    tags: mergeTags(profile.defaultTags, params.tags),
    facets: mergeCanonicalMemoryFacets(profile.defaultFacets, params.facets),
    applicability: buildApplicability(params.familyId, params.applicability),
    compatibility: buildCompatibility(params.familyId, params.compatibility),
  });
}

export function getCompatibilityMemoryFamilyIdByCaptureClass(
  captureClass: string,
): CompatibilityMemoryFamilyId | null {
  return getMemoryProfileByCaptureClass(captureClass)?.id ?? null;
}

export function getCompatibilityMemoryFamilyIdByWorkflowLessonFamily(
  lessonFamily: string,
): Extract<
  CompatibilityMemoryFamilyId,
  "workflow_improvement" | "project_rule" | "unmet_need"
> | null {
  return getMemoryProfileIdByWorkflowLessonFamily(lessonFamily);
}
