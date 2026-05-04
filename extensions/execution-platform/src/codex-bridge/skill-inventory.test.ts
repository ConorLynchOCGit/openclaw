import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CodexBridgeRepository,
  CodexBridgeSkillInventoryRepository,
  applyBridgeSafetySkillCoverage,
  buildBridgeSafetyActivationReport,
  buildSkillActivationAuditArtifact,
  compareCodexBridgeSkillsWithClawHub,
  createManualPromptSource,
  evaluateCodexBridgeSkillQuality,
  evaluateCodexBridgeSkillTriggers,
  inventoryCodexBridgeSkills,
  listRequiredCodexBridgeSkillDocs,
  produceCodexBridgeSkillReadinessReport,
  writeSkillActivationAuditArtifact,
  type ClawHubSearchRunner,
} from "./index.ts";

async function withSkillInventoryHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    inventoryRepository: CodexBridgeSkillInventoryRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const now = new Date("2026-05-02T23:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 96 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const inventoryRepository = new CodexBridgeSkillInventoryRepository(runtimeJobs, {
      maxArtifactMetadataBytes: 96 * 1024,
    });
    return await work({ runtimeJobs, bridge, inventoryRepository });
  } finally {
    await database.close();
  }
}

const fakeClawHubRunner: ClawHubSearchRunner = async (input) => ({
  available: true,
  output: [
    `${input.query} ${input.query.replaceAll("-", " ")} (0.99)`,
    `nearby-${input.query} Nearby ${input.query.replaceAll("-", " ")} (0.71)`,
  ].join("\n"),
});

async function seedBridgeJob(bridge: CodexBridgeRepository) {
  return bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-skill-inventory",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Skill inventory proof",
      promptText: "Observe only.",
      createdBy: "operator",
    }),
  });
}

