import { describe, expect, it } from "vitest";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import {
  SCHEDULER_RUNTIME_TOOL_IDS,
  registerSchedulerRuntimeTools,
} from "./scheduler-runtime-tools.ts";

describe("scheduler runtime tools", () => {
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
      "repo.snapshot_target_files",
      "context.compile_implementation_context_packet",
      "implementation.compile_task_packet",
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

  it("registers context scout execution packet and context repair tools", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    for (const toolId of [
      "context_scout.build_execution_packet",
      "context_scout.request_repo_context",
      "context_scout.classify_context_blocker",
    ]) {
      expect(SCHEDULER_RUNTIME_TOOL_IDS).toContain(toolId);
      const definition = registry.get(toolId)?.definition;
      expect(definition?.toolId).toBe(toolId);
      expect(definition?.toolFamily).toBe("context_scout.tool_loop");
      expect(definition?.enabled).toBe(true);
      expect(definition?.rawPromptStored).toBe(false);
      expect(definition?.rawResponseStored).toBe(false);
      expect(definition?.storagePolicy.rawToolLogStored).toBe(false);
    }
  });

  it("registers context broker tools as first-class branch-local runtime operations", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    expect(registry.get("context_broker.resolve_inherited_context")?.definition).toMatchObject({
      toolId: "context_broker.resolve_inherited_context",
      toolFamily: "node.resource_materialization",
      authorityClass: "read_only",
      enabled: true,
    });

    for (const toolId of [
      "context_broker.submit_request",
      "context_broker.dispatch_context_scout",
      "context_broker.mark_consumer_ready",
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
});
