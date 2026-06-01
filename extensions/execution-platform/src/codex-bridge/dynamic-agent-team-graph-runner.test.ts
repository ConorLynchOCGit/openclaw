import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import { registerValidationQaRuntimeTools } from "../workflows/validation-qa-runtime-tools.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import { registerCloseoutFinalizationRuntimeTools } from "./closeout-finalization-runtime-tools.ts";
import { registerCloseoutGenerateRuntimeTool } from "./closeout-generate-runtime-tool.ts";
import { CodingTeamRuntimeJobRunner } from "./coding-team-runtime-job-runner.ts";
import {
  CodexDynamicJsonClient,
  boundedSchedulerRoleInvocationMetadata,
  normalizedRepoFileRef,
  resolveImplementationMaterializationTargetRefs,
  roleModelCandidatesFor,
  roleModelFailureIsRetryable,
} from "./dynamic-agent-team-graph-runner.ts";
import type { CloseoutCapsuleReporterInput } from "./model-closeout-capsule-reporter.ts";

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
    expect(source).toContain("nodeExecutionContract: workerExecutionPackets.nodeExecutionContract");
    expect(source).toContain("nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket");
    expect(source).toContain("codingResourcePacket: workerExecutionPackets.codingResourcePacket");
    expect(source).not.toContain("new GenericOrchestrationRuntime(");
    expect(source).not.toContain("genericOrchestrationRuntimeResultArtifactMetadata");
    expect(source).not.toContain("genericRuntimeSpineLifecycleArtifactMetadata");
    expect(source).not.toContain("genericRuntimeSpineReadinessArtifactMetadata");
  });

  it("uses a context-scout-suitable model policy and retries bounded finish-length provider failures", () => {
    const contextScoutCandidates = roleModelCandidatesFor("resource_specialist_subturn");
    expect(contextScoutCandidates[0]).toMatchObject({
      modelId: "qwen/qwen3-coder-next",
      candidateId: "qwen3-coder-next-context-scout",
    });
    expect(contextScoutCandidates[0]?.maxTokens ?? 0).toBeGreaterThanOrEqual(8_000);
    expect(contextScoutCandidates.map((candidate) => candidate.modelId)).toEqual([
      "qwen/qwen3-coder-next",
    ]);
    expect(
      roleModelFailureIsRetryable({
        status: "failed",
        errorReasonCode: "openrouter_no_content_finish_length",
      } as never),
    ).toBe(true);
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
            responseHash: createHash("sha256").update(JSON.stringify({ ok: true })).digest("hex"),
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
      userPayload: { objective: "extract mission commitments" },
      maxOutputTokens: 8_000,
      timeoutMs: 90_000,
      reasoningEffort: "none",
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "mission_ledger.production_single_pass",
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
        modelTaskCallSite: "mission_ledger.production_single_pass",
      },
    ]);
    expect(progressPhases).toEqual(["started", "completed"]);
  });

  it("normalizes common in-repo context-scout file ref forms without widening outside repo", () => {
    expect(
      normalizedRepoFileRef(
        "/root/services/openclaw-roles/live/extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
        "/root/services/openclaw-roles/live",
      ),
    ).toBe("extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts");
    expect(
      normalizedRepoFileRef(
        "repo://extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        "/root/services/openclaw-roles/live",
      ),
    ).toBe("extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts");
    expect(normalizedRepoFileRef("/etc/passwd", "/root/services/openclaw-roles/live")).toBeNull();
    expect(normalizedRepoFileRef("../outside.ts", "/root/services/openclaw-roles/live")).toBeNull();
  });

  it("keeps broad implementation directory seeds from being promoted by context edit points", () => {
    const targetRefs = resolveImplementationMaterializationTargetRefs({
      metadataTargetRefs: [
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/codex-bridge/",
      ],
      verifiedContextFileRefs: [
        "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ],
      fileChangeIntents: [
        {
          fileRef: "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
        },
        {
          fileRef:
            "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        },
        {
          fileRef: "docs/projects/execution-platform/specs/product-spec.md",
        },
      ],
      repoRoot: process.cwd(),
    });

    expect(targetRefs).toEqual([
      "extensions/execution-platform/src/workflows/",
      "extensions/execution-platform/src/codex-bridge/",
    ]);
  });

  it("does not use shared context handoff aggregate tail as current-node handoff evidence", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("resourceHandoffPacketRefs.at(-1)");
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

  it("bounds scheduler role invocation metadata so large context output cannot block node completion", () => {
    const metadata = boundedSchedulerRoleInvocationMetadata({
      roleId: "resource_scout",
      nodeId: "context-scout-large",
      graphId: "graph-1",
      responseHash: "sha256:test",
      closeout: {
        roleId: "resource_scout",
        agentId: "resource_scout",
        modelRef: "qwen/qwen3-coder-next",
        modelRunRef: "run-1",
        source: "model",
        askedToDo: "Scout context.",
        actuallyDid: "Returned context.",
        whatIWasAskedToDo: "Scout context.",
        whatIActuallyDid: "Returned context.",
        evidenceRefs: Array.from(
          { length: 80 },
          (_, index) => `runtime-job://job/evidence/${index}`,
        ),
        filesOrArtifactsTouched: Array.from(
          { length: 80 },
          (_, index) => `extensions/execution-platform/src/file-${index}.ts`,
        ),
        validationIPerformed: "No validation.",
        worked: ["Context produced."],
        failedOrWeak: [],
        wouldImproveNext: [],
        recommendedNextStep: "Continue.",
        skillOrProcessOpportunitySeeds: [],
        opportunitySeeds: [],
        confidence: "medium",
        limitations: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      contextScoutOutput: {
        relevantFiles: Array.from({ length: 120 }, (_, index) => ({
          path: `extensions/execution-platform/src/very-large-file-${index}.ts`,
          whyRelevant: "x".repeat(2_000),
          keySymbolsOrFunctions: Array.from(
            { length: 40 },
            (__, symbolIndex) => `symbol${symbolIndex}`,
          ),
        })),
        existingPatterns: Array.from({ length: 80 }, () => "pattern ".repeat(500)),
        recommendedEditPoints: Array.from({ length: 80 }, (_, index) => ({
          path: `extensions/execution-platform/src/very-large-file-${index}.ts`,
          symbolOrRegion: `region${index}`,
          reason: "reason ".repeat(500),
        })),
        validationSuggestions: Array.from({ length: 80 }, () => "validate ".repeat(500)),
        risks: Array.from({ length: 80 }, () => "risk ".repeat(500)),
        limitations: Array.from({ length: 80 }, () => "limit ".repeat(500)),
        handoffSummaryForImplementation: "summary ".repeat(10_000),
        confidence: 0.8,
        roleId: "resource_scout",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      contextScoutShape: {
        valid: true,
        reasonCodes: [],
        semanticQualityJudgedByDeterministicCode: false,
      },
      resourceHandoffPacketRef: "runtime-job://job/resource-handoff/1",
      contextScoutToolLoopRef: "runtime-job://job/context-scout/tool-loop/1",
      contextScoutToolLoopRun: null,
      contextScoutExecutionPacketRef: "runtime-job://job/context-scout/execution-packet/1",
      contextScoutExecutionPacketSummary: null,
      sourcePromptExcerptDecisionRefs: Array.from(
        { length: 40 },
        (_, index) => `runtime-job://job/source-prompt/excerpt/${index}`,
      ),
      verifiedFileRefs: Array.from(
        { length: 120 },
        (_, index) => `extensions/execution-platform/src/verified-${index}.ts`,
      ),
      groundingReasonCodes: Array.from({ length: 80 }, (_, index) => `reason_${index}`),
      candidateFileRefCount: 120,
    });

    expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeLessThan(65_536);
    expect((metadata as Record<string, unknown>).metadataBoundedForRuntimeArtifact).toBe(true);
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

  it("uses ObligationGraph intake and does not retain the retired packet authoring loop", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ),
      "utf8",
    );

    expect(source).toContain("new IntakeStageRunner");
    expect(source).toContain("obligationGraph: latestObligationGraph");
    expect(source).not.toContain("const authorObligationGraph");
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
