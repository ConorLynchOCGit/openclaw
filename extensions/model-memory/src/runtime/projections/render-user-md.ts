import type { ActiveMemorySlotRecord } from "../../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../../storage-database-contract.ts";

export type RenderUserProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  memoryObjects: ModelMemoryObjectRecord[];
};

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
    .sort((left, right) =>
      `${left.kind}:${left.normalizedSubject ?? ""}`.localeCompare(
        `${right.kind}:${right.normalizedSubject ?? ""}`,
      ),
    );

  const preferenceLines = records
    .filter((record) => record.kind === "preference")
    .map((record) => `- ${record.payload.subject}: ${record.payload.instruction}`);
  const ruleLines = records
    .filter((record) => record.kind === "rule")
    .map((record) => {
      const segments = [record.payload.subject];
      if (record.payload.recommendedAction) {
        segments.push(`do: ${record.payload.recommendedAction}`);
      }
      if (record.payload.avoidAction) {
        segments.push(`avoid: ${record.payload.avoidAction}`);
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
