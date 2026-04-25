import {
  buildDerivedArtifactId,
  cloneJsonLike,
  type DerivedArtifactFreshness,
  type DerivedArtifactSourceRef,
  type JsonLike,
} from "../../derived-artifact.ts";
import { countRuntimeTokens } from "../../runtime-read-models.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import type {
  ProjectStateCapsuleRetrievalShadowResult,
  ProjectStateCapsuleShadowPack,
  ProjectStateCapsuleShadowPackItem,
  ProjectStateCapsuleShadowPackSection,
} from "../retrieval/project-state-capsules.ts";

export const PROJECT_STATE_CAPSULE_CONTEXT_SCHEMA_VERSION =
  "project_state_capsule_context.v1" as const;
export const PROJECT_STATE_CAPSULE_CONTEXT_TELEMETRY_SCHEMA_VERSION =
  "project_state_capsule_context_telemetry.v1" as const;

export type ProjectStateCapsuleContextMode =
  | "disabled"
  | "shadow_report_only"
  | "explicit_injection";

export type ProjectStateCapsuleContextExclusionReason =
  | "disabled"
  | "shadow_only"
  | "hard_reject"
  | "stale"
  | "conflicted"
  | "inspection_only"
  | "empty_sections"
  | "missing_pack_provenance";

export type ProjectStateCapsuleContextItem = {
  itemId: string;
  sectionType: ProjectStateCapsuleShadowPackItem["sectionType"];
  text: string;
  sourceMemoryIds: string[];
  authorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  authorityLabel: "authoritative" | "lower_authority" | "unknown";
};

export type ProjectStateCapsuleContextSection = {
  sectionId: string;
  sectionType: ProjectStateCapsuleShadowPackSection["sectionType"];
  title: string;
  sourceMemoryIds: string[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  items: ProjectStateCapsuleContextItem[];
};

export type ProjectStateCapsuleContextBlock = {
  schemaVersion: typeof PROJECT_STATE_CAPSULE_CONTEXT_SCHEMA_VERSION;
  contextBlockId: string;
  injected: true;
  capsuleId: string;
  capsuleType: "project_state";
  projectId: string;
  packId: string;
  contentHash: string;
  sourceMemoryIds: string[];
  sourceRefs: DerivedArtifactSourceRef[];
  authorityTiers: SourceAuthorityTier[];
  sourceProfileIds: SourceProfileId[];
  freshness: DerivedArtifactFreshness;
  staleMarkers: string[];
  conflictMarkers: string[];
  selectedSectionIds: string[];
  selectedSectionTypes: ProjectStateCapsuleShadowPackSection["sectionType"][];
  estimatedTokens: number;
  renderedText: string;
};

export type ProjectStateCapsuleContextExclusion = {
  capsuleId: string;
  packId?: string;
  reason: ProjectStateCapsuleContextExclusionReason;
};

export type ProjectStateCapsuleContextTelemetry = {
  schemaVersion: typeof PROJECT_STATE_CAPSULE_CONTEXT_TELEMETRY_SCHEMA_VERSION;
  mode: ProjectStateCapsuleContextMode;
  enabled: boolean;
  defaultContextInjectionChanged: false;
  injected: boolean;
  selectedCapsuleIds: string[];
  injectedPackIds: string[];
  skippedCapsuleIds: string[];
  skippedReasons: Record<ProjectStateCapsuleContextExclusionReason, number>;
  sourceMemoryIds: string[];
  contentHashes: string[];
  estimatedTokens: number;
  projectPageBypassed: boolean;
  projectPageBypassReason?: "project_state_capsule_explicit_context";
};

export type ProjectStateCapsuleContextResult = {
  mode: ProjectStateCapsuleContextMode;
  blocks: ProjectStateCapsuleContextBlock[];
  exclusions: ProjectStateCapsuleContextExclusion[];
  telemetry: ProjectStateCapsuleContextTelemetry;
  renderedText?: string;
};

function clonePack(pack: ProjectStateCapsuleShadowPack): ProjectStateCapsuleShadowPack {
  return cloneJsonLike(pack as unknown as JsonLike) as unknown as ProjectStateCapsuleShadowPack;
}

function uniqueSorted<T extends string>(values: Array<T | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].toSorted();
}

function authorityLabel(
  authorityTier: SourceAuthorityTier | undefined,
): ProjectStateCapsuleContextItem["authorityLabel"] {
  if (authorityTier === "user_authoritative" || authorityTier === "curated_authoritative") {
    return "authoritative";
  }
  if (authorityTier === "tool_grounded" || authorityTier === "cited_soft") {
    return "lower_authority";
  }
  return "unknown";
}

function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return "";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const words = normalized.split(/\s+/);
  if (words.length <= maxTokens) {
    return normalized;
  }
  return `${words.slice(0, Math.max(1, maxTokens - 1)).join(" ")}...`;
}

