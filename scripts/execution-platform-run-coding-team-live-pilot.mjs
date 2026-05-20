#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const objectiveSummary = hasArg("--single-job-quality-proof")
  ? "Use the full coding team to improve Work Queue Closeout Capsule readback so owner-facing detail clearly shows each role's model-authored closeout, role/model refs, what each role did, limitations, validation evidence, and ELI5 progress. Implement the smallest product-safe improvement, add focused tests, have each role produce a model-authored role closeout, have QA and reviewer assess the work, and close out with a model-authored lead report."
  : "Improve coding-team permission readback closeout quality with bounded local repo evidence.";
let executionPlatform;

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function codingTeamLivePilotApi() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/codex-bridge/coding-team-live-pilot.ts"),
    import.meta.url,
  );
}

function hasArg(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const text = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const fullPath = path.join(artifactRoot, name);
  await writeFile(fullPath, text, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(text) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of (await readTextIfExists(filePath)).split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    configSourceRef: readiness.boundary.configSourceRef,
    runtimeSubstrateRef: readiness.boundary.runtimeSubstrateRef,
    databaseName: readiness.boundary.databaseName,
    capability: readiness.boundary.capability,
    readinessState: readiness.readinessState,
    schemaPresent: readiness.schemaPresent,
    missingTables: readiness.missingTables,
    writeAccessAllowed: readiness.writeAccessAllowed,
    reasonCodes: readiness.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function summarizePilotResult(result) {
  return {
    artifactKind: result.artifactKind,
    pilotVersion: result.pilotVersion,
    status: result.status,
    mode: result.mode,
    runtimeJobId: result.runtimeJobId,
    teamRunId: result.teamRunId,
    objectiveHash: result.objectiveHash,
    objectiveSummary: result.objectiveSummary,
    workerSupervisorPathExercised: result.workerSupervisorPathExercised,
    workerAdapterId: result.workerAdapterId,
    supervisorResult: result.supervisorResult,
    claimed: result.runnerResult.claimed,
    completed: result.runnerResult.completed,
    failed: result.runnerResult.failed,
    permissionEvidence: result.permissionEvidence,
    humanCloseoutSummary: result.humanCloseoutSummary,
    workQueueReadback: result.workQueueReadback,
    eventTypes: result.eventTypes,
    artifactTypes: result.artifactTypes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    runtimeJobsCreated: result.runtimeJobsCreated,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    gatewayRestarted: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

async function createCloseoutReporterIfRequested() {
  if (!hasArg("--use-live-closeout-model")) {
    return null;
  }
  const { CodexAppServerJsonExecutor } = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  const { ModelCloseoutCapsuleReporter } = await ep();
  const modelId =
    process.env.EXECUTION_PLATFORM_CLOSEOUT_MODEL_ID?.trim() || "openai-codex/gpt-5.4";
  const timeoutMs = Number.parseInt(
    process.env.EXECUTION_PLATFORM_CLOSEOUT_MODEL_TIMEOUT_MS ?? "240000",
    10,
  );
  const maxOutputTokens = Number.parseInt(
    process.env.EXECUTION_PLATFORM_CLOSEOUT_MODEL_MAX_OUTPUT_TOKENS ?? "12000",
    10,
  );
  const reasoningEffort =
    process.env.EXECUTION_PLATFORM_CLOSEOUT_MODEL_REASONING_EFFORT?.trim() || "medium";
  return {
    reporter: new ModelCloseoutCapsuleReporter({
      executor: new CodexAppServerJsonExecutor({
        cwd: root,
        requestTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 600_000,
        reasoningEffort,
      }),
      modelId,
      reasoningEffort,
      maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 12_000,
      closeoutTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 240_000,
      opportunitySeedRepairTimeoutMs: Math.min(
        Number.isFinite(timeoutMs) ? timeoutMs : 240_000,
        60_000,
      ),
    }),
    evidence: {
      modelId,
      executor: "CodexAppServerJsonExecutor",
      providerPath: "openai-codex",
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 240_000,
      reasoningEffort,
      maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 12_000,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  };
}

async function createRoleModelClientIfRequested() {
  if (!hasArg("--single-job-quality-proof")) {
    return null;
  }
  const { OpenRouterAgentTeamModelClient } = await ep();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    await writeJson("single-job-coding-team-role-model-client-blocker.json", {
      artifactKind: "single_job_coding_team_role_model_client_blocker",
      status: "blocked_openrouter_api_key_not_configured",
      reasonCodes: ["openrouter_api_key_not_configured_for_role_model_client"],
      providerCallMade: false,
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      secretsStored: false,
    });
    return null;
  }
  return {
    client: new OpenRouterAgentTeamModelClient({
      apiKey,
      retryPolicy: {
        maxAttempts: 2,
        timeoutMs: 240_000,
      },
      requestProfilesByModelId: {
        "deepseek/deepseek-v4-pro": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 1_600,
        },
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
      },
    }),
    evidence: {
      providerPath: "openrouter",
      models: ["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro", "moonshotai/kimi-k2.6"],
      requestProfiles: {
        "deepseek/deepseek-v4-pro": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 1_600,
          reasonCodes: ["deepseek_v4_pro_native_json_profile", "deepseek_v4_pro_reasoning_omitted"],
        },
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
          reasonCodes: ["kimi_k2_6_native_json_profile", "kimi_k2_6_reasoning_omitted"],
        },
      },
      maxAttempts: 2,
      timeoutMs: 240_000,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      secretsStored: false,
    },
  };
}

async function createImplementationBridgeIfRequested(runtimeJobs) {
  if (!hasArg("--use-live-codex-implementation-bridge")) {
    return null;
  }
  const { CodexParityImplementationBridge } = await ep();
  return {
    bridge: new CodexParityImplementationBridge({
      runtimeJobs,
      approvedRepoScopePaths: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/workers/",
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/work-queue/",
        "scripts/",
      ],
      approvedValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
    }),
    evidence: {
      bridgePath: "CodexParityImplementationBridge",
      providerPath: "codex_parity_runtime_adapter",
      approvedRepoScopePaths: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/workers/",
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/work-queue/",
        "scripts/",
      ],
      approvedValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
  };
}

