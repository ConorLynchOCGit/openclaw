// Focused runtime contract for memory file/backend access.

export {
  containsAnyGeneratedSectionBlock,
  buildGeneratedSectionMarkers,
  containsGeneratedSectionBlock,
  renderGeneratedSectionBlock,
  stripGeneratedSectionBlocks,
  upsertGeneratedSectionBlock,
} from "./host/generated-sections.js";
export {
  listDailyMemoryLeafFiles,
  loadDailyMemoryLeaves,
  renderDailyContinuityBody,
  syncDailyContinuityFile,
} from "./host/daily-continuity.js";
export { listMemoryFiles, normalizeExtraMemoryPaths } from "./host/internal.js";
export { readAgentMemoryFile } from "./host/read-file.js";
export { resolveMemoryBackendConfig } from "./host/backend-config.js";
export type { MemorySearchResult } from "./host/types.js";
