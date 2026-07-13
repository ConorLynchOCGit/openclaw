// Verifies sessions_history visibility defaults and sandbox clamps.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionsHistoryTool } from "./tools/sessions-history-tool.js";

const callGatewayMock = vi.fn();
vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

let mockConfig: Record<string, unknown> = {
  session: { mainKey: "main", scope: "per-sender" },
};
vi.mock("../config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../config/config.js")>("../config/config.js");
  return {
    ...actual,
    getRuntimeConfig: () => mockConfig,
    resolveGatewayPort: () => 18789,
  };
});
function getSessionsHistoryTool(options?: { sandboxed?: boolean; agentSessionKey?: string }) {
  return createSessionsHistoryTool({
    agentSessionKey: options?.agentSessionKey ?? "main",
    sandboxed: options?.sandboxed,
    config: mockConfig as never,
    callGateway: (opts: unknown) => callGatewayMock(opts),
  });
}

function mockGatewayWithHistory(
  extra?: (req: { method?: string; params?: Record<string, unknown> }) => unknown,
) {
  // Most visibility tests need chat.history plus optional session resolution/listing.
  callGatewayMock.mockClear();
  callGatewayMock.mockImplementation(async (opts: unknown) => {
    const req = opts as { method?: string; params?: Record<string, unknown> };
    const handled = extra?.(req);
    if (handled !== undefined) {
      return handled;
    }
    if (req.method === "chat.history") {
      return { messages: [{ role: "assistant", content: [{ type: "text", text: "ok" }] }] };
    }
    return {};
  });
}

describe("sessions tools visibility", () => {
  beforeEach(() => {
    callGatewayMock.mockClear();
  });

  it("defaults to tree visibility (self + spawned) for sessions_history", async () => {
    mockConfig = {
      session: { mainKey: "main", scope: "per-sender" },
      tools: { agentToAgent: { enabled: false } },
    };
    mockGatewayWithHistory((req) => {
      if (req.method === "sessions.list" && req.params?.spawnedBy === "main") {
        return { sessions: [{ key: "subagent:child-1" }] };
      }
      if (req.method === "sessions.resolve") {
        const key = typeof req.params?.key === "string" ? req.params.key : "";
        return { key };
      }
      return undefined;
    });

    const tool = getSessionsHistoryTool();

    const denied = await tool.execute("call1", {
      sessionKey: "agent:main:quietchat:direct:someone-else",
    });
    expect((denied.details as { status?: string }).status).toBe("forbidden");

    const allowed = await tool.execute("call2", { sessionKey: "subagent:child-1" });
    expect((allowed.details as { sessionKey?: string }).sessionKey).toBe("subagent:child-1");
  });

  it("allows broader access when tools.sessions.visibility=all", async () => {
    mockConfig = {
      session: { mainKey: "main", scope: "per-sender" },
      tools: { sessions: { visibility: "all" }, agentToAgent: { enabled: false } },
    };
    mockGatewayWithHistory();
    const tool = getSessionsHistoryTool();

    const result = await tool.execute("call3", {
      sessionKey: "agent:main:quietchat:direct:someone-else",
    });
    expect((result.details as { sessionKey?: string }).sessionKey).toBe(
      "agent:main:quietchat:direct:someone-else",
    );
  });

  it("clamps sandboxed sessions to tree when agents.defaults.sandbox.sessionToolsVisibility=spawned", async () => {
    mockConfig = {
      session: { mainKey: "main", scope: "per-sender" },
      tools: { sessions: { visibility: "all" }, agentToAgent: { enabled: true, allow: ["*"] } },
      agents: { defaults: { sandbox: { sessionToolsVisibility: "spawned" } } },
    };
    mockGatewayWithHistory((req) => {
      if (req.method === "sessions.list" && req.params?.spawnedBy === "main") {
        return { sessions: [] };
      }
      return undefined;
    });

    const tool = getSessionsHistoryTool({ sandboxed: true });

    const denied = await tool.execute("call4", {
      sessionKey: "agent:other:main",
    });
    expect((denied.details as { status?: string }).status).toBe("forbidden");
  });

  it("allows a direct child to read an exact parent session ref without broad history visibility", async () => {
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-parent-session-ref-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;
    const childSessionKey = "agent:business-ops:subagent:child-1";
    const parentSessionKey = "agent:main:main";
    const unrelatedSessionKey = "agent:main:other";
    const sessionsDir = path.join(stateDir, "agents", "business-ops", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      `${JSON.stringify({
        [childSessionKey]: {
          sessionId: "child-session-id",
          updatedAt: Date.now(),
          spawnedBy: parentSessionKey,
        },
      })}\n`,
      "utf8",
    );

    try {
      mockConfig = {
        session: { mainKey: "main", scope: "per-sender" },
        tools: { agentToAgent: { enabled: false } },
      };
      mockGatewayWithHistory((req) => {
        if (req.method === "sessions.resolve") {
          return { key: req.params?.key };
        }
        if (req.method === "sessions.list") {
          return { sessions: [] };
        }
        return undefined;
      });
      const tool = getSessionsHistoryTool({ agentSessionKey: childSessionKey });
      const parentRef = `openclaw-transcript://${encodeURIComponent(parentSessionKey)}#session`;
      const allowed = await tool.execute("call-parent-ref", { ref: parentRef });
      expect((allowed.details as { sessionKey?: string }).sessionKey).toBe(parentSessionKey);

      const rawKeyDenied = await tool.execute("call-parent-key", {
        sessionKey: parentSessionKey,
      });
      expect((rawKeyDenied.details as { status?: string }).status).toBe("forbidden");

      const unrelatedRef = `openclaw-transcript://${encodeURIComponent(
        unrelatedSessionKey,
      )}#session`;
      const unrelatedDenied = await tool.execute("call-unrelated-ref", { ref: unrelatedRef });
      expect((unrelatedDenied.details as { status?: string }).status).toBe("forbidden");
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
