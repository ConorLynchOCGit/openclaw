import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./db/database-memory-object-store.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import {
  ingestDocument,
  type DocumentIngestionInput,
  type DocumentIngestionResult,
} from "./document-ingestion.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";

export type LiveDocumentIngestionResult = DocumentIngestionResult & {
  writeResults: Awaited<ReturnType<DatabaseMemoryObjectStore["writeCapturedObjects"]>>;
  rebuild?: Awaited<ReturnType<typeof rebuildDerivedRuntimeState>>;
};

export async function ingestDocumentLive(input: {
  canonicalRepository: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: DatabaseMemoryObjectStore;
  ingestion: DocumentIngestionInput;
  rebuildRuntime?: boolean;
}): Promise<LiveDocumentIngestionResult> {
  const result = await ingestDocument(input.ingestion);
  const source = await input.canonicalRepository.persistSource(result.source);
  await input.canonicalRepository.persistSourceWindows(result.windows);
  const memoryStore = input.memoryStore ?? new DatabaseMemoryObjectStore(input.canonicalRepository);
  const writeResults = await memoryStore.writeCapturedObjects(result.capturedObjects);
  const rebuild =
    input.runtimeRepository && (input.rebuildRuntime ?? true)
      ? await rebuildDerivedRuntimeState({
          canonicalRepository: input.canonicalRepository,
          runtimeRepository: input.runtimeRepository,
        })
      : undefined;

  return {
    ...result,
    source,
    writeResults,
    rebuild,
  };
}
