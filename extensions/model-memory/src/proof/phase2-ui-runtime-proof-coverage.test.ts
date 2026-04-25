import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2UiRuntimeProofCoveragePassed,
  buildPhase2UiRuntimeProofCoverage,
  writePhase2UiRuntimeProofCoverageArtifact,
} from "./phase2-ui-runtime-proof-coverage.ts";

const now = new Date("2026-04-25T00:00:00.000Z");

function report() {
  return buildPhase2UiRuntimeProofCoverage({
    mode: "explicit_operator_proof",
    projectId: "phase2-ui-runtime-proof-project",
    now,
  });
}

describe("phase2 UI runtime proof coverage", () => {
  it("emits required proof sections with pass/fail checks for each Slice 1-9 coverage area", () => {
    const proof = report();

    expect(Object.keys(proof.coverage).toSorted()).toEqual([
      "capsuleRetrievalShadow",
      "gatedCapsuleContext",
      "hierarchicalRetrievalShadow",
      "maintenanceLoop",
      "nonUserPromptIngestion",
      "projectStateCapsule",
      "runtimeGraph",
      "slice8IntegrationProof",
      "slice9EvalProof",
    ]);
    expect(proof.checks.map((entry) => entry.area)).toEqual(
      expect.arrayContaining([
        "maintenance_loop",
        "runtime_graph",
        "project_state_capsule",
        "capsule_retrieval_shadow",
        "gated_capsule_context",
        "hierarchical_retrieval_shadow",
        "slice8_integration_proof",
        "slice9_eval_proof",
        "non_user_prompt_ingestion",
      ]),
    );
    expect(proof.checks.every((entry) => entry.status === "pass")).toBe(true);
    expect(proof.noDarkDataValidationStatus).toBe("pass");
  });

  it("summarizes maintenance candidates and lifecycle without surfacing content", () => {
    const proof = report();

    expect(proof.coverage.maintenanceLoop.eventCandidateIds).toHaveLength(1);
    expect(proof.coverage.maintenanceLoop.retention).toEqual({
      activeDays: 30,
      archivedDays: 90,
    });
    expect(Object.values(proof.coverage.maintenanceLoop.lifecycleStatuses)).toEqual(
      expect.arrayContaining(["active", "archived", "expired"]),
    );
    expect(
      proof.coverage.maintenanceLoop.lifecycleStatuses[
        proof.coverage.maintenanceLoop.pinnedCandidateId
      ],
    ).toBe("active");
  });

  it("proves graph, capsule, shadow retrieval, gated context, and hierarchical telemetry", () => {
    const proof = report();

    expect(proof.coverage.runtimeGraph).toMatchObject({
      available: true,
    });
    expect(proof.coverage.runtimeGraph.nodeIds.length).toBeGreaterThan(0);
    expect(proof.coverage.runtimeGraph.edgeIds.length).toBeGreaterThan(0);
    expect(proof.coverage.runtimeGraph.excludedMemoryIds).toEqual(
      expect.arrayContaining(["mem-ui-conflicted", "mem-ui-inspection-only"]),
    );

    expect(proof.coverage.projectStateCapsule.capsuleId).toBeTruthy();
    expect(proof.coverage.projectStateCapsule.contentHash).toBeTruthy();
    expect(proof.coverage.projectStateCapsule.lowerAuthorityItemIds.length).toBeGreaterThan(0);
    expect(proof.coverage.projectStateCapsule.conflictSectionItemIds.length).toBeGreaterThan(0);

    expect(proof.coverage.capsuleRetrievalShadow.wouldSelectCapsuleIds).toHaveLength(1);
    expect(proof.coverage.capsuleRetrievalShadow.defaultContextInjectionChanged).toBe(false);

    expect(proof.coverage.gatedCapsuleContext).toMatchObject({
      disabledInjected: false,
      explicitInjected: true,
      defaultContextInjectionChanged: false,
    });
    expect(proof.coverage.gatedCapsuleContext.estimatedTokens).toBeGreaterThan(0);

    expect(proof.coverage.hierarchicalRetrievalShadow).toMatchObject({
      subqueryCount: 3,
      graphLaneUsed: true,
      projectionLaneUsed: true,
      capsuleLaneUsed: true,
      defaultRetrievalChanged: false,
    });
  });

  it("proves Slice 8 and Slice 9 reports through operator-visible summaries", () => {
    const proof = report();

    expect(proof.coverage.slice8IntegrationProof.selectedLanes).toEqual([
      "object_retrieval",
      "projection_digest",
      "runtime_graph",
      "project_state_capsule",
      "capsule_retrieval_shadow",
      "gated_capsule_context",
      "hierarchical_retrieval_shadow",
      "retrieval_pack_artifact",
    ]);
    expect(proof.coverage.slice8IntegrationProof.defaultRetrievalChanged).toBe(false);
    expect(proof.coverage.slice8IntegrationProof.defaultContextInjectionChanged).toBe(false);

    expect(proof.coverage.slice9EvalProof.scenarioCount).toBeGreaterThanOrEqual(12);
    expect(proof.coverage.slice9EvalProof.noDarkDataValidationStatus).toBe("pass");
    expect(proof.coverage.slice9EvalProof.sourceProfileIds).toEqual(
      expect.arrayContaining(["tool_result_capture", "daily_continuity"]),
    );
  });

  it("covers non-user-prompt ingestion sources and excludes inspection/prohibited inputs", () => {
    const proof = report();

    expect(proof.coverage.nonUserPromptIngestion.toolGrounded).toMatchObject({
      admittedCount: 1,
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
    });
    expect(proof.coverage.nonUserPromptIngestion.toolGrounded.memoryIds).toHaveLength(1);
    expect(proof.coverage.nonUserPromptIngestion.dailyContinuity).toMatchObject({
      represented: true,
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
    });
    expect(proof.coverage.nonUserPromptIngestion.inspectionOnlyExcluded).toBe(true);
    expect(proof.coverage.nonUserPromptIngestion.prohibitedContentRejected).toBe(true);
  });

  it("is deterministic and does not mutate returned reports", () => {
    const first = report();
    const second = report();

    expect(first).toEqual(second);
    first.checks.length = 0;
    expect(report().checks.length).toBeGreaterThan(0);
  });

  it("requires no dark data and explicit gates", () => {
    const proof = report();
    assertPhase2UiRuntimeProofCoveragePassed(proof);

    expect(proof.coverage.gatedCapsuleContext.disabledInjected).toBe(false);
    expect(proof.defaultRetrievalChanged).toBe(false);
    expect(proof.defaultContextInjectionChanged).toBe(false);

    const serialized = JSON.stringify(proof);
    for (const marker of [
      ["raw", "-", "prompt", "-", "marker"],
      ["raw", "-", "transcript", "-", "marker"],
      ["raw", "-", "tool", "-", "log", "-", "marker"],
      ["secret", "-", "marker"],
      ["private", "-", "phrase", "-", "marker"],
    ]) {
      expect(serialized).not.toContain(marker.join(""));
    }
    expect(() =>
      buildPhase2UiRuntimeProofCoverage({
        mode: "explicit_operator_proof",
        now,
        [(["raw", "Prompt"] as const).join("")]: "blocked",
      } as any),
    ).toThrow(/prohibited field/u);
  });

  it("writes bounded derived JSON artifacts", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase2-ui-proof-coverage-"));
    const proof = report();
    const written = await writePhase2UiRuntimeProofCoverageArtifact({
      report: proof,
      artifactDir,
    });
    const parsed = JSON.parse(await fs.readFile(written.path, "utf8"));

    expect(parsed.reportId).toBe(proof.reportId);
    expect(written.contentHash).toBeTruthy();
  });
});
