import type {
  ActiveMemorySetRecord,
  ActiveMemorySlotRecord,
  ContextArtifactRecord,
} from "../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../storage-database-contract.ts";
import { buildContextArtifact } from "./context-artifacts.ts";

function getObjectById(
  memoryObjects: ModelMemoryObjectRecord[],
  objectId: string,
): ModelMemoryObjectRecord | undefined {
  return memoryObjects.find(
    (record) =>
      record.id === objectId &&
      !record.supersededAt &&
      (record.lifecycleState ?? "active") === "active",
  );
}

function formatObject(record: ModelMemoryObjectRecord): string {
  if (record.kind === "fact") {
    return `- ${record.payload.subject}: ${record.payload.value}`;
  }
  if (record.kind === "rule") {
    const parts = [String(record.payload.subject)];
    if (record.payload.recommendedAction) {
      parts.push(`do: ${String(record.payload.recommendedAction)}`);
    }
    if (record.payload.avoidAction) {
      parts.push(`avoid: ${String(record.payload.avoidAction)}`);
    }
    if (record.payload.neededCapability) {
      parts.push(`needs: ${String(record.payload.neededCapability)}`);
    }
    return `- ${parts.join(" | ")}`;
  }
  if (record.kind === "procedure") {
    const steps = Array.isArray(record.payload.steps)
      ? record.payload.steps.map((step) => String(step)).join(" -> ")
      : "";
    return `- ${String(record.payload.title)}: ${steps}`;
  }
  if (record.kind === "reference") {
    const companions = Array.isArray(record.payload.companionResources)
      ? record.payload.companionResources.map((entry) => String(entry)).join(", ")
      : "";
    return companions.length > 0
      ? `- ${String(record.payload.task)} -> ${String(record.payload.primaryResource)} (${companions})`
      : `- ${String(record.payload.task)} -> ${String(record.payload.primaryResource)}`;
  }
  return `- ${String(record.payload.subject)}: ${String(record.payload.instruction)}`;
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
    .sort((left, right) =>
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
  for (const [scopeKey, entries] of [...scopedSlotGroups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const sortedEntries = [...entries].sort((left, right) =>
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
  for (const [scopeKey, records] of [...procedureGroups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const sortedRecords = [...records].sort((left, right) =>
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

  return artifacts.sort((left, right) =>
    `${left.artifactType}:${left.scopeKey ?? "global"}:${left.id}`.localeCompare(
      `${right.artifactType}:${right.scopeKey ?? "global"}:${right.id}`,
    ),
  );
}
