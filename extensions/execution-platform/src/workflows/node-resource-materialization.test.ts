import { describe, expect, it } from "vitest";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
} from "./mission-work-packets.ts";
import {
  buildCodingResourcePacketFromImplementationTaskPacket,
  compileNodeExecutionPacketForReadOnlyResource,
  compileNodeExecutionPacketForImplementationTask,
  compileNodeResourceMaterializationToolOutput,
  evaluateNodeExecutionPacketReadiness,
  evaluateWorkerInvocationReadinessGate,
} from "./node-resource-materialization.ts";
import { registerSchedulerRuntimeTools } from "./scheduler-runtime-tools.ts";

const snapshot: ImplementationTaskFileSnapshot = {
  fileRef: "extensions/execution-platform/src/workflows/index.ts",
  snapshotRef: "repo-snapshot://workflow-index",
  contentHash: "sha256:workflow-index",
  byteCount: 512,
  sourceKind: "repo_file",
  freshnessStatus: "fresh",
  rawContentStored: false,
};

function readyImplementationTaskPacket() {
  return buildImplementationTaskPacket({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    sourceGraphNodeId: "node-1",
    microtaskId: "node-1:task-1",
    exactEditObjective: "Wire a scheduler-backed resource packet for the node.",
    taskSummary: "Use the existing workflow index snapshot and add bounded source edits.",
    targetCommitmentIds: ["commitment-1"],
    targetFileRefs: [snapshot.fileRef],
    targetFileSnapshots: [snapshot],
    allowedFileRefs: [snapshot.fileRef],
    allowedEditScope: [snapshot.fileRef],
    mustReadRefs: [snapshot.fileRef],
    likelyModifyRefs: [snapshot.fileRef],
    contextPacketRefs: ["context-handoff://node-1"],
    sourceContextHandoffRefs: ["context-handoff://node-1"],
    sourcePromptExcerptRefs: ["source-prompt://excerpt/1"],
    validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
    acceptanceCriteria: ["NodeExecutionPacket is ready before worker execution."],
    evidenceClaimExpectations: ["Source edit and validation refs close commitment-1."],
    successEvidenceDescriptions: ["Resource packet and node packet refs are recorded."],
  });
}

