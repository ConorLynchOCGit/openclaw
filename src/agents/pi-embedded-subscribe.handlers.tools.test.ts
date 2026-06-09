import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { loadSessionStore } from "../config/sessions/store.js";
import type { MessagingToolSend } from "./pi-embedded-messaging.types.js";
import {
  handleToolExecutionUpdate,
  handleToolExecutionEnd,
  handleToolExecutionStart,
} from "./pi-embedded-subscribe.handlers.tools.js";
import type {
  ToolCallSummary,
  ToolHandlerContext,
} from "./pi-embedded-subscribe.handlers.types.js";

type ToolExecutionStartEvent = Extract<AgentEvent, { type: "tool_execution_start" }>;
type ToolExecutionEndEvent = Extract<AgentEvent, { type: "tool_execution_end" }>;
type ToolExecutionUpdateEvent = Extract<AgentEvent, { type: "tool_execution_update" }>;

function createTestContext(): {
  ctx: ToolHandlerContext;
  warn: ReturnType<typeof vi.fn>;
  onBlockReplyFlush: ReturnType<typeof vi.fn>;
  onAgentEvent: ReturnType<typeof vi.fn>;
} {
  const onBlockReplyFlush = vi.fn();
  const onAgentEvent = vi.fn();
  const warn = vi.fn();
  const ctx: ToolHandlerContext = {
    params: {
      runId: "run-test",
      onBlockReplyFlush,
      onAgentEvent,
      onToolResult: undefined,
    },
    flushBlockReplyBuffer: vi.fn(),
    hookRunner: undefined,
    log: {
      debug: vi.fn(),
      warn,
    },
    state: {
      toolMetaById: new Map<string, ToolCallSummary>(),
      toolMetas: [],
      toolSummaryById: new Set<string>(),
      itemActiveIds: new Set<string>(),
      itemStartedCount: 0,
      itemCompletedCount: 0,
      pendingMessagingTargets: new Map<string, MessagingToolSend>(),
      pendingMessagingTexts: new Map<string, string>(),
      pendingMessagingMediaUrls: new Map<string, string[]>(),
      pendingToolMediaUrls: [],
      pendingToolAudioAsVoice: false,
      deterministicApprovalPromptPending: false,
      replayState: { replayInvalid: false, hadPotentialSideEffects: false },
      messagingToolSentTexts: [],
      messagingToolSentTextsNormalized: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
      successfulCronAdds: 0,
      deterministicApprovalPromptSent: false,
    },
    shouldEmitToolResult: () => false,
    shouldEmitToolOutput: () => false,
    emitToolSummary: vi.fn(),
    emitToolOutput: vi.fn(),
    trimMessagingToolSent: vi.fn(),
  };

  return { ctx, warn, onBlockReplyFlush, onAgentEvent };
}

describe("handleToolExecutionStart read path checks", () => {
  it("does not warn when read tool uses file_path alias", async () => {
    const { ctx, warn, onBlockReplyFlush } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: "tool-1",
      args: { file_path: "/tmp/example.txt" },
    };

    await handleToolExecutionStart(ctx, evt);

    expect(onBlockReplyFlush).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when read tool has neither path nor file_path", async () => {
    const { ctx, warn } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: "tool-2",
      args: {},
    };

    await handleToolExecutionStart(ctx, evt);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0] ?? "")).toContain("read tool called without path");
  });

  it("awaits onBlockReplyFlush before continuing tool start processing", async () => {
    const { ctx, onBlockReplyFlush } = createTestContext();
    let releaseFlush: (() => void) | undefined;
    onBlockReplyFlush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    );

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "exec",
      toolCallId: "tool-await-flush",
      args: { command: "echo hi" },
    };

    const pending = handleToolExecutionStart(ctx, evt);
    // Let the async function reach the awaited flush Promise.
    await Promise.resolve();

    // If flush isn't awaited, tool metadata would already be recorded here.
    expect(ctx.state.toolMetaById.has("tool-await-flush")).toBe(false);
    expect(releaseFlush).toBeTypeOf("function");

    releaseFlush?.();
    await pending;

    expect(ctx.state.toolMetaById.has("tool-await-flush")).toBe(true);
    expect(ctx.state.itemStartedCount).toBe(2);
    expect(ctx.state.itemActiveIds.has("tool:tool-await-flush")).toBe(true);
    expect(ctx.state.itemActiveIds.has("command:tool-await-flush")).toBe(true);
  });
});

