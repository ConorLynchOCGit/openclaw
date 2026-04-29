#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TAILNET_ORIGIN, OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const DEFAULT_SESSION_KEY = "agent:main:main";
const PROMPT_TEMPLATES = [
  "Review the current OpenClaw model-route and candidate-discovery architecture. The recurring work is proving that default chat, memory capture/retrieval, proactivity brief generation, high-context candidate review, and the OpenAI-Codex pipe each use their intended model route, schema, reasoning setting, and persistence boundary. Identify one high-impact proactive follow-up and one reusable skill or existing-skill enhancement that would save substantial future verification work before Milestone 4.",
  "Critique the recurring failure mode we have been working through: cleaned-up proactive cards can look readable while still hiding whether they were organic, proof-seeded, stale, deterministically generated, or model-reviewed. Focus on what reusable OpenClaw/Codex verification workflow or proactive plan would prevent this class of confusion from recurring.",
  "Given the last two answers and the current repo state, classify the strongest route/provenance opportunity as a proactive plan, a new skill, an existing skill enhancement, a merge candidate, or a demotion. Prefer no candidate over weak candidates, but include both a proactive-plan item and a reusable skill/enhancement item if the evidence supports both.",
];

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
  "sk-",
];

const BAD_PRIMARY_SNIPPETS = [
  "Turns a recent idea into a bounded next step",
  "without digging through the inbox",
  "Question worth asking before",
  "Skill worth creating",
  "Turn Turn",
  "Already recurring",
  "Build the bounded request with",
  "It sets the default",
  "chat://",
  "gateway://",
  "Source:",
  "HEARTBEAT_OK",
];

const PRIMARY_TIMESTAMP_PATTERN = /\b20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}\b/u;

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function boundedProofText(value, maxChars = 4000) {
  return normalizeText(value)
    .replace(/sk-[a-z0-9_-]+/giu, "[redacted-secret]")
    .replace(/raw-prompt-marker|raw-transcript-marker|raw-tool-log-marker/giu, "[redacted-marker]")
    .slice(0, maxChars)
    .trim();
}

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`proof artifact contains prohibited marker: ${marker}`);
    }
  }
}

function primaryTextLooksClean(text) {
  const normalized = normalizeText(text);
  return (
    normalized.length > 0 &&
    normalized.length < 1_200 &&
    !PRIMARY_TIMESTAMP_PATTERN.test(normalized) &&
    BAD_PRIMARY_SNIPPETS.every((snippet) => !normalized.includes(snippet))
  );
}

function isSkillProposalKind(kind) {
  return (
    kind === "new_skill_candidate" ||
    kind === "existing_skill_enhancement" ||
    kind === "merge_or_extend_candidate"
  );
}

async function resetFreshSessionThroughUi(harness, sessionKey) {
  const reset = await harness.page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const key = app.sessionKey || targetSessionKey;
    let lastError = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const result = await app.client.request("sessions.reset", { key, reason: "new" });
        if (!result?.ok) {
          throw new Error(`sessions.reset did not return ok for ${key}`);
        }
        app.chatMessages = [];
        app.chatQueue = [];
        app.chatRunId = null;
        app.chatSending = false;
        app.chatStream = null;
        app.chatSideResult = null;
        app.productProactivityQueue = [];
        app.productProactivityQueueResult = null;
        app.proactivityInboxDigest = null;
        return { requestedKey: key, resetKey: result.key || key };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("still active")) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }, sessionKey);
  await harness.openSession(reset.resetKey || sessionKey);
  await harness.page.waitForTimeout(1_500);
  return reset;
}

