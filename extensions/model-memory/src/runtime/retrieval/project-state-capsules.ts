import {
  aggregateDerivedSourceMetadata,
  buildDerivedArtifactId,
  cloneJsonLike,
  getDerivedArtifactRolePolicy,
  isDerivedArtifactGenerationContextAuthority,
  uniqueSortedStrings,
  type DerivedArtifactFreshness,
  type DerivedArtifactRolePolicy,
  type DerivedArtifactSourceRef,
  type JsonLike,
} from "../../derived-artifact.ts";
import type {
  ProjectStateCapsule,
  ProjectStateCapsuleSection,
  ProjectStateCapsuleSectionType,
} from "../../project-state-capsule.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import type { RetrievalPlan } from "./types.ts";

export const PROJECT_STATE_CAPSULE_CANDIDATE_SCHEMA_VERSION =
  "project_state_capsule_candidate.v1" as const;
export const PROJECT_STATE_CAPSULE_SHADOW_PACK_SCHEMA_VERSION =
  "project_state_capsule_shadow_pack.v1" as const;
export const PROJECT_STATE_CAPSULE_SHADOW_TELEMETRY_SCHEMA_VERSION =
  "project_state_capsule_shadow_telemetry.v1" as const;

export type ProjectStateCapsuleSelectionReasonCode =
  | "shadow_mode_enabled"
  | "project_scope_exact"
  | "project_scope_broad"
  | "retrieval_plan_project_corpus"
  | "retrieval_plan_project_state_pack"
  | "project_state_generation_context_candidate";

export type ProjectStateCapsuleExclusionReason =
  | "shadow_disabled"
  | "scope_mismatch"
  | "stale"
  | "conflicted"
  | "inspection_only"
  | "no_source_memory_ids"
  | "not_generation_context_authority";

export type ProjectStateCapsuleCandidate = {
  schemaVersion: typeof PROJECT_STATE_CAPSULE_CANDIDATE_SCHEMA_VERSION;
  candidateId: string;
  shadow: true;
  selected: true;
  capsuleId: string;
  capsuleType: "project_state";
  projectId: string;
  scopeKey: string;
  sourceMemoryIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  contentHash: string;
  freshness: DerivedArtifactFreshness;
  staleMarkers: string[];
  conflictMarkers: string[];
  graphNodeIds: string[];
  graphEdgeIds: string[];
  selectionReasonCodes: ProjectStateCapsuleSelectionReasonCode[];
  rolePolicy: DerivedArtifactRolePolicy;
};

export type ProjectStateCapsuleExclusion = {
  capsuleId: string;
  capsuleType: "project_state";
  projectId: string;
  reason: ProjectStateCapsuleExclusionReason;
  detail?: string;
};

export type ProjectStateCapsuleShadowTelemetry = {
  schemaVersion: typeof PROJECT_STATE_CAPSULE_SHADOW_TELEMETRY_SCHEMA_VERSION;
  mode: "disabled" | "shadow_report_only";
  wouldSelectCapsuleIds: string[];
  excludedCapsuleIds: string[];
  exclusionReasons: Record<ProjectStateCapsuleExclusionReason, number>;
  capsuleSourceMemoryIds: string[];
  capsuleContentHashes: string[];
  projectPageBypassed: boolean;
  projectPageBypassReason?: "project_state_capsule_available";
  defaultContextInjectionChanged: false;
};

export type ProjectStateCapsuleShadowSelectionResult = {
  candidates: ProjectStateCapsuleCandidate[];
  exclusions: ProjectStateCapsuleExclusion[];
  telemetry: ProjectStateCapsuleShadowTelemetry;
};

export type ProjectStateCapsuleShadowPackItem = {
  itemId: string;
  sectionType: ProjectStateCapsuleSectionType;
  text: string;
  sourceMemoryIds: string[];
  authorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
};

