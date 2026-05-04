import fs from "node:fs";
import path from "node:path";
import { resolveGatewayPort } from "../../../../src/config/paths.ts";
import { callGateway } from "../../../../src/gateway/call.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { preflightAcpBridgeEndpoint, type AcpBridgeEndpointPreflight } from "./acp-transport.ts";

export type AcpRuntimeEndpointSource =
  | "env"
  | "approved_local_endpoint_artifact"
  | "default_local_openclaw_gateway"
  | "missing";

export type AcpRuntimeEndpointResolution = {
  artifactKind: "acp_runtime_endpoint_resolution";
  endpointUrl: string | null;
  endpointSource: AcpRuntimeEndpointSource;
  sourceRef: string | null;
  exactMissingValues: string[];
  staleOrUnprobedEndpointAccepted: false;
  rawSecretStored: false;
};

export type AcpRuntimeEndpointReadiness = {
  artifactKind: "acp_runtime_endpoint_readiness";
  checkedAt: string;
  resolution: AcpRuntimeEndpointResolution;
  preflight: AcpBridgeEndpointPreflight;
  endpointReady: boolean;
  readyForSupervisorTransport: boolean;
  fakeSuccessClaimed: false;
  providerDirectCallMade: false;
  codexCliInvoked: false;
  rawSecretStored: false;
  blockingReasons: string[];
};

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function endpointFromArtifact(filePath: string): string | null {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const line = text
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("OPENCLAW_ACP_ENDPOINT_URL="));
    return cleanString(line?.slice("OPENCLAW_ACP_ENDPOINT_URL=".length));
  } catch {
    return null;
  }
}

export function resolveAcpRuntimeEndpoint(
  input: {
    env?: NodeJS.ProcessEnv;
    artifactPath?: string | null;
    defaultToLocalGateway?: boolean;
    gatewayPort?: number;
  } = {},
): AcpRuntimeEndpointResolution {
  const env = input.env ?? process.env;
  const envEndpoint = cleanString(env.OPENCLAW_ACP_ENDPOINT_URL);
  if (envEndpoint) {
    return {
      artifactKind: "acp_runtime_endpoint_resolution",
      endpointUrl: envEndpoint,
      endpointSource: "env",
      sourceRef: "env:OPENCLAW_ACP_ENDPOINT_URL",
      exactMissingValues: [],
      staleOrUnprobedEndpointAccepted: false,
      rawSecretStored: false,
    };
  }
  const artifactPath = cleanString(input.artifactPath);
  const artifactEndpoint = artifactPath ? endpointFromArtifact(artifactPath) : null;
  if (artifactPath && artifactEndpoint) {
    return {
      artifactKind: "acp_runtime_endpoint_resolution",
      endpointUrl: artifactEndpoint,
      endpointSource: "approved_local_endpoint_artifact",
      sourceRef: `repo://${path.relative(process.cwd(), artifactPath)}`,
      exactMissingValues: [],
      staleOrUnprobedEndpointAccepted: false,
      rawSecretStored: false,
    };
  }
  if (input.defaultToLocalGateway) {
    const port = input.gatewayPort ?? resolveGatewayPort(undefined, env);
    return {
      artifactKind: "acp_runtime_endpoint_resolution",
      endpointUrl: `ws://127.0.0.1:${port}`,
      endpointSource: "default_local_openclaw_gateway",
      sourceRef: "config:gateway.port",
      exactMissingValues: [],
      staleOrUnprobedEndpointAccepted: false,
      rawSecretStored: false,
    };
  }
  return {
    artifactKind: "acp_runtime_endpoint_resolution",
    endpointUrl: null,
    endpointSource: "missing",
    sourceRef: null,
    exactMissingValues: ["OPENCLAW_ACP_ENDPOINT_URL"],
    staleOrUnprobedEndpointAccepted: false,
    rawSecretStored: false,
  };
}

function isDefaultLocalGateway(endpointUrl: string, env: NodeJS.ProcessEnv): boolean {
  const port = resolveGatewayPort(undefined, env);
  return endpointUrl === `ws://127.0.0.1:${port}` || endpointUrl === `ws://localhost:${port}`;
}

export async function probeAcpRuntimeEndpoint(input: {
  endpointUrl: string | null;
  env?: NodeJS.ProcessEnv;
  probe?: (endpointUrl: string) => Promise<boolean> | boolean;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!input.endpointUrl) {
    return false;
  }
  if (input.probe) {
    return await input.probe(input.endpointUrl);
  }
  const env = input.env ?? process.env;
  if (isDefaultLocalGateway(input.endpointUrl, env)) {
    try {
      const result = await callGateway({
        method: "health",
        timeoutMs: input.timeoutMs ?? 5_000,
      });
      return Boolean((result as { ok?: unknown }).ok);
    } catch {
      return false;
    }
  }
  return false;
}

export async function resolveAndPreflightAcpRuntimeEndpoint(input: {
  env?: NodeJS.ProcessEnv;
  artifactPath?: string | null;
  defaultToLocalGateway?: boolean;
  gatewayPort?: number;
  checkedAt?: string;
  probe?: (endpointUrl: string) => Promise<boolean> | boolean;
  timeoutMs?: number;
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
}): Promise<AcpRuntimeEndpointReadiness> {
  const resolution = resolveAcpRuntimeEndpoint(input);
  const preflight = await preflightAcpBridgeEndpoint({
    endpointUrl: resolution.endpointUrl,
    env: input.env,
    probe: async (endpointUrl) =>
      await probeAcpRuntimeEndpoint({
        endpointUrl,
        env: input.env,
        probe: input.probe,
        timeoutMs: input.timeoutMs,
      }),
  });
  const blockingReasons = [
    ...resolution.exactMissingValues.map((value) => `missing:${value}`),
    ...preflight.blockingReasons,
  ];
  const readiness: AcpRuntimeEndpointReadiness = {
    artifactKind: "acp_runtime_endpoint_readiness",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    resolution,
    preflight,
    endpointReady: preflight.endpointAvailable,
    readyForSupervisorTransport: preflight.mode === "real_endpoint_available",
    fakeSuccessClaimed: false,
    providerDirectCallMade: false,
    codexCliInvoked: false,
    rawSecretStored: false,
    blockingReasons,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "acp_bridge.runtime_endpoint_readiness",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/acp/runtime-endpoint-readiness`,
      contentType: "application/json",
      metadata: readiness as unknown as JsonValue,
    });
    await input.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "acp_bridge.runtime_endpoint_readiness_recorded",
      data: readiness as unknown as JsonValue,
    });
  }
  return readiness;
}
