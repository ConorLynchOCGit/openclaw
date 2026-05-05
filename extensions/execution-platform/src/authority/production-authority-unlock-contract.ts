export type ProductionAuthorityKind =
  | "production_deploy"
  | "external_outbound_write"
  | "production_model_promotion";

export type ProductionAuthorityState =
  | "locked"
  | "approval_required"
  | "canary"
  | "default_enabled"
  | "suspended"
  | "blocked";

export type ProductionAuthorityUnlockContract = {
  artifactKind: "production_authority_unlock_contract";
  authorityId: string;
  authorityKind: ProductionAuthorityKind;
  defaultState: ProductionAuthorityState;
  configuredScope: string[];
  allowlist: string[];
  runtimeUnlockRecordRef: string | null;
  owner: string | null;
  approver: string | null;
  unlockedAt: string | null;
  constraints: string[];
  rollbackRequirement: string | null;
  killSwitchRef: string | null;
  gateRefs: string[];
  auditRefs: string[];
  workQueueProjectionRefs: string[];
  reviewCadence: string | null;
  emergencySuspensionBehavior: "suspend_authority" | "block_until_operator_review";
  rawPromptStored: false;
  rawResponseStored: false;
  secretStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type ProductionAuthorityUnlockValidation = {
  artifactKind: "production_authority_unlock_validation";
  authorityId: string;
  authorityKind: ProductionAuthorityKind;
  valid: boolean;
  executable: boolean;
  state: ProductionAuthorityState;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type ProductionAuthorityUnlockRecord = {
  artifactKind: "production_authority_unlock_record";
  unlockId: string;
  authorityId: string;
  authorityKind: ProductionAuthorityKind;
  state: ProductionAuthorityState;
  scope: string[];
  owner: string;
  approver: string;
  approvedAt: string;
  constraints: string[];
  rollbackRefs: string[];
  killSwitchRefs: string[];
  auditRefs: string[];
  reviewCadence: string;
  runtimeJobId: string | null;
  workItemId: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  secretStored: false;
  workQueueLifecycleMutated: false;
};

export type ProductionAuthorityExecutionDecision = {
  artifactKind: "production_authority_execution_decision";
  authorityId: string;
  authorityKind: ProductionAuthorityKind;
  requestedTarget: string;
  decision: "allowed" | "blocked" | "requires_approval";
  state: ProductionAuthorityState;
  reasonCodes: string[];
  auditRefs: string[];
  killSwitchActive: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export function createProductionAuthorityUnlockContract(
  input: Omit<
    ProductionAuthorityUnlockContract,
    | "artifactKind"
    | "rawPromptStored"
    | "rawResponseStored"
    | "secretStored"
    | "workQueueLifecycleMutationAllowed"
  >,
): ProductionAuthorityUnlockContract {
  return {
    artifactKind: "production_authority_unlock_contract",
    rawPromptStored: false,
    rawResponseStored: false,
    secretStored: false,
    workQueueLifecycleMutationAllowed: false,
    ...input,
  };
}

export function validateProductionAuthorityUnlockContract(
  contract: ProductionAuthorityUnlockContract,
): ProductionAuthorityUnlockValidation {
  const reasonCodes: string[] = [];
  if (!contract.authorityId.trim()) {
    reasonCodes.push("authority_id_required");
  }
  if (contract.configuredScope.length === 0) {
    reasonCodes.push("configured_scope_required");
  }
  if (contract.allowlist.length === 0) {
    reasonCodes.push("allowlist_required");
  }
  if (!contract.owner?.trim()) {
    reasonCodes.push("owner_required");
  }
  if (!contract.approver?.trim()) {
    reasonCodes.push("approver_required");
  }
  if (!contract.rollbackRequirement?.trim()) {
    reasonCodes.push("rollback_required");
  }
  if (!contract.killSwitchRef?.trim()) {
    reasonCodes.push("kill_switch_required");
  }
  if (contract.gateRefs.length === 0) {
    reasonCodes.push("gate_refs_required");
  }
  if (contract.auditRefs.length === 0) {
    reasonCodes.push("audit_required");
  }
  if (contract.workQueueProjectionRefs.length === 0) {
    reasonCodes.push("work_queue_projection_required");
  }
  if (contract.rawPromptStored || contract.rawResponseStored || contract.secretStored) {
    reasonCodes.push("raw_or_secret_storage_rejected");
  }
  if (contract.workQueueLifecycleMutationAllowed) {
    reasonCodes.push("work_queue_lifecycle_mutation_rejected");
  }
  if (contract.defaultState === "default_enabled" && !contract.runtimeUnlockRecordRef) {
    reasonCodes.push("runtime_unlock_record_required");
  }
  const hardStateBlocked = ["locked", "suspended", "blocked"].includes(contract.defaultState);
  const valid = reasonCodes.length === 0;
  return {
    artifactKind: "production_authority_unlock_validation",
    authorityId: contract.authorityId,
    authorityKind: contract.authorityKind,
    valid,
    executable: valid && !hardStateBlocked,
    state: contract.defaultState,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function createProductionAuthorityUnlockRecord(input: {
  unlockId: string;
  authorityId: string;
  authorityKind: ProductionAuthorityKind;
  state: ProductionAuthorityState;
  scope: string[];
  owner: string;
  approver: string;
  approvedAt: string;
  constraints?: string[];
  rollbackRefs?: string[];
  killSwitchRefs?: string[];
  auditRefs?: string[];
  reviewCadence: string;
  runtimeJobId?: string | null;
  workItemId?: string | null;
}): ProductionAuthorityUnlockRecord {
  return {
    artifactKind: "production_authority_unlock_record",
    unlockId: input.unlockId,
    authorityId: input.authorityId,
    authorityKind: input.authorityKind,
    state: input.state,
    scope: input.scope,
    owner: input.owner,
    approver: input.approver,
    approvedAt: input.approvedAt,
    constraints: input.constraints ?? [],
    rollbackRefs: input.rollbackRefs ?? [],
    killSwitchRefs: input.killSwitchRefs ?? [],
    auditRefs: input.auditRefs ?? [],
    reviewCadence: input.reviewCadence,
    runtimeJobId: input.runtimeJobId ?? null,
    workItemId: input.workItemId ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    secretStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function decideProductionAuthorityExecution(input: {
  contract: ProductionAuthorityUnlockContract;
  requestedTarget: string;
  killSwitchActive?: boolean;
}): ProductionAuthorityExecutionDecision {
  const validation = validateProductionAuthorityUnlockContract(input.contract);
  const reasonCodes = [...validation.reasonCodes];
  const inScope =
    input.contract.configuredScope.includes(input.requestedTarget) ||
    input.contract.allowlist.includes(input.requestedTarget);
  if (!inScope) {
    reasonCodes.push("requested_target_out_of_scope");
  }
  if (input.killSwitchActive) {
    reasonCodes.push("kill_switch_active");
  }
  if (input.contract.defaultState === "locked") {
    reasonCodes.push("authority_locked");
  }
  if (input.contract.defaultState === "suspended") {
    reasonCodes.push("authority_suspended");
  }
  if (input.contract.defaultState === "blocked") {
    reasonCodes.push("authority_blocked");
  }
  const allowed =
    reasonCodes.length === 0 &&
    input.contract.defaultState === "default_enabled" &&
    validation.valid &&
    inScope;
  return {
    artifactKind: "production_authority_execution_decision",
    authorityId: input.contract.authorityId,
    authorityKind: input.contract.authorityKind,
    requestedTarget: input.requestedTarget,
    decision: allowed
      ? "allowed"
      : input.contract.defaultState === "approval_required" ||
          input.contract.defaultState === "canary"
        ? "requires_approval"
        : "blocked",
    state: input.killSwitchActive ? "suspended" : input.contract.defaultState,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    auditRefs: input.contract.auditRefs,
    killSwitchActive: input.killSwitchActive ?? false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}
