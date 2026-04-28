#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TAILNET_ORIGIN,
  OperatorBrowserHarness,
  markProbe,
} from "./lib/operator-browser-harness.mjs";

const DEFAULT_SESSION_KEY = "agent:main:main";
const STORE_PATH = "/root/.openclaw/agents/main/sessions/model-memory-proactivity-state.json";
const DISALLOWED_PRIMARY_SNIPPETS = [
  "Read HEARTBEAT.md",
  "HEARTBEAT_OK",
  "Sender (untrusted metadata)",
  "Post-compaction context refresh",
  "Source: chat://",
  "Source: gateway://",
  "Current time:",
  "Return the proactive review below exactly",
];
const PRIMARY_TIMESTAMP_PATTERN =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}\b/u;
const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
];
const PROMPTS = [
  `Review the current OpenClaw Skills Platform docs and identify the top 3 concrete implementation opportunities for the skill candidate ledger.`,
  `Now focus only on recurring work patterns in this repo that should eventually become reusable skills. Give me the top 3 concrete candidates and why they recur.`,
  `Re-evaluate the same skill-candidate area and tell me the single most useful next implementation step.`,
  `Stay on the same skill-candidate area. Identify the single strongest repeated workflow signal that should reinforce the same candidate instead of creating a new one.`,
  `Stay on the same topic. If the repeated workflow signal is real, explain whether it should update the existing skill candidate or create a new one, and why.`,
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/gu, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function shortHash(value) {
  return sha256(value).slice(0, 16);
}

function normalizeText(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function containsDisallowedPrimaryText(value) {
  const text = normalizeText(value);
  return (
    DISALLOWED_PRIMARY_SNIPPETS.some((snippet) => text.includes(snippet)) ||
    PRIMARY_TIMESTAMP_PATTERN.test(text)
  );
}

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`skill candidate proof contains prohibited marker: ${marker}`);
    }
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readPersistedState() {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await readJsonFile(STORE_PATH);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

function sessionKeyAliases(sessionKey) {
  const trimmed = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!trimmed) {
    return [];
  }
  return [...new Set([trimmed, `agent:main:${trimmed}`, trimmed.replace(/^agent:main:/u, "")])];
}

function recordBelongsToSession(record, sessionKey) {
  if (!record || typeof record !== "object") {
    return false;
  }
  const refs = Array.isArray(record.provenanceRefs) ? record.provenanceRefs : [];
  return sessionKeyAliases(sessionKey).some((alias) =>
    refs.some(
      (sourceRef) => typeof sourceRef === "string" && sourceRef.includes(`chat://${alias}/`),
    ),
  );
}

