import { describe, expect, it, vi } from "vitest";
import type { CandidateGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  buildCandidateReviewPromptFromTool,
  createCandidateReviewPromptTool,
  normalizeCandidateReviewPromptInput,
} from "./candidate-review-prompt.js";

function createAcceptedGetResult(): CandidateGetResult {
  return {
    accepted: true,
    status: "ok",
    candidate: {
      id: "candidate-1",
      eventId: "event-1",
      kind: "improvement",
      memoryKind: "project",
      reviewState: "candidate",
      content: "For repo tests, use pnpm test -- <path> instead of raw vitest.",
      candidateMetadata: {
        canonicalIngestionCandidate: {
          record: {
            kind: "feedback",
            subject: "repo tests",
            statement: "use pnpm test -- <path> instead of raw vitest",
            compatibility: {
              captureCategory: "workflow_improvement",
            },
          },
          compatibility: {
            captureClass: "workflow_tool_gotcha",
          },
        },
      },
      eventName: "candidate_submission.improvement",
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

describe("memory candidate review prompt tool", () => {
  it("normalizes a candidate review-prompt payload", () => {
    expect(
      normalizeCandidateReviewPromptInput({
        candidateId: " candidate-1 ",
      }),
    ).toEqual({
      candidateId: "candidate-1",
    });
  });

  it("builds a conversational review prompt from candidate data", async () => {
    const runtime = createRuntime();

    const result = await buildCandidateReviewPromptFromTool({
      runtime,
      input: { candidateId: "candidate-1" },
    });

    expect(runtime.candidateQuery.get).toHaveBeenCalledWith({
      candidateId: "candidate-1",
    });
    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      candidateId: "candidate-1",
      candidateKind: "improvement",
      memoryKind: "project",
      reviewState: "candidate",
      canonicalSummary: {
        kind: "feedback",
        subject: "repo tests",
        statement: "use pnpm test -- <path> instead of raw vitest",
        captureClass: "workflow_tool_gotcha",
        captureCategory: "workflow_improvement",
      },
      conversationalReview: {
        reviewToolName: "memory_candidate_review",
      },
    });
  });

  it("exposes the prompt through the tool surface", async () => {
    const runtime = createRuntime();
    const tool = createCandidateReviewPromptTool({ runtime });

    const result = await tool.execute("call-1", {
      candidateId: "candidate-1",
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      candidateId: "candidate-1",
      conversationalReview: {
        question:
          "Should I keep this candidate as memory, reject it, or revise it before keeping it?",
      },
    });
  });

  it("surfaces candidate-query failures unchanged", async () => {
    const runtime = createRuntime();
    runtime.candidateQuery.get = vi.fn(async () => ({
      accepted: false as const,
      status: "not_found" as const,
      reason: "candidate not found",
    }));

    const result = await buildCandidateReviewPromptFromTool({
      runtime,
      input: { candidateId: "candidate-missing" },
    });

    expect(result).toEqual({
      accepted: false,
      status: "not_found",
      reason: "candidate not found",
    });
  });
});