async function writeCodexHistoryProjection(outputDir) {
  const sourcePath = process.env.OPENCLAW_CODEX_HISTORY_FILE || "/root/.codex/history.jsonl";
  const hostWorkspaceRoot = process.env.OPENCLAW_WORKSPACE_DIR || "/root/.openclaw/workspace";
  const hostProjectionDir = path.join(
    hostWorkspaceRoot,
    ".artifacts/model-memory/phase2-contiguous-candidate-packets-and-model-cards",
    path.basename(outputDir),
  );
  const hostProjectionPath = path.join(hostProjectionDir, "codex-history-projection.jsonl");
  const containerProjectionPath = `/home/node/.openclaw/workspace/.artifacts/model-memory/phase2-contiguous-candidate-packets-and-model-cards/${path.basename(
    outputDir,
  )}/codex-history-projection.jsonl`;
  try {
    const raw = await readFile(sourcePath, "utf8");
    const lines = raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-24);
    const projected = [];
    for (const [index, line] of lines.entries()) {
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const text = boundedProofText(parsed?.text ?? parsed?.prompt ?? "");
      if (!text) {
        continue;
      }
      projected.push(
        JSON.stringify({
          session_id: boundedProofText(parsed?.session_id ?? "codex-history", 120),
          ts:
            typeof parsed?.ts === "number"
              ? parsed.ts
              : Math.floor(Date.now() / 1000) - (lines.length - index),
          text,
          source_hash: sha256(line),
          projection: "bounded_codex_history_for_candidate_review_proof.v1",
        }),
      );
    }
    if (projected.length === 0) {
      return { status: "skipped", reason: "codex_history_projection_empty", containerPath: null };
    }
    await mkdir(hostProjectionDir, { recursive: true });
    await writeFile(hostProjectionPath, `${projected.join("\n")}\n`, "utf8");
    return {
      status: "written",
      hostPath: hostProjectionPath,
      containerPath: containerProjectionPath,
      itemCount: projected.length,
    };
  } catch (error) {
    return {
      status: "skipped",
      reason: error instanceof Error ? error.message : String(error),
      containerPath: null,
    };
  }
}