describe("handleToolExecutionEnd native task working context", () => {
  it("persists delivered context scout results as native session working context", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-working-context-"));
    try {
      const sessionKey = "agent:execution-coding:node:nrun_file_graph";
      const storePath = path.join(dir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
        }),
        "utf8",
      );
      const { ctx, onAgentEvent } = createTestContext();
      ctx.params.sessionKey = sessionKey;
      ctx.params.agentId = "execution-coding";
      ctx.params.config = {
        session: { store: storePath },
      } as never;

      await handleToolExecutionEnd(ctx, {
        type: "tool_execution_end",
        toolName: "task",
        toolCallId: "task-context-scout",
        isError: false,
        result: {
          content: [
            {
              type: "text",
              text: [
                "Task result from execution-context-scout (completed, projected).",
                "",
                "Direct answer: edit src/agents/tools/native-task-tool.ts.",
                "",
                "Bounded source windows:",
                "```ts",
                "export function createNativeTaskTool() {}",
                "```",
                "",
                "file_graph:",
                "- src/agents/tools/native-task-tool.ts -> src/agents/openclaw-tools.ts via registration (evidence: src/agents/tools/native-task-tool.ts:1-4)",
              ].join("\n"),
            },
          ],
          details: {
            status: "completed",
            sourceTool: "task",
            requestedAgentId: "execution-context-scout",
            childSessionKey: "agent:execution-context-scout:subagent:child-1",
            runId: "run-child-1",
            foreground: true,
            resultDeliveredToParentContext: true,
            resultDeliveryStatus: "projected",
            resultTruncated: true,
            childIdentityVerified: true,
            childBootstrapAdmission: {
              providerReportObserved: true,
              childAgentId: "execution-context-scout",
              canonicalDocsAdmitted: true,
              requiredSkillAdmitted: true,
              childToolCatalogAdmitted: true,
              providerToolNames: ["read", "list", "glob", "grep"],
              requiredToolNames: ["read", "list", "glob", "grep"],
              missingRequiredToolNames: [],
              forbiddenToolNames: [],
              missingRequiredSources: [],
              truncatedRequiredSources: [],
              reasonCodes: ["native_task_child_provider_tool_catalog_admitted"],
            },
          },
        },
      });

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.workingContext?.activeEntries[0]).toMatchObject({
        kind: "context_window",
        source: "native_task",
        sourceToolCallId: "task-context-scout",
        requestedAgentId: "execution-context-scout",
        childSessionKey: "agent:execution-context-scout:subagent:child-1",
        childRunId: "run-child-1",
        hasInlineContextWindows: true,
        hasFileGraph: true,
        fileGraphVerifiedEdgeCount: 1,
        fileGraphUncertainAnnotationCount: 0,
      });
      expect(onAgentEvent).toHaveBeenCalledWith({
        stream: "node-agent",
        data: expect.objectContaining({
          eventType: "node_agent_native_task_result",
          resultDeliveryStatus: "projected",
          parentDecisionFooterIncluded: true,
          parentDecisionFooterKind: "minimal_edit_readiness",
          workingContextPersisted: true,
          workingContextKind: "context_window",
          workingContextHasInlineContextWindows: true,
          workingContextHasFileGraph: true,
          workingContextFileGraphTextHash: expect.any(String),
          workingContextFileGraphTextByteCount: expect.any(Number),
          workingContextFileGraphVerifiedEdgeCount: 1,
          workingContextFileGraphUncertainAnnotationCount: 0,
          workingContextRef: expect.stringContaining("openclaw-session-working-context://"),
          workingContextEntryRef: expect.stringContaining("openclaw-session-working-context://"),
          childBootstrapAdmission: expect.objectContaining({
            childToolCatalogAdmitted: true,
            providerToolNames: ["read", "list", "glob", "grep"],
            requiredToolNames: ["read", "list", "glob", "grep"],
            missingRequiredToolNames: [],
            forbiddenToolNames: [],
          }),
        }),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("persists validation scout results as validation state in the unified working context", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-validation-state-"));
    try {
      const sessionKey = "agent:execution-coding:node:nrun_validation_state";
      const storePath = path.join(dir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
        }),
        "utf8",
      );
      const { ctx, onAgentEvent } = createTestContext();
      ctx.params.sessionKey = sessionKey;
      ctx.params.agentId = "execution-coding";
      ctx.params.config = {
        session: { store: storePath },
      } as never;

      await handleToolExecutionEnd(ctx, {
        type: "tool_execution_end",
        toolName: "task",
        toolCallId: "task-validation-scout",
        isError: false,
        result: {
          content: [
            {
              type: "text",
              text: [
                "Task result from execution-validation-scout (completed).",
                "Validation question: prove native task footer behavior.",
                "Commands run: pnpm test:file src/agents/tools/native-task-tool.test.ts",
                "Exit status: 0",
                "Bounded output excerpt: passed.",
              ].join("\n"),
            },
          ],
          details: {
            status: "completed",
            sourceTool: "task",
            requestedAgentId: "execution-validation-scout",
            childSessionKey: "agent:execution-validation-scout:subagent:child-validate",
            runId: "run-child-validate",
            foreground: true,
            resultDeliveredToParentContext: true,
            childIdentityVerified: true,
          },
        },
      });

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.workingContext?.activeEntries[0]).toMatchObject({
        kind: "validation_state",
        source: "native_task",
        requestedAgentId: "execution-validation-scout",
        validationStatus: "completed",
      });
      expect(onAgentEvent).toHaveBeenCalledWith({
        stream: "node-agent",
        data: expect.objectContaining({
          eventType: "node_agent_native_task_result",
          parentDecisionFooterIncluded: true,
          parentDecisionFooterKind: "validation_sufficiency",
          workingContextPersisted: true,
          workingContextKind: "validation_state",
          workingContextEntryRef: expect.stringContaining("openclaw-session-working-context://"),
        }),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("handleToolExecutionEnd node-agent tool result trace", () => {
  it("emits compact parent tool refs without raw result text", async () => {
    const { ctx, onAgentEvent } = createTestContext();

    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "update_plan",
      toolCallId: "plan-after-context",
      isError: false,
      result: {
        content: [{ type: "text", text: "raw todo text should not enter node-agent event" }],
        details: {
          status: "updated",
          todo: {
            persisted: true,
            todoRef: "openclaw-session-todo://agent%3Aexecution-coding%3Anode%3Anrun_test",
          },
        },
      },
    });
    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "edit",
      toolCallId: "edit-after-context",
      isError: false,
      result: {
        content: [{ type: "text", text: "raw edit output should not enter node-agent event" }],
        details: { status: "completed" },
      },
    });
    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "node_finish",
      toolCallId: "finish-after-validation",
      isError: false,
      result: {
        content: [{ type: "text", text: "raw finish output should not enter node-agent event" }],
        details: { accepted: true, status: "completed" },
      },
    });

    const nodeAgentEvents = onAgentEvent.mock.calls
      .map(([event]) => event)
      .filter(
        (event) =>
          event.stream === "node-agent" && event.data.eventType === "node_agent_tool_result",
      );

    expect(nodeAgentEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            toolResultRef: "openclaw-tool-result://run-test/plan-after-context",
            toolName: "update_plan",
            todoRef: "openclaw-session-todo://agent%3Aexecution-coding%3Anode%3Anrun_test",
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            toolResultRef: "openclaw-tool-result://run-test/edit-after-context",
            toolName: "edit",
            mutatingAction: true,
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            toolResultRef: "openclaw-tool-result://run-test/finish-after-validation",
            toolName: "node_finish",
            finishAccepted: true,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(nodeAgentEvents)).not.toContain("raw todo text");
    expect(JSON.stringify(nodeAgentEvents)).not.toContain("raw edit output");
    expect(JSON.stringify(nodeAgentEvents)).not.toContain("raw finish output");
  });

  it("persists successful mutations as compact change_set working context", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-change-set-"));
    try {
      const sessionKey = "agent:execution-coding:node:nrun_change_set";
      const storePath = path.join(dir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
        }),
        "utf8",
      );
      const { ctx, onAgentEvent } = createTestContext();
      ctx.params.sessionKey = sessionKey;
      ctx.params.agentId = "execution-coding";
      ctx.params.config = {
        session: { store: storePath },
      } as never;

      await handleToolExecutionStart(ctx, {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "edit-change-set",
        args: {
          file_path: "src/agents/tools/native-task-tool.ts",
          old_string: "before",
          new_string: "after",
        },
      });
      await handleToolExecutionEnd(ctx, {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "edit-change-set",
        isError: false,
        result: {
          details: {
            status: "completed",
            changedFilePaths: ["src/agents/tools/native-task-tool.ts"],
            modifiedFilePaths: ["src/agents/tools/native-task-tool.ts"],
            diff: "--- src/agents/tools/native-task-tool.ts\n+++ src/agents/tools/native-task-tool.ts\n@@\n-before\n+after",
            firstChangedLine: 42,
          },
        },
      });

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.workingContext?.activeEntries[0]).toMatchObject({
        kind: "change_set",
        source: "native_tool",
        sourceToolCallId: "edit-change-set",
        toolResultRef: "openclaw-tool-result://run-test/edit-change-set",
        status: "completed",
        changedFilePaths: ["src/agents/tools/native-task-tool.ts"],
      });
      expect(store[sessionKey]?.workingContext?.activeEntries[0]?.text).toContain(
        "firstChangedLine=42",
      );
      expect(store[sessionKey]?.workingContext?.activeEntries[0]?.text).toContain(
        "diffAvailable=true",
      );
      expect(onAgentEvent).toHaveBeenCalledWith({
        stream: "node-agent",
        data: expect.objectContaining({
          eventType: "node_agent_tool_result",
          toolName: "edit",
          toolResultRef: "openclaw-tool-result://run-test/edit-change-set",
          changedFilePaths: ["src/agents/tools/native-task-tool.ts"],
          modifiedFilePaths: ["src/agents/tools/native-task-tool.ts"],
          diffAvailable: true,
          firstChangedLine: 42,
          changeSetWorkingContextPersisted: true,
          changeSetWorkingContextEntryRef: expect.stringContaining(
            "openclaw-session-working-context://",
          ),
        }),
      });
      expect(JSON.stringify(store[sessionKey]?.workingContext)).not.toContain("before");
      expect(JSON.stringify(store[sessionKey]?.workingContext)).not.toContain("after");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("persists managed-output refs as native working context without raw output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-managed-output-wctx-"));
    try {
      const sessionKey = "agent:execution-validation-scout:subagent:nrun_managed_output";
      const storePath = path.join(dir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-validation", updatedAt: 1 },
        }),
        "utf8",
      );
      const { ctx, onAgentEvent } = createTestContext();
      ctx.params.sessionKey = sessionKey;
      ctx.params.agentId = "execution-validation-scout";
      ctx.params.config = {
        session: { store: storePath },
      } as never;

      await handleToolExecutionStart(ctx, {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "exec-managed-output",
        args: { command: "pnpm test:file focused.test.ts" },
      });
      await handleToolExecutionEnd(ctx, {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "exec-managed-output",
        isError: false,
        result: {
          content: [
            {
              type: "text",
              text: [
                "[Exec output truncated for model context: showing last 12000 of 250000 characters.]",
                "Full output saved to managedOutputRef=openclaw-managed-output://agent%3Aexecution-validation-scout%3Asubagent%3Anrun_managed_output/mout_test.",
                "tail preview only",
              ].join("\n"),
            },
          ],
          details: {
            status: "completed",
            exitCode: 0,
            truncated: true,
            totalOutputChars: 250000,
            managedOutputRef:
              "openclaw-managed-output://agent%3Aexecution-validation-scout%3Asubagent%3Anrun_managed_output/mout_test",
            managedOutputBytes: 250000,
            managedOutputHash: "a".repeat(64),
          },
        },
      });

      const store = loadSessionStore(storePath, { skipCache: true });
      expect(store[sessionKey]?.workingContext?.activeEntries[0]).toMatchObject({
        kind: "managed_output_ref",
        source: "native_tool",
        sourceToolCallId: "exec-managed-output",
        toolResultRef: "openclaw-tool-result://run-test/exec-managed-output",
        status: "completed",
      });
      const entryText = store[sessionKey]?.workingContext?.activeEntries[0]?.text ?? "";
      expect(entryText).toContain("managedOutputRef=openclaw-managed-output://");
      expect(entryText).toContain("managedOutputBytes=250000");
      expect(entryText).not.toContain("tail preview only");
      expect(onAgentEvent).toHaveBeenCalledWith({
        stream: "node-agent",
        data: expect.objectContaining({
          eventType: "node_agent_tool_result",
          toolName: "exec",
          managedOutputRef:
            "openclaw-managed-output://agent%3Aexecution-validation-scout%3Asubagent%3Anrun_managed_output/mout_test",
          managedOutputWorkingContextPersisted: true,
          managedOutputWorkingContextEntryRef: expect.stringContaining(
            "openclaw-session-working-context://",
          ),
        }),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("handleToolExecutionEnd cron.add commitment tracking", () => {
  it("increments successfulCronAdds when cron add succeeds", async () => {
    const { ctx } = createTestContext();
    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "cron",
        toolCallId: "tool-cron-1",
        args: { action: "add", job: { name: "reminder" } },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "cron",
        toolCallId: "tool-cron-1",
        isError: false,
        result: { details: { status: "ok" } },
      } as never,
    );

    expect(ctx.state.successfulCronAdds).toBe(1);
  });

  it("does not increment successfulCronAdds when cron add fails", async () => {
    const { ctx } = createTestContext();
    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "cron",
        toolCallId: "tool-cron-2",
        args: { action: "add", job: { name: "reminder" } },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "cron",
        toolCallId: "tool-cron-2",
        isError: true,
        result: { details: { status: "error" } },
      } as never,
    );

    expect(ctx.state.successfulCronAdds).toBe(0);
    expect(ctx.state.itemCompletedCount).toBe(1);
    expect(ctx.state.itemActiveIds.size).toBe(0);
  });
});

