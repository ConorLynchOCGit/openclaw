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
    candidateIngress: {
      submitLearning: vi.fn(async () => createAcceptedResult("learning")),
      submitCorrectionSuggestion: vi.fn(async () => createAcceptedResult("correction")),
      submitProcedureSuggestion: vi.fn(async () => createAcceptedResult("procedure")),
      submitImprovementNote: vi.fn(async () => createAcceptedResult("improvement")),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory candidate submit tool", () => {
  it("normalizes a candidate payload with trusted context fallbacks", () => {
    const normalized = normalizeCandidateSubmissionInput({
      rawParams: {
        kind: "learning",
        content: "  keep this learning  ",
        metadata: { source: "test" },
      },
      context: {
        sessionId: "session-from-context",
        agentId: "agent-from-context",
      } as OpenClawPluginToolContext,
    });

    expect(normalized).toEqual({
      kind: "learning",
      content: "keep this learning",
      sessionId: "session-from-context",
      agentId: "agent-from-context",
      metadata: { source: "test" },
    });
  });

  it("routes supported candidate kinds through the candidate ingress seam", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        sessionId: "session-ctx",
        agentId: "agent-ctx",
      },
    });

    const result = await tool.execute("call-1", {
      kind: "procedure",
      content: "Turn this into a bounded procedure draft.",
      projectId: "project-1",
      metadata: { source: "unit-test" },
    });

    expect(runtime.candidateIngress.submitProcedureSuggestion).toHaveBeenCalledWith({
      kind: "procedure",
      content: "Turn this into a bounded procedure draft.",
      projectId: "project-1",
      sessionId: "session-ctx",
      agentId: "agent-ctx",
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
