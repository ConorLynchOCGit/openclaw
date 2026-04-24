import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatUrl,
  findTranscriptTerminalEvidenceFromEvents,
  hasRenderedProgressEvidence,
  hasRenderedTerminalEvidence,
  installOperatorPromptProbe,
  listPendingRequests,
  normalizeTranscriptGroups,
  resolvePromptRunFromProbeSlice,
  summarizeTurnEvidence,
} from "./lib/operator-browser-harness.mjs";

void test("buildChatUrl encodes the session and token into the sanctioned chat URL", () => {
  const url = buildChatUrl({
    origin: "https://srv1425839.tailbcf154.ts.net/",
    sessionKey: "agent:main:main",
    token: "abc 123",
  });
  assert.equal(
    url,
    "https://srv1425839.tailbcf154.ts.net/chat?session=agent%3Amain%3Amain#token=abc%20123",
  );
});

void test("normalizeTranscriptGroups coerces malformed transcript entries safely", () => {
  assert.deepEqual(normalizeTranscriptGroups([{ roleClass: "assistant", text: "ok" }, null]), [
    {
      roleClass: "assistant",
      senderName: "",
      footer: "",
      text: "ok",
    },
    {
      roleClass: "unknown",
      senderName: "",
      footer: "",
      text: "",
    },
  ]);
});

void test("summarizeTurnEvidence extracts the latest user and assistant transcript text", () => {
  const summary = summarizeTurnEvidence({
    prompt: "hello",
    after: {
      sessionKey: "agent:main:main",
      transcriptGroups: [
        { roleClass: "user", text: "hello" },
        { roleClass: "assistant", text: "world" },
      ],
    },
  });
  assert.equal(summary.prompt, "hello");
  assert.equal(summary.sessionKey, "agent:main:main");
  assert.equal(summary.lastUserText, "hello");
  assert.equal(summary.lastAssistantText, "world");
  assert.equal(summary.transcriptGroupCount, 2);
});

void test("summarizeTurnEvidence preserves transcript tail text when available", () => {
  const summary = summarizeTurnEvidence({
    prompt: "status",
    after: {
      transcriptTailText: "Working: cli · Background exec",
      transcriptGroups: [],
    },
  });
  assert.equal(summary.transcriptTailText, "Working: cli · Background exec");
});

void test("hasRenderedProgressEvidence only passes when visible bounded progress is rendered", () => {
  assert.equal(
    hasRenderedProgressEvidence({
      bodyTextSnippet: "Main Session\nQueued: 1\nWorking: indexing",
    }),
    true,
  );
  assert.equal(
    hasRenderedProgressEvidence({
      bodyTextSnippet: "Task running silently",
      transcriptTailText: "Working: Deep benchmark ingest 7/10",
    }),
    true,
  );
  assert.equal(
    hasRenderedProgressEvidence({
      bodyTextSnippet: "Task running silently",
      transcriptGroups: [{ text: "All good so far" }],
      queueItems: ["step pending"],
    }),
    false,
  );
});

void test("hasRenderedProgressEvidence also accepts Sessions view state labels", () => {
  assert.equal(
    hasRenderedProgressEvidence({
      bodyTextSnippet: "Sessions\nSTATE\nWorking\nCompleted",
    }),
    true,
  );
});

void test("hasRenderedTerminalEvidence accepts a rendered assistant reply after the matching prompt", () => {
  assert.equal(
    hasRenderedTerminalEvidence(
      {
        sendButtonLabel: "Send message",
        transcriptGroups: [
          { roleClass: "assistant", text: "old answer" },
          { roleClass: "user", text: "SOAK prompt" },
          { roleClass: "assistant", text: "SOAK answer" },
        ],
      },
      { prompt: "SOAK prompt", previousTranscriptCount: 1 },
    ),
    true,
  );
});

void test("hasRenderedTerminalEvidence rejects stale or still-running transcript state", () => {
  assert.equal(
    hasRenderedTerminalEvidence(
      {
        sendButtonLabel: "Send message",
        transcriptGroups: [
          { roleClass: "user", text: "SOAK prompt" },
          { roleClass: "assistant", text: "SOAK answer" },
        ],
      },
      { prompt: "SOAK prompt", previousTranscriptCount: 2 },
    ),
    false,
  );
  assert.equal(
    hasRenderedTerminalEvidence(
      {
        sendButtonLabel: "Stop generating",
        transcriptGroups: [
          { roleClass: "user", text: "SOAK prompt" },
          { roleClass: "assistant", text: "partial" },
        ],
      },
      { prompt: "SOAK prompt" },
    ),
    false,
  );
});

void test("findTranscriptTerminalEvidenceFromEvents finds the assistant answer after the matching user prompt", () => {
  const evidence = findTranscriptTerminalEvidenceFromEvents(
    [
      {
        type: "message",
        id: "user-old",
        timestamp: "2026-04-21T10:59:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "SOAK prompt" }] },
      },
      {
        type: "message",
        id: "assistant-old",
        timestamp: "2026-04-21T10:59:02.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "old" }] },
      },
      {
        type: "message",
        id: "user-new",
        timestamp: "2026-04-21T11:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "SOAK prompt" }] },
      },
      {
        type: "message",
        id: "assistant-new",
        timestamp: "2026-04-21T11:00:02.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "new answer" }] },
      },
    ],
    { prompt: "SOAK prompt", startedAtMs: Date.parse("2026-04-21T10:59:55.000Z") },
  );
  assert.deepEqual(evidence, {
    source: "session-jsonl",
    userMessageId: "user-new",
    assistantMessageId: "assistant-new",
    userTimestamp: "2026-04-21T11:00:00.000Z",
    assistantTimestamp: "2026-04-21T11:00:02.000Z",
    assistantText: "new answer",
  });
});