export type ProjectStateCapsuleShadowPackSection = {
  sectionId: string;
  sectionType: ProjectStateCapsuleSectionType;
  title: string;
  itemCount: number;
  sourceMemoryIds: string[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  items: ProjectStateCapsuleShadowPackItem[];
};

export type ProjectStateCapsuleShadowPack = {
  schemaVersion: typeof PROJECT_STATE_CAPSULE_SHADOW_PACK_SCHEMA_VERSION;
  packId: string;
  shadow: true;
  injected: false;
  packType: "project_state_pack";
  capsuleId: string;
  capsuleType: "project_state";
  projectId: string;
  contentHash: string;
  sourceMemoryIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  freshness: DerivedArtifactFreshness;
  staleMarkers: string[];
  conflictMarkers: string[];
  graphNodeIds: string[];
  graphEdgeIds: string[];
  sections: ProjectStateCapsuleShadowPackSection[];
  estimatedTokens: number;
};

export type ProjectStateCapsuleRetrievalShadowResult = ProjectStateCapsuleShadowSelectionResult & {
  packs: ProjectStateCapsuleShadowPack[];
};

function readProjectId(scope: Record<string, unknown> | undefined): string | undefined {
  const projectId = scope?.projectId ?? scope?.project_id;
  return typeof projectId === "string" && projectId.trim().length > 0
    ? projectId.trim()
    : undefined;
}

function targetProjectId(input: {
  projectId?: string;
  requestScope?: Record<string, unknown>;
  retrievalPlan?: RetrievalPlan;
}): string | undefined {
  return (
    input.projectId ??
    readProjectId(input.requestScope) ??
    input.retrievalPlan?.queries
      .map((query) => readProjectId(query.filters))
      .find((value): value is string => Boolean(value))
  );
}

function isProjectPlan(retrievalPlan: RetrievalPlan | undefined): boolean {
  return Boolean(
    retrievalPlan?.corpora.includes("project") ||
    retrievalPlan?.packTypes.includes("project_state_pack"),
  );
}

function reasonCodes(input: {
  projectId?: string;
  capsule: ProjectStateCapsule;
  retrievalPlan?: RetrievalPlan;
}): ProjectStateCapsuleSelectionReasonCode[] {
  const reasons: ProjectStateCapsuleSelectionReasonCode[] = [
    "shadow_mode_enabled",
    "project_state_generation_context_candidate",
  ];
  if (input.projectId && input.projectId === input.capsule.projectId) {
    reasons.push("project_scope_exact");
  } else {
    reasons.push("project_scope_broad");
  }
  if (input.retrievalPlan?.corpora.includes("project")) {
    reasons.push("retrieval_plan_project_corpus");
  }
  if (input.retrievalPlan?.packTypes.includes("project_state_pack")) {
    reasons.push("retrieval_plan_project_state_pack");
  }
  return [...new Set(reasons)].toSorted();
}

function exclusionReason(input: {
  capsule: ProjectStateCapsule;
  projectId?: string;
  retrievalPlan?: RetrievalPlan;
  includeConflictAware: boolean;
  includeInspection: boolean;
}): ProjectStateCapsuleExclusionReason | undefined {
  if (input.projectId && input.projectId !== input.capsule.projectId) {
    return "scope_mismatch";
  }
  if (!input.projectId && !isProjectPlan(input.retrievalPlan)) {
    return "scope_mismatch";
  }
  if (
    !isDerivedArtifactGenerationContextAuthority({
      family: "capsule",
      artifactType: input.capsule.capsuleType,
    })
  ) {
    return "not_generation_context_authority";
  }
  if (input.capsule.digest.sourceMemoryIds.length === 0) {
    return "no_source_memory_ids";
  }
  if (input.capsule.digest.freshness.status === "stale") {
    return "stale";
  }
  if (input.capsule.digest.conflictMarkers.length > 0 && !input.includeConflictAware) {
    return "conflicted";
  }
  if (input.capsule.digest.authorityTiers.includes("inspection_only") && !input.includeInspection) {
    return "inspection_only";
  }
  return undefined;
}

function cloneCapsule(capsule: ProjectStateCapsule): ProjectStateCapsule {
  return cloneJsonLike(capsule as unknown as JsonLike) as unknown as ProjectStateCapsule;
}

function candidateFromCapsule(input: {
  capsule: ProjectStateCapsule;
  projectId?: string;
  retrievalPlan?: RetrievalPlan;
}): ProjectStateCapsuleCandidate {
  const capsule = cloneCapsule(input.capsule);
  return {
    schemaVersion: PROJECT_STATE_CAPSULE_CANDIDATE_SCHEMA_VERSION,
    candidateId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "project_state_capsule_candidate",
      targetId: capsule.capsuleId,
      scopeKey: capsule.scopeKey,
      seed: capsule.contentHash,
    }),
    shadow: true,
    selected: true,
    capsuleId: capsule.capsuleId,
    capsuleType: "project_state",
    projectId: capsule.projectId,
    scopeKey: capsule.scopeKey,
    sourceMemoryIds: [...capsule.digest.sourceMemoryIds],
    sourceRefs: capsule.digest.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
    authorityTiers: [...capsule.digest.authorityTiers],
    sourceProfileIds: [...capsule.digest.sourceProfileIds],
    contentHash: capsule.contentHash,
    freshness: { ...capsule.digest.freshness },
    staleMarkers:
      capsule.digest.freshness.status === "stale"
        ? capsule.digest.conflictMarkers.filter((marker) => marker.startsWith("stale:"))
        : [],
    conflictMarkers: [...capsule.digest.conflictMarkers],
    graphNodeIds: [...capsule.digest.graphNodeIds],
    graphEdgeIds: [...capsule.digest.graphEdgeIds],
    selectionReasonCodes: reasonCodes({
      projectId: input.projectId,
      capsule,
      retrievalPlan: input.retrievalPlan,
    }),
    rolePolicy: getDerivedArtifactRolePolicy({
      family: "capsule",
      artifactType: "project_state",
    }),
  };
}

