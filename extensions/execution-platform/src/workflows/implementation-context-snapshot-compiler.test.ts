import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
  compileImplementationContextSnapshotPacket,
  compileImplementationContextToolOutput,
  summarizeImplementationResourceMaterializationForReadback,
} from "./implementation-context-snapshot-compiler.ts";

async function fixtureRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-implementation-context-"));
  await mkdir(path.join(repoRoot, "src/workflows"), { recursive: true });
  await mkdir(path.join(repoRoot, "src/tests"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "src/workflows/runtime.ts"),
    "export const runtime = true;\n",
  );
  await writeFile(
    path.join(repoRoot, "src/workflows/scheduler.ts"),
    "export const scheduler = true;\n",
  );
  await writeFile(
    path.join(repoRoot, "src/tests/runtime.test.ts"),
    "import '../workflows/runtime';\n",
  );
  return repoRoot;
}

function baseInput(repoRoot: string) {
  return {
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    nodeId: "node-1",
    sourceWorkUnitId: "wu-1",
    repoRoot,
    executionIntent: "source_edit" as const,
    evidenceMode: ["changed_file_evidence" as const, "validation_evidence" as const],
    exactEditObjective: "Wire the runtime snapshot compiler into the scheduler path.",
    taskSummary: "Bounded implementation task with accepted context handoff.",
    targetCommitmentIds: ["commitment-1"],
    targetRefs: ["src/workflows/runtime.ts"],
    allowedFileRefs: ["src/"],
    contextPacketRefs: ["context-handoff://packet-1"],
    validationCommandRefs: ["pnpm test:file src/workflows/runtime.test.ts"],
    acceptanceCriteria: ["Runtime compiles implementation context before worker invocation."],
    evidenceClaimExpectations: ["Source edits and validation refs close commitment-1."],
  };
}

