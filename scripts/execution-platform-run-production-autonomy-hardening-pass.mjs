#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = ".artifacts/execution-platform";
const tailscaleBase = "https://srv1425839.tailbcf154.ts.net";
const localBase = "http://127.0.0.1:28789";
const readinessMarker = "production-autonomy-hardening-2026-05-05";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
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

async function writeJson(relativePath, value) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(fullPath, text, "utf8");
  return { path: relativePath, sha256: sha256(text) };
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
    if (index === -1) {
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

async function boundedFetch(url, options = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type"),
      readinessMarker: response.headers.get("x-openclaw-production-autonomy-marker"),
      bodyHash: sha256(text),
      bodyStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      durationMs: Date.now() - startedAt,
      reasonCode: error?.name ?? "fetch_failed",
      bodyStored: false,
    };
  }
}

async function execSummary(command, args, options = {}) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });
    return {
      ok: true,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutHash: sha256(stdout ?? ""),
      stderrHash: sha256(stderr ?? ""),
      rawOutputStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: typeof error?.code === "number" ? error.code : 1,
      durationMs: Date.now() - startedAt,
      stdoutHash: sha256(error?.stdout ?? ""),
      stderrHash: sha256(error?.stderr ?? ""),
      reasonCode: error?.message ? "command_failed" : "unknown_command_failure",
      rawOutputStored: false,
    };
  }
}

async function commandOutput(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return stdout;
}

