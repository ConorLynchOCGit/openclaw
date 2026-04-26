import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledConfigUiProof,
  writePhase2ControlledConfigUiProofArtifact,
} from "../../proof/phase2-controlled-config-ui-proof.ts";
import {
  buildPhase2ControlledProductionGoLiveValidation,
  writePhase2ControlledProductionGoLiveValidationArtifact,
} from "../../proof/phase2-controlled-production-go-live.ts";
import {
  buildPhase2DefaultPromotionDecision,
  writePhase2DefaultPromotionArtifact,
} from "./phase2-default-promotion.ts";
import {
  buildPhase2HierarchicalControlledPromotion,
  writePhase2HierarchicalControlledPromotionArtifact,
} from "./phase2-hierarchical-controlled-promotion.ts";
import {
  APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_PATH,
  APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_SHA256,
  APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_REPORT_ID,
  assertPhase2HierarchicalDefaultPromoted,
  buildPhase2HierarchicalDefaultPromotion,
  writePhase2HierarchicalDefaultPromotionArtifact,
} from "./phase2-hierarchical-default-promotion.ts";
import {
  buildPhase2ScopedProductionObservation,
  writePhase2ScopedProductionObservationArtifact,
} from "./phase2-scoped-production-rollout.ts";

const TEMP_ROOT = ".artifacts/test-phase2-hierarchical-default-promotion";
const now = new Date("2026-04-26T00:00:00.000Z");

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath, "utf8"))
    .digest("hex");
}

async function makeDefaultPromotionArtifact(testId: string) {
  const slice13Dir = path.join(TEMP_ROOT, testId, "slice13");
  const goLiveDir = path.join(TEMP_ROOT, testId, "go-live");
  const scopedDir = path.join(TEMP_ROOT, testId, "scoped");
  const defaultDir = path.join(TEMP_ROOT, testId, "default");
  const slice13 = buildPhase2ControlledConfigUiProof({
    projectId: "phase2-controlled-config-ui-proof-project",
    proofRunId: `phase2-hierarchical-default-${testId}`,
    now,
  });
  await writePhase2ControlledConfigUiProofArtifact({ report: slice13, artifactDir: slice13Dir });
  const goLive = await buildPhase2ControlledProductionGoLiveValidation({
    slice13ArtifactPath: path.join(slice13Dir, "report.json"),
    projectId: "phase2-controlled-config-ui-proof-project",
    sessionKey: "main",
    operatorId: "operator",
    now,
  });
  await writePhase2ControlledProductionGoLiveValidationArtifact({
    report: goLive,
    artifactDir: goLiveDir,
  });
  const goLiveArtifactPath = path.join(
    goLiveDir,
    `${goLive.reportId}.phase2-go-live-validation.json`,
  );
  const scoped = await buildPhase2ScopedProductionObservation({
    goLiveArtifactPath,
    expectedReportId: goLive.reportId,
    expectedScopeId: goLive.rolloutScope.scopeId,
    expectedConfigId: goLive.rolloutReport.configId,
    sessionKey: "main",
    projectId: "phase2-controlled-config-ui-proof-project",
    operatorId: "operator",
    proofMarker: `PHASE2-HIERARCHICAL-DEFAULT-${testId}`,
    now,
  });
  const scopedWritten = await writePhase2ScopedProductionObservationArtifact({
    report: scoped,
    artifactDir: scopedDir,
  });
  const defaultPromotion = await buildPhase2DefaultPromotionDecision({
    goLiveArtifactPath,
    scopedObservationArtifactPath: scopedWritten.jsonPath,
    expectedGoLiveReportId: goLive.reportId,
    expectedGoLiveScopeId: goLive.rolloutScope.scopeId,
    expectedGoLiveConfigId: goLive.rolloutReport.configId,
    expectedGoLiveSha256: await sha256File(goLiveArtifactPath),
    expectedScopedObservationReportId: scoped.reportId,
    expectedScopedObservationSha256: await sha256File(scopedWritten.jsonPath),
    proofMarker: `PHASE2-HIERARCHICAL-DEFAULT-${testId}`,
    now,
  });
  const defaultWritten = await writePhase2DefaultPromotionArtifact({
    report: defaultPromotion,
    artifactDir: defaultDir,
  });
  return {
    defaultPromotion,
    defaultArtifactPath: defaultWritten.jsonPath,
    defaultSha256: await sha256File(defaultWritten.jsonPath),
  };
}

async function makeArtifacts(testId: string) {
  const controlledDir = path.join(TEMP_ROOT, testId, "controlled");
  const defaultArtifact = await makeDefaultPromotionArtifact(testId);
  const controlled = await buildPhase2HierarchicalControlledPromotion({
    defaultPromotionArtifactPath: defaultArtifact.defaultArtifactPath,
    expectedDefaultPromotionReportId: defaultArtifact.defaultPromotion.reportId,
    expectedDefaultPromotionSha256: defaultArtifact.defaultSha256,
    proofMarker: `PHASE2-HIERARCHICAL-DEFAULT-${testId}`,
    now,
  });
  const controlledWritten = await writePhase2HierarchicalControlledPromotionArtifact({
    report: controlled,
    artifactDir: controlledDir,
  });
  return {
    ...defaultArtifact,
    controlled,
    controlledArtifactPath: controlledWritten.jsonPath,
    controlledSha256: await sha256File(controlledWritten.jsonPath),
  };
}

