import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2EvalProof } from "../../proof/phase2-eval-proof.ts";
import { buildPhase2UiRuntimeProofCoverage } from "../../proof/phase2-ui-runtime-proof-coverage.ts";
import type { RuntimeGraphMemoryInput } from "../../runtime-graph.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeCompatibleMemoryRecord,
} from "../../runtime-read-models.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import { buildRetrievalPackArtifact } from "../context/retrieval-packs.ts";
import {
  buildPhase2ControlledRetrievalPack,
  buildPhase2ControlledRetrievalPackReport,
  writePhase2ControlledRetrievalPackReportArtifact,
  type Phase2ControlledRetrievalPackInput,
} from "./phase2-controlled-retrieval-packs.ts";
import { validatePhase2ProductionGatePrerequisites } from "./phase2-production-gates.ts";

const now = new Date("2026-04-25T00:00:00.000Z");
const projectId = "phase2-controlled-retrieval-project";

function sourceRef(memoryId: string, sourceProfileId: SourceProfileId) {
  return {
    sourceId: `source-${memoryId}`,
    segmentId: `segment-${memoryId}`,
    sourceType: sourceProfileId,
    contentHash: `hash-${memoryId}`,
  };
}

function graphMemory(input: {
  memoryId: string;
  authorityTier: SourceAuthorityTier;
  sourceProfileId: SourceProfileId;
  status?: RuntimeGraphMemoryInput["status"];
  kind?: string;
  artifactType?: string | null;
  canonicalText?: string;
  payload?: Record<string, unknown>;
  lineage?: RuntimeGraphMemoryInput["lineage"];
  invalidAt?: string | null;
}): RuntimeGraphMemoryInput {
  return {
    memoryId: input.memoryId,
    status: input.status ?? "active",
    unitType: "atomic",
    kind: input.kind ?? "fact",
    artifactType: input.artifactType ?? null,
    canonicalText: input.canonicalText ?? `bounded claim for ${input.memoryId}`,
    searchText: input.canonicalText ?? `bounded claim for ${input.memoryId}`,
    scope: { project_id: projectId, projectId },
    payload: input.payload ?? { payload_type: "claim", claim_type: "current_state" },
    validity: {
      valid_at: now.toISOString(),
      invalid_at: input.invalidAt ?? null,
      temporal_status: input.status === "stale" ? "stale" : "current",
    },
    sourceRefs: [sourceRef(input.memoryId, input.sourceProfileId)],
    lineage: input.lineage,
    sourceAuthorityTier: input.authorityTier,
    sourceProfileId: input.sourceProfileId,
    sourceEventIds: [`event-${input.memoryId}`],
    sourceEdgeIds: [`edge-${input.memoryId}`],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function baseMemories(): RuntimeGraphMemoryInput[] {
  return [
    graphMemory({
      memoryId: "mem-authoritative",
      authorityTier: "user_authoritative",
      sourceProfileId: "explicit_user_turn",
      canonicalText: "The controlled retrieval project has an authoritative current-state fact.",
    }),
    graphMemory({
      memoryId: "mem-tool-grounded",
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      canonicalText: "The controlled retrieval project has lower-authority tool evidence.",
    }),
  ];
}

function proofPrerequisites() {
  const evalProof = buildPhase2EvalProof({
    mode: "explicit_proof",
    projectId,
    now,
  });
  if (!evalProof.retrievalIntegrationProof) {
    throw new Error("expected eval proof to include retrieval integration proof");
  }
  return validatePhase2ProductionGatePrerequisites({
    retrievalIntegrationProof: evalProof.retrievalIntegrationProof,
    evalProof,
    uiRuntimeProof: buildPhase2UiRuntimeProofCoverage({
      mode: "explicit_operator_proof",
      projectId,
      now,
    }),
  });
}

function controlledInput(
  overrides: Partial<Phase2ControlledRetrievalPackInput> = {},
): Phase2ControlledRetrievalPackInput {
  return {
    enablePhase2ControlledRetrieval: true,
    projectId,
    requestScope: { projectId },
    retrievalPlan: {
      planId: "phase2-controlled-plan",
      schemaVersion: "retrieval_plan.v1",
      intent: "phase2_controlled_retrieval",
      corpora: ["project", "projections"],
      packTypes: ["project_state_pack", "projection_digest_pack"],
      queries: [
        {
          queryHash: "phase2-controlled-query",
          redactedLabel: "sha256:phase2-controlled-query",
          indexes: ["fielded", "graph", "projection_digest"],
          filters: { projectId },
        },
      ],
      budget: {
        maxTokensTotal: 1_000,
        hardDirectives: 0,
        userProfile: 0,
        projectState: 500,
        procedures: 100,
        sourceRefs: 100,
        episodes: 0,
        conflicts: 100,
        projections: 200,
      },
    },
    graphMemories: baseMemories(),
    now,
    ...overrides,
  };
}

function retrievalRequest(): RetrievalRequestRecord {
  return {
    id: "retrieval-request-controlled",
    sessionId: "session-controlled",
    queryText: "sha256:controlled-query",
    requestPurpose: "context_injection",
    scope: { projectId, retrievalRuntimeQueryHash: "controlled-query" },
    desiredResultCount: 1,
    contractName: "retrieval_request_interpretation",
    contractVersion: "v1",
    modelId: "retrieval-model",
    createdAt: now,
  };
}

function retrievalResultSet(): RetrievalResultSetRecord {
  return {
    id: "retrieval-set-controlled",
    retrievalRequestId: "retrieval-request-controlled",
    contentHash: "hash-controlled",
    resultCount: 1,
    createdAt: now,
  };
}

function retrievalResultItems(): RetrievalResultItemRecord[] {
  return [
    {
      id: "retrieval-item-controlled",
      retrievalResultSetId: "retrieval-set-controlled",
      memoryObjectId: "memory-controlled",
      rankIndex: 0,
      rankBand: "primary",
      retrievalReasonCodes: ["scope_match", "rerank_selected"],
      selectedForContext: true,
      createdAt: now,
    },
  ];
}

function memoryObjects(): RuntimeCompatibleMemoryRecord[] {
  return [
    {
      id: "memory-controlled",
      canonicalClass: "project",
      kind: "fact",
      payload: { subject: "controlled retrieval", value: "object-native fact" },
      normalizedSearchText: "controlled retrieval object native fact",
      scope: { projectId },
      provenance: [{ sourceId: "source-memory-controlled" }],
      confidence: "strong",
      durability: "durable",
      suggestedReviewMode: "auto_accept",
      executedReviewMode: "auto_accept",
      rationaleCodes: [],
      identityKey: "identity-controlled",
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-memory",
      createdAt: now,
    },
  ];
}

describe("phase2 controlled retrieval pack integration", () => {
  it("keeps Phase 2 graph/capsule/context artifacts out of default retrieval-pack assembly", () => {
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: retrievalRequest(),
      retrievalResultSet: retrievalResultSet(),
      retrievalResultItems: retrievalResultItems(),
      memoryObjects: memoryObjects(),
      buildPolicyVersion: "v1",
    });
    const controlled = buildPhase2ControlledRetrievalPack({
      projectId,
      graphMemories: baseMemories(),
      now,
    });

    expect(artifact.structuredPayload?.phase2ControlledRetrieval).toBeUndefined();
    expect(artifact.structuredPayload?.capsuleRetrievalShadow).toBeUndefined();
    expect(artifact.structuredPayload?.projectStateCapsuleContext).toBeUndefined();
    expect(controlled.telemetry.enabled).toBe(false);
    expect(controlled.telemetry.selectedArtifactIds).toHaveLength(0);
    expect(controlled.telemetry.defaultRetrievalChanged).toBe(false);
  });

  it("emits shadow telemetry without injecting capsule context in shadow-report mode", () => {
    const result = buildPhase2ControlledRetrievalPack(controlledInput());

    expect(result.mode).toBe("shadow_report_only");
    expect(result.runtimeGraph).toBeUndefined();
    expect(result.capsuleRetrievalShadow?.packs.length).toBeGreaterThan(0);
    expect(result.capsuleContext?.blocks.length ?? 0).toBe(0);
    expect(result.telemetry.gateResults.map((gate) => gate.decision)).toEqual(
      expect.arrayContaining(["shadow_only", "denied"]),
    );
    expect(result.telemetry.defaultContextInjectionChanged).toBe(false);
  });

  it("allows explicit eval to include graph reads, capsule retrieval, and gated capsule context", () => {
    const result = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
        projectPageProjectionAvailable: true,
      }),
    );

    expect(result.runtimeGraph).toMatchObject({
      readOnly: true,
      semanticTruth: false,
    });
    expect(result.capsuleRetrievalShadow?.packs.length).toBeGreaterThan(0);
    expect(result.capsuleContext?.blocks.length).toBeGreaterThan(0);
    expect(result.capsuleContext?.renderedText).toContain("label:lower_authority");
    expect(result.telemetry.projectPageBypassed).toBe(true);
    expect(result.selections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifactKind: "runtime_graph", included: true }),
        expect.objectContaining({ artifactKind: "project_state_capsule", included: true }),
        expect.objectContaining({ artifactKind: "project_state_capsule_context", included: true }),
      ]),
    );
  });

  it("requires passing production prerequisites for controlled-production inclusion", () => {
    const missing = buildPhase2ControlledRetrievalPack(
      controlledInput({
        capabilityModes: {
          runtime_graph_reads: "controlled_production",
          project_state_capsule_retrieval: "controlled_production",
          project_state_capsule_context: "controlled_production",
        },
      }),
    );
    const passing = buildPhase2ControlledRetrievalPack(
      controlledInput({
        capabilityModes: {
          runtime_graph_reads: "controlled_production",
          project_state_capsule_retrieval: "controlled_production",
          project_state_capsule_context: "controlled_production",
        },
        proofPrerequisites: proofPrerequisites(),
      }),
    );

    expect(missing.telemetry.gateResults.every((gate) => !gate.allowed)).toBe(true);
    expect(missing.telemetry.gateResults.map((gate) => gate.decision)).toEqual(
      expect.arrayContaining(["proof_required"]),
    );
    expect(passing.telemetry.gateResults.every((gate) => gate.allowed)).toBe(true);
    expect(passing.runtimeGraph).toBeDefined();
    expect(passing.capsuleContext?.blocks.length).toBeGreaterThan(0);
  });

  it("blocks no-dark-data failure across controlled derived artifacts", () => {
    const result = buildPhase2ControlledRetrievalPack(
      controlledInput({
        noDarkDataStatus: "fail",
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
      }),
    );

    expect(result.telemetry.gateResults.map((gate) => gate.decision)).toEqual(
      expect.arrayContaining(["blocked_no_dark_data"]),
    );
    expect(result.telemetry.selectedArtifactIds).toHaveLength(0);
  });

  it("excludes inspection-only material from normal graph, capsule, and context outputs", () => {
    const result = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
        graphMemories: [
          ...baseMemories(),
          graphMemory({
            memoryId: "mem-inspection-only",
            authorityTier: "inspection_only",
            sourceProfileId: "raw_transcript",
          }),
        ],
      }),
    );

    expect(result.runtimeGraph?.sourceMemoryIds).not.toContain("mem-inspection-only");
    expect(result.capsuleRetrievalShadow?.packs[0]?.sourceMemoryIds).not.toContain(
      "mem-inspection-only",
    );
    expect(result.capsuleContext?.renderedText).not.toContain("mem-inspection-only");
  });

  it("blocks stale and conflicted capsule context unless conflict-aware policy is explicit", () => {
    const stale = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
        graphMemories: [
          ...baseMemories(),
          graphMemory({
            memoryId: "mem-stale",
            authorityTier: "curated_authoritative",
            sourceProfileId: "curated_repo_doc",
            status: "stale",
            invalidAt: "2026-04-24T00:00:00.000Z",
          }),
        ],
      }),
    );
    const conflicted = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
        graphMemories: [
          ...baseMemories(),
          graphMemory({
            memoryId: "mem-conflicted",
            authorityTier: "curated_authoritative",
            sourceProfileId: "curated_repo_doc",
            status: "conflicted",
            lineage: { conflictsWithMemoryIds: ["mem-authoritative"] },
          }),
        ],
      }),
    );
    const conflictAware = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        includeConflictAware: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
        graphMemories: [
          ...baseMemories(),
          graphMemory({
            memoryId: "mem-conflicted",
            authorityTier: "curated_authoritative",
            sourceProfileId: "curated_repo_doc",
            status: "conflicted",
            lineage: { conflictsWithMemoryIds: ["mem-authoritative"] },
          }),
        ],
      }),
    );

    expect(stale.telemetry.gateResults.map((gate) => gate.decision)).toContain("blocked_stale");
    expect(stale.capsuleContext?.blocks.length ?? 0).toBe(0);
    expect(conflicted.telemetry.gateResults.map((gate) => gate.decision)).toContain(
      "blocked_conflict",
    );
    expect(conflicted.capsuleContext?.blocks.length ?? 0).toBe(0);
    expect(conflictAware.capsuleContext?.blocks.length).toBeGreaterThan(0);
  });

  it("preserves gate telemetry, role policy, authority metadata, and bounded reports", async () => {
    const result = buildPhase2ControlledRetrievalPack(
      controlledInput({
        explicitEvalEnabled: true,
        capabilityModes: {
          runtime_graph_reads: "explicit_eval",
          project_state_capsule_retrieval: "explicit_eval",
          project_state_capsule_context: "explicit_eval",
        },
      }),
    );
    const artifact = buildRetrievalPackArtifact({
      retrievalRequest: retrievalRequest(),
      retrievalResultSet: retrievalResultSet(),
      retrievalResultItems: retrievalResultItems(),
      memoryObjects: memoryObjects(),
      buildPolicyVersion: "v1",
      phase2ControlledRetrieval: result as unknown as Record<string, unknown>,
    });
    const report = buildPhase2ControlledRetrievalPackReport({ result, now });

    expect(result.telemetry.gateResults[0]).toEqual(
      expect.objectContaining({
        capability: "runtime_graph_reads",
        decision: "allowed",
        defaultRetrievalChanged: false,
        defaultContextInjectionChanged: false,
      }),
    );
    expect(result.telemetry.sourceProfileIds).toEqual(
      expect.arrayContaining(["explicit_user_turn", "tool_result_capture"]),
    );
    expect(result.telemetry.authorityTiers).toEqual(
      expect.arrayContaining(["user_authoritative", "tool_grounded"]),
    );
    expect(result.capsuleRetrievalShadow?.telemetry.projectPageBypassed).toBe(false);
    expect(artifact.structuredPayload?.phase2ControlledRetrieval).toBeDefined();
    expect(artifact.renderedText).not.toContain("project-state-capsule-context");
    expect(report).toMatchObject({
      resultId: result.resultId,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });

    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-controlled-pack-"));
    const written = await writePhase2ControlledRetrievalPackReportArtifact({ report, artifactDir });
    const parsed = JSON.parse(await fs.readFile(written.path, "utf8"));
    expect(parsed.reportId).toBe(report.reportId);
  });

  it("does not emit prohibited raw-content fields or marker content", () => {
    expect(() =>
      buildPhase2ControlledRetrievalPack({
        enablePhase2ControlledRetrieval: true,
        projectId,
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);

    const serialized = JSON.stringify(buildPhase2ControlledRetrievalPack(controlledInput()));
    for (const marker of [
      ["raw", "-", "prompt", "-", "marker"],
      ["raw", "-", "transcript", "-", "marker"],
      ["raw", "-", "tool", "-", "log", "-", "marker"],
      ["secret", "-", "marker"],
      ["private", "-", "phrase", "-", "marker"],
    ]) {
      expect(serialized).not.toContain(marker.join(""));
    }
  });
});
