import { describe, expect, it } from "vitest";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
} from "./worker-execution-packets.ts";
import {
  buildCodingResourcePacketFromImplementationTaskPacket,
  buildContractOverridePacket,
  buildNodeExecutionContractManifest,
  buildNodeExecutionContract,
  buildNodeExecutionPacket,
  compileNodeExecutionPacketForGenericDomainResource,
  compileNodeExecutionPacketForReadOnlyResource,
  compileNodeExecutionPacketForImplementationTask,
  compileNodeResourceMaterializationToolOutput,
  evaluateNodeExecutionPacketReadiness,
  validateWorkerInvocationPacketHydration,
  inheritNodeExecutionContractForSplitChild,
  projectProgressiveNodeExecutionPacketReadiness,
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
const domainResourceSelectionRef = "domain-resource-selection://workflow-index/model-authored";
const fileWindowRef =
  "file-window://extensions/execution-platform/src/workflows/index.ts#L1-L80";

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
    domainResourceSelectionRefs: [domainResourceSelectionRef],
    targetFileRefs: [snapshot.fileRef],
    targetFileSnapshots: [snapshot],
    allowedFileRefs: [snapshot.fileRef],
    allowedEditScope: [snapshot.fileRef],
    mustReadRefs: [snapshot.fileRef],
    likelyModifyRefs: [snapshot.fileRef],
    contextPacketRefs: [fileWindowRef],
    sourceResourceHandoffRefs: [fileWindowRef],
    sourcePromptExcerptRefs: ["source-prompt://excerpt/1"],
    validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
    acceptanceCriteria: ["NodeExecutionPacket is ready before worker execution."],
    evidenceClaimExpectations: ["Source edit and validation refs close commitment-1."],
    successEvidenceDescriptions: ["Resource packet and node packet refs are recorded."],
  });
}

