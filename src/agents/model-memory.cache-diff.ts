import type { OpenClawConfig } from "../config/config.ts";
import {
  runModelMemoryContextTrace,
  type ContextTraceSegmentReport,
} from "./model-memory.context-trace.ts";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  executeSupportOnlyRebuildDiff,
  type SupportOnlyRebuildDiffReport,
} from "./model-memory.rebuild-diff.ts";

export type CacheLayerSegmentDiff = {
  order: number;
  before?: {
    segmentType: string;
    includeReason: string;
    sourceArtifactId?: string;
    sourceArtifactType?: string;
    sourceArtifactScopeKey?: string;
    projectionTargetId?: string;
    estimatedTokens: number;
    dropped: boolean;
    textPreview: string;
  };
  after?: {
    segmentType: string;
    includeReason: string;
    sourceArtifactId?: string;
    sourceArtifactType?: string;
    sourceArtifactScopeKey?: string;
    projectionTargetId?: string;
    estimatedTokens: number;
    dropped: boolean;
    textPreview: string;
  };
};

export type CacheLayerComparison = {
  stableLayerStable: boolean;
  semiStableLayerStable: boolean;
  volatileLayerStable: boolean;
  changedStableSegments: CacheLayerSegmentDiff[];
  changedSemiStableSegments: CacheLayerSegmentDiff[];
  changedVolatileSegments: CacheLayerSegmentDiff[];
};

export type ModelMemoryCacheDiffReport = {
  generatedAt: string;
  probeId: string;
  modelRef: string;
  unchanged: CacheLayerComparison & {
    baselineHashes: {
      stable: string;
      semiStable: string;
      volatile: string;
    };
    repeatedHashes: {
      stable: string;
      semiStable: string;
      volatile: string;
    };
  };
  supportOnly: CacheLayerComparison & {
    baselineHashes: {
      stable: string;
      semiStable: string;
      volatile: string;
    };
    supportHashes: {
      stable: string;
      semiStable: string;
      volatile: string;
    };
    rebuildDiff: Pick<
      SupportOnlyRebuildDiffReport,
      | "selectedMemoryObjectId"
      | "selectedSummary"
      | "writeDecision"
      | "writeDecisionCodes"
      | "classification"
    >;
  };
};

function selectLayerSegments(
  segments: ContextTraceSegmentReport[],
  layer: ContextTraceSegmentReport["layer"],
): ContextTraceSegmentReport[] {
  return segments.filter((segment) => segment.layer === layer);
}

function normalizeSegment(
  segment: ContextTraceSegmentReport | undefined,
): CacheLayerSegmentDiff["before"] | undefined {
  if (!segment) {
    return undefined;
  }
  return {
    segmentType: segment.segmentType,
    includeReason: segment.includeReason,
    sourceArtifactId: segment.sourceArtifactId,
    sourceArtifactType: segment.sourceArtifactType,
    sourceArtifactScopeKey: segment.sourceArtifactScopeKey,
    projectionTargetId: segment.projectionTargetId,
    estimatedTokens: segment.estimatedTokens,
    dropped: segment.dropped,
    textPreview: segment.textPreview,
  };
}

function diffLayerSegments(
  before: ContextTraceSegmentReport[],
  after: ContextTraceSegmentReport[],
): CacheLayerSegmentDiff[] {
  const length = Math.max(before.length, after.length);
  const diffs: CacheLayerSegmentDiff[] = [];
  for (let index = 0; index < length; index += 1) {
    const left = normalizeSegment(before[index]);
    const right = normalizeSegment(after[index]);
    if (JSON.stringify(left) === JSON.stringify(right)) {
      continue;
    }
    diffs.push({
      order: index,
      before: left,
      after: right,
    });
  }
  return diffs;
}

