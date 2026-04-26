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
  APPROVED_PHASE2_GO_LIVE_ARTIFACT_SHA256,
  APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_PATH,
  APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_SHA256,
  APPROVED_PHASE2_SCOPED_OBSERVATION_REPORT_ID,
  assertPhase2DefaultPromotionApproved,
  buildPhase2DefaultPromotionDecision,
  writePhase2DefaultPromotionArtifact,
} from "./phase2-default-promotion.ts";
import {
  buildPhase2ScopedProductionObservation,
  writePhase2ScopedProductionObservationArtifact,
} from "./phase2-scoped-production-rollout.ts";

const TEMP_ROOT = ".artifacts/test-phase2-default-promotion";
const now = new Date("2026-04-25T00:00:00.000Z");

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(filePath, "utf8"))
    .digest("hex");
}

async function makeApprovedArtifacts(testId: string) {
  const slice13Dir = path.join(TEMP_ROOT, testId, "slice13");
  const goLiveDir = path.join(TEMP_ROOT, testId, "go-live");
  const scopedDir = path.join(TEMP_ROOT, testId, "scoped");
  const slice13 = buildPhase2ControlledConfigUiProof({
    projectId: "phase2-controlled-config-ui-proof-project",
    proofRunId: `phase2-default-promotion-${testId}`,
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
    proofMarker: `PHASE2-DEFAULT-PROMOTION-${testId}`,
    now,
  });
  const scopedWritten = await writePhase2ScopedProductionObservationArtifact({
    report: scoped,
    artifactDir: scopedDir,
  });

  return {
    goLive,
    scoped,
    goLiveArtifactPath,
    scopedArtifactPath: scopedWritten.jsonPath,
    goLiveSha256: await sha256File(goLiveArtifactPath),
    scopedSha256: await sha256File(scopedWritten.jsonPath),
  };
}

async function buildReport(testId: string) {
  const artifact = await makeApprovedArtifacts(testId);
  const report = await buildPhase2DefaultPromotionDecision({
    goLiveArtifactPath: artifact.goLiveArtifactPath,
    scopedObservationArtifactPath: artifact.scopedArtifactPath,
    expectedGoLiveReportId: artifact.goLive.reportId,
    expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
    expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
    expectedGoLiveSha256: artifact.goLiveSha256,
    expectedScopedObservationReportId: artifact.scoped.reportId,
    expectedScopedObservationSha256: artifact.scopedSha256,
    proofMarker: `PHASE2-DEFAULT-PROMOTION-${testId}`,
    now,
  });
  return { artifact, report };
}

