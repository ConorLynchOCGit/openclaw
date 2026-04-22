#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  OperatorBrowserHarness,
  hasRenderedProgressEvidence,
  readGatewayToken,
} from "./lib/operator-browser-harness.mjs";

const repoRoot = process.cwd();
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

function latestText(groups, roleClass) {
  return (
    [...(groups ?? [])].toReversed().find((group) => group.roleClass === roleClass)?.text ?? ""
  );
}

function latestGroup(groups, roleClass) {
  return [...(groups ?? [])].toReversed().find((group) => group.roleClass === roleClass) ?? null;
}

function labelsFromState(state) {
  return (state?.selectorOptions ?? []).map((entry) => entry.label);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const harness = await new OperatorBrowserHarness({
    headless: true,
    token: readGatewayToken(),
  }).start();
  const results = {};
  const record = async (testId, fn) => {
    try {
      results[testId] = await fn();
    } catch (error) {
      results[testId] = {
        pass: false,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      };
    }
  };

  try {
    await record("uiOperatorReviewSessionPresence", async () => {
      const selectorState = await harness.openSession("main");
      const selectorLabels = labelsFromState(selectorState.state);
      return {
        pass:
          selectorLabels.includes("Daily Operator Review") &&
          selectorLabels.includes("Weekly Operator Review"),
        labels: selectorLabels,
      };
    });

    await record("uiFreshMainBootstrap", async () => {
      const freshNew = await harness.sendPrompt("/new", {
        sessionKey: "main",
        timeoutMs: 120_000,
      });
      const combinedText = [
        freshNew.after.bodyTextSnippet,
        freshNew.after.transcriptTailText,
        freshNew.summary?.lastAssistantText ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        pass: !/\[Bootstrap truncation warning\]/i.test(combinedText),
        assistant: freshNew.summary?.lastAssistantText ?? "",
        transcriptTailText: freshNew.after.transcriptTailText,
      };
    });

    await record("progressReplayParity", async () => {
      const progressPrompt =
        'Use exec to start `bash -lc "for i in 1 2 3 4 5; do echo STEP:$i; sleep 2; done"` in background mode so runtime-owned queued/working status is visible, and keep me posted through normal runtime progress only.';
      const progressTurn = await harness.sendPrompt(progressPrompt, {
        sessionKey: "main",
        waitFor: "progress",
        timeoutMs: 45_000,
      });
      const sessionsDuringProgress = await harness.gotoSessionsView();
      await sleep(12_000);
      const replayTurn = await harness.sendPrompt("Status?", {
        sessionKey: "main",
        timeoutMs: 120_000,
      });
      const dedupeTurn = await harness.sendPrompt("small follow-up", {
        sessionKey: "main",
        timeoutMs: 120_000,
      });
      const replayAssistant = latestText(replayTurn.after.transcriptGroups, "assistant");
      const dedupeAssistant = latestText(dedupeTurn.after.transcriptGroups, "assistant");
      return {
        uiLiveProgressChat: {
          pass: hasRenderedProgressEvidence(progressTurn.after),
          transcriptTailText: progressTurn.after.transcriptTailText,
          queueTitle: progressTurn.after.queueTitle,
          queueItems: progressTurn.after.queueItems,
        },
        uiDetachedReplayOnReturn: {
          pass: /Completed:|Working:|Queued:|STEP:|completed successfully|All \d+ steps ran/i.test(
            replayAssistant,
          ),
          replayAssistant,
        },
        uiReplayDedupeSecondFollowUp: {
          pass: !/Completed:|Working:|Queued:/i.test(dedupeAssistant),
          dedupeAssistant,
        },
        uiSessionUiVsChatParity: {
          pass: sessionsDuringProgress.rows.some((row) =>
            /Queued|Working|Completed/i.test(row.state ?? ""),
          ),
          rows: sessionsDuringProgress.rows,
          bodyTextSnippet: sessionsDuringProgress.bodyTextSnippet,
        },
      };
    });

    await record("uiModelMemoryTokenCaptureRetrieval", async () => {
      const memoryPhaseId = `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tokenValue = `harness-token-${memoryPhaseId}`;
      await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
      await harness.sendPrompt(
        `For test phase ${memoryPhaseId}, remember this exact token for later retrieval and do not substitute any earlier token: ${tokenValue}.`,
        { sessionKey: "main", timeoutMs: 120_000 },
      );
      await harness.sendPrompt("/new", { sessionKey: "main", timeoutMs: 120_000 });
      const tokenRetrievalTurn = await harness.sendPrompt(
        `What exact token did I ask you to remember for test phase ${memoryPhaseId}? Return the token only.`,
        { sessionKey: "main", timeoutMs: 120_000 },
      );
      const assistant = latestText(tokenRetrievalTurn.after.transcriptGroups, "assistant");
      return {
        pass: assistant.includes(tokenValue),
        memoryPhaseId,
        tokenValue,
        assistant,
      };
    });

    await record("ingestReplay", async () => {
      const ingestPrompt = readFirstFencedCodeBlock(deepIngestRunbookPath);
      const ingestProgressTurn = await harness.sendPrompt(ingestPrompt, {
        sessionKey: "main",
        waitFor: "progress",
        timeoutMs: 90_000,
      });
      const ingestTool = latestGroup(ingestProgressTurn.after.transcriptGroups, "tool");
      const combinedProgressText = [
        ingestProgressTurn.after.bodyTextSnippet,
        ingestProgressTurn.after.transcriptTailText,
        ingestTool?.text ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      const ingestLooksActive = /Queued:|Working:|Completed:|ingest|benchmark/i.test(
        combinedProgressText,
      );
      await sleep(15_000);
      const ingestReplayTurn = await harness.sendPrompt("Status?", {
        sessionKey: "main",
        timeoutMs: 120_000,
      });
      const replayAssistant = latestText(ingestReplayTurn.after.transcriptGroups, "assistant");
      return {
        uiDeepIngestRun: {
          pass: ingestLooksActive,
          transcriptTailText: ingestProgressTurn.after.transcriptTailText,
          toolText: ingestTool?.text ?? "",
        },
        uiLiveIngestProgress: {
          pass: hasRenderedProgressEvidence(ingestProgressTurn.after),
          transcriptTailText: ingestProgressTurn.after.transcriptTailText,
          toolText: ingestTool?.text ?? "",
        },
        uiDetachedIngestReplay: {
          pass: /Completed:|Working:|Queued:|ingest|benchmark/i.test(replayAssistant),
          replayAssistant,
        },
      };
    });

    await record("uiSessionSelectorHygieneAfterRuns", async () => {
      const selectorAfterRuns = await harness.openSession("main");
      const finalLabels = labelsFromState(selectorAfterRuns.state);
      return {
        pass:
          finalLabels.every((label) => !/codex|proof|internal/i.test(label)) &&
          finalLabels.includes("Weekly Maintenance Debt Guard"),
        labels: finalLabels,
      };
    });

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
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
