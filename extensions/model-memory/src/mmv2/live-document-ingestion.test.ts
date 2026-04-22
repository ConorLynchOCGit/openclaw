import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptDocumentSource } from "../source-adapters/document-source-adapter.ts";
import {
  ingestDocumentV2ForLivePath,
  MMV2_LIVE_DOCUMENT_CONTRACT_VERSION,
} from "./live-document-ingestion.ts";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { buildAdmissionDecision, buildCanonicalCandidate } from "./test-helpers.ts";

const { ingestDocumentV2CoreMock, ingestDocumentV2ShadowMock } = vi.hoisted(() => ({
  ingestDocumentV2CoreMock: vi.fn(),
  ingestDocumentV2ShadowMock: vi.fn(),
}));

vi.mock("./document-shadow-ingestion.ts", () => ({
  ingestDocumentV2Core: ingestDocumentV2CoreMock,
  ingestDocumentV2Shadow: ingestDocumentV2ShadowMock,
}));

function createCoreRun() {
  const envelope = adaptDocumentSource({
    externalSourceId: "doc-live-001",
    text: "# Project\nDeployment region is us-east-1.\n\n1. Run the tests.\n2. Ship the build.",
    sourceKind: "document",
    maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
  });
  const rawEvent = createRawIngestEvent({
    sourceId: envelope.source.id,
    rawText: envelope.normalizedText,
    createdAt: envelope.source.createdAt,
    sourceType: "document",
    metadata: {
      project_id: "project-001",
      channel: "document_ingest_live",
      locale: "en",
      workspace_id: null,
      conversation_title: null,
      sensitivity_hint: "unknown",
    },
  });

  const factCandidate = buildCanonicalCandidate(
    rawEvent,
    "segment-001",
    "Deployment region is us-east-1.",
    {
      candidate_id: "candidate-fact-001",
      kind: "claim",
      artifact_type: null,
      canonical_text: "Deployment region is us-east-1.",
      payload: {
        claim_type: "project_fact",
        subject: "deployment region",
        predicate: "is",
        object: "us-east-1",
      },
      scope: {
        tenant_id: rawEvent.tenant_id,
        user_id: rawEvent.user_id,
        project_id: "project-001",
        workspace_id: null,
        subject_type: "project",
        subject_id: "project-001",
        applies_to: "current_project",
      },
    },
  );

  const procedureCandidate = buildCanonicalCandidate(
    rawEvent,
    "segment-002",
    "1. Run the tests.\n2. Ship the build.",
    {
      candidate_id: "candidate-procedure-001",
      unit_type: "composite",
      kind: null,
      artifact_type: "procedure",
      canonical_text: "Procedure: Release checklist.",
      payload: {
        title: "Release checklist",
        purpose: "Ship safely.",
        summary: "Run the tests and then ship the build.",
        components: [
          {
            component_id: "component-001",
            order_index: 0,
            content: "Run the tests.",
            promotion: "embedded_only",
          },
          {
            component_id: "component-002",
            order_index: 1,
            content: "Ship the build.",
            promotion: "embedded_only",
          },
        ],
      },
      scope: {
        tenant_id: rawEvent.tenant_id,
        user_id: rawEvent.user_id,
        project_id: "project-001",
        workspace_id: null,
        subject_type: "project",
        subject_id: "project-001",
        applies_to: "current_project",
      },
    },
  );

  const mergedCandidate = buildCanonicalCandidate(
    rawEvent,
    "segment-003",
    "The user prefers concise answers.",
    {
      candidate_id: "candidate-merge-001",
      kind: "claim",
      artifact_type: null,
      canonical_text: "The user prefers concise answers.",
      payload: {
        claim_type: "preference_state",
        subject: "user",
        predicate: "prefers",
        object: "concise answers",
      },
      scope: {
        tenant_id: rawEvent.tenant_id,
        user_id: rawEvent.user_id,
        project_id: null,
        workspace_id: null,
        subject_type: "user",
        subject_id: "user-001",
        applies_to: "global",
      },
    },
  );

  return {
    source: envelope.source,
    windows: envelope.windows,
    rawEvent,
    segmented: {
      event_id: rawEvent.event_id,
      schema_version: "segmented_ingest.v1",
      raw_text_sha256: "hash",
      segments: [],
    },
    routing: {
      schema_version: "capture_routing.v1",
      event_id: rawEvent.event_id,
      routing_decisions: [],
    },
    routedCandidates: {
      schema_version: "capture_routing.v1",
      event_id: rawEvent.event_id,
      routed_candidates: [],
    },
    atomicExtractionRaw: {
      schema_version: "atomic_extraction.v1",
      event_id: rawEvent.event_id,
      atomic_candidates: [],
    },
    atomicExtraction: {
      schema_version: "atomic_extraction.v1",
      event_id: rawEvent.event_id,
      atomic_candidates: [],
    },
    compositeExtraction: {
      schema_version: "composite_extraction.v1",
      event_id: rawEvent.event_id,
      composite_candidates: [],
    },
    canonicalization: {
      schema_version: "canonical_candidates.v1",
      event_id: rawEvent.event_id,
      canonical_candidates: [factCandidate, procedureCandidate, mergedCandidate],
    },
    compositePolicy: {
      parentRetention: [],
      childPromotions: [],
    },
    admission: {
      schema_version: "admission_decision.v1",
      event_id: rawEvent.event_id,
      decisions: [
        buildAdmissionDecision("candidate-fact-001"),
        buildAdmissionDecision("candidate-procedure-001"),
        buildAdmissionDecision("candidate-merge-001"),
      ],
    },
    reconciliation: [
      {
        schema_version: "reconciliation_decision.v1",
        event_id: rawEvent.event_id,
        candidate_id: "candidate-merge-001",
        decision: "merge_with_existing",
        target_memory_ids: ["memory-existing-001"],
        merged_canonical_text: "The user prefers concise answers.",
        conflict_type: "none",
        supersedes_memory_ids: [],
        rationale: "Existing durable preference already covers this fact.",
        confidence: 0.95,
      },
    ],
  };
}

