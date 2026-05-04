import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveGatewayPort } from "../../../../src/config/paths.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { preflightAcpBridgeEndpoint, type AcpBridgeEndpointPreflight } from "./acp-transport.ts";

export type AcpCodexAuthDiscovery = {
  artifactKind: "acp_codex_auth_discovery";
  codexHome: string;
  authJsonPresent: boolean;
  configTomlPresent: boolean;
  credentialKinds: string[];
  authMode: string | null;
  secretValuesRead: false;
  secretValuesStored: false;
};

export type AcpEndpointSetupCandidate = {
  artifactKind: "acp_endpoint_setup_candidate";
  candidateId: string;
  candidateKind: "existing_endpoint_url" | "codex_auth_without_endpoint";
  codexAuth: AcpCodexAuthDiscovery;
  endpointUrlConfigured: boolean;
  endpointUrl: string | null;
  exactMissingValues: string[];
  readyForRealAcpEndpointRun: boolean;
  fakeSuccessClaimed: false;
  providerDirectCallMade: false;
  codexCliInvoked: false;
  rawSecretStored: false;
};

export type AcpEndpointSetupPreflightReport = {
  artifactKind: "acp_endpoint_setup_preflight_report";
  reportId: string;
  createdAt: string;
  setupCandidate: AcpEndpointSetupCandidate;
  endpointPreflight: AcpBridgeEndpointPreflight;
  status:
    | "ready_for_real_acp_endpoint_run"
    | "codex_auth_present_but_acp_endpoint_missing"
    | "acp_endpoint_unavailable"
    | "codex_auth_missing";
  exactMissingValues: string[];
  limitations: string[];
  nextOperatorAction: string;
  fakeSuccessClaimed: false;
};

export type LocalAcpEndpointProbeResult = {
  artifactKind: "local_acp_endpoint_probe_result";
  endpointUrl: string;
  checkedAt: string;
  reachable: boolean;
  healthOk: boolean;
  summary: string;
  errorCode: string | null;
};

export type LocalAcpEndpointSetupReport = {
  artifactKind: "local_acp_endpoint_setup_report";
  reportId: string;
  createdAt: string;
  intendedPath: "existing_env_endpoint" | "local_openclaw_gateway";
  configuredEndpointUrl: string | null;
  recommendedEnv: Record<string, string>;
  setupAction:
    | "used_configured_endpoint"
    | "used_running_local_gateway"
    | "started_approved_local_gateway"
    | "needs_operator_configuration";
  probeBeforeStart: LocalAcpEndpointProbeResult;
  probeAfterStart: LocalAcpEndpointProbeResult | null;
  exactMissingValues: string[];
  endpointReady: boolean;
  fakeSuccessClaimed: false;
  providerDirectCallMade: false;
  codexCliInvoked: false;
};

export type LocalAcpGatewayStarterResult = {
  started: boolean;
  endpointUrl: string;
  summary: string;
  processId?: number;
};

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function defaultCodexHome(env: NodeJS.ProcessEnv = process.env): string {
  return safeString(env.CODEX_HOME) ?? path.join(os.homedir(), ".codex");
}

