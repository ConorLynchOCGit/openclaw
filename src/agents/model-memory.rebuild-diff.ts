import { randomUUID } from "node:crypto";
import { DatabaseMemoryObjectStore } from "../plugin-sdk/model-memory-legacy.js";
import {
  rebuildDerivedRuntimeState,
  type ActiveMemorySetRecord,
  type ActiveMemorySlotRecord,
  type ContextArtifactRecord,
  type ModelMemoryObject,
  type ModelMemoryObjectRecord,
  type WorkspaceProjectionVersionRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";

export type SupportOnlyRebuildDiffReport = {
  generatedAt: string;
  selectedMemoryObjectId: string;
  selectedSupportCount: number;
  selectedSummary: string;
  writeDecision: string;
  writeDecisionCodes: string[];
  supportItemId?: string;
  projectionInputsChanged: boolean;
  projectionHashesChanged: boolean;
  artifactHashesChanged: boolean;
  activeSlotMembershipChanged: boolean;
  activeSetMembershipChanged: boolean;
  changedProjectionTargets: string[];
  changedArtifactKeys: string[];
  classification:
    | "pure_support_only_stable"
    | "selected_case_not_support_only"
    | "unexpected_active_membership_change"
    | "projection_input_changed_without_membership_change"
    | "artifact_hash_changed_without_membership_change"
    | "mixed_support_only_churn";
  projectionBefore: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      sourceSetKeys: string[];
    }
  >;
  projectionAfter: Record<
    string,
    {
      contentHash: string;
      sourceObjectIds: string[];
      sourceSlotKeys: string[];
      sourceSetKeys: string[];
    }
  >;
  artifactBefore: Record<
    string,
    { contentHash: string; sourceObjectIds: string[]; sourceSlotKeys: string[] }
  >;
  artifactAfter: Record<
    string,
    { contentHash: string; sourceObjectIds: string[]; sourceSlotKeys: string[] }
  >;
  activeSlotsBefore: Record<string, string>;
  activeSlotsAfter: Record<string, string>;
  activeSetsBefore: Record<string, string[]>;
  activeSetsAfter: Record<string, string[]>;
};

function summarizeObject(record: ModelMemoryObjectRecord): string {
  if (record.kind === "fact") {
    return `${String(record.payload.subject)}: ${String(record.payload.value)}`;
  }
  if (record.kind === "preference") {
    return `${String(record.payload.subject)} | ${String(record.payload.instruction)}`;
  }
  if (record.kind === "rule") {
    return [
      record.payload.subject,
      record.payload.recommendedAction,
      record.payload.avoidAction,
      record.payload.neededCapability,
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  }
  if (record.kind === "procedure") {
    const steps = Array.isArray(record.payload.steps)
      ? record.payload.steps.map((step: unknown) => String(step))
      : [];
    return `${String(record.payload.title)} | ${steps.join(" -> ")}`;
  }
  return `${String(record.payload.task)} -> ${String(record.payload.primaryResource)}`;
}

function projectionMap(
  records: WorkspaceProjectionVersionRecord[],
): SupportOnlyRebuildDiffReport["projectionBefore"] {
  return Object.fromEntries(
    records.map((record) => [
      record.targetId,
      {
        contentHash: record.contentHash,
        sourceObjectIds: record.sourceObjectIds,
        sourceSlotKeys: record.sourceSlotKeys,
        sourceSetKeys: record.sourceSetKeys,
      },
    ]),
  );
}

function artifactKey(record: ContextArtifactRecord): string {
  return `${record.artifactType}:${record.scopeKey ?? "global"}`;
}

function artifactMap(
  records: ContextArtifactRecord[],
): SupportOnlyRebuildDiffReport["artifactBefore"] {
  return Object.fromEntries(
    records.map((record) => [
      artifactKey(record),
      {
        contentHash: record.contentHash,
        sourceObjectIds: record.sourceObjectIds,
        sourceSlotKeys: record.sourceSlotKeys,
      },
    ]),
  );
}

function activeSlotMap(records: ActiveMemorySlotRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((record) => [record.slotKey, record.currentObjectId]));
}

function activeSetMap(records: ActiveMemorySetRecord[]): Record<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const record of records) {
    const existing = grouped.get(record.setKey) ?? [];
    existing.push(record.memoryObjectId);
    grouped.set(record.setKey, existing);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([setKey, objectIds]) => [
      setKey,
      [...objectIds].toSorted((left, right) => left.localeCompare(right)),
    ]),
  );
}

function mapsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toSyntheticObject(
  record: ModelMemoryObjectRecord,
  sourceWindowId: string,
): ModelMemoryObject {
  return {
    canonicalClass: record.canonicalClass as ModelMemoryObject["canonicalClass"],
    kind: record.kind as ModelMemoryObject["kind"],
    payload: record.payload as ModelMemoryObject["payload"],
    scope: record.scope,
    provenance: [{ sourceId: sourceWindowId, segmentIndex: 0, headingPath: [] }],
    confidence: record.confidence as ModelMemoryObject["confidence"],
    durability: record.durability as ModelMemoryObject["durability"],
    reviewMode: "auto_accept",
    rationaleCodes: record.rationaleCodes,
  } as ModelMemoryObject;
}

function classifyDiff(input: {
  writeDecision: string;
  projectionInputsChanged: boolean;
  projectionHashesChanged: boolean;
  artifactHashesChanged: boolean;
  activeSlotMembershipChanged: boolean;
  activeSetMembershipChanged: boolean;
}): SupportOnlyRebuildDiffReport["classification"] {
  if (input.writeDecision !== "attach_support") {
    return "selected_case_not_support_only";
  }
  if (
    !input.projectionHashesChanged &&
    !input.artifactHashesChanged &&
    !input.activeSlotMembershipChanged &&
    !input.activeSetMembershipChanged
  ) {
    return "pure_support_only_stable";
  }
  if (input.activeSlotMembershipChanged || input.activeSetMembershipChanged) {
    return "unexpected_active_membership_change";
  }
  if (input.projectionInputsChanged || input.projectionHashesChanged) {
    return "projection_input_changed_without_membership_change";
  }
  if (input.artifactHashesChanged) {
    return "artifact_hash_changed_without_membership_change";
  }
  return "mixed_support_only_churn";
}

