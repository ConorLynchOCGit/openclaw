#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/work-episode-outcome-pack";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readAllArgs(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
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
    .slice(0, 24);
}

function splitFields(value, expected, fallback = "") {
  const parts = value.split("|").map((part) => part.trim());
  while (parts.length < expected) {
    parts.push(fallback);
  }
  return parts;
}

async function main() {
  const root = repoRoot();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const branch = readArg("--branch") ?? safeExec("git", ["branch", "--show-current"]);
  const files = [
    ...changedFiles().map((file) => ({
      path: file,
      changeKind: "unknown",
      summary: "Touched during this Codex work episode.",
    })),
    ...readAllArgs("--file").map((value) => {
      const [filePath, summary] = splitFields(value, 2);
      return { path: filePath, changeKind: "unknown", summary: summary || undefined };
    }),
  ].slice(0, 24);
  const testsRun = readAllArgs("--test").map((value) => {
    const [command, status, summary] = splitFields(value, 3, "unknown");
    return {
      command,
      status: ["passed", "failed", "skipped", "unknown"].includes(status) ? status : "unknown",
      summary: summary || "Bounded test summary provided by Codex closeout.",
    };
  });
  const failuresAndFixes = readAllArgs("--failure").map((value) => {
    const [failure, status, fix] = splitFields(value, 3, "unresolved");
    return {
      failure,
      status: ["fixed", "unresolved", "deferred"].includes(status) ? status : "unresolved",
      fix: fix || undefined,
    };
  });
  const followUpCandidates = readAllArgs("--follow-up").map((value) => {
    const [title, rationale] = splitFields(value, 2);
    return {
      title,
      rationale: rationale || "Follow-up candidate supplied by Codex closeout.",
      sourceRefs: ["codex://manual-closeout/follow-up"],
    };
  });
  const skillImprovementEvidence = readAllArgs("--skill-evidence").map((value) => {
    const [workflowName, evidence, suggestedDirection] = splitFields(value, 3);
    return {
      workflowName: workflowName || undefined,
      evidence: evidence || "Skill improvement evidence supplied by Codex closeout.",
      suggestedDirection: suggestedDirection || undefined,
      sourceRefs: ["codex://manual-closeout/skill-evidence"],
    };
  });
  const meaningfulEvidenceCount =
    files.length +
    testsRun.length +
    failuresAndFixes.length +
    followUpCandidates.length +
    skillImprovementEvidence.length +
    readAllArgs("--unresolved").length;
  if (meaningfulEvidenceCount === 0) {
    console.log(
      JSON.stringify(
        {
          emitted: false,
          reason: "no_structural_meaningful_work_evidence",
          noGatewayRebuildRequired: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  const {
    buildWorkEpisodeOutcomePack,
    evaluateWorkEpisodeOutcomePackEligibility,
    writeWorkEpisodeOutcomePackArtifact,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts"),
    import.meta.url,
  );
  const pack = buildWorkEpisodeOutcomePack({
    runtime: "codex",
    projectId: readArg("--project-id") ?? "openclaw",
    sessionKey: readArg("--session-key") ?? "agent:main:main",
    branch: branch || undefined,
    completedAt: readArg("--completed-at") ?? new Date().toISOString(),
    outcomeStatus: readArg("--outcome-status") ?? "completed",
    workType: readArg("--work-type") ?? "implementation",
    primarySystemArea: readArg("--system-area") ?? "openclaw",
    completedObjective: readArg("--completed-objective"),
    recoveryRecommendation: readArg("--recovery-recommendation"),
    userGoal:
      readArg("--user-goal") ??
      "Complete a meaningful Codex task and emit bounded closeout evidence.",
    workSummary:
      readArg("--summary") ??
      "Codex completed meaningful task work with bounded structural evidence.",
    finalOutcome:
      readArg("--final-outcome") ??
      "A structured Work Episode Outcome Pack was emitted for OpenClaw candidate review.",
    filesTouched: files,
    testsRun,
    failuresAndFixes,
    unresolvedQuestions: readAllArgs("--unresolved"),
    followUpCandidates,
    skillImprovementEvidence,
    sourceRefs: ["codex://manual-closeout", ...files.map((file) => `repo://${file.path}`)],
  });
  const artifact = await writeWorkEpisodeOutcomePackArtifact(pack, {
    artifactRoot,
    timestamp: pack.completedAt,
  });
  console.log(
    JSON.stringify(
      {
        emitted: true,
        episodeId: pack.episodeId,
        packHash: artifact.packHash,
        packPath: artifact.jsonPath,
        eligibility: evaluateWorkEpisodeOutcomePackEligibility(pack),
        noGatewayRebuildRequired: true,
      },
      null,
      2,
    ),
  );
}

await main();
