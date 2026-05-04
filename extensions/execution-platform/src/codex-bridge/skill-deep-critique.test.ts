import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CodexBridgeRepository,
  CodexBridgeSkillDeepCritiqueRepository,
  buildSkillDeepCritiqueArtifact,
  buildSkillDeepCritiqueReport,
  buildSkillDeepCritiqueTargets,
  classifyClawHubComparable,
  createManualPromptSource,
  inventoryCodexBridgeSkills,
  writeSkillDeepCritiqueArtifact,
  type CodexBridgeClawHubComparisonReport,
} from "./index.ts";

const fakeComparison: CodexBridgeClawHubComparisonReport = {
  artifactKind: "codex_bridge_skill_clawhub_comparison_report",
  clawhubSkillPath: "/root/services/openclaw-roles/live/skills/clawhub/SKILL.md",
  hostClawHubAvailable: true,
  boundedSearchOnly: true,
  installUpdatePublishPerformed: false,
  searchedQueryCount: 4,
  maxQueries: 8,
  maxResultsPerQuery: 3,
  skipped: [
    {
      query: "model-memory-deep-ingest",
      status: "skipped_timeout_or_noise",
      results: [],
      notes: ["bounded test skip"],
    },
  ],
  audited: [
    {
      query: "skill-vetting",
      status: "audited",
      results: [
        { slug: "skill-vetting", displayName: "Skill Vetting", score: 4.364 },
        { slug: "skill-security-vetter", displayName: "Skill Security Vetting", score: 2.123 },
      ],
      notes: ["search-only; no install/update/publish"],
    },
    {
      query: "work-queue-ux-review",
      status: "audited",
      results: [
        { slug: "workout", displayName: "Workout", score: 0.648 },
        { slug: "workspace-review", displayName: "Workspace Review", score: 0.637 },
      ],
      notes: ["search-only; no install/update/publish"],
    },
    {
      query: "pause-redirect-cancel-control-bridge",
      status: "unavailable_on_clawhub",
      results: [],
      notes: ["no relevant candidates"],
    },
  ],
};

async function withDeepCritiqueHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    critiqueRepository: CodexBridgeSkillDeepCritiqueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const now = new Date("2026-05-03T00:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const critiqueRepository = new CodexBridgeSkillDeepCritiqueRepository(runtimeJobs, {
      maxArtifactMetadataBytes: 128 * 1024,
    });
    return await work({ runtimeJobs, bridge, critiqueRepository });
  } finally {
    await database.close();
  }
}

