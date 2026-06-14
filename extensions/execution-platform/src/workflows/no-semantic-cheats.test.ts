import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateExecutionPlatformBoundaryGuardrails } from "./execution-platform-boundary-guardrails.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return existsSync(path.join(repoRoot, relativePath));
}

describe("no semantic cheats in runtime boundary code", () => {
  it("keeps deleted scheduler and boundary replay execution islands absent", () => {
    for (const file of [
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts",
      "extensions/execution-platform/src/workflows/generic-runtime-spine.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
      "extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts",
      "extensions/execution-platform/src/workflows/cost-aware-capability-policy.ts",
      "extensions/execution-platform/src/workflows/non-codex-task-decomposition-policy.ts",
      "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts",
      "extensions/execution-platform/src/workflows/generic-workflow-runner-retirement-contract.ts",
    ]) {
      expect(exists(file)).toBe(false);
    }
  });

  it("keeps WorkIntent node compatibility out of current runtime graph types", () => {
    const graph = source("extensions/execution-platform/src/workflows/runtime-work-graph.ts");
    const nodeLifecycle = source(
      "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.ts",
    );
    const schedulerStage = source(
      "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    );

    expect(graph).not.toContain('"work_intent"');
    expect(nodeLifecycle).not.toContain('nodeKind === "work_intent"');
    expect(schedulerStage).not.toContain("compile_work_intent_graph");
  });

  it("keeps retired Product/Spec proof replay surfaces absent", () => {
    for (const file of [
      "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
      "src/scripts/execution-platform-boundary-replay-terminalization.test.ts",
      "scripts/execution-platform-record-product-spec-proof-substrate-scrub-queue.mjs",
      "scripts/execution-platform-record-boundary-replay-checkpoints-closeout.mjs",
      "scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs",
      "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
      "extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts",
    ]) {
      expect(exists(file)).toBe(false);
    }
  });

  it("keeps action review artifacts generic and structurally typed", () => {
    const actionReview = source(
      "extensions/execution-platform/src/workflows/action-review-artifacts.ts",
    );
    const schedulerTools = source(
      "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    );

    expect(actionReview).toContain("ActionReviewArtifactSchema");
    expect(actionReview).toContain("WorkerEditReviewArtifactSchema");
    expect(actionReview).not.toContain("Product/Spec");
    expect(actionReview).not.toContain('includes("implementation")');
    expect(actionReview).not.toContain('includes("context")');
    expect(schedulerTools).toContain("action_review.create");
    expect(schedulerTools).toContain("worker.edit.persist_review_artifact");
  });

  it("uses the boundary guardrail audit for production/proof import separation", () => {
    const files = [
      "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
      "extensions/execution-platform/src/workflows/workflow-plugin.ts",
      "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ].map((file) => ({ path: file, source: source(file) }));

    const result = evaluateExecutionPlatformBoundaryGuardrails(files);

    expect(result.status).toBe("passed");
    expect(result.hardBlockCount).toBe(0);
  });
});