async function mutateJsonArtifact(
  artifactPath: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const parsed = JSON.parse(await fs.readFile(artifactPath, "utf8")) as Record<string, unknown>;
  mutate(parsed);
  await fs.writeFile(artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

describe("phase2 hierarchical default promotion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves proof-bound hierarchical retrieval as default behavior", async () => {
    const artifacts = await makeArtifacts("approve");
    const report = await buildPhase2HierarchicalDefaultPromotion({
      defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
      hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
      expectedDefaultPromotionReportId: artifacts.defaultPromotion.reportId,
      expectedDefaultPromotionSha256: artifacts.defaultSha256,
      expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
      expectedHierarchicalControlledSha256: artifacts.controlledSha256,
      proofMarker: "PHASE2-HIERARCHICAL-DEFAULT-APPROVE",
      now,
    });

    assertPhase2HierarchicalDefaultPromoted(report);
    expect(report.decision).toBe("approved_for_default");
    expect(report.config.mode).toBe("controlled_production");
    expect(report.ordinaryDefault.mode).toBe("explicit_eval");
    expect(report.telemetry.defaultRetrievalChanged).toBe(true);
    expect(report.telemetry.defaultContextInjectionChanged).toBe(false);
    expect(report.telemetry.subqueryCount).toBeLessThanOrEqual(4);
    expect(report.telemetry.duplicateMergeReasons).toContain("memory_id_match");
    expect(report.telemetry.exclusionReasons.stale).toBeGreaterThan(0);
    expect(report.telemetry.exclusionReasons.inspection_only).toBeGreaterThan(0);
    expect(report.exactRecentRegression.exactRecentWins).toBe(true);
  });

  it("rejects wrong artifact ids and hashes", async () => {
    const artifacts = await makeArtifacts("reject");
    await expect(
      buildPhase2HierarchicalDefaultPromotion({
        defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
        hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
        expectedDefaultPromotionReportId: "wrong-report",
        expectedDefaultPromotionSha256: artifacts.defaultSha256,
        expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
        expectedHierarchicalControlledSha256: artifacts.controlledSha256,
        now,
      }),
    ).rejects.toThrow(/report id/u);

    await expect(
      buildPhase2HierarchicalDefaultPromotion({
        defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
        hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
        expectedDefaultPromotionReportId: artifacts.defaultPromotion.reportId,
        expectedDefaultPromotionSha256: artifacts.defaultSha256,
        expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
        expectedHierarchicalControlledSha256: "wrong-sha",
        now,
      }),
    ).rejects.toThrow(/sha256/u);
  });

  it("partially approves when controlled proof is failing", async () => {
    const artifacts = await makeArtifacts("partial");
    await mutateJsonArtifact(artifacts.controlledArtifactPath, (value) => {
      value.noDarkDataStatus = "fail";
    });
    const controlledSha256 = await sha256File(artifacts.controlledArtifactPath);
    const report = await buildPhase2HierarchicalDefaultPromotion({
      defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
      hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
      expectedDefaultPromotionReportId: artifacts.defaultPromotion.reportId,
      expectedDefaultPromotionSha256: artifacts.defaultSha256,
      expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
      expectedHierarchicalControlledSha256: controlledSha256,
      now,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.config.enabled).toBe(false);
    expect(report.config.mode).toBe("shadow_report_only");
  });

  it("rollback kill switch restores single-pass shadow behavior", async () => {
    const artifacts = await makeArtifacts("rollback");
    const report = await buildPhase2HierarchicalDefaultPromotion({
      defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
      hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
      expectedDefaultPromotionReportId: artifacts.defaultPromotion.reportId,
      expectedDefaultPromotionSha256: artifacts.defaultSha256,
      expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
      expectedHierarchicalControlledSha256: artifacts.controlledSha256,
      env: { MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED: "1" },
      now,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.config.enabled).toBe(false);
    expect(report.rollback.mode).toBe("shadow_report_only");
    expect(report.telemetry.rollbackObserved).toBe(true);
  });

  it("writes bounded safe artifacts", async () => {
    const artifacts = await makeArtifacts("write");
    const report = await buildPhase2HierarchicalDefaultPromotion({
      defaultPromotionArtifactPath: artifacts.defaultArtifactPath,
      hierarchicalControlledArtifactPath: artifacts.controlledArtifactPath,
      expectedDefaultPromotionReportId: artifacts.defaultPromotion.reportId,
      expectedDefaultPromotionSha256: artifacts.defaultSha256,
      expectedHierarchicalControlledReportId: artifacts.controlled.reportId,
      expectedHierarchicalControlledSha256: artifacts.controlledSha256,
      now,
    });
    const written = await writePhase2HierarchicalDefaultPromotionArtifact({
      report,
      artifactDir: path.join(TEMP_ROOT, "write-artifact"),
    });

    expect(written.byteLength).toBeGreaterThan(0);
    expect(written.byteLength).toBeLessThan(512 * 1024);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("private-phrase-marker");
  });

  it("tracks the approved controlled proof artifact constants", async () => {
    const sha = await sha256File(APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_PATH);

    expect(APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_REPORT_ID).toBe(
      "51a9f1a4-4787-5b05-9664-3614992a0bf2",
    );
    expect(sha).toBe(APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_SHA256);
  });
});
