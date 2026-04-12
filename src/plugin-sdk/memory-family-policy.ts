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
} from "./memory-canonical-core.js";
import {
  getMemoryProfile,
  getMemoryProfileByCaptureClass,
  getMemoryProfileIdByWorkflowLessonFamily,
  listMemoryProfiles,
  MEMORY_PROFILE_IDS,
  type MemoryProfileCaptureCategory,
  type MemoryProfileCaptureSource,
  type MemoryProfileDefinition,
  type MemoryProfileId,
  type MemoryProfileRetrievalFeature,
  type MemoryProfileStorageKind,
} from "./memory-profile-registry.js";

/**
 * Compatibility-only family-era projection helpers.
 *
 * Active extension runtime paths should prefer canonical capture metadata,
 * canonical runtime policy views, and direct canonical record builders. This
 * module remains as a public SDK bridge for older family-oriented consumers and
 * narrowly scoped compatibility adapters.
 */

/**
 * @deprecated Compatibility-only family ids. Active runtime code should prefer
 * canonical kinds, capture categories, and runtime policy views.
 */
export const MEMORY_FAMILY_IDS = MEMORY_PROFILE_IDS;

export type MemoryFamilyId = MemoryProfileId;

export const MEMORY_PROOF_INSPECTABLE_FAMILY_IDS = MEMORY_FAMILY_IDS;

export type MemoryProofInspectableFamilyId = (typeof MEMORY_PROOF_INSPECTABLE_FAMILY_IDS)[number];

export const MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS = [
  "workflow_phrase_pattern",
  "response_style_phrase_pattern",
] as const;

export type MemoryPhrasePatternProofFamilyId =
  (typeof MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS)[number];

export const MEMORY_PROOF_FAMILY_IDS = [
  ...MEMORY_FAMILY_IDS,
  ...MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS,
] as const;

export type MemoryProofFamilyId = (typeof MEMORY_PROOF_FAMILY_IDS)[number];

export type MemoryFamilyStorageKind = MemoryProfileStorageKind;

export type MemoryFamilyScopeModel =
  | { kind: "global" }
  | { kind: "project"; projectRequired: boolean }
  | { kind: "mixed_project"; projectPreferred: boolean };

export type MemoryFamilyCanonicalField =
  | "scope"
  | "subject"
  | "value"
  | "recommended_action"
  | "avoid_action"
  | "needed_capability"
  | "guidance_pattern"
  | "procedure_title"
  | "procedure_steps"
  | "rationale";

export type MemoryFamilyLifecycleMode =
  | "bounded_auto_confirm"
  | "clustered_hold_auto_review"
  | "procedure_validation";

export type MemoryFamilyCorrectionMode =
  | "held_correction"
  | "approved_memory_object_supersede_when_targeted"
  | "validated_procedure_supersede_when_targeted";

export type MemoryFamilyCorrectionTargetKind = "approved_memory_object" | "validated_procedure";

export type MemoryFamilyPhraseMode = "unsupported" | "approved_pattern_reviewed";

export type MemoryFamilyRetrievalMode =
  | "approved_hybrid"
  | "validated_procedure_hybrid"
  | "approved_hybrid_with_semantic_gate";

export type MemoryFamilyRetrievalFeature = MemoryProfileRetrievalFeature;

export type MemoryFamilyApplicationMode =
  | "shape_reply"
  | "guidance_only"
  | "recommendation_only"
  | "suggestion_first"
  | "direct_answer";

export type MemoryFamilySemanticRoutingMode =
  | "disabled"
  | "profile_gated_approved_only"
  | "validated_procedure_only";

export type MemoryFamilyProofInspectionMode =
  | "response_style_lifecycle"
  | "project_fact_lifecycle"
  | "recurring_procedure_lifecycle"
  | "workflow_improvement_lifecycle"
  | "workflow_phrase_pattern_lifecycle"
  | "response_style_phrase_pattern_lifecycle";

export type MemoryProofArtifactMode =
  | "approved_memory_object"
  | "phrase_pattern"
  | "validated_procedure";

export type MemoryProofDefinition = {
  id: MemoryProofFamilyId;
  inspectionMode: MemoryFamilyProofInspectionMode;
  artifactMode: MemoryProofArtifactMode;
};

