export type ManagedWorktreeOwnerKind = "manual" | "workboard" | "session";

/** Trusted source input projected from the currently loaded release generation. */
export type SystemChangeSessionSource = {
  sourceAnchorPath: string;
  sourceSnapshotRef: string;
  sourceTreeObject: string;
  releaseManifestDigest: string;
};

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

export type CreateManagedWorktreeParams = {
  repoRoot: string;
  name?: string;
  baseRef?: string;
  ownerKind?: ManagedWorktreeOwnerKind;
  ownerId?: string;
  /** Restricts creation to the clean loaded-generation source anchor and exact local object. */
  systemChange?: boolean;
  /** Expected tree bound by the loaded release manifest for a system-change base. */
  expectedTreeObject?: string;
  // Repository checkout hooks and .openclaw/worktree-setup.sh execute repo-local code, so
  // callers reachable from less-privileged surfaces opt out; admin paths keep them on.
  runSetupScript?: boolean;
};

export type RemoveManagedWorktreeResult = {
  removed: boolean;
  snapshotRef?: string;
  snapshotError?: string;
};

/** Exact Git paths whose bytes differ from HEAD and will enter a native snapshot. */
export type WorktreeSnapshotAdmission = {
  record: ManagedWorktreeRecord;
  changedPaths: readonly Buffer[];
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
