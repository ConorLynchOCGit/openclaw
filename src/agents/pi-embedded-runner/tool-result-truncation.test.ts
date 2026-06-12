import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeAgentAssistantMessage } from "../test-helpers/agent-message-fixtures.js";

let truncateToolResultText: typeof import("./tool-result-truncation.js").truncateToolResultText;
let truncateToolResultMessage: typeof import("./tool-result-truncation.js").truncateToolResultMessage;
let calculateMaxToolResultChars: typeof import("./tool-result-truncation.js").calculateMaxToolResultChars;
let calculateMaxToolResultCharsWithCap: typeof import("./tool-result-truncation.js").calculateMaxToolResultCharsWithCap;
let getToolResultTextLength: typeof import("./tool-result-truncation.js").getToolResultTextLength;
let truncateOversizedToolResultsInMessages: typeof import("./tool-result-truncation.js").truncateOversizedToolResultsInMessages;
let truncateOversizedToolResultsInSession: typeof import("./tool-result-truncation.js").truncateOversizedToolResultsInSession;
let isOversizedToolResult: typeof import("./tool-result-truncation.js").isOversizedToolResult;
let sessionLikelyHasOversizedToolResults: typeof import("./tool-result-truncation.js").sessionLikelyHasOversizedToolResults;
let estimateToolResultReductionPotential: typeof import("./tool-result-truncation.js").estimateToolResultReductionPotential;
let DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS: typeof import("./tool-result-truncation.js").DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS;
let HARD_MAX_TOOL_RESULT_CHARS: typeof import("./tool-result-truncation.js").HARD_MAX_TOOL_RESULT_CHARS;
let resolveLiveToolResultMaxChars: typeof import("./tool-result-truncation.js").resolveLiveToolResultMaxChars;
let projectToolOutput: typeof import("./tool-result-truncation.js").projectToolOutput;
let projectMessagesForCompactionInput: typeof import("./tool-result-truncation.js").projectMessagesForCompactionInput;
let OLD_TOOL_RESULT_CONTENT_CLEARED: typeof import("./tool-result-truncation.js").OLD_TOOL_RESULT_CONTENT_CLEARED;
let tmpDir: string | undefined;

async function loadFreshToolResultTruncationModuleForTest() {
  ({
    truncateToolResultText,
    truncateToolResultMessage,
    calculateMaxToolResultChars,
    calculateMaxToolResultCharsWithCap,
    getToolResultTextLength,
    truncateOversizedToolResultsInMessages,
    truncateOversizedToolResultsInSession,
    isOversizedToolResult,
    sessionLikelyHasOversizedToolResults,
    estimateToolResultReductionPotential,
    DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS,
    HARD_MAX_TOOL_RESULT_CHARS,
    resolveLiveToolResultMaxChars,
    projectToolOutput,
    projectMessagesForCompactionInput,
    OLD_TOOL_RESULT_CONTENT_CLEARED,
  } = await import("./tool-result-truncation.js"));
}

let testTimestamp = 1;
const nextTimestamp = () => testTimestamp++;

beforeEach(async () => {
  testTimestamp = 1;
  await loadFreshToolResultTruncationModuleForTest();
});

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    tmpDir = undefined;
  }
});

function makeToolResult(text: string, toolCallId = "call_1"): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: nextTimestamp(),
  };
}

function makeUserMessage(text: string): UserMessage {
  return {
    role: "user",
    content: text,
    timestamp: nextTimestamp(),
  };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return makeAgentAssistantMessage({
    content: [{ type: "text", text }],
    model: "gpt-5.2",
    stopReason: "stop",
    timestamp: nextTimestamp(),
  });
}

function makeAssistantToolCallMessage(params: {
  id: string;
  name: string;
  args: Record<string, unknown>;
}): AgentMessage {
  return makeAgentAssistantMessage({
    content: [
      {
        type: "toolCall",
        id: params.id,
        name: params.name,
        arguments: params.args,
      },
    ],
    model: "gpt-5.2",
    stopReason: "toolUse",
    timestamp: nextTimestamp(),
  }) as AgentMessage;
}

