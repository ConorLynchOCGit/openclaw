#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const OUTPUT_ROOT = ".artifacts/model-memory/phase2-mm-v2-lane-validation";
const QUALITY_OUTPUT_ROOT = ".artifacts/model-memory/phase2-mm-v2-quality-recall-audit";
const CORE_PROOF_SCRIPT =
  "scripts/model-memory-phase2-model-owned-memory-capture-retrieval-proof.mjs";
const MEMORY_MODEL_ID =
  process.env.MODEL_MEMORY_CODEX_CAPTURE_MODEL?.trim() ||
  process.env.MODEL_MEMORY_CAPTURE_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function boundedText(value, maxChars = 1200) {
  const text = String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, "[redacted-api-key]")
    .replace(/ghp_[A-Za-z0-9_]{12,}/gu, "[redacted-token]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{12,}/gu, "[redacted-token]")
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/gu, "[redacted-long-token]");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[bounded-truncated]` : text;
}

function readGitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function parseCoreProofStdout(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) {
    throw new Error("core proof did not print JSON summary");
  }
  return JSON.parse(stdout.slice(start));
}

function row(input) {
  return {
    lane: input.lane,
    status: input.status,
    sourceRefs: input.sourceRefs ?? [],
    sourceHashes: input.sourceHashes ?? [],
    packetWindowCount: input.packetWindowCount ?? 0,
    routeCount: input.routeCount ?? 0,
    routedCandidateCount: input.routedCandidateCount ?? 0,
    atomicCandidateCount: input.atomicCandidateCount ?? 0,
    compositeCandidateCount: input.compositeCandidateCount ?? 0,
    compositeComponentCount: input.compositeComponentCount ?? 0,
    admittedCompositeCandidateCount: input.admittedCompositeCandidateCount ?? 0,
    admittedCompositeComponentCount: input.admittedCompositeComponentCount ?? 0,
    canonicalCandidateCount: input.canonicalCandidateCount ?? 0,
    admissionCounts: input.admissionCounts ?? {
      admit: 0,
      reject: 0,
      quarantine: 0,
      embedOnly: 0,
    },
    ttlCount: input.ttlCount ?? 0,
    writeCount: input.writeCount ?? 0,
    pendingCount: input.pendingCount ?? 0,
    quarantineCount: input.quarantineCount ?? 0,
    modelRoutes: input.modelRoutes ?? [MEMORY_MODEL_ID],
    safetyFlags: {
      rawFullTranscriptPersisted: false,
      rawToolLogPersisted: false,
      hiddenReasoningPersisted: false,
      deterministicSemanticFallbackUsed: false,
      ...input.safetyFlags,
    },
    artifactPaths: input.artifactPaths ?? [],
    reason: input.reason,
  };
}

function admissionCountsFromDecisions(decisions = []) {
  const counts = { admit: 0, reject: 0, quarantine: 0, embedOnly: 0 };
  for (const decision of decisions) {
    if (decision.decision === "admit") {
      counts.admit += 1;
    } else if (decision.decision === "quarantine") {
      counts.quarantine += 1;
    } else if (decision.decision === "embed_only") {
      counts.embedOnly += 1;
    } else {
      counts.reject += 1;
    }
  }
  return counts;
}

function admittedCompositeCoverageFromRun(run) {
  const admittedIds = new Set(
    (run?.admissionDecisions ?? [])
      .filter((decision) => decision.decision === "admit")
      .map((decision) => decision.candidateId),
  );
  const admittedCanonicalKeys = new Set(
    (run?.canonicalCandidates ?? [])
      .filter((candidate) => admittedIds.has(candidate.candidateId))
      .map((candidate) => `${candidate.sourceSegmentId ?? ""}\n${candidate.evidenceQuote ?? ""}`),
  );
  let admittedCompositeCandidateCount = 0;
  let admittedCompositeComponentCount = 0;
  for (const candidate of run?.compositeCandidates ?? []) {
    const key = `${candidate.sourceSegmentId ?? ""}\n${candidate.evidenceQuote ?? ""}`;
    if (!admittedCanonicalKeys.has(key)) {
      continue;
    }
    admittedCompositeCandidateCount += 1;
    admittedCompositeComponentCount += candidate.componentCount ?? 0;
  }
  return { admittedCompositeCandidateCount, admittedCompositeComponentCount };
}

function buildRecallAuditRows(matrix, core, codexRunner, localCandidateReview) {
  const expectedByLane = new Map([
    ["openclaw_ordinary_turn_short_prompt", { raw: 1, bounded: 1 }],
    ["openclaw_long_prompt", { raw: 6, bounded: 6 }],
    ["document_ingestion_structured_doc", { raw: 1, bounded: 1 }],
    ["document_ingestion_large_structured_doc", { raw: 6, bounded: 6 }],
    ["assistant_tool_evidence", { raw: 1, bounded: 1 }],
    ["daily_summary_memory_file", { raw: 4, bounded: 4 }],
    ["retrieval_recall_plus_model_final_inclusion", { raw: 1, bounded: 1 }],
    ["local_model_reviewed_skill_and_proactivity_candidates", { raw: 3, bounded: 3 }],
  ]);
  const coreRuns = core.status === "passed" ? (core.artifact.runs ?? {}) : {};
  const selectedMemoryCount =
    coreRuns.retrievalFinalInclusion?.selectedMemoryObjectIds?.length ?? 0;
  return matrix.map((entry) => {
    const expected = expectedByLane.get(entry.lane);
    const topLevelModelOutputCount =
      entry.lane === "local_model_reviewed_skill_and_proactivity_candidates"
        ? (localCandidateReview.proposals?.length ?? 0)
        : entry.lane === "retrieval_recall_plus_model_final_inclusion"
          ? selectedMemoryCount
          : entry.canonicalCandidateCount || entry.atomicCandidateCount || entry.routeCount;
    const componentOutputCount = entry.compositeComponentCount ?? 0;
    const modelCoverageCount =
      componentOutputCount > 0
        ? (entry.atomicCandidateCount ?? 0) + componentOutputCount
        : topLevelModelOutputCount;
    const topLevelAdmittedOrSelected =
      entry.lane === "retrieval_recall_plus_model_final_inclusion"
        ? selectedMemoryCount
        : entry.writeCount;
    const allTopLevelOutputsAdmittedOrSelected =
      topLevelModelOutputCount > 0 && topLevelAdmittedOrSelected >= topLevelModelOutputCount;
    const admittedOrSelectedCoverageCount =
      componentOutputCount > 0
        ? Math.max(0, topLevelAdmittedOrSelected - (entry.admittedCompositeCandidateCount ?? 0)) +
          (entry.admittedCompositeComponentCount ?? 0)
        : allTopLevelOutputsAdmittedOrSelected
          ? modelCoverageCount
          : topLevelAdmittedOrSelected;
    const requiresSourcePacket =
      entry.lane !== "local_model_reviewed_skill_and_proactivity_candidates" &&
      entry.lane !== "retrieval_recall_plus_model_final_inclusion";
    const lossPoint =
      entry.status === "skipped"
        ? "skipped"
        : expected && requiresSourcePacket && entry.packetWindowCount === 0
          ? "packet_assembly"
          : expected && modelCoverageCount < expected.bounded
            ? "model_extraction_or_review"
            : expected &&
                admittedOrSelectedCoverageCount < Math.min(modelCoverageCount, expected.bounded)
              ? "admission_or_final_inclusion"
              : "none_observed";
    return {
      lane: entry.lane,
      status: entry.status,
      rawSourceCandidateEstimate: expected?.raw ?? null,
      boundedPacketCandidateEstimate: expected?.bounded ?? null,
      modelOutputCount: topLevelModelOutputCount,
      compositeComponentCount: componentOutputCount,
      modelCoverageCount,
      admittedOrSelectedCount: topLevelAdmittedOrSelected,
      admittedCompositeComponentCount: entry.admittedCompositeComponentCount ?? 0,
      admittedOrSelectedCoverageCount,
      quarantinedOrPendingCount: (entry.quarantineCount ?? 0) + (entry.pendingCount ?? 0),
      rejectedCount: entry.admissionCounts?.reject ?? 0,
      lossPoint,
      qualitativeNotes:
        entry.reason ??
        (lossPoint === "none_observed"
          ? "No source-to-packet-to-model-to-admission loss observed in this fixture."
          : "Review the lane artifact for the exact stage where expected candidates were lost."),
    };
  });
}

async function runCoreProof(root) {
  try {
    const child = spawnSync("node", [CORE_PROOF_SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 1024 * 1024 * 20,
    });
    if (child.error) {
      throw child.error;
    }
    if (child.status !== 0) {
      throw new Error(`core proof exited with status ${child.status ?? "unknown"}`);
    }
    const stdout = child.stdout ?? "";
    const summary = parseCoreProofStdout(stdout);
    const artifact = JSON.parse(await readFile(summary.jsonPath, "utf8"));
    return { status: "passed", summary, artifact };
  } catch (error) {
    return {
      status: "failed",
      reason: boundedText(error instanceof Error ? error.message : String(error), 2000),
    };
  }
}

async function runCodexRegularRunnerProof() {
  const [
    database,
    migrations,
    nativeRepository,
    runtimeRepository,
    codexCapture,
    liveExecutor,
    modelExecution,
  ] = await Promise.all([
    tsImport("../extensions/model-memory/src/db/pg-test.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/db/migrations.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/db/mmv2-native-repository.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/db/runtime-context-repository.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../extensions/model-memory/src/codex-session-memory-capture.ts", {
      parentURL: import.meta.url,
    }),
    tsImport("../src/agents/model-memory.live-json-executor.ts", { parentURL: import.meta.url }),
    tsImport("../extensions/model-memory/src/model-execution.ts", { parentURL: import.meta.url }),
  ]);
  const db = await database.createPgMemTestDatabase();
  try {
    await migrations.applyModelMemoryMigrations(db.sql);
    const canonicalRepository = new nativeRepository.MmV2NativeRepository(db.sql);
    const runtimeRepositoryInstance = new runtimeRepository.RuntimeContextRepository(db.sql);
    const traces = [];
    const executor = new liveExecutor.OpenAICompatibleLiveJsonExecutor({
      requestTimeoutMs: Number(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS ?? 120_000),
      onTrace(trace) {
        traces.push({
          contractName: trace.contractName,
          contractVersion: trace.contractVersion,
          requestedModelId: trace.requestedModelId,
          resolvedModelId: trace.resolvedModelId,
          provider: trace.provider,
          responseOk: trace.responseOk,
          failureClass: trace.failureClass,
          failureStage: trace.failureStage,
          errorMessage: trace.errorMessage ? boundedText(trace.errorMessage, 500) : undefined,
        });
      },
    });
    const interpreter = {
      async interpret(input) {
        const response = await executor.execute({
          contract: input.prompt.contract,
          systemPrompt: input.prompt.systemPrompt,
          userPrompt: input.prompt.userPrompt,
          responseFormat: input.prompt.responseFormat,
          responseOptions: input.prompt.responseOptions,
        });
        const parsed = modelExecution.parseJsonModelOutput(
          response,
          input.prompt.contract,
          z.unknown(),
        );
        return {
          action: "capture",
          objects: Array.isArray(parsed) ? parsed : [parsed],
        };
      },
    };
    const report = await codexCapture.runCodexSessionMemoryCapture({
      canonicalRepository,
      runtimeRepository: runtimeRepositoryInstance,
      interpreter,
      enabled: true,
      cooldownMs: 0,
      maxPerRun: Number(process.env.MODEL_MEMORY_CODEX_CAPTURE_PROOF_MAX_PER_RUN ?? 3),
      maxActivities: Number(process.env.MODEL_MEMORY_CODEX_CAPTURE_PROOF_MAX_ACTIVITIES ?? 24),
      maxWordsPerWindow: Number(
        process.env.MODEL_MEMORY_CODEX_CAPTURE_PROOF_MAX_WORDS_PER_WINDOW ?? 500,
      ),
      modelId: MEMORY_MODEL_ID,
      projectId: "model-memory",
      env: process.env,
      rebuildRuntime: false,
    });
    return { report, traces };
  } finally {
    await db.close();
  }
}

async function runLocalCandidateReviewProof() {
  const [candidateDiscovery, modelAuthoredBriefs, userFacingBriefs, liveExecutor] =
    await Promise.all([
      tsImport(
        "../extensions/model-memory/src/runtime/phase2-model-reviewed-candidate-discovery.ts",
        {
          parentURL: import.meta.url,
        },
      ),
      tsImport(
        "../extensions/model-memory/src/runtime/phase2-model-authored-proactivity-briefs.ts",
        {
          parentURL: import.meta.url,
        },
      ),
      tsImport("../extensions/model-memory/src/runtime/phase2-user-facing-proactivity-briefs.ts", {
        parentURL: import.meta.url,
      }),
      tsImport("../src/agents/model-memory.live-json-executor.ts", { parentURL: import.meta.url }),
    ]);
  const traces = [];
  const executor = new liveExecutor.OpenAICompatibleLiveJsonExecutor({
    requestTimeoutMs: Number(
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_TIMEOUT_MS ?? 180_000,
    ),
    onTrace(trace) {
      traces.push({
        contractName: trace.contractName,
        contractVersion: trace.contractVersion,
        requestedModelId: trace.requestedModelId,
        resolvedModelId: trace.resolvedModelId,
        provider: trace.provider,
        responseOk: trace.responseOk,
        failureClass: trace.failureClass,
        failureStage: trace.failureStage,
        errorMessage: trace.errorMessage ? boundedText(trace.errorMessage, 500) : undefined,
      });
    },
  });
  const recentActivities = [
    {
      ref: "openclaw://proof/user/deterministic-funnel",
      role: "user",
      kind: "correction",
      sourceRuntime: "openclaw",
      boundedText:
        "We keep shifting judgment into deterministic packet selection, filters, and rendering. Candidate discovery should use large contiguous work episodes and model judgment, not selected interesting snippets.",
    },
    {
      ref: "openclaw://proof/assistant/contiguous-packets",
      role: "assistant",
      kind: "final",
      sourceRuntime: "openclaw",
      boundedText:
        "Implemented contiguous high-context candidate packets, separated memory capture from skill/proactivity review, and preserved Codex activity as first-class evidence.",
    },
    {
      ref: "openclaw://proof/user/model-cards",
      role: "user",
      kind: "ask",
      sourceRuntime: "openclaw",
      boundedText:
        "All visible proactivity and skill cards should use model-authored user-facing text. Deterministic fallback card text has been malformed or useless and should demote instead of surface.",
    },
    {
      ref: "codex://proof/tool/model-memory-push",
      role: "tool_summary",
      kind: "failure_summary",
      sourceRuntime: "codex",
      boundedText:
        "Command pnpm test:model-memory:push previously failed after deterministic logic removal because model-owned MMV2 fixtures and capture routing handlers were incomplete; the lane later passed after model-owned replacements were added.",
    },
    {
      ref: "codex://proof/assistant/mmv2-live-proof",
      role: "assistant",
      kind: "final",
      sourceRuntime: "codex",
      boundedText:
        "Codex long-prompt ingestion now uses document-style windows, routing evidence anchoring, composite multi-segment evidence repair, model-owned admission, and no deterministic semantic fallback.",
    },
    {
      ref: "openclaw://proof/user/validate-lanes",
      role: "user",
      kind: "ask",
      sourceRuntime: "openclaw",
      boundedText:
        "Validate OpenClaw ordinary turns, long prompts, document ingestion, daily summary files, correction/reconciliation, collision adjudication, retrieval final inclusion, and proactivity/card compatibility before live gateway wiring.",
    },
    {
      ref: "openclaw://proof/assistant/proof-matrix",
      role: "assistant",
      kind: "final",
      sourceRuntime: "openclaw",
      boundedText:
        "The proof matrix should report stage counts for source windows, routing, extraction, canonicalization, admission, TTL, reconciliation, collision, retrieval selection, writes, pending, quarantine, routes, and safety flags.",
    },
    {
      ref: "openclaw://proof/user/skill-enhancement",
      role: "user",
      kind: "ask",
      sourceRuntime: "openclaw",
      boundedText:
        "If the candidate is mainly improving an existing model-memory validation workflow, it should surface as an existing skill enhancement rather than a vague new review skill.",
    },
    {
      ref: "openclaw://proof/assistant/weak-cleanup",
      role: "assistant",
      kind: "final",
      sourceRuntime: "openclaw",
      boundedText:
        "A tiny cleanup item renamed a local proof variable and should not surface as a skill or proactive plan.",
    },
  ];
  const event = candidateDiscovery.buildCandidateReviewPrefilterEvent({
    eventType: "heartbeat_started",
    runtime: "openclaw",
    sessionKey: "local-candidate-review-proof",
    refs: recentActivities.map((activity) => activity.ref),
    boundedSummary:
      "Review model-owned memory capture and proactivity repair work for high-impact skill/proactive-plan candidates before gateway wiring.",
    createdAt: new Date().toISOString(),
  });
  const triggerPacket = candidateDiscovery.buildCandidateReviewTriggerPacket({
    event,
    recentActivities,
    recentCardSummaries: [
      {
        id: "card-deterministic-rendering",
        kind: "proactive_plan",
        title: "Deterministic card rendering demoted",
        status: "blocked_until_model_authored",
        quality: "deterministic_fallback_rejected",
      },
    ],
    recentActivitySignals: [
      "Repeated deterministic judgment debt across packet selection, admission, retrieval inclusion, and card rendering",
      "Long-prompt/document ingestion required document-style windows and evidence anchoring",
      "Local proof lanes need qualitative candidate and card assessment before gateway wiring",
    ],
  });
  const triggerDecision = {
    schemaVersion: "candidate_review_trigger_decision.v1",
    shouldRun: true,
    reasonCodes: ["explicit_user_ask", "heartbeat_review", "validation_or_proof_friction"],
    confidence: "high",
    episodeWindow: {
      startRef: recentActivities[0].ref,
      endRef: recentActivities.at(-1).ref,
      includedRefs: recentActivities.map((activity) => activity.ref),
    },
    reviewGoal: "both",
    why: "The episode contains repeated proof friction and cross-lane architecture changes that could justify a proactive plan or reusable skill candidate.",
  };
  const episodePacket = candidateDiscovery.buildProactivityReviewEpisodePacket({
    triggerPacket,
    triggerDecision,
    recentActivities,
    codexAdapterReport: {
      status: "loaded",
      entryCount: recentActivities.filter((activity) => activity.sourceRuntime === "codex").length,
      sessionRefs: ["codex://proof/session/local"],
      commandSummaryCount: 1,
      validationFailureCount: 1,
      genericCommandSummaryCount: 0,
    },
    loadedSkills: [
      {
        name: "model-memory-deep-ingest",
        description:
          "Resume, seed, monitor, pause, or diagnose OpenClaw MMV2 deep document ingestion.",
        source: "codex-skill",
      },
      {
        name: "candidate-discovery-qa",
        description:
          "Review candidate discovery packets, proposal quality, and model-authored card readiness before surfacing.",
        source: "openclaw-skill-candidate",
      },
    ],
    recentProactivityItems: [],
    activeMilestone: "pre-Milestone-4 model-owned memory capture/retrieval validation",
    activeDocsOrBranches: ["phase2-prune-remaining-runtime-and-test-judgment-debt"],
    recentCandidateIds: [],
    possibleDuplicateTitles: [],
    rejectedOrDemotedSummary: ["Deterministic visible card text is rejected/demoted."],
  });
  const review = await candidateDiscovery.reviewEpisodeForCandidates(episodePacket, {
    enabled: true,
    executor,
    modelId:
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL?.trim() || "openai-codex/gpt-5.4",
    reasoningEffort: "high",
    maxOutputTokens: Number(
      process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MAX_OUTPUT_TOKENS ?? 3_200,
    ),
  });
  const surfacedProposals = review.proposals
    .filter((proposal) => proposal.shouldSurface)
    .slice(0, 3);
  const briefResults = [];
  for (const proposal of surfacedProposals) {
    const skillCandidate =
      proposal.proposalKind === "proactive_plan"
        ? undefined
        : {
            skillCandidateId: proposal.proposalId,
            proactivityOpportunityId: proposal.proposalId,
            normalizedIntentKey: proposal.suggestedSkillName ?? proposal.title,
            sourceRuntime:
              proposal.sourceRuntime === "codex" ? "codex_session" : "openclaw_session",
            candidateType: proposal.candidateType ?? proposal.proposalKind,
            evidenceSummary: proposal.expectedUserValue,
            recurrenceCount: proposal.recurrenceSignals.length || 1,
            recurrenceWindow: {
              firstSeenAt: new Date(0).toISOString(),
              lastSeenAt: new Date().toISOString(),
            },
            exampleHashes: proposal.evidenceHashes,
            suggestedSkillName: proposal.suggestedSkillName,
            suggestedExistingSkillName: proposal.suggestedExistingSkillName,
            riskTier: proposal.riskTier,
            autonomyLevelCeiling: 1,
            lifecycleStatus: "detected",
            installTargets: ["workspace_skills_dir"],
            evalStatus: "not_started",
            vettingStatus: "not_started",
            canaryStatus: "not_started",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            provenanceRefs: proposal.evidenceRefs,
            rollbackPlan: {
              rollbackId: `rollback-${proposal.proposalId}`,
              strategy: "disable_candidate_only",
              targetPaths: ["workspace_skills_dir"],
              directMainMutationAllowed: false,
            },
            sourceProfileIds: [],
            authorityTiers: [],
            contentHashes: proposal.evidenceHashes,
            proofHashes: proposal.evidenceHashes,
            noDarkDataStatus: "pass",
          };
    const briefInput = {
      opportunityClass:
        proposal.proposalKind === "proactive_plan" ? "proactive_plan" : "skill_candidate",
      title: proposal.title,
      whyNow: proposal.whyHighImpact,
      proposedNextStep: proposal.recommendedNextStep,
      expectedUserValue: proposal.expectedUserValue,
      evidenceSummary: proposal.evidenceRefs.join(", "),
      confidence: proposal.confidence,
      sourceRefs: proposal.evidenceRefs,
      skillCandidate,
      existingSkills: [
        { name: "model-memory-deep-ingest", source: "codex-skill" },
        { name: "candidate-discovery-qa", source: "openclaw-skill-candidate" },
      ],
    };
    const deterministicBrief = userFacingBriefs.buildUserFacingProactivityBrief(briefInput);
    const modelBrief = await modelAuthoredBriefs.buildModelAuthoredUserFacingProactivityBrief(
      {
        briefInput,
        deterministicBrief,
        opportunityId: proposal.proposalId,
      },
      {
        enabled: true,
        executor,
        modelId:
          process.env.MODEL_MEMORY_PHASE2_PRESENTATION_BRIEF_MODEL?.trim() ||
          "openai-codex/gpt-5.4",
        reasoningEffort: "medium",
        maxOutputTokens: Number(
          process.env.MODEL_MEMORY_PHASE2_PRESENTATION_BRIEF_MAX_OUTPUT_TOKENS ?? 900,
        ),
      },
    );
    briefResults.push({
      proposalId: proposal.proposalId,
      proposalKind: proposal.proposalKind,
      source: modelBrief.source,
      qualityStatus: modelBrief.brief.quality.status,
      qualityReasons: modelBrief.brief.quality.reasons,
      authorshipSource: modelBrief.brief.authorship?.source,
      title: modelBrief.brief.title,
      oneLinePurpose: modelBrief.brief.oneLinePurpose,
      recommendedNextStep: modelBrief.brief.recommendedNextStep,
      primaryActionLabel: modelBrief.brief.primaryActionLabel,
      report: {
        decision: modelBrief.report.decision,
        modelId: modelBrief.report.modelId,
        resolvedModelId: modelBrief.report.resolvedModelId,
        validationStatus: modelBrief.report.validationStatus,
        reasonCodes: modelBrief.report.reasonCodes,
        promptPersisted: modelBrief.report.promptPersisted,
        rawResponsePersisted: modelBrief.report.rawResponsePersisted,
        promptChars: modelBrief.report.promptChars,
        outputChars: modelBrief.report.outputChars,
      },
    });
  }
  const hasProactivePlan = review.proposals.some(
    (proposal) => proposal.proposalKind === "proactive_plan" && proposal.shouldSurface,
  );
  const hasSkillCandidate = review.proposals.some(
    (proposal) =>
      ["new_skill_candidate", "existing_skill_enhancement", "merge_or_extend_candidate"].includes(
        proposal.proposalKind,
      ) && proposal.shouldSurface,
  );
  const formattingOk = review.proposals.every(
    (proposal) =>
      proposal.title.trim().includes(" ") &&
      proposal.purpose.trim().length > 20 &&
      proposal.recommendedNextStep.trim().length > 20 &&
      proposal.title === proposal.title.trim(),
  );
  const briefFormattingOk =
    briefResults.length > 0 &&
    briefResults.every(
      (entry) =>
        entry.source === "model" &&
        entry.authorshipSource === "model" &&
        entry.qualityStatus === "pass" &&
        entry.title.trim().includes(" ") &&
        entry.oneLinePurpose.trim().length > 20 &&
        entry.recommendedNextStep.trim().length > 20,
    );
  return {
    status:
      review.report.validationStatus === "pass" &&
      hasProactivePlan &&
      hasSkillCandidate &&
      formattingOk &&
      briefFormattingOk
        ? "passed"
        : "degraded",
    reason:
      review.report.validationStatus === "pass"
        ? !hasProactivePlan
          ? "candidate review did not surface a proactive plan"
          : !hasSkillCandidate
            ? "candidate review did not surface a skill candidate or enhancement"
            : !formattingOk
              ? "candidate review surfaced malformed presentation fields"
              : !briefFormattingOk
                ? "model-authored card brief formatting did not pass for surfaced proposals"
                : undefined
        : review.report.reasonCodes.join(","),
    episodePacketHash: review.report.episodePacketHash,
    packetQuality: episodePacket.packetQuality,
    proposalKinds: review.proposals.map((proposal) => proposal.proposalKind),
    proposals: review.proposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      proposalKind: proposal.proposalKind,
      title: proposal.title,
      purpose: proposal.purpose,
      recommendedNextStep: proposal.recommendedNextStep,
      shouldSurface: proposal.shouldSurface,
      confidence: proposal.confidence,
      riskTier: proposal.riskTier,
      evidenceRefs: proposal.evidenceRefs,
      expectedUserValue: proposal.expectedUserValue,
      whyHighImpact: proposal.whyHighImpact,
      whyNotSmallCleanup: proposal.whyNotSmallCleanup,
    })),
    modelAuthoredBriefs: briefResults,
    report: review.report,
    traces,
  };
}

function rowsFromCoreProof(core, coreJsonPath) {
  if (core.status !== "passed") {
    return [
      row({
        lane: "core_model_owned_capture_retrieval",
        status: "failed",
        reason: core.reason,
      }),
    ];
  }
  const runs = core.artifact.runs ?? {};
  return [
    row({
      lane: "openclaw_ordinary_turn_short_prompt",
      status: runs.openClawUserTurn?.admittedCandidateIds?.length > 0 ? "passed" : "failed",
      sourceRefs: [runs.openClawUserTurn?.sourceId].filter(Boolean),
      sourceHashes: [runs.openClawUserTurn?.sourcePacket?.firstWindowHash].filter(Boolean),
      packetWindowCount: runs.openClawUserTurn?.sourcePacket?.windowCount ?? 0,
      routeCount: runs.openClawUserTurn?.routingDecisionCount ?? 0,
      routedCandidateCount: runs.openClawUserTurn?.routedCandidateCount ?? 0,
      atomicCandidateCount: runs.openClawUserTurn?.atomicCandidateCount ?? 0,
      compositeCandidateCount: runs.openClawUserTurn?.compositeCandidateCount ?? 0,
      compositeComponentCount: runs.openClawUserTurn?.compositeComponentCount ?? 0,
      ...admittedCompositeCoverageFromRun(runs.openClawUserTurn),
      canonicalCandidateCount: runs.openClawUserTurn?.canonicalCandidateCount ?? 0,
      admissionCounts: admissionCountsFromDecisions(runs.openClawUserTurn?.admissionDecisions),
      writeCount: runs.openClawUserTurn?.admittedCandidateIds?.length ?? 0,
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "openclaw_long_prompt",
      status: runs.openClawLongPrompt?.admittedCandidateIds?.length > 0 ? "passed" : "failed",
      sourceRefs: [runs.openClawLongPrompt?.sourceId].filter(Boolean),
      sourceHashes: [runs.openClawLongPrompt?.sourcePacket?.firstWindowHash].filter(Boolean),
      packetWindowCount: runs.openClawLongPrompt?.sourcePacket?.windowCount ?? 0,
      routeCount: runs.openClawLongPrompt?.routingDecisionCount ?? 0,
      routedCandidateCount: runs.openClawLongPrompt?.routedCandidateCount ?? 0,
      atomicCandidateCount: runs.openClawLongPrompt?.atomicCandidateCount ?? 0,
      compositeCandidateCount: runs.openClawLongPrompt?.compositeCandidateCount ?? 0,
      compositeComponentCount: runs.openClawLongPrompt?.compositeComponentCount ?? 0,
      ...admittedCompositeCoverageFromRun(runs.openClawLongPrompt),
      canonicalCandidateCount: runs.openClawLongPrompt?.canonicalCandidateCount ?? 0,
      admissionCounts: admissionCountsFromDecisions(runs.openClawLongPrompt?.admissionDecisions),
      writeCount: runs.openClawLongPrompt?.admittedCandidateIds?.length ?? 0,
      reason:
        runs.openClawLongPrompt?.admittedCandidateIds?.length > 0
          ? undefined
          : "long OpenClaw prompt did not produce admitted model-owned candidates",
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "document_ingestion_structured_doc",
      status: runs.document?.admittedCandidateIds?.length > 0 ? "passed" : "failed",
      sourceRefs: [runs.document?.sourceId].filter(Boolean),
      sourceHashes: [runs.document?.sourcePacket?.firstWindowHash].filter(Boolean),
      packetWindowCount: runs.document?.sourcePacket?.windowCount ?? 0,
      routeCount: runs.document?.routingDecisionCount ?? 0,
      routedCandidateCount: runs.document?.routedCandidateCount ?? 0,
      atomicCandidateCount: runs.document?.atomicCandidateCount ?? 0,
      compositeCandidateCount: runs.document?.compositeCandidateCount ?? 0,
      compositeComponentCount: runs.document?.compositeComponentCount ?? 0,
      ...admittedCompositeCoverageFromRun(runs.document),
      canonicalCandidateCount: runs.document?.canonicalCandidateCount ?? 0,
      admissionCounts: admissionCountsFromDecisions(runs.document?.admissionDecisions),
      writeCount: runs.document?.admittedCandidateIds?.length ?? 0,
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "document_ingestion_large_structured_doc",
      status: runs.largeStructuredDocument?.admittedCandidateIds?.length > 0 ? "passed" : "failed",
      sourceRefs: [runs.largeStructuredDocument?.sourceId].filter(Boolean),
      sourceHashes: [runs.largeStructuredDocument?.sourcePacket?.firstWindowHash].filter(Boolean),
      packetWindowCount: runs.largeStructuredDocument?.sourcePacket?.windowCount ?? 0,
      routeCount: runs.largeStructuredDocument?.routingDecisionCount ?? 0,
      routedCandidateCount: runs.largeStructuredDocument?.routedCandidateCount ?? 0,
      atomicCandidateCount: runs.largeStructuredDocument?.atomicCandidateCount ?? 0,
      compositeCandidateCount: runs.largeStructuredDocument?.compositeCandidateCount ?? 0,
      compositeComponentCount: runs.largeStructuredDocument?.compositeComponentCount ?? 0,
      ...admittedCompositeCoverageFromRun(runs.largeStructuredDocument),
      canonicalCandidateCount: runs.largeStructuredDocument?.canonicalCandidateCount ?? 0,
      admissionCounts: admissionCountsFromDecisions(
        runs.largeStructuredDocument?.admissionDecisions,
      ),
      writeCount: runs.largeStructuredDocument?.admittedCandidateIds?.length ?? 0,
      reason:
        runs.largeStructuredDocument?.admittedCandidateIds?.length > 0
          ? undefined
          : "large structured document did not produce admitted model-owned candidates",
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "assistant_tool_evidence",
      status: (runs.codexSessionActivities?.length ?? 0) > 0 ? "passed" : "degraded",
      sourceRefs: (runs.codexSessionActivities ?? [])
        .map((entry) => entry.activityRef)
        .filter(Boolean),
      sourceHashes: (runs.codexSessionActivities ?? [])
        .map((entry) => entry.sourceHash)
        .filter(Boolean),
      packetWindowCount: (runs.codexSessionActivities ?? []).reduce(
        (sum, entry) => sum + (entry.capture?.sourcePacket?.windowCount ?? 0),
        0,
      ),
      routeCount: (runs.codexSessionActivities ?? []).reduce(
        (sum, entry) => sum + (entry.capture?.routingDecisionCount ?? 0),
        0,
      ),
      writeCount: (runs.codexSessionActivities ?? []).reduce(
        (sum, entry) => sum + (entry.capture?.admittedCandidateIds?.length ?? 0),
        0,
      ),
      artifactPaths: [coreJsonPath],
      reason:
        (runs.codexSessionActivities?.length ?? 0) > 0
          ? undefined
          : "Codex session activity unavailable or not exercised by core proof",
    }),
    row({
      lane: "daily_summary_memory_file",
      status: runs.dailySummaryMemoryFile?.admittedCandidateIds?.length > 0 ? "passed" : "failed",
      sourceRefs: [runs.dailySummaryMemoryFile?.sourceId].filter(Boolean),
      sourceHashes: [runs.dailySummaryMemoryFile?.sourcePacket?.firstWindowHash].filter(Boolean),
      packetWindowCount: runs.dailySummaryMemoryFile?.sourcePacket?.windowCount ?? 0,
      routeCount: runs.dailySummaryMemoryFile?.routingDecisionCount ?? 0,
      routedCandidateCount: runs.dailySummaryMemoryFile?.routedCandidateCount ?? 0,
      atomicCandidateCount: runs.dailySummaryMemoryFile?.atomicCandidateCount ?? 0,
      compositeCandidateCount: runs.dailySummaryMemoryFile?.compositeCandidateCount ?? 0,
      compositeComponentCount: runs.dailySummaryMemoryFile?.compositeComponentCount ?? 0,
      ...admittedCompositeCoverageFromRun(runs.dailySummaryMemoryFile),
      canonicalCandidateCount: runs.dailySummaryMemoryFile?.canonicalCandidateCount ?? 0,
      admissionCounts: admissionCountsFromDecisions(
        runs.dailySummaryMemoryFile?.admissionDecisions,
      ),
      writeCount: runs.dailySummaryMemoryFile?.admittedCandidateIds?.length ?? 0,
      reason:
        runs.dailySummaryMemoryFile?.admittedCandidateIds?.length > 0
          ? undefined
          : "daily summary memory file fixture did not produce admitted model-owned candidates",
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "correction_reconciliation",
      status: runs.openClawUserTurn?.reconciliation ? "passed" : "degraded",
      routeCount: runs.openClawUserTurn?.reconciliation?.length ?? 0,
      reason:
        runs.openClawUserTurn?.reconciliation?.length > 0
          ? undefined
          : "no reconciliation-required candidate in this live proof stimulus",
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "collision_adjudication",
      status: runs.collisionAdjudication?.decision ? "passed" : "failed",
      routeCount: runs.collisionAdjudication?.candidateCount ?? 0,
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "retrieval_recall_plus_model_final_inclusion",
      status:
        runs.retrievalFinalInclusion?.selectedMemoryObjectIds?.length > 0 ? "passed" : "failed",
      routeCount: runs.retrievalFinalInclusion?.recalledCandidateIds?.length ?? 0,
      writeCount: runs.retrievalFinalInclusion?.selectedMemoryObjectIds?.length ?? 0,
      sourceRefs: runs.retrievalFinalInclusion?.selectedMemoryObjectIds ?? [],
      artifactPaths: [coreJsonPath],
    }),
    row({
      lane: "proactivity_card_compatibility",
      status: "skipped",
      reason:
        "gateway/UI live proof intentionally deferred; this proof confirms memory routes and preserves non-action runtime flags only",
      artifactPaths: [coreJsonPath],
    }),
  ];
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, OUTPUT_ROOT, stamp);
  const qualityOutputDir = path.join(root, QUALITY_OUTPUT_ROOT, stamp);
  await mkdir(outputDir, { recursive: true });
  await mkdir(qualityOutputDir, { recursive: true });

  const core = await runCoreProof(root);
  const coreJsonPath = core.status === "passed" ? core.summary.jsonPath : undefined;
  const codexRunner = await runCodexRegularRunnerProof().catch((error) => ({
    report: {
      status: "degraded",
      reason: boundedText(error instanceof Error ? error.message : String(error), 1200),
      activityCounts: {},
      writeCounts: {},
      idempotency: { capturedRefs: [], capturedHashes: [], skippedRefs: [], skippedHashes: [] },
      captures: [],
      safety: {
        rawFullTranscriptPersisted: false,
        rawToolLogPersisted: false,
        codexTranscriptExecutedAsInstruction: false,
        deterministicSemanticFallbackUsed: false,
      },
    },
    traces: [],
  }));
  const localCandidateReview = await runLocalCandidateReviewProof().catch((error) => ({
    status: "degraded",
    reason: boundedText(error instanceof Error ? error.message : String(error), 1200),
    packetQuality: { status: "degraded", reasonCodes: ["candidate_review_proof_error"] },
    proposalKinds: [],
    proposals: [],
    report: {
      validationStatus: "reject",
      reasonCodes: ["candidate_review_proof_error"],
    },
    traces: [],
  }));
  const matrix = [
    ...rowsFromCoreProof(core, coreJsonPath).filter(Boolean),
    row({
      lane: "codex_session_capture_regular_runner",
      status:
        codexRunner.report.status === "loaded"
          ? "passed"
          : codexRunner.report.status === "disabled"
            ? "failed"
            : "degraded",
      sourceRefs: codexRunner.report.idempotency?.capturedRefs ?? [],
      sourceHashes: codexRunner.report.idempotency?.capturedHashes ?? [],
      packetWindowCount: codexRunner.report.captures?.reduce(
        (sum, capture) => sum + (capture.windowCount ?? 0),
        0,
      ),
      routeCount: codexRunner.report.activityCounts?.attempted ?? 0,
      writeCount:
        (codexRunner.report.writeCounts?.write ?? 0) +
        (codexRunner.report.writeCounts?.supersede ?? 0),
      quarantineCount: codexRunner.report.writeCounts?.quarantine ?? 0,
      safetyFlags: {
        rawFullTranscriptPersisted: codexRunner.report.safety?.rawFullTranscriptPersisted ?? false,
        rawToolLogPersisted: codexRunner.report.safety?.rawToolLogPersisted ?? false,
        deterministicSemanticFallbackUsed:
          codexRunner.report.safety?.deterministicSemanticFallbackUsed ?? false,
      },
      reason: codexRunner.report.reason,
    }),
    row({
      lane: "local_model_reviewed_skill_and_proactivity_candidates",
      status: localCandidateReview.status,
      routeCount: 1,
      routedCandidateCount: localCandidateReview.proposals?.length ?? 0,
      canonicalCandidateCount: localCandidateReview.proposals?.length ?? 0,
      writeCount: 0,
      modelRoutes: [
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL?.trim() || "openai-codex/gpt-5.4",
      ],
      reason: localCandidateReview.reason,
    }),
    row({
      lane: "local_model_authored_card_briefs",
      status:
        localCandidateReview.modelAuthoredBriefs?.length > 0 &&
        localCandidateReview.modelAuthoredBriefs.every(
          (entry) =>
            entry.source === "model" &&
            entry.authorshipSource === "model" &&
            entry.qualityStatus === "pass",
        )
          ? "passed"
          : "degraded",
      routeCount: localCandidateReview.modelAuthoredBriefs?.length ?? 0,
      canonicalCandidateCount:
        localCandidateReview.modelAuthoredBriefs?.filter((entry) => entry.qualityStatus === "pass")
          .length ?? 0,
      modelRoutes: [
        process.env.MODEL_MEMORY_PHASE2_PRESENTATION_BRIEF_MODEL?.trim() || "openai-codex/gpt-5.4",
      ],
      reason:
        localCandidateReview.modelAuthoredBriefs?.length > 0
          ? localCandidateReview.modelAuthoredBriefs
              .filter((entry) => entry.source !== "model" || entry.qualityStatus !== "pass")
              .map(
                (entry) => `${entry.proposalId}:${entry.qualityReasons.join(",") || entry.source}`,
              )
              .join("; ") || undefined
          : "no model-authored brief results",
    }),
  ];
  const qualitativeRecallAudit = {
    schemaVersion: "phase2_mm_v2_quality_recall_audit.v1",
    generatedAt: new Date().toISOString(),
    note: "Fixture-level qualitative recall audit. Candidate estimates are proof-fixture expectations used to locate packet, model, admission, reconciliation, write, or final-inclusion losses; they are not runtime deterministic judgment.",
    rows: buildRecallAuditRows(matrix, core, codexRunner, localCandidateReview),
    safety: {
      rawFullTranscriptPersisted: false,
      rawPromptPersisted: false,
      rawToolLogPersisted: false,
      rawProviderLogPersisted: false,
      hiddenReasoningPersisted: false,
      deterministicSemanticFallbackUsed: false,
    },
  };
  const artifact = {
    schemaVersion: "phase2_mm_v2_lane_validation_proof.v1",
    generatedAt: new Date().toISOString(),
    commitHash: readGitHead(root),
    modelRoutes: {
      memoryCaptureRetrieval: MEMORY_MODEL_ID,
      skillsProactivityCandidateReview:
        process.env.MODEL_MEMORY_PHASE2_CANDIDATE_REVIEW_MODEL?.trim() || "openai-codex/gpt-5.4",
    },
    coreProof:
      core.status === "passed"
        ? {
            status: "passed",
            jsonPath: core.summary.jsonPath,
            summary: core.summary.summary,
          }
        : core,
    codexRegularRunner: {
      report: codexRunner.report,
      traces: codexRunner.traces,
    },
    localCandidateReview,
    qualitativeRecallAudit,
    matrix,
    safety: {
      rawFullTranscriptPersisted: false,
      rawPromptPersisted: false,
      rawToolLogPersisted: false,
      rawProviderLogPersisted: false,
      hiddenReasoningPersisted: false,
      actionExecution: false,
      outboundSending: false,
      skillInstallOrPromotion: false,
      deterministicSemanticFallbackUsed: false,
    },
  };
  const jsonPath = path.join(outputDir, "mmv2-lane-validation-proof.json");
  const markdownPath = path.join(outputDir, "summary.md");
  const qualityJsonPath = path.join(qualityOutputDir, "quality-recall-audit.json");
  const qualityMarkdownPath = path.join(qualityOutputDir, "summary.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(qualityJsonPath, `${JSON.stringify(qualitativeRecallAudit, null, 2)}\n`, "utf8");
  await writeFile(
    qualityMarkdownPath,
    [
      "# MMV2 Quality Recall Audit",
      "",
      `- Generated at: ${qualitativeRecallAudit.generatedAt}`,
      "- Raw source and bounded packet estimates are fixture expectations, not runtime authority.",
      "",
      "| Lane | Status | Raw est. | Packet est. | Top-level model output | Composite components | Coverage output | Admitted composite components | Admitted/selected coverage | Loss point |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      ...qualitativeRecallAudit.rows.map(
        (entry) =>
          `| ${entry.lane} | ${entry.status} | ${entry.rawSourceCandidateEstimate ?? ""} | ${entry.boundedPacketCandidateEstimate ?? ""} | ${entry.modelOutputCount} | ${entry.compositeComponentCount} | ${entry.modelCoverageCount} | ${entry.admittedCompositeComponentCount} | ${entry.admittedOrSelectedCoverageCount} | ${entry.lossPoint} |`,
      ),
      "",
      `JSON artifact: ${qualityJsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    markdownPath,
    [
      "# MMV2 Lane Validation Proof",
      "",
      `- Generated at: ${artifact.generatedAt}`,
      `- Commit: ${artifact.commitHash}`,
      `- Memory model route: ${artifact.modelRoutes.memoryCaptureRetrieval}`,
      `- Core proof status: ${artifact.coreProof.status}`,
      `- Codex runner status: ${codexRunner.report.status}`,
      `- Local candidate review status: ${localCandidateReview.status}`,
      "",
      "## Matrix",
      "",
      "| Lane | Status | Writes | Reason |",
      "| --- | --- | ---: | --- |",
      ...matrix.map(
        (entry) =>
          `| ${entry.lane} | ${entry.status} | ${entry.writeCount} | ${entry.reason ?? ""} |`,
      ),
      "",
      `JSON artifact: ${jsonPath}`,
      `Quality recall artifact: ${qualityJsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(
    JSON.stringify(
      { ok: true, jsonPath, markdownPath, qualityJsonPath, qualityMarkdownPath, matrix },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
