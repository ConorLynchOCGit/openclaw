export {
  embedMemorySearchQuery,
  getMemorySearchManager,
  MemoryIndexManager,
} from "./src/memory/index.js";
export {
  getBuiltinMemoryEmbeddingProviderDoctorMetadata,
  listBuiltinAutoSelectMemoryEmbeddingProviderDoctorMetadata,
} from "./src/memory/provider-adapters.js";
export type { BuiltinMemoryEmbeddingProviderDoctorMetadata } from "./src/memory/provider-adapters.js";
export type { MemorySearchQueryEmbeddingResult } from "./src/memory/index.js";
