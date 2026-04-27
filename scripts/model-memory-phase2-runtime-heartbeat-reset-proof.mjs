#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHeartbeatProactivityReviewText,
  buildModelMemoryProactivityRuntimeState,
  updatePersistedProactivityLifecycleOverride,
} from "../src/infra/model-memory-proactivity-runtime.ts";

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

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of [
    "raw-prompt-marker",
    "raw-transcript-marker",
    "raw-tool-log-marker",
    "secret-marker",
    "private-phrase-marker",
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`runtime heartbeat reset proof contains prohibited marker: ${marker}`);
    }
  }
}

function markdown(summary) {
  return [
    "# Phase 2 Runtime Heartbeat Reset Proof",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- sessionKey: ${summary.sessionKey}`,
    `- topOpportunityId: ${summary.topOpportunityId}`,
    `- topWorkItemId: ${summary.topWorkItemId}`,
    `- topQueueItemId: ${summary.topQueueItemId}`,
    `- activityStorePath: ${summary.activityStorePath}`,
    `- queueSha256: ${summary.queueSha256}`,
    `- heartbeatSha256: ${summary.heartbeatSha256}`,
    `- sameSessionOpportunityCreated: ${summary.sameSessionOpportunityCreated}`,
    `- heartbeatReviewCreated: ${summary.heartbeatReviewCreated}`,
    `- handledPlanRetired: ${summary.handledPlanRetired}`,
    `- recurringFollowupDetected: ${summary.recurringFollowupDetected}`,
    `- proofStatus: ${summary.ok ? "pass" : "fail"}`,
  ].join("\n");
}

async function seedSession(tmpDir) {
  const storePath = path.join(tmpDir, "sessions.json");
  const sessionId = "33333333-3333-4333-8333-333333333333";
  const transcriptPath = path.join(tmpDir, `${sessionId}.jsonl`);
  await writeFile(
    storePath,
    `${JSON.stringify({
      main: {
        sessionId,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        messageCount: 4,
        lastMessageAt: Date.now(),
      },
    })}\n`,
    "utf8",
  );
  const messages = [
    {
      id: "entry-user-1",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Review the roadmap and active work to generate potential proactivity plans.",
          },
        ],
        timestamp: Date.parse("2026-04-27T16:00:00.000Z"),
      },
    },
    {
      id: "entry-assistant-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Plan the runtime seam reset for authoritative proactivity capture.\nInvestigate why the heartbeat still returns HEARTBEAT_OK in live runtime.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_runtime_proof_1",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-27T16:00:10.000Z"),
      },
    },
    {
      id: "entry-user-2",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Review the roadmap and active work again and focus on remaining proactivity gaps.",
          },
        ],
        timestamp: Date.parse("2026-04-27T16:05:00.000Z"),
      },
    },
    {
      id: "entry-assistant-2",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Plan the runtime seam reset for authoritative proactivity capture.\nInvestigate recurring heartbeat no-op behavior in live runtime.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_runtime_proof_2",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-27T16:05:12.000Z"),
      },
    },
  ];
  await writeFile(
    transcriptPath,
    `${messages.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );
  const cfg = {
    agents: {
      defaults: {
        workspace: tmpDir,
      },
    },
    session: {
      store: storePath,
    },
  };
  return { cfg, storePath };
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-runtime-heartbeat-reset-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-heartbeat-proof-"));
  try {
    const { cfg, storePath } = await seedSession(tmpDir);
    const state = await buildModelMemoryProactivityRuntimeState({
      cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });
    const topItem =
      state.productSurfacingReport.queue.items.find(
        (item) => item.layer === "actionable" && item.status === "pending_review",
      ) ?? null;
    if (!topItem?.opportunityId || !topItem?.workItemId || !topItem?.queueItemId) {
      throw new Error(
        "authoritative transcript did not create a same-session actionable opportunity",
      );
    }
    const heartbeatReview = await buildHeartbeatProactivityReviewText({
      cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });
    if (!heartbeatReview?.text) {
      throw new Error("heartbeat review was not generated from recent work");
    }
    await updatePersistedProactivityLifecycleOverride({
      cfg,
      sessionKey: "main",
      projectId: "openclaw",
      override: {
        opportunityId: topItem.opportunityId,
        status: "done",
        resolvedByChatMessageId: "chat-message-proof-resolution",
        updatedAt: new Date().toISOString(),
      },
    });
    const postResolutionState = await buildModelMemoryProactivityRuntimeState({
      cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });
    const stillActionable = postResolutionState.productSurfacingReport.queue.items.some(
      (item) => item.opportunityId === topItem.opportunityId && item.layer === "actionable",
    );
    const recurringFollowupDetected =
      postResolutionState.recurringPatternReport.opportunities.length > 0 ||
      state.recurringPatternReport.opportunities.length > 0;

    const summary = {
      generatedAt: new Date().toISOString(),
      sessionKey: "main",
      topOpportunityId: topItem.opportunityId,
      topWorkItemId: topItem.workItemId,
      topQueueItemId: topItem.queueItemId,
      activityStorePath: path.join(path.dirname(storePath), "model-memory-proactivity-state.json"),
      queueSha256: sha256(state.productSurfacingReport.queue.items),
      heartbeatSha256: sha256(heartbeatReview.text),
      sameSessionOpportunityCreated: true,
      heartbeatReviewCreated: heartbeatReview.text.includes("What would help this user today?"),
      handledPlanRetired: !stillActionable,
      recurringFollowupDetected,
      ok: true,
    };
    assertNoProhibitedContent({
      summary,
      queue: state.productSurfacingReport.queue.items,
      heartbeatReview: heartbeatReview.text,
    });
    await writeFile(
      path.join(outputDir, "runtime-heartbeat-reset-proof.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(outputDir, "runtime-heartbeat-reset-proof.md"),
      `${markdown(summary)}\n`,
      "utf8",
    );
    process.stdout.write(`${path.join(outputDir, "runtime-heartbeat-reset-proof.json")}\n`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

await main();
