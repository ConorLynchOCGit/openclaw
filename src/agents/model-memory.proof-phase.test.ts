import { describe, expect, it } from "vitest";
import type { ModelMemoryObjectRecord } from "../plugin-sdk/model-memory.js";
import {
  buildDuplicateClusterCandidates,
  buildProofGapMap,
  evaluateCutoverReadiness,
  renderAdjudicationMarkdown,
  type IngestionAdjudicationRow,
} from "./model-memory.proof-phase.ts";

function buildMemoryObjectRecord(
  overrides: Partial<ModelMemoryObjectRecord>,
): ModelMemoryObjectRecord {
  return {
    id: overrides.id ?? "memory-001",
    canonicalClass: overrides.canonicalClass ?? "feedback",
    kind: overrides.kind ?? "rule",
    payload: overrides.payload ?? {
      subject: "testing lane",
      recommendedAction: "run pnpm test",
    },
    normalizedSubject: overrides.normalizedSubject ?? "testing lane",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText: overrides.normalizedSearchText ?? "testing lane run pnpm test",
    scope: overrides.scope ?? { projectScope: "openclaw" },
    scopeKey: overrides.scopeKey ?? "scope-openclaw",
    confidence: overrides.confidence ?? "strong",
    durability: overrides.durability ?? "durable",
    suggestedReviewMode: overrides.suggestedReviewMode ?? "auto_accept",
    executedReviewMode: overrides.executedReviewMode ?? "auto_accept",
    rationaleCodes: overrides.rationaleCodes ?? [],
    identityKey: overrides.identityKey ?? `identity-${overrides.id ?? "memory-001"}`,
    slotKey: overrides.slotKey ?? `slot-${overrides.id ?? "memory-001"}`,
    contractName: overrides.contractName ?? "semantic_extraction",
    contractVersion: overrides.contractVersion ?? "v1",
    modelId: overrides.modelId ?? "model-001",
    createdAt: overrides.createdAt ?? new Date(0),
    lifecycleState: overrides.lifecycleState,
    activationBasis: overrides.activationBasis,
    activatedAt: overrides.activatedAt,
    expiredAt: overrides.expiredAt,
    supersededAt: overrides.supersededAt,
  };
}