export type MemoryFamilyPhrasePatternProofPolicy = {
  familyId: MemoryPhrasePatternProofFamilyId;
  inspectionMode: Extract<
    MemoryFamilyProofInspectionMode,
    "workflow_phrase_pattern_lifecycle" | "response_style_phrase_pattern_lifecycle"
  >;
};

export type MemoryFamilyCaptureMetadata = {
  category: MemoryProfileCaptureCategory;
  source: MemoryProfileCaptureSource;
  subjectKeyMetadata?: "subject_key";
};

export type MemoryFamilyCanonicalProjection = {
  kind: MemoryProfileDefinition["canonicalKind"];
  defaultTags: readonly string[];
  defaultFacets: CanonicalMemoryFacetMap;
  derivedViews: readonly string[];
  compatibilityStatus: "transitional_family_adapter";
};

export type MemoryLifecyclePolicyView = Pick<
  MemoryFamilyDefinition["lifecyclePolicy"],
  "pendingCandidateStates" | "staleWindowDays"
>;

export type MemoryCorrectionPolicyView = Pick<
  MemoryFamilyDefinition["correctionPolicy"],
  "mode" | "targetKind" | "requiresExistingTarget"
>;

export type MemoryRetrievalPolicyView = Pick<
  MemoryFamilyDefinition["retrievalPolicy"],
  "featureWeights" | "directIntentClass" | "matchedFieldPrefix"
>;

export type MemorySemanticRoutingPolicyView = Pick<
  MemoryFamilyDefinition["semanticRoutingPolicy"],
  "mode"
>;

export type ApprovedMemoryRetrievalPolicyView = Pick<
  MemoryFamilyDefinition,
  "id" | "storageKinds"
> & {
  derivedViews: readonly string[];
  retrievalPolicy: MemoryRetrievalPolicyView;
};

export type MemoryFamilyDefinition = {
  id: MemoryFamilyId;
  displayName: string;
  canonicalProjection: MemoryFamilyCanonicalProjection;
  storageKinds: readonly MemoryFamilyStorageKind[];
  scopeModel: MemoryFamilyScopeModel;
  canonicalFields: readonly MemoryFamilyCanonicalField[];
  lifecyclePolicy: {
    mode: MemoryFamilyLifecycleMode;
    clusterKeyFields: readonly MemoryFamilyCanonicalField[];
    subjectKeyFields: readonly MemoryFamilyCanonicalField[];
    pendingCandidateStates: readonly string[];
    approvalThreshold: number;
    staleWindowDays: number;
  };
  correctionPolicy: {
    mode: MemoryFamilyCorrectionMode;
    targetKind: MemoryFamilyCorrectionTargetKind;
    targetFields: readonly MemoryFamilyCanonicalField[];
    explicitCorrectionRequired: boolean;
    requiresExistingTarget: boolean;
  };
  phrasePolicy: {
    mode: MemoryFamilyPhraseMode;
    sourceStorageKind?: MemoryFamilyStorageKind;
    approvalStorageKind?: MemoryFamilyStorageKind;
  };
  retrievalPolicy: {
    mode: MemoryFamilyRetrievalMode;
    featureWeights: Partial<Record<MemoryFamilyRetrievalFeature, number>>;
    directIntentClass?: "fact" | "rule" | "need" | "procedure" | "style";
    suppressAdjacentFamilies?: boolean;
    matchedFieldPrefix?: string;
  };
  applicationPolicy: {
    mode: MemoryFamilyApplicationMode;
    guidanceOnly: boolean;
    directUseOnlyOnClearAsk: boolean;
    promptSection: "behavior" | "project" | "procedure";
  };
  semanticRoutingPolicy: {
    mode: MemoryFamilySemanticRoutingMode;
    enabledQueryClasses: readonly string[];
  };
  proofPolicy: {
    inspectionMode: MemoryFamilyProofInspectionMode;
    artifactMode: MemoryProofArtifactMode;
    phrasePattern?: MemoryFamilyPhrasePatternProofPolicy;
  };
  captureMetadata?: MemoryFamilyCaptureMetadata;
  captureClasses?: readonly string[];
};

