import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  WorkspaceProjectionTargetRecord,
  WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";
import { upsertGeneratedZone } from "./runtime/projections/file-writer.ts";
import { renderAgentsMdSection } from "./runtime/projections/render-agents-md.ts";
import { renderMemoryMd } from "./runtime/projections/render-memory-md.ts";
import { renderUserMd } from "./runtime/projections/render-user-md.ts";
import {
  buildWorkspaceProjectionVersion,
  getWorkspaceProjectionTarget,
} from "./runtime/projections/targets.ts";
import type { ModelMemoryObjectRecord } from "./storage-database-contract.ts";

export type ProjectionCompilerInput = {
  targetId: string;
  memoryObjects: ModelMemoryObjectRecord[];
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  existingFileContent?: string;
  builtAt?: Date;
};

export type ProjectionCompileResult = {
  target: WorkspaceProjectionTargetRecord;
  renderedText: string;
  outputFileContent: string;
  version: WorkspaceProjectionVersionRecord;
};

function filterSlotsForTarget(
  slots: ActiveMemorySlotRecord[],
  memoryObjects: ModelMemoryObjectRecord[],
  target: WorkspaceProjectionTargetRecord,
) {
  return slots.filter((slot) => {
    const record = memoryObjects.find((entry) => entry.id === slot.currentObjectId);
    return (
      !!record &&
      target.allowedCanonicalClasses.includes(record.canonicalClass) &&
      target.allowedKinds.includes(record.kind)
    );
  });
}

function filterSetsForTarget(
  sets: ActiveMemorySetRecord[],
  memoryObjects: ModelMemoryObjectRecord[],
  target: WorkspaceProjectionTargetRecord,
) {
  return sets.filter((entry) => {
    const record = memoryObjects.find((object) => object.id === entry.memoryObjectId);
    return (
      !!record &&
      target.allowedCanonicalClasses.includes(record.canonicalClass) &&
      target.allowedKinds.includes(record.kind)
    );
  });
}

function renderTarget(
  target: WorkspaceProjectionTargetRecord,
  memoryObjects: ModelMemoryObjectRecord[],
  slots: ActiveMemorySlotRecord[],
  sets: ActiveMemorySetRecord[],
): string {
  if (target.targetKind === "memory_md") {
    return renderMemoryMd({ memoryObjects, slots, sets });
  }
  if (target.targetKind === "user_md") {
    return renderUserMd({ memoryObjects, slots });
  }
  return renderAgentsMdSection({ memoryObjects, slots, sets });
}

export function compileProjection(input: ProjectionCompilerInput): ProjectionCompileResult {
  const target = getWorkspaceProjectionTarget(input.targetId);
  const filteredSlots = filterSlotsForTarget(input.slots, input.memoryObjects, target);
  const filteredSets = filterSetsForTarget(input.sets, input.memoryObjects, target);
  const renderedText = renderTarget(target, input.memoryObjects, filteredSlots, filteredSets);
  const version = buildWorkspaceProjectionVersion({
    targetId: target.targetId,
    renderedText,
    sourceObjectIds: [
      ...filteredSlots.map((slot) => slot.currentObjectId),
      ...filteredSets.map((entry) => entry.memoryObjectId),
    ],
    sourceSlotKeys: filteredSlots.map((slot) => slot.slotKey),
    sourceSetKeys: filteredSets.map((entry) => entry.setKey),
    builtAt: input.builtAt,
  });
  const outputFileContent = upsertGeneratedZone(
    input.existingFileContent,
    renderedText,
    target.generatedBlockId,
  );

  return {
    target,
    renderedText,
    outputFileContent,
    version,
  };
}