describe("node resource materialization", () => {
  it("compiles worker-ready coding resources into a ready NodeExecutionPacket", () => {
    const packet = readyImplementationTaskPacket();
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: packet,
    });

    expect(materialized.implementationTaskValidation.status).toBe("ready");
    expect(materialized.codingResourcePacket).toMatchObject({
      packetKind: "coding_resource_packet",
      implementationTaskPacketRef: packet.packetRef,
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshotRefs: [snapshot.snapshotRef],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(materialized.nodeExecutionPacket).toMatchObject({
      packetKind: "node_execution_packet",
      resourcePacketKind: "coding_resource_packet",
      resourcePacketRef: materialized.codingResourcePacket.packetRef,
      readinessStatus: "ready",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(materialized.readiness.valid).toBe(true);
    expect(materialized.readiness.state).toMatchObject({
      capabilityId: "implementation_microtask",
      roleClass: "implementation",
      lifecycleState: "executable",
      dependencyStatus: "accepted",
      resourceStatus: "ready",
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      domainResourcePacketRef: materialized.codingResourcePacket.packetRef,
      targetCommitmentIds: ["commitment-1"],
      validationPlanRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      blockers: [],
      nextLegalTransitions: ["execute_node"],
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
  });

  it("requires a hydrated domain resource packet before worker invocation", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-worker-gate",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const ready = evaluateWorkerInvocationReadinessGate({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-worker-gate",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(ready).toMatchObject({
      allowed: true,
      status: "ready",
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      resourcePacketRef: materialized.codingResourcePacket.packetRef,
    });
    expect(ready.reasonCodes).toContain("worker_invocation_hydrated_node_execution_packet_ready");

    const manifestOnly = evaluateWorkerInvocationReadinessGate({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: null,
      nodeExecutionPacketRequired: true,
      nodeId: "node-worker-gate",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(manifestOnly.allowed).toBe(false);
    expect(manifestOnly.reasonCodes).toContain("worker_invocation_resource_packet_parse_failed");
    expect(manifestOnly.blockingLimitations).toEqual(
      expect.arrayContaining([
        "Worker invocation requires a parseable domain resource packet body.",
      ]),
    );
  });

  it("allows hydrated read-only resource packets without source-edit expectations", () => {
    const materialized = compileNodeExecutionPacketForReadOnlyResource({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-read-only-grounding",
      nodeKind: "context_scout",
      capabilityId: "repo_context_analysis",
      executorKey: "kind:context_scout",
      workerRef: "openrouter://qwen/qwen3-coder-next",
      sourceRefs: ["docs/projects/execution-platform/specs/work-intent-control-plane-contract.md"],
      contextPacketRefs: ["commitment-work-packet://commitment-1"],
      acceptedContextHandoffRefs: ["context-handoff://node-read-only-grounding"],
      targetCommitmentIds: ["commitment-1"],
      evidenceClaimExpectations: ["Read-only grounding refs cover commitment-1."],
      authorityScope: ["read:docs/projects/execution-platform/specs/**"],
    });

    expect(materialized.readiness.valid).toBe(true);
    expect(materialized.readOnlyResourcePacket).toMatchObject({
      packetKind: "read_only_resource_packet",
      evidenceMode: ["read_only_evidence"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(materialized.readiness.state).toMatchObject({
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      readinessStatus: "ready",
      resourceStatus: "ready",
      snapshotStatus: "not_applicable",
      validationStatus: "not_applicable",
      nextAllowedTransitions: ["execute_node"],
    });

    const gate = evaluateWorkerInvocationReadinessGate({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: materialized.readOnlyResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-read-only-grounding",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(gate.allowed).toBe(true);
    expect(gate.resourcePacketKind).toBe("read_only_resource_packet");

    const missingBody = evaluateWorkerInvocationReadinessGate({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: null,
      nodeExecutionPacketRequired: true,
      nodeId: "node-read-only-grounding",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(missingBody.allowed).toBe(false);
    expect(missingBody.reasonCodes).toContain("worker_invocation_resource_packet_body_missing");
  });

  it("blocks read-only resource packets that are attached to source-edit execution", () => {
    const materialized = compileNodeExecutionPacketForReadOnlyResource({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-read-only-as-edit",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence"],
      sourceRefs: ["docs/projects/execution-platform/specs/work-intent-control-plane-contract.md"],
      targetCommitmentIds: ["commitment-1"],
      evidenceClaimExpectations: ["This should not pass as a source edit."],
      authorityScope: ["read:docs/projects/execution-platform/specs/**"],
    });

    expect(materialized.readiness.valid).toBe(false);
    expect(materialized.readiness.reasonCodes).toContain(
      "node_execution_packet_read_only_changed_file_evidence_conflict",
    );
    expect(materialized.readiness.state).toMatchObject({
      readinessStatus: "blocked",
      resourceStatus: "blocked",
    });
  });

  it("blocks worker invocation when hydrated resource packet ref mismatches the node packet", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-worker-gate-mismatch",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });
    const mismatchedResource = {
      ...materialized.codingResourcePacket,
      packetRef: "runtime-work-graph://coding-resource-packet/other",
    };

    const gate = evaluateWorkerInvocationReadinessGate({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      resourcePacket: mismatchedResource,
      nodeExecutionPacketRequired: true,
      nodeId: "node-worker-gate-mismatch",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reasonCodes).toContain("worker_invocation_resource_packet_ref_mismatch");
    expect(gate.blockingLimitations).toContain(
      "Hydrated resource packet ref does not match the NodeExecutionPacket resourcePacketRef.",
    );
  });

  it("blocks read-only evidence packets from executable implementation readiness", () => {
    const readOnlyPacket = buildImplementationTaskPacket({
      ...readyImplementationTaskPacket(),
      microtaskId: "node-read-only:task-1",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      exactEditObjective: "Inspect workflow files and produce bounded grounding notes.",
      taskSummary: "Read-only evidence collection must not dispatch to file-edit workers.",
    });
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-read-only",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readOnlyPacket,
    });

    expect(materialized.readiness.valid).toBe(false);
    expect(materialized.readiness.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_execution_packet_implementation_requires_source_edit_intent",
        "node_execution_packet_changed_file_evidence_mode_missing",
      ]),
    );
    expect(materialized.readiness.state).toMatchObject({
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      readinessStatus: "blocked",
      repairAction: "repair_evidence_expectations",
    });
  });

  it("blocks coding resources that lack snapshots or new-file intents", () => {
    const packet = buildImplementationTaskPacket({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      sourceGraphNodeId: "node-2",
      microtaskId: "node-2:task-1",
      exactEditObjective: "Edit a target file without a snapshot.",
      taskSummary: "This should be blocked before worker invocation.",
      targetCommitmentIds: ["commitment-1"],
      targetFileRefs: [snapshot.fileRef],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["context-handoff://node-2"],
      sourceContextHandoffRefs: ["context-handoff://node-2"],
      sourcePromptExcerptRefs: ["source-prompt://excerpt/1"],
      validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      acceptanceCriteria: ["Runtime blocks missing target snapshot."],
      evidenceClaimExpectations: ["No worker call happens without materialized resources."],
    });
    const resource = buildCodingResourcePacketFromImplementationTaskPacket(packet);
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-2",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: packet,
    });
    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: resource,
    });

    expect(materialized.implementationTaskValidation.status).toBe("needs_context");
    expect(readiness.valid).toBe(false);
    expect(readiness.reasonCodes).toContain(
      "node_execution_packet_coding_snapshots_or_new_file_intents_missing",
    );
    expect(readiness.state).toMatchObject({
      artifactKind: "node_readiness_state",
      readinessStatus: "blocked",
      phase: "resource_materialization",
      lifecycleState: "resources_required",
      resourceStatus: "missing",
      snapshotStatus: "missing",
      repairAction: "compile_resource_packet",
      blockers: expect.arrayContaining([
        "ImplementationTaskPacket is not worker-ready: implementation_task_packet_target_snapshots_or_new_file_intent_missing",
        "Coding resource packet has neither target snapshots nor new-file intents.",
      ]),
      rawPromptStored: false,
    });
  });

  it("does not treat generic context packet refs as accepted execution handoffs", () => {
    const packet = buildImplementationTaskPacket({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      sourceGraphNodeId: "node-generic-context",
      microtaskId: "node-generic-context:task-1",
      exactEditObjective: "Edit with a commitment packet but no accepted context handoff.",
      taskSummary: "Commitment packet refs are not context handoff refs.",
      targetCommitmentIds: ["commitment-1"],
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshots: [snapshot],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      likelyModifyRefs: [snapshot.fileRef],
      contextPacketRefs: ["commitment-work-packet://commitment-1"],
      validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      acceptanceCriteria: ["Runtime blocks implementation without accepted context handoff."],
      evidenceClaimExpectations: ["No worker call happens from commitment refs alone."],
    });
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-generic-context",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: packet,
    });

    expect(materialized.readiness.valid).toBe(false);
    expect(materialized.readiness.reasonCodes).toContain(
      "node_readiness_context_packet_refs_not_accepted_handoffs",
    );
    expect(materialized.readiness.state).toMatchObject({
      contextStatus: "missing",
      readinessStatus: "blocked",
      repairAction: "request_context_repair",
    });
  });

  it("does not let fresh or accepted context imply implementation readiness", () => {
    const packet = buildImplementationTaskPacket({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      sourceGraphNodeId: "node-fresh-context",
      microtaskId: "node-fresh-context:task-1",
      exactEditObjective: "Use fresh context but no snapshots.",
      taskSummary: "Fresh context must still block if target snapshots are missing.",
      targetCommitmentIds: ["commitment-1"],
      targetFileRefs: [snapshot.fileRef],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["context-handoff://node-fresh-context"],
      sourceContextHandoffRefs: ["context-handoff://node-fresh-context"],
      sourcePromptExcerptRefs: ["source-prompt://excerpt/1"],
      validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      acceptanceCriteria: ["Runtime blocks contradictory readiness."],
      evidenceClaimExpectations: ["No implementation runs from fresh context alone."],
    });
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-fresh-context",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: packet,
    });

    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        contextFreshnessStatus: "fresh",
        readinessStatus: "ready_as_single_task",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    expect(readiness.valid).toBe(false);
    expect(readiness.state).toMatchObject({
      freshnessStatus: "fresh",
      snapshotStatus: "missing",
      contextStatus: "accepted",
      readinessStatus: "blocked",
    });
    expect(readiness.reasonCodes).toContain("node_readiness_context_fresh_but_snapshot_missing");
  });

  it("blocks worker execution when upstream implementation context still requires split tasks", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-split-required",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        readinessStatus: "split_required",
        repairAction: "split_into_file_resolved_tasks",
        contextFreshnessStatus: "fresh",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    expect(readiness.valid).toBe(false);
    expect(readiness.reasonCodes).toContain("node_readiness_implementation_context_split_required");
    expect(readiness.state).toMatchObject({
      readinessStatus: "blocked",
      lifecycleState: "resources_required",
      repairAction: "split_work_unit",
      nextAllowedTransitions: ["split_work_unit", "needs_review"],
    });
  });

  it("blocks worker execution when implementation context explicitly blocks implementation", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-context-refresh-blocked:task:1",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        readinessStatus: "ready_as_single_task",
        contextFreshnessStatus: "missing",
        contextRefreshAction: "block_implementation",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    expect(readiness.valid).toBe(false);
    expect(readiness.reasonCodes).toContain(
      "node_readiness_implementation_context_blocks_implementation",
    );
    expect(readiness.state).toMatchObject({
      readinessStatus: "blocked",
      repairAction: "request_context_repair",
      lifecycleState: "needs_repair",
    });
  });

  it("allows a materialized split child task when the parent implementation context required splitting", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-split-required:task:1",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        readinessStatus: "split_required",
        repairAction: "split_into_file_resolved_tasks",
        contextFreshnessStatus: "fresh",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    expect(readiness.valid).toBe(true);
    expect(readiness.reasonCodes).toContain(
      "node_readiness_split_required_parent_satisfied_by_child_task",
    );
    expect(readiness.reasonCodes).not.toContain(
      "node_readiness_implementation_context_split_required",
    );
    expect(readiness.state).toMatchObject({
      readinessStatus: "ready_with_limitations",
      lifecycleState: "executable",
      contextStatus: "accepted_with_limitations",
      repairAction: "none",
      nextAllowedTransitions: ["execute_node"],
    });
  });

  it("requires consumer-specific waivers before accepted-with-limitations context can execute", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-limited-context",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const blocked = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        contextFreshnessStatus: "fresh",
        readinessStatus: "ready_with_limitations",
        contextLimitations: [{ limitation: "Missing API ownership decision.", blocking: true }],
      },
    });
    expect(blocked.valid).toBe(false);
    expect(blocked.state).toMatchObject({
      contextStatus: "blocked",
      readinessStatus: "blocked",
      repairAction: "request_context_repair",
    });

    const unwaivedNonblocking = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        sourceWorkUnitId: "node-1:task-1",
        contextFreshnessStatus: "fresh",
        readinessStatus: "ready_with_limitations",
        contextLimitations: [{ limitation: "Docs path may need follow-up.", blocking: false }],
      },
    });
    expect(unwaivedNonblocking.valid).toBe(false);
    expect(unwaivedNonblocking.reasonCodes).toContain(
      "node_readiness_context_limitation_waiver_missing",
    );
    expect(unwaivedNonblocking.state).toMatchObject({
      contextStatus: "blocked",
      readinessStatus: "blocked",
      repairAction: "request_context_repair",
    });

    const wrongConsumerWaiver = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        sourceWorkUnitId: "node-1:task-1",
        contextFreshnessStatus: "fresh",
        readinessStatus: "ready_with_limitations",
        contextLimitations: [{ limitation: "Docs path may need follow-up.", blocking: false }],
        contextLimitationWaivers: [
          {
            consumerNodeId: "other-node",
            workUnitId: "node-1:task-1",
            limitation: "Docs path may need follow-up.",
            evidenceRefs: ["context-waiver://other-node/docs-follow-up"],
          },
        ],
      },
    });
    expect(wrongConsumerWaiver.valid).toBe(false);

    const nonblocking = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        sourceWorkUnitId: "node-1:task-1",
        contextFreshnessStatus: "fresh",
        readinessStatus: "ready_with_limitations",
        contextLimitations: [{ limitation: "Docs path may need follow-up.", blocking: false }],
        contextLimitationWaivers: [
          {
            consumerNodeId: "node-limited-context",
            workUnitId: "node-1:task-1",
            limitation: "Docs path may need follow-up.",
            evidenceRefs: ["context-waiver://node-limited-context/docs-follow-up"],
          },
        ],
      },
    });
    expect(nonblocking.valid).toBe(true);
    expect(nonblocking.state).toMatchObject({
      contextStatus: "accepted_with_limitations",
      readinessStatus: "ready_with_limitations",
      nextAllowedTransitions: ["execute_node"],
    });
    expect(nonblocking.state.contextLimitationWaiverRefs).toEqual([
      "context-waiver://node-limited-context/docs-follow-up",
    ]);
  });

  it("blocks snapshots that lack validation refs or a validation discovery plan", () => {
    const packet = buildImplementationTaskPacket({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      sourceGraphNodeId: "node-no-validation",
      microtaskId: "node-no-validation:task-1",
      exactEditObjective: "Edit with snapshots but no validation plan.",
      taskSummary: "Snapshots alone cannot imply validation readiness.",
      targetCommitmentIds: ["commitment-1"],
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshots: [snapshot],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["context-handoff://node-no-validation"],
      sourceContextHandoffRefs: ["context-handoff://node-no-validation"],
      sourcePromptExcerptRefs: ["source-prompt://excerpt/1"],
      acceptanceCriteria: ["Runtime blocks missing validation plan."],
      evidenceClaimExpectations: ["Validation plan is mandatory before worker execution."],
    });
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-no-validation",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: packet,
    });

    expect(materialized.readiness.valid).toBe(false);
    expect(materialized.readiness.state).toMatchObject({
      snapshotStatus: "ready",
      validationStatus: "missing",
      repairAction: "compile_validation_plan",
    });
    expect(materialized.readiness.reasonCodes).toContain(
      "node_readiness_snapshots_without_validation_plan",
    );
  });

  it("registers node resource materialization runtime tools as first-class scheduler tools", () => {
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });

    expect(registry.require("node.compile_execution_packet").definition).toMatchObject({
      toolFamily: "node.resource_materialization",
      authorityClass: "bounded_runtime_write",
      enabled: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(registry.require("node.promote_ready_packet").definition).toMatchObject({
      toolFamily: "node.resource_materialization",
    });
  });

  it("evaluates readiness through bounded runtime tool output without raw storage", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });
    const result = compileNodeResourceMaterializationToolOutput({
      toolId: "node.evaluate_readiness",
      volatileInput: {
        nodeExecutionPacket: materialized.nodeExecutionPacket,
        resourcePacket: materialized.codingResourcePacket,
      },
      metadata: null,
    });

    expect(result.status).toBe("succeeded");
    expect(result.reasonCodes).toContain("node_evaluate_readiness_recorded");
    expect(result.metadata).toMatchObject({
      nodeReadinessState: {
        artifactKind: "node_readiness_state",
        readinessStatus: "ready",
        nextAllowedTransitions: ["execute_node"],
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });
});
