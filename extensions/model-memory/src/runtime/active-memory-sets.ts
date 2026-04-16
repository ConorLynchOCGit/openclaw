import {
  buildRuntimeId,
  getCurrentMemoryObjects,
  type ActiveMemorySetRecord,
} from "../runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "../storage-database-contract.ts";

export function buildActiveMemorySetKey(record: ModelMemoryObjectRecord): string {
  return [record.canonicalClass, record.kind, record.scopeKey ?? "global"].join(":");
}

export function materializeActiveMemorySets(
  memoryObjects: ModelMemoryObjectRecord[],
): ActiveMemorySetRecord[] {
  return getCurrentMemoryObjects(memoryObjects)
    .map((record) => {
      const setKey = buildActiveMemorySetKey(record);
      const sortKey = [
        record.normalizedTitle ?? record.normalizedSubject ?? record.normalizedSearchText,
        record.identityKey,
      ].join("|");

      return {
        id: buildRuntimeId("set_item", `${setKey}:${record.id}`),
        setKey,
        canonicalClass: record.canonicalClass,
        kind: record.kind,
        scopeKey: record.scopeKey,
        memoryObjectId: record.id,
        sortKey,
        updatedAt: record.createdAt,
      };
    })
    .sort((left, right) => {
      if (left.setKey !== right.setKey) {
        return left.setKey.localeCompare(right.setKey);
      }
      return left.sortKey.localeCompare(right.sortKey);
    });
}