describe("Codex bridge deep skill critique", () => {
  it("classifies exact, partial, noisy, unavailable, and skipped ClawHub comparables", () => {
    expect(
      classifyClawHubComparable({
        targetId: "skill-vetting",
        result: { slug: "skill-vetting", displayName: "Skill Vetting", score: 4.364 },
      }),
    ).toBe("exact_comparable");
    expect(
      classifyClawHubComparable({
        targetId: "skill-vetting",
        result: {
          slug: "skill-security-vetter",
          displayName: "Skill Security Vetting",
          score: 2.123,
        },
      }),
    ).toBe("partial_comparable");
    expect(
      classifyClawHubComparable({
        targetId: "work-queue-ux-review",
        result: { slug: "workout", displayName: "Workout", score: 0.648 },
      }),
    ).toBe("irrelevant_noisy_hit");
  });

  it("critiques active bridge-safety skill only as pass or minor-gaps when required criteria are present", async () => {
    const text = await readFile("/root/.codex/skills/openclaw-bridge-safety/SKILL.md", "utf8");
    const report = buildSkillDeepCritiqueReport({
      auditId: "deep-critique-test",
      checkedAt: "2026-05-03T00:00:00.000Z",
      comparison: fakeComparison,
      targets: [
        {
          targetId: "openclaw-bridge-safety",
          sourcePaths: ["/root/.codex/skills/openclaw-bridge-safety/SKILL.md"],
          purpose: "Bridge safety guardrails",
          skillText: text,
          requiredForBridgeSafety: true,
          activeRuntimeSkill: true,
        },
      ],
    });

    expect(report.targets[0]?.verdict).toMatch(/pass/u);
    expect(report.targets[0]?.recommendedChanges).toEqual(
      expect.arrayContaining([expect.stringContaining("Reassess after fake control-loop proof")]),
    );
    expect(report.codexCliInvoked).toBe(false);
    expect(report.clawHubInstallUpdatePublishPerformed).toBe(false);
  });

  it("flags missing prohibited actions, proof expectations, and runtime truth ambiguity", () => {
    const report = buildSkillDeepCritiqueReport({
      auditId: "deep-critique-unsafe",
      checkedAt: "2026-05-03T00:00:00.000Z",
      targets: [
        {
          targetId: "unsafe-bridge-skill",
          sourcePaths: ["/tmp/unsafe/SKILL.md"],
          purpose: "Unsafe bridge skill",
          skillText: "---\nname: unsafe\ndescription: Helps.\n---\n# Unsafe\nRun what is needed.",
          requiredForBridgeSafety: true,
          activeRuntimeSkill: true,
        },
      ],
    });

    expect(report.targets[0]).toMatchObject({
      verdict: "needs_revision_before_bridge_use",
      missingCapabilities: expect.arrayContaining([
        "prohibited_actions_missing",
        "runtime_truth_boundary_missing",
        "validation_or_proof_expectations_thin",
      ]),
    });
    expect(report.fakeControlLoopProofEligible).toBe(false);
  });

  it("records web research metadata and writes a bounded artifact without raw skill bodies", async () => {
    const inventory = await inventoryCodexBridgeSkills();
    const targets = (await buildSkillDeepCritiqueTargets({ inventory })).filter((target) =>
      ["work-queue-ux-review", "openclaw-bridge-safety", "skill-vetting"].includes(target.targetId),
    );
    const report = buildSkillDeepCritiqueReport({
      auditId: "deep-critique-artifact",
      checkedAt: "2026-05-03T00:00:00.000Z",
      targets,
      comparison: fakeComparison,
      changesApplied: ["Added devil's-advocate checks to active bridge-safety skill."],
    });
    const artifact = buildSkillDeepCritiqueArtifact(report);
    const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "skill-deep-critique-"));
    const artifactPath = path.join(artifactRoot, "artifact.json");
    await writeSkillDeepCritiqueArtifact({ artifactPath, artifact });
    const written = await readFile(artifactPath, "utf8");

    expect(artifact.webSources.map((source) => source.authority)).toEqual(
      expect.arrayContaining(["official", "security_standard", "security_research"]),
    );
    expect(artifact.noRawSkillContentIncluded).toBe(true);
    expect(written).not.toContain("# OpenClaw Bridge Safety");
    expect(written).not.toContain("# Work Queue UX Review");
    expect(artifact.clawHubInstallUpdatePublishPerformed).toBe(false);
  });

  it("persists deep critique report as bounded runtime evidence", async () => {
    await withDeepCritiqueHarness(async ({ bridge, runtimeJobs, critiqueRepository }) => {
      await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-skill-deep-critique",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Skill deep critique proof",
          promptText: "Observe only.",
          createdBy: "operator",
        }),
      });
      const report = buildSkillDeepCritiqueReport({
        auditId: "deep-critique-runtime",
        checkedAt: "2026-05-03T00:00:00.000Z",
        targets: [
          {
            targetId: "openclaw-bridge-safety",
            sourcePaths: ["/root/.codex/skills/openclaw-bridge-safety/SKILL.md"],
            purpose: "Bridge safety guardrails",
            skillText: await readFile(
              "/root/.codex/skills/openclaw-bridge-safety/SKILL.md",
              "utf8",
            ),
            requiredForBridgeSafety: true,
            activeRuntimeSkill: true,
          },
        ],
        comparison: fakeComparison,
      });
      const artifact = await critiqueRepository.persistReport({
        runtimeJobId: "bridge-skill-deep-critique",
        report,
      });
      const events = await runtimeJobs.listEvents("bridge-skill-deep-critique");

      expect(artifact.artifactType).toBe("codex_bridge.skill_deep_critique_report");
      expect(events.map((event) => event.eventType)).toContain(
        "codex_bridge.skill_deep_critique_checked",
      );
    });
  });
});
