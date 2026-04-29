#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TAILNET_ORIGIN, OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const DEFAULT_SESSION_KEY = "agent:main:main";
const PROMPT_TEMPLATES = [
  "Review the current OpenClaw Skillifier and proactivity work. Identify one recurring workflow that should become a reusable skill and one proactive follow-up plan that would help most before Milestone 4.",
  "Critique the current candidate surfacing behavior. Focus on whether deterministic surfacing is producing useful skill/proactive candidates or just cleaned-up fragments.",
  "Given the last two answers, classify the strongest opportunities as a new skill, an existing skill enhancement, a proactive plan, or something that should be demoted.",
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

async function readCandidateDiscoveryState(page, sessionKey) {
  return await page.evaluate(async (targetSessionKey) => {
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
    const existingQueueResponse = app.productProactivityQueueResult ?? null;
    const existingHasCandidateReview =
      existingQueueResponse?.candidateReviewTriggerReport?.validationStatus === "pass" &&
      existingQueueResponse?.candidateReviewReport?.validationStatus === "pass";
    if (!existingHasCandidateReview) {
      await app.loadProductProactivityQueue();
      await waitForIdle();
    }
    await app.loadProactivityInbox();
    app.sidebarOpen = true;
    app.sidebarContent = { kind: "proactivityInbox" };
    await waitForIdle();
    await app.updateComplete;
    const queueResponse = existingHasCandidateReview
      ? existingQueueResponse
      : (app.productProactivityQueueResult ?? null);

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
        candidateReviewCodexAdapterReport: queueResponse?.candidateReviewCodexAdapterReport ?? null,
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
  }, sessionKey);
}

async function waitForCandidateDiscoveryState(page, sessionKey, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readCandidateDiscoveryState(page, sessionKey);
    if (predicate(state)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return state;
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Model-Reviewed Candidate Discovery Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- uiAuthWorks: ${summary.evidence.uiAuthWorks}`,
    `- triggerEvaluatorRan: ${summary.evidence.triggerEvaluatorRan}`,
    `- candidateReviewerRan: ${summary.evidence.candidateReviewerRan}`,
    `- proposalsIncludePlanAndSkill: ${summary.evidence.proposalsIncludePlanAndSkill}`,
    `- modelReviewedCardVisible: ${summary.evidence.modelReviewedCardVisible}`,
    `- modelAuthoredBriefVisible: ${summary.evidence.modelAuthoredBriefVisible}`,
    `- canonicalIdsShared: ${summary.evidence.canonicalIdsShared}`,
    `- primaryCardsClean: ${summary.evidence.primaryCardsClean}`,
    `- routeIsolationVisible: ${summary.evidence.routeIsolationVisible}`,
    `- codexAdapterReported: ${summary.evidence.codexAdapterReported}`,
    `- noRawPromptOrResponsePersistence: ${summary.evidence.noRawPromptOrResponsePersistence}`,
    `- noInstallPromotionActionOrSend: ${summary.evidence.noInstallPromotionActionOrSend}`,
    `- promptHashes: ${summary.promptHashes.join(", ")}`,
    `- stateHash: ${summary.stateHash}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
  ].join("\n");
}

async function writeArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "model-reviewed-candidate-discovery-proof.json");
  const markdownPath = path.join(outputDir, "model-reviewed-candidate-discovery-proof.md");
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
    ".artifacts/model-memory/phase2-model-reviewed-candidate-discovery-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_MODEL_REVIEWED_CANDIDATES_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    triggerEvaluatorRan: false,
    candidateReviewerRan: false,
    proposalsIncludePlanAndSkill: false,
    modelReviewedCardVisible: false,
    modelAuthoredBriefVisible: false,
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
    sourceRuntimes: [],
    codexAdapterStatus: null,
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

    finalState = await waitForCandidateDiscoveryState(
      harness.page,
      effectiveSessionKey,
      (state) => {
        const review = state.queueResponse.candidateReviewReport;
        const kinds = review?.acceptedProposalKinds ?? [];
        return (
          state.queueResponse.candidateReviewTriggerReport?.validationStatus === "pass" &&
          review?.validationStatus === "pass" &&
          kinds.includes("proactive_plan") &&
          kinds.some((kind) => isSkillProposalKind(kind)) &&
          state.queueItems.some((item) =>
            item.blockedReasonCodes.includes("model_reviewed_candidate"),
          )
        );
      },
    );
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
    summary.sourceRuntimes = reviewReport?.sourceRuntimes ?? [];
    summary.codexAdapterStatus = codexReport
      ? `${codexReport.status}${codexReport.reasonCode ? `:${codexReport.reasonCode}` : ""}`
      : null;
    summary.modelReviewedQueueItemId = modelReviewedItem?.queueItemId ?? null;
    summary.modelReviewedSkillCandidateId = modelReviewedItem?.skillCandidateId ?? null;

    evidence.triggerEvaluatorRan =
      triggerReport?.validationStatus === "pass" &&
      triggerReport?.triggerDecision?.shouldRun === true &&
      triggerReport?.source === "model";
    evidence.candidateReviewerRan =
      reviewReport?.validationStatus === "pass" &&
      reviewReport?.source === "model" &&
      reviewReport?.surfacedProposalCount > 0;
    evidence.proposalsIncludePlanAndSkill =
      summary.acceptedProposalKinds.includes("proactive_plan") &&
      summary.acceptedProposalKinds.some((kind) => isSkillProposalKind(kind));
    evidence.modelReviewedCardVisible = Boolean(modelReviewedItem);
    evidence.modelAuthoredBriefVisible = modelAuthoredItems.some(
      (item) => item.briefQuality?.status !== "demote",
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
      Boolean(summary.triggerModel) &&
      Boolean(summary.candidateReviewModel) &&
      summary.presentationModels.length > 0 &&
      String(summary.triggerModel) !== String(summary.candidateReviewModel);
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
            primaryTextHash: card.fullTextHash,
          })),
          heartbeatCards: finalState.heartbeatCards.map((card) => ({
            queueItemId: card.queueItemId,
            skillCandidateId: card.skillCandidateId,
            primaryTextHash: card.fullTextHash,
          })),
          inboxCards: finalState.inboxCards.map((card) => ({
            queueItemId: card.queueItemId,
            skillCandidateId: card.skillCandidateId,
            primaryTextHash: card.fullTextHash,
          })),
          handoffHash: finalState.handoff?.hash ?? null,
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
