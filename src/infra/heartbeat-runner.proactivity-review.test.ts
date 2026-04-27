import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("uses the bounded live proactivity review when same-session opportunities exist", async () => {
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
      expect(body).toContain("What would help this user today?");
      expect(body).toContain("Plan the runtime seam reset");
      expect(String(sendTelegram.mock.calls[0]?.[1] ?? "")).toContain(
        "What would help this user today?",
      );
      expect(sessionKey).toContain("main");
    });
  });
});
