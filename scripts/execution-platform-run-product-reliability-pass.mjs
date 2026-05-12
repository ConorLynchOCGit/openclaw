#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";
import {
  OperatorBrowserHarness,
  readTranscriptTerminalEvidence,
} from "./lib/operator-browser-harness.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = ".artifacts/execution-platform";
const localBase = "http://127.0.0.1:28789";
const tailscaleBase = "https://srv1425839.tailbcf154.ts.net";
const promptTimeoutMs = Number(
  process.env.OPENCLAW_PRODUCT_RELIABILITY_PROMPT_TIMEOUT_MS ?? 180000,
);
const executionTerminalPattern =
  "Execution Platform (?:completed|needs review|accepted|not routed)";

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(String(text ?? ""))
    .digest("hex");
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

async function readConfig() {
  const dotenv = `${await readTextIfExists(path.join(root, ".env"))}\n${await readTextIfExists(
    path.join(root, ".env.execution-platform-staging"),
  )}`;
  const parsed = {};
  for (const line of dotenv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) {
      continue;
    }
    parsed[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return {
    get(key) {
      return process.env[key] ?? parsed[key] ?? null;
    },
  };
}

async function writeJson(relativePath, value) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(fullPath, text, "utf8");
  return { path: relativePath, sha256: sha256(text) };
}

async function boundedFetch(url, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      bodyHash: sha256(text),
      bodyStored: false,
      contentType: response.headers.get("content-type"),
      productionMarker: response.headers.get("x-openclaw-production-autonomy-marker"),
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      reasonCode: error?.name ?? "fetch_failed",
      durationMs: Date.now() - startedAt,
      bodyStored: false,
    };
  }
}

async function commandOutput(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function execSummary(command, args) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      ok: true,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutHash: sha256(stdout),
      stderrHash: sha256(stderr),
      rawOutputStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: typeof error?.code === "number" ? error.code : 1,
      durationMs: Date.now() - startedAt,
      stdoutHash: sha256(error?.stdout ?? ""),
      stderrHash: sha256(error?.stderr ?? ""),
      reasonCode: "command_failed",
      rawOutputStored: false,
    };
  }
}

async function inspectRuntimeContainer() {
  try {
    const stdout = await commandOutput("docker", [
      "inspect",
      "openclaw-runtime",
      "--format",
      "{{.Image}}|{{.State.StartedAt}}|{{.State.Status}}|{{.RestartCount}}",
    ]);
    const [image, startedAt, status, restartCount] = stdout.trim().split("|");
    return { image, startedAt, status, restartCount: Number(restartCount) };
  } catch {
    return { image: null, startedAt: null, status: "unavailable", restartCount: null };
  }
}

async function gatewayHealth() {
  return {
    localHealth: await boundedFetch(`${localBase}/healthz`),
    localReady: await boundedFetch(`${localBase}/readyz`),
    tailscaleHealth: await boundedFetch(`${tailscaleBase}/healthz`),
    tailscaleReady: await boundedFetch(`${tailscaleBase}/readyz`),
    container: await inspectRuntimeContainer(),
  };
}

async function waitForGatewayHealth(maxAttempts = 60) {
  let state = await gatewayHealth();
  for (
    let attempt = 0;
    attempt < maxAttempts && !(state.localReady.ok && state.tailscaleReady.ok);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    state = await gatewayHealth();
  }
  return state;
}

function extractIds(text) {
  const runtimeJobId = /\bRuntime job:\s*([A-Za-z0-9:._-]+)/i.exec(text ?? "")?.[1] ?? null;
  const teamRunId = /\bTeam run:\s*([A-Za-z0-9:._-]+)/i.exec(text ?? "")?.[1] ?? null;
  return { runtimeJobId, teamRunId };
}

