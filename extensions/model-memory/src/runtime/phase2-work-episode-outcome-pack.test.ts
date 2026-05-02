import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkEpisodeOutcomePack,
  discoverWorkEpisodeOutcomePackArtifacts,
  evaluateWorkEpisodeOutcomePackEligibility,
  validateWorkEpisodeOutcomePack,
  writeWorkEpisodeOutcomePackArtifact,
} from "./phase2-work-episode-outcome-pack.ts";

function validPack() {
  return buildWorkEpisodeOutcomePack({
    runtime: "codex",
    projectId: "openclaw",
    sessionKey: "agent:main:main",
    branch: "phase2-prune-remaining-runtime-and-test-judgment-debt",
    completedAt: "2026-05-01T20:00:00.000Z",
    outcomeStatus: "completed",
    workType: "implementation",
    primarySystemArea: "model-memory proactivity",
    completedObjective: "Use structured outcome packs as candidate-review evidence.",
    userGoal:
      "Replace broad skill and proactivity review input with a structured work episode outcome pack.",
    workSummary:
      "Added a bounded pack contract that captures touched files, tests, failures, follow-ups, and skill evidence.",
    finalOutcome:
      "Candidate review can evaluate a structured closeout pack instead of broad raw session tails.",
    filesTouched: [
      {
        path: "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts",
        changeKind: "created",
        summary: "Defines the outcome pack schema and artifact writer.",
      },
    ],
    testsRun: [
      {
        command:
          "pnpm test:file extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.test.ts",
        status: "passed",
        summary: "Validates pack schema and artifact safety.",
      },
    ],
    failuresAndFixes: [
      {
        failure: "Raw session tails included synthetic heartbeat and proof traffic.",
        fix: "Use a structured outcome pack as primary review input.",
        status: "fixed",
      },
    ],
    unresolvedQuestions: ["How soon should the pack be emitted automatically from Codex closeout?"],
    followUpCandidates: [
      {
        title: "Wire outcome packs into heartbeat candidate review",
        rationale:
          "Heartbeat should trigger review of the latest work pack instead of mining noisy transcript tails.",
        sourceRefs: ["work-episode://pack/test"],
      },
    ],
    skillImprovementEvidence: [
      {
        workflowName: "Work Queue UX Review",
        evidence:
          "The repeated diagnosis workflow should inspect the selected evidence substrate before reviewing UI cards.",
        suggestedDirection: "Add a Work Episode Outcome Pack quality gate to the review checklist.",
        sourceRefs: ["work-episode://pack/test"],
      },
    ],
    sourceRefs: ["work-episode://pack/test"],
  });
}

describe("phase2 work episode outcome pack", () => {
  it("builds and validates a bounded outcome pack", () => {
    const pack = validPack();

    expect(pack.schemaVersion).toBe("work_episode_outcome_pack.v1");
    expect(pack.outcomeStatus).toBe("completed");
    expect(pack.workType).toBe("implementation");
    expect(pack.episodeId).toMatch(/^work-episode-[a-f0-9]{16}$/u);
    expect(validateWorkEpisodeOutcomePack(pack)).toEqual(pack);
    expect(pack.safety).toMatchObject({
      noRawLogs: true,
      noRawTranscripts: true,
      noProviderPrompts: true,
      noHiddenReasoning: true,
      noSecrets: true,
    });
  });

  it("validates failed, interrupted, and partial packs with bounded recovery metadata", () => {
    for (const outcomeStatus of ["failed", "interrupted", "partial"] as const) {
      const pack = buildWorkEpisodeOutcomePack({
        ...validPack(),
        outcomeStatus,
        failuresAndFixes: [
          {
            failure: "Focused validation did not complete.",
            status: "unresolved",
          },
        ],
        recoveryRecommendation: "Rerun the focused validation lane before live UI proof.",
      });

      expect(validateWorkEpisodeOutcomePack(pack).outcomeStatus).toBe(outcomeStatus);
      expect(pack.recoveryRecommendation).toContain("Rerun");
    }
  });

  it("marks rich packs eligible and no-op packs ineligible without judging value", () => {
    expect(evaluateWorkEpisodeOutcomePackEligibility(validPack())).toMatchObject({
      status: "eligible",
      reviewEligible: true,
    });

    const noOp = buildWorkEpisodeOutcomePack({
      runtime: "codex",
      projectId: "openclaw",
      completedAt: "2026-05-01T20:30:00.000Z",
      userGoal: "Acknowledge the latest status update.",
      workSummary: "No durable task work happened.",
      finalOutcome: "No files, tests, failures, follow-ups, or skill evidence were produced.",
      filesTouched: [],
      testsRun: [],
      failuresAndFixes: [],
      unresolvedQuestions: [],
      followUpCandidates: [],
      skillImprovementEvidence: [],
      sourceRefs: ["work-episode://noop"],
    });

    expect(evaluateWorkEpisodeOutcomePackEligibility(noOp)).toMatchObject({
      status: "ineligible",
      reviewEligible: false,
    });
  });

  it("discovers and sorts outcome pack artifacts oldest first", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "outcome-pack-discovery-"));
    const older = validPack();
    const newer = buildWorkEpisodeOutcomePack({
      ...validPack(),
      completedAt: "2026-05-01T21:00:00.000Z",
      sourceRefs: ["work-episode://pack/newer"],
    });
    await writeWorkEpisodeOutcomePackArtifact(newer, {
      artifactRoot: tmpDir,
      timestamp: "2026-05-01T21:00:00.000Z",
    });
    await writeWorkEpisodeOutcomePackArtifact(older, {
      artifactRoot: tmpDir,
      timestamp: "2026-05-01T20:00:00.000Z",
    });

    const records = await discoverWorkEpisodeOutcomePackArtifacts([tmpDir]);

    expect(records.map((record) => record.pack.episodeId)).toEqual([
      older.episodeId,
      newer.episodeId,
    ]);
    expect(records.every((record) => record.eligibility.status === "eligible")).toBe(true);
  });

  it("rejects raw logs, secrets, provider prompts, and hidden reasoning markers", () => {
    expect(() =>
      buildWorkEpisodeOutcomePack({
        ...validPack(),
        workSummary: "raw tool log: npm output with sk-testsecret123456789",
      }),
    ).toThrow(/prohibited/u);
  });

  it("requires refs and hashes for provenance", () => {
    expect(() =>
      validateWorkEpisodeOutcomePack({
        ...validPack(),
        sourceRefs: [],
      }),
    ).toThrow();
  });

  it("writes a sanitized artifact without raw transcript/log flags", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "outcome-pack-"));
    const artifact = await writeWorkEpisodeOutcomePackArtifact(validPack(), {
      artifactRoot: tmpDir,
      timestamp: "2026-05-01T20:00:00.000Z",
    });

    const raw = await readFile(artifact.jsonPath, "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      schemaVersion: "work_episode_outcome_pack.v1",
      safety: {
        noRawLogs: true,
        noRawTranscripts: true,
      },
    });
    expect(raw.toLowerCase()).not.toContain("raw tool log");
    expect(artifact.promptPersisted).toBe(false);
    expect(artifact.rawResponsePersisted).toBe(false);
    expect(artifact.rawFullTranscriptPersisted).toBe(false);
  });
});
