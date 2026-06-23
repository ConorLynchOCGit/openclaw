// Gateway Protocol tests cover agent behavior.
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { AgentParamsSchema } from "./agent.js";

/**
 * Regression coverage for agent-run schema payloads that carry internal
 * completion events. These events are produced by child automation and consumed
 * by parent agent runs, so the fixture mirrors the cross-runtime boundary.
 */
type AgentInternalEvent = {
  type: "task_completion";
  source: string;
  childSessionKey: string;
  childRunId?: string;
  childSessionId: string;
  fullResultRef?: string;
  resultArtifactRefs?: string[];
  announceType: string;
  taskLabel: string;
  status: "ok" | "error";
  statusLabel: string;
  result: string;
  attachments?: unknown[];
  mediaUrls?: string[];
  replyInstruction?: string;
  extensions?: Record<string, unknown>;
};

/** Builds the smallest valid agent request that embeds one internal event. */
function makeAgentParamsWithInternalEvent(event: AgentInternalEvent) {
  return {
    message: "A music generation task finished. Process the completion update now.",
    sessionKey: "agent:main:discord:channel:1456744319972282449",
    internalEvents: [event],
    idempotencyKey: "music_generate:task-123:ok",
  };
}

/** Representative generated-media completion event from a child task. */
const musicCompletionEvent: AgentInternalEvent = {
  type: "task_completion",
  source: "music_generation",
  childSessionKey: "music_generate:task-123",
  childRunId: "run-music-generate-123",
  childSessionId: "task-123",
  fullResultRef: "openclaw-session:music_generate:task-123",
  resultArtifactRefs: ["openclaw-run:run-music-generate-123"],
  announceType: "music generation task",
  taskLabel: "OpenClaw release anthem",
  status: "ok",
  statusLabel: "completed successfully",
  result: "Generated 1 track.",
  attachments: [
    {
      type: "audio",
      path: "/tmp/openclaw/generated-release-anthem.mp3",
      mimeType: "audio/mpeg",
      name: "generated-release-anthem.mp3",
    },
  ],
  mediaUrls: ["/tmp/openclaw/generated-release-anthem.mp3"],
  replyInstruction: "Deliver the generated music.",
  extensions: {
    deliveryAttempt: 1,
  },
};

describe("AgentParamsSchema", () => {
  it("accepts generated music attachments on internal completion events", () => {
    const params = makeAgentParamsWithInternalEvent(musicCompletionEvent);

    expect(Value.Check(AgentParamsSchema, params)).toBe(true);
  });

  it("keeps task completion internal events strict", () => {
    const params = makeAgentParamsWithInternalEvent({
      ...musicCompletionEvent,
      unexpected: true,
    } as AgentInternalEvent);

    expect(Value.Check(AgentParamsSchema, params)).toBe(false);
  });

  it("accepts versioned child completion metadata on internal events", () => {
    const params = makeAgentParamsWithInternalEvent({
      ...musicCompletionEvent,
      childRunId: "run-child-proof",
      fullResultRef: "openclaw-session:agent:planning:subagent:x",
      resultArtifactRefs: ["openclaw-run:run-child-proof"],
      extensions: {
        compactSummaryVersion: 1,
        childOutputSurface: "completion.resultText",
      },
    });

    expect(Value.Check(AgentParamsSchema, params)).toBe(true);
  });

  it("rejects malformed generated attachment entries on internal events", () => {
    const params = makeAgentParamsWithInternalEvent({
      ...musicCompletionEvent,
      attachments: [null],
    } as unknown as AgentInternalEvent);

    expect(Value.Check(AgentParamsSchema, params)).toBe(false);
  });
});