describe("model-memory proof phase helpers", () => {
  it("flags high-similarity distinct objects as duplicate cluster candidates", () => {
    const clusters = buildDuplicateClusterCandidates([
      buildMemoryObjectRecord({
        id: "memory-001",
        identityKey: "identity-001",
        normalizedSearchText: "testing lane run pnpm test openclaw",
      }),
      buildMemoryObjectRecord({
        id: "memory-002",
        identityKey: "identity-002",
        normalizedSearchText: "testing lane run pnpm test on openclaw",
      }),
      buildMemoryObjectRecord({
        id: "memory-003",
        identityKey: "identity-003",
        normalizedSearchText: "gateway protocol schema contract",
      }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.leftObjectId).toBe("memory-001");
    expect(clusters[0]?.rightObjectId).toBe("memory-002");
  });

  it("renders adjudication exports with the expected review columns", () => {
    const rows: IngestionAdjudicationRow[] = [
      {
        source: "docs/help/testing.md",
        sourceKind: "document",
        sourceWindowId: "window-001",
        lifecycleState: "active",
        supportCount: 2,
        firstPayloadRender: "testing lane | do: run pnpm test",
        matchedPriorObjectId: "memory-000",
        adjudicationPath: "attach_support",
        reviewFlags: ["low_support_active"],
        memoryObjectId: "memory-001",
        supportItemId: "support-001",
        decisionCodes: ["support_attached"],
      },
    ];

    const markdown = renderAdjudicationMarkdown(rows);
    expect(markdown).toContain("# Model Memory Adjudication Export");
    expect(markdown).toContain(
      "| Source | Window | Path | Lifecycle | Supports | Prior | Flags | Payload |",
    );
    expect(markdown).toContain("attach_support");
    expect(markdown).toContain("low_support_active");
  });

  it("marks runtime read model leaks and unstable long-horizon behavior as blockers", () => {
    const proofGaps = buildProofGapMap({
      runtimeReadModelProof: {
        activeMemorySlotCount: 1,
        activeMemorySetCount: 1,
        contextArtifactCount: 1,
        projectionVersionCount: 1,
        slotLeakObjectIds: ["memory-001"],
        setLeakObjectIds: [],
        activeOnlyDefaultReadsHold: false,
      },
      retrievalContextProbes: [
        {
          id: "probe-001",
          queryText: "query",
          selectedCount: 1,
          matchingKindCount: 1,
          matchingClassCount: 1,
          bounded: true,
          activeOnly: true,
          retrievalPackIncluded: true,
          orderedSegmentCount: 2,
          estimatedInputTokens: 200,
          pruningUsed: false,
          stableLayerHash: "stable",
          semiStableLayerHash: "semi",
          volatileLayerHash: "volatile",
          topResults: [],
          layerSegments: [],
        },
      ],
      rebuildProjectionProof: {
        baselineProjectionHashes: { a: "1" },
        rerunProjectionHashes: { a: "1" },
        baselineArtifactHashes: { a: "1" },
        rerunArtifactHashes: { a: "1" },
        projectionHashesStable: true,
        artifactHashesStable: true,
        unchangedRebuildClass: "stable_canonical_runtime",
        supportOnlyProbeClass: "support_only_probe_blocked_no_true_support_only_source",
        supportOnlyProjectionChurn: null,
        supportOnlyArtifactChurn: null,
        supportOnlyStableSurfaceDiffs: [],
      },
      cacheUsageProof: {
        unchangedStableLayerStable: true,
        unchangedSemiStableLayerStable: true,
        unchangedVolatileLayerStable: true,
        supportOnlyStableLayerStable: null,
        supportOnlySemiStableLayerStable: null,
        supportOnlyVolatileLayerStable: null,
        baselineHashes: { stable: "a", semiStable: "b", volatile: "c" },
        repeatedHashes: { stable: "a", semiStable: "b", volatile: "c" },
        supportOnlyHashes: { stable: "a", semiStable: "b", volatile: "d" },
        supportOnlyStableSegmentDiffs: [],
      },
      operatorInspectionProof: {
        recentCaptureCount: 1,
        writeDecisionCount: 1,
        projectionVersionCount: 1,
        retrievalRequestCount: 1,
        retrievalResultSetCount: 1,
        retrievalResultItemCount: 1,
        contextRunCount: 1,
        contextRunSegmentCount: 1,
        surfacesOperational: true,
      },
      shadowSurfaceProof: {
        attempted: true,
        source: "docs/help/testing.md",
        surfaceOperational: true,
        comparisonMeaningful: false,
        matchedIdentityCount: 0,
        modelOnlyIdentityCount: 1,
        legacyOnlyIdentityCount: 0,
        omissionDivergence: true,
        notes: ["shadow_surface_executed_with_stub_legacy_observer"],
      },
      longHorizonSummary: {
        startingActiveObjects: 10,
        endingActiveObjects: 20,
        startingSupportItems: 10,
        endingSupportItems: 12,
        conflictHoldCount: 0,
        provisionalCount: 0,
        expiredCount: 0,
        duplicateActiveObjectCount: 25,
        supportOutgrewObjectsOnReruns: false,
      },
      corpusTotals: {
        canonicalObjectsPersisted: 20,
        supportItemsPersisted: 12,
        provisionalObjectsCreated: 0,
        activeObjects: 20,
        provisionalObjects: 0,
        conflictHoldObjects: 0,
        supersededObjects: 0,
        expiredObjects: 0,
        writeDecisionCounts: { write: 20 },
        duplicateClusterCandidates: [],
      },
    });

    expect(proofGaps.find((gap) => gap.id === "runtime_read_models")?.status).toBe(
      "failing_or_unstable",
    );
    expect(proofGaps.find((gap) => gap.id === "projections_rebuild")?.status).toBe("proven");
    expect(proofGaps.find((gap) => gap.id === "cache_usage")?.status).toBe("proven");
    expect(proofGaps.find((gap) => gap.id === "shadow_runtime_integration")?.status).toBe(
      "already_partially_covered",
    );
    expect(proofGaps.find((gap) => gap.id === "long_horizon_behavior")?.status).toBe(
      "failing_or_unstable",
    );
  });

  it("treats retrieval probe execution failures as proof blockers instead of implicit success", () => {
    const proofGaps = buildProofGapMap({
      runtimeReadModelProof: {
        activeMemorySlotCount: 1,
        activeMemorySetCount: 1,
        contextArtifactCount: 1,
        projectionVersionCount: 1,
        slotLeakObjectIds: [],
        setLeakObjectIds: [],
        activeOnlyDefaultReadsHold: true,
      },
      retrievalContextProbes: [
        {
          id: "probe-error",
          queryText: "query",
          selectedCount: 0,
          matchingKindCount: 0,
          matchingClassCount: 0,
          bounded: false,
          activeOnly: false,
          retrievalPackIncluded: false,
          orderedSegmentCount: 0,
          estimatedInputTokens: 0,
          pruningUsed: false,
          stableLayerHash: "",
          semiStableLayerHash: "",
          volatileLayerHash: "",
          topResults: [],
          layerSegments: [],
          error: "provider 400",
        },
      ],
      rebuildProjectionProof: {
        baselineProjectionHashes: { a: "1" },
        rerunProjectionHashes: { a: "1" },
        baselineArtifactHashes: { a: "1" },
        rerunArtifactHashes: { a: "1" },
        projectionHashesStable: true,
        artifactHashesStable: true,
        unchangedRebuildClass: "stable_canonical_runtime",
        supportOnlyProbeClass: "support_only_probe_blocked_no_true_support_only_source",
        supportOnlyProjectionChurn: null,
        supportOnlyArtifactChurn: null,
        supportOnlyStableSurfaceDiffs: [],
      },
      cacheUsageProof: {
        unchangedStableLayerStable: false,
        unchangedSemiStableLayerStable: false,
        unchangedVolatileLayerStable: false,
        supportOnlyStableLayerStable: null,
        supportOnlySemiStableLayerStable: null,
        supportOnlyVolatileLayerStable: null,
        baselineHashes: { stable: "", semiStable: "", volatile: "" },
        repeatedHashes: { stable: "", semiStable: "", volatile: "" },
        supportOnlyHashes: { stable: "", semiStable: "", volatile: "" },
        supportOnlyStableSegmentDiffs: [],
      },
      operatorInspectionProof: {
        recentCaptureCount: 1,
        writeDecisionCount: 1,
        projectionVersionCount: 1,
        retrievalRequestCount: 0,
        retrievalResultSetCount: 0,
        retrievalResultItemCount: 0,
        contextRunCount: 0,
        contextRunSegmentCount: 0,
        surfacesOperational: true,
      },
      shadowSurfaceProof: {
        attempted: true,
        source: "docs/help/testing.md",
        surfaceOperational: true,
        comparisonMeaningful: false,
        matchedIdentityCount: 0,
        modelOnlyIdentityCount: 0,
        legacyOnlyIdentityCount: 0,
        omissionDivergence: false,
        notes: [],
      },
      longHorizonSummary: {
        startingActiveObjects: 1,
        endingActiveObjects: 1,
        startingSupportItems: 1,
        endingSupportItems: 2,
        conflictHoldCount: 0,
        provisionalCount: 0,
        expiredCount: 0,
        duplicateActiveObjectCount: 0,
        supportOutgrewObjectsOnReruns: true,
      },
      corpusTotals: {
        canonicalObjectsPersisted: 1,
        supportItemsPersisted: 2,
        provisionalObjectsCreated: 0,
        activeObjects: 1,
        provisionalObjects: 0,
        conflictHoldObjects: 0,
        supersededObjects: 0,
        expiredObjects: 0,
        writeDecisionCounts: { write: 1 },
        duplicateClusterCandidates: [],
      },
    });

    expect(proofGaps.find((gap) => gap.id === "retrieval")?.status).toBe("failing_or_unstable");
    expect(proofGaps.find((gap) => gap.id === "context_assembly")?.status).toBe(
      "failing_or_unstable",
    );
  });

  it("produces a not-ready cutover judgment when proof gaps or calibration blockers remain", () => {
    const readiness = evaluateCutoverReadiness({
      proofGaps: [
        {
          id: "retrieval",
          status: "failing_or_unstable",
          owningSeams: ["src/plugin-sdk/model-memory.ts"],
          notes: [],
        },
      ],
      calibration: {
        captureRate: 0.1,
        ignoreRate: 0.9,
        duplicateRate: 0,
        supersessionRate: 0,
        retrievalRequestVolume: 1,
        averageRetrievalCandidateSetSize: 2,
        averageRetrievalPackingSize: 1,
        canonicalClassDistribution: { feedback: 10 },
        kindDistribution: { rule: 10 },
        confidenceDistribution: { strong: 10 },
        reviewModeDistribution: { auto_accept: 10 },
        contractNameDistribution: { semantic_extraction: 10 },
        contractVersionDistribution: { v1: 10 },
        modelIdDistribution: { "openrouter/openai/gpt-5.4-nano": 10 },
        shadowComparisonCount: 0,
        omissionDivergenceCount: 0,
        contextRunCount: 1,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.decision).toBe("not_ready");
    expect(readiness.blockers).toContain("retrieval");
    expect(readiness.blockers).toContain("capture_rate_below_threshold");
  });
});
