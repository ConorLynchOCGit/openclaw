#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TAILNET_ORIGIN, OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const DEFAULT_SESSION_KEY = "agent:main:main";
const PROMPTS = [
  "Review the current OpenClaw Skillifier MVP and identify the smallest reusable workflow that should become a skill candidate.",
  "Turn that recurring workflow into the smallest bounded reusable skill concept that would save future manual work.",
  "Before creating the next Skillifier draft, identify the one decision we should ask about helper scripts versus instruction-only skills.",
];
const PRIMARY_BAD_SNIPPETS = [
  "Why now",
  "Skill worth creating",
  "Question worth asking before",
  "Turn Turn",
  "Source: chat://",
  "chat://",
  "gateway://",
  "HEARTBEAT_OK",
  "Read HEARTBEAT.md",
];
const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
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
    !PRIMARY_TIMESTAMP_PATTERN.test(normalized) &&
    PRIMARY_BAD_SNIPPETS.every((snippet) => !normalized.includes(snippet))
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

async function readPresentationState(page, sessionKey) {
  return await page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const waitForIdle = async () => {
      const deadline = Date.now() + 30_000;
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
    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();
    app.sidebarOpen = true;
    app.sidebarContent = { kind: "proactivityInbox" };
    await waitForIdle();
    await app.updateComplete;

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
        fullTextHash: createHashForBrowser(entry.textContent ?? ""),
      }));
    const createHandoffMessage = (queueItemId, action) => {
      if (!queueItemId || typeof app.buildProactivityHandoffMessage !== "function") {
        return null;
      }
      return app.buildProactivityHandoffMessage(queueItemId, action);
    };
    const queueItems = (app.productProactivityQueue ?? []).map((item) => ({
      queueItemId: item.queueItemId,
      workItemId: item.workItemId,
      opportunityId: item.opportunityId,
      opportunityClass: item.opportunityClass,
      status: item.status,
      layer: item.layer,
      primaryActionType: item.primaryAction?.actionType ?? null,
      skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
      skillPresentationKind: item.userFacingBrief?.skillPresentationKind ?? null,
      briefTitle: item.userFacingBrief?.title ?? null,
      briefKindLabel: item.userFacingBrief?.kindLabel ?? null,
      briefPurpose: item.userFacingBrief?.oneLinePurpose ?? null,
      briefNextStep: item.userFacingBrief?.recommendedNextStep ?? null,
      briefQuality: item.userFacingBrief?.quality ?? null,
      blockedReasonCodes: item.blockedReasonCodes ?? [],
    }));
    const firstActionable = queueItems.find((item) => item.status === "pending_review");
    const handoffMessage = firstActionable
      ? createHandoffMessage(
          firstActionable.queueItemId,
          firstActionable.primaryActionType || "plan_this",
        )
      : null;
    return {
      sessionKey: app.sessionKey || targetSessionKey,
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
      })),
      inlineCards: cards(".inline-proactivity-card__item"),
      heartbeatCards: cards(".heartbeat-proactivity-review__card"),
      inboxCards: cards(".proactivity-inbox__item"),
      handoff: handoffMessage
        ? {
            queueItemId: firstActionable?.queueItemId ?? null,
            hash: createHashForBrowser(handoffMessage),
            primaryText: handoffMessage
              .split(/\r?\n/u)
              .filter((line) => /^(?:Title|Purpose|Recommended next step):/u.test(line))
              .join(" "),
            containsWhyNow: /\bWhy now:/iu.test(handoffMessage),
            containsSourceFragment: /\b(?:Question worth asking before|Turn Turn)\b/iu.test(
              handoffMessage,
            ),
          }
        : null,
    };

    function createHashForBrowser(value) {
      let hash = 0;
      const text = String(value);
      for (let index = 0; index < text.length; index += 1) {
        hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
      }
      return String(hash >>> 0);
    }
  }, sessionKey);
}

async function waitForPresentationState(page, sessionKey, predicate, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readPresentationState(page, sessionKey);
    if (predicate(state)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return state;
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Proactivity User-Facing Briefs Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- uiAuthWorks: ${summary.evidence.uiAuthWorks}`,
    `- skillCandidateBriefVisible: ${summary.evidence.skillCandidateBriefVisible}`,
    `- primaryCardsClean: ${summary.evidence.primaryCardsClean}`,
    `- whyNowSecondaryOnly: ${summary.evidence.whyNowSecondaryOnly}`,
    `- malformedReversePromptDemoted: ${summary.evidence.malformedReversePromptDemoted}`,
    `- canonicalIdsShared: ${summary.evidence.canonicalIdsShared}`,
    `- heartbeatClean: ${summary.evidence.heartbeatClean}`,
    `- handoffUsesBrief: ${summary.evidence.handoffUsesBrief}`,
    `- noInstallPromotionActionOrSend: ${summary.evidence.noInstallPromotionActionOrSend}`,
    `- promptHashes: ${summary.promptHashes.join(", ")}`,
    `- stateHash: ${summary.stateHash}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
  ].join("\n");
}

