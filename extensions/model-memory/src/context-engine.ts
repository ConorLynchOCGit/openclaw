import type {
  ContextArtifactRecord,
  SessionContextStateRecord,
  WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";
import { assembleContext } from "./runtime/context/assemble.ts";
import { bootstrapContext } from "./runtime/context/bootstrap.ts";
import { buildContextRunLedger, type ContextUsageInput } from "./usage-cache-ledger.ts";

export type ModelMemoryContextEngineInput = {
  sessionId: string;
  agentId: string;
  sessionState?: SessionContextStateRecord;
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionTexts: Record<string, string>;
  artifacts: ContextArtifactRecord[];
  recentTurns: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  toolResults: string[];
  currentTurn: string;
  maxTokens: number;
  provider: string;
  model: string;
  usage?: ContextUsageInput;
  includeRetrievalPacks?: boolean;
};

export function runModelMemoryContextEngine(input: ModelMemoryContextEngineInput) {
  const bootstrap = bootstrapContext({
    sessionId: input.sessionId,
    agentId: input.agentId,
    sessionState: input.sessionState,
    projectionVersions: input.projectionVersions,
    artifacts: input.artifacts,
  });
  const assembled = assembleContext({
    projectionVersions: bootstrap.projectionVersions,
    projectionTexts: input.projectionTexts,
    artifacts: input.artifacts,
    recentTurns: input.recentTurns,
    toolResults: input.toolResults,
    currentTurn: input.currentTurn,
    maxTokens: input.maxTokens,
    includeRetrievalPacks: input.includeRetrievalPacks,
  });
  const ledger = buildContextRunLedger({
    sessionId: input.sessionId,
    agentId: input.agentId,
    provider: input.provider,
    model: input.model,
    stableSegments: assembled.stableSegments.map((segment) => ({
      segmentType: segment.segmentType,
      sourceKind: segment.sourceKind,
      text: segment.text,
      sourceArtifactId: segment.sourceArtifactId,
      projectionVersionId: segment.projectionVersionId,
    })),
    semiStableSegments: assembled.semiStableSegments.map((segment) => ({
      segmentType: segment.segmentType,
      sourceKind: segment.sourceKind,
      text: segment.text,
      sourceArtifactId: segment.sourceArtifactId,
      projectionVersionId: segment.projectionVersionId,
    })),
    volatileSegments: assembled.volatileSegments.map((segment) => ({
      segmentType: segment.segmentType,
      sourceKind: segment.sourceKind,
      text: segment.text,
      sourceArtifactId: segment.sourceArtifactId,
      projectionVersionId: segment.projectionVersionId,
    })),
    usage: input.usage,
    compactionUsed: false,
    pruningUsed: assembled.pruningUsed,
  });

  return {
    bootstrap,
    assembled,
    ledger,
    ownsCompaction: false as const,
  };
}