describe("Codex bridge skill inventory and activation audit", () => {
  it("inventories Codex-active, OpenClaw repo, agent, workspace draft, skill-doc, and role-doc sources", async () => {
    const inventory = await inventoryCodexBridgeSkills();

    expect(inventory.countsBySource).toMatchObject({
      codex_active_skill: expect.any(Number),
      openclaw_repo_skill: expect.any(Number),
      openclaw_agent_skill: expect.any(Number),
      openclaw_workspace_draft_skill: expect.any(Number),
      execution_platform_workspace_skill_doc: expect.any(Number),
      execution_platform_workspace_role_doc: expect.any(Number),
    });
    expect(inventory.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillDocId: "openclaw-bridge-safety",
          sourceKind: "codex_active_skill",
          activationState: "active",
          requiredForBridgeSafety: true,
        }),
        expect.objectContaining({
          skillDocId: "clawhub",
          sourceKind: "openclaw_repo_skill",
        }),
        expect.objectContaining({
          skillDocId: "orchestrator",
          sourceKind: "execution_platform_workspace_role_doc",
        }),
        expect.objectContaining({
          skillDocId: "repo-boundary-and-path-awareness",
          sourceKind: "execution_platform_workspace_skill_doc",
        }),
      ]),
    );
    expect(inventory.noRawSkillContentIncluded).toBe(true);
  });

  it("runs bounded ClawHub comparison in search-only mode with fake runner", async () => {
    const inventory = await inventoryCodexBridgeSkills();
    const comparison = await compareCodexBridgeSkillsWithClawHub({
      inventory,
      runner: fakeClawHubRunner,
      hostClawHubAvailable: true,
      maxQueries: 40,
      maxResultsPerQuery: 2,
    });

    expect(comparison).toMatchObject({
      hostClawHubAvailable: true,
      boundedSearchOnly: true,
      installUpdatePublishPerformed: false,
      maxQueries: 40,
      maxResultsPerQuery: 2,
    });
    expect(comparison.audited.map((item) => item.query)).toEqual(
      expect.arrayContaining(["clawhub", "model-memory-deep-ingest", "skill-creator"]),
    );
    expect(comparison.audited[0]?.results.length).toBeLessThanOrEqual(2);
  });

  it("quality rubric passes active bridge-safety skill and flags unsafe vague skills", async () => {
    const skillPath = "/root/.codex/skills/openclaw-bridge-safety/SKILL.md";
    const quality = evaluateCodexBridgeSkillQuality({
      skillDocId: "openclaw-bridge-safety",
      path: skillPath,
      skillText: await readFile(skillPath, "utf8"),
      sourceKind: "codex_active_skill",
    });

    expect(quality).toMatchObject({
      status: "pass",
      recommendedAction: "activate_local_bridge_skill",
      blockingIssues: [],
    });

    const unsafe = evaluateCodexBridgeSkillQuality({
      skillDocId: "unsafe-vague",
      path: "/tmp/unsafe/SKILL.md",
      skillText: "---\nname: unsafe-vague\ndescription: Helps.\n---\n# Unsafe\nRun whatever.",
    });
    expect(unsafe.status).toBe("fail");
    expect(unsafe.blockingIssues).toEqual(
      expect.arrayContaining([
        "blocking:precise_trigger_description",
        "blocking:explicit_prohibited_actions",
      ]),
    );
  });

  it("activation report covers required docs while keeping broader live execution blocked", async () => {
    const activation = await buildBridgeSafetyActivationReport();

    expect(activation).toMatchObject({
      activeBridgeSafetySkillId: "openclaw-bridge-safety",
      activated: true,
      codeWritingSkillLayerReady: true,
      codeWritingBridgePilotStillBlockedByNonSkillGates: true,
      trustedYoloBlocked: true,
      rebuildBlocked: true,
      autobailoutBlocked: true,
      codexCliInvoked: false,
      workQueueLifecycleMutated: false,
      clawHubInstallUpdatePublishPerformed: false,
    });
    expect(activation.coversRequiredSkillDocIds).toEqual(
      expect.arrayContaining([
        "repo-boundary-and-path-awareness",
        "execution-platform-runtime-truth",
        "orchestrator-role-contract",
        "reviewer-role-contract",
      ]),
    );
  });

  it("trigger evaluator selects active bridge-safety skill for bridge hazards", () => {
    const registry = applyBridgeSafetySkillCoverage(
      listRequiredCodexBridgeSkillDocs().map((entry) => ({
        ...entry,
        currentActivationState:
          entry.skillDocId === "openclaw-bridge-safety" ||
          entry.skillDocId === "work-queue-ux-review"
            ? "active"
            : entry.currentActivationState,
      })),
    );
    const cases = [
      { controlReasonCategory: "runtime_substrate_mismatch" as const },
      { controlReasonCategory: "wrong_repo_or_workspace" as const },
      { controlReasonCategory: "missing_safe_ui_bridge_context" as const },
      { controlReasonCategory: "deterministic_vs_model_judgment_violation" as const },
      { controlReasonCategory: "prohibited_semantic_drift" as const },
      { closeoutGateState: "missing" as const },
      { userPrompt: "A Work Queue lifecycle mutation request needs review." },
      { bridgeEventKinds: ["rebuild_failed"] },
      { bridgeEventKinds: ["pause_requested", "redirect_requested", "cancel_requested"] },
      { requestedOperationType: "code_writing_bridge_pilot" as const },
    ];

    for (const triggerInput of cases) {
      const report = evaluateCodexBridgeSkillTriggers({ registry, triggerInput });
      expect(report.triggeredSkillDocIds).toContain("openclaw-bridge-safety");
      expect(report.activeTriggeredIds).toContain("openclaw-bridge-safety");
    }
  });

  it("code-writing skill layer can be ready while code-writing pilot remains blocked by non-skill gates", () => {
    const registry = applyBridgeSafetySkillCoverage(
      listRequiredCodexBridgeSkillDocs().map((entry) => ({
        ...entry,
        currentActivationState:
          entry.skillDocId === "openclaw-bridge-safety" ||
          entry.skillDocId === "work-queue-ux-review"
            ? "active"
            : entry.currentActivationState,
      })),
    );
    const report = produceCodexBridgeSkillReadinessReport({
      requestedMode: "code_writing_bridge_pilot",
      registry,
      triggerTestedSkillDocIds: registry.map((entry) => entry.skillDocId),
    });

    expect(report.skillLayerReady).toBe(true);
    expect(report.allowed).toBe(true);
    expect(report.codeWritingBridgePilotBlocked).toBe(true);
    expect(report.liveAuthorityGranted).toBe(false);
  });

  it("persists inventory, comparison, quality, and activation reports as runtime evidence", async () => {
    await withSkillInventoryHarness(async ({ bridge, inventoryRepository, runtimeJobs }) => {
      await seedBridgeJob(bridge);
      const inventory = await inventoryCodexBridgeSkills();
      const comparison = await compareCodexBridgeSkillsWithClawHub({
        inventory,
        runner: fakeClawHubRunner,
        hostClawHubAvailable: true,
        maxQueries: 3,
      });
      const activation = await buildBridgeSafetyActivationReport();

      await inventoryRepository.persistReport({
        runtimeJobId: "bridge-skill-inventory",
        artifactType: "codex_bridge.skill_inventory_report",
        report: inventory,
      });
      await inventoryRepository.persistReport({
        runtimeJobId: "bridge-skill-inventory",
        artifactType: "codex_bridge.skill_clawhub_comparison_report",
        report: comparison,
      });
      await inventoryRepository.persistReport({
        runtimeJobId: "bridge-skill-inventory",
        artifactType: "codex_bridge.skill_quality_audit_report",
        report: activation.quality,
      });
      await inventoryRepository.persistReport({
        runtimeJobId: "bridge-skill-inventory",
        artifactType: "codex_bridge.skill_activation_report",
        report: activation,
      });

      await expect(runtimeJobs.listArtifacts("bridge-skill-inventory")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.skill_inventory_report" }),
          expect.objectContaining({
            artifactType: "codex_bridge.skill_clawhub_comparison_report",
          }),
          expect.objectContaining({ artifactType: "codex_bridge.skill_quality_audit_report" }),
          expect.objectContaining({ artifactType: "codex_bridge.skill_activation_report" }),
        ]),
      );
      await expect(runtimeJobs.listEvents("bridge-skill-inventory", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.skill_trigger_checked" }),
        ]),
      );
    });
  });

  it("writes bounded 8P audit artifact metadata", async () => {
    const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "skill-activation-audit-"));
    const artifactPath = path.join(artifactRoot, "skill-activation-audit-8p.json");
    const inventory = await inventoryCodexBridgeSkills();
    const comparison = await compareCodexBridgeSkillsWithClawHub({
      inventory,
      runner: fakeClawHubRunner,
      hostClawHubAvailable: true,
      maxQueries: 2,
    });
    const activation = await buildBridgeSafetyActivationReport();
    const artifact = buildSkillActivationAuditArtifact({ inventory, comparison, activation });

    await writeSkillActivationAuditArtifact({ artifactPath, artifact });
    const written = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;

    expect(written).toMatchObject({
      artifactKind: "codex_bridge_skill_activation_audit_8p",
      clawhubSearchSurface: {
        boundedSearchOnly: true,
        installUpdatePublishPerformed: false,
      },
      codeWritingBridgePilotStillBlockedByNonSkillGates: true,
      codexCliInvoked: false,
      workQueueLifecycleMutated: false,
    });
  });
});
