import type { ModelMemoryObject } from "./semantic-schema.ts";

export type MemoryIdentityDescriptor = {
  identityKey: string;
  slotKey?: string;
  scopeKey: string;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
};

const SAME_SLOT_KINDS = new Set<ModelMemoryObject["kind"]>(["preference", "fact"]);

export function isDeterministicSameSlotSupersession(
  prior: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
  next: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
): boolean {
  return (
    SAME_SLOT_KINDS.has(prior.kind) &&
    SAME_SLOT_KINDS.has(next.kind) &&
    prior.kind === next.kind &&
    !!prior.slotKey &&
    prior.slotKey === next.slotKey &&
    prior.identityKey !== next.identityKey
  );
}
