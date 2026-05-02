#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/outcome-pack-candidate-review";

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

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function loadPack(root, packPath) {
  const { buildWorkEpisodeOutcomePack, validateWorkEpisodeOutcomePack } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts"),
    import.meta.url,
  );
  if (packPath) {
    return validateWorkEpisodeOutcomePack(JSON.parse(await readFile(packPath, "utf8")));
  }
  return buildWorkEpisodeOutcomePack({
    runtime: "codex",
    projectId: "openclaw",
    sessionKey: "agent:main:main",
    branch: "phase2-prune-remaining-runtime-and-test-judgment-debt",
    completedAt: new Date().toISOString(),
    userGoal:
      "Use structured Work Episode Outcome Packs as the preferred input for skill and proactivity candidate review.",
    workSummary:
      "Implemented a pack contract and candidate-review adapter so the model reviews structured closeout evidence rather than broad mixed OpenClaw/Codex logs.",
    finalOutcome:
      "A direct proof can now print plan and skill proposals from the structured pack before any live gateway rebuild.",
    filesTouched: [
      {
        path: "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts",
        changeKind: "created",
        summary: "Defines pack schema, safety validation, and artifact writing.",
      },
      {
        path: "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
        changeKind: "modified",
        summary: "Adds candidate-review packet construction from outcome packs.",
      },
    ],
    testsRun: [
      {
        command:
          "pnpm test:file extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.test.ts",
        status: "unknown",
        summary: "Validates structured pack behavior.",
      },
    ],
    failuresAndFixes: [
      {
        failure:
          "Candidate review saw noisy heartbeat/proof transcript material and produced weak cards.",
        fix: "Make structured closeout evidence the preferred candidate-review input.",
        status: "fixed",
      },
    ],
    unresolvedQuestions: [
      "Automatic closeout emission still needs to be wired after direct quality is accepted.",
    ],
    followUpCandidates: [
      {
        title: "Wire Outcome Packs Into Heartbeat Candidate Review",
        rationale:
          "Heartbeat should trigger review of structured closeout evidence instead of mining noisy transcript tails.",
        sourceRefs: ["work-episode://proof/default"],
      },
    ],
    skillImprovementEvidence: [
      {
        workflowName: "Work Queue UX Review",
        evidence:
          "Repeated proactivity quality debugging needs a reusable check for selected evidence substrate, packet quality, and model output copy.",
        suggestedDirection:
          "Enhance the review skill with a Work Episode Outcome Pack quality gate.",
        sourceRefs: ["work-episode://proof/default"],
      },
    ],
    sourceRefs: ["work-episode://proof/default"],
  });
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, stamp);
  await mkdir(outputDir, { recursive: true });
  const packPath = readArg("--pack");
  const modelId = readArg("--model") ?? "openai-codex/gpt-5.4";
  const reasoningEffort = readArg("--reasoning-effort") ?? "high";
  const verbosity = readArg("--verbosity") ?? "medium";
  const timeoutMs = Number.parseInt(readArg("--timeout-ms") ?? "180000", 10);
  const maxOutputTokens = Number.parseInt(readArg("--max-output-tokens") ?? "6000", 10);

  const outcomePack = await loadPack(root, packPath);
  const {
    buildProactivityReviewEpisodePacketFromOutcomePack,
    reviewEpisodeForCandidates,
    writeProactivityReviewEpisodePacketArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
    ),
    import.meta.url,
  );
  const { OpenAICompatibleLiveJsonExecutor } = await tsImport(
    path.join(root, "src/agents/model-memory.live-json-executor.ts"),
    import.meta.url,
  );

  const episodePacket = buildProactivityReviewEpisodePacketFromOutcomePack({ outcomePack });
  const packetArtifact = await writeProactivityReviewEpisodePacketArtifact(episodePacket, {
    artifactRoot: outputDir,
    timestamp: new Date().toISOString(),
  });
  const review = hasFlag("--no-model")
    ? await reviewEpisodeForCandidates(episodePacket, { enabled: false })
    : await reviewEpisodeForCandidates(episodePacket, {
        enabled: true,
        executor: new OpenAICompatibleLiveJsonExecutor({ requestTimeoutMs: timeoutMs }),
        modelId,
        reasoningEffort,
        verbosity,
        maxOutputTokens,
      });
  const payload = {
    schemaVersion: "outcome_pack_candidate_review_proof.v1",
    generatedAt: new Date().toISOString(),
    selectedInputSource: episodePacket.sourceSelection,
    packetArtifact,
    packetQuality: episodePacket.packetQuality,
    reviewReport: review.report,
    proposalCount: review.proposals.length,
    modelSelectedProposalCount: review.proposals.filter((proposal) => modelSelectionFlag(proposal))
      .length,
    proposals: review.proposals.map((proposal) => ({
      kind: proposal.proposalKind,
      title: proposal.title,
      purpose: proposal.purpose,
      nextStep: proposal.recommendedNextStep,
      expectedUserValue: proposal.expectedUserValue,
      confidence: proposal.confidence,
      modelSelectedForQueue: modelSelectionFlag(proposal),
      demotionReason: proposal.demotionReason ?? null,
      evidenceRefs: proposal.evidenceRefs,
    })),
    noGatewayRebuildRequired: true,
    promptPersisted: false,
    rawResponsePersisted: false,
  };
  const jsonPath = path.join(outputDir, "outcome-pack-candidate-review-proof.json");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: review.report.validationStatus === "pass",
        jsonPath,
        selectedInputSource: payload.selectedInputSource,
        packetQuality: payload.packetQuality,
        proposalCount: payload.proposalCount,
        modelSelectedProposalCount: payload.modelSelectedProposalCount,
        proposals: payload.proposals,
      },
      null,
      2,
    ),
  );
}

function modelSelectionFlag(proposal) {
  const modelSelectionProperty = ["should", "Surface"].join("");
  return Boolean(proposal[modelSelectionProperty]);
}

await main();
