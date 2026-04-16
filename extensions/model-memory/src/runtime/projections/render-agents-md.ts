import type { ActiveMemorySetRecord, ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderAgentsProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  memoryObjects: ModelMemoryObjectRecord[];
};

function getObjectById(memoryObjects: ModelMemoryObjectRecord[], objectId: string) {
  const record = memoryObjects.find((entry) => entry.id === objectId);
  if (!record) {
    throw new Error(`missing memory object for projection: ${objectId}`);
  }
  return record;
}

export function renderAgentsMdSection(input: RenderAgentsProjectionInput): string {
  const ruleRecords = input.slots
    .map((slot) => getObjectById(input.memoryObjects, slot.currentObjectId))
    .filter(
      (record) => record.kind === "rule" && ["feedback", "project"].includes(record.canonicalClass),
    )
    .sort((left, right) =>
      (left.normalizedSubject ?? "").localeCompare(right.normalizedSubject ?? ""),
    );
  const procedureRecords = input.sets
    .filter((entry) => entry.kind === "procedure")
    .map((entry) => getObjectById(input.memoryObjects, entry.memoryObjectId))
    .sort((left, right) => (left.normalizedTitle ?? "").localeCompare(right.normalizedTitle ?? ""));

  return [
    "## Generated Memory Rules",
    ...(ruleRecords.length > 0
      ? ruleRecords.map((record) => {
          const parts = [record.payload.subject];
          if (record.payload.recommendedAction) {
            parts.push(`do: ${record.payload.recommendedAction}`);
          }
          if (record.payload.avoidAction) {
            parts.push(`avoid: ${record.payload.avoidAction}`);
          }
          return `- ${parts.join(" | ")}`;
        })
      : ["- No projected agent-visible rules."]),
    "",
    "## Generated Procedures",
    ...(procedureRecords.length > 0
      ? procedureRecords.map((record) => `- ${record.payload.title}`)
      : ["- No projected procedures."]),
  ].join("\n");
}
