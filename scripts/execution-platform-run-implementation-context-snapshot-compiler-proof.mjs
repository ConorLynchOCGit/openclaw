#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

const repoRoot = process.cwd();
const outDir = path.join(
  repoRoot,
  ".artifacts/execution-platform/implementation-context-snapshot-compiler",
);
await mkdir(outDir, { recursive: true });

const { compileImplementationContextSnapshotPacket, compileImplementationContextToolOutput } =
  await tsImport(
    path.join(
      repoRoot,
      "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts",
    ),
    import.meta.url,
  );
const { compileNodeExecutionPacketForImplementationTask } = await tsImport(
  path.join(
    repoRoot,
    "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  ),
  import.meta.url,
);

const result = await compileImplementationContextSnapshotPacket({
  runtimeJobId: "proof-runtime-job",
  workflowId: "agent_team.coding",
  graphId: "proof-graph",
  nodeId: "proof-node",
  sourceWorkUnitId: "wu-implementation-context",
  repoRoot,
  executionIntent: "source_edit",
  evidenceMode: ["changed_file_evidence", "validation_evidence"],
  exactEditObjective: "Prove implementation context snapshots compile before worker invocation.",
  taskSummary:
    "Use a real repository file to produce a bounded implementation context packet, ImplementationTaskPacket, and NodeExecutionPacket.",
  targetCommitmentIds: ["commitment-implementation-context"],
  targetRefs: ["extensions/execution-platform/src/workflows/index.ts"],
  allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
  contextPacketRefs: ["context-handoff://proof/context-scout"],
  sourceCommitmentPacketRefs: ["commitment-work-packet://proof/commitment-implementation-context"],
  sourceContextHandoffRefs: ["context-handoff://proof/context-scout"],
  sourcePromptExcerptRefs: ["source-prompt-excerpt://proof/implementation-context"],
  contextSynthesisRefs: ["context-synthesis://proof/accepted"],
  validationCommandRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts",
  ],
  acceptanceCriteria: [
    "Implementation context packet contains target snapshots before worker execution.",
    "NodeExecutionPacket readiness is ready.",
  ],
  evidenceClaimExpectations: [
    "Snapshot refs and validation refs support commitment-implementation-context.",
  ],
});

if (result.status !== "ready_as_single_task" || result.implementationTaskPackets.length !== 1) {
  throw new Error(`implementation_context_proof_not_ready:${result.status}`);
}

const taskPacket = result.implementationTaskPackets[0];
const materialized = compileNodeExecutionPacketForImplementationTask({
  runtimeJobId: "proof-runtime-job",
  workflowId: "agent_team.coding",
  graphId: "proof-graph",
  nodeId: "proof-node",
  capabilityId: "implementation_microtask",
  executorKey: "kind:implementation",
  workerRef: "worker://proof/non-codex",
  implementationTaskPacket: taskPacket,
});

const toolOutput = compileImplementationContextToolOutput({
  toolId: "implementation.evaluate_readiness",
  volatileInput: {
    implementationContextPacket: result.packet,
    implementationTaskPackets: result.implementationTaskPackets,
  },
});

const proof = {
  status: materialized.readiness.valid && toolOutput.status === "succeeded" ? "passed" : "failed",
  implementationContextPacketRef: result.packet.packetRef,
  implementationTaskPacketRefs: result.implementationTaskPackets.map((packet) => packet.packetRef),
  nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
  codingResourcePacketRef: materialized.codingResourcePacket.packetRef,
  targetFileSnapshotRefs: result.packet.targetFileSnapshotRefs,
  readinessStatus: materialized.nodeExecutionPacket.readinessStatus,
  toolOutputRef: toolOutput.outputRef,
  reasonCodes: [
    ...result.reasonCodes,
    ...materialized.readiness.reasonCodes,
    ...toolOutput.reasonCodes,
  ],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
};
proof.proofHash = createHash("sha256").update(JSON.stringify(proof)).digest("hex");
await writeFile(path.join(outDir, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
