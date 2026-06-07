import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSessionStore } from "./store.js";
import {
  buildSessionWorkingContextRef,
  buildSessionWorkingContextPromptAddition,
  extractFileGraphSection,
  hasFileGraph,
  hasInlineContextWindows,
  readSessionWorkingContext,
  stripSessionWorkingContextPromptAddition,
  updateSessionWorkingContext,
} from "./working-context.js";

describe("session working context", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-working-context-"));
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

  it("detects inline source windows and file graph in prose scout output", () => {
    expect(
      hasInlineContextWindows("Bounded source windows:\n```ts\nexport const value = 1;\n```"),
    ).toBe(true);
    expect(hasFileGraph("file_graph: src/a.ts -> src/b.ts via import")).toBe(true);
    expect(
      extractFileGraphSection(
        [
          "Bounded source windows:",
          "```ts",
          "export const value = 1;",
          "```",
          "",
          "file_graph:",
          "- src/a.ts -> src/b.ts via import",
          "",
          "Risks/unknowns:",
          "- test owner unclear",
        ].join("\n"),
      ),
    ).toBe("file_graph:\n- src/a.ts -> src/b.ts via import");
  });

  it("persists bounded native task scout context on the session", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_file_graph";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
    });

    const result = await updateSessionWorkingContext({
      storePath,
      sessionKey,
      now: 1234,
      entry: {
        kind: "context_scout_result",
        sourceToolCallId: "task-file-graph",
        taskRef: "openclaw-native-task-result://run/task-file-graph",
        childResultRef: "openclaw-child-result://child/run",
        requestedAgentId: "execution-context-scout",
        childSessionKey: "agent:execution-context-scout:subagent:child",
        childRunId: "run-child",
        text: [
          "Direct answer: edit src/agents/tools/native-task-tool.ts.",
          "",
          "Bounded source windows:",
          "```ts",
          "export function createNativeTaskTool() {}",
          "```",
          "",
          "file_graph:",
          "- src/agents/tools/native-task-tool.ts -> src/agents/openclaw-tools.ts via registration",
        ].join("\n"),
      },
    });

    expect(result.persisted).toBe(true);
    if (!result.persisted) {
      throw new Error("expected persisted working context");
    }
    expect(result.workingContextRef).toBe(buildSessionWorkingContextRef(sessionKey));
    expect(result.entry).toMatchObject({
      kind: "context_scout_result",
      source: "native_task",
      sourceToolCallId: "task-file-graph",
      requestedAgentId: "execution-context-scout",
      hasInlineContextWindows: true,
      hasFileGraph: true,
      fileGraphTextByteCount: expect.any(Number),
      fileGraphTextHash: expect.any(String),
    });
    expect(result.workingContextEntryRef).toContain(encodeURIComponent(sessionKey));

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store[sessionKey]?.workingContext?.activeEntries).toHaveLength(1);
    expect(store[sessionKey]?.workingContext?.history[0]).toMatchObject({
      type: "working_context.updated",
      entryCount: 1,
      sourceToolCallId: "task-file-graph",
    });
    expect(store[sessionKey]?.workingContext?.history[0]?.entries[0]).not.toHaveProperty("text");
    expect(
      readSessionWorkingContext({ storePath, sessionKey })?.activeEntries[0]?.hasFileGraph,
    ).toBe(true);
  });

  it("persists compact change sets and validation state in the same native working context", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_unified_ledger";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
    });

    const changeSet = await updateSessionWorkingContext({
      storePath,
      sessionKey,
      now: 1234,
      entry: {
        kind: "change_set",
        source: "native_tool",
        sourceToolCallId: "edit-1",
        toolResultRef: "openclaw-tool-result://run/edit-1",
        status: "completed",
        changedFilePaths: ["src/a.ts"],
        modifiedFilePaths: ["src/a.ts"],
        text: [
          "Change set:",
          "tool=edit",
          "toolResultRef=openclaw-tool-result://run/edit-1",
          "status=completed",
          "changed_files:",
          "- src/a.ts",
        ].join("\n"),
      },
    });
    const validationState = await updateSessionWorkingContext({
      storePath,
      sessionKey,
      now: 1235,
      entry: {
        kind: "validation_state",
        source: "native_task",
        sourceToolCallId: "task-validation",
        taskRef: "openclaw-native-task-result://run/task-validation",
        childResultRef: "openclaw-child-result://validation/run",
        requestedAgentId: "execution-validation-scout",
        validationStatus: "completed",
        text: [
          "Validation result:",
          "commands run: pnpm test:file src/a.test.ts",
          "exit status: 0",
          "bounded output excerpt: passed",
        ].join("\n"),
      },
    });

    expect(changeSet.persisted).toBe(true);
    expect(validationState.persisted).toBe(true);
    const workingContext = readSessionWorkingContext({ storePath, sessionKey });
    expect(workingContext?.activeEntries.map((entry) => entry.kind)).toEqual([
      "change_set",
      "validation_state",
    ]);
    expect(workingContext?.activeEntries[0]).toMatchObject({
      source: "native_tool",
      toolResultRef: "openclaw-tool-result://run/edit-1",
      changedFilePaths: ["src/a.ts"],
      modifiedFilePaths: ["src/a.ts"],
    });
    expect(workingContext?.activeEntries[1]).toMatchObject({
      source: "native_task",
      requestedAgentId: "execution-validation-scout",
      validationStatus: "completed",
    });
    expect(workingContext?.history.at(-1)?.entries[0]).not.toHaveProperty("text");

    const addition = buildSessionWorkingContextPromptAddition(workingContext, { maxChars: 4_000 });
    expect(addition).toContain("change_set");
    expect(addition).toContain("validation_state");
    expect(addition).toContain("changedFilePaths=src/a.ts");
    expect(addition).toContain("validationStatus=completed");
  });

  it("formats working context as a bounded replaceable system prompt addition", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_prompt_context";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
    });
    await updateSessionWorkingContext({
      storePath,
      sessionKey,
      now: 1234,
      entry: {
        kind: "context_scout_result",
        requestedAgentId: "execution-context-scout",
        text: [
          "Bounded source windows:",
          "```ts",
          "export const marker = true;",
          "```",
          "file_graph: src/a.ts -> src/b.ts",
        ].join("\n"),
      },
    });

    const addition = buildSessionWorkingContextPromptAddition(
      readSessionWorkingContext({ storePath, sessionKey }),
      { maxChars: 2_000 },
    );

    expect(addition).toContain("<openclaw_native_working_context>");
    expect(addition).toContain("OpenClaw Native Working Context");
    expect(addition).toContain("Bounded source windows");
    expect(addition).toContain("file_graph");
    expect(addition).toContain("</openclaw_native_working_context>");
    expect(stripSessionWorkingContextPromptAddition(`base\n\n${addition}\n\ntail`)).toBe(
      "base\n\ntail",
    );
  });

  it("promotes native file_graph before large source windows during prompt rehydration", async () => {
    const sessionKey = "agent:execution-coding:node:nrun_prompt_file_graph";
    const storePath = await createStore({
      [sessionKey]: { sessionId: "sess-parent", updatedAt: 1 },
    });
    await updateSessionWorkingContext({
      storePath,
      sessionKey,
      now: 1234,
      entry: {
        kind: "context_scout_result",
        requestedAgentId: "execution-context-scout",
        text: [
          "Bounded source windows:",
          "```ts",
          "x".repeat(2_500),
          "```",
          "",
          "file_graph:",
          "- src/late.ts -> src/target.ts via registration",
          "",
          "Risks/unknowns:",
          "- none",
        ].join("\n"),
      },
    });

    const addition = buildSessionWorkingContextPromptAddition(
      readSessionWorkingContext({ storePath, sessionKey }),
      { maxChars: 1_200 },
    );

    expect(addition).toContain("Native file_graph promoted from the delivered scout result");
    expect(addition).toContain("src/late.ts -> src/target.ts");
    expect(addition).toContain("[working context truncated to bounded prompt budget]");
  });

  it("does not create working context for missing sessions", async () => {
    const storePath = await createStore({});

    const result = await updateSessionWorkingContext({
      storePath,
      sessionKey: "agent:execution-coding:node:missing",
      entry: {
        kind: "context_scout_result",
        text: "file_graph: src/a.ts",
      },
    });

    expect(result).toMatchObject({
      persisted: false,
      reason: "missing_session",
    });
  });
});