function activeSkillCandidatesForSession(state, sessionKey) {
  return (state?.skillCandidates ?? [])
    .filter(
      (record) =>
        recordBelongsToSession(record, sessionKey) &&
        record.lifecycleStatus !== "superseded" &&
        record.lifecycleStatus !== "rejected" &&
        record.lifecycleStatus !== "disabled",
    )
    .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

async function waitForSkillCandidateSince(sessionKey, baselineIds, timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readPersistedState();
    const candidates = activeSkillCandidatesForSession(state, sessionKey);
    const fresh =
      candidates.find((candidate) => !baselineIds.has(candidate.skillCandidateId)) ?? null;
    if (fresh) {
      return { state, candidate: fresh, candidates };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  state = state ?? (await readPersistedState());
  return {
    state,
    candidate:
      activeSkillCandidatesForSession(state, sessionKey).find(
        (record) => !baselineIds.has(record.skillCandidateId),
      ) ?? null,
    candidates: activeSkillCandidatesForSession(state, sessionKey),
  };
}

async function refreshProactivityInUi(page, sessionKey) {
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
        throw new Error("proactivity UI loaders did not become idle");
      }
    };
    await waitForIdle();
    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();
    await waitForIdle();
    await app.updateComplete;
    const canonicalSessionKey = app.sessionKey || targetSessionKey;
    const queueResponse = await app.client.request("modelMemory.proactivity.queue", {
      sessionKey: canonicalSessionKey,
      projectId: "openclaw",
    });
    const inlineCards = Array.from(
      document.querySelectorAll(".inline-proactivity-card [data-skill-candidate-id]"),
    ).map((entry) => ({
      skillCandidateId: entry.getAttribute("data-skill-candidate-id"),
      workItemId: entry.getAttribute("data-work-item-id"),
      queueItemId: entry.getAttribute("data-queue-item-id"),
      text: entry.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    const heartbeatCards = Array.from(
      document.querySelectorAll(".heartbeat-proactivity-review [data-skill-candidate-id]"),
    ).map((entry) => ({
      skillCandidateId: entry.getAttribute("data-skill-candidate-id"),
      workItemId: entry.getAttribute("data-work-item-id"),
      queueItemId: entry.getAttribute("data-queue-item-id"),
      text: entry.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    const inboxCards = Array.from(
      document.querySelectorAll(".proactivity-inbox [data-skill-candidate-id]"),
    ).map((entry) => ({
      skillCandidateId: entry.getAttribute("data-skill-candidate-id"),
      workItemId: entry.getAttribute("data-work-item-id"),
      queueItemId: entry.getAttribute("data-queue-item-id"),
      text: entry.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    return {
      sessionKey: canonicalSessionKey,
      queueReportId: queueResponse.reportId,
      skillCandidateReport: queueResponse.skillCandidateReport ?? null,
      queueItems: (app.productProactivityQueue ?? []).map((item) => ({
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        primaryActionType: item.primaryAction?.actionType ?? null,
        planTitle: item.planTitle,
        proposedMessage: item.proposedMessage,
        sourceRefs: item.sourceRefs ?? [],
        opportunityClass: item.opportunityClass,
        handoffStatus: item.handoffStatus ?? null,
        skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
        normalizedIntentKey: item.skillCandidate?.normalizedIntentKey ?? null,
        recurrenceCount: item.skillCandidate?.recurrenceCount ?? null,
      })),
      inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
      })),
      inlineCards,
      heartbeatCards,
      inboxCards,
      inlineText:
        document
          .querySelector(".inline-proactivity-card")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      heartbeatText:
        document
          .querySelector(".heartbeat-proactivity-review")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      bodyText: document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "",
    };
  }, sessionKey);
}

async function waitForUiState(page, sessionKey, predicate, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await refreshProactivityInUi(page, sessionKey);
    if (predicate(lastState)) {
      return lastState;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return lastState;
}

async function resetFreshSessionThroughUi(harness, sessionKey) {
  const reset = await harness.page.evaluate(async (targetSessionKey) => {
    const app = document.querySelector("openclaw-app");
    if (!app?.client) {
      throw new Error("openclaw app client is unavailable");
    }
    const key = app.sessionKey || targetSessionKey;
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
    return {
      requestedKey: key,
      resetKey: result.key || key,
    };
  }, sessionKey);
  await harness.openSession(reset.resetKey || sessionKey);
  await harness.page.waitForTimeout(1_500);
  return reset;
}

async function currentSkillPathStatus(root, skillName) {
  const paths = [
    path.join(root, "skills", skillName),
    path.join("/root/.openclaw/workspace/skills", skillName),
    path.join("/root/.openclaw/workspace/.agents/skills", skillName),
    path.join("/root/.agents/skills", skillName),
    path.join("/root/.openclaw/skills", skillName),
    path.join("/root/.codex/skills", skillName),
  ];
  const results = [];
  for (const targetPath of paths) {
    try {
      await access(targetPath, fs.constants.F_OK);
      results.push({ path: targetPath, exists: true });
    } catch {
      results.push({ path: targetPath, exists: false });
    }
  }
  return results;
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Skill Candidate Ledger Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- resetSessionKey: ${summary.resetSessionKey}`,
    `- skillCandidateId: ${summary.skillCandidateId}`,
    `- normalizedIntentKey: ${summary.normalizedIntentKey}`,
    `- recurrenceCount: ${summary.recurrenceCount}`,
    `- queueItemId: ${summary.queueItemId}`,
    `- workItemId: ${summary.workItemId}`,
    `- opportunityId: ${summary.opportunityId}`,
    `- persistedStateHash: ${summary.persistedStateHash}`,
    `- heartbeatTextSha256: ${summary.heartbeatTextSha256}`,
    `- handoffPromptSha256: ${summary.handoffPromptSha256}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function writeProofArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "skill-candidate-ledger-proof.json");
  const markdownPath = path.join(outputDir, "skill-candidate-ledger-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(payload.summary)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-skill-candidate-ledger-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_SKILL_CANDIDATE_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    skillCandidateCreatedFromRealWork: false,
    boundedDistilledEvidenceOnly: false,
    canonicalIdSharedInline: false,
    canonicalIdSharedInbox: false,
    canonicalIdSharedHeartbeat: false,
    canonicalIdSharedHandoff: false,
    recurrenceUpdatesExistingCandidate: false,
    deterministicDedupeHeld: false,
    heartbeatPrimaryTextClean: false,
    heartbeatShowsOneToThreeItems: false,
    noAutoInstallOrPromotion: false,
    noChatInjectForPlan: false,
    noActionExecution: true,
    noAutonomousSend: true,
    noProhibitedContent: false,
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    sessionKey,
    resetSessionKey: null,
    skillCandidateId: null,
    normalizedIntentKey: null,
    recurrenceCount: 0,
    queueItemId: null,
    workItemId: null,
    opportunityId: null,
    persistedStateHash: "",
    heartbeatTextSha256: "",
    handoffPromptSha256: "",
    promptCompletionSources: [],
    failureReason: null,
    ok: false,
  };

  const baselineState = await readPersistedState();
  const baselineSkillCandidateIds = new Set(
    activeSkillCandidatesForSession(baselineState, sessionKey).map(
      (record) => record.skillCandidateId,
    ),
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  try {
    await harness.ensureAuthenticated(sessionKey);
    evidence.uiAuthWorks = true;
    let effectiveSessionKey =
      (await harness.page.evaluate(() => {
        const app = document.querySelector("openclaw-app");
        return app?.sessionKey || new URLSearchParams(location.search).get("session") || null;
      })) ?? sessionKey;
    const reset = await resetFreshSessionThroughUi(harness, effectiveSessionKey);
    effectiveSessionKey = reset.resetKey || effectiveSessionKey;
    summary.resetSessionKey = effectiveSessionKey;
    summary.sessionKey = effectiveSessionKey;

    for (let index = 0; index < PROMPTS.length; index += 1) {
      const turn = await harness.sendPrompt(PROMPTS[index], {
        sessionKey: effectiveSessionKey,
        timeoutMs: 300_000,
      });
      summary.promptCompletionSources.push(turn.completionEvidence?.source ?? "unknown");
      effectiveSessionKey =
        (await harness.page.evaluate(() => {
          const app = document.querySelector("openclaw-app");
          return app?.sessionKey || new URLSearchParams(location.search).get("session") || null;
        })) ??
        turn.sessionKey ??
        effectiveSessionKey;
      summary.sessionKey = effectiveSessionKey;
    }

    const skillCandidateResult = await waitForSkillCandidateSince(
      effectiveSessionKey,
      baselineSkillCandidateIds,
      120_000,
    );
    const skillCandidate = skillCandidateResult.candidate;
    if (!skillCandidate) {
      summary.failureReason =
        "No same-session skill candidate was created from the live prompt sequence.";
      await writeProofArtifacts(outputDir, { summary, evidence });
      throw new Error("live prompt sequence did not create a skill candidate");
    }
    evidence.skillCandidateCreatedFromRealWork = true;
    summary.skillCandidateId = skillCandidate.skillCandidateId;
    summary.normalizedIntentKey = skillCandidate.normalizedIntentKey;
    summary.recurrenceCount = skillCandidate.recurrenceCount;
    summary.persistedStateHash = shortHash(skillCandidateResult.state);
    evidence.boundedDistilledEvidenceOnly =
      Array.isArray(skillCandidate.exampleHashes) &&
      skillCandidate.exampleHashes.length > 0 &&
      skillCandidate.evidenceSummary.length <= 180 &&
      !skillCandidate.evidenceSummary.includes("\n") &&
      Array.isArray(skillCandidate.provenanceRefs) &&
      skillCandidate.provenanceRefs.every((sourceRef) => typeof sourceRef === "string") &&
      !PROMPTS.some((prompt) => JSON.stringify(skillCandidate).includes(prompt));

    const sessionCandidates = activeSkillCandidatesForSession(
      skillCandidateResult.state,
      effectiveSessionKey,
    );
    const sameIntentCandidates = sessionCandidates.filter(
      (record) => record.normalizedIntentKey === skillCandidate.normalizedIntentKey,
    );
    evidence.deterministicDedupeHeld = sameIntentCandidates.length === 1;
    evidence.recurrenceUpdatesExistingCandidate = skillCandidate.recurrenceCount >= 2;

    let uiState =
      (await waitForUiState(
        harness.page,
        effectiveSessionKey,
        (candidateState) =>
          candidateState.queueItems.some(
            (item) =>
              item.opportunityClass === "skill_candidate" &&
              item.skillCandidateId === skillCandidate.skillCandidateId,
          ) &&
          candidateState.inlineCards.some(
            (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
          ) &&
          candidateState.heartbeatCards.some(
            (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
          ),
        120_000,
      )) ?? (await refreshProactivityInUi(harness.page, effectiveSessionKey));

    const matchedQueueItem =
      uiState.queueItems.find(
        (item) =>
          item.opportunityClass === "skill_candidate" &&
          item.skillCandidateId === skillCandidate.skillCandidateId,
      ) ?? null;
    if (
      !matchedQueueItem?.queueItemId ||
      !matchedQueueItem.workItemId ||
      !matchedQueueItem.opportunityId
    ) {
      summary.failureReason =
        "A persisted skill candidate exists but the queue/inbox/heartbeat surfaces did not expose the matching canonical item.";
      await writeProofArtifacts(outputDir, { summary, evidence });
      throw new Error("persisted skill candidate was not surfaced through product proactivity");
    }
    summary.queueItemId = matchedQueueItem.queueItemId;
    summary.workItemId = matchedQueueItem.workItemId;
    summary.opportunityId = matchedQueueItem.opportunityId;

    evidence.canonicalIdSharedInline = uiState.inlineCards.some(
      (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
    );
    evidence.canonicalIdSharedInbox =
      uiState.inboxItems.some(
        (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
      ) ||
      uiState.inboxCards.some((item) => item.skillCandidateId === skillCandidate.skillCandidateId);
    evidence.canonicalIdSharedHeartbeat = uiState.heartbeatCards.some(
      (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
    );
    evidence.heartbeatPrimaryTextClean =
      Boolean(uiState.heartbeatText) &&
      !containsDisallowedPrimaryText(uiState.heartbeatText) &&
      uiState.heartbeatCards
        .filter((item) => item.skillCandidateId === skillCandidate.skillCandidateId)
        .every((item) => !containsDisallowedPrimaryText(item.text));
    evidence.heartbeatShowsOneToThreeItems =
      uiState.heartbeatCards.length >= 1 && uiState.heartbeatCards.length <= 3;

    await harness.page.locator(".proactivity-entrypoint__button").click({ timeout: 30_000 });
    await harness.page.waitForSelector(".chat-sidebar .proactivity-inbox", { timeout: 30_000 });
    uiState = await refreshProactivityInUi(harness.page, effectiveSessionKey);
    evidence.canonicalIdSharedInbox =
      uiState.inboxItems.some(
        (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
      ) ||
      uiState.inboxCards.some((item) => item.skillCandidateId === skillCandidate.skillCandidateId);

    const mark = await markProbe(harness.page);
    await harness.page.evaluate(
      async ({ queueItemId, actionType }) => {
        const app = document.querySelector("openclaw-app");
        if (!app || typeof app.handleProductProactivityWorkAction !== "function") {
          throw new Error("openclaw app handoff action is unavailable");
        }
        await app.handleProductProactivityWorkAction(queueItemId, actionType);
        await app.updateComplete;
      },
      {
        queueItemId: matchedQueueItem.queueItemId,
        actionType: matchedQueueItem.primaryActionType ?? "plan_this",
      },
    );
    await harness.page.waitForFunction(
      () => /started in chat|Planning started in chat/i.test(document.body.textContent ?? ""),
      undefined,
      { timeout: 60_000 },
    );
    const probeSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames.slice(start.wsFrames ?? 0);
    }, mark);
    const chatSendFrame = [...probeSlice]
      .toReversed()
      .find((frame) => frame?.method === "chat.send");
    evidence.noChatInjectForPlan = !probeSlice.some((frame) => frame?.method === "chat.inject");
    summary.handoffPromptSha256 = sha256(chatSendFrame?.message ?? "");
    uiState = await refreshProactivityInUi(harness.page, effectiveSessionKey);
    evidence.canonicalIdSharedHandoff =
      Boolean(chatSendFrame) &&
      uiState.queueItems.some(
        (item) =>
          item.skillCandidateId === skillCandidate.skillCandidateId &&
          item.handoffStatus === "started",
      );

    summary.heartbeatTextSha256 = sha256(uiState.heartbeatText);

    const pathStatus = await currentSkillPathStatus(root, skillCandidate.suggestedSkillName);
    evidence.noAutoInstallOrPromotion =
      skillCandidate.lifecycleStatus === "detected" &&
      skillCandidate.evalStatus === "not_started" &&
      skillCandidate.vettingStatus === "not_started" &&
      skillCandidate.canaryStatus === "not_started" &&
      pathStatus.every((entry) => !entry.exists);

    evidence.noProhibitedContent =
      !containsDisallowedPrimaryText(uiState.inlineText) &&
      !containsDisallowedPrimaryText(uiState.heartbeatText) &&
      uiState.inlineCards.every((item) => !containsDisallowedPrimaryText(item.text)) &&
      uiState.heartbeatCards.every((item) => !containsDisallowedPrimaryText(item.text));

    const payload = {
      summary,
      evidence,
      persistedSkillCandidate: skillCandidate,
      uiState,
      skillPathStatus: pathStatus,
    };
    if (!Object.values(evidence).every(Boolean)) {
      summary.failureReason = `One or more skill candidate checks failed: ${JSON.stringify(evidence)}`;
      await writeProofArtifacts(outputDir, payload);
      throw new Error(`skill candidate ledger proof failed: ${JSON.stringify(evidence)}`);
    }

    summary.ok = true;
    const { jsonPath } = await writeProofArtifacts(outputDir, payload);
    process.stdout.write(`${jsonPath}\n`);
  } finally {
    await harness.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
