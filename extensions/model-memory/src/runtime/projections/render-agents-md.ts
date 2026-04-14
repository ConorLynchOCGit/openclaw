import type { ActiveMemorySetRecord, ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderAgentsProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  memoryObjects: ModelMemoryObjectRecord[];
};

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

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
    .toSorted((left, right) =>
      (left.normalizedSubject ?? "").localeCompare(right.normalizedSubject ?? ""),
    );
  const procedureRecords = input.sets
    .filter((entry) => entry.kind === "procedure")
    .map((entry) => getObjectById(input.memoryObjects, entry.memoryObjectId))
    .toSorted((left, right) =>
      (left.normalizedTitle ?? "").localeCompare(right.normalizedTitle ?? ""),
    );

  return [
    "## Generated Memory Rules",
    ...(ruleRecords.length > 0
      ? ruleRecords.map((record) => {
          const subject = readPayloadString(record.payload, "subject");
          const parts = [subject ?? "rule"];
          const recommendedAction = readPayloadString(record.payload, "recommendedAction");
          if (recommendedAction) {
            parts.push(`do: ${recommendedAction}`);
          }
          const avoidAction = readPayloadString(record.payload, "avoidAction");
          if (avoidAction) {
            parts.push(`avoid: ${avoidAction}`);
          }
          return `- ${parts.join(" | ")}`;
        })
      : ["- No projected agent-visible rules."]),
    "",
    "## Generated Procedures",
    ...(procedureRecords.length > 0
      ? procedureRecords.map(
          (record) => `- ${readPayloadString(record.payload, "title") ?? "procedure"}`,
        )
      : ["- No projected procedures."]),
  ].join("\n");
}
