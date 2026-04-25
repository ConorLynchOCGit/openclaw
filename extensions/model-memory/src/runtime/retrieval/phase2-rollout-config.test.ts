import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2EvalProof } from "../../proof/phase2-eval-proof.ts";
import { buildPhase2UiRuntimeProofCoverage } from "../../proof/phase2-ui-runtime-proof-coverage.ts";
import type {
  RetrievalRequestRecord,
  RetrievalResultItemRecord,
  RetrievalResultSetRecord,
  RuntimeCompatibleMemoryRecord,
} from "../../runtime-read-models.ts";
import { buildRetrievalPackArtifact } from "../context/retrieval-packs.ts";
import {
  validatePhase2ProductionGatePrerequisites,
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
  type Phase2ProductionGatePrerequisiteReport,
} from "./phase2-production-gates.ts";
import {
  buildPhase2RolloutReport,
  createDefaultPhase2RolloutConfig,
  resolvePhase2RolloutConfigFromEnv,
  resolvePhase2RolloutOptions,
  writePhase2RolloutReportArtifact,
} from "./phase2-rollout-config.ts";

const now = new Date("2026-04-25T00:00:00.000Z");
const projectId = "phase2-rollout-config-project";

function proofPrerequisites(): Phase2ProductionGatePrerequisiteReport {
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

function modes(
  mode: Phase2ProductionGateMode,
): Partial<Record<Phase2ProductionCapability, Phase2ProductionGateMode>> {
  return {
    runtime_graph_reads: mode,
    project_state_capsule_retrieval: mode,
    project_state_capsule_context: mode,
  };
}

function retrievalRequest(): RetrievalRequestRecord {
  return {
    id: "retrieval-request-rollout",
    sessionId: "session-rollout",
    queryText: "sha256:rollout-query",
    requestPurpose: "context_injection",
    scope: { projectId, retrievalRuntimeQueryHash: "rollout-query" },
    desiredResultCount: 1,
    contractName: "retrieval_request_interpretation",
    contractVersion: "v1",
    modelId: "retrieval-model",
    createdAt: now,
  };
}

function retrievalResultSet(): RetrievalResultSetRecord {
  return {
    id: "retrieval-set-rollout",
    retrievalRequestId: "retrieval-request-rollout",
    contentHash: "hash-rollout",
    resultCount: 1,
    createdAt: now,
  };
}

function retrievalResultItems(): RetrievalResultItemRecord[] {
  return [
    {
      id: "retrieval-item-rollout",
      retrievalResultSetId: "retrieval-set-rollout",
      memoryObjectId: "memory-rollout",
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
      id: "memory-rollout",
      canonicalClass: "project",
      kind: "fact",
      payload: { subject: "phase2 rollout", value: "object-native fact" },
      normalizedSearchText: "phase2 rollout object native fact",
      scope: { projectId },
      provenance: [{ sourceId: "source-memory-rollout" }],
      confidence: "strong",
      durability: "durable",
      suggestedReviewMode: "auto_accept",
      executedReviewMode: "auto_accept",
      rationaleCodes: [],
      identityKey: "identity-rollout",
      contractName: "semantic_extraction",
      contractVersion: "v1",
      modelId: "model-memory",
      createdAt: now,
    },
  ];
}

describe("phase2 rollout config seam", () => {
  it("keeps production capabilities disabled or shadow-only by default", () => {
    const config = createDefaultPhase2RolloutConfig();
    const resolved = resolvePhase2RolloutOptions({ projectId });

    expect(Object.values(config.capabilityModes)).toEqual(
      expect.arrayContaining(["disabled", "shadow_report_only"]),
    );
    expect(Object.values(config.capabilityModes)).not.toContain("controlled_production");
    expect(Object.values(config.capabilityModes)).not.toContain("operator_enabled");
    expect(resolved.enabled).toBe(false);
    expect(resolved.controlledRetrievalInput.enablePhase2ControlledRetrieval).toBe(false);
    expect(resolved.telemetry.defaultRetrievalChanged).toBe(false);
    expect(resolved.telemetry.defaultContextInjectionChanged).toBe(false);
  });

  it("allows explicit eval config to produce Slice 11 controlled retrieval options", () => {
    const resolved = resolvePhase2RolloutOptions({
      projectId,
      requestScope: { projectId },
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: modes("explicit_eval"),
      },
    });

    expect(resolved.enabled).toBe(true);
    expect(resolved.phase2CapabilityModes.project_state_capsule_context).toBe("explicit_eval");
    expect(resolved.controlledRetrievalInput).toMatchObject({
      enablePhase2ControlledRetrieval: true,
      explicitEvalEnabled: true,
      projectId,
      requestScope: { projectId },
      noDarkDataStatus: "pass",
    });
    expect(resolved.validation.valid).toBe(true);
  });

  it("requires operator flag and proof prerequisites for operator-enabled config", () => {
    const missing = resolvePhase2RolloutOptions({
      projectId,
      config: {
        source: "explicit_config",
        enabled: true,
        capabilityModes: { project_state_capsule_retrieval: "operator_enabled" },
      },
    });
    const passing = resolvePhase2RolloutOptions({
      projectId,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      proofPrerequisites: proofPrerequisites(),
      operatorOverride: {
        source: "operator_override",
        enabled: true,
        explicitOperatorEnabled: true,
        capabilityModes: { project_state_capsule_retrieval: "operator_enabled" },
      },
    });

    expect(missing.validation.valid).toBe(false);
    expect(missing.validation.reasonCodes).toEqual(
      expect.arrayContaining(["operator_flag_required", "proof_prerequisites_missing"]),
    );
    expect(missing.phase2CapabilityModes.project_state_capsule_retrieval).toBe("disabled");
    expect(passing.validation.valid).toBe(true);
    expect(passing.phase2CapabilityModes.project_state_capsule_retrieval).toBe("operator_enabled");
    expect(passing.controlledRetrievalInput.proofPrerequisites?.status).toBe("pass");
  });

  it("requires passing Slice 8, Slice 9, and UI proof prerequisites for controlled production", () => {
    const missing = resolvePhase2RolloutOptions({
      projectId,
      config: {
        source: "explicit_config",
        enabled: true,
        capabilityModes: modes("controlled_production"),
      },
    });
    const passing = resolvePhase2RolloutOptions({
      projectId,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      proofPrerequisites: proofPrerequisites(),
      config: {
        source: "explicit_config",
        enabled: true,
        capabilityModes: modes("controlled_production"),
      },
    });

    expect(missing.validation.valid).toBe(false);
    expect(missing.validation.reasonCodes).toContain("proof_prerequisites_missing");
    expect(missing.phase2CapabilityModes.runtime_graph_reads).toBe("disabled");
    expect(passing.validation.valid).toBe(true);
    expect(passing.phase2CapabilityModes.runtime_graph_reads).toBe("controlled_production");
    expect(passing.telemetry.proofStatus).toBe("pass");
    expect(passing.telemetry.proofHashes.length).toBeGreaterThan(0);
  });

  it("blocks no-dark-data failures and missing soft-source authority metadata", () => {
    const noDarkDataFailure = resolvePhase2RolloutOptions({
      projectId,
      noDarkDataStatus: "fail",
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: modes("explicit_eval"),
      },
    });
    const missingMetadata = resolvePhase2RolloutOptions({
      projectId,
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: {
          soft_source_runtime_ingestion: "explicit_eval",
          non_user_prompt_ingestion: "explicit_eval",
        },
      },
    });

    expect(noDarkDataFailure.validation.valid).toBe(false);
    expect(noDarkDataFailure.validation.reasonCodes).toContain("no_dark_data_failed");
    expect(noDarkDataFailure.phase2CapabilityModes.project_state_capsule_context).toBe("disabled");
    expect(missingMetadata.validation.valid).toBe(false);
    expect(missingMetadata.validation.reasonCodes).toEqual(
      expect.arrayContaining(["source_profile_required", "authority_tier_required"]),
    );
  });

  it("blocks inspection-only, stale, and conflict rollout unless explicit policy allows the safe case", () => {
    const inspection = resolvePhase2RolloutOptions({
      projectId,
      sourceProfileIds: ["raw_transcript"],
      authorityTiers: ["inspection_only"],
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: modes("explicit_eval"),
      },
    });
    const stale = resolvePhase2RolloutOptions({
      projectId,
      freshnessStatus: "stale",
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: { project_state_capsule_context: "explicit_eval" },
      },
    });
    const conflictBlocked = resolvePhase2RolloutOptions({
      projectId,
      conflictMarkers: ["conflict-marker"],
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: { project_state_capsule_context: "explicit_eval" },
      },
    });
    const conflictAware = resolvePhase2RolloutOptions({
      projectId,
      conflictMarkers: ["conflict-marker"],
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        allowConflictAware: true,
        capabilityModes: { project_state_capsule_context: "explicit_eval" },
      },
    });

    expect(inspection.validation.reasonCodes).toContain("inspection_only_not_allowed");
    expect(stale.validation.reasonCodes).toContain("stale_not_allowed");
    expect(conflictBlocked.validation.reasonCodes).toContain("conflict_not_allowed");
    expect(conflictAware.validation.valid).toBe(true);
    expect(conflictAware.controlledRetrievalInput.includeConflictAware).toBe(true);
  });

  it("accepts only explicit safe environment override values", () => {
    expect(() =>
      resolvePhase2RolloutConfigFromEnv({
        MODEL_MEMORY_PHASE2_PROJECT_STATE_CAPSULE_CONTEXT_MODE: "on_by_vibes",
      }),
    ).toThrow(/invalid Phase 2 rollout mode/u);

    const envConfig = resolvePhase2RolloutConfigFromEnv({
      MODEL_MEMORY_PHASE2_ROLLOUT_ENABLED: "1",
      MODEL_MEMORY_PHASE2_EXPLICIT_EVAL_ENABLED: "true",
      MODEL_MEMORY_PHASE2_PROJECT_STATE_CAPSULE_CONTEXT_MODE: "explicit_eval",
      MODEL_MEMORY_PHASE2_NO_DARK_DATA_STATUS: "pass",
    });
    expect(envConfig).toMatchObject({
      source: "env_override",
      enabled: true,
      explicitEvalEnabled: true,
      noDarkDataStatus: "pass",
      capabilityModes: { project_state_capsule_context: "explicit_eval" },
    });
  });

  it("keeps retrieval-pack behavior unchanged unless rollout telemetry is explicitly passed", () => {
    const base = buildRetrievalPackArtifact({
      retrievalRequest: retrievalRequest(),
      retrievalResultSet: retrievalResultSet(),
      retrievalResultItems: retrievalResultItems(),
      memoryObjects: memoryObjects(),
      buildPolicyVersion: "v1",
    });
    const resolved = resolvePhase2RolloutOptions({
      projectId,
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: { project_state_capsule_context: "explicit_eval" },
      },
    });
    const withRollout = buildRetrievalPackArtifact({
      retrievalRequest: retrievalRequest(),
      retrievalResultSet: retrievalResultSet(),
      retrievalResultItems: retrievalResultItems(),
      memoryObjects: memoryObjects(),
      buildPolicyVersion: "v1",
      phase2Rollout: resolved.telemetry as unknown as Record<string, unknown>,
    });

    expect(base.structuredPayload?.phase2Rollout).toBeUndefined();
    expect(withRollout.structuredPayload?.phase2Rollout).toMatchObject({
      configId: resolved.configId,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    expect(withRollout.renderedText).not.toContain("phase2_rollout_config");
  });

  it("writes bounded rollout reports and rejects prohibited raw-content fields", async () => {
    const resolved = resolvePhase2RolloutOptions({
      projectId,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      config: {
        source: "explicit_config",
        enabled: true,
        explicitEvalEnabled: true,
        capabilityModes: modes("explicit_eval"),
      },
    });
    const report = buildPhase2RolloutReport({ resolvedOptions: resolved, now });

    expect(report).toMatchObject({
      configId: resolved.configId,
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-rollout-"));
    const written = await writePhase2RolloutReportArtifact({ report, artifactDir });
    const parsed = JSON.parse(await fs.readFile(written.path, "utf8"));
    expect(parsed.reportId).toBe(report.reportId);

    expect(() =>
      resolvePhase2RolloutOptions({
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);
    const serialized = JSON.stringify(report);
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
