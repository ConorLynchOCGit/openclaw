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
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs": [
          "buildImplementationTaskPacket({});",
          "compileNodeExecutionPacketForImplementationTask({});",
          'const boundary = "after_resource_materialization";',
        ].join("\n"),
        "scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs":
          "node scripts/execution-platform-run-worker-readiness-edit-evidence-real-model-proof.mjs",
        "extensions/execution-platform/src/workflows/boundary-replay-registry.ts":
          'export const kind = "before_resource_materialization";',
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts":
          'artifactType: "execution_platform.implementation_resource_materialization_result";',
        "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts": [
          '"The next patch-lane turn must call worker.edit.plan, worker.edit.apply_patch";',
          "const activeLifecycleAllows = true;",
          "const retiredTool = 'worker.context.record_basis';",
          "function parseModelToolCalls() { return []; }",
          "modelClient.nextTurn({});",
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
              reasonCode:
                "product_spec_replay_must_not_construct_worker_packets_outside_node_runner",
            }),
            expect.objectContaining({
              checkId: "product_spec_replay_exposes_retired_resource_materialization_boundaries",
              reasonCode: "product_spec_replay_retired_resource_materialization_boundary_blocked",
            }),
            expect.objectContaining({
              checkId: "boundary_replay_registry_exposes_retired_resource_materialization",
              reasonCode:
                "boundary_replay_registry_retired_resource_materialization_boundary_blocked",
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
            expect.objectContaining({
              checkId: "non_codex_worker_no_model_facing_record_basis_tool",
              reasonCode:
                "worker_context_basis_must_be_metadata_on_native_search_open_refine_accept_not_model_facing_tool",
            }),
            expect.objectContaining({
              checkId: "non_codex_worker_no_json_shaped_tool_selection_transport",
              reasonCode:
                "worker_model_choices_must_use_provider_native_tools_through_runner_owned_transport",
            }),
          ]),
        );
      },
    );
  });

  it("fails if Product/Spec intake or replay resurrect deterministic source prompt context index gates", () => {
    withTempRepo(
      {
        "scripts/execution-platform-run-product-spec-checkpointed-test.mjs":
          'const gate = latestArtifact(artifacts, "execution_platform.source_prompt_context_index");',
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs":
          'artifactRefsByType(artifacts, "execution_platform.source_prompt_context_index");',
        "extensions/execution-platform/src/workflows/intake-stage-runner.ts":
          "type Input = { sourcePromptContextIndexRef: string };",
        "extensions/execution-platform/src/runtime-artifact-contracts.ts":
          'payloadContract({ artifactType: "execution_platform.source_prompt_context_index", bodySchemaRef: "SourcePromptContextIndex" });',
        "extensions/execution-platform/src/workflows/obligation-graph.ts":
          'type ObligationDiscoveryBrief = { discoveryBrief: unknown }; const tool = "obligation.discovery.add_anchor";',
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts":
          "const brief = input.obligation.discoveryBrief;",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "checkpoint_proof_source_prompt_context_index_gate_deleted",
              reasonCode:
                "checkpoint_proof_must_use_source_prompt_artifact_and_mission_ledger_grounding",
            }),
            expect.objectContaining({
              checkId: "boundary_replay_source_prompt_context_index_gate_deleted",
              reasonCode:
                "boundary_replay_must_use_source_prompt_artifact_and_mission_ledger_grounding",
            }),
            expect.objectContaining({
              checkId: "intake_runner_source_prompt_context_index_owner_deleted",
              reasonCode:
                "intake_runner_must_not_use_deterministic_source_prompt_section_index_as_semantic_grounding",
            }),
            expect.objectContaining({
              checkId: "runtime_artifact_contract_source_prompt_context_index_deleted",
              reasonCode:
                "runtime_artifact_contracts_must_not_register_source_prompt_context_index_as_production_body_artifact",
            }),
            expect.objectContaining({
              checkId: "obligation_graph_inline_discovery_brief_deleted",
              reasonCode: "obligation_graph_must_not_own_discovery_brief_or_discovery_tool_dialect",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_obligation_inline_discovery_fallback_deleted",
              reasonCode:
                "scheduler_stage_must_consume_discovery_brief_set_not_obligation_inline_discovery",
            }),
          ]),
        );
      },
    );
  });

  it("fails if retired scheduler WorkIntent promotion bypass code returns", () => {
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
              checkId: "scheduler_workintent_promotion_bypass_path_deleted",
              reasonCode: "workintent_promotion_bypass_path_must_be_deleted",
            }),
          ]),
        );
      },
    );
  });

  it("fails if runner-owned tool phases bypass the canonical provider tool transport", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/intake-stage-runner.ts":
          "await missionModelClient.runTools({});",
        "extensions/execution-platform/src/workflows/model-tool-turn-transport.ts":
          "await input.modelClient.runTools({});",
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts":
          "await client.callTools({});",
        "extensions/execution-platform/src/intent-front-door/live-structured-router-provider.ts":
          '"https://openrouter.ai/api/v1/chat/completions"; response.json().catch(() => null);',
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs":
          "const toolBatch = await modelClient.runTools({}); schedulerCanonicalToolIdFromProviderName(toolBatch.toolName);",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "intake_requirement_map_uses_shared_model_tool_turn_transport",
              reasonCode:
                "intake_requirement_map_phases_must_use_shared_runner_owned_tool_turn_transport",
            }),
            expect.objectContaining({
              checkId: "model_tool_turn_transport_uses_canonical_provider_tool_turn",
              reasonCode:
                "model_tool_turn_transport_must_delegate_to_canonical_provider_tool_turn_not_legacy_transport_names",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_uses_shared_model_tool_turn_transport",
              reasonCode: "scheduler_stage_runner_must_use_shared_runner_owned_tool_turn_transport",
            }),
            expect.objectContaining({
              checkId: "intent_front_door_router_no_direct_provider_tool_transport",
              reasonCode:
                "intent_front_door_router_must_use_shared_provider_tool_transport_not_direct_provider_fetch",
            }),
            expect.objectContaining({
              checkId: "boundary_replay_no_direct_scheduler_provider_tool_transport",
              reasonCode:
                "boundary_replay_scheduler_tools_must_delegate_to_scheduler_stage_runner_transport",
            }),
          ]),
        );
      },
    );
  });

  it("fails if native node execution bypasses OpenClaw native runtime tools or clamps the agent tool surface", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/node-agent-session.ts": [
          "await input.modelClient.runJson({});",
          "runEmbeddedAgent({ toolsAllow: ['node_finish'], extraTools: [] });",
        ].join("\n"),
        "src/gateway/execution-platform-agent-team-runner.ts":
          "runNodeAgentSession({ agentParams: { toolsAllow: ['node_finish'] } });",
        "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts": [
          '"model_agnostic_file_edit_worker";',
          '"model_agnostic_tool_worker_loop";',
          '"non_codex_tool_using_worker_loop";',
        ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "node_agent_session_no_tool_allow_override",
              reasonCode:
                "node_agent_session_must_not_use_tools_allow_because_it_strips_openclaw_skills_and_native_tools",
            }),
            expect.objectContaining({
              checkId: "node_agent_session_no_direct_model_or_tool_transport",
              reasonCode:
                "node_agent_session_must_delegate_to_openclaw_agent_runtime_not_parallel_json_or_tool_transport",
            }),
            expect.objectContaining({
              checkId: "gateway_node_agent_session_no_tool_allow_override",
              reasonCode:
                "gateway_native_node_execution_must_use_openclaw_agent_config_and_native_runtime_tools_not_tools_allow",
            }),
            expect.objectContaining({
              checkId: "runtime_capability_manifest_no_deleted_model_agnostic_worker_adapters",
              reasonCode:
                "runtime_capability_manifest_must_not_advertise_deleted_model_agnostic_worker_adapters",
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
          "const schedulerStage = new SchedulerStageRunner();",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "expansion_admission_honors_runner_owned_lifecycle_transitions",
              reasonCode: "expansion_admission_must_not_defer_runner_owned_lifecycle_transitions",
            }),
            expect.objectContaining({
              checkId: "scheduler_graph_amendment_request_wired_to_stage_runner",
              reasonCode:
                "runtime_scheduler_must_pass_typed_graph_amendment_requests_to_scheduler_stage_runner",
            }),
          ]),
        );
      },
    );
  });

  it("fails if scheduler-stage phase ownership returns to RuntimeWorkGraphScheduler", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts": [
          "function evaluateSchedulerStage() {}",
          "function applySchedulerStagedDraftPatch() {}",
          "function validateSchedulerValidationNodePhaseOrdering() {}",
          "const schedulerStageNoProgressCounts = new Map();",
          "compileDecision: (compilerInput) => compilerInput",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts": [
          "type SchedulerStageRunInput = { compileDecision(input: unknown): unknown };",
          "function buildRejectionEnvelope(input: unknown) { return input; }",
          "function hydrateSchedulerAggregateTailWorkUnits() {}",
          "const oldTool = 'scheduler.submit_staged_graph';",
          "const oldEnvelope = 'schedulerToolCalls';",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.test.ts":
          "const zombie = 'applySchedulerStagedDraftPatch';",
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "scheduler_stage_inline_phase_owner_deleted",
              reasonCode: "scheduler_stage_phase_ownership_must_live_in_scheduler_stage_runner",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_no_legacy_decision_compiler_inputs",
              reasonCode:
                "scheduler_stage_runner_must_compile_scheduler_graph_patch_not_orchestrator_decision",
            }),
            expect.objectContaining({
              checkId: "runtime_scheduler_fresh_stage_no_legacy_decision_compiler_wiring",
              reasonCode:
                "runtime_scheduler_must_not_wire_fresh_scheduler_stage_to_orchestrator_decision_compiler",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_no_retired_submit_or_json_scheduler_dialect",
              reasonCode: "scheduler_stage_runner_retired_submit_json_dialect_blocked",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_tests_no_retired_submit_or_json_scheduler_dialect",
              reasonCode: "scheduler_stage_tests_must_not_preserve_retired_scheduler_dialect",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_no_mutable_aggregate_tail_draft",
              reasonCode: "scheduler_stage_runner_must_not_hydrate_mission_tail_work_units",
            }),
            expect.objectContaining({
              checkId: "runtime_scheduler_no_private_validation_tail_admission_owner",
              reasonCode: "runtime_scheduler_must_use_shared_scheduler_graph_admission",
            }),
          ]),
        );
      },
    );
  });

  it("fails if retired WorkIntent or staged scheduler graph tools return", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts":
          "schedulerToolCalls; scheduler.compile_staged_runtime_graph; promote_work_intent_to_executable;",
        "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts":
          "'scheduler.compile_work_intents'; 'scheduler.create_graph_node';",
        "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts":
          "type StagedWorkBreakdownUnit = {}; const old = stagedScheduler;",
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts":
          "'work_intent_compiled'; 'staged_scheduler_graph_compiled';",
        "extensions/execution-platform/src/workflows/index.ts": 'export * from "./work-intent.ts";',
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "runtime_scheduler_no_retired_workintent_scheduler_graph_path",
              reasonCode: "runtime_scheduler_retired_workintent_staged_graph_path_blocked",
            }),
            expect.objectContaining({
              checkId: "scheduler_runtime_tools_no_retired_workintent_or_staged_graph_tools",
              reasonCode: "scheduler_runtime_tools_retired_workintent_staged_graph_tools_blocked",
            }),
            expect.objectContaining({
              checkId: "orchestrator_decision_no_retired_staged_scheduler_parser",
              reasonCode: "orchestrator_decision_retired_staged_scheduler_parser_blocked",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_no_retired_workintent_trace_codes",
              reasonCode: "scheduler_stage_runner_retired_workintent_trace_codes_blocked",
            }),
            expect.objectContaining({
              checkId: "workflow_barrel_no_workintent_compiler_export",
              reasonCode: "workflow_barrel_retired_workintent_compiler_export_blocked",
            }),
          ]),
        );
      },
    );
  });

  it("fails if native node execution resurrects initial task brief contracts", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/node-agent-session.ts": [
          "type NodeAgentPromptSourceMaterial = {};",
          "type NodeAgentAuthoredTaskPrompt = {};",
          "function buildNodeAgentPromptSourceMaterial() {}",
          "function authorNodeAgentTaskPrompt() {}",
          "function compactNodeTaskBriefText() {}",
        ].join("\n"),
        "src/gateway/execution-platform-agent-team-runner.ts": [
          "buildNodeAgentInitialTaskBrief();",
          "runNodeAgentSession({ initialTaskBrief });",
        ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "node_agent_session_no_initial_task_brief_contract",
              reasonCode:
                "native_node_agent_session_must_use_model_authored_worker_prompt_not_task_brief_contract",
            }),
            expect.objectContaining({
              checkId: "gateway_native_node_execution_no_initial_task_brief_contract",
              reasonCode:
                "gateway_native_node_execution_must_start_from_node_lifecycle_worker_prompt",
            }),
          ]),
        );
      },
    );
  });

  it("requires text-turn worker prompt authoring and worker plan/subagent tools", () => {
    withTempRepo(
      {
        "src/gateway/execution-platform-agent-team-runner.ts": [
          "function createGatewayNodeAgentSessionRunner() {}",
          "nodeAgentSessionRunner: createGatewayNodeAgentSessionRunner(input.runtimeJobs, roleModelClient)",
          "function runNodeAgentSession() {}",
          "function createExecutionPlatformResourceReadTool() {}",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/node-agent-session.ts": [
          "export const NODE_EXECUTION_ASSIGNMENT_ARTIFACT_TYPE = 'execution_platform.node_execution_assignment';",
          "function runNodeAgentSession() { return 'node_finish_not_called'; }",
        ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "gateway_wires_openclaw_node_session_executor",
              reasonCode:
                "gateway_must_wire_native_node_execution_through_shared_openclaw_executor_and_canonical_transport",
            }),
            expect.objectContaining({
              checkId: "gateway_node_start_adapter_uses_registry_native_task_tool_contract",
              reasonCode:
                "gateway_node_start_adapter_must_use_registry_native_task_tool_contract_not_raw_parent_session_or_search_tools",
            }),
            expect.objectContaining({
              checkId: "node_agent_session_authors_worker_prompt_with_text_model_turn",
              reasonCode:
                "node_lifecycle_runner_must_author_worker_prompt_through_native_text_model_turn",
            }),
            expect.objectContaining({
              checkId: "node_agent_session_treats_sessions_yield_as_nonterminal_wait",
              reasonCode:
                "node_agent_session_must_not_terminalize_native_subagent_wait_as_missing_node_finish",
            }),
            expect.objectContaining({
              checkId: "node_agent_session_builds_bounded_runtime_trace",
              reasonCode:
                "native_node_agent_session_must_emit_bounded_trace_refs_for_plan_subagent_edit_validation_finish_optics",
            }),
            expect.objectContaining({
              checkId: "gateway_attaches_bounded_node_agent_session_trace_artifact",
              reasonCode:
                "gateway_must_attach_node_agent_session_trace_artifacts_for_runtime_readback_without_raw_transcripts",
            }),
            expect.objectContaining({
              checkId: "gateway_records_blocked_node_start_as_native_session_launch",
              reasonCode:
                "gateway_must_record_blocked_node_start_as_native_session_launch_not_start_receipt_artifact",
            }),
            expect.objectContaining({
              checkId: "native_session_launch_store_supports_launch_only_blocked_admission",
              reasonCode:
                "native_session_launch_store_must_persist_pre_session_blockers_without_ep_start_receipt",
            }),
            expect.objectContaining({
              checkId: "active_graph_readback_projects_native_session_launch_first",
              reasonCode:
                "work_queue_readback_must_project_native_session_launch_before_legacy_start_receipts",
            }),
            expect.objectContaining({
              checkId: "boundary_replay_uses_runner_owned_fresh_attempt_reset",
              reasonCode:
                "boundary_replay_must_use_runner_owned_fresh_attempt_reset_not_hand_patch_node_session_fields",
            }),
            expect.objectContaining({
              checkId: "native_session_write_lock_returns_typed_acquisition_trace",
              reasonCode:
                "openclaw_session_lock_acquisition_must_emit_typed_trace_for_node_lifecycle_projection",
            }),
            expect.objectContaining({
              checkId: "runtime_artifact_contracts_require_node_agent_session_trace_payload",
              reasonCode:
                "node_agent_session_trace_artifact_must_be_manifest_backed_and_rehydratable_by_contract",
            }),
            expect.objectContaining({
              checkId: "active_graph_readback_projects_node_agent_session_trace",
              reasonCode:
                "work_queue_readback_must_project_bounded_native_node_agent_session_optics",
            }),
          ]),
        );
      },
    );
  });

  it("fails if SchedulerGraphPatch compiler emits runtime graph node ids", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/workflows/scheduler-graph-patch.ts": [
          "type SchedulerGraphPatchNodeSeed = { runtimeNodeId: string };",
          "const runtimeNodeIdBySeedId = new Map();",
          "function tailRuntimeNodeId() { return 'node-mission-validation'; }",
        ].join("\n"),
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "scheduler_graph_patch_compiler_no_runtime_identity",
              reasonCode:
                "scheduler_graph_patch_compiler_must_emit_semantic_seed_ids_runtime_persistence_owns_node_ids",
            }),
          ]),
        );
      },
    );
  });

  it("fails if retired intake authoring or mission-ledger prework gates return", () => {
    withTempRepo(
      {
        "extensions/execution-platform/src/model-tasks/model-task-classification.ts": [
          "const callSite = 'mission_ledger.production_single_pass';",
          "const boundary = 'obligation_semantic_content';",
          "const repair = 'obligation.targeted_normalization';",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts":
          'export const tool = "scheduler.mission_ledger_readiness";',
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts": [
          "function evaluateMissionLedgerBeforeWork() {}",
          '"mission_contract_ledger_required_for_execution_workflow"',
          "missionLedgerSummary: input.missionLedger\n        ? summarizeMissionContractLedger(input.missionLedger)\n        : null,\n      requirementMap",
        ].join("\n"),
        "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts":
          "type SchedulerStageRunInput = { missionLedgerSummary: unknown };",
        "extensions/execution-platform/src/workflows/intake-stage-runner.ts":
          "const missionLedger = { authoring: true };",
        "extensions/execution-platform/src/workflows/workflow-plugin.ts":
          "type Policy = { requireMissionLedgerForExecutionWorkflow: boolean };",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts":
          "const missionLedgerMode = 'production_single_pass';",
        "extensions/execution-platform/src/runtime-artifact-contracts.ts":
          'payloadContract({ artifactType: "execution_platform.discovery_brief_set", bodySchemaRef: "DiscoveryBriefSet" });',
      },
      (repoRoot) => {
        const report = runArchitectureResidueSourceInventory({ repoRoot });

        expect(report.status).toBe("failed");
        expect(report.hardFailures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: "model_task_registers_retired_intake_authoring_boundaries",
              reasonCode: "retired_intake_authoring_model_task_boundary_blocked",
            }),
            expect.objectContaining({
              checkId: "scheduler_runtime_tools_no_mission_ledger_readiness",
              reasonCode: "scheduler_mission_ledger_prework_readiness_tool_blocked",
            }),
            expect.objectContaining({
              checkId: "scheduler_no_mission_ledger_prework_gate",
              reasonCode: "scheduler_must_not_gate_prework_on_mission_ledger",
            }),
            expect.objectContaining({
              checkId: "scheduler_stage_runner_no_mission_ledger_inputs",
              reasonCode:
                "scheduler_stage_runner_must_not_consume_mission_ledger_before_scheduling",
            }),
            expect.objectContaining({
              checkId: "intake_runner_no_mission_ledger_authoring_or_persistence",
              reasonCode:
                "intake_runner_must_not_author_or_persist_mission_ledger_before_scheduling",
            }),
            expect.objectContaining({
              checkId: "workflow_plugins_no_mission_ledger_required_toggle",
              reasonCode: "workflow_plugin_mission_ledger_required_toggle_blocked",
            }),
            expect.objectContaining({
              checkId: "dynamic_runner_no_retired_mission_ledger_authoring_mode",
              reasonCode: "dynamic_runner_retired_mission_ledger_authoring_mode_blocked",
            }),
            expect.objectContaining({
              checkId: "runtime_artifact_contract_registers_retired_intake_products",
              reasonCode: "runtime_artifact_contract_must_not_register_retired_intake_products",
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
              reasonCode: "superstep_must_not_infer_validation_or_escalation_from_reason_code_bags",
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
        "extensions/execution-platform/src/work-queue/execution-read-model.ts": Array.from(
          { length: 12 },
          () => "contextSynthesis",
        ).join("\n"),
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
      fullReportRef:
        "artifact://execution-platform/architecture-residue-source-inventory/report.json",
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