describe("implementation context snapshot compiler", () => {
  it("compiles a clean existing-file implementation context and task packet", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(baseInput(repoRoot));

    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.targetFileSnapshotRefs).toHaveLength(1);
    expect(result.implementationTaskPackets).toHaveLength(1);
    expect(result.implementationTaskPackets[0]?.targetFileSnapshots).toHaveLength(1);
  });

  it("summarizes resource materialization with graph-manifest-safe metric keys", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(baseInput(repoRoot));
    const summary = summarizeImplementationResourceMaterializationForReadback(
      result.resourceMaterialization,
    ) as Record<string, Record<string, number>>;

    expect(summary.implementationResourceMaterializationInputCounts.targetFileSnapshotCount).toBe(
      1,
    );
    expect(summary.implementationResourceMaterializationOutputCounts.targetFileSnapshotCount).toBe(
      1,
    );
    expect(
      summary.implementationResourceMaterializationMaxBounds.targetFileSnapshotMax,
    ).toBeGreaterThan(1);
    expect(Object.keys(summary.implementationResourceMaterializationInputCounts)).not.toContain(
      "targetFileSnapshots",
    );
    expect(Object.keys(summary.implementationResourceMaterializationMaxBounds)).not.toContain(
      "targetFileSnapshots",
    );
  });

  it("blocks directory-only target refs as discovery seeds instead of executable targets", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.packet.directoryOnlyTargetRefs).toEqual(["src/workflows/"]);
    expect(result.packet.candidateConcreteFileRefs).toContain("src/workflows/runtime.ts");
    expect(result.implementationTaskPackets).toHaveLength(0);
    expect(result.reasonCodes).toContain(
      "post_context_task_semantic_microtask_refinement_required",
    );
  });

  it("allows directory discovery candidates only when model-authored file-change intents cover the split tasks", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update the runtime export behavior.",
          whyThisFile: "Context scout identified the runtime export as the concrete edit point.",
        },
        {
          fileRef: "src/workflows/scheduler.ts",
          symbolOrRegion: "scheduler export",
          intendedChange: "Update scheduler wiring to consume runtime behavior.",
          whyThisFile: "Context scout identified scheduler wiring as the concrete edit point.",
        },
      ],
    });

    expect(result.status).toBe("split_required");
    expect(result.implementationTaskPackets.length).toBeGreaterThan(0);
    expect(result.implementationTaskPackets[0]?.fileChangeIntents.length).toBeGreaterThan(0);
  });

  it("keeps broad directory discovery refs out of editable target coverage when concrete file-change intents exist", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/runtime.ts", "src/workflows/"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update the runtime export behavior.",
          whyThisFile:
            "The scheduler selected this concrete file while using the directory as a context seed.",
        },
      ],
    });

    expect(result.status).toBe("split_required");
    expect(result.packet.directoryOnlyTargetRefs).toEqual(["src/workflows/"]);
    expect(result.packet.candidateConcreteFileRefs).toContain("src/workflows/scheduler.ts");
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.resolvedTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.implementationTaskCompile?.reasonCodes).not.toContain(
      "post_context_task_file_change_intent_coverage_missing",
    );
    expect(result.implementationTaskPackets).toHaveLength(1);
    expect(result.implementationTaskPackets[0]?.targetFileRefs).toEqual([
      "src/workflows/runtime.ts",
    ]);
  });

  it("blocks missing target snapshots before worker invocation", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/missing.ts"],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.packet.missingTargetRefs).toEqual(["src/workflows/missing.ts"]);
    expect(result.blockerSummary).toContain("Missing target refs");
    expect(result.implementationTaskPackets).toHaveLength(0);
  });

  it("accepts new-file intents only when the parent directory snapshot exists", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/new-runtime.ts"],
      newFileIntents: [
        {
          fileRef: "src/workflows/new-runtime.ts",
          reason: "Add a new runtime module.",
          expectedPurpose: "Expose implementation context helpers.",
          validationExpectation: "Existing workflow tests still pass.",
        },
      ],
    });

    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.newFileParentSnapshotRefs).toHaveLength(1);
  });

  it("blocks new-file intents when parent snapshot is missing", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["missing/new-runtime.ts"],
      allowedFileRefs: ["missing/"],
      newFileIntents: [
        {
          fileRef: "missing/new-runtime.ts",
          reason: "Add a new runtime module.",
          expectedPurpose: "Expose implementation context helpers.",
          validationExpectation: "Focused tests pass.",
        },
      ],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.packet.newFileParentMissingRefs).toContain("missing");
  });

  it("treats blocking accepted-with-limitations context as a repair blocker", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      contextLimitations: [
        { limitation: "Context scout could not verify target APIs.", blocking: true },
      ],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.packet.blockingLimitations).toContain(
      "Context scout could not verify target APIs.",
    );
  });

  it("requires a consumer-specific waiver before accepted-with-limitations context can unlock implementation", async () => {
    const repoRoot = await fixtureRepo();
    const limitation = "Context scout could not verify ownership of the runtime API.";

    const blocked = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      contextLimitations: [{ limitation, blocking: false }],
    });

    expect(blocked.status).toBe("context_repair_required");
    expect(blocked.reasonCodes).toContain(
      "implementation_context_nonblocking_context_limitation_waiver_missing",
    );
    expect(blocked.packet.blockingLimitations).toContain(limitation);

    const wrongConsumer = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      contextLimitations: [{ limitation, blocking: false }],
      contextLimitationWaivers: [
        {
          consumerNodeId: "other-node",
          workUnitId: "wu-1",
          limitation,
          evidenceRefs: ["context-waiver://other-node/runtime-api"],
        },
      ],
    });

    expect(wrongConsumer.status).toBe("context_repair_required");
    expect(wrongConsumer.packet.blockingLimitations).toContain(limitation);

    const waived = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      contextLimitations: [{ limitation, blocking: false }],
      contextLimitationWaivers: [
        {
          consumerNodeId: "node-1",
          workUnitId: "wu-1",
          limitation,
          evidenceRefs: ["context-waiver://node-1/runtime-api"],
        },
      ],
    });

    expect(waived.status).toBe("ready_as_single_task");
    expect(waived.packet.nonblockingLimitations).toContain(limitation);
    expect(waived.packet.contextLimitationWaivers[0]).toMatchObject({
      consumerNodeId: "node-1",
      evidenceRefs: ["context-waiver://node-1/runtime-api"],
    });
  });

  it("does not throw when target refs exceed packet bounds and returns split-required diagnostics", async () => {
    const repoRoot = await fixtureRepo();
    const targetRefs: string[] = [];
    await mkdir(path.join(repoRoot, "src/many"), { recursive: true });
    for (
      let index = 0;
      index < IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS + 12;
      index += 1
    ) {
      const ref = `src/many/file-${index}.ts`;
      targetRefs.push(ref);
      await writeFile(path.join(repoRoot, ref), `export const file${index} = ${index};\n`);
    }

    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs,
      allowedFileRefs: ["src/many/"],
      fileChangeIntents: targetRefs.map((fileRef, index) => ({
        fileRef,
        symbolOrRegion: `file-${index} export`,
        intendedChange: `Apply the bounded generated-file update for file ${index}.`,
        whyThisFile: "The model-authored refinement selected this concrete file.",
      })),
    });

    expect(result.status).toBe("split_required");
    expect(result.packet.resolvedTargetFileRefs).toHaveLength(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
    );
    expect(result.resourceMaterialization).toMatchObject({
      status: "split_required",
      maxBounds: {
        resolvedTargetFileRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
      },
    });
    expect(result.resourceMaterialization.inputCounts.resolvedTargetFileRefs).toBe(
      IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS + 12,
    );
    expect(result.resourceMaterialization.suggestedSplits.length).toBeGreaterThan(1);
    expect(result.reasonCodes).toContain("implementation_context_resource_packet_bounds_exceeded");
  });

  it("creates executable split suggestions for multi-directory implementation contexts", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
      allowedFileRefs: ["src/"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update runtime implementation.",
          whyThisFile: "This file owns runtime behavior.",
        },
        {
          fileRef: "src/tests/runtime.test.ts",
          symbolOrRegion: "runtime test import",
          intendedChange: "Update validation coverage.",
          whyThisFile: "This file validates runtime behavior.",
        },
      ],
    });

    expect(result.status).toBe("split_required");
    expect(result.resourceMaterialization.suggestedSplits).toHaveLength(2);
    expect(
      result.resourceMaterialization.suggestedSplits.map((split) => split.targetFileRefs),
    ).toEqual([["src/workflows/runtime.ts"], ["src/tests/runtime.test.ts"]]);
    expect(
      result.resourceMaterialization.suggestedSplits.flatMap((split) => split.reasonCodes),
    ).toEqual(
      expect.arrayContaining([
        "implementation_context_split_parent_directory:src/workflows",
        "implementation_context_split_parent_directory:src/tests",
      ]),
    );
  });

  it("keeps resource-bound split required ahead of parent-level semantic context repair", async () => {
    const repoRoot = await fixtureRepo();
    const targetRefs: string[] = [];
    await mkdir(path.join(repoRoot, "src/too-broad"), { recursive: true });
    for (
      let index = 0;
      index < IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS + 8;
      index += 1
    ) {
      const ref = `src/too-broad/file-${index}.ts`;
      targetRefs.push(ref);
      await writeFile(path.join(repoRoot, ref), `export const tooBroad${index} = ${index};\n`);
    }

    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs,
      allowedFileRefs: ["src/too-broad/"],
    });

    expect(result.status).toBe("split_required");
    expect(result.resourceMaterialization.status).toBe("split_required");
    expect(result.implementationTaskPackets).toHaveLength(0);
    expect(result.reasonCodes).toContain("implementation_context_resource_packet_bounds_exceeded");
    expect(result.reasonCodes).toContain("implementation_context_split_precedes_context_repair");
    expect(result.reasonCodes).toContain("post_context_task_file_change_intent_coverage_missing");
    expect(result.resourceMaterialization.suggestedSplits.length).toBeGreaterThan(1);
  });

  it("records implementation-context runtime tool output without raw storage", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(baseInput(repoRoot));
    const output = compileImplementationContextToolOutput({
      toolId: "implementation.evaluate_readiness",
      volatileInput: {
        implementationContextPacket: result.packet,
        implementationTaskPackets: result.implementationTaskPackets,
      },
    });

    expect(output.status).toBe("succeeded");
    expect(output.outputRef).toBe(result.packet.packetRef);
    expect(output.metadata).toMatchObject({
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });
});
