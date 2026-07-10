import { describe, expect, it } from "vitest";
import { normalizeCodexItemToolEvent } from "./codex-item-event-normalizer.js";

describe("normalizeCodexItemToolEvent", () => {
  it("normalizes native command, file, MCP, and web items", () => {
    const cases = [
      {
        type: "commandExecution",
        item: { id: "cmd-1", type: "commandExecution", command: "rg foo", cwd: "/workspace" },
        name: "bash",
      },
      {
        type: "fileChange",
        item: {
          id: "patch-1",
          type: "fileChange",
          changes: [{ path: "src/a.ts", kind: "update" }],
        },
        name: "apply_patch",
      },
      {
        type: "mcpToolCall",
        item: {
          id: "mcp-1",
          type: "mcpToolCall",
          server: "openclaw_repo_workbench",
          tool: "repo_read_many",
          arguments: { files: [{ path: "src/a.ts" }] },
        },
        name: "openclaw_repo_workbench.repo_read_many",
      },
      {
        type: "webSearch",
        item: { id: "web-1", type: "webSearch", query: "Codex app-server" },
        name: "web_search",
      },
    ] as const;

    for (const testCase of cases) {
      const event = normalizeCodexItemToolEvent({
        method: "item/started",
        notificationParams: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: testCase.item,
        },
      });
      expect(event).toMatchObject({
        type: "tool.call",
        data: {
          threadId: "thread-1",
          turnId: "turn-1",
          toolCallId: testCase.item.id,
          name: testCase.name,
          source: "codex-native",
        },
      });
    }
  });

  it.each(["collabToolCall", "collabAgentToolCall"])(
    "normalizes %s helper lifecycle items",
    (type) => {
      const event = normalizeCodexItemToolEvent({
        method: "item/started",
        notificationParams: {
          threadId: "parent-thread",
          item: {
            id: `${type}-1`,
            type,
            tool: "spawn_agent",
            prompt: "inspect the source",
            receiverThreadIds: ["child-thread"],
          },
        },
      });

      expect(event).toMatchObject({
        type: "tool.call",
        data: {
          threadId: "parent-thread",
          name: "spawn_agent",
          arguments: {
            prompt: "inspect the source",
            receiverThreadIds: ["child-thread"],
          },
        },
      });
    },
  );

  it("keeps child role/objective and bounded MCP result metadata", () => {
    const event = normalizeCodexItemToolEvent({
      method: "item/completed",
      notificationParams: {
        threadId: "child-thread",
        turnId: "child-turn",
        item: {
          id: "mcp-2",
          type: "mcpToolCall",
          server: "openclaw_repo_workbench",
          tool: "repo_search_many",
          status: "completed",
          durationMs: 12,
          result: {
            structuredContent: {
              root: "/workspace",
              projectMode: "workspace",
              ignoredLargePayload: "not mirrored",
            },
          },
        },
      },
      role: "project_explorer",
      objective: "map implementation files",
    });

    expect(event).toMatchObject({
      type: "tool.result",
      data: {
        threadId: "child-thread",
        role: "project_explorer",
        objective: "map implementation files",
        status: "completed",
        result: {
          durationMs: 12,
          structuredContent: {
            root: "/workspace",
            projectMode: "workspace",
          },
        },
      },
    });
    expect(JSON.stringify(event)).not.toContain("ignoredLargePayload");
  });
});
