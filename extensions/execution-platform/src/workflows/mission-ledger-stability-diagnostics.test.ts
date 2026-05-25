import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildMissionLedgerStabilityDiagnosticPair,
  summarizeCommitmentPacketCheckpointEvidenceForStability,
  summarizeMissionLedgerCheckpointEvidenceForStability,
  type MissionLedgerStabilityDiagnosticRun,
} from "./mission-ledger-stability-diagnostics.ts";

function ledgerEvidence(commitmentCount = 2) {
  return {
    missionId: "mission-1",
    ledgerStatus: "pending",
    missionGate: "clear_to_execute",
    blockingCommitmentCount: commitmentCount,
    nonBlockingCommitmentCount: 0,
    commitments: Array.from({ length: commitmentCount }, (_, index) => ({
      commitmentId: `commitment-${index + 1}`,
      commitmentText: `Implement production behavior ${index + 1}.`,
      whyItMatters: `This closes owner requirement ${index + 1}.`,
      expectedEvidenceDescription: `Evidence refs must prove behavior ${index + 1}.`,
      status: "pending",
      blocking: true,
      remainingWork: [`Build and validate behavior ${index + 1}.`],
    })),
  };
}

function packetEvidence(commitmentCount = 2) {
  return {
    packetCount: commitmentCount,
    packets: Array.from({ length: commitmentCount }, (_, index) => ({
      packetRef: `runtime-work-graph://packet/commitment-${index + 1}`,
      commitmentId: `commitment-${index + 1}`,
      authoringSource: "model_authored",
      qualityStatus: "accepted",
      workerObjective: `Implement production behavior ${index + 1} with bounded source edits.`,
      contextScoutObjective: `Find files and tests needed for behavior ${index + 1}.`,
      implementationObjective: `Wire behavior ${index + 1} into production runtime code.`,
      validationObjective: `Run focused tests for behavior ${index + 1}.`,
      likelyRepoAreas: ["extensions/execution-platform/src/workflows"],
      requiredContextQuestions: [`Which files own behavior ${index + 1}?`],
      acceptanceCriteriaCount: 2,
    })),
  };
}

function diagnostics(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    packetDiagnostics: [
      {
        commitmentId: "commitment-1",
        status: "completed",
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        latencyMs: 12_000,
        inputByteLength: 12_000,
        outputContentLength: 2_000,
        retryAttemptCount: 1,
        reasonCodes: ["commitment_packet_author_call_completed"],
        ...overrides,
      },
    ],
  };
}

