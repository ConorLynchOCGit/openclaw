import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { summarizeParallelContextScoutResults } from "./parallel-context-scout-boundary-replay.ts";

describe("parallel context scout boundary replay", () => {
  it("summarizes per-commitment scout results without raw storage", () => {
    const summary = summarizeParallelContextScoutResults({
      runtimeJobId: "job-1",
      graphId: "graph-1",
      concurrency: 4,
      commitmentResults: [
        {
          commitmentId: "commitment-a",
          nodeId: "context_scout-a",
          packetRef: "packet://a",
          status: "succeeded",
          contextHandoffPacketRef: "runtime-job://job-1/context-handoff/a",
          contextScoutToolLoopRef: "runtime-job://job-1/context-scout/tool-loop/a",
          verifiedFileRefs: ["extensions/execution-platform/src/workflows/a.ts"],
          rejectedRefs: [],
          codeIntelligenceResultRefs: ["code-intelligence://code.search_symbols/a"],
          codeIntelligenceRuntimeToolInvocationRefs: ["runtime-tool://code-a"],
          codeIntelligenceSymbolRefs: ["extensions/execution-platform/src/workflows/a.ts:buildA"],
          codeIntelligenceDiagnosticRefs: [],
          codeIntelligenceRelatedTestRefs: [
            "extensions/execution-platform/src/workflows/a.test.ts",
          ],
          codeIntelligenceImpactRefs: ["extensions/execution-platform/src/workflows/a.ts"],
          codeIntelligenceSemanticModes: ["structural"],
          codeIntelligenceLimitations: [
            "Code intelligence is using bounded structural mode; LSP semantic backend is not yet attached.",
          ],
          codeIntelligenceBackendIds: ["structural_parser"],
          codeIntelligenceBackendHealthRefs: [
            "code-intelligence-backend-health://structural_parser/a",
          ],
          codeIntelligenceWorkspaceSnapshotRefs: ["code-intelligence-workspace://a"],
          codeIntelligenceFallbackReasonCodes: ["code_intelligence_structural_fallback_used"],
          codeIntelligenceDiagnosticVersionRefs: ["code-intelligence-diagnostics://a"],
          codeIntelligenceProjectConfigRefs: ["repo-config://tsconfig.json#a"],
          codeIntelligenceBackendLatencyMs: 12,
          codeIntelligenceResultCounts: { symbols: 1 },
          implementationBlocked: false,
          reasonCodes: ["context_scout_boundary_replay_succeeded"],
          missingInformation: [],
          repairInstructions: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        {
          commitmentId: "commitment-b",
          nodeId: "context_scout-b",
          packetRef: "packet://b",
          status: "needs_review",
          contextHandoffPacketRef: null,
          contextScoutToolLoopRef: "runtime-job://job-1/context-scout/tool-loop/b",
          verifiedFileRefs: [],
          rejectedRefs: ["context-scout-rejection://b/no-refs"],
          codeIntelligenceResultRefs: [],
          codeIntelligenceRuntimeToolInvocationRefs: [],
          codeIntelligenceSymbolRefs: [],
          codeIntelligenceDiagnosticRefs: [],
          codeIntelligenceRelatedTestRefs: [],
          codeIntelligenceImpactRefs: [],
          codeIntelligenceSemanticModes: [],
          codeIntelligenceLimitations: [],
          codeIntelligenceBackendIds: [],
          codeIntelligenceBackendHealthRefs: [],
          codeIntelligenceWorkspaceSnapshotRefs: [],
          codeIntelligenceFallbackReasonCodes: [],
          codeIntelligenceDiagnosticVersionRefs: [],
          codeIntelligenceProjectConfigRefs: [],
          codeIntelligenceBackendLatencyMs: null,
          codeIntelligenceResultCounts: {},
          implementationBlocked: true,
          reasonCodes: ["context_scout_verified_file_refs_missing"],
          missingInformation: ["No verified repo file refs were produced."],
          repairInstructions: ["Request more bounded context."],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "needs_review",
      packetCount: 2,
      acceptedCount: 1,
      acceptedWithLimitationsCount: 0,
      needsReviewCount: 1,
      failedCount: 0,
      synthesisBarrierNodeId: null,
      contextSupplyEdgeRefs: [],
      synthesisReady: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    expect(summary.reasonCodes).toContain("parallel_context_scout_boundary_replay_needs_review");
  });

  it("does not create a global context synthesis barrier as default replay glue", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./parallel-context-scout-boundary-replay.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain('nodeKind: "context_synthesis"');
    expect(source).not.toContain("runtimeOwnedContextSynthesisBarrier");
    expect(source).not.toContain("context_synthesis_global_barrier");
  });
});
