import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledConfigUiProof,
  writePhase2ControlledConfigUiProofArtifact,
} from "./phase2-controlled-config-ui-proof.ts";
import {
  assertPhase2ControlledProductionGoLiveValidationPassed,
  buildPhase2ControlledProductionGoLiveValidation,
  reviewPhase2GoLiveProofArtifact,
  writePhase2ControlledProductionGoLiveValidationArtifact,
} from "./phase2-controlled-production-go-live.ts";

const TEMP_ROOT = ".artifacts/test-phase2-go-live-validation";

async function makeSlice13Artifact(testId: string) {
  const artifactDir = path.join(TEMP_ROOT, testId);
  const report = buildPhase2ControlledConfigUiProof({
    projectId: "phase2-go-live-test-project",
    proofRunId: `phase2-go-live-test-${testId}`,
    now: new Date("2026-04-25T00:00:00.000Z"),
  });
  await writePhase2ControlledConfigUiProofArtifact({
    report,
    artifactDir,
  });
  return {
    report,
    artifactPath: path.join(artifactDir, "report.json"),
    artifactDir,
  };
}

describe("phase2 controlled production go-live validation", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("reviews a valid Slice 13 controlled config proof artifact", async () => {
    const artifact = await makeSlice13Artifact("review-valid");
    const selection = await reviewPhase2GoLiveProofArtifact({
      family: "slice13_controlled_config_ui",
      artifactPath: artifact.artifactPath,
    });

    expect(selection.status).toBe("pass");
    expect(selection.reportId).toBe(artifact.report.reportId);
    expect(selection.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(selection.reasonCodes).toEqual([]);
  });

  it("rejects failed checks and changed default behavior in proof artifact review", async () => {
    const artifact = await makeSlice13Artifact("review-fail");
    const parsed = JSON.parse(await fs.readFile(artifact.artifactPath, "utf8")) as Record<
      string,
      unknown
    >;
    parsed.defaultRetrievalChanged = true;
    parsed.checks = [{ checkId: "broken", status: "fail", reasonCode: "forced_failure" }];
    await fs.writeFile(artifact.artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    const selection = await reviewPhase2GoLiveProofArtifact({
      family: "slice13_controlled_config_ui",
      artifactPath: artifact.artifactPath,
    });

    expect(selection.status).toBe("fail");
    expect(selection.reasonCodes).toContain("failed_checks");
    expect(selection.reasonCodes).toContain("default_behavior_changed");
  });

  it("rejects prohibited raw-content keys while reviewing artifacts", async () => {
    const artifact = await makeSlice13Artifact("review-dark-data");
    const parsed = JSON.parse(await fs.readFile(artifact.artifactPath, "utf8")) as Record<
      string,
      unknown
    >;
    parsed.rawPrompt = "not allowed";
    await fs.writeFile(artifact.artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    await expect(
      reviewPhase2GoLiveProofArtifact({
        family: "slice13_controlled_config_ui",
        artifactPath: artifact.artifactPath,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });

  it("builds a conservative scoped go-live decision with required proof selections", async () => {
    const artifact = await makeSlice13Artifact("go-live-build");
    const report = await buildPhase2ControlledProductionGoLiveValidation({
      slice13ArtifactPath: artifact.artifactPath,
      projectId: "phase2-go-live-test-project",
      sessionKey: "main",
      operatorId: "operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    assertPhase2ControlledProductionGoLiveValidationPassed(report);
    expect(report.decision).toBe("approved_for_scope");
    expect(report.broadDefaultPromotionApproved).toBe(false);
    expect(report.selectedProofArtifacts.map((selection) => selection.family).toSorted()).toEqual([
      "slice13_controlled_config_ui",
      "slice8_retrieval_integration",
      "slice9_eval",
      "ui_runtime_proof_coverage",
    ]);
    expect(
      report.rolloutScope.capabilities.find(
        (capability) => capability.capability === "runtime_graph_reads",
      ),
    ).toMatchObject({ approved: true, mode: "controlled_production" });
    expect(
      report.rolloutScope.capabilities.find(
        (capability) => capability.capability === "project_state_capsule_context",
      ),
    ).toMatchObject({ approved: true, mode: "controlled_production" });
    expect(
      report.rolloutScope.capabilities.find(
        (capability) => capability.capability === "hierarchical_retrieval",
      ),
    ).toMatchObject({ approved: false, mode: "shadow_report_only" });
    expect(report.defaultRetrievalChanged).toBe(false);
    expect(report.defaultContextInjectionChanged).toBe(false);
    expect(report.coverage.slice7_hierarchical_retrieval_shadow).toBe("shadow_only");
  });

  it("keeps config enablement bounded to the approved scope", async () => {
    const artifact = await makeSlice13Artifact("go-live-scope");
    const report = await buildPhase2ControlledProductionGoLiveValidation({
      slice13ArtifactPath: artifact.artifactPath,
      projectId: "phase2-go-live-test-project",
      sessionKey: "bounded-session",
      operatorId: "bounded-operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    expect(report.rolloutScope.allowedSessions).toEqual(["bounded-session"]);
    expect(report.rolloutScope.allowedProjects).toEqual(["phase2-go-live-test-project"]);
    expect(report.rolloutScope.allowedOperators).toEqual(["bounded-operator"]);
    expect(report.rolloutScope.rollbackPlan.targetModes.project_state_capsule_context).toBe(
      "disabled",
    );
    expect(report.productionRegression.defaultOffVerified).toBe(true);
  });

  it("writes bounded deterministic go-live report artifacts", async () => {
    const artifact = await makeSlice13Artifact("go-live-write");
    const input = {
      slice13ArtifactPath: artifact.artifactPath,
      projectId: "phase2-go-live-test-project",
      sessionKey: "main",
      operatorId: "operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    };
    const first = await buildPhase2ControlledProductionGoLiveValidation(input);
    const second = await buildPhase2ControlledProductionGoLiveValidation(input);

    expect(first.reportId).toBe(second.reportId);
    const written = await writePhase2ControlledProductionGoLiveValidationArtifact({
      report: first,
      artifactDir: path.join(TEMP_ROOT, "written"),
    });
    expect(written.jsonPath).toContain("phase2-go-live-validation");
    expect(written.markdownPath.endsWith("report.md")).toBe(true);
    expect(written.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("secret-marker");
  });
});
