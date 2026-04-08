import { describe, expect, it } from "vitest";
import {
  CANONICAL_MEMORY_CANDIDATE_KINDS,
  CANONICAL_MEMORY_INGESTION_MODES,
  createCanonicalMemoryIngestionBatch,
  createCanonicalMemoryIngestionCandidate,
} from "./memory-canonical-ingestion.js";

describe("memory-canonical-ingestion", () => {
  it("defines bounded canonical ingestion modes and candidate kinds", () => {
    expect(CANONICAL_MEMORY_INGESTION_MODES).toContain("ordinary_turn");
    expect(CANONICAL_MEMORY_INGESTION_MODES).toContain("compatibility_adapter");
    expect(CANONICAL_MEMORY_CANDIDATE_KINDS).toEqual([
      "learning",
      "correction",
      "procedure",
      "improvement",
    ]);
  });

  it("creates canonical ingestion candidates around canonical records", () => {
    const candidate = createCanonicalMemoryIngestionCandidate({
      record: {
        kind: "feedback",
        subject: "lazy-loading boundary",
        statement: "open the affected path once after import changes",
        scope: { kind: "project", projectId: "atlas-forge" },
        tags: ["feedback", "workflow"],
        facets: {
          lessonKey: "lazy_loading_boundary",
          toolKey: "pnpm build",
        },
      },
      identity: {
        dedupeKey: "feedback:lazy-loading-boundary",
        clusterKey: "workflow:lazy-loading-boundary",
        subjectKey: "lazy-loading-boundary",
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        observedText: "  Open the affected path once after import changes.  ",
        evidence: ["exact phrase", "exact phrase", "follow-up confirmation"],
        detectionSource: "semantic",
        reviewMode: "hold_for_more_evidence",
      },
      compatibility: {
        transitionalFamilyId: "workflow_improvement",
        candidateKind: "improvement",
        captureClass: "workflow_generalized_guidance",
        metadata: {
          lessonFamily: "generalized_workflow_lesson",
        },
      },
    });

    expect(candidate).toMatchObject({
      record: {
        kind: "feedback",
        subject: "lazy-loading boundary",
        statement: "open the affected path once after import changes",
      },
      identity: {
        dedupeKey: "feedback:lazy-loading-boundary",
        clusterKey: "workflow:lazy-loading-boundary",
        subjectKey: "lazy-loading-boundary",
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        observedText: "Open the affected path once after import changes.",
        evidence: ["exact phrase", "follow-up confirmation"],
        reviewMode: "hold_for_more_evidence",
      },
      compatibility: {
        transitionalFamilyId: "workflow_improvement",
        candidateKind: "improvement",
        captureClass: "workflow_generalized_guidance",
        metadata: {
          lessonFamily: "generalized_workflow_lesson",
        },
      },
    });
  });

  it("builds bounded batches for multiple candidates from one turn", () => {
    const first = createCanonicalMemoryIngestionCandidate({
      record: {
        kind: "user",
        subject: "response format",
        statement: "use bullet points when listing items",
        scope: { kind: "global" },
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        observedText: "Use bullet points when listing items.",
        evidence: ["explicit requirement"],
      },
    });
    const second = createCanonicalMemoryIngestionCandidate({
      record: {
        kind: "project",
        subject: "staging branch",
        statement: "atlas-green",
        scope: { kind: "project", projectId: "atlas-forge" },
      },
      capture: {
        mode: "ordinary_turn",
        source: "transcript",
        observedText: "The staging branch is atlas-green.",
        evidence: ["explicit project fact"],
      },
    });

    expect(
      createCanonicalMemoryIngestionBatch({
        sourceTurnId: "turn-1",
        candidates: [first, second],
      }),
    ).toMatchObject({
      sourceTurnId: "turn-1",
      candidates: [first, second],
    });
  });
});
