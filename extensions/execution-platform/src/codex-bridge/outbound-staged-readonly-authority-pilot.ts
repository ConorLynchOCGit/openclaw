import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { decideAuthorityEscalation } from "./authority-escalation-gates.ts";
import type { OperatorApprovalRecord } from "./operator-approval-records.ts";
import { enforceRuntimeApproval } from "./operator-approval-records.ts";
import { runOutboundStagedReadonlyPilot } from "./outbound-staged-readonly-pilot.ts";

export type OutboundStagedReadonlyAuthorityPilotProof = {
  artifactKind: "outbound_staged_readonly_authority_pilot_proof";
  runtimeJobId: string;
  approvalStatus: "allowed" | "requires_approval" | "blocked";
  targetStatus: "completed" | "staged_outbound_endpoint_unavailable" | "refused";
  getHeadOnly: true;
  allowlistEnforced: true;
  redactionApplied: boolean;
  auditArtifactRecorded: boolean;
  realExternalWriteOrSendPerformed: false;
  workQueueLifecycleMutated: false;
  blockingReasons: string[];
};

export async function runOutboundStagedReadonlyAuthorityPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  approvals?: OperatorApprovalRecord[];
  endpointUrl?: string | null;
  env?: NodeJS.ProcessEnv;
  fetcher?: Parameters<typeof runOutboundStagedReadonlyPilot>[0]["fetcher"];
}): Promise<OutboundStagedReadonlyAuthorityPilotProof> {
  const approval = enforceRuntimeApproval({
    authorityOrAction: "high_blast_radius_authority",
    requestedScope: "authority:outbound_network:staged_readonly",
    approvals: input.approvals,
    now: new Date("2026-05-03T23:00:00.000Z"),
  });
  const authority = decideAuthorityEscalation({
    requestedAuthority: "outbound_network",
    approvalRefs: approval.approvalId ? [`approval:${approval.approvalId}`] : [],
    targetConfigured: Boolean(
      input.endpointUrl ?? input.env?.OPENCLAW_STAGED_OUTBOUND_READONLY_URL,
    ),
    auditArtifactRefs: ["artifact:outbound-staged-readonly-audit"],
  });
  const result = await runOutboundStagedReadonlyPilot({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    endpointUrl: input.endpointUrl,
    env: input.env,
    fetcher: input.fetcher,
  });
  const proof: OutboundStagedReadonlyAuthorityPilotProof = {
    artifactKind: "outbound_staged_readonly_authority_pilot_proof",
    runtimeJobId: input.runtimeJobId,
    approvalStatus: approval.status,
    targetStatus: result.status,
    getHeadOnly: true,
    allowlistEnforced: true,
    redactionApplied: result.responseSummary !== null || result.status !== "completed",
    auditArtifactRecorded: result.auditRecorded,
    realExternalWriteOrSendPerformed: false,
    workQueueLifecycleMutated: false,
    blockingReasons: [...new Set([...authority.reasonCodes, ...result.blockingReasons])].toSorted(),
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.outbound_staged_readonly_authority_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/outbound/staged-readonly-authority-pilot`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