function toScopeModel(scopeModel: MemoryProfileDefinition["scopeModel"]): MemoryFamilyScopeModel {
  switch (scopeModel) {
    case "global":
      return { kind: "global" };
    case "project":
      return { kind: "project", projectRequired: true };
    case "mixed":
      return { kind: "mixed_project", projectPreferred: true };
  }
}

function toCaptureMetadata(
  profile: MemoryProfileDefinition,
): MemoryFamilyCaptureMetadata | undefined {
  if (!profile.capture) {
    return undefined;
  }
  return {
    category: profile.capture.category,
    source: profile.capture.source,
    ...(profile.capture.subjectKeyMetadata
      ? { subjectKeyMetadata: profile.capture.subjectKeyMetadata }
      : {}),
  };
}

function toFamilyDefinition(profile: MemoryProfileDefinition): MemoryFamilyDefinition {
  return {
    id: profile.id,
    displayName: profile.displayName,
    canonicalProjection: {
      kind: profile.canonicalKind,
      defaultTags: profile.defaultTags,
      defaultFacets: profile.defaultFacets,
      derivedViews: profile.derivedViews,
      compatibilityStatus: "transitional_family_adapter",
    },
    storageKinds: profile.storageKinds,
    scopeModel: toScopeModel(profile.scopeModel),
    canonicalFields: profile.canonicalFields,
    lifecyclePolicy: { ...profile.lifecycle },
    correctionPolicy: { ...profile.correction },
    phrasePolicy: { ...profile.phrase },
    retrievalPolicy: { ...profile.retrieval },
    applicationPolicy: { ...profile.application },
    semanticRoutingPolicy: { ...profile.semanticRouting },
    proofPolicy: {
      inspectionMode: profile.proof.inspectionMode,
      artifactMode: profile.proof.artifactMode,
      ...(profile.proof.phrasePattern
        ? {
            phrasePattern: {
              familyId: profile.proof.phrasePattern.familyId,
              inspectionMode: profile.proof.phrasePattern.inspectionMode,
            },
          }
        : {}),
    },
    ...(toCaptureMetadata(profile) ? { captureMetadata: toCaptureMetadata(profile) } : {}),
    ...(profile.capture ? { captureClasses: profile.capture.captureClasses } : {}),
  };
}

function buildApprovedMemoryRetrievalPolicyView(
  profile: MemoryProfileDefinition,
): ApprovedMemoryRetrievalPolicyView | null {
  if (
    !profile.storageKinds.includes("memory_object") ||
    profile.id === "recurring_procedure" ||
    Object.keys(profile.retrieval.featureWeights).length === 0
  ) {
    return null;
  }
  return {
    id: profile.id,
    storageKinds: profile.storageKinds,
    derivedViews: profile.derivedViews,
    retrievalPolicy: {
      featureWeights: profile.retrieval.featureWeights,
      ...(profile.retrieval.directIntentClass
        ? { directIntentClass: profile.retrieval.directIntentClass }
        : {}),
      ...(profile.retrieval.matchedFieldPrefix
        ? { matchedFieldPrefix: profile.retrieval.matchedFieldPrefix }
        : {}),
    },
  };
}

function getPhrasePatternProofDefinition(
  familyId: MemoryPhrasePatternProofFamilyId,
): MemoryProofDefinition | null {
  for (const profile of listMemoryProfiles()) {
    if (profile.proof.phrasePattern?.familyId === familyId) {
      return {
        id: familyId,
        inspectionMode: profile.proof.phrasePattern.inspectionMode,
        artifactMode: "phrase_pattern",
      };
    }
  }
  return null;
}

/**
 * @deprecated Compatibility-only family listing. Prefer targeted runtime policy
 * views or canonical metadata in active code.
 */
export function listMemoryFamilyDefinitions(): MemoryFamilyDefinition[] {
  return listMemoryProfiles().map(toFamilyDefinition);
}

/**
 * @deprecated Compatibility-only family lookup. Prefer canonical capture
 * metadata or canonical runtime policy views in active runtime code.
 */
export function getMemoryFamilyDefinition(familyId: MemoryFamilyId): MemoryFamilyDefinition {
  return toFamilyDefinition(getMemoryProfile(familyId));
}

