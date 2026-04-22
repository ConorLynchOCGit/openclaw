import { summarizeModelMemoryValue } from "../../payload-summary.ts";
import type { ActiveMemorySlotRecord, RuntimeMemoryRecord } from "../../runtime-read-models.ts";

export type RenderUserProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  memoryObjects: RuntimeMemoryRecord[];
};

function getObjectById(memoryObjects: RuntimeMemoryRecord[], objectId: string) {
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
    .map(
      (record) =>
        `- ${summarizeModelMemoryValue(record.payload.subject, "preference")}: ${summarizeModelMemoryValue(record.payload.instruction)}`,
    );
  const ruleLines = records
    .filter((record) => record.kind === "rule")
    .map((record) => {
      const segments = [summarizeModelMemoryValue(record.payload.subject, "rule")];
      if (record.payload.recommendedAction) {
        segments.push(`do: ${summarizeModelMemoryValue(record.payload.recommendedAction)}`);
      }
      if (record.payload.avoidAction) {
        segments.push(`avoid: ${summarizeModelMemoryValue(record.payload.avoidAction)}`);
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
