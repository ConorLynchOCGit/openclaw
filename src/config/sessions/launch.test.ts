import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSessionLaunchRef, readSessionLaunch, updateSessionLaunch } from "./launch.js";
import { loadSessionStore } from "./store.js";

describe("session launch", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-session-launch-"));
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  async function createStore(entries: Record<string, unknown>) {
    const dir = path.join(fixtureRoot, `case-${fixtureCount++}`);
    await fs.mkdir(dir, { recursive: true });
    const storePath = path.join(dir, "sessions.json");
    await fs.writeFile(storePath, JSON.stringify(entries), "utf8");
    return storePath;
  }

  it("persists a bounded native session.launch event on the session", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_launch";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-launch", updatedAt: 1 },
    });

    const result = await updateSessionLaunch({
      storePath,
      now: 1234,
      input: {
        sessionKey,
        agentId: "execution-coding",
        runId: "nrun_launch",
        nodeRunId: "nrun_launch",
        admissionStatus: "accepted",
        provider: "openrouter",
        model: "moonshotai/kimi-k2.6",
        cwd: "/repo",
        reasoningLevel: "stream",
        thinkingLevel: "xhigh",
        promptHash: "prompt-hash",
        submittedPromptHash: "prompt-hash",
        promptHashMatched: true,
        requiredSources: [
          {
            id: "agent://execution-coding/doc/IDENTITY.md",
            bytes: 42,
            truncated: false,
            hash: "doc-hash",
          },
        ],
        toolCatalogRef: "openclaw-effective-tool-inventory://agent",
        effectiveToolNames: ["task", "node_finish", "update_plan"],
        allowedChildAgentIds: ["execution-context-scout"],
        reasonCodes: ["session_launch_accepted"],
      },
    });

    expect(result.persisted).toBe(true);
    if (!result.persisted) {
      throw new Error("expected persisted launch");
    }
    expect(result.launchRef).toBe(buildSessionLaunchRef(sessionKey));
    expect(result.launchEventRef).toContain("openclaw-session-launch://");
    expect(result.event).toMatchObject({
      type: "session.launch",
      sessionKey,
      agentId: "execution-coding",
      admissionStatus: "accepted",
      requiredSources: [
        {
          id: "agent://execution-coding/doc/IDENTITY.md",
          bytes: 42,
          truncated: false,
          hash: "doc-hash",
        },
      ],
      effectiveToolNames: ["task", "node_finish", "update_plan"],
      allowedChildAgentIds: ["execution-context-scout"],
    });

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.launch?.latestEvent.eventId).toBe(result.event.eventId);
    expect(readSessionLaunch({ storePath, sessionKey })?.latestEvent.admissionStatus).toBe(
      "accepted",
    );
  });

  it("creates a launch-only session entry when blocked admission happens before a session exists", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_missing";
    const storePath = await createStore({});

    const result = await updateSessionLaunch({
      storePath,
      now: 5678,
      input: {
        sessionKey,
        agentId: "execution-coding",
        runId: "nrun_missing",
        admissionStatus: "blocked",
        blockerKind: "node_agent_provider_bootstrap_report_missing",
        blockers: ["node_agent_provider_bootstrap_report_missing"],
      },
    });

    expect(result.persisted).toBe(true);
    if (!result.persisted) {
      throw new Error("expected launch-only session entry");
    }
    expect(result.event).toMatchObject({
      type: "session.launch",
      sessionKey,
      admissionStatus: "blocked",
      blockerKind: "node_agent_provider_bootstrap_report_missing",
      blockers: ["node_agent_provider_bootstrap_report_missing"],
    });
    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]).toMatchObject({
      sessionId: expect.stringMatching(/^launch_session_launch_/),
      launch: {
        updatedAt: 5678,
        latestEvent: {
          admissionStatus: "blocked",
          blockerKind: "node_agent_provider_bootstrap_report_missing",
        },
      },
    });
    expect(readSessionLaunch({ storePath, sessionKey })?.latestEvent.admissionStatus).toBe(
      "blocked",
    );
  });

  it("can still report missing_session when creation is explicitly disabled", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_missing";
    const storePath = await createStore({});

    const result = await updateSessionLaunch({
      storePath,
      createIfMissing: false,
      input: {
        sessionKey,
        agentId: "execution-coding",
        runId: "nrun_missing",
        admissionStatus: "blocked",
        blockerKind: "node_agent_provider_bootstrap_report_missing",
        blockers: ["node_agent_provider_bootstrap_report_missing"],
      },
    });

    expect(result).toMatchObject({
      persisted: false,
      sessionKey,
      reason: "missing_session",
    });
  });
});