async function readCandidateDiscoveryState(page, sessionKey, proofOptions) {
  return await page.evaluate(
    async ({ targetSessionKey, codexHistoryPath }) => {
      const app = document.querySelector("openclaw-app");
      if (!app?.client) {
        throw new Error("openclaw app client is unavailable");
      }
      const waitForIdle = async () => {
        const deadline = Date.now() + 180_000;
        while (
          (app.productProactivityLoading || app.proactivityInboxLoading) &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (app.productProactivityLoading || app.proactivityInboxLoading) {
          throw new Error("proactivity loaders did not become idle");
        }
      };
      await waitForIdle();
      const key = app.sessionKey || targetSessionKey;
      const loadProofQueue = async () => {
        const result = await app.client.request("modelMemory.proactivity.queue", {
          sessionKey: key,
          projectId: "openclaw",
          candidateReviewCooldownMs: 0,
          candidateReviewForceRun: true,
          candidateReviewCodexHistoryPath: codexHistoryPath,
        });
        app.productProactivityQueueResult = result ?? null;
        app.productProactivityQueue = Array.isArray(result?.queue?.items) ? result.queue.items : [];
      };
      await loadProofQueue();
      await waitForIdle();
      await app.loadProactivityInbox();
      app.sidebarOpen = true;
      app.sidebarContent = { kind: "proactivityInbox" };
      await waitForIdle();
      await app.updateComplete;
      const queueResponse = app.productProactivityQueueResult ?? null;

      const withoutDetailsText = (entry) => {
        const clone = entry.cloneNode(true);
        clone.querySelectorAll("details").forEach((details) => details.remove());
        return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
      };
      const cards = (selector) =>
        Array.from(document.querySelectorAll(selector)).map((entry) => ({
          queueItemId: entry.getAttribute("data-queue-item-id") || null,
          workItemId: entry.getAttribute("data-work-item-id") || null,
          skillCandidateId: entry.getAttribute("data-skill-candidate-id") || null,
          primaryText: withoutDetailsText(entry),
          fullTextHash: hashForBrowser(entry.textContent ?? ""),
        }));
      const queueItems = (app.productProactivityQueue ?? queueResponse?.queue?.items ?? []).map(
        (item) => ({
          queueItemId: item.queueItemId,
          workItemId: item.workItemId,
          opportunityId: item.opportunityId,
          opportunityClass: item.opportunityClass,
          status: item.status,
          layer: item.layer,
          primaryActionType: item.primaryAction?.actionType ?? null,
          skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
          sourceRefs: item.sourceRefs ?? [],
          blockedReasonCodes: item.blockedReasonCodes ?? [],
          briefTitle: item.userFacingBrief?.title ?? null,
          briefKindLabel: item.userFacingBrief?.kindLabel ?? null,
          briefPurpose: item.userFacingBrief?.oneLinePurpose ?? null,
          briefNextStep: item.userFacingBrief?.recommendedNextStep ?? null,
          briefQuality: item.userFacingBrief?.quality ?? null,
          briefAuthorship: item.userFacingBrief?.authorship ?? null,
        }),
      );
      const firstActionable =
        queueItems.find((item) => item.blockedReasonCodes.includes("model_reviewed_candidate")) ??
        queueItems.find((item) => item.status === "pending_review") ??
        null;
      const handoffMessage =
        firstActionable && typeof app.buildProactivityHandoffMessage === "function"
          ? app.buildProactivityHandoffMessage(
              firstActionable.queueItemId,
              firstActionable.primaryActionType || "plan_this",
            )
          : null;
      return {
        sessionKey: key,
        queueResponse: {
          ok: queueResponse?.ok === true || Array.isArray(app.productProactivityQueue),
          candidateReviewTriggerReport: queueResponse?.candidateReviewTriggerReport ?? null,
          candidateReviewReport: queueResponse?.candidateReviewReport ?? null,
          candidateReviewCodexAdapterReport:
            queueResponse?.candidateReviewCodexAdapterReport ?? null,
          qualitativeAssessment: {
            reviewer: "operator_or_model_required",
            note: "Proof records rendered model-authored cards and sanitized packet quality. Final qualitative usefulness remains a human/model review step, not a deterministic assertion.",
            surfacedTitles: (app.productProactivityQueue ?? queueResponse?.queue?.items ?? [])
              .map((item) => item.userFacingBrief?.title)
              .filter(Boolean),
          },
        },
        queueItems,
        inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
          itemId: item.itemId,
          queueItemId: item.queueItemId,
          workItemId: item.workItemId,
          opportunityClass: item.opportunityClass,
          status: item.status,
          layer: item.layer,
          skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
          briefTitle: item.userFacingBrief?.title ?? null,
          briefKindLabel: item.userFacingBrief?.kindLabel ?? null,
          briefQuality: item.userFacingBrief?.quality ?? null,
          briefAuthorship: item.userFacingBrief?.authorship ?? null,
          blockedReasonCodes: item.blockedReasonCodes ?? [],
        })),
        inlineCards: cards(".inline-proactivity-card__item"),
        heartbeatCards: cards(".heartbeat-proactivity-review__card"),
        inboxCards: cards(".proactivity-inbox__item"),
        handoff: handoffMessage
          ? {
              queueItemId: firstActionable?.queueItemId ?? null,
              primaryText: handoffMessage
                .split(/\r?\n/u)
                .filter((line) => /^(?:Title|Purpose|Recommended next step):/u.test(line))
                .join(" "),
              hash: hashForBrowser(handoffMessage),
            }
          : null,
      };

      function hashForBrowser(value) {
        let hash = 0;
        const text = String(value);
        for (let index = 0; index < text.length; index += 1) {
          hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
        }
        return String(hash >>> 0);
      }
    },
    { targetSessionKey: sessionKey, codexHistoryPath: proofOptions?.codexHistoryPath ?? null },
  );
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Contiguous Candidate Packet And Model Card Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- uiAuthWorks: ${summary.evidence.uiAuthWorks}`,
    `- triggerEvaluatorRan: ${summary.evidence.triggerEvaluatorRan}`,
    `- candidateReviewerRan: ${summary.evidence.candidateReviewerRan}`,
    `- acceptedProposalExists: ${summary.evidence.acceptedProposalExists}`,
    `- highContextPacketPersisted: ${summary.evidence.highContextPacketPersisted}`,
    `- contiguousPacketQuality: ${summary.evidence.contiguousPacketQuality}`,
    `- reviewerReturnedAtMostThree: ${summary.evidence.reviewerReturnedAtMostThree}`,
    `- proposalsIncludePlanAndSkill: ${summary.evidence.proposalsIncludePlanAndSkill}`,
    `- modelReviewedCardVisible: ${summary.evidence.modelReviewedCardVisible}`,
    `- modelAuthoredBriefVisible: ${summary.evidence.modelAuthoredBriefVisible}`,
    `- modelAuthoredOnlyVisibleCards: ${summary.evidence.modelAuthoredOnlyVisibleCards}`,
    `- proactivePlanFirstClass: ${summary.evidence.proactivePlanFirstClass}`,
    `- canonicalIdsShared: ${summary.evidence.canonicalIdsShared}`,
    `- primaryCardsClean: ${summary.evidence.primaryCardsClean}`,
    `- routeIsolationVisible: ${summary.evidence.routeIsolationVisible}`,
    `- codexAdapterReported: ${summary.evidence.codexAdapterReported}`,
    `- noRawPromptOrResponsePersistence: ${summary.evidence.noRawPromptOrResponsePersistence}`,
    `- noInstallPromotionActionOrSend: ${summary.evidence.noInstallPromotionActionOrSend}`,
    `- promptHashes: ${summary.promptHashes.join(", ")}`,
    `- episodePacketHash: ${summary.episodePacketHash ?? ""}`,
    `- episodePacketPath: ${summary.episodePacketPath ?? ""}`,
    `- rejectedProposalDiagnostics: ${JSON.stringify(summary.rejectedProposalDiagnostics ?? [])}`,
    `- stateHash: ${summary.stateHash}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
  ].join("\n");
}

