import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type AcpBridgeTransportMode =
  | "real_endpoint"
  | "live_ready_adapter"
  | "local_loopback_fake_pilot";

export type AcpBridgeEndpointPreflight = {
  artifactKind: "acp_bridge_endpoint_preflight";
  endpointConfigured: boolean;
  endpointUrl: string | null;
  endpointAvailable: boolean;
  mode: "real_endpoint_available" | "real_acp_endpoint_unavailable";
  blockingReasons: string[];
};

export type AcpBridgeTransportRequest = {
  artifactKind: "acp_bridge_transport_request";
  requestId: string;
  runtimeJobId: string;
  sessionId: string;
  mode: AcpBridgeTransportMode;
  objective: string;
  authorityProfileId: string;
  providerDirectCallMade: false;
  deployPerformed: false;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
};

export type AcpBridgeNormalizedEvent = {
  artifactKind: "acp_bridge_normalized_event";
  runtimeJobId: string;
  sessionId: string;
  sequence: number;
  eventKind: "started" | "assistant_update" | "tool_result" | "final_response" | "error";
  summary: string;
  data: JsonValue;
};

export type AcpBridgePilotResult = {
  artifactKind: "acp_bridge_pilot_result";
  requestId: string;
  runtimeJobId: string;
  sessionId: string;
  mode: AcpBridgeTransportMode;
  eventCount: number;
  closeoutRequired: true;
  controlsUseSharedControlBridge: true;
  workQueueReadModelCompatible: true;
  providerDirectCallMade: false;
  deployPerformed: false;
  outboundSendingPerformed: false;
  modelPromotionPerformed: false;
  limitation: string | null;
};

export function preflightAcpBridgeEndpoint(input: {
  endpointUrl?: string | null;
  env?: NodeJS.ProcessEnv;
  probe?: (endpointUrl: string) => Promise<boolean> | boolean;
}): Promise<AcpBridgeEndpointPreflight> | AcpBridgeEndpointPreflight {
  const endpointUrl = input.endpointUrl ?? input.env?.OPENCLAW_ACP_ENDPOINT_URL ?? null;
  if (!endpointUrl) {
    return {
      artifactKind: "acp_bridge_endpoint_preflight",
      endpointConfigured: false,
      endpointUrl: null,
      endpointAvailable: false,
      mode: "real_acp_endpoint_unavailable",
      blockingReasons: ["acp_endpoint_not_configured"],
    };
  }
  const probe = input.probe ?? (() => false);
  const available = probe(endpointUrl);
  if (available instanceof Promise) {
    return available.then((endpointAvailable) => ({
      artifactKind: "acp_bridge_endpoint_preflight",
      endpointConfigured: true,
      endpointUrl,
      endpointAvailable,
      mode: endpointAvailable ? "real_endpoint_available" : "real_acp_endpoint_unavailable",
      blockingReasons: endpointAvailable ? [] : ["acp_endpoint_probe_failed"],
    }));
  }
  return {
    artifactKind: "acp_bridge_endpoint_preflight",
    endpointConfigured: true,
    endpointUrl,
    endpointAvailable: available,
    mode: available ? "real_endpoint_available" : "real_acp_endpoint_unavailable",
    blockingReasons: available ? [] : ["acp_endpoint_probe_failed"],
  };
}

export function createAcpBridgeTransportRequest(
  input: Omit<
    AcpBridgeTransportRequest,
    | "artifactKind"
    | "providerDirectCallMade"
    | "deployPerformed"
    | "outboundSendingPerformed"
    | "modelPromotionPerformed"
  >,
): AcpBridgeTransportRequest {
  return {
    artifactKind: "acp_bridge_transport_request",
    ...input,
    providerDirectCallMade: false,
    deployPerformed: false,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
  };
}

export function normalizeAcpBridgeEvent(input: {
  runtimeJobId: string;
  sessionId: string;
  sequence: number;
  eventKind: AcpBridgeNormalizedEvent["eventKind"];
  summary: string;
  data?: JsonValue;
}): AcpBridgeNormalizedEvent {
  return {
    artifactKind: "acp_bridge_normalized_event",
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    eventKind: input.eventKind,
    summary: input.summary.slice(0, 500),
    data: input.data ?? {},
  };
}

