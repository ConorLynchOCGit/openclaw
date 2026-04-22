export type MemoryOpsAutoFixConfig = {
  enabled: false;
  excludeSupersededFromInjection: false;
  excludeConflictedUnlessMarked: false;
  regenerateReports: false;
  retryFailedBatchFlush: false;
};

export type MemoryOpsClosedLoopConfig = {
  enabled: boolean;
  baseDir: string;
  store: "jsonl";
  reportCronEnabled: boolean;
  reportCronSchedule: string;
  maxSignalsPerReport: number;
  promptAssemblyCaptureEnabled: boolean;
  promptAssemblyStoreRawPrompt: false;
  contextIngestStoreContent: false;
  sourceSpanVerificationEnabled: boolean;
  fileHashTrackingEnabled: boolean;
  compactionSafetyEnabled: boolean;
  commandBoundaryFlushEnabled: boolean;
  retrievalQualityEnabled: boolean;
  duplicateHashTrackingEnabled: boolean;
  conflictTrackingEnabled: boolean;
  hookHealthEnabled: boolean;
  signalRetentionDays: number;
  aggregateRetentionDays: number;
  autoFix: MemoryOpsAutoFixConfig;
  safeLevel1AutoFix: {
    enabled: true;
    retryFailedCaptureJobs: true;
    markRuntimeDirtyAfterCaptureWrite: true;
    rebuildStaleProjectionArtifacts: true;
    quarantineInvalidProjectionArtifacts: true;
    rotateRuntimeStateJsonl: true;
    refreshProviderScorecards: true;
    disableFailingFailoverSafeModelRoutes: true;
    generateOperatorApprovalTickets: true;
  };
};

export const DEFAULT_MEMORY_OPS_BASE_DIR = ".openclaw-memory-ops";

export const DEFAULT_MEMORY_OPS_CONFIG: MemoryOpsClosedLoopConfig = {
  enabled: true,
  baseDir: DEFAULT_MEMORY_OPS_BASE_DIR,
  store: "jsonl",
  reportCronEnabled: true,
  reportCronSchedule: "0 9 * * *",
  maxSignalsPerReport: 1000,
  promptAssemblyCaptureEnabled: true,
  promptAssemblyStoreRawPrompt: false,
  contextIngestStoreContent: false,
  sourceSpanVerificationEnabled: true,
  fileHashTrackingEnabled: true,
  compactionSafetyEnabled: true,
  commandBoundaryFlushEnabled: true,
  retrievalQualityEnabled: true,
  duplicateHashTrackingEnabled: true,
  conflictTrackingEnabled: true,
  hookHealthEnabled: true,
  signalRetentionDays: 30,
  aggregateRetentionDays: 180,
  autoFix: {
    enabled: false,
    excludeSupersededFromInjection: false,
    excludeConflictedUnlessMarked: false,
    regenerateReports: false,
    retryFailedBatchFlush: false,
  },
  safeLevel1AutoFix: {
    enabled: true,
    retryFailedCaptureJobs: true,
    markRuntimeDirtyAfterCaptureWrite: true,
    rebuildStaleProjectionArtifacts: true,
    quarantineInvalidProjectionArtifacts: true,
    rotateRuntimeStateJsonl: true,
    refreshProviderScorecards: true,
    disableFailingFailoverSafeModelRoutes: true,
    generateOperatorApprovalTickets: true,
  },
};

export function resolveMemoryOpsConfig(
  overrides: Partial<MemoryOpsClosedLoopConfig> = {},
): MemoryOpsClosedLoopConfig {
  return {
    ...DEFAULT_MEMORY_OPS_CONFIG,
    ...overrides,
    store: "jsonl",
    promptAssemblyStoreRawPrompt: false,
    contextIngestStoreContent: false,
    autoFix: {
      ...DEFAULT_MEMORY_OPS_CONFIG.autoFix,
      ...overrides.autoFix,
      enabled: false,
      excludeSupersededFromInjection: false,
      excludeConflictedUnlessMarked: false,
      regenerateReports: false,
      retryFailedBatchFlush: false,
    },
    safeLevel1AutoFix: {
      ...DEFAULT_MEMORY_OPS_CONFIG.safeLevel1AutoFix,
      ...overrides.safeLevel1AutoFix,
      enabled: true,
      retryFailedCaptureJobs: true,
      markRuntimeDirtyAfterCaptureWrite: true,
      rebuildStaleProjectionArtifacts: true,
      quarantineInvalidProjectionArtifacts: true,
      rotateRuntimeStateJsonl: true,
      refreshProviderScorecards: true,
      disableFailingFailoverSafeModelRoutes: true,
      generateOperatorApprovalTickets: true,
    },
  };
}

export function listFutureMechanicalFixes(): Array<{
  id: keyof Omit<MemoryOpsAutoFixConfig, "enabled">;
  description: string;
  enabled: false;
}> {
  return [
    {
      id: "excludeSupersededFromInjection",
      description: "Exclude superseded memories from prompt injection after soak.",
      enabled: false,
    },
    {
      id: "excludeConflictedUnlessMarked",
      description: "Exclude conflicted memories unless explicitly marked after soak.",
      enabled: false,
    },
    {
      id: "regenerateReports",
      description: "Regenerate Memory Ops Health Report artifacts.",
      enabled: false,
    },
    {
      id: "retryFailedBatchFlush",
      description: "Retry failed bounded batch flush requests.",
      enabled: false,
    },
  ];
}