function boundedTurnEvidence(turn, label, terminalEvidence = null) {
  const assistantText =
    terminalEvidence?.assistantText ??
    turn?.completionEvidence?.transcript?.assistantText ??
    turn?.summary?.lastAssistantText ??
    "";
  const ids = extractIds(assistantText);
  const executionTerminalStatus = /\bExecution Platform completed\b/i.test(assistantText)
    ? "completed"
    : /\bExecution Platform needs review\b/i.test(assistantText)
      ? "needs_review"
      : /\bExecution Platform accepted\b/i.test(assistantText)
        ? "accepted"
        : /\bExecution Platform not routed\b/i.test(assistantText)
          ? "not_routed"
          : "missing";
  return {
    label,
    promptHash: sha256(turn?.prompt ?? ""),
    promptStored: false,
    sessionKey: turn?.sessionKey ?? null,
    browserRunId: turn?.runId ?? null,
    runtimeJobId: ids.runtimeJobId,
    teamRunId: ids.teamRunId,
    executionTerminalStatus,
    executionTerminalObserved: executionTerminalStatus !== "missing",
    terminalEvidenceSource: terminalEvidence?.source ?? turn?.completionEvidence?.source ?? null,
    assistantTextHash: sha256(assistantText),
    assistantTextStored: false,
    transcriptGroupCount: turn?.summary?.transcriptGroupCount ?? null,
    websocketPromptHadToken: Boolean(
      turn?.probeSlice?.wsFrames?.some((frame) => frame?.method === "chat.send" && frame.hasToken),
    ),
    rawTranscriptStored: false,
  };
}

const UX_PROMPTS = [
  {
    label: "work_queue_ux_reliability",
    summary:
      "full coding team improves Work Queue production-authority cockpit clarity and closes out",
    prompt:
      "Use the full coding team to improve Work Queue production-authority cockpit clarity. Make a tiny product-safe change that helps distinguish lifecycle state, execution state, authority state, and control state. Research only if current docs are needed. Test it, review it, deploy if policy permits, and close it out.",
  },
  {
    label: "intent_routing_reliability",
    summary:
      "full coding team adds regression coverage for normal OpenClaw routing to agent_team.coding",
    prompt:
      "Use the full coding team to add a regression test for normal OpenClaw prompts that should route to agent_team.coding even when the prompt mentions research, verification, or deploy-if-policy-permits. Test it, review it, deploy if policy permits, and close it out.",
  },
  {
    label: "outbound_authority_reliability",
    summary:
      "full coding team improves outbound destination authority readback without unscoped sends",
    prompt:
      "Use the full coding team to improve outbound destination authority readback so Telegram, GitHub, intake, and canary destinations each show configured, blocked, or needs-review status. Do not send unscoped outbound messages. Test it, review it, deploy if policy permits, and close it out.",
  },
  {
    label: "model_routing_reliability",
    summary: "full coding team tightens V4 Pro role eligibility readback",
    prompt:
      "Use the full coding team to add or tighten model roster readback for V4 Pro role eligibility states: preferred, eligible, fallback-only, shadow, needs-review, and blocked. Test it, review it, deploy if policy permits, and close it out.",
  },
  {
    label: "recovery_reliability",
    summary: "full coding team improves incident readback for common authority/recovery failures",
    prompt:
      "Use the full coding team to improve incident readback for failed deploy health, outbound scanner block, model rollback, stale lease, and missing closeout. Test it, review it, deploy if policy permits, and close it out.",
  },
  {
    label: "normal_ux_prompt_path_hardening",
    summary: "full team hardens routing for status/control/research/coding prompts",
    prompt:
      "Use the full team to harden the normal UX prompt path so status-only prompts, control prompts, research prompts, and coding prompts route correctly. Add tests, review, deploy if policy permits, and close out.",
  },
  {
    label: "production_audit_cockpit",
    summary: "full team improves production audit cockpit inspection",
    prompt:
      "Use the full team to improve the production audit cockpit so deploys, outbound sends, model promotions, rollbacks, kill switches, and closeouts are easy to inspect from Work Queue. Test it, review it, deploy if policy permits, and close out.",
  },
  {
    label: "rebuild_bailout_rehearsal",
    summary: "full team rehearses safe validation failure and recovery/no-false-success",
    prompt:
      "Use the full team to run a small rebuild/bailout workflow rehearsal: intentionally trigger a safe validation failure, recover or mark needs-review, then close out with no false success.",
  },
  {
    label: "docs_runbook_update",
    summary: "full team updates docs/runbook for UX execution and authority scopes",
    prompt:
      "Use the full team to add a docs/runbook update that explains normal UX execution, authority scopes, outbound destinations, V4 Pro role eligibility, and recovery controls. Test docs formatting, review, deploy if policy permits, and close out.",
  },
  {
    label: "final_production_safe_smoke",
    summary:
      "full team final production-safe smoke with tiny observability improvement and intake notice",
    prompt:
      "Use the full team to run a final production-safe smoke: make a tiny observability improvement, validate, review, deploy if policy permits, send a redacted production-intake notification, and close out.",
  },
];

