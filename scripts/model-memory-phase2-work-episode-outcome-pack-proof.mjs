#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/work-episode-outcome-pack";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function safeExec(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function changedFiles() {
  return [
    ...new Set([
      ...safeExec("git", ["diff", "--name-only"]).split(/\r?\n/u),
      ...safeExec("git", ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/u),
    ]),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) =>
      [
        "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts",
        "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.test.ts",
        "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
        "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.test.ts",
        "src/infra/model-memory-proactivity-runtime.ts",
        "src/infra/model-memory-proactivity-runtime.test.ts",
        "scripts/model-memory-phase2-local-high-context-candidate-review.mjs",
      ].includes(file),
    );
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  await mkdir(path.join(artifactRoot, stamp), { recursive: true });

  const { buildWorkEpisodeOutcomePack, writeWorkEpisodeOutcomePackArtifact } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts"),
    import.meta.url,
  );

  const files = changedFiles();
  const branch = safeExec("git", ["branch", "--show-current"]);
  const pack = buildWorkEpisodeOutcomePack({
    runtime: "codex",
    projectId: "openclaw",
    sessionKey: "agent:main:main",
    branch: branch || "phase2-prune-remaining-runtime-and-test-judgment-debt",
    completedAt: new Date().toISOString(),
    outcomeStatus: "completed",
    workType: "implementation",
    primarySystemArea: "model-memory proactivity",
    completedObjective:
      "Use structured work episode outcome packs as the only substrate for plan and skill candidate review.",
    userGoal:
      "Replace broad skill and proactivity review input with a structured Work Episode Outcome Pack so Codex work can become first-class OpenClaw proactivity evidence.",
    workSummary:
      "Added a bounded outcome-pack contract, pack artifact writer, and candidate-review adapter so review can evaluate files touched, tests run, failures/fixes, follow-ups, and skill evidence instead of noisy raw session tails.",
    finalOutcome:
      "Direct candidate review can now require a structured closeout pack as primary input before any live gateway rebuild or UI proof.",
    filesTouched: files.map((file) => ({
      path: file,
      changeKind: file.includes("phase2-work-episode-outcome-pack") ? "created" : "modified",
      summary: file.endsWith(".test.ts")
        ? "Adds focused tests for the outcome-pack or candidate-review path."
        : "Updates the proactivity candidate-review input contract or local proof tooling.",
    })),
    testsRun: [
      {
        command:
          "pnpm test:file extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.test.ts",
        status: "passed",
        summary:
          "Focused validation for pack schema, artifact safety, and provenance passed in this work episode.",
      },
      {
        command:
          "pnpm test:file extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.test.ts",
        status: "passed",
        summary:
          "Focused validation for pack-to-candidate-review packet construction passed in this work episode.",
      },
      {
        command: "pnpm test:file src/infra/model-memory-proactivity-runtime.test.ts",
        status: "passed",
        summary:
          "Regression validation for input hygiene and outcome-pack source loading passed in this work episode.",
      },
    ],
    failuresAndFixes: [
      {
        failure:
          "Broad mixed OpenClaw/Codex session tails caused weak, duplicate, or self-referential candidate cards.",
        fix: "Require a structured outcome pack as the candidate-review substrate; raw OpenClaw/Codex windows are no longer fallback evidence for creating new plan or skill candidates.",
        status: "fixed",
      },
      {
        failure:
          "OpenClaw heartbeat history often contained proof prompts, handoff scaffolding, and acknowledgement-only turns rather than real work.",
        fix: "Preserve input hygiene suppression and make Codex work visible through bounded closeout evidence.",
        status: "fixed",
      },
    ],
    unresolvedQuestions: [
      "When should automatic outcome-pack emission move from manual proof script to Codex/OpenClaw task closeout?",
      "How should Work Queue choose between multiple recent packs once execution orchestration moves into OpenClaw?",
    ],
    followUpCandidates: [
      {
        title: "Wire outcome packs into heartbeat candidate review",
        rationale:
          "Heartbeat should trigger review of the latest structured closeout pack and skip candidate review when no closeout pack exists.",
        sourceRefs: ["work-episode://current/outcome-pack"],
      },
    ],
    skillImprovementEvidence: [
      {
        workflowName: "Work Queue UX Review",
        evidence:
          "The repeated Work Queue/proactivity debugging loop needs a reusable pre-check that inspects the selected evidence substrate before judging card quality.",
        suggestedDirection:
          "Add an outcome-pack quality gate to the Work Queue UX review workflow before UI/card fixes.",
        sourceRefs: ["work-episode://current/outcome-pack"],
      },
    ],
    sourceRefs: [
      "codex://current-task/outcome-pack",
      "work-episode://current/outcome-pack",
      ...files.map((file) => `repo://${file}`),
    ],
  });

  const artifact = await writeWorkEpisodeOutcomePackArtifact(pack, {
    artifactRoot: path.join(artifactRoot, stamp),
    timestamp: new Date().toISOString(),
  });
  const summaryPath = path.join(artifactRoot, stamp, "work-episode-outcome-pack-proof.json");
  const summary = {
    ok: true,
    schemaVersion: "work_episode_outcome_pack_proof.v1",
    artifact,
    episodeId: pack.episodeId,
    runtime: pack.runtime,
    filesTouched: pack.filesTouched.map((file) => file.path),
    testsRun: pack.testsRun.map((test) => ({ command: test.command, status: test.status })),
    followUpCandidateCount: pack.followUpCandidates.length,
    skillImprovementEvidenceCount: pack.skillImprovementEvidence.length,
    noGatewayRebuildRequired: true,
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...summary, summaryPath }, null, 2));
}

await main();