describe("handleToolExecutionEnd mutating failure recovery", () => {
  it("clears edit failure when the retry succeeds through common file path aliases", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "tool-edit-1",
        args: {
          file_path: "/tmp/demo.txt",
          old_string: "beta stale",
          new_string: "beta fixed",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tool-edit-1",
        isError: true,
        result: { error: "Could not find the exact text in /tmp/demo.txt" },
      } as never,
    );

    expect(ctx.state.lastToolError?.toolName).toBe("edit");

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "tool-edit-2",
        args: {
          file: "/tmp/demo.txt",
          oldText: "beta",
          newText: "beta fixed",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tool-edit-2",
        isError: false,
        result: { ok: true },
      } as never,
    );

    expect(ctx.state.lastToolError).toBeUndefined();
  });

  it("marks successful mutating tool results as replay-invalid for terminal lifecycle truth", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "tool-edit-side-effect",
        args: {
          file_path: "/tmp/demo.txt",
          old_string: "beta",
          new_string: "gamma",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tool-edit-side-effect",
        isError: false,
        result: { ok: true },
      } as never,
    );

    expect(ctx.state.replayState).toEqual({
      replayInvalid: true,
      hadPotentialSideEffects: true,
    });
  });

  it("marks successful subagents control actions as replay-invalid", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "subagents",
        toolCallId: "tool-subagents-kill",
        args: {
          action: "kill",
          target: "worker-1",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "subagents",
        toolCallId: "tool-subagents-kill",
        isError: false,
        result: { status: "ok", action: "kill", target: "worker-1" },
      } as never,
    );

    expect(ctx.state.replayState).toEqual({
      replayInvalid: true,
      hadPotentialSideEffects: true,
    });
  });

  it("keeps read-only subagents list actions replay-safe", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "subagents",
        toolCallId: "tool-subagents-list",
        args: {
          action: "list",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "subagents",
        toolCallId: "tool-subagents-list",
        isError: false,
        result: { status: "ok", action: "list", total: 0, text: "no active subagents." },
      } as never,
    );

    expect(ctx.state.replayState).toEqual({
      replayInvalid: false,
      hadPotentialSideEffects: false,
    });
  });

  it("keeps successful mutating retries replay-invalid after an earlier tool failure", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "tool-edit-fail-first",
        args: {
          file_path: "/tmp/demo.txt",
          old_string: "beta stale",
          new_string: "gamma",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tool-edit-fail-first",
        isError: true,
        result: { error: "Could not find the exact text in /tmp/demo.txt" },
      } as never,
    );

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "edit",
        toolCallId: "tool-edit-retry-success",
        args: {
          file_path: "/tmp/demo.txt",
          old_string: "beta",
          new_string: "gamma",
        },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "edit",
        toolCallId: "tool-edit-retry-success",
        isError: false,
        result: { ok: true },
      } as never,
    );

    expect(ctx.state.lastToolError).toBeUndefined();
    expect(ctx.state.replayState).toEqual({
      replayInvalid: true,
      hadPotentialSideEffects: true,
    });
  });
});

