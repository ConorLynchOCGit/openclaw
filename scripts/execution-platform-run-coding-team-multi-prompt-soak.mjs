#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const DEFAULT_LOCAL_BASE = "http://127.0.0.1:28789";
const DEFAULT_TAILSCALE_BASE = "https://srv1425839.tailbcf154.ts.net";
const requiredPromptCount = Number.parseInt(
  process.env.OPENCLAW_CODING_TEAM_SOAK_PROMPT_COUNT ?? "3",
  10,
);
const artifactPrefix =
  process.env.OPENCLAW_CODING_TEAM_SOAK_ARTIFACT_PREFIX?.trim() ||
  "slice-14-coding-team-multi-prompt-soak";
const requestedPromptIds = (process.env.OPENCLAW_CODING_TEAM_SOAK_PROMPT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

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

async function boundedFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    return {
      url,
      ok: response.ok,
      status: response.status,
      bodyHash: sha256(body),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      reasonCode: error instanceof Error ? error.message.slice(0, 120) : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
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
    status: result.status,
    mode: result.mode,
    runtimeJobId: result.runtimeJobId,
    teamRunId: result.teamRunId,
    objectiveHash: result.objectiveHash,
    workerSupervisorPathExercised: result.workerSupervisorPathExercised,
    workerAdapterId: result.workerAdapterId,
    supervisorStatus: result.supervisorResult.status,
    runnerCompleted: result.runnerResult.completed,
    runnerFailed: result.runnerResult.failed,
    roleModels: extractRoleModels(result),
    closeoutResult: result.humanCloseoutSummary?.result ?? null,
    closeoutEli5Present: Boolean(result.humanCloseoutSummary?.eli5Progress),
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
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

function extractRoleModels(result) {
  const roster = result.runnerResult.evidence?.roster ?? [];
  return Object.fromEntries(
    roster
      .filter((role) => typeof role.roleId === "string" && typeof role.modelId === "string")
      .map((role) => [role.roleId, role.modelId]),
  );
}

function classifyFailure(resultOrError) {
  const text =
    resultOrError instanceof Error
      ? resultOrError.message
      : JSON.stringify(
          resultOrError?.runnerResult?.failure ?? resultOrError?.supervisorResult ?? {},
        );
  if (/no[_ -]?content|429|503|timeout|provider/iu.test(text)) {
    return "provider_profile_or_availability_failure";
  }
  if (/not_concrete|generic|role_closeout|inline_role_report/iu.test(text)) {
    return "role_quality_or_parser_choke_failure";
  }
  if (/closeout/iu.test(text)) {
    return "closeout_model_failure";
  }
  if (/lease|claim|supervisor/iu.test(text)) {
    return "runtime_lease_or_supervisor_failure";
  }
  if (/work.queue|readback/iu.test(text)) {
    return "work_queue_readback_failure";
  }
  return "unknown_live_soak_failure";
}

async function createCloseoutReporter() {
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

async function createRoleModelClient() {
  const { OpenRouterAgentTeamModelClient } = await ep();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return {
      client: null,
      evidence: {
        status: "blocked_openrouter_api_key_not_configured",
        reasonCodes: ["openrouter_api_key_not_configured_for_role_model_client"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };
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
          maxTokens: 3_600,
        },
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 3_000,
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
          maxTokens: 3_600,
          reasonCodes: ["deepseek_v4_pro_native_json_profile", "deepseek_v4_pro_reasoning_omitted"],
        },
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 3_000,
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

async function cleanupCloseoutAppServer() {
  const { clearSharedCodexAppServerClient } = await tsImport(
    path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
    import.meta.url,
  );
  clearSharedCodexAppServerClient();
}

const allPrompts = [
  {
    promptId: "slice14-soak-1-kimi-profile-regression",
    summary:
      "Add a small regression test proving the Kimi implementation lane uses the native JSON / reasoning-omitted profile and stores no raw prompts, responses, or provider logs.",
  },
  {
    promptId: "slice14-soak-2-work-queue-readback",
    summary:
      "Improve owner-facing coding-team readback so workflow, role/model refs, role work summaries, changed files, tests, limitations, and ELI5 progress are clear.",
  },
  {
    promptId: "slice14-soak-3-generic-closeout-negative",
    summary:
      "Add or tighten a regression test proving generic role closeouts cannot pass clean coding-team success while deterministic code remains validator only.",
  },
  {
    promptId: "slice14-soak-4-failure-classification",
    summary:
      "Improve bounded failure classification for live worker soaks across provider profile, parser choke, role quality, closeout, runtime lease, and Work Queue readback failures.",
  },
  {
    promptId: "slice14-soak-5-runbook-docs",
    summary:
      "Add a small owner-facing docs/runbook update summarizing the coding-team live soak debug loop and Kimi role profile.",
  },
];

function selectPrompts() {
  if (requestedPromptIds.length > 0) {
    const selected = allPrompts.filter((prompt) => requestedPromptIds.includes(prompt.promptId));
    const missing = requestedPromptIds.filter(
      (promptId) => !allPrompts.some((prompt) => prompt.promptId === promptId),
    );
    if (missing.length > 0) {
      throw new Error(`unknown_soak_prompt_ids:${missing.join(",")}`);
    }
    return selected;
  }
  return allPrompts.slice(
    0,
    Number.isFinite(requiredPromptCount) ? Math.max(3, Math.min(5, requiredPromptCount)) : 3,
  );
}

const prompts = selectPrompts();

async function main() {
  await loadDotenvFiles();
  const localBase = process.env.OPENCLAW_LOCAL_GATEWAY_BASE_URL ?? DEFAULT_LOCAL_BASE;
  const tailscaleBase = process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL ?? DEFAULT_TAILSCALE_BASE;
  const gatewayPreflight = {
    localHealth: await boundedFetch(`${localBase}/healthz`),
    localReady: await boundedFetch(`${localBase}/readyz`),
    tailscaleHealth: await boundedFetch(`${tailscaleBase}/healthz`),
    tailscaleReady: await boundedFetch(`${tailscaleBase}/readyz`),
  };

  const {
    createExecutionPlatformDatabaseRuntime,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    evaluateWorkQueueLiveLinkageGate,
    RuntimeJobRepository,
    WorkQueueRepository,
  } = await ep();
  const { runCodingTeamLivePilot } = await codingTeamLivePilotApi();

  let runtime;
  const runArtifacts = [];
  const runResults = [];
  const failures = [];
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    const roleModelClient = await createRoleModelClient();
    const closeoutReporter = await createCloseoutReporter();
    await writeJson(`${artifactPrefix}-preflight.json`, {
      artifactKind: "slice_14_coding_team_multi_prompt_soak_preflight",
      status:
        gatewayPreflight.localHealth.ok &&
        gatewayPreflight.localReady.ok &&
        gatewayPreflight.tailscaleHealth.ok &&
        gatewayPreflight.tailscaleReady.ok &&
        readiness.writeAccessAllowed &&
        gate.enabled &&
        Boolean(roleModelClient.client)
          ? "passed"
          : "blocked",
      gatewayPreflight,
      readiness: summarizeReadiness(readiness),
      workQueueLiveLinkageGate: {
        decision: gate.decision,
        enabled: gate.enabled,
        reasonCodes: gate.reasonCodes,
      },
      roleModelClient: roleModelClient.evidence,
      closeoutModel: closeoutReporter.evidence,
      promptCount: prompts.length,
      selectedPromptIds: prompts.map((prompt) => prompt.promptId),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });
    if (!readiness.writeAccessAllowed || readiness.missingTables.length > 0 || !gate.enabled) {
      throw new Error(`slice_14_soak_runtime_db_not_ready:${readiness.reasonCodes.join("|")}`);
    }
    if (!roleModelClient.client) {
      throw new Error("slice_14_soak_role_model_client_not_configured");
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index];
      let result = null;
      let lastFailure = null;
      const attempts = hasArg("--single-attempt") ? 1 : 2;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const runtimeJobId = `coding-team-slice14-soak-${index + 1}-${Date.now()}-a${attempt}`;
        try {
          result = await runCodingTeamLivePilot({
            runtimeJobs,
            workQueue,
            createWorkQueueLinkage: true,
            createWorkQueueFixture: false,
            runtimeJobId,
            objectiveSummary: prompt.summary,
            closeoutReporter: closeoutReporter.reporter,
            roleModelClient: roleModelClient.client,
            extraRuntimePayload: {
              qualityGateId: "single_job_coding_team_end_to_end_quality_proof",
              requireSingleJobCodingTeamQualityProof: true,
              boundedPromptSummary: prompt.summary,
              soakPromptId: prompt.promptId,
            },
          });
          if (result.status === "completed") {
            break;
          }
          lastFailure = {
            attempt,
            runtimeJobId,
            classification: classifyFailure(result),
            status: result.status,
            supervisorStatus: result.supervisorResult.status,
            runnerFailure: result.runnerResult.failure,
          };
        } catch (error) {
          lastFailure = {
            attempt,
            runtimeJobId,
            classification: classifyFailure(error),
            status: "threw",
            reasonCode: error instanceof Error ? error.message.slice(0, 240) : "unknown_error",
          };
        }
      }
      const runArtifact = await writeJson(`${artifactPrefix}-run-${index + 1}.json`, {
        artifactKind: "slice_14_coding_team_multi_prompt_soak_run",
        status: result?.status === "completed" ? "passed" : "needs_review",
        promptId: prompt.promptId,
        promptHash: sha256(prompt.summary),
        boundedPromptSummary: prompt.summary,
        attempts: lastFailure ? 2 : 1,
        result: result ? summarizePilotResult(result) : null,
        failure: result?.status === "completed" ? null : lastFailure,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawLogsStored: false,
        runtimeJobsCreated: Boolean(result) || Boolean(lastFailure),
        authorityGranted: false,
        controlsApplied: false,
        deployPerformed: false,
        outboundSendPerformed: false,
        modelPromotionPerformed: false,
        workQueueLifecycleMutated: false,
      });
      runArtifacts.push(runArtifact.path);
      runResults.push(result ? summarizePilotResult(result) : null);
      if (result?.status !== "completed") {
        failures.push({
          promptId: prompt.promptId,
          failure: lastFailure,
        });
        if (!hasArg("--continue-after-failure")) {
          break;
        }
      }
    }
    const passed = failures.length === 0 && runResults.length === prompts.length;
    const indexArtifact = await writeJson(`${artifactPrefix}-index.json`, {
      artifactKind: "slice_14_coding_team_multi_prompt_soak_index",
      status: passed ? "passed" : "needs_review",
      runArtifactRefs: runArtifacts,
      runtimeJobIds: runResults.map((result) => result?.runtimeJobId).filter(Boolean),
      teamRunIds: runResults.map((result) => result?.teamRunId).filter(Boolean),
      failures,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      runtimeJobsCreated: runResults.length > 0,
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      modelPromotionPerformed: false,
      workQueueLifecycleMutated: false,
    });
    await writeJson(`${artifactPrefix}-work-queue-proof.json`, {
      artifactKind: "slice_14_coding_team_multi_prompt_soak_work_queue_proof",
      status: passed ? "passed" : "needs_review",
      readbacks: runResults.map((result) => result?.workQueueReadback).filter(Boolean),
      requiredReadbackFields: [
        "workflow",
        "roles",
        "model refs",
        "work summary",
        "files/artifacts",
        "tests/validation",
        "result",
        "limitations",
        "ELI5 progress",
      ],
      limitation:
        "This soak exercises the current supervised model-role worker path; separate Codex file-editing parity remains a later runtime adapter requirement.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });
    const gatewayPostcheck = {
      localHealth: await boundedFetch(`${localBase}/healthz`),
      localReady: await boundedFetch(`${localBase}/readyz`),
      tailscaleHealth: await boundedFetch(`${tailscaleBase}/healthz`),
      tailscaleReady: await boundedFetch(`${tailscaleBase}/readyz`),
    };
    await writeJson(`${artifactPrefix}-summary.json`, {
      artifactKind: "slice_14_coding_team_multi_prompt_soak_summary",
      status: passed ? "passed" : "needs_review",
      promptCount: prompts.length,
      completedCount: runResults.filter((result) => result?.status === "completed").length,
      runArtifactRefs: runArtifacts,
      indexArtifactRef: indexArtifact.path,
      runtimeJobIds: runResults.map((result) => result?.runtimeJobId).filter(Boolean),
      roleModelSummary: {
        kimiImplementationLane: "moonshotai/kimi-k2.6",
        v4ProScopedLanes: [
          "orchestrator",
          "context_scout",
          "security_privacy_reviewer",
          "reviewer",
          "docs_skills_writer",
        ],
        closeoutModel: closeoutReporter.evidence.modelId,
      },
      failures,
      gatewayPreflight,
      gatewayPostcheck,
      limitation:
        "Current Slice 14 completion proves live model-role transport, supervisor execution, Closeout Capsule, and Work Queue readback. It does not yet prove separate Codex file-editing parity.",
      recommendedNextStep: passed
        ? "Proceed to Slice 15 Web Research Worker Adapter while carrying Codex file-editing parity as a later adapter hardening item."
        : "Repair the bounded failure class and rerun only failed Slice 14 soak prompts.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      runtimeJobsCreated: runResults.length > 0,
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      modelPromotionPerformed: false,
      workQueueLifecycleMutated: false,
    });
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    await writeJson(`${artifactPrefix}-blocker.json`, {
      artifactKind: "slice_14_coding_team_multi_prompt_soak_blocker",
      status: "blocked",
      reasonCodes: [error instanceof Error ? error.message.slice(0, 240) : "unknown_error"],
      failures,
      runArtifactRefs: runArtifacts,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    });
    process.exitCode = 1;
  } finally {
    await cleanupCloseoutAppServer().catch(() => {});
    await runtime?.pool.end();
  }
}

await main();
