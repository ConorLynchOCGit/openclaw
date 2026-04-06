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

  it("ignores a one-off tool complaint without durable guidance", () => {
    expect(detectWorkflowImprovementSemanticDecision("Vitest was slow today.")).toMatchObject({
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
});
