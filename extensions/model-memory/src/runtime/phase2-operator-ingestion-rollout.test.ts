import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2OperatorIngestionRolledOut,
  buildPhase2OperatorIngestionRollout,
  writePhase2OperatorIngestionRolloutArtifact,
} from "./phase2-operator-ingestion-rollout.ts";

const TEMP_ROOT = ".artifacts/test-phase2-operator-ingestion-rollout";
const now = new Date("2026-04-26T00:00:00.000Z");

function bySourceId(
  report: ReturnType<typeof buildPhase2OperatorIngestionRollout>,
  sourceId: string,
) {
  const decision = report.sourceDecisions.find((entry) => entry.sourceId === sourceId);
  if (!decision) {
    throw new Error(`missing source decision ${sourceId}`);
  }
  return decision;
}

describe("phase2 operator ingestion rollout", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("observes operator-enabled ingestion and maintenance surfacing", () => {
    const report = buildPhase2OperatorIngestionRollout({ now });

    assertPhase2OperatorIngestionRolledOut(report);
    expect(report.decision).toBe("operator_rollout_observed");
    expect(bySourceId(report, "phase2-tool-grounded-capture")).toMatchObject({
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      decision: "auto_admit",
      durableMemoryCreated: true,
      lowerAuthorityVisible: true,
    });
    expect(bySourceId(report, "phase2-daily-continuity-capture")).toMatchObject({
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
      durableMemoryCreated: true,
    });
    expect(report.maintenanceSurfacing.mode).toBe("operator_report_only");
    expect(report.maintenanceSurfacing.activeCandidateIds.length).toBeGreaterThan(0);
    expect(report.maintenanceSurfacing.archivedCandidateIds.length).toBeGreaterThan(0);
    expect(report.maintenanceSurfacing.pinnedCandidateIds.length).toBeGreaterThan(0);
    expect(report.telemetry.defaultBroadIngestionChanged).toBe(false);
  });

  it("requires citations for researcher/cited-soft sources and rejects assistant prose authority", () => {
    const report = buildPhase2OperatorIngestionRollout({ now });

    expect(bySourceId(report, "phase2-researcher-cited-soft")).toMatchObject({
      sourceProfileId: "researcher_report_artifact",
      authorityTier: "cited_soft",
      decision: "auto_admit",
      lowerAuthorityVisible: true,
    });
    expect(bySourceId(report, "phase2-researcher-missing-citation")).toMatchObject({
      decision: "reject",
      reasonCodes: ["citation_required"],
    });
    expect(bySourceId(report, "phase2-cited-assistant-prose")).toMatchObject({
      decision: "reject",
      reasonCodes: ["assistant_prose_is_not_authority"],
      capturesAssistantProseAsAuthority: true,
    });
  });

  it("excludes inspection-only raw logs and hard-rejects private material", () => {
    const report = buildPhase2OperatorIngestionRollout({ now });

    expect(bySourceId(report, "phase2-raw-tool-log-inspection").decision).not.toBe("auto_admit");
    expect(bySourceId(report, "phase2-private-hard-reject")).toMatchObject({
      decision: "reject",
      reasonCodes: ["hard_reject"],
    });
    expect(report.telemetry.inspectionOnlySourceIds).toContain("phase2-raw-tool-log-inspection");
    expect(report.telemetry.rejectedSourceIds).toContain("phase2-private-hard-reject");
  });

  it("rollback disables operator ingestion without changing broad defaults", () => {
    const report = buildPhase2OperatorIngestionRollout({
      now,
      env: { MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_DISABLED: "true" },
    });

    expect(report.decision).toBe("partial");
    expect(report.rollbackPlan.targetModes.softSourceRuntimeIngestion).toBe("disabled");
    expect(report.telemetry.defaultBroadIngestionChanged).toBe(false);
    expect(bySourceId(report, "phase2-tool-grounded-capture").durableMemoryCreated).toBe(false);
  });

  it("writes bounded safe rollout and maintenance artifacts", async () => {
    const report = buildPhase2OperatorIngestionRollout({ now });
    const written = await writePhase2OperatorIngestionRolloutArtifact({
      report,
      artifactDir: path.join(TEMP_ROOT, "write"),
    });

    expect(written.byteLength).toBeGreaterThan(0);
    expect(written.byteLength).toBeLessThan(512 * 1024);
    const serialized = await fs.readFile(written.jsonPath, "utf8");
    expect(serialized).not.toContain("raw-prompt-marker");
    expect(serialized).not.toContain("raw-transcript-marker");
    expect(serialized).not.toContain("raw-tool-log-marker");
    expect(serialized).not.toContain("private-phrase-marker");
    await expect(fs.stat(written.maintenanceArtifactPath)).resolves.toBeTruthy();
  });
});