function exclusionCounts(
  exclusions: ProjectStateCapsuleExclusion[],
): Record<ProjectStateCapsuleExclusionReason, number> {
  return {
    shadow_disabled: exclusions.filter((entry) => entry.reason === "shadow_disabled").length,
    scope_mismatch: exclusions.filter((entry) => entry.reason === "scope_mismatch").length,
    stale: exclusions.filter((entry) => entry.reason === "stale").length,
    conflicted: exclusions.filter((entry) => entry.reason === "conflicted").length,
    inspection_only: exclusions.filter((entry) => entry.reason === "inspection_only").length,
    no_source_memory_ids: exclusions.filter((entry) => entry.reason === "no_source_memory_ids")
      .length,
    not_generation_context_authority: exclusions.filter(
      (entry) => entry.reason === "not_generation_context_authority",
    ).length,
  };
}

function telemetry(input: {
  mode: ProjectStateCapsuleShadowTelemetry["mode"];
  candidates: ProjectStateCapsuleCandidate[];
  exclusions: ProjectStateCapsuleExclusion[];
  projectPageProjectionAvailable: boolean;
}): ProjectStateCapsuleShadowTelemetry {
  const projectPageBypassed =
    input.projectPageProjectionAvailable &&
    input.candidates.length > 0 &&
    !isDerivedArtifactGenerationContextAuthority({
      family: "projection",
      artifactType: "project_page",
      richerCapsuleAvailable: true,
    });
  return {
    schemaVersion: PROJECT_STATE_CAPSULE_SHADOW_TELEMETRY_SCHEMA_VERSION,
    mode: input.mode,
    wouldSelectCapsuleIds: input.candidates.map((candidate) => candidate.capsuleId).toSorted(),
    excludedCapsuleIds: input.exclusions.map((exclusion) => exclusion.capsuleId).toSorted(),
    exclusionReasons: exclusionCounts(input.exclusions),
    capsuleSourceMemoryIds: uniqueSortedStrings(
      input.candidates.flatMap((candidate) => candidate.sourceMemoryIds),
    ),
    capsuleContentHashes: uniqueSortedStrings(
      input.candidates.map((candidate) => candidate.contentHash),
    ),
    projectPageBypassed,
    ...(projectPageBypassed ? { projectPageBypassReason: "project_state_capsule_available" } : {}),
    defaultContextInjectionChanged: false,
  };
}

export function selectProjectStateCapsuleCandidates(input: {
  retrievalPlan?: RetrievalPlan;
  capsules: ProjectStateCapsule[];
  requestScope?: Record<string, unknown>;
  projectId?: string;
  shadowModeEnabled?: boolean;
  includeConflictAware?: boolean;
  includeInspection?: boolean;
  projectPageProjectionAvailable?: boolean;
}): ProjectStateCapsuleShadowSelectionResult {
  const projectId = targetProjectId(input);
  const sortedCapsules = input.capsules.toSorted((left, right) =>
    left.capsuleId.localeCompare(right.capsuleId),
  );
  if (!input.shadowModeEnabled) {
    const exclusions = sortedCapsules.map((capsule) => ({
      capsuleId: capsule.capsuleId,
      capsuleType: "project_state" as const,
      projectId: capsule.projectId,
      reason: "shadow_disabled" as const,
    }));
    return {
      candidates: [],
      exclusions,
      telemetry: telemetry({
        mode: "disabled",
        candidates: [],
        exclusions,
        projectPageProjectionAvailable: input.projectPageProjectionAvailable ?? false,
      }),
    };
  }

  const candidates: ProjectStateCapsuleCandidate[] = [];
  const exclusions: ProjectStateCapsuleExclusion[] = [];
  for (const capsule of sortedCapsules) {
    const reason = exclusionReason({
      capsule,
      projectId,
      retrievalPlan: input.retrievalPlan,
      includeConflictAware: input.includeConflictAware ?? false,
      includeInspection: input.includeInspection ?? false,
    });
    if (reason) {
      exclusions.push({
        capsuleId: capsule.capsuleId,
        capsuleType: "project_state",
        projectId: capsule.projectId,
        reason,
      });
      continue;
    }
    candidates.push(
      candidateFromCapsule({ capsule, projectId, retrievalPlan: input.retrievalPlan }),
    );
  }

  return {
    candidates,
    exclusions,
    telemetry: telemetry({
      mode: "shadow_report_only",
      candidates,
      exclusions,
      projectPageProjectionAvailable: input.projectPageProjectionAvailable ?? false,
    }),
  };
}

