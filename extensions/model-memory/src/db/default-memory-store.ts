import type { SemanticCollisionAdjudicator } from "../semantic-collision-adjudication.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./database-memory-object-store.ts";
import { MmV2DatabaseMemoryObjectStore } from "./mmv2-memory-object-store.ts";

type MmV2AwareCanonicalRepository = ModelMemoryCanonicalRepository & {
  listDurableMemories?: () => Promise<unknown>;
  listExistingMemorySummaries?: () => Promise<unknown>;
};

export function createDefaultMemoryObjectStore(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
}): DatabaseMemoryObjectStore {
  const canonicalRepository = input.canonicalRepository as MmV2AwareCanonicalRepository;
  if (
    typeof canonicalRepository.listDurableMemories === "function" ||
    typeof canonicalRepository.listExistingMemorySummaries === "function"
  ) {
    return new MmV2DatabaseMemoryObjectStore(canonicalRepository as never) as never;
  }
  return new DatabaseMemoryObjectStore(input.canonicalRepository, input.collisionAdjudicator);
}
