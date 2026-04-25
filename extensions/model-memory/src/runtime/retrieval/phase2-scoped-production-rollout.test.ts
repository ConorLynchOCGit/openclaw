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
import { buildPhase2ControlledRetrievalPack } from "./phase2-controlled-retrieval-packs.ts";
import {
  APPROVED_PHASE2_GO_LIVE_CONFIG_ID,
  APPROVED_PHASE2_GO_LIVE_REPORT_ID,
  APPROVED_PHASE2_GO_LIVE_SCOPE_ID,
  assertPhase2ScopedProductionObserved,
  buildPhase2ScopedProductionObservation,
  buildPhase2ScopedProductionRolloutProfile,
  loadApprovedPhase2ScopedProductionArtifact,
  matchPhase2ScopedProductionScope,
  resolvePhase2ScopedProductionRollout,
  writePhase2ScopedProductionObservationArtifact,
} from "./phase2-scoped-production-rollout.ts";

const TEMP_ROOT = ".artifacts/test-phase2-scoped-production-rollout";

async function makeApprovedArtifact(testId: string) {
  const slice13Dir = path.join(TEMP_ROOT, testId, "slice13");
  const goLiveDir = path.join(TEMP_ROOT, testId, "go-live");
  const slice13 = buildPhase2ControlledConfigUiProof({
    projectId: "phase2-controlled-config-ui-proof-project",
    proofRunId: `phase2-scoped-rollout-${testId}`,
    now: new Date("2026-04-25T00:00:00.000Z"),
  });
  await writePhase2ControlledConfigUiProofArtifact({ report: slice13, artifactDir: slice13Dir });
  const goLive = await buildPhase2ControlledProductionGoLiveValidation({
    slice13ArtifactPath: path.join(slice13Dir, "report.json"),
    projectId: "phase2-controlled-config-ui-proof-project",
    sessionKey: "main",
    operatorId: "operator",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });
  await writePhase2ControlledProductionGoLiveValidationArtifact({
    report: goLive,
    artifactDir: goLiveDir,
  });
  const artifactPath = path.join(goLiveDir, `${goLive.reportId}.phase2-go-live-validation.json`);
  return { goLive, artifactPath };
}