void test("findTranscriptTerminalEvidenceFromEvents skips model-memory activity records", () => {
  const evidence = findTranscriptTerminalEvidenceFromEvents(
    [
      {
        type: "message",
        id: "user-new",
        timestamp: "2026-04-21T11:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "HOST proof" }] },
      },
      {
        type: "message",
        id: "memory-activity",
        timestamp: "2026-04-21T11:00:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Memory activity" }],
          __openclaw: { kind: "model_memory_activity" },
        },
      },
      {
        type: "message",
        id: "assistant-new",
        timestamp: "2026-04-21T11:00:02.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "verified" }] },
      },
    ],
    { prompt: "HOST proof", startedAtMs: Date.parse("2026-04-21T10:59:55.000Z") },
  );
  assert.deepEqual(evidence, {
    source: "session-jsonl",
    userMessageId: "user-new",
    assistantMessageId: "assistant-new",
    userTimestamp: "2026-04-21T11:00:00.000Z",
    assistantTimestamp: "2026-04-21T11:00:02.000Z",
    assistantText: "verified",
  });
});

void test("findTranscriptTerminalEvidenceFromEvents skips turn-activity records", () => {
  const evidence = findTranscriptTerminalEvidenceFromEvents(
    [
      {
        type: "message",
        id: "user-new",
        timestamp: "2026-04-21T11:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "HOST proof" }] },
      },
      {
        type: "message",
        id: "turn-activity",
        timestamp: "2026-04-21T11:00:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Turn activity: model started" }],
          __openclaw: { kind: "turn_activity" },
        },
      },
      {
        type: "message",
        id: "assistant-new",
        timestamp: "2026-04-21T11:00:02.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "verified" }] },
      },
    ],
    { prompt: "HOST proof", startedAtMs: Date.parse("2026-04-21T10:59:55.000Z") },
  );
  assert.deepEqual(evidence, {
    source: "session-jsonl",
    userMessageId: "user-new",
    assistantMessageId: "assistant-new",
    userTimestamp: "2026-04-21T11:00:00.000Z",
    assistantTimestamp: "2026-04-21T11:00:02.000Z",
    assistantText: "verified",
  });
});

void test("listPendingRequests soft-fails to an empty list when the CLI lookup errors", () => {
  const originalExecPath = process.execPath;
  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  process.execPath = "/definitely-missing-node";
  process.env.OPENCLAW_CONFIG_PATH = "/definitely-missing-config.json";
  try {
    assert.deepEqual(listPendingRequests(), []);
  } finally {
    process.execPath = originalExecPath;
    if (originalConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    }
  }
});

void test("resolvePromptRunFromProbeSlice matches the prompt-specific chat.send frame to its acked run", () => {
  const promptRun = resolvePromptRunFromProbeSlice(
    {
      wsFrames: [
        {
          id: "ignore-1",
          method: "chat.send",
          message: "other prompt",
          sessionKey: "agent:main:main",
        },
        { id: "req-2", method: "chat.send", message: "status", sessionKey: "agent:main:main" },
      ],
      wsMessages: [
        { id: "ignore-1", ok: true, runId: "run-old" },
        { id: "req-2", ok: true, runId: "run-status" },
      ],
    },
    "status",
  );
  assert.deepEqual(promptRun, {
    requestId: "req-2",
    runId: "run-status",
    sessionKey: "agent:main:main",
  });
});

void test("resolvePromptRunFromProbeSlice returns null when the prompt-specific send was not acked", () => {
  const promptRun = resolvePromptRunFromProbeSlice(
    {
      wsFrames: [
        { id: "req-3", method: "chat.send", message: "status", sessionKey: "agent:main:main" },
      ],
      wsMessages: [{ id: "req-3", ok: false }],
    },
    "status",
  );
  assert.equal(promptRun, null);
});

void test("resolvePromptRunFromProbeSlice matches long prompts against the truncated probe payload", () => {
  const longPrompt = "x".repeat(480);
  const promptRun = resolvePromptRunFromProbeSlice(
    {
      wsFrames: [
        {
          id: "req-long",
          method: "chat.send",
          message: longPrompt.slice(0, 400),
          sessionKey: "agent:main:main",
        },
      ],
      wsMessages: [{ id: "req-long", ok: true, runId: "run-long" }],
    },
    longPrompt,
  );
  assert.deepEqual(promptRun, {
    requestId: "req-long",
    runId: "run-long",
    sessionKey: "agent:main:main",
  });
});

void test("installOperatorPromptProbe passes the probe message cap into the page context", async () => {
  let capturedFn = null;
  let capturedArg = null;
  const fakePage = {
    async addInitScript(fn, arg) {
      capturedFn = fn;
      capturedArg = arg;
    },
  };
  await installOperatorPromptProbe(fakePage);
  assert.equal(typeof capturedFn, "function");
  assert.equal(capturedArg, 400);
  assert.match(capturedFn.toString(), /probeMessageMaxChars/);
  assert.doesNotMatch(capturedFn.toString(), /PROBE_MESSAGE_MAX_CHARS/);
});
