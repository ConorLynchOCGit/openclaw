import { describe, expect, it } from "vitest";
import {
  buildCandidateRepairPayload,
  buildMemoryPromptPlan,
  buildMemoryPromptCacheHealthReport,
  classifyMemoryIngestionFailure,
  createMemoryIngestionTelemetryEvent,
  decideMemoryIngestionRetry,
  evaluateProviderBoundary,
  isMemoryIngestionProviderBoundaryFailure,
  MEMORY_INGESTION_PATHS,
  partitionMemoryEdgesByKnownEndpoints,
  partitionMemoryIngestionCandidates,
  validateMemoryIngestionCandidate,
  type MemoryIngestionCandidate,
} from "./shared-pipeline.ts";

describe("shared memory ingestion pipeline", () => {
  it("defines one failure taxonomy for all ingestion paths", () => {
    expect(MEMORY_INGESTION_PATHS).toEqual([
      "document_ingest",
      "ordinary_turn_capture",
      "tool_result_capture",
      "daily_recovery",
      "bootstrap_import",
      "heartbeat_proactive_capture",
    ]);
    expect(classifyMemoryIngestionFailure("OpenRouter 402 insufficient credits")).toBe(
      "provider_credit",
    );
    expect(classifyMemoryIngestionFailure("provider_response missing text content")).toBe(
      "provider_empty_response",
    );
    expect(classifyMemoryIngestionFailure("connection terminated unexpectedly")).toBe(
      "provider_connection",
    );
    expect(classifyMemoryIngestionFailure("Unexpected token } in JSON")).toBe(
      "provider_json_boundary",
    );
    expect(classifyMemoryIngestionFailure("invalid MMV2 canonicalization repair semantics")).toBe(
      "canonicalization",
    );
    expect(classifyMemoryIngestionFailure("db pool pressure waiting count exceeded")).toBe(
      "pool_pressure",
    );
    expect(isMemoryIngestionProviderBoundaryFailure("provider_json_boundary")).toBe(true);
    expect(isMemoryIngestionProviderBoundaryFailure("canonicalization")).toBe(false);
  });

  it("hard-stops provider credit and gates unsupported structured output", () => {
    const capability = {
      provider: "openrouter",
      model: "openai/gpt-5.4-nano",
      strictSchema: false,
      jsonMode: true,
      cache: false,
      cacheMetrics: false,
      maxContextTokens: 128_000,
      maxOutputTokens: 4096,
      fallbackEligible: true,
    };

    expect(
      evaluateProviderBoundary({
        capability,
        budget: { maxUsd: 10, spentUsd: 10 },
      }),
    ).toMatchObject({
      ok: false,
      failureClass: "provider_credit",
      resumeBlocked: "provider_credit",
    });

    expect(
      evaluateProviderBoundary({
        capability,
        requiresStrictSchema: true,
      }),
    ).toMatchObject({
      ok: false,
      failureClass: "provider_json_boundary",
    });
  });

  it("caps empty-response retry and only falls back to verified providers", () => {
    expect(
      decideMemoryIngestionRetry({
        failureClass: "provider_credit",
        priorAttempts: 0,
      }),
    ).toEqual({ retry: false, reason: "provider_credit is a hard-stop class" });

    expect(
      decideMemoryIngestionRetry({
        failureClass: "provider_empty_response",
        priorAttempts: 0,
        maxEmptyResponseRetries: 1,
        providerHealthy: true,
      }),
    ).toMatchObject({ retry: true, useAlternateProvider: false });

    expect(
      decideMemoryIngestionRetry({
        failureClass: "provider_empty_response",
        priorAttempts: 1,
        maxEmptyResponseRetries: 1,
        alternateProviderVerified: false,
      }),
    ).toMatchObject({ retry: false });

    expect(
      decideMemoryIngestionRetry({
        failureClass: "provider_empty_response",
        priorAttempts: 1,
        maxEmptyResponseRetries: 1,
        alternateProviderVerified: true,
      }),
    ).toMatchObject({ retry: true, useAlternateProvider: true });

    expect(
      decideMemoryIngestionRetry({
        failureClass: "pool_pressure",
        priorAttempts: 0,
        maxConnectionRetries: 1,
      }),
    ).toMatchObject({ retry: true, reduceConcurrency: true });
  });

  it("keeps prompt prefix stable and isolates dynamic source tail", () => {
    const first = buildMemoryPromptPlan({
      path: "document_ingest",
      contractName: "mmv2-extraction",
      staticPrefix: "stable schema and policy",
      dynamicSourceTail: "source A",
      expectedOutputTokens: 512,
      maxContextTokens: 8192,
      maxOutputTokens: 1024,
    });
    const second = buildMemoryPromptPlan({
      path: "document_ingest",
      contractName: "mmv2-extraction",
      staticPrefix: "stable schema and policy",
      dynamicSourceTail: "source B",
      expectedOutputTokens: 512,
      maxContextTokens: 8192,
      maxOutputTokens: 1024,
    });

    expect(first.staticPrefixHash).toBe(second.staticPrefixHash);
    expect(first.dynamicTailHash).not.toBe(second.dynamicTailHash);
  });

  it("reports prompt-cache health from bounded model-call telemetry", () => {
    const report = buildMemoryPromptCacheHealthReport([
      {
        provider: "openai-codex",
        model: "gpt-5.4-mini",
        contractName: "mmv2-extraction",
        promptTokens: 1_000,
        cachedTokens: 800,
        outputTokens: 100,
        latencyMs: 500,
        prefixHash: "prefix-a",
        promptCacheKey: "contract-a",
      },
      {
        provider: "openrouter",
        model: "openai/gpt-5.4-nano",
        contractName: "mmv2-extraction",
        promptTokens: 1_000,
        cachedTokens: 0,
        outputTokens: 120,
        latencyMs: 900,
        prefixHash: "prefix-a",
        promptCacheKey: "contract-a",
      },
    ]);

    expect(report).toMatchObject({
      totalCalls: 2,
      cacheableCalls: 2,
      cacheHits: 1,
      cacheHitRate: 0.5,
      totalPromptTokens: 2_000,
      totalCachedTokens: 800,
      cachedTokenPercentage: 0.4,
      averageCachedTokensPerCall: 400,
      averageLatencyMsCached: 500,
      averageLatencyMsUncached: 900,
    });
  });

  it("validates candidates independently and quarantines invalid siblings", () => {
    const valid: MemoryIngestionCandidate = {
      candidateId: "cand-valid",
      candidateType: "project_fact",
      canonicalText: "The project uses MMV2 durable memory.",
      scope: "workspace",
      sourceRefs: [{ sourceId: "src-1", segmentId: "seg-1", evidenceQuote: "MMV2" }],
    };
    const invalid: MemoryIngestionCandidate = {
      candidateId: "cand-invalid",
      candidateType: "project_fact",
      canonicalText: "",
      scope: "workspace",
      sourceRefs: [{ sourceId: "src-1", segmentId: "seg-2", evidenceQuote: " " }],
    };

    const partitioned = partitionMemoryIngestionCandidates([valid, invalid]);

    expect(partitioned.validCandidates).toEqual([valid]);
    expect(partitioned.quarantinedCandidates).toHaveLength(1);
    expect(partitioned.quarantinedCandidates[0]).toMatchObject({
      candidateId: "cand-invalid",
      failureClass: "canonicalization",
    });
  });

  it("builds candidate repair payloads without full source text", () => {
    const candidate: MemoryIngestionCandidate = {
      candidateId: "cand-repair",
      candidateType: "decision",
      canonicalText: "",
      scope: "project",
      sourceRefs: [{ sourceId: "src", segmentId: "seg", evidenceQuote: "decision line" }],
    };
    const errors = validateMemoryIngestionCandidate(candidate);
    const payload = buildCandidateRepairPayload({ candidate, validationErrors: errors });

    expect(JSON.stringify(payload)).not.toContain("full source");
    expect(payload).toMatchObject({
      candidate_id: "cand-repair",
      candidate_type: "decision",
      validation_errors: [{ code: "missing_canonical_text" }],
    });
  });

  it("defers invalid edges instead of dropping valid edges", () => {
    const result = partitionMemoryEdgesByKnownEndpoints({
      knownMemoryIds: new Set(["memory-a", "memory-b"]),
      edges: [
        { edge_id: "edge-ok", from_memory_id: "memory-a", to_memory_id: "memory-b" },
        { edge_id: "edge-bad", from_memory_id: "memory-a", to_memory_id: "missing" },
      ],
    });

    expect(result.validEdges.map((edge) => edge.edge_id)).toEqual(["edge-ok"]);
    expect(result.deferredEdges).toHaveLength(1);
    expect(result.deferredEdges[0]?.reason).toContain("missing");
  });

  it("rejects dark-data fields from telemetry", () => {
    expect(() =>
      createMemoryIngestionTelemetryEvent({
        path: "document_ingest",
        stage: "telemetry",
        status: "completed",
        ids: {
          rawPrompt: ["do not persist this"],
        },
      }),
    ).toThrow("dark-data field");
  });
});
