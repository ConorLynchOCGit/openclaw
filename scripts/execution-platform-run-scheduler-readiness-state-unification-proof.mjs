#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildImplementationTaskPacket,
  buildMissingNodeExecutionPacketReadinessState,
  compileNodeExecutionPacketForImplementationTask,
  evaluateNodeExecutionPacketReadiness,
} = await tsImport(path.join(root, "extensions/execution-platform/src/index.ts"), import.meta.url);

const artifactDir = path.resolve(
  ".artifacts/execution-platform/scheduler-readiness-state-unification",
);
const artifactPath = path.join(artifactDir, "proof.json");

const snapshot = {
  fileRef: "extensions/execution-platform/src/workflows/index.ts",
  snapshotRef: "repo-snapshot://scheduler-readiness/workflows-index",
  contentHash: "sha256:scheduler-readiness-workflows-index",
  byteCount: 512,
  sourceKind: "repo_file",
  freshnessStatus: "fresh",
  rawContentStored: false,
};

function packet(input = {}) {
  return buildImplementationTaskPacket({
    runtimeJobId: "proof-runtime-job",
    workflowId: "agent_team.coding",
    graphId: "proof-graph",
    sourceGraphNodeId: "proof-node",
    microtaskId: `proof-node:${input.id ?? "ready"}`,
    exactEditObjective: "Prove canonical node readiness state gates worker execution.",
    taskSummary: "Compile worker-ready execution resources or block before invocation.",
    targetCommitmentIds: ["commitment-1"],
    targetFileRefs: [snapshot.fileRef],
    targetFileSnapshots: input.withoutSnapshot ? [] : [snapshot],
    allowedFileRefs: [snapshot.fileRef],
    allowedEditScope: [snapshot.fileRef],
    mustReadRefs: [snapshot.fileRef],
    contextPacketRefs: ["context-handoff://proof-node"],
    sourcePromptExcerptRefs: ["source-prompt://proof"],
    validationCommandRefs: input.withoutValidation
      ? []
      : [
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
        ],
    validationDiscoveryPlan: input.withoutValidation ? [] : ["Run focused readiness tests."],
    acceptanceCriteria: ["NodeReadinessState is canonical."],
    evidenceClaimExpectations: ["Readiness state proves execution can proceed or must block."],
  });
}

const readyMaterialized = compileNodeExecutionPacketForImplementationTask({
  runtimeJobId: "proof-runtime-job",
  workflowId: "agent_team.coding",
  graphId: "proof-graph",
  nodeId: "proof-ready",
  nodeKind: "implementation",
  capabilityId: "implementation_microtask",
  executorKey: "kind:implementation",
  workerRef: "openrouter://moonshotai/kimi-k2.6",
  implementationTaskPacket: packet(),
});

const freshButNoSnapshot = compileNodeExecutionPacketForImplementationTask({
  runtimeJobId: "proof-runtime-job",
  workflowId: "agent_team.coding",
  graphId: "proof-graph",
  nodeId: "proof-fresh-no-snapshot",
  nodeKind: "implementation",
  capabilityId: "implementation_microtask",
  executorKey: "kind:implementation",
  workerRef: "openrouter://moonshotai/kimi-k2.6",
  implementationTaskPacket: packet({ id: "fresh-no-snapshot", withoutSnapshot: true }),
});
const freshButNoSnapshotReadiness = evaluateNodeExecutionPacketReadiness({
  packet: freshButNoSnapshot.nodeExecutionPacket,
  resourcePacket: freshButNoSnapshot.codingResourcePacket,
  implementationContextPacket: {
    contextFreshnessStatus: "fresh",
    readinessStatus: "ready_as_single_task",
    rawPromptStored: false,
    rawResponseStored: false,
  },
});

const missingValidation = compileNodeExecutionPacketForImplementationTask({
  runtimeJobId: "proof-runtime-job",
  workflowId: "agent_team.coding",
  graphId: "proof-graph",
  nodeId: "proof-no-validation",
  nodeKind: "implementation",
  capabilityId: "implementation_microtask",
  executorKey: "kind:implementation",
  workerRef: "openrouter://moonshotai/kimi-k2.6",
  implementationTaskPacket: packet({ id: "no-validation", withoutValidation: true }),
});

const nonblockingLimitations = evaluateNodeExecutionPacketReadiness({
  packet: readyMaterialized.nodeExecutionPacket,
  resourcePacket: readyMaterialized.codingResourcePacket,
  implementationContextPacket: {
    contextFreshnessStatus: "fresh",
    readinessStatus: "ready_with_limitations",
    contextLimitations: [{ limitation: "Docs can be polished later.", blocking: false }],
    rawPromptStored: false,
    rawResponseStored: false,
  },
});

const missingPacketState = buildMissingNodeExecutionPacketReadinessState({
  nodeId: "proof-missing-packet",
  runtimeJobId: "proof-runtime-job",
  graphId: "proof-graph",
  workflowId: "agent_team.coding",
});

const proof = {
  artifactKind: "execution_platform.scheduler_readiness_state_unification_proof",
  status:
    readyMaterialized.readiness.state.readinessStatus === "ready" &&
    freshButNoSnapshotReadiness.state.readinessStatus === "blocked" &&
    freshButNoSnapshotReadiness.state.blockingReasonCodes.includes(
      "node_readiness_context_fresh_but_snapshot_missing",
    ) &&
    missingValidation.readiness.state.repairAction === "compile_validation_plan" &&
    nonblockingLimitations.state.readinessStatus === "ready_with_limitations" &&
    missingPacketState.nextAllowedTransitions.includes("compile_node_execution_packet")
      ? "passed"
      : "failed",
  readyState: readyMaterialized.readiness.state,
  freshButNoSnapshotState: freshButNoSnapshotReadiness.state,
  missingValidationState: missingValidation.readiness.state,
  nonblockingLimitationsState: nonblockingLimitations.state,
  missingPacketState,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
};

await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: proof.status, artifactPath }, null, 2));
if (proof.status !== "passed") {
  process.exitCode = 1;
}
