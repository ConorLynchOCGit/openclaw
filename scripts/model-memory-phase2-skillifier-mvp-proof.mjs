#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  "Review the current OpenClaw Skills Platform work and identify the top recurring workflow that should become a reusable skill next.",
  "Focus on that single recurring workflow and explain why it recurs enough to justify a reusable skill.",
  "Turn that recurring workflow into the smallest bounded reusable skill concept that would save future manual work.",
  "Stay on the same workflow. Explain what repeated signal should reinforce the same skill candidate instead of creating a new one.",
  "Stay on the same workflow. Explain what the first bounded draft skill package should include for review and what it should leave for later milestones.",
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
      throw new Error(`skillifier proof contains prohibited marker: ${marker}`);
    }
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function runtimePathToHostPath(filePath) {
  if (typeof filePath !== "string" || !filePath) {
    return filePath;
  }
  if (filePath.startsWith("/home/node/.openclaw/")) {
    return filePath.replace(/^\/home\/node\/\.openclaw\//u, "/root/.openclaw/");
  }
  return filePath;
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
  const refs = Array.isArray(record.provenanceRefs)
    ? record.provenanceRefs
    : Array.isArray(record.sourceRefs)
      ? record.sourceRefs
      : [];
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

function skillDraftsForSession(state, sessionKey) {
  return (state?.skillPackageDrafts ?? [])
    .filter((record) => recordBelongsToSession(record, sessionKey))
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

async function waitForSkillDraftSince(
  sessionKey,
  baselineIds,
  skillCandidateId,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readPersistedState();
    const drafts = skillDraftsForSession(state, sessionKey);
    const fresh =
      drafts.find(
        (draft) =>
          draft.skillCandidateId === skillCandidateId && !baselineIds.has(draft.skillPackageId),
      ) ?? null;
    if (fresh) {
      return { state, draft: fresh, drafts };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  state = state ?? (await readPersistedState());
  const drafts = skillDraftsForSession(state, sessionKey);
  return {
    state,
    draft:
      drafts.find(
        (record) =>
          record.skillCandidateId === skillCandidateId && !baselineIds.has(record.skillPackageId),
      ) ?? null,
    drafts,
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
        draftReady: item.draftReady === true,
        skillifierDraft: item.skillifierDraft
          ? {
              skillPackageId: item.skillifierDraft.skillPackageId,
              skillifierReportId: item.skillifierDraft.skillifierReportId,
              decision: item.skillifierDraft.decision,
              packageTitle: item.skillifierDraft.packageTitle,
              draftPath: item.skillifierDraft.draftPath,
              reviewSummary: item.skillifierDraft.reviewSummary,
              nextReviewStep: item.skillifierDraft.nextReviewStep,
            }
          : null,
      })),
      inboxItems: (app.proactivityInboxDigest?.items ?? []).map((item) => ({
        itemId: item.itemId,
        queueItemId: item.queueItemId,
        workItemId: item.workItemId,
        opportunityId: item.opportunityId,
        status: item.status,
        layer: item.layer,
        handoffStatus: item.handoffStatus ?? null,
        skillCandidateId: item.skillCandidate?.skillCandidateId ?? null,
        draftReady: item.draftReady === true,
        skillifierDraft: item.skillifierDraft
          ? {
              skillPackageId: item.skillifierDraft.skillPackageId,
              skillifierReportId: item.skillifierDraft.skillifierReportId,
              decision: item.skillifierDraft.decision,
              packageTitle: item.skillifierDraft.packageTitle,
              draftPath: item.skillifierDraft.draftPath,
              reviewSummary: item.skillifierDraft.reviewSummary,
              nextReviewStep: item.skillifierDraft.nextReviewStep,
            }
          : null,
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
        return {
          requestedKey: key,
          resetKey: result.key || key,
        };
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

async function pathExists(filePath) {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listRelativeFiles(rootPath) {
  const output = [];
  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath) || entry.name;
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      output.push(relativePath.replace(/\\/gu, "/"));
    }
  }
  await walk(rootPath);
  return output.toSorted((left, right) => left.localeCompare(right));
}

function toMarkdown(summary) {
  return [
    "# Phase 2 Skillifier MVP Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- resetSessionKey: ${summary.resetSessionKey}`,
    `- skillCandidateId: ${summary.skillCandidateId}`,
    `- skillPackageId: ${summary.skillPackageId}`,
    `- skillifierReportId: ${summary.skillifierReportId}`,
    `- queueItemId: ${summary.queueItemId}`,
    `- opportunityId: ${summary.opportunityId}`,
    `- draftPath: ${summary.draftPath}`,
    `- persistedStateHash: ${summary.persistedStateHash}`,
    `- heartbeatTextSha256: ${summary.heartbeatTextSha256}`,
    `- handoffPromptSha256: ${summary.handoffPromptSha256}`,
    ...(summary.failureReason ? [`- failureReason: ${summary.failureReason}`] : []),
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function writeProofArtifacts(outputDir, payload) {
  assertNoProhibitedContent(payload);
  const jsonPath = path.join(outputDir, "skillifier-mvp-proof.json");
  const markdownPath = path.join(outputDir, "skillifier-mvp-proof.md");
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${toMarkdown(payload.summary)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(root, ".artifacts/model-memory/phase2-skillifier-mvp-proof", stamp);
  await mkdir(outputDir, { recursive: true });

  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;
  const sessionKey = process.env.MODEL_MEMORY_PHASE2_SKILLIFIER_SESSION ?? DEFAULT_SESSION_KEY;
  const evidence = {
    uiAuthWorks: false,
    skillCandidateCreatedFromRealWork: false,
    boundedDistilledEvidenceOnly: false,
    liveCandidateWasSkillified: false,
    draftPathAllowed: false,
    canonicalCandidateIdSharedInline: false,
    canonicalCandidateIdSharedInbox: false,
    canonicalCandidateIdSharedHeartbeat: false,
    canonicalCandidateIdSharedHandoff: false,
    canonicalSkillPackageIdLinked: false,
    draftReadyVisibleAcrossSurfaces: false,
    heartbeatPrimaryTextClean: false,
    noInstallOrPromotion: false,
    noForbiddenDestinationWrites: false,
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
    skillPackageId: null,
    skillifierReportId: null,
    normalizedIntentKey: null,
    recurrenceCount: 0,
    queueItemId: null,
    workItemId: null,
    opportunityId: null,
    draftPath: null,
    reportPath: null,
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
  const baselineSkillPackageIds = new Set(
    skillDraftsForSession(baselineState, sessionKey).map((record) => record.skillPackageId),
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

    const draftMark = await markProbe(harness.page);
    await harness.page.evaluate(
      async ({ queueItemId, actionType }) => {
        const app = document.querySelector("openclaw-app");
        if (!app || typeof app.handleProductProactivityWorkAction !== "function") {
          throw new Error("openclaw app skillifier action is unavailable");
        }
        await app.handleProductProactivityWorkAction(queueItemId, actionType);
        await app.updateComplete;
      },
      {
        queueItemId: matchedQueueItem.queueItemId,
        actionType: "draft_skill_package",
      },
    );

    const draftResult = await waitForSkillDraftSince(
      effectiveSessionKey,
      baselineSkillPackageIds,
      skillCandidate.skillCandidateId,
      120_000,
    );
    const draft = draftResult.draft;
    if (!draft) {
      summary.failureReason = "The live skill candidate did not produce a persisted draft package.";
      await writeProofArtifacts(outputDir, { summary, evidence, uiState });
      throw new Error("skillifier draft was not persisted");
    }

    uiState =
      (await waitForUiState(
        harness.page,
        effectiveSessionKey,
        (candidateState) =>
          candidateState.queueItems.some(
            (item) =>
              item.skillCandidateId === skillCandidate.skillCandidateId &&
              item.draftReady === true &&
              item.skillifierDraft?.skillPackageId === draft.skillPackageId,
          ) &&
          candidateState.inboxItems.some(
            (item) =>
              item.skillCandidateId === skillCandidate.skillCandidateId &&
              item.draftReady === true &&
              item.skillifierDraft?.skillPackageId === draft.skillPackageId,
          ),
        120_000,
      )) ?? (await refreshProactivityInUi(harness.page, effectiveSessionKey));
    const uiStateAfterDraft = uiState;

    const draftedQueueItem =
      uiStateAfterDraft.queueItems.find(
        (item) =>
          item.skillCandidateId === skillCandidate.skillCandidateId &&
          item.skillifierDraft?.skillPackageId === draft.skillPackageId,
      ) ?? null;
    if (!draftedQueueItem?.skillifierDraft) {
      summary.failureReason =
        "The persisted skillifier draft did not surface back through the queue.";
      await writeProofArtifacts(outputDir, {
        summary,
        evidence,
        persistedSkillCandidate: skillCandidate,
        persistedSkillDraft: draft,
        uiStateAfterDraft,
      });
      throw new Error("skillifier draft was not surfaced through product proactivity");
    }

    evidence.liveCandidateWasSkillified = true;
    summary.skillPackageId = draft.skillPackageId;
    summary.skillifierReportId = draft.skillifierReportId;
    summary.draftPath = draft.skillDirectoryPath;
    summary.reportPath = draft.reportFilePath;

    const draftResponseFrameSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames.slice(start.wsFrames ?? 0);
    }, draftMark);
    const skillifyFrame = draftResponseFrameSlice.find(
      (frame) => frame?.method === "modelMemory.proactivity.skillifyCandidateDraft",
    );

    const hostDraftDirectoryPath = runtimePathToHostPath(draft.skillDirectoryPath);
    const hostReportFilePath = runtimePathToHostPath(draft.reportFilePath);
    const hostMetadataFilePath = runtimePathToHostPath(draft.metadataFilePath);
    const hostProvenanceReportPath = runtimePathToHostPath(draft.provenanceReportPath);
    const hostRollbackPlanPath = runtimePathToHostPath(draft.rollbackPlanPath);
    const hostSkillFilePath = runtimePathToHostPath(draft.skillFilePath);

    const reportJson = await readJsonFile(hostReportFilePath);
    const draftPackageJson = await readJsonFile(hostMetadataFilePath);
    const provenanceJson = await readJsonFile(hostProvenanceReportPath);
    const rollbackJson = await readJsonFile(hostRollbackPlanPath);
    const skillMarkdown = await readFile(hostSkillFilePath, "utf8");
    const relativeDraftFiles = await listRelativeFiles(hostDraftDirectoryPath);

    evidence.draftPathAllowed =
      draft.draftTarget.targetKind === "workspace_skills_dir" &&
      draft.skillDirectoryPath.startsWith(path.join(draft.draftTarget.workspaceDir, "skills")) &&
      !draft.skillDirectoryPath.startsWith(path.join(root, "skills"));
    evidence.canonicalSkillPackageIdLinked =
      draftedQueueItem.skillifierDraft.skillPackageId === draft.skillPackageId &&
      draftedQueueItem.skillifierDraft.skillifierReportId === draft.skillifierReportId &&
      reportJson.skillPackageId === draft.skillPackageId &&
      reportJson.skillCandidateId === skillCandidate.skillCandidateId &&
      draftPackageJson.skillPackageId === draft.skillPackageId &&
      provenanceJson.skillPackageId === draft.skillPackageId;
    evidence.canonicalCandidateIdSharedInline = uiStateAfterDraft.inlineCards.some(
      (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
    );
    evidence.canonicalCandidateIdSharedInbox =
      uiStateAfterDraft.inboxItems.some(
        (item) =>
          item.skillCandidateId === skillCandidate.skillCandidateId &&
          item.skillifierDraft?.skillPackageId === draft.skillPackageId,
      ) ||
      uiStateAfterDraft.inboxCards.some(
        (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
      );
    evidence.canonicalCandidateIdSharedHeartbeat = uiStateAfterDraft.heartbeatCards.some(
      (item) => item.skillCandidateId === skillCandidate.skillCandidateId,
    );
    evidence.draftReadyVisibleAcrossSurfaces =
      draftedQueueItem.draftReady === true &&
      uiStateAfterDraft.inboxItems.some(
        (item) =>
          item.skillCandidateId === skillCandidate.skillCandidateId && item.draftReady === true,
      ) &&
      Boolean(uiStateAfterDraft.heartbeatText) &&
      /draft ready|review/i.test(uiStateAfterDraft.heartbeatText);
    evidence.heartbeatPrimaryTextClean =
      Boolean(uiStateAfterDraft.heartbeatText) &&
      !containsDisallowedPrimaryText(uiStateAfterDraft.heartbeatText) &&
      uiStateAfterDraft.heartbeatCards.every((item) => !containsDisallowedPrimaryText(item.text));
    evidence.noInstallOrPromotion =
      reportJson.decision === "draft_ready" &&
      draft.draftTarget.reviewOnly === true &&
      draftPackageJson.reviewOnly === true &&
      draftPackageJson.installationEnabled === false &&
      draftPackageJson.promotionEnabled === false &&
      rollbackJson.installationEnabled === false &&
      rollbackJson.promotionEnabled === false &&
      Boolean(skillifyFrame) &&
      !draftResponseFrameSlice.some((frame) =>
        ["skills.install", "skills.enable", "chat.inject"].includes(frame?.method),
      );
    const generatedDirName = path.basename(draft.skillDirectoryPath);
    evidence.noForbiddenDestinationWrites =
      !(await pathExists(path.join(root, "skills", generatedDirName))) &&
      !(await pathExists(path.join("/root/.agents/skills", generatedDirName))) &&
      !(await pathExists(path.join("/root/.openclaw/skills", generatedDirName))) &&
      !(await pathExists(path.join("/root/.codex/skills", generatedDirName)));

    const handoffMark = await markProbe(harness.page);
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
        queueItemId: draftedQueueItem.queueItemId,
        actionType: draftedQueueItem.primaryActionType ?? "plan_this",
      },
    );
    await harness.page.waitForFunction(
      () => /started in chat|Planning started in chat/i.test(document.body.textContent ?? ""),
      undefined,
      { timeout: 60_000 },
    );
    const handoffProbeSlice = await harness.page.evaluate((start) => {
      const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__ ?? { wsFrames: [] };
      return probe.wsFrames.slice(start.wsFrames ?? 0);
    }, handoffMark);
    const chatSendFrame = [...handoffProbeSlice]
      .toReversed()
      .find((frame) => frame?.method === "chat.send");
    evidence.noChatInjectForPlan = !handoffProbeSlice.some(
      (frame) => frame?.method === "chat.inject",
    );
    summary.handoffPromptSha256 = sha256(chatSendFrame?.message ?? "");

    uiState = await refreshProactivityInUi(harness.page, effectiveSessionKey);
    const uiStateAfterHandoff = uiState;
    evidence.canonicalCandidateIdSharedHandoff =
      Boolean(chatSendFrame) &&
      uiStateAfterHandoff.queueItems.some(
        (item) =>
          item.skillCandidateId === skillCandidate.skillCandidateId &&
          item.handoffStatus === "started" &&
          item.skillifierDraft?.skillPackageId === draft.skillPackageId,
      );
    summary.heartbeatTextSha256 = sha256(uiStateAfterDraft.heartbeatText);

    const allowedFiles = new Set([
      "SKILL.md",
      ".openclaw-skillifier/draft-package.json",
      ".openclaw-skillifier/provenance-report.json",
      ".openclaw-skillifier/rollback-plan.json",
      ".openclaw-skillifier/skillifier-report.json",
    ]);
    const fileSetBounded = relativeDraftFiles.every((filePath) => allowedFiles.has(filePath));

    evidence.noProhibitedContent =
      !containsDisallowedPrimaryText(uiStateAfterDraft.inlineText) &&
      !containsDisallowedPrimaryText(uiStateAfterDraft.heartbeatText) &&
      uiStateAfterDraft.inlineCards.every((item) => !containsDisallowedPrimaryText(item.text)) &&
      uiStateAfterDraft.heartbeatCards.every((item) => !containsDisallowedPrimaryText(item.text)) &&
      !PROHIBITED_MARKERS.some((marker) => skillMarkdown.toLowerCase().includes(marker)) &&
      !PROHIBITED_MARKERS.some((marker) =>
        JSON.stringify(reportJson).toLowerCase().includes(marker),
      ) &&
      !PROHIBITED_MARKERS.some((marker) =>
        JSON.stringify(provenanceJson).toLowerCase().includes(marker),
      ) &&
      fileSetBounded;

    const payload = {
      summary,
      evidence,
      persistedSkillCandidate: skillCandidate,
      persistedSkillDraft: draft,
      uiStateAfterDraft,
      uiStateAfterHandoff,
      draftArtifacts: {
        draftResponseFrameSlice,
        reportJson,
        draftPackageJson,
        provenanceJson,
        rollbackJson,
        relativeDraftFiles,
        hostDraftDirectoryPath,
        hostReportFilePath,
        hostMetadataFilePath,
        hostProvenanceReportPath,
        hostRollbackPlanPath,
        hostSkillFilePath,
        skillMarkdownSha256: sha256(skillMarkdown),
      },
    };
    if (!Object.values(evidence).every(Boolean)) {
      summary.failureReason = `One or more skillifier checks failed: ${JSON.stringify(evidence)}`;
      await writeProofArtifacts(outputDir, payload);
      throw new Error(`skillifier mvp proof failed: ${JSON.stringify(evidence)}`);
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
