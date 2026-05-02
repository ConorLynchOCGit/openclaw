#!/usr/bin/env node
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
  const filesTouched = readAllArgs("--file")
    .map((value) => {
      const [filePath, summary] = splitFields(value, 2);
      return { path: filePath, changeKind: "unknown", summary: summary || undefined };
    })
    .slice(0, 24);
  const testsRun = readAllArgs("--test").map((value) => {
    const [command, status, summary] = splitFields(value, 3, "unknown");
    return {
      command,
      status: ["passed", "failed", "skipped", "unknown"].includes(status) ? status : "unknown",
      summary: summary || "Bounded OpenClaw task test summary.",
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
      rationale: rationale || "Follow-up candidate supplied by OpenClaw task closeout.",
      sourceRefs: ["openclaw://manual-closeout/follow-up"],
    };
  });
  const skillImprovementEvidence = readAllArgs("--skill-evidence").map((value) => {
    const [workflowName, evidence, suggestedDirection] = splitFields(value, 3);
    return {
      workflowName: workflowName || undefined,
      evidence: evidence || "Skill improvement evidence supplied by OpenClaw task closeout.",
      suggestedDirection: suggestedDirection || undefined,
      sourceRefs: ["openclaw://manual-closeout/skill-evidence"],
    };
  });
  const unresolvedQuestions = readAllArgs("--unresolved");
  const meaningfulEvidenceCount =
    filesTouched.length +
    testsRun.length +
    failuresAndFixes.length +
    followUpCandidates.length +
    skillImprovementEvidence.length +
    unresolvedQuestions.length;
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
    runtime: "openclaw",
    projectId: readArg("--project-id") ?? "openclaw",
    sessionKey: readArg("--session-key") ?? "main",
    branch: readArg("--branch"),
    completedAt: readArg("--completed-at") ?? new Date().toISOString(),
    outcomeStatus: readArg("--outcome-status") ?? "completed",
    workType: readArg("--work-type") ?? "implementation",
    primarySystemArea: readArg("--system-area") ?? "openclaw",
    completedObjective: readArg("--completed-objective"),
    recoveryRecommendation: readArg("--recovery-recommendation"),
    userGoal:
      readArg("--user-goal") ??
      "Complete a meaningful OpenClaw task and emit bounded closeout evidence.",
    workSummary:
      readArg("--summary") ??
      "OpenClaw completed meaningful task work with bounded structural evidence.",
    finalOutcome:
      readArg("--final-outcome") ??
      "A structured Work Episode Outcome Pack was emitted for candidate review.",
    filesTouched,
    testsRun,
    failuresAndFixes,
    unresolvedQuestions,
    followUpCandidates,
    skillImprovementEvidence,
    sourceRefs: [
      "openclaw://manual-closeout",
      ...filesTouched.map((file) => `repo://${file.path}`),
    ],
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
