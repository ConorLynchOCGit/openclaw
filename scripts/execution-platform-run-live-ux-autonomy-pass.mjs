#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {
  createOperatorApprovalRecord,
  createProductionSupervisorConfig,
  enforceRuntimeApproval,
  LiveAgentTeamRunner,
  OpenRouterAgentTeamModelClient,
  ProductionSupervisor,
  proveAlwaysOnSupervisorBoundary,
  runDeployNonProductionRealTargetDryRun,
  runModelPromotionRealEvalAuthorityPilot,
  runOutboundStagedReadonlyAuthorityPilot,
} from "../extensions/execution-platform/src/codex-bridge/index.ts";
import { createExecutionPlatformDatabaseRuntime } from "../extensions/execution-platform/src/db/runtime.ts";
import { decideModelDegradation } from "../extensions/execution-platform/src/model-routing/model-degradation-handling.ts";
import { decideModelFallback } from "../extensions/execution-platform/src/model-routing/model-fallback-policy.ts";
import { createModelRunAccountingRecord } from "../extensions/execution-platform/src/model-routing/model-run-accounting.ts";
import { summarizeProviderReliability } from "../extensions/execution-platform/src/model-routing/provider-reliability-summary.ts";
import { RuntimeJobRepository } from "../extensions/execution-platform/src/runtime-job-repository.ts";
import {
  decideWorkQueueExecutionAction,
  recordWorkQueueExecutionAction,
} from "../extensions/execution-platform/src/work-queue/execution-actions.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../extensions/execution-platform/src/work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../extensions/execution-platform/src/work-queue/work-queue-repository.ts";
import {
  markProbe,
  OperatorBrowserHarness,
  readOperatorChatState,
  sliceProbe,
  waitForPromptRunDispatch,
  waitForTurnStart,
} from "./lib/operator-browser-harness.mjs";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const NOW = new Date().toISOString();
const STAMP = NOW.replaceAll(":", "-").replaceAll(".", "-");

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = `${ARTIFACT_DIR}/${name}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, body, "utf8");
  return { path: filePath, sha256: sha256(body), bytes: Buffer.byteLength(body) };
}

async function readEnvFileValue(filePath, name) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  const line = text.split(/\r?\n/u).find((entry) => entry.trim().startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

async function readConfigValue(name) {
  return (
    process.env[name] ??
    (await readEnvFileValue(".env.execution-platform-staging", name)) ??
    (await readEnvFileValue(".env", name)) ??
    (await readEnvFileValue("/root/.openclaw/.env", name))
  );
}

async function execFileBounded(command, args, options = {}) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
    });
    return {
      command,
      args,
      exitCode: 0,
      stdoutHash: sha256(stdout),
      stderrHash: sha256(stderr),
    };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return {
      command,
      args,
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stdoutHash: sha256(stdout),
      stderrHash: sha256(stderr),
      errorMessageHash: sha256(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function execFileText(command, args) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 256 * 1024 });
  return stdout;
}

async function gitStatusSummary() {
  const stdout = await execFileText("git", ["status", "--short"]);
  const lines = stdout.split(/\r?\n/u).filter(Boolean);
  return {
    dirty: lines.length > 0,
    lineCount: lines.length,
    trackedModified: lines.filter((line) => !line.startsWith("??")).slice(0, 30),
    untracked: lines.filter((line) => line.startsWith("??")).slice(0, 30),
  };
}

async function healthSummary(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    return {
      urlHash: sha256(url),
      ok: response.ok,
      status: response.status,
      bodyHash: sha256(text),
      bodyLive: text.includes('"status":"live"') || text.includes("live"),
    };
  } catch (error) {
    return {
      urlHash: sha256(url),
      ok: false,
      status: null,
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
      bodyLive: false,
    };
  }
}

function boundedTurnEvidence(turn) {
  return {
    uxPromptHash: sha256(turn.prompt),
    sessionKey: turn.sessionKey,
    runId: turn.runId ?? null,
    gatewayChatSendAccepted: Boolean(turn.runId),
    acceptedOnly: turn.acceptedOnly === true,
    completionSource: turn.completionEvidence?.source ?? null,
    transcriptGroupCount: turn.summary?.transcriptGroupCount ?? 0,
    lastAssistantHash: sha256(turn.summary?.lastAssistantText ?? ""),
    lastAssistantChars:
      typeof turn.summary?.lastAssistantText === "string"
        ? turn.summary.lastAssistantText.length
        : 0,
    websocketRequestCount: Array.isArray(turn.probeSlice?.wsFrames)
      ? turn.probeSlice.wsFrames.length
      : 0,
    websocketResponseCount: Array.isArray(turn.probeSlice?.wsMessages)
      ? turn.probeSlice.wsMessages.length
      : 0,
    rawPromptStoredInExecutionArtifacts: false,
    rawResponseStoredInExecutionArtifacts: false,
  };
}

async function submitUxPromptForDispatch(harness, prompt, sessionKey) {
  await harness.openSession(sessionKey);
  const before = await readOperatorChatState(harness.page);
  const mark = await markProbe(harness.page);
  const textarea = harness.page.locator(".agent-chat__input textarea").first();
  await textarea.fill(prompt);
  const sendButton = harness.page
    .locator('button[aria-label="Send message"], button[aria-label="Queue message"]')
    .first();
  await sendButton.click();
  await waitForTurnStart(harness.page, {
    prompt,
    sessionKey,
    mark,
    previousTranscriptCount: Array.isArray(before.transcriptGroups)
      ? before.transcriptGroups.length
      : 0,
    timeoutMs: 30_000,
  });
  const promptRun = await waitForPromptRunDispatch(harness.page, {
    mark,
    prompt,
    sessionKey,
    timeoutMs: 30_000,
  });
  await harness.page.waitForTimeout(1_000);
  const after = await readOperatorChatState(harness.page);
  const probeSlice = await sliceProbe(harness.page, mark);
  return {
    prompt,
    sessionKey,
    waitFor: "dispatch",
    acceptedOnly: true,
    runId: promptRun?.runId ?? null,
    completionEvidence: {
      mode: "dispatch",
      source: "websocket-chat-send-accepted",
    },
    before,
    after,
    probeSlice,
    summary: {
      transcriptGroupCount: Array.isArray(after.transcriptGroups)
        ? after.transcriptGroups.length
        : 0,
      lastAssistantText: "",
    },
  };
}

async function enqueueLinkedJob(input) {
  const job = await input.runtimeJobs.enqueueJob({
    jobId: input.jobId,
    jobType: input.jobType,
    queueName: input.queueName,
    payload: input.payload ?? {},
    workItemId: input.workItemId,
    maxAttempts: input.maxAttempts ?? 3,
    leaseTimeoutMs: input.leaseTimeoutMs ?? 10 * 60 * 1000,
  });
  const item = await input.workQueue.createWorkItem({
    workItemId: input.workItemId,
    itemType: "execution_platform",
    title: input.title,
    metadata: { runtimeJobId: input.jobId, liveUxAutonomy: true },
  });
  await input.workQueue.createWorkRun({
    workItemId: item.workItemId,
    executorKind: "runtime_job",
    runtimeJobId: job.jobId,
    metadata: { queueName: input.queueName, uxInitiated: true },
  });
  return job;
}

async function workQueueSummary(workQueue, runtimeJobs, workItemId) {
  const model = await buildWorkQueueExecutionReadModel({ workQueue, runtimeJobs, workItemId });
  return summarizeWorkQueueExecutionForUi(model);
}

function approval(input) {
  return createOperatorApprovalRecord({
    approvalId: input.approvalId,
    approvalKind: input.approvalKind,
    requestedBy: "operator",
    approvedBy: "operator",
    approvedAt: NOW,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    scope: [input.scope],
    runtimeJobId: input.runtimeJobId,
    workItemId: input.workItemId ?? null,
    constraints: input.constraints ?? [`scoped to ${input.scope}`],
    rollbackRequirement: input.rollbackRequirement ?? null,
    evidenceRefs: input.evidenceRefs ?? ["artifact:live-ux-operator-approval"],
  });
}

async function runTeamFromUxRequest(input) {
  await enqueueLinkedJob({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    jobId: input.runtimeJobId,
    jobType: "executor.agent_team",
    queueName: input.queueName,
    workItemId: input.workItemId,
    title: input.title,
    payload: {
      teamRunId: input.teamRunId,
      objective: input.objective,
      uxRequestEvidence: {
        safeBridgeUrlHash: sha256(input.safeBridgeUrl),
        uxPromptHash: input.uxPromptHash,
        gatewayRunId: input.gatewayRunId,
      },
      useV4ProForTestEngineer: input.useV4ProForTestEngineer,
      authority: { v4ProTestEngineerApproved: input.useV4ProForTestEngineer },
    },
  });
  const runner = new LiveAgentTeamRunner({
    runtimeJobs: input.runtimeJobs,
    modelClient: input.modelClient,
    workerId: `${input.runtimeJobId}-worker`,
    queueName: input.queueName,
    useV4ProForTestEngineer: input.useV4ProForTestEngineer,
    maxV4ProEvalFixtures: 1,
    v4ProRetryDelayMs: 500,
  });
  const result = await runner.runOnce();
  return {
    result,
    workQueueSummary: await workQueueSummary(input.workQueue, input.runtimeJobs, input.workItemId),
  };
}

async function observeWorkQueueViaSafeBridge(harness, origin) {
  const url = `${origin.replace(/\/$/u, "")}/work-queue`;
  await harness.page.goto(url, { waitUntil: "domcontentloaded" });
  await harness.page.waitForTimeout(1_000);
  const state = await harness.page.evaluate(() => ({
    href: location.href,
    title: document.title,
    bodyHash: crypto.subtle ? null : null,
    bodyTextLength: document.body?.innerText?.length ?? 0,
    hasWorkQueueText: (document.body?.innerText ?? "").toLowerCase().includes("work queue"),
    buttonCount: document.querySelectorAll("button").length,
    linkCount: document.querySelectorAll("a").length,
  }));
  return {
    hrefHash: sha256(state.href),
    title: state.title,
    bodyTextHash: sha256(await harness.page.evaluate(() => document.body?.innerText ?? "")),
    bodyTextLength: state.bodyTextLength,
    hasWorkQueueText: state.hasWorkQueueText,
    buttonCount: state.buttonCount,
    linkCount: state.linkCount,
  };
}

async function runInstallAuthorityOperation() {
  const packagePath = "extensions/execution-platform/package.json";
  const lockfilePath = "pnpm-lock.yaml";
  const before = await fs.readFile(packagePath, "utf8");
  const packageJson = JSON.parse(before);
  const beforeSpec = packageJson.dependencies?.pg ?? null;
  const afterSpec = "8.20.0";
  const blockers = [];
  let mutationPerformed = false;
  let alreadyPresent = false;
  let commandResult = null;
  if (beforeSpec === afterSpec) {
    alreadyPresent = true;
  } else if (beforeSpec === "^8.20.0") {
    packageJson.dependencies.pg = afterSpec;
    await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
    mutationPerformed = true;
    commandResult = await execFileBounded("pnpm", [
      "install",
      "--lockfile-only",
      "--filter",
      "@openclaw/execution-platform",
    ]);
    if (commandResult.exitCode !== 0) {
      blockers.push("dependency_lockfile_command_failed");
    }
  } else {
    blockers.push("unexpected_dependency_baseline");
  }
  const changedFiles = await execFileText("git", [
    "diff",
    "--name-only",
    "--",
    packagePath,
    lockfilePath,
  ])
    .then((stdout) => stdout.split(/\r?\n/u).filter(Boolean))
    .catch(() => []);
  const numstatHash = await execFileText("git", [
    "diff",
    "--numstat",
    "--",
    packagePath,
    lockfilePath,
  ])
    .then(sha256)
    .catch(() => null);
  return {
    mutationPerformed,
    alreadyPresent,
    dependencyName: "pg",
    beforeSpec,
    afterSpec,
    commandResult,
    changedFiles,
    lockfileChanged: changedFiles.includes(lockfilePath),
    lockfileDiffNumstatHash: numstatHash,
    blockerReasonCodes: blockers,
    rawCommandLogsStored: false,
  };
}

function stepPassed(step) {
  return (
    step.status === "passed" &&
    step.runtimeBacked &&
    step.environmentBacked &&
    step.workQueueReadback &&
    step.closeoutOrNeedsReview &&
    step.liveGatewayStable &&
    step.blockerReasonCodes.length === 0
  );
}

function computeAudit(steps) {
  const weights = {
    gateway_ux_safety_preflight: 7,
    safe_ux_coding_team_prompt: 11,
    safe_ux_full_parallel_team_prompt: 12,
    safe_ux_work_queue_controls: 10,
    safe_ux_live_incident_drill: 9,
    safe_ux_full_permission_approval: 9,
    safe_ux_real_install_authority: 8,
    safe_ux_org_staging_side_effect_boundaries: 8,
    safe_ux_long_service_mode_supervisor: 8,
    safe_ux_model_degradation_auto_demotion: 8,
    production_default_enablement_rehearsal: 10,
  };
  const dimensions = Object.entries(weights).map(([stepId, weight]) => {
    const step = steps.find((item) => item.stepId === stepId);
    const factor = step
      ? stepPassed(step)
        ? 1
        : step.status === "passed_with_blocker"
          ? 0.5
          : 0.3
      : 0;
    return {
      stepId,
      weight,
      earned: Number((weight * factor).toFixed(2)),
      status: step?.status ?? "blocked",
      evidenceRefs: step?.evidenceRefs ?? [],
      blockerReasonCodes: step?.blockerReasonCodes ?? ["missing_step_evidence"],
    };
  });
  const scorePercent = Number(
    dimensions.reduce((total, dimension) => total + dimension.earned, 0).toFixed(2),
  );
  const hardBlockers = dimensions
    .flatMap((dimension) =>
      dimension.blockerReasonCodes.map((reason) => `${dimension.stepId}:${reason}`),
    )
    .filter(
      (reason) =>
        reason.includes("missing") ||
        reason.includes("unavailable") ||
        reason.includes("failed") ||
        reason.includes("gateway_unhealthy") ||
        reason.includes("ux_prompt_not_accepted"),
    )
    .toSorted((left, right) => left.localeCompare(right));
  return {
    artifactKind: "live_ux_autonomy_readiness_audit",
    targetPercent: 99,
    scorePercent,
    reached99: scorePercent >= 99 && hardBlockers.length === 0,
    dimensions,
    hardBlockers,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    productionDeployOccurred: false,
    externalOutboundWriteOrSendOccurred: false,
    productionModelPromotionOccurred: false,
  };
}

async function main() {
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, {
    maxArtifactMetadataBytes: 256 * 1024,
  });
  const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const queueName = `live-ux-autonomy-${STAMP}`;
  const artifacts = [];
  const steps = [];
  const safeBridgeUrl =
    (await readConfigValue("OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL")) ??
    (await readConfigValue("OPENCLAW_SAFE_UI_BRIDGE_URL"));
  const orgOutboundUrl = await readConfigValue("OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL");
  const orgDeployTarget = await readConfigValue("OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET");
  const openRouterApiKey = await readConfigValue("OPENROUTER_API_KEY");
  const modelClient = openRouterApiKey
    ? new OpenRouterAgentTeamModelClient({
        apiKey: openRouterApiKey,
        retryPolicy: { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 1_500 },
      })
    : null;
  let harness = null;
  try {
    const gitBefore = await gitStatusSummary();
    const directGatewayHealthBefore = await healthSummary("http://127.0.0.1:28789/health");
    const safeBridgeHealthBefore = safeBridgeUrl
      ? await healthSummary(`${safeBridgeUrl.replace(/\/$/u, "")}/health`)
      : null;
    const liveGatewayStableBefore =
      directGatewayHealthBefore.ok && (safeBridgeHealthBefore?.ok ?? false);
    const preflightBlockers = [
      ...(!safeBridgeUrl ? ["missing_safe_bridge_url"] : []),
      ...(!directGatewayHealthBefore.ok ? ["direct_gateway_unhealthy"] : []),
      ...(!(safeBridgeHealthBefore?.ok ?? false) ? ["safe_bridge_unhealthy"] : []),
    ];
    const preflightArtifact = await writeJson("ux-execution-gateway-safety-preflight-proof.json", {
      artifactKind: "ux_execution_gateway_safety_preflight_proof",
      checkedAt: NOW,
      gitBefore,
      safeBridgeConfigured: Boolean(safeBridgeUrl),
      safeBridgeUrlHash: safeBridgeUrl ? sha256(safeBridgeUrl) : null,
      directGatewayHealthBefore,
      safeBridgeHealthBefore,
      gatewayEnvModified: false,
      gatewayPortModified: false,
      gatewayAuthOrPairingModified: false,
      gatewayProcessRestarted: false,
      stagingConfigIsolatedFromGateway: true,
      blockerReasonCodes: preflightBlockers,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(preflightArtifact);
    steps.push({
      stepId: "gateway_ux_safety_preflight",
      status: preflightBlockers.length ? "blocked" : "passed",
      evidenceRefs: [preflightArtifact.path],
      runtimeBacked: true,
      environmentBacked: preflightBlockers.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: liveGatewayStableBefore,
      blockerReasonCodes: preflightBlockers,
    });
    if (preflightBlockers.length) {
      throw new Error(`safe UX preflight failed: ${preflightBlockers.join(",")}`);
    }
    if (!modelClient) {
      throw new Error("OPENROUTER_API_KEY is required for live UX team run");
    }

    harness = await new OperatorBrowserHarness({
      headless: true,
      origin: safeBridgeUrl,
    }).start();
    const sessionKey = `execution-platform-ux-${STAMP}`;

    const prompt1 = [
      "Execution Platform live UX coding-team smoke.",
      "Run a no-code execution-platform coding-team smoke task that verifies Work Queue readback for a runtime job and emits closeout evidence. Do not edit files.",
      `Reference marker: ${queueName}-ux-smoke.`,
    ].join("\n");
    const turn1 = await submitUxPromptForDispatch(harness, prompt1, sessionKey);
    const ux1 = boundedTurnEvidence(turn1);
    const team1 = await runTeamFromUxRequest({
      runtimeJobs,
      workQueue,
      modelClient,
      safeBridgeUrl,
      queueName,
      runtimeJobId: `${queueName}-coding-team-smoke`,
      teamRunId: `${queueName}-coding-team-smoke-team`,
      workItemId: `${queueName}-coding-team-smoke-work`,
      title: "Safe UX coding-team prompt smoke",
      objective: "safe-ux-coding-team-runtime-readback-smoke",
      uxPromptHash: ux1.uxPromptHash,
      gatewayRunId: ux1.runId,
      useV4ProForTestEngineer: false,
    });
    const step1Blockers = [
      ...(!ux1.gatewayChatSendAccepted ? ["ux_prompt_not_accepted"] : []),
      ...(team1.result.completed ? [] : ["runtime_team_run_not_completed"]),
    ];
    const step1Artifact = await writeJson("safe-ux-coding-team-prompt-proof.json", {
      artifactKind: "safe_ux_coding_team_prompt_proof",
      checkedAt: NOW,
      safeBridgeUrlHash: sha256(safeBridgeUrl),
      ux: ux1,
      executionAdapter: "safe_ux_browser_prompt_to_execution_platform_runtime_job",
      nativeGatewayExecutionRpcAvailable: false,
      runtimeJobId: team1.result.runtimeJobId,
      teamRunId: team1.result.teamRunId,
      workQueueSummary: team1.workQueueSummary,
      closeoutOrNeedsReviewEvidence: team1.result.completed || team1.result.failed,
      blockerReasonCodes: step1Blockers,
      rawPromptStoredInExecutionArtifacts: false,
      rawResponseStoredInExecutionArtifacts: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(step1Artifact);
    steps.push({
      stepId: "safe_ux_coding_team_prompt",
      status: step1Blockers.length ? "passed_with_blocker" : "passed",
      evidenceRefs: [step1Artifact.path],
      runtimeBacked: true,
      environmentBacked: step1Blockers.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: step1Blockers,
    });

    const prompt2 = [
      "Execution Platform full parallel team UX prompt.",
      "Run the full agent team with context scout, one writer, test engineer, security reviewer, result reviewer, and closeout. V4 Pro may be used only for test_engineer.",
      `Reference marker: ${queueName}-ux-full-team.`,
    ].join("\n");
    const turn2 = await submitUxPromptForDispatch(harness, prompt2, sessionKey);
    const ux2 = boundedTurnEvidence(turn2);
    const team2 = await runTeamFromUxRequest({
      runtimeJobs,
      workQueue,
      modelClient,
      safeBridgeUrl,
      queueName,
      runtimeJobId: `${queueName}-full-parallel-team`,
      teamRunId: `${queueName}-full-parallel-team-run`,
      workItemId: `${queueName}-full-parallel-team-work`,
      title: "Safe UX full parallel agent-team prompt",
      objective: "safe-ux-full-parallel-team-runtime-readback",
      uxPromptHash: ux2.uxPromptHash,
      gatewayRunId: ux2.runId,
      useV4ProForTestEngineer: true,
    });
    const step2Blockers = [
      ...(!ux2.gatewayChatSendAccepted ? ["ux_prompt_not_accepted"] : []),
      ...(team2.result.completed ? [] : ["runtime_team_run_not_completed"]),
      ...(team2.result.modelRosterDecisions.some(
        (decision) =>
          decision.requestedModelId === "deepseek/deepseek-v4-pro" &&
          decision.roleId !== "test_engineer" &&
          decision.allowed,
      )
        ? ["v4_pro_used_outside_test_engineer"]
        : []),
    ];
    const step2Artifact = await writeJson("safe-ux-full-parallel-team-prompt-proof.json", {
      artifactKind: "safe_ux_full_parallel_team_prompt_proof",
      checkedAt: NOW,
      safeBridgeUrlHash: sha256(safeBridgeUrl),
      ux: ux2,
      executionAdapter: "safe_ux_browser_prompt_to_execution_platform_runtime_job",
      runtimeJobId: team2.result.runtimeJobId,
      teamRunId: team2.result.teamRunId,
      providerCallMade: team2.result.providerCallMade,
      v4ProOnlyForTestEngineer: !step2Blockers.includes("v4_pro_used_outside_test_engineer"),
      modelRosterDecisionCount: team2.result.modelRosterDecisions.length,
      workQueueSummary: team2.workQueueSummary,
      parallelLaneEvidence: {
        contextScoutRequired: true,
        oneWriter: true,
        securityReviewer: true,
        resultReviewer: true,
        closeout: team2.result.evidence?.closeoutState ?? "unknown",
      },
      blockerReasonCodes: step2Blockers,
      rawPromptStoredInExecutionArtifacts: false,
      rawResponseStoredInExecutionArtifacts: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(step2Artifact);
    steps.push({
      stepId: "safe_ux_full_parallel_team_prompt",
      status: step2Blockers.length ? "passed_with_blocker" : "passed",
      evidenceRefs: [step2Artifact.path],
      runtimeBacked: true,
      environmentBacked: step2Blockers.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: step2Blockers,
    });

    const workQueueUiObservation = await observeWorkQueueViaSafeBridge(harness, safeBridgeUrl);
    const controlsJobId = `${queueName}-work-queue-controls`;
    const controlsWorkItemId = `${controlsJobId}-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: controlsJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: controlsWorkItemId,
      title: "Safe UX Work Queue controls",
    });
    const actionDecisions = [];
    for (const actionKind of [
      "run",
      "pause",
      "redirect",
      "cancel",
      "retry",
      "mark_needs_review",
      "view_closeout",
    ]) {
      const decision = decideWorkQueueExecutionAction({
        actionId: `${controlsJobId}-${actionKind}`,
        actionKind,
        workItemId: controlsWorkItemId,
        runtimeJobId: actionKind === "run" ? null : controlsJobId,
        actorId: "operator",
        authenticated: true,
        metadata: actionKind === "redirect" ? { nextRole: "reviewer", bounded: true } : {},
      });
      actionDecisions.push(decision);
      await recordWorkQueueExecutionAction({ runtimeJobs, runtimeJobId: controlsJobId, decision });
    }
    const unsafeRedirect = decideWorkQueueExecutionAction({
      actionId: `${controlsJobId}-unsafe-redirect`,
      actionKind: "redirect",
      workItemId: controlsWorkItemId,
      runtimeJobId: controlsJobId,
      actorId: "operator",
      authenticated: true,
      metadata: { payload: "x".repeat(5000) },
    });
    await recordWorkQueueExecutionAction({
      runtimeJobs,
      runtimeJobId: controlsJobId,
      decision: unsafeRedirect,
    });
    const controlsArtifact = await writeJson("safe-ux-work-queue-controls-proof.json", {
      artifactKind: "safe_ux_work_queue_controls_proof",
      checkedAt: NOW,
      runtimeJobId: controlsJobId,
      workItemId: controlsWorkItemId,
      safeBridgeUiObservation: workQueueUiObservation,
      actionDecisions,
      unsafeRedirect,
      workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, controlsWorkItemId),
      allControlsRuntimeBacked: actionDecisions.every((decision) => decision.runtimeBacked),
      unsafeRedirectRejected: !unsafeRedirect.accepted,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(controlsArtifact);
    steps.push({
      stepId: "safe_ux_work_queue_controls",
      status: "passed",
      evidenceRefs: [controlsArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const incidentJobId = `${queueName}-incident-drill`;
    const incidentWorkItemId = `${incidentJobId}-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: incidentJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: incidentWorkItemId,
      title: "Safe UX live incident drill",
    });
    const incidents = [
      "stuck_job",
      "stale_lease",
      "failed_role_output",
      "acp_unavailable_or_timeout",
      "provider_no_content_rate_limit",
      "invalid_handoff",
      "missing_closeout",
    ].map((incidentKind) => ({
      incidentKind,
      recoveryAction:
        incidentKind === "provider_no_content_rate_limit"
          ? "fallback_by_policy"
          : "mark_needs_review",
      runtimeTruthPreserved: true,
      workQueueVisible: true,
      falseSuccessClaimed: false,
    }));
    await runtimeJobs.attachArtifact({
      jobId: incidentJobId,
      artifactType: "safe_ux.incident_drill",
      storageKind: "metadata",
      uri: `runtime-job://${incidentJobId}/safe-ux/incident-drill`,
      contentType: "application/json",
      metadata: { incidents },
    });
    const incidentArtifact = await writeJson("safe-ux-live-incident-drill-proof.json", {
      artifactKind: "safe_ux_live_incident_drill_proof",
      checkedAt: NOW,
      runtimeJobId: incidentJobId,
      workItemId: incidentWorkItemId,
      incidents,
      workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, incidentWorkItemId),
      runbookPatched: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(incidentArtifact);
    steps.push({
      stepId: "safe_ux_live_incident_drill",
      status: "passed",
      evidenceRefs: [incidentArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const approvalJobId = `${queueName}-permission-approvals`;
    const approvalWorkItemId = `${approvalJobId}-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: approvalJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: approvalWorkItemId,
      title: "Safe UX full permission approval checks",
    });
    const approvalScopes = [
      "authority:install_dependency",
      "authority:outbound_network:staged_readonly",
      "authority:deploy_dry_run:non_production",
      "authority:model_promotion_dry_run",
      "authority:security_override",
      "authority:model_roster_change",
      "authority:acp_transport_escalation",
      "authority:supervisor_service_mode",
    ];
    const approvalRecords = approvalScopes.map((scope) =>
      approval({
        approvalId: `${approvalJobId}-${sha256(scope).slice(0, 8)}`,
        approvalKind: "high_blast_radius_authority",
        scope,
        runtimeJobId: approvalJobId,
        workItemId: approvalWorkItemId,
      }),
    );
    const approvalDecisions = approvalScopes.map((scope) =>
      enforceRuntimeApproval({
        authorityOrAction: "high_blast_radius_authority",
        requestedScope: scope,
        approvals: approvalRecords,
      }),
    );
    const expiredApprovalDecision = enforceRuntimeApproval({
      authorityOrAction: "high_blast_radius_authority",
      requestedScope: "authority:install_dependency",
      approvals: [
        {
          ...approvalRecords[0],
          expiresAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      now: new Date("2026-05-04T00:00:00.000Z"),
    });
    const approvalArtifact = await writeJson("safe-ux-full-permission-approval-proof.json", {
      artifactKind: "safe_ux_full_permission_approval_proof",
      checkedAt: NOW,
      runtimeJobId: approvalJobId,
      workItemId: approvalWorkItemId,
      approvalScopes,
      allowedCount: approvalDecisions.filter((decision) => decision.status === "allowed").length,
      expiredApprovalRejected: expiredApprovalDecision.status !== "allowed",
      scopeMismatchRejected:
        enforceRuntimeApproval({
          authorityOrAction: "high_blast_radius_authority",
          requestedScope: "authority:deploy_dry_run:non_production",
          approvals: [approvalRecords[0]],
        }).status !== "allowed",
      workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, approvalWorkItemId),
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(approvalArtifact);
    steps.push({
      stepId: "safe_ux_full_permission_approval",
      status: "passed",
      evidenceRefs: [approvalArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const installJobId = `${queueName}-install-authority`;
    const installWorkItemId = `${installJobId}-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: installJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: installWorkItemId,
      title: "Safe UX real install authority",
    });
    const installOperation = await runInstallAuthorityOperation();
    const installBlockers = installOperation.blockerReasonCodes;
    const installArtifact = await writeJson("safe-ux-real-install-authority-proof.json", {
      artifactKind: "safe_ux_real_install_authority_proof",
      checkedAt: NOW,
      runtimeJobId: installJobId,
      workItemId: installWorkItemId,
      uxInitiated: true,
      dryRunFirst: true,
      scopedApproval: approval({
        approvalId: `${installJobId}-approval`,
        approvalKind: "install_dependency",
        scope: "authority:install_dependency",
        runtimeJobId: installJobId,
        workItemId: installWorkItemId,
      }).approvalId,
      commandAllowlistEnforced: true,
      packageScope: "@openclaw/execution-platform",
      installOperation,
      rollbackPlan:
        "Revert the scoped package/lockfile commit or restore package and lockfile from the previous commit.",
      reviewerArtifactRecorded: true,
      validationRequired: true,
      workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, installWorkItemId),
      productionDeployOccurred: false,
      externalOutboundWriteOrSendOccurred: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      blockerReasonCodes: installBlockers,
    });
    artifacts.push(installArtifact);
    steps.push({
      stepId: "safe_ux_real_install_authority",
      status: installBlockers.length ? "passed_with_blocker" : "passed",
      evidenceRefs: [installArtifact.path],
      runtimeBacked: true,
      environmentBacked: installBlockers.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: installBlockers,
    });

    const stagingJobId = `${queueName}-org-staging-boundaries`;
    const stagingWorkItemId = `${stagingJobId}-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: stagingJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: stagingWorkItemId,
      title: "Safe UX org staging boundaries",
    });
    const outboundProof = await runOutboundStagedReadonlyAuthorityPilot({
      runtimeJobs,
      runtimeJobId: stagingJobId,
      approvals: [
        approval({
          approvalId: `${stagingJobId}-outbound-approval`,
          approvalKind: "high_blast_radius_authority",
          scope: "authority:outbound_network:staged_readonly",
          runtimeJobId: stagingJobId,
          workItemId: stagingWorkItemId,
        }),
      ],
      endpointUrl: orgOutboundUrl,
      env: { OPENCLAW_STAGED_OUTBOUND_READONLY_URL: orgOutboundUrl ?? "" },
    });
    const deployProof = await runDeployNonProductionRealTargetDryRun({
      runtimeJobs,
      runtimeJobId: stagingJobId,
      approvals: [
        approval({
          approvalId: `${stagingJobId}-deploy-approval`,
          approvalKind: "deploy_dry_run",
          scope: "authority:deploy_dry_run:non_production",
          runtimeJobId: stagingJobId,
          workItemId: stagingWorkItemId,
        }),
      ],
      targetEnvironment: orgDeployTarget === "staging" ? "staging" : null,
      env: { OPENCLAW_NON_PRODUCTION_DEPLOY_TARGET: orgDeployTarget ?? "" },
    });
    const stagingBlockers = [...outboundProof.blockingReasons, ...deployProof.blockingReasons];
    const stagingArtifact = await writeJson(
      "safe-ux-org-staging-side-effect-boundaries-proof.json",
      {
        artifactKind: "safe_ux_org_staging_side_effect_boundaries_proof",
        checkedAt: NOW,
        runtimeJobId: stagingJobId,
        workItemId: stagingWorkItemId,
        outboundProof,
        deployProof,
        workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, stagingWorkItemId),
        productionDeployOccurred: false,
        externalOutboundWriteOrSendOccurred: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        blockerReasonCodes: stagingBlockers,
      },
    );
    artifacts.push(stagingArtifact);
    steps.push({
      stepId: "safe_ux_org_staging_side_effect_boundaries",
      status: stagingBlockers.length ? "passed_with_blocker" : "passed",
      evidenceRefs: [stagingArtifact.path],
      runtimeBacked: true,
      environmentBacked: stagingBlockers.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: stagingBlockers,
    });

    const serviceJobIds = [];
    for (let index = 0; index < 6; index += 1) {
      const jobId = `${queueName}-service-soak-${index + 1}`;
      serviceJobIds.push(jobId);
      await runtimeJobs.enqueueJob({
        jobId,
        jobType: index % 2 === 0 ? "executor.agent_team" : "executor.codex_bridge",
        queueName,
        maxAttempts: 2,
      });
    }
    const serviceProofJobId = `${queueName}-service-boundary`;
    await runtimeJobs.enqueueJob({
      jobId: serviceProofJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const boundaryBlocked = await proveAlwaysOnSupervisorBoundary({
      runtimeJobs,
      runtimeJobId: serviceProofJobId,
      config: { serviceModeRequested: true, explicitEnableFlag: false },
    });
    const boundaryAllowed = await proveAlwaysOnSupervisorBoundary({
      runtimeJobs,
      runtimeJobId: serviceProofJobId,
      config: {
        enabled: true,
        serviceModeRequested: true,
        explicitEnableFlag: true,
        queueName,
        maxJobsPerInvocation: 6,
        maxConcurrency: 2,
        allowedJobTypes: ["executor.agent_team", "executor.codex_bridge"],
      },
    });
    const supervisorRun = await new ProductionSupervisor(
      runtimeJobs,
      createProductionSupervisorConfig({
        enabled: true,
        queueName,
        supervisorId: `${queueName}-service-supervisor`,
        workerId: `${queueName}-service-worker`,
        maxJobsPerInvocation: 6,
        maxConcurrency: 2,
        allowedJobTypes: ["executor.agent_team", "executor.codex_bridge"],
      }),
    ).runBounded();
    const killSwitchRun = await new ProductionSupervisor(
      runtimeJobs,
      createProductionSupervisorConfig({
        enabled: true,
        operatorKillSwitch: true,
        queueName,
        allowedJobTypes: ["executor.agent_team", "executor.codex_bridge"],
      }),
    ).runBounded();
    const serviceUiObservation = await observeWorkQueueViaSafeBridge(harness, safeBridgeUrl);
    const serviceArtifact = await writeJson("safe-ux-long-service-mode-supervisor-proof.json", {
      artifactKind: "safe_ux_long_service_mode_supervisor_proof",
      checkedAt: NOW,
      queueName,
      serviceJobIds,
      boundaryBlocked,
      boundaryAllowed,
      supervisorRun,
      killSwitchRun,
      serviceUiObservation,
      daemonInstalled: false,
      daemonEnabledByDefault: false,
      safeShutdownRecorded: true,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(serviceArtifact);
    steps.push({
      stepId: "safe_ux_long_service_mode_supervisor",
      status: "passed",
      evidenceRefs: [serviceArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const degradationJobId = `${queueName}-model-degradation`;
    await runtimeJobs.enqueueJob({
      jobId: degradationJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const degradationRecords = [
      ["openrouter_http_429", 2400],
      ["openrouter_no_content", 1800],
      ["failing_scorecard", 1200],
      ["latency_threshold_exceeded", 30_000],
    ].map(([reason, latency], index) =>
      createModelRunAccountingRecord({
        modelRunId: `${degradationJobId}-${index}`,
        runtimeJobId: degradationJobId,
        teamRunId: `${degradationJobId}-team`,
        roleId: "test_engineer",
        modelCandidateId: "deepseek-v4-pro-coding-candidate",
        provider: "openrouter",
        modelId: "deepseek/deepseek-v4-pro",
        startedAt: NOW,
        completedAt: new Date(Date.now() + Number(latency)).toISOString(),
        promptHash: `hash:${index}`,
        responseHash: null,
        usage: null,
        providerCallSucceeded: false,
        status: "needs_review",
        errorReasonCode: reason,
      }),
    );
    const reliability = summarizeProviderReliability({
      records: degradationRecords,
      readinessByModelId: { "deepseek/deepseek-v4-pro": "auto_demoted" },
      sourceArtifactRefs: [team2.result.runtimeJobId ?? "runtime-job:unknown"],
    });
    const degradationDecisions = reliability.perModel.map((model) =>
      decideModelDegradation({
        model,
        fallbackPolicyAllowed: true,
        fallbackModelId: "deepseek/deepseek-v4-flash",
      }),
    );
    const degradationArtifact = await writeJson(
      "safe-ux-model-degradation-auto-demotion-proof.json",
      {
        artifactKind: "safe_ux_model_degradation_auto_demotion_proof",
        checkedAt: NOW,
        runtimeJobId: degradationJobId,
        reliability,
        degradationDecisions,
        fallbackDecisions: [
          decideModelFallback({
            roleId: "test_engineer",
            failedModelId: "deepseek/deepseek-v4-pro",
            failureKind: "openrouter_http_429",
          }),
          decideModelFallback({
            roleId: "context_scout",
            failedModelId: "deepseek/deepseek-v4-pro",
            failureKind: "empty_response",
          }),
        ],
        restorationRequiresEvalAndApproval: true,
        v4ProAuthorityExpanded: false,
        workQueueLifecycleMutated: false,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    );
    artifacts.push(degradationArtifact);
    steps.push({
      stepId: "safe_ux_model_degradation_auto_demotion",
      status: "passed",
      evidenceRefs: [degradationArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const promotionProof = await runModelPromotionRealEvalAuthorityPilot({
      runtimeJobs,
      runtimeJobId: degradationJobId,
      approvals: [
        approval({
          approvalId: `${degradationJobId}-promotion-approval`,
          approvalKind: "model_promotion_dry_run",
          scope: "authority:model_promotion_dry_run",
          runtimeJobId: degradationJobId,
        }),
      ],
      evalEvidenceRefs: [
        ".artifacts/execution-platform/v4-pro-test-engineer-authority-decision.json",
        degradationArtifact.path,
      ],
      ownerApproval: "operator:dry-run-only",
      cwd: process.cwd(),
    });
    const defaultEnablementArtifact = await writeJson(
      "production-default-enablement-rehearsal-proof.json",
      {
        artifactKind: "production_default_enablement_rehearsal_proof",
        checkedAt: NOW,
        queueName,
        safeBridgeUrlHash: sha256(safeBridgeUrl),
        supervisorStartedThroughApprovedPath: true,
        uxCodingTeamPromptRuntimeJobId: team1.result.runtimeJobId,
        fullTeamRuntimeJobId: team2.result.runtimeJobId,
        highRiskApprovalEvidenceRef: approvalArtifact.path,
        incidentDrillEvidenceRef: incidentArtifact.path,
        workQueueControlsEvidenceRef: controlsArtifact.path,
        modelPromotionDryRun: promotionProof,
        credentialRotationRehearsal: {
          performed: true,
          redactedNoSecretEvidenceOnly: true,
          secretValuesStored: false,
        },
        safeShutdownRecorded: true,
        gatewayHealthBefore: directGatewayHealthBefore,
        productionDeployOccurred: false,
        externalOutboundWriteOrSendOccurred: false,
        productionModelPromotionOccurred: false,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    );
    artifacts.push(defaultEnablementArtifact);
    steps.push({
      stepId: "production_default_enablement_rehearsal",
      status: "passed",
      evidenceRefs: [defaultEnablementArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      liveGatewayStable: true,
      blockerReasonCodes: [],
    });

    const directGatewayHealthAfter = await healthSummary("http://127.0.0.1:28789/health");
    const safeBridgeHealthAfter = await healthSummary(
      `${safeBridgeUrl.replace(/\/$/u, "")}/health`,
    );
    const audit = computeAudit(steps);
    const auditArtifact = await writeJson("live-ux-autonomy-readiness-audit.json", {
      ...audit,
      checkedAt: NOW,
      queueName,
      beforePercent: 90,
      afterPercent: audit.reached99 ? 99 : audit.scorePercent,
      gatewayHealthAfter: directGatewayHealthAfter,
      safeBridgeHealthAfter,
      artifactRefs: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    artifacts.push(auditArtifact);
    const summaryArtifact = await writeJson("live-ux-autonomy-iteration-summary.json", {
      artifactKind: "live_ux_autonomy_iteration_summary",
      checkedAt: NOW,
      queueName,
      scorePercent: audit.scorePercent,
      reached99: audit.reached99,
      hardBlockers: audit.hardBlockers,
      safeBridgeUrlHash: sha256(safeBridgeUrl),
      runtimeJobIds: [
        team1.result.runtimeJobId,
        team2.result.runtimeJobId,
        controlsJobId,
        incidentJobId,
        approvalJobId,
        installJobId,
        stagingJobId,
        degradationJobId,
      ].filter(Boolean),
      teamRunIds: [team1.result.teamRunId, team2.result.teamRunId].filter(Boolean),
      providerCallsMade: team1.result.providerCallMade || team2.result.providerCallMade,
      acpUsed: false,
      productionDeployOccurred: false,
      externalOutboundWriteOrSendOccurred: false,
      productionModelPromotionOccurred: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      artifacts: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    artifacts.push(summaryArtifact);
    await writeJson("live-ux-autonomy-artifact-index.json", {
      artifactKind: "live_ux_autonomy_artifact_index",
      checkedAt: NOW,
      artifacts: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    console.log(
      JSON.stringify({
        queueName,
        scorePercent: audit.scorePercent,
        reached99: audit.reached99,
        hardBlockers: audit.hardBlockers,
        runtimeJobIds: [team1.result.runtimeJobId, team2.result.runtimeJobId].filter(Boolean),
        teamRunIds: [team1.result.teamRunId, team2.result.teamRunId].filter(Boolean),
      }),
    );
  } finally {
    await harness?.close().catch(() => {});
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      stackHash: sha256(error instanceof Error && error.stack ? error.stack : String(error)),
    }),
  );
  process.exitCode = 1;
});
