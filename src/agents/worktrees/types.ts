export type ManagedWorktreeOwnerKind = "manual" | "workboard" | "session";

/** Trusted source input projected from the currently loaded release generation. */
export type LoadedSystemSource = {
  sourceAnchorPath: string;
  sourceCommit: string;
};

export type LoadedSystemSourceMode = "inspect" | "modify";

export type ProvisionedFileState = {
  path: string;
  mode: number | null;
  chunks: number;
};

export type ManagedWorktreeRecord = {
  id: string;
  name: string;
  repoFingerprint: string;
  repoRoot: string;
  path: string;
  branch: string;
  baseRef: string;
  ownerKind: ManagedWorktreeOwnerKind;
  ownerId?: string;
  snapshotRef?: string;
  createdAt: number;
  lastActiveAt: number;
  removedAt?: number;
};

export type ManagedWorktreeLockState = "none" | "live" | "dead" | "foreign" | "unavailable";

export type ManagedWorktreeActivityState =
  | "idle"
  | "active_run"
  | "git_locked"
  | "snapshot_retained"
  | "unavailable";

export type ManagedWorktreeCleanupKind = "manual_only" | "idle_gc" | "snapshot_prune";

export type ManagedWorktreeTelemetry = {
  measuredAt: number;
  ageMs: number;
  idleMs: number;
  sizeBytes?: number;
  sizeStatus: "not_requested" | "measured" | "not_live" | "unavailable";
  lockState: ManagedWorktreeLockState;
  activityState: ManagedWorktreeActivityState;
  runLeaseActive: boolean;
  cleanupKind: ManagedWorktreeCleanupKind;
  cleanupEligibleAt?: number;
  cleanupEligibleNow: boolean;
};

export type ManagedWorktreeListRecord = ManagedWorktreeRecord & {
  telemetry?: ManagedWorktreeTelemetry;
};

export type CreateManagedWorktreeParams = {
  repoRoot: string;
  name?: string;
  baseRef?: string;
  ownerKind?: ManagedWorktreeOwnerKind;
  ownerId?: string;
  /** Restricts creation to the loaded-generation source store and exact local object. */
  systemChange?: boolean;
  /** Cancels repository setup before the worktree is admitted. */
  signal?: AbortSignal;
  // Repository checkout hooks and .openclaw/worktree-setup.sh execute repo-local code, so
  // callers reachable from less-privileged surfaces opt out; admin paths keep them on.
  runSetupScript?: boolean;
};

export type RemoveManagedWorktreeResult = {
  removed: boolean;
  snapshotRef?: string;
  snapshotError?: string;
};

export type ManagedWorktreeBranch = {
  name: string;
  kind: "local" | "remote";
};

export type ManagedWorktreeBranchesResult = {
  branches: ManagedWorktreeBranch[];
  defaultBranch?: string;
  headBranch?: string;
};

export type ManagedWorktreeGcResult = {
  removed: string[];
  orphansDeleted: number;
  snapshotsPruned: number;
};