async function cleanupCloseoutAppServerIfUsed() {
  if (!hasArg("--use-live-closeout-model")) {
    return;
  }
  const { clearSharedCodexAppServerClient } = await tsImport(
    path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
    import.meta.url,
  );
  clearSharedCodexAppServerClient();
}

async function createFixtureCloseoutReporterIfRequested() {
  if (!hasArg("--use-fixture-model-closeout")) {
    return undefined;
  }
  const { createModelAuthoredCloseoutCapsuleFixture } = await tsImport(
    path.join(root, "extensions/execution-platform/src/workers/test-closeout-capsule-fixture.ts"),
    import.meta.url,
  );
  const { closeoutCapsuleToLegacyHumanSummary } = await ep();
  return {
    async createCapsule(input) {
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: input.factualRefs.runtimeJobId,
        teamRunId: input.factualRefs.teamRunId ?? null,
        workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
      });
      return {
        source: "model",
        capsule,
        legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
        reasonCodes: ["fixture_model_closeout_created"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    },
  };
}

async function runFixture() {
  const {
    createExecutionPlatformPgMemTestDatabase,
    applyExecutionPlatformMigrations,
    RuntimeJobRepository,
    WorkQueueRepository,
  } = await ep();
  const { runCodingTeamLivePilot } = await codingTeamLivePilotApi();
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const closeoutReporter = await createFixtureCloseoutReporterIfRequested();
    const result = await runCodingTeamLivePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueFixture: true,
      runtimeJobId: "coding-team-live-pilot-fixture-job",
      teamRunId: "coding-team-live-pilot-fixture-team-run",
      objectiveSummary,
      closeoutReporter,
    });
    await writeJson("coding-team-live-pilot-fixture-run-proof.json", {
      artifactKind: "coding_team_live_pilot_fixture_run_proof",
      status: result.status,
      result: summarizePilotResult(result),
    });
    return result;
  } finally {
    await database.close();
  }
}

