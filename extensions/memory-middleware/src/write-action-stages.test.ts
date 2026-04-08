import { describe, expect, it, vi } from "vitest";
import {
  runWriteHandledStages,
  runWriteResolutionStages,
  runWriteResultStages,
  submitCandidateByKind,
} from "./write-action-stages.js";

describe("write action stages", () => {
  it("returns the first resolved stage result and stops", async () => {
    const first = vi.fn(async () => null);
    const second = vi.fn(async () => ({ ok: true }));
    const third = vi.fn(async () => ({ ok: false }));

    const result = await runWriteResolutionStages({
      context: { input: "value" },
      stages: [
        { id: "first", resolve: first },
        { id: "second", resolve: second },
        { id: "third", resolve: third },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
  });

  it("returns after the first handled stage", async () => {
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => true);
    const third = vi.fn(async () => true);

    const handled = await runWriteHandledStages({
      context: { key: "value" },
      stages: [
        { id: "first", handle: first },
        { id: "second", handle: second },
        { id: "third", handle: third },
      ],
    });

    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).not.toHaveBeenCalled();
  });

  it("threads sequential result stages in order", async () => {
    const result = await runWriteResultStages({
      context: { input: "value" },
      result: 1,
      stages: [
        { id: "add", apply: async ({ result }) => result + 1 },
        { id: "double", apply: async ({ result }) => result * 2 },
      ],
    });

    expect(result).toBe(4);
  });

  it("submits by candidate kind through the matching ingress port", async () => {
    const runtime = {
      candidateIngress: {
        submitLearning: vi.fn(async () => ({
          accepted: true as const,
          status: "accepted" as const,
        })),
        submitCorrectionSuggestion: vi.fn(async () => ({
          accepted: true as const,
          status: "accepted" as const,
        })),
        submitProcedureSuggestion: vi.fn(async () => ({
          accepted: true as const,
          status: "accepted" as const,
        })),
        submitImprovementNote: vi.fn(async () => ({
          accepted: true as const,
          status: "accepted" as const,
        })),
      },
    } as {
      candidateIngress: {
        submitLearning: ReturnType<typeof vi.fn>;
        submitCorrectionSuggestion: ReturnType<typeof vi.fn>;
        submitProcedureSuggestion: ReturnType<typeof vi.fn>;
        submitImprovementNote: ReturnType<typeof vi.fn>;
      };
    };

    await submitCandidateByKind({
      runtime: runtime as never,
      input: { kind: "improvement", content: "keep this" },
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content: "keep this",
    });
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
  });
});
