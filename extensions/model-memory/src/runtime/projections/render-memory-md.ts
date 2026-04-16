import type { ActiveMemorySetRecord, ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderProjectionInput = {
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

function formatFact(record: ModelMemoryObjectRecord): string {
  return `- ${record.payload.subject}: ${record.payload.value}`;
}

function formatRule(record: ModelMemoryObjectRecord): string {
  const parts = [record.payload.subject];
  if (record.payload.recommendedAction) {
    parts.push(`do: ${record.payload.recommendedAction}`);
  }
  if (record.payload.avoidAction) {
    parts.push(`avoid: ${record.payload.avoidAction}`);
  }
  if (record.payload.neededCapability) {
    parts.push(`needs: ${record.payload.neededCapability}`);
  }
  return `- ${parts.join(" | ")}`;
}

function formatProcedure(record: ModelMemoryObjectRecord): string {
  const steps = Array.isArray(record.payload.steps) ? record.payload.steps.join(" -> ") : "";
  return `- ${record.payload.title}: ${steps}`;
}

export function renderMemoryMd(input: RenderProjectionInput): string {
  const selectedSlots = input.slots
    .map((slot) => getObjectById(input.memoryObjects, slot.currentObjectId))
    .filter((record) => ["user", "feedback", "project"].includes(record.canonicalClass))
    .sort((left, right) =>
      `${left.canonicalClass}:${left.kind}:${left.normalizedSubject ?? ""}`.localeCompare(
        `${right.canonicalClass}:${right.kind}:${right.normalizedSubject ?? ""}`,
      ),
    );
  const procedureRecords = input.sets
    .filter((entry) => entry.kind === "procedure")
    .map((entry) => getObjectById(input.memoryObjects, entry.memoryObjectId))
    .sort((left, right) => (left.normalizedTitle ?? "").localeCompare(right.normalizedTitle ?? ""));

  const lines = [
    "# MEMORY.md",
    "",
    "## Standing Context",
    ...(selectedSlots.length > 0
      ? selectedSlots.map((record) => {
          if (record.kind === "fact") {
            return formatFact(record);
          }
          if (record.kind === "rule") {
            return formatRule(record);
          }
          return `- ${record.payload.subject}: ${record.payload.instruction}`;
        })
      : ["- No projected standing context."]),
    "",
    "## Procedures",
    ...(procedureRecords.length > 0
      ? procedureRecords.map((record) => formatProcedure(record))
      : ["- No projected procedures."]),
  ];

  return lines.join("\n");
}