describe("handleToolExecutionUpdate generic tool progress text", () => {
  it("surfaces text partial results on generic tool item updates", async () => {
    const { ctx, onAgentEvent } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "model_memory_document_ingest",
        toolCallId: "tool-progress-1",
        args: { source: "docs/system/memory.md" },
      } as never,
    );

    handleToolExecutionUpdate(
      ctx as never,
      {
        type: "tool_execution_update",
        toolName: "model_memory_document_ingest",
        toolCallId: "tool-progress-1",
        partialResult: {
          content: [{ type: "text", text: "Document ingest 3/10: docs/system/memory.md" }],
        },
      } as ToolExecutionUpdateEvent,
    );

    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "item",
        data: expect.objectContaining({
          itemId: "tool:tool-progress-1",
          phase: "update",
          progressText: "Document ingest 3/10: docs/system/memory.md",
        }),
      }),
    );
  });
});

describe("handleToolExecutionEnd timeout metadata", () => {
  it("records timeout metadata for failed exec results", async () => {
    const { ctx } = createTestContext();

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-timeout",
        isError: true,
        result: {
          content: [
            {
              type: "text",
              text: "Command timed out after 1800 seconds.",
            },
          ],
          details: {
            status: "failed",
            timedOut: true,
            exitCode: null,
            durationMs: 1_800_000,
            aggregated: "",
          },
        },
      } as never,
    );

    expect(ctx.state.lastToolError).toMatchObject({
      toolName: "exec",
      timedOut: true,
    });
  });
});