function boundedText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function sectionToShadowPackSection(input: {
  section: ProjectStateCapsuleSection;
  maxItemsPerSection: number;
  maxItemTextLength: number;
}): ProjectStateCapsuleShadowPackSection | undefined {
  if (input.section.items.length === 0) {
    return undefined;
  }
  const sourceMetadata = aggregateDerivedSourceMetadata(input.section.items);
  return {
    sectionId: input.section.sectionId,
    sectionType: input.section.sectionType,
    title: input.section.title,
    itemCount: input.section.items.length,
    sourceMemoryIds: [...input.section.sourceMemoryIds],
    authorityTiers: sourceMetadata.authorityTiers,
    sourceProfileIds: sourceMetadata.sourceProfileIds,
    items: input.section.items.slice(0, input.maxItemsPerSection).map((item) => ({
      itemId: item.itemId,
      sectionType: item.sectionType,
      text: boundedText(item.text, input.maxItemTextLength),
      sourceMemoryIds: [...item.sourceMemoryIds],
      authorityTier: item.authorityTier,
      sourceProfileId: item.sourceProfileId,
    })),
  };
}

export function buildProjectStateCapsuleShadowPacks(input: {
  candidates: ProjectStateCapsuleCandidate[];
  capsules: ProjectStateCapsule[];
  maxItemsPerSection?: number;
  maxItemTextLength?: number;
}): ProjectStateCapsuleShadowPack[] {
  const capsuleById = new Map(input.capsules.map((capsule) => [capsule.capsuleId, capsule]));
  return input.candidates
    .toSorted((left, right) => left.capsuleId.localeCompare(right.capsuleId))
    .flatMap((candidate) => {
      const capsule = capsuleById.get(candidate.capsuleId);
      if (!capsule) {
        return [];
      }
      const clonedCapsule = cloneCapsule(capsule);
      const sections = clonedCapsule.sections
        .map((section) =>
          sectionToShadowPackSection({
            section,
            maxItemsPerSection: input.maxItemsPerSection ?? 5,
            maxItemTextLength: input.maxItemTextLength ?? 240,
          }),
        )
        .filter((section): section is ProjectStateCapsuleShadowPackSection => Boolean(section));
      return [
        {
          schemaVersion: PROJECT_STATE_CAPSULE_SHADOW_PACK_SCHEMA_VERSION,
          packId: buildDerivedArtifactId({
            family: "retrieval_pack",
            artifactType: "project_state_capsule_shadow_pack",
            targetId: candidate.capsuleId,
            scopeKey: candidate.scopeKey,
            seed: candidate.contentHash,
          }),
          shadow: true,
          injected: false,
          packType: "project_state_pack",
          capsuleId: candidate.capsuleId,
          capsuleType: "project_state",
          projectId: candidate.projectId,
          contentHash: candidate.contentHash,
          sourceMemoryIds: [...candidate.sourceMemoryIds],
          sourceRefs: candidate.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
          authorityTiers: [...candidate.authorityTiers],
          sourceProfileIds: [...candidate.sourceProfileIds],
          freshness: { ...candidate.freshness },
          staleMarkers: [...candidate.staleMarkers],
          conflictMarkers: [...candidate.conflictMarkers],
          graphNodeIds: [...candidate.graphNodeIds],
          graphEdgeIds: [...candidate.graphEdgeIds],
          sections,
          estimatedTokens: sections.reduce(
            (sum, section) =>
              sum +
              section.items.reduce((itemSum, item) => itemSum + item.text.split(/\s+/).length, 0),
            0,
          ),
        },
      ];
    });
}

export function buildProjectStateCapsuleRetrievalShadow(input: {
  retrievalPlan?: RetrievalPlan;
  capsules: ProjectStateCapsule[];
  requestScope?: Record<string, unknown>;
  projectId?: string;
  shadowModeEnabled?: boolean;
  includeConflictAware?: boolean;
  includeInspection?: boolean;
  projectPageProjectionAvailable?: boolean;
}): ProjectStateCapsuleRetrievalShadowResult {
  const selection = selectProjectStateCapsuleCandidates(input);
  return {
    ...selection,
    packs: buildProjectStateCapsuleShadowPacks({
      candidates: selection.candidates,
      capsules: input.capsules,
    }),
  };
}