async function writeArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "high-context-candidate-review-proof.json");
  const markdownPath = path.join(outputDir, "high-context-candidate-review-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(payload.summary)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const prompts = PROMPT_TEMPLATES.map(
    (prompt) =>
      `${prompt}\n\nProof run label: ${stamp}. Use this label only to separate proof runs; do not turn the label itself into a candidate.`,
  );
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-contiguous-candidate-packets-and-model-cards",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const codexHistoryProjection = await writeCodexHistoryProjection(outputDir);
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_MODEL_REVIEWED_CANDIDATES_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    triggerEvaluatorRan: false,
    candidateReviewerRan: false,
    acceptedProposalExists: false,
    highContextPacketPersisted: false,
    contiguousPacketQuality: false,
    reviewerReturnedAtMostThree: false,
    proposalsIncludePlanAndSkill: false,
    modelReviewedCardVisible: false,
    modelAuthoredBriefVisible: false,
    modelAuthoredOnlyVisibleCards: false,
    proactivePlanFirstClass: false,
    canonicalIdsShared: false,
    primaryCardsClean: false,
    routeIsolationVisible: false,
    codexAdapterReported: false,
    noRawPromptOrResponsePersistence: false,
    noInstallPromotionActionOrSend: false,
    noProhibitedContent: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    promptHashes: prompts.map((prompt) => sha256(prompt).slice(0, 16)),
    triggerModel: null,
    candidateReviewModel: null,
    presentationModels: [],
    acceptedProposalKinds: [],
    rejectedProposalDiagnostics: [],
    sourceRuntimes: [],
    codexAdapterStatus: null,
    episodePacketHash: null,
    episodePacketPath: null,
    episodeTurnCount: 0,
    packetQuality: null,
    modelReviewedQueueItemId: null,
    modelReviewedSkillCandidateId: null,
    stateHash: "",
    evidence,
    failureReason: null,
    ok: false,
  };

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let finalState = null;
  try {
    await harness.ensureAuthenticated(sessionKey);
    evidence.uiAuthWorks = true;
    let effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || null;
      })) ?? sessionKey;
    if (process.env.MODEL_MEMORY_PHASE2_MODEL_REVIEWED_CANDIDATES_SKIP_RESET !== "1") {
      const reset = await resetFreshSessionThroughUi(harness, effectiveSessionKey);
      effectiveSessionKey = reset.resetKey || effectiveSessionKey;
    }
    summary.sessionKey = effectiveSessionKey;

    for (const prompt of prompts) {
      await harness.sendPrompt(prompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      });
    }

    finalState = await readCandidateDiscoveryState(harness.page, effectiveSessionKey, {
      codexHistoryPath: codexHistoryProjection.containerPath,
    });
    if (!finalState) {
      throw new Error("model-reviewed candidate discovery state was not readable");
    }

    const triggerReport = finalState.queueResponse.candidateReviewTriggerReport;
    const reviewReport = finalState.queueResponse.candidateReviewReport;
    const codexReport = finalState.queueResponse.candidateReviewCodexAdapterReport;
    const inlineIds = new Set(
      finalState.inlineCards.map((card) => card.queueItemId).filter(Boolean),
    );
    const inboxIds = new Set(finalState.inboxCards.map((card) => card.queueItemId).filter(Boolean));
    const heartbeatIds = new Set(
      finalState.heartbeatCards.map((card) => card.queueItemId).filter(Boolean),
    );
    const inlineSkillIds = new Set(
      finalState.inlineCards.map((card) => card.skillCandidateId).filter(Boolean),
    );
    const inboxSkillIds = new Set(
      finalState.inboxCards.map((card) => card.skillCandidateId).filter(Boolean),
    );
    const heartbeatSkillIds = new Set(
      finalState.heartbeatCards.map((card) => card.skillCandidateId).filter(Boolean),
    );
    const hasInlineCanonicalId = (item) =>
      item.skillCandidateId
        ? inlineSkillIds.has(item.skillCandidateId)
        : inlineIds.has(item.queueItemId);
    const hasInboxCanonicalId = (item) =>
      item.skillCandidateId
        ? inboxSkillIds.has(item.skillCandidateId)
        : inboxIds.has(item.queueItemId);
    const hasHeartbeatCanonicalId = (item) =>
      item.skillCandidateId
        ? heartbeatSkillIds.size === 0 || heartbeatSkillIds.has(item.skillCandidateId)
        : heartbeatIds.size === 0 || heartbeatIds.has(item.queueItemId);
    const modelReviewedItems = finalState.queueItems.filter((item) =>
      item.blockedReasonCodes.includes("model_reviewed_candidate"),
    );
    const modelReviewedItem =
      modelReviewedItems.find(
        (item) =>
          hasInlineCanonicalId(item) && hasInboxCanonicalId(item) && hasHeartbeatCanonicalId(item),
      ) ??
      modelReviewedItems.find((item) => hasInlineCanonicalId(item) && hasInboxCanonicalId(item)) ??
      modelReviewedItems[0] ??
      null;
    const modelAuthoredItems = finalState.queueItems.filter(
      (item) => item.briefAuthorship?.source === "model",
    );
    const primaryCards = [
      ...finalState.inlineCards,
      ...finalState.heartbeatCards,
      ...finalState.inboxCards,
    ];

    summary.triggerModel = triggerReport?.modelId ?? null;
    summary.candidateReviewModel = reviewReport?.modelId ?? null;
    summary.presentationModels = [
      ...new Set(modelAuthoredItems.map((item) => item.briefAuthorship?.modelId).filter(Boolean)),
    ];
    summary.acceptedProposalKinds = reviewReport?.acceptedProposalKinds ?? [];
    summary.rejectedProposalDiagnostics = reviewReport?.rejectedProposalDiagnostics ?? [];
    summary.sourceRuntimes = reviewReport?.sourceRuntimes ?? [];
    summary.episodePacketHash = reviewReport?.episodePacketHash ?? null;
    summary.episodePacketPath = reviewReport?.episodePacketPath ?? null;
    summary.episodeTurnCount = reviewReport?.episodeTurnCount ?? 0;
    summary.packetQuality = reviewReport?.packetQuality ?? null;
    summary.codexAdapterStatus = codexReport
      ? `${codexReport.status}${codexReport.reasonCode ? `:${codexReport.reasonCode}` : ""}`
      : null;
    summary.modelReviewedQueueItemId = modelReviewedItem?.queueItemId ?? null;
    summary.modelReviewedSkillCandidateId = modelReviewedItem?.skillCandidateId ?? null;

    evidence.triggerEvaluatorRan =
      triggerReport?.validationStatus === "pass" &&
      triggerReport?.triggerDecision?.shouldRun === true;
    evidence.candidateReviewerRan =
      reviewReport?.validationStatus === "pass" &&
      reviewReport?.source === "model" &&
      typeof reviewReport?.proposalCount === "number";
    evidence.acceptedProposalExists =
      reviewReport?.validationStatus === "pass" &&
      reviewReport?.source === "model" &&
      reviewReport?.surfacedProposalCount > 0;
    evidence.highContextPacketPersisted =
      Boolean(reviewReport?.episodePacketHash) &&
      Boolean(reviewReport?.episodePacketPath) &&
      reviewReport?.episodeTurnCount > 0;
    evidence.contiguousPacketQuality =
      Boolean(reviewReport?.packetQuality?.contiguousWindowPresent) &&
      reviewReport?.packetQuality?.rawFullTranscriptPersisted === false &&
      (reviewReport?.packetQuality?.openClawTurnCount ?? 0) > 0;
    evidence.reviewerReturnedAtMostThree =
      typeof reviewReport?.proposalCount === "number" && reviewReport.proposalCount <= 3;
    evidence.proposalsIncludePlanAndSkill =
      summary.acceptedProposalKinds.includes("proactive_plan") &&
      summary.acceptedProposalKinds.some((kind) => isSkillProposalKind(kind));
    evidence.modelReviewedCardVisible = Boolean(modelReviewedItem);
    evidence.modelAuthoredBriefVisible = modelAuthoredItems.some(
      (item) => item.briefQuality?.status !== "demote",
    );
    evidence.modelAuthoredOnlyVisibleCards =
      modelReviewedItems.length > 0 &&
      modelReviewedItems.every(
        (item) =>
          item.status === "blocked" ||
          (item.briefAuthorship?.source === "model" && item.briefQuality?.status !== "demote"),
      );
    evidence.proactivePlanFirstClass = finalState.queueItems.some(
      (item) =>
        item.opportunityClass === "proactive_plan" &&
        item.blockedReasonCodes.includes("model_reviewed_candidate"),
    );
    evidence.canonicalIdsShared =
      Boolean(modelReviewedItem?.queueItemId || modelReviewedItem?.skillCandidateId) &&
      Boolean(modelReviewedItem && hasInlineCanonicalId(modelReviewedItem)) &&
      Boolean(modelReviewedItem && hasInboxCanonicalId(modelReviewedItem)) &&
      Boolean(modelReviewedItem && hasHeartbeatCanonicalId(modelReviewedItem)) &&
      (!finalState.handoff || finalState.handoff.queueItemId === modelReviewedItem.queueItemId);
    evidence.primaryCardsClean =
      primaryCards.length > 0 &&
      primaryCards.every((card) => primaryTextLooksClean(card.primaryText));
    evidence.routeIsolationVisible =
      Boolean(summary.candidateReviewModel) &&
      summary.presentationModels.length > 0 &&
      (!summary.triggerModel ||
        String(summary.triggerModel) !== String(summary.candidateReviewModel));
    evidence.codexAdapterReported = Boolean(codexReport?.status);
    evidence.noRawPromptOrResponsePersistence =
      triggerReport?.promptPersisted === false &&
      triggerReport?.rawResponsePersisted === false &&
      reviewReport?.promptPersisted === false &&
      reviewReport?.rawResponsePersisted === false;
    evidence.noInstallPromotionActionOrSend = finalState.queueItems.every(
      (item) =>
        item.primaryActionType !== "send_message" &&
        item.primaryActionType !== "install_skill" &&
        item.primaryActionType !== "promote_skill",
    );
    evidence.noProhibitedContent = true;
    summary.stateHash = sha256(JSON.stringify(finalState));
    summary.ok = Object.values(evidence).every(Boolean);
    if (!summary.ok) {
      throw new Error(
        `proof checks failed: ${Object.entries(evidence)
          .filter(([, value]) => !value)
          .map(([key]) => key)
          .join(", ")}`,
      );
    }
  } catch (error) {
    summary.failureReason = error instanceof Error ? error.message : String(error);
    summary.stateHash = finalState ? sha256(JSON.stringify(finalState)) : "";
  } finally {
    await harness.close();
  }

  const payload = {
    summary,
    finalState: finalState
      ? {
          queueResponse: finalState.queueResponse,
          queueItems: finalState.queueItems.map((item) => ({
            queueItemId: item.queueItemId,
            opportunityClass: item.opportunityClass,
            status: item.status,
            layer: item.layer,
            skillCandidateId: item.skillCandidateId,
            briefTitle: item.briefTitle,
            briefKindLabel: item.briefKindLabel,
            briefQuality: item.briefQuality,
            briefAuthorship: item.briefAuthorship,
            blockedReasonCodes: item.blockedReasonCodes,
            sourceRefCount: item.sourceRefs.length,
          })),
          inlineCardCount: finalState.inlineCards.length,
          heartbeatCardCount: finalState.heartbeatCards.length,
          inboxCardCount: finalState.inboxCards.length,
          inlineCards: finalState.inlineCards.map((card) => ({
            queueItemId: card.queueItemId,
            skillCandidateId: card.skillCandidateId,
            primaryText: card.primaryText,
            primaryTextHash: card.fullTextHash,
          })),
          heartbeatCards: finalState.heartbeatCards.map((card) => ({
            queueItemId: card.queueItemId,
            skillCandidateId: card.skillCandidateId,
            primaryText: card.primaryText,
            primaryTextHash: card.fullTextHash,
          })),
          inboxCards: finalState.inboxCards.map((card) => ({
            queueItemId: card.queueItemId,
            skillCandidateId: card.skillCandidateId,
            primaryText: card.primaryText,
            primaryTextHash: card.fullTextHash,
          })),
          handoffHash: finalState.handoff?.hash ?? null,
          codexHistoryProjection,
        }
      : null,
  };
  const artifact = await writeArtifacts(outputDir, payload);
  console.log(JSON.stringify({ ok: summary.ok, artifact, summary }, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

await main();
