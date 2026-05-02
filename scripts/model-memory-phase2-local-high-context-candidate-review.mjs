#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const DEFAULT_SESSION_KEY = "agent:main:main";
const DEFAULT_OPENCLAW_SESSION_DIR = "/root/.openclaw/agents/main/sessions";
const DEFAULT_ARTIFACT_ROOT =
  ".artifacts/model-memory/phase2-contiguous-candidate-packets-and-model-cards";
const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
  "sk-",
];

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

function assertNoProhibitedContent(value, label) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`${label} contains prohibited marker: ${marker}`);
    }
  }
}

async function latestOpenClawSessionFile() {
  const dir = process.env.OPENCLAW_HIGH_CONTEXT_SESSION_DIR ?? DEFAULT_OPENCLAW_SESSION_DIR;
  const entries = await readdir(dir);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") || entry.includes(".checkpoint.") || entry.includes(".reset.")) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const info = await stat(fullPath);
    if (info.isFile()) {
      candidates.push({ fullPath, mtimeMs: info.mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const selected = candidates[0]?.fullPath;
  if (!selected) {
    throw new Error(`no OpenClaw session JSONL files found under ${dir}`);
  }
  return selected;
}

async function readOpenClawSessionMessages(sessionFile) {
  const raw = await readFile(sessionFile, "utf8");
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return [parsed?.message ?? parsed];
      } catch {
        return [];
      }
    });
}