describe("handleToolExecutionEnd exec approval prompts", () => {
  it("emits a deterministic approval payload and marks assistant output suppressed", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            expiresAtMs: 1_800_000_000_000,
            host: "gateway",
            command: "npm view diver name version description",
            cwd: "/tmp/work",
            warningText: "Warning: heredoc execution requires explicit approval in allowlist mode.",
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("```txt\n/approve 12345678 allow-once\n```"),
        channelData: {
          execApproval: expect.objectContaining({
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            approvalKind: "exec",
            allowedDecisions: ["allow-once", "allow-always", "deny"],
          }),
        },
        interactive: expect.objectContaining({
          blocks: expect.any(Array),
        }),
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("preserves filtered approval decisions from tool details", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval-ask-always",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            expiresAtMs: 1_800_000_000_000,
            allowedDecisions: ["allow-once", "deny"],
            host: "gateway",
            command: "npm view diver name version description",
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("allow-always"),
        channelData: {
          execApproval: expect.objectContaining({
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            approvalKind: "exec",
            allowedDecisions: ["allow-once", "deny"],
          }),
        },
        interactive: expect.objectContaining({
          blocks: expect.any(Array),
        }),
      }),
    );
  });

  it("emits a deterministic unavailable payload when the initiating surface cannot approve", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-unavailable",
        isError: false,
        result: {
          details: {
            status: "approval-unavailable",
            reason: "initiating-platform-disabled",
            channel: "discord",
            channelLabel: "Discord",
            accountId: "work",
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("native chat exec approvals are not configured on Discord"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("/approve"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("Pending command:"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("Host:"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("CWD:"),
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("emits the shared approver-DM notice when another approval client received the request", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-unavailable-dm-redirect",
        isError: false,
        result: {
          details: {
            status: "approval-unavailable",
            reason: "initiating-platform-disabled",
            channelLabel: "Telegram",
            sentApproverDms: true,
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Approval required. I sent approval DMs to the approvers for this account.",
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("does not suppress assistant output when deterministic prompt delivery rejects", async () => {
    const { ctx } = createTestContext();
    ctx.params.onToolResult = vi.fn(async () => {
      throw new Error("delivery failed");
    });

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval-reject",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            expiresAtMs: 1_800_000_000_000,
            host: "gateway",
            command: "npm view diver name version description",
            cwd: "/tmp/work",
          },
        },
      } as never,
    );

    expect(ctx.state.deterministicApprovalPromptSent).toBe(false);
  });

  it("emits approval + blocked command item events when exec needs approval", async () => {
    const { ctx, onAgentEvent } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-exec-approval-events",
        args: { command: "npm test" },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval-events",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            host: "gateway",
            command: "npm test",
          },
        },
      } as never,
    );

    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "approval",
        data: expect.objectContaining({
          phase: "requested",
          status: "pending",
          itemId: "command:tool-exec-approval-events",
          approvalId: "12345678-1234-1234-1234-123456789012",
          approvalSlug: "12345678",
        }),
      }),
    );
    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "item",
        data: expect.objectContaining({
          itemId: "command:tool-exec-approval-events",
          phase: "end",
          status: "blocked",
          summary: "Awaiting approval before command can run.",
        }),
      }),
    );
  });
});

