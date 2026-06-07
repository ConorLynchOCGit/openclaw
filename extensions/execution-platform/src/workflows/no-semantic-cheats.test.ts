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
    const superstep = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts",
    );
    const compiler = source(
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    );

    expect(scheduler).not.toContain('joined.includes("context")');
    expect(scheduler).not.toContain('values.includes("implementation")');
    expect(scheduler).not.toContain("/context|handoff|synthesis/iu.test(ref)");
    expect(scheduler).not.toContain(
      "/context[-_:]?synthesis|context[-_:]?handoff|context[-_:]?snapshot|context[-_:]?scout/iu.test",
    );
    expect(scheduler).not.toContain(
      "/context|readiness|snapshot|target_refs|validation_refs|upstream_context/iu.test",
    );
    expect(scheduler).not.toContain(
      "/blocked|missing|conflict|exhausted|not_satisfied|no_progress/iu.test",
    );
    expect(scheduler).toContain("branchSimilarityClassForDiagnostic");
    expect(scheduler).toContain("runtime_work_graph_frontier_root_cause");
    expect(superstep).not.toContain("includesAny(");
    expect(superstep).not.toContain('code.includes("blocked")');
    expect(superstep).not.toContain('code.includes("missing")');
    expect(superstep).toContain("SUPERSTEP_BRANCH_RESULT_STATUSES");
    expect(superstep).toContain("SuperstepBranchResultStatusSchema");
    expect(superstep).toContain("statusFromStructuredSignals");
    expect(superstep).not.toContain("CONTEXT_LIFECYCLE_STATES");
    expect(superstep).not.toContain("RESOURCE_LIFECYCLE_STATES");
    expect(compiler).not.toContain('values.includes("context")');
    expect(compiler).not.toContain('values.includes("implementation")');
    expect(compiler).toContain("findRuntimeNodeCapability");
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
    expect(scheduler).not.toContain("runtime_compiled_post_synthesis_workintent_graph_created");
    expect(scheduler).not.toContain("post_synthesis_executable_graph_compilation_retired");
    expect(scheduler).not.toContain("context_synthesis");
    expect(scheduler).not.toContain("context-synthesis");
  });

  it("keeps default context synthesis retired in scheduler and replay code", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );
    const replay = source("scripts/execution-platform-run-product-spec-boundary-replay.mjs");

    expect(scheduler).not.toContain("contextSynthesisCoordinationRequired");
    expect(scheduler).not.toContain("context_synthesis_requires_explicit_coordination_policy");
    expect(scheduler).not.toContain("runtime_policy_default_context_synthesis_retired");
    expect(scheduler).not.toContain("context_synthesis");
    expect(scheduler).not.toContain("context-synthesis");
    expect(replay).not.toContain(
      "runtime-work-graph://${node.graphId}/context-synthesis/product-spec-planning-native-workflow-implementation-synthesis",
    );
    expect(replay).not.toContain('ref.includes("context-synthesis")');
    expect(replay).not.toContain("after-context-synthesis");
  });

  it("keeps Product/Spec-specific prompt examples out of generic graph contract repair", () => {
    const compiler = source(
      "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    );

    expect(compiler).not.toContain("Identify Product/Spec Planning registration files");
    expect(compiler).toContain("Identify the target workflow registration files");
  });

  it("keeps scheduler model-call observability bounded and raw-free", () => {
    const envelope = source(
      "extensions/execution-platform/src/workflows/scheduler-model-call-envelope.ts",
    );

    expect(envelope).toContain("hiddenReasoningStored: false");
    expect(envelope).toContain("secretsStored: false");
    expect(envelope).not.toContain("hiddenReasoningStored: true");
    expect(envelope).not.toContain("rawPromptStored: true");
    expect(envelope).not.toContain("responseBody");
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

  it("keeps replay epoch eligibility structural instead of lexical", () => {
    const replayCheckpoints = source(
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
    );
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(
      exists("extensions/execution-platform/src/workflows/readiness-recompute-authority.ts"),
    ).toBe(false);
    expect(replayCheckpoints).toContain("evaluateBoundaryReplayChildEpochEligibility");
    expect(replayCheckpoints).toContain("boundary_replay_child_epoch_mismatch");
    expect(replayCheckpoints).not.toContain('title.includes("Product/Spec")');
    expect(replayCheckpoints).not.toContain('includes("context_synthesis")');
    expect(scheduler).toContain("evaluateBoundaryReplayChildEpochEligibility");
    expect(scheduler).not.toContain("readiness-recompute-authority");
  });

  it("keeps retired resource selection deleted from production execution", () => {
    const replay = source("scripts/execution-platform-run-product-spec-boundary-replay.mjs");
    const productionRunner = source(
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    );
    const domainResourceSelectionReplaySection = replay.slice(
      replay.indexOf("async function compileReplayDomainResourceSelectionPacket"),
      replay.indexOf("function replayContextRefsForNode"),
    );

    expect(exists("extensions/execution-platform/src/workflows/resource-selection.ts")).toBe(false);
    expect(replay).not.toContain("compileReplayDomainResourceSelectionPacket");
    expect(replay).not.toContain("resource.selection.propose");
    expect(replay).not.toContain("resource.selection.mark_blocked");
    expect(domainResourceSelectionReplaySection).not.toContain("new CodexDynamicJsonClient");
    expect(domainResourceSelectionReplaySection).not.toContain("executeModelToolTurn");
    expect(replay).not.toContain("const concreteIntentRefs = [");
    expect(replay).not.toContain("...selectedTargetFileRefs,\n      ...replayNodeTargetRefs(node)");
    expect(productionRunner).not.toContain("const concreteIntentRefs = [");
    expect(productionRunner).not.toContain(
      '...metadataStringArray(metadata, "selectedTargetFileRefs"),\n          ...metadataStringArray(metadata, "selectedConcreteTargetRefs"),\n          ...metadataStringArray(metadata, "targetRefs"),',
    );
  });

  it("keeps readback gates from inferring lifecycle phases by substring", () => {
    const latestRunState = source(
      "extensions/execution-platform/src/observability/latest-run-state.ts",
    );
    const canonicalGate = source(
      "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
    );
    const activeGraphReadback = source(
      "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    );

    expect(latestRunState).not.toContain('includes("closeout")');
    expect(latestRunState).not.toContain('includes("final")');
    expect(canonicalGate).not.toContain('includes("implementation")');
    expect(canonicalGate).not.toContain('includes("context")');
    expect(activeGraphReadback).toContain("canonicalReadbackGate");
    expect(activeGraphReadback).toContain("firstOpenGate: canonicalReadbackGate");
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

  it("keeps retired context repair requirements out of scheduler ownership", () => {
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(
      exists("extensions/execution-platform/src/workflows/context-repair-requirement.ts"),
    ).toBe(false);
    expect(scheduler).not.toContain("compileContextRepairRequirement");
    expect(scheduler).not.toContain("evaluateContextRepairNodeExecutionGate");
    expect(scheduler).not.toContain("resource_repair.block_without_requirement");
  });

  it("keeps retired context scope revision deleted from production execution", () => {
    const schedulerTools = source(
      "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    );
    const nodeSession = source("extensions/execution-platform/src/workflows/node-agent-session.ts");

    expect(exists("extensions/execution-platform/src/workflows/context-scope-revision.ts")).toBe(
      false,
    );
    expect(schedulerTools).not.toContain("resource.scope.select_legal_subset");
    expect(schedulerTools).not.toContain("resource.scope.explain_unshardable_unit");
    expect(nodeSession).not.toContain("resource.scope.select_legal_subset");
    expect(nodeSession).not.toContain("resource.scope.explain_unshardable_unit");
  });

  it("keeps retired node resource ledger deleted from production execution", () => {
    const nodeSession = source("extensions/execution-platform/src/workflows/node-agent-session.ts");
    const runner = source("src/gateway/execution-platform-agent-team-runner.ts");

    expect(exists("extensions/execution-platform/src/workflows/node-resource-ledger.ts")).toBe(
      false,
    );
    expect(nodeSession).not.toContain("NodeExecutionAssignment");
    expect(nodeSession).toContain("NodeAgentWorkerPrompt");
    expect(nodeSession).toContain("NODE_EXECUTION_STORAGE_POLICY");
    expect(nodeSession).toContain("boundedRefsOnly: true");
    expect(runner).toContain("node_finish");
    expect(runner).not.toContain("nodeResourceLedger");
    expect(runner).not.toContain("node_resource_ledger");
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