describe("mmv2/live-document-ingestion", () => {
  beforeEach(() => {
    ingestDocumentV2CoreMock.mockReset();
    ingestDocumentV2ShadowMock.mockReset();
  });

  it("uses the MMV2 core and adapts retained outputs into the legacy live write contract", async () => {
    ingestDocumentV2CoreMock.mockResolvedValue(createCoreRun());
    ingestDocumentV2ShadowMock.mockImplementation(() => {
      throw new Error("shadow ingestion must not be used for live document crossover");
    });

    const result = await ingestDocumentV2ForLivePath({
      document: {
        externalSourceId: "doc-live-001",
        text: "Deployment region is us-east-1.",
        projectId: "project-001",
      },
      modelId: "model-live-001",
      interpreter: { interpret: vi.fn() },
    });

    expect(ingestDocumentV2CoreMock).toHaveBeenCalledOnce();
    expect(ingestDocumentV2ShadowMock).not.toHaveBeenCalled();
    expect(result.capturedObjects).toHaveLength(2);
    expect(result.windowResults).toEqual([
      {
        sourceWindowId: result.windows[0]?.id,
        action: "capture",
        objects: result.capturedObjects,
      },
    ]);

    expect(result.capturedObjects[0]).toMatchObject({
      contractName: "semantic_extraction",
      contractVersion: MMV2_LIVE_DOCUMENT_CONTRACT_VERSION,
      sourceKind: "document",
      object: {
        kind: "fact",
        canonicalClass: "project",
        payload: {
          subject: "deployment region",
          value: "us-east-1",
        },
      },
    });
    expect(result.capturedObjects[1]).toMatchObject({
      contractVersion: MMV2_LIVE_DOCUMENT_CONTRACT_VERSION,
      object: {
        kind: "procedure",
        canonicalClass: "feedback",
        payload: {
          title: "Release checklist",
          steps: ["Run the tests", "Ship the build"],
        },
      },
    });
    expect(result.capturedObjects.some((entry) => entry.object.kind === "preference")).toBe(false);
  });
});