function structuralTriggerDecision(event, activities) {
  const refs = activities.map((activity) => activity.ref);
  return {
    schemaVersion: "candidate_review_trigger_decision.v1",
    shouldRun: true,
    reasonCodes: ["session_boundary"],
    confidence: "high",
    episodeWindow: {
      startRef: refs[0] ?? event.eventId,
      endRef: refs.at(-1) ?? event.eventId,
      includedRefs: refs,
    },
    reviewGoal: "both",
    why: "Local high-context proof bypassed gateway cadence to review the contiguous recent work episode.",
  };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const artifactRoot = path.resolve(root, readArg("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const outputDir = path.join(artifactRoot, `${stamp}-local`);
  await mkdir(outputDir, { recursive: true });

  const sessionKey =
    readArg("--session-key") ?? process.env.OPENCLAW_SESSION_KEY ?? DEFAULT_SESSION_KEY;
  const sessionFile = readArg("--session-file") ?? (await latestOpenClawSessionFile());
  const codexHome = readArg("--codex-home") ?? process.env.CODEX_SESSION_HOME ?? "/root/.codex";
  const codexHistoryPath =
    readArg("--codex-history") ??
    process.env.CODEX_HISTORY_PATH ??
    path.join(codexHome, "history.jsonl");
  const openClawTurnWindow = Number.parseInt(
    readArg("--openclaw-turn-window") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_OPENCLAW_TURN_WINDOW ??
      "12",
    10,
  );
  const codexTurnWindow = Number.parseInt(
    readArg("--codex-turn-window") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_CODEX_TURN_WINDOW ??
      "80",
    10,
  );
  const modelId =
    readArg("--model") ??
    process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL ??
    "openai-codex/gpt-5.4";
  const reasoningEffort =
    readArg("--reasoning-effort") ??
    process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_REASONING_EFFORT ??
    "high";
  const verbosity =
    readArg("--verbosity") ??
    process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_VERBOSITY ??
    "medium";
  const timeoutMs = Number.parseInt(
    readArg("--timeout-ms") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_TIMEOUT_MS ??
      "180000",
    10,
  );
  const maxOutputTokens = Number.parseInt(
    readArg("--max-output-tokens") ??
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS ??
      "6000",
    10,
  );

  const { transcriptMessagesToHighContextCandidateReviewActivities } = await tsImport(
    path.join(root, "src/infra/model-memory-proactivity-runtime.ts"),
    import.meta.url,
  );
  const { buildCandidateReviewRecentEpisodeActivities, selectCandidateReviewEventActivities } =
    await tsImport(
      path.join(root, "src/infra/model-memory-proactivity-runtime.ts"),
      import.meta.url,
    );
  const {
    buildCandidateReviewPrefilterEvent,
    buildCandidateReviewTriggerPacket,
    buildProactivityReviewEpisodePacket,
    loadCodexSessionActivityForCandidateReview,
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

  const messages = await readOpenClawSessionMessages(sessionFile);
  const openClawActivities = transcriptMessagesToHighContextCandidateReviewActivities({
    messages,
    sessionKey,
  });
  const codex = await loadCodexSessionActivityForCandidateReview({
    codexHome,
    historyPath: codexHistoryPath,
    maxEntries: codexTurnWindow,
    maxFiles: 12,
    maxTailLines: 3500,
  });
  const heartbeatMode = hasFlag("--heartbeat");
  const heartbeatActivities = heartbeatMode
    ? [
        {
          ref: `gateway://heartbeat/local/${Date.now()}`,
          role: "system_event",
          kind: "result_summary",
          boundedText:
            "Local heartbeat-equivalent candidate review quality probe. Review the bounded current episode only.",
          sourceRuntime: "openclaw",
          recordedAt: new Date().toISOString(),
        },
      ]
    : [];
  const episodeAssembly = buildCandidateReviewRecentEpisodeActivities({
    openClawActivities,
    codexActivities: codex.activities,
    heartbeatActivities,
    openClawTurnWindow,
    codexTurnWindow,
    packetMaxChars: 160_000,
    heartbeatIsReviewTrigger: heartbeatMode,
  });
  const recentActivities = episodeAssembly.activities;
  if (recentActivities.length === 0) {
    throw new Error("no candidate-review activities were available");
  }
  const eventActivities = selectCandidateReviewEventActivities({
    recentActivities,
    heartbeatIsReviewTrigger: heartbeatMode,
  });
  const event = buildCandidateReviewPrefilterEvent({
    eventType: heartbeatMode ? "heartbeat_started" : "session_boundary",
    runtime: episodeAssembly.report.primaryRuntime,
    sessionKey,
    refs: eventActivities.map((activity) => activity.ref).slice(-12),
    boundedSummary: eventActivities
      .slice(-6)
      .map((activity) => activity.boundedText)
      .join("\n"),
  });
  const triggerPacket = buildCandidateReviewTriggerPacket({
    event,
    recentActivities,
    recentActivitySignals: ["local_high_context_candidate_review:no_gateway_rebuild"],
  });
  const episodePacket = buildProactivityReviewEpisodePacket({
    triggerPacket,
    triggerDecision: structuralTriggerDecision(event, eventActivities),
    recentActivities,
    codexAdapterReport: codex.report,
    activeMilestone: "pre-Milestone-4 contiguous candidate packet repair",
    activeDocsOrBranches: ["phase2-contiguous-candidate-packets-and-model-cards"],
  });
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
    schemaVersion: "local_high_context_candidate_review_proof.v1",
    generatedAt: new Date().toISOString(),
    sessionKey,
    sessionFile,
    codexHome,
    codexHistoryPath,
    packetArtifact,
    packetQuality: episodePacket.packetQuality,
    episodeAssemblyReport: episodeAssembly.report,
    openClawActivityCount: episodeAssembly.report.selectedCounts.openclaw,
    codexActivityCount: episodeAssembly.report.selectedCounts.codex,
    codexAdapterReport: codex.report,
    reviewReport: review.report,
    proposals: review.proposals,
    noGatewayRebuildRequired: true,
    promptPersisted: false,
    rawResponsePersisted: false,
    rawFullTranscriptPersisted: false,
    route: hasFlag("--no-model")
      ? { modelUsed: false }
      : { modelUsed: true, modelId, reasoningEffort, verbosity, timeoutMs, maxOutputTokens },
  };
  assertNoProhibitedContent(payload, "local high-context candidate review proof");
  const jsonPath = path.join(outputDir, "local-high-context-candidate-review.json");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const ok = review.report.validationStatus === "pass" && review.report.reasonCodes.length === 0;
  console.log(
    JSON.stringify(
      {
        ok,
        jsonPath,
        packetJsonPath: packetArtifact.jsonPath,
        packetMarkdownPath: packetArtifact.markdownPath,
        episodeAssembly: episodeAssembly.report,
        openClawActivityCount: episodeAssembly.report.selectedCounts.openclaw,
        codexActivityCount: episodeAssembly.report.selectedCounts.codex,
        proposalCount: review.proposals.length,
        surfacedProposalCount: review.proposals.filter((proposal) => proposal.shouldSurface).length,
        packetQuality: episodePacket.packetQuality,
        modelId: review.report.modelId ?? modelId,
        proposals: review.proposals.map((proposal) => ({
          kind: proposal.proposalKind,
          title: proposal.title,
          purpose: proposal.purpose,
          nextStep: proposal.recommendedNextStep,
          expectedUserValue: proposal.expectedUserValue,
          confidence: proposal.confidence,
          shouldSurface: proposal.shouldSurface,
          demotionReason: proposal.demotionReason ?? null,
          evidenceRefs: proposal.evidenceRefs,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
