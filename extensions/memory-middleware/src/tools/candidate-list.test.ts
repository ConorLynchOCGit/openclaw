import { describe, expect, it, vi } from "vitest";
import type { CandidateListResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createCandidateListTool, normalizeCandidateListInput } from "./candidate-list.js";

function createRuntime() {
  return {
    candidateQuery: {
      list: vi.fn(async () => createAcceptedListResult()),
      get: vi.fn(),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

function createAcceptedListResult(): CandidateListResult {
  return {
    accepted: true,
    status: "ok",
    candidates: [
      {
        id: "candidate-1",
        eventId: "event-1",
        kind: "learning",
        memoryKind: "project",
        reviewState: "candidate",
        content: "Remember this bounded learning.",
        eventName: "candidate_submission.learning",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ],
  };
}

describe("memory candidate list tool", () => {
  it("normalizes optional list filters", () => {
    expect(
      normalizeCandidateListInput({
        kind: "procedure",
        sessionId: " session-1 ",
        projectId: " project-1 ",
        agentId: " agent-1 ",
        limit: "7",
      }),
    ).toEqual({
      kind: "procedure",
      sessionId: "session-1",
      projectId: "project-1",
      agentId: "agent-1",
      limit: 7,
    });
  });

  it("routes list requests through the candidate query seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidateListTool({ runtime });

    const result = await tool.execute("call-1", {
      kind: "learning",
      projectId: "project-1",
      limit: 5,
    });

    expect(runtime.candidateQuery.list).toHaveBeenCalledWith({
      kind: "learning",
      projectId: "project-1",
      limit: 5,
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedListResult(), null, 2),
        },
      ],
      details: createAcceptedListResult(),
    });
  });

  it("surfaces disabled list results without side effects", async () => {
    const runtime = createRuntime();
    runtime.candidateQuery.list = vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      reason: "candidate query mode is not enabled",
    }));
    const tool = createCandidateListTool({ runtime });

    const result = await tool.execute("call-2", {});

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "candidate query mode is not enabled",
    });
  });

  it("rejects unsupported candidate list payloads", () => {
    expect(() =>
      normalizeCandidateListInput({
        kind: "memory",
      }),
    ).toThrow("kind must be one of");

    expect(() =>
      normalizeCandidateListInput({
        limit: ["bad"],
      }),
    ).toThrow("limit must be a number");
  });
});
