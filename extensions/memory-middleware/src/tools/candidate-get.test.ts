import { describe, expect, it, vi } from "vitest";
import type { CandidateGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createCandidateGetTool, normalizeCandidateGetInput } from "./candidate-get.js";

function createAcceptedGetResult(): CandidateGetResult {
  return {
    accepted: true,
    status: "ok",
    candidate: {
      id: "candidate-1",
      eventId: "event-1",
      kind: "correction",
      memoryKind: "feedback",
      reviewState: "candidate",
      content: "Correct the stale memory mapping.",
      eventName: "candidate_submission.correction",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  };
}

function createRuntime() {
  return {
    candidateQuery: {
      list: vi.fn(),
      get: vi.fn(async () => createAcceptedGetResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate get tool", () => {
  it("normalizes a candidate get payload", () => {
    expect(
      normalizeCandidateGetInput({
        candidateId: " candidate-1 ",
      }),
    ).toEqual({
      candidateId: "candidate-1",
    });
  });

  it("routes candidate inspection through the candidate query seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidateGetTool({ runtime });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
    });

    expect(runtime.candidateQuery.get).toHaveBeenCalledWith({
      candidateId: "candidate-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedGetResult(), null, 2),
        },
      ],
      details: createAcceptedGetResult(),
    });
  });

  it("surfaces not-found results without side effects", async () => {
    const runtime = createRuntime();
    runtime.candidateQuery.get = vi.fn(async () => ({
      accepted: false as const,
      status: "not_found" as const,
      reason: "candidate not found",
    }));
    const tool = createCandidateGetTool({ runtime });

    const result = await tool.execute("call-2", {
      candidateId: "candidate-missing",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "not_found",
      reason: "candidate not found",
    });
  });

  it("rejects missing candidate ids", () => {
    expect(() =>
      normalizeCandidateGetInput({
        candidateId: "   ",
      }),
    ).toThrow("candidateId required");
  });
});
