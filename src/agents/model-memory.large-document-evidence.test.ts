import { describe, expect, it } from "vitest";
import {
  TIER_ONE_LARGE_DOCUMENT_CASES,
  renderLargeDocumentEvidenceMarkdown,
  type LargeDocumentEvidenceReport,
} from "./model-memory.large-document-evidence.js";

describe("model-memory large-document evidence", () => {
  it("keeps the Tier 1 execution order aligned with the inventory", () => {
    expect(TIER_ONE_LARGE_DOCUMENT_CASES.map((entry) => entry.relativePath)).toEqual([
      "AGENTS.md",
      "docs/help/testing.md",
      "docs/gateway/configuration.md",
      "docs/gateway/protocol.md",
      "docs/projects/model-memory/specs/database-schema-v1.md",
      "docs/projects/model-memory/proof-corpus-plan.md",
    ]);
  });

  it("renders a readable markdown report without exact-string proof scoring logic", () => {
    const report: LargeDocumentEvidenceReport = {
      generatedAt: "2026-04-13T00:00:00.000Z",
      modelRef: "openrouter/anthropic/claude-sonnet-4-6",
      candidateModelRef: "openrouter/openai/gpt-5.4-nano",
      requestSeed: 7,
      requestTimeoutMs: 180000,
      databaseName: "model_memory",
      maxWordsPerWindow: 1000,
      rerunMode: "full",
      cases: [
        {
          id: "tier1-agents",
          relativePath: "AGENTS.md",
          sourceKind: "document",
          lineCount: 260,
          purposes: ["rule_extraction"],
          classification: "bootstrap_preservation_sensitive_input",
          omissionFindings: ["bootstrap_sensitive_review_required"],
          provenanceFindings: ["all_captured_objects_have_structured_provenance"],
          duplicateFindings: ["full_rerun_support_attachment_stability"],
          rebuildFindings: ["projection_hashes_stable_on_rerun"],
          firstRun: {
            sourceId: "source-001",
            windowCount: 4,
            elapsedMs: 1200,
            requestSeed: 7,
            requestTimeoutMs: 180000,
            executionRequestCount: 3,
            executionContractVersionCounts: {
              "v2-candidate": 1,
              "v2-canonicalization": 1,
              "v2-canonicalization-repair": 1,
            },
            executionResolvedModelIds: ["openai/gpt-5.4-nano-20260317"],
            executionResolvedModelIdsByContractVersion: {
              "v2-candidate": ["openai/gpt-5.4-nano-20260317"],
              "v2-canonicalization": ["openai/gpt-5.4-nano-20260317"],
              "v2-canonicalization-repair": ["openai/gpt-5.4-nano-20260317"],
            },
            executionTracesByContractVersion: {
              "v2-candidate": [
                {
                  sourceWindowId: "window-001",
                  action: "capture",
                  objectCount: 2,
                  summaries: ["rule:use pnpm check", "procedure:run pnpm test"],
                },
              ],
              "v2-canonicalization": [
                {
                  sourceWindowId: "window-001",
                  action: "capture",
                  objectCount: 1,
                  summaries: ['feedback/rule payload={"subject":"landing gate"} scope={}'],
                },
              ],
            },
            capturedObjectCount: 1,
            ignoredWindowCount: 3,
            rejectedWindowCount: 0,
            writeDecisionCounts: { write: 1 },
            objectSummaries: [
              {
                identityKey: "identity-001",
                canonicalClass: "feedback",
                kind: "rule",
                payload: { subject: "landing gate" },
                scope: {},
                provenanceCount: 1,
                firstHeadingPath: ["Build"],
              },
            ],
            projectionContentHashes: { "memory-md": "hash-001" },
            contextArtifactHashes: { "project_memory_pack:global": "artifact-001" },
            activeMemorySlotCount: 1,
            activeMemorySetCount: 0,
            projectionVersionCount: 1,
            contextArtifactCount: 1,
            provenanceValid: true,
            rejectReasons: [],
            executed: true,
          },
          secondRun: {
            sourceId: "source-001",
            windowCount: 4,
            elapsedMs: 900,
            requestSeed: 7,
            requestTimeoutMs: 180000,
            executionRequestCount: 1,
            executionContractVersionCounts: { "v2-candidate": 1 },
            executionResolvedModelIds: ["openai/gpt-5.4-nano-20260317"],
            executionResolvedModelIdsByContractVersion: {
              "v2-candidate": ["openai/gpt-5.4-nano-20260317"],
            },
            executionTracesByContractVersion: {
              "v2-candidate": [
                {
                  sourceWindowId: "window-001",
                  action: "capture",
                  objectCount: 2,
                  summaries: ["rule:use pnpm check", "procedure:run pnpm test"],
                },
              ],
            },
            capturedObjectCount: 1,
            ignoredWindowCount: 3,
            rejectedWindowCount: 0,
            writeDecisionCounts: { attach_support: 1 },
            objectSummaries: [],
            projectionContentHashes: { "memory-md": "hash-001" },
            contextArtifactHashes: { "project_memory_pack:global": "artifact-001" },
            activeMemorySlotCount: 1,
            activeMemorySetCount: 0,
            projectionVersionCount: 1,
            contextArtifactCount: 1,
            provenanceValid: true,
            rejectReasons: [],
            executed: true,
          },
        },
      ],
    };

    const markdown = renderLargeDocumentEvidenceMarkdown(report);
    expect(markdown).toContain("# Model Memory Large-Document Evidence");
    expect(markdown).toContain("AGENTS.md");
    expect(markdown).toContain("full_rerun_support_attachment_stability");
    expect(markdown).toContain("Candidate model: openrouter/openai/gpt-5.4-nano");
    expect(markdown).toContain("Request seed: 7");
    expect(markdown).toContain("Request timeout ms: 180000");
    expect(markdown).toContain("Rerun mode: full");
    expect(markdown).toContain("First run elapsed ms: 1200");
    expect(markdown).toContain("First run execution request count: 3");
    expect(markdown).toContain(
      'First run contract object counts: {"v2-candidate":[2],"v2-canonicalization":[1]}',
    );
    expect(markdown).not.toContain("statementIncludes");
  });
});
