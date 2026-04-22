import {
  getCurrentMemoryObjects,
  type ActiveMemorySlotRecord,
  type RuntimeMemoryRecord,
} from "../runtime-read-models.ts";

export function materializeActiveMemorySlots(
  memoryObjects: RuntimeMemoryRecord[],
): ActiveMemorySlotRecord[] {
  const currentBySlot = new Map<string, RuntimeMemoryRecord>();

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
