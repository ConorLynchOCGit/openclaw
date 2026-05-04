import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLatestWorkEpisodeOutcomePack } from "./model-memory-proactivity-runtime.ts";
import {
  buildOpenClawWorkEpisodeOutcomePack,
  OpenClawWorkEpisodeCloseoutService,
} from "./work-episode-closeout-service.ts";
import {
  evaluateWorkEpisodeOutcomePackEligibility,
  validateWorkEpisodeOutcomePack,
} from "./work-episode-outcome-pack.ts";

async function withOpenClawCloseoutHarness<T>(
  work: (input: {
    artifactRoot: string;
    service: OpenClawWorkEpisodeCloseoutService;
  }) => Promise<T>,
): Promise<T> {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-work-episode-closeout-"));
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    const service = new OpenClawWorkEpisodeCloseoutService({
      artifactRoot,
      now: () => new Date("2026-05-02T18:00:00.000Z"),
    });
    return await work({ artifactRoot, service });
  } finally {
    if (previousPackRoot === undefined) {
      delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    } else {
      process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousPackRoot;
    }
  }
}

function meaningfulInput() {
  return {
    projectId: "execution-platform",
    sessionKey: "manual-openclaw-session",
    branch: "live",
    completedAt: "2026-05-02T18:00:00.000Z",
    outcomeStatus: "completed" as const,
    workType: "implementation" as const,
    primarySystemArea: "Execution Platform",
    completedObjective: "Wire global Work Episode Outcome Pack closeout enforcement.",
    userGoal:
      "Make outcome packs emit for meaningful OpenClaw and bridge work rather than only Model Memory work.",
    workSummary:
      "Added a generic OpenClaw closeout service and global outcome-pack import surface.",
    finalOutcome:
      "Manual OpenClaw work can now produce the same bounded outcome pack consumed by Model Memory.",
    filesTouched: [
      {
        path: "src/infra/work-episode-closeout-service.ts",
        changeKind: "created" as const,
        summary: "Builds and writes generic OpenClaw closeout packs.",
      },
    ],
    testsRun: [
      {
        command: "pnpm test:file src/infra/work-episode-closeout-service.test.ts",
        status: "passed" as const,
        summary: "Generic closeout service tests passed.",
      },
    ],
    failuresAndFixes: [],
    unresolvedQuestions: ["Where should the assistant finalization hook call this service?"],
    followUpCandidates: [
      {
        title: "Hook OpenClaw assistant finalization into global closeout",
        rationale:
          "The generic service exists, but broad non-bridge session finalization still needs the actual app hook.",
        sourceRefs: ["work-episode://openclaw/manual-closeout-test"],
      },
    ],
    skillImprovementEvidence: [
      {
        workflowName: "Work Queue UX Review",
        evidence: "Meaningful work should check for global outcome-pack closeout evidence.",
        suggestedDirection: "Treat missing closeout after meaningful work as a process gap.",
        sourceRefs: ["work-episode://openclaw/manual-closeout-test"],
      },
    ],
    sourceRefs: ["work-episode://openclaw/manual-closeout-test"],
  };
}

describe("global OpenClaw work episode closeout service", () => {
  it("uses the shared outcome-pack contract without duplicating schema", () => {
    const pack = buildOpenClawWorkEpisodeOutcomePack(meaningfulInput());

    expect(validateWorkEpisodeOutcomePack(pack)).toEqual(pack);
    expect(pack.schemaVersion).toBe("work_episode_outcome_pack.v1");
    expect(evaluateWorkEpisodeOutcomePackEligibility(pack)).toMatchObject({
      status: "eligible",
      reviewEligible: true,
    });
  });

  it("writes meaningful OpenClaw work packs to the global root and Model Memory can discover them", async () => {
    await withOpenClawCloseoutHarness(async ({ artifactRoot, service }) => {
      const result = await service.writeCloseout(meaningfulInput());
      const latest = await loadLatestWorkEpisodeOutcomePack();

      expect(result.artifact.jsonPath).toContain(artifactRoot);
      expect(result.eligibility).toMatchObject({ status: "eligible", reviewEligible: true });
      expect(result.discoverableByModelMemory).toBe(true);
      expect(latest?.episodeId).toBe(result.pack.episodeId);
      expect(service.produceOperatorSummary(result)).toMatchObject({
        episodeId: result.pack.episodeId,
        processCompletionIsNotTaskSuccess: true,
      });
    });
  });

  it("rejects raw prompt, transcript, log, and secret-like content", () => {
    expect(() =>
      buildOpenClawWorkEpisodeOutcomePack({
        ...meaningfulInput(),
        workSummary: "raw-transcript-marker with sk-testsecret123456789 should not persist",
      }),
    ).toThrow(/prohibited raw\/private content/u);
  });

  it("marks no-op OpenClaw work packs ineligible and reports missing closeout blockers", async () => {
    await withOpenClawCloseoutHarness(async ({ service }) => {
      const noOpPack = service.buildPack({
        projectId: "execution-platform",
        completedAt: "2026-05-02T18:00:00.000Z",
        userGoal: "Acknowledge the latest status.",
        workSummary: "No durable work happened.",
        finalOutcome: "No files, tests, failures, follow-ups, or skill evidence were produced.",
        sourceRefs: ["work-episode://openclaw/noop"],
      });

      expect(evaluateWorkEpisodeOutcomePackEligibility(noOpPack)).toMatchObject({
        status: "ineligible",
        reviewEligible: false,
      });
      await expect(
        service.produceMissingCloseoutBlockerReport({ closeoutRequired: true }),
      ).resolves.toMatchObject({
        closeoutPresent: false,
        allowed: false,
        blockingReasons: ["work_episode_closeout_missing"],
      });
    });
  });
});