export async function executeSupportOnlyRebuildDiff(input: {
  runtime: ModelMemoryDatabaseRuntime;
}): Promise<SupportOnlyRebuildDiffReport> {
  const canonicalSnapshot = await input.runtime.canonicalRepository.snapshot();
  const supportCountByObjectId = new Map<string, number>();
  for (const item of canonicalSnapshot.supportItems) {
    supportCountByObjectId.set(
      item.memoryObjectId,
      (supportCountByObjectId.get(item.memoryObjectId) ?? 0) + 1,
    );
  }

  const target = canonicalSnapshot.memoryObjects.find(
    (record) =>
      !record.supersededAt &&
      (record.lifecycleState ?? "active") === "active" &&
      (supportCountByObjectId.get(record.id) ?? 0) > 0,
  );
  if (!target) {
    throw new Error(
      "no active memory object with existing attached support found in current corpus",
    );
  }

  const beforeRebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  const beforeProjectionMap = projectionMap(beforeRebuild.projectionVersions);
  const beforeArtifactMap = artifactMap(beforeRebuild.contextArtifacts);
  const beforeActiveSlotMap = activeSlotMap(beforeRebuild.activeMemorySlots);
  const beforeActiveSetMap = activeSetMap(beforeRebuild.activeMemorySets);

  const sourceId = randomUUID();
  const sourceWindowId = randomUUID();
  const createdAt = new Date();
  await input.runtime.canonicalRepository.persistSource({
    id: sourceId,
    sourceKind: "document",
    externalSourceId: `synthetic/support-only-rebuild-diff/${sourceId}.md`,
    sourceFingerprint: sourceId,
    sourceMetadata: { synthetic: true, purpose: "support-only-rebuild-diff" },
    createdAt,
  });
  await input.runtime.canonicalRepository.persistSourceWindows([
    {
      id: sourceWindowId,
      sourceId,
      windowIndex: 0,
      normalizedText: target.normalizedSearchText,
      normalizedFingerprint: sourceWindowId,
      tokenEstimate: target.normalizedSearchText.split(/\s+/).filter(Boolean).length,
      headingPath: [],
      blockDescriptors: [],
      createdAt,
    },
  ]);

  const store = new DatabaseMemoryObjectStore(input.runtime.canonicalRepository);
  const writeResult = await store.writeCapturedObject({
    sourceWindowId,
    sourceKind: "document",
    contractName: target.contractName,
    contractVersion: target.contractVersion,
    modelId: target.modelId,
    object: toSyntheticObject(target, sourceWindowId),
  });

  const afterRebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });
  const afterProjectionMap = projectionMap(afterRebuild.projectionVersions);
  const afterArtifactMap = artifactMap(afterRebuild.contextArtifacts);
  const afterActiveSlotMap = activeSlotMap(afterRebuild.activeMemorySlots);
  const afterActiveSetMap = activeSetMap(afterRebuild.activeMemorySets);

  const projectionInputsChanged = !mapsEqual(
    Object.fromEntries(
      Object.entries(beforeProjectionMap).map(([targetId, value]) => [
        targetId,
        {
          sourceObjectIds: value.sourceObjectIds,
          sourceSlotKeys: value.sourceSlotKeys,
          sourceSetKeys: value.sourceSetKeys,
        },
      ]),
    ),
    Object.fromEntries(
      Object.entries(afterProjectionMap).map(([targetId, value]) => [
        targetId,
        {
          sourceObjectIds: value.sourceObjectIds,
          sourceSlotKeys: value.sourceSlotKeys,
          sourceSetKeys: value.sourceSetKeys,
        },
      ]),
    ),
  );
  const projectionHashesChanged = !mapsEqual(
    Object.fromEntries(
      Object.entries(beforeProjectionMap).map(([key, value]) => [key, value.contentHash]),
    ),
    Object.fromEntries(
      Object.entries(afterProjectionMap).map(([key, value]) => [key, value.contentHash]),
    ),
  );
  const artifactHashesChanged = !mapsEqual(
    Object.fromEntries(
      Object.entries(beforeArtifactMap).map(([key, value]) => [key, value.contentHash]),
    ),
    Object.fromEntries(
      Object.entries(afterArtifactMap).map(([key, value]) => [key, value.contentHash]),
    ),
  );
  const activeSlotMembershipChanged = !mapsEqual(beforeActiveSlotMap, afterActiveSlotMap);
  const activeSetMembershipChanged = !mapsEqual(beforeActiveSetMap, afterActiveSetMap);

  const changedProjectionTargets = [
    ...new Set([...Object.keys(beforeProjectionMap), ...Object.keys(afterProjectionMap)]),
  ].filter(
    (targetId) =>
      JSON.stringify(beforeProjectionMap[targetId]) !==
      JSON.stringify(afterProjectionMap[targetId]),
  );
  const changedArtifactKeys = [
    ...new Set([...Object.keys(beforeArtifactMap), ...Object.keys(afterArtifactMap)]),
  ].filter(
    (key) => JSON.stringify(beforeArtifactMap[key]) !== JSON.stringify(afterArtifactMap[key]),
  );

  return {
    generatedAt: new Date().toISOString(),
    selectedMemoryObjectId: target.id,
    selectedSupportCount: supportCountByObjectId.get(target.id) ?? 0,
    selectedSummary: summarizeObject(target),
    writeDecision: writeResult.decision,
    writeDecisionCodes: writeResult.writeEvent.decisionCodes,
    supportItemId: writeResult.supportItem?.id,
    projectionInputsChanged,
    projectionHashesChanged,
    artifactHashesChanged,
    activeSlotMembershipChanged,
    activeSetMembershipChanged,
    changedProjectionTargets,
    changedArtifactKeys,
    classification: classifyDiff({
      writeDecision: writeResult.decision,
      projectionInputsChanged,
      projectionHashesChanged,
      artifactHashesChanged,
      activeSlotMembershipChanged,
      activeSetMembershipChanged,
    }),
    projectionBefore: beforeProjectionMap,
    projectionAfter: afterProjectionMap,
    artifactBefore: beforeArtifactMap,
    artifactAfter: afterArtifactMap,
    activeSlotsBefore: beforeActiveSlotMap,
    activeSlotsAfter: afterActiveSlotMap,
    activeSetsBefore: beforeActiveSetMap,
    activeSetsAfter: afterActiveSetMap,
  };
}

export function renderSupportOnlyRebuildDiffMarkdown(report: SupportOnlyRebuildDiffReport): string {
  const lines: string[] = [];
  lines.push("# Model Memory Support-Only Rebuild Diff");
  lines.push("");
  lines.push(`- Selected memory object: ${report.selectedMemoryObjectId}`);
  lines.push(`- Existing support count: ${report.selectedSupportCount}`);
  lines.push(`- Selected summary: ${report.selectedSummary}`);
  lines.push(`- Write decision: ${report.writeDecision}`);
  lines.push(`- Decision codes: ${report.writeDecisionCodes.join(", ")}`);
  lines.push(`- Classification: ${report.classification}`);
  lines.push(`- Projection inputs changed: ${report.projectionInputsChanged}`);
  lines.push(`- Projection hashes changed: ${report.projectionHashesChanged}`);
  lines.push(`- Artifact hashes changed: ${report.artifactHashesChanged}`);
  lines.push(`- Active slot membership changed: ${report.activeSlotMembershipChanged}`);
  lines.push(`- Active set membership changed: ${report.activeSetMembershipChanged}`);
  lines.push(
    `- Changed projection targets: ${report.changedProjectionTargets.join(", ") || "none"}`,
  );
  lines.push(`- Changed artifact keys: ${report.changedArtifactKeys.join(", ") || "none"}`);
  return lines.join("\n");
}