describe("handleToolExecutionEnd derived tool events", () => {
  it("emits command output events for exec results", async () => {
    const { ctx, onAgentEvent } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-exec-output",
        args: { command: "ls" },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-output",
        isError: false,
        result: {
          details: {
            status: "completed",
            aggregated: "README.md",
            exitCode: 0,
            durationMs: 10,
            cwd: "/tmp/work",
          },
        },
      } as never,
    );

    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "command_output",
        data: expect.objectContaining({
          itemId: "command:tool-exec-output",
          phase: "end",
          output: "README.md",
          exitCode: 0,
          cwd: "/tmp/work",
        }),
      }),
    );
  });

  it("emits patch summary events for apply_patch results", async () => {
    const { ctx, onAgentEvent } = createTestContext();

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "apply_patch",
        toolCallId: "tool-patch-summary",
        args: { patch: "*** Begin Patch" },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "apply_patch",
        toolCallId: "tool-patch-summary",
        isError: false,
        result: {
          details: {
            summary: {
              added: ["a.ts"],
              modified: ["b.ts"],
              deleted: ["c.ts"],
            },
          },
        },
      } as never,
    );

    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "patch",
        data: expect.objectContaining({
          itemId: "patch:tool-patch-summary",
          added: ["a.ts"],
          modified: ["b.ts"],
          deleted: ["c.ts"],
          summary: "1 added, 1 modified, 1 deleted",
        }),
      }),
    );
  });
});

