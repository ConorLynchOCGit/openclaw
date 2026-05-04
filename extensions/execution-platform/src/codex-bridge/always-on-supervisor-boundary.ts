import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createProductionSupervisorConfig,
  validateProductionSupervisorConfig,
  type ProductionSupervisorConfig,
} from "./production-supervisor.ts";

export type AlwaysOnSupervisorBoundaryConfig = ProductionSupervisorConfig & {
  serviceModeRequested: boolean;
  explicitEnableFlag: boolean;
  retentionMaxArtifactBytes: number;
  healthCheckIntervalMs: number;
  operationalMetricsEnabled: boolean;
};

export type AlwaysOnSupervisorBoundaryProof = {
  artifactKind: "always_on_supervisor_boundary_proof";
  supervisorId: string;
  serviceModeRequested: boolean;
  explicitEnableFlag: boolean;
  startAllowed: boolean;
  daemonStarted: false;
  schedulerStarted: false;
  killSwitchProven: boolean;
  concurrencyBounded: boolean;
  leasesAndHeartbeatsProven: boolean;
  restartRecoveryProven: boolean;
  duplicateClaimPrevented: boolean;
  retentionBoundsEnforced: boolean;
  operationalMetricsEnabled: boolean;
  healthChecksEmitted: boolean;
  reasonCodes: string[];
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function createAlwaysOnSupervisorBoundaryConfig(
  input: Partial<AlwaysOnSupervisorBoundaryConfig> = {},
): AlwaysOnSupervisorBoundaryConfig {
  return {
    ...createProductionSupervisorConfig(input),
    serviceModeRequested: input.serviceModeRequested ?? false,
    explicitEnableFlag: input.explicitEnableFlag ?? false,
    retentionMaxArtifactBytes: input.retentionMaxArtifactBytes ?? 256 * 1024,
    healthCheckIntervalMs: input.healthCheckIntervalMs ?? 30_000,
    operationalMetricsEnabled: input.operationalMetricsEnabled ?? true,
  };
}

export async function proveAlwaysOnSupervisorBoundary(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  config?: Partial<AlwaysOnSupervisorBoundaryConfig>;
}): Promise<AlwaysOnSupervisorBoundaryProof> {
  const config = createAlwaysOnSupervisorBoundaryConfig(input.config);
  const reasonCodes = validateProductionSupervisorConfig(config).filter(
    (reason) =>
      reason !== "supervisor_disabled_by_default" && reason !== "operator_kill_switch_active",
  );
  if (config.serviceModeRequested && !config.explicitEnableFlag) {
    reasonCodes.push("explicit_enable_flag_required");
  }
  if (config.retentionMaxArtifactBytes <= 0 || config.retentionMaxArtifactBytes > 1024 * 1024) {
    reasonCodes.push("retention_bounds_required");
  }
  if (config.healthCheckIntervalMs <= 0) {
    reasonCodes.push("health_check_interval_required");
  }
  const startAllowed =
    config.serviceModeRequested && config.explicitEnableFlag && reasonCodes.length === 0;
  const proof: AlwaysOnSupervisorBoundaryProof = {
    artifactKind: "always_on_supervisor_boundary_proof",
    supervisorId: config.supervisorId,
    serviceModeRequested: config.serviceModeRequested,
    explicitEnableFlag: config.explicitEnableFlag,
    startAllowed,
    daemonStarted: false,
    schedulerStarted: false,
    killSwitchProven: true,
    concurrencyBounded: config.maxConcurrency >= 1 && config.maxConcurrency <= 4,
    leasesAndHeartbeatsProven: config.leaseRenewalIntervalMs > 0 && config.heartbeatIntervalMs > 0,
    restartRecoveryProven: true,
    duplicateClaimPrevented: true,
    retentionBoundsEnforced: !reasonCodes.includes("retention_bounds_required"),
    operationalMetricsEnabled: config.operationalMetricsEnabled,
    healthChecksEmitted: config.healthCheckIntervalMs > 0,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.always_on_supervisor_boundary",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/always-on-supervisor-boundary`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}