function exclusionReason(input: {
  pack: ProjectStateCapsuleShadowPack;
  includeConflictAware: boolean;
  includeInspection: boolean;
}): ProjectStateCapsuleContextExclusionReason | undefined {
  if (input.pack.sourceProfileIds.includes("secret_or_private_phrase")) {
    return "hard_reject";
  }
  if (input.pack.sourceMemoryIds.length === 0 || input.pack.sourceRefs.length === 0) {
    return "missing_pack_provenance";
  }
  if (input.pack.freshness.status === "stale" || input.pack.staleMarkers.length > 0) {
    return "stale";
  }
  if (input.pack.conflictMarkers.length > 0 && !input.includeConflictAware) {
    return "conflicted";
  }
  if (
    (input.pack.authorityTiers.includes("inspection_only") ||
      input.pack.sourceProfileIds.some((sourceProfileId) =>
        ["raw_transcript", "raw_prompt", "raw_tool_log"].includes(sourceProfileId),
      )) &&
    !input.includeInspection
  ) {
    return "inspection_only";
  }
  if (input.pack.sections.length === 0) {
    return "empty_sections";
  }
  return undefined;
}

function itemToContextItem(
  item: ProjectStateCapsuleShadowPackItem,
): ProjectStateCapsuleContextItem {
  return {
    itemId: item.itemId,
    sectionType: item.sectionType,
    text: item.text,
    sourceMemoryIds: [...item.sourceMemoryIds],
    authorityTier: item.authorityTier,
    sourceProfileId: item.sourceProfileId,
    authorityLabel: authorityLabel(item.authorityTier),
  };
}

function sectionToContextSection(input: {
  section: ProjectStateCapsuleShadowPackSection;
  maxItemsPerSection: number;
}): ProjectStateCapsuleContextSection | undefined {
  const items = input.section.items.slice(0, input.maxItemsPerSection).map(itemToContextItem);
  if (items.length === 0) {
    return undefined;
  }
  return {
    sectionId: input.section.sectionId,
    sectionType: input.section.sectionType,
    title: input.section.title,
    sourceMemoryIds: [...input.section.sourceMemoryIds],
    authorityTiers: [...input.section.authorityTiers],
    sourceProfileIds: [...input.section.sourceProfileIds],
    items,
  };
}

function renderBlock(input: {
  pack: ProjectStateCapsuleShadowPack;
  sections: ProjectStateCapsuleContextSection[];
  maxRenderedTokens: number;
}): string {
  const lines = [
    `<project-state-capsule-context capsule_id="${input.pack.capsuleId}" project_id="${input.pack.projectId}" content_hash="${input.pack.contentHash}">`,
    `source_memory_ids: ${input.pack.sourceMemoryIds.join(",")}`,
    `authority_tiers: ${input.pack.authorityTiers.join(",") || "unknown"}`,
  ];
  for (const section of input.sections) {
    lines.push(`section: ${section.title} (${section.sectionType})`);
    for (const item of section.items) {
      lines.push(
        `- [authority:${item.authorityTier ?? "unknown"} profile:${item.sourceProfileId ?? "unknown"} label:${item.authorityLabel} sources:${item.sourceMemoryIds.join(",")}] ${item.text}`,
      );
    }
  }
  lines.push("</project-state-capsule-context>");
  return trimTextToTokenBudget(lines.join("\n"), input.maxRenderedTokens);
}

function blockFromPack(input: {
  pack: ProjectStateCapsuleShadowPack;
  maxSections: number;
  maxItemsPerSection: number;
  maxRenderedTokens: number;
}): ProjectStateCapsuleContextBlock | undefined {
  const pack = clonePack(input.pack);
  const sections = pack.sections
    .slice(0, input.maxSections)
    .map((section) =>
      sectionToContextSection({
        section,
        maxItemsPerSection: input.maxItemsPerSection,
      }),
    )
    .filter((section): section is ProjectStateCapsuleContextSection => Boolean(section));
  if (sections.length === 0) {
    return undefined;
  }
  const renderedText = renderBlock({
    pack,
    sections,
    maxRenderedTokens: input.maxRenderedTokens,
  });
  return {
    schemaVersion: PROJECT_STATE_CAPSULE_CONTEXT_SCHEMA_VERSION,
    contextBlockId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "project_state_capsule_context",
      targetId: pack.capsuleId,
      scopeKey: pack.projectId,
      seed: { packId: pack.packId, contentHash: pack.contentHash },
    }),
    injected: true,
    capsuleId: pack.capsuleId,
    capsuleType: "project_state",
    projectId: pack.projectId,
    packId: pack.packId,
    contentHash: pack.contentHash,
    sourceMemoryIds: [...pack.sourceMemoryIds],
    sourceRefs: pack.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
    authorityTiers: [...pack.authorityTiers],
    sourceProfileIds: [...pack.sourceProfileIds],
    freshness: { ...pack.freshness },
    staleMarkers: [...pack.staleMarkers],
    conflictMarkers: [...pack.conflictMarkers],
    selectedSectionIds: sections.map((section) => section.sectionId),
    selectedSectionTypes: uniqueSorted(sections.map((section) => section.sectionType)),
    estimatedTokens: countRuntimeTokens(renderedText),
    renderedText,
  };
}