function getFirstToolResultText(message: AgentMessage | ToolResultMessage): string {
  if (message.role !== "toolResult") {
    return "";
  }
  const firstBlock = message.content[0];
  return firstBlock && "text" in firstBlock ? firstBlock.text : "";
}

async function createTmpDir(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tool-result-truncation-test-"));
  return tmpDir;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return await listFilesRecursive(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

describe("truncateToolResultText", () => {
  it("returns text unchanged when under limit", () => {
    const text = "hello world";
    expect(truncateToolResultText(text, 1000)).toBe(text);
  });

  it("truncates text that exceeds limit", () => {
    const text = "a".repeat(10_000);
    const result = truncateToolResultText(text, 5_000);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain("truncated");
  });

  it("preserves at least MIN_KEEP_CHARS (2000) when the budget allows it", () => {
    const text = "x".repeat(50_000);
    const result = truncateToolResultText(text, 3_000);
    expect(result.length).toBeGreaterThan(2000);
  });

  it("tries to break at newline boundary", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}: ${"x".repeat(50)}`).join("\n");
    const result = truncateToolResultText(lines, 3000);
    // Should contain truncation notice
    expect(result).toContain("truncated");
    // The truncated content should be shorter than the original
    expect(result.length).toBeLessThan(lines.length);
    // Extract the kept content (before the truncation suffix marker)
    const suffixIndex = result.indexOf("\n\n⚠️");
    if (suffixIndex > 0) {
      const keptContent = result.slice(0, suffixIndex);
      // Should end at a newline boundary (i.e., the last char before suffix is a complete line)
      const lastNewline = keptContent.lastIndexOf("\n");
      // The last newline should be near the end (within the last line)
      expect(lastNewline).toBeGreaterThan(keptContent.length - 100);
    }
  });

  it("supports custom suffix and min keep chars", () => {
    const text = "x".repeat(5_000);
    const result = truncateToolResultText(text, 300, {
      suffix: "\n\n[custom-truncated]",
      minKeepChars: 250,
    });
    expect(result).toContain("[custom-truncated]");
    expect(result.length).toBeGreaterThan(250);
  });
});

describe("getToolResultTextLength", () => {
  it("sums all text blocks in tool results", () => {
    const msg: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "read",
      isError: false,
      content: [
        { type: "text", text: "abc" },
        { type: "image", data: "x", mimeType: "image/png" },
        { type: "text", text: "12345" },
      ],
      timestamp: nextTimestamp(),
    };

    expect(getToolResultTextLength(msg)).toBe(8);
  });

  it("returns zero for non-toolResult messages", () => {
    expect(getToolResultTextLength(makeAssistantMessage("hello"))).toBe(0);
  });
});

describe("projectToolOutput", () => {
  it("caps previews by line and byte limits while persisting full output", async () => {
    const dir = await createTmpDir();
    const stateRoot = path.join(dir, "state");
    const fullOutput = Array.from(
      { length: 20 },
      (_, index) => `line ${index}: ${"x".repeat(20)}`,
    ).join("\n");

    const result = projectToolOutput({
      text: fullOutput,
      options: {
        maxLines: 3,
        maxBytes: 200,
        stateRoot,
        sessionKey: "agent:execution-coding:node:nrun_projection",
        toolCallId: "call_projection",
        toolName: "read",
        reason: "test_projection",
      },
    });

    expect(result.truncated).toBe(true);
    expect(result.returnedLines).toBeLessThanOrEqual(3);
    expect(result.returnedBytes).toBeLessThanOrEqual(200);
    expect(result.content).toContain("Output truncated.");
    expect(result.content).toContain("Full output saved to:");
    expect(result.managedOutput?.ref).toContain("openclaw-managed-output://");
    expect(result.managedOutput?.outputPath).toContain("managed-tool-output");

    const files = await listFilesRecursive(path.join(stateRoot, "managed-tool-output"));
    const outputFile = files.find((file) => file.endsWith(".txt"));
    expect(outputFile).toBeDefined();
    expect(await fs.readFile(outputFile ?? "", "utf8")).toBe(fullOutput);
  });
});

describe("projectMessagesForCompactionInput", () => {
  it("caps compaction-model tool output while persisting the full text", async () => {
    const dir = await createTmpDir();
    const stateRoot = path.join(dir, "state");
    const fullOutput = Array.from(
      { length: 1_000 },
      (_, index) => `compaction log line ${index}: ${"x".repeat(40)}`,
    ).join("\n");

    const result = projectMessagesForCompactionInput({
      messages: [makeToolResult(fullOutput, "call_compaction_input") as AgentMessage],
      stateRoot,
      sessionKey: "agent:execution-coding:node:nrun_compaction_input",
    });

    expect(result.projectedCount).toBe(1);
    expect(result.toolResultProjectedCount).toBe(1);
    const text = getFirstToolResultText(result.messages[0] as ToolResultMessage);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(2_000);
    expect(text).toContain("Output truncated.");
    expect(text).toContain("Full output saved to:");
    expect(text).toContain("Use Grep to search the full content or Read with offset/limit");

    const files = await listFilesRecursive(path.join(stateRoot, "managed-tool-output"));
    const outputFile = files.find((file) => file.endsWith(".txt"));
    expect(outputFile).toBeDefined();
    expect(await fs.readFile(outputFile ?? "", "utf8")).toBe(fullOutput);
  });
});

describe("truncateToolResultMessage", () => {
  it("truncates with a custom suffix", () => {
    const msg: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call_1",
      toolName: "read",
      content: [{ type: "text", text: "x".repeat(50_000) }],
      isError: false,
      timestamp: nextTimestamp(),
    };

    const result = truncateToolResultMessage(msg, 10_000, {
      suffix: "\n\n[persist-truncated]",
      minKeepChars: 2_000,
    });
    expect(result.role).toBe("toolResult");
    if (result.role !== "toolResult") {
      throw new Error("expected toolResult");
    }
    expect(getFirstToolResultText(result)).toContain("[persist-truncated]");
  });
});

describe("calculateMaxToolResultChars", () => {
  it("scales with context window size", () => {
    const small = calculateMaxToolResultChars(8_000);
    const large = calculateMaxToolResultChars(200_000);
    expect(large).toBeGreaterThan(small);
  });

  it("exports the live cap through both constant names", () => {
    expect(DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS).toBe(50 * 1024);
    expect(HARD_MAX_TOOL_RESULT_CHARS).toBe(DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS);
  });

  it("caps at HARD_MAX_TOOL_RESULT_CHARS for very large windows", () => {
    const result = calculateMaxToolResultChars(2_000_000); // 2M token window
    expect(result).toBeLessThanOrEqual(HARD_MAX_TOOL_RESULT_CHARS);
  });

  it("caps 128K contexts at the live tool-result ceiling", () => {
    const result = calculateMaxToolResultChars(128_000);
    expect(result).toBe(DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS);
  });

  it("supports a higher configured hard cap", () => {
    const result = calculateMaxToolResultCharsWithCap(128_000, 32_000);
    expect(result).toBe(32_000);
  });

  it("resolves per-agent tool-result cap overrides", () => {
    const result = resolveLiveToolResultMaxChars({
      contextWindowTokens: 128_000,
      cfg: {
        agents: {
          defaults: {
            contextLimits: {
              toolResultMaxChars: 24_000,
            },
          },
          list: [{ id: "writer" }],
        },
      },
      agentId: "writer",
    });
    expect(result).toBe(24_000);
  });
});

describe("isOversizedToolResult", () => {
  it("returns false for small tool results", () => {
    const msg = makeToolResult("small content");
    expect(isOversizedToolResult(msg, 200_000)).toBe(false);
  });

  it("returns true for oversized tool results", () => {
    const msg = makeToolResult("x".repeat(500_000));
    expect(isOversizedToolResult(msg, 128_000)).toBe(true);
  });

  it("honors an explicit higher maxChars override", () => {
    const msg = makeToolResult("x".repeat(20_000));
    expect(isOversizedToolResult(msg, 128_000, 24_000)).toBe(false);
  });

  it("returns false for non-toolResult messages", () => {
    const msg = makeUserMessage("x".repeat(500_000));
    expect(isOversizedToolResult(msg, 128_000)).toBe(false);
  });
});

describe("sessionLikelyHasOversizedToolResults", () => {
  it("returns true for individually oversized tool results", () => {
    const messages: AgentMessage[] = [makeToolResult("x".repeat(500_000))];
    expect(sessionLikelyHasOversizedToolResults({ messages, contextWindowTokens: 128_000 })).toBe(
      true,
    );
  });

  it("returns true for aggregate medium tool results that exceed the shared budget", () => {
    const medium = "alpha beta gamma delta epsilon ".repeat(600);
    const messages: AgentMessage[] = [
      makeToolResult(medium, "call_1"),
      makeToolResult(medium, "call_2"),
      makeToolResult(medium, "call_3"),
    ];
    expect(sessionLikelyHasOversizedToolResults({ messages, contextWindowTokens: 128_000 })).toBe(
      true,
    );
  });
});

describe("estimateToolResultReductionPotential", () => {
  it("reports no reducible budget when tool results are already small", () => {
    const messages: AgentMessage[] = [makeToolResult("small result")];

    const estimate = estimateToolResultReductionPotential({
      messages,
      contextWindowTokens: 128_000,
    });

    expect(estimate.toolResultCount).toBe(1);
    expect(estimate.maxReducibleChars).toBe(0);
  });

  it("estimates reducible chars for aggregate medium tool-result tails", () => {
    const medium = "alpha beta gamma delta epsilon ".repeat(600);
    const messages: AgentMessage[] = [
      makeToolResult(medium, "call_1"),
      makeToolResult(medium, "call_2"),
      makeToolResult(medium, "call_3"),
    ];

    const estimate = estimateToolResultReductionPotential({
      messages,
      contextWindowTokens: 128_000,
    });

    expect(estimate.toolResultCount).toBe(3);
    expect(estimate.oversizedCount).toBe(0);
    expect(estimate.aggregateReducibleChars).toBeGreaterThan(0);
    expect(estimate.maxReducibleChars).toBe(estimate.aggregateReducibleChars);
  });

  it("estimates successful settled mutation tool calls as reducible replay payload", () => {
    const oldText = `old edit payload\n${"a".repeat(20_000)}`;
    const newText = `new edit payload\n${"b".repeat(20_000)}`;
    const messages: AgentMessage[] = [
      makeUserMessage("edit the file") as AgentMessage,
      makeAssistantToolCallMessage({
        id: "edit_call_large",
        name: "edit",
        args: {
          path: "src/example.ts",
          oldText,
          newText,
        },
      }),
      makeToolResult(
        "Successfully replaced text in src/example.ts.",
        "edit_call_large",
      ) as AgentMessage,
    ];

    const estimate = estimateToolResultReductionPotential({
      messages,
      contextWindowTokens: 128_000,
    });

    expect(estimate.mutationToolCallCount).toBe(1);
    expect(estimate.mutationToolCallReducibleChars).toBeGreaterThan(0);
    expect(estimate.maxReducibleChars).toBe(estimate.mutationToolCallReducibleChars);
    expect(sessionLikelyHasOversizedToolResults({ messages, contextWindowTokens: 128_000 })).toBe(
      true,
    );
  });

  it("counts aggregate savings on top of oversized savings in a single pass", () => {
    const oversized = "x".repeat(500_000);
    const medium = "alpha beta gamma delta epsilon ".repeat(800);
    const messages: AgentMessage[] = [
      makeToolResult(oversized, "call_1"),
      makeToolResult(medium, "call_2"),
      makeToolResult(medium, "call_3"),
    ];

    const estimate = estimateToolResultReductionPotential({
      messages,
      contextWindowTokens: 128_000,
    });

    expect(estimate.oversizedCount).toBeGreaterThan(0);
    expect(estimate.oversizedReducibleChars).toBeGreaterThan(0);
    expect(estimate.aggregateReducibleChars).toBeGreaterThan(0);
    expect(estimate.maxReducibleChars).toBe(
      estimate.oversizedReducibleChars + estimate.aggregateReducibleChars,
    );
  });

  it("lets tiny caps drive oversized recovery while preserving preview floors when possible", () => {
    const medium = "alpha beta gamma delta epsilon ".repeat(600);
    const messages: AgentMessage[] = [
      makeToolResult(medium, "call_1"),
      makeToolResult(medium, "call_2"),
      makeToolResult(medium, "call_3"),
    ];

    const estimate = estimateToolResultReductionPotential({
      messages,
      contextWindowTokens: 128_000,
      maxCharsOverride: 120,
    });

    expect(estimate.maxChars).toBe(120);
    expect(estimate.aggregateBudgetChars).toBe(120);
    expect(estimate.oversizedCount).toBe(3);
    expect(estimate.aggregateReducibleChars).toBe(0);
  });
});

describe("truncateOversizedToolResultsInMessages", () => {
  it("returns unchanged messages when nothing is oversized", () => {
    const messages = [
      makeUserMessage("hello"),
      makeAssistantMessage("using tool"),
      makeToolResult("small result"),
    ];
    const { messages: result, truncatedCount } = truncateOversizedToolResultsInMessages(
      messages,
      200_000,
    );
    expect(truncatedCount).toBe(0);
    expect(result).toEqual(messages);
  });

  it("truncates oversized tool results", () => {
    const bigContent = "x".repeat(500_000);
    const messages: AgentMessage[] = [
      makeUserMessage("hello"),
      makeAssistantMessage("reading file"),
      makeToolResult(bigContent),
    ];
    const { messages: result, truncatedCount } = truncateOversizedToolResultsInMessages(
      messages,
      128_000,
    );
    expect(truncatedCount).toBe(1);
    const toolResult = result[2];
    expect(toolResult?.role).toBe("toolResult");
    const text = toolResult ? getFirstToolResultText(toolResult) : "";
    expect(text.length).toBeLessThan(bigContent.length);
    expect(text).toContain("truncated");
  });

  it("preserves non-toolResult messages", () => {
    const messages = [
      makeUserMessage("hello"),
      makeAssistantMessage("reading file"),
      makeToolResult("x".repeat(500_000)),
    ];
    const { messages: result } = truncateOversizedToolResultsInMessages(messages, 128_000);
    expect(result[0]).toBe(messages[0]); // Same reference
    expect(result[1]).toBe(messages[1]); // Same reference
  });

  it("handles multiple oversized tool results", () => {
    const messages: AgentMessage[] = [
      makeUserMessage("hello"),
      makeAssistantMessage("reading files"),
      makeToolResult("x".repeat(500_000), "call_1"),
      makeToolResult("y".repeat(500_000), "call_2"),
    ];
    const { messages: result, truncatedCount } = truncateOversizedToolResultsInMessages(
      messages,
      128_000,
    );
    expect(truncatedCount).toBe(2);
    for (const msg of result.slice(2)) {
      expect(msg.role).toBe("toolResult");
      const text = getFirstToolResultText(msg);
      expect(text.length).toBeLessThan(500_000);
    }
  });
});

describe("truncateOversizedToolResultsInSession", () => {
  it("clears old settled tool-result output to a compact marker with managed-output ref", async () => {
    const dir = await createTmpDir();
    const stateRoot = path.join(dir, "state");
    const sm = SessionManager.create(path.join(dir, "session"), path.join(dir, "session"));
    const oldOutput = `old-output-marker\n${"x".repeat(90_000)}`;
    sm.appendMessage(makeUserMessage("old task"));
    sm.appendMessage(makeAssistantMessage("calling old tool"));
    sm.appendMessage(makeToolResult(oldOutput, "call_old"));
    sm.appendMessage(makeUserMessage("middle task"));
    sm.appendMessage(makeAssistantMessage("calling protected tool"));
    sm.appendMessage(makeToolResult("protected recent result", "call_recent"));
    sm.appendMessage(makeUserMessage("latest task"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 1_000_000,
      sessionKey: "agent:execution-coding:node:nrun_old_tool_result",
      stateRoot,
    });

    expect(result.truncated).toBe(true);
    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResults = afterBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const texts = toolResults.map((entry) =>
      entry.type === "message" ? getFirstToolResultText(entry.message) : "",
    );
    expect(texts[0]).toContain(OLD_TOOL_RESULT_CONTENT_CLEARED);
    expect(texts[0]).toContain("Full output saved to:");
    expect(texts[0]).toContain("<content>");
    expect(texts[0]).toContain("old-output-marker");
    expect(texts[0]).toContain("Use Grep to search the full content or Read with offset/limit");
    expect(texts[1]).toBe("protected recent result");

    const files = await listFilesRecursive(path.join(stateRoot, "managed-tool-output"));
    const outputFile = files.find((file) => file.endsWith(".txt"));
    expect(outputFile).toBeDefined();
    expect(await fs.readFile(outputFile ?? "", "utf8")).toBe(oldOutput);
  });

  it("compacts old settled mutation tool-call input payloads for provider replay", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    const oldText = `old edit text\n${"a".repeat(20_000)}`;
    const newText = `new edit text\n${"b".repeat(20_000)}`;
    sm.appendMessage(makeUserMessage("old edit task"));
    sm.appendMessage(
      makeAssistantToolCallMessage({
        id: "edit_call_old",
        name: "edit",
        args: {
          path: "src/example.ts",
          edits: [{ oldText, newText }],
        },
      }) as Parameters<typeof sm.appendMessage>[0],
    );
    sm.appendMessage(
      makeToolResult("Successfully replaced text in src/example.ts.", "edit_call_old"),
    );
    sm.appendMessage(makeUserMessage("middle task"));
    sm.appendMessage(makeAssistantMessage("middle answer"));
    sm.appendMessage(makeUserMessage("latest task"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 1_000_000,
      sessionKey: "agent:execution-coding:node:nrun_edit_replay",
    });

    expect(result.truncated).toBe(true);
    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const assistantEntry = afterBranch.find(
      (entry) => entry.type === "message" && entry.message.role === "assistant",
    );
    expect(assistantEntry?.type).toBe("message");
    if (!assistantEntry || assistantEntry.type !== "message") {
      throw new Error("expected compacted assistant tool call");
    }
    const content = (assistantEntry.message as { content?: unknown }).content;
    expect(Array.isArray(content)).toBe(true);
    const toolCall = (content as Array<Record<string, unknown>>).find(
      (block) => block.type === "toolCall",
    );
    const args = toolCall?.arguments as { edits?: Array<{ oldText?: string; newText?: string }> };
    expect(args?.edits?.[0]?.oldText).toContain("oldText omitted from settled tool-call replay");
    expect(args?.edits?.[0]?.newText).toContain("newText omitted from settled tool-call replay");
    expect(JSON.stringify(args)).not.toContain(oldText);
    expect(JSON.stringify(args)).not.toContain(newText);
  });

  it("readably truncates aggregate medium tool results in a session file", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    const medium = "alpha beta gamma delta epsilon ".repeat(600);
    sm.appendMessage(makeToolResult(medium, "call_1"));
    sm.appendMessage(makeToolResult(medium, "call_2"));
    sm.appendMessage(makeToolResult(medium, "call_3"));
    const sessionFile = sm.getSessionFile()!;

    const beforeBranch = SessionManager.open(sessionFile).getBranch();
    const beforeLengths = beforeBranch
      .filter((entry) => entry.type === "message")
      .map((entry) =>
        entry.type === "message" && entry.message.role === "toolResult"
          ? getToolResultTextLength(entry.message)
          : 0,
      )
      .filter((length) => length > 0);

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBeGreaterThan(0);

    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const afterToolResults = afterBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const afterLengths = afterToolResults.map((entry) =>
      entry.type === "message" ? getToolResultTextLength(entry.message) : 0,
    );

    expect(afterLengths.reduce((sum, value) => sum + value, 0)).toBeLessThan(
      beforeLengths.reduce((sum, value) => sum + value, 0),
    );
    expect(
      afterToolResults.some((entry) =>
        entry.type === "message"
          ? getFirstToolResultText(entry.message).includes("truncated")
          : false,
      ),
    ).toBe(true);
    expect(
      afterToolResults.some((entry) =>
        entry.type === "message"
          ? getFirstToolResultText(entry.message).includes("[compacted:")
          : false,
      ),
    ).toBe(false);
  });

  it("reduces aggregate tool-result replay while preserving bounded preview text", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    const olderLarge = "older-large ".repeat(1_000);
    const newerEnough = "newer-enough ".repeat(500);
    sm.appendMessage(makeToolResult(olderLarge, "call_1"));
    sm.appendMessage(makeToolResult(newerEnough, "call_2"));
    const sessionFile = sm.getSessionFile()!;

    const beforeBranch = SessionManager.open(sessionFile).getBranch();
    const beforeToolResults = beforeBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const beforeTexts = beforeToolResults.map((entry) =>
      entry.type === "message" ? getFirstToolResultText(entry.message) : "",
    );

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 15_000,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBeGreaterThanOrEqual(1);

    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const afterToolResults = afterBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const afterTexts = afterToolResults.map((entry) =>
      entry.type === "message" ? getFirstToolResultText(entry.message) : "",
    );

    expect(afterTexts.join("\n").length).toBeLessThan(beforeTexts.join("\n").length);
    expect(afterTexts.some((text) => text.includes("truncated"))).toBe(true);
    expect(afterTexts.every((text) => text.length > 0)).toBe(true);
  });

  it("allows persisted-session recovery truncation to shrink below the old 2k floor", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    sm.appendMessage(makeToolResult("x".repeat(500_000), "call_1"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 100,
    });

    expect(result.truncated).toBe(true);
    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResult = afterBranch.find(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    expect(toolResult?.type).toBe("message");
    if (!toolResult || toolResult.type !== "message") {
      throw new Error("expected truncated tool result");
    }
    const text = getFirstToolResultText(toolResult.message);
    expect(text.length).toBeLessThan(2_000);
    expect(text).toContain("truncated");
  });

  it("preserves source-shaped read previews during persisted-session recovery truncation", async () => {
    const dir = await createTmpDir();
    const stateRoot = path.join(dir, "state");
    const sm = SessionManager.create(path.join(dir, "session"), path.join(dir, "session"));
    const sourceWindow = [
      "<path>src/large.ts</path>",
      "<type>file</type>",
      "<content>",
      ...Array.from(
        { length: 400 },
        (_, index) => `${index + 1}: export const value${index} = ${index};`,
      ),
      "</content>",
    ].join("\n");
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling read"));
    sm.appendMessage(makeToolResult(sourceWindow, "call_1"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 5_000,
      sessionKey: "agent:execution-coding:node:nrun_source_preview",
      stateRoot,
    });

    expect(result.truncated).toBe(true);
    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResult = afterBranch.find(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    expect(toolResult?.type).toBe("message");
    if (!toolResult || toolResult.type !== "message") {
      throw new Error("expected truncated tool result");
    }
    const text = getFirstToolResultText(toolResult.message);
    expect(text).toContain("<path>src/large.ts</path>");
    expect(text).toContain("<content>");
    expect(text).toContain("1: export const value0 = 0;");
    expect(text).toContain("Full output saved to:");
    expect(text).toContain("Output truncated.");
  });

  it("persists full generic tool output to managed storage when truncating provider-visible history", async () => {
    const dir = await createTmpDir();
    const stateRoot = path.join(dir, "state");
    const sm = SessionManager.create(path.join(dir, "session"), path.join(dir, "session"));
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    const fullOutput = `important-full-output-marker\n${"x".repeat(75_000)}`;
    sm.appendMessage(makeToolResult(fullOutput, "call_1"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 5_000,
      sessionKey: "agent:execution-context-scout:subagent:test",
      stateRoot,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBe(1);

    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResult = afterBranch.find(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    expect(toolResult?.type).toBe("message");
    if (!toolResult || toolResult.type !== "message") {
      throw new Error("expected truncated tool result");
    }
    const text = getFirstToolResultText(toolResult.message);
    expect(text).toContain("Full output saved to:");
    expect(text).toContain("Use Grep to search the full content or Read with offset/limit");
    expect(text.length).toBeLessThan(fullOutput.length);

    const files = await listFilesRecursive(path.join(stateRoot, "managed-tool-output"));
    const outputFile = files.find((file) => file.endsWith(".txt"));
    expect(outputFile).toBeDefined();
    expect(await fs.readFile(outputFile ?? "", "utf8")).toBe(fullOutput);
  });

  it("combines oversized and aggregate recovery truncation in the same session rewrite", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    sm.appendMessage(makeToolResult("x".repeat(500_000), "call_1"));
    const medium = "alpha beta gamma delta epsilon ".repeat(800);
    sm.appendMessage(makeToolResult(medium, "call_2"));
    sm.appendMessage(makeToolResult(medium, "call_3"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.truncatedCount).toBe(3);

    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResults = afterBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const toolTexts = toolResults.map((entry) =>
      entry.type === "message" ? getFirstToolResultText(entry.message) : "",
    );

    expect(toolTexts[0]).toContain("truncated");
    expect(toolTexts[1].length).toBeGreaterThan(0);
    expect(toolTexts[2].length).toBeGreaterThan(0);
  });

  it("lets aggregate recovery honor a tiny explicit cap during persisted rewrite", async () => {
    const dir = await createTmpDir();
    const sm = SessionManager.create(dir, dir);
    sm.appendMessage(makeUserMessage("hello"));
    sm.appendMessage(makeAssistantMessage("calling tools"));
    const medium = "alpha beta gamma delta epsilon ".repeat(800);
    sm.appendMessage(makeToolResult(medium, "call_1"));
    sm.appendMessage(makeToolResult(medium, "call_2"));
    sm.appendMessage(makeToolResult(medium, "call_3"));
    const sessionFile = sm.getSessionFile()!;

    const result = await truncateOversizedToolResultsInSession({
      sessionFile,
      contextWindowTokens: 128_000,
      maxCharsOverride: 120,
    });

    expect(result.truncated).toBe(true);
    const afterBranch = SessionManager.open(sessionFile).getBranch();
    const toolResults = afterBranch.filter(
      (entry) => entry.type === "message" && entry.message.role === "toolResult",
    );
    const totalChars = toolResults.reduce(
      (sum, entry) => sum + (entry.type === "message" ? getToolResultTextLength(entry.message) : 0),
      0,
    );

    expect(totalChars).toBeLessThan(medium.length * 3);
    expect(
      toolResults.some((entry) =>
        entry.type === "message"
          ? getFirstToolResultText(entry.message).includes("truncated")
          : false,
      ),
    ).toBe(true);
  });
});

describe("truncateToolResultText head+tail strategy", () => {
  it("preserves error content at the tail when present", () => {
    const head = "Line 1\n".repeat(500);
    const middle = "data data data\n".repeat(500);
    const tail = "\nError: something failed\nStack trace: at foo.ts:42\n";
    const text = head + middle + tail;
    const result = truncateToolResultText(text, 5000);
    // Should contain both the beginning and the error at the end
    expect(result).toContain("Line 1");
    expect(result).toContain("Error: something failed");
    expect(result).toContain("middle content omitted");
  });

  it("uses simple head truncation when tail has no important content", () => {
    const text = "normal line\n".repeat(1000);
    const result = truncateToolResultText(text, 5000);
    expect(result).toContain("normal line");
    expect(result).not.toContain("middle content omitted");
    expect(result).toContain("truncated");
  });
});
