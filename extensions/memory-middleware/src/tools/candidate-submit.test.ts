import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginToolContext } from "../../api.js";
import type { CandidateSubmissionInput, CandidateSubmissionResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createCandidateSubmitTool,
  normalizeCandidateSubmissionInput,
} from "./candidate-submit.js";

function createAcceptedResult(kind: CandidateSubmissionInput["kind"]): CandidateSubmissionResult {
  return {
    accepted: true,
    status: "accepted",
    kind,
    storage: "database",
    reviewState: "candidate",
    eventId: "event-1",
    memoryObjectId: "memory-1",
  };
}

function createRuntime() {
  return {
    config: {
      database: {
        driver: "postgres",
        schema: "memory_middleware",
        url: "",
      },
      autoPromotion: {
        profile: "explicit-user-preference-v1",
        allowedAgents: ["chief", "main"],
      },
    },
    candidateIngress: {
      submitLearning: vi.fn(async () => createAcceptedResult("learning")),
      submitCorrectionSuggestion: vi.fn(async () => createAcceptedResult("correction")),
      submitProcedureSuggestion: vi.fn(async () => createAcceptedResult("procedure")),
      submitImprovementNote: vi.fn(async () => createAcceptedResult("improvement")),
    },
    candidateReview: {
      review: vi.fn(async () => ({
        accepted: true as const,
        status: "recorded" as const,
        candidateId: "memory-1",
        outcome: "accepted" as const,
        reviewId: "review-1",
        memoryObjectStateChanged: false,
        reviewState: "candidate" as const,
      })),
    },
    candidatePromotion: {
      promoteToMemory: vi.fn(async () => ({
        accepted: true as const,
        status: "promoted" as const,
        candidateId: "memory-1",
        promotedMemoryObjectId: "approved-1",
        promotedMemoryKind: "project" as const,
        promotedReviewState: "approved" as const,
        sourceEventId: "event-1",
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate submit tool", () => {
  it("normalizes a candidate payload without inheriting live context identifiers", () => {
    const normalized = normalizeCandidateSubmissionInput({
      rawParams: {
        kind: "learning",
        content: "  keep this learning  ",
        metadata: { source: "test" },
      },
      context: {
        sessionId: "077d919e-1ea8-49ab-b316-4e7e611add6b",
        agentId: "7dc823b4-8835-46df-80a1-9d873f2d60ea",
      } as OpenClawPluginToolContext,
    });

    expect(normalized).toEqual({
      kind: "learning",
      content: "keep this learning",
      metadata: { source: "test" },
    });
  });

  it("ignores trusted context identifiers even when they are valid UUIDs", () => {
    const normalized = normalizeCandidateSubmissionInput({
      rawParams: {
        kind: "learning",
        content: "keep this learning",
      },
      context: {
        sessionId: "077d919e-1ea8-49ab-b316-4e7e611add6b",
        agentId: "chief",
      } as OpenClawPluginToolContext,
    });

    expect(normalized).toEqual({
      kind: "learning",
      content: "keep this learning",
    });
  });

  it("accepts only valid explicit UUID identifiers in tool args", () => {
    const normalized = normalizeCandidateSubmissionInput({
      rawParams: {
        kind: "learning",
        content: "keep this learning",
        sessionId: "not-a-uuid",
        agentId: "chief",
        projectId: "project-1",
      },
    });

    expect(normalized).toEqual({
      kind: "learning",
      content: "keep this learning",
    });
  });

  it("routes supported candidate kinds through the candidate ingress seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: "077d919e-1ea8-49ab-b316-4e7e611add6b",
        agentId: "7dc823b4-8835-46df-80a1-9d873f2d60ea",
      },
    });

    const result = await tool.execute("call-1", {
      kind: "procedure",
      content: "Turn this into a bounded procedure draft.",
      projectId: "3b2307bd-6880-4b77-a1a3-64a8a4ddf544",
      metadata: { source: "unit-test" },
    });

    expect(runtime.candidateIngress.submitProcedureSuggestion).toHaveBeenCalledWith({
      kind: "procedure",
      content: "Turn this into a bounded procedure draft.",
      projectId: "3b2307bd-6880-4b77-a1a3-64a8a4ddf544",
      metadata: { source: "unit-test" },
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("procedure"), null, 2),
        },
      ],
      details: createAcceptedResult("procedure"),
    });
  });

  it("surfaces non-success candidate-only results without side effects", async () => {
    const runtime = createRuntime();
    runtime.candidateIngress.submitImprovementNote = vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      kind: "improvement" as const,
      reason: "candidate ingress mode is not enabled",
    }));

    const tool = createCandidateSubmitTool({ runtime });
    const result = await tool.execute("call-2", {
      kind: "improvement",
      content: "Tighten the prompt handoff notes.",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              accepted: false,
              status: "disabled",
              kind: "improvement",
              reason: "candidate ingress mode is not enabled",
            },
            null,
            2,
          ),
        },
      ],
      details: {
        accepted: false,
        status: "disabled",
        kind: "improvement",
        reason: "candidate ingress mode is not enabled",
      },
    });
  });

  it("auto-promotes explicit user preference submissions from the tool path", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-3", {
      kind: "learning",
      content: "User preference stated explicitly: favorite proof infusion is cedar mint ember.",
      metadata: {
        category: "user_preference",
        source: "explicit_user_statement",
        profile: "user-preference-v1",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...createAcceptedResult("learning"),
              reviewState: "approved",
            },
            null,
            2,
          ),
        },
      ],
      details: {
        ...createAcceptedResult("learning"),
        reviewState: "approved",
      },
    });
    expect(runtime.candidateReview.review).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
        outcome: "accepted",
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            profile: "explicit-user-preference-v1",
            captureClass: "explicit_preference",
            toolName: "memory_candidate_submit",
          }),
        }),
      }),
    );
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            subject: "proof infusion",
            value: "cedar mint ember",
          }),
        }),
      }),
    );
  });

  it("auto-promotes the live tool payload shape without explicit confidence metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-4", {
      kind: "learning",
      content: 'User preference: preferred slice three silver compass is "cypress ember rain".',
      metadata: {
        category: "user_preference",
        source: "explicit_user_statement",
        date: "2026-04-04",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...createAcceptedResult("learning"),
              reviewState: "approved",
            },
            null,
            2,
          ),
        },
      ],
      details: {
        ...createAcceptedResult("learning"),
        reviewState: "approved",
      },
    });
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("auto-promotes the live tool payload when only raw user text preserves the bounded preference form", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-5", {
      kind: "learning",
      content:
        "User stated a recurring preference in the supported plain-preference form: preferred slice three brass echo is winter cedar flame.",
      metadata: {
        category: "user_preference",
        source: "user_explicit",
        raw: "Going forward, my preferred slice three brass echo is winter cedar flame.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...createAcceptedResult("learning"),
              reviewState: "approved",
            },
            null,
            2,
          ),
        },
      ],
      details: {
        ...createAcceptedResult("learning"),
        reviewState: "approved",
      },
    });
    expect(runtime.candidateReview.review).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            subject: "slice three brass echo",
            value: "winter cedar flame",
          }),
        }),
      }),
    );
  });

  it("rejects unsupported candidate payload shapes", () => {
    expect(() =>
      normalizeCandidateSubmissionInput({
        rawParams: {
          kind: "memory",
          content: "bad kind",
        },
      }),
    ).toThrow("kind must be one of");

    expect(() =>
      normalizeCandidateSubmissionInput({
        rawParams: {
          kind: "learning",
          content: "ok",
          metadata: ["not-an-object"],
        },
      }),
    ).toThrow("metadata must be an object");
  });
});
