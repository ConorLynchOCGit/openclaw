import { describe, expect, it, vi } from "vitest";
import {
  buildCandidateWritePlan,
  buildCandidateWriteExecutionContext,
  runCandidateWriteResolutionStages,
  runCandidateWriteResultStages,
  runWriteHandledStages,
  runWriteResolutionStages,
  runWriteResultStages,
  submitCandidateByKind,
  submitCandidateWritePlan,
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

  it("routes candidate resolution stages through canonical family metadata", async () => {
    const responseStyle = vi.fn(async () => ({ ok: "response_style" }));
    const projectFact = vi.fn(async () => ({ ok: "project_fact" }));

    const result = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "learning" as const,
          content: "keep this",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                compatibility: {
                  captureCategory: "project_fact",
                },
              },
              compatibility: {
                captureClass: "explicit_project_fact",
              },
            },
          },
        },
      },
      stages: [
        {
          id: "response_style",
          match: { familyIds: ["response_style"] },
          resolve: responseStyle,
        },
        {
          id: "project_fact",
          match: { familyIds: ["project_fact"] },
          resolve: projectFact,
        },
      ],
    });

    expect(result).toEqual({ ok: "project_fact" });
    expect(responseStyle).not.toHaveBeenCalled();
    expect(projectFact).toHaveBeenCalledTimes(1);
  });

  it("routes candidate result stages through submission kind and canonical family metadata", async () => {
    const result = await runCandidateWriteResultStages({
      context: {
        input: {
          kind: "procedure" as const,
          content: "deploy checklist",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                compatibility: {
                  captureCategory: "recurring_procedure",
                },
              },
              compatibility: {
                captureClass: "recurring_procedure",
              },
            },
          },
        },
      },
      result: ["start"],
      stages: [
        {
          id: "skip_response_style",
          match: {
            submissionKinds: ["learning"],
            familyIds: ["response_style"],
          },
          apply: async ({ result }) => [...result, "wrong"],
        },
        {
          id: "apply_procedure",
          match: {
            submissionKinds: ["procedure"],
            familyIds: ["recurring_procedure"],
          },
          apply: async ({ result }) => [...result, "procedure"],
        },
      ],
    });

    expect(result).toEqual(["start", "procedure"]);
  });

  it("routes candidate stages through canonical kind, capture category, and capture class", async () => {
    const captureCategoryStage = vi.fn(async () => ({ ok: "project_fact" }));
    const captureClassStage = vi.fn(async () => ({ ok: "workflow_capture" }));

    const projectFactResult = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "learning" as const,
          content: "keep this",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "project",
                compatibility: {
                  captureCategory: "project_fact",
                },
              },
              compatibility: {
                captureClass: "explicit_project_fact",
              },
            },
          },
        },
      },
      stages: [
        {
          id: "project_fact_category",
          match: {
            canonicalKinds: ["project"],
            captureCategories: ["project_fact"],
          },
          resolve: captureCategoryStage,
        },
      ],
    });

    const workflowResult = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "improvement" as const,
          content: "keep this",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "feedback",
                compatibility: {
                  captureCategory: "workflow_improvement",
                },
              },
              compatibility: {
                captureClass: "workflow_generalized_guidance",
              },
            },
          },
        },
      },
      stages: [
        {
          id: "workflow_capture_class",
          match: {
            canonicalKinds: ["feedback"],
            captureCategories: ["workflow_improvement"],
            captureClasses: ["workflow_generalized_guidance"],
          },
          resolve: captureClassStage,
        },
      ],
    });

    expect(projectFactResult).toEqual({ ok: "project_fact" });
    expect(workflowResult).toEqual({ ok: "workflow_capture" });
    expect(captureCategoryStage).toHaveBeenCalledTimes(1);
    expect(captureClassStage).toHaveBeenCalledTimes(1);
  });

  it("derives canonical write lanes from canonical metadata and derived views", () => {
    const responseStyleContext = buildCandidateWriteExecutionContext({
      input: {
        kind: "learning" as const,
        content: "plain English",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              tags: ["response_style"],
            },
            compatibility: {
              captureClass: "explicit_preference",
            },
          },
        },
      },
    });
    const workflowContext = buildCandidateWriteExecutionContext({
      input: {
        kind: "improvement" as const,
        content: "keep rollout proof concise",
        metadata: {
          canonicalIngestionCandidate: {
            record: {
              kind: "feedback",
              tags: ["workflow_guidance"],
              compatibility: {
                captureCategory: "workflow_improvement",
              },
            },
            compatibility: {
              captureClass: "workflow_generalized_guidance",
            },
          },
        },
      },
    });

    expect(responseStyleContext.candidateWriteClassification.lanes).toEqual(["user_preference"]);
    expect(workflowContext.candidateWriteClassification.lanes).toEqual(["workflow_guidance"]);
    expect(responseStyleContext.candidateWritePlan.operation.id).toBe("primary");
    expect(responseStyleContext.candidateWritePlan.operation.classification.lanes).toEqual([
      "user_preference",
    ]);
  });

  it("matches candidate stages through canonical write lanes", async () => {
    const workflowStage = vi.fn(async () => ({ ok: "workflow_guidance" }));

    const result = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "improvement" as const,
          content: "keep rollout proof concise",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "feedback",
                tags: ["workflow_guidance"],
                compatibility: {
                  captureCategory: "workflow_improvement",
                },
              },
              compatibility: {
                captureClass: "workflow_generalized_guidance",
              },
            },
          },
        },
      },
      stages: [
        {
          id: "workflow_lane",
          match: {
            submissionKinds: ["improvement"],
            lanes: ["workflow_guidance"],
          },
          resolve: workflowStage,
        },
      ],
    });

    expect(result).toEqual({ ok: "workflow_guidance" });
    expect(workflowStage).toHaveBeenCalledTimes(1);
  });

  it("supports multi-lane candidate matching through anyOf branches", async () => {
    const workflowDuplicateGuard = vi.fn(async () => ({ ok: "workflow_duplicate" }));

    const result = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "improvement" as const,
          content: "keep this",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "feedback",
                compatibility: {
                  captureCategory: "workflow_improvement",
                },
              },
              compatibility: {
                captureClass: "workflow_generalized_guidance",
              },
            },
          },
        },
      },
      stages: [
        {
          id: "duplicate_guard",
          match: {
            submissionKinds: ["learning", "correction", "improvement"],
            anyOf: [
              {
                familyIds: ["response_style"],
              },
              {
                captureCategories: ["workflow_improvement", "project_rule", "unmet_need"],
              },
            ],
          },
          resolve: workflowDuplicateGuard,
        },
      ],
    });

    expect(result).toEqual({ ok: "workflow_duplicate" });
    expect(workflowDuplicateGuard).toHaveBeenCalledTimes(1);
  });

  it("reuses cached candidate write classification when provided on the execution context", async () => {
    const derivedViewStage = vi.fn(async () => ({ ok: "workflow_guidance" }));

    const result = await runCandidateWriteResolutionStages({
      context: buildCandidateWriteExecutionContext({
        input: {
          kind: "improvement" as const,
          content: "keep this",
          metadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "feedback",
                tags: ["workflow_guidance"],
                compatibility: {
                  captureCategory: "workflow_improvement",
                },
              },
              identity: {
                dedupeKey: "dedupe-1",
                subjectKey: "subject-1",
              },
              compatibility: {
                captureClass: "workflow_generalized_guidance",
              },
            },
          },
        },
      }),
      stages: [
        {
          id: "workflow_derived_view",
          match: {
            derivedViews: ["workflow_guidance"],
            captureClasses: ["workflow_generalized_guidance"],
          },
          resolve: derivedViewStage,
        },
      ],
    });

    expect(result).toEqual({ ok: "workflow_guidance" });
    expect(derivedViewStage).toHaveBeenCalledTimes(1);
  });

  it("does not infer a family from template-only legacy metadata when canonical stamping is absent", async () => {
    const responseStyle = vi.fn(async () => ({ ok: "response_style" }));

    const result = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "learning" as const,
          content: "keep this",
          metadata: {
            autoCapture: {
              template: "responses_concise",
            },
          },
        },
      },
      stages: [
        {
          id: "response_style",
          match: { familyIds: ["response_style"] },
          resolve: responseStyle,
        },
      ],
    });

    expect(result).toBeNull();
    expect(responseStyle).not.toHaveBeenCalled();
  });

  it("does not infer a family from category or captureClass when canonical stamping is absent", async () => {
    const workflow = vi.fn(async () => ({ ok: "workflow_improvement" }));

    const result = await runCandidateWriteResolutionStages({
      context: {
        input: {
          kind: "improvement" as const,
          content: "keep this",
          metadata: {
            category: "workflow_improvement",
            autoCapture: {
              captureClass: "workflow_supported_lesson",
            },
          },
        },
      },
      stages: [
        {
          id: "workflow_improvement",
          match: { familyIds: ["workflow_improvement"] },
          resolve: workflow,
        },
      ],
    });

    expect(result).toBeNull();
    expect(workflow).not.toHaveBeenCalled();
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

  it("builds a candidate write plan around a single canonical operation", () => {
    const plan = buildCandidateWritePlan({
      kind: "procedure",
      content: "deploy checklist",
      metadata: {
        canonicalIngestionCandidate: {
          record: {
            compatibility: {
              captureCategory: "recurring_procedure",
            },
          },
          compatibility: {
            captureClass: "recurring_procedure",
          },
        },
      },
    });

    expect(plan.operation).toMatchObject({
      id: "primary",
      input: {
        kind: "procedure",
        content: "deploy checklist",
      },
      classification: {
        familyId: "recurring_procedure",
        lanes: ["recurring_procedure"],
      },
    });
  });

  it("executes candidate write plans and returns the canonical result", async () => {
    const runtime = {
      candidateIngress: {
        submitImprovementNote: vi.fn(async (input) => ({
          accepted: true as const,
          status: "accepted" as const,
          kind: input.kind,
        })),
        submitLearning: vi.fn(),
        submitCorrectionSuggestion: vi.fn(),
        submitProcedureSuggestion: vi.fn(),
      },
    } as {
      candidateIngress: {
        submitLearning: ReturnType<typeof vi.fn>;
        submitCorrectionSuggestion: ReturnType<typeof vi.fn>;
        submitProcedureSuggestion: ReturnType<typeof vi.fn>;
        submitImprovementNote: ReturnType<typeof vi.fn>;
      };
    };

    const result = await submitCandidateWritePlan({
      runtime: runtime as never,
      plan: {
        operation: {
          id: "primary",
          input: { kind: "improvement", content: "primary" },
          classification: {
            familyId: "workflow_improvement",
            lanes: ["workflow_guidance"],
            derivedViews: ["workflow_guidance"],
          },
        },
      },
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content: "primary",
    });
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      accepted: true,
      kind: "improvement",
    });
  });
});
