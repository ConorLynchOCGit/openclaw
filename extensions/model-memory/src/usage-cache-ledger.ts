import type { ContextRunRecord, ContextRunSegmentRecord } from "./runtime-read-models.ts";
import { buildRuntimeId, countRuntimeTokens, hashRuntimeValue } from "./runtime-read-models.ts";

export type ContextUsageInput = {
  actualInputTokens?: number;
  actualOutputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCost?: number;
  cacheRetentionMode?: string;
  promptCacheKey?: string;
};

export type AssembledLedgerSegment = {
  segmentType: ContextRunSegmentRecord["segmentType"];
  sourceKind: string;
  text: string;
  sourceArtifactId?: string;
  projectionVersionId?: string;
  dropped?: boolean;
  trimmed?: boolean;
  trimReason?: string;
};

export type BuildContextRunLedgerInput = {
  sessionId: string;
  agentId: string;
  provider: string;
  model: string;
  stableSegments: AssembledLedgerSegment[];
  semiStableSegments: AssembledLedgerSegment[];
  volatileSegments: AssembledLedgerSegment[];
  usage?: ContextUsageInput;
  compactionUsed?: boolean;
  pruningUsed?: boolean;
  assembledAt?: Date;
};

function hashSegments(segments: AssembledLedgerSegment[]): string {
  return hashRuntimeValue(
    JSON.stringify(
      segments
        .filter((segment) => !(segment.dropped ?? false))
        .map((segment) => ({
          segmentType: segment.segmentType,
          sourceKind: segment.sourceKind,
          text: segment.text,
          trimmed: segment.trimmed ?? false,
          trimReason: segment.trimReason ?? null,
        })),
      null,
      2,
    ),
  );
}

export function buildContextRunLedger(input: BuildContextRunLedgerInput): {
  run: ContextRunRecord;
  segments: ContextRunSegmentRecord[];
} {
  const allSegments = [
    ...input.stableSegments,
    ...input.semiStableSegments,
    ...input.volatileSegments,
  ];
  const assembledAt = input.assembledAt ?? new Date(0);
  const runId = buildRuntimeId(
    "context_run",
    `${input.sessionId}:${input.agentId}:${assembledAt.toISOString()}:${hashSegments(allSegments)}`,
  );
  const segments = allSegments.map((segment, index) => ({
    id: buildRuntimeId("context_segment", `${runId}:${index}:${segment.segmentType}`),
    runId,
    segmentOrder: index,
    segmentType: segment.segmentType,
    sourceArtifactId: segment.sourceArtifactId,
    projectionVersionId: segment.projectionVersionId,
    sourceKind: segment.sourceKind,
    segmentHash: hashRuntimeValue(segment.text),
    estimatedTokens: countRuntimeTokens(segment.text),
    dropped: segment.dropped ?? false,
    trimmed: segment.trimmed ?? false,
    trimReason: segment.trimReason,
  }));

  return {
    run: {
      id: runId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      provider: input.provider,
      model: input.model,
      stableLayerHash: hashSegments(input.stableSegments),
      semiStableLayerHash: hashSegments(input.semiStableSegments),
      volatileLayerHash: hashSegments(input.volatileSegments),
      estimatedInputTokens: segments
        .filter((segment) => !segment.dropped)
        .reduce((sum, segment) => sum + segment.estimatedTokens, 0),
      actualInputTokens: input.usage?.actualInputTokens,
      actualOutputTokens: input.usage?.actualOutputTokens,
      cacheReadTokens: input.usage?.cacheReadTokens,
      cacheWriteTokens: input.usage?.cacheWriteTokens,
      estimatedCost: input.usage?.estimatedCost,
      cacheRetentionMode: input.usage?.cacheRetentionMode,
      promptCacheKey: input.usage?.promptCacheKey,
      compactionUsed: input.compactionUsed ?? false,
      pruningUsed: input.pruningUsed ?? false,
      assembledAt,
    },
    segments,
  };
}
