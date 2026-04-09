import { describe, expect, it } from "vitest";
import { detectWorkflowImprovementSemanticDecision } from "./workflow-improvement-semantic.js";

describe("detectWorkflowImprovementSemanticDecision", () => {
  it("captures the vitest wrapper lesson from explicit replacement phrasing", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Use pnpm test -- src/foo.test.ts instead of raw vitest here.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
        subject: "repo tests",
        recommendedAction: "pnpm test -- <path-or-filter> [vitest args...]",
        avoidAction: "raw vitest",
      },
    });
  });

  it("captures the vitest wrapper lesson from typo-light gotcha phrasing", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "raw vitest skips the wrapper here, so plz use pnpm test",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "medium",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        guidancePattern: "use_instead_of",
        subject: "repo tests",
      },
    });
  });

  it("captures the scripts/committer lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Use scripts/committer for commits here instead of manual git add and git commit.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
        subject: "scoped commits",
        recommendedAction: 'scripts/committer "<msg>" <file...>',
        avoidAction: "manual git add / git commit",
      },
    });
  });

  it("captures the git stash safety lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Do not use git stash in this repo during multi agent work.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "avoid_only",
        subject: "concurrent repo",
        avoidAction: "git stash",
      },
    });
  });

  it("captures the docs-only validation lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "For docs-only work here, use pnpm check:fast instead of full pnpm check or pnpm build.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
        subject: "docs-only",
        recommendedAction: "pnpm check:fast",
        avoidAction: "full pnpm check or pnpm build",
      },
    });
  });

  it("captures the memory proof runner lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Use pnpm memory:proof for bounded memory proof here instead of bespoke host-side setup.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
        subject: "bounded memory proof",
        recommendedAction: "pnpm memory:proof",
        avoidAction: "bespoke host-side setup",
      },
    });
  });

  it("captures the readyz readiness lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Trust /readyz for rollout readiness here; /healthz is only liveness.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "trust_for_scope",
        subject: "rollout readiness",
        recommendedAction: "/readyz",
        avoidAction: "/healthz",
      },
    });
  });

  it("captures the python-unavailable environment constraint", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "python isn't available on this host, so use node --input-type=module or tsx instead.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        lessonFamily: "generalized_workflow_lesson",
        subject: "python command availability",
        recommendedAction: "node --input-type=module or tsx",
        avoidAction: "python",
      },
    });
  });

  it("captures the gateway tools-invoke environment constraint", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Don't try POST /tools/invoke here; it is forbidden on this gateway, so use direct runtime invocation instead.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "workflow_environment_constraint",
        semanticProfileId: "environment_constraint",
        lessonFamily: "generalized_workflow_lesson",
        subject: "gateway tool invocation path",
        recommendedAction: "direct runtime invocation",
        avoidAction: "/tools/invoke",
      },
    });
  });

  it("captures the OpenAI embeddings auth workaround", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Codex OAuth does not help for OpenAI embeddings here; semantic memory search still needs a real OPENAI_API_KEY.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        lessonFamily: "generalized_workflow_lesson",
        subject: "OpenAI embeddings auth",
        recommendedAction: "use a configured OPENAI_API_KEY or another embeddings provider",
        avoidAction: "codex OAuth alone",
      },
    });
  });

  it("captures the Anthropic long-context workaround", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Anthropic Extra usage is required for long context requests means context1m needs an eligible billed API key or a fallback model.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        captureClass: "workflow_api_workaround",
        semanticProfileId: "api_workaround",
        lessonFamily: "generalized_workflow_lesson",
        subject: "Anthropic long-context eligibility",
        recommendedAction:
          "use an eligible billed API key or disable context1m and keep a fallback model configured",
        avoidAction: "assuming the current credential can use context1m",
      },
    });
  });

  it("captures an unregistered generalized workflow lesson from explicit use-instead phrasing", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "For release proof notes here, use bulletized proof IDs instead of paraphrased rollout summaries.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "use_instead_of",
        subject: "release proof notes",
        recommendedAction: "bulletized proof IDs",
        avoidAction: "paraphrased rollout summaries",
      },
    });
  });

  it("captures an unregistered generalized workflow lesson from trust phrasing", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Trust the post-promotion proof report for rollout signoff here; raw container status is only a rough liveness signal.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_workflow_lesson",
        captureClass: "workflow_generalized_guidance",
        guidancePattern: "trust_for_scope",
        subject: "rollout signoff",
        recommendedAction: "the post-promotion proof report",
        avoidAction: "raw container status",
      },
    });
  });

  it("ignores a one-off tool complaint without durable guidance", () => {
    expect(detectWorkflowImprovementSemanticDecision("Vitest was slow today.")).toMatchObject({
      action: "ignore",
    });
  });

  it("ignores a vague environment complaint without a bounded constraint", () => {
    expect(detectWorkflowImprovementSemanticDecision("This host is weird today.")).toMatchObject({
      action: "ignore",
    });
  });

  it("ignores a vague API complaint without a bounded workaround", () => {
    expect(
      detectWorkflowImprovementSemanticDecision("Anthropic has been flaky today."),
    ).toMatchObject({
      action: "ignore",
    });
  });

  it("ignores a generic workflow complaint without a bounded supported lesson", () => {
    expect(
      detectWorkflowImprovementSemanticDecision("Our release workflow feels clunky."),
    ).toMatchObject({
      action: "ignore",
    });
  });

  it("ignores a vague health complaint without the readyz distinction", () => {
    expect(
      detectWorkflowImprovementSemanticDecision("Health checks have been noisy lately."),
    ).toMatchObject({
      action: "ignore",
    });
  });

  it("ignores broad workflow complaints that still lack explicit guidance", () => {
    expect(
      detectWorkflowImprovementSemanticDecision(
        "Our slice workflow feels messy and people should be more careful.",
      ),
    ).toMatchObject({
      action: "ignore",
    });
  });
});
