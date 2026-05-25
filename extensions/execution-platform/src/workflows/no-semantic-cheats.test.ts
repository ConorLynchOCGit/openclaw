import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateExecutionPlatformBoundaryGuardrails } from "./execution-platform-boundary-guardrails.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("no semantic cheats in runtime boundary code", () => {
  it("keeps Product/Spec sequencing out of generic scheduler branches", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(scheduler).not.toContain("isProductSpecPlanningWorkflow");
    expect(scheduler).not.toContain(
      "product_spec_planning_first_node_must_be_planning_orchestrator",
    );
    expect(scheduler).not.toContain(
      "product_spec_planning_run_after_add_must_start_planning_orchestrator",
    );
    expect(scheduler).not.toContain(
      "product_spec_planning_planning_orchestrator_must_run_before_child_nodes",
    );
    expect(scheduler).not.toContain("Product/Spec Planning production proof");
    expect(scheduler).not.toContain("active-queue-34");
  });

  it("uses manifest role classes instead of substring role classifiers", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );
    const compiler = source(
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    );

    expect(scheduler).not.toContain('joined.includes("context")');
    expect(scheduler).not.toContain('values.includes("implementation")');
    expect(compiler).not.toContain('values.includes("context")');
    expect(compiler).not.toContain('values.includes("implementation")');
    expect(compiler).toContain("findRuntimeNodeCapability");
  });

  it("does not hardcode repo file scoring in the non-Codex worker adapter", () => {
    const adapter = source(
      "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    );

    expect(adapter).not.toContain("canonical-runtime-queue");
    expect(adapter).not.toContain("execution-read-model");
    expect(adapter).not.toContain("work-queue-repository");
  });

  it("does not infer evidence kinds from artifact ref substrings", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(scheduler).not.toContain("artifactRefForEvidenceKind");
    expect(scheduler).not.toContain("evidence_claim_ref_normalized_to_output_artifact");
  });

  it("does not compile context synthesis directly into executable implementation graphs", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(scheduler).not.toContain("runtime_compiled_context_synthesis_to_implementation_group");
    expect(scheduler).not.toContain("runtime_compiled_post_synthesis_graph_created");
    expect(scheduler).not.toContain("post_synthesis_monolithic_orchestrator_graph_bypassed");
    expect(scheduler).toContain("runtime_compiled_post_synthesis_workintent_graph_created");
    expect(scheduler).toContain("post_synthesis_executable_graph_compilation_retired");
  });

  it("keeps Product/Spec-specific prompt examples out of generic graph contract repair", () => {
    const compiler = source(
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    );

    expect(compiler).not.toContain("Identify Product/Spec Planning registration files");
    expect(compiler).toContain("Identify the target workflow registration files");
  });

  it("keeps context sufficiency quality judgment model-authored", () => {
    const contextScout = source(
      "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
    );

    expect(contextScout).not.toContain("summaryLength >=");
    expect(contextScout).not.toContain("nonSummarySubstanceSignalCount >=");
    expect(contextScout).not.toContain("no_model_authored_evidence");
  });

  it("keeps replay/proof harnesses out of production source imports", () => {
    const productionFiles = [
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
    ];

    for (const file of productionFiles) {
      expect(source(file)).not.toContain("execution-platform-run-product-spec-boundary-replay");
    }
  });

  it("uses the boundary guardrail audit for production/proof import separation", () => {
    const files = [
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ].map((file) => ({ path: file, source: source(file) }));

    const audit = evaluateExecutionPlatformBoundaryGuardrails(files);

    expect(audit.status).toBe("passed");
    expect(audit.hardBlockCount).toBe(0);
  });

  it("keeps the generic runtime spine independent from coding adapters and proof harnesses", () => {
    const spine = source("extensions/execution-platform/src/workflows/generic-runtime-spine.ts");

    expect(spine).not.toContain("../codex-bridge/");
    expect(spine).not.toContain("agent-team-coding-plugin");
    expect(spine).not.toContain("product-spec");
    expect(spine).not.toContain("boundary-replay");
    expect(spine).not.toContain("proof");
  });

  it("keeps generic runtime execution persistence independent from coding adapters", () => {
    const execution = source(
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts",
    );

    expect(execution).not.toContain("../codex-bridge/");
    expect(execution).not.toContain("agent-team-coding-plugin");
    expect(execution).not.toContain("product-spec");
    expect(execution).not.toContain("boundary-replay");
    expect(execution).not.toContain("proof");
  });
});
