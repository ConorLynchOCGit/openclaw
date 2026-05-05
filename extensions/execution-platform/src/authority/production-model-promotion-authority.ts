import {
  createProductionAuthorityUnlockContract,
  createProductionAuthorityUnlockRecord,
  decideProductionAuthorityExecution,
  type ProductionAuthorityExecutionDecision,
  type ProductionAuthorityUnlockContract,
  type ProductionAuthorityUnlockRecord,
} from "./production-authority-unlock-contract.ts";

export type ProductionModelPromotionConfig = {
  evalCadenceRefs?: string[] | string | null;
  rosterRefs?: string[] | string | null;
  owner?: string | null;
  qualityGate?: string | null;
  costGate?: string | null;
  latencyGate?: string | null;
  reliabilityGate?: string | null;
  canaryCriteria?: string | null;
  rollbackPlan?: string | null;
  killSwitch?: string | null;
  candidateModelId?: string | null;
  baselineModelId?: string | null;
};

export type ProductionModelPromotionAuthorityProof = {
  artifactKind: "production_model_promotion_default_on_authority_proof";
  authorityId: "production_model_promotion";
  configured: boolean;
  defaultEnabled: boolean;
  state: "locked" | "default_enabled";
  exactMissingValues: string[];
  contract: ProductionAuthorityUnlockContract;
  unlockRecord: ProductionAuthorityUnlockRecord | null;
  evalGates: {
    quality: string;
    cost: string;
    latency: string;
    reliability: string;
    canary: string;
  };
  rollbackAvailable: boolean;
  auditRefs: string[];
  workQueueProjectionRefs: string[];
  executionDecision: ProductionAuthorityExecutionDecision;
  productionModelPromotionOccurred: boolean;
  v4ProRoleBoundaryPreserved: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogsStored: false;
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

export function buildProductionModelPromotionAuthorityProof(
  config: ProductionModelPromotionConfig,
): ProductionModelPromotionAuthorityProof {
  const evalCadenceRefs = list(config.evalCadenceRefs);
  const rosterRefs = list(config.rosterRefs);
  const requiredConfig: Array<[string, unknown]> = [
    [
      "OPENCLAW_PRODUCTION_MODEL_EVAL_CADENCE_REFS",
      evalCadenceRefs.length > 0 ? "configured" : null,
    ],
    ["OPENCLAW_PRODUCTION_MODEL_ROSTER_REFS", rosterRefs.length > 0 ? "configured" : null],
    ["OPENCLAW_PRODUCTION_MODEL_PROMOTION_OWNER", config.owner],
    ["OPENCLAW_PRODUCTION_MODEL_QUALITY_GATE", config.qualityGate],
    ["OPENCLAW_PRODUCTION_MODEL_COST_GATE", config.costGate],
    ["OPENCLAW_PRODUCTION_MODEL_LATENCY_GATE", config.latencyGate],
    ["OPENCLAW_PRODUCTION_MODEL_RELIABILITY_GATE", config.reliabilityGate],
    ["OPENCLAW_PRODUCTION_MODEL_CANARY_CRITERIA", config.canaryCriteria],
    ["OPENCLAW_PRODUCTION_MODEL_ROLLBACK_PLAN", config.rollbackPlan],
    ["OPENCLAW_PRODUCTION_MODEL_KILL_SWITCH", config.killSwitch],
    ["OPENCLAW_PRODUCTION_MODEL_CANDIDATE_ID", config.candidateModelId],
    ["OPENCLAW_PRODUCTION_MODEL_BASELINE_ID", config.baselineModelId],
  ];
  const missing = requiredConfig.filter(([, value]) => !value).map(([key]) => key);
  const configured = missing.length === 0;
  const auditRefs = configured ? ["audit://production-model-promotion/unlock"] : [];
  const workQueueProjectionRefs = configured
    ? ["work-queue://authority/production_model_promotion"]
    : [];
  const unlockRecord = configured
    ? createProductionAuthorityUnlockRecord({
        unlockId: "unlock-production-model-promotion-default-on",
        authorityId: "production_model_promotion",
        authorityKind: "production_model_promotion",
        state: "default_enabled",
        scope: rosterRefs,
        owner: config.owner!,
        approver: "operator",
        approvedAt: new Date(0).toISOString(),
        constraints: ["current_eval_evidence_required", "canary_required", "rollback_required"],
        rollbackRefs: [config.rollbackPlan!],
        killSwitchRefs: [config.killSwitch!],
        auditRefs,
        reviewCadence: "per_eval_cadence",
      })
    : null;
  const contract = createProductionAuthorityUnlockContract({
    authorityId: "production_model_promotion",
    authorityKind: "production_model_promotion",
    defaultState: configured ? "default_enabled" : "locked",
    configuredScope: rosterRefs,
    allowlist: rosterRefs,
    runtimeUnlockRecordRef: unlockRecord ? "runtime-unlock://production_model_promotion" : null,
    owner: config.owner ?? null,
    approver: configured ? "operator" : null,
    unlockedAt: configured ? unlockRecord!.approvedAt : null,
    constraints: ["eval_gates_required", "v4_pro_role_boundary_preserved"],
    rollbackRequirement: config.rollbackPlan ?? null,
    killSwitchRef: config.killSwitch ?? null,
    gateRefs: [
      ...evalCadenceRefs,
      config.qualityGate,
      config.costGate,
      config.latencyGate,
      config.reliabilityGate,
      config.canaryCriteria,
    ].filter((item): item is string => Boolean(item)),
    auditRefs,
    workQueueProjectionRefs,
    reviewCadence: configured ? "per_eval_cadence" : null,
    emergencySuspensionBehavior: "suspend_authority",
  });
  return {
    artifactKind: "production_model_promotion_default_on_authority_proof",
    authorityId: "production_model_promotion",
    configured,
    defaultEnabled: configured,
    state: configured ? "default_enabled" : "locked",
    exactMissingValues: missing,
    contract,
    unlockRecord,
    evalGates: {
      quality: config.qualityGate ? "configured" : "missing",
      cost: config.costGate ? "configured" : "missing",
      latency: config.latencyGate ? "configured" : "missing",
      reliability: config.reliabilityGate ? "configured" : "missing",
      canary: config.canaryCriteria ? "configured" : "missing",
    },
    rollbackAvailable: Boolean(config.rollbackPlan),
    auditRefs,
    workQueueProjectionRefs,
    executionDecision: decideProductionAuthorityExecution({
      contract,
      requestedTarget: rosterRefs[0] ?? "missing-production-model-roster",
      killSwitchActive: false,
    }),
    productionModelPromotionOccurred: false,
    v4ProRoleBoundaryPreserved: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
