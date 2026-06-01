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
    expect(superstep).toContain("CONTEXT_LIFECYCLE_STATES");
    expect(superstep).toContain("RESOURCE_LIFECYCLE_STATES");
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

  it("keeps context sufficiency quality judgment model-authored", () => {
    const contextScout = source(
      "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
    );

    expect(contextScout).not.toContain("summaryLength >=");
    expect(contextScout).not.toContain("nonSummarySubstanceSignalCount >=");
    expect(contextScout).not.toContain("no_model_authored_evidence");
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
    const readinessAuthority = source(
      "extensions/execution-platform/src/workflows/readiness-recompute-authority.ts",
    );
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(replayCheckpoints).toContain("evaluateBoundaryReplayChildEpochEligibility");
    expect(replayCheckpoints).toContain("boundary_replay_child_epoch_mismatch");
    expect(replayCheckpoints).not.toContain('title.includes("Product/Spec")');
    expect(replayCheckpoints).not.toContain('includes("context_synthesis")');
    expect(readinessAuthority).toContain("evaluateChildEpochFrontierEligibility");
    expect(readinessAuthority).toContain("child_epoch_boundary_epoch_mismatch");
    expect(readinessAuthority).not.toContain('includes("Product/Spec")');
    expect(readinessAuthority).not.toContain("/context|implementation/iu.test");
    expect(scheduler).toContain("evaluateBoundaryReplayChildEpochEligibility");
    expect(scheduler).toContain("compareReadinessProjectionToCurrent");
  });

  it("keeps resource selection structural and model-authored", () => {
    const resourceSelection = source(
      "extensions/execution-platform/src/workflows/resource-selection.ts",
    );
    const replay = source("scripts/execution-platform-run-product-spec-boundary-replay.mjs");
    const productionRunner = source(
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    );
    const domainResourceSelectionReplaySection = replay.slice(
      replay.indexOf("async function compileReplayDomainResourceSelectionPacket"),
      replay.indexOf("function replayContextRefsForNode"),
    );

    expect(resourceSelection).toContain("resource.selection.propose");
    expect(resourceSelection).toContain("resource.selection.mark_blocked");
    expect(resourceSelection).toContain("model_task_client_router_preflight_blocked");
    expect(resourceSelection).not.toContain('includes("Product/Spec")');
    expect(resourceSelection).not.toContain('includes("context")');
    expect(resourceSelection).not.toContain('includes("implementation")');
    expect(domainResourceSelectionReplaySection).not.toContain("new CodexDynamicJsonClient");
    expect(domainResourceSelectionReplaySection).toContain("new ModelTaskClientRouter");
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

  it("keeps worker smoke matrix proof lanes explicit instead of substring-classified", () => {
    const workerSmokeMatrix = source(
      "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.ts",
    );

    expect(workerSmokeMatrix).toContain("WorkerSmokeMatrixChildClass");
    expect(workerSmokeMatrix).toContain("defaultProductSpecWorkerSmokeMatrixLanes");
    expect(workerSmokeMatrix).not.toContain(".includes(\"Product/Spec\")");
    expect(workerSmokeMatrix).not.toContain(".includes(\"implementation\")");
    expect(workerSmokeMatrix).not.toContain(".includes(\"context\")");
    expect(workerSmokeMatrix).not.toContain("/Product\\/Spec/");
    expect(workerSmokeMatrix).not.toContain("/implementation/");
  });

  it("keeps adversarial proof-entry lexical traps structural instead of semantic", () => {
    const adversarialSuite = source(
      "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts",
    );

    expect(adversarialSuite).toContain("ADVERSARIAL_PROOF_ENTRY_CASE_IDS");
    expect(adversarialSuite).toContain("semantic_lexical_trap");
    expect(adversarialSuite).toContain("lexical_trap_structural_fields_unchanged");
    expect(adversarialSuite).not.toContain(".includes(\"Product/Spec\")");
    expect(adversarialSuite).not.toContain(".includes(\"implementation\")");
    expect(adversarialSuite).not.toContain(".includes(\"context\")");
    expect(adversarialSuite).not.toContain("/Product\\/Spec/");
    expect(adversarialSuite).not.toContain("/implementation/");
    expect(adversarialSuite).not.toContain("/context/");
  });

  it("keeps context repair requirements structural and consumer-authority scoped", () => {
    const contextRepair = source(
      "extensions/execution-platform/src/workflows/context-repair-requirement.ts",
    );
    const scheduler = source(
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    );

    expect(contextRepair).toContain("compileContextRepairRequirement");
    expect(contextRepair).toContain("resource_repair_consumer_edge_missing");
    expect(contextRepair).not.toContain('includes("implementation")');
    expect(contextRepair).not.toContain('includes("Product/Spec")');
    expect(contextRepair).not.toContain("/context|implementation/iu.test");
    expect(scheduler).toContain("evaluateContextRepairNodeExecutionGate");
    expect(scheduler).toContain("resource_repair.block_without_requirement");
  });

  it("keeps context scope revision structural while the model owns semantic scope", () => {
    const scopeRevision = source(
      "extensions/execution-platform/src/workflows/context-scope-revision.ts",
    );

    expect(scopeRevision).toContain("semanticScopeChosenByModel: true");
    expect(scopeRevision).toContain("runtimeSemanticTruncationApplied: false");
    expect(scopeRevision).toContain("resource.scope.select_legal_subset");
    expect(scopeRevision).toContain("resource.scope.explain_unshardable_unit");
    expect(scopeRevision).not.toContain(".sort(");
    expect(scopeRevision).not.toContain("score");
    expect(scopeRevision).not.toContain("/Product\\/Spec/");
    expect(scopeRevision).not.toContain('includes("Product/Spec")');
    expect(scopeRevision).not.toContain('includes("implementation")');
  });

  it("keeps node context ledger structural while models own context substance", () => {
    const ledger = source("extensions/execution-platform/src/workflows/node-resource-ledger.ts");

    expect(ledger).toContain('semanticJudgmentOwner: z.literal("model_or_human")');
    expect(ledger).toContain("semanticQualityJudgedByDeterministicCode: z.literal(false)");
    expect(ledger).toContain("payloadBackedBodies: z.literal(true)");
    expect(ledger).toContain("manifestMetadataOnly: z.literal(true)");
    expect(ledger).not.toContain('includes("Product/Spec")');
    expect(ledger).not.toContain('includes("implementation")');
    expect(ledger).not.toContain('includes("context")');
    expect(ledger).not.toContain("score");
    expect(ledger).not.toContain("summary.length");
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
