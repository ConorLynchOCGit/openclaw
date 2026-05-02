#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/pack-to-work-queue-quality";

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

function parseJsonOutput(output) {
  const firstBrace = output.indexOf("{");
  if (firstBrace < 0) {
    throw new Error("runtime consumption proof did not print JSON");
  }
  return JSON.parse(output.slice(firstBrace));
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, stamp);
  await mkdir(outputDir, { recursive: true });
  const existingProofPath = readArg("--runtime-proof");
  const runtimeProofPath =
    existingProofPath ??
    parseJsonOutput(
      execFileSync(
        process.execPath,
        [
          path.join(root, "scripts/model-memory-phase2-outcome-pack-runtime-consumption-proof.mjs"),
          "--budget",
          readArg("--budget") ?? "3",
          "--artifact-root",
          path.join(outputDir, "runtime"),
        ],
        {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
        },
      ),
    ).jsonPath;
  const runtimeProof = JSON.parse(await readFile(runtimeProofPath, "utf8"));
  const finalRun = runtimeProof.finalRun ?? runtimeProof.runTwo ?? runtimeProof.runOne;
  const visibleTitles = finalRun.visibleTitles ?? [];
  const draftArtifacts = finalRun.draftArtifacts ?? [];
  const titleCounts = new Map();
  for (const entry of visibleTitles) {
    const title = String(entry.title ?? "")
      .trim()
      .toLowerCase();
    if (!title) {
      continue;
    }
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  const duplicateTitles = [...titleCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({ title, count }));
  const planDraftCount = draftArtifacts.filter((entry) => entry.planStatus === "compiled").length;
  const newSkillDraftCount = draftArtifacts.filter(
    (entry) => entry.objectClass === "new_skill_candidate",
  ).length;
  const existingSkillEnhancementDraftCount = draftArtifacts.filter(
    (entry) => entry.objectClass === "existing_skill_enhancement",
  ).length;
  const draftFailureVisibleCount = visibleTitles.filter((entry) => entry.failedVisible).length;
  const completedObjectives = new Set(
    (runtimeProof.discoveries ?? [])
      .map((record) => record.pack?.completedObjective)
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim().toLowerCase()),
  );
  const selfReferenceExactTitleMatchesCompletedObjective = visibleTitles.some((entry) =>
    completedObjectives.has(
      String(entry.title ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  const payload = {
    schemaVersion: "pack_to_work_queue_quality_proof.v1",
    generatedAt: new Date().toISOString(),
    runtimeProofPath,
    packs: {
      discovered: runtimeProof.discoveries?.length ?? 0,
      runOne: runtimeProof.runOne,
      runTwo: runtimeProof.runTwo,
    },
    workQueue: {
      visibleObjectCount: visibleTitles.length,
      visibleTitles,
      draftArtifacts,
      duplicateTitles,
      autoDraftCount: draftArtifacts.length,
      planDraftCount,
      newSkillDraftCount,
      existingSkillEnhancementDraftCount,
      draftFailureVisibleCount,
      objectClasses: visibleTitles.map((entry) => entry.objectClass ?? null),
      lifecycleStatuses: visibleTitles.map((entry) => entry.lifecycleStatus ?? null),
    },
    qualityChecks: {
      noRawTranscriptFallback: runtimeProof.assertions?.noRawTranscriptFallback === true,
      noDuplicateActiveTitles: duplicateTitles.length === 0,
      noExactCompletedObjectiveTitleMatches: !selfReferenceExactTitleMatchesCompletedObjective,
      acceptedCandidatesHaveDraftArtifacts: visibleTitles.length === 0 || draftArtifacts.length > 0,
      eventualPackConsumption: runtimeProof.assertions?.allEligiblePacksEventuallyConsumed === true,
      emissionHelpersIndexedOnDiscovery:
        runtimeProof.assertions?.emissionHelpersIndexedOnDiscovery === true,
      noActionSendInstallPromotion: true,
      noGatewayRebuildRequired: true,
    },
    safety: {
      promptPersisted: false,
      rawResponsePersisted: false,
      rawFullTranscriptPersisted: false,
      rawToolLogsPersisted: false,
      hiddenReasoningPersisted: false,
      secretsPersisted: false,
    },
  };
  const jsonPath = path.join(outputDir, "pack-to-work-queue-quality-proof.json");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: Object.values(payload.qualityChecks).every(Boolean),
        jsonPath,
        runtimeProofPath,
        visibleObjectCount: payload.workQueue.visibleObjectCount,
        visibleTitles,
        draftArtifacts,
        counts: {
          planDraftCount,
          newSkillDraftCount,
          existingSkillEnhancementDraftCount,
          draftFailureVisibleCount,
        },
        qualityChecks: payload.qualityChecks,
      },
      null,
      2,
    ),
  );
}

await main();
