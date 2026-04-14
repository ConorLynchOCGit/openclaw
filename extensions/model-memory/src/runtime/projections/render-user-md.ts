import type { ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderUserProjectionInput = {
  slots: ActiveMemorySlotRecord[];
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

export function renderUserMd(input: RenderUserProjectionInput): string {
  const records = input.slots
    .map((slot) => getObjectById(input.memoryObjects, slot.currentObjectId))
    .filter((record) => record.canonicalClass === "user")
    .toSorted((left, right) =>
      `${left.kind}:${left.normalizedSubject ?? ""}`.localeCompare(
        `${right.kind}:${right.normalizedSubject ?? ""}`,
      ),
    );

  const preferenceLines = records
    .filter((record) => record.kind === "preference")
    .flatMap((record) => {
      const subject = readPayloadString(record.payload, "subject");
      const instruction = readPayloadString(record.payload, "instruction");
      return subject && instruction ? [`- ${subject}: ${instruction}`] : [];
    });
  const ruleLines = records
    .filter((record) => record.kind === "rule")
    .map((record) => {
      const subject = readPayloadString(record.payload, "subject");
      const segments = [subject ?? "rule"];
      const recommendedAction = readPayloadString(record.payload, "recommendedAction");
      if (recommendedAction) {
        segments.push(`do: ${recommendedAction}`);
      }
      const avoidAction = readPayloadString(record.payload, "avoidAction");
      if (avoidAction) {
        segments.push(`avoid: ${avoidAction}`);
      }
      return `- ${segments.join(" | ")}`;
    });

  return [
    "# USER.md",
    "",
    "## Preferences",
    ...(preferenceLines.length > 0 ? preferenceLines : ["- No projected user preferences."]),
    "",
    "## Standing Rules",
    ...(ruleLines.length > 0 ? ruleLines : ["- No projected user rules."]),
  ].join("\n");
}
