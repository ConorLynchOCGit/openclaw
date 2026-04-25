import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2ControlledConfigUiProofPassed,
  buildPhase2ControlledConfigUiProof,
  writePhase2ControlledConfigUiProofArtifact,
} from "./phase2-controlled-config-ui-proof.ts";

const now = new Date("2026-04-25T00:00:00.000Z");
const projectId = "phase2-controlled-config-ui-proof-test";
const marker = "PHASE2-CONTROLLED-CONFIG-UI-PROOF-TEST";

function report() {
  return buildPhase2ControlledConfigUiProof({
    projectId,
    proofRunId: "phase2-controlled-config-proof-run",
    markers: [marker],
    now,
    uiEvidence: {
      sessionKey: "main",
      proofMarker: marker,
      runId: "run-controlled-config-proof",
      terminalEvidence: true,
      assistantTextSha256: "sha256-controlled-config-proof",
    },
  });
}

describe("phase2 controlled config UI proof", () => {
  it("emits required sections and passes all controlled config checks", () => {
    const proof = report();

    expect(proof).toMatchObject({
      schemaVersion: "phase2_controlled_config_ui_proof.v1",
      projectId,
      noDarkDataValidationStatus: "pass",
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
    });
    expect(proof.checks.length).toBeGreaterThanOrEqual(12);
    expect(proof.checks.every((check) => check.status === "pass")).toBe(true);
    expect(Object.keys(proof.rollout.effectiveCapabilityModes)).toEqual(
      expect.arrayContaining([
        "runtime_graph_reads",
        "project_state_capsule_retrieval",
        "project_state_capsule_context",
      ]),
    );
    assertPhase2ControlledConfigUiProofPassed(proof);
  });

  it("resolves controlled production only with proof prerequisites and preserves gate telemetry", () => {
    const proof = report();

    expect(proof.rollout).toMatchObject({
      enabled: true,
      proofStatus: "pass",
      noDarkDataStatus: "pass",
    });
    expect(proof.rollout.effectiveCapabilityModes).toMatchObject({
      runtime_graph_reads: "controlled_production",
      project_state_capsule_retrieval: "controlled_production",
      project_state_capsule_context: "controlled_production",
    });
    expect(proof.proofPrerequisites.status).toBe("pass");
    expect(proof.proofPrerequisites.selectedLanes).toEqual(
      expect.arrayContaining([
        "object_retrieval",
        "projection_digest",
        "runtime_graph",
        "project_state_capsule",
        "capsule_retrieval_shadow",
        "gated_capsule_context",
        "hierarchical_retrieval_shadow",
        "retrieval_pack_artifact",
      ]),
    );
    expect(proof.telemetry.gateIds.length).toBeGreaterThan(0);
    expect(proof.telemetry.gateDecisions).toEqual(["allowed"]);
    expect(proof.telemetry.gateReasonCodes).toEqual(
      expect.arrayContaining(["controlled_production_allowed", "graph_reads_read_only"]),
    );
    expect(proof.telemetry.proofHashes.length).toBeGreaterThan(0);
  });

  it("proves graph reads, capsule retrieval, and gated capsule context through controlled config", () => {
    const proof = report();

    expect(proof.controlledRetrieval).toMatchObject({
      runtimeGraphReadOnly: true,
      runtimeGraphSemanticTruth: false,
      capsuleContextInjected: true,
      lowerAuthorityVisible: true,
      inspectionOnlyExcluded: true,
    });
    expect(proof.controlledRetrieval.graphNodeIds.length).toBeGreaterThan(0);
    expect(proof.controlledRetrieval.graphEdgeIds.length).toBeGreaterThan(0);
    expect(proof.controlledRetrieval.capsulePackIds.length).toBeGreaterThan(0);
    expect(proof.controlledRetrieval.capsuleCandidateIds.length).toBeGreaterThan(0);
    expect(proof.controlledRetrieval.capsuleContextBlockIds.length).toBeGreaterThan(0);
    expect(proof.sourceMemoryIds).toEqual(
      expect.arrayContaining(["controlled-config-authoritative", "controlled-config-soft"]),
    );
    expect(proof.sourceMemoryIds).not.toContain("controlled-config-inspection");
    expect(proof.sourceProfileIds).toEqual(
      expect.arrayContaining(["explicit_user_turn", "tool_result_capture"]),
    );
    expect(proof.authorityTiers).toEqual(
      expect.arrayContaining(["user_authoritative", "tool_grounded"]),
    );
  });

  it("proves default-off behavior and stale/conflict blocking", () => {
    const proof = report();

    expect(proof.defaultOff).toMatchObject({
      rolloutEnabled: false,
      controlledPackMode: "disabled",
      selectedArtifactIds: [],
      defaultRetrievalChanged: false,
      defaultContextInjectionChanged: false,
      retrievalPackHasControlledPayload: false,
    });
    expect(proof.blockedCases).toEqual({
      staleBlocked: true,
      conflictBlocked: true,
      conflictAwareAllowed: true,
    });
  });

  it("is deterministic for fixed inputs and writes bounded JSON and Markdown artifacts", async () => {
    const first = report();
    const second = report();
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-controlled-config-ui-"));
    const written = await writePhase2ControlledConfigUiProofArtifact({
      report: first,
      artifactDir,
    });
    const parsed = JSON.parse(await fs.readFile(written.jsonPath, "utf8"));
    const markdown = await fs.readFile(written.markdownPath, "utf8");

    expect(first).toEqual(second);
    expect(parsed.reportId).toBe(first.reportId);
    expect(markdown).toContain("# Phase 2 Controlled Config UI Proof");
    expect(written.byteLength).toBeGreaterThan(0);
  });

  it("does not contain prohibited raw-content fields or marker content", () => {
    expect(() =>
      buildPhase2ControlledConfigUiProof({
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);

    const serialized = JSON.stringify(report());
    for (const markerParts of [
      ["raw", "-", "prompt", "-", "marker"],
      ["raw", "-", "transcript", "-", "marker"],
      ["raw", "-", "tool", "-", "log", "-", "marker"],
      ["secret", "-", "marker"],
      ["private", "-", "phrase", "-", "marker"],
    ]) {
      expect(serialized).not.toContain(markerParts.join(""));
    }
  });
});
