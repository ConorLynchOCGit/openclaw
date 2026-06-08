import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAgentSessionKey } from "../../../../src/sessions/session-key-utils.ts";
import type { JsonValue, RuntimeJobArtifact } from "../runtime-job-types.ts";
import {
  allocateStableNodeRunId,
  authorNodeExecutionPrompt,
  buildNodeAgentSessionTrace,
  buildNodeAgentSessionKey,
  buildNodeExecutionSnapshotFromGraphNode,
  createExecutionPlatformResourceReadTool,
  createNodeFinishTool,
  deriveNodeAgentStepBudgetFromSnapshot,
  InMemoryNodeExecutionRunStore,
  mapNodeFinishToLifecycleOutcome,
  normalizeNodeFinish,
  NODE_FINISH_TOOL_NAME,
  OPENCLAW_RESOURCE_READ_TOOL_NAME,
  resetNodeForFreshAttempt,
  runNodeAgentSession,
  RuntimeArtifactNodeExecutionRunStore,
  NODE_AGENT_START_RECEIPT_ARTIFACT_TYPE,
  NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE,
  NODE_EXECUTION_STORAGE_POLICY,
  NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
  NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE,
  type NodeExecutionRunArtifactRepository,
  type NodeExecutionRunRecord,
  type NodeAgentWorkerPrompt,
} from "./node-agent-session.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import type { TeamGraphNode, TeamRunGraph } from "./runtime-work-graph.ts";

const now = new Date("2026-06-04T00:00:00.000Z");

function graph(): TeamRunGraph {
  return {
    graphId: "graph-native-node",
    parentWorkItemId: null,
    rootRuntimeJobId: "job-native-node",
    workflowId: "agent_team.coding",
    orchestratorModelRef: "model://scheduler",
    graphStatus: "running",
    budgetLedgerRef: null,
    checkpointRefs: [],
    finalCloseoutRef: null,
    metadata: {},
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
    createdAt: now,
    updatedAt: now,
  };
}

