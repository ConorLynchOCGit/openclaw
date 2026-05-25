import { describe, expect, it } from "vitest";
import type { RuntimeJob } from "../runtime-job-repository.ts";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
} from "../workflows/mission-work-packets.ts";
import { compileNodeExecutionPacketForImplementationTask } from "../workflows/node-resource-materialization.ts";
import { CodexParityImplementationBridge } from "./codex-parity-implementation-bridge.ts";
import type { CodexParityRuntimeAdapterResult } from "./codex-parity-runtime-adapter.ts";

function runtimeJob(): RuntimeJob {
  const now = new Date("2026-05-11T00:00:00.000Z");
  return {
    jobId: "runtime-job-1",
    jobType: "executor.agent_team",
    queueName: "agent-team",
    priority: 0,
    state: "running",
    payload: {},
    result: null,
    error: null,
    idempotencyScope: "test",
    idempotencyKey: "test",
    parentJobId: null,
    parentWorkflowId: null,
    workItemId: null,
    attempts: 1,
    maxAttempts: 1,
    leaseTimeoutMs: 1_000,
    runTimeoutMs: null,
    availableAt: now,
    deadlineAt: null,
    workerId: "worker",
    leaseId: "lease",
    leaseExpiresAt: now,
    startedAt: now,
    completedAt: null,
    canceledAt: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function adapterResult(): CodexParityRuntimeAdapterResult {
  return {
    artifactKind: "codex_parity_runtime_adapter_result",
    status: "completed",
    runtimeJobId: "runtime-job-1",
    graphNodeId: "team-run-1-implementation",
    modelSelection: {
      roleId: "implementation_complex",
      modelRef: "openai-codex/gpt-5.3-codex",
      providerPath: "codex_parity_runtime_adapter",
      workerRef: "worker.codex.parity-runtime-adapter",
      policyRef:
        "policy://codex-parity/openclaw-role/implementation-complex/openai-codex/gpt-5.3-codex",
      reasoningEffort: "xhigh",
      maxOutputTokens: 32_000,
      timeoutMs: 3_600_000,
      codexNativeSubagentsAllowed: true,
      openClawRoleEvidenceRequired: true,
      missingConfigBlocker: null,
      reasonCodes: ["codex_parity_complex_implementation_selected"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    executionMode: "direct_main_repo",
    lease: {
      artifactKind: "main_repo_write_lease",
      leaseId: "lease-1",
      runtimeJobId: "runtime-job-1",
      repoRoot: "/repo",
      approvedScopeRefs: ["src"],
      acquiredAt: "2026-05-11T00:00:00.000Z",
      expiresAt: "2026-05-11T00:30:00.000Z",
      renewedAt: null,
      status: "released",
      advisoryOnly: true,
      reasonCodes: ["main_repo_write_lease_acquired_advisory", "main_repo_write_lease_released"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    beforeManifest: {
      artifactKind: "main_repo_hash_manifest",
      manifestId: "before",
      repoRoot: "/repo",
      approvedScopeRefs: ["src"],
      fileCount: 1,
      files: [],
      evidenceStatus: "accepted",
      reasonCodes: ["main_repo_hash_manifest_accepted"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    afterManifest: {
      artifactKind: "main_repo_hash_manifest",
      manifestId: "after",
      repoRoot: "/repo",
      approvedScopeRefs: ["src"],
      fileCount: 1,
      files: [],
      evidenceStatus: "accepted",
      reasonCodes: ["main_repo_hash_manifest_accepted"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    diff: {
      artifactKind: "main_repo_change_manifest",
      changeManifestId: "diff-1",
      beforeManifestId: "before",
      afterManifestId: "after",
      changedFiles: [],
      diffHash: "hash",
      evidenceStatus: "accepted",
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    validation: {
      artifactKind: "codex_parity_validation_accounting",
      requiredValidationCount: 1,
      recordedValidationCount: 1,
      skippedValidationCount: 0,
      unknownValidationCount: 0,
      allRequiredValidationStatesKnown: true,
      allRequiredValidationAccepted: true,
      records: [
        {
          commandRef: "pnpm test:file src/example.test.ts",
          approvedCommandId: "validation",
          status: "passed",
          exitCode: 0,
          durationMs: 1,
          boundedSummary: "passed",
          outputHash: null,
          skippedReason: null,
          rawCommandLogStored: false,
        },
      ],
      reasonCodes: ["all_required_validation_states_known"],
      rawCommandLogsStored: false,
    },
    testIntegrity: {
      artifactKind: "codex_parity_test_integrity_decision",
      status: "accepted",
      reasonCodes: ["test_integrity_accepted"],
      beforeSnapshotId: "before-test-integrity",
      afterSnapshotId: "after-test-integrity",
      touchedTestFileRefs: [],
      rawTestContentStored: false,
    },
    review: {
      status: "accepted",
      reviewerModelRef: "model://reviewer",
      reviewRef: "review://one",
      boundedSummary: "accepted",
      reasonCodes: ["accepted"],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    sourceAcceptanceDecision: {
      artifactKind: "codex_parity_source_acceptance_decision",
      status: "allowed",
      changedFileRefs: ["src/example.ts"],
      validationAccepted: true,
      reviewAccepted: true,
      sourceEditEvidenceAccepted: true,
      reasonCodes: ["codex_parity_direct_main_repo_source_accepted"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    processResult: {
      status: "completed",
      exitCode: 0,
      stdoutBytes: 1,
      stderrBytes: 0,
      finalMessageHash: "hash",
    },
    changedFileRefs: ["src/example.ts"],
    artifactRefs: ["runtime-job://runtime-job-1/codex-parity/result"],
    reasonCodes: ["codex_parity_direct_main_repo_source_accepted"],
    codexNativeSubagentsInternalOnly: true,
    openClawRoleEvidenceRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function readyPackets() {
  const snapshot: ImplementationTaskFileSnapshot = {
    fileRef: "src/example.ts",
    snapshotRef: "repo-snapshot://src/example.ts",
    contentHash: "sha256:example",
    byteCount: 128,
    sourceKind: "repo_file",
    freshnessStatus: "fresh",
    rawContentStored: false,
  };
  const taskPacket = buildImplementationTaskPacket({
    runtimeJobId: "runtime-job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    sourceGraphNodeId: "node-1",
    microtaskId: "node-1:task-1",
    exactEditObjective: "Implement the bounded example task.",
    taskSummary: "Edit src/example.ts and validate the focused test.",
    targetCommitmentIds: ["commitment-1"],
    targetFileRefs: [snapshot.fileRef],
    targetFileSnapshots: [snapshot],
    allowedFileRefs: [snapshot.fileRef],
    allowedEditScope: [snapshot.fileRef],
    mustReadRefs: [snapshot.fileRef],
    likelyModifyRefs: [snapshot.fileRef],
    contextPacketRefs: ["context-handoff://node-1"],
    sourceContextHandoffRefs: ["context-handoff://node-1"],
    validationCommandRefs: ["pnpm test:file src/example.test.ts"],
    acceptanceCriteria: ["The worker receives a hydrated packet handoff."],
    evidenceClaimExpectations: ["Changed file and validation evidence close commitment-1."],
  });
  return compileNodeExecutionPacketForImplementationTask({
    runtimeJobId: "runtime-job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    nodeId: "node-1",
    nodeKind: "implementation",
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    workerRef: "codex-parity://worker",
    implementationTaskPacket: taskPacket,
  });
}

describe("Codex parity implementation bridge", () => {
  it("adapts CodexParityRuntimeAdapter into AgentTeamImplementationBridge", async () => {
    let receivedScopeRefs: string[] = [];
    let receivedPrompt = "";
    const packets = readyPackets();
    const bridge = new CodexParityImplementationBridge({
      repoPath: "/repo",
      approvedRepoScopePaths: ["src"],
      adapter: {
        async run(input) {
          receivedScopeRefs = input.approvedScopeRefs;
          receivedPrompt = input.volatilePrompt;
          expect(input.volatilePrompt).toContain("owner objective");
          expect(input.validationCommands[0]?.required).toBe(true);
          expect("workspaceRoot" in input).toBe(false);
          return adapterResult();
        },
      },
    });

    const result = await bridge.run({
      runtimeJob: runtimeJob(),
      teamRunId: "team-run-1",
      objective: "owner objective",
      roleId: "implementation_engineer",
      assignedTaskSummary: "implement",
      evidenceRefs: ["artifact://context"],
      validationRefs: ["pnpm test:file src/example.test.ts"],
      approvedRepoScopePaths: ["extensions/execution-platform/src/work-queue/"],
      nodeExecutionPacket: packets.nodeExecutionPacket,
      codingResourcePacket: packets.codingResourcePacket,
      nodeReadinessStateRef: packets.readiness.state.stateRef,
    });

    expect(receivedScopeRefs).toEqual(["extensions/execution-platform/src/work-queue/"]);
    expect(receivedPrompt).toContain(`packetRef: ${packets.nodeExecutionPacket.packetRef}`);
    expect(receivedPrompt).toContain(`packetRef: ${packets.codingResourcePacket.packetRef}`);
    expect(receivedPrompt).toContain("targetFileRefs: src/example.ts");
    expect(result.transportKind).toBe("codex_parity_runtime_adapter");
    expect(result.changedFileRefs).toEqual(["src/example.ts"]);
    expect(result.validationRefs).toEqual(["pnpm test:file src/example.test.ts"]);
  });

  it("blocks before Codex parity adapter invocation without hydrated worker packets", async () => {
    let adapterCalled = false;
    const bridge = new CodexParityImplementationBridge({
      repoPath: "/repo",
      approvedRepoScopePaths: ["src"],
      adapter: {
        async run() {
          adapterCalled = true;
          return adapterResult();
        },
      },
    });

    const result = await bridge.run({
      runtimeJob: runtimeJob(),
      teamRunId: "team-run-1",
      objective: "owner objective",
      roleId: "implementation_engineer",
      assignedTaskSummary: "implement",
      evidenceRefs: ["artifact://context"],
      validationRefs: ["pnpm test:file src/example.test.ts"],
      approvedRepoScopePaths: ["src"],
    });

    expect(adapterCalled).toBe(false);
    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "codex_parity_worker_invocation_packet_preflight_blocked",
        "codex_parity_node_execution_packet_missing",
        "codex_parity_coding_resource_packet_missing",
      ]),
    );
  });
});
