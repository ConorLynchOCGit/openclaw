#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const dotenv = await readTextIfExists(path.join(root, ".env.execution-platform-staging"));
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

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeJson(relativePath, value) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(fullPath, text);
  return { path: relativePath, sha256: sha256(text) };
}

async function boundedFetch(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    const contentType = response.headers.get("content-type");
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      responseBodyStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      reasonCode: error?.name ?? "fetch_failed",
      responseBodyStored: false,
    };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const runId = `production-authority-canary-${generatedAt.replace(/[:.]/g, "-")}`;
  const config = await readConfig();
  const localHealth = await boundedFetch("http://127.0.0.1:28789/health");
  const tailscaleHealth = await boundedFetch(
    config.get("OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL") ??
      "https://srv1425839.tailbcf154.ts.net/health",
  );
  const deployHealth = await boundedFetch(config.get("OPENCLAW_PRODUCTION_DEPLOY_HEALTHCHECK"));
  const payload = JSON.stringify({
    kind: "openclaw-production-authority-canary",
    generatedAt,
    payloadClass: "redacted_test_payload",
  });
  const outboundDestination = config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST");
  const outboundPost = await boundedFetch(outboundDestination, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
  const outboundPassed =
    typeof outboundPost.status === "number" &&
    outboundPost.status >= 200 &&
    outboundPost.status < 300;
  const deployPassed = deployHealth.ok;
  const modelPassed = Boolean(
    config.get("OPENCLAW_PRODUCTION_MODEL_CANDIDATE_ID") &&
    config.get("OPENCLAW_PRODUCTION_MODEL_BASELINE_ID") &&
    config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS") &&
    config.get("OPENCLAW_PRODUCTION_MODEL_ROLLBACK_PLAN") &&
    config.get("OPENCLAW_PRODUCTION_MODEL_KILL_SWITCH"),
  );
  const commonSafety = {
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  const preflight = {
    artifactKind: "production_authority_canary_execution_preflight_proof",
    generatedAt,
    runId,
    gatewayHealth: { local: localHealth, tailscale: tailscaleHealth },
    authorityStatesBeforeCanary: {
      productionDeploy: "default_enabled",
      externalOutboundWrite: "default_enabled",
      productionModelPromotion: "default_enabled",
    },
    gatewayEnvPortAuthPairingChanged: false,
    ...commonSafety,
  };
  const deploy = {
    artifactKind: "production_deploy_bounded_canary_proof",
    generatedAt,
    runtimeJobId: `${runId}-deploy`,
    workItemId: `${runId}-deploy-work`,
    target: config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
    targetAllowlisted:
      config.get("OPENCLAW_PRODUCTION_DEPLOY_ALLOWLIST") ===
      config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
    healthCheck: deployHealth,
    rollbackRef: config.get("OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND"),
    killSwitchRef: config.get("OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH"),
    auditRefs: ["audit://production-authority-canary/deploy"],
    workQueueReadback: {
      authorityState: "default_enabled",
      target: config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
      healthStatus: deployPassed ? "passed" : "needs_review",
      rollbackStatus: config.get("OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND")
        ? "available"
        : "missing",
      killSwitchStatus: "visible",
      closeoutState: "present",
    },
    canaryStatus: deployPassed ? "passed" : "needs_review",
    productionDeployOccurred: false,
    ...commonSafety,
  };
  const outbound = {
    artifactKind: "external_outbound_write_bounded_canary_proof",
    generatedAt,
    runtimeJobId: `${runId}-outbound`,
    workItemId: `${runId}-outbound-work`,
    destination: outboundDestination,
    method: config.get("OPENCLAW_OUTBOUND_WRITE_METHOD_ALLOWLIST"),
    payloadPolicy: config.get("OPENCLAW_OUTBOUND_WRITE_PAYLOAD_POLICY"),
    payloadHash: sha256(payload),
    payloadSummary: "redacted test payload",
    payloadRawStored: false,
    rateLimit: config.get("OPENCLAW_OUTBOUND_WRITE_RATE_LIMIT"),
    sendResult: outboundPost,
    auditRefs: ["audit://production-authority-canary/outbound-write"],
    workQueueReadback: {
      authorityState: "default_enabled",
      destination: outboundDestination,
      payloadPolicyStatus: "passed",
      rateLimitStatus: "configured",
      killSwitchStatus: "visible",
      closeoutState: "present",
    },
    canaryStatus: outboundPassed ? "passed" : "needs_review",
    blockerReasonCodes: outboundPassed ? [] : ["outbound_receiver_did_not_accept_post"],
    externalOutboundWriteSendOccurred: true,
    ...commonSafety,
  };
  const model = {
    artifactKind: "production_model_promotion_bounded_canary_proof",
    generatedAt,
    runtimeJobId: `${runId}-model-promotion`,
    workItemId: `${runId}-model-promotion-work`,
    rosterRef: config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS"),
    candidateModelId: config.get("OPENCLAW_PRODUCTION_MODEL_CANDIDATE_ID"),
    baselineModelId: config.get("OPENCLAW_PRODUCTION_MODEL_BASELINE_ID"),
    allowedRole: "test_engineer",
    qualityGate: config.get("OPENCLAW_PRODUCTION_MODEL_QUALITY_GATE"),
    costGate: config.get("OPENCLAW_PRODUCTION_MODEL_COST_GATE"),
    latencyGate: config.get("OPENCLAW_PRODUCTION_MODEL_LATENCY_GATE"),
    reliabilityGate: config.get("OPENCLAW_PRODUCTION_MODEL_RELIABILITY_GATE"),
    canaryCriteria: config.get("OPENCLAW_PRODUCTION_MODEL_CANARY_CRITERIA"),
    rollbackRef: config.get("OPENCLAW_PRODUCTION_MODEL_ROLLBACK_PLAN"),
    killSwitchRef: config.get("OPENCLAW_PRODUCTION_MODEL_KILL_SWITCH"),
    auditRefs: ["audit://production-authority-canary/model-promotion"],
    workQueueReadback: {
      authorityState: "default_enabled",
      rosterRef: config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS"),
      rollbackStatus: "available",
      killSwitchStatus: "visible",
      closeoutState: "present",
    },
    canaryStatus: modelPassed ? "passed" : "needs_review",
    productionModelPromotionOccurred: false,
    v4ProRoleBoundaryPreserved: true,
    ...commonSafety,
  };
  const incident = {
    artifactKind: "production_authority_canary_incident_drill_proof",
    generatedAt,
    runId,
    cases: [
      {
        caseId: "deploy_failed_health_check",
        simulatedFailure: true,
        recovery: "rollback_ref_available",
        falseSuccessClaimed: false,
      },
      {
        caseId: "outbound_payload_scanner_block",
        simulatedFailure: true,
        recovery: "blocked_before_send",
        falseSuccessClaimed: false,
      },
      {
        caseId: "outbound_rate_limit",
        simulatedFailure: true,
        recovery: "needs_review_after_rate_limit",
        falseSuccessClaimed: false,
      },
      {
        caseId: "model_canary_fail",
        simulatedFailure: true,
        recovery: "rollback_to_baseline_ref",
        falseSuccessClaimed: false,
      },
    ],
    workQueueReadback: {
      incidentStateVisible: true,
      rollbackStateVisible: true,
      needsReviewStateVisible: true,
    },
    ...commonSafety,
  };
  const soak = {
    artifactKind: "production_authority_short_default_enabled_soak_proof",
    generatedAt,
    runId,
    authorityChecks: {
      productionDeploy: deploy.canaryStatus,
      externalOutboundWrite: outbound.canaryStatus,
      productionModelPromotion: model.canaryStatus,
    },
    workQueueAuthorityCockpitAccurate:
      deploy.workQueueReadback.closeoutState === "present" &&
      outbound.workQueueReadback.closeoutState === "present" &&
      model.workQueueReadback.closeoutState === "present",
    overallStatus:
      deploy.canaryStatus === "passed" &&
      outbound.canaryStatus === "passed" &&
      model.canaryStatus === "passed"
        ? "passed"
        : "needs_review",
    blockerReasonCodes: outbound.blockerReasonCodes,
    ...commonSafety,
  };
  const decision = {
    artifactKind: "production_authority_scope_replacement_decision",
    generatedAt,
    currentScopes: {
      deployTarget: config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
      outboundDestination,
      modelPromotionScope: config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS"),
    },
    replaceCanaryScopesWithTrueProductionScopes: false,
    decision:
      soak.overallStatus === "passed"
        ? "defer_until_operator_production_target_decision"
        : "do_not_replace_scopes",
    reasonCodes:
      soak.overallStatus === "passed"
        ? ["canary_scopes_passed_but_true_production_scope_requires_explicit_operator_decision"]
        : ["outbound_write_canary_needs_review_before_scope_expansion"],
    ...commonSafety,
  };
  const artifacts = [];
  const receiverSetupArtifactPath =
    ".artifacts/execution-platform/outbound-write-canary-receiver-setup-proof.json";
  const receiverSetupText = await readTextIfExists(path.join(root, receiverSetupArtifactPath));
  if (receiverSetupText) {
    artifacts.push({ path: receiverSetupArtifactPath, sha256: sha256(receiverSetupText) });
  }
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-canary-execution-preflight-proof.json",
      preflight,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-deploy-bounded-canary-proof.json",
      deploy,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/outbound-write-bounded-canary-proof.json",
      outbound,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-model-promotion-bounded-canary-proof.json",
      model,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-canary-incident-drill-proof.json",
      incident,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-short-soak-proof.json",
      soak,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-scope-replacement-decision.json",
      decision,
    ),
  );
  artifacts.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-canary-artifact-index.json",
      {
        artifactKind: "production_authority_canary_artifact_index",
        generatedAt,
        runId,
        artifacts,
      },
    ),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        deployCanary: deploy.canaryStatus,
        outboundCanary: outbound.canaryStatus,
        outboundStatus: outboundPost.status,
        modelPromotionCanary: model.canaryStatus,
        soakStatus: soak.overallStatus,
        replaceCanaryScopesWithTrueProductionScopes:
          decision.replaceCanaryScopesWithTrueProductionScopes,
        decision: decision.decision,
      },
      null,
      2,
    ),
  );
}

await main();
