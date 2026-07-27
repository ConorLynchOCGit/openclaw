export type ManagedWorktreeOwnerKind = "manual" | "workboard" | "session";

export type ManagedWorktreeSetupMode = "repository" | "isolated";

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
  /**
   * `isolated` creates from an exact local commit, disables hooks and ignored-file
   * provisioning, and runs setup from the new checkout with a scrubbed environment.
   */
  setupMode?: ManagedWorktreeSetupMode;
  /** Cancels isolated setup before the worktree is admitted to the registry. */
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

type ManagedWorktreeRepositoryStatus = "git" | "not_git" | "unavailable";

export type ManagedWorktreeBranchesResult = {
  branches: ManagedWorktreeBranch[];
  defaultBranch?: string;
  headBranch?: string;
  repositoryStatus?: ManagedWorktreeRepositoryStatus;
};

export type ManagedWorktreeGcResult = {
  removed: string[];
  orphansDeleted: number;
  snapshotsPruned: number;
};
