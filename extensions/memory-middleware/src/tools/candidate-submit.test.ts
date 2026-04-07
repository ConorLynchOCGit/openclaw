import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawPluginToolContext } from "../../api.js";
import type { CandidateSubmissionAcceptedResult, CandidateSubmissionInput } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import type { ApprovedWorkflowPhrasePatternMatch } from "../workflow-phrase-induction.js";
const inspectWorkflowImprovementLifecycle = vi.hoisted(() =>
  vi.fn(async (): Promise<unknown> => null),
);
const storeApprovedApiWorkaroundSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const storeApprovedEnvironmentConstraintSemanticEmbedding = vi.hoisted(() =>
  vi.fn(async () => true),
);
const storeApprovedWorkflowToolGotchaSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const findApprovedWorkflowPhrasePatternMatch = vi.hoisted(() =>
  vi.fn<() => Promise<ApprovedWorkflowPhrasePatternMatch | null>>(async () => null),
);
const maybeInduceWorkflowPhrasePattern = vi.hoisted(() =>
  vi.fn(async () => ({ status: "existing" })),
);

vi.mock("../semantic-retrieval-routing.js", () => ({
  storeApprovedApiWorkaroundSemanticEmbedding,
  storeApprovedEnvironmentConstraintSemanticEmbedding,
  storeApprovedWorkflowToolGotchaSemanticEmbedding,
}));
vi.mock("../workflow-phrase-induction.js", async () => {
  const actual = await vi.importActual<typeof import("../workflow-phrase-induction.js")>(
    "../workflow-phrase-induction.js",
  );
  return {
    ...actual,
    findApprovedWorkflowPhrasePatternMatch,
    maybeInduceWorkflowPhrasePattern,
  };
});
vi.mock("../workflow-improvement-lifecycle.js", async () => {
  const actual = await vi.importActual<typeof import("../workflow-improvement-lifecycle.js")>(
    "../workflow-improvement-lifecycle.js",
  );
  return {
    ...actual,
    inspectWorkflowImprovementLifecycle,
  };
});

import {
  createCandidateSubmitTool,
  normalizeCandidateSubmissionInput,
} from "./candidate-submit.js";

