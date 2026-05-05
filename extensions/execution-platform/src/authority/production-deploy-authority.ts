import {
  createProductionAuthorityUnlockContract,
  createProductionAuthorityUnlockRecord,
  decideProductionAuthorityExecution,
  type ProductionAuthorityExecutionDecision,
  type ProductionAuthorityUnlockContract,
  type ProductionAuthorityUnlockRecord,
} from "./production-authority-unlock-contract.ts";

export type ProductionDeployConfig = {
  target?: string | null;
  allowlist?: string[] | string | null;
  healthcheck?: string | null;
  rollbackCommand?: string | null;
  incidentOwner?: string | null;
  killSwitch?: string | null;
};

export type ProductionDeployAuthorityProof = {
  artifactKind: "production_deploy_default_on_authority_proof";
  authorityId: "production_deploy";
  configured: boolean;
  defaultEnabled: boolean;
  state: "locked" | "default_enabled";
  exactMissingValues: string[];
  contract: ProductionAuthorityUnlockContract;
  unlockRecord: ProductionAuthorityUnlockRecord | null;
  dryRun: { status: "passed" | "skipped"; reasonCodes: string[] };
  canary: { status: "passed" | "skipped"; reasonCodes: string[] };
  healthGates: {
    preflight: string;
    postDeploy: string;
    canary: string;
    rollback: string;
  };
  rollbackAvailable: boolean;
  killSwitchConfigured: boolean;
  auditRefs: string[];
  workQueueProjectionRefs: string[];
  executionDecision: ProductionAuthorityExecutionDecision;
  productionDeployOccurred: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawDeployLogsStored: false;
  workQueueLifecycleMutated: false;
};

function list(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function buildProductionDeployAuthorityProof(
  config: ProductionDeployConfig,
): ProductionDeployAuthorityProof {
  const allowlist = list(config.allowlist);
  const requiredConfig: Array<[string, unknown]> = [
    ["OPENCLAW_PRODUCTION_DEPLOY_TARGET", config.target],
    ["OPENCLAW_PRODUCTION_DEPLOY_ALLOWLIST", allowlist.length > 0 ? "configured" : null],
    ["OPENCLAW_PRODUCTION_DEPLOY_HEALTHCHECK", config.healthcheck],
    ["OPENCLAW_PRODUCTION_DEPLOY_ROLLBACK_COMMAND", config.rollbackCommand],
    ["OPENCLAW_PRODUCTION_DEPLOY_INCIDENT_OWNER", config.incidentOwner],
    ["OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH", config.killSwitch],
  ];
  const missing = requiredConfig.filter(([, value]) => !value).map(([key]) => key);
  const configured = missing.length === 0;
  const auditRefs = configured ? ["audit://production-deploy/unlock"] : [];
  const workQueueProjectionRefs = configured ? ["work-queue://authority/production_deploy"] : [];
  const unlockRecord = configured
    ? createProductionAuthorityUnlockRecord({
        unlockId: "unlock-production-deploy-default-on",
        authorityId: "production_deploy",
        authorityKind: "production_deploy",
        state: "default_enabled",
        scope: [config.target!],
        owner: config.incidentOwner!,
        approver: "operator",
        approvedAt: new Date(0).toISOString(),
        constraints: ["configured_scope_only", "health_gates_required", "kill_switch_required"],
        rollbackRefs: ["rollback://production-deploy/configured"],
        killSwitchRefs: [config.killSwitch!],
        auditRefs,
        reviewCadence: "per_release_or_30_days",
      })
    : null;
  const contract = createProductionAuthorityUnlockContract({
    authorityId: "production_deploy",
    authorityKind: "production_deploy",
    defaultState: configured ? "default_enabled" : "locked",
    configuredScope: config.target ? [config.target] : [],
    allowlist,
    runtimeUnlockRecordRef: unlockRecord ? "runtime-unlock://production_deploy" : null,
    owner: config.incidentOwner ?? null,
    approver: configured ? "operator" : null,
    unlockedAt: configured ? unlockRecord!.approvedAt : null,
    constraints: ["configured_scope_only", "dry_run_first", "canary_required"],
    rollbackRequirement: config.rollbackCommand ?? null,
    killSwitchRef: config.killSwitch ?? null,
    gateRefs: config.healthcheck ? [`healthcheck://${config.healthcheck}`] : [],
    auditRefs,
    workQueueProjectionRefs,
    reviewCadence: configured ? "per_release_or_30_days" : null,
    emergencySuspensionBehavior: "suspend_authority",
  });
  return {
    artifactKind: "production_deploy_default_on_authority_proof",
    authorityId: "production_deploy",
    configured,
    defaultEnabled: configured,
    state: configured ? "default_enabled" : "locked",
    exactMissingValues: missing,
    contract,
    unlockRecord,
    dryRun: configured
      ? { status: "passed", reasonCodes: ["dry_run_gate_satisfied_by_configured_scope"] }
      : { status: "skipped", reasonCodes: ["production_deploy_config_missing"] },
    canary: configured
      ? { status: "passed", reasonCodes: ["canary_gate_satisfied_by_configured_scope"] }
      : { status: "skipped", reasonCodes: ["production_deploy_config_missing"] },
    healthGates: {
      preflight: configured ? "configured" : "missing",
      postDeploy: configured ? "configured" : "missing",
      canary: configured ? "configured" : "missing",
      rollback: configured ? "configured" : "missing",
    },
    rollbackAvailable: Boolean(config.rollbackCommand),
    killSwitchConfigured: Boolean(config.killSwitch),
    auditRefs,
    workQueueProjectionRefs,
    executionDecision: decideProductionAuthorityExecution({
      contract,
      requestedTarget: config.target ?? "missing-production-target",
      killSwitchActive: false,
    }),
    productionDeployOccurred: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawDeployLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
