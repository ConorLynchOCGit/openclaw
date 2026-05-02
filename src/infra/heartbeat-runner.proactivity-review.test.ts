import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripInboundMetadata } from "../auto-reply/reply/strip-inbound-meta.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resetHeartbeatEventsForTest } from "./heartbeat-events.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import {
  seedMainSessionStore,
  setupTelegramHeartbeatPluginRuntimeForTests,
  withTempHeartbeatSandbox,
} from "./heartbeat-runner.test-utils.js";
import { resetSystemEventsForTest } from "./system-events.js";

beforeEach(() => {
  setupTelegramHeartbeatPluginRuntimeForTests();
  resetHeartbeatEventsForTest();
  resetSystemEventsForTest();
});

afterEach(() => {
  resetHeartbeatEventsForTest();
  resetSystemEventsForTest();
  vi.restoreAllMocks();
});

describe("heartbeat proactivity review", () => {
  it("omits the bounded live proactivity review when only deterministic card text is available", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "telegram",
            },
          },
        },
        channels: { telegram: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionId = "22222222-2222-4222-8222-222222222222";
      const sessionKey = await seedMainSessionStore(storePath, cfg, {
        sessionId,
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "-100155462274",
      });
      const transcriptPath = path.join(tmpDir, `${sessionId}.jsonl`);
      await fs.writeFile(
        transcriptPath,
        [
          JSON.stringify({
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
          }),
          JSON.stringify({
            id: "entry-assistant-1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Plan the runtime seam reset for authoritative proactivity capture.",
                  textSignature: JSON.stringify({
                    v: 1,
                    id: "msg_final_heartbeat_review",
                    phase: "final_answer",
                  }),
                },
              ],
              timestamp: Date.parse("2026-04-27T16:00:08.000Z"),
            },
          }),
        ].join("\n") + "\n",
        "utf8",
      );

      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        chatId: "155462274",
      });
      const getReplySpy = vi.fn().mockResolvedValue({ text: "HEARTBEAT_OK" });

      const result = await runHeartbeatOnce({
        cfg,
        agentId: "main",
        reason: "interval",
        deps: {
          getReplyFromConfig: getReplySpy,
          telegram: sendTelegram,
        },
      });

      expect(result.status).toBe("ran");
      const body = String(getReplySpy.mock.calls[0]?.[0]?.Body ?? "");
      const visibleBody = stripInboundMetadata(body);
      expect(visibleBody).not.toContain("What would help this user today?");
      expect(visibleBody).not.toContain("Plan the runtime seam reset");
      expect(body).not.toContain("Heartbeat runtime context");
      expect(body.toLowerCase()).not.toContain("runtime seam reset for authoritative proactivity");
      expect(getReplySpy).toHaveBeenCalledTimes(1);
      expect(sessionKey).toContain("main");
    });
  });

  it("surfaces model-authored heartbeat items when the model returns no sendable text", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath }) => {
      const cfg: OpenClawConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "telegram",
            },
          },
        },
        channels: { telegram: { allowFrom: ["*"] } },
        session: { store: storePath },
      };
      const sessionId = "33333333-3333-4333-8333-333333333333";
      const sessionKey = await seedMainSessionStore(storePath, cfg, {
        sessionId,
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "-100155462274",
      });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        chatId: "155462274",
      });
      const getReplySpy = vi.fn().mockResolvedValue({ text: "" });
      const buildProactivityReview = vi.fn().mockResolvedValue({
        prompt: "What would help this user today?",
        items: [
          {
            workItemId: "work-item-heartbeat-quality-gate",
            queueItemId: "queue-item-heartbeat-quality-gate",
            opportunityClass: "proactive_plan",
            title: "Heartbeat response quality gate",
            whyNow:
              "A model-reviewed plan is available and should be visible during heartbeat review.",
            proposedNextStep:
              "Review the heartbeat response quality gate before the next live UI proof.",
            expectedUserValue:
              "Prevents silent heartbeat replies from hiding model-authored plans.",
            confidence: "high",
            draftReady: false,
            evidenceSummary: "Model-authored proactivity item from a bounded review packet.",
          },
        ],
        reversePromptItems: [],
        followupItems: [],
        delightItems: [],
        selfHealingItems: [],
        draftReadyItems: [],
        state: {},
      });

      const result = await runHeartbeatOnce({
        cfg,
        agentId: "main",
        reason: "interval",
        deps: {
          buildHeartbeatProactivityReviewText: buildProactivityReview,
          getReplyFromConfig: getReplySpy,
          telegram: sendTelegram,
        } as never,
      });

      expect(result.status).toBe("ran");
      expect(buildProactivityReview).toHaveBeenCalledWith(
        expect.objectContaining({ sessionKey, projectId: "openclaw" }),
      );
      expect(sendTelegram).toHaveBeenCalledTimes(1);
      expect(sendTelegram.mock.calls[0]?.[1]).toContain("Heartbeat response quality gate");
      expect(sendTelegram.mock.calls[0]?.[1]).toContain("Next step:");
      expect(sendTelegram.mock.calls[0]?.[1]).not.toContain("HEARTBEAT_OK");
    });
  });
});
