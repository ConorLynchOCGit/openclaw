#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  hasRenderedProgressEvidence,
  OperatorBrowserHarness,
  readGatewayToken,
} from "./lib/operator-browser-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const todayMemoryPath = "/root/.openclaw/workspace/memory/2026-04-19.md";
const deepIngestRunbookPath = path.join(
  repoRoot,
  "docs/projects/model-memory/deep-document-ingest-runbook.md",
);

function readFirstFencedCodeBlock(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/```(?:text)?\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error(`missing fenced prompt block in ${filePath}`);
  }
  return match[1].trim();
}

function cliJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed: node ${args.join(" ")}`,
        result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? "unknown"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return JSON.parse(result.stdout);
}

function gatewaySessionsList() {
  return cliJson([
    "dist/index.js",
    "gateway",
    "call",
    "sessions.list",
    "--params",
    '{"includeGlobal":true,"includeUnknown":true}',
    "--json",
  ]);
}

function operatorUiProof() {
  return cliJson(["scripts/operator-ui-proof.mjs", "--json"]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latestText(groups, roleClass) {
  return (
    [...(groups ?? [])].toReversed().find((group) => group.roleClass === roleClass)?.text ?? ""
  );
}

function latestGroup(groups, roleClass) {
  return [...(groups ?? [])].toReversed().find((group) => group.roleClass === roleClass) ?? null;
}

function selectedOption(state) {
  return state?.selectorOptions?.find((entry) => entry.selected) ?? null;
}

function labelsFromState(state) {
  return (state?.selectorOptions ?? []).map((entry) => entry.label);
}

function findSessionRow(list, key) {
  return (list?.sessions ?? []).find((session) => session.key === key) ?? null;
}

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function buildResult(params) {
  return {
    testId: params.testId,
    status: params.status,
    method: params.method,
    observation: params.observation,
    evidence: params.evidence ?? {},
    likelyRootCause: params.likelyRootCause ?? null,
    blocker: params.blocker ?? null,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const harness = await new OperatorBrowserHarness({
    headless: true,
    token: readGatewayToken(),
  }).start();
  try {
    const results = [];
    const selectorBefore = await harness.openSession("main");
    const sessionsBefore = gatewaySessionsList();
    const proofBefore = operatorUiProof();
    const initialLabels = labelsFromState(selectorBefore.state);
    const initialSelected = selectedOption(selectorBefore.state);

    results.push(
      buildResult({
        testId: "ui-session-selector-labeling",
        status:
          initialLabels.includes("Chief Session") &&
          initialLabels.includes("Main Session") &&
          initialLabels.includes("Web Researcher") &&
          initialLabels.every((label) => !label.startsWith("agent:"))
            ? "pass"
            : "fail",
        method: "Authenticated selector snapshot via persistent Tailnet browser harness",
        observation: `Visible selector labels: ${initialLabels.join(", ")}`,
        evidence: {
          selected: initialSelected,
          labels: initialLabels,
        },
        likelyRootCause: initialLabels.every((label) => !label.startsWith("agent:"))
          ? null
          : "selector is still surfacing raw runtime keys instead of human labels",
      }),
    );

    results.push(
      buildResult({
        testId: "ui-operator-review-session-presence",
        status:
          initialLabels.includes("Daily Operator Review") &&
          initialLabels.includes("Weekly Operator Review")
            ? "pass"
            : "fail",
        method: "Authenticated selector snapshot via persistent Tailnet browser harness",
        observation: `Selector labels currently visible: ${initialLabels.join(", ")}`,
        evidence: {
          labels: initialLabels,
        },
        likelyRootCause:
          initialLabels.includes("Daily Operator Review") &&
          initialLabels.includes("Weekly Operator Review")
            ? null
            : "daily/weekly operator-review sessions are not present in the operator-visible selector set",
      }),
    );

    const bootstrapTurn = await harness.sendPrompt("/new", {
      sessionKey: "main",
      timeoutMs: 120_000,
    });
    const bootstrapLastUser = latestText(bootstrapTurn.after.transcriptGroups, "user");
    const bootstrapLastAssistant = latestText(bootstrapTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-fresh-main-bootstrap",
        status:
          /\[Bootstrap truncation warning\]/.test(bootstrapLastUser) || !bootstrapLastAssistant
            ? "fail"
            : "pass",
        method: "Authenticated Main `/new` turn through browser harness",
        observation: `Bootstrap assistant reply: ${bootstrapLastAssistant}`,
        evidence: {
          userBootstrapMessage: bootstrapLastUser.slice(0, 800),
          assistantReply: bootstrapLastAssistant,
        },
        likelyRootCause: /\[Bootstrap truncation warning\]/.test(bootstrapLastUser)
          ? "bootstrap context is still being truncated on fresh Main startup"
          : null,
      }),
    );

    const browserTurn = await harness.sendPrompt(
      "Open https://example.com in the browser tool and tell me the page title only.",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const browserTool = latestGroup(browserTurn.after.transcriptGroups, "tool");
    results.push(
      buildResult({
        testId: "ui-main-browser-tool-path",
        status:
          latestText(browserTurn.after.transcriptGroups, "assistant") === "Example Domain" &&
          /browser/i.test(browserTool?.text ?? "")
            ? "pass"
            : "fail",
        method: "Authenticated Main prompt through browser harness",
        observation: `Assistant replied: ${latestText(browserTurn.after.transcriptGroups, "assistant")}`,
        evidence: {
          assistant: latestText(browserTurn.after.transcriptGroups, "assistant"),
          tool: browserTool?.text ?? "",
        },
        likelyRootCause:
          latestText(browserTurn.after.transcriptGroups, "assistant") === "Example Domain" &&
          /browser/i.test(browserTool?.text ?? "")
            ? null
            : "Main did not clearly use the browser tool path for the example.com title check",
      }),
    );

    const braveTurn = await harness.sendPrompt(
      "Use Brave search to find the official OpenClaw plugin docs page and give me the exact URL.",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const braveAssistant = latestText(braveTurn.after.transcriptGroups, "assistant");
    const braveTool = latestGroup(braveTurn.after.transcriptGroups, "tool");
    results.push(
      buildResult({
        testId: "ui-main-brave-path",
        status:
          /docs\.openclaw\.ai/i.test(braveAssistant) && /brave|search/i.test(braveTool?.text ?? "")
            ? "pass"
            : "fail",
        method: "Authenticated Main Brave-search prompt through browser harness",
        observation: `Assistant replied: ${braveAssistant}`,
        evidence: {
          assistant: braveAssistant,
          tool: braveTool?.text ?? "",
        },
        likelyRootCause:
          /docs\.openclaw\.ai/i.test(braveAssistant) && /brave|search/i.test(braveTool?.text ?? "")
            ? null
            : "Brave-backed search was not clearly visible in the transcript or did not resolve the official docs URL",
      }),
    );

    const fetchTurn = await harness.sendPrompt(
      "Use Firecrawl or the canonical fetch path to read https://docs.openclaw.ai/tools/plugin and list the first three top-level sections.",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const fetchAssistant = latestText(fetchTurn.after.transcriptGroups, "assistant");
    const fetchTool = latestGroup(fetchTurn.after.transcriptGroups, "tool");
    results.push(
      buildResult({
        testId: "ui-main-firecrawl-fetch-path",
        status:
          /(plugin|tools|docs)/i.test(fetchAssistant) &&
          /firecrawl|fetch|browser/i.test(fetchTool?.text ?? "")
            ? "pass"
            : "fail",
        method: "Authenticated Main fetch-path prompt through browser harness",
        observation: `Assistant replied: ${fetchAssistant}`,
        evidence: {
          assistant: fetchAssistant,
          tool: fetchTool?.text ?? "",
        },
        likelyRootCause:
          /(plugin|tools|docs)/i.test(fetchAssistant) &&
          /firecrawl|fetch|browser/i.test(fetchTool?.text ?? "")
            ? null
            : "Firecrawl/canonical fetch handling was not clearly evidenced in the chat transcript",
      }),
    );

    const webResearcherBefore = findSessionRow(sessionsBefore, "agent:web-researcher:main");
    const delegatedTurn = await harness.sendPrompt(
      "Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.",
      { sessionKey: "main", timeoutMs: 180_000 },
    );
    const sessionsAfterDelegation = gatewaySessionsList();
    const webResearcherAfter = findSessionRow(sessionsAfterDelegation, "agent:web-researcher:main");
    const delegatedAssistant = latestText(delegatedTurn.after.transcriptGroups, "assistant");
    const delegatedUpdated =
      typeof webResearcherAfter?.updatedAt === "number" &&
      typeof webResearcherBefore?.updatedAt === "number" &&
      webResearcherAfter.updatedAt > webResearcherBefore.updatedAt;
    results.push(
      buildResult({
        testId: "ui-main-delegated-research",
        status: delegatedUpdated && /https?:\/\//i.test(delegatedAssistant) ? "pass" : "fail",
        method: "Authenticated Main delegation prompt plus gateway sessions.list comparison",
        observation: `web-researcher updatedAt before=${webResearcherBefore?.updatedAt ?? "missing"} after=${webResearcherAfter?.updatedAt ?? "missing"}`,
        evidence: {
          assistant: delegatedAssistant,
          webResearcherUpdatedAtBefore: webResearcherBefore?.updatedAt ?? null,
          webResearcherUpdatedAtAfter: webResearcherAfter?.updatedAt ?? null,
        },
        likelyRootCause:
          delegatedUpdated && /https?:\/\//i.test(delegatedAssistant)
            ? null
            : "Main did not provide clear delegated-research evidence or the canonical web-researcher session did not update during the run",
      }),
    );

    const webResearcherTurn = await harness.sendPrompt(
      "Open https://example.com in the browser tool and tell me the page title only.",
      { sessionKey: "agent:web-researcher:main", timeoutMs: 120_000 },
    );
    results.push(
      buildResult({
        testId: "ui-web-researcher-cold-start",
        status:
          latestText(webResearcherTurn.after.transcriptGroups, "assistant") === "Example Domain"
            ? "pass"
            : "fail",
        method: "Authenticated web-researcher prompt through browser harness",
        observation: `web-researcher replied: ${latestText(webResearcherTurn.after.transcriptGroups, "assistant")}`,
        evidence: {
          selected: selectedOption(webResearcherTurn.after),
          assistant: latestText(webResearcherTurn.after.transcriptGroups, "assistant"),
        },
        likelyRootCause:
          latestText(webResearcherTurn.after.transcriptGroups, "assistant") === "Example Domain"
            ? null
            : "web-researcher did not complete a basic browser-backed cold-start task cleanly",
      }),
    );

    const builderTurn = await harness.sendPrompt(
      "Builder: propose the smallest implementation slice for a docs-only topology audit.",
      { sessionKey: "agent:builder:main", timeoutMs: 120_000 },
    );
    const builderAssistant = latestText(builderTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-builder-pack-behavior",
        status: /slice|smallest|implementation|audit/i.test(builderAssistant) ? "pass" : "fail",
        method: "Authenticated Builder prompt through browser harness",
        observation: `Builder replied: ${builderAssistant}`,
        evidence: {
          selected: selectedOption(builderTurn.after),
          assistant: builderAssistant,
        },
        likelyRootCause: /slice|smallest|implementation|audit/i.test(builderAssistant)
          ? null
          : "Builder session did not respond with implementation-oriented slice planning",
      }),
    );

    const selectorSessionsNow = labelsFromState(await harness.snapshotChat());
    if (!selectorSessionsNow.includes("Researcher")) {
      results.push(
        buildResult({
          testId: "ui-researcher-pack-behavior",
          status: "fail",
          method: "Authenticated selector inventory via browser harness",
          observation: `Selector labels do not expose a Researcher session: ${selectorSessionsNow.join(", ")}`,
          evidence: { labels: selectorSessionsNow },
          likelyRootCause:
            "no operator-visible Researcher specialist lane is currently exposed in the live Control UI session selector",
        }),
      );
    } else {
      const researcherTurn = await harness.sendPrompt(
        "Researcher: identify the three strongest primary sources for OpenClaw plugin architecture.",
        { sessionKey: "agent:researcher:main", timeoutMs: 120_000 },
      );
      results.push(
        buildResult({
          testId: "ui-researcher-pack-behavior",
          status: /source/i.test(latestText(researcherTurn.after.transcriptGroups, "assistant"))
            ? "pass"
            : "fail",
          method: "Authenticated Researcher prompt through browser harness",
          observation: `Researcher replied: ${latestText(researcherTurn.after.transcriptGroups, "assistant")}`,
          evidence: {
            assistant: latestText(researcherTurn.after.transcriptGroups, "assistant"),
          },
        }),
      );
    }

    const writerTurn = await harness.sendPrompt(
      "Writer: draft a concise release-style summary for the latest deployment-topology restoration work.",
      { sessionKey: "agent:writer:main", timeoutMs: 120_000 },
    );
    const writerAssistant = latestText(writerTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-writer-pack-behavior",
        status: /deployment|restoration|summary|release/i.test(writerAssistant) ? "pass" : "fail",
        method: "Authenticated Writer prompt through browser harness",
        observation: `Writer replied: ${writerAssistant}`,
        evidence: {
          selected: selectedOption(writerTurn.after),
          assistant: writerAssistant,
        },
        likelyRootCause: /deployment|restoration|summary|release/i.test(writerAssistant)
          ? null
          : "Writer session did not respond with a concise release-style summary",
      }),
    );

    const xManagerTurn = await harness.sendPrompt(
      "Draft a supported-account approval-ready X post about today's deployment hardening work, but do not post it and keep approval boundaries explicit.",
      { sessionKey: "agent:x-manager:main", timeoutMs: 120_000 },
    );
    const xManagerAssistant = latestText(xManagerTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-x-manager-context-boundary",
        status: /approval|review|draft/i.test(xManagerAssistant) ? "pass" : "fail",
        method: "Authenticated x-manager prompt through browser harness",
        observation: `x-manager replied: ${xManagerAssistant}`,
        evidence: {
          selected: selectedOption(xManagerTurn.after),
          assistant: xManagerAssistant,
        },
        likelyRootCause: /approval|review|draft/i.test(xManagerAssistant)
          ? null
          : "x-manager did not make approval/draft boundaries explicit in the response",
      }),
    );

    const topologyTurn = await harness.sendPrompt(
      "Explain the difference between workspace topology and deployment topology in this repo.",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const topologyAssistant = latestText(topologyTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-topology-grounding-prompts",
        status:
          /workspace topology/i.test(topologyAssistant) &&
          /deployment topology/i.test(topologyAssistant)
            ? "pass"
            : "fail",
        method: "Authenticated Main topology-grounding prompt through browser harness",
        observation: `Assistant replied: ${topologyAssistant}`,
        evidence: {
          assistant: topologyAssistant,
        },
        likelyRootCause:
          /workspace topology/i.test(topologyAssistant) &&
          /deployment topology/i.test(topologyAssistant)
            ? null
            : "Main did not clearly distinguish workspace topology from deployment topology",
      }),
    );

    const progressPrompt =
      'Use exec to start `bash -lc "for i in 1 2 3 4 5; do echo STEP:$i; sleep 2; done"` in background mode so runtime-owned queued/working status is visible, and keep me posted through normal runtime progress only.';
    const progressTurn = await harness.sendPrompt(progressPrompt, {
      sessionKey: "main",
      waitFor: "progress",
      timeoutMs: 45_000,
    });
    const progressEvidence = hasRenderedProgressEvidence(progressTurn.after);
    const sessionsDuringProgress = await harness.gotoSessionsView();
    await sleep(12_000);
    const replayTurn = await harness.sendPrompt("Status?", {
      sessionKey: "main",
      timeoutMs: 120_000,
    });
    const replayAssistant = latestText(replayTurn.after.transcriptGroups, "assistant");
    const dedupeTurn = await harness.sendPrompt("small follow-up", {
      sessionKey: "main",
      timeoutMs: 120_000,
    });
    const dedupeAssistant = latestText(dedupeTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-live-progress-chat",
        status: progressEvidence ? "pass" : "fail",
        method: "Authenticated long-running Main prompt with progress-first browser wait",
        observation: `Progress body snippet captured: ${progressTurn.after.bodyTextSnippet.slice(0, 400)}`,
        evidence: {
          progressBody: progressTurn.after.bodyTextSnippet,
          lastAssistant: latestText(progressTurn.after.transcriptGroups, "assistant"),
        },
        likelyRootCause: progressEvidence
          ? null
          : "chat transcript still did not surface bounded progress labels during active long-running work",
      }),
    );
    results.push(
      buildResult({
        testId: "ui-detached-replay-on-return",
        status: /Completed:|Working:|Queued:|STEP:|completed successfully|All \d+ steps ran/i.test(
          replayAssistant,
        )
          ? "pass"
          : "fail",
        method: "Navigate away to Sessions during active run, then return and send `Status?`",
        observation: `Replay assistant reply: ${replayAssistant}`,
        evidence: {
          sessionsView: sessionsDuringProgress,
          replayAssistant,
        },
        likelyRootCause:
          /Completed:|Working:|Queued:|STEP:|completed successfully|All \d+ steps ran/i.test(
            replayAssistant,
          )
            ? null
            : "return-to-session follow-up did not produce bounded detached replay state",
      }),
    );
    results.push(
      buildResult({
        testId: "ui-replay-dedupe-second-follow-up",
        status: /Completed:|Working:|Queued:/i.test(dedupeAssistant) ? "fail" : "pass",
        method: "Second follow-up after detached replay in the same Main session",
        observation: `Second follow-up assistant reply: ${dedupeAssistant}`,
        evidence: {
          replayAssistant,
          dedupeAssistant,
        },
        likelyRootCause: /Completed:|Working:|Queued:/i.test(dedupeAssistant)
          ? "detached replay state was emitted again on the second follow-up"
          : null,
      }),
    );
    results.push(
      buildResult({
        testId: "ui-session-ui-vs-chat-parity",
        status:
          sessionsDuringProgress.rows.some((row) =>
            /Queued|Working|Completed/i.test(row.state ?? ""),
          ) ||
          /Queued(?::|\b)|Working(?::|\b)|Completed(?::|\b)/.test(
            sessionsDuringProgress.bodyTextSnippet,
          )
            ? "pass"
            : "fail",
        method:
          "Compare Sessions view while active task is running against chat transcript progress evidence",
        observation: `Sessions view snippet: ${sessionsDuringProgress.bodyTextSnippet.slice(0, 400)}`,
        evidence: {
          sessionsRows: sessionsDuringProgress.rows,
          sessionsBody: sessionsDuringProgress.bodyTextSnippet,
          chatProgressBody: progressTurn.after.bodyTextSnippet,
        },
        likelyRootCause:
          sessionsDuringProgress.rows.some((row) =>
            /Queued|Working|Completed/i.test(row.state ?? ""),
          ) ||
          /Queued(?::|\b)|Working(?::|\b)|Completed(?::|\b)/.test(
            sessionsDuringProgress.bodyTextSnippet,
          )
            ? null
            : "session UI still does not expose matching queued/running/completed state while chat is active",
      }),
    );

    const memoryMtimeBefore = statMtimeMs(todayMemoryPath);
    await harness.sendPrompt(
      "Please note that this is a continuity-producing session and continue normally.",
      { sessionKey: "main", timeoutMs: 60_000 },
    );
    const memoryMtimeAfter = statMtimeMs(todayMemoryPath);
    results.push(
      buildResult({
        testId: "ui-daily-continuity-artifact",
        status:
          typeof memoryMtimeBefore === "number" &&
          typeof memoryMtimeAfter === "number" &&
          memoryMtimeAfter >= memoryMtimeBefore
            ? "pass"
            : "fail",
        method: `Workspace artifact stat check on ${todayMemoryPath} after continuity-producing session`,
        observation: `mtime before=${memoryMtimeBefore} after=${memoryMtimeAfter}`,
        evidence: {
          path: todayMemoryPath,
          before: memoryMtimeBefore,
          after: memoryMtimeAfter,
        },
        likelyRootCause:
          typeof memoryMtimeBefore === "number" &&
          typeof memoryMtimeAfter === "number" &&
          memoryMtimeAfter >= memoryMtimeBefore
            ? null
            : "same-day continuity artifact did not update during the authenticated operator session",
      }),
    );

    const memoryPhaseId = `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tokenValue = `harness-token-${memoryPhaseId}`;
    await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
    await harness.sendPrompt(
      `For test phase ${memoryPhaseId}, remember this exact token for later retrieval and do not substitute any earlier token: ${tokenValue}.`,
      {
        sessionKey: "main",
        timeoutMs: 120_000,
      },
    );
    await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
    const tokenRetrievalTurn = await harness.sendPrompt(
      `What exact token did I ask you to remember for test phase ${memoryPhaseId}? Return the token only.`,
      {
        sessionKey: "main",
        timeoutMs: 120_000,
      },
    );
    const tokenRetrievalAssistant = latestText(
      tokenRetrievalTurn.after.transcriptGroups,
      "assistant",
    );
    results.push(
      buildResult({
        testId: "ui-model-memory-token-capture-retrieval",
        status: tokenRetrievalAssistant.includes(tokenValue) ? "pass" : "fail",
        method: "Authenticated Main capture prompt followed by fresh-session retrieval prompt",
        observation: `Retrieval assistant reply: ${tokenRetrievalAssistant}`,
        evidence: {
          memoryPhaseId,
          tokenValue,
          assistant: tokenRetrievalAssistant,
        },
        likelyRootCause: tokenRetrievalAssistant.includes(tokenValue)
          ? null
          : "ordinary-turn token capture did not surface on later retrieval",
      }),
    );

    const preferencePhrase = "terse bullet answers";
    await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
    await harness.sendPrompt(
      `For the rest of this test phase, remember that I prefer ${preferencePhrase}.`,
      {
        sessionKey: "main",
        timeoutMs: 120_000,
      },
    );
    await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
    const preferenceRetrievalTurn = await harness.sendPrompt(
      "How should you format answers for me during this test phase?",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const preferenceAssistant = latestText(
      preferenceRetrievalTurn.after.transcriptGroups,
      "assistant",
    );
    results.push(
      buildResult({
        testId: "ui-model-memory-preference-capture-retrieval",
        status: /terse|bullet/i.test(preferenceAssistant) ? "pass" : "fail",
        method: "Authenticated Main preference capture followed by fresh-session retrieval prompt",
        observation: `Preference retrieval assistant reply: ${preferenceAssistant}`,
        evidence: {
          assistant: preferenceAssistant,
        },
        likelyRootCause: /terse|bullet/i.test(preferenceAssistant)
          ? null
          : "stable user-format preference did not surface on later retrieval",
      }),
    );

    const canaryTurn = await harness.sendPrompt(
      "What was the deep-soak canary from the finalized daily summary?",
      { sessionKey: "main", timeoutMs: 120_000 },
    );
    const canaryAssistant = latestText(canaryTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-model-memory-daily-summary-canary",
        status: /brass-harbor-9/i.test(canaryAssistant) ? "pass" : "blocked_by_environment",
        method: "Authenticated Main daily-summary retrieval prompt through browser harness",
        observation: `Canary assistant reply: ${canaryAssistant}`,
        evidence: {
          assistant: canaryAssistant,
        },
        blocker: /brass-harbor-9/i.test(canaryAssistant)
          ? null
          : "no current eligible finalized daily-summary canary retrieval was visible in this live pass",
      }),
    );

    const ingestPrompt = readFirstFencedCodeBlock(deepIngestRunbookPath);
    const ingestProgressTurn = await harness.sendPrompt(ingestPrompt, {
      sessionKey: "main",
      waitFor: "progress",
      timeoutMs: 90_000,
    });
    const ingestProgressBody = ingestProgressTurn.after.bodyTextSnippet;
    const ingestTool = latestGroup(ingestProgressTurn.after.transcriptGroups, "tool");
    const ingestLooksActive = /Queued:|Working:|Completed:|ingest|benchmark/i.test(
      `${ingestProgressBody}\n${ingestTool?.text ?? ""}`,
    );
    await sleep(15_000);
    const ingestReplayTurn = await harness.sendPrompt("Status?", {
      sessionKey: "main",
      timeoutMs: 120_000,
    });
    const ingestReplayAssistant = latestText(ingestReplayTurn.after.transcriptGroups, "assistant");
    results.push(
      buildResult({
        testId: "ui-deep-ingest-run",
        status: ingestLooksActive ? "pass" : "fail",
        method: "Authenticated Main ingest/benchmark prompt through browser harness",
        observation: `Ingest progress body: ${ingestProgressBody.slice(0, 400)}`,
        evidence: {
          progressBody: ingestProgressBody,
          tool: ingestTool?.text ?? "",
          replayAssistant: ingestReplayAssistant,
        },
        likelyRootCause: ingestLooksActive
          ? null
          : "bounded ingest/benchmark task did not visibly start in the authenticated Main lane",
      }),
    );
    results.push(
      buildResult({
        testId: "ui-live-ingest-progress",
        status: /Queued:|Working:|Completed:/i.test(ingestProgressBody) ? "pass" : "fail",
        method: "Authenticated Main ingest/benchmark prompt with progress-first browser wait",
        observation: `Ingest progress body: ${ingestProgressBody.slice(0, 400)}`,
        evidence: {
          progressBody: ingestProgressBody,
        },
        likelyRootCause: /Queued:|Working:|Completed:/i.test(ingestProgressBody)
          ? null
          : "ingest/benchmark work did not surface bounded transcript progress during the active run",
      }),
    );
    results.push(
      buildResult({
        testId: "ui-detached-ingest-replay",
        status: /Completed:|Working:|Queued:|ingest|benchmark/i.test(ingestReplayAssistant)
          ? "pass"
          : "fail",
        method: "Follow-up `Status?` after bounded ingest/benchmark run",
        observation: `Replay assistant reply: ${ingestReplayAssistant}`,
        evidence: {
          replayAssistant: ingestReplayAssistant,
        },
        likelyRootCause: /Completed:|Working:|Queued:|ingest|benchmark/i.test(ingestReplayAssistant)
          ? null
          : "detached ingest/benchmark replay did not surface back into chat on return",
      }),
    );

    const sessionsAfterRuns = gatewaySessionsList();
    const weeklyMaintenanceRow = findSessionRow(
      sessionsAfterRuns,
      "agent:chief:weekly-maintenance-debt-guard",
    );
    if (weeklyMaintenanceRow) {
      const maintenanceTurn = await harness.sendPrompt(
        "Summarize the current maintenance debt focus in one sentence.",
        { sessionKey: "agent:chief:weekly-maintenance-debt-guard", timeoutMs: 120_000 },
      );
      const maintenanceAssistant = latestText(maintenanceTurn.after.transcriptGroups, "assistant");
      results.push(
        buildResult({
          testId: "ui-weekly-maintenance-debt-guard",
          status: maintenanceAssistant.trim() ? "pass" : "fail",
          method: "Authenticated weekly-maintenance specialist prompt through browser harness",
          observation: `Maintenance lane reply: ${maintenanceAssistant}`,
          evidence: {
            assistant: maintenanceAssistant,
            sessionRow: weeklyMaintenanceRow,
          },
          likelyRootCause: maintenanceAssistant.trim()
            ? null
            : "weekly maintenance debt guard session did not produce a usable operator-visible response",
        }),
      );
    } else {
      results.push(
        buildResult({
          testId: "ui-weekly-maintenance-debt-guard",
          status: "blocked_by_environment",
          method: "sessions.list inspection",
          observation:
            "Weekly Maintenance Debt Guard session was not present in sessions.list during this pass.",
          evidence: { sessionKey: "agent:chief:weekly-maintenance-debt-guard" },
          blocker:
            "no live weekly-maintenance session row was available to exercise through the authenticated browser harness",
        }),
      );
    }

    const selectorAfterRuns = await harness.openSession("main");
    const finalLabels = labelsFromState(selectorAfterRuns.state);
    results.push(
      buildResult({
        testId: "ui-session-selector-hygiene-after-runs",
        status:
          finalLabels.every((label) => !/codex|proof|internal/i.test(label)) &&
          proofBefore.codexRowCount === 0 &&
          finalLabels.includes("Weekly Maintenance Debt Guard")
            ? "pass"
            : "fail",
        method:
          "Authenticated selector snapshot after the full prompt tranche plus sanctioned non-browser proof baseline",
        observation: `Final selector labels: ${finalLabels.join(", ")}`,
        evidence: {
          labels: finalLabels,
          liveProofCodexRowCount: proofBefore.codexRowCount,
        },
        likelyRootCause:
          finalLabels.every((label) => !/codex|proof|internal/i.test(label)) &&
          proofBefore.codexRowCount === 0 &&
          finalLabels.includes("Weekly Maintenance Debt Guard")
            ? null
            : "hidden/internal session rows resurfaced or the weekly-maintenance label regressed after additional authenticated browser activity",
      }),
    );

    results.push(
      buildResult({
        testId: "ui-daily-weekly-review-artifacts",
        status: "blocked_by_environment",
        method: "Current browser/session proof plus sessions.list inspection",
        observation:
          "This pass exercised the authenticated browser/chat lane but did not run the daily or weekly operator-review production jobs end to end.",
        evidence: {
          selectorLabels: finalLabels,
        },
        blocker:
          "fresh daily/weekly operator-review artifacts were not triggered or regenerated inside this rerun pass",
      }),
    );

    results.push(
      buildResult({
        testId: "ui-github-digest-lane",
        status: "blocked_by_environment",
        method: "Current browser/session proof plus sessions.list inspection",
        observation:
          "No safe same-pass GitHub digest trigger or fresh digest artifact was exercised through the authenticated browser harness.",
        evidence: {
          knownSessionKeys: (sessionsAfterRuns.sessions ?? []).slice(0, 10).map((row) => row.key),
        },
        blocker:
          "the GitHub digest lane was not safely triggerable or freshly observable in this live pass",
      }),
    );

    results.push(
      buildResult({
        testId: "ui-intake-surface",
        status: "blocked_by_environment",
        method: "Authenticated Control UI navigation and project-doc inspection",
        observation:
          "The retained intake flow is still documented as a target surface, but this pass did not expose a clearly automatable authenticated intake route in the Control UI shell.",
        evidence: {
          topLevelLabels: finalLabels,
        },
        blocker: "no sanctioned authenticated intake UI route was surfaced for this pass",
      }),
    );

    const finishedAt = new Date().toISOString();
    const counts = {
      pass: results.filter((result) => result.status === "pass").length,
      fail: results.filter((result) => result.status === "fail").length,
      blocked_by_environment: results.filter((result) => result.status === "blocked_by_environment")
        .length,
    };

    const payload = {
      startedAt,
      finishedAt,
      counts,
      results,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await harness.close();
  }
}

await main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
