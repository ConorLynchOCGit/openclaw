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
        resolvedLocation: {
          sourceRoot: {
            path: "/repo",
            authorityClass: "source",
            writable: false,
          },
          workspaceRoot: {
            path: "/repo",
            authorityClass: "workspace",
            writable: true,
          },
          stateRoot: {
            path: "/repo/.openclaw/runtime",
            authorityClass: "state",
            writable: true,
          },
        },
        sourceIdentity: "git:/repo:abc",
        workspaceIdentity: "git:/repo:abc",
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
        toolCatalogSummary: [
          {
            name: "update_plan",
            descriptionHash: "description-hash",
            descriptionBytes: 123,
            parametersHash: "parameters-hash",
            parametersBytes: 456,
          },
        ],
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
      resolvedLocation: {
        sourceRoot: {
          path: "/repo",
          authorityClass: "source",
          writable: false,
        },
      },
      sourceIdentity: "git:/repo:abc",
      workspaceIdentity: "git:/repo:abc",
      requiredSources: [
        {
          id: "agent://execution-coding/doc/IDENTITY.md",
          bytes: 42,
          truncated: false,
          hash: "doc-hash",
        },
      ],
      effectiveToolNames: ["task", "node_finish", "update_plan"],
      toolCatalogSummary: [
        {
          name: "update_plan",
          descriptionHash: "description-hash",
          descriptionBytes: 123,
          parametersHash: "parameters-hash",
          parametersBytes: 456,
        },
      ],
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

  it("persists child session.launch linkage to parent session, task tool call, and node run", async () => {
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const childSessionKey = "agent:execution-context-scout:subagent:child_1";
    const storePath = await createStore({
      [childSessionKey]: {
        sessionId: "native_task_child_1",
        updatedAt: 1,
        spawnedBy: parentSessionKey,
      },
    });

    const result = await updateSessionLaunch({
      storePath,
      now: 9012,
      input: {
        sessionKey: childSessionKey,
        agentId: "execution-context-scout",
        runId: "child-run-1",
        nodeRunId: "nrun_parent",
        parentSessionKey,
        parentToolCallId: "tool-call-task-1",
        admissionStatus: "accepted",
        provider: "openrouter",
        model: "qwen/qwen3-coder",
        cwd: "/repo",
        resolvedLocation: {
          sourceRoot: {
            path: "/repo",
            authorityClass: "source",
            writable: false,
          },
          workspaceRoot: {
            path: "/repo",
            authorityClass: "workspace",
            writable: true,
          },
          stateRoot: {
            path: "/repo/.openclaw/runtime",
            authorityClass: "state",
            writable: true,
          },
        },
        sourceIdentity: "git:/repo:abc",
        workspaceIdentity: "git:/repo:abc",
        requiredSources: [
          {
            id: "agent://execution-context-scout/doc/IDENTITY.md",
            bytes: 42,
            truncated: false,
            hash: "doc-hash",
          },
          {
            id: "skill://execution-context-scout/SKILL.md",
            bytes: 84,
            truncated: false,
            hash: "skill-hash",
          },
        ],
        toolCatalogRef: "openclaw-effective-tool-inventory://execution-context-scout",
        effectiveToolNames: ["read", "list", "glob", "grep"],
        reasonCodes: ["session_launch_accepted"],
      },
    });

    expect(result.persisted).toBe(true);
    if (!result.persisted) {
      throw new Error("expected child launch linkage to persist");
    }
    expect(result.event).toMatchObject({
      type: "session.launch",
      sessionKey: childSessionKey,
      agentId: "execution-context-scout",
      runId: "child-run-1",
      nodeRunId: "nrun_parent",
      parentSessionKey,
      parentToolCallId: "tool-call-task-1",
      admissionStatus: "accepted",
      requiredSources: [
        {
          id: "agent://execution-context-scout/doc/IDENTITY.md",
          bytes: 42,
          truncated: false,
          hash: "doc-hash",
        },
        {
          id: "skill://execution-context-scout/SKILL.md",
          bytes: 84,
          truncated: false,
          hash: "skill-hash",
        },
      ],
      effectiveToolNames: ["read", "list", "glob", "grep"],
    });
    const launch = readSessionLaunch({ storePath, sessionKey: childSessionKey });
    expect(launch?.latestEvent).toMatchObject({
      parentSessionKey,
      parentToolCallId: "tool-call-task-1",
      nodeRunId: "nrun_parent",
    });
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