function createAcceptedResult(
  kind: CandidateSubmissionInput["kind"],
): CandidateSubmissionAcceptedResult {
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

function createAutoPromotedResult(
  kind: CandidateSubmissionInput["kind"],
): CandidateSubmissionAcceptedResult {
  return {
    ...createAcceptedResult(kind),
    reviewState: "approved",
    memoryObjectId: "approved-1",
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
      promoteToProcedureDraft: vi.fn(async () => ({
        accepted: true as const,
        status: "promoted" as const,
        candidateId: "memory-1",
        procedureId: "procedure-1",
        procedureStatus: "draft" as const,
        sourceEventId: "event-1",
      })),
    },
    procedureValidation: {
      validate: vi.fn(async () => ({
        accepted: true as const,
        status: "validated" as const,
        procedureId: "procedure-1",
        procedureStatus: "validated" as const,
        procedureRunId: "procedure-run-1",
        sourceCandidateId: "memory-1",
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

async function writeSessionTranscript(params: {
  agentDir: string;
  sessionId: string;
  fileName: string;
  userText: string;
  wrapAsGatewayMessage?: boolean;
}): Promise<void> {
  const sessionsDir = path.join(params.agentDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const transcriptText = params.wrapAsGatewayMessage
    ? [
        "Sender (untrusted metadata):",
        "```json",
        JSON.stringify({ label: "gateway-client", id: "gateway-client" }, null, 2),
        "```",
        "",
        `[Sun 2026-04-05 04:22 UTC] ${params.userText}`,
      ].join("\n")
    : params.userText;
  await writeFile(
    path.join(sessionsDir, params.fileName),
    [
      JSON.stringify({
        type: "session",
        version: 3,
        id: params.sessionId,
        timestamp: "2026-04-05T00:00:00.000Z",
      }),
      JSON.stringify({
        type: "message",
        id: "user-1",
        timestamp: "2026-04-05T00:00:01.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: transcriptText }],
          timestamp: Date.now(),
        },
      }),
    ].join("\n"),
    "utf8",
  );
}

async function writeSessionRegistry(params: {
  agentDir: string;
  sessionKey: string;
  sessionId: string;
  sessionFile: string;
}): Promise<void> {
  const sessionsDir = path.join(params.agentDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(
    path.join(sessionsDir, "sessions.json"),
    JSON.stringify(
      {
        [params.sessionKey]: {
          sessionId: params.sessionId,
          sessionFile: path.join(sessionsDir, params.sessionFile),
          updatedAt: Date.now(),
        },
      },
      null,
      2,
    ),
    "utf8",
  );
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

  it("normalizes bounded workflow-improvement submissions into managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2b", {
      kind: "improvement",
      content: "Use scripts/committer for commits here instead of manual git add and git commit.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        autoCapture: expect.objectContaining({
          captureClass: "workflow_tool_gotcha",
          lessonKey: "scripts_committer_required",
          toolKey: "scripts_committer",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "pending_confirmation",
        }),
      }),
    });
  });

  it("normalizes bounded environment-constraint submissions into managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c", {
      kind: "improvement",
      content: "python is not available here, so use node --input-type=module or tsx instead.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        autoCapture: expect.objectContaining({
          captureClass: "workflow_environment_constraint",
          template: "workflow_environment_constraint",
          lessonKey: "python_command_unavailable",
          toolKey: "python_runtime",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "pending_confirmation",
        }),
      }),
    });
  });

  it("normalizes bounded workflow-simplification submissions into managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c-workflow-v2", {
      kind: "improvement",
      content:
        "Use pnpm memory:proof for bounded memory proof here instead of bespoke host-side setup.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "Workflow improvement: use pnpm memory:proof instead of bespoke host-side setup for bounded memory proof.",
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        autoCapture: expect.objectContaining({
          captureClass: "workflow_tool_gotcha",
          template: "workflow_tool_gotcha",
          lessonKey: "memory_proof_runner_required",
          toolKey: "memory_proof_runner",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "pending_confirmation",
        }),
      }),
    });
  });

  it("normalizes bounded API workaround submissions into managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c-api", {
      kind: "improvement",
      content:
        "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        autoCapture: expect.objectContaining({
          captureClass: "workflow_api_workaround",
          template: "workflow_api_workaround",
          lessonKey: "openai_embeddings_api_key_required",
          toolKey: "openai_embeddings",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "pending_confirmation",
        }),
      }),
    });
  });

  it("normalizes generalized workflow lessons into held-cluster managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c-generic", {
      kind: "improvement",
      content:
        "For release proof notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "Workflow improvement: for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries.",
      metadata: expect.objectContaining({
        category: "workflow_improvement",
        source: "explicit_workflow_improvement",
        autoCapture: expect.objectContaining({
          captureClass: "workflow_generalized_guidance",
          template: "workflow_generalized_guidance",
          lessonFamily: "generalized_workflow_lesson",
          guidancePattern: "use_instead_of",
          recommendedAction: "bulletized proof IDs",
          avoidAction: "paraphrased rollout summaries",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "hold_for_more_evidence",
          lessonFamily: "generalized_workflow_lesson",
        }),
      }),
    });
  });

  it("normalizes project rules into held-cluster managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c-project-rule", {
      kind: "improvement",
      content:
        "For project Atlas, use generated audit IDs for audit events instead of client timestamps.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "Project rule [Atlas]: for project Atlas, use generated audit IDs for audit events instead of client timestamps.",
      metadata: expect.objectContaining({
        category: "project_rule",
        source: "explicit_project_rule",
        autoCapture: expect.objectContaining({
          captureClass: "project_rule_guidance",
          template: "project_rule_guidance",
          lessonFamily: "generalized_project_rule",
          projectScope: "Atlas",
          normalizedProjectScope: "atlas",
          guidancePattern: "use_instead_of",
          recommendedAction: "generated audit IDs",
          avoidAction: "client timestamps",
          guidanceMode: "guidance_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "hold_for_more_evidence",
          lessonFamily: "generalized_project_rule",
        }),
      }),
    });
  });

  it("normalizes unmet needs into held-cluster managed improvement metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2d-unmet-need", {
      kind: "improvement",
      content: "For project Atlas, we need a release evidence template for rollout audits.",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith({
      kind: "improvement",
      content:
        "Unmet need [Atlas]: for project Atlas, we need a release evidence template for rollout audits.",
      metadata: expect.objectContaining({
        category: "unmet_need",
        source: "explicit_unmet_need",
        autoCapture: expect.objectContaining({
          captureClass: "unmet_need_recommendation",
          template: "unmet_need_recommendation",
          lessonFamily: "generalized_unmet_need",
          projectScope: "Atlas",
          normalizedProjectScope: "atlas",
          needCategory: "missing_workflow_support",
          neededCapability: "a release evidence template",
          normalizedNeededCapability: "a release evidence template",
          recommendationMode: "recommendation_only",
        }),
        candidateLifecycle: expect.objectContaining({
          family: "workflow_improvement",
          state: "hold_for_more_evidence",
          lessonFamily: "generalized_unmet_need",
        }),
      }),
    });
  });

  it("uses an approved phrase pattern as deterministic workflow-improvement evidence", async () => {
    findApprovedWorkflowPhrasePatternMatch.mockResolvedValueOnce({
      approvedObjectId: "approved-pattern-1",
      normalizedPhrase:
        "for release proof notes should i list proof ids as bullets instead of paraphrasing rollout summaries?",
      match: {
        captureClass: "workflow_generalized_guidance",
        candidateKind: "improvement",
        reasonCode: "workflow_generalized_guidance_statement",
        template: "workflow_generalized_guidance",
        lessonFamily: "generalized_workflow_lesson",
        guidancePattern: "use_instead_of",
        subject: "release proof notes",
        value:
          "for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries",
        normalizedSubject: "release proof notes",
        normalizedValue:
          "for release proof notes, use bulletized proof ids instead of paraphrased rollout summaries",
        content:
          "Workflow improvement: for release proof notes, use bulletized proof IDs instead of paraphrased rollout summaries.",
        subjectKey: "subject-key-1",
        key: "cluster-key-1",
        recommendedAction: "bulletized proof IDs",
        normalizedRecommendedAction: "bulletized proof ids",
        avoidAction: "paraphrased rollout summaries",
        normalizedAvoidAction: "paraphrased rollout summaries",
      },
    } satisfies ApprovedWorkflowPhrasePatternMatch);
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    await tool.execute("call-2c-deterministic", {
      kind: "improvement",
      content:
        "For release proof notes, should I list proof IDs as bullets instead of paraphrasing rollout summaries?",
      projectId: "00000000-0000-4000-8000-000000000123",
    });

    expect(runtime.candidateIngress.submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          workflowPhraseInduction: expect.objectContaining({
            observedText:
              "For release proof notes, should I list proof IDs as bullets instead of paraphrasing rollout summaries?",
          }),
          semanticDetection: expect.objectContaining({
            detectionSource: "deterministic",
            evidence: ["approved_phrase_pattern_match"],
          }),
          candidateLifecycle: expect.objectContaining({
            family: "workflow_improvement",
            state: "hold_for_more_evidence",
          }),
        }),
      }),
    );
  });

  it("stores an approved environment-constraint semantic embedding after confirmation promotion", async () => {
    storeApprovedEnvironmentConstraintSemanticEmbedding.mockClear();
    inspectWorkflowImprovementLifecycle.mockReset();
    inspectWorkflowImprovementLifecycle
      .mockResolvedValueOnce({
        matchingApprovedObjectId: null,
        pendingCandidate: null,
      })
      .mockResolvedValueOnce({
        matchingApprovedObjectId: null,
        pendingCandidate: {
          id: "memory-1",
          sourceEventId: "event-1",
          createdAt: new Date(Date.now() - 10_000).toISOString(),
          updatedAt: new Date(Date.now() - 10_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          confirmationState: "pending_confirmation",
        },
      });
    const runtime = createRuntime();
    runtime.candidateReview.review = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    runtime.candidatePromotion.promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-1",
      promotedMemoryObjectId: "approved-env-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-1",
    }));
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        config: { plugins: {} },
        runtimeConfig: { plugins: { memory: { provider: "openai" } } },
        agentId: "main",
        sessionKey: "agent:main:main",
      } as never,
    });

    await tool.execute("call-2d", {
      kind: "improvement",
      content: "python is not available here, so use node --input-type=module or tsx instead.",
    });
    await tool.execute("call-2e", {
      kind: "improvement",
      content: "Use node --input-type=module or tsx here because python command is not available.",
    });

    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
      }),
    );
    expect(storeApprovedEnvironmentConstraintSemanticEmbedding).toHaveBeenCalledWith({
      config: runtime.config,
      cfg: { plugins: { memory: { provider: "openai" } } },
      agentId: "main",
      sessionKey: "agent:main:main",
      memoryObjectId: "approved-env-1",
    });
    inspectWorkflowImprovementLifecycle.mockImplementation(async () => null);
  });

  it("stores an approved workflow-tool-gotcha semantic embedding after confirmation promotion", async () => {
    const runtime = createRuntime();
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    inspectWorkflowImprovementLifecycle.mockImplementationOnce(async () => ({
      activeApprovedSubjectObjectIds: [],
      pendingSubjectCandidateIds: [],
      pendingCandidate: {
        id: "memory-1",
        key: "workflow-key-1",
        subjectKey: "workflow-subject-1",
        lessonKey: "scripts_committer_required",
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        updatedAt: new Date(Date.now() - 10_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        confirmationState: "pending_confirmation",
        sourceEventId: "event-1",
      },
    }));
    runtime.candidateReview.review = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    runtime.candidatePromotion.promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-1",
      promotedMemoryObjectId: "approved-tool-gotcha-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-1",
    }));
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        config: { plugins: {} },
        runtimeConfig: { plugins: { memory: { provider: "openai" } } },
        agentId: "main",
        sessionKey: "agent:main:main",
      } as never,
    });

    await tool.execute("call-2f", {
      kind: "improvement",
      content: "scripts/committer keeps commit staging scoped here.",
    });
    await tool.execute("call-2g", {
      kind: "improvement",
      content: 'Use scripts/committer "<msg>" <file...> instead of manual git add and git commit.',
    });

    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
      }),
    );
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).toHaveBeenCalledWith({
      config: runtime.config,
      cfg: { plugins: { memory: { provider: "openai" } } },
      agentId: "main",
      sessionKey: "agent:main:main",
      memoryObjectId: "approved-tool-gotcha-1",
    });
    inspectWorkflowImprovementLifecycle.mockImplementation(async () => null);
  });

  it("stores an approved git-stash workflow-tool-gotcha semantic embedding after confirmation promotion", async () => {
    const runtime = createRuntime();
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    inspectWorkflowImprovementLifecycle.mockImplementationOnce(async () => ({
      activeApprovedSubjectObjectIds: [],
      pendingSubjectCandidateIds: [],
      pendingCandidate: {
        id: "memory-stash-1",
        key: "workflow-stash-key-1",
        subjectKey: "workflow-stash-subject-1",
        lessonKey: "git_stash_unsafe",
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        updatedAt: new Date(Date.now() - 10_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        confirmationState: "pending_confirmation",
        sourceEventId: "event-stash-1",
      },
    }));
    runtime.candidateReview.review = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-stash-1",
      outcome: "accepted" as const,
      reviewId: "review-stash-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    runtime.candidatePromotion.promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-stash-1",
      promotedMemoryObjectId: "approved-tool-gotcha-stash-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-stash-1",
    }));
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        config: { plugins: {} },
        runtimeConfig: { plugins: { memory: { provider: "openai" } } },
        agentId: "main",
        sessionKey: "agent:main:main",
      } as never,
    });

    await tool.execute("call-2f-stash", {
      kind: "improvement",
      content: "Do not use git stash in this repo during multi agent work.",
    });
    await tool.execute("call-2g-stash", {
      kind: "improvement",
      content: "git stash is unsafe here because it can disturb concurrent work.",
    });

    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-stash-1",
      }),
    );
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).toHaveBeenCalledWith({
      config: runtime.config,
      cfg: { plugins: { memory: { provider: "openai" } } },
      agentId: "main",
      sessionKey: "agent:main:main",
      memoryObjectId: "approved-tool-gotcha-stash-1",
    });
    inspectWorkflowImprovementLifecycle.mockImplementation(async () => null);
  });

  it("stores an approved API workaround semantic embedding after confirmation promotion", async () => {
    const runtime = createRuntime();
    storeApprovedApiWorkaroundSemanticEmbedding.mockClear();
    storeApprovedEnvironmentConstraintSemanticEmbedding.mockClear();
    storeApprovedWorkflowToolGotchaSemanticEmbedding.mockClear();
    inspectWorkflowImprovementLifecycle.mockImplementationOnce(async () => ({
      activeApprovedSubjectObjectIds: [],
      pendingSubjectCandidateIds: [],
      pendingCandidate: {
        id: "memory-1",
        key: "workflow-key-1",
        subjectKey: "workflow-subject-1",
        lessonKey: "openai_embeddings_api_key_required",
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        updatedAt: new Date(Date.now() - 10_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        confirmationState: "pending_confirmation",
        sourceEventId: "event-1",
      },
    }));
    runtime.candidateReview.review = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "memory-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    runtime.candidatePromotion.promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "memory-1",
      promotedMemoryObjectId: "approved-api-workaround-1",
      promotedMemoryKind: "project" as const,
      promotedReviewState: "approved" as const,
      sourceEventId: "event-1",
    }));
    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        config: { plugins: {} },
        runtimeConfig: { plugins: { memory: { provider: "openai" } } },
        agentId: "main",
        sessionKey: "agent:main:main",
      } as never,
    });

    await tool.execute("call-2h", {
      kind: "improvement",
      content:
        "OpenAI embeddings still need a real API key; Codex OAuth alone does not enable semantic memory search.",
    });
    await tool.execute("call-2i", {
      kind: "improvement",
      content:
        "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
    });

    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
      }),
    );
    expect(storeApprovedApiWorkaroundSemanticEmbedding).toHaveBeenCalledWith({
      config: runtime.config,
      cfg: { plugins: { memory: { provider: "openai" } } },
      agentId: "main",
      sessionKey: "agent:main:main",
      memoryObjectId: "approved-api-workaround-1",
    });
    expect(storeApprovedEnvironmentConstraintSemanticEmbedding).not.toHaveBeenCalled();
    expect(storeApprovedWorkflowToolGotchaSemanticEmbedding).not.toHaveBeenCalled();
    inspectWorkflowImprovementLifecycle.mockImplementation(async () => null);
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
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
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
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
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
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
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

  it("normalizes managed conversational corrections from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-6", {
      kind: "correction",
      content: "User correction: favorite proof seed is 'fennel aurora'.",
      metadata: {
        raw: "Actually, my favorite proof seed is fennel aurora.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("correction"), null, 2),
        },
      ],
      details: createAcceptedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_preference_correction",
          source: "conversational_user_correction",
          preference_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "preference_correction",
            captureSeam: "model_tool_primary",
            subject: "proof seed",
            value: "fennel aurora",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes the live conversational correction payload shape without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-6b", {
      kind: "correction",
      content:
        "User corrected a durable preference: preferred slice four lantern reed is moon amber pearl.",
      metadata: {
        domain: "user_preference",
        preferenceKey: "slice four lantern reed",
        value: "moon amber pearl",
        source: "user_correction",
        timestamp: "2026-04-04T19:32:00Z",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("correction"), null, 2),
        },
      ],
      details: createAcceptedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_preference_correction",
          source: "conversational_user_correction",
          preference_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "preference_correction",
            captureSeam: "model_tool_primary",
            subject: "slice four lantern reed",
            value: "moon amber pearl",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("auto-promotes bounded recurring response requirements from the tool path", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-7", {
      kind: "learning",
      content: "User requirement stated explicitly: keep responses concise.",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_requirement",
          source: "explicit_user_requirement",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_requirement",
            captureSeam: "model_tool_primary",
            subject: "response style",
            value: "keep responses concise",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          autoPromotion: expect.objectContaining({
            captureClass: "explicit_requirement",
            reasonCode: "explicit_requirement_statement",
            toolName: "memory_candidate_submit",
          }),
        }),
      }),
    );
  });

  it("auto-promotes the live concise-requirement tool payload shape", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-7b", {
      kind: "learning",
      content: "User prefers concise responses.",
      metadata: {
        source: "explicit_user_preference",
        channel: "webchat",
        date: "2026-04-04",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_requirement",
          source: "explicit_user_requirement",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_requirement",
            captureSeam: "model_tool_primary",
            subject: "response style",
            value: "keep responses concise",
          }),
        }),
      }),
    );
  });

  it("auto-promotes numbered-steps requirements from the tool path", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-7c", {
      kind: "learning",
      content: "User prefers numbered steps for instructions.",
      metadata: {
        source: "explicit_user_requirement",
        channel: "webchat",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_requirement",
          source: "explicit_user_requirement",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_requirement",
            template: "responses_numbered_steps",
            captureSeam: "model_tool_primary",
            value: "use numbered steps when giving instructions",
          }),
        }),
      }),
    );
  });

  it("auto-promotes live numbered-steps tool payloads even when the model uses response_style metadata", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-7d", {
      kind: "learning",
      content: "User prefers numbered steps when giving instructions.",
      metadata: {
        source: "user_direct_statement",
        category: "response_style",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("learning"), null, 2),
        },
      ],
      details: createAutoPromotedResult("learning"),
    });
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("normalizes live response-style correction payloads from the tool path", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9req-live", {
      kind: "correction",
      content: "User corrected response-style preference: keep replies short.",
      metadata: {
        source: "explicit user correction",
        scope: "response style",
        applies_to: "current and future replies",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("correction"), null, 2),
        },
      ],
      details: createAutoPromotedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_requirement_correction",
          source: "conversational_user_requirement_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            captureSeam: "model_tool_primary",
            template: "responses_concise",
            subject: "response style",
            value: "keep responses concise",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("normalizes tightly bounded named project facts from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-8", {
      kind: "learning",
      content: "Project fact [atlas forge]: staging branch is atlas-staging.",
      metadata: {
        raw: "For project atlas forge, the staging branch is atlas-staging.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("learning"), null, 2),
        },
      ],
      details: createAcceptedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "model_tool_primary",
            projectScope: "atlas forge",
            subject: "atlas forge / staging branch",
            value: "atlas-staging",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes explicit project repository URLs from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-8-url", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: repository URL is https://github.com/openclaw/openclaw.",
      metadata: {
        raw: "For project atlas forge, the repository URL is https://github.com/openclaw/openclaw.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("learning"), null, 2),
        },
      ],
      details: createAcceptedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "model_tool_primary",
            fieldKey: "repository_url",
            projectScope: "atlas forge",
            subject: "atlas forge / repository URL",
            value: "https://github.com/openclaw/openclaw",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes explicit project documentation URLs from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-8-docs", {
      kind: "learning",
      content:
        "Project fact [atlas forge]: documentation URL is https://docs.openclaw.ai/getting-started.",
      metadata: {
        raw: "For project atlas forge, the documentation URL is https://docs.openclaw.ai/getting-started.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("learning"), null, 2),
        },
      ],
      details: createAcceptedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "model_tool_primary",
            fieldKey: "documentation_url",
            projectScope: "atlas forge",
            subject: "atlas forge / documentation URL",
            value: "https://docs.openclaw.ai/getting-started",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes semantic project facts from the tool path as pending-confirmation candidates", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-8b", {
      kind: "learning",
      content: "For project atlas forge, we use pnpm.",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("learning"), null, 2),
        },
      ],
      details: createAcceptedResult("learning"),
    });
    expect(runtime.candidateIngress.submitLearning).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact",
          source: "explicit_project_fact",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "explicit_project_fact",
            captureSeam: "model_tool_primary",
            fieldKey: "primary_package_manager",
            projectScope: "atlas forge",
            subject: "atlas forge / primary package manager",
            value: "pnpm",
          }),
          semanticDetection: expect.objectContaining({
            source: "project_fact_semantic_v1",
            confidence: "medium",
            fieldKey: "primary_package_manager",
          }),
          candidateLifecycle: expect.objectContaining({
            family: "project_fact",
            state: "pending_confirmation",
            confidence: "medium",
            fieldKey: "primary_package_manager",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes natural project fact corrections from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9", {
      kind: "correction",
      content: "Project correction [atlas forge]: staging branch is atlas-green.",
      metadata: {
        raw: "Actually, for project atlas forge, the staging branch is atlas-green.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("correction"), null, 2),
        },
      ],
      details: createAcceptedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "project_fact_correction",
            captureSeam: "model_tool_primary",
            projectScope: "atlas forge",
            subject: "atlas forge / staging branch",
            value: "atlas-green",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).not.toHaveBeenCalled();
    expect(runtime.candidatePromotion.promoteToMemory).not.toHaveBeenCalled();
  });

  it("normalizes response-style requirement corrections from the tool path without auto-promotion", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9req", {
      kind: "correction",
      content: "I meant plain English, not jargon.",
      metadata: {
        raw: "I meant plain English, not jargon.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("correction"), null, 2),
        },
      ],
      details: createAutoPromotedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "user_requirement_correction",
          source: "conversational_user_requirement_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            captureSeam: "model_tool_primary",
            template: "responses_plain_english",
            subject: "response language",
            value: "use plain English",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("reclassifies bounded response-style corrections when the model submits them as learning", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9req-learning-drift", {
      kind: "learning",
      content: "User prefers plain English responses.",
      metadata: {
        raw: "I meant plain English, not jargon.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("correction"), null, 2),
        },
      ],
      details: createAutoPromotedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "correction",
        content: "User correction: use plain English.",
        metadata: expect.objectContaining({
          category: "user_requirement_correction",
          source: "conversational_user_requirement_correction",
          classificationAdjustment: expect.objectContaining({
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_correction_match",
            matchedFrom: "raw",
          }),
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            template: "responses_plain_english",
          }),
        }),
      }),
    );
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
  });

  it("reclassifies bounded bullet-point corrections when the model submits them as learning", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9req-bullets-learning-drift", {
      kind: "learning",
      content: "User prefers bullet-point responses.",
      metadata: {
        raw: "No, use bullet points for me.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAutoPromotedResult("correction"), null, 2),
        },
      ],
      details: createAutoPromotedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "correction",
        content: "User correction: use bullet points when listing items.",
        metadata: expect.objectContaining({
          category: "user_requirement_correction",
          source: "conversational_user_requirement_correction",
          classificationAdjustment: expect.objectContaining({
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_correction_match",
            matchedFrom: "raw",
          }),
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            template: "responses_bullets",
          }),
        }),
      }),
    );
    expect(runtime.candidateReview.review).toHaveBeenCalledTimes(1);
    expect(runtime.candidatePromotion.promoteToMemory).toHaveBeenCalledTimes(1);
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
  });

  it("normalizes the live natural project fact correction payload shape from the tool path", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9b", {
      kind: "correction",
      content:
        "Correction: For project cedar harbor, the staging branch is harbor-green (not harbor-staging).",
      metadata: {
        source: "user correction",
        projectName: "cedar harbor",
        factType: "staging_branch",
        supersedes: "harbor-staging",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("correction"), null, 2),
        },
      ],
      details: createAcceptedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          subject_key: expect.any(String),
          autoCapture: expect.objectContaining({
            captureClass: "project_fact_correction",
            captureSeam: "model_tool_primary",
            projectScope: "cedar harbor",
            subject: "cedar harbor / staging branch",
            value: "harbor-green",
          }),
        }),
      }),
    );
  });

  it("reclassifies bounded project-fact corrections when the model submits them as learning", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-9c", {
      kind: "learning",
      content: "Project fact [atlas forge]: default branch is atlas-main.",
      metadata: {
        raw: "Actually, for project atlas forge, the default branch is atlas-green.",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createAcceptedResult("correction"), null, 2),
        },
      ],
      details: createAcceptedResult("correction"),
    });
    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "correction",
        content: "Project correction [atlas forge]: default branch is atlas-green.",
        metadata: expect.objectContaining({
          category: "project_fact_correction",
          source: "conversational_project_fact_correction",
          classificationAdjustment: expect.objectContaining({
            fromKind: "learning",
            toKind: "correction",
            reason: "bounded_project_fact_correction_match",
            matchedFrom: "raw",
          }),
          autoCapture: expect.objectContaining({
            captureClass: "project_fact_correction",
            fieldKey: "default_branch",
          }),
        }),
      }),
    );
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
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

  it("reclassifies bounded response-style corrections from transcript context when metadata.raw is absent", async () => {
    const runtime = createRuntime();
    const agentDir = await mkdtemp(path.join(os.tmpdir(), "candidate-submit-transcript-"));
    await writeSessionTranscript({
      agentDir,
      sessionId: "session-bullets-1",
      fileName: "active.jsonl",
      userText: "No, use bullet points for me.",
      wrapAsGatewayMessage: true,
    });
    await writeSessionRegistry({
      agentDir,
      sessionKey: "agent:main:main",
      sessionId: "session-bullets-1",
      sessionFile: "active.jsonl",
    });

    const tool = createCandidateSubmitTool({
      runtime,
      context: {
        agentDir,
        sessionKey: "agent:main:main",
      } as OpenClawPluginToolContext,
    });

    const result = await tool.execute("call-transcript-correction", {
      kind: "learning",
      content:
        "Conor prefers bullet points for list-style or structured responses. When presenting multiple items, options, or steps, use bullet points by default.",
    });

    expect(runtime.candidateIngress.submitCorrectionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "correction",
        content: "User correction: use bullet points when listing items.",
        metadata: expect.objectContaining({
          classificationAdjustment: expect.objectContaining({
            matchedFrom: "raw",
            fromKind: "learning",
            toKind: "correction",
          }),
          category: "user_requirement_correction",
          autoCapture: expect.objectContaining({
            captureClass: "requirement_correction",
            template: "responses_bullets",
          }),
        }),
      }),
    );
    expect(runtime.candidateIngress.submitLearning).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      accepted: true,
      kind: "correction",
    });
  });

  it("auto-promotes a bounded recurring checklist into a validated procedure", async () => {
    const runtime = createRuntime();
    const tool = createCandidateSubmitTool({ runtime });

    const result = await tool.execute("call-recurring-procedure", {
      kind: "procedure",
      content: ["My deploy checklist:", "1. Open the canary lane.", "2. Verify health."].join("\n"),
    });

    expect(runtime.candidateIngress.submitProcedureSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        content: ["1. Open the canary lane", "2. Verify health"].join("\n"),
        metadata: expect.objectContaining({
          category: "recurring_procedure",
          autoCapture: expect.objectContaining({
            captureClass: "explicit_recurring_procedure",
            procedureKey: "deploy_checklist",
            title: "Deploy checklist",
          }),
        }),
      }),
    );
    expect(runtime.candidatePromotion.promoteToProcedureDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "memory-1",
        title: "Deploy checklist",
      }),
    );
    expect(runtime.procedureValidation.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        procedureId: "procedure-1",
      }),
    );
    expect(result.details).toMatchObject({
      accepted: true,
      kind: "procedure",
      reviewState: "approved",
      memoryObjectId: "procedure-1",
    });
  });
});
