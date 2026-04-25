import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RuntimeGraphMemoryInput } from "../../runtime-graph.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeMemoryRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import {
  buildPhase2RetrievalIntegrationProof,
  writePhase2RetrievalIntegrationProofArtifact,
} from "./phase2-integration-proof.ts";

const now = new Date("2026-04-25T00:00:00.000Z");

function runtimeMemory(overrides: Partial<RuntimeMemoryRecord> = {}): RuntimeMemoryRecord {
  return {
    id: "mem-project",
    canonicalClass: "project",
    kind: "fact",
    payload: { subject: "project state", value: "integration proof ready" },
    normalizedSubject: "project state",
    normalizedSearchText: "project state integration proof ready",
    scope: { projectId: "project-1", projectScope: "project-1" },
    scopeKey: "project:project-1",
    provenance: [{ sourceId: "source-project", blockId: "segment-project" }],
    confidence: "strong",
    durability: "durable",
    suggestedReviewMode: "auto_accept",
    executedReviewMode: "auto_accept",
    rationaleCodes: [],
    identityKey: "identity-project",
    contractName: "mmv2_runtime_projection",
    contractVersion: "v1",
    modelId: "mmv2-storage",
    lifecycleState: "active",
    activationBasis: "primary_capture",
    createdAt: now,
    activatedAt: now,
    ...overrides,
  };
}

