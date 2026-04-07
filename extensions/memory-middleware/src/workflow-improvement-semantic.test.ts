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
        lessonKey: "vitest_wrapper_required",
        toolKey: "vitest",
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
        lessonKey: "vitest_wrapper_required",
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
        lessonKey: "scripts_committer_required",
        toolKey: "scripts_committer",
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
        lessonKey: "git_stash_unsafe",
        toolKey: "git_stash",
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
        lessonKey: "docs_only_check_fast",
        toolKey: "validation_tier",
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
        lessonKey: "memory_proof_runner_required",
        toolKey: "memory_proof_runner",
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
        lessonKey: "readyz_for_readiness",
        toolKey: "gateway_readiness",
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
        lessonKey: "python_command_unavailable",
        toolKey: "python_runtime",
        captureClass: "workflow_environment_constraint",
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
        lessonKey: "gateway_tools_invoke_forbidden",
        toolKey: "gateway_tools_invoke",
        captureClass: "workflow_environment_constraint",
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
        lessonKey: "openai_embeddings_api_key_required",
        toolKey: "openai_embeddings",
        captureClass: "workflow_api_workaround",
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
        lessonKey: "anthropic_context1m_eligible_credential_required",
        toolKey: "anthropic_context1m",
        captureClass: "workflow_api_workaround",
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
});
