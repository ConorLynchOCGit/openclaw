#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(".artifacts/execution-platform/node-resource-materialization");
fs.mkdirSync(outDir, { recursive: true });
const {
  buildImplementationTaskPacket,
  compileNodeExecutionPacketForImplementationTask,
  compileNodeResourceMaterializationToolOutput,
} = await tsImport(
  path.join(root, "extensions/execution-platform/src/workflows/index.ts"),
  import.meta.url,
);

const snapshot = {
  fileRef: "extensions/execution-platform/src/workflows/index.ts",
  snapshotRef: "repo-snapshot://workflow-index",
  contentHash: "sha256:workflow-index",
  byteCount: 512,
  sourceKind: "repo_file",
  freshnessStatus: "fresh",
  rawContentStored: false,
};

const implementationTaskPacket = buildImplementationTaskPacket({
  runtimeJobId: "resource-materialization-proof-runtime",
  workflowId: "agent_team.coding",
  graphId: "resource-materialization-proof-graph",
  sourceGraphNodeId: "implementation-node-1",
  microtaskId: "implementation-node-1:task-1",
  exactEditObjective: "Prove runtime resource materialization creates a ready node packet.",
  taskSummary:
    "The proof compiles a worker-ready coding resource packet before model/provider invocation.",
  targetCommitmentIds: ["resource-materialization-proof"],
  targetFileRefs: [snapshot.fileRef],
  targetFileSnapshots: [snapshot],
  allowedFileRefs: [snapshot.fileRef],
  allowedEditScope: [snapshot.fileRef],
  mustReadRefs: [snapshot.fileRef],
  likelyModifyRefs: [snapshot.fileRef],
  contextPacketRefs: ["context-handoff://resource-materialization-proof"],
  sourcePromptExcerptRefs: ["source-prompt://resource-materialization-proof/excerpt"],
  validationCommandRefs: ["pnpm test:file node-resource-materialization.test.ts"],
  acceptanceCriteria: ["NodeExecutionPacket is ready before worker invocation."],
  evidenceClaimExpectations: ["Resource packet and node packet refs are recorded."],
});

const materialized = compileNodeExecutionPacketForImplementationTask({
  runtimeJobId: "resource-materialization-proof-runtime",
  workflowId: "agent_team.coding",
  graphId: "resource-materialization-proof-graph",
  nodeId: "implementation-node-1",
  nodeKind: "implementation",
  capabilityId: "implementation_microtask",
  executorKey: "kind:implementation",
  workerRef: "openrouter://moonshotai/kimi-k2.6",
  implementationTaskPacket,
});

const readinessTool = compileNodeResourceMaterializationToolOutput({
  toolId: "node.evaluate_readiness",
  volatileInput: {
    nodeExecutionPacket: materialized.nodeExecutionPacket,
    resourcePacket: materialized.codingResourcePacket,
  },
  metadata: null,
});

const artifact = {
  artifactKind: "node_resource_materialization_proof",
  schemaVersion: "execution-platform.node-resource-materialization-proof.v1",
  status:
    materialized.readiness.valid && readinessTool.status === "succeeded" ? "passed" : "failed",
  nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
  resourcePacketRef: materialized.codingResourcePacket.packetRef,
  readinessStatus: materialized.nodeExecutionPacket.readinessStatus,
  readinessReasonCodes: materialized.nodeExecutionPacket.readinessReasonCodes,
  runtimeToolReasonCodes: readinessTool.reasonCodes,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
};

fs.writeFileSync(path.join(outDir, "proof.json"), `${JSON.stringify(artifact, null, 2)}\n`);
if (artifact.status !== "passed") {
  console.error(JSON.stringify(artifact, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(artifact, null, 2));
