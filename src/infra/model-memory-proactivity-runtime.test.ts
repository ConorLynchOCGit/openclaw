import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  buildHeartbeatProactivityReviewText,
  buildModelMemoryProactivityRuntimeState,
} from "./model-memory-proactivity-runtime.js";

async function createRuntimeSandbox() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-proactivity-runtime-"));
  const storePath = path.join(tmpDir, "sessions.json");
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const transcriptPath = path.join(tmpDir, `${sessionId}.jsonl`);
  const cfg: OpenClawConfig = {
    agents: {
      defaults: {
        workspace: tmpDir,
      },
    },
    session: {
      store: storePath,
    },
  };
  return { tmpDir, storePath, transcriptPath, sessionId, cfg };
}

async function seedMainSessionTranscript(params: {
  storePath: string;
  transcriptPath: string;
  sessionId: string;
}) {
  await fs.writeFile(
    params.storePath,
    `${JSON.stringify({
      main: {
        sessionId: params.sessionId,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        messageCount: 2,
        lastMessageAt: Date.now(),
      },
    })}\n`,
    "utf8",
  );
  const transcriptLines = [
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
            text: "Plan a runtime seam reset for authoritative proactivity capture.\nInvestigate why the heartbeat still returns HEARTBEAT_OK in live runtime.",
            textSignature: JSON.stringify({
              v: 1,
              id: "msg_final_runtime_reset",
              phase: "final_answer",
            }),
          },
        ],
        timestamp: Date.parse("2026-04-27T16:00:15.000Z"),
      },
    },
  ];
  await fs.writeFile(
    params.transcriptPath,
    `${transcriptLines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8",
  );
}

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("model-memory proactivity runtime", () => {
  it("builds same-session opportunities from authoritative assistant transcript history", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);

    const state = await buildModelMemoryProactivityRuntimeState({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(state.activityStoreReport.store.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey: "main",
          sourceKind: "assistant_turn",
          sourceLabel: "authoritative_transcript",
          sourceMessageId: "msg_final_runtime_reset",
        }),
      ]),
    );
    expect(state.extractionReport.telemetry.candidateCount).toBeGreaterThan(0);
    expect(state.productSurfacingReport.queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending_review",
          layer: "actionable",
          sourceRefs: expect.arrayContaining([
            "chat://main/assistant_turn/msg_final_runtime_reset",
          ]),
        }),
      ]),
    );
  });

  it("builds a bounded heartbeat review from recent authoritative opportunities", async () => {
    const sandbox = await createRuntimeSandbox();
    tmpDirs.push(sandbox.tmpDir);
    await seedMainSessionTranscript(sandbox);

    const review = await buildHeartbeatProactivityReviewText({
      cfg: sandbox.cfg,
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: "operator-conor",
      userId: "conor",
      recipientId: "conor",
    });

    expect(review).not.toBeNull();
    expect(review?.text).toContain("What would help this user today?");
    expect(review?.text).toContain("HEARTBEAT_OK");
    expect(review?.text).toContain("Confidence:");
  });
});