function node(metadata: Record<string, JsonValue> = {}): TeamGraphNode {
  return {
    nodeId: "impl-1",
    graphId: "graph-native-node",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: null,
    runtimeJobId: "job-native-node",
    humanTaskId: null,
    inputHandoffRefs: ["source-prompt://prompt-1#span-2", "requirement://req-1"],
    outputArtifactRefs: [],
    nodeStatus: "planned",
    budgetUsage: {},
    metadata,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function snapshot(nodes: TeamGraphNode[]): RuntimeWorkGraphSnapshot {
  return {
    graph: graph(),
    nodes,
    edges: [],
    roleInvocations: [],
    handoffPackets: [],
    artifactManifests: [],
    budgetLedgers: [],
    checkpoints: [],
    humanTasks: [],
  };
}

function artifact(input: {
  artifactId: string;
  artifactType: string;
  uri: string;
  metadata?: Record<string, JsonValue>;
}): RuntimeJobArtifact {
  return {
    artifactId: input.artifactId,
    jobId: "job-native-node",
    artifactType: input.artifactType,
    storageKind: "runtime-artifact-payload",
    uri: input.uri,
    contentType: "application/json",
    sizeBytes: null,
    sha256: null,
    metadata: input.metadata ?? {},
    createdAt: now,
  };
}

function repositoryForBodies(input: {
  artifacts: RuntimeJobArtifact[];
  bodies: Record<string, JsonValue>;
}): NodeExecutionRunArtifactRepository {
  return {
    attachRuntimeArtifactByContract: async () => {
      throw new Error("not used");
    },
    listArtifacts: async () => input.artifacts,
    hydrateRuntimeArtifactByContract: async (runtimeArtifact: RuntimeJobArtifact) => ({
      artifact: runtimeArtifact,
      contract: null,
      status: "payload_hydrated" as const,
      body: input.bodies[runtimeArtifact.artifactId] ?? null,
      payload: null,
      reasonCodes: ["fixture_hydrated"],
      legacyHydrated: false,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
    }),
  };
}

describe("native node agent session contracts", () => {
  it("allocates stable short node run ids and parseable node session keys", () => {
    const nodeRunId = allocateStableNodeRunId({
      runtimeJobId: "job-native-node",
      graphId: "graph-native-node",
      nodeId: "impl-1",
      attemptId: "attempt-1",
    });
    expect(nodeRunId).toMatch(/^nrun_[a-f0-9]{20}$/);

    const sessionKey = buildNodeAgentSessionKey({
      agentId: "execution-coding",
      nodeRunId,
    });
    expect(sessionKey).toBe(`agent:execution-coding:node:${nodeRunId}`);
    expect(parseAgentSessionKey(sessionKey)).toMatchObject({
      agentId: "execution-coding",
      rest: `node:${nodeRunId}`,
    });
  });

  it("builds bounded node execution snapshots from graph node refs without old worker packets", () => {
    const executable = node({
      capabilityId: "source_edit",
      executionIntent: "source_edit",
      requirementRefs: ["requirement://req-1", "requirement://req-2"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
      readableRepoRefs: ["repo-scope://workspace"],
      writableRepoRefs: ["repo-path://src/example.ts"],
      validationCommandRefs: ["validation-command://unit"],
      evidenceContractRef: "evidence-contract://source-edit",
      validationPolicyRef: "validation-policy://unit",
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });

    expect(built).toMatchObject({
      artifactKind: "execution_platform.node_execution_snapshot",
      runtimeJobId: "job-native-node",
      workflowId: "agent_team.coding",
      nodeId: "impl-1",
      attemptId: "attempt-1",
      agentId: "execution-coding",
      storagePolicy: {
        artifactPolicyRef: NODE_EXECUTION_STORAGE_POLICY.artifactPolicyRef,
        rawStoragePolicyRef: NODE_EXECUTION_STORAGE_POLICY.rawStoragePolicyRef,
        boundedRefsOnly: true,
      },
    });
    expect(built).not.toHaveProperty("rawPromptStored");
    expect(built).not.toHaveProperty("rawTranscriptStored");
    expect(built).not.toHaveProperty("hiddenReasoningStored");
    expect(built).not.toHaveProperty("startReceiptRef");
    expect(built).not.toHaveProperty("configFingerprintRef");
    expect(built.taskRefs).toEqual(
      expect.arrayContaining(["source-prompt://prompt-1#span-2", "requirement://req-1"]),
    );
    expect(built.requirementRefs).toEqual(["requirement://req-1", "requirement://req-2"]);
    expect(built.authorityRefs).toMatchObject({
      readableRepoRefs: ["repo-scope://workspace"],
      writableRepoRefs: ["repo-path://src/example.ts"],
      promptSourceRefs: ["source-prompt://prompt-1#span-2"],
      validationCommandRefs: ["validation-command://unit"],
    });
  });

  it("resets node attempts through one runner-owned helper", () => {
    const executable = node({
      nodeAttemptId: "attempt-old",
      nodeRunId: "nrun_old",
      nodeAgentSessionKey: "agent:execution-coding:node:nrun_old",
      nodeExecutionSnapshotRef: "node-execution-snapshot://old",
      nodeAgentStartReceiptRef: "node-agent-start-receipt://old",
      openClawAgentId: "execution-coding",
    });

    const receipt = resetNodeForFreshAttempt({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-new",
      now,
      reason: "boundary_replay_reset",
    });

    expect(receipt).toMatchObject({
      artifactKind: "execution_platform.node_fresh_attempt_reset_receipt",
      previousAttemptId: "attempt-old",
      previousNodeRunId: "nrun_old",
      previousSessionKey: "agent:execution-coding:node:nrun_old",
      nodeAttemptId: "attempt-new",
      sessionKey: `agent:execution-coding:node:${receipt.nodeRunId}`,
    });
    expect(receipt.nodeRunId).not.toBe("nrun_old");
    expect(receipt.metadataPatch).toMatchObject({
      nodeAttemptId: "attempt-new",
      nodeRunId: receipt.nodeRunId,
      nodeAgentSessionKey: receipt.sessionKey,
      nodeExecutionSnapshotRef: null,
      nodeAgentStartReceiptRef: null,
      previousNodeRunId: "nrun_old",
    });
    expect(NODE_AGENT_START_RECEIPT_ARTIFACT_TYPE).toBe(
      "execution_platform.node_agent_start_receipt",
    );
  });

  it("keeps node run records as lookup bindings rather than lifecycle state", async () => {
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: "job-native-node",
      graphId: "graph-native-node",
      nodeId: "impl-1",
      attemptId: "attempt-1",
      agentId: "execution-coding",
      snapshotRef: "node-execution-snapshot://impl-1",
      now,
    });
    const loaded = await store.getNodeRunBySessionKey(record.sessionKey);
    const latest = await store.getLatestNodeRunForNode({
      runtimeJobId: "job-native-node",
      graphId: "graph-native-node",
      nodeId: "impl-1",
    });

    expect(loaded?.nodeRunId).toBe(record.nodeRunId);
    expect(latest?.nodeRunId).toBe(record.nodeRunId);
    expect(record).not.toHaveProperty("currentLifecycleState");
    expect(record).not.toHaveProperty("currentGate");
    expect(record.snapshotRef).toBe("node-execution-snapshot://impl-1");
  });

  it("returns the newest artifact-backed node run record for readback and resume lookup", async () => {
    const oldRecord: NodeExecutionRunRecord = {
      artifactKind: "execution_platform.node_execution_run_record",
      schemaVersion: "execution-platform.node-execution-run-record.v1",
      nodeRunId: "nrun_old",
      runtimeJobId: "job-native-node",
      graphId: "graph-native-node",
      nodeId: "impl-1",
      attemptId: "attempt-1",
      parentNodeRunId: null,
      agentId: "execution-coding",
      sessionKey: "agent:execution-coding:node:nrun_old",
      snapshotRef: "node-execution-snapshot://old",
      finishArtifactRef: null,
      createdAt: "2026-06-04T00:00:00.000Z",
      startedAt: null,
      endedAt: null,
      storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
    };
    const newRecord: NodeExecutionRunRecord = {
      ...oldRecord,
      nodeRunId: "nrun_new",
      sessionKey: "agent:execution-coding:node:nrun_new",
      snapshotRef: "node-execution-snapshot://new",
      createdAt: "2026-06-04T00:05:00.000Z",
    };
    const bodies: Record<string, JsonValue> = {
      "artifact-new": newRecord as unknown as JsonValue,
      "artifact-old": oldRecord as unknown as JsonValue,
    };
    const store = new RuntimeArtifactNodeExecutionRunStore(
      {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-new",
            jobId: "job-native-node",
            artifactType: NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE,
            storageKind: "runtime-artifact-payload",
            uri: "node-run://nrun_new",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {},
            createdAt: new Date("2026-06-04T00:05:00.000Z"),
          },
          {
            artifactId: "artifact-old",
            jobId: "job-native-node",
            artifactType: NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE,
            storageKind: "runtime-artifact-payload",
            uri: "node-run://nrun_old",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {},
            createdAt: new Date("2026-06-04T00:00:00.000Z"),
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: bodies[artifact.artifactId] ?? null,
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
      { runtimeJobIdsForLookup: async () => ["job-native-node"] },
    );

    await expect(
      store.getLatestNodeRunForNode({
        runtimeJobId: "job-native-node",
        graphId: "graph-native-node",
        nodeId: "impl-1",
      }),
    ).resolves.toMatchObject({ nodeRunId: "nrun_new" });
  });

  it("maps node_finish into typed lifecycle outcomes and blocks prose-only completion", async () => {
    const completed = normalizeNodeFinish({
      nodeRunId: "nrun_1",
      raw: {
        status: "completed",
        summary: "Edited and validated.",
        evidenceRefs: ["artifact://validation-1"],
      },
    });
    expect(mapNodeFinishToLifecycleOutcome({ finish: completed })).toMatchObject({
      status: "completed",
      nodeStatus: "succeeded",
      evidenceRefs: ["artifact://validation-1"],
    });

    const missingEvidence = normalizeNodeFinish({
      nodeRunId: "nrun_1",
      raw: { status: "completed", summary: "Done." },
    });
    expect(mapNodeFinishToLifecycleOutcome({ finish: missingEvidence })).toMatchObject({
      status: "blocked",
      nodeStatus: "needs_review",
      blockerKind: "evidence_closure_missing",
    });

    let captured = null as null | ReturnType<typeof normalizeNodeFinish>;
    const tool = createNodeFinishTool({
      nodeRunId: "nrun_1",
      onFinish: (finish) => {
        captured = finish;
      },
    });
    await tool.execute("call-1", {
      status: "blocked",
      summary: "Need operator input.",
      blockerKind: "human_input_required",
      attemptedRefs: ["artifact://attempt"],
    });
    expect(captured).toMatchObject({
      status: "blocked",
      blockerKind: "human_input_required",
      attemptedRefs: ["artifact://attempt"],
    });
  });

  it("persists fallback node_finish blockers without narrowing repo discovery to snapshot refs", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
      readableRepoRefs: ["src/allowed.ts"],
      writableRepoRefs: ["src/allowed.ts"],
      deniedRefs: ["src/denied.ts"],
      validationCommandRefs: ["validation-command://unit"],
      sandboxPolicyRef: "sandbox-policy://node-test",
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const persistedFinishRefs: string[] = [];
    let forwardedToolsAllow: string[] | undefined;
    let forwardedNativeRuntimeToolNames: string[] = [];
    let forwardedPrompt = "";
    const workerPromptText = [
      "## Node Worker Prompt",
      "Assigned requirement: implement native node execution.",
      "",
      "Use update_plan before broad work.",
      "",
    ].join("\n");
    const legacyAgentParams = {
      sessionId: record.nodeRunId,
      sessionFile: "/tmp/node-agent-session-test.jsonl",
      workspaceDir: "/tmp",
      timeoutMs: 1,
      runId: record.nodeRunId,
      toolsAllow: ["read"],
    } as unknown as Parameters<typeof runNodeAgentSession>[0]["agentParams"];

    const result = await runNodeAgentSession({
      nodeRunId: record.nodeRunId,
      nodeRuns: store,
      hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
      recordFinishArtifact: async (finish) => {
        const ref = `artifact://finish/${finish.status}/${finish.blockerKind ?? "none"}`;
        persistedFinishRefs.push(ref);
        return ref;
      },
      runEmbeddedAgent: async (params) => {
        forwardedPrompt = params.prompt;
        forwardedToolsAllow = params.toolsAllow;
        forwardedNativeRuntimeToolNames = (params.nativeRuntimeTools ?? []).map(
          (tool) => tool.name,
        );
        expect(params.nodeAuthorityOverlay).toBeUndefined();
        return {
          payloads: [{ text: "I am done." }],
          meta: { durationMs: 1 },
        };
      },
      workerPromptText,
      agentParams: legacyAgentParams,
    });

    const finished = await store.getNodeRunById(record.nodeRunId);
    expect(result.status).toBe("blocked");
    expect(forwardedToolsAllow).toBeUndefined();
    expect(forwardedNativeRuntimeToolNames).toContain(NODE_FINISH_TOOL_NAME);
    expect(forwardedPrompt).toBe(workerPromptText);
    expect(forwardedPrompt).toContain("Assigned requirement: implement native node execution.");
    expect(forwardedPrompt).toContain("Use update_plan before broad work.");
    expect(forwardedPrompt).not.toContain("First hydrate");
    expect(result.finish).toMatchObject({
      status: "blocked",
      blockerKind: "node_finish_not_called",
    });
    expect(persistedFinishRefs).toEqual(["artifact://finish/blocked/node_finish_not_called"]);
    expect(finished?.finishArtifactRef).toBe("artifact://finish/blocked/node_finish_not_called");
  });

  it("forwards highest Kimi reasoning controls into the native worker attempt", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    let forwardedProvider: string | undefined;
    let forwardedModel: string | undefined;
    let forwardedThinkLevel: string | undefined;
    let forwardedReasoningLevel: string | undefined;

    const result = await runNodeAgentSession({
      nodeRunId: record.nodeRunId,
      nodeRuns: store,
      hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
      runEmbeddedAgent: async (params) => {
        forwardedProvider = params.provider;
        forwardedModel = params.model;
        forwardedThinkLevel = params.thinkLevel;
        forwardedReasoningLevel = params.reasoningLevel;
        const finish = params.nativeRuntimeTools?.find(
          (tool) => tool.name === NODE_FINISH_TOOL_NAME,
        );
        await finish?.execute("call-finish", {
          status: "completed",
          summary: "Forwarded Kimi worker reasoning settings into the native attempt.",
          evidenceRefs: ["provider-attempt://kimi-xhigh-stream"],
        });
        return {
          payloads: [{ text: "done" }],
          meta: {
            durationMs: 1,
            toolSummary: {
              calls: 1,
              tools: [NODE_FINISH_TOOL_NAME],
            },
          },
        };
      },
      workerPromptText: "## Node Worker Prompt\nFinish after proving reasoning settings.",
      agentParams: {
        sessionId: record.nodeRunId,
        sessionFile: "/tmp/node-agent-session-kimi-reasoning-test.jsonl",
        workspaceDir: "/tmp",
        provider: "openrouter",
        model: "moonshotai/kimi-k2.6",
        thinkLevel: "xhigh",
        reasoningLevel: "stream",
        timeoutMs: 1,
        runId: record.nodeRunId,
      },
    });

    expect(result.status).toBe("completed");
    expect(forwardedProvider).toBe("openrouter");
    expect(forwardedModel).toBe("moonshotai/kimi-k2.6");
    expect(forwardedThinkLevel).toBe("xhigh");
    expect(forwardedReasoningLevel).toBe("stream");
  });

  it("proves a native-node edit fixture can edit, validate, and finish through node_finish", async () => {
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "native-node-edit-proof-"));
    const fixturePath = path.join(fixtureDir, "product-spec-gate.ts");
    await fs.writeFile(fixturePath, "export const productSpecPlanningGate = false;\n", "utf8");
    try {
      const executable = node({
        capabilityId: "source_edit",
        executionIntent: "source_edit",
        requirementRefs: ["requirement://req-edit-fixture"],
        sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
      });
      const built = buildNodeExecutionSnapshotFromGraphNode({
        snapshot: snapshot([executable]),
        graphId: "graph-native-node",
        node: executable,
        attemptId: "attempt-1",
      });
      const store = new InMemoryNodeExecutionRunStore();
      const record = await store.allocateOrLoadNodeRun({
        runtimeJobId: built.runtimeJobId,
        graphId: built.graphId,
        nodeId: built.nodeId,
        attemptId: built.attemptId,
        agentId: built.agentId,
        snapshotRef: built.snapshotRef,
        now,
      });
      const persistedFinishRefs: string[] = [];

      const result = await runNodeAgentSession({
        nodeRunId: record.nodeRunId,
        nodeRuns: store,
        hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
        recordFinishArtifact: async (finish) => {
          const ref = `artifact://finish/${finish.status}/${finish.evidenceRefs.length}`;
          persistedFinishRefs.push(ref);
          return ref;
        },
        runEmbeddedAgent: async (params) => {
          expect(params.prompt).toContain("productSpecPlanningGate");
          const finishTool = params.nativeRuntimeTools?.find(
            (tool) => tool.name === NODE_FINISH_TOOL_NAME,
          );
          expect(finishTool).toBeTruthy();

          const scoutInlineWindow = [
            "inline_context_windows:",
            `- path: ${fixturePath}`,
            "  excerpt: export const productSpecPlanningGate = false;",
            "  why: isolated fixture assertion still needs the production gate enabled.",
          ].join("\n");
          expect(scoutInlineWindow).toContain("productSpecPlanningGate = false");

          await fs.writeFile(
            fixturePath,
            "export const productSpecPlanningGate = 'pending-repair';\n",
            "utf8",
          );
          const failedValidationSource = await fs.readFile(fixturePath, "utf8");
          expect(failedValidationSource).not.toContain("= true");

          await fs.writeFile(fixturePath, "export const productSpecPlanningGate = true;\n", "utf8");
          const repairedValidationSource = await fs.readFile(fixturePath, "utf8");
          expect(repairedValidationSource).toContain("= true");

          await finishTool!.execute("node-finish-edit-proof", {
            status: "completed",
            summary:
              "Edited the isolated product-spec gate fixture, repaired the first failed validation, and validated the expected value.",
            evidenceRefs: [
              `repo-file://${fixturePath}`,
              "validation://native-node-edit-fixture:first-failed",
              "validation://native-node-edit-fixture",
            ],
            attemptedRefs: [`repo-file://${fixturePath}`],
          });

          return {
            payloads: [],
            meta: {
              durationMs: 1,
              stopReason: "completed",
              toolSummary: {
                calls: 6,
                tools: ["update_plan", "openclaw_resource_read", "task", "edit", "node_finish"],
              },
              nodeAgentSessionTrace: {
                childSessionKeyRef:
                  "agent:execution-context-scout:node:nrun_edit_fixture_context_scout",
                childResultRef: "openclaw-session://context-scout/result/inline-source",
                workingContextRef:
                  "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_edit_fixture",
                workingContextEntryRef:
                  "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_edit_fixture/wctx_edit_fixture",
                workingContextHasInlineContextWindows: true,
                workingContextHasFileGraph: true,
                contextDecisionFooterKind: "minimal_edit_readiness",
                parentPostChildActionRef:
                  "openclaw-tool-result://nrun_edit_fixture/plan-after-context",
                contextTodoDecisionRef:
                  "openclaw-tool-result://nrun_edit_fixture/plan-after-context",
                contextNextActionRef: `repo-file://${fixturePath}#first-invalid-edit`,
                firstEditRef: `repo-file://${fixturePath}#first-invalid-edit`,
                validationActionRef: "validation://native-node-edit-fixture:first-failed",
                validationScoutResultRef:
                  "openclaw-session://validation-scout/result/repair-context",
                validationDecisionFooterKind: "validation_sufficiency",
                parentPostValidationActionRef:
                  "openclaw-tool-result://nrun_edit_fixture/plan-after-validation",
                validationTodoDecisionRef:
                  "openclaw-tool-result://nrun_edit_fixture/plan-after-validation",
                validationNextActionRef:
                  "openclaw-tool-result://nrun_edit_fixture/finish-after-validation",
                repairLoopEvidenceRef:
                  "openclaw-session://execution-coding/repair/productSpecPlanningGate",
                terminalNodeFinishRef: "artifact://finish/completed/3",
              },
            },
          };
        },
        workerPromptText: [
          "# Node Assignment: Native edit fixture",
          "",
          "Set `productSpecPlanningGate` to true in the isolated fixture.",
          `Known target: ${fixturePath}`,
          "Use update_plan, native task for scout/validation delegation as needed, edit, validate, then call node_finish.",
        ].join("\n"),
        agentParams: {
          sessionId: record.nodeRunId,
          sessionFile: "/tmp/node-agent-session-edit-proof-test.jsonl",
          workspaceDir: fixtureDir,
          timeoutMs: 1,
          runId: record.nodeRunId,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.finish).toMatchObject({
        status: "completed",
        evidenceRefs: [
          `repo-file://${fixturePath}`,
          "validation://native-node-edit-fixture:first-failed",
          "validation://native-node-edit-fixture",
        ],
      });
      expect(await fs.readFile(fixturePath, "utf8")).toContain("productSpecPlanningGate = true");
      expect(persistedFinishRefs).toEqual(["artifact://finish/completed/3"]);
      expect((await store.getNodeRunById(record.nodeRunId))?.finishArtifactRef).toBe(
        "artifact://finish/completed/3",
      );
      const workerPrompt: NodeAgentWorkerPrompt = {
        artifactKind: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
        schemaVersion: "execution-platform.node-agent-worker-prompt.v1",
        promptRef: "node-agent-worker-prompt://nrun_edit_fixture/proof",
        nodeRunId: record.nodeRunId,
        nodeId: built.nodeId,
        runtimeJobId: built.runtimeJobId,
        sessionKey: built.sessionKey,
        snapshotRef: built.snapshotRef,
        requirementRefs: built.requirementRefs,
        sourcePromptRefs: built.sourcePromptRefs,
        modelRunRef: "model-run://node-prompt-author/native-edit-fixture",
        promptText: "Set productSpecPlanningGate to true and finish with node_finish.",
        promptHash: "native-edit-fixture-prompt-hash",
        promptByteCount: 69,
        promptQualityDiagnostics: [],
        reasonCodes: ["node_agent_worker_prompt_authored_by_node_lifecycle_runner"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        hiddenReasoningStored: false,
        storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
      };
      const trace = buildNodeAgentSessionTrace({
        nodeRun: result.nodeRun,
        nodeExecutionSnapshot: built,
        workerPrompt,
        workerPromptArtifactRef: "runtime-job://job-native-node/node-worker-prompt/edit-fixture",
        sessionTodo: {
          schemaVersion: 1,
          sessionKey: result.nodeRun.sessionKey,
          updatedAt: 1234,
          items: [
            {
              content: "Edit the isolated fixture",
              status: "completed",
              priority: "high",
              position: 1,
            },
            {
              content: "Run validation",
              status: "completed",
              priority: "normal",
              position: 2,
            },
          ],
          history: [
            {
              eventId: "todo_native_edit_fixture",
              type: "todo.updated",
              updatedAt: 1234,
              itemCount: 2,
              completedCount: 2,
              inProgressCount: 0,
              items: [
                {
                  content: "Edit the isolated fixture",
                  status: "completed",
                  priority: "high",
                  position: 1,
                },
                {
                  content: "Run validation",
                  status: "completed",
                  priority: "normal",
                  position: 2,
                },
              ],
            },
          ],
        },
        status: result.status,
        runResult: result.runResult,
        finish: result.finish,
        finishArtifactRef: persistedFinishRefs[0],
      });
      expect(trace.observedToolNames).toEqual(
        expect.arrayContaining([
          "update_plan",
          "openclaw_resource_read",
          "task",
          "edit",
          "node_finish",
        ]),
      );
      expect(trace.eventRefs).toMatchObject({
        todoStateRef: `openclaw-session-todo://${encodeURIComponent(result.nodeRun.sessionKey)}`,
        firstPlanUpdateRef: `openclaw-session-todo://${encodeURIComponent(result.nodeRun.sessionKey)}`,
        childSessionKeyRef: "agent:execution-context-scout:node:nrun_edit_fixture_context_scout",
        childResultRef: "openclaw-session://context-scout/result/inline-source",
        parentSynthesisRef: "openclaw-tool-result://nrun_edit_fixture/plan-after-context",
        contextTodoDecisionRef: "openclaw-tool-result://nrun_edit_fixture/plan-after-context",
        contextNextActionRef: `repo-file://${fixturePath}#first-invalid-edit`,
        parentPostValidationActionRef:
          "openclaw-tool-result://nrun_edit_fixture/plan-after-validation",
        validationTodoDecisionRef: "openclaw-tool-result://nrun_edit_fixture/plan-after-validation",
        validationNextActionRef: "openclaw-tool-result://nrun_edit_fixture/finish-after-validation",
        validationScoutResultRef: "openclaw-session://validation-scout/result/repair-context",
        repairLoopEvidenceRef: "openclaw-session://execution-coding/repair/productSpecPlanningGate",
        terminalNodeFinishRef: "artifact://finish/completed/3",
      });
      expect(trace.todoState).toMatchObject({
        sessionKey: result.nodeRun.sessionKey,
        itemCount: 2,
        completedCount: 2,
        inProgressCount: 0,
        items: [
          {
            content: "Edit the isolated fixture",
            status: "completed",
            priority: "high",
            position: 1,
          },
          {
            content: "Run validation",
            status: "completed",
            priority: "normal",
            position: 2,
          },
        ],
        history: [
          {
            eventId: "todo_native_edit_fixture",
            itemCount: 2,
            completedCount: 2,
            inProgressCount: 0,
          },
        ],
      });
      expect(trace.observations).toMatchObject({
        firstPlanUpdateObserved: true,
        contextScoutSpawnObserved: true,
        sessionsYieldObserved: false,
        childResultObserved: true,
        contextDecisionFooterObserved: true,
        validationDecisionFooterObserved: true,
        contextTodoDecisionObserved: true,
        contextNextActionObserved: true,
        validationTodoDecisionObserved: true,
        validationNextActionObserved: true,
        workingContextObserved: true,
        inlineContextWindowsObserved: true,
        fileGraphObserved: true,
        parentSynthesisObserved: true,
        firstEditObserved: true,
        validationActionObserved: true,
        validationScoutObserved: true,
        repairLoopEvidenceObserved: true,
        terminalNodeFinishObserved: true,
      });
      expect(trace.missingOptics).toEqual([]);
    } finally {
      await fs.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("derives native node-agent step budget from actual node complexity", () => {
    const simpleNode = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
      acceptanceCriteria: ["single focused code change"],
    });
    const complexNode = node({
      requirementRefs: Array.from({ length: 9 }, (_, index) => `requirement://req-${index + 1}`),
      sourcePromptRefs: Array.from(
        { length: 8 },
        (_, index) => `source-prompt://prompt-1#span-${index + 1}`,
      ),
      taskRefs: Array.from({ length: 8 }, (_, index) => `task://complex/${index + 1}`),
      acceptanceCriteria: Array.from(
        { length: 12 },
        (_, index) => `acceptance criterion ${index + 1}`,
      ),
      validationCommandRefs: ["validation://unit", "validation://proof"],
    });

    const simple = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([simpleNode]),
      graphId: "graph-native-node",
      node: simpleNode,
      attemptId: "attempt-1",
    });
    const complex = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([complexNode]),
      graphId: "graph-native-node",
      node: complexNode,
      attemptId: "attempt-1",
    });

    const simpleBudget = deriveNodeAgentStepBudgetFromSnapshot(simple);
    const complexBudget = deriveNodeAgentStepBudgetFromSnapshot(complex);

    expect(simpleBudget.tier).toBe("small");
    expect(complexBudget.tier).toBe("large");
    expect(complexBudget.expectedToolCallCheckpoint).toBeGreaterThan(
      simpleBudget.expectedToolCallCheckpoint,
    );
    expect(complexBudget.basis).toEqual(
      expect.arrayContaining([
        "node_agent_step_budget_tier:large",
        "node_agent_step_budget_requirement_count:9",
        "node_agent_step_budget_acceptance_criteria_count:12",
        "node_agent_step_budget_validation_ref_count:2",
      ]),
    );
  });

  it("records over-budget progress as diagnostics instead of killing completed node work", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const finishRefs: string[] = [];

    const result = await runNodeAgentSession({
      nodeRunId: record.nodeRunId,
      nodeRuns: store,
      hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
      recordFinishArtifact: async (finish) => {
        const ref = `artifact://finish/${finish.status}/${finish.evidenceRefs.length}`;
        finishRefs.push(ref);
        return ref;
      },
      runEmbeddedAgent: async (params) => {
        const finish = params.nativeRuntimeTools?.find(
          (tool) => tool.name === NODE_FINISH_TOOL_NAME,
        );
        await finish?.execute("call-finish", {
          status: "completed",
          summary: "Completed despite crossing the soft diagnostic budget.",
          evidenceRefs: ["artifact://validation/progress"],
        });
        return {
          payloads: [{ text: "done" }],
          meta: {
            durationMs: 1,
            toolSummary: {
              calls: 6,
              tools: ["update_plan", "task", "edit", "task", "node_finish"],
            },
            contextManagement: { sessionCompactions: 2 },
          },
        };
      },
      workerPromptText: "## Node Worker Prompt\nComplete the node and finish with evidence.",
      stepBudget: {
        profile: "execution-coding-parent",
        tier: "small",
        expectedToolCallCheckpoint: 2,
        expectedCompactionCheckpoint: 0,
        basis: ["test-soft-budget"],
      },
      agentParams: {
        sessionId: record.nodeRunId,
        sessionFile: "/tmp/node-agent-session-soft-budget-test.jsonl",
        workspaceDir: "/tmp",
        timeoutMs: 1,
        runId: record.nodeRunId,
      },
    });

    expect(result.status).toBe("completed");
    expect(result.finish).toMatchObject({ status: "completed" });
    expect(finishRefs).toEqual(["artifact://finish/completed/1"]);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_step_budget_tool_calls_over_budget",
        "node_agent_step_budget_compactions_over_budget",
        "node_agent_step_budget_over_budget_nonterminal_diagnostic",
      ]),
    );

    const trace = buildNodeAgentSessionTrace({
      nodeRun: result.nodeRun,
      nodeExecutionSnapshot: built,
      status: result.status,
      runResult: result.runResult,
      finish: result.finish,
      finishArtifactRef: finishRefs[0],
      stepBudget: {
        profile: "execution-coding-parent",
        tier: "small",
        expectedToolCallCheckpoint: 2,
        expectedCompactionCheckpoint: 0,
        basis: ["test-soft-budget"],
      },
    });
    expect(trace.stepBudget).toMatchObject({
      status: "over_budget",
      observedToolCalls: 6,
      observedCompactions: 2,
      expectedToolCallCheckpoint: 2,
      expectedCompactionCheckpoint: 0,
    });
    expect(trace.reasonCodes).toContain("node_agent_session_trace_step_budget_over_budget");
  });

  it("blocks stale node run records before starting an agent when snapshot binding disagrees", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const staleRecord = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: "stale-attempt",
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    let invoked = false;

    const result = await runNodeAgentSession({
      nodeRunId: staleRecord.nodeRunId,
      nodeRuns: store,
      hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
      runEmbeddedAgent: async () => {
        invoked = true;
        return {
          payloads: [],
          meta: { durationMs: 1 },
        };
      },
      workerPromptText: "## Node Worker Prompt\nDo not run; stale binding should block.",
      agentParams: {
        sessionId: staleRecord.nodeRunId,
        sessionFile: "/tmp/node-agent-session-stale-binding-test.jsonl",
        workspaceDir: "/tmp",
        timeoutMs: 1,
        runId: staleRecord.nodeRunId,
      },
    });

    expect(invoked).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_session_blocked_snapshot_run_binding_mismatch",
        `node_agent_session_record_node_run_id:${staleRecord.nodeRunId}`,
        `node_agent_session_snapshot_node_run_id:${built.nodeRunId}`,
      ]),
    );
  });

  it("treats sessions_yield as a nonterminal subagent wait instead of missing node_finish", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const persistedFinishRefs: string[] = [];

    const result = await runNodeAgentSession({
      nodeRunId: record.nodeRunId,
      nodeRuns: store,
      hydrateSnapshot: async (snapshotRef) => (snapshotRef === built.snapshotRef ? built : null),
      recordFinishArtifact: async (finish) => {
        const ref = `artifact://finish/${finish.status}/${finish.blockerKind ?? "none"}`;
        persistedFinishRefs.push(ref);
        return ref;
      },
      runEmbeddedAgent: async () => ({
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "end_turn",
          yieldDetected: true,
          toolSummary: { calls: 3, tools: ["update_plan", "task", "sessions_yield"] },
          contextManagement: { sessionCompactions: 1 },
        },
      }),
      workerPromptText:
        "## Node Worker Prompt\nSpawn execution-context-scout, then yield until its result arrives.",
      stepBudget: {
        profile: "execution-coding-parent",
        tier: "small",
        expectedToolCallCheckpoint: 1,
        expectedCompactionCheckpoint: 0,
        basis: ["test-yield-soft-budget"],
      },
      agentParams: {
        sessionId: record.nodeRunId,
        sessionFile: "/tmp/node-agent-session-yield-test.jsonl",
        workspaceDir: "/tmp",
        timeoutMs: 1,
        runId: record.nodeRunId,
      },
    });

    expect(result.status).toBe("waiting_on_subagent");
    expect(result.finish).toBeNull();
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_execution_waiting_on_subagent",
        "node_agent_step_budget_tool_calls_over_budget",
        "node_agent_step_budget_compactions_over_budget",
        "node_agent_step_budget_over_budget_progress_continues",
        "sessions_yield_nonterminal_wait_state",
      ]),
    );
    expect(persistedFinishRefs).toEqual([]);
    expect((await store.getNodeRunById(record.nodeRunId))?.finishArtifactRef).toBeNull();
  });

  it("builds bounded node agent session traces from native OpenClaw session metadata", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://prompt-1#span-2"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
    };
    const workerPrompt: NodeAgentWorkerPrompt = {
      artifactKind: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
      schemaVersion: "execution-platform.node-agent-worker-prompt.v1",
      promptRef: "node-agent-worker-prompt://nrun_trace/abc123",
      nodeRunId: record.nodeRunId,
      nodeId: built.nodeId,
      runtimeJobId: built.runtimeJobId,
      sessionKey: built.sessionKey,
      snapshotRef: built.snapshotRef,
      requirementRefs: built.requirementRefs,
      sourcePromptRefs: built.sourcePromptRefs,
      modelRunRef: "model-run://node-prompt-author/1",
      promptText: "Use update_plan, search/edit/validate, then node_finish.",
      promptHash: "abc123",
      promptByteCount: 58,
      promptQualityDiagnostics: [],
      reasonCodes: ["node_agent_worker_prompt_authored_by_node_lifecycle_runner"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      hiddenReasoningStored: false,
      storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
    };
    const finish = normalizeNodeFinish({
      nodeRunId: record.nodeRunId,
      raw: {
        status: "completed",
        summary: "Edited and validated.",
        evidenceRefs: ["artifact://validation-1"],
      },
    });

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      workerPrompt,
      workerPromptArtifactRef: "runtime-job://job-native-node/node-worker-prompt/impl-1",
      status: "completed",
      finish,
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 6,
            tools: ["update_plan", "task", "edit", "node_finish"],
          },
          executionTrace: {
            winnerProvider: "openrouter",
            winnerModel: "moonshotai/kimi-k2.6",
          },
          requestShaping: {
            thinking: "xhigh",
            reasoning: "stream",
          },
          contextManagement: { sessionCompactions: 1 },
          nodeAgentSessionTrace: {
            sessionLaunchRef:
              "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace",
            sessionLaunchEventRef:
              "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace/session_launch_1",
            sessionLaunchStatus: "accepted",
            sessionLaunchBlockerKind: null,
            sessionLaunchProvider: "openrouter",
            sessionLaunchModel: "moonshotai/kimi-k2.6",
            sessionLaunchCwd: "/root/services/openclaw-roles/live",
            sessionLaunchReasoningLevel: "stream",
            sessionLaunchThinkingLevel: "xhigh",
            sessionLaunchPromptHashMatched: true,
            sessionLaunchToolCatalogRef:
              "openclaw-effective-tool-inventory://agent%3Aexecution-coding%3Anode%3Anrun_trace",
            firstPlanUpdateRef: "runtime-job://job-native-node/session-event/todo-1",
            childSessionKeyRef: "agent:execution-context-scout:node:nrun_trace_context_scout",
            childResultRef: "runtime-job://job-native-node/subagent-result/context-scout-1",
            workingContextRef:
              "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_trace",
            workingContextEntryRef:
              "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_trace/wctx_trace",
            workingContextHasInlineContextWindows: true,
            workingContextHasFileGraph: true,
            childProviderAdmissionObserved: true,
            contextDecisionFooterKind: "minimal_edit_readiness",
            changeSetRef: "openclaw-session-working-context://nrun_trace/change-set-1",
            validationStateRef: "openclaw-session-working-context://nrun_trace/validation-state-1",
            childBootstrapAdmissions: [
              {
                requestedAgentId: "execution-context-scout",
                childSessionKey: "agent:execution-context-scout:node:nrun_trace_context_scout",
                providerReportObserved: true,
                childAgentId: "execution-context-scout",
                canonicalDocsAdmitted: true,
                requiredSkillAdmitted: true,
                childToolCatalogAdmitted: true,
                providerToolNames: ["read", "list", "glob", "grep"],
                requiredToolNames: ["read", "list", "glob", "grep"],
                missingRequiredToolNames: [],
                forbiddenToolNames: [],
                missingRequiredSources: [],
                truncatedRequiredSources: [],
                reportRef: "openclaw-system-prompt-report://execution-context-scout/proof",
                reasonCodes: [
                  "native_task_child_provider_prompt_report_observed",
                  "native_task_child_canonical_docs_admitted_to_provider_context",
                  "native_task_child_required_skill_admitted_to_provider_context",
                ],
              },
            ],
            parentPostChildActionRef: "openclaw-tool-result://nrun_trace/plan-after-context",
            contextTodoDecisionRef: "openclaw-tool-result://nrun_trace/plan-after-context",
            contextNextActionRef: "runtime-job://job-native-node/session-event/edit-1",
            firstEditRef: "runtime-job://job-native-node/session-event/edit-1",
            validationScoutResultRef:
              "runtime-job://job-native-node/subagent-result/validation-scout-1",
            validationDecisionFooterKind: "validation_sufficiency",
            parentPostValidationActionRef:
              "openclaw-tool-result://nrun_trace/plan-after-validation",
            validationTodoDecisionRef: "openclaw-tool-result://nrun_trace/plan-after-validation",
            validationNextActionRef: "openclaw-tool-result://nrun_trace/finish-after-validation",
            repairLoopEvidenceRef: "runtime-job://job-native-node/session-event/repair-loop-1",
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.artifactKind).toBe(NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE);
    expect(trace.storagePolicy).toMatchObject({
      artifactPolicyRef: NODE_EXECUTION_STORAGE_POLICY.artifactPolicyRef,
      rawStoragePolicyRef: NODE_EXECUTION_STORAGE_POLICY.rawStoragePolicyRef,
      boundedRefsOnly: true,
    });
    expect(trace.observedToolNames).toEqual(
      expect.arrayContaining(["update_plan", "task", "edit", "node_finish"]),
    );
    expect(trace.eventRefs).toMatchObject({
      sessionLaunchRef: "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace",
      sessionLaunchEventRef:
        "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace/session_launch_1",
      workerPromptAuthoredRef: "runtime-job://job-native-node/node-worker-prompt/impl-1",
      childResultRef: "runtime-job://job-native-node/subagent-result/context-scout-1",
      changeSetRef: "openclaw-session-working-context://nrun_trace/change-set-1",
      validationStateRef: "openclaw-session-working-context://nrun_trace/validation-state-1",
      parentSynthesisRef: "openclaw-tool-result://nrun_trace/plan-after-context",
      parentPostValidationActionRef: "openclaw-tool-result://nrun_trace/plan-after-validation",
      validationScoutResultRef: "runtime-job://job-native-node/subagent-result/validation-scout-1",
      repairLoopEvidenceRef: "runtime-job://job-native-node/session-event/repair-loop-1",
      terminalNodeFinishRef: "runtime-job://job-native-node/node-finish/impl-1",
    });
    expect(trace.sessionLaunch).toMatchObject({
      ref: "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace",
      eventRef:
        "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_trace/session_launch_1",
      admissionStatus: "accepted",
      blockerKind: null,
      provider: "openrouter",
      model: "moonshotai/kimi-k2.6",
      cwd: "/root/services/openclaw-roles/live",
      reasoningLevel: "stream",
      thinkingLevel: "xhigh",
      promptHashMatched: true,
      toolCatalogRef:
        "openclaw-effective-tool-inventory://agent%3Aexecution-coding%3Anode%3Anrun_trace",
    });
    expect(trace.childBootstrapAdmissions).toEqual([
      expect.objectContaining({
        requestedAgentId: "execution-context-scout",
        providerReportObserved: true,
        childAgentId: "execution-context-scout",
        canonicalDocsAdmitted: true,
        requiredSkillAdmitted: true,
        childToolCatalogAdmitted: true,
        providerToolNames: ["read", "list", "glob", "grep"],
        requiredToolNames: ["read", "list", "glob", "grep"],
        missingRequiredToolNames: [],
        forbiddenToolNames: [],
        reportRef: "openclaw-system-prompt-report://execution-context-scout/proof",
      }),
    ]);
    expect(trace.observations).toMatchObject({
      nativeSessionLaunchObserved: true,
      workerPromptAuthored: true,
      parentSessionStarted: true,
      firstPlanUpdateObserved: true,
      contextScoutSpawnObserved: true,
      sessionsYieldObserved: false,
      childResultObserved: true,
      contextDecisionFooterObserved: true,
      validationDecisionFooterObserved: true,
      workingContextObserved: true,
      inlineContextWindowsObserved: true,
      fileGraphObserved: true,
      changeSetObserved: true,
      validationStateObserved: true,
      parentSynthesisObserved: true,
      parentPostValidationActionObserved: true,
      firstEditObserved: true,
      validationActionObserved: true,
      validationScoutObserved: true,
      repairLoopEvidenceObserved: true,
      terminalNodeFinishObserved: true,
      childProviderAdmissionObserved: true,
    });
    expect(trace.contextManagement).toMatchObject({
      nativeCompactionCount: 1,
      compactionObserved: true,
    });
    expect(trace.providerAttempt).toEqual({
      modelProvider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      thinkingLevel: "xhigh",
      reasoningLevel: "stream",
    });
    expect(trace.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_session_trace_attempt_thinking_xhigh_observed",
        "node_agent_session_trace_attempt_reasoning_stream_observed",
      ]),
    );
    expect(trace.missingOptics).toEqual([]);
    expect(JSON.stringify(trace)).not.toContain("raw provider");
  });

  it("surfaces missing first-turn optics without storing raw session material", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });

    const trace = buildNodeAgentSessionTrace({
      nodeRun: record,
      nodeExecutionSnapshot: built,
      status: "blocked",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: { calls: 0, tools: [] },
        },
      },
    });

    expect(trace.missingOptics).toEqual(
      expect.arrayContaining([
        "worker_prompt_authored_missing",
        "parent_session_start_missing",
        "first_plan_update_missing",
        "context_scout_spawn_missing",
        "terminal_node_finish_missing",
      ]),
    );
    expect(trace.storagePolicy.rawStoragePolicy).toMatchObject({
      rawPromptStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      hiddenReasoningStored: false,
    });
    expect(trace).not.toHaveProperty("rawPromptStored");
    expect(trace).not.toHaveProperty("rawTranscriptStored");
  });

  it("does not infer scout or validation delivery from a bare native task tool name", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
    };
    const finish = normalizeNodeFinish({
      nodeRunId: record.nodeRunId,
      raw: {
        status: "completed",
        summary: "Finished from direct tool summary fixture.",
        evidenceRefs: ["artifact://finish-evidence"],
      },
    });

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      status: "completed",
      finish,
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 4,
            tools: ["update_plan", "task", "edit", "node_finish"],
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.observedToolNames).toEqual(
      expect.arrayContaining(["update_plan", "task", "edit", "node_finish"]),
    );
    expect(trace.observations.contextScoutSpawnObserved).toBe(false);
    expect(trace.observations.childResultObserved).toBe(false);
    expect(trace.observations.validationActionObserved).toBe(false);
    expect(trace.observations.firstPlanUpdateObserved).toBe(false);
    expect(trace.observations.firstEditObserved).toBe(false);
    expect(trace.observations.sessionsYieldObserved).toBe(false);
    expect(trace.missingOptics).toEqual(
      expect.arrayContaining([
        "first_plan_update_missing",
        "context_scout_spawn_missing",
        "child_result_missing",
        "first_edit_missing",
        "validation_action_missing",
      ]),
    );
  });

  it("requires native task parent-decision footers when child and validation results are present", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
    };
    const finish = normalizeNodeFinish({
      nodeRunId: record.nodeRunId,
      raw: {
        status: "completed",
        summary: "Edited and validated.",
        evidenceRefs: ["artifact://validation-1"],
      },
    });

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      sessionTodo: {
        schemaVersion: 1,
        sessionKey: runningRecord.sessionKey,
        updatedAt: 1234,
        items: [{ content: "Edit target", status: "completed", priority: "high", position: 1 }],
        history: [
          {
            eventId: "todo-footer-proof",
            type: "todo.updated",
            updatedAt: 1234,
            itemCount: 1,
            completedCount: 1,
            inProgressCount: 0,
            items: [
              {
                content: "Edit target",
                status: "completed",
                priority: "high",
                position: 1,
              },
            ],
          },
        ],
      },
      status: "completed",
      finish,
      finishArtifactRef: "runtime-job://job-native-node/node-finish/impl-1",
      workerPromptArtifactRef: "runtime-job://job-native-node/node-worker-prompt/impl-1",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 6,
            tools: ["update_plan", "task", "edit", "node_finish"],
          },
          nodeAgentSessionTrace: {
            childSessionKeyRef: "agent:execution-context-scout:node:nrun_trace_context_scout",
            childResultRef: "runtime-job://job-native-node/subagent-result/context-scout-1",
            workingContextRef:
              "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_trace",
            workingContextEntryRef:
              "openclaw-session-working-context://agent%3Aexecution-coding%3Anode%3Anrun_trace/wctx_trace",
            workingContextHasInlineContextWindows: true,
            workingContextHasFileGraph: true,
            parentPostChildActionRef: "openclaw-tool-result://nrun_trace/plan-after-context",
            firstEditRef: "runtime-job://job-native-node/session-event/edit-1",
            validationScoutResultRef:
              "runtime-job://job-native-node/subagent-result/validation-scout-1",
            parentPostValidationActionRef:
              "openclaw-tool-result://nrun_trace/finish-after-validation",
            terminalNodeFinishRef: "runtime-job://job-native-node/node-finish/impl-1",
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.observations).toMatchObject({
      childResultObserved: true,
      contextDecisionFooterObserved: false,
      validationActionObserved: true,
      validationDecisionFooterObserved: false,
    });
    expect(trace.missingOptics).toEqual(
      expect.arrayContaining([
        "context_decision_footer_missing",
        "validation_decision_footer_missing",
      ]),
    );
    expect(trace.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_session_trace_missing:context_decision_footer_missing",
        "node_agent_session_trace_missing:validation_decision_footer_missing",
      ]),
    );
  });

  it("does not infer required optics from boolean-only native trace flags", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
    };

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      status: "needs_escalation",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 6,
            tools: ["update_plan", "task", "edit", "node_finish"],
          },
          nodeAgentSessionTrace: {
            firstPlanUpdateObserved: true,
            contextScoutSpawnObserved: true,
            childResultObserved: true,
            workingContextObserved: true,
            workingContextHasInlineContextWindows: true,
            workingContextHasFileGraph: true,
            parentSynthesisObserved: true,
            firstEditObserved: true,
            validationActionObserved: true,
            terminalNodeFinishObserved: true,
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.observations).toMatchObject({
      parentSessionStarted: true,
      firstPlanUpdateObserved: false,
      contextScoutSpawnObserved: false,
      childResultObserved: false,
      workingContextObserved: false,
      inlineContextWindowsObserved: false,
      fileGraphObserved: false,
      parentSynthesisObserved: false,
      firstEditObserved: false,
      validationActionObserved: false,
      terminalNodeFinishObserved: false,
    });
    expect(trace.missingOptics).toEqual(
      expect.arrayContaining([
        "first_plan_update_missing",
        "context_scout_spawn_missing",
        "child_result_missing",
        "working_context_missing",
        "inline_context_windows_missing",
        "file_graph_missing",
        "parent_post_child_action_missing",
        "first_edit_missing",
        "validation_action_missing",
        "terminal_node_finish_missing",
      ]),
    );
  });

  it("surfaces oversized child results as not delivered edit context", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
    };

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      status: "needs_escalation",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 2,
            tools: ["update_plan", "task"],
          },
          nodeAgentSessionTrace: {
            firstPlanUpdateRef:
              "openclaw-session-todo://agent%3Aexecution-coding%3Anode%3Anrun_test",
            scoutSpawnRef: "openclaw-native-task-result://run/task-oversized",
            childSessionKeyRef: "agent:execution-context-scout:subagent:child-oversized",
            childResultObserved: false,
            childResultOversized: true,
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.observations.contextScoutSpawnObserved).toBe(true);
    expect(trace.observations.childResultObserved).toBe(false);
    expect(trace.observations.childResultOversized).toBe(true);
    expect(trace.missingOptics).toEqual(expect.arrayContaining(["child_result_missing"]));
    expect(trace.reasonCodes).toEqual(
      expect.arrayContaining(["node_agent_session_trace_child_result_oversized_not_delivered"]),
    );
  });

  it("projects typed native task child-start failures into node-session readback", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
    };

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      status: "needs_escalation",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "completed",
          toolSummary: {
            calls: 2,
            tools: ["update_plan", "task"],
          },
          nodeAgentSessionTrace: {
            firstPlanUpdateRef:
              "openclaw-session-todo://agent%3Aexecution-coding%3Anode%3Anrun_test",
            scoutSpawnRef: "openclaw-native-task-result://run/task-workspace-failure",
            childStartFailures: [
              {
                requestedAgentId: "execution-context-scout",
                childSessionKey: null,
                taskRef: "openclaw-native-task-result://run/task-workspace-failure",
                status: "error",
                childStartFailureKind: "child_workspace_unavailable",
                error: "workspace directory unavailable",
              },
            ],
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.childStartFailures).toEqual([
      expect.objectContaining({
        requestedAgentId: "execution-context-scout",
        taskRef: "openclaw-native-task-result://run/task-workspace-failure",
        status: "error",
        childStartFailureKind: "child_workspace_unavailable",
        error: "workspace directory unavailable",
      }),
    ]);
    expect(trace.observations.childStartFailureObserved).toBe(true);
    expect(trace.missingOptics).toEqual(expect.arrayContaining(["child_result_missing"]));
    expect(trace.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_agent_session_trace_child_start_failure_observed",
        "node_agent_session_trace_child_start_failure:child_workspace_unavailable",
      ]),
    );
  });

  it("surfaces native task context-preservation precheck blocks", async () => {
    const executable = node({ requirementRefs: ["requirement://req-1"] });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const store = new InMemoryNodeExecutionRunStore();
    const record = await store.allocateOrLoadNodeRun({
      runtimeJobId: built.runtimeJobId,
      graphId: built.graphId,
      nodeId: built.nodeId,
      attemptId: built.attemptId,
      agentId: built.agentId,
      snapshotRef: built.snapshotRef,
      now,
    });
    const runningRecord: NodeExecutionRunRecord = {
      ...record,
      startedAt: now.toISOString(),
    };

    const trace = buildNodeAgentSessionTrace({
      nodeRun: runningRecord,
      nodeExecutionSnapshot: built,
      status: "needs_escalation",
      runResult: {
        payloads: [],
        meta: {
          durationMs: 1,
          stopReason: "context_overflow_precheck",
          toolSummary: {
            calls: 2,
            tools: ["update_plan", "task"],
          },
          nodeAgentSessionTrace: {
            firstPlanUpdateRef:
              "openclaw-session-todo://agent%3Aexecution-coding%3Anode%3Anrun_test",
            scoutSpawnRef: "openclaw-native-task-result://run/task-context",
            childSessionKeyRef: "agent:execution-context-scout:subagent:child-context",
            childResultRef: "openclaw-native-task-result://run/task-context/result",
            childResultObserved: true,
            nativeTaskContextPreservationBlocked: true,
            nativeTaskContextPreservationReason: "native_task_result_awaiting_parent_context",
            nativeTaskContextPreservationRoute: "compact_then_truncate",
          },
        },
      } as unknown as Parameters<typeof buildNodeAgentSessionTrace>[0]["runResult"],
    });

    expect(trace.observations.childResultObserved).toBe(true);
    expect(trace.observations.nativeTaskContextPreservationBlocked).toBe(true);
    expect(trace.reasonCodes).toEqual(
      expect.arrayContaining(["node_agent_session_trace_native_task_context_preservation_blocked"]),
    );
  });

  it("hydrates node snapshots, source prompt windows, and requirement refs through the generic resource bridge", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const bodies: Record<string, JsonValue> = {
      "artifact-window": {
        artifactKind: "source_prompt_window",
        windowRef: "source-prompt://abc123/body/0-120",
        text: "Operator asks for native node execution with node_finish evidence.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "artifact-map": {
        artifactKind: "requirement_map",
        requirements: [
          {
            requirementId: "req-1",
            text: "Run executable nodes through native OpenClaw agent sessions.",
            role: "runnable_work",
            sourceRefs: ["source-prompt://abc123/body/0-120"],
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-window",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_window",
            storageKind: "runtime-artifact-payload",
            uri: "source-prompt://abc123/body/0-120",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: { windowRef: "source-prompt://abc123/body/0-120" },
            createdAt: now,
          },
          {
            artifactId: "artifact-map",
            jobId: "job-native-node",
            artifactType: "execution_platform.requirement_map",
            storageKind: "runtime-artifact-payload",
            uri: "runtime-job://job-native-node/requirement-map/map",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {} as JsonValue,
            createdAt: now,
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: bodies[artifact.artifactId] ?? null,
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
    });

    const result = await tool.execute("resource-read", {
      refs: [built.snapshotRef, "source-prompt://abc123/body/0-120", "requirement://req-1"],
    });
    const text = result.content.find((entry) => entry.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe("hydrated");
    expect(parsed.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceKind: "node_execution_snapshot" }),
        expect.objectContaining({ resourceKind: "execution_platform.source_prompt_exact_range" }),
        expect.objectContaining({ resourceKind: "requirement" }),
      ]),
    );
    expect(JSON.stringify(parsed)).toContain("native OpenClaw agent sessions");
  });

  it("hydrates runtime-work-graph requirement aliases from RequirementMap backing artifacts", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: repositoryForBodies({
        artifacts: [
          artifact({
            artifactId: "artifact-map",
            artifactType: "execution_platform.requirement_map",
            uri: "runtime-job://job-native-node/requirement-map/map",
          }),
        ],
        bodies: {
          "artifact-map": {
            artifactKind: "requirement_map",
            requirements: [
              {
                requirementId: "req-1",
                text: "Implement the Product/Spec Planning plugin registration path.",
                role: "runnable_work",
                sourceRefs: ["source-prompt://abc123/body/0-120"],
              },
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        },
      }),
    });

    const result = await tool.execute("resource-read-requirement-alias", {
      ref: "runtime-work-graph://requirement/req-1",
    });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");

    expect(parsed.status).toBe("hydrated");
    expect(parsed.resources).toEqual([
      expect.objectContaining({
        resourceKind: "requirement",
      }),
    ]);
    expect(JSON.stringify(parsed)).toContain("Product/Spec Planning plugin registration path");
  });

  it("hydrates only node-scoped requirements when a worker asks for the RequirementMap backing artifact", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-map",
            jobId: "job-native-node",
            artifactType: "execution_platform.requirement_map",
            storageKind: "runtime-artifact-payload",
            uri: "runtime-job://job-native-node/requirement-map/map",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {} as JsonValue,
            createdAt: now,
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: {
            artifactKind: "requirement_map",
            mapRef: "runtime-job://job-native-node/requirement-map/map",
            sourcePromptBodyRef: "source-prompt://abc123/body",
            requirements: [
              {
                requirementId: "req-1",
                text: "Run executable nodes through native OpenClaw agent sessions.",
                role: "runnable_work",
                sourceRefs: ["source-prompt://abc123/body/0-120"],
              },
              {
                requirementId: "req-secret",
                text: "Unrelated requirement must not leak to this worker.",
                role: "runnable_work",
                sourceRefs: ["source-prompt://secret/body/0-120"],
              },
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
    });

    const result = await tool.execute("resource-read-map", {
      ref: "runtime-job://job-native-node/requirement-map/map",
    });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");

    expect(parsed.status).toBe("hydrated");
    expect(parsed.resources).toEqual([
      expect.objectContaining({
        resourceKind: "execution_platform.node_scoped_requirement_map_view",
      }),
    ]);
    expect(JSON.stringify(parsed)).toContain("native OpenClaw agent sessions");
    expect(JSON.stringify(parsed)).not.toContain("Unrelated requirement");
    expect(JSON.stringify(parsed)).not.toContain("req-secret");
  });

  it("authors a comprehensive node worker prompt through text mode without prompt tools", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    let textTurnUserPayloadText = "";
    const result = await authorNodeExecutionPrompt({
      nodeExecutionSnapshot: built,
      repository: repositoryForBodies({
        artifacts: [
          artifact({
            artifactId: "artifact-map",
            artifactType: "execution_platform.requirement_map",
            uri: "runtime-job://job-native-node/requirement-map/map",
          }),
          artifact({
            artifactId: "artifact-window",
            artifactType: "execution_platform.source_prompt_window",
            uri: "source-prompt://abc123/body/0-120",
            metadata: {
              windowRef: "source-prompt://abc123/body/0-120",
              sourcePromptBodyRef: "source-prompt://abc123/body",
              start: 0,
              end: 120,
            },
          }),
        ],
        bodies: {
          "artifact-map": {
            artifactKind: "requirement_map",
            requirements: [
              {
                requirementId: "req-1",
                text: "Wire native OpenClaw node sessions into execution scheduling.",
                role: "runnable_work",
                doneWhen:
                  "The execution node starts a native agent session and returns node_finish.",
                sourceRefs: ["source-prompt://abc123/body/0-120"],
              },
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          "artifact-window": {
            artifactKind: "source_prompt_window",
            windowRef: "source-prompt://abc123/body/0-120",
            sourcePromptBodyRef: "source-prompt://abc123/body",
            start: 0,
            end: 120,
            text: "Operator prompt: implement Product/Spec Planning through native OpenClaw node execution.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        },
      }),
      modelClient: {
        executeProviderTextTurn: async (request) => {
          if (typeof request.userPayload !== "string") {
            throw new Error("expected prompt authoring user payload to be a string");
          }
          textTurnUserPayloadText = request.userPayload;
          expect(request.providerPath).toBe("openrouter");
          expect(request.modelRef).toBe("moonshotai/kimi-k2.6");
          expect(request.taskClass).toBeUndefined();
          expect(request.modelTaskCallSite).toBe("node_lifecycle.node_worker_prompt_authoring");
          expect(request.maxOutputTokens).toBe(8000);
          expect(request.timeoutMs).toBe(90000);
          expect(request.providerMessages).toEqual([
            expect.objectContaining({ role: "system" }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("### Output Contract"),
            }),
          ]);
          expect(textTurnUserPayloadText).toContain("### Full Original Prompt Source");
          expect(textTurnUserPayloadText).toContain("### Output Contract");
          expect(textTurnUserPayloadText).toContain(
            "The final worker prompt should be self-contained enough to start from directly",
          );
          expect(textTurnUserPayloadText).toContain(
            "Do not make exact-ref hydration the default first move",
          );
          expect(textTurnUserPayloadText).not.toContain("If the inline source is insufficient");
          expect(textTurnUserPayloadText).not.toContain('"sourceMaterialText"');
          expect(textTurnUserPayloadText).not.toContain('"requiredPromptQualities"');
          expect(textTurnUserPayloadText).not.toContain('"requirementId"');
          expect(textTurnUserPayloadText).toContain("Requirement id: req-1");
          return {
            modelRunRef: "openrouter://moonshotai/kimi-k2.6/prompt-author-fixture",
            responseHash: "worker-prompt-response-hash",
            latencyMs: 1,
            responseText: [
              "# Node Assignment: Native OpenClaw Node Session Wiring",
              `Node: ${built.nodeId}`,
              `Node run: ${built.nodeRunId}`,
              "",
              "## Mission",
              "Wire native OpenClaw node sessions into execution scheduling for this assigned node, using the Product/Spec prompt only as source context.",
              "",
              "## Assigned Requirements",
              "- req-1: make the execution node start a native OpenClaw agent session and return node_finish evidence. Source: source-prompt://abc123/body/0-120.",
              "",
              "## Relevant Mission Context",
              "The larger proof concerns Product/Spec Planning, but this node owns only the native node-session wiring requirement.",
              "",
              "## What To Change",
              "Use the active execution-node-workflow skill. Start from this prompt, use exact refs only for a specific missing runtime/source fact, delegate weak repo mapping to context scout, then edit the minimum useful runtime or test surface needed to wire the session correctly.",
              "",
              "## Suggested Starting Points",
              'First move: call update_plan. Decide whether this prompt already gives enough edit-ready context; if a specific supplied ref blocks the next decision use openclaw_resource_read, and if repo mapping is weak call native task with agentId:"execution-context-scout" for bounded inline source windows around node session and node_finish wiring.',
              "",
              "## In Scope",
              "- Native node session wiring.",
              "- Focused tests for node_finish evidence.",
              "",
              "## Out Of Scope",
              "- Product/Spec-only shortcuts.",
              "- Raw artifact dumps or scheduler ownership changes.",
              "",
              "## Done When",
              "Done when the execution node starts a native agent session, uses a context-task/edit/validation-task/repair loop, and can terminalize with node_finish.",
              "",
              "## Required Evidence",
              "Final evidence must include changed files, validation performed through execution-validation-scout when non-trivial, and any remaining blocker.",
              "",
              "## Blocker Rules",
              "Use execution-context-scout when repo mapping is weak and require actual code/source windows inline. Emit a typed blocker if node_finish cannot be wired.",
            ].join("\n"),
            providerDiagnostics: {
              providerKind: "openrouter",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        },
      },
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("fixture expected accepted worker prompt");
    }
    expect(textTurnUserPayloadText).toContain("Wire native OpenClaw node sessions");
    expect(textTurnUserPayloadText).toContain("Operator prompt: implement Product/Spec Planning");
    expect(result.promptText).toContain("# Node Assignment: Native OpenClaw Node Session Wiring");
    expect(result.promptText).toContain("update_plan");
    expect(result.promptText).toContain('agentId:"execution-context-scout"');
    expect(result.promptText).toContain("execution-validation-scout");
    expect(result.promptText).toContain("specific missing runtime/source fact");
    expect(result.promptText).not.toContain("Search for node session");
    expect(result.promptText).not.toContain("search/edit/validate loop");
    expect(result.promptText).not.toContain("Then use openclaw_resource_read");
    expect(result.promptText).toContain("## Done When");
    expect(result.promptText).toContain("## Required Evidence");
    expect(result.promptText).not.toContain("## Runtime-Supplied Source Material");
    expect(result.promptText).not.toContain("Operator prompt: implement Product/Spec Planning");
    expect(result.promptText).not.toContain("## Execution Platform Node Prompt Source Material");
    expect(result.workerPrompt).toMatchObject({
      artifactKind: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
      nodeRunId: built.nodeRunId,
      nodeId: built.nodeId,
      runtimeJobId: built.runtimeJobId,
      snapshotRef: built.snapshotRef,
      modelRunRef: "openrouter://moonshotai/kimi-k2.6/prompt-author-fixture",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      hiddenReasoningStored: false,
    });
    expect(result.workerPrompt.promptText).toBe(result.promptText);
    expect(result.workerPrompt.promptByteCount).toBeGreaterThan(100);
    expect(result.workerPrompt.reasonCodes).toContain(
      "node_agent_worker_prompt_is_standalone_synthesized_assignment",
    );
    expect(result.workerPrompt.requirementRefs).toEqual(["req-1"]);
    expect(result.workerPrompt.sourcePromptRefs).toEqual([
      "source-prompt://abc123/body/0-120",
      "source-prompt://prompt-1#span-2",
    ]);
  });

  it("preserves provider diagnostics when node worker prompt authoring returns empty text", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });

    const result = await authorNodeExecutionPrompt({
      nodeExecutionSnapshot: built,
      repository: repositoryForBodies({
        artifacts: [
          artifact({
            artifactId: "artifact-map",
            artifactType: "execution_platform.requirement_map",
            uri: "runtime-job://job-native-node/requirement-map/map",
          }),
          artifact({
            artifactId: "artifact-window",
            artifactType: "execution_platform.source_prompt_window",
            uri: "source-prompt://abc123/body/0-120",
            metadata: {
              windowRef: "source-prompt://abc123/body/0-120",
              sourcePromptBodyRef: "source-prompt://abc123/body",
              start: 0,
              end: 120,
            },
          }),
        ],
        bodies: {
          "artifact-map": {
            artifactKind: "requirement_map",
            requirements: [
              {
                requirementId: "req-1",
                text: "Wire native OpenClaw node sessions into execution scheduling.",
                role: "runnable_work",
                doneWhen:
                  "The execution node starts a native agent session and returns node_finish.",
                sourceRefs: ["source-prompt://abc123/body/0-120"],
              },
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          "artifact-window": {
            artifactKind: "source_prompt_window",
            windowRef: "source-prompt://abc123/body/0-120",
            sourcePromptBodyRef: "source-prompt://abc123/body",
            start: 0,
            end: 120,
            text: "Operator prompt: implement Product/Spec Planning through native OpenClaw node execution.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        },
      }),
      modelClient: {
        executeProviderTextTurn: async () => ({
          modelRunRef: "openrouter://moonshotai/kimi-k2.6/empty-text",
          responseHash: "empty-text-response-hash",
          latencyMs: 6789,
          responseText: "",
          providerDiagnostics: {
            artifactKind: "provider_text_turn_transport_diagnostics",
            status: "needs_review",
            providerPath: "openrouter",
            modelRef: "moonshotai/kimi-k2.6",
            responseTextPresent: false,
            errorReasonCode: "openrouter_no_content_finish_length",
            httpStatus: 200,
            providerResponseDiagnostics: {
              finishReason: "length",
              contentType: "undefined",
              contentLength: 0,
              providerUsage: {
                promptTokens: 2345,
                completionTokens: 0,
                totalTokens: 2345,
              },
              requestProfileDiagnostics: {
                maxTokens: 4000,
                promptByteLength: 31327,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }),
      },
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      reasoningEffort: "xhigh",
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("fixture expected blocked prompt authoring");
    }
    expect(result.diagnostic).toMatchObject({
      blockerKind: "node_worker_prompt_authoring_failed",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      reasoningEffort: "xhigh",
      responseHash: "empty-text-response-hash",
      modelRunRef: "openrouter://moonshotai/kimi-k2.6/empty-text",
      latencyMs: 6789,
      requestedMaxOutputTokens: 8000,
      errorReasonCode: "openrouter_no_content_finish_length",
      httpStatus: 200,
      finishReason: "length",
      contentType: "undefined",
      contentLength: 0,
      providerUsage: {
        promptTokens: 2345,
        completionTokens: 0,
        totalTokens: 2345,
      },
      requestProfileDiagnostics: {
        maxTokens: 4000,
        promptByteLength: 31327,
      },
      providerDiagnostics: expect.objectContaining({
        providerResponseDiagnostics: expect.objectContaining({
          finishReason: "length",
        }),
      }),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      hiddenReasoningStored: false,
    });
    expect(result.reasonCodes).toContain(
      "node_worker_prompt_authoring_error:model_text_turn_empty_response:node_lifecycle:node_worker_prompt_authoring",
    );
  });

  it("hydrates exact source prompt evidence ranges from containing prompt window artifacts", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/15-47"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-containing-window",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_window",
            storageKind: "runtime-artifact-payload",
            uri: "source-prompt://abc123/body/0-80",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              windowRef: "source-prompt://abc123/body/0-80",
              sourcePromptBodyRef: "source-prompt://abc123/body",
              sourcePromptHash: "abc123",
              start: 0,
              end: 80,
              promptLength: 80,
            } as JsonValue,
            createdAt: now,
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: {
            artifactKind: "source_prompt_window",
            windowRef: "source-prompt://abc123/body/0-80",
            sourcePromptBodyRef: "source-prompt://abc123/body",
            sourcePromptHash: "abc123",
            start: 0,
            end: 80,
            promptLength: 80,
            text: "Operator needs Product/Spec Planning plugin registration and runtime kernel.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
    });

    const result = await tool.execute("resource-read-exact-source-range", {
      ref: "source-prompt://abc123/body/15-47",
    });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");

    expect(parsed.status).toBe("hydrated");
    expect(parsed.resources).toEqual([
      expect.objectContaining({
        resourceKind: "execution_platform.source_prompt_exact_range",
      }),
    ]);
    expect(JSON.stringify(parsed)).toContain("Product/Spec Planning plugin");
    expect(JSON.stringify(parsed)).toContain(
      "openclaw_resource_read_hydrated_source_prompt_exact_range_from_containing_window",
    );
  });

  it("hydrates source prompt body refs as bounded manifests, not raw full prompts", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/15-47"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-source-prompt",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_artifact",
            storageKind: "runtime-artifact-payload",
            uri: "runtime-job://job-native-node/source-prompt/artifact/abc123",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              sourcePromptBodyRef: "source-prompt://abc123/body",
              promptLength: 80,
            } as JsonValue,
            createdAt: now,
          },
          {
            artifactId: "artifact-containing-window",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_window",
            storageKind: "runtime-artifact-payload",
            uri: "source-prompt://abc123/body/0-80",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              windowRef: "source-prompt://abc123/body/0-80",
              sourcePromptBodyRef: "source-prompt://abc123/body",
              start: 0,
              end: 80,
            } as JsonValue,
            createdAt: now,
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => {
          const body: JsonValue =
            artifact.artifactType === "execution_platform.source_prompt_artifact"
              ? {
                  artifactKind: "source_prompt_artifact",
                  sourcePromptBodyRef: "source-prompt://abc123/body",
                  promptLength: 80,
                  boundedPreview: "Operator needs Product/Spec Planning plugin registration.",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }
              : {
                  artifactKind: "source_prompt_window",
                  windowRef: "source-prompt://abc123/body/0-80",
                  sourcePromptBodyRef: "source-prompt://abc123/body",
                  start: 0,
                  end: 80,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                };
          return {
            artifact,
            contract: null,
            status: "payload_hydrated",
            body,
            payload: null,
            reasonCodes: ["fixture_hydrated"],
            legacyHydrated: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          };
        },
      },
    });

    const result = await tool.execute("resource-read-source-body", {
      ref: "source-prompt://abc123/body",
    });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");

    expect(parsed.status).toBe("hydrated");
    expect(parsed.resources).toEqual([
      expect.objectContaining({
        resourceKind: "execution_platform.source_prompt_body_manifest",
      }),
    ]);
    expect(JSON.stringify(parsed)).toContain("authorizedWindows");
    expect(JSON.stringify(parsed)).toContain(
      "Request exact source-prompt://.../body/start-end refs",
    );
  });

  it("finds early source prompt window artifacts that fall outside the newest artifact page", async () => {
    const executable = node({
      requirementRefs: ["req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const listOrders: Array<"asc" | "desc" | undefined> = [];
    const earlyWindowArtifact: RuntimeJobArtifact = {
      artifactId: "artifact-window",
      jobId: "job-native-node",
      artifactType: "execution_platform.source_prompt_window",
      storageKind: "runtime-artifact-payload",
      uri: "source-prompt://abc123/body/0-120",
      contentType: "application/json",
      sizeBytes: null,
      sha256: null,
      metadata: { windowRef: "source-prompt://abc123/body/0-120" } as JsonValue,
      createdAt: now,
    };
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async (_jobId, input) => {
          listOrders.push(input?.order);
          return input?.order === "asc" ? [earlyWindowArtifact] : [];
        },
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: {
            artifactKind: "source_prompt_window",
            windowRef: "source-prompt://abc123/body/0-120",
            text: "Early prompt window body with keyword signal.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
    });

    const result = await tool.execute("resource-read-early-window", {
      ref: "source-prompt://abc123/body/0-120",
    });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");

    expect(listOrders).toEqual(expect.arrayContaining(["desc", "asc"]));
    expect(parsed.status).toBe("hydrated");
    expect(JSON.stringify(parsed)).toContain("Early prompt window body with keyword signal");
  });

  it("uses provider-safe node tool names so dotted OpenRouter calls cannot collide with read", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const resourceTool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [],
        hydrateRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
      },
    });
    const finishTool = createNodeFinishTool({ nodeRunId: built.nodeRunId });

    expect(resourceTool.name).toBe(OPENCLAW_RESOURCE_READ_TOOL_NAME);
    expect(finishTool.name).toBe(NODE_FINISH_TOOL_NAME);
    expect(resourceTool.name).not.toContain(".");
    expect(finishTool.name).not.toContain(".");

    const result = await resourceTool.execute("resource-read", { ref: built.snapshotRef });
    const parsed = JSON.parse(result.content.find((entry) => entry.type === "text")?.text ?? "{}");
    expect(parsed.status).toBe("hydrated");
    expect(parsed.requestedRefCount).toBe(1);
  });

  it("does not hydrate runtime artifacts outside the current node snapshot authority", async () => {
    const executable = node({
      requirementRefs: ["requirement://req-1"],
      sourcePromptRefs: ["source-prompt://abc123/body/0-120"],
    });
    const built = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: snapshot([executable]),
      graphId: "graph-native-node",
      node: executable,
      attemptId: "attempt-1",
    });
    const bodies: Record<string, JsonValue> = {
      "artifact-authorized-window": {
        artifactKind: "source_prompt_window",
        windowRef: "source-prompt://abc123/body/0-120",
        text: "Authorized prompt window body.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      "artifact-secret-window": {
        artifactKind: "source_prompt_window",
        windowRef: "source-prompt://secret/body/0-120",
        text: "Secret unrelated prompt window body.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };
    const tool = createExecutionPlatformResourceReadTool({
      runtimeJobId: "job-native-node",
      nodeExecutionSnapshot: built,
      repository: {
        attachRuntimeArtifactByContract: async () => {
          throw new Error("not used");
        },
        listArtifacts: async () => [
          {
            artifactId: "artifact-secret-window",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_window",
            storageKind: "runtime-artifact-payload",
            uri: "source-prompt://secret/body/0-120",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: {
              windowRef: "source-prompt://secret/body/0-120",
              sourceRefs: ["source-prompt://abc123/body/0-120"],
            },
            createdAt: now,
          },
          {
            artifactId: "artifact-authorized-window",
            jobId: "job-native-node",
            artifactType: "execution_platform.source_prompt_window",
            storageKind: "runtime-artifact-payload",
            uri: "source-prompt://abc123/body/0-120",
            contentType: "application/json",
            sizeBytes: null,
            sha256: null,
            metadata: { windowRef: "source-prompt://abc123/body/0-120" } as JsonValue,
            createdAt: now,
          },
        ],
        hydrateRuntimeArtifactByContract: async (artifact) => ({
          artifact,
          contract: null,
          status: "payload_hydrated",
          body: bodies[artifact.artifactId] ?? null,
          payload: null,
          reasonCodes: ["fixture_hydrated"],
          legacyHydrated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        }),
      },
    });

    const authorizedResult = await tool.execute("resource-read-authorized", {
      ref: "source-prompt://abc123/body/0-120",
    });
    const authorizedParsed = JSON.parse(
      authorizedResult.content.find((entry) => entry.type === "text")?.text ?? "{}",
    );
    expect(authorizedParsed.status).toBe("hydrated");
    expect(JSON.stringify(authorizedParsed)).toContain("Authorized prompt window body");

    const unauthorizedResult = await tool.execute("resource-read-unauthorized", {
      ref: "source-prompt://secret/body/0-120",
    });
    const unauthorizedParsed = JSON.parse(
      unauthorizedResult.content.find((entry) => entry.type === "text")?.text ?? "{}",
    );
    expect(unauthorizedParsed.status).toBe("unauthorized");
    expect(unauthorizedParsed.resources).toEqual([
      expect.objectContaining({
        ref: "source-prompt://secret/body/0-120",
        status: "unauthorized",
        body: null,
        reasonCodes: ["openclaw_resource_read_ref_outside_node_authority"],
      }),
    ]);
    expect(JSON.stringify(unauthorizedParsed)).not.toContain("Secret unrelated prompt window body");
  });
});
