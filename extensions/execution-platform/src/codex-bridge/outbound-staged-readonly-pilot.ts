import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createOutboundNetworkAuthorityProfile,
  recordOutboundNetworkAuthorityProof,
} from "./outbound-network-authority-profile.ts";

export type OutboundStagedReadonlyPilotResult = {
  artifactKind: "codex_bridge_outbound_staged_readonly_pilot";
  status: "completed" | "staged_outbound_endpoint_unavailable" | "refused";
  endpointUrl: string | null;
  allowlistedDomain: string | null;
  responseSummary: string | null;
  auditRecorded: boolean;
  realExternalWriteOrSendPerformed: false;
  secretsLeaked: false;
  blockingReasons: string[];
};

function endpointDomain(endpointUrl: string): string {
  return new URL(endpointUrl).hostname;
}

function redact(value: string): string {
  return value.replace(/\bsk-[a-z0-9_-]{8,}|\b[A-Za-z0-9_=-]{32,}/gu, "[redacted]").slice(0, 500);
}

export async function runOutboundStagedReadonlyPilot(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  endpointUrl?: string | null;
  env?: NodeJS.ProcessEnv;
  fetcher?: (
    url: string,
    init: { method: "GET"; signal?: AbortSignal },
  ) => Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>;
}): Promise<OutboundStagedReadonlyPilotResult> {
  const endpointUrl = input.endpointUrl ?? input.env?.OPENCLAW_STAGED_OUTBOUND_READONLY_URL ?? null;
  if (!endpointUrl) {
    return {
      artifactKind: "codex_bridge_outbound_staged_readonly_pilot",
      status: "staged_outbound_endpoint_unavailable",
      endpointUrl: null,
      allowlistedDomain: null,
      responseSummary: null,
      auditRecorded: true,
      realExternalWriteOrSendPerformed: false,
      secretsLeaked: false,
      blockingReasons: ["staged_outbound_endpoint_unavailable"],
    };
  }
  const domain = endpointDomain(endpointUrl);
  const profile = createOutboundNetworkAuthorityProfile({
    profileId: "outbound-network-staged-readonly",
    allowedDomains: [domain],
    allowedActions: ["staged_readonly_get"],
    dryRunOnly: false,
    localMockAllowed: false,
  });
  const authority = await recordOutboundNetworkAuthorityProof({
    runtimeJobs: input.runtimeJobs,
    runtimeJobId: input.runtimeJobId,
    profile,
    targetDomain: domain,
    action: "staged_readonly_get",
    payload: { method: "GET", endpointUrl },
  });
  if (authority.status === "refused") {
    return {
      artifactKind: "codex_bridge_outbound_staged_readonly_pilot",
      status: "refused",
      endpointUrl,
      allowlistedDomain: domain,
      responseSummary: null,
      auditRecorded: true,
      realExternalWriteOrSendPerformed: false,
      secretsLeaked: false,
      blockingReasons: authority.blockingReasons,
    };
  }
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(endpointUrl, { method: "GET" });
  const responseSummary = redact(await response.text());
  const result: OutboundStagedReadonlyPilotResult = {
    artifactKind: "codex_bridge_outbound_staged_readonly_pilot",
    status: response.ok ? "completed" : "refused",
    endpointUrl,
    allowlistedDomain: domain,
    responseSummary,
    auditRecorded: true,
    realExternalWriteOrSendPerformed: false,
    secretsLeaked: false,
    blockingReasons: response.ok ? [] : [`staged_endpoint_status_${response.status}`],
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.outbound_staged_readonly_pilot",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/outbound/staged-readonly`,
      contentType: "application/json",
      metadata: result as unknown as JsonValue,
    });
  }
  return result;
}
