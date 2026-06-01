import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
  compileImplementationContextSnapshotPacket,
  compileImplementationContextToolOutput,
  compileDomainResourceSelectionPacket,
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
    contextPacketRefs: ["resource-handoff://packet-1"],
    validationCommandRefs: ["pnpm test:file src/workflows/runtime.test.ts"],
    acceptanceCriteria: ["Runtime compiles implementation context before worker invocation."],
    evidenceClaimExpectations: ["Source edits and validation refs close commitment-1."],
  };
}

function domainResourceSelectionFor(
  repoRoot: string,
  input?: {
    candidateConcreteFileRefs?: string[];
    selectedTargetFileRefs?: string[];
    fileChangeIntents?: Parameters<typeof compileDomainResourceSelectionPacket>[0]["fileChangeIntents"];
  },
) {
  const selectedTargetFileRefs = input?.selectedTargetFileRefs ?? ["src/workflows/runtime.ts"];
  return compileDomainResourceSelectionPacket({
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    nodeId: "node-1",
    sourceWorkUnitId: "wu-1",
    repoRoot,
    allowedFileRefs: ["src/"],
    targetCommitmentIds: ["commitment-1"],
    candidateConcreteFileRefs: input?.candidateConcreteFileRefs ?? selectedTargetFileRefs,
    selectedTargetFileRefs,
    fileChangeIntents:
      input?.fileChangeIntents ??
      selectedTargetFileRefs.map((fileRef) => ({
        fileRef,
        symbolOrRegion: `${fileRef} selected region`,
        intendedChange: "Apply the bounded model-authored source edit.",
        whyThisFile: "The model selected this concrete file from legal candidates.",
      })),
    selectionRationale: "Model-authored target selection chose concrete edit refs.",
  });
}

function readyInput(repoRoot: string) {
  return {
    ...baseInput(repoRoot),
    domainResourceSelectionPacket: domainResourceSelectionFor(repoRoot),
  };
}

