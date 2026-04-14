import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  ContextArtifactRecord,
} from "../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../storage-database-contract.ts";
import { buildContextArtifact } from "./context-artifacts.ts";

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

function getObjectById(
  memoryObjects: ModelMemoryObjectRecord[],
  objectId: string,
): ModelMemoryObjectRecord | undefined {
  return memoryObjects.find((record) => record.id === objectId && !record.supersededAt);
}

function formatObject(record: ModelMemoryObjectRecord): string {
  if (record.kind === "fact") {
    const subject = readPayloadString(record.payload, "subject") ?? "fact";
    const value = readPayloadString(record.payload, "value") ?? "";
    return `- ${subject}: ${value}`;
  }
  if (record.kind === "rule") {
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
  if (record.kind === "procedure") {
    const steps = readPayloadStringArray(record.payload, "steps").join(" -> ");
    return `- ${readPayloadString(record.payload, "title") ?? "procedure"}: ${steps}`;
  }
  if (record.kind === "reference") {
    const companions = readPayloadStringArray(record.payload, "companionResources").join(", ");
    const task = readPayloadString(record.payload, "task") ?? "reference";
    const primaryResource = readPayloadString(record.payload, "primaryResource") ?? "";
    return companions.length > 0
      ? `- ${task} -> ${primaryResource} (${companions})`
      : `- ${task} -> ${primaryResource}`;
  }
  const subject = readPayloadString(record.payload, "subject") ?? "preference";
  const instruction = readPayloadString(record.payload, "instruction") ?? "";
  return `- ${subject}: ${instruction}`;
}

export function buildDerivedContextArtifacts(input: {
  memoryObjects: ModelMemoryObjectRecord[];
  slots: ActiveMemorySlotRecord[];
  sets: ActiveMemorySetRecord[];
  buildPolicyVersion: string;
  builtAt?: Date;
}): ContextArtifactRecord[] {
  const artifacts: ContextArtifactRecord[] = [];
  const currentSlotObjects = input.slots
    .map((slot) => ({ slot, record: getObjectById(input.memoryObjects, slot.currentObjectId) }))
    .filter(
      (entry): entry is { slot: ActiveMemorySlotRecord; record: ModelMemoryObjectRecord } =>
        !!entry.record,
    );

  const userSlotObjects = currentSlotObjects
    .filter((entry) => entry.record.canonicalClass === "user")
    .toSorted((left, right) =>
      `${left.record.kind}:${left.record.normalizedSubject ?? ""}:${left.record.id}`.localeCompare(
        `${right.record.kind}:${right.record.normalizedSubject ?? ""}:${right.record.id}`,
      ),
    );
  if (userSlotObjects.length > 0) {
    artifacts.push(
      buildContextArtifact({
        artifactType: "user_memory_pack",
        sourceObjectIds: userSlotObjects.map((entry) => entry.record.id),
        sourceSlotKeys: userSlotObjects.map((entry) => entry.slot.slotKey),
        renderedText: [
          "# User Memory Pack",
          ...userSlotObjects.map((entry) => formatObject(entry.record)),
        ].join("\n"),
        buildPolicyVersion: input.buildPolicyVersion,
        builtAt: input.builtAt,
      }),
    );
  }

  const scopedSlotGroups = new Map<
    string,
    Array<{ slot: ActiveMemorySlotRecord; record: ModelMemoryObjectRecord }>
  >();
  for (const entry of currentSlotObjects) {
    if (!entry.record.scopeKey) {
      continue;
    }
    if (!["project", "feedback"].includes(entry.record.canonicalClass)) {
      continue;
    }
    const group = scopedSlotGroups.get(entry.record.scopeKey) ?? [];
    group.push(entry);
    scopedSlotGroups.set(entry.record.scopeKey, group);
  }
  for (const [scopeKey, entries] of [...scopedSlotGroups.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const sortedEntries = [...entries].toSorted((left, right) =>
      `${left.record.kind}:${left.record.normalizedSubject ?? ""}:${left.record.id}`.localeCompare(
        `${right.record.kind}:${right.record.normalizedSubject ?? ""}:${right.record.id}`,
      ),
    );
    artifacts.push(
      buildContextArtifact({
        artifactType: "project_memory_pack",
        scopeKey,
        sourceObjectIds: sortedEntries.map((entry) => entry.record.id),
        sourceSlotKeys: sortedEntries.map((entry) => entry.slot.slotKey),
        renderedText: [
          `# Project Memory Pack: ${scopeKey}`,
          ...sortedEntries.map((entry) => formatObject(entry.record)),
        ].join("\n"),
        buildPolicyVersion: input.buildPolicyVersion,
        builtAt: input.builtAt,
      }),
    );
  }

  const procedureGroups = new Map<string, ModelMemoryObjectRecord[]>();
  for (const entry of input.sets.filter((setRecord) => setRecord.kind === "procedure")) {
    const record = getObjectById(input.memoryObjects, entry.memoryObjectId);
    if (!record) {
      continue;
    }
    const scopeKey = record.scopeKey ?? "global";
    const group = procedureGroups.get(scopeKey) ?? [];
    group.push(record);
    procedureGroups.set(scopeKey, group);
  }
  for (const [scopeKey, records] of [...procedureGroups.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const sortedRecords = [...records].toSorted((left, right) =>
      `${left.normalizedTitle ?? ""}:${left.id}`.localeCompare(
        `${right.normalizedTitle ?? ""}:${right.id}`,
      ),
    );
    artifacts.push(
      buildContextArtifact({
        artifactType: "procedure_memory_pack",
        scopeKey: scopeKey === "global" ? undefined : scopeKey,
        sourceObjectIds: sortedRecords.map((record) => record.id),
        renderedText: [
          `# Procedure Pack${scopeKey === "global" ? "" : `: ${scopeKey}`}`,
          ...sortedRecords.map((record) => formatObject(record)),
        ].join("\n"),
        buildPolicyVersion: input.buildPolicyVersion,
        builtAt: input.builtAt,
      }),
    );
  }

  return artifacts.toSorted((left, right) =>
    `${left.artifactType}:${left.scopeKey ?? "global"}:${left.id}`.localeCompare(
      `${right.artifactType}:${right.scopeKey ?? "global"}:${right.id}`,
    ),
  );
}
