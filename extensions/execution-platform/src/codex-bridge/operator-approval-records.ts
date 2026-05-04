export type OperatorApprovalKind =
  | "high_blast_radius_authority"
  | "model_roster_change"
  | "security_override"
  | "deploy_dry_run"
  | "model_promotion_dry_run"
  | "acp_transport_use"
  | "v4_pro_test_engineer_use";

export type OperatorApprovalRecord = {
  artifactKind: "operator_approval_record";
  approvalId: string;
  approvalKind: OperatorApprovalKind;
  requestedBy: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  scope: string[];
  runtimeJobId: string | null;
  workItemId: string | null;
  constraints: string[];
  rollbackRequirement: string | null;
  evidenceRefs: string[];
  revoked: boolean;
  canceled: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  secretStored: false;
};

export function validateOperatorApprovalRecord(
  record: OperatorApprovalRecord,
  now: Date = new Date(),
): { valid: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  if (!record.approvalId.trim()) {
    reasonCodes.push("approval_id_required");
  }
  if (!record.approvedBy.trim() || !record.requestedBy.trim()) {
    reasonCodes.push("operator_identity_required");
  }
  if (record.scope.length === 0) {
    reasonCodes.push("approval_scope_required");
  }
  if (record.evidenceRefs.length === 0) {
    reasonCodes.push("approval_evidence_required");
  }
  if (new Date(record.expiresAt).getTime() <= now.getTime()) {
    reasonCodes.push("approval_expired");
  }
  if (record.revoked || record.canceled) {
    reasonCodes.push("approval_not_active");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function createOperatorApprovalRecord(
  input: Omit<
    OperatorApprovalRecord,
    | "artifactKind"
    | "revoked"
    | "canceled"
    | "rawPromptStored"
    | "rawResponseStored"
    | "secretStored"
  > & {
    revoked?: boolean;
    canceled?: boolean;
  },
): OperatorApprovalRecord {
  return {
    artifactKind: "operator_approval_record",
    revoked: input.revoked ?? false,
    canceled: input.canceled ?? false,
    rawPromptStored: false,
    rawResponseStored: false,
    secretStored: false,
    ...input,
  };
}

export type RuntimeApprovalEnforcementDecision = {
  artifactKind: "runtime_approval_enforcement_decision";
  requestedScope: string;
  authorityOrAction: OperatorApprovalKind;
  allowed: boolean;
  status: "allowed" | "requires_approval" | "blocked";
  approvalId: string | null;
  reasonCodes: string[];
  approvalRuntimeBacked: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  secretStored: false;
  workQueueLifecycleMutated: false;
};

export function enforceRuntimeApproval(input: {
  authorityOrAction: OperatorApprovalKind;
  requestedScope: string;
  approvals?: OperatorApprovalRecord[];
  now?: Date;
}): RuntimeApprovalEnforcementDecision {
  const approvals = input.approvals ?? [];
  const matching = approvals.find(
    (approval) =>
      approval.approvalKind === input.authorityOrAction &&
      approval.scope.includes(input.requestedScope),
  );
  const reasonCodes: string[] = [];
  if (!matching) {
    reasonCodes.push("scoped_operator_approval_required");
  } else {
    const validation = validateOperatorApprovalRecord(matching, input.now);
    reasonCodes.push(...validation.reasonCodes);
  }
  const allowed = Boolean(matching && reasonCodes.length === 0);
  return {
    artifactKind: "runtime_approval_enforcement_decision",
    requestedScope: input.requestedScope,
    authorityOrAction: input.authorityOrAction,
    allowed,
    status: allowed ? "allowed" : matching ? "blocked" : "requires_approval",
    approvalId: matching?.approvalId ?? null,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    approvalRuntimeBacked: Boolean(matching),
    rawPromptStored: false,
    rawResponseStored: false,
    secretStored: false,
    workQueueLifecycleMutated: false,
  };
}
