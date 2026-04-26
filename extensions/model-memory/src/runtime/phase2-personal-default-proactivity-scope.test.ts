import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase2PersonalDefaultProactivityReport,
  writePhase2PersonalDefaultProactivityArtifact,
} from "./phase2-personal-default-proactivity-scope.ts";

describe("phase2 personal default proactivity scope", () => {
  it("enables personal default scope from product, real-candidate, and notification proofs", async () => {
    const report = await buildPhase2PersonalDefaultProactivityReport({
      now: new Date("2026-04-26T19:00:00.000Z"),
      scope: {
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKeys: ["main"],
        operatorIds: ["operator-conor"],
      },
    });

    expect(report.decision).toBe("personal_default_scope_enabled");
    expect(report.config.enabled).toBe(true);
    expect(report.config.scope.rolloutMode).toBe("personal_default_scope");
    expect(report.config.scope.allowedMessageClasses).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.telemetry.generatedCount).toBeGreaterThan(0);
    expect(report.telemetry.deliveredCount).toBe(1);
    expect(report.telemetry.explicitSendApprovalRequired).toBe(true);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("rejects wildcard or outside personal scope", async () => {
    const report = await buildPhase2PersonalDefaultProactivityReport({
      forceWildcardScope: true,
    });

    expect(report.decision).toBe("blocked");
    expect(
      report.checks.find((check) => check.reasonCode === "wildcard_scope_rejected")?.status,
    ).toBe("fail");
  });

  it("blocks missing send approval, degraded observability, missing provenance, and no-dark-data failures", async () => {
    await expect(
      buildPhase2PersonalDefaultProactivityReport({ forceMissingSendApproval: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2PersonalDefaultProactivityReport({ forceDegradedObservability: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2PersonalDefaultProactivityReport({ forceMissingProvenance: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2PersonalDefaultProactivityReport({ forceNoDarkDataFail: true }),
    ).resolves.toMatchObject({ decision: "blocked" });
  });

  it("rolls back to operator-only/manual proof mode and blocks forbidden behavior", async () => {
    const rollback = await buildPhase2PersonalDefaultProactivityReport({
      env: { MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED: "1" },
    });
    const autonomous = await buildPhase2PersonalDefaultProactivityReport({
      forceAutonomousSending: true,
    });
    const action = await buildPhase2PersonalDefaultProactivityReport({
      forceActionExecution: true,
    });

    expect(rollback.decision).toBe("rollback_disabled");
    expect(rollback.config.enabled).toBe(false);
    expect(rollback.rollbackPlan.targetMode).toBe("operator_only_manual_proof");
    expect(autonomous.decision).toBe("blocked");
    expect(action.decision).toBe("blocked");
    expect(autonomous.telemetry.autonomousSendingEnabled).toBe(false);
    expect(action.telemetry.actionExecutionObserved).toBe(false);
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-personal-default-proactivity-"));
    try {
      const report = await buildPhase2PersonalDefaultProactivityReport();
      const artifact = await writePhase2PersonalDefaultProactivityArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Personal Default Proactivity Scope");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