async function inspectLiveAndMaybeRun() {
  let runtime;
  try {
    const {
      createExecutionPlatformDatabaseRuntime,
      inspectExecutionPlatformDbReadiness,
      resolveExecutionPlatformDbBoundaryContract,
      evaluateWorkQueueLiveLinkageGate,
      RuntimeJobRepository,
      WorkQueueRepository,
    } = await ep();
    const { runCodingTeamLivePilot } = await codingTeamLivePilotApi();
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const liveWorkQueueLinked = hasArg("--run-live-work-queue-linked");
    await writeJson("coding-team-live-pilot-live-db-readiness.json", {
      artifactKind: "coding_team_live_pilot_live_db_readiness",
      status: "inspected",
      readiness: summarizeReadiness(readiness),
      liveRuntimeRunRequested: hasArg("--run-live-runtime-only"),
      liveWorkQueueLinkedRunRequested: liveWorkQueueLinked,
      workQueueLiveLinkageGate: {
        decision: gate.decision,
        enabled: gate.enabled,
        reasonCodes: gate.reasonCodes,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    if (!hasArg("--run-live-runtime-only") && !liveWorkQueueLinked) {
      await writeJson("coding-team-live-pilot-live-runtime-blocker.json", {
        artifactKind: "coding_team_live_pilot_live_runtime_blocker",
        status: "blocked_live_runtime_run_not_requested",
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        reasonCodes: ["live_runtime_run_requires_run_live_runtime_only_or_work_queue_linked_flag"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return null;
    }
    if (readiness.missingTables.length > 0 || !readiness.writeAccessAllowed) {
      await writeJson("coding-team-live-pilot-live-runtime-blocker.json", {
        artifactKind: "coding_team_live_pilot_live_runtime_blocker",
        status: "blocked_runtime_db_not_writable",
        readiness: summarizeReadiness(readiness),
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        reasonCodes: readiness.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return null;
    }
    if (liveWorkQueueLinked && !gate.enabled) {
      await writeJson("coding-team-work-queue-linked-pilot-blocker.json", {
        artifactKind: "coding_team_work_queue_linked_pilot_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: summarizeReadiness(readiness),
        gate: {
          decision: gate.decision,
          enabled: gate.enabled,
          reasonCodes: gate.reasonCodes,
        },
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      return null;
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = liveWorkQueueLinked
      ? new WorkQueueRepository(runtime.sqlClient, runtimeJobs)
      : null;
    const closeoutReporter = await createCloseoutReporterIfRequested();
    const roleModelClient = await createRoleModelClientIfRequested();
    const implementationBridge = await createImplementationBridgeIfRequested(runtimeJobs);
    if (hasArg("--single-job-quality-proof") && !roleModelClient) {
      return null;
    }
    if (hasArg("--single-job-quality-proof") && !implementationBridge) {
      await writeJson("single-job-coding-team-implementation-bridge-blocker.json", {
        artifactKind: "single_job_coding_team_implementation_bridge_blocker",
        status: "blocked_live_codex_implementation_bridge_not_requested",
        reasonCodes: ["pass_use_live_codex_implementation_bridge"],
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      return null;
    }
    if (!closeoutReporter) {
      await writeJson("coding-team-live-pilot-live-closeout-model-blocker.json", {
        artifactKind: "coding_team_live_pilot_live_closeout_model_blocker",
        status: "blocked_live_closeout_model_not_requested",
        reasonCodes: ["pass_use_live_closeout_model_for_clean_success"],
        runtimeJobsCreated: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        secretsStored: false,
      });
    }
    const result = await runCodingTeamLivePilot({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: liveWorkQueueLinked,
      createWorkQueueFixture: false,
      runtimeJobId: `coding-team-live-pilot-${Date.now()}`,
      objectiveSummary,
      closeoutReporter: closeoutReporter?.reporter,
      roleModelClient: roleModelClient?.client,
      implementationBridge: implementationBridge?.bridge,
      extraRuntimePayload: hasArg("--single-job-quality-proof")
        ? {
            qualityGateId: "single_job_coding_team_end_to_end_quality_proof",
            requireSingleJobCodingTeamQualityProof: true,
            boundedPromptSummary:
              "Single substantive coding-team quality proof requiring live role execution, role closeouts, V4 Pro scoped read/review completion, tests, review, and Work Queue readback.",
          }
        : undefined,
    });
    const proofName = liveWorkQueueLinked
      ? "coding-team-work-queue-linked-pilot-proof.json"
      : "coding-team-live-pilot-runtime-job-proof.json";
    await writeJson(proofName, {
      artifactKind: "coding_team_live_pilot_runtime_job_proof",
      status: result.status,
      readiness: summarizeReadiness(readiness),
      closeoutModel: closeoutReporter?.evidence ?? null,
      roleModelClient: roleModelClient?.evidence ?? null,
      implementationBridge: implementationBridge?.evidence ?? null,
      result: summarizePilotResult(result),
      workQueueReadbackAvailable: Boolean(result.workQueueReadback),
      workQueueReadbackBlocker: result.workQueueReadback
        ? null
        : "runtime_only_live_pilot_did_not_create_work_item",
    });
    if (liveWorkQueueLinked) {
      await writeJson("coding-team-work-queue-readback-proof.json", {
        artifactKind: "coding_team_work_queue_readback_proof",
        status: result.workQueueReadback ? "completed" : "blocked",
        runtimeJobId: result.runtimeJobId,
        teamRunId: result.teamRunId,
        workQueueReadback: result.workQueueReadback,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      });
      await writeJson("coding-team-closeout-quality-proof.json", {
        artifactKind: "coding_team_closeout_quality_proof",
        status:
          result.humanCloseoutSummary?.result === "satisfied" ||
          result.humanCloseoutSummary?.result === "completed"
            ? "passed"
            : "needs_review",
        runtimeJobId: result.runtimeJobId,
        teamRunId: result.teamRunId,
        humanCloseoutSummary: result.humanCloseoutSummary,
        closeoutModel: closeoutReporter?.evidence ?? null,
        requiredFields: [
          "whatChanged",
          "why",
          "filesTouched",
          "testsRun",
          "result",
          "limitations",
          "nextStep",
          "eli5Summary",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      });
      await writeJson("coding-team-work-queue-permission-proof.json", {
        artifactKind: "coding_team_work_queue_permission_proof",
        status: result.permissionEvidence ? "passed" : "needs_review",
        runtimeJobId: result.runtimeJobId,
        permissionEvidence: result.permissionEvidence,
        deployPerformed: false,
        outboundSendPerformed: false,
        dependencyInstallPerformed: false,
        authorityGranted: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      });
    }
    return result;
  } catch (error) {
    await writeJson("coding-team-live-pilot-live-runtime-blocker.json", {
      artifactKind: "coding_team_live_pilot_live_runtime_blocker",
      status: "blocked_live_runtime_error",
      reasonCodes: [
        error instanceof Error ? error.message.slice(0, 240) : "unknown_live_runtime_error",
      ],
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    return null;
  } finally {
    await cleanupCloseoutAppServerIfUsed();
    await runtime?.pool.end();
  }
}

async function main() {
  await loadDotenvFiles();
  const artifacts = [];
  let fixture = null;
  let live = null;
  if (hasArg("--fixture")) {
    fixture = await runFixture();
    artifacts.push(".artifacts/execution-platform/coding-team-live-pilot-fixture-run-proof.json");
  }
  if (
    hasArg("--inspect-live") ||
    hasArg("--run-live-runtime-only") ||
    hasArg("--run-live-work-queue-linked")
  ) {
    live = await inspectLiveAndMaybeRun();
    artifacts.push(
      ".artifacts/execution-platform/coding-team-live-pilot-live-db-readiness.json",
      live
        ? hasArg("--run-live-work-queue-linked")
          ? ".artifacts/execution-platform/coding-team-work-queue-linked-pilot-proof.json"
          : ".artifacts/execution-platform/coding-team-live-pilot-runtime-job-proof.json"
        : ".artifacts/execution-platform/coding-team-live-pilot-live-runtime-blocker.json",
    );
    if (hasArg("--run-live-work-queue-linked") && live) {
      artifacts.push(
        ".artifacts/execution-platform/coding-team-work-queue-readback-proof.json",
        ".artifacts/execution-platform/coding-team-closeout-quality-proof.json",
        ".artifacts/execution-platform/coding-team-work-queue-permission-proof.json",
      );
    }
    if (
      (hasArg("--run-live-runtime-only") || hasArg("--run-live-work-queue-linked")) &&
      !hasArg("--use-live-closeout-model")
    ) {
      artifacts.push(
        ".artifacts/execution-platform/coding-team-live-pilot-live-closeout-model-blocker.json",
      );
    }
  }
  if (!fixture && !live) {
    await writeJson("coding-team-live-pilot-runner-not-requested.json", {
      artifactKind: "coding_team_live_pilot_runner_not_requested",
      status: "blocked_not_requested",
      reasonCodes: ["pass_fixture_or_inspect_live_or_run_live_runtime_only"],
      runtimeJobsCreated: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    return;
  }
  await writeJson("coding-team-live-pilot-script-summary.json", {
    artifactKind: "coding_team_live_pilot_script_summary",
    status: live?.status ?? fixture?.status ?? "blocked",
    fixtureResult: fixture ? summarizePilotResult(fixture) : null,
    liveRuntimeResult: live ? summarizePilotResult(live) : null,
    artifactRefs: artifacts,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    runtimeJobsCreated: Boolean(live || fixture),
    workQueueLifecycleMutated: false,
  });
}

await main();
