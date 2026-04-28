import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPhase2SkillifierDraft } from "./phase2-skillifier-draft.ts";

const tmpDirs: string[] = [];

function buildSkillCandidate() {
  return {
    skillCandidateId: "d99c3385-18f1-55d9-986b-20b16993059e",
    proactivityOpportunityId: "c4c34d89-6876-5b5f-809a-cd4b0c2bd701",
    normalizedIntentKey: "skill candidate ledger integration",
    sourceRuntime: "openclaw_session" as const,
    candidateType: "repeated_work_pattern" as const,
    evidenceSummary:
      "Repeated bounded skills workflow summaries point to one reusable skill opportunity.",
    recurrenceCount: 3,
    recurrenceWindow: {
      firstSeenAt: "2026-04-28T09:00:00.000Z",
      lastSeenAt: "2026-04-28T09:01:15.000Z",
    },
    exampleHashes: ["example-hash-1", "example-hash-2"],
    suggestedSkillName: "skill-candidate-ledger-integration",
    riskTier: "low" as const,
    autonomyLevelCeiling: 1 as const,
    lifecycleStatus: "detected" as const,
    installTargets: ["workspace_skills_dir" as const],
    evalStatus: "not_started" as const,
    vettingStatus: "not_started" as const,
    canaryStatus: "not_started" as const,
    createdAt: "2026-04-28T09:01:15.000Z",
    updatedAt: "2026-04-28T09:01:15.000Z",
    provenanceRefs: ["chat://main/assistant_turn/msg_final_skill_candidate_2"],
    rollbackPlan: {
      rollbackId: "rollback-candidate-1",
      strategy: "disable_candidate_only" as const,
      targetPaths: ["workspace_skills_dir" as const],
      directMainMutationAllowed: false as const,
    },
    sourceProfileIds: ["manual_note" as const],
    authorityTiers: ["tool_grounded" as const],
    contentHashes: ["content-hash-1"],
    proofHashes: ["proof-hash-1"],
    noDarkDataStatus: "pass" as const,
  };
}

function buildLedgerEntry() {
  return {
    opportunityId: "c4c34d89-6876-5b5f-809a-cd4b0c2bd701",
    title: "Skill candidate ledger integration",
    whyNow: "The same reusable workflow keeps repeating in the active repo slice.",
    proposedNextStep:
      "Draft the smallest bounded skill package that captures the repeated workflow without installing it.",
    expectedUserValue:
      "Turns repeated manual repo work into one reusable reviewable skill package.",
    evidenceSummary: "Derived from bounded assistant output and recurring same-session work.",
    confidence: "high" as const,
    sourceRefs: ["chat://main/assistant_turn/msg_final_skill_candidate_2"],
    sourceProfileIds: ["manual_note" as const],
    authorityTiers: ["tool_grounded" as const],
    contentHashes: ["content-hash-1"],
    proofHashes: ["proof-hash-1"],
  };
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("phase2 skillifier draft", () => {
  it("creates one bounded draft package in the workspace skills target", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skillifier-"));
    tmpDirs.push(workspaceDir);

    const report = await createPhase2SkillifierDraft({
      workspaceDir,
      skillCandidate: buildSkillCandidate(),
      ledgerEntry: buildLedgerEntry(),
      now: new Date("2026-04-28T14:00:00.000Z"),
    });

    expect(report.decision).toBe("draft_ready");
    expect(report.draft.skillPackageId).toBeTruthy();
    expect(report.draft.skillCandidateId).toBe(buildSkillCandidate().skillCandidateId);
    expect(report.draft.draftTarget.targetKind).toBe("workspace_skills_dir");
    expect(report.draft.skillDirectoryPath).toContain(path.join(workspaceDir, "skills"));
    const skillMarkdown = await fs.readFile(report.draft.skillFilePath, "utf8");
    expect(skillMarkdown).toContain("disable-model-invocation: true");
    expect(skillMarkdown).toContain("user-invocable: false");
    expect(skillMarkdown).toContain("## Purpose");
    expect(skillMarkdown).toContain("## Provenance Summary");
    expect(await fs.readFile(report.draft.reportFilePath, "utf8")).toContain("draft_ready");
  });

  it("keeps ids deterministic across rebuilds for the same candidate and target", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skillifier-"));
    tmpDirs.push(workspaceDir);

    const first = await createPhase2SkillifierDraft({
      workspaceDir,
      skillCandidate: buildSkillCandidate(),
      ledgerEntry: buildLedgerEntry(),
      now: new Date("2026-04-28T14:00:00.000Z"),
    });
    const second = await createPhase2SkillifierDraft({
      workspaceDir,
      skillCandidate: buildSkillCandidate(),
      ledgerEntry: buildLedgerEntry(),
      now: new Date("2026-04-28T14:05:00.000Z"),
    });

    expect(second.skillPackageId).toBe(first.skillPackageId);
    expect(second.reportId).toBe(first.reportId);
    expect(second.draft.skillDirectoryPath).toBe(first.draft.skillDirectoryPath);
  });

  it("fails closed when prohibited content would enter the draft", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skillifier-"));
    tmpDirs.push(workspaceDir);

    await expect(
      createPhase2SkillifierDraft({
        workspaceDir,
        skillCandidate: buildSkillCandidate(),
        ledgerEntry: {
          ...buildLedgerEntry(),
          evidenceSummary: "raw-prompt-marker should never survive into the draft package.",
        },
      }),
    ).rejects.toThrow(/prohibited marker/i);
  });
});