async function writeArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "proactivity-briefs-proof.json");
  const markdownPath = path.join(outputDir, "proactivity-briefs-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(payload.summary)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-proactivity-user-facing-briefs-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_BRIEFS_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    skillCandidateBriefVisible: false,
    primaryCardsClean: false,
    whyNowSecondaryOnly: false,
    malformedReversePromptDemoted: false,
    goodReversePromptVisibleOrNoMalformed: false,
    canonicalIdsShared: false,
    heartbeatClean: false,
    handoffUsesBrief: false,
    noInstallPromotionActionOrSend: false,
    noProhibitedContent: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    promptHashes: PROMPTS.map((prompt) => sha256(prompt).slice(0, 16)),
    skillCandidateId: null,
    queueItemId: null,
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
    if (process.env.MODEL_MEMORY_PHASE2_BRIEFS_SKIP_RESET !== "1") {
      const reset = await resetFreshSessionThroughUi(harness, effectiveSessionKey);
      effectiveSessionKey = reset.resetKey || effectiveSessionKey;
    }
    summary.sessionKey = effectiveSessionKey;

    for (const prompt of PROMPTS) {
      await harness.sendPrompt(prompt, {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      });
    }

    finalState = await waitForPresentationState(
      harness.page,
      effectiveSessionKey,
      (state) =>
        state.queueItems.some(
          (item) =>
            item.opportunityClass === "skill_candidate" &&
            item.briefTitle &&
            item.briefQuality?.status !== "demote",
        ),
      120_000,
    );
    if (!finalState) {
      throw new Error("proactivity brief state was not readable");
    }
    const skillItem =
      finalState.queueItems.find(
        (item) =>
          item.opportunityClass === "skill_candidate" &&
          item.briefTitle &&
          item.briefQuality?.status !== "demote",
      ) ?? null;
    if (!skillItem) {
      throw new Error("no live skill candidate with a user-facing brief appeared");
    }
    summary.skillCandidateId = skillItem.skillCandidateId;
    summary.queueItemId = skillItem.queueItemId;

    const allPrimaryCards = [
      ...finalState.inlineCards,
      ...finalState.heartbeatCards,
      ...finalState.inboxCards,
    ];
    evidence.skillCandidateBriefVisible =
      Boolean(skillItem.briefTitle) &&
      /^(?:New skill|Improve skill|Merge skill):/u.test(skillItem.briefTitle) &&
      Boolean(skillItem.briefPurpose) &&
      Boolean(skillItem.briefNextStep);
    evidence.primaryCardsClean =
      allPrimaryCards.length > 0 &&
      allPrimaryCards.every((card) => primaryTextLooksClean(card.primaryText));
    evidence.whyNowSecondaryOnly = allPrimaryCards.every(
      (card) => !/\bWhy now\b/u.test(card.primaryText),
    );
    evidence.malformedReversePromptDemoted = !allPrimaryCards.some((card) =>
      /Question worth asking before/iu.test(card.primaryText),
    );
    evidence.goodReversePromptVisibleOrNoMalformed =
      finalState.queueItems.some(
        (item) =>
          item.opportunityClass === "reverse_prompt" && item.briefQuality?.status === "pass",
      ) || evidence.malformedReversePromptDemoted;
    evidence.canonicalIdsShared =
      Boolean(skillItem.skillCandidateId) &&
      finalState.inlineCards.some((card) => card.skillCandidateId === skillItem.skillCandidateId) &&
      finalState.inboxCards.some((card) => card.skillCandidateId === skillItem.skillCandidateId);
    evidence.heartbeatClean =
      finalState.heartbeatCards.length === 0 ||
      finalState.heartbeatCards.every((card) => primaryTextLooksClean(card.primaryText));
    evidence.handoffUsesBrief =
      Boolean(finalState.handoff?.primaryText) &&
      finalState.handoff.containsWhyNow === false &&
      finalState.handoff.containsSourceFragment === false;
    evidence.noInstallPromotionActionOrSend = finalState.queueItems.every(
      (item) =>
        item.primaryActionType !== "send_message" &&
        item.primaryActionType !== "install_skill" &&
        item.primaryActionType !== "promote_skill",
    );
    evidence.noProhibitedContent = true;
    summary.stateHash = sha256(JSON.stringify(finalState));
    summary.ok =
      evidence.uiAuthWorks &&
      evidence.skillCandidateBriefVisible &&
      evidence.primaryCardsClean &&
      evidence.whyNowSecondaryOnly &&
      evidence.malformedReversePromptDemoted &&
      evidence.goodReversePromptVisibleOrNoMalformed &&
      evidence.canonicalIdsShared &&
      evidence.heartbeatClean &&
      evidence.handoffUsesBrief &&
      evidence.noInstallPromotionActionOrSend &&
      evidence.noProhibitedContent;
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
          queueItems: finalState.queueItems.map((item) => ({
            queueItemId: item.queueItemId,
            opportunityClass: item.opportunityClass,
            status: item.status,
            layer: item.layer,
            skillCandidateId: item.skillCandidateId,
            skillPresentationKind: item.skillPresentationKind,
            briefTitle: item.briefTitle,
            briefKindLabel: item.briefKindLabel,
            briefQuality: item.briefQuality,
            blockedReasonCodes: item.blockedReasonCodes,
          })),
          inlineCardCount: finalState.inlineCards.length,
          heartbeatCardCount: finalState.heartbeatCards.length,
          inboxCardCount: finalState.inboxCards.length,
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
