import { summarizeModelMemoryValue } from "../../payload-summary.ts";
import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  RuntimeMemoryRecord,
} from "../../runtime-read-models.ts";

export type RenderAgentsProjectionInput = {
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  memoryObjects: RuntimeMemoryRecord[];
};

function getObjectById(memoryObjects: RuntimeMemoryRecord[], objectId: string) {
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
          const parts = [summarizeModelMemoryValue(record.payload.subject, "rule")];
          if (record.payload.recommendedAction) {
            parts.push(`do: ${summarizeModelMemoryValue(record.payload.recommendedAction)}`);
          }
          if (record.payload.avoidAction) {
            parts.push(`avoid: ${summarizeModelMemoryValue(record.payload.avoidAction)}`);
          }
          return `- ${parts.join(" | ")}`;
        })
      : ["- No projected agent-visible rules."]),
    "",
    "## Generated Procedures",
    ...(procedureRecords.length > 0
      ? procedureRecords.map(
          (record) => `- ${summarizeModelMemoryValue(record.payload.title, "procedure")}`,
        )
      : ["- No projected procedures."]),
  ].join("\n");
}
