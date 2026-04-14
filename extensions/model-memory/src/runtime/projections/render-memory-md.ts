import type { ActiveMemorySetRecord, ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  memoryObjects: ModelMemoryObjectRecord[];
};

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function readPayloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function getObjectById(memoryObjects: ModelMemoryObjectRecord[], objectId: string) {
  const record = memoryObjects.find((entry) => entry.id === objectId);
  if (!record) {
    throw new Error(`missing memory object for projection: ${objectId}`);
  }
  return record;
}

function formatFact(record: ModelMemoryObjectRecord): string {
  const subject = readPayloadString(record.payload, "subject") ?? "fact";
  const value = readPayloadString(record.payload, "value") ?? "";
  return `- ${subject}: ${value}`;
}

function formatRule(record: ModelMemoryObjectRecord): string {
  const parts = [readPayloadString(record.payload, "subject") ?? "rule"];
  const recommendedAction = readPayloadString(record.payload, "recommendedAction");
  if (recommendedAction) {
    parts.push(`do: ${recommendedAction}`);
  }
  const avoidAction = readPayloadString(record.payload, "avoidAction");
  if (avoidAction) {
    parts.push(`avoid: ${avoidAction}`);
  }
  const neededCapability = readPayloadString(record.payload, "neededCapability");
  if (neededCapability) {
    parts.push(`needs: ${neededCapability}`);
  }
  return `- ${parts.join(" | ")}`;
}

function formatProcedure(record: ModelMemoryObjectRecord): string {
  const steps = readPayloadStringArray(record.payload, "steps").join(" -> ");
  return `- ${readPayloadString(record.payload, "title") ?? "procedure"}: ${steps}`;
}

export function renderMemoryMd(input: RenderProjectionInput): string {
  const selectedSlots = input.slots
    .map((slot) => getObjectById(input.memoryObjects, slot.currentObjectId))
    .filter((record) => ["user", "feedback", "project"].includes(record.canonicalClass))
    .toSorted((left, right) =>
      `${left.canonicalClass}:${left.kind}:${left.normalizedSubject ?? ""}`.localeCompare(
        `${right.canonicalClass}:${right.kind}:${right.normalizedSubject ?? ""}`,
      ),
    );
  const procedureRecords = input.sets
    .filter((entry) => entry.kind === "procedure")
    .map((entry) => getObjectById(input.memoryObjects, entry.memoryObjectId))
    .toSorted((left, right) =>
      (left.normalizedTitle ?? "").localeCompare(right.normalizedTitle ?? ""),
    );

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
          const subject = readPayloadString(record.payload, "subject") ?? "preference";
          const instruction = readPayloadString(record.payload, "instruction") ?? "";
          return `- ${subject}: ${instruction}`;
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
