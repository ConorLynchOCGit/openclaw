import { getCurrentMemoryObjects, type ActiveMemorySlotRecord } from "../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../storage-database-contract.ts";

export function materializeActiveMemorySlots(
  memoryObjects: ModelMemoryObjectRecord[],
): ActiveMemorySlotRecord[] {
  const currentBySlot = new Map<string, ModelMemoryObjectRecord>();

  for (const record of getCurrentMemoryObjects(memoryObjects)) {
    if (!record.slotKey) {
      continue;
    }
    const prior = currentBySlot.get(record.slotKey);
    if (!prior || prior.createdAt < record.createdAt) {
      currentBySlot.set(record.slotKey, record);
    }
  }

  return Array.from(currentBySlot.entries())
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([slotKey, record]) => ({
      slotKey,
      canonicalClass: record.canonicalClass,
      kind: record.kind,
      scopeKey: record.scopeKey,
      subjectKey: record.normalizedSubject,
      currentObjectId: record.id,
      currentIdentityKey: record.identityKey,
      updatedAt: record.createdAt,
    }));
}
