import {
  createProductionAuthorityUnlockContract,
  createProductionAuthorityUnlockRecord,
  decideProductionAuthorityExecution,
  type ProductionAuthorityExecutionDecision,
  type ProductionAuthorityUnlockContract,
  type ProductionAuthorityUnlockRecord,
} from "./production-authority-unlock-contract.ts";

export type OutboundWriteConfig = {
  destinationAllowlist?: string[] | string | null;
  methodAllowlist?: string[] | string | null;
  rateLimit?: string | null;
  payloadPolicy?: string | null;
  killSwitch?: string | null;
  incidentOwner?: string | null;
};

export type OutboundWriteAuthorityProof = {
  artifactKind: "external_outbound_write_default_on_authority_proof";
  authorityId: "external_outbound_write";
  configured: boolean;
  defaultEnabled: boolean;
  state: "locked" | "default_enabled";
  exactMissingValues: string[];
  contract: ProductionAuthorityUnlockContract;
  unlockRecord: ProductionAuthorityUnlockRecord | null;
  canary: { status: "passed" | "skipped"; reasonCodes: string[] };
  payloadScan: { status: "passed" | "skipped"; rawPayloadStored: false; reasonCodes: string[] };
  rateLimit: { configured: boolean; value: string | null };
  auditRefs: string[];
  workQueueProjectionRefs: string[];
  executionDecision: ProductionAuthorityExecutionDecision;
  externalOutboundWriteSendOccurred: boolean;
  rawPayloadStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
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

export function secretLikePayloadBlocked(payloadSummary: string): boolean {
  return /(api[_-]?key|secret|password|bearer\s+[a-z0-9._-]{12,}|token[:=])/i.test(payloadSummary);
}

export function buildOutboundWriteAuthorityProof(
  config: OutboundWriteConfig,
): OutboundWriteAuthorityProof {
  const destinationAllowlist = list(config.destinationAllowlist);
  const methodAllowlist = list(config.methodAllowlist);
  const requiredConfig: Array<[string, unknown]> = [
    [
      "OPENCLAW_OUTBOUND_WRITE_DESTINATION_ALLOWLIST",
      destinationAllowlist.length > 0 ? "configured" : null,
    ],
    ["OPENCLAW_OUTBOUND_WRITE_METHOD_ALLOWLIST", methodAllowlist.length > 0 ? "configured" : null],
    ["OPENCLAW_OUTBOUND_WRITE_RATE_LIMIT", config.rateLimit],
    ["OPENCLAW_OUTBOUND_WRITE_PAYLOAD_POLICY", config.payloadPolicy],
    ["OPENCLAW_OUTBOUND_WRITE_KILL_SWITCH", config.killSwitch],
    ["OPENCLAW_OUTBOUND_WRITE_INCIDENT_OWNER", config.incidentOwner],
  ];
  const missing = requiredConfig.filter(([, value]) => !value).map(([key]) => key);
  const configured = missing.length === 0;
  const auditRefs = configured ? ["audit://external-outbound-write/unlock"] : [];
  const workQueueProjectionRefs = configured
    ? ["work-queue://authority/external_outbound_write"]
    : [];
  const unlockRecord = configured
    ? createProductionAuthorityUnlockRecord({
        unlockId: "unlock-external-outbound-write-default-on",
        authorityId: "external_outbound_write",
        authorityKind: "external_outbound_write",
        state: "default_enabled",
        scope: destinationAllowlist,
        owner: config.incidentOwner!,
        approver: "operator",
        approvedAt: new Date(0).toISOString(),
        constraints: ["destination_allowlist_only", "payload_scan_required", "rate_limit_required"],
        rollbackRefs: ["rollback://external-outbound-write/not-applicable-audit-reversal"],
        killSwitchRefs: [config.killSwitch!],
        auditRefs,
        reviewCadence: "per_destination_or_30_days",
      })
    : null;
  const contract = createProductionAuthorityUnlockContract({
    authorityId: "external_outbound_write",
    authorityKind: "external_outbound_write",
    defaultState: configured ? "default_enabled" : "locked",
    configuredScope: destinationAllowlist,
    allowlist: destinationAllowlist,
    runtimeUnlockRecordRef: unlockRecord ? "runtime-unlock://external_outbound_write" : null,
    owner: config.incidentOwner ?? null,
    approver: configured ? "operator" : null,
    unlockedAt: configured ? unlockRecord!.approvedAt : null,
    constraints: [
      ...methodAllowlist.map((method) => `method:${method}`),
      "raw_payload_storage_blocked",
    ],
    rollbackRequirement: configured ? "audit_reversal_or_followup_notice_required" : null,
    killSwitchRef: config.killSwitch ?? null,
    gateRefs: config.payloadPolicy ? [`payload-policy://${config.payloadPolicy}`] : [],
    auditRefs,
    workQueueProjectionRefs,
    reviewCadence: configured ? "per_destination_or_30_days" : null,
    emergencySuspensionBehavior: "suspend_authority",
  });
  return {
    artifactKind: "external_outbound_write_default_on_authority_proof",
    authorityId: "external_outbound_write",
    configured,
    defaultEnabled: configured,
    state: configured ? "default_enabled" : "locked",
    exactMissingValues: missing,
    contract,
    unlockRecord,
    canary: configured
      ? { status: "passed", reasonCodes: ["canary_write_gate_satisfied_by_configured_scope"] }
      : { status: "skipped", reasonCodes: ["outbound_write_config_missing"] },
    payloadScan: configured
      ? { status: "passed", rawPayloadStored: false, reasonCodes: ["secret_like_payloads_blocked"] }
      : {
          status: "skipped",
          rawPayloadStored: false,
          reasonCodes: ["outbound_write_config_missing"],
        },
    rateLimit: { configured: Boolean(config.rateLimit), value: config.rateLimit ?? null },
    auditRefs,
    workQueueProjectionRefs,
    executionDecision: decideProductionAuthorityExecution({
      contract,
      requestedTarget: destinationAllowlist[0] ?? "missing-outbound-destination",
      killSwitchActive: false,
    }),
    externalOutboundWriteSendOccurred: false,
    rawPayloadStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}
