export type OutboundDestinationKind =
  | "production_intake"
  | "tailscale_staged_readonly"
  | "tailscale_n8n_canary_receiver"
  | "telegram_operator_notification"
  | "github_status_or_issue";

export type OutboundDestinationState =
  | "configured"
  | "blocked_config_missing"
  | "read_only"
  | "disabled";

export type OutboundDestinationConfig = {
  destinationId: OutboundDestinationKind;
  allowlist?: string[] | string | null;
  methodAllowlist?: string[] | string | null;
  payloadPolicy?: string | null;
  rateLimit?: string | null;
  killSwitch?: string | null;
  incidentOwner?: string | null;
  compensatingAction?: string | null;
  readOnly?: boolean;
};

export type OutboundDestinationProfile = {
  artifactKind: "outbound_destination_profile";
  destinationId: OutboundDestinationKind;
  state: OutboundDestinationState;
  allowlist: string[];
  methodAllowlist: string[];
  payloadPolicy: string | null;
  rateLimit: string | null;
  killSwitch: string | null;
  incidentOwner: string | null;
  auditRefs: string[];
  workQueueProjectionRefs: string[];
  compensatingAction: string | null;
  canaryAllowed: boolean;
  canaryStatus: "not_run" | "passed" | "blocked";
  missingConfig: string[];
  rawPayloadStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type OutboundDestinationRegistryProof = {
  artifactKind: "outbound_destination_registry_proof";
  profiles: OutboundDestinationProfile[];
  productionIntakeDefaultEnabled: boolean;
  allConfiguredDestinationsScoped: boolean;
  rawPayloadStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

function list(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function envName(destinationId: OutboundDestinationKind, suffix: string): string {
  return `OPENCLAW_OUTBOUND_DESTINATION_${destinationId.toUpperCase()}_${suffix}`;
}

export function buildOutboundDestinationProfile(
  config: OutboundDestinationConfig,
): OutboundDestinationProfile {
  const allowlist = list(config.allowlist);
  const methodAllowlist = config.readOnly
    ? list(config.methodAllowlist ?? "GET,HEAD")
    : list(config.methodAllowlist);
  const required: Array<[string, unknown]> = [
    [envName(config.destinationId, "ALLOWLIST"), allowlist.length > 0 ? "configured" : null],
    [
      envName(config.destinationId, "METHOD_ALLOWLIST"),
      methodAllowlist.length > 0 ? "configured" : null,
    ],
    [envName(config.destinationId, "PAYLOAD_POLICY"), config.payloadPolicy],
    [envName(config.destinationId, "RATE_LIMIT"), config.rateLimit],
    [envName(config.destinationId, "KILL_SWITCH"), config.killSwitch],
    [envName(config.destinationId, "INCIDENT_OWNER"), config.incidentOwner],
  ];
  const missingConfig = required.filter(([, value]) => !value).map(([key]) => key);
  const configured = missingConfig.length === 0;
  const state: OutboundDestinationState = config.readOnly
    ? allowlist.length > 0 && methodAllowlist.every((method) => ["GET", "HEAD"].includes(method))
      ? "read_only"
      : "blocked_config_missing"
    : configured
      ? "configured"
      : "blocked_config_missing";
  return {
    artifactKind: "outbound_destination_profile",
    destinationId: config.destinationId,
    state,
    allowlist,
    methodAllowlist,
    payloadPolicy: config.payloadPolicy ?? null,
    rateLimit: config.rateLimit ?? null,
    killSwitch: config.killSwitch ?? null,
    incidentOwner: config.incidentOwner ?? null,
    auditRefs:
      state === "blocked_config_missing" ? [] : [`audit://outbound/${config.destinationId}`],
    workQueueProjectionRefs:
      state === "blocked_config_missing"
        ? []
        : [`work-queue://authority/outbound/${config.destinationId}`],
    compensatingAction: config.compensatingAction ?? null,
    canaryAllowed: state === "configured" || state === "read_only",
    canaryStatus: "not_run",
    missingConfig,
    rawPayloadStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function buildOutboundDestinationRegistryProof(
  profiles: OutboundDestinationProfile[],
): OutboundDestinationRegistryProof {
  return {
    artifactKind: "outbound_destination_registry_proof",
    profiles,
    productionIntakeDefaultEnabled: profiles.some(
      (profile) => profile.destinationId === "production_intake" && profile.state === "configured",
    ),
    allConfiguredDestinationsScoped: profiles
      .filter((profile) => profile.state !== "blocked_config_missing")
      .every(
        (profile) =>
          profile.allowlist.length > 0 &&
          profile.methodAllowlist.length > 0 &&
          profile.auditRefs.length > 0 &&
          profile.workQueueProjectionRefs.length > 0,
      ),
    rawPayloadStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}