function graphMemory(overrides: Partial<RuntimeGraphMemoryInput> = {}): RuntimeGraphMemoryInput {
  return {
    memoryId: "mem-project",
    status: "active",
    unitType: "atomic",
    kind: "claim",
    artifactType: null,
    canonicalText: "Project state integration proof ready.",
    searchText: "project state integration proof ready",
    scope: {
      project_id: "project-1",
      workspace_id: "workspace-1",
      subject_type: "project",
      subject_id: "project-1",
    },
    payload: { payload_type: "claim", claim_type: "project_fact" },
    validity: {
      valid_at: now.toISOString(),
      invalid_at: null,
      temporal_status: "current",
    },
    sourceRefs: [
      {
        sourceId: "source-project",
        segmentId: "segment-project",
        sourceType: "document",
        sourceIngestEventId: "event-project",
      },
    ],
    sourceAuthorityTier: "curated_authoritative",
    sourceProfileId: "curated_corpus",
    sourceEventIds: ["event-project"],
    sourceEdgeIds: ["edge-project"],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function projection(): WorkspaceProjectionVersionRecord {
  return {
    id: "projection-project-page",
    targetId: "catalog-project_page",
    projectionType: "project_page",
    contentHash: "hash-project-page",
    canonicalArtifactPath: ".openclaw/model-memory/projections/project-page.md",
    sourceObjectIds: ["mem-project"],
    sourceEventIds: ["event-project"],
    sourceEdgeIds: ["edge-project"],
    sourceSlotKeys: [],
    sourceSetKeys: [],
    tokenEstimate: 12,
    builtAt: now,
    freshness: { status: "fresh" },
    staleMarkers: [],
    conflictMarkers: [],
    retrievalDigest: {
      title: "Project Page",
      summary: "Integration proof project page.",
      sourceMemoryIds: ["mem-project"],
      sourceEventIds: ["event-project"],
      contentHash: "hash-project-page",
    },
  };
}

function retrievalRequest(): RetrievalRequestRecord {
  return {
    id: "retrieval-request-proof",
    sessionId: "session-proof",
    queryText: "sha256:proof-query",
    requestPurpose: "context_injection",
    scope: { projectId: "project-1", retrievalRuntimeQueryHash: "proof-query" },
    desiredResultCount: 2,
    contractName: "retrieval_request_interpretation",
    contractVersion: "v1",
    modelId: "retrieval-model",
    createdAt: now,
  };
}

function retrievalResultSet(): RetrievalResultSetRecord {
  return {
    id: "retrieval-set-proof",
    retrievalRequestId: "retrieval-request-proof",
    contentHash: "hash-retrieval-set",
    resultCount: 1,
    createdAt: now,
  };
}

function retrievalItem(): RetrievalResultItemRecord {
  return {
    id: "retrieval-item-proof",
    retrievalResultSetId: "retrieval-set-proof",
    memoryObjectId: "mem-project",
    rankIndex: 0,
    rankBand: "primary",
    retrievalReasonCodes: ["scope_exact_match", "rerank_selected"],
    selectedForContext: true,
    createdAt: now,
  };
}

function proofInput(overrides = {}) {
  return {
    mode: "explicit_proof" as const,
    projectId: "project-1",
    retrievalRequest: retrievalRequest(),
    retrievalResultSet: retrievalResultSet(),
    retrievalResultItems: [retrievalItem()],
    memoryObjects: [runtimeMemory()],
    projectionVersions: [projection()],
    graphMemories: [graphMemory()],
    buildPolicyVersion: "phase2-proof-v1",
    now,
    ...overrides,
  };
}

describe("phase2 retrieval integration proof harness", () => {
  it("emits one deterministic structured trace containing all proof lanes", () => {
    const first = buildPhase2RetrievalIntegrationProof(proofInput());
    const second = buildPhase2RetrievalIntegrationProof(proofInput());

    expect(first).toEqual(second);
    expect(first.trace.telemetry.selectedLanes).toEqual([
      "object_retrieval",
      "projection_digest",
      "runtime_graph",
      "project_state_capsule",
      "capsule_retrieval_shadow",
      "gated_capsule_context",
      "hierarchical_retrieval_shadow",
      "retrieval_pack_artifact",
    ]);
    expect(first.defaultRetrievalChanged).toBe(false);
    expect(first.defaultContextInjectionChanged).toBe(false);
  });

  it("carries object retrieval, projection, graph, capsule, context, hierarchical, and artifact evidence", () => {
    const report = buildPhase2RetrievalIntegrationProof(proofInput());

    expect(report.trace.lanes.objectRetrieval).toMatchObject({
      selectedMemoryIds: ["mem-project"],
      sourceObjectIds: ["mem-project"],
      candidateIds: ["retrieval-item-proof"],
    });
    expect(report.trace.lanes.projectionDigest).toMatchObject({
      projectionIds: ["projection-project-page"],
      sourceMemoryIds: ["mem-project"],
      contentHashes: ["hash-project-page"],
    });
    expect(report.trace.lanes.runtimeGraph.available).toBe(true);
    expect(report.trace.lanes.runtimeGraph.nodeIds.length).toBeGreaterThan(0);
    expect(report.trace.lanes.runtimeGraph.edgeIds.length).toBeGreaterThan(0);
    expect(report.trace.lanes.projectStateCapsule.capsuleIds).toHaveLength(1);
    expect(report.trace.lanes.projectStateCapsule.sourceMemoryIds).toEqual(["mem-project"]);
    expect(report.trace.lanes.capsuleRetrievalShadow.wouldSelectCapsuleIds).toEqual(
      report.trace.lanes.projectStateCapsule.capsuleIds,
    );
    expect(report.trace.lanes.gatedCapsuleContext).toMatchObject({
      mode: "explicit_injection",
      injected: true,
      sourceMemoryIds: ["mem-project"],
    });
    expect(report.trace.lanes.hierarchicalRetrievalShadow.telemetry).toMatchObject({
      mode: "shadow_report_only",
      defaultRetrievalChanged: false,
      subqueryCount: 3,
      capsuleLaneUsed: true,
      projectionLaneUsed: true,
      graphLaneUsed: true,
    });
    expect(report.trace.lanes.retrievalPackArtifact.structuredPayloadKeys).toEqual(
      expect.arrayContaining([
        "capsuleRetrievalShadow",
        "hierarchicalRetrievalShadow",
        "memoryPacks",
        "projectStateCapsuleContext",
        "retrievalRun",
      ]),
    );
  });

  it("preserves authority tiers, source profile ids, source refs, and content hashes across lanes", () => {
    const report = buildPhase2RetrievalIntegrationProof(proofInput());

    expect(report.authorityTiers).toEqual(["curated_authoritative"]);
    expect(report.sourceProfileIds).toEqual(["curated_corpus"]);
    expect(report.sourceMemoryIds).toEqual(["mem-project"]);
    expect(report.sourceRefs).toEqual([
      expect.objectContaining({ sourceId: "source-project", segmentId: "segment-project" }),
    ]);
    expect(report.contentHashes).toEqual(
      expect.arrayContaining([
        "hash-project-page",
        report.trace.lanes.retrievalPackArtifact.contentHash,
      ]),
    );
  });

  it("keeps lifecycle exclusions visible for graph, capsule, and hierarchical lanes", () => {
    const report = buildPhase2RetrievalIntegrationProof(
      proofInput({
        graphMemories: [
          graphMemory(),
          graphMemory({
            memoryId: "mem-stale",
            status: "stale",
            sourceRefs: [{ sourceId: "source-stale", segmentId: "segment-stale" }],
          }),
          graphMemory({
            memoryId: "mem-inspection",
            sourceAuthorityTier: "inspection_only",
            sourceProfileId: "raw_prompt",
            sourceRefs: [{ sourceId: "source-inspection", segmentId: "segment-inspection" }],
          }),
        ],
      }),
    );

    expect(report.trace.lanes.runtimeGraph.excludedMemoryIds).toEqual(
      expect.arrayContaining(["mem-inspection", "mem-stale"]),
    );
    expect(report.exclusionReasons).toEqual(
      expect.objectContaining({
        "runtime_graph:excluded_source_authority": 1,
        "runtime_graph:stale_memory": 1,
        "project_state_capsule:inspection_only": 1,
        "project_state_capsule:stale": 1,
      }),
    );
  });

  it("requires explicit proof mode and does not mutate inputs", () => {
    expect(() =>
      buildPhase2RetrievalIntegrationProof({
        ...proofInput(),
        mode: "disabled",
      }),
    ).toThrow(/explicit_proof/u);

    const input = proofInput();
    const report = buildPhase2RetrievalIntegrationProof(input);
    report.sourceMemoryIds.length = 0;
    expect(input.graphMemories[0]!.sourceRefs).toHaveLength(1);
  });

  it("rejects prohibited raw-content fields and marker content", () => {
    expect(() =>
      buildPhase2RetrievalIntegrationProof({
        ...proofInput(),
        rawPrompt: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);
    expect(() =>
      buildPhase2RetrievalIntegrationProof({
        ...proofInput({
          projectionVersions: [
            {
              ...projection(),
              contentHash: "secret-marker",
            },
          ],
          graphMemories: [
            graphMemory({
              canonicalText: "secret-marker",
              searchText: "secret-marker",
            }),
          ],
        }),
      }),
    ).toThrow(/prohibited marker/u);

    const serialized = JSON.stringify(buildPhase2RetrievalIntegrationProof(proofInput()));
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("raw-transcript-marker");
    expect(serialized).not.toContain("raw-tool-log-marker");
    expect(serialized).not.toContain("secret-marker");
    expect(serialized).not.toContain("private-phrase-marker");
  });

  it("writes bounded derived proof artifacts through the shared artifact writer", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-proof-"));
    const report = buildPhase2RetrievalIntegrationProof(proofInput());
    const written = await writePhase2RetrievalIntegrationProofArtifact({
      report,
      artifactDir,
      artifactId: "proof-artifact",
    });

    const text = await fs.readFile(written.path, "utf8");
    expect(text).toContain("phase2_retrieval_integration_proof_report.v1");
    expect(text).not.toContain("raw_prompt");
    expect(written.contentHash).toHaveLength(64);
  });
});