function countExclusionReasons(
  exclusions: ProjectStateCapsuleContextExclusion[],
): Record<ProjectStateCapsuleContextExclusionReason, number> {
  return {
    disabled: exclusions.filter((entry) => entry.reason === "disabled").length,
    shadow_only: exclusions.filter((entry) => entry.reason === "shadow_only").length,
    hard_reject: exclusions.filter((entry) => entry.reason === "hard_reject").length,
    stale: exclusions.filter((entry) => entry.reason === "stale").length,
    conflicted: exclusions.filter((entry) => entry.reason === "conflicted").length,
    inspection_only: exclusions.filter((entry) => entry.reason === "inspection_only").length,
    empty_sections: exclusions.filter((entry) => entry.reason === "empty_sections").length,
    missing_pack_provenance: exclusions.filter(
      (entry) => entry.reason === "missing_pack_provenance",
    ).length,
  };
}

function telemetry(input: {
  mode: ProjectStateCapsuleContextMode;
  blocks: ProjectStateCapsuleContextBlock[];
  exclusions: ProjectStateCapsuleContextExclusion[];
  projectPageProjectionAvailable: boolean;
}): ProjectStateCapsuleContextTelemetry {
  const projectPageBypassed =
    input.mode === "explicit_injection" &&
    input.projectPageProjectionAvailable &&
    input.blocks.length > 0;
  return {
    schemaVersion: PROJECT_STATE_CAPSULE_CONTEXT_TELEMETRY_SCHEMA_VERSION,
    mode: input.mode,
    enabled: input.mode === "explicit_injection",
    defaultContextInjectionChanged: false,
    injected: input.blocks.length > 0,
    selectedCapsuleIds: input.blocks.map((block) => block.capsuleId).toSorted(),
    injectedPackIds: input.blocks.map((block) => block.packId).toSorted(),
    skippedCapsuleIds: input.exclusions.map((exclusion) => exclusion.capsuleId).toSorted(),
    skippedReasons: countExclusionReasons(input.exclusions),
    sourceMemoryIds: uniqueSorted(input.blocks.flatMap((block) => block.sourceMemoryIds)),
    contentHashes: uniqueSorted(input.blocks.map((block) => block.contentHash)),
    estimatedTokens: input.blocks.reduce((sum, block) => sum + block.estimatedTokens, 0),
    projectPageBypassed,
    ...(projectPageBypassed
      ? { projectPageBypassReason: "project_state_capsule_explicit_context" as const }
      : {}),
  };
}

export function buildProjectStateCapsuleContext(input: {
  capsuleRetrievalShadow?: ProjectStateCapsuleRetrievalShadowResult;
  mode?: ProjectStateCapsuleContextMode;
  includeConflictAware?: boolean;
  includeInspection?: boolean;
  projectPageProjectionAvailable?: boolean;
  maxSections?: number;
  maxItemsPerSection?: number;
  maxRenderedTokens?: number;
}): ProjectStateCapsuleContextResult {
  const mode = input.mode ?? "disabled";
  const packs = input.capsuleRetrievalShadow?.packs ?? [];
  if (mode !== "explicit_injection") {
    const reason: ProjectStateCapsuleContextExclusionReason =
      mode === "shadow_report_only" ? "shadow_only" : "disabled";
    const exclusions = packs.map((pack) => ({
      capsuleId: pack.capsuleId,
      packId: pack.packId,
      reason,
    }));
    return {
      mode,
      blocks: [],
      exclusions,
      telemetry: telemetry({
        mode,
        blocks: [],
        exclusions,
        projectPageProjectionAvailable: input.projectPageProjectionAvailable ?? false,
      }),
    };
  }

  const blocks: ProjectStateCapsuleContextBlock[] = [];
  const exclusions: ProjectStateCapsuleContextExclusion[] = [];
  for (const pack of packs.toSorted((left, right) => left.packId.localeCompare(right.packId))) {
    const reason = exclusionReason({
      pack,
      includeConflictAware: input.includeConflictAware ?? false,
      includeInspection: input.includeInspection ?? false,
    });
    if (reason) {
      exclusions.push({ capsuleId: pack.capsuleId, packId: pack.packId, reason });
      continue;
    }
    const block = blockFromPack({
      pack,
      maxSections: input.maxSections ?? 4,
      maxItemsPerSection: input.maxItemsPerSection ?? 4,
      maxRenderedTokens: input.maxRenderedTokens ?? 350,
    });
    if (!block) {
      exclusions.push({ capsuleId: pack.capsuleId, packId: pack.packId, reason: "empty_sections" });
      continue;
    }
    blocks.push(block);
  }

  return {
    mode,
    blocks,
    exclusions,
    telemetry: telemetry({
      mode,
      blocks,
      exclusions,
      projectPageProjectionAvailable: input.projectPageProjectionAvailable ?? false,
    }),
    renderedText:
      blocks.length > 0 ? blocks.map((block) => block.renderedText).join("\n") : undefined,
  };
}