/**
 * @deprecated Compatibility-only family projection lookup. Prefer canonical
 * record metadata in active runtime code.
 */
export function getMemoryFamilyCanonicalProjection(
  familyId: MemoryFamilyId,
): MemoryFamilyCanonicalProjection {
  return getMemoryFamilyDefinition(familyId).canonicalProjection;
}

export function getMemoryLifecyclePolicyView(familyId: MemoryFamilyId): MemoryLifecyclePolicyView {
  const profile = getMemoryProfile(familyId);
  return {
    pendingCandidateStates: profile.lifecycle.pendingCandidateStates,
    staleWindowDays: profile.lifecycle.staleWindowDays,
  };
}

export function getMemoryCorrectionPolicyView(
  familyId: MemoryFamilyId,
): MemoryCorrectionPolicyView {
  const profile = getMemoryProfile(familyId);
  return {
    mode: profile.correction.mode,
    targetKind: profile.correction.targetKind,
    requiresExistingTarget: profile.correction.requiresExistingTarget,
  };
}

export function getMemoryRetrievalPolicyView(familyId: MemoryFamilyId): MemoryRetrievalPolicyView {
  const profile = getMemoryProfile(familyId);
  return {
    featureWeights: profile.retrieval.featureWeights,
    ...(profile.retrieval.directIntentClass
      ? { directIntentClass: profile.retrieval.directIntentClass }
      : {}),
    ...(profile.retrieval.matchedFieldPrefix
      ? { matchedFieldPrefix: profile.retrieval.matchedFieldPrefix }
      : {}),
  };
}

export function getMemorySemanticRoutingPolicyView(
  familyId: MemoryFamilyId,
): MemorySemanticRoutingPolicyView {
  return {
    mode: getMemoryProfile(familyId).semanticRouting.mode,
  };
}

export function listApprovedMemoryRetrievalPolicyViews(): ApprovedMemoryRetrievalPolicyView[] {
  return listMemoryProfiles()
    .map(buildApprovedMemoryRetrievalPolicyView)
    .filter((view): view is ApprovedMemoryRetrievalPolicyView => Boolean(view));
}

export function memoryFamilyProjectsToDerivedView(
  familyId: MemoryFamilyId,
  derivedView: string,
): boolean {
  return getMemoryFamilyCanonicalProjection(familyId).derivedViews.includes(derivedView);
}

/**
 * @deprecated Compatibility-only capture-class lookup. Prefer canonical capture
 * metadata in active runtime code.
 */
export function getMemoryFamilyDefinitionByCaptureClass(
  captureClass: string,
): MemoryFamilyDefinition | null {
  const profile = getMemoryProfileByCaptureClass(captureClass);
  return profile ? getMemoryFamilyDefinition(profile.id) : null;
}

/**
 * @deprecated Compatibility-only workflow-lesson lookup. Prefer canonical
 * workflow capture category resolution in active runtime code.
 */
export function getMemoryFamilyIdByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryFamilyId | null {
  return getMemoryProfileIdByWorkflowLessonFamily(lessonFamily);
}

export function isMemoryProofInspectableFamily(
  value: string,
): value is MemoryProofInspectableFamilyId {
  return MEMORY_PROOF_INSPECTABLE_FAMILY_IDS.includes(value as MemoryProofInspectableFamilyId);
}

export function isMemoryProofFamily(value: string): value is MemoryProofFamilyId {
  return MEMORY_PROOF_FAMILY_IDS.includes(value as MemoryProofFamilyId);
}

export function getMemoryProofDefinition(familyId: MemoryProofFamilyId): MemoryProofDefinition {
  if (MEMORY_FAMILY_IDS.includes(familyId as MemoryFamilyId)) {
    const definition = getMemoryFamilyDefinition(familyId as MemoryFamilyId);
    return {
      id: familyId,
      inspectionMode: definition.proofPolicy.inspectionMode,
      artifactMode: definition.proofPolicy.artifactMode,
    };
  }
  const phrasePatternDefinition = getPhrasePatternProofDefinition(
    familyId as MemoryPhrasePatternProofFamilyId,
  );
  if (!phrasePatternDefinition) {
    throw new Error(`unknown proof family ${familyId}`);
  }
  return phrasePatternDefinition;
}

