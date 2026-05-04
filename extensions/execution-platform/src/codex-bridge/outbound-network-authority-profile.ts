import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type OutboundNetworkAuthorityProfile = {
  artifactKind: "codex_bridge_outbound_network_authority_profile";
  profileId: string;
  allowedDomains: string[];
  allowedActions: string[];
  dryRunOnly: boolean;
  localMockAllowed: boolean;
  secretsInPayloadAllowed: false;
  requestResponseRedactionRequired: true;
  auditTrailRequired: true;
  approvalRequired: true;
  timeoutMs: number;
  maxOutputBytes: number;
  deployAllowed: false;
  modelPromotionAllowed: false;
};

export type OutboundNetworkAuthorityProof = {
  artifactKind: "codex_bridge_outbound_network_authority_proof";
  profileId: string;
  targetDomain: string;
  action: string;
  status: "dry_run_recorded" | "local_mock_recorded" | "refused";
  blockingReasons: string[];
  realExternalSendPerformed: false;
  secretsLeaked: false;
  deployPerformed: false;
  modelPromotionPerformed: false;
};

export function createOutboundNetworkAuthorityProfile(
  input: Partial<
    Pick<
      OutboundNetworkAuthorityProfile,
      | "profileId"
      | "allowedDomains"
      | "allowedActions"
      | "dryRunOnly"
      | "localMockAllowed"
      | "timeoutMs"
      | "maxOutputBytes"
    >
  > = {},
): OutboundNetworkAuthorityProfile {
  return {
    artifactKind: "codex_bridge_outbound_network_authority_profile",
    profileId: input.profileId ?? "outbound-network-authority-v1",
    allowedDomains: input.allowedDomains ?? ["localhost", "127.0.0.1"],
    allowedActions: input.allowedActions ?? ["dry_run_intent", "local_mock_request"],
    dryRunOnly: input.dryRunOnly ?? true,
    localMockAllowed: input.localMockAllowed ?? true,
    secretsInPayloadAllowed: false,
    requestResponseRedactionRequired: true,
    auditTrailRequired: true,
    approvalRequired: true,
    timeoutMs: input.timeoutMs ?? 30_000,
    maxOutputBytes: input.maxOutputBytes ?? 64 * 1024,
    deployAllowed: false,
    modelPromotionAllowed: false,
  };
}

export function validateOutboundNetworkAuthorityProfile(profile: OutboundNetworkAuthorityProfile): {
  valid: boolean;
  blockingReasons: string[];
} {
  const reasons: string[] = [];
  if (profile.allowedDomains.length === 0) {
    reasons.push("allowed_domain_required");
  }
  if (profile.allowedActions.length === 0) {
    reasons.push("allowed_action_required");
  }
  if (profile.secretsInPayloadAllowed) {
    reasons.push("secrets_in_payload_not_allowed");
  }
  if (!profile.auditTrailRequired || !profile.requestResponseRedactionRequired) {
    reasons.push("audit_and_redaction_required");
  }
  if (profile.deployAllowed) {
    reasons.push("deploy_not_allowed");
  }
  if (profile.modelPromotionAllowed) {
    reasons.push("model_promotion_not_allowed");
  }
  return { valid: reasons.length === 0, blockingReasons: [...new Set(reasons)] };
}

function unsafePayload(value: unknown): boolean {
  return /\bsk-[a-z0-9_-]{12,}|secret-marker|password=/iu.test(JSON.stringify(value));
}

export async function recordOutboundNetworkAuthorityProof(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile: OutboundNetworkAuthorityProfile;
  targetDomain: string;
  action: string;
  payload?: JsonValue;
  localMock?: boolean;
}): Promise<OutboundNetworkAuthorityProof> {
  const validation = validateOutboundNetworkAuthorityProfile(input.profile);
  const reasons = [
    ...validation.blockingReasons,
    ...(input.profile.allowedDomains.includes(input.targetDomain)
      ? []
      : ["domain_not_allowlisted"]),
    ...(input.profile.allowedActions.includes(input.action) ? [] : ["action_not_allowlisted"]),
    ...(unsafePayload(input.payload) ? ["payload_contains_secret_like_content"] : []),
    ...(input.profile.dryRunOnly && !input.localMock && input.action !== "dry_run_intent"
      ? ["dry_run_or_local_mock_required"]
      : []),
  ];
  const proof: OutboundNetworkAuthorityProof = {
    artifactKind: "codex_bridge_outbound_network_authority_proof",
    profileId: input.profile.profileId,
    targetDomain: input.targetDomain,
    action: input.action,
    status:
      reasons.length === 0
        ? input.localMock
          ? "local_mock_recorded"
          : "dry_run_recorded"
        : "refused",
    blockingReasons: reasons,
    realExternalSendPerformed: false,
    secretsLeaked: false,
    deployPerformed: false,
    modelPromotionPerformed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.outbound_network_authority_proof",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/outbound-network/${input.profile.profileId}`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
