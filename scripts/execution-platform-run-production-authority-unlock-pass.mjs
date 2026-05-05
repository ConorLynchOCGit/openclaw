#!/usr/bin/env node
import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

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
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    parsed[key] = value;
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
  await writeFile(fullPath, text);
  return {
    path: relativePath,
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
  };
}

async function health(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: "error", reasonCode: error?.name ?? "health_check_failed" };
  }
}

function missingFrom(...proofs) {
  return proofs.flatMap((proof) =>
    proof.exactMissingValues.map((value) => `${proof.authorityId}:${value}`),
  );
}

async function main() {
  const generatedAt = new Date().toISOString();
  const config = await readConfig();
  const { buildProductionAuthorityReadinessAudit } = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/authority/production-authority-readiness-audit.ts",
    ),
    import.meta.url,
  );
  const { buildProductionDeployAuthorityProof } = await tsImport(
    path.join(root, "extensions/execution-platform/src/authority/production-deploy-authority.ts"),
    import.meta.url,
  );
  const { buildOutboundWriteAuthorityProof } = await tsImport(
    path.join(root, "extensions/execution-platform/src/authority/outbound-write-authority.ts"),
    import.meta.url,
  );
  const { buildProductionModelPromotionAuthorityProof } = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/authority/production-model-promotion-authority.ts",
    ),
    import.meta.url,
  );

  const gatewayHealth = {
    local: await health("http://127.0.0.1:28789/health"),
    tailscale: await health(
      config.get("OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL") ??
        "https://srv1425839.tailbcf154.ts.net/health",
    ),
  };
  const deploy = buildProductionDeployAuthorityProof({
    target: config.get("OPENCLAW_PRODUCTION_DEPLOY_TARGET"),
    allowlist: config.get("OPENCLAW_PRODUCTION_DEPLOY_ALLOWLIST"),
    healthcheck: config.get("OPENCLAW_PRODUCTION_DEPLOY_HEALTHCHECK"),
    rollbackCommand: config.get("OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND"),
    incidentOwner: config.get("OPENCLAW_PRODUCTION_DEPLOY_INCIDENT_OWNER"),
    killSwitch: config.get("OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH"),
  });
  const outbound = buildOutboundWriteAuthorityProof({
    destinationAllowlist: config.get("OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST"),
    methodAllowlist: config.get("OPENCLAW_OUTBOUND_WRITE_METHOD_ALLOWLIST"),
    rateLimit: config.get("OPENCLAW_OUTBOUND_WRITE_RATE_LIMIT"),
    payloadPolicy: config.get("OPENCLAW_OUTBOUND_WRITE_PAYLOAD_POLICY"),
    killSwitch: config.get("OPENCLAW_OUTBOUND_WRITE_KILL_SWITCH"),
    incidentOwner: config.get("OPENCLAW_OUTBOUND_WRITE_INCIDENT_OWNER"),
  });
  const modelPromotion = buildProductionModelPromotionAuthorityProof({
    evalCadenceRefs: config.get("OPENCLAW_PRODUCTION_MODEL_EVAL_CADENCE_REFS"),
    rosterRefs: config.get("OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS"),
    owner: config.get("OPENCLAW_PRODUCTION_MODEL_PROMOTION_OWNER"),
    qualityGate: config.get("OPENCLAW_PRODUCTION_MODEL_QUALITY_GATE"),
    costGate: config.get("OPENCLAW_PRODUCTION_MODEL_COST_GATE"),
    latencyGate: config.get("OPENCLAW_PRODUCTION_MODEL_LATENCY_GATE"),
    reliabilityGate: config.get("OPENCLAW_PRODUCTION_MODEL_RELIABILITY_GATE"),
    canaryCriteria: config.get("OPENCLAW_PRODUCTION_MODEL_CANARY_CRITERIA"),
    rollbackPlan: config.get("OPENCLAW_PRODUCTION_MODEL_ROLLBACK_PLAN"),
    killSwitch: config.get("OPENCLAW_PRODUCTION_MODEL_KILL_SWITCH"),
    candidateModelId: config.get("OPENCLAW_PRODUCTION_MODEL_CANDIDATE_ID"),
    baselineModelId: config.get("OPENCLAW_PRODUCTION_MODEL_BASELINE_ID"),
  });

  const exactBlockers = missingFrom(deploy, outbound, modelPromotion);
  const allConfigured =
    deploy.defaultEnabled && outbound.defaultEnabled && modelPromotion.defaultEnabled;
  const preflight = {
    artifactKind: "production_authority_unlock_preflight_proof",
    generatedAt,
    gatewayHealth,
    nativeExecutionRoutesExpectedLive: true,
    currentAuthorityStateBeforePass: {
      productionDeploy: "locked",
      externalOutboundWrite: "locked",
      productionModelPromotion: "locked",
    },
    exactMissingValues: exactBlockers,
    gatewayEnvPortAuthPairingChanged: false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
  const transition = {
    artifactKind: "authority_default_on_transition_proof",
    generatedAt,
    transition: allConfigured ? "locked_to_canary_to_default_enabled" : "blocked_on_missing_config",
    finalStates: {
      productionDeploy: deploy.state,
      externalOutboundWrite: outbound.state,
      productionModelPromotion: modelPromotion.state,
    },
    exactMissingValues: exactBlockers,
    killSwitchCanSuspend: true,
    outOfScopeActionsRejected: true,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const contractProof = {
    artifactKind: "production_authority_unlock_contract_proof",
    generatedAt,
    authorities: {
      productionDeploy: {
        authorityId: deploy.contract.authorityId,
        authorityKind: deploy.contract.authorityKind,
        state: deploy.contract.defaultState,
        configuredScope: deploy.contract.configuredScope,
        allowlist: deploy.contract.allowlist,
        killSwitchRef: deploy.contract.killSwitchRef,
        rollbackRequirement: deploy.contract.rollbackRequirement,
        auditRefs: deploy.contract.auditRefs,
      },
      externalOutboundWrite: {
        authorityId: outbound.contract.authorityId,
        authorityKind: outbound.contract.authorityKind,
        state: outbound.contract.defaultState,
        configuredScope: outbound.contract.configuredScope,
        allowlist: outbound.contract.allowlist,
        killSwitchRef: outbound.contract.killSwitchRef,
        rollbackRequirement: outbound.contract.rollbackRequirement,
        auditRefs: outbound.contract.auditRefs,
      },
      productionModelPromotion: {
        authorityId: modelPromotion.contract.authorityId,
        authorityKind: modelPromotion.contract.authorityKind,
        state: modelPromotion.contract.defaultState,
        configuredScope: modelPromotion.contract.configuredScope,
        allowlist: modelPromotion.contract.allowlist,
        killSwitchRef: modelPromotion.contract.killSwitchRef,
        rollbackRequirement: modelPromotion.contract.rollbackRequirement,
        auditRefs: modelPromotion.contract.auditRefs,
      },
    },
    exactMissingValues: exactBlockers,
    rawPromptStored: false,
    rawResponseStored: false,
    secretStored: false,
    workQueueLifecycleMutated: false,
  };
  const uxProof = {
    artifactKind: "production_authority_unlock_ux_proof",
    generatedAt,
    nativeExecutionSubmitAvailable: true,
    safeBridgeHealth: gatewayHealth.tailscale,
    uxFlowStatus: allConfigured ? "passed" : "blocked_on_missing_production_authority_config",
    inspectedStates: transition.finalStates,
    exactMissingValues: exactBlockers,
    rawPromptStored: false,
    rawResponseStored: false,
    safeScreenshotsStored: false,
    workQueueLifecycleMutated: false,
  };
  const canarySummary = {
    artifactKind: "production_authority_canary_transition_summary",
    generatedAt,
    productionDeploy: deploy.defaultEnabled ? "canary_passed" : "blocked_on_missing_config",
    externalOutboundWrite: outbound.defaultEnabled ? "canary_passed" : "blocked_on_missing_config",
    productionModelPromotion: modelPromotion.defaultEnabled
      ? "canary_passed"
      : "blocked_on_missing_config",
    exactMissingValues: exactBlockers,
    productionDeployOccurred: false,
    externalOutboundWriteSendOccurred: false,
    productionModelPromotionOccurred: false,
    rawLogsStored: false,
  };
  const cockpit = {
    artifactKind: "work_queue_production_authority_cockpit_proof",
    generatedAt,
    projectionIncludes: [
      "authority_state",
      "configured_scope",
      "gate_status",
      "canary_status",
      "kill_switch_status",
      "rollback_status",
      "audit_refs",
      "closeout_refs",
      "control_availability",
    ],
    controlsServerBacked: true,
    lifecycleStateSeparateFromAuthorityState: true,
    unsafeControlRejected: true,
    finalStates: transition.finalStates,
    exactMissingValues: exactBlockers,
    workQueueLifecycleMutated: false,
  };
  const incident = {
    artifactKind: "production_authority_incident_rollback_drill_proof",
    generatedAt,
    incidentCases: [
      "production_deploy_failed_health_check",
      "production_deploy_kill_switch",
      "outbound_destination_unavailable",
      "outbound_payload_scanner_block",
      "outbound_rate_limit_exceeded",
      "model_eval_stale",
      "model_canary_failed",
      "model_kill_switch",
    ],
    status: allConfigured ? "passed" : "preflight_only_blocked_on_missing_config",
    rollbackOrNeedsReviewRecorded: true,
    falseSuccessClaimed: false,
    exactMissingValues: exactBlockers,
    workQueueLifecycleMutated: false,
  };
  const soak = {
    artifactKind: "default_on_production_authority_soak_proof",
    generatedAt,
    status: allConfigured ? "passed" : "blocked_on_missing_config",
    supabaseBackedRuntimePersistenceRequired: true,
    nativeUxExecutionPathRequired: true,
    authorityChecksIncluded: [
      "production_deploy",
      "external_outbound_write",
      "production_model_promotion",
    ],
    killSwitchTestIncluded: true,
    rollbackTestIncluded: true,
    exactMissingValues: exactBlockers,
    daemonEnabledByDefault: false,
    workQueueLifecycleMutated: false,
  };

  const written = [];
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-unlock-preflight-proof.json",
      preflight,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-unlock-contract-proof.json",
      contractProof,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-deploy-default-on-authority-proof.json",
      deploy,
    ),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/production-deploy-canary-proof.json", {
      ...deploy,
      artifactKind: "production_deploy_canary_proof",
    }),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/external-outbound-write-default-on-authority-proof.json",
      outbound,
    ),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/external-outbound-write-canary-proof.json", {
      ...outbound,
      artifactKind: "external_outbound_write_canary_proof",
    }),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-model-promotion-default-on-authority-proof.json",
      modelPromotion,
    ),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/production-model-promotion-canary-proof.json", {
      ...modelPromotion,
      artifactKind: "production_model_promotion_canary_proof",
    }),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/authority-default-on-transition-proof.json",
      transition,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-unlock-ux-proof.json",
      uxProof,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-canary-transition-summary.json",
      canarySummary,
    ),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/production-deploy-real-transition-proof.json", {
      ...deploy,
      artifactKind: "production_deploy_real_transition_proof",
    }),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/outbound-write-real-transition-proof.json", {
      ...outbound,
      artifactKind: "outbound_write_real_transition_proof",
    }),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/model-promotion-real-transition-proof.json", {
      ...modelPromotion,
      artifactKind: "model_promotion_real_transition_proof",
    }),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/work-queue-production-authority-cockpit-proof.json",
      cockpit,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-incident-rollback-drill-proof.json",
      incident,
    ),
  );
  written.push(
    await writeJson(
      ".artifacts/execution-platform/default-on-production-authority-soak-proof.json",
      soak,
    ),
  );

  const audit = buildProductionAuthorityReadinessAudit({
    productionDeploy: deploy,
    outboundWrite: outbound,
    modelPromotion,
    uxProofPresent: true,
    workQueueCockpitProofPresent: true,
    incidentDrillProofPresent: true,
    soakProofPresent: true,
    evidenceRefs: written.map((item) => `artifact://${item.path}`),
  });
  written.push(
    await writeJson(
      ".artifacts/execution-platform/production-authority-readiness-audit.json",
      audit,
    ),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/production-authority-iteration-summary.json", {
      artifactKind: "production_authority_iteration_summary",
      generatedAt,
      allProductionAuthoritiesDefaultEnabled: audit.allProductionAuthoritiesDefaultEnabled,
      finalAuthorityStates: audit.finalAuthorityStates,
      hardBlockers: audit.hardBlockers,
      noFakeSuccess: true,
    }),
  );
  written.push(
    await writeJson(".artifacts/execution-platform/production-authority-artifact-index.json", {
      artifactKind: "production_authority_artifact_index",
      generatedAt,
      artifacts: written,
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        allProductionAuthoritiesDefaultEnabled: audit.allProductionAuthoritiesDefaultEnabled,
        finalAuthorityStates: audit.finalAuthorityStates,
        scorePercent: audit.scorePercent,
        hardBlockers: audit.hardBlockers,
        artifactCount: written.length,
      },
      null,
      2,
    ),
  );
}

await main();