function run(
  label: "A" | "B",
  input: {
    ledger?: ReturnType<typeof ledgerEvidence>;
    packets?: ReturnType<typeof packetEvidence>;
    packetDiagnostics?: JsonValue;
  } = {},
): MissionLedgerStabilityDiagnosticRun {
  const ledger =
    summarizeMissionLedgerCheckpointEvidenceForStability(input.ledger ?? ledgerEvidence()) ?? null;
  const packets =
    summarizeCommitmentPacketCheckpointEvidenceForStability({
      evidence: input.packets ?? packetEvidence(),
      packetDiagnostics: input.packetDiagnostics ?? diagnostics(),
    }) ?? null;
  return {
    artifactKind: "mission_ledger_stability_diagnostic_run",
    schemaVersion: "execution-platform.mission-ledger-stability-diagnostic.v1",
    runLabel: label,
    runId: `run-${label}`,
    runtimeJobId: `runtime-${label}`,
    workItemId: `work-${label}`,
    prompt: {
      promptPath:
        "docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md",
      promptHash: "sha256:prompt",
      promptLength: 42_000,
      promptModifiedAt: null,
      rawPromptStored: false,
    },
    startedAt: "2026-05-22T00:00:00.000Z",
    completedAt: "2026-05-22T00:01:00.000Z",
    phaseWallClockMs: { mission_ledger: 1_000, commitment_packets: 2_000 },
    modelUsage: [],
    missionLedger: ledger,
    commitmentPackets: packets,
    providerVariance: {
      artifactKind: "provider_variance_diagnostic",
      noContentCount: 0,
      retryCount: 0,
      rescueCount: 0,
      longLatencyCount: 0,
      providerErrorCount: 0,
      repeatedSamePacketFailureCount: 0,
      inputSizeCorrelated: false,
      timeoutCorrelated: false,
      schemaNormalizationCorrelated: false,
      noContentReasonCounts: {},
      failedPacketReplayRequired: false,
      classifications: [],
      affectedCommitmentIds: [],
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    runtimeBoundary: {
      artifactKind: "runtime_boundary_variance_diagnostic",
      promptResolverStable: true,
      promptHashMismatch: false,
      missionLedgerMissing: false,
      packetManifestMissing: false,
      artifactContractFailure: false,
      lifecycleClassificationFailure: false,
      schemaNormalizationMismatch: false,
      runtimePreflightBlocked: false,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    artifactRefs: [],
    reasonCodes: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

describe("mission ledger stability diagnostics", () => {
  it("accepts structurally stable repeated ledger and packet outputs", () => {
    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A"),
      runB: run("B"),
    });

    expect(pair.verdict.status).toBe("stable");
    expect(pair.verdict.safeToRunProductSpecProof).toBe(true);
    expect(pair.missionLedgerComparison.status).toBe("exact_structure_match");
    expect(pair.packetComparison.status).toBe("exact_structure_match");
  });

  it("records blocking commitment count drift as diagnostic-only when packet coverage is complete", () => {
    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A", { ledger: ledgerEvidence(2), packets: packetEvidence(2) }),
      runB: run("B", { ledger: ledgerEvidence(3), packets: packetEvidence(3) }),
    });

    expect(pair.missionLedgerComparison.status).toBe("bounded_structural_drift");
    expect(pair.packetComparison.status).toBe("bounded_structural_drift");
    expect(pair.verdict.status).toBe("stable");
    expect(pair.verdict.safeToRunProductSpecProof).toBe(true);
    expect(pair.reasonCodes).toContain("mission_ledger_blocking_count_changed_diagnostic_only");
    expect(pair.reasonCodes).toContain("commitment_packet_count_changed_diagnostic_only");
  });

  it("blocks on commitment packet coverage gaps instead of harmless count variance alone", () => {
    const incompletePackets = packetEvidence(3);
    incompletePackets.packetCount = 3;
    incompletePackets.packets = incompletePackets.packets.slice(0, 2);
    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A", { ledger: ledgerEvidence(2), packets: packetEvidence(2) }),
      runB: run("B", { ledger: ledgerEvidence(3), packets: incompletePackets }),
    });

    expect(pair.packetComparison.status).toBe("material_structural_drift");
    expect(pair.verdict.status).toBe("needs_review_structural_drift");
    expect(pair.reasonCodes).toContain("commitment_packet_coverage_incomplete");
  });

  it("reports prose fingerprint drift without blocking when structure is intact", () => {
    const alteredPackets = packetEvidence(2);
    alteredPackets.packets[0]!.workerObjective =
      "Implement the same production behavior using different wording and the same bounded source-edit contract.";

    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A"),
      runB: run("B", { packets: alteredPackets }),
    });

    expect(pair.packetComparison.status).toBe("bounded_structural_drift");
    expect(pair.verdict.status).toBe("stable");
    expect(pair.verdict.safeToRunProductSpecProof).toBe(true);
  });

  it("treats provider no-content retries as provider variance when rescue was not used", () => {
    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A"),
      runB: run("B", {
        packetDiagnostics: diagnostics({
          errorReasonCode: "openrouter_no_content",
          reasonCodes: ["openrouter_no_content", "retry_succeeded"],
          retryAttemptCount: 2,
        }),
      }),
    });

    expect(pair.providerVariance.noContentCount).toBe(1);
    expect(pair.verdict.status).toBe("stable_with_provider_variance");
    expect(pair.verdict.safeToRunProductSpecProof).toBe(true);
  });

  it("blocks on GPT rescue dependence", () => {
    const pair = buildMissionLedgerStabilityDiagnosticPair({
      pairId: "pair-1",
      runA: run("A"),
      runB: run("B", {
        packetDiagnostics: diagnostics({
          fallbackReasonCode: "gpt_rescue_used",
          reasonCodes: ["gpt_rescue_used"],
        }),
      }),
    });

    expect(pair.packetComparison.rescueDependence).toBe(true);
    expect(pair.verdict.status).toBe("needs_review_structural_drift");
    expect(pair.verdict.safeToRunProductSpecProof).toBe(false);
  });
});
