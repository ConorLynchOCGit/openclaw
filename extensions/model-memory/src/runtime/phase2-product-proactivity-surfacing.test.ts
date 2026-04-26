import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase2ProductProactivitySurfacingReport,
  writePhase2ProductProactivitySurfacingArtifact,
} from "./phase2-product-proactivity-surfacing.ts";

describe("phase2 product proactivity surfacing", () => {
  it("builds a product-visible queue item from approved proactivity evidence", async () => {
    const report = await buildPhase2ProductProactivitySurfacingReport({
      now: new Date("2026-04-26T16:00:00.000Z"),
      eligibilityScope: {
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-conor",
      },
    });

    expect(report.decision).toBe("product_queue_enabled");
    expect(report.queue.items).toHaveLength(1);
    expect(report.queue.items[0]).toMatchObject({
      status: "pending_review",
      boundedDisplayText: "A recent Model Memory task has a follow-up ready for review.",
      noDarkDataStatus: "pass",
    });
    expect(report.realCandidateReport?.decision).toBe("real_candidates_generated");
    expect(report.queue.items[0].sourceRefs.length).toBeGreaterThan(0);
    expect(report.queue.items[0].sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.queue.items[0].authorityTiers.length).toBeGreaterThan(0);
    expect(report.sendDecisions[0]).toMatchObject({
      decision: "send_via_chat_inject",
      explicitSendApproval: true,
      actionExecution: false,
      autonomousSending: false,
    });
  });

  it("rejects proof fixture scope and rollback disables surfacing", async () => {
    const fixtureScope = await buildPhase2ProductProactivitySurfacingReport({
      forceProofFixtureScope: true,
    });
    const rollback = await buildPhase2ProductProactivitySurfacingReport({
      env: { MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED: "1" },
    });

    expect(fixtureScope.decision).toBe("blocked");
    expect(
      fixtureScope.checks.find((check) => check.reasonCode === "proof_fixture_scope_rejected")
        ?.status,
    ).toBe("fail");
    expect(rollback.decision).toBe("rollback_disabled");
    expect(rollback.queue.items[0].status).toBe("rollback_disabled");
  });

  it("blocks missing provenance, prohibited message classes, and no-dark-data failures", async () => {
    await expect(
      buildPhase2ProductProactivitySurfacingReport({ forceMissingProvenance: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProductProactivitySurfacingReport({
        messageClass: "external_instruction_message",
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProductProactivitySurfacingReport({ forceNoDarkDataFail: true }),
    ).resolves.toMatchObject({ decision: "blocked", noDarkDataStatus: "fail" });
  });

  it("keeps autonomous sending and action execution off", async () => {
    const autonomous = await buildPhase2ProductProactivitySurfacingReport({
      forceAutonomousSending: true,
    });
    const action = await buildPhase2ProductProactivitySurfacingReport({
      forceActionExecution: true,
    });

    expect(autonomous.decision).toBe("blocked");
    expect(action.decision).toBe("blocked");
    expect(autonomous.telemetry.autonomousSendingEnabled).toBe(false);
    expect(action.telemetry.actionExecutionObserved).toBe(false);
  });

  it("writes bounded JSON and Markdown without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-product-proactivity-"));
    try {
      const report = await buildPhase2ProductProactivitySurfacingReport();
      const artifact = await writePhase2ProductProactivitySurfacingArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Product Proactivity Surfacing");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