describe("messaging tool media URL tracking", () => {
  it("tracks media arg from messaging tool as pending", async () => {
    const { ctx } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m1",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, evt);

    expect(ctx.state.pendingMessagingMediaUrls.get("tool-m1")).toEqual(["file:///img.jpg"]);
  });

  it("commits pending media URL on tool success", async () => {
    const { ctx } = createTestContext();

    // Simulate start
    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m2",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, startEvt);

    // Simulate successful end
    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m2",
      isError: false,
      result: { ok: true },
    };

    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toContain("file:///img.jpg");
    expect(ctx.state.pendingMessagingMediaUrls.has("tool-m2")).toBe(false);
  });

  it("commits mediaUrls from tool result payload", async () => {
    const { ctx } = createTestContext();

    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m2b",
      args: { action: "send", to: "channel:123", content: "hi" },
    };
    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m2b",
      isError: false,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mediaUrls: ["file:///img-a.jpg", "file:///img-b.jpg"],
            }),
          },
        ],
      },
    };
    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toEqual([
      "file:///img-a.jpg",
      "file:///img-b.jpg",
    ]);
  });

  it("trims messagingToolSentMediaUrls to 200 on commit (FIFO)", async () => {
    const { ctx } = createTestContext();

    // Replace mock with a real trim that replicates production cap logic.
    const MAX = 200;
    ctx.trimMessagingToolSent = () => {
      if (ctx.state.messagingToolSentTexts.length > MAX) {
        const overflow = ctx.state.messagingToolSentTexts.length - MAX;
        ctx.state.messagingToolSentTexts.splice(0, overflow);
        ctx.state.messagingToolSentTextsNormalized.splice(0, overflow);
      }
      if (ctx.state.messagingToolSentTargets.length > MAX) {
        const overflow = ctx.state.messagingToolSentTargets.length - MAX;
        ctx.state.messagingToolSentTargets.splice(0, overflow);
      }
      if (ctx.state.messagingToolSentMediaUrls.length > MAX) {
        const overflow = ctx.state.messagingToolSentMediaUrls.length - MAX;
        ctx.state.messagingToolSentMediaUrls.splice(0, overflow);
      }
    };

    // Pre-fill with 200 URLs (url-0 .. url-199)
    for (let i = 0; i < 200; i++) {
      ctx.state.messagingToolSentMediaUrls.push(`file:///img-${i}.jpg`);
    }
    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(200);

    // Commit one more via start → end
    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-cap",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img-new.jpg" },
    };
    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-cap",
      isError: false,
      result: { ok: true },
    };
    await handleToolExecutionEnd(ctx, endEvt);

    // Should be capped at 200, oldest removed, newest appended.
    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(200);
    expect(ctx.state.messagingToolSentMediaUrls[0]).toBe("file:///img-1.jpg");
    expect(ctx.state.messagingToolSentMediaUrls[199]).toBe("file:///img-new.jpg");
    expect(ctx.state.messagingToolSentMediaUrls).not.toContain("file:///img-0.jpg");
  });

  it("discards pending media URL on tool error", async () => {
    const { ctx } = createTestContext();

    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m3",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m3",
      isError: true,
      result: "Error: failed",
    };

    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(0);
    expect(ctx.state.pendingMessagingMediaUrls.has("tool-m3")).toBe(false);
  });
});
