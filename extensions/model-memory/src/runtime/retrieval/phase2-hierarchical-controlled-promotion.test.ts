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
  APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256,
  APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID,
  assertPhase2HierarchicalControlledLive,
  buildPhase2HierarchicalControlledPromotion,
  writePhase2HierarchicalControlledPromotionArtifact,
} from "./phase2-hierarchical-controlled-promotion.ts";
import {
  buildPhase2ScopedProductionObservation,
  writePhase2ScopedProductionObservationArtifact,
} from "./phase2-scoped-production-rollout.ts";

const TEMP_ROOT = ".artifacts/test-phase2-hierarchical-controlled-promotion";
const now = new Date("2026-04-25T00:00:00.000Z");

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
    proofRunId: `phase2-hierarchical-controlled-${testId}`,
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
    proofMarker: `PHASE2-HIERARCHICAL-CONTROLLED-${testId}`,
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
    proofMarker: `PHASE2-HIERARCHICAL-CONTROLLED-${testId}`,
    now,
  });
  const written = await writePhase2DefaultPromotionArtifact({
    report: defaultPromotion,
    artifactDir: defaultDir,
  });
  return {
    defaultPromotion,
    defaultArtifactPath: written.jsonPath,
    defaultSha256: await sha256File(written.jsonPath),
  };
}

async function buildReport(testId: string) {
  const artifact = await makeDefaultPromotionArtifact(testId);
  const report = await buildPhase2HierarchicalControlledPromotion({
    defaultPromotionArtifactPath: artifact.defaultArtifactPath,
    expectedDefaultPromotionReportId: artifact.defaultPromotion.reportId,
    expectedDefaultPromotionSha256: artifact.defaultSha256,
    projectId: "phase2-hierarchical-controlled-project",
    sessionKey: "main",
    operatorId: "operator",
    proofMarker: `PHASE2-HIERARCHICAL-CONTROLLED-${testId}`,
    now,
  });
  return { artifact, report };
}

describe("phase2 hierarchical controlled promotion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("promotes hierarchical retrieval to live controlled scope only", async () => {
    const { report } = await buildReport("live-controlled");

    assertPhase2HierarchicalControlledLive(report);
    expect(report.decision).toBe("live_controlled");
    expect(report.config.defaultPromoted).toBe(false);
    expect(report.outsideScope.mode).toBe("shadow_report_only");
    expect(report.insideScope.mode).toBe("explicit_eval");
    expect(report.rollback.mode).toBe("disabled");
    expect(report.telemetry.defaultRetrievalChanged).toBe(false);
    expect(report.telemetry.defaultContextInjectionChanged).toBe(false);
  });

  it("runs bounded fan-out and preserves provenance through deterministic merge/dedupe", async () => {
    const { report } = await buildReport("bounded-fanout");

    expect(report.telemetry.subqueryCount).toBeGreaterThan(1);
    expect(report.telemetry.subqueryCount).toBeLessThanOrEqual(5);
    expect(report.telemetry.duplicateMergeReasons).toContain("memory_id_match");
    expect(report.telemetry.sourceMemoryIds).toEqual(
      expect.arrayContaining(["default-promotion-authoritative"]),
    );
    expect(report.telemetry.sourceProfileIds).toEqual(
      expect.arrayContaining(["explicit_user_turn"]),
    );
    expect(report.telemetry.authorityTiers).toEqual(expect.arrayContaining(["user_authoritative"]));
    expect(report.telemetry.lanesUsed).toEqual(
      expect.arrayContaining(["graph", "capsule", "projection_digest"]),
    );
  });

  it("keeps stale and inspection-only exclusions visible", async () => {
    const { report } = await buildReport("exclusions");

    expect(report.telemetry.exclusionReasons.stale).toBeGreaterThan(0);
    expect(report.telemetry.exclusionReasons.inspection_only).toBeGreaterThan(0);
    expect(report.telemetry.excludedIds).toEqual(
      expect.arrayContaining([
        "hierarchical-controlled-inspection",
        "hierarchical-controlled-stale",
      ]),
    );
  });

  it("rollback kill switch prevents live controlled hierarchical mode", async () => {
    const artifact = await makeDefaultPromotionArtifact("kill-switch");
    const report = await buildPhase2HierarchicalControlledPromotion({
      defaultPromotionArtifactPath: artifact.defaultArtifactPath,
      expectedDefaultPromotionReportId: artifact.defaultPromotion.reportId,
      expectedDefaultPromotionSha256: artifact.defaultSha256,
      env: { MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED: "1" },
      now,
    });

    expect(report.decision).toBe("partial");
    expect(report.config.enabled).toBe(false);
    expect(report.insideScope.mode).toBe("disabled");
    expect(report.rollback.mode).toBe("disabled");
  });

  it("rejects wrong approved proof artifact ids and hashes", async () => {
    const artifact = await makeDefaultPromotionArtifact("reject");

    await expect(
      buildPhase2HierarchicalControlledPromotion({
        defaultPromotionArtifactPath: artifact.defaultArtifactPath,
        expectedDefaultPromotionReportId: "wrong-report",
        expectedDefaultPromotionSha256: artifact.defaultSha256,
        now,
      }),
    ).rejects.toThrow(/report id/u);
    await expect(
      buildPhase2HierarchicalControlledPromotion({
        defaultPromotionArtifactPath: artifact.defaultArtifactPath,
        expectedDefaultPromotionReportId: artifact.defaultPromotion.reportId,
        expectedDefaultPromotionSha256: "wrong-sha",
        now,
      }),
    ).rejects.toThrow(/sha256/u);
  });

  it("writes bounded safe artifacts", async () => {
    const { report } = await buildReport("write");
    const written = await writePhase2HierarchicalControlledPromotionArtifact({
      report,
      artifactDir: path.join(TEMP_ROOT, "written"),
    });
    expect(written.jsonPath).toContain("phase2-hierarchical-controlled-promotion");
    expect(written.markdownPath.endsWith("report.md")).toBe(true);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("raw-transcript-marker");
    expect(serialized).not.toContain("raw-tool-log-marker");
    expect(serialized).not.toContain("secret-marker");
    expect(serialized).not.toContain("private-phrase-marker");
  });

  it("keeps approved default-promotion constants aligned", () => {
    expect(APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID).toBe(
      "1228de9c-f392-52c1-9666-f351bee1a40a",
    );
    expect(APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256).toBe(
      "eb0b52785e1def93348a309e6da588baeba0fae591cf907981ebe2f0ba5033d6",
    );
  });
});