describe("implementation context snapshot compiler", () => {
  it("compiles a clean existing-file implementation context and task packet", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(readyInput(repoRoot));

    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.targetFileSnapshotRefs).toHaveLength(1);
    expect(result.implementationTaskPackets).toHaveLength(1);
    expect(result.implementationTaskPackets[0]?.targetFileSnapshots).toHaveLength(1);
  });

  it("materializes source-edit context from canonical resource-selection packets", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: [],
      resourceSelectionPacket: {
        packetKind: "resource_selection_packet",
        schemaVersion: "execution-platform.resource-selection-packet.v1",
        packetId: "node-1:resource-selection",
        packetRef: "runtime-work-graph://resource-selection-packet/node-1/accepted",
        runtimeJobId: "job-1",
        workflowId: "agent_team.coding",
        graphId: "graph-1",
        nodeId: "node-1",
        sourceWorkUnitId: "wu-1",
        domainKind: "coding.domain_resource_selection",
        targetCommitmentIds: ["commitment-1"],
        candidateResourceRefs: ["file-window://src/workflows/runtime.ts#L1-L1"],
        selectedResourceRefs: ["file-window://src/workflows/runtime.ts#L1-L1"],
        resourceIntents: [
          {
            resourceRef: "file-window://src/workflows/runtime.ts#L1-L1",
            intentKind: "focused_window",
            intendedUse: "Update the runtime export in this exact window.",
            rationale: "The model selected this exact window from the node-local ledger.",
            validationHintRefs: ["pnpm test:file src/workflows/runtime.test.ts"],
          },
        ],
        validationDiscoveryPlan: ["Run the focused runtime test."],
        selectionRationale: "Canonical resource selection chose the implementation window.",
        blockerSummary: null,
        missingContextQuestions: [],
        status: "accepted",
        reasonCodes: ["resource_selection_packet_compiler_used"],
        invalidSelections: [],
        uncoveredSelectedResourceRefs: [],
        candidateHandleManifestRef:
          "runtime-work-graph://resource-selection-handle-manifest/node-1/manifest",
        candidateHandleManifestHash: "sha256:manifest",
        modelTaskBoundaryId: "domain_resource_selection",
        modelTaskPolicyRef: "model-task-policy://tool-selection/qwen3-coder-next",
        providerPath: "openrouter",
        modelRef: "qwen/qwen3-coder-next",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });

    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.resourceSelectionPacketRef).toBe(
      "runtime-work-graph://resource-selection-packet/node-1/accepted",
    );
    expect(result.packet.domainResourceSelectionPacketRef).toBeNull();
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.fileChangeIntents[0]).toMatchObject({
      fileRef: "src/workflows/runtime.ts",
      intendedChange: "Update the runtime export in this exact window.",
    });
    expect(result.reasonCodes).not.toContain(
      "implementation_context_domain_resource_selection_packet_required",
    );
  });

  it("summarizes resource materialization with graph-manifest-safe metric keys", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(readyInput(repoRoot));
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

    expect(result.status).toBe("resource_repair_required");
    expect(result.repairAction).toBe("select_concrete_target_files");
    expect(result.packet.directoryOnlyTargetRefs).toEqual(["src/workflows/"]);
    expect(result.packet.candidateConcreteFileRefs).toContain("src/workflows/runtime.ts");
    expect(result.implementationTaskPackets).toHaveLength(0);
    expect(result.reasonCodes).toContain(
      "implementation_context_concrete_domain_resource_selection_required",
    );
  });

  it("does not promote direct selectedTargetFileRefs without an accepted domain-resource-selection packet", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update the runtime export behavior.",
          whyThisFile: "The domain-resource-selection tool selected this concrete file from the seed.",
        },
      ],
    });

    expect(result.status).toBe("resource_repair_required");
    expect(result.packet.readableTargetFileRefs).toEqual([]);
    expect(result.packet.resolvedTargetFileRefs).toEqual([]);
    expect(result.reasonCodes).toContain(
      "implementation_context_concrete_domain_resource_selection_required",
    );
    expect(result.reasonCodes).toContain(
      "implementation_context_direct_selected_target_refs_require_packet",
    );
    expect(result.implementationTaskPackets).toHaveLength(0);
  });

  it("records domain-resource-selection runtime tool output without accepting invalid candidate refs", () => {
    const output = compileImplementationContextToolOutput({
      toolId: "implementation.select_target_files",
      volatileInput: {
        candidateConcreteFileRefs: ["src/workflows/runtime.ts"],
        selectedTargetFileRefs: ["src/workflows/scheduler.ts"],
        rationale: "Pick the scheduler file.",
      },
    });

    expect(output.status).toBe("needs_review");
    expect(output.reasonCodes).toContain(
      "implementation_target_file_selection_not_in_candidate_set",
    );
    expect((output.metadata as Record<string, unknown>).invalidSelections).toEqual([
      "src/workflows/scheduler.ts",
    ]);
  });

  it("does not promote context-style file-change intents from directory seeds into edit authority", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update the runtime export behavior.",
          whyThisFile: "resource scout identified the runtime export as the concrete edit point.",
        },
        {
          fileRef: "src/workflows/scheduler.ts",
          symbolOrRegion: "scheduler export",
          intendedChange: "Update scheduler wiring to consume runtime behavior.",
          whyThisFile: "resource scout identified scheduler wiring as the concrete edit point.",
        },
      ],
    });

    expect(result.status).toBe("resource_repair_required");
    expect(result.repairAction).toBe("select_concrete_target_files");
    expect(result.packet.candidateConcreteFileRefs).toEqual(
      expect.arrayContaining(["src/workflows/runtime.ts", "src/workflows/scheduler.ts"]),
    );
    expect(result.packet.readableTargetFileRefs).toEqual([]);
    expect(result.implementationTaskPackets).toHaveLength(0);
  });

  it("accepts directory discovery candidates after a domain-resource-selection packet chooses concrete files", async () => {
    const repoRoot = await fixtureRepo();
    const domainResourceSelectionPacket = compileDomainResourceSelectionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      sourceWorkUnitId: "wu-1",
      repoRoot,
      allowedFileRefs: ["src/"],
      targetCommitmentIds: ["commitment-1"],
      candidateConcreteFileRefs: ["src/workflows/runtime.ts", "src/workflows/scheduler.ts"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update runtime wiring.",
          whyThisFile: "The domain-resource-selection model chose this concrete file from candidates.",
        },
      ],
      selectionRationale: "Runtime wiring is the concrete source-edit target.",
    });
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
      domainResourceSelectionPacket,
    });

    expect(domainResourceSelectionPacket.status).toBe("accepted");
    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.domainResourceSelectionPacketRef).toBe(domainResourceSelectionPacket.packetRef);
    expect(result.packet.selectedTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.implementationTaskPackets).toHaveLength(1);
  });

  it("maps rich model-authored domain-resource-selection FileChangeIntent into worker-ready edit intent", async () => {
    const repoRoot = await fixtureRepo();
    const domainResourceSelectionPacket = compileDomainResourceSelectionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      sourceWorkUnitId: "wu-1",
      repoRoot,
      allowedFileRefs: ["src/"],
      targetCommitmentIds: ["commitment-1"],
      candidateConcreteFileRefs: ["src/workflows/runtime.ts"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts"],
      fileChangeIntents: [
        {
          targetRef: "src/workflows/runtime.ts",
          operation: "modify",
          intendedChange: "Wire accepted context handoff refs into runtime execution.",
          sourceCommitmentIds: ["commitment-1"],
          resourceHandoffRefs: ["resource-handoff://packet-1"],
          expectedEvidenceMode: ["changed_file_evidence", "validation_evidence"],
          validationDiscoveryNeed: "Run focused runtime tests.",
          authorityScopeRef: "src/",
          rationale: "The model selected this concrete candidate from accepted context.",
        },
      ],
      selectionRationale: "Runtime wiring is the concrete source-edit target.",
    });
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/"],
      domainResourceSelectionPacket,
    });

    expect(domainResourceSelectionPacket.status).toBe("accepted");
    expect(domainResourceSelectionPacket.modelAuthoredFileChangeIntents[0]).toMatchObject({
      targetRef: "src/workflows/runtime.ts",
      operation: "modify",
      resourceHandoffRefs: ["resource-handoff://packet-1"],
    });
    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.fileChangeIntents[0]).toMatchObject({
      fileRef: "src/workflows/runtime.ts",
      symbolOrRegion: "modify",
      intendedChange: "Wire accepted context handoff refs into runtime execution.",
    });
  });

  it("keeps broad directory discovery refs out of editable target coverage when concrete file-change intents exist", async () => {
    const repoRoot = await fixtureRepo();
    const domainResourceSelectionPacket = domainResourceSelectionFor(repoRoot, {
      candidateConcreteFileRefs: ["src/workflows/runtime.ts", "src/workflows/scheduler.ts"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts"],
      fileChangeIntents: [
        {
          fileRef: "src/workflows/runtime.ts",
          symbolOrRegion: "runtime export",
          intendedChange: "Update the runtime export behavior.",
          whyThisFile:
            "The model selected this concrete file while using the directory as a context seed.",
        },
      ],
    });
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/runtime.ts", "src/workflows/"],
      domainResourceSelectionPacket,
    });

    expect(result.status).toBe("ready_as_single_task");
    expect(result.packet.directoryOnlyTargetRefs).toEqual(["src/workflows/"]);
    expect(result.packet.candidateConcreteFileRefs).toContain("src/workflows/scheduler.ts");
    expect(result.packet.readableTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.packet.resolvedTargetFileRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(result.implementationTaskCompile?.reasonCodes).not.toContain(
      "post_resource_task_file_change_intent_coverage_missing",
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

    expect(result.status).toBe("resource_repair_required");
    expect(result.packet.missingTargetRefs).toEqual(["src/workflows/missing.ts"]);
    expect(result.blockerSummary).toContain("Missing target refs");
    expect(result.implementationTaskPackets).toHaveLength(0);
  });

  it("accepts new-file intents only when the parent directory snapshot exists", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/new-runtime.ts"],
      domainResourceSelectionPacket: domainResourceSelectionFor(repoRoot, {
        candidateConcreteFileRefs: ["src/workflows/new-runtime.ts"],
        selectedTargetFileRefs: ["src/workflows/new-runtime.ts"],
        fileChangeIntents: [
          {
            fileRef: "src/workflows/new-runtime.ts",
            symbolOrRegion: "new file",
            intendedChange: "Create a new runtime module.",
            whyThisFile: "The model selected this new file path from the legal target set.",
          },
        ],
      }),
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

    expect(result.status).toBe("resource_repair_required");
    expect(result.packet.newFileParentMissingRefs).toContain("missing");
  });

  it("treats blocking accepted-with-limitations context as a repair blocker", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket({
      ...readyInput(repoRoot),
      contextLimitations: [
        { limitation: "resource scout could not verify target APIs.", blocking: true },
      ],
    });

    expect(result.status).toBe("resource_repair_required");
    expect(result.packet.blockingLimitations).toContain(
      "resource scout could not verify target APIs.",
    );
  });

  it("requires a consumer-specific waiver before accepted-with-limitations context can unlock implementation", async () => {
    const repoRoot = await fixtureRepo();
    const limitation = "resource scout could not verify ownership of the runtime API.";

    const blocked = await compileImplementationContextSnapshotPacket({
      ...readyInput(repoRoot),
      contextLimitations: [{ limitation, blocking: false }],
    });

    expect(blocked.status).toBe("resource_repair_required");
    expect(blocked.reasonCodes).toContain(
      "implementation_context_nonblocking_context_limitation_waiver_missing",
    );
    expect(blocked.packet.blockingLimitations).toContain(limitation);

    const wrongConsumer = await compileImplementationContextSnapshotPacket({
      ...readyInput(repoRoot),
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

    expect(wrongConsumer.status).toBe("resource_repair_required");
    expect(wrongConsumer.packet.blockingLimitations).toContain(limitation);

    const waived = await compileImplementationContextSnapshotPacket({
      ...readyInput(repoRoot),
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

  it("does not throw when broad target refs exceed packet bounds and blocks before snapshots", async () => {
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
    });

    expect(result.status).toBe("resource_repair_required");
    expect(result.packet.resolvedTargetFileRefs).toHaveLength(0);
    expect(result.resourceMaterialization).toMatchObject({
      status: "resource_repair_required",
      maxBounds: {
        resolvedTargetFileRefs: IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS,
      },
    });
    expect(result.reasonCodes).toContain("implementation_context_domain_resource_selection_packet_required");
    expect(result.reasonCodes).toContain("implementation_context_concrete_domain_resource_selection_required");
  });

  it("creates executable split suggestions for multi-directory implementation contexts", async () => {
    const repoRoot = await fixtureRepo();
    const domainResourceSelectionPacket = domainResourceSelectionFor(repoRoot, {
      candidateConcreteFileRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
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
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
      allowedFileRefs: ["src/"],
      domainResourceSelectionPacket,
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

  it("preserves executable task contract fields on split-required resource packets", async () => {
    const repoRoot = await fixtureRepo();
    const domainResourceSelectionPacket = domainResourceSelectionFor(repoRoot, {
      candidateConcreteFileRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
      selectedTargetFileRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
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
    const result = await compileImplementationContextSnapshotPacket({
      ...baseInput(repoRoot),
      targetRefs: ["src/workflows/runtime.ts", "src/tests/runtime.test.ts"],
      allowedFileRefs: ["src/"],
      domainResourceSelectionPacket,
    });

    expect(result.status).toBe("split_required");
    expect(result.packet.executionIntent).toBe("source_edit");
    expect(result.packet.evidenceMode).toEqual(["changed_file_evidence", "validation_evidence"]);
    expect(result.packet.fileChangeIntents.map((intent) => intent.fileRef)).toEqual([
      "src/workflows/runtime.ts",
      "src/tests/runtime.test.ts",
    ]);
  });

  it("requires target selection before splitting broad concrete target sets without edit intent", async () => {
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

    expect(result.status).toBe("resource_repair_required");
    expect(result.repairAction).toBe("select_concrete_target_files");
    expect(result.resourceMaterialization.status).toBe("resource_repair_required");
    expect(result.implementationTaskPackets).toHaveLength(0);
    expect(result.reasonCodes).toContain("implementation_context_domain_resource_selection_packet_required");
  });

  it("records implementation-context runtime tool output without raw storage", async () => {
    const repoRoot = await fixtureRepo();
    const result = await compileImplementationContextSnapshotPacket(readyInput(repoRoot));
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