async function mutateArtifact(
  artifactPath: string,
  mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
  const parsed = JSON.parse(await fs.readFile(artifactPath, "utf8")) as Record<string, unknown>;
  mutate(parsed);
  await fs.writeFile(artifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

describe("phase2 scoped production rollout", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("loads the approved go-live artifact only when expected ids match", async () => {
    const artifact = await makeApprovedArtifact("load-valid");
    const loaded = await loadApprovedPhase2ScopedProductionArtifact({
      artifactPath: artifact.artifactPath,
      expectedReportId: artifact.goLive.reportId,
      expectedScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedConfigId: artifact.goLive.rolloutReport.configId,
    });

    expect(loaded.reportId).toBe(artifact.goLive.reportId);
    expect(loaded.decision).toBe("approved_for_scope");
    expect(loaded.broadDefaultPromotionApproved).toBe(false);
  });

  it("rejects wrong report, scope, and config ids", async () => {
    const artifact = await makeApprovedArtifact("load-wrong-ids");

    await expect(
      loadApprovedPhase2ScopedProductionArtifact({
        artifactPath: artifact.artifactPath,
        expectedReportId: "wrong-report",
        expectedScopeId: artifact.goLive.rolloutScope.scopeId,
        expectedConfigId: artifact.goLive.rolloutReport.configId,
      }),
    ).rejects.toThrow(/report id/u);
    await expect(
      loadApprovedPhase2ScopedProductionArtifact({
        artifactPath: artifact.artifactPath,
        expectedReportId: artifact.goLive.reportId,
        expectedScopeId: "wrong-scope",
        expectedConfigId: artifact.goLive.rolloutReport.configId,
      }),
    ).rejects.toThrow(/scope id/u);
    await expect(
      loadApprovedPhase2ScopedProductionArtifact({
        artifactPath: artifact.artifactPath,
        expectedReportId: artifact.goLive.reportId,
        expectedScopeId: artifact.goLive.rolloutScope.scopeId,
        expectedConfigId: "wrong-config",
      }),
    ).rejects.toThrow(/config id/u);
  });

  it("rejects unsafe go-live artifacts", async () => {
    const artifact = await makeApprovedArtifact("load-unsafe");
    await mutateArtifact(artifact.artifactPath, (value) => {
      value.broadDefaultPromotionApproved = true;
    });
    await expect(
      loadApprovedPhase2ScopedProductionArtifact({
        artifactPath: artifact.artifactPath,
        expectedReportId: artifact.goLive.reportId,
        expectedScopeId: artifact.goLive.rolloutScope.scopeId,
        expectedConfigId: artifact.goLive.rolloutReport.configId,
      }),
    ).rejects.toThrow(/broad default/u);

    const dark = await makeApprovedArtifact("load-dark-data");
    await mutateArtifact(dark.artifactPath, (value) => {
      value.rawPrompt = "not allowed";
    });
    await expect(
      loadApprovedPhase2ScopedProductionArtifact({
        artifactPath: dark.artifactPath,
        expectedReportId: dark.goLive.reportId,
        expectedScopeId: dark.goLive.rolloutScope.scopeId,
        expectedConfigId: dark.goLive.rolloutReport.configId,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });

  it("matches only the exact approved session, project, and operator", async () => {
    const artifact = await makeApprovedArtifact("scope-match");
    const profile = buildPhase2ScopedProductionRolloutProfile({
      goLiveReport: artifact.goLive,
      artifactPath: artifact.artifactPath,
    });

    expect(
      matchPhase2ScopedProductionScope({
        profile,
        sessionKey: "main",
        projectId: "phase2-controlled-config-ui-proof-project",
        operatorId: "operator",
      }),
    ).toBe(true);
    expect(
      matchPhase2ScopedProductionScope({
        profile,
        sessionKey: "other",
        projectId: "phase2-controlled-config-ui-proof-project",
        operatorId: "operator",
      }),
    ).toBe(false);
    expect(
      matchPhase2ScopedProductionScope({
        profile,
        sessionKey: "main",
        projectId: "other",
        operatorId: "operator",
      }),
    ).toBe(false);
    expect(
      matchPhase2ScopedProductionScope({
        profile,
        sessionKey: "main",
        projectId: "phase2-controlled-config-ui-proof-project",
        operatorId: "other",
      }),
    ).toBe(false);
  });

  it("resolves outside scope to defaults and inside scope to approved modes", async () => {
    const artifact = await makeApprovedArtifact("resolve");
    const profile = buildPhase2ScopedProductionRolloutProfile({
      goLiveReport: artifact.goLive,
      artifactPath: artifact.artifactPath,
    });
    const outside = resolvePhase2ScopedProductionRollout({
      profile,
      sessionKey: "outside",
      projectId: "phase2-controlled-config-ui-proof-project",
      operatorId: "operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });
    const inside = resolvePhase2ScopedProductionRollout({
      profile,
      sessionKey: "main",
      projectId: "phase2-controlled-config-ui-proof-project",
      operatorId: "operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    expect(outside.decision.decision).toBe("outside_scope_default");
    expect(outside.resolvedOptions.enabled).toBe(false);
    expect(inside.decision.decision).toBe("scoped_production_enabled");
    expect(inside.resolvedOptions.phase2CapabilityModes.runtime_graph_reads).toBe(
      "controlled_production",
    );
    expect(inside.resolvedOptions.phase2CapabilityModes.project_state_capsule_retrieval).toBe(
      "controlled_production",
    );
    expect(inside.resolvedOptions.phase2CapabilityModes.project_state_capsule_context).toBe(
      "controlled_production",
    );
    expect(inside.resolvedOptions.phase2CapabilityModes.hierarchical_retrieval).toBe(
      "shadow_report_only",
    );
    expect(inside.telemetry.goLiveReportId).toBe(artifact.goLive.reportId);
  });

  it("observes scoped production graph, capsule retrieval, and gated context", async () => {
    const artifact = await makeApprovedArtifact("observe");
    const report = await buildPhase2ScopedProductionObservation({
      goLiveArtifactPath: artifact.artifactPath,
      expectedReportId: artifact.goLive.reportId,
      expectedScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedConfigId: artifact.goLive.rolloutReport.configId,
      sessionKey: "main",
      projectId: "phase2-controlled-config-ui-proof-project",
      operatorId: "operator",
      proofMarker: "PHASE2-SCOPED-OBSERVE",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    assertPhase2ScopedProductionObserved(report);
    expect(report.status).toBe("scoped_production_observed");
    expect(report.outsideScope.controlledPackMode).toBe("disabled");
    expect(report.insideScope.controlledPackMode).toBe("explicit_or_controlled");
    expect(report.insideScope.graphReadObserved).toBe(true);
    expect(report.insideScope.capsuleRetrievalObserved).toBe(true);
    expect(report.insideScope.capsuleContextObserved).toBe(true);
    expect(report.insideScope.hierarchicalShadowOnly).toBe(true);
    expect(report.insideScope.lowerAuthorityVisible).toBe(true);
    expect(report.insideScope.inspectionOnlyExcluded).toBe(true);
    expect(report.insideScope.staleConflictBlocked).toBe(true);
    expect(report.telemetry.insideScope.rolloutScopeId).toBe(artifact.goLive.rolloutScope.scopeId);
    expect(report.telemetry.insideScope.rolloutConfigId).toBe(
      artifact.goLive.rolloutReport.configId,
    );
  });

  it("does not change broad default behavior without a profile", () => {
    const resolved = resolvePhase2ScopedProductionRollout({
      sessionKey: "main",
      projectId: "phase2-controlled-config-ui-proof-project",
      operatorId: "operator",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });
    const pack = buildPhase2ControlledRetrievalPack({
      ...resolved.resolvedOptions.controlledRetrievalInput,
      projectId: "phase2-controlled-config-ui-proof-project",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    expect(resolved.decision.matched).toBe(false);
    expect(resolved.resolvedOptions.enabled).toBe(false);
    expect(pack.mode).toBe("disabled");
    expect(pack.telemetry.defaultRetrievalChanged).toBe(false);
    expect(pack.telemetry.defaultContextInjectionChanged).toBe(false);
  });

  it("writes bounded deterministic observation artifacts", async () => {
    const artifact = await makeApprovedArtifact("write");
    const input = {
      goLiveArtifactPath: artifact.artifactPath,
      expectedReportId: artifact.goLive.reportId,
      expectedScopeId: artifact.goLive.rolloutScope.scopeId,
      expectedConfigId: artifact.goLive.rolloutReport.configId,
      sessionKey: "main",
      projectId: "phase2-controlled-config-ui-proof-project",
      operatorId: "operator",
      proofMarker: "PHASE2-SCOPED-WRITE",
      now: new Date("2026-04-25T00:00:00.000Z"),
    };
    const first = await buildPhase2ScopedProductionObservation(input);
    const second = await buildPhase2ScopedProductionObservation(input);
    expect(first.reportId).toBe(second.reportId);

    const written = await writePhase2ScopedProductionObservationArtifact({
      report: first,
      artifactDir: path.join(TEMP_ROOT, "written"),
    });
    expect(written.jsonPath).toContain("phase2-scoped-production-observation");
    expect(written.markdownPath.endsWith("report.md")).toBe(true);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("secret-marker");
  });

  it("keeps approved production constants aligned with the requested artifact", () => {
    expect(APPROVED_PHASE2_GO_LIVE_REPORT_ID).toBe("70f68365-992a-5c3d-98a4-420579455687");
    expect(APPROVED_PHASE2_GO_LIVE_SCOPE_ID).toBe("c9809462-3aa2-578c-9d7c-47afd4ade0e1");
    expect(APPROVED_PHASE2_GO_LIVE_CONFIG_ID).toBe("28528488-d44c-51a9-8498-1524b47978ae");
  });
});
