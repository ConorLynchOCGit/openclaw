import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
} from "./db/runtime.js";
import {
  buildMemorySoakApplicationEvent,
  buildMemorySoakRetrievalEvent,
  buildMemorySoakTelemetrySummary,
  renderMemorySoakTelemetryDailyBrief,
  renderMemorySoakTelemetryOperatorSummary,
  writeMemorySoakTelemetrySummaryArtifacts,
  type MemorySoakTelemetryEvent,
} from "./memory-soak-telemetry.js";

describe("memory soak telemetry", () => {
  it("builds durable summaries and writes latest plus history artifacts", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "memory-soak-telemetry-"));
    try {
      const events: MemorySoakTelemetryEvent[] = [
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:00:00.000Z",
          category: "capture",
          action: "turn_summary",
          source: "ordinary_turn_auto_capture",
          sessionKey: "agent:main:main",
          posture: "bulk",
          segmentCount: 18,
          candidatePlanCount: 9,
          acceptedCaptureCount: 3,
          deferredOverflowCount: 4,
          acceptedCaptureLimit: 3,
          deferredOverflowLimit: 6,
          demandSignals: ["bulk_memory_packet_request", "corpus_ingestion_request"],
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:01:00.000Z",
          category: "capture",
          action: "candidate_duplicate_suppressed",
          source: "ordinary_turn_auto_capture",
          family: "preference",
          scope: "shared",
          status: "candidate_duplicate_suppressed",
          accepted: false,
          reason: "recent_duplicate",
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:02:00.000Z",
          category: "retrieval",
          action: "hybrid_search",
          source: "memory_object_search_hybrid",
          queryHash: "abc123",
          queryPreview: "how should I land this?",
          accepted: true,
          status: "ok",
          recordCount: 2,
          approvedCount: 2,
          candidateCount: 0,
          validatedCount: 0,
          familyCounts: { workflow_improvement: 2 },
          scopeCounts: { shared: 1, project: 1 },
          sameSubjectCollisionCount: 1,
          conflictingSubjectCount: 1,
          temporalAmbiguityCount: 1,
          strongerScopePresentBelowTop: true,
          projectOverridesShared: false,
          agentOverridesShared: false,
          topRecords: [],
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:03:00.000Z",
          category: "application",
          action: "learned_guidance_plan",
          source: "memory_learned_guidance_plan",
          queryHash: "def456",
          queryPreview: "how should I land this?",
          accepted: true,
          status: "ok",
          outcome: "guidance_available",
          applicationMode: "guidance_only",
          retrievedRecordCount: 2,
          eligibleWorkflowGuidanceCount: 1,
          filteredOutByScopeCount: 1,
          suggestionCount: 1,
          suppressedConflictCount: 1,
          wrongShapeDominanceProxy: false,
          noGuidanceDespiteRetrieval: false,
          suggestionScopeCounts: { project: 1 },
          suggestionStateCounts: { approved: 1 },
          suppressedConflictSubjectKeys: ["workflow:landing"],
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:03:30.000Z",
          category: "application",
          action: "memory_context_outcome",
          source: "memory_context_outcome_tracker",
          outcome: "pack_attached",
          attribution: "observational",
          runId: "run-1",
          sessionId: "session-1",
          agentId: "main",
          packCount: 2,
          packKinds: ["user", "project"],
          attachedSlotCount: 2,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:03:40.000Z",
          category: "application",
          action: "memory_context_outcome",
          source: "memory_context_outcome_tracker",
          outcome: "response_observed",
          attribution: "observational",
          runId: "run-1",
          sessionId: "session-1",
          agentId: "main",
          packCount: 2,
          packKinds: ["user", "project"],
          attachedSlotCount: 2,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:03:50.000Z",
          category: "application",
          action: "memory_context_outcome",
          source: "memory_context_outcome_tracker",
          outcome: "survived_turn_boundary",
          attribution: "proxy",
          runId: "run-1",
          sessionId: "session-1",
          agentId: "main",
          packCount: 2,
          packKinds: ["user", "project"],
          attachedSlotCount: 2,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:03:55.000Z",
          category: "application",
          action: "memory_context_outcome",
          source: "memory_context_outcome_tracker",
          outcome: "guidance_missed",
          attribution: "causal",
          runId: "run-1",
          sessionId: "session-1",
          agentId: "main",
          packCount: 2,
          packKinds: ["user", "project"],
          attachedSlotCount: 2,
          suggestionCount: 0,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:04:00.000Z",
          category: "review",
          action: "candidate_review",
          source: "candidate_review",
          accepted: true,
          status: "recorded",
          candidateId: "candidate-1",
          family: "workflow_improvement",
          scope: "project",
          deferredOverflowCandidate: true,
          outcome: "accepted",
          reviewState: "candidate",
          memoryObjectStateChanged: false,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:05:00.000Z",
          category: "review",
          action: "candidate_promotion",
          source: "candidate_promotion",
          accepted: true,
          status: "promoted",
          candidateId: "candidate-1",
          family: "workflow_improvement",
          scope: "project",
          deferredOverflowCandidate: true,
          promotionTarget: "memory",
          promotedObjectId: "memory-1",
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:06:00.000Z",
          category: "projection",
          action: "native_sync_projection",
          source: "memory_native_sync",
          write: false,
          scopes: ["shared", "projects", "agents", "daily"],
          changedTargets: 2,
          totalTargets: 5,
          selectedEntries: 12,
          omittedEntries: 3,
          skippedRecords: 1,
          unmatchedRecords: 2,
          recoveredPartialBlocks: 1,
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:07:00.000Z",
          category: "orchestration",
          action: "session_memory_update",
          source: "session_memory",
          sessionId: "session-1",
          agentId: "agent-1",
          importantFactsCount: 9,
          demandSignals: ["fact_dense_session_memory"],
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:08:00.000Z",
          category: "orchestration",
          action: "compaction_plan",
          source: "compaction_planning",
          outcome: "needs_compaction",
          estimatedPromptTokens: 220_000,
          estimatedPromptTokenThreshold: 200_000,
          clearCandidateCount: 4,
          sessionMemoryStatus: "present",
          demandSignals: ["compaction_pressure_high"],
        },
        {
          schemaVersion: 1,
          recordedAt: "2026-04-10T10:09:00.000Z",
          category: "orchestration",
          action: "native_sync_run",
          source: "memory_native_sync",
          write: false,
          scopes: ["shared", "projects", "agents", "daily"],
          workspaceDir: "/workspace",
          telemetrySummaryIncluded: true,
        },
      ];

      const summary = buildMemorySoakTelemetrySummary({
        events,
        generatedAt: "2026-04-10T10:10:00.000Z",
      });
      const artifacts = await writeMemorySoakTelemetrySummaryArtifacts({
        rootDir,
        summary,
      });
      const latestSummary = await readFile(artifacts.latestSummaryPath, "utf8");
      const latestJson = JSON.parse(await readFile(artifacts.latestJsonPath, "utf8")) as {
        capture: { bulkTurns: number };
      };

      expect(summary.capture.turnSummaries).toBe(1);
      expect(summary.capture.bulkTurns).toBe(1);
      expect(summary.capture.deferredOverflowCount).toBe(4);
      expect(summary.retrieval.strongerScopePresentBelowTopCount).toBe(1);
      expect(summary.application.filteredOutByScopeCount).toBe(1);
      expect(summary.application.memoryContextAttachments).toBe(1);
      expect(summary.application.memoryContextResponses).toBe(1);
      expect(summary.application.survivedTurnBoundaryCount).toBe(1);
      expect(summary.application.memoryContextResponseRate).toBe(1);
      expect(summary.application.survivalAfterResponseRate).toBe(1);
      expect(summary.application.repeatedCorrectionAfterResponseRate).toBe(0);
      expect(summary.application.repeatedCorrectionAvoidanceRate).toBe(1);
      expect(summary.application.guidanceAlignmentRate).toBe(0);
      expect(summary.application.guidanceMissCount).toBe(1);
      expect(summary.application.causalGuidanceUsefulnessRate).toBe(0);
      expect(summary.review.deferredOverflowPromotions).toBe(1);
      expect(summary.projection.runs).toBe(1);
      expect(summary.orchestration.factDenseSessionMemoryCount).toBe(1);
      expect(summary.orchestration.highCompactionPressureCount).toBe(1);
      expect(summary.corpusDemand.signalCounts.corpus_ingestion_request).toBe(1);
      expect(summary.attentionFlags).toContain(
        "some retrievals returned broader top records while more specific records were also present",
      );
      expect(renderMemorySoakTelemetryOperatorSummary(summary)).toContain(
        "# Memory Soak Telemetry Summary",
      );
      expect(renderMemorySoakTelemetryOperatorSummary(summary)).toContain(
        "- memory_context_response_rate: 100.0%",
      );
      expect(renderMemorySoakTelemetryOperatorSummary(summary)).toContain(
        "- causal_guidance_missed_with_attached_memory: 1",
      );
      expect(renderMemorySoakTelemetryDailyBrief(summary)).toContain("memory_soak:");
      expect(latestSummary).toContain("Corpus Demand Signals");
      expect(latestJson.capture.bulkTurns).toBe(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("derives retrieval and application proxies from real result shapes", () => {
    const input: MemoryObjectSearchHybridInput = {
      query: "how should I land this carefully",
      scope: "approved_only",
      kind: "project",
    };
    const result = {
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: input.query,
      records: [
        {
          objectType: "memory_object",
          id: "memory-shared",
          memoryKind: "feedback",
          projectId: null,
          sessionId: null,
          reviewState: "approved",
          content: "Use the safer landing path.",
          summary: null,
          metadata: {
            autoCapture: {
              subjectKey: "workflow:landing",
              captureClass: "workflow_generalized_guidance",
              agentExternalKey: "main",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 110,
          matchedFields: ["content_substring"],
        },
        {
          objectType: "memory_object",
          id: "memory-project",
          memoryKind: "project",
          projectId: "ops",
          sessionId: null,
          reviewState: "approved",
          content: "Use the safer landing path, with project-specific rollout steps.",
          summary: null,
          metadata: {
            autoCapture: {
              subjectKey: "workflow:landing",
              captureClass: "workflow_generalized_guidance",
              projectScope: "ops",
              agentExternalKey: "main",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 90,
          matchedFields: ["content_substring"],
        },
      ],
    } as unknown as MemoryObjectSearchHybridResult;

    const retrievalEvent = buildMemorySoakRetrievalEvent({
      input,
      result,
      recordedAt: "2026-04-10T11:00:00.000Z",
    });
    const applicationEvent = buildMemorySoakApplicationEvent({
      query: input.query,
      projectId: "ops",
      recordedAt: "2026-04-10T11:01:00.000Z",
      result: {
        accepted: true,
        status: "ok",
        outcome: "no_guidance",
        advisoryOnly: true,
        advisoryNote: "Advisory only.",
        query: input.query,
        applicationMode: "guidance_only",
        suggestions: [],
        suppressedConflicts: [],
        rationale: [],
        rolloutScope: {
          rolloutPhase: "bounded_rollout_proof_v1",
          enablementTarget: "off-production",
          mode: "inline-only",
          source: "approved_preferred_workflow_guidance",
          approvedOnly: false,
          approvedPreferred: true,
          candidateAdvisoryIncluded: true,
          advisoryOnly: true,
          inlineOnly: true,
          allowedCaptureClasses: ["workflow_generalized_guidance"],
          defaultMaxSuggestions: 2,
        },
        observability: {
          outcomeCode: "no_guidance",
          retrievedRecordCount: 2,
          eligibleWorkflowGuidanceCount: 0,
          filteredOutByScopeCount: 1,
          suggestionCount: 0,
          suppressedConflictCount: 0,
          nativeSuggestionCount: 0,
          selfImprovingSuggestionCount: 0,
          estimatedPromptTokens: 18,
          reasons: ["records were retrieved but not eligible"],
        },
      },
    });

    expect(retrievalEvent.sameSubjectCollisionCount).toBe(1);
    expect(retrievalEvent.conflictingSubjectCount).toBe(1);
    expect(retrievalEvent.strongerScopePresentBelowTop).toBe(true);
    expect(applicationEvent.noGuidanceDespiteRetrieval).toBe(true);
    expect(applicationEvent.wrongShapeDominanceProxy).toBe(true);
    expect(applicationEvent.filteredOutByScopeCount).toBe(1);
  });
});
