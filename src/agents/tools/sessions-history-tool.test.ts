// sessions_history tool tests cover recall redaction and input validation for
// session transcript history returned to models.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { callGateway as gatewayCall } from "../../gateway/call.js";

type CallGatewayRequest = Parameters<typeof gatewayCall>[0];

let createSessionsHistoryTool: typeof import("./sessions-history-tool.js").createSessionsHistoryTool;
let previousConfigPath: string | undefined;
let previousStateDir: string | undefined;
let tempDir: string | undefined;

function useLoggingConfig(name: string, logging: Record<string, unknown>): void {
  if (!tempDir) {
    throw new Error("tempDir not initialized");
  }
  const configPath = path.join(tempDir, name);
  fs.writeFileSync(configPath, `${JSON.stringify({ logging })}\n`, "utf8");
  process.env.OPENCLAW_CONFIG_PATH = configPath;
}

function createHistoryToolWithMessage(content: string) {
  return createSessionsHistoryTool({
    config: {},
    callGateway: async <T = Record<string, unknown>>(request: CallGatewayRequest): Promise<T> => {
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "user",
              content,
            },
          ],
        } as T;
      }
      return {} as T;
    },
  });
}

describe("sessions_history redaction", () => {
  beforeAll(async () => {
    previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-sessions-history-redact-"));
    useLoggingConfig("redaction-off.json", { redactSensitive: "off" });
    ({ createSessionsHistoryTool } = await import("./sessions-history-tool.js"));
  });

  afterAll(() => {
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("redacts recalled session text even when log redaction is disabled", async () => {
    // Recalled transcript content is model-visible, so it is always redacted
    // even when normal logging redaction is configured off.
    useLoggingConfig("redaction-off.json", { redactSensitive: "off" });
    const tool = createHistoryToolWithMessage("OPENROUTER_API_KEY=sk-or-v1-abcdef0123456789");

    const result = await tool.execute("call-1", { sessionKey: "main" });
    const serialized = JSON.stringify(result.details);

    expect(serialized).not.toContain("sk-or-v1-abcdef0123456789");
    expect(serialized).toContain("OPENROUTER_API_KEY=");
    expect((result.details as { contentRedacted?: unknown }).contentRedacted).toBe(true);
  });

  it("applies custom redaction patterns to recalled session text", async () => {
    useLoggingConfig("custom-patterns.json", {
      redactSensitive: "off",
      redactPatterns: [String.raw`\binternal-ticket-[A-Za-z0-9]+\b`],
    });
    const tool = createHistoryToolWithMessage("follow up on internal-ticket-AbC12345");

    const result = await tool.execute("call-1", { sessionKey: "main" });
    const serialized = JSON.stringify(result.details);

    expect(serialized).not.toContain("internal-ticket-AbC12345");
    expect(serialized).toContain("intern");
    expect((result.details as { contentRedacted?: unknown }).contentRedacted).toBe(true);
  });

  it.each([0, 1.5])("rejects invalid limit value %s", async (limit) => {
    const tool = createHistoryToolWithMessage("hello");

    await expect(tool.execute("call-1", { sessionKey: "main", limit })).rejects.toThrow(
      "limit must be a positive integer",
    );
  });

  it("resolves openclaw transcript refs to exact assistant message text", async () => {
    if (!tempDir) {
      throw new Error("tempDir not initialized");
    }
    const stateDir = path.join(tempDir, "state-transcript-ref");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    const sessionsDir = path.join(stateDir, "agents", "coding", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionKey = "agent:coding:subagent:child";
    const sessionId = "child-session";
    const messageId = "assistant-message-1";
    const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      `${JSON.stringify({
        [sessionKey]: {
          sessionId,
          sessionFile,
          chatType: "direct",
        },
      })}\n`,
      "utf8",
    );
    fs.writeFileSync(
      sessionFile,
      `${JSON.stringify({
        id: messageId,
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Inspectable child artifact" }],
          timestamp: 1_783_435_000_000,
        },
      })}\n`,
      "utf8",
    );

    const tool = createSessionsHistoryTool({
      agentSessionKey: "agent:reviewer:review-session",
      config: {},
      callGateway: async () => {
        throw new Error("chat.history should not be called for exact transcript refs");
      },
    });
    const ref = `openclaw-transcript://${encodeURIComponent(
      sessionKey,
    )}#message:${encodeURIComponent(messageId)}`;

    const result = await tool.execute("call-ref", { sessionKey: ref });
    const details = result.details as {
      sessionKey?: string;
      transcriptRef?: string;
      messages?: Array<{ role?: string; content?: unknown; id?: string }>;
    };

    expect(details.sessionKey).toBe(sessionKey);
    expect(details.transcriptRef).toBe(ref);
    expect(details.messages).toEqual([
      {
        id: messageId,
        role: "assistant",
        content: "Inspectable child artifact",
        timestamp: 1_783_435_000_000,
      },
    ]);
  });
});