function partialCodingResourcePacket(overrides: Record<string, unknown> = {}) {
  const base = {
    packetKind: "coding_resource_packet",
    schemaVersion: "execution-platform.coding-resource-packet.v1",
    packetId: "partial-coding-resource",
    packetRef: "runtime-work-graph://coding-resource-packet/partial",
    implementationTaskPacketRef: "runtime-work-graph://implementation-task/partial",
    executionIntent: "source_edit",
    evidenceMode: ["changed_file_evidence", "validation_evidence"],
    targetFileRefs: [],
    domainResourceSelectionRefs: [],
    targetFileSnapshotRefs: [],
    targetFileSnapshotHashes: [],
    allowedEditScope: [snapshot.fileRef],
    mustReadRefs: [snapshot.fileRef],
    likelyModifyRefs: [snapshot.fileRef],
    deniedFileRefs: [],
    newFileIntentRefs: [],
    fileChangeIntentRefs: [],
    contextPacketRefs: [],
    acceptedResourceHandoffRefs: [],
    validationRefs: [],
    validationDiscoveryPlan: [],
    acceptanceCriteria: ["Make a bounded source edit and validate it."],
    expectedPatchShape: "Small replace_range or replace_text patch.",
    stopIfMissingOrEscalate: ["Stop if target snapshots are missing."],
    targetCommitmentIds: ["commitment-1"],
    readableTargetSnapshotCount: 0,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
  return { ...base, ...overrides };
}

function partialExecutionContract() {
  return buildNodeExecutionContract({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    nodeId: "node-progressive",
    nodeKind: "implementation",
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    workerRef: "openrouter://moonshotai/kimi-k2.6",
    roleClass: "implementation",
    executionIntent: "source_edit",
    evidenceMode: ["changed_file_evidence", "validation_evidence"],
    sourceCommitmentIds: ["commitment-1"],
    expectedEvidenceClaimKinds: ["changed_file_evidence", "validation_evidence"],
    evidenceClaimExpectations: ["Changed file and validation evidence close commitment-1."],
    resourceRequirementRefs: ["runtime-work-graph://coding-resource-packet/partial"],
    targetResourceSubsetRefs: [],
    domainResourcePacketKind: "coding_resource_packet",
    domainResourcePacketRef: "runtime-work-graph://coding-resource-packet/partial",
    validationRefs: [],
    authorityScope: [snapshot.fileRef],
    allowedPathRefs: [snapshot.fileRef],
    deniedPathRefs: [],
    toolFamilyRefs: ["repo.read", "worker.edit", "checks.run", "worker.evidence"],
    stopConditions: ["Stop if target snapshots are missing."],
  });
}

function partialExecutionPacket(overrides: Partial<Parameters<typeof buildNodeExecutionPacket>[0]> = {}) {
  const nodeExecutionContract = partialExecutionContract();
  return buildNodeExecutionPacket({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    nodeId: "node-progressive",
    nodeKind: "implementation",
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    workerRef: "openrouter://moonshotai/kimi-k2.6",
    executionIntent: "source_edit",
    evidenceMode: ["changed_file_evidence", "validation_evidence"],
    targetCommitmentIds: ["commitment-1"],
    sourcePacketRefs: ["source-contract://commitment-1"],
    sourceContextRefs: [],
    nodeExecutionContract,
    resourcePacketKind: "coding_resource_packet",
    resourcePacketRef: "runtime-work-graph://coding-resource-packet/partial",
    validationRefs: [],
    evidenceClaimExpectations: ["Changed file and validation evidence close commitment-1."],
    authorityScope: [snapshot.fileRef],
    allowedPathRefs: [snapshot.fileRef],
    deniedPathRefs: [],
    resourcePacket: partialCodingResourcePacket(),
    ...overrides,
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
    expect(materialized.nodeExecutionContract).toMatchObject({
      contractKind: "node_execution_contract",
      executionIntent: "source_edit",
      capabilityId: "implementation_microtask",
      domainResourcePacketKind: "coding_resource_packet",
      domainResourcePacketRef: materialized.codingResourcePacket.packetRef,
      nodeExecutionPacketRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(buildNodeExecutionContractManifest(materialized.nodeExecutionContract)).toMatchObject({
      contractRef: materialized.nodeExecutionContract.contractRef,
      contractVersion: "execution-platform.node-execution-contract.v1",
      executionIntent: "source_edit",
      capabilityId: "implementation_microtask",
      domainResourcePacketKind: "coding_resource_packet",
    });
    expect(materialized.nodeExecutionPacket).toMatchObject({
      packetKind: "node_execution_packet",
      nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
      nodeExecutionContractVersion: "execution-platform.node-execution-contract.v1",
      nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
      resourcePacketKind: "coding_resource_packet",
      resourcePacketRef: materialized.codingResourcePacket.packetRef,
      targetSnapshotRefs: [snapshot.snapshotRef],
      validationManifestRefs: ["pnpm test:file node-resource-materialization.test.ts"],
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
      nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
      nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      nodeExecutionPacketHash: expect.any(String),
      domainResourcePacketRef: materialized.codingResourcePacket.packetRef,
      domainResourcePacketHash: expect.any(String),
      staleIfMismatch: true,
      projectionStatus: "unknown",
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

    const ready = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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

    const manifestOnly = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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

    const missingContract = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: null,
      resourcePacket: materialized.codingResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-worker-gate",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(missingContract.allowed).toBe(false);
    expect(missingContract.reasonCodes).toContain("node_execution_contract_body_missing");
    expect(missingContract.blockingLimitations).toEqual(
      expect.arrayContaining([
        "Worker execution requires a hydrated NodeExecutionContract body, not only graph metadata or manifest refs.",
      ]),
    );
  });

  it("allows hydrated read-only resource packets without source-edit expectations", () => {
    const materialized = compileNodeExecutionPacketForReadOnlyResource({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-read-only-grounding",
      nodeKind: "orchestrator_plan",
      capabilityId: "repo_context_analysis",
      executorKey: "role:orchestrator",
      workerRef: "openrouter://qwen/qwen3-coder-next",
      sourceRefs: ["docs/projects/execution-platform/specs/work-intent-control-plane-contract.md"],
      contextPacketRefs: ["source-contract://commitment-1"],
      acceptedResourceHandoffRefs: ["resource-handoff://node-read-only-grounding"],
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

    const gate = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
      resourcePacket: materialized.readOnlyResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-read-only-grounding",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });
    expect(gate.allowed).toBe(true);
    expect(gate.resourcePacketKind).toBe("read_only_resource_packet");

    const missingBody = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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

  it("hydrates a neutral non-coding domain resource packet without coding semantics", () => {
    const materialized = compileNodeExecutionPacketForGenericDomainResource({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.research",
      graphId: "graph-1",
      nodeId: "node-generic-domain",
      nodeKind: "domain_action",
      capabilityId: "domain_record_analysis",
      executorKey: "kind:domain_action",
      workerRef: "openrouter://qwen/qwen3-coder-next",
      domainKind: "crm_record",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      resourceRefs: ["crm-record://account/123"],
      boundedSnapshotRefs: ["crm-snapshot://account/123/v1"],
      acceptedResourceHandoffRefs: ["resource-handoff://node-generic-domain"],
      targetCommitmentIds: ["commitment-generic"],
      evidenceClaimExpectations: ["CRM record grounding covers commitment-generic."],
      authorityScope: ["read:crm-record://account/123"],
      allowedOperationRefs: ["domain.read", "artifact.create"],
    });

    expect(materialized.genericDomainResourcePacket).toMatchObject({
      packetKind: "generic_domain_resource_packet",
      domainKind: "crm_record",
      resourceRefs: ["crm-record://account/123"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(materialized.nodeExecutionContract).toMatchObject({
      domainResourcePacketKind: "generic_domain_resource_packet",
      domainResourcePacketRef: materialized.genericDomainResourcePacket.packetRef,
      executionIntent: "source_grounding",
      capabilityId: "domain_record_analysis",
    });
    expect(materialized.readiness).toMatchObject({
      valid: true,
      status: "ready",
    });

    const gate = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
      resourcePacket: materialized.genericDomainResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-generic-domain",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.research",
    });
    expect(gate.allowed).toBe(true);
    expect(gate.resourcePacketKind).toBe("generic_domain_resource_packet");
  });

  it("blocks generic domain resource packets that smuggle changed-file evidence", () => {
    const materialized = compileNodeExecutionPacketForGenericDomainResource({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.research",
      graphId: "graph-1",
      nodeId: "node-generic-domain-file-evidence",
      nodeKind: "domain_action",
      capabilityId: "domain_record_analysis",
      executorKey: "kind:domain_action",
      workerRef: "openrouter://qwen/qwen3-coder-next",
      domainKind: "crm_record",
      executionIntent: "source_grounding",
      evidenceMode: ["changed_file_evidence"],
      resourceRefs: ["crm-record://account/123"],
      acceptedResourceHandoffRefs: ["resource-handoff://node-generic-domain-file-evidence"],
      targetCommitmentIds: ["commitment-generic"],
      evidenceClaimExpectations: ["This generic domain packet must not claim file edits."],
      authorityScope: ["read:crm-record://account/123"],
      allowedOperationRefs: ["domain.read"],
    });

    expect(materialized.readiness.valid).toBe(false);
    expect(materialized.readiness.reasonCodes).toContain(
      "node_execution_packet_generic_changed_file_evidence_conflict",
    );
    expect(materialized.readiness.state).toMatchObject({
      readinessStatus: "blocked",
      resourceStatus: "blocked",
      repairAction: "repair_evidence_expectations",
    });
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

    const gate = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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

  it("blocks worker invocation when hydrated contract semantics mismatch the node packet", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-worker-contract-mismatch",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });

    const gate = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: {
        ...materialized.nodeExecutionPacket,
        capabilityId: "implementation_macro_task",
      },
      nodeExecutionContract: materialized.nodeExecutionContract,
      resourcePacket: materialized.codingResourcePacket,
      nodeExecutionPacketRequired: true,
      nodeId: "node-worker-contract-mismatch",
      runtimeJobId: "runtime-1",
      graphId: "graph-1",
      workflowId: "agent_team.coding",
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reasonCodes).toContain("node_execution_contract_capability_mismatch");
    expect(gate.blockingLimitations).toContain(
      "Hydrated NodeExecutionContract capability does not match the NodeExecutionPacket capability.",
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
      domainResourceSelectionRefs: [domainResourceSelectionRef],
      targetFileRefs: [snapshot.fileRef],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["resource-handoff://node-2"],
      sourceResourceHandoffRefs: ["resource-handoff://node-2"],
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      phase: "resource_window_required",
      progressiveState: "resource_window_required",
      actionGateStatus: "blocked",
      lifecycleState: "resource_required",
      resourceStatus: "missing",
      snapshotStatus: "missing",
      repairAction: "open_node_resource_demand",
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
      domainResourceSelectionRefs: [domainResourceSelectionRef],
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshots: [snapshot],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      likelyModifyRefs: [snapshot.fileRef],
      contextPacketRefs: ["source-contract://commitment-1"],
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
      repairAction: "open_node_resource_demand",
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
      domainResourceSelectionRefs: [domainResourceSelectionRef],
      targetFileRefs: [snapshot.fileRef],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["resource-handoff://node-fresh-context"],
      sourceResourceHandoffRefs: ["resource-handoff://node-fresh-context"],
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      contextStatus: "missing",
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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

  it("treats implementation context refresh as worker-owned context request, not a pre-worker block", () => {
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
      nodeExecutionContract: materialized.nodeExecutionContract,
      resourcePacket: materialized.codingResourcePacket,
      implementationContextPacket: {
        readinessStatus: "ready_as_single_task",
        contextFreshnessStatus: "missing",
        contextRefreshAction: "request_worker_context",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    expect(readiness.valid).toBe(true);
    expect(readiness.reasonCodes).toContain(
      "node_readiness_implementation_context_requests_worker_context",
    );
    expect(readiness.state).toMatchObject({
      readinessStatus: "ready_with_limitations",
      lifecycleState: "executable",
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      repairAction: "open_node_resource_demand",
    });

    const unwaivedNonblocking = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      repairAction: "open_node_resource_demand",
    });

    const wrongConsumerWaiver = evaluateNodeExecutionPacketReadiness({
      packet: materialized.nodeExecutionPacket,
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      nodeExecutionContract: materialized.nodeExecutionContract,
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
      domainResourceSelectionRefs: [domainResourceSelectionRef],
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshots: [snapshot],
      allowedFileRefs: [snapshot.fileRef],
      allowedEditScope: [snapshot.fileRef],
      mustReadRefs: [snapshot.fileRef],
      contextPacketRefs: ["resource-handoff://node-no-validation"],
      sourceResourceHandoffRefs: ["resource-handoff://node-no-validation"],
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
      repairAction: "open_node_resource_demand",
    });
    expect(materialized.readiness.reasonCodes).toContain(
      "node_readiness_snapshots_without_validation_plan",
    );
  });

  it("inherits split-child execution contracts without dropping executable semantics", () => {
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-parent",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket: readyImplementationTaskPacket(),
    });
    const override = buildContractOverridePacket({
      parentContractRef: materialized.nodeExecutionContract.contractRef,
      childNodeId: "node-parent:task:1",
      branchId: "branch-node-parent-task-1",
      childTaskId: "node-parent:task-1",
      targetResourceSubsetRefs: [snapshot.fileRef],
      childResourceRequirementRefs: ["resource-handoff://node-parent/task-1", snapshot.snapshotRef],
      childValidationRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      childStopConditions: ["Stop if the bounded snapshot is stale."],
    });

    const child = inheritNodeExecutionContractForSplitChild({
      parentContract: materialized.nodeExecutionContract,
      override,
    });

    expect(child).toMatchObject({
      parentContractRef: materialized.nodeExecutionContract.contractRef,
      childOverrideRef: override.overrideRef,
      nodeId: "node-parent:task:1",
      branchId: "branch-node-parent-task-1",
      executionIntent: materialized.nodeExecutionContract.executionIntent,
      capabilityId: materialized.nodeExecutionContract.capabilityId,
      executorKey: materialized.nodeExecutionContract.executorKey,
      workerRef: materialized.nodeExecutionContract.workerRef,
      evidenceMode: materialized.nodeExecutionContract.evidenceMode,
      domainResourcePacketKind: materialized.nodeExecutionContract.domainResourcePacketKind,
      nodeExecutionPacketRequired: true,
    });
    expect(child.sourceCommitmentIds).toEqual(
      materialized.nodeExecutionContract.sourceCommitmentIds,
    );
    expect(child.resourceRequirementRefs).toEqual(
      expect.arrayContaining([
        ...materialized.nodeExecutionContract.resourceRequirementRefs,
        "resource-handoff://node-parent/task-1",
      ]),
    );
    expect(child.resourceRequirementRefs).toEqual(
      expect.arrayContaining([
        ...materialized.nodeExecutionContract.resourceRequirementRefs,
        snapshot.snapshotRef,
      ]),
    );
    expect(child.targetResourceSubsetRefs).toEqual([snapshot.fileRef]);
    expect(() =>
      inheritNodeExecutionContractForSplitChild({
        parentContract: materialized.nodeExecutionContract,
        override: { ...override, parentContractRef: "runtime-work-graph://wrong-parent" },
      }),
    ).toThrow(/parentContractRef/u);
  });

  it("projects progressive packet states before worker edit readiness", () => {
    const partial = partialExecutionPacket({
      progressiveState: "partial_context_allowed",
      nodeResourceDemandSessionRefs: [],
      nodeResourceLedgerManifestRefs: [],
      resourcePacket: partialCodingResourcePacket(),
    });
    const partialProjection = projectProgressiveNodeExecutionPacketReadiness({
      packet: partial,
      resourcePacket: partialCodingResourcePacket(),
    });

    expect(partialProjection).toMatchObject({
      progressiveState: "resource_window_required",
      actionGateStatus: "blocked",
      actionGateMissingFields: expect.arrayContaining([
        "resourceWindowRefs",
        "domainResourceSelectionRefs",
        "targetSnapshotRefs",
        "validationRefs",
      ]),
    });
    expect(partialProjection.allowedWorkerToolIds).toContain("worker.context.request_more");
    expect(partialProjection.deniedWorkerToolIds).toContain("worker.edit.apply_patch");

    const demandOpen = partialExecutionPacket({
      progressiveState: "resource_demand_open",
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      nodeResourceLedgerManifestRefs: [],
      resourcePacket: partialCodingResourcePacket(),
    });
    expect(
      projectProgressiveNodeExecutionPacketReadiness({
        packet: demandOpen,
        resourcePacket: partialCodingResourcePacket(),
      }).progressiveState,
    ).toBe("resource_demand_open");

    const targetRequired = partialExecutionPacket({
      progressiveState: "resource_ledger_ready",
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      nodeResourceLedgerManifestRefs: ["node-resource-ledger://runtime-1/node-progressive"],
      resourcePacket: partialCodingResourcePacket({
        acceptedResourceHandoffRefs: ["node-resource-demand://runtime-1/node-progressive/fulfillment-1"],
      }),
    });
    expect(
      projectProgressiveNodeExecutionPacketReadiness({
        packet: targetRequired,
        resourcePacket: partialCodingResourcePacket({
          acceptedResourceHandoffRefs: ["node-resource-demand://runtime-1/node-progressive/fulfillment-1"],
        }),
      }).progressiveState,
    ).toBe("domain_resource_selection_required");
  });

  it("keeps write tools blocked until target selection, snapshots, validation, authority, and evidence are hydrated", () => {
    const resourceWithTargetOnly = partialCodingResourcePacket({
      targetFileRefs: [snapshot.fileRef],
      fileChangeIntentRefs: [`file-change-intent://${snapshot.fileRef}`],
      acceptedResourceHandoffRefs: ["node-resource-demand://runtime-1/node-progressive/fulfillment-1"],
    });
    const packetWithTargetOnly = partialExecutionPacket({
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      nodeResourceLedgerManifestRefs: ["node-resource-ledger://runtime-1/node-progressive"],
      domainResourceSelectionRefs: [`domain-resource-selection://${snapshot.fileRef}`],
      resourcePacket: resourceWithTargetOnly,
    });
    const blocked = projectProgressiveNodeExecutionPacketReadiness({
      packet: packetWithTargetOnly,
      resourcePacket: resourceWithTargetOnly,
    });
    expect(blocked.progressiveState).toBe("domain_action_gate_blocked");
    expect(blocked.actionGateMissingFields).toEqual(
      expect.arrayContaining(["targetSnapshotRefs", "validationRefs"]),
    );

    const hydratedResource = partialCodingResourcePacket({
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshotRefs: [snapshot.snapshotRef],
      targetFileSnapshotHashes: [snapshot.contentHash],
      fileChangeIntentRefs: [`file-change-intent://${snapshot.fileRef}`],
      acceptedResourceHandoffRefs: ["node-resource-demand://runtime-1/node-progressive/fulfillment-1"],
      validationRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      readableTargetSnapshotCount: 1,
    });
    const hydratedPacket = partialExecutionPacket({
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      nodeResourceLedgerManifestRefs: ["node-resource-ledger://runtime-1/node-progressive"],
      domainResourceSelectionRefs: [`domain-resource-selection://${snapshot.fileRef}`],
      targetSnapshotRefs: [snapshot.snapshotRef],
      validationRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      resourcePacket: hydratedResource,
    });
    const ready = projectProgressiveNodeExecutionPacketReadiness({
      packet: hydratedPacket,
      resourcePacket: hydratedResource,
    });
    expect(ready).toMatchObject({
      progressiveState: "worker_action_ready",
      actionGateStatus: "ready",
      actionGateMissingFields: [],
    });
    expect(ready.allowedWorkerToolIds).toContain("worker.edit.apply_patch");
  });

  it("allows partial context invocation while denying source-edit invocation through the write gate", () => {
    const packet = partialExecutionPacket({
      progressiveState: "resource_demand_open",
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      resourcePacket: partialCodingResourcePacket(),
    });
    const contract = partialExecutionContract();
    const gate = validateWorkerInvocationPacketHydration({
      nodeExecutionPacket: packet,
      nodeExecutionContract: contract,
      resourcePacket: partialCodingResourcePacket(),
      nodeExecutionPacketRequired: true,
      allowPartialContextInvocation: true,
      nodeId: packet.nodeId,
      runtimeJobId: packet.runtimeJobId,
      graphId: packet.graphId,
      workflowId: packet.workflowId,
    });

    expect(gate.allowed).toBe(true);
    expect(gate.invocationMode).toBe("partial_context");
    expect(gate.allowedWorkerToolIds).toContain("worker.context.request_more");
    expect(gate.deniedWorkerToolIds).toContain("worker.edit.apply_patch");
    expect(gate.reasonCodes).toContain("worker_invocation_partial_context_packet_allowed");
  });

  it("registers canonical node resource materialization runtime tools as first-class scheduler tools", () => {
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
    ]) {
      expect(registry.require(toolId).definition).toMatchObject({
        toolFamily: "node.resource_materialization",
        authorityClass: "bounded_runtime_write",
        enabled: true,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(registry.require(toolId).definition.storagePolicy.rawToolLogStored).toBe(false);
    }
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
        nodeExecutionContract: materialized.nodeExecutionContract,
        nodeExecutionPacket: materialized.nodeExecutionPacket,
        resourcePacket: materialized.codingResourcePacket,
      },
      metadata: null,
    });

    expect(result.status).toBe("succeeded");
    expect(result.reasonCodes).toContain("node_evaluate_readiness_recorded");
    expect(result.metadata).toMatchObject({
      nodeExecutionContract: {
        contractRef: materialized.nodeExecutionContract.contractRef,
      },
      nodeReadinessState: {
        stateRef: materialized.readiness.state.stateRef,
        readinessStatus: "ready",
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });


  it("compiles progressive execution-packet transition tools into bounded manifests", () => {
    const resource = partialCodingResourcePacket();
    const packet = partialExecutionPacket({
      progressiveState: "partial_context_allowed",
      resourcePacket: resource,
    });

    const demand = compileNodeResourceMaterializationToolOutput({
      toolId: "node.execution_packet.attach_resource_demand",
      volatileInput: {
        nodeExecutionPacket: packet,
        resourcePacket: resource,
        nodeResourceDemandSessionRef: "node-resource-demand://runtime-1/node-progressive/session-1",
      },
      metadata: null,
    });

    expect(demand.status).toBe("succeeded");
    expect(demand.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_execution_packet_attach_resource_demand_recorded",
        "node_execution_packet_progressive_state:resource_demand_open",
      ]),
    );
    expect(demand.metadata).toMatchObject({
      transitionToolId: "node.execution_packet.attach_resource_demand",
      projectedPacket: {
        nodeResourceDemandSessionRefCount: 1,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      progressiveReadiness: {
        progressiveState: "resource_demand_open",
        actionGateStatus: "blocked",
      },
      metadataWithinProgressiveLimit: true,
    });
    expect(JSON.stringify(demand.metadata).length).toBeLessThan(24 * 1024);

    const ledger = compileNodeResourceMaterializationToolOutput({
      toolId: "node.execution_packet.attach_resource_ledger_manifest",
      volatileInput: {
        nodeExecutionPacket: packet,
        resourcePacket: resource,
        nodeResourceDemandSessionRef: "node-resource-demand://runtime-1/node-progressive/session-1",
        nodeResourceLedgerManifest: {
          ledgerRef: "node-resource-ledger://runtime-1/node-progressive",
          entryCount: 12,
        },
        nodeResourceLedgerEntryManifestRefs: Array.from(
          { length: 12 },
          (_, index) => `node-resource-ledger-entry://runtime-1/node-progressive/${index}`,
        ),
      },
      metadata: null,
    });

    expect(ledger.status).toBe("succeeded");
    expect(ledger.metadata).toMatchObject({
      projectedPacket: {
        nodeResourceLedgerManifestRefCount: 1,
        nodeResourceLedgerEntryManifestRefCount: 12,
      },
      progressiveReadiness: {
        progressiveState: "domain_resource_selection_required",
        actionGateStatus: "blocked",
      },
    });

    const blocked = compileNodeResourceMaterializationToolOutput({
      toolId: "node.execution_packet.block_action_gate",
      volatileInput: {
        nodeExecutionPacket: packet,
        resourcePacket: resource,
        blockerSummary: "Target selection must be model-authored before write readiness.",
      },
      metadata: null,
    });

    expect(blocked.status).toBe("needs_review");
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_execution_packet_domain_action_gate_blocked",
        "node_execution_packet_progressive_state:domain_resource_selection_blocked",
      ]),
    );
    expect(blocked.metadata).toMatchObject({
      blockerKind: "node_execution_packet_domain_action_gate_blocked",
      progressiveReadiness: {
        progressiveState: "domain_resource_selection_blocked",
        actionGateStatus: "blocked",
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("promotes worker edit readiness only when the write gate is structurally hydrated", () => {
    const hydratedResource = partialCodingResourcePacket({
      targetFileRefs: [snapshot.fileRef],
      targetFileSnapshotRefs: [snapshot.snapshotRef],
      targetFileSnapshotHashes: [snapshot.contentHash],
      fileChangeIntentRefs: [`file-change-intent://${snapshot.fileRef}`],
      acceptedResourceHandoffRefs: ["node-resource-demand://runtime-1/node-progressive/fulfillment-1"],
      validationRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      readableTargetSnapshotCount: 1,
    });
    const hydratedPacket = partialExecutionPacket({
      nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
      nodeResourceLedgerManifestRefs: ["node-resource-ledger://runtime-1/node-progressive"],
      domainResourceSelectionRefs: [`domain-resource-selection://${snapshot.fileRef}`],
      targetSnapshotRefs: [snapshot.snapshotRef],
      validationRefs: ["pnpm test:file node-resource-materialization.test.ts"],
      resourcePacket: hydratedResource,
    });

    const promoted = compileNodeResourceMaterializationToolOutput({
      toolId: "node.execution_packet.promote_worker_action_ready",
      volatileInput: {
        nodeExecutionPacket: hydratedPacket,
        resourcePacket: hydratedResource,
      },
      metadata: null,
    });

    expect(promoted.status).toBe("succeeded");
    expect(promoted.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_execution_packet_worker_action_ready_promoted",
        "node_execution_packet_action_gate:ready",
      ]),
    );
    expect(promoted.metadata).toMatchObject({
      progressiveReadiness: {
        progressiveState: "worker_action_ready",
        actionGateStatus: "ready",
      },
      projectedPacket: {
        domainResourceSelectionRefCount: 1,
        targetSnapshotRefCount: 1,
        validationRefCount: 1,
      },
    });

    const blocked = compileNodeResourceMaterializationToolOutput({
      toolId: "node.execution_packet.promote_worker_action_ready",
      volatileInput: {
        nodeExecutionPacket: partialExecutionPacket({
          nodeResourceDemandSessionRefs: ["node-resource-demand://runtime-1/node-progressive/session-1"],
          nodeResourceLedgerManifestRefs: ["node-resource-ledger://runtime-1/node-progressive"],
          resourcePacket: partialCodingResourcePacket(),
        }),
        resourcePacket: partialCodingResourcePacket(),
      },
      metadata: null,
    });

    expect(blocked.status).toBe("needs_review");
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining(["node_execution_packet_worker_edit_promotion_blocked"]),
    );
    expect(blocked.metadata).toMatchObject({
      blockerKind: "node_execution_packet_action_gate_not_ready",
      progressiveReadiness: {
        actionGateStatus: "blocked",
      },
    });
  });
});
