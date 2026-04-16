import path from "node:path";
import {
  buildHarnessProjectionOutputs,
  runModelMemoryContextEngine,
  type ContextArtifactRecord,
  type SessionContextStateRecord,
  type WorkspaceProjectionTargetRecord,
  type WorkspaceProjectionVersionRecord,
} from "../plugin-sdk/model-memory.js";
import { normalizeUsage, type UsageLike } from "./usage.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_USER_FILENAME,
  type WorkspaceBootstrapFile,
  type WorkspaceBootstrapFileName,
} from "./workspace.js";

const MODEL_MEMORY_BOOTSTRAP_FILENAMES = new Set<WorkspaceBootstrapFileName>([
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_USER_FILENAME,
]);

function resolveBootstrapFileName(relativePath: string): WorkspaceBootstrapFileName | undefined {
  const candidate = path.basename(relativePath) as WorkspaceBootstrapFileName;
  return MODEL_MEMORY_BOOTSTRAP_FILENAMES.has(candidate) ? candidate : undefined;
}

export function integrateModelMemoryWithHarness(input: {
  sessionId: string;
  agentId: string;
  sessionState?: SessionContextStateRecord;
  projectionTargets: WorkspaceProjectionTargetRecord[];
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
  artifacts: ContextArtifactRecord[];
  recentTurns: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  toolResults: string[];
  currentTurn: string;
  maxTokens: number;
  provider: string;
  model: string;
  rawUsage?: UsageLike;
  includeRetrievalPacks?: boolean;
}): {
  bootstrapFiles: WorkspaceBootstrapFile[];
  normalizedUsage: ReturnType<typeof normalizeUsage>;
  engine: ReturnType<typeof runModelMemoryContextEngine>;
} {
  const normalizedUsage = normalizeUsage(input.rawUsage);
  const engine = runModelMemoryContextEngine({
    sessionId: input.sessionId,
    agentId: input.agentId,
    sessionState: input.sessionState,
    projectionVersions: input.projectionVersions,
    projectionTexts: input.projectionOutputs,
    artifacts: input.artifacts,
    recentTurns: input.recentTurns,
    toolResults: input.toolResults,
    currentTurn: input.currentTurn,
    maxTokens: input.maxTokens,
    provider: input.provider,
    model: input.model,
    usage: normalizedUsage
      ? {
          actualInputTokens: normalizedUsage.input,
          actualOutputTokens: normalizedUsage.output,
          cacheReadTokens: normalizedUsage.cacheRead,
          cacheWriteTokens: normalizedUsage.cacheWrite,
        }
      : undefined,
    includeRetrievalPacks: input.includeRetrievalPacks,
  });

  const bootstrapFiles = buildHarnessProjectionOutputs({
    projectionTargets: input.projectionTargets,
    projectionVersions: input.projectionVersions,
    projectionOutputs: input.projectionOutputs,
  }).flatMap((projection): WorkspaceBootstrapFile[] => {
    const fileName = resolveBootstrapFileName(projection.relativePath);
    if (!fileName) {
      return [];
    }
    return [
      {
        name: fileName,
        path: projection.relativePath,
        content: projection.content,
        missing: false,
      },
    ];
  });

  return {
    bootstrapFiles,
    normalizedUsage,
    engine,
  };
}