export function resolveLocalOpenClawGatewayAcpEndpoint(
  input: {
    env?: NodeJS.ProcessEnv;
    gatewayPort?: number;
  } = {},
): string {
  const env = input.env ?? process.env;
  const override = safeString(env.OPENCLAW_GATEWAY_URL);
  if (override) {
    return override;
  }
  const port = input.gatewayPort ?? resolveGatewayPort(undefined, env);
  return `ws://127.0.0.1:${port}`;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function discoverCredentialKinds(authJson: Record<string, unknown> | null): string[] {
  if (!authJson) {
    return [];
  }
  const credentialKinds = new Set<string>();
  if (typeof authJson.OPENAI_API_KEY === "string" && authJson.OPENAI_API_KEY.trim()) {
    credentialKinds.add("openai_api_key");
  }
  if (authJson.tokens && typeof authJson.tokens === "object") {
    credentialKinds.add("oauth_tokens");
  }
  if (typeof authJson.auth_mode === "string" && authJson.auth_mode.trim()) {
    credentialKinds.add(`auth_mode:${authJson.auth_mode.trim()}`);
  }
  return [...credentialKinds].toSorted();
}

export function discoverAcpCodexAuth(
  input: {
    codexHome?: string | null;
    env?: NodeJS.ProcessEnv;
  } = {},
): AcpCodexAuthDiscovery {
  const codexHome = input.codexHome ?? defaultCodexHome(input.env);
  const authPath = path.join(codexHome, "auth.json");
  const configPath = path.join(codexHome, "config.toml");
  const authJsonPresent = fs.existsSync(authPath);
  const authJson = authJsonPresent ? readJsonObject(authPath) : null;
  return {
    artifactKind: "acp_codex_auth_discovery",
    codexHome,
    authJsonPresent,
    configTomlPresent: fs.existsSync(configPath),
    credentialKinds: discoverCredentialKinds(authJson),
    authMode: safeString(authJson?.auth_mode),
    secretValuesRead: false,
    secretValuesStored: false,
  };
}

export function createAcpEndpointSetupCandidate(
  input: {
    env?: NodeJS.ProcessEnv;
    endpointUrl?: string | null;
    codexHome?: string | null;
    codexAuth?: AcpCodexAuthDiscovery;
  } = {},
): AcpEndpointSetupCandidate {
  const env = input.env ?? process.env;
  const endpointUrl = safeString(input.endpointUrl) ?? safeString(env.OPENCLAW_ACP_ENDPOINT_URL);
  const codexAuth = input.codexAuth ?? discoverAcpCodexAuth({ codexHome: input.codexHome, env });
  const exactMissingValues: string[] = [];
  if (!endpointUrl) {
    exactMissingValues.push("OPENCLAW_ACP_ENDPOINT_URL");
  }
  if (!codexAuth.authJsonPresent || codexAuth.credentialKinds.length === 0) {
    exactMissingValues.push("CODEX_HOME/auth.json with OpenAI Codex credentials");
  }
  return {
    artifactKind: "acp_endpoint_setup_candidate",
    candidateId: endpointUrl ? "configured-acp-endpoint" : "codex-auth-detected-needs-acp-endpoint",
    candidateKind: endpointUrl ? "existing_endpoint_url" : "codex_auth_without_endpoint",
    codexAuth,
    endpointUrlConfigured: Boolean(endpointUrl),
    endpointUrl: endpointUrl ?? null,
    exactMissingValues,
    readyForRealAcpEndpointRun: exactMissingValues.length === 0,
    fakeSuccessClaimed: false,
    providerDirectCallMade: false,
    codexCliInvoked: false,
    rawSecretStored: false,
  };
}

function statusFrom(input: {
  setupCandidate: AcpEndpointSetupCandidate;
  endpointPreflight: AcpBridgeEndpointPreflight;
}): AcpEndpointSetupPreflightReport["status"] {
  if (!input.setupCandidate.codexAuth.authJsonPresent) {
    return "codex_auth_missing";
  }
  if (!input.setupCandidate.endpointUrlConfigured) {
    return "codex_auth_present_but_acp_endpoint_missing";
  }
  return input.endpointPreflight.endpointAvailable
    ? "ready_for_real_acp_endpoint_run"
    : "acp_endpoint_unavailable";
}

export async function runAcpEndpointSetupPreflight(
  input: {
    reportId?: string;
    createdAt?: string;
    env?: NodeJS.ProcessEnv;
    endpointUrl?: string | null;
    codexHome?: string | null;
    codexAuth?: AcpCodexAuthDiscovery;
    probe?: (endpointUrl: string) => Promise<boolean> | boolean;
    runtimeJobs?: RuntimeJobRepository;
    runtimeJobId?: string;
  } = {},
): Promise<AcpEndpointSetupPreflightReport> {
  const setupCandidate = createAcpEndpointSetupCandidate(input);
  const endpointPreflight = await preflightAcpBridgeEndpoint({
    endpointUrl: setupCandidate.endpointUrl,
    env: input.env,
    probe: input.probe,
  });
  const status = statusFrom({ setupCandidate, endpointPreflight });
  const exactMissingValues = [...setupCandidate.exactMissingValues];
  const limitations =
    status === "ready_for_real_acp_endpoint_run"
      ? []
      : [
          status === "codex_auth_present_but_acp_endpoint_missing"
            ? "OpenAI Codex auth is present, but no ACP endpoint URL is configured."
            : status === "codex_auth_missing"
              ? "OpenAI Codex auth was not discovered in CODEX_HOME/auth.json."
              : "ACP endpoint URL is configured, but the endpoint preflight did not pass.",
        ];
  const report: AcpEndpointSetupPreflightReport = {
    artifactKind: "acp_endpoint_setup_preflight_report",
    reportId: input.reportId ?? "acp-codex-endpoint-setup-preflight",
    createdAt: input.createdAt ?? new Date().toISOString(),
    setupCandidate,
    endpointPreflight,
    status,
    exactMissingValues,
    limitations,
    nextOperatorAction:
      status === "ready_for_real_acp_endpoint_run"
        ? "Run the real ACP endpoint pilot through the Execution Platform ACP transport."
        : exactMissingValues.length > 0
          ? `Configure ${exactMissingValues.join(", ")} and rerun ACP setup preflight.`
          : "Fix the ACP endpoint probe failure and rerun ACP setup preflight.",
    fakeSuccessClaimed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "acp_bridge.endpoint_setup_preflight",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/acp-bridge/setup-preflight/${report.reportId}`,
      contentType: "application/json",
      metadata: report as unknown as JsonValue,
    });
    await input.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "acp_bridge.endpoint_setup_preflight_completed",
      data: report as unknown as JsonValue,
    });
  }
  return report;
}

export async function probeLocalAcpEndpoint(input: {
  endpointUrl: string;
  checkedAt?: string;
  healthProbe?: (endpointUrl: string) =>
    | Promise<{ ok: boolean; summary?: string }>
    | {
        ok: boolean;
        summary?: string;
      };
}): Promise<LocalAcpEndpointProbeResult> {
  try {
    const health = input.healthProbe
      ? await input.healthProbe(input.endpointUrl)
      : await import("../../../../src/gateway/call.ts").then(async ({ callGateway }) => {
          const result = await callGateway({
            url: input.endpointUrl,
            method: "health",
            timeoutMs: 5_000,
          });
          return {
            ok: result.ok === true,
            summary: result.ok === true ? "gateway health ok" : "gateway health not ok",
          };
        });
    return {
      artifactKind: "local_acp_endpoint_probe_result",
      endpointUrl: input.endpointUrl,
      checkedAt: input.checkedAt ?? new Date().toISOString(),
      reachable: true,
      healthOk: health.ok,
      summary: health.summary ?? (health.ok ? "endpoint probe passed" : "endpoint probe failed"),
      errorCode: health.ok ? null : "endpoint_health_not_ok",
    };
  } catch (error) {
    return {
      artifactKind: "local_acp_endpoint_probe_result",
      endpointUrl: input.endpointUrl,
      checkedAt: input.checkedAt ?? new Date().toISOString(),
      reachable: false,
      healthOk: false,
      summary: error instanceof Error ? error.message.slice(0, 300) : "endpoint probe failed",
      errorCode: "endpoint_unreachable",
    };
  }
}

export async function setupApprovedLocalAcpEndpoint(
  input: {
    reportId?: string;
    createdAt?: string;
    env?: NodeJS.ProcessEnv;
    endpointUrl?: string | null;
    gatewayPort?: number;
    startApproved?: boolean;
    healthProbe?: Parameters<typeof probeLocalAcpEndpoint>[0]["healthProbe"];
    startLocalGateway?: (endpointUrl: string) => Promise<LocalAcpGatewayStarterResult>;
    runtimeJobs?: RuntimeJobRepository;
    runtimeJobId?: string;
  } = {},
): Promise<LocalAcpEndpointSetupReport> {
  const env = input.env ?? process.env;
  const configured = safeString(input.endpointUrl) ?? safeString(env.OPENCLAW_ACP_ENDPOINT_URL);
  const endpointUrl =
    configured ?? resolveLocalOpenClawGatewayAcpEndpoint({ env, gatewayPort: input.gatewayPort });
  const intendedPath = configured ? "existing_env_endpoint" : "local_openclaw_gateway";
  const probeBeforeStart = await probeLocalAcpEndpoint({
    endpointUrl,
    checkedAt: input.createdAt,
    healthProbe: input.healthProbe,
  });
  let probeAfterStart: LocalAcpEndpointProbeResult | null = null;
  let setupAction: LocalAcpEndpointSetupReport["setupAction"] = configured
    ? "used_configured_endpoint"
    : "used_running_local_gateway";
  if (!probeBeforeStart.healthOk) {
    if (input.startApproved && input.startLocalGateway) {
      const started = await input.startLocalGateway(endpointUrl);
      setupAction = started.started
        ? "started_approved_local_gateway"
        : "needs_operator_configuration";
      probeAfterStart = await probeLocalAcpEndpoint({
        endpointUrl: started.endpointUrl,
        checkedAt: input.createdAt,
        healthProbe: input.healthProbe,
      });
    } else {
      setupAction = "needs_operator_configuration";
    }
  }
  const finalProbe = probeAfterStart ?? probeBeforeStart;
  const endpointReady = finalProbe.healthOk;
  const exactMissingValues = endpointReady
    ? []
    : configured
      ? ["running ACP endpoint at OPENCLAW_ACP_ENDPOINT_URL"]
      : ["OPENCLAW_ACP_ENDPOINT_URL or running local OpenClaw gateway"];
  const report: LocalAcpEndpointSetupReport = {
    artifactKind: "local_acp_endpoint_setup_report",
    reportId: input.reportId ?? "local-acp-endpoint-setup",
    createdAt: input.createdAt ?? new Date().toISOString(),
    intendedPath,
    configuredEndpointUrl: endpointReady ? endpointUrl : null,
    recommendedEnv: endpointReady ? { OPENCLAW_ACP_ENDPOINT_URL: endpointUrl } : {},
    setupAction,
    probeBeforeStart,
    probeAfterStart,
    exactMissingValues,
    endpointReady,
    fakeSuccessClaimed: false,
    providerDirectCallMade: false,
    codexCliInvoked: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "acp_bridge.local_endpoint_setup",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/acp-bridge/local-endpoint-setup/${report.reportId}`,
      contentType: "application/json",
      metadata: report as unknown as JsonValue,
    });
    await input.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "acp_bridge.local_endpoint_setup_completed",
      data: report as unknown as JsonValue,
    });
  }
  return report;
}
