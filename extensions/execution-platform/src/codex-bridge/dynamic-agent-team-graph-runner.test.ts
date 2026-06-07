import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { CodingTeamRuntimeJobRunner } from "./coding-team-runtime-job-runner.ts";
import { CodexDynamicJsonClient } from "./dynamic-agent-team-graph-runner.ts";

describe("dynamic agent-team graph production path", () => {
  it("delegates generic runtime artifact lifecycle to the generic execution service", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("runAndPersistGenericSchedulerGraph");
    expect(source).toContain("../workflows/generic-orchestration-runtime-execution.ts");
    expect(source).toContain("buildCodingTeamSchedulerExecutorMap");
    expect(source).toContain("nodeAgentSessionRunner: this.options.nodeAgentSessionRunner");
    expect(source).toContain("resolveNodeAgentProfile: this.options.resolveNodeAgentProfile");
    expect(source).not.toContain("workerExecutionPackets");
    expect(source).not.toContain('artifactType: "execution_platform.worker_start_contract"');
    expect(source).not.toContain("buildImplementationTaskPacket");
    expect(source).not.toContain("buildWorkerStartContract");
    expect(source).not.toContain("new NonCodexToolUsingWorkerLoop");
    expect(source).not.toContain("new ModelAgnosticFileEditWorkerAdapter");
    expect(source).not.toContain("new GenericOrchestrationRuntime(");
    expect(source).not.toContain("genericOrchestrationRuntimeResultArtifactMetadata");
    expect(source).not.toContain("genericRuntimeSpineLifecycleArtifactMetadata");
    expect(source).not.toContain("genericRuntimeSpineReadinessArtifactMetadata");
  });

  it("routes OpenRouter dynamic JSON calls through the OpenRouter role client", async () => {
    const calls: Array<{
      modelId: string;
      maxTokens?: number;
      taskClass?: string;
      modelTaskCallSite?: string;
    }> = [];
    const client = new CodexDynamicJsonClient(process.cwd(), {
      openRouterClient: {
        async callRole(input) {
          calls.push({
            modelId: input.modelId,
            maxTokens: input.maxTokens,
            taskClass: input.taskClass,
            modelTaskCallSite: input.modelTaskCallSite,
          });
          return {
            status: "succeeded",
            responseText: JSON.stringify({ ok: true }),
            responseHash: createHash("sha256")
              .update(JSON.stringify({ ok: true }))
              .digest("hex"),
            usage: { inputTokenCount: 10, outputTokenCount: 5, totalTokenCount: 15 },
            providerResponseDiagnostics: {
              providerKind: "openrouter",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          };
        },
      },
    });

    const progressPhases: string[] = [];
    const result = await client.runJson({
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      systemPrompt: "Return JSON.",
      userPayload: { objective: "extract RequirementMap requirements" },
      maxOutputTokens: 8_000,
      timeoutMs: 90_000,
      reasoningEffort: "none",
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "intake.requirement_map.native_tool_batch",
      progress: {
        onEvent: (event) => {
          progressPhases.push(event.phase);
        },
      },
    });

    expect(result.responseText).toBe(JSON.stringify({ ok: true }));
    expect(calls).toEqual([
      {
        modelId: "qwen/qwen3-coder-next",
        maxTokens: 8_000,
        taskClass: "local_semantic_extraction",
        modelTaskCallSite: "intake.requirement_map.native_tool_batch",
      },
    ]);
    expect(progressPhases).toEqual(["started", "completed"]);
  });

  it("routes OpenRouter dynamic tool turns through the OpenRouter native tool client", async () => {
    const calls: Array<{
      modelId: string;
      allowedToolNames: string[];
      taskClass?: string;
      modelTaskCallSite?: string;
      maxAcceptedToolCalls?: number | null;
    }> = [];
    const client = new CodexDynamicJsonClient(process.cwd(), {
      openRouterClient: {
        async callRole() {
          throw new Error("callRole should not be used for dynamic tool calls");
        },
        async callTools(input) {
          calls.push({
            modelId: input.modelId,
            allowedToolNames: input.allowedToolNames,
            taskClass: input.taskClass,
            modelTaskCallSite: input.modelTaskCallSite,
            maxAcceptedToolCalls: input.maxAcceptedToolCalls ?? null,
          });
          const responseText = JSON.stringify({
            toolCalls: [
              {
                toolName: "scheduler_add_capability_selection",
                toolArguments: {
                  workUnitId: "wu-core",
                  selectedCapabilityId: "capability://implementation/qwen",
                },
                callId: "call-1",
              },
            ],
          });
          return {
            status: "succeeded",
            responseText,
            responseHash: createHash("sha256").update(responseText).digest("hex"),
            toolCalls: [
              {
                toolName: "scheduler_add_capability_selection",
                toolArguments: {
                  workUnitId: "wu-core",
                  selectedCapabilityId: "capability://implementation/qwen",
                },
                callId: "call-1",
              },
            ],
            usage: { inputTokenCount: 20, outputTokenCount: 10, totalTokenCount: 30 },
            providerResponseDiagnostics: {
              providerKind: "openrouter",
              toolCallCount: 1,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          };
        },
      },
    });

    const progressPhases: string[] = [];
    const result = await client.executeProviderToolTurn?.({
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      systemPrompt: "Call the scheduler tool.",
      userPayload: { workUnitId: "wu-core" },
      tools: [
        {
          name: "scheduler_add_capability_selection",
          description: "Select a capability.",
          inputSchema: { type: "object" },
        },
      ],
      allowedToolNames: ["scheduler_add_capability_selection"],
      maxAcceptedToolCalls: 1,
      maxOutputTokens: 1_000,
      timeoutMs: 90_000,
      reasoningEffort: "none",
      taskClass: "tool_selection",
      modelTaskCallSite: "scheduler.capability_selection.parallel_phase_fill",
      progress: {
        onEvent: (event) => {
          progressPhases.push(event.phase);
        },
      },
    });

    expect(result).toMatchObject({
      toolCalls: [
        {
          toolName: "scheduler_add_capability_selection",
          toolArguments: {
            workUnitId: "wu-core",
            selectedCapabilityId: "capability://implementation/qwen",
          },
          callId: "call-1",
        },
      ],
    });
    expect(calls).toEqual([
      {
        modelId: "qwen/qwen3-coder-next",
        allowedToolNames: ["scheduler_add_capability_selection"],
        taskClass: "tool_selection",
        modelTaskCallSite: "scheduler.capability_selection.parallel_phase_fill",
        maxAcceptedToolCalls: 1,
      },
    ]);
    expect(progressPhases).toEqual(["started", "completed"]);
  });

  it("labels Codex app-server tool turns as dynamic tool events, not JSON-shaped scheduler transport", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("toolTransportReality =");
    expect(source).toContain('"codex_app_server_dynamic_tool_events"');
    expect(source).toContain('"json_object_adapter_payload"');
    expect(source).toContain("this.executor.executeTools(request)");
    expect(source).toContain("dynamicToolEventsCaptured: true");
  });

  it("does not use shared context handoff aggregate tail as current-node handoff evidence", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("resourceHandoffPacketRefs");
  });

  it("does not retain the retired packet semantic normalization path", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("mergeCommitmentPacketSemanticDraft");
    expect(source).not.toContain("normalizeCommitmentPacketSemanticDraftForCompilation");
    expect(source).not.toContain("packetSemanticContent");
  });

  it("does not retain the retired staged Mission Ledger diagnostic path", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("stagedMissionLedgerDiagnosticAllowed");
    expect(source).not.toContain("stagedMissionLedgerDiagnosticRequested");
    expect(source).not.toContain("OPENCLAW_ENABLE_STAGED_MISSION_LEDGER_DIAGNOSTIC");
    expect(source).not.toContain("createStagedDiagnosticMissionLedger");
  });

  it("does not retain the retired context synthesis executor path", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("contextSynthesisExecutor");
    expect(source).not.toContain("context_synthesis_core_model_call");
    expect(source).not.toContain("context_synthesis_group_expansion_model_call");
    expect(source).not.toContain("qwen3-coder-next-context-synthesis-expansion");
  });

  it("uses RequirementMap intake and does not retain retired packet authoring", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("new IntakeStageRunner");
    expect(source).toContain("requirementMap: latestRequirementMap");
    expect(source).not.toContain("const authornode source contracts");
    expect(source).not.toContain("CommitmentPacketAuthoringStage");
    expect(source).not.toContain("packetPreauthorToolCallManifest");
    expect(source).not.toContain("packetSemanticToolCallManifest");
    expect(source).not.toContain("OPENCLAW_COMMITMENT_PACKET_AUTHOR_MODEL_REF");
  });

  it("rejects retired legacy fixed-runner flags instead of entering compatibility execution", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "dynamic-agent-team-retired-legacy-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Attempt to force the retired fixed runner.",
          legacyFixedDynamicRunner: true,
          proofOnlyLegacyFixedDynamicRunner: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const result = await new CodingTeamRuntimeJobRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "dynamic-agent-team-retired-legacy-runner-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(result.completed).toBe(false);
      expect(result.failure).toMatchObject({
        stage: "agent_team_run_once",
        message: "legacy_fixed_dynamic_runner_retired",
      });
      const events = await runtimeJobs.listEvents("dynamic-agent-team-retired-legacy-runner-job");
      expect(events.map((event) => event.eventType)).toContain(
        "agent_team.legacy_fixed_runner_rejected",
      );
    } finally {
      await database.close();
    }
  });
});
