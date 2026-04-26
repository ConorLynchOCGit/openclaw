import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2IngestionDefaultPromoted,
  buildPhase2IngestionDefaultPromotion,
  writePhase2IngestionDefaultPromotionArtifact,
} from "./phase2-ingestion-default-promotion.ts";

const TEMP_ROOT = ".artifacts/test-phase2-ingestion-default-promotion";
const now = new Date("2026-04-26T00:00:00.000Z");

function source(
  report: Awaited<ReturnType<typeof buildPhase2IngestionDefaultPromotion>>,
  id: string,
) {
  const decision = report.sourceDecisions.find((entry) => entry.sourceId === id);
  if (!decision) {
    throw new Error(`missing source decision ${id}`);
  }
  return decision;
}

describe("phase2 ingestion default promotion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves default ingestion for proven safe source paths", async () => {
    const report = await buildPhase2IngestionDefaultPromotion({ now });

    assertPhase2IngestionDefaultPromoted(report);
    expect(report.decision).toBe("approved_for_default");
    expect(report.telemetry.defaultEnabledCapabilities).toEqual([
      "tool_grounded_capture",
      "daily_continuity_capture",
      "researcher_cited_soft_capture",
      "cited_assistant_fact_capture",
      "soft_source_runtime_ingestion",
      "non_user_prompt_ingestion",
    ]);
    expect(source(report, "phase2-tool-grounded-capture")).toMatchObject({
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
      durableMemoryCreated: true,
    });
    expect(source(report, "phase2-daily-continuity-capture")).toMatchObject({
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
      durableMemoryCreated: true,
    });
    expect(source(report, "phase2-researcher-cited-soft").sourceRefs.length).toBeGreaterThan(0);
    expect(report.defaultPromotionConfig.defaultBroadIngestionChanged).toBe(true);
  });

  it("captures cited assistant facts only and rejects assistant prose as authority", async () => {
    const report = await buildPhase2IngestionDefaultPromotion({ now });

    expect(source(report, "phase2-cited-assistant-underlying-fact")).toMatchObject({
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
      decision: "auto_admit",
      capturesAssistantProseAsAuthority: false,
      durableMemoryCreated: true,
    });
    expect(source(report, "phase2-cited-assistant-prose")).toMatchObject({
      decision: "reject",
      capturesAssistantProseAsAuthority: true,
      reasonCodes: ["assistant_prose_is_not_authority"],
    });
  });

  it("keeps raw/private material rejected or inspection-only", async () => {
    const report = await buildPhase2IngestionDefaultPromotion({ now });

    expect(source(report, "phase2-raw-tool-log-inspection")).toMatchObject({
      decision: "inspection_only",
      authorityTier: "inspection_only",
    });
    expect(source(report, "phase2-private-hard-reject")).toMatchObject({
      decision: "reject",
      authorityTier: "inspection_only",
    });
    expect(report.telemetry.defaultEnabledSourceIds).not.toContain(
      "phase2-raw-tool-log-inspection",
    );
  });

  it("rollback kill switch returns ingestion paths to operator-only", async () => {
    const report = await buildPhase2IngestionDefaultPromotion({
      now,
      env: { MODEL_MEMORY_PHASE2_DEFAULT_INGESTION_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked");
    expect(report.defaultPromotionConfig.enabled).toBe(false);
    expect(report.defaultPromotionConfig.capabilityModes.soft_source_runtime_ingestion).toBe(
      "operator_enabled",
    );
    expect(report.telemetry.defaultBroadIngestionChanged).toBe(false);
  });

  it("writes bounded artifacts without prohibited raw content", async () => {
    const report = await buildPhase2IngestionDefaultPromotion({ now });
    const written = await writePhase2IngestionDefaultPromotionArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });
    const json = await fs.readFile(written.jsonPath, "utf8");
    const markdown = await fs.readFile(path.join(TEMP_ROOT, "report.md"), "utf8");

    expect(written.byteLength).toBeLessThan(512 * 1024);
    expect(json).toContain(report.reportId);
    expect(markdown).toContain("Phase 2 Ingestion Default Promotion Proof");
    expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
    expect(markdown.toLowerCase()).not.toContain("private-phrase-marker");
  });
});
