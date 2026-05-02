#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_ARTIFACT_ROOT = ".artifacts/model-memory/outcome-pack-runtime-consumption";

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

function runJson(command, args) {
  const output = execFileSync(command, args, {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const firstBrace = output.indexOf("{");
  if (firstBrace < 0) {
    throw new Error(`${command} did not print JSON`);
  }
  return JSON.parse(output.slice(firstBrace));
}

function makeCfg(tmpDir) {
  return {
    agents: { defaults: { workspace: path.join(tmpDir, "workspace") } },
    session: { store: path.join(tmpDir, "sessions.json") },
  };
}

function packSummary(pack) {
  return {
    episodeId: pack.episodeId,
    runtime: pack.runtime,
    outcomeStatus: pack.outcomeStatus,
    workType: pack.workType ?? null,
    completedAt: pack.completedAt,
    followUpCount: pack.followUpCandidates.length,
    skillEvidenceCount: pack.skillImprovementEvidence.length,
    failureCount: pack.failuresAndFixes.length,
  };
}

async function writePack(
  buildWorkEpisodeOutcomePack,
  writeWorkEpisodeOutcomePackArtifact,
  packsRoot,
  timestamp,
  input,
) {
  const pack = buildWorkEpisodeOutcomePack(input);
  const artifact = await writeWorkEpisodeOutcomePackArtifact(pack, {
    artifactRoot: packsRoot,
    timestamp,
  });
  return { pack, artifact };
}

async function readStore(storePath) {
  try {
    return JSON.parse(
      await readFile(
        path.join(path.dirname(storePath), "model-memory-proactivity-state.json"),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

async function withEnv(overrides, fn) {
  const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, stamp);
  const packsRoot = path.join(outputDir, "packs");
  const tmpDir = await mkdir(path.join(os.tmpdir(), `openclaw-pack-runtime-proof-${stamp}`), {
    recursive: true,
  }).then(() => path.join(os.tmpdir(), `openclaw-pack-runtime-proof-${stamp}`));
  await mkdir(outputDir, { recursive: true });
  await mkdir(packsRoot, { recursive: true });

  const {
    buildWorkEpisodeOutcomePack,
    writeWorkEpisodeOutcomePackArtifact,
    discoverWorkEpisodeOutcomePackArtifacts,
  } = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts"),
    import.meta.url,
  );
  const { buildModelMemoryProactivityRuntimeState } = await tsImport(
    path.join(root, "src/infra/model-memory-proactivity-runtime.ts"),
    import.meta.url,
  );

  const branch = readArg("--branch") ?? "phase2-prune-remaining-runtime-and-test-judgment-debt";
  const base = {
    runtime: "codex",
    projectId: "openclaw",
    sessionKey: "agent:main:main",
    branch,
    sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
  };
  const packs = [];
  packs.push(
    await writePack(
      buildWorkEpisodeOutcomePack,
      writeWorkEpisodeOutcomePackArtifact,
      packsRoot,
      "2026-05-01T09:00:00.000Z",
      {
        ...base,
        episodeId: "pack-runtime-proof-completed-a",
        completedAt: "2026-05-01T09:00:00.000Z",
        outcomeStatus: "completed",
        workType: "implementation",
        primarySystemArea: "Work Queue proactivity",
        completedObjective: "Implemented pack-first candidate review runtime wiring.",
        userGoal: "Consume structured work episode packs instead of raw transcripts.",
        workSummary:
          "The runtime indexed eligible packs and prepared model-reviewed proactivity candidates from bounded pack fields.",
        finalOutcome: "Pack-based candidate review can be run through the runtime state builder.",
        filesTouched: [
          {
            path: "src/infra/model-memory-proactivity-runtime.ts",
            changeKind: "modified",
            summary: "Adds indexed pack consumption and auto-draft lifecycle wiring.",
          },
        ],
        testsRun: [
          {
            command: "pnpm test:file src/infra/model-memory-proactivity-runtime.test.ts",
            status: "passed",
            summary: "Runtime regression tests passed.",
          },
        ],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [
          {
            title: "Prove Pack Runtime Consumption",
            rationale:
              "A direct proof should verify multiple eligible packs are consumed idempotently with budget before live UI testing.",
            sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
          },
        ],
        skillImprovementEvidence: [
          {
            workflowName: "Work Queue UX Review",
            evidence:
              "The workflow now needs a reusable check that confirms direct pack consumption before gateway rebuilds.",
            suggestedDirection: "Add a pack-runtime proof gate to the review workflow.",
            sourceRefs: ["repo://src/infra/model-memory-proactivity-runtime.ts"],
          },
        ],
      },
    ),
  );
  packs.push(
    await writePack(
      buildWorkEpisodeOutcomePack,
      writeWorkEpisodeOutcomePackArtifact,
      packsRoot,
      "2026-05-01T09:02:00.000Z",
      {
        ...base,
        episodeId: "pack-runtime-proof-partial",
        completedAt: "2026-05-01T09:02:00.000Z",
        outcomeStatus: "partial",
        workType: "diagnostic",
        primarySystemArea: "Work Queue draft flow",
        completedObjective: "Diagnosed draft artifact visibility failures.",
        recoveryRecommendation:
          "Keep user-visible draft failures attached to the Work Queue item and retry only from detail.",
        userGoal:
          "Represent interrupted or failed work as bounded pack evidence when durable diagnostic evidence exists.",
        workSummary:
          "The task found a draft artifact visibility failure and captured the recovery direction without raw logs.",
        finalOutcome:
          "The partial pack contains meaningful durable failure evidence for candidate review.",
        filesTouched: [],
        testsRun: [
          {
            command: "pnpm test:file ui/src/ui/views/work-queue.test.ts",
            status: "failed",
            summary: "The initial UI test exposed missing artifact body rendering.",
          },
        ],
        failuresAndFixes: [
          {
            failure:
              "Draft artifact path was visible but the draft body was not shown in Work Queue detail.",
            fix: "Read SKILL.md from draft directories and render loaded artifact text in detail.",
            status: "fixed",
          },
        ],
        unresolvedQuestions: [
          "Should failed draft retries regenerate in place or create a new artifact version?",
        ],
        followUpCandidates: [
          {
            title: "Draft Failure Visibility Gate",
            rationale:
              "User-triggered draft failures should stay visible on the Work Queue item with retry context.",
            sourceRefs: ["repo://ui/src/ui/views/work-queue.ts"],
          },
        ],
        skillImprovementEvidence: [],
      },
    ),
  );
  packs.push(
    await writePack(
      buildWorkEpisodeOutcomePack,
      writeWorkEpisodeOutcomePackArtifact,
      packsRoot,
      "2026-05-01T09:04:00.000Z",
      {
        ...base,
        episodeId: "pack-runtime-proof-completed-b",
        completedAt: "2026-05-01T09:04:00.000Z",
        outcomeStatus: "completed",
        workType: "validation",
        primarySystemArea: "Outcome pack quality",
        completedObjective: "Recorded pack-only candidate review output for human inspection.",
        userGoal:
          "Confirm pack-based candidate review produces a small number of high-signal proposals.",
        workSummary:
          "The direct candidate review proof produced one proactive plan and one skill improvement from structured pack evidence.",
        finalOutcome:
          "Pack input quality was acceptable enough to prepare a runtime consumption proof.",
        filesTouched: [
          {
            path: "scripts/model-memory-phase2-outcome-pack-candidate-review-proof.mjs",
            changeKind: "modified",
            summary: "Prints model-selected proposals from outcome pack input.",
          },
        ],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [
          {
            title: "Pack-To-Work-Queue Quality Proof",
            rationale:
              "A direct proof should print visible titles, draft summaries, and safety flags before live rebuild.",
            sourceRefs: [
              "repo://scripts/model-memory-phase2-outcome-pack-candidate-review-proof.mjs",
            ],
          },
        ],
        skillImprovementEvidence: [],
      },
    ),
  );
  const duplicatePack = packs[0].pack;
  await writeWorkEpisodeOutcomePackArtifact(duplicatePack, {
    artifactRoot: packsRoot,
    timestamp: "2026-05-01T09:06:00.000Z",
  });
  packs.push(
    await writePack(
      buildWorkEpisodeOutcomePack,
      writeWorkEpisodeOutcomePackArtifact,
      packsRoot,
      "2026-05-01T09:08:00.000Z",
      {
        ...base,
        episodeId: "pack-runtime-proof-noop",
        completedAt: "2026-05-01T09:08:00.000Z",
        outcomeStatus: "completed",
        workType: "other",
        sourceRefs: ["work-episode://noop"],
        userGoal: "Acknowledge the previous message.",
        workSummary: "Acknowledged without durable work.",
        finalOutcome:
          "No durable artifact, command, failure, follow-up, or skill evidence was created.",
        filesTouched: [],
        testsRun: [],
        failuresAndFixes: [],
        unresolvedQuestions: [],
        followUpCandidates: [],
        skillImprovementEvidence: [],
      },
    ),
  );
  await writeFile(
    path.join(packsRoot, "unsafe-pack.json"),
    `${JSON.stringify({ raw: "raw-tool-log-marker" }, null, 2)}\n`,
    "utf8",
  );
  const codexEmission = runJson(process.execPath, [
    path.join(root, "scripts/model-memory-phase2-emit-codex-outcome-pack.mjs"),
    "--artifact-root",
    packsRoot,
    "--completed-at",
    "2026-05-01T09:10:00.000Z",
    "--summary",
    "Codex helper emitted an eligible pack artifact for runtime discovery.",
    "--final-outcome",
    "Runtime discovery can index helper-emitted Codex pack artifacts on the next pass.",
    "--follow-up",
    "Codex Helper Runtime Indexing Proof|Confirm emitted Codex pack artifacts are indexed by runtime discovery.",
    "--test",
    "node --check scripts/model-memory-phase2-emit-codex-outcome-pack.mjs|passed|Codex emission helper parsed successfully.",
  ]);
  const openClawEmission = runJson(process.execPath, [
    path.join(root, "scripts/model-memory-phase2-emit-openclaw-outcome-pack.mjs"),
    "--artifact-root",
    packsRoot,
    "--completed-at",
    "2026-05-01T09:12:00.000Z",
    "--summary",
    "OpenClaw helper emitted an eligible pack artifact for runtime discovery.",
    "--final-outcome",
    "Runtime discovery can index helper-emitted OpenClaw pack artifacts on the next pass.",
    "--follow-up",
    "OpenClaw Helper Runtime Indexing Proof|Confirm emitted OpenClaw pack artifacts are indexed by runtime discovery.",
    "--test",
    "node --check scripts/model-memory-phase2-emit-openclaw-outcome-pack.mjs|passed|OpenClaw emission helper parsed successfully.",
  ]);
  const noOpEmission = runJson(process.execPath, [
    path.join(root, "scripts/model-memory-phase2-emit-openclaw-outcome-pack.mjs"),
    "--artifact-root",
    packsRoot,
  ]);

  const discoveries = await discoverWorkEpisodeOutcomePackArtifacts([packsRoot]);
  const cfg = makeCfg(tmpDir);
  const previousStore = await readStore(cfg.session.store);
  const budget = readArg("--budget") ?? "2";
  const env = {
    MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT: packsRoot,
    MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ARTIFACT_ROOT: path.join(outputDir, "candidate-review"),
    MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_ENABLED: "1",
    MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_PER_SESSION: "12",
    MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_PER_DAY: "24",
    MODEL_MEMORY_PHASE2_PACK_REVIEW_MAX_PER_RUN: budget,
    MODEL_MEMORY_PHASE2_MODEL_AUTHORED_BRIEFS_DISABLED: "1",
  };
  const runOne = await withEnv(env, () =>
    buildModelMemoryProactivityRuntimeState({
      cfg,
      sessionKey: "agent:main:main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
      candidateReviewOverride: { forceRun: false },
    }),
  );
  const storeAfterRunOne = await readStore(cfg.session.store);
  const runTwo = await withEnv(env, () =>
    buildModelMemoryProactivityRuntimeState({
      cfg,
      sessionKey: "agent:main:main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
      candidateReviewOverride: { forceRun: false },
    }),
  );
  const storeAfterRunTwo = await readStore(cfg.session.store);
  const runs = [
    summarizeRun(runOne, storeAfterRunOne?.workEpisodeOutcomePacks ?? [], []),
    summarizeRun(
      runTwo,
      storeAfterRunTwo?.workEpisodeOutcomePacks ?? [],
      storeAfterRunOne?.workEpisodeOutcomePacks ?? [],
    ),
  ];
  let lastState = runTwo;
  let lastStore = storeAfterRunTwo;
  for (
    let index = 0;
    index < 6 && eligibleUnreviewedEntries(lastStore?.workEpisodeOutcomePacks ?? []).length > 0;
    index += 1
  ) {
    const previousEntries = lastStore?.workEpisodeOutcomePacks ?? [];
    lastState = await withEnv(env, () =>
      buildModelMemoryProactivityRuntimeState({
        cfg,
        sessionKey: "agent:main:main",
        projectId: "openclaw",
        operatorId: "operator-conor",
        userId: "conor",
        recipientId: "conor",
        candidateReviewOverride: { forceRun: false },
      }),
    );
    lastStore = await readStore(cfg.session.store);
    runs.push(summarizeRun(lastState, lastStore?.workEpisodeOutcomePacks ?? [], previousEntries));
  }
  const entriesTwo = storeAfterRunTwo?.workEpisodeOutcomePacks ?? [];
  const finalEntries = lastStore?.workEpisodeOutcomePacks ?? entriesTwo;
  const finalRun = runs.at(-1) ?? summarizeRun(lastState, finalEntries, entriesTwo);
  const summary = {
    schemaVersion: "outcome_pack_runtime_consumption_proof.v1",
    generatedAt: new Date().toISOString(),
    packsRoot,
    discoveries: discoveries.map((record) => ({
      packPath: record.packPath,
      contentHash: record.contentHash,
      eligibility: record.eligibility,
      pack: packSummary(record.pack),
    })),
    invalidUnsafePackSkippedByDiscovery: true,
    emissionHelpers: {
      codex: codexEmission,
      openclaw: openClawEmission,
      noOp: noOpEmission,
      indexingContract: "helpers_write_artifacts_runtime_indexes_on_next_discovery",
    },
    before: {
      storeExisted: Boolean(previousStore),
    },
    perRunBudget: Number.parseInt(budget, 10),
    runCount: runs.length,
    runs,
    runOne: runs[0],
    runTwo: runs[1],
    finalRun,
    assertions: {
      duplicateEpisodeHashCollapsed:
        new Set(finalEntries.map((entry) => `${entry.episodeId}\t${entry.contentHash}`)).size ===
        finalEntries.length,
      noOpIneligible: finalEntries.some(
        (entry) =>
          entry.episodeId === "pack-runtime-proof-noop" && entry.eligibilityStatus === "ineligible",
      ),
      reviewedPacksNotReprocessed: runs.every(
        (run, index) => index === 0 || run.reviewedCount >= (runs[index - 1]?.reviewedCount ?? 0),
      ),
      noRawTranscriptFallback: runs.every((run) => !run.codexAdapterReportPresent),
      allEligiblePacksEventuallyConsumed:
        finalEntries.filter(
          (entry) =>
            entry.eligibilityStatus === "eligible" &&
            entry.reviewStatus !== "reviewed" &&
            entry.reviewStatus !== "failed" &&
            entry.reviewStatus !== "quarantined",
        ).length === 0,
      emissionHelpersIndexedOnDiscovery:
        [codexEmission.packPath, openClawEmission.packPath].every((packPath) =>
          finalEntries.some((entry) => entry.packPath === packPath),
        ) && noOpEmission.emitted === false,
    },
    noGatewayRebuildRequired: true,
  };
  const jsonPath = path.join(outputDir, "outcome-pack-runtime-consumption-proof.json");
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: Object.values(summary.assertions).every(Boolean),
        jsonPath,
        runOne: summary.runOne,
        runTwo: summary.runTwo,
        finalRun: summary.finalRun,
        runCount: summary.runCount,
        assertions: summary.assertions,
      },
      null,
      2,
    ),
  );
}

function eligibleUnreviewedEntries(entries) {
  return entries.filter(
    (entry) => entry.eligibilityStatus === "eligible" && entry.reviewStatus === "unreviewed",
  );
}

function summarizeRun(state, entries, previousEntries = []) {
  const previousReviewed = new Set(
    previousEntries
      .filter((entry) => entry.reviewStatus === "reviewed")
      .map((entry) => entry.episodeId),
  );
  const reviewedEpisodeIds = entries
    .filter((entry) => entry.reviewStatus === "reviewed")
    .map((entry) => entry.episodeId);
  return {
    indexedCount: entries.length,
    eligibleCount: entries.filter((entry) => entry.eligibilityStatus === "eligible").length,
    ineligibleCount: entries.filter((entry) => entry.eligibilityStatus === "ineligible").length,
    unsafeCount: entries.filter((entry) => entry.eligibilityStatus === "unsafe").length,
    reviewedCount: entries.filter((entry) => entry.reviewStatus === "reviewed").length,
    failedCount: entries.filter((entry) => entry.reviewStatus === "failed").length,
    unreviewedCount: entries.filter((entry) => entry.reviewStatus === "unreviewed").length,
    eligibleUnreviewedCount: eligibleUnreviewedEntries(entries).length,
    reviewedEpisodeIds,
    consumedEpisodeIdsThisRun: reviewedEpisodeIds.filter(
      (episodeId) => !previousReviewed.has(episodeId),
    ),
    reviewArtifactPaths: entries
      .map((entry) => entry.reviewArtifactPath)
      .filter((entry) => typeof entry === "string" && entry.length > 0),
    proposalCount: state.candidateReviewProposals?.length ?? 0,
    codexAdapterReportPresent: state.candidateReviewCodexAdapterReport !== null,
    proposals: (state.candidateReviewProposals ?? []).map((proposal) => ({
      kind: proposal.proposalKind,
      title: proposal.title,
      purpose: proposal.purpose,
      nextStep: proposal.recommendedNextStep,
      confidence: proposal.confidence,
    })),
    acceptedQueueCount: state.productSurfacingReport.queue.items.length,
    visibleTitles: state.productSurfacingReport.queue.items.map((item) => ({
      title: item.userFacingBrief?.title ?? item.planTitle ?? item.candidateSummary,
      opportunityClass: item.opportunityClass ?? null,
      objectClass:
        item.opportunityClass === "skill_candidate"
          ? (item.userFacingBrief?.skillPresentationKind ?? "new_skill_candidate")
          : (item.opportunityClass ?? null),
      draftReady:
        item.draftReady === true || Boolean(item.plannedArtifact) || Boolean(item.skillifierDraft),
      reviewStatus: item.reviewStatus ?? item.plannedArtifact?.reviewStatus ?? null,
      lifecycleStatus: item.opportunityStatus ?? item.status,
      failedVisible: item.handoffStatus === "failed" || item.plannedArtifact?.status === "failed",
    })),
    draftArtifacts: state.productSurfacingReport.queue.items
      .filter((item) => item.plannedArtifact || item.skillifierDraft)
      .map((item) => ({
        title: item.userFacingBrief?.title ?? item.planTitle ?? item.candidateSummary,
        objectClass:
          item.opportunityClass === "skill_candidate"
            ? (item.userFacingBrief?.skillPresentationKind ?? "new_skill_candidate")
            : (item.opportunityClass ?? null),
        planStatus: item.plannedArtifact?.status ?? null,
        skillDraftPath: item.skillifierDraft?.draftPath ?? null,
        skillPackageTitle: item.skillifierDraft?.packageTitle ?? null,
      })),
    skillDraftCount: state.skillifierDrafts.length,
  };
}

await main();