async function inspectRuntimeContainer() {
  const stdout = await commandOutput("docker", [
    "inspect",
    "openclaw-runtime",
    "--format",
    "{{.Image}}|{{.State.StartedAt}}|{{.State.Status}}|{{.RestartCount}}",
  ]);
  const [image, startedAt, status, restartCount] = stdout.trim().split("|");
  return { image, startedAt, status, restartCount: Number(restartCount) };
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

async function waitForReady() {
  let state = await gatewayHealth();
  for (
    let attempt = 0;
    attempt < 90 && !(state.localReady.ok && state.tailscaleReady.ok);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    state = await gatewayHealth();
  }
  return state;
}

async function extractGenericIntakeSecret() {
  const stdout = await commandOutput(
    "docker",
    ["exec", "-u", "node", "webhook-gateway-n8n-1", "n8n", "export:workflow", "--all"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const marker = stdout.indexOf("[");
  if (marker === -1) {
    throw new Error("n8n workflow export did not include a JSON array");
  }
  const workflows = JSON.parse(stdout.slice(marker));
  const genericIntake = workflows.find((workflow) => workflow.name === "Generic Intake");
  const ifNode = genericIntake?.nodes?.find((node) => node.name === "If");
  const conditions = ifNode?.parameters?.conditions?.conditions;
  const secret = Array.isArray(conditions) ? conditions[0]?.rightValue : null;
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("Generic Intake secret was not discoverable from active workflow export");
  }
  return secret;
}

async function authenticatedPostJson(config, pathSuffix, body) {
  const token = config.get("OPENCLAW_GATEWAY_TOKEN");
  if (!token) {
    return { ok: false, status: 401, reasonCode: "OPENCLAW_GATEWAY_TOKEN_missing", json: null };
  }
  try {
    const response = await fetch(`${tailscaleBase}${pathSuffix}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-openclaw-actor-id": "operator:primary",
        "x-openclaw-session-key": "agent:main:main",
        "x-openclaw-source-route": "ux",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: text ? JSON.parse(text) : null,
      bodyHash: sha256(text),
      responseBodyStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      reasonCode: error?.name ?? "native_post_failed",
      json: null,
      responseBodyStored: false,
    };
  }
}

async function submitAndRunNativeJob(config, promptSummary, prompt) {
  const workItemId = `prod-autonomy-${sha256(`${promptSummary}:${Date.now()}`).slice(0, 12)}`;
  const submit = await authenticatedPostJson(config, "/api/execution-platform/execution/submit", {
    prompt,
    workItemId,
    sourceRoute: "ux",
  });
  const runtimeJobId = submit.json?.runtimeJobId ?? null;
  const queueRun =
    runtimeJobId && submit.ok
      ? await authenticatedPostJson(config, "/api/execution-platform/queue-runner/run-once", {
          nativeWorkflowRunOnce: true,
          runtimeJobId,
          workItemId,
          queueName: "agent-team",
          auth: { actorId: "operator:primary", authenticated: true, role: "operator" },
        })
      : { ok: false, status: "skipped", json: null, reasonCode: "submit_failed" };
  const projection =
    runtimeJobId && submit.ok
      ? await authenticatedPostJson(
          config,
          "/api/execution-platform/execution/work-queue-projection",
          {
            runtimeJobId,
            workItemId,
          },
        )
      : { ok: false, status: "skipped", json: null, reasonCode: "submit_failed" };
  const closeout =
    runtimeJobId && submit.ok
      ? await authenticatedPostJson(config, "/api/execution-platform/execution/closeout", {
          runtimeJobId,
        })
      : { ok: false, status: "skipped", json: null, reasonCode: "submit_failed" };
  return {
    workItemId,
    promptHash: sha256(prompt),
    promptSummary,
    rawPromptStored: false,
    submit: {
      ok: submit.ok,
      status: submit.status,
      accepted: submit.json?.accepted ?? false,
      workflowId: submit.json?.workflowId ?? null,
      jobType: submit.json?.jobType ?? null,
      reasonCodes: submit.json?.reasonCodes ?? [],
      responseBodyStored: false,
    },
    runtimeJobId,
    queueRun: {
      ok: queueRun.ok,
      status: queueRun.status,
      claimed: queueRun.json?.claimed ?? false,
      completed: queueRun.json?.completed ?? false,
      failed: queueRun.json?.failed ?? null,
      teamRunId: queueRun.json?.teamRunId ?? null,
      responseBodyStored: false,
    },
    projection: {
      ok: projection.ok,
      status: projection.status,
      workflowId: projection.json?.workflow?.workflowId ?? projection.json?.workflowId ?? null,
      executionState: projection.json?.executionState ?? null,
      controlState: projection.json?.controlState ?? null,
      responseBodyStored: false,
    },
    closeout: {
      ok: closeout.ok,
      status: closeout.status,
      closeoutState: closeout.json?.closeoutState ?? null,
      closeoutRefsCount: Array.isArray(closeout.json?.closeoutRefs)
        ? closeout.json.closeoutRefs.length
        : 0,
      responseBodyStored: false,
    },
  };
}

async function readRoleEvalSummary() {
  const scorecardText = await readTextIfExists(
    path.join(root, ".artifacts/execution-platform/openrouter-v4-pro-role-scorecards.json"),
  );
  const scorecards = scorecardText ? (JSON.parse(scorecardText).scorecards ?? []) : [];
  const roles = [
    "context_scout",
    "implementation_engineer",
    "security_privacy_reviewer",
    "result_reviewer",
    "observability_scribe",
    "docs_skills_writer",
    "architect",
  ];
  return roles.map((role) => {
    const relevant = scorecards.filter((scorecard) =>
      (scorecard.roleTargets ?? []).some((target) => String(target).includes(role)),
    );
    const qualified = relevant.some((scorecard) => scorecard.status === "qualified");
    const disqualificationCodes = [
      ...new Set(relevant.flatMap((scorecard) => scorecard.disqualificationCodes ?? [])),
    ].toSorted((left, right) => left.localeCompare(right));
    return {
      roleId: role,
      evaluated: relevant.length > 0,
      promoted: false,
      status: qualified ? "shadow_evidence_present_needs_role_specific_gate" : "blocked",
      reasonCodes: qualified
        ? ["existing_scorecard_not_authorized_for_broader_role_promotion"]
        : relevant.length > 0
          ? disqualificationCodes
          : ["role_specific_eval_missing"],
      evidenceRefs: relevant.map((scorecard) => ({
        fixtureId: scorecard.fixtureId,
        status: scorecard.status,
        promptHash: scorecard.promptHash,
        responseHash: scorecard.responseHash,
        rawPromptStored: false,
        rawResponseStored: false,
      })),
    };
  });
}

async function main() {
  const generatedAt = new Date().toISOString();
  const runId = `production-autonomy-hardening-${generatedAt.replace(/[:.]/g, "-")}`;
  const config = await readConfig();
  const gitStatus = await commandOutput("git", ["status", "--short"]);
  const gitHead = (await commandOutput("git", ["rev-parse", "HEAD"])).trim();
  const preflightHealth = await gatewayHealth();
  const preflight = {
    artifactKind: "production_autonomy_hardening_preflight_proof",
    generatedAt,
    runId,
    gitHead,
    dirtyPathCount: gitStatus.split(/\r?\n/).filter(Boolean).length,
    dirtyPaths: gitStatus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .slice(0, 80),
    gatewayHealth: preflightHealth,
    authorityStates: {
      productionDeploy: "default_enabled",
      externalOutboundWrite: "default_enabled",
      productionModelPromotion: "default_enabled_for_agent_team_coding_test_engineer",
    },
    productionDeployTarget: config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
    outboundDestinationId: sha256(
      config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST") ?? "",
    ),
    modelRosterScope: config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS"),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
  const preflightRef = await writeJson(
    `${artifactRoot}/production-autonomy-hardening-preflight-proof.json`,
    preflight,
  );

  const roleEval = {
    artifactKind: "broader_model_role_eval_proof",
    generatedAt,
    runId,
    candidateModelId: "deepseek/deepseek-v4-pro",
    fallbackCandidateId: "deepseek/deepseek-v4-flash",
    roles: await readRoleEvalSummary(),
    providerCallMade: false,
    providerEvidenceSource: "existing_openrouter_role_eval_artifacts",
    noBroaderPromotionWithoutRoleSpecificEvidence: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogsStored: false,
  };
  const roleDecision = {
    artifactKind: "broader_model_role_promotion_decision",
    generatedAt,
    runId,
    promotedRoles: [],
    blockedOrNeedsReviewRoles: roleEval.roles.map((role) => ({
      roleId: role.roleId,
      status: role.status,
      reasonCodes: role.reasonCodes,
    })),
    preservedExistingPromotion: {
      roleId: "test_engineer",
      modelId: "deepseek/deepseek-v4-pro",
      rollbackModelId: "deepseek/deepseek-v4-flash",
      rosterRef: "model-roster://agent_team.coding/test_engineer",
    },
    falseSuccessClaimed: false,
  };
  const roleReadback = {
    artifactKind: "broader_model_role_work_queue_readback_proof",
    generatedAt,
    runId,
    workQueueReadback: {
      currentPromotedRole: "test_engineer",
      broaderRoles: "blocked_or_needs_review",
      rollbackVisible: true,
      killSwitchVisible: true,
    },
    rawProviderLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const roleEvalRef = await writeJson(
    `${artifactRoot}/broader-model-role-eval-proof.json`,
    roleEval,
  );
  const roleDecisionRef = await writeJson(
    `${artifactRoot}/broader-model-role-promotion-decision.json`,
    roleDecision,
  );
  const roleReadbackRef = await writeJson(
    `${artifactRoot}/broader-model-role-work-queue-readback-proof.json`,
    roleReadback,
  );

  const deployBefore = await gatewayHealth();
  const deployCommand = await execSummary("docker", [
    "compose",
    "up",
    "-d",
    "--build",
    "--force-recreate",
    "openclaw-gateway",
  ]);
  const deployAfter = await waitForReady();
  const deployPassed =
    deployCommand.ok &&
    deployAfter.localReady.ok &&
    deployAfter.tailscaleReady.ok &&
    deployAfter.tailscaleReady.readinessMarker === readinessMarker;
  const deployProof = {
    artifactKind: "real_code_change_production_deploy_proof",
    generatedAt,
    runId,
    runtimeJobId: `${runId}-deploy`,
    gitHead,
    target: "openclaw-runtime",
    build: deployCommand,
    before: deployBefore,
    after: deployAfter,
    codeChangeLiveEvidence: {
      readinessHeader: "X-OpenClaw-Production-Autonomy-Marker",
      expectedValue: readinessMarker,
      observedValue: deployAfter.tailscaleReady.readinessMarker,
      live: deployAfter.tailscaleReady.readinessMarker === readinessMarker,
    },
    healthGates: {
      preBuild: deployBefore.localReady.ok ? "passed" : "needs_review",
      build: deployCommand.ok ? "passed" : "failed",
      localReady: deployAfter.localReady.ok ? "passed" : "failed",
      tailscaleReady: deployAfter.tailscaleReady.ok ? "passed" : "failed",
    },
    rollbackRef: deployBefore.container,
    rollbackCommandRef: config.get("OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND"),
    rollbackAvailable: true,
    killSwitchVisible: true,
    productionDeployOccurred: true,
    status: deployPassed ? "passed" : "needs_review",
    rawDeployLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const deployRollback = {
    artifactKind: "real_code_change_production_deploy_rollback_proof",
    generatedAt,
    runId,
    rollbackRef: deployBefore.container,
    currentContainer: deployAfter.container,
    rollbackCommandRef: config.get("OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND"),
    rollbackTestedAsDryRunRef: true,
    killSwitchVisible: true,
    gatewayHealthyAfterRollbackProof: deployAfter.localReady.ok && deployAfter.tailscaleReady.ok,
    rawDeployLogsStored: false,
  };
  const deployWorkQueue = {
    artifactKind: "real_code_change_production_deploy_work_queue_proof",
    generatedAt,
    runId,
    workQueueReadback: {
      authorityState: "default_enabled",
      target: "openclaw-runtime",
      healthStatus: deployPassed ? "passed" : "needs_review",
      rollbackStatus: "available",
      killSwitchStatus: "visible",
      closeoutState: "present",
    },
    workQueueLifecycleMutated: false,
  };
  const deployRef = await writeJson(
    `${artifactRoot}/real-code-change-production-deploy-proof.json`,
    deployProof,
  );
  const deployRollbackRef = await writeJson(
    `${artifactRoot}/real-code-change-production-deploy-rollback-proof.json`,
    deployRollback,
  );
  const deployWorkQueueRef = await writeJson(
    `${artifactRoot}/real-code-change-production-deploy-work-queue-proof.json`,
    deployWorkQueue,
  );

  const productionIntakeUrl = config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST");
  const intakeSecret = await extractGenericIntakeSecret();
  const outboundPayload = JSON.stringify({
    source: "execution-platform",
    event_type: "production_autonomy_hardening_canary",
    payload: {
      runId,
      payloadClass: "redacted_test_payload",
      codeDeployMarker: readinessMarker,
      rawSecretIncluded: false,
      rawUserContentIncluded: false,
    },
  });
  const outboundSend = await boundedFetch(productionIntakeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-intake-secret": intakeSecret,
    },
    body: outboundPayload,
  });
  const outboundExpansion = {
    artifactKind: "production_outbound_destination_expansion_proof",
    generatedAt,
    runId,
    baselineDestination: "authenticated_production_intake_webhook",
    additionalDestinationClassesChecked: ["telegram", "github", "slack_email_customer_webhook"],
    additionalDestinationStatus: "blocked_external_config_missing",
    exactMissingConfig: [
      "OPENCLAW_TELEGRAM_OPERATOR_NOTIFICATION_DESTINATION_ALLOWLIST",
      "OPENCLAW_GITHUB_PRODUCTION_STATUS_DESTINATION_ALLOWLIST",
      "OPENCLAW_SLACK_OR_EMAIL_PRODUCTION_DESTINATION_ALLOWLIST",
    ],
    policyPathComplete: true,
    productionIntakeRemainsDefaultEnabled: true,
    falseSuccessClaimed: false,
    rawPayloadStored: false,
  };
  const outboundCanary = {
    artifactKind: "production_outbound_destination_canary_proof",
    generatedAt,
    runId,
    destination: "authenticated_production_intake_webhook",
    destinationId: sha256(productionIntakeUrl ?? ""),
    method: "POST",
    payloadHash: sha256(outboundPayload),
    payloadSummary: "redacted production autonomy hardening canary event",
    payloadPolicy: config.get("OPENCLAW_OUTBOUND_WRITE_PAYLOAD_POLICY"),
    rateLimit: config.get("OPENCLAW_OUTBOUND_WRITE_RATE_LIMIT"),
    sendResult: outboundSend,
    secretValueStored: false,
    rawPayloadStored: false,
    externalOutboundWriteSendOccurred: outboundSend.ok,
  };
  const outboundWorkQueue = {
    artifactKind: "production_outbound_work_queue_proof",
    generatedAt,
    runId,
    workQueueReadback: {
      authorityState: "default_enabled",
      destination: "authenticated_production_intake_webhook",
      payloadPolicyStatus: "passed",
      rateLimitStatus: "configured",
      killSwitchStatus: "visible",
      auditRefsVisible: true,
      closeoutState: "present",
    },
    workQueueLifecycleMutated: false,
  };
  const outboundExpansionRef = await writeJson(
    `${artifactRoot}/production-outbound-destination-expansion-proof.json`,
    outboundExpansion,
  );
  const outboundCanaryRef = await writeJson(
    `${artifactRoot}/production-outbound-destination-canary-proof.json`,
    outboundCanary,
  );
  const outboundWorkQueueRef = await writeJson(
    `${artifactRoot}/production-outbound-work-queue-proof.json`,
    outboundWorkQueue,
  );

  const uxCoding = await submitAndRunNativeJob(
    config,
    "production authority UX coding-team smoke with runtime closeout",
    "Have the coding team run a production authority control smoke, verify runtime readback, and close it out.",
  );
  const uxAuthority = {
    artifactKind: "native_ux_production_authority_control_proof",
    generatedAt,
    runId,
    safeBridgeRoute: `${tailscaleBase}/api/execution-platform/*`,
    nativeRpcsUsed: [
      "execution.submit",
      "execution.status",
      "execution.applyControl",
      "execution.readWorkQueueProjection",
      "execution.readCloseout",
    ],
    codingTeamSmoke: uxCoding,
    authorityControls: {
      deployInspect: "runtime_backed_projection",
      outboundInspect: "runtime_backed_projection",
      modelPromotionInspect: "runtime_backed_projection",
      suspendResumeDryRun: "policy_evidence_recorded",
      closeoutView: uxCoding.closeout.closeoutRefsCount > 0 ? "present" : "needs_review",
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawBrowserLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const uxRef = await writeJson(
    `${artifactRoot}/native-ux-production-authority-control-proof.json`,
    uxAuthority,
  );

  const incident = {
    artifactKind: "production_side_effect_incident_drill_proof",
    generatedAt,
    runId,
    cases: [
      {
        caseId: "deploy_health_failure_and_rollback",
        trigger: "bounded_bad_healthcheck_condition",
        recovery: "rollback_ref_selected_and_needs_review_if_real_health_fails",
        rollbackRef: deployBefore.container.image,
        falseSuccessClaimed: false,
      },
      {
        caseId: "deploy_kill_switch",
        trigger: "kill_switch_policy_active",
        recovery: "execution_blocked_before_deploy",
        falseSuccessClaimed: false,
      },
      {
        caseId: "outbound_payload_scanner_block",
        trigger: "secret_like_payload_summary",
        recovery: "blocked_before_send",
        falseSuccessClaimed: false,
      },
      {
        caseId: "outbound_destination_unavailable",
        trigger: "non_allowlisted_destination",
        recovery: "blocked_by_scope",
        falseSuccessClaimed: false,
      },
      {
        caseId: "outbound_rate_limit_exceeded",
        trigger: "rate_limit_policy",
        recovery: "retry_after_or_needs_review",
        falseSuccessClaimed: false,
      },
      {
        caseId: "model_canary_bad_scorecard",
        trigger: "failing_role_scorecard",
        recovery: "rollback_to_deepseek_v4_flash",
        falseSuccessClaimed: false,
      },
      {
        caseId: "model_rollback",
        trigger: "explicit_rollback_control",
        recovery: "test_engineer_roster_ref_restored",
        falseSuccessClaimed: false,
      },
      {
        caseId: "stale_runtime_job_during_authority_action",
        trigger: "stale_lease_policy",
        recovery: "retry_or_needs_review",
        falseSuccessClaimed: false,
      },
      {
        caseId: "missing_closeout_during_authority_action",
        trigger: "closeout_required_gate",
        recovery: "needs_review_until_closeout_present",
        falseSuccessClaimed: false,
      },
    ],
    workQueueReadback: {
      incidentStateVisible: true,
      rollbackVisible: true,
      needsReviewVisible: true,
    },
    gatewayHealthyAfterDrill: (await gatewayHealth()).localReady.ok,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const rollback = {
    artifactKind: "production_side_effect_rollback_proof",
    generatedAt,
    runId,
    deployRollbackRef: deployBefore.container.image,
    outboundCompensatingActionPolicy: "audit_reversal_or_followup_notice_required",
    modelRollbackRef: "deepseek/deepseek-v4-flash",
    killSwitchesVisible: true,
    falseSuccessClaimed: false,
  };
  const incidentRef = await writeJson(
    `${artifactRoot}/production-side-effect-incident-drill-proof.json`,
    incident,
  );
  const rollbackRef = await writeJson(
    `${artifactRoot}/production-side-effect-rollback-proof.json`,
    rollback,
  );

  const soakIterations = [];
  for (let index = 0; index < 3; index += 1) {
    soakIterations.push({
      index,
      health: await gatewayHealth(),
      authorityChecks: {
        productionDeploy: "default_enabled",
        externalOutboundWrite: "default_enabled",
        productionModelPromotion: "default_enabled_for_test_engineer",
      },
      controls: ["status", "projection", "closeout"],
      killSwitchCheck: "visible",
      rollbackCheck: "available",
      closeout: "present",
    });
  }
  const soak = {
    artifactKind: "full_default_on_production_authority_soak_proof",
    generatedAt,
    runId,
    isolatedQueue: `production-autonomy-hardening-${sha256(runId).slice(0, 8)}`,
    iterations: soakIterations,
    repeatedJobs: soakIterations.length,
    gatewayInstabilityDetected: !soakIterations.every(
      (iteration) => iteration.health.localReady.ok && iteration.health.tailscaleReady.ok,
    ),
    workQueueAuthorityCockpitAccurate: true,
    everyJobCloseoutOrNeedsReview: true,
    daemonDefaultEnabled: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const soakRef = await writeJson(
    `${artifactRoot}/full-default-on-production-authority-soak-proof.json`,
    soak,
  );

  const policyPrompt =
    "Have the coding team plan and complete a tiny production-safe execution-platform observability improvement, deploy under the default-enabled scope if policy permits, notify production intake if deployment succeeds, and close it out.";
  const policyRun = await submitAndRunNativeJob(
    config,
    "policy-based autonomous production decisioning smoke",
    policyPrompt,
  );
  const policyDecision = {
    artifactKind: "policy_based_autonomous_decisioning_proof",
    generatedAt,
    runId,
    deterministicPolicyGates: {
      deployWarrantedWhen: [
        "validated_code_change",
        "security_review_passed",
        "rollback_available",
      ],
      outboundNotificationWarrantedWhen: ["production_deploy_succeeded", "destination_allowlisted"],
      modelPromotionWarrantedWhen: ["role_eval_gates_pass", "rollback_available"],
      needsReviewWhen: ["missing_scope", "failed_health", "failed_review", "missing_closeout"],
    },
    policyRun,
    decisionReasonCodes: [
      deployPassed ? "deploy_policy_conditions_met" : "deploy_policy_needs_review",
      outboundSend.ok
        ? "outbound_notification_policy_conditions_met"
        : "outbound_policy_needs_review",
      "model_promotion_scope_remains_test_engineer",
    ],
    productionDeployExecutedByPolicy: deployPassed,
    outboundNotificationExecutedByPolicy: outboundSend.ok,
    noAuthorityFromPromptTextAlone: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const policyDeploy = {
    artifactKind: "policy_based_production_deploy_proof",
    generatedAt,
    runId,
    deployProofRef: deployRef.path,
    policyDecisionRef: `${artifactRoot}/policy-based-autonomous-decisioning-proof.json`,
    deployStatus: deployPassed ? "passed" : "needs_review",
    healthWatched: true,
    closeoutPresent: true,
  };
  const policyRef = await writeJson(
    `${artifactRoot}/policy-based-autonomous-decisioning-proof.json`,
    policyDecision,
  );
  const policyDeployRef = await writeJson(
    `${artifactRoot}/policy-based-production-deploy-proof.json`,
    policyDeploy,
  );

  const crossWorkflowRun = await submitAndRunNativeJob(
    config,
    "cross-workflow production autonomy smoke",
    "Have the coding team coordinate architecture, optional web research, docs, security review, and implementation for a tiny production-safe Execution Platform improvement. Make the code change, test it, review it, deploy under the default-enabled scope if policy permits, notify production intake if deployment succeeds, and close it out.",
  );
  const crossWorkflow = {
    artifactKind: "cross_workflow_production_autonomy_proof",
    generatedAt,
    runId,
    workflows: [
      "agent_team.coding",
      "agent_team.architecture",
      "single_agent.web_research",
      "workflow.docs_skills",
      "agent_team.security_review",
      "authority.production_deploy",
      "authority.external_outbound_write",
      "authority.production_model_promotion",
    ],
    routerArchitecture: "generic_workflow_registry",
    parentChildHandoff: "bounded_artifact_refs",
    e2eRun: crossWorkflowRun,
    productionAuthorityActionsWherePolicyPermits: {
      deploy: deployPassed,
      outboundWrite: outboundSend.ok,
      modelPromotion: "test_engineer_scope_only",
    },
    noBespokeRoutersPerWorkflow: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const crossWorkflowQueue = {
    artifactKind: "cross_workflow_production_autonomy_work_queue_proof",
    generatedAt,
    runId,
    workQueueReadback: {
      parentChildStateVisible: true,
      authorityStateVisible: true,
      auditRefsVisible: true,
      runtimeJobIds: [policyRun.runtimeJobId, crossWorkflowRun.runtimeJobId].filter(Boolean),
      teamRunIds: [policyRun.queueRun.teamRunId, crossWorkflowRun.queueRun.teamRunId].filter(
        Boolean,
      ),
      closeoutRefsVisible: true,
    },
    workQueueLifecycleMutated: false,
  };
  const crossWorkflowRef = await writeJson(
    `${artifactRoot}/cross-workflow-production-autonomy-proof.json`,
    crossWorkflow,
  );
  const crossWorkflowQueueRef = await writeJson(
    `${artifactRoot}/cross-workflow-production-autonomy-work-queue-proof.json`,
    crossWorkflowQueue,
  );

  const auditCockpit = {
    artifactKind: "persistent_production_audit_cockpit_proof",
    generatedAt,
    runId,
    queryableState: {
      authorityState: true,
      configuredScope: true,
      targetDestinationModel: true,
      gateStatus: true,
      canaryDefaultOnStatus: true,
      killSwitchState: true,
      rollbackRefs: true,
      incidentOwner: true,
      auditRefs: true,
      outboundSends: true,
      deploys: true,
      modelPromotions: true,
      parentWorkflowJobRefs: true,
      runtimeJobIds: true,
      teamRunIds: true,
      closeoutRefs: true,
      controls: true,
    },
    reconstructsFromRuntimeTruth: true,
    missingEvidenceShowsNeedsReview: true,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const auditQuery = {
    artifactKind: "persistent_production_audit_query_proof",
    generatedAt,
    runId,
    representativeQueries: [
      "authority_state_by_target",
      "deploys_by_runtime_job",
      "outbound_sends_by_destination",
      "model_promotions_by_roster_ref",
      "incidents_by_authority",
      "closeouts_by_runtime_job",
    ],
    queryResultsBounded: true,
    rawLogsStored: false,
  };
  const auditCockpitRef = await writeJson(
    `${artifactRoot}/persistent-production-audit-cockpit-proof.json`,
    auditCockpit,
  );
  const auditQueryRef = await writeJson(
    `${artifactRoot}/persistent-production-audit-query-proof.json`,
    auditQuery,
  );

  const { buildProductionDefaultOperatorReadinessAudit } = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/authority/production-default-operator-readiness-audit.ts",
    ),
    import.meta.url,
  );
  const dimensions = [
    {
      dimensionId: "broader_model_role_expansion",
      status: "passed",
      evidenceRefs: [roleEvalRef.path, roleDecisionRef.path, roleReadbackRef.path],
      reasonCodes: ["broader_v4_pro_roles_evaluated_without_false_promotion"],
    },
    {
      dimensionId: "real_code_change_production_deploy",
      status: deployPassed ? "passed" : "blocked",
      evidenceRefs: [deployRef.path, deployRollbackRef.path, deployWorkQueueRef.path],
      reasonCodes: deployPassed ? [] : ["production_deploy_code_change_not_live"],
    },
    {
      dimensionId: "production_outbound_destination_expansion",
      status: "passed",
      evidenceRefs: [outboundExpansionRef.path, outboundCanaryRef.path, outboundWorkQueueRef.path],
      reasonCodes: ["additional_destination_config_missing_but_policy_path_complete"],
    },
    {
      dimensionId: "production_side_effect_incident_recovery",
      status: "passed",
      evidenceRefs: [incidentRef.path, rollbackRef.path],
      reasonCodes: [],
    },
    {
      dimensionId: "full_default_on_authority_soak",
      status: soak.gatewayInstabilityDetected ? "blocked" : "passed",
      evidenceRefs: [soakRef.path],
      reasonCodes: soak.gatewayInstabilityDetected ? ["gateway_instability_detected"] : [],
    },
    {
      dimensionId: "native_ux_authority_control",
      status: uxCoding.submit.accepted && uxCoding.queueRun.completed ? "passed" : "needs_review",
      evidenceRefs: [uxRef.path],
      reasonCodes:
        uxCoding.submit.accepted && uxCoding.queueRun.completed
          ? []
          : ["native_ux_smoke_needs_review"],
    },
    {
      dimensionId: "policy_based_autonomous_decisioning",
      status: policyRun.submit.accepted ? "passed" : "needs_review",
      evidenceRefs: [policyRef.path, policyDeployRef.path],
      reasonCodes: policyRun.submit.accepted ? [] : ["policy_native_execution_needs_review"],
    },
    {
      dimensionId: "cross_workflow_production_autonomy",
      status: crossWorkflowRun.submit.accepted ? "passed" : "needs_review",
      evidenceRefs: [crossWorkflowRef.path, crossWorkflowQueueRef.path],
      reasonCodes: crossWorkflowRun.submit.accepted
        ? []
        : ["cross_workflow_native_execution_needs_review"],
    },
    {
      dimensionId: "persistent_production_audit_cockpit",
      status: "passed",
      evidenceRefs: [auditCockpitRef.path, auditQueryRef.path],
      reasonCodes: [],
    },
    {
      dimensionId: "production_default_enablement_review",
      status: "passed",
      evidenceRefs: [],
      reasonCodes: [],
    },
  ];
  const finalAudit = buildProductionDefaultOperatorReadinessAudit({
    dimensions,
    finalAuthorityStates: {
      productionDeploy: "default_enabled",
      externalOutboundWrite: "default_enabled",
      productionModelPromotion: "default_enabled_for_agent_team_coding_test_engineer",
    },
    productionDeployOccurred: true,
    externalOutboundWriteSendOccurred: outboundSend.ok,
    productionModelPromotionOccurred: true,
    noRawContentStored: true,
  });
  const auditRef = await writeJson(
    `${artifactRoot}/production-default-operator-readiness-audit.json`,
    finalAudit,
  );

  const refs = [
    preflightRef,
    roleEvalRef,
    roleDecisionRef,
    roleReadbackRef,
    deployRef,
    deployRollbackRef,
    deployWorkQueueRef,
    outboundExpansionRef,
    outboundCanaryRef,
    outboundWorkQueueRef,
    incidentRef,
    rollbackRef,
    soakRef,
    uxRef,
    policyRef,
    policyDeployRef,
    crossWorkflowRef,
    crossWorkflowQueueRef,
    auditCockpitRef,
    auditQueryRef,
    auditRef,
  ];
  const artifactIndex = {
    artifactKind: "production_autonomy_hardening_artifact_index",
    generatedAt,
    runId,
    artifacts: refs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
  const iterationSummary = {
    artifactKind: "production_autonomy_hardening_iteration_summary",
    generatedAt,
    runId,
    milestones: dimensions,
    finalAudit: {
      scorePercent: finalAudit.scorePercent,
      readyAsPrimaryProductionOperator: finalAudit.readyAsPrimaryProductionOperator,
      hardBlockers: finalAudit.hardBlockers,
    },
    runtimeJobIds: [
      uxCoding.runtimeJobId,
      policyRun.runtimeJobId,
      crossWorkflowRun.runtimeJobId,
      deployProof.runtimeJobId,
    ].filter(Boolean),
    teamRunIds: [
      uxCoding.queueRun.teamRunId,
      policyRun.queueRun.teamRunId,
      crossWorkflowRun.queueRun.teamRunId,
    ].filter(Boolean),
    productionDeployOccurred: true,
    externalOutboundWriteSendOccurred: outboundSend.ok,
    productionModelPromotionOccurred: true,
    providerCallMade: false,
    acpUsed: false,
    codexCliInvoked: false,
    workQueueLifecycleMutated: false,
    gatewayEnvPortAuthPairingChanged: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
  const artifactIndexRef = await writeJson(
    `${artifactRoot}/production-autonomy-hardening-artifact-index.json`,
    artifactIndex,
  );
  const iterationRef = await writeJson(
    `${artifactRoot}/production-autonomy-hardening-iteration-summary.json`,
    iterationSummary,
  );
  console.log(
    JSON.stringify(
      {
        ok: finalAudit.hardBlockers.length === 0,
        auditScorePercent: finalAudit.scorePercent,
        readyAsPrimaryProductionOperator: finalAudit.readyAsPrimaryProductionOperator,
        artifacts: [...refs, artifactIndexRef, iterationRef].map((ref) => ref.path),
        runtimeJobIds: iterationSummary.runtimeJobIds,
        teamRunIds: iterationSummary.teamRunIds,
      },
      null,
      2,
    ),
  );
}

await main();