export async function runAcpBridgeLoopbackPilot(input: {
  runtimeJobs: RuntimeJobRepository;
  request: AcpBridgeTransportRequest;
  events?: AcpBridgeNormalizedEvent[];
  preflight?: AcpBridgeEndpointPreflight;
}): Promise<AcpBridgePilotResult> {
  await input.runtimeJobs.attachArtifact({
    jobId: input.request.runtimeJobId,
    artifactType: "acp_bridge.transport_request",
    storageKind: "metadata",
    uri: `runtime-job://${input.request.runtimeJobId}/acp-bridge/request/${input.request.requestId}`,
    contentType: "application/json",
    metadata: input.request as unknown as JsonValue,
  });
  const events = input.events ?? [
    normalizeAcpBridgeEvent({
      runtimeJobId: input.request.runtimeJobId,
      sessionId: input.request.sessionId,
      sequence: 1,
      eventKind: "started",
      summary: "ACP loopback pilot started.",
    }),
    normalizeAcpBridgeEvent({
      runtimeJobId: input.request.runtimeJobId,
      sessionId: input.request.sessionId,
      sequence: 2,
      eventKind: "final_response",
      summary: "ACP loopback pilot completed without provider-direct call.",
    }),
  ];
  for (const event of events) {
    await input.runtimeJobs.recordEvent({
      jobId: input.request.runtimeJobId,
      eventType: "acp_bridge.normalized_stream_event",
      data: event as unknown as JsonValue,
    });
  }
  const result: AcpBridgePilotResult = {
    artifactKind: "acp_bridge_pilot_result",
    requestId: input.request.requestId,
    runtimeJobId: input.request.runtimeJobId,
    sessionId: input.request.sessionId,
    mode: input.request.mode,
    eventCount: events.length,
    closeoutRequired: true,
    controlsUseSharedControlBridge: true,
    workQueueReadModelCompatible: true,
    providerDirectCallMade: false,
    deployPerformed: false,
    outboundSendingPerformed: false,
    modelPromotionPerformed: false,
    limitation:
      input.preflight?.mode === "real_acp_endpoint_unavailable"
        ? `real ACP endpoint unavailable: ${input.preflight.blockingReasons.join(", ")}`
        : input.request.mode === "local_loopback_fake_pilot"
          ? "real ACP endpoint was not required; loopback proves shared runtime truth envelope"
          : null,
  };
  await input.runtimeJobs.attachArtifact({
    jobId: input.request.runtimeJobId,
    artifactType: "acp_bridge.pilot_result",
    storageKind: "metadata",
    uri: `runtime-job://${input.request.runtimeJobId}/acp-bridge/result/${input.request.requestId}`,
    contentType: "application/json",
    metadata: result as unknown as JsonValue,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.request.runtimeJobId,
    eventType: "acp_bridge.pilot_completed",
    data: result as unknown as JsonValue,
  });
  return result;
}

export async function runAcpBridgeRealEndpointPilot(input: {
  runtimeJobs: RuntimeJobRepository;
  request: AcpBridgeTransportRequest;
  preflight: AcpBridgeEndpointPreflight;
  endpointHealthSummary: JsonValue;
}): Promise<AcpBridgePilotResult> {
  if (input.preflight.mode !== "real_endpoint_available") {
    throw new Error(
      `real ACP endpoint pilot requires passing endpoint preflight: ${input.preflight.blockingReasons.join(", ")}`,
    );
  }
  if (input.request.mode !== "real_endpoint") {
    throw new Error(`real ACP endpoint pilot requires request mode real_endpoint`);
  }
  await input.runtimeJobs.attachArtifact({
    jobId: input.request.runtimeJobId,
    artifactType: "acp_bridge.real_endpoint_preflight",
    storageKind: "metadata",
    uri: `runtime-job://${input.request.runtimeJobId}/acp-bridge/real-endpoint/preflight/${input.request.requestId}`,
    contentType: "application/json",
    metadata: input.preflight as unknown as JsonValue,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.request.runtimeJobId,
    eventType: "acp_bridge.real_endpoint_health_observed",
    data: {
      runtimeJobId: input.request.runtimeJobId,
      sessionId: input.request.sessionId,
      endpointUrl: input.preflight.endpointUrl,
      summary: input.endpointHealthSummary,
      providerDirectCallMade: false,
    },
  });
  return await runAcpBridgeLoopbackPilot({
    runtimeJobs: input.runtimeJobs,
    preflight: input.preflight,
    request: input.request,
    events: [
      normalizeAcpBridgeEvent({
        runtimeJobId: input.request.runtimeJobId,
        sessionId: input.request.sessionId,
        sequence: 1,
        eventKind: "started",
        summary: "ACP real endpoint pilot started after passing endpoint preflight.",
        data: { endpointUrl: input.preflight.endpointUrl },
      }),
      normalizeAcpBridgeEvent({
        runtimeJobId: input.request.runtimeJobId,
        sessionId: input.request.sessionId,
        sequence: 2,
        eventKind: "final_response",
        summary: "ACP real endpoint pilot recorded gateway health through runtime truth.",
        data: { endpointHealthSummary: input.endpointHealthSummary },
      }),
    ],
  });
}
