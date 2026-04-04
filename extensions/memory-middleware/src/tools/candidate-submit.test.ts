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
