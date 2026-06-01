import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID,
  assertArchitectureResidueSourceInventoryManifestMetadata,
  buildArchitectureResidueSourceInventoryManifest,
  runArchitectureResidueSourceInventory,
  type ArchitectureResidueSourceInventoryReport,
} from "./architecture-residue-source-inventory.ts";

function withTempRepo(files: Record<string, string>, run: (repoRoot: string) => void): void {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-residue-inventory-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolute = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, source, "utf8");
    }
    run(repoRoot);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

describe("architecture residue source inventory", () => {
  it("fails if a deleted retired runtime target is present", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/context-synthesis.ts": "export {};",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "deleted_runtime_target_still_present",
              file: "extensions/execution-platform/src/workflows/context-synthesis.ts",
            }),
          ]),
        );
      },
    );
  });

  it("fails if production barrels or replay scripts resurrect retired topology", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/index.ts":
          'export * from "./context-synthesis.ts";',
        "extensions/execution-platform/src/workflows/boundary-replay-registry.ts":
          'export const boundary = "after-context-synthesis";',
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs":
          "createContextSynthesisReplayExecutor();",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures.map((failure) => failure.reasonCode)).toEqual(
          expect.arrayContaining([
            "retired_context_synthesis_barrel_export_blocked",
            "after_context_synthesis_boundary_resurrection_blocked",
            "product_spec_replay_context_synthesis_execution_blocked",
          ]),
        );
      },
    );
  });

  it("fails if Product/Spec closeout reads shared mutable replay artifacts as closure truth", () => {
    withTempRepo(
      {
        "scripts/execution-platform-record-executable-spine-06-closeout.mjs":
          'const path = ".artifacts/execution-platform/product-spec-boundary-replay-result.json";',
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "product_spec_closeout_reads_shared_mutable_replay_outputs",
              reasonCode:
                "product_spec_proof_closeout_must_read_run_scoped_manifest_not_shared_stale_artifacts",
            }),
          ]),
        );
      },
    );
  });

  it("fails if replay or worker surfaces resurrect non-runner lifecycle dialects", () => {
    withTempRepo(
      {
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs":
          [
            "buildImplementationTaskPacket({});",
            "compileNodeExecutionPacketForImplementationTask({});",
            'const boundary = "after_resource_materialization";',
          ].join("\n"),
        "scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs":
          'node scripts/execution-platform-run-worker-readiness-edit-evidence-real-model-proof.mjs',
        "extensions/execution-platform/src/workflows/boundary-replay-registry.ts":
          'export const kind = "before_resource_materialization";',
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts":
          'artifactType: "execution_platform.implementation_resource_materialization_result";',
        "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts":
          [
            '"The next patch-lane turn must call worker.edit.plan, worker.edit.apply_patch";',
            "const activeLifecycleAllows = true;",
          ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "worker_loop_repair_text_exposes_patch_author_before_plan",
              reasonCode: "worker_prompt_must_not_expose_patch_author_before_runner_plan_gate",
            }),
            expect.objectContaining({
              checkId: "middle_lane_proof_uses_deleted_prompt_only_lifecycle_scripts",
              reasonCode: "middle_lane_proof_must_use_runner_owned_lifecycle_path",
            }),
            expect.objectContaining({
              checkId: "product_spec_replay_constructs_worker_packets_outside_runner",
              reasonCode: "product_spec_replay_must_not_construct_worker_packets_outside_node_runner",
            }),
            expect.objectContaining({
              checkId: "product_spec_replay_exposes_retired_resource_materialization_boundaries",
              reasonCode: "product_spec_replay_retired_resource_materialization_boundary_blocked",
            }),
            expect.objectContaining({
              checkId: "boundary_replay_registry_exposes_retired_resource_materialization",
              reasonCode: "boundary_replay_registry_retired_resource_materialization_boundary_blocked",
            }),
            expect.objectContaining({
              checkId: "dynamic_runner_does_not_attach_pre_worker_materialization_artifacts",
              reasonCode:
                "dynamic_runner_must_start_worker_owned_context_without_pre_worker_materialization",
            }),
            expect.objectContaining({
              checkId: "worker_loop_reintroduces_local_lifecycle_overrides",
              reasonCode: "worker_loop_must_not_override_node_runner_legal_transitions",
            }),
          ]),
        );
      },
    );
  });

  it("fails if scheduler promotion can bypass the node lifecycle runner", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts":
          'reasonCodes.push("runtime_policy_work_intent_promotion_bypassed_orchestrator_decision");',
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "scheduler_workintent_promotion_bypasses_lifecycle_runner",
              reasonCode: "workintent_promotion_must_be_node_lifecycle_runner_owned",
            }),
          ]),
        );
      },
    );
  });

  it("fails if lifecycle transitions can be deferred by generic expansion admission", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts":
          "metadata.runtimePrerequisiteCritical === true",
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts":
          [
            "runtimeOwnedWorkIntentPromotion: true",
            'lifecycleTransitionOwner: "NodeLifecycleTransitionRunner"',
            "runtimePrerequisiteCritical: true",
          ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "expansion_admission_honors_runner_owned_lifecycle_transitions",
              reasonCode:
                "expansion_admission_must_not_defer_runner_owned_lifecycle_transitions",
            }),
            expect.objectContaining({
              checkId: "workintent_promotion_marks_lifecycle_transition_prerequisite_critical",
              reasonCode: "workintent_promotion_must_be_runner_owned_and_non_deferrable",
            }),
          ]),
        );
      },
    );
  });

  it("fails if canonical readback maps retired materialization replay boundaries", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/observability/canonical-readback-gate.ts":
          "const gates = { before_resource_materialization: 'resource_materialization' };",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "readback_maps_retired_resource_materialization_boundaries",
              reasonCode:
                "canonical_readback_must_not_project_retired_resource_materialization_boundaries",
            }),
          ]),
        );
      },
    );
  });

  it("fails if validation evidence escalation or closeout ownership is inferred from old classifier paths", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/repair-classification.ts": [
          "if (/validation|test/iu.test(combined)) return 'validation_failure_repairable';",
          "if (/capability|qualification|high_capability|escalation_required/iu.test(combined)) return 'worker_capability_insufficient';",
          "if (/evidence[_-]claim|evidence_mapping|commitment.*evidence/iu.test(combined)) return 'evidence_mapping_missing';",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts":
          "function compileEscalationIntent() { return 'runtime_compiled_escalate_worker_intent'; }",
        "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts":
          "const VALIDATION_REPAIR_REASON_CODES = new Set(); hasExact(input.reasonCodes, VALIDATION_REPAIR_REASON_CODES);",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "repair_classifier_semantic_regex_deleted",
              reasonCode: "repair_classifier_must_not_use_reason_code_bag_semantic_regex",
            }),
            expect.objectContaining({
              checkId: "scheduler_escalate_worker_compiler_deleted",
              reasonCode: "worker_escalation_must_be_runner_owned_not_scheduler_compiled",
            }),
            expect.objectContaining({
              checkId: "superstep_reason_code_validation_escalation_deleted",
              reasonCode:
                "superstep_must_not_infer_validation_or_escalation_from_reason_code_bags",
            }),
          ]),
        );
      },
    );
  });

  it("fails on unallowlisted source survivors while allowing docs and negative tests", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/new-production-path.ts":
          "const nodeKind = 'context_synthesis';",
        "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts":
          "expect(source).not.toContain('context_synthesis');",
        "docs/projects/execution-platform/specs/history.md":
          "The retired context_synthesis path is documented here.",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.blockedSurvivorRefs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              file: "extensions/execution-platform/src/workflows/new-production-path.ts",
              term: "context_synthesis",
              disposition: "blocked_unallowlisted_source",
            }),
          ]),
        );
        expect(report.survivorRefs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              file: "docs/projects/execution-platform/specs/history.md",
              disposition: "allowed_historical_doc",
            }),
            expect.objectContaining({
              file: "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
              disposition: "allowed_exact_negative_test",
            }),
          ]),
        );
      },
    );
  });

  it("fails when exact source guard survivors exceed their cap", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/work-queue/execution-read-model.ts":
          Array.from({ length: 12 }, () => "contextSynthesis").join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.blockedSurvivorRefs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              file: "extensions/execution-platform/src/work-queue/execution-read-model.ts",
              term: "contextSynthesis",
              maxAllowedCount: 8,
            }),
          ]),
        );
      },
    );
  });

  it("builds a bounded manifest instead of putting full survivor bodies in metadata", () => {
    const report = {
      artifactKind: "execution_platform.architecture_residue_source_inventory" as const,
      schemaVersion: "execution-platform.architecture-residue-source-inventory.v1" as const,
      workItemId: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID,
      status: "passed" as const,
      hardFailureCount: 0,
      hardFailures: [],
      survivorTermCounts: { context_synthesis: 1 },
      survivorRefCount: 1,
      survivorRefs: [
        {
          file: "docs/projects/execution-platform/specs/history.md",
          term: "context_synthesis",
          count: 1,
          disposition: "allowed_historical_doc" as const,
          reasonCode: "historical_or_governing_doc_reference",
          maxAllowedCount: null,
        },
      ],
      blockedSurvivorRefCount: 0,
      blockedSurvivorRefs: [],
      deletedRuntimeTargetCount: 0,
      missingDeletedTargets: [],
      stillPresentDeletedTargets: [],
      scanRoots: ["docs/projects/execution-platform"],
      lineReduction: { added: 0, deleted: 20, netReduction: 20, numstat: [] },
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      generatedAt: "2026-05-27T00:00:00.000Z",
    } satisfies Omit<ArchitectureResidueSourceInventoryReport, "manifest">;
    const reportJson = `${JSON.stringify(report)}\n`;
    const manifest = buildArchitectureResidueSourceInventoryManifest({
      report,
      reportJson,
      fullReportRef: "artifact://execution-platform/architecture-residue-source-inventory/report.json",
    });

    expect(JSON.stringify(manifest).length).toBeLessThan(32 * 1024);
    expect(JSON.stringify(manifest)).not.toContain("survivorRefs");
    expect(manifest.fullReportRef).toBe(
      "artifact://execution-platform/architecture-residue-source-inventory/report.json",
    );
    expect(manifest.workItemId).toBe(ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID);
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawResponseStored).toBe(false);
  });

  it("rejects metadata manifests that embed full inventory bodies or raw logs", () => {
    const manifest = {
      artifactKind: "execution_platform.architecture_residue_source_inventory_manifest",
      schemaVersion: "execution-platform.architecture-residue-source-inventory.v1.manifest",
      workItemId: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID,
      status: "passed",
      reportHash: "sha256:abc",
      reportBytes: 10,
      hardFailureCount: 0,
      blockedSurvivorRefCount: 0,
      survivorRefCount: 0,
      topSurvivorFiles: [],
      lineReduction: { added: 0, deleted: 0, netReduction: 0 },
      fullReportRef: "artifact://execution-platform/full-report.json",
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      survivorRefs: [],
    };

    expect(() =>
      assertArchitectureResidueSourceInventoryManifestMetadata(
        manifest as unknown as ReturnType<typeof buildArchitectureResidueSourceInventoryManifest>,
      ),
    ).toThrow(/architecture_residue_manifest_body_field/u);

    const manifestWithoutBody = { ...manifest };
    delete (manifestWithoutBody as { survivorRefs?: unknown }).survivorRefs;
    const rawLogManifest = {
      ...manifestWithoutBody,
      rawProviderLogStored: true,
    };
    expect(() =>
      assertArchitectureResidueSourceInventoryManifestMetadata(
        rawLogManifest as unknown as ReturnType<
          typeof buildArchitectureResidueSourceInventoryManifest
        >,
      ),
    ).toThrow(/architecture_residue_manifest_raw_field_not_false/u);
  });
});