async function mutateJsonArtifact(
  artifactPath: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const parsed = JSON.parse(await fs.readFile(artifactPath, "utf8")) as Record<string, unknown>;
  mutate(parsed);
  await fs.writeFile(artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

describe("phase2 default promotion decision", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves only proof-backed default graph, capsule retrieval, and capsule context", async () => {
    const { artifact, report } = await buildReport("approve");

    assertPhase2DefaultPromotionApproved(report);
    expect(report.decision).toBe("approved_for_default");
    expect(report.goLiveArtifact.sha256).toBe(artifact.goLiveSha256);
    expect(report.scopedObservationArtifact.sha256).toBe(artifact.scopedSha256);
    expect(report.telemetry.promotedCapabilities).toEqual([
      "project_state_capsule_context",
      "project_state_capsule_retrieval",
      "runtime_graph_reads",
    ]);
    expect(report.defaultPromotionConfig.capabilityModes.runtime_graph_reads).toBe(
      "controlled_production",
    );
    expect(report.defaultPromotionConfig.capabilityModes.project_state_capsule_retrieval).toBe(
      "controlled_production",
    );
    expect(report.defaultPromotionConfig.capabilityModes.project_state_capsule_context).toBe(
      "controlled_production",
    );
    expect(report.defaultPromotionConfig.capabilityModes.hierarchical_retrieval).toBe(
      "shadow_report_only",
    );
    expect(report.defaultControlledPack.runtimeGraph?.readOnly).toBe(true);
    expect(report.defaultControlledPack.capsuleRetrievalShadow?.packs.length).toBeGreaterThan(0);
    expect(report.defaultControlledPack.capsuleContext?.blocks.length).toBeGreaterThan(0);
    expect(report.telemetry.defaultRetrievalChanged).toBe(true);
    expect(report.telemetry.defaultContextInjectionChanged).toBe(true);
  });

  it("rejects wrong proof artifact ids and hashes", async () => {
    const artifact = await makeApprovedArtifacts("reject-hash");

    await expect(
      buildPhase2DefaultPromotionDecision({
        goLiveArtifactPath: artifact.goLiveArtifactPath,
        scopedObservationArtifactPath: artifact.scopedArtifactPath,
        expectedGoLiveReportId: "wrong-report",
        expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
        expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
        expectedGoLiveSha256: artifact.goLiveSha256,
        expectedScopedObservationReportId: artifact.scoped.reportId,
        expectedScopedObservationSha256: artifact.scopedSha256,
        now,
      }),
    ).rejects.toThrow(/report id/u);

    await expect(
      buildPhase2DefaultPromotionDecision({
        goLiveArtifactPath: artifact.goLiveArtifactPath,
        scopedObservationArtifactPath: artifact.scopedArtifactPath,
        expectedGoLiveReportId: artifact.goLive.reportId,
        expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
        expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
        expectedGoLiveSha256: "wrong-sha",
        expectedScopedObservationReportId: artifact.scoped.reportId,
        expectedScopedObservationSha256: artifact.scopedSha256,
        now,
      }),
    ).rejects.toThrow(/go-live artifact sha256/u);
  });

  it("blocks or partially approves when scoped proof is missing or failing", async () => {
    const artifact = await makeApprovedArtifacts("failing-scoped");
    await mutateJsonArtifact(artifact.scopedArtifactPath, (value) => {
      value.status = "blocked";
      value.noDarkDataStatus = "fail";
    });
    const scopedSha256 = await sha256File(artifact.scopedArtifactPath);
    const report = await buildPhase2DefaultPromotionDecision({
      goLiveArtifactPath: artifact.goLiveArtifactPath,
      scopedObservationArtifactPath: artifact.scopedArtifactPath,
      expectedGoLiveReportId: artifact.goLive.reportId,
      expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
      expectedGoLiveSha256: artifact.goLiveSha256,
      expectedScopedObservationReportId: artifact.scoped.reportId,
      expectedScopedObservationSha256: scopedSha256,
      now,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.defaultPromotionConfig.enabled).toBe(false);
    expect(report.defaultPromotionConfig.capabilityModes.project_state_capsule_context).toBe(
      "disabled",
    );
    expect(report.checks.some((check) => check.status === "fail")).toBe(true);
  });

  it("rollback kill switch disables promoted behavior", async () => {
    const artifact = await makeApprovedArtifacts("rollback");
    const report = await buildPhase2DefaultPromotionDecision({
      goLiveArtifactPath: artifact.goLiveArtifactPath,
      scopedObservationArtifactPath: artifact.scopedArtifactPath,
      expectedGoLiveReportId: artifact.goLive.reportId,
      expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
      expectedGoLiveSha256: artifact.goLiveSha256,
      expectedScopedObservationReportId: artifact.scoped.reportId,
      expectedScopedObservationSha256: artifact.scopedSha256,
      env: { MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED: "1" },
      now,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.defaultPromotionConfig.enabled).toBe(false);
    expect(report.defaultControlledPack.mode).toBe("disabled");
    expect(report.defaultControlledPack.capsuleContext).toBeUndefined();
    expect(report.rollbackControlledPack.mode).toBe("disabled");
  });

  it("preserves safety, provenance, and lower-authority signals in default output", async () => {
    const { report } = await buildReport("safety");
    const contextText = report.defaultControlledPack.capsuleContext?.renderedText ?? "";

    expect(report.telemetry.sourceMemoryIds).toEqual(
      expect.arrayContaining(["default-promotion-authoritative", "default-promotion-soft"]),
    );
    expect(report.telemetry.sourceProfileIds).toEqual(
      expect.arrayContaining(["explicit_user_turn", "tool_result_capture"]),
    );
    expect(report.telemetry.authorityTiers).toEqual(
      expect.arrayContaining(["user_authoritative", "tool_grounded"]),
    );
    expect(contextText).toContain("label:lower_authority");
    expect(contextText).not.toContain("default-promotion-inspection");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ checkId: "stale_conflict_blocked", status: "pass" }),
      ]),
    );
  });

  it("keeps hierarchical retrieval in next-build shadow readiness, not default promotion", async () => {
    const { report } = await buildReport("hierarchical");

    expect(report.hierarchicalReadiness.status).toBe("ready_for_controlled_promotion_proof");
    expect(report.hierarchicalReadiness.defaultPromoted).toBe(false);
    expect(report.defaultPromotionConfig.capabilityModes.hierarchical_retrieval).toBe(
      "shadow_report_only",
    );
    expect(report.hierarchicalReadiness.reasonCodes).toEqual(
      expect.arrayContaining(["default_promotion_deferred"]),
    );
  });

  it("writes bounded deterministic report artifacts without dark data", async () => {
    const { artifact, report } = await buildReport("write");
    const second = await buildPhase2DefaultPromotionDecision({
      goLiveArtifactPath: artifact.goLiveArtifactPath,
      scopedObservationArtifactPath: artifact.scopedArtifactPath,
      expectedGoLiveReportId: report.goLiveArtifact.reportId,
      expectedGoLiveScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedGoLiveConfigId: artifact.goLive.rolloutReport.configId,
      expectedGoLiveSha256: report.goLiveArtifact.sha256,
      expectedScopedObservationReportId: report.scopedObservationArtifact.reportId,
      expectedScopedObservationSha256: report.scopedObservationArtifact.sha256,
      proofMarker: "PHASE2-DEFAULT-PROMOTION-write",
      now,
    });
    expect(report.reportId).toBe(second.reportId);

    const written = await writePhase2DefaultPromotionArtifact({
      report,
      artifactDir: path.join(TEMP_ROOT, "written"),
    });
    expect(written.jsonPath).toContain("phase2-default-promotion");
    expect(written.markdownPath.endsWith("report.md")).toBe(true);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("raw-transcript-marker");
    expect(serialized).not.toContain("raw-tool-log-marker");
    expect(serialized).not.toContain("secret-marker");
    expect(serialized).not.toContain("private-phrase-marker");
  });

  it("keeps approved default-promotion constants aligned with reviewed artifacts", () => {
    expect(APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_PATH).toBe(
      ".artifacts/model-memory/phase2-scoped-production-rollout-proof/20260425T232602137Z/77f8945e-9160-5664-a2c6-318eacf16478.phase2-scoped-production-observation.json",
    );
    expect(APPROVED_PHASE2_SCOPED_OBSERVATION_REPORT_ID).toBe(
      "77f8945e-9160-5664-a2c6-318eacf16478",
    );
    expect(APPROVED_PHASE2_GO_LIVE_ARTIFACT_SHA256).toBe(
      "5466bcc5c15c6be7f9244e2525a04ffcab982c3ee6532fff4fa302859715f3ef",
    );
    expect(APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_SHA256).toBe(
      "204106335cee1e407b9bb34d363ad08715ab2cd275a7c1531581d46c1c5ce41c",
    );
  });
});
