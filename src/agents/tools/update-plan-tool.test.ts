import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadSessionStore } from "../../config/sessions.js";
import { onAgentEvent, resetAgentEventsForTest } from "../../infra/agent-events.js";
import { createReadTodoTool, createUpdatePlanTool } from "./update-plan-tool.js";

describe("update_plan tool", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-update-plan-"));
  });

  afterEach(() => {
    resetAgentEventsForTest();
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

  it("describes todo as lightweight status, not workflow authority", () => {
    const tool = createUpdatePlanTool();
    const parameterSchema = JSON.stringify(tool.parameters);

    expect(tool.description).toContain("lightweight todo board");
    expect(tool.description).toContain("distinct conceptual steps");
    expect(tool.description).toContain("Todo is status only");
    expect(tool.description).not.toContain("execution-node sessions");
    expect(tool.description).not.toContain("Source lookup");
    expect(tool.description).not.toContain("read files");
    expect(tool.displaySummary).toContain("lightweight todo state");
    expect(parameterSchema).toContain("Brief task description");
    expect(parameterSchema).not.toContain("Source lookup");
    expect(parameterSchema).not.toContain("avoid read files");
  });

  it("returns a boring JSON todo payload", async () => {
    const tool = createUpdatePlanTool();
    const result = await tool.execute("call-1", {
      explanation: "Started work",
      plan: [
        { step: "Patch harness", status: "completed" },
        { step: "Add tool", status: "in_progress" },
        { step: "Run tests", status: "pending" },
      ],
    });

    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(
          [
            { content: "Patch harness", status: "completed", priority: "normal" },
            { content: "Add tool", status: "in_progress", priority: "normal" },
            { content: "Run tests", status: "pending", priority: "normal" },
          ],
          null,
          2,
        ),
      },
    ]);
    expect(result.details).toEqual({
      status: "updated",
      explanation: "Started work",
      plan: [
        { step: "Patch harness", status: "completed" },
        { step: "Add tool", status: "in_progress" },
        { step: "Run tests", status: "pending" },
      ],
    });
  });

  it("records submitted statuses without phase validation", async () => {
    const tool = createUpdatePlanTool();

    const result = await tool.execute("call-1", {
      plan: [
        { step: "One", status: "in_progress" },
        { step: "Two", status: "in_progress" },
        { step: "Three", status: "completed" },
      ],
    });

    expect(result.details).toEqual({
      status: "updated",
      plan: [
        { step: "One", status: "in_progress" },
        { step: "Two", status: "in_progress" },
        { step: "Three", status: "completed" },
      ],
    });
  });

  it("does not add a source-activity correction to model-visible todo output", async () => {
    const tool = createUpdatePlanTool();
    const result = await tool.execute("call-lookup-todo", {
      plan: [
        {
          step: "Read existing work-queue read model and event substrate files",
          status: "in_progress",
        },
        { step: "Implement event-delta projection", status: "pending" },
      ],
    });

    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Read existing work-queue read model and event substrate files");
    expect(text).not.toContain("inProgress:");
    expect(text).not.toContain("<system-reminder>");
    expect(text).not.toContain("Todo should track the edit deliverable");
    expect(text).not.toContain("medium-confidence edit");
  });

  it("keeps acquisition-shaped todo text as plain status instead of instruction", async () => {
    const tool = createUpdatePlanTool();
    const result = await tool.execute("call-failed-proof-todo", {
      plan: [
        {
          step: "Explore existing Work Queue read model, event store, and repository surfaces",
          status: "in_progress",
        },
        { step: "Patch delta projection", status: "pending" },
      ],
    });

    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Explore existing Work Queue read model");
    expect(text).not.toContain("<system-reminder>");
    expect(text).not.toContain("Todo should track the edit deliverable");
  });

  it("ignores extra per-step fields instead of rejecting the plan", async () => {
    const tool = createUpdatePlanTool();
    const result = await tool.execute("call-1", {
      plan: [
        { step: "Inspect harness", status: "completed", owner: "agent-1" },
        { step: "Run tests", status: "pending", notes: ["later"] },
      ],
    });

    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(
          [
            { content: "Inspect harness", status: "completed", priority: "normal" },
            { content: "Run tests", status: "pending", priority: "normal" },
          ],
          null,
          2,
        ),
      },
    ]);
    expect(result.details).toEqual({
      status: "updated",
      plan: [
        { step: "Inspect harness", status: "completed" },
        { step: "Run tests", status: "pending" },
      ],
    });
  });

  it("persists session-owned todo state with visible completion status", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_1";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
    });
    const events: unknown[] = [];
    const stop = onAgentEvent((evt) => events.push(evt));
    try {
      const tool = createUpdatePlanTool({
        sessionKey,
        storePath,
        runId: "run-1",
        now: () => 1234,
      });
      const result = await tool.execute("call-1", {
        explanation: "Native todo update",
        plan: [
          { step: "Inspect node prompt", status: "completed", priority: "high" },
          { step: "Delegate context scout", status: "in_progress" },
          { step: "Edit from scout context", status: "pending", priority: "low" },
        ],
      });

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.todo).toEqual({
        schemaVersion: 1,
        sessionKey,
        updatedAt: 1234,
        items: [
          {
            content: "Inspect node prompt",
            status: "completed",
            priority: "high",
            position: 1,
          },
          {
            content: "Delegate context scout",
            status: "in_progress",
            priority: "normal",
            position: 2,
          },
          {
            content: "Edit from scout context",
            status: "pending",
            priority: "low",
            position: 3,
          },
        ],
        history: [
          expect.objectContaining({
            type: "todo.updated",
            updatedAt: 1234,
            itemCount: 3,
            completedCount: 1,
            inProgressCount: 1,
            explanation: "Native todo update",
          }),
        ],
      });
      expect(result.details).toEqual(
        expect.objectContaining({
          status: "updated",
          todo: expect.objectContaining({
            persisted: true,
            sessionKey,
            itemCount: 3,
            completedCount: 1,
            inProgressCount: 1,
          }),
        }),
      );
      expect(events).toEqual([
        expect.objectContaining({
          stream: "plan",
          sessionKey,
          data: expect.objectContaining({
            eventType: "todo.updated",
            source: "update_plan",
            itemCount: 3,
            completedCount: 1,
            inProgressCount: 1,
          }),
        }),
      ]);
    } finally {
      stop();
    }
  });

  it("reads the current session todo with item completion status", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_read";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-read", updatedAt: 1 },
    });

    await createUpdatePlanTool({
      sessionKey,
      storePath,
      now: () => 321,
    }).execute("call-write", {
      plan: [
        { step: "Hydrate prompt", status: "completed", priority: "high" },
        { step: "Delegate context scout", status: "completed" },
        { step: "Edit from scout context", status: "in_progress" },
        { step: "Validate through scout", status: "pending", priority: "low" },
      ],
    });

    const result = await createReadTodoTool({
      sessionKey,
      storePath,
    }).execute("call-read", {});

    expect(result.content).toEqual([]);
    expect(result.details).toEqual(
      expect.objectContaining({
        status: "ok",
        sessionKey,
        itemCount: 4,
        completedCount: 2,
        inProgressCount: 1,
        items: [
          {
            content: "Hydrate prompt",
            status: "completed",
            priority: "high",
            position: 1,
          },
          {
            content: "Delegate context scout",
            status: "completed",
            priority: "normal",
            position: 2,
          },
          {
            content: "Edit from scout context",
            status: "in_progress",
            priority: "normal",
            position: 3,
          },
          {
            content: "Validate through scout",
            status: "pending",
            priority: "low",
            position: 4,
          },
        ],
        history: [
          expect.objectContaining({
            itemCount: 4,
            completedCount: 2,
            inProgressCount: 1,
          }),
        ],
      }),
    );
  });

  it("reads empty todo state without creating a missing ledger", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_empty";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-empty", updatedAt: 1 },
    });

    const result = await createReadTodoTool({
      sessionKey,
      storePath,
    }).execute("call-read", {});

    expect(result.details).toEqual({
      status: "empty",
      sessionKey,
      todoRef: `openclaw-session-todo://${encodeURIComponent(sessionKey)}`,
      itemCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      items: [],
      history: [],
    });
    expect(loadSessionStore(storePath, { skipCache: true })[sessionKey]?.todo).toBeUndefined();
  });

  it("reports unavailable read context without model-selected session fallback", async () => {
    const result = await createReadTodoTool().execute("call-read", {});

    expect(result.details).toEqual({
      status: "unavailable",
      reason: "missing_session_context",
    });
  });

  it("keeps parent and child todos isolated by session key", async () => {
    const parentSessionKey = "agent:execution-coding:node:nrun_parent";
    const childSessionKey = "agent:execution-context-scout:subagent:child_1";
    const storePath = await createStore({
      [parentSessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
      [childSessionKey]: {
        sessionId: "sess-child",
        updatedAt: 1,
        spawnedBy: parentSessionKey,
      },
    });

    await createUpdatePlanTool({
      sessionKey: parentSessionKey,
      storePath,
      now: () => 100,
    }).execute("call-parent", {
      plan: [{ step: "Parent synthesizes scout result", status: "in_progress" }],
    });
    await createUpdatePlanTool({
      sessionKey: childSessionKey,
      storePath,
      now: () => 200,
    }).execute("call-child", {
      plan: [{ step: "Scout reads source windows", status: "completed" }],
    });

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[parentSessionKey]?.todo?.items).toEqual([
      {
        content: "Parent synthesizes scout result",
        status: "in_progress",
        priority: "normal",
        position: 1,
      },
    ]);
    expect(store[childSessionKey]?.todo?.items).toEqual([
      {
        content: "Scout reads source windows",
        status: "completed",
        priority: "normal",
        position: 1,
      },
    ]);
    expect(store[parentSessionKey]?.todo?.sessionKey).toBe(parentSessionKey);
    expect(store[childSessionKey]?.todo?.sessionKey).toBe(childSessionKey);
  });

  it("reports missing session instead of creating a parallel todo ledger", async () => {
    const storePath = await createStore({});
    const tool = createUpdatePlanTool({
      sessionKey: "agent:execution-coding:node:missing",
      storePath,
    });
    const result = await tool.execute("call-1", {
      plan: [{ step: "Plan exists transiently", status: "pending" }],
    });

    expect(result.details).toEqual(
      expect.objectContaining({
        todo: expect.objectContaining({
          persisted: false,
          reason: "missing_session",
        }),
      }),
    );
    expect(loadSessionStore(storePath, { skipCache: true })).toEqual({});
  });
});