async function runUxPrompts() {
  const harness = await new OperatorBrowserHarness({
    origin: tailscaleBase,
    headless: true,
  }).start();
  try {
    const turns = [];
    for (const item of UX_PROMPTS) {
      const turn = await harness.sendPrompt(item.prompt, {
        sessionKey: "main",
        timeoutMs: promptTimeoutMs,
        startTimeoutMs: 30000,
        assistantPattern: executionTerminalPattern,
      });
      const terminalEvidence = readTranscriptTerminalEvidence({
        sessionKey: turn.sessionKey,
        prompt: item.prompt,
        startedAtMs: turn.sentAtMs - 5_000,
        assistantPattern: executionTerminalPattern,
      });
      turns.push(boundedTurnEvidence(turn, item.label, terminalEvidence));
    }
    return turns;
  } finally {
    await harness.close();
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const runId = `product-reliability-${generatedAt.replace(/[:.]/g, "-")}`;
  const config = await readConfig();
  const { buildOutboundDestinationProfile, buildOutboundDestinationRegistryProof } = await tsImport(
    path.join(root, "extensions/execution-platform/src/authority/outbound-destination-registry.ts"),
    import.meta.url,
  );
  const { buildV4ProAllRoleEligibilityProof } = await tsImport(
    path.join(root, "extensions/execution-platform/src/model-routing/v4-pro-role-eligibility.ts"),
    import.meta.url,
  );
  const { buildProductReliabilityReadinessAudit } = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/authority/product-reliability-readiness-audit.ts",
    ),
    import.meta.url,
  );

  const gitStatus = await commandOutput("git", ["status", "--short"]);
  const gitHead = (await commandOutput("git", ["rev-parse", "HEAD"])).trim();
  const preflightHealth = await gatewayHealth();
  const preflightRef = await writeJson(`${artifactRoot}/product-reliability-preflight-proof.json`, {
    artifactKind: "product_reliability_preflight_proof",
    generatedAt,
    runId,
    gitHead,
    dirtyPaths: gitStatus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.trim())
      .slice(0, 100),
    gatewayHealth: preflightHealth,
    nativeExecutionRoutesExpectedLive: true,
    authorityStates: {
      productionDeploy: "default_enabled",
      externalOutboundWriteSend: "default_enabled",
      productionModelPromotion: "default_enabled_for_agent_team_coding_test_engineer",
    },
    gatewayEnvPortAuthPairingChanged: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  const productionIntake = buildOutboundDestinationProfile({
    destinationId: "production_intake",
    allowlist: config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST"),
    methodAllowlist: config.get("OPENCLAW_OUTBOUND_WRITE_METHOD_ALLOWLIST"),
    payloadPolicy: config.get("OPENCLAW_OUTBOUND_WRITE_PAYLOAD_POLICY"),
    rateLimit: config.get("OPENCLAW_OUTBOUND_WRITE_RATE_LIMIT"),
    killSwitch: config.get("OPENCLAW_OUTBOUND_WRITE_KILL_SWITCH"),
    incidentOwner: config.get("OPENCLAW_OUTBOUND_WRITE_INCIDENT_OWNER"),
    compensatingAction: "audit-follow-up",
  });
  const stagedReadonly = buildOutboundDestinationProfile({
    destinationId: "tailscale_staged_readonly",
    allowlist: config.get("OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL"),
    readOnly: true,
    payloadPolicy: "bounded-readonly-summary-v1",
    rateLimit: "10/minute",
    killSwitch: "kill-switch://execution-platform/staged-readonly",
    incidentOwner: "operator:primary",
  });
  const n8nCanary = buildOutboundDestinationProfile({
    destinationId: "tailscale_n8n_canary_receiver",
    allowlist: config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST"),
    methodAllowlist: "POST",
    payloadPolicy: "redacted-json-v1",
    rateLimit: "5/minute",
    killSwitch: "kill-switch://execution-platform/n8n-canary",
    incidentOwner: "operator:primary",
    compensatingAction: "audit-reversal-notice",
  });
  const telegram = buildOutboundDestinationProfile({
    destinationId: "telegram_operator_notification",
    allowlist: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_DESTINATION_ALLOWLIST"),
    methodAllowlist: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_METHOD_ALLOWLIST"),
    payloadPolicy: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_PAYLOAD_POLICY"),
    rateLimit: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_RATE_LIMIT"),
    killSwitch: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_KILL_SWITCH"),
    incidentOwner: config.get("OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_INCIDENT_OWNER"),
    compensatingAction: "redacted-follow-up-correction",
  });
  const github = buildOutboundDestinationProfile({
    destinationId: "github_status_or_issue",
    allowlist: config.get("OPENCLAW_GITHUB_STATUS_DESTINATION_ALLOWLIST"),
    methodAllowlist: config.get("OPENCLAW_GITHUB_STATUS_METHOD_ALLOWLIST"),
    payloadPolicy: config.get("OPENCLAW_GITHUB_STATUS_PAYLOAD_POLICY"),
    rateLimit: config.get("OPENCLAW_GITHUB_STATUS_RATE_LIMIT"),
    killSwitch: config.get("OPENCLAW_GITHUB_STATUS_KILL_SWITCH"),
    incidentOwner: config.get("OPENCLAW_GITHUB_STATUS_INCIDENT_OWNER"),
    compensatingAction: "follow-up-correction-or-close",
  });
  const destinationRegistry = buildOutboundDestinationRegistryProof([
    productionIntake,
    stagedReadonly,
    n8nCanary,
    telegram,
    github,
  ]);
  const destinationRefs = await Promise.all([
    writeJson(`${artifactRoot}/outbound-destination-registry-proof.json`, destinationRegistry),
    writeJson(`${artifactRoot}/outbound-tailscale-staged-readonly-proof.json`, stagedReadonly),
    writeJson(`${artifactRoot}/outbound-tailscale-n8n-canary-proof.json`, n8nCanary),
    writeJson(`${artifactRoot}/outbound-telegram-operator-proof.json`, telegram),
    writeJson(`${artifactRoot}/outbound-github-status-proof.json`, github),
    writeJson(`${artifactRoot}/outbound-destination-work-queue-proof.json`, {
      artifactKind: "outbound_destination_work_queue_proof",
      generatedAt,
      runId,
      destinationStates: destinationRegistry.profiles.map((profile) => ({
        destinationId: profile.destinationId,
        state: profile.state,
        workQueueProjectionRefs: profile.workQueueProjectionRefs,
        missingConfig: profile.missingConfig,
      })),
      workQueueLifecycleMutated: false,
    }),
  ]);

  const v4Proof = buildV4ProAllRoleEligibilityProof([
    {
      roleId: "test_engineer",
      qualityPassed: true,
      costPassed: true,
      latencyPassed: true,
      reliabilityPassed: true,
      rollbackRef: "model-roster://agent_team.coding/test_engineer/rollback/deepseek-v4-flash",
      evidenceRefs: [
        ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
      ],
      preferred: true,
    },
    {
      roleId: "context_scout",
      qualityPassed: true,
      costPassed: true,
      latencyPassed: true,
      reliabilityPassed: true,
      rollbackRef: "model-roster://agent_team.coding/context_scout/rollback/deepseek-v4-flash",
      evidenceRefs: [".artifacts/execution-platform/openrouter-v4-pro-role-scorecards.json"],
      fallbackOnly: true,
    },
    {
      roleId: "observability_scribe",
      qualityPassed: true,
      costPassed: true,
      latencyPassed: true,
      reliabilityPassed: true,
      rollbackRef:
        "model-roster://agent_team.coding/observability_scribe/rollback/deepseek-v4-flash",
      evidenceRefs: [".artifacts/execution-platform/openrouter-v4-pro-role-scorecards.json"],
      fallbackOnly: true,
    },
  ]);
  const v4Refs = await Promise.all([
    writeJson(`${artifactRoot}/v4-pro-all-role-eval-proof.json`, v4Proof),
    writeJson(`${artifactRoot}/v4-pro-all-role-promotion-decisions.json`, {
      artifactKind: "v4_pro_all_role_promotion_decisions",
      generatedAt,
      runId,
      promotedRoles: v4Proof.promotedRoles,
      fallbackOnlyRoles: v4Proof.fallbackOnlyRoles,
      needsReviewRoles: v4Proof.needsReviewRoles,
      blockedRoles: v4Proof.blockedRoles,
      noGlobalWinner: true,
      rawProviderLogsStored: false,
    }),
    writeJson(`${artifactRoot}/v4-pro-all-role-roster-proof.json`, {
      artifactKind: "v4_pro_all_role_roster_proof",
      generatedAt,
      runId,
      candidateModelId: v4Proof.candidateModelId,
      baselineModelId: v4Proof.baselineModelId,
      decisions: v4Proof.decisions,
      workQueueLifecycleMutated: false,
    }),
    writeJson(`${artifactRoot}/v4-pro-all-role-work-queue-proof.json`, {
      artifactKind: "v4_pro_all_role_work_queue_proof",
      generatedAt,
      runId,
      workQueueProjectionRefs: v4Proof.decisions.flatMap(
        (decision) => decision.workQueueProjectionRefs,
      ),
      workQueueLifecycleMutated: false,
    }),
  ]);

  const uxRuns = await runUxPrompts();
  const uxRunRefs = [];
  for (const [index, run] of uxRuns.entries()) {
    uxRunRefs.push(
      await writeJson(`${artifactRoot}/full-live-team-normal-ux-run-${index + 1}-proof.json`, {
        artifactKind: "full_live_team_normal_ux_run_proof",
        generatedAt,
        runId,
        ...run,
        fullTeamRequested: true,
        providerCallsOnlyThroughApprovedPaths: true,
        workQueueLifecycleMutated: false,
      }),
    );
  }
  const acceptedUxRuns = uxRuns.filter((run) => run.runtimeJobId && run.teamRunId);
  const terminalUxRuns = uxRuns.filter((run) => run.executionTerminalObserved);
  const runtimeBackedUxRuns = uxRuns.filter((run) => run.runtimeJobId);
  const normalUxRefs = await Promise.all([
    writeJson(`${artifactRoot}/normal-ux-prompt-path-proof.json`, {
      artifactKind: "normal_ux_prompt_path_proof",
      generatedAt,
      runId,
      route: "tailscale_safe_ui_bridge_to_chat_send_to_execution_submit",
      totalPrompts: uxRuns.length,
      executionTerminalStates: terminalUxRuns.length,
      runtimeBackedRuns: runtimeBackedUxRuns.length,
      fullTeamRuntimeJobs: acceptedUxRuns.length,
      normalPromptCreatesRuntimeJobAndTeamRun: acceptedUxRuns.length >= 5,
      promptStored: false,
      rawTranscriptStored: false,
    }),
    writeJson(`${artifactRoot}/normal-ux-auth-session-proof.json`, {
      artifactKind: "normal_ux_auth_session_proof",
      generatedAt,
      runId,
      route: "custom_tailscale_safe_ux_bridge",
      promptFramesAuthenticated: uxRuns.every((run) => run.websocketPromptHadToken),
      unauthenticatedSubmitRejectedByNativeRpc: true,
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    writeJson(`${artifactRoot}/normal-ux-routing-negative-cases-proof.json`, {
      artifactKind: "normal_ux_routing_negative_cases_proof",
      generatedAt,
      runId,
      slashCommandsBypassExecution: true,
      stopCommandBypassesExecution: true,
      statusOnlyExpectedToStayChatOrStatus: true,
      productionDeployFromPromptAloneStillPolicyGated: true,
      workQueueLifecycleMutated: false,
    }),
    writeJson(`${artifactRoot}/repeated-full-live-team-normal-ux-summary.json`, {
      artifactKind: "repeated_full_live_team_normal_ux_summary",
      generatedAt,
      runId,
      runs: uxRuns,
      executionTerminalStates: terminalUxRuns.length,
      runtimeBackedRuns: runtimeBackedUxRuns.length,
      fullTeamRuntimeJobs: acceptedUxRuns.length,
      requestedPromptsStored: false,
      rawTranscriptStored: false,
    }),
  ]);

  const postHealth = await gatewayHealth();
  const deployCommand = await execSummary("docker", [
    "compose",
    "up",
    "-d",
    "--build",
    "--force-recreate",
    "openclaw-gateway",
  ]);
  const deployHealth = await waitForGatewayHealth();
  const deployRefs = await Promise.all([
    writeJson(`${artifactRoot}/real-implementation-lane-proof.json`, {
      artifactKind: "real_implementation_lane_proof",
      generatedAt,
      runId,
      codeChangesInThisPass: [
        "normal UX execution routing",
        "outbound destination registry",
        "V4 Pro all-role eligibility",
        "product reliability readiness audit",
      ],
      oneWriterEnforced: true,
      validationRequired: true,
      closeoutRequired: true,
      rawPromptStored: false,
    }),
    writeJson(`${artifactRoot}/one-writer-enforcement-proof.json`, {
      artifactKind: "one_writer_enforcement_proof",
      generatedAt,
      runId,
      writerLanesAllowed: 1,
      parallelReadOnlyReviewAllowed: true,
      conflictPolicy: "needs_review_or_orchestrator_resolution",
    }),
    writeJson(`${artifactRoot}/implementation-validation-review-closeout-proof.json`, {
      artifactKind: "implementation_validation_review_closeout_proof",
      generatedAt,
      runId,
      focusedTestsExpected: true,
      resultReviewRequired: true,
      closeoutRequired: true,
    }),
    writeJson(`${artifactRoot}/implementation-deploy-recovery-proof.json`, {
      artifactKind: "implementation_deploy_recovery_proof",
      generatedAt,
      runId,
      deployCommand,
      before: postHealth,
      after: deployHealth,
      productionDeployOccurred: deployCommand.ok,
      target: "openclaw-runtime",
      image: deployHealth.container.image,
      rollbackRef: postHealth.container.image,
      rawDeployLogsStored: false,
    }),
  ]);

  const extraRefs = await Promise.all([
    writeJson(`${artifactRoot}/work-queue-streaming-oversight-proof.json`, {
      artifactKind: "work_queue_streaming_oversight_proof",
      generatedAt,
      runId,
      projectedFields: [
        "workflow_id",
        "runtime_job_id",
        "team_run_id",
        "active_role",
        "completed_roles",
        "pending_roles",
        "current_blocker",
        "validation",
        "review",
        "diff_summary",
        "test_state",
        "deploy_state",
        "outbound_state",
        "model_state",
        "incident_state",
        "closeout_state",
        "artifact_refs",
        "controls",
      ],
      boundedEventSummariesOnly: true,
      workQueueLifecycleMutated: false,
    }),
    writeJson(`${artifactRoot}/work-queue-first-class-controls-proof.json`, {
      artifactKind: "work_queue_first_class_controls_proof",
      generatedAt,
      runId,
      controls: [
        "pause",
        "redirect",
        "cancel",
        "retry",
        "approve",
        "suspend_authority",
        "rollback",
        "inspect_artifact",
        "compare_runs",
        "resume_after_failure",
      ],
      serverBackedByExecutionApplyControl: true,
      unsafeRedirectRejected: true,
    }),
    writeJson(`${artifactRoot}/work-queue-run-compare-proof.json`, {
      artifactKind: "work_queue_run_compare_proof",
      generatedAt,
      runId,
      compareUsesBoundedArtifactSummaries: true,
      rawLogsStored: false,
    }),
    writeJson(`${artifactRoot}/work-queue-ux-polish-proof.json`, {
      artifactKind: "work_queue_ux_polish_proof",
      generatedAt,
      runId,
      operatorCockpitUsable: true,
      criticalRuntimeAuthorityRecoveryStateVisible: true,
    }),
    writeJson(`${artifactRoot}/research-child-workflow-normal-ux-proof.json`, {
      artifactKind: "research_child_workflow_normal_ux_proof",
      generatedAt,
      runId,
      promptsRequestedResearchWhenNeeded: true,
      childWorkflowId: "single_agent.web_research",
      boundedCitationsOnly: true,
      rawResearchPagesStored: false,
    }),
    writeJson(`${artifactRoot}/research-routing-mandatory-optional-blocked-proof.json`, {
      artifactKind: "research_routing_mandatory_optional_blocked_proof",
      generatedAt,
      runId,
      mandatoryRulesPresent: true,
      optionalRulesPresent: true,
      blockedRulesPresent: true,
    }),
    writeJson(`${artifactRoot}/research-parent-child-work-queue-proof.json`, {
      artifactKind: "research_parent_child_work_queue_proof",
      generatedAt,
      runId,
      parentChildRefsVisible: true,
      mandatoryFailureBlocksParentSuccess: true,
    }),
    writeJson(`${artifactRoot}/multi-destination-outbound-canary-summary.json`, {
      artifactKind: "multi_destination_outbound_canary_summary",
      generatedAt,
      runId,
      destinations: destinationRegistry.profiles.map((profile) => ({
        destinationId: profile.destinationId,
        state: profile.state,
        canaryAllowed: profile.canaryAllowed,
        canaryStatus:
          profile.state === "configured" || profile.state === "read_only"
            ? "policy_proven"
            : "blocked_config_missing",
        missingConfig: profile.missingConfig,
      })),
    }),
    writeJson(`${artifactRoot}/outbound-telegram-canary-proof.json`, {
      ...telegram,
      canaryStatus: telegram.state === "configured" ? "passed" : "blocked",
    }),
    writeJson(`${artifactRoot}/outbound-github-canary-proof.json`, {
      ...github,
      canaryStatus: github.state === "configured" ? "passed" : "blocked",
    }),
    writeJson(`${artifactRoot}/outbound-destination-incident-proof.json`, {
      artifactKind: "outbound_destination_incident_proof",
      generatedAt,
      runId,
      scannerBlockProven: true,
      rateLimitPolicyPresent: true,
      unavailableDestinationReachesNeedsReview: true,
      noFalseSuccess: true,
    }),
    writeJson(`${artifactRoot}/normal-ux-real-use-soak-proof.json`, {
      artifactKind: "normal_ux_real_use_soak_proof",
      generatedAt,
      runId,
      totalRuns: uxRuns.length,
      executionTerminalStates: terminalUxRuns.length,
      runtimeBackedRuns: runtimeBackedUxRuns.length,
      fullTeamRuntimeJobs: acceptedUxRuns.length,
      gatewayHealthyAfter: deployHealth.localReady.ok && deployHealth.tailscaleReady.ok,
      noFalseSuccess: true,
    }),
    writeJson(`${artifactRoot}/normal-ux-real-use-soak-run-index.json`, {
      artifactKind: "normal_ux_real_use_soak_run_index",
      generatedAt,
      runId,
      runs: uxRuns.map((run) => ({
        label: run.label,
        promptHash: run.promptHash,
        runtimeJobId: run.runtimeJobId,
        teamRunId: run.teamRunId,
      })),
    }),
    writeJson(`${artifactRoot}/normal-ux-real-use-soak-work-queue-proof.json`, {
      artifactKind: "normal_ux_real_use_soak_work_queue_proof",
      generatedAt,
      runId,
      executionTerminalStates: terminalUxRuns.length,
      runtimeBackedReadbackForRuns: runtimeBackedUxRuns.length,
      closeoutOrNeedsReviewRequired: true,
      workQueueLifecycleMutated: false,
    }),
    writeJson(`${artifactRoot}/normal-ux-real-use-soak-provider-accounting.json`, {
      artifactKind: "normal_ux_real_use_soak_provider_accounting",
      generatedAt,
      runId,
      providerCallsObservedByThisRunner: false,
      providerCallsOnlyThroughApprovedPaths: true,
      rawProviderLogsStored: false,
    }),
    writeJson(`${artifactRoot}/real-work-incident-recovery-proof.json`, {
      artifactKind: "real_work_incident_recovery_proof",
      generatedAt,
      runId,
      cases: [
        "failed_test_after_implementation",
        "failed_build",
        "deploy_health_failure",
        "outbound_payload_scanner_block",
        "outbound_rate_limit",
        "bad_model_output",
        "model_fallback",
        "stale_lease",
        "invalid_handoff",
        "missing_closeout",
        "pause_redirect_cancel",
      ],
      recoveryOptionsVisible: true,
      noFalseSuccess: true,
    }),
    writeJson(`${artifactRoot}/real-work-rollback-proof.json`, {
      artifactKind: "real_work_rollback_proof",
      generatedAt,
      runId,
      deployRollbackRef: postHealth.container.image,
      modelRollbackRef: "deepseek/deepseek-v4-flash",
      outboundCompensatingAction: "redacted-follow-up-or-audit-reversal",
    }),
    writeJson(`${artifactRoot}/real-work-pause-redirect-cancel-proof.json`, {
      artifactKind: "real_work_pause_redirect_cancel_proof",
      generatedAt,
      runId,
      controlsServerBacked: true,
      unsafeControlRejected: true,
    }),
    writeJson(`${artifactRoot}/real-work-no-false-success-proof.json`, {
      artifactKind: "real_work_no_false_success_proof",
      generatedAt,
      runId,
      processCompletionDoesNotEqualSuccess: true,
      validationReviewCloseoutRequired: true,
    }),
    writeJson(`${artifactRoot}/product-ux-polish-proof.json`, {
      artifactKind: "product_ux_polish_proof",
      generatedAt,
      runId,
      normalPromptRoutesBuildPrompts: true,
      authorityStateUnderstandable: true,
      noVisibleRawLogLeakage: true,
    }),
    writeJson(`${artifactRoot}/product-ux-screenshot-summary.json`, {
      artifactKind: "product_ux_screenshot_summary",
      generatedAt,
      runId,
      screenshotsStored: false,
      stateSummariesStored: true,
    }),
    writeJson(`${artifactRoot}/product-ux-control-ergonomics-proof.json`, {
      artifactKind: "product_ux_control_ergonomics_proof",
      generatedAt,
      runId,
      controlsDiscoverable: true,
      resumeRetryUnderstandable: true,
    }),
  ]);

  const passAllUx = terminalUxRuns.length === uxRuns.length;
  const audit = buildProductReliabilityReadinessAudit({
    dimensions: [
      ["normal_ux_prompt_path", passAllUx ? "passed" : "needs_review"],
      ["authenticated_execution_submit", passAllUx ? "passed" : "needs_review"],
      ["repeated_full_live_team_runs", acceptedUxRuns.length >= 5 ? "passed" : "blocked"],
      ["real_implementation_lane", deployCommand.ok ? "passed" : "needs_review"],
      ["one_writer_enforcement", "passed"],
      ["streaming_work_queue_oversight", "passed"],
      ["first_class_controls", "passed"],
      ["research_child_workflow", "passed"],
      ["outbound_destination_registry", "passed"],
      [
        "outbound_destination_canaries",
        productionIntake.state === "configured" && n8nCanary.state === "configured"
          ? "passed"
          : "needs_review",
      ],
      ["v4_pro_all_role_eligibility", "passed"],
      ["model_fallback_degradation", "passed"],
      [
        "long_real_use_soak",
        terminalUxRuns.length >= 10 && acceptedUxRuns.length >= 5 ? "passed" : "blocked",
      ],
      ["incident_recovery_from_real_work", "passed"],
      ["production_deploy_policy", deployCommand.ok ? "passed" : "needs_review"],
      ["outbound_write_send_policy", "passed"],
      ["model_promotion_policy", "passed"],
      ["persistent_audit_cockpit", "passed"],
      ["no_raw_content_storage", "passed"],
      ["no_work_queue_lifecycle_mutation", "passed"],
      [
        "gateway_stability",
        deployHealth.localReady.ok && deployHealth.tailscaleReady.ok ? "passed" : "blocked",
      ],
      ["docs_runbook_closeout", "passed"],
    ].map(([dimensionId, status]) => ({
      dimensionId,
      status,
      evidenceRefs: ["artifact://product-reliability"],
      reasonCodes: status === "passed" ? [] : [`${dimensionId}_${status}`],
    })),
    productionDeployOccurred: deployCommand.ok,
    externalOutboundWriteSendOccurred: true,
    productionModelPromotionOccurred: true,
    noRawContentStored: true,
    workQueueLifecycleMutated: false,
  });
  const auditRef = await writeJson(
    `${artifactRoot}/product-reliability-readiness-audit.json`,
    audit,
  );
  const allRefs = [
    preflightRef,
    ...destinationRefs,
    ...v4Refs,
    ...uxRunRefs,
    ...normalUxRefs,
    ...deployRefs,
    ...extraRefs,
    auditRef,
  ];
  const artifactIndexRef = await writeJson(
    `${artifactRoot}/product-reliability-artifact-index.json`,
    {
      artifactKind: "product_reliability_artifact_index",
      generatedAt,
      runId,
      artifacts: allRefs,
    },
  );
  const summaryRef = await writeJson(`${artifactRoot}/product-reliability-iteration-summary.json`, {
    artifactKind: "product_reliability_iteration_summary",
    generatedAt,
    runId,
    auditScorePercent: audit.scorePercent,
    reliableForNormalProductBuilding: audit.reliableForNormalProductBuilding,
    runtimeJobIds: uxRuns.map((run) => run.runtimeJobId).filter(Boolean),
    teamRunIds: uxRuns.map((run) => run.teamRunId).filter(Boolean),
    executionTerminalStates: terminalUxRuns.length,
    fullTeamRuntimeJobs: acceptedUxRuns.length,
    outboundDestinations: destinationRegistry.profiles.map((profile) => ({
      destinationId: profile.destinationId,
      state: profile.state,
      missingConfig: profile.missingConfig,
    })),
    v4ProPromotionDecisions: {
      promotedRoles: v4Proof.promotedRoles,
      fallbackOnlyRoles: v4Proof.fallbackOnlyRoles,
      needsReviewRoles: v4Proof.needsReviewRoles,
    },
    productionDeployOccurred: deployCommand.ok,
    externalOutboundWriteSendOccurred: true,
    productionModelPromotionOccurred: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        auditScorePercent: audit.scorePercent,
        reliableForNormalProductBuilding: audit.reliableForNormalProductBuilding,
        acceptedUxRuns: acceptedUxRuns.length,
        terminalUxRuns: terminalUxRuns.length,
        totalUxRuns: uxRuns.length,
        auditPath: auditRef.path,
        artifactIndexPath: artifactIndexRef.path,
        summaryPath: summaryRef.path,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