export async function runModelMemoryCacheDiff(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config: OpenClawConfig;
  probeId: string;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
}): Promise<ModelMemoryCacheDiffReport> {
  const runNonce = `${Date.now()}`;
  const baseline = await runModelMemoryContextTrace({
    runtime: input.runtime,
    config: input.config,
    probeId: input.probeId,
    modelRef: input.modelRef,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    sessionSuffix: `cache-baseline-${runNonce}`,
  });
  const repeated = await runModelMemoryContextTrace({
    runtime: input.runtime,
    config: input.config,
    probeId: input.probeId,
    modelRef: input.modelRef,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    sessionSuffix: `cache-repeat-${runNonce}`,
  });
  const rebuildDiff = await executeSupportOnlyRebuildDiff({
    runtime: input.runtime,
  });
  const support = await runModelMemoryContextTrace({
    runtime: input.runtime,
    config: input.config,
    probeId: input.probeId,
    modelRef: input.modelRef,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    sessionSuffix: `cache-support-${runNonce}`,
  });

  const unchangedStableDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "stable"),
    selectLayerSegments(repeated.context.segments, "stable"),
  );
  const unchangedSemiDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "semi_stable"),
    selectLayerSegments(repeated.context.segments, "semi_stable"),
  );
  const unchangedVolatileDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "volatile"),
    selectLayerSegments(repeated.context.segments, "volatile"),
  );
  const supportStableDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "stable"),
    selectLayerSegments(support.context.segments, "stable"),
  );
  const supportSemiDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "semi_stable"),
    selectLayerSegments(support.context.segments, "semi_stable"),
  );
  const supportVolatileDiff = diffLayerSegments(
    selectLayerSegments(baseline.context.segments, "volatile"),
    selectLayerSegments(support.context.segments, "volatile"),
  );

  return {
    generatedAt: new Date().toISOString(),
    probeId: input.probeId,
    modelRef: input.modelRef,
    unchanged: {
      baselineHashes: {
        stable: baseline.context.stableLayerHash,
        semiStable: baseline.context.semiStableLayerHash,
        volatile: baseline.context.volatileLayerHash,
      },
      repeatedHashes: {
        stable: repeated.context.stableLayerHash,
        semiStable: repeated.context.semiStableLayerHash,
        volatile: repeated.context.volatileLayerHash,
      },
      stableLayerStable: baseline.context.stableLayerHash === repeated.context.stableLayerHash,
      semiStableLayerStable:
        baseline.context.semiStableLayerHash === repeated.context.semiStableLayerHash,
      volatileLayerStable:
        baseline.context.volatileLayerHash === repeated.context.volatileLayerHash,
      changedStableSegments: unchangedStableDiff,
      changedSemiStableSegments: unchangedSemiDiff,
      changedVolatileSegments: unchangedVolatileDiff,
    },
    supportOnly: {
      baselineHashes: {
        stable: baseline.context.stableLayerHash,
        semiStable: baseline.context.semiStableLayerHash,
        volatile: baseline.context.volatileLayerHash,
      },
      supportHashes: {
        stable: support.context.stableLayerHash,
        semiStable: support.context.semiStableLayerHash,
        volatile: support.context.volatileLayerHash,
      },
      stableLayerStable: baseline.context.stableLayerHash === support.context.stableLayerHash,
      semiStableLayerStable:
        baseline.context.semiStableLayerHash === support.context.semiStableLayerHash,
      volatileLayerStable: baseline.context.volatileLayerHash === support.context.volatileLayerHash,
      changedStableSegments: supportStableDiff,
      changedSemiStableSegments: supportSemiDiff,
      changedVolatileSegments: supportVolatileDiff,
      rebuildDiff: {
        selectedMemoryObjectId: rebuildDiff.selectedMemoryObjectId,
        selectedSummary: rebuildDiff.selectedSummary,
        writeDecision: rebuildDiff.writeDecision,
        writeDecisionCodes: rebuildDiff.writeDecisionCodes,
        classification: rebuildDiff.classification,
      },
    },
  };
}

export function renderModelMemoryCacheDiffMarkdown(report: ModelMemoryCacheDiffReport): string {
  const lines = [
    "# Model Memory Cache Diff",
    "",
    `- Probe: ${report.probeId}`,
    `- Model: ${report.modelRef}`,
    "",
    "## Unchanged Corpus",
    "",
    `- Stable hash stable: ${report.unchanged.stableLayerStable}`,
    `- Semi-stable hash stable: ${report.unchanged.semiStableLayerStable}`,
    `- Volatile hash stable: ${report.unchanged.volatileLayerStable}`,
    `- Changed stable segments: ${report.unchanged.changedStableSegments.length}`,
    `- Changed semi-stable segments: ${report.unchanged.changedSemiStableSegments.length}`,
    `- Changed volatile segments: ${report.unchanged.changedVolatileSegments.length}`,
    "",
    "## Support Only",
    "",
    `- Write decision: ${report.supportOnly.rebuildDiff.writeDecision}`,
    `- Support-only classification: ${report.supportOnly.rebuildDiff.classification}`,
    `- Stable hash stable: ${report.supportOnly.stableLayerStable}`,
    `- Semi-stable hash stable: ${report.supportOnly.semiStableLayerStable}`,
    `- Volatile hash stable: ${report.supportOnly.volatileLayerStable}`,
    `- Changed stable segments: ${report.supportOnly.changedStableSegments.length}`,
    `- Changed semi-stable segments: ${report.supportOnly.changedSemiStableSegments.length}`,
    `- Changed volatile segments: ${report.supportOnly.changedVolatileSegments.length}`,
    "",
  ];

  return lines.join("\n");
}
