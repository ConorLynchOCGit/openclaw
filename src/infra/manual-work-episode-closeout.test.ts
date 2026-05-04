import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ManualWorkEpisodeCloseoutService } from "./manual-work-episode-closeout.ts";
import { loadLatestWorkEpisodeOutcomePack } from "./model-memory-proactivity-runtime.ts";

async function withManualCloseoutHarness<T>(
  work: (input: { artifactRoot: string; service: ManualWorkEpisodeCloseoutService }) => Promise<T>,
): Promise<T> {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "manual-work-closeout-"));
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    const service = new ManualWorkEpisodeCloseoutService({
      artifactRoot,
      now: () => new Date("2026-05-03T01:00:00.000Z"),
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

function meaningfulManualInput() {
  return {
    projectId: "execution-platform",
    sessionKey: "manual-codex-session",
    branch: "live",
    primarySystemArea: "Execution Platform",
    completedObjective: "Correct Slice 8P skill audit and manual closeout gaps.",
    userGoal:
      "Add a devil's-advocate skill audit and make manual OpenClaw/Codex work produce outcome packs.",
    workSummary:
      "Added deterministic deep skill critique metadata and a manual work episode closeout service.",
    finalOutcome:
      "Manual non-bridge work can now emit a bounded Work Episode Outcome Pack without invoking Codex.",
    filesTouched: [
      {
        path: "extensions/execution-platform/src/codex-bridge/skill-deep-critique.ts",
        changeKind: "created" as const,
        summary: "Adds deep skill critique report construction.",
      },
      {
        path: "src/infra/manual-work-episode-closeout.ts",
        changeKind: "created" as const,
        summary: "Adds manual non-bridge closeout emission.",
      },
    ],
    testsRun: [
      {
        command: "pnpm test:file src/infra/manual-work-episode-closeout.test.ts",
        status: "passed" as const,
        summary: "Manual closeout service tests passed.",
      },
    ],
    failuresAndFixes: [],
    unresolvedQuestions: ["Where should the true app-level assistant finalization hook live?"],
    followUpCandidates: [
      {
        title: "Wire app-level assistant finalization to manual closeout service",
        rationale:
          "The service and script exist, but the full app-level finalization hook is still a separate integration point.",
        sourceRefs: ["repo://src/infra/manual-work-episode-closeout.ts"],
      },
    ],
    skillImprovementEvidence: [
      {
        workflowName: "OpenClaw Bridge Safety",
        evidence: "Devil's-advocate audit found the prior ClawHub gate was too narrow.",
        suggestedDirection:
          "Require critique, web best-practice comparison, and closeout emission.",
        sourceRefs: [
          "repo://extensions/execution-platform/src/codex-bridge/skill-deep-critique.ts",
        ],
      },
    ],
    sourceRefs: [
      "repo://extensions/execution-platform/src/codex-bridge/skill-deep-critique.ts",
      "repo://src/infra/manual-work-episode-closeout.ts",
    ],
  };
}

describe("manual work episode closeout", () => {
  it("builds and writes a manual non-bridge closeout pack to the global root", async () => {
    await withManualCloseoutHarness(async ({ artifactRoot, service }) => {
      const result = await service.emit(meaningfulManualInput());
      const proof = await service.buildProof(result);
      const latest = await loadLatestWorkEpisodeOutcomePack();

      expect(result.artifact.jsonPath).toContain(artifactRoot);
      expect(result.eligibility).toMatchObject({ status: "eligible", reviewEligible: true });
      expect(proof).toMatchObject({
        schemaVersion: "manual_work_episode_closeout_proof.v1",
        projectId: "execution-platform",
        codexCliInvoked: false,
        workQueueLifecycleMutated: false,
        rawTranscriptPersisted: false,
        rawPromptPersisted: false,
      });
      expect(proof.latestDiscoveredEpisodeId).toBe(result.pack.episodeId);
      expect(latest?.episodeId).toBe(result.pack.episodeId);
    });
  });

  it("rejects raw transcript, raw prompt, and secret-like content", async () => {
    await withManualCloseoutHarness(async ({ service }) => {
      await expect(
        service.emit({
          ...meaningfulManualInput(),
          workSummary: "raw-prompt-marker with sk-testsecret123456789 should not persist",
        }),
      ).rejects.toThrow(/prohibited raw\/private content/u);
    });
  });

  it("can write a bounded proof artifact", async () => {
    await withManualCloseoutHarness(async ({ service }) => {
      const proofRoot = await mkdtemp(path.join(os.tmpdir(), "manual-work-proof-"));
      const result = await service.emit(meaningfulManualInput());
      const proof = await service.buildProof(result);
      const proofPath = path.join(proofRoot, "proof.json");
      await service.writeProof({ proof, proofPath });
      const written = JSON.parse(await readFile(proofPath, "utf8"));

      expect(written).toMatchObject({
        schemaVersion: "manual_work_episode_closeout_proof.v1",
        packHash: result.artifact.packHash,
        discoverableByModelMemory: true,
        providerCallMade: false,
        acpSessionStarted: false,
      });
    });
  });

  it("marks no-op manual work as ineligible through the shared eligibility rules", async () => {
    await withManualCloseoutHarness(async ({ service }) => {
      const result = await service.emit({
        projectId: "execution-platform",
        sessionKey: "manual-codex-session",
        userGoal: "Acknowledge a status update.",
        workSummary: "No durable code, docs, validation, artifact, or follow-up work occurred.",
        finalOutcome: "No meaningful work episode evidence was produced.",
        sourceRefs: ["manual://noop"],
      });

      expect(result.eligibility).toMatchObject({
        status: "ineligible",
        reviewEligible: false,
      });
    });
  });
});
