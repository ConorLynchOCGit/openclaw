import { describe, expect, it } from "vitest";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import {
  SCHEDULER_RUNTIME_TOOL_IDS,
  registerSchedulerRuntimeTools,
} from "./scheduler-runtime-tools.ts";
import {
  NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS,
  validateLifecycleDescriptorToolRegistration,
} from "./node-lifecycle-transition-runner.ts";

describe("scheduler runtime tools", () => {
  it("keeps lifecycle descriptor tools registered in the runtime tool registry", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    const validation = validateLifecycleDescriptorToolRegistration({
      registeredToolIds: SCHEDULER_RUNTIME_TOOL_IDS,
    });
    expect(validation).toMatchObject({
      valid: true,
      missingToolIds: [],
      reasonCodes: ["node_lifecycle_descriptor_tool_registry_valid"],
    });

    for (const toolId of NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS) {
      expect(registry.get(toolId)?.definition.enabled).toBe(true);
      expect(registry.get(toolId)?.definition.rawPromptStored).toBe(false);
      expect(registry.get(toolId)?.definition.rawResponseStored).toBe(false);
      expect(registry.get(toolId)?.definition.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers WorkIntent root and resource requirement compiler tools as small scheduler verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "scheduler.work_intent.accept_roots",
      "scheduler.compile_resource_requirements_for_work_intents",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "scheduler.decompose_graph",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/scheduler\//u);
    }
  });

  it("does not register retired resource focus tools as scheduler runtime verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.focus.request",
      "resource.focus.request_for_work_intent",
      "resource.focus.select_next_unknown",
      "resource.focus.select_candidate_refs",
      "resource.focus.mark_unanswerable",
      "resource.focus.accept",
      "resource.requirement.compile_from_focus",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).not.toContain(toolId);
      expect(registry.get(toolId)).toBeNull();
    }
    expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain("resource.requirement.block_broad_payload");
  });

  it("registers canonical resource requirement and structural resharding tools as small verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "scheduler.resource.requirement.create",
      "scheduler.resource.requirement.attach_consumer",
      "scheduler.resource.requirement.select_candidate_refs",
      "scheduler.resource.requirement.compile_scout_packet",
      "scheduler.resource.requirement.reject_orphan_scout",
      "scheduler.resource.requirement.request_revision",
      "scheduler.resource.reshard_requirement",
      "resource.requirement.create_frontier_request",
      "resource.requirement.split_for_profile",
      "resource.frontier.persist_shard_manifest",
      "resource.frontier.record_single_unit_blocker",
      "resource.frontier.mark_shards_ready",
      "resource.requirement.merge_handoffs",
      "scheduler.resource.retry_failed_shard",
      "scheduler.resource.merge_shard_handoffs",
      "scheduler.resource.accept_partial_handoff",
      "scheduler.resource.block_single_unit_over_profile",
      "scheduler.accept_resource_limitation_waiver",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/(?:scheduler\/)?context\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers node-local node resource demand tools as small consumer-bound verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.demand.open",
      "resource.demand.request_file_window",
      "resource.demand.request_symbol",
      "resource.demand.request_related_tests",
      "resource.demand.request_memory_pack",
      "resource.demand.mark_blocked",
      "resource.demand.close",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "resource.demand",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/node-resource-demand\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("resource.demand.open")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
    expect(registry.get("resource.demand.request_file_window")?.definition.authorityClass).toBe(
      "read_only",
    );
  });

  it("registers node resource ledger tools as small payload-backed context verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.ledger.open",
      "resource.ledger.append_file_window",
      "resource.ledger.append_symbol",
      "resource.ledger.append_related_test",
      "resource.ledger.append_memory_pack",
      "resource.ledger.append_resource_ref",
      "resource.ledger.report_relevant_file",
      "resource.ledger.report_relevant_resource",
      "resource.ledger.append_source_prompt_section",
      "resource.ledger.report_owner_constraint",
      "resource.ledger.report_project_fact",
      "resource.ledger.report_research_brief",
      "resource.ledger.report_planning_capsule",
      "resource.ledger.report_planning_action_point",
      "resource.ledger.report_action_graph_candidate",
      "resource.ledger.recommend_compile_readiness",
      "resource.ledger.report_human_decision",
      "resource.ledger.report_closeout_ref",
      "resource.ledger.report_existing_pattern",
      "resource.ledger.report_risk",
      "resource.ledger.recommend_edit_point",
      "resource.ledger.recommend_validation",
      "resource.ledger.recommend_domain_validation",
      "resource.ledger.report_limitation",
      "resource.ledger.record_provider_diagnostic",
      "resource.ledger.project_manifest",
      "resource.ledger.hydrate_entry",
      "resource.ledger.close",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "resource.ledger",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/resource-ledger\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("resource.ledger.open")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
    expect(registry.get("resource.ledger.project_manifest")?.definition.authorityClass).toBe(
      "read_only",
    );
  });

  it("registers shared domain resource-selection, action-gate, and planning verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.selection.propose",
      "resource.selection.mark_blocked",
      "resource.selection.accept",
      "resource.selection.request_revision",
    ] as const) {
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "resource.selection",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }

    for (const toolId of [
      "domain.action_gate.evaluate",
      "domain.action_gate.block",
      "domain.action_gate.promote_worker_action_ready",
      "planning.intent.record",
      "planning.research.request_brief",
      "planning.capsule.draft",
      "planning.capsule.revise",
      "planning.human_decision.request",
      "planning.action_graph.propose",
      "planning.compile_readiness.evaluate",
      "planning.closeout.summarize",
    ] as const) {
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "domain.action_gate",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers canonical WorkIntent and capability manifest tools as small verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "scheduler.work_intent.propose",
      "scheduler.work_intent.accept_roots",
      "scheduler.work_intent.link_dependencies",
      "scheduler.work_intent.set_capability",
      "scheduler.work_intent.set_evidence_mode",
      "scheduler.work_intent.mark_non_runnable",
      "scheduler.work_intent.request_revision",
      "capability.lookup",
      "capability.validate_intent",
      "capability.require_resources",
      "capability.require_validation",
      "capability.require_evidence",
      "capability.list_legal_transitions",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.enabled).toBe(true);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("capability.lookup")?.definition.authorityClass).toBe("read_only");
    expect(registry.get("capability.list_legal_transitions")?.definition.authorityClass).toBe(
      "read_only",
    );
    expect(registry.get("scheduler.work_intent.propose")?.definition.schemaRef).toBe(
      "runtime-tool://scheduler/work-intent/propose/v1",
    );
    expect(registry.get("capability.require_evidence")?.definition.schemaRef).toBe(
      "runtime-tool://capability/require-evidence/v1",
    );
  });

  it("registers compound coding tools as bounded repo-write runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "coding.inspect_edit_validate",
      "coding.add_test_and_validate",
      "coding.update_docs_and_cross_refs",
      "coding.refactor_symbol_with_lsp",
      "coding.fix_type_errors",
      "coding.apply_small_patch_with_evidence",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "coding.compound",
        authorityClass: "bounded_repo_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/coding\//u);
    }
  });

  it("registers implementation context materialization tools as first-class runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "context.resolve_target_refs",
      "context.resolve_directory_seed",
      "repo.snapshot_target_files",
      "context.compile_implementation_context_packet",
      "implementation.compile_task_packet",
      "implementation.select_target_files",
      "implementation.declare_new_file_intent",
      "implementation.evaluate_readiness",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers canonical execution-packet hydration tools as small resource verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.requirement.compile",
      "resource.materialize_node_packet",
      "resource.materialize_domain_packet",
      "node.execution_packet.validate_hydration",
      "node.execution_packet.project_readiness",
      "node.execution_packet.create_partial",
      "node.execution_packet.attach_resource_demand",
      "node.execution_packet.attach_resource_ledger_manifest",
      "node.execution_packet.mark_resource_ledger_ready",
      "node.execution_packet.require_domain_resource_selection",
      "node.execution_packet.evaluate_action_gate",
      "node.execution_packet.block_action_gate",
      "node.execution_packet.promote_worker_action_ready",
      "node.execution_packet.project_progressive_readiness",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(
        /^runtime-tool:\/\/(resource|node\/execution-packet)\//u,
      );
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers artifact payload storage tools as bounded manifest and hydration operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "artifact.payload.put_json",
      "artifact.payload.put_json_parts",
      "artifact.payload.attach_manifest",
      "artifact.payload.get_json",
      "artifact.payload.hydrate_manifest",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "artifact.payload",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/artifact\/payload\//u);
    }
    expect(registry.get("artifact.payload.put_json")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
    expect(registry.get("artifact.payload.get_json")?.definition.authorityClass).toBe("read_only");
    expect(registry.get("artifact.payload.hydrate_manifest")?.definition.authorityClass).toBe(
      "read_only",
    );
  });

  it("registers action-review tools as small-verb review operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "action_review.create",
      "action_review.link_validation",
      "action_review.link_evidence",
      "action_review.record_rollback",
      "action_review.hydrate",
      "worker.edit.persist_review_artifact",
      "worker.edit.hydrate_review_artifact",
      "review.inspect_action_artifact",
      "review.record_decision",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("validation.review");
      expect(definition?.enabled).toBe(true);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(
        /^runtime-tool:\/\/(action-review|worker\/edit|review)\//u,
      );
    }
    expect(registry.get("action_review.hydrate")?.definition.authorityClass).toBe("read_only");
    expect(registry.get("review.inspect_action_artifact")?.definition.authorityClass).toBe(
      "read_only",
    );
    expect(registry.get("action_review.create")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
  });

  it("registers worker-smoke matrix tools as bounded proof verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "worker_smoke.prepare_matrix",
      "worker_smoke.hydrate_lane",
      "worker_smoke.run_lane",
      "worker_smoke.record_result",
      "worker_smoke.assert_review_artifact",
      "worker_smoke.record_blocker",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("diagnostic.bounded");
      expect(definition?.enabled).toBe(true);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/worker-smoke\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("worker_smoke.assert_review_artifact")?.definition.authorityClass).toBe(
      "read_only",
    );
    expect(registry.get("worker_smoke.record_result")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
  });

  it("registers adversarial proof-entry tools as small bounded proof verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "proof_entry.prepare_suite",
      "proof_entry.prepare_case",
      "proof_entry.inject_structural_fault",
      "proof_entry.run_preflight",
      "proof_entry.assert_safe_block",
      "proof_entry.assert_no_provider_invocation",
      "proof_entry.assert_no_executable_frontier",
      "proof_entry.assert_no_authority_widening",
      "proof_entry.assert_sibling_evidence_survived",
      "proof_entry.assert_review_artifact_hydrates",
      "proof_entry.record_case_result",
      "proof_entry.record_suite_closeout",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("diagnostic.bounded");
      expect(definition?.enabled).toBe(true);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/proof-entry\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("proof_entry.assert_safe_block")?.definition.authorityClass).toBe(
      "read_only",
    );
    expect(registry.get("proof_entry.record_suite_closeout")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
  });

  it("registers scheduler transition-readiness tools as first-class runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "scheduler.evaluate_frontier_readiness",
      "scheduler.open_executable_frontier",
      "scheduler.record_node_transition",
      "scheduler.create_prerequisite_node",
      "scheduler.link_prerequisite_to_target",
      "scheduler.block_node_for_precondition",
      "scheduler.promote_work_intent_to_executable",
      "scheduler.request_transition_repair_intent",
      "scheduler.accept_transition_repair",
      "scheduler.reject_transition_repair",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.enabled).toBe(true);
      expect(definition?.authorityClass).toBe("bounded_runtime_write");
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/scheduler\//u);
    }
  });

  it("registers readiness recompute and child epoch small verbs as resource operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "node.recompute_readiness",
      "node.compare_readiness_projection",
      "node.mark_readiness_stale",
      "node.upsert_child_for_epoch",
      "node.supersede_child_epoch",
      "frontier.evaluate_epoch_eligibility",
      "frontier.block_stale_child",
      "readback.project_readiness_drift",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers readback, provider diagnostic, heap, and manifest guard small verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    const expected = [
      {
        toolId: "readback.project_canonical_gate",
        toolFamily: "work_queue.project_event",
        authorityClass: "bounded_runtime_write",
      },
      {
        toolId: "readback.record_projection_drift",
        toolFamily: "work_queue.project_event",
        authorityClass: "bounded_runtime_write",
      },
      {
        toolId: "provider.diagnostics.capture_response_shape",
        toolFamily: "model.call",
        authorityClass: "bounded_runtime_write",
      },
      {
        toolId: "provider.diagnostics.record_preflight_block",
        toolFamily: "model.call",
        authorityClass: "bounded_runtime_write",
      },
      {
        toolId: "provider.diagnostics.record_timeout_or_empty",
        toolFamily: "model.call",
        authorityClass: "bounded_runtime_write",
      },
      {
        toolId: "heap.record_phase_snapshot",
        toolFamily: "diagnostic.bounded",
        authorityClass: "diagnostic",
      },
      {
        toolId: "artifact.manifest.assert_bounds",
        toolFamily: "artifact.payload",
        authorityClass: "bounded_runtime_write",
      },
    ] as const;

    for (const item of expected) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(item.toolId);
      expect(registry.get(item.toolId)?.definition).toMatchObject({
        toolId: item.toolId,
        toolFamily: item.toolFamily,
        authorityClass: item.authorityClass,
        enabled: true,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(registry.get(item.toolId)?.definition.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers replay boundary and proof gate tools as production-fidelity small verbs", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "replay.boundary.load_checkpoint",
      "replay.boundary.validate_fidelity",
      "replay.boundary.normalize_checkpoint",
      "replay.boundary.reject_diagnostic_only",
      "replay.boundary.resume_production_path",
      "replay.boundary.record_latest_state",
      "replay.boundary.record_blocker",
      "replay.boundary.record_success",
      "replay.proof.run_boundary_sequence",
      "replay.proof.block_full_product_spec",
      "replay.proof.admit_full_product_spec",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("node.resource_materialization");
      expect(definition?.enabled).toBe(true);
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/replay\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
    expect(registry.get("replay.boundary.load_checkpoint")?.definition.authorityClass).toBe(
      "read_only",
    );
    expect(registry.get("replay.proof.admit_full_product_spec")?.definition.authorityClass).toBe(
      "bounded_runtime_write",
    );
  });

  it("registers scheduler model-call envelope as bounded runtime observability", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    const definition = registry.get("scheduler.record_model_call_envelope")?.definition;
    expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain("scheduler.record_model_call_envelope");
    expect(definition).toMatchObject({
      toolId: "scheduler.record_model_call_envelope",
      toolFamily: "scheduler.select_next_node",
      authorityClass: "bounded_runtime_write",
      enabled: true,
      schemaRef: "runtime-tool://scheduler/record-model-call-envelope/v1",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
  });

  it("registers expansion admission as a first-class scheduler runtime operation", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain("scheduler.evaluate_expansion_admission");
    const definition = registry.get("scheduler.evaluate_expansion_admission")?.definition;
    expect(definition).toMatchObject({
      toolId: "scheduler.evaluate_expansion_admission",
      toolFamily: "scheduler.decompose_graph",
      authorityClass: "bounded_runtime_write",
      enabled: true,
      schemaRef: "runtime-tool://scheduler/evaluate-expansion-admission/v1",
    });
    expect(definition?.rawPromptStored).toBe(false);
    expect(definition?.rawResponseStored).toBe(false);
    expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
  });

  it("registers superstep frontier tools as first-class scheduler runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const [toolId, family] of [
      ["scheduler.open_superstep_frontier", "scheduler.select_next_node"],
      ["scheduler.record_superstep_branch_result", "scheduler.evaluate_node_result"],
      ["scheduler.join_superstep_frontier", "scheduler.evaluate_node_result"],
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: family,
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/scheduler\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("keeps retired first-node approval disabled instead of executable in production", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    const definition = registry.get("scheduler.approve_and_run_first_node")?.definition;
    expect(definition).toMatchObject({
      toolId: "scheduler.approve_and_run_first_node",
      enabled: false,
    });
  });

  it("registers resource scout execution packet and context repair tools", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "resource.requirement.get",
      "resource.scout.build_execution_packet",
      "resource.scout.request_repo_resource",
      "resource.scout.classify_resource_blocker",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("resource.scout");
      expect(definition?.enabled).toBe(true);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers context broker tools as first-class branch-local runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    expect(registry.get("resource_broker.resolve_inherited_resource")?.definition).toMatchObject({
      toolId: "resource_broker.resolve_inherited_resource",
      toolFamily: "node.resource_materialization",
      authorityClass: "read_only",
      enabled: true,
    });

    for (const toolId of [
      "resource_broker.submit_request",
      "resource_broker.dispatch_resource_specialist_subturn",
      "resource_broker.mark_consumer_ready",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/context-broker\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers post-resource WorkIntent lifecycle tools as small verb resource operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "scheduler.resolve_work_intent_resource_requirements",
      "scheduler.accept_resources_for_work_intent",
      "scheduler.mark_read_only_work_intent_satisfied_from_resources",
      "scheduler.promote_resource_satisfied_work_intent_to_executable",
      "scheduler.request_resource_requirement_for_work_intent",
    ] as const) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition).toMatchObject({
        toolId,
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
      });
      expect(definition?.schemaRef).toMatch(/^runtime-tool:\/\/scheduler\//u);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });
});