export function getPhrasePatternProofFamilyId(
  familyId: MemoryFamilyId,
): MemoryPhrasePatternProofFamilyId | null {
  return getMemoryFamilyDefinition(familyId).proofPolicy.phrasePattern?.familyId ?? null;
}

export function supportsMemoryFamilyReviewedPhrasePatterns(familyId: MemoryFamilyId): boolean {
  return getMemoryFamilyDefinition(familyId).phrasePolicy.mode === "approved_pattern_reviewed";
}

export function getCaptureMetadataByCaptureClass(
  captureClass: string,
): MemoryFamilyCaptureMetadata | null {
  const profile = getMemoryProfileByCaptureClass(captureClass);
  return profile ? (toCaptureMetadata(profile) ?? null) : null;
}

export function getCaptureMetadataByWorkflowLessonFamily(
  lessonFamily: string,
): MemoryFamilyCaptureMetadata | null {
  const workflowProfileId = getMemoryProfileIdByWorkflowLessonFamily(lessonFamily);
  return workflowProfileId
    ? (toCaptureMetadata(getMemoryProfile(workflowProfileId)) ?? null)
    : null;
}

function resolveCanonicalScope(
  definition: MemoryFamilyDefinition,
  projectId?: string,
): CanonicalMemoryScope {
  switch (definition.scopeModel.kind) {
    case "global":
      return { kind: "global" };
    case "project":
      return projectId ? { kind: "project", projectId } : { kind: "project" };
    case "mixed_project":
      return projectId ? { kind: "mixed", projectId } : { kind: "mixed" };
  }
}

function mergeCanonicalTags(
  defaultTags: readonly string[],
  tags: readonly string[] | undefined,
): readonly string[] {
  return [...new Set([...defaultTags, ...(tags ?? [])])];
}

function buildCanonicalCompatibility(
  definition: MemoryFamilyDefinition,
  overrides: Partial<CanonicalMemoryCompatibility> | undefined,
): CanonicalMemoryCompatibility {
  return {
    storageKinds: definition.storageKinds,
    captureClasses: definition.captureClasses,
    captureCategory: definition.captureMetadata?.category,
    captureSource: definition.captureMetadata?.source,
    phrasePatternProofFamilyId: definition.proofPolicy.phrasePattern?.familyId,
    ...overrides,
  };
}

function buildCanonicalApplicability(
  definition: MemoryFamilyDefinition,
  overrides: CanonicalMemoryApplicability | undefined,
): CanonicalMemoryApplicability {
  return {
    promptSections: [definition.applicationPolicy.promptSection],
    ...(definition.retrievalPolicy.directIntentClass
      ? { directIntentClasses: [definition.retrievalPolicy.directIntentClass] }
      : {}),
    ...(definition.semanticRoutingPolicy.enabledQueryClasses.length > 0
      ? { queryClasses: definition.semanticRoutingPolicy.enabledQueryClasses }
      : {}),
    ...overrides,
  };
}

export type BuildCanonicalMemoryRecordForFamilyParams = {
  familyId: MemoryFamilyId;
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

/**
 * @deprecated Compatibility-only family projection builder. Prefer
 * `createCanonicalMemoryRecord` plus canonical capture metadata in new code.
 */
export function buildCanonicalMemoryRecordForFamily(
  params: BuildCanonicalMemoryRecordForFamilyParams,
): CanonicalMemoryRecord {
  const definition = getMemoryFamilyDefinition(params.familyId);
  return createCanonicalMemoryRecord({
    kind: definition.canonicalProjection.kind,
    subject: params.subject,
    statement: params.statement,
    scope: resolveCanonicalScope(definition, params.projectId),
    confidence: params.confidence,
    validationStatus: params.validationStatus,
    stability: params.stability,
    recency: params.recency,
    provenance: params.provenance,
    tags: mergeCanonicalTags(definition.canonicalProjection.defaultTags, params.tags),
    facets: mergeCanonicalMemoryFacets(definition.canonicalProjection.defaultFacets, params.facets),
    applicability: buildCanonicalApplicability(definition, params.applicability),
    compatibility: buildCanonicalCompatibility(definition, params.compatibility),
  });
}
