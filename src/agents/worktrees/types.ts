import type { SessionCodexSystemAuthority } from "../../config/sessions/types.js";

export type ManagedWorktreeOwnerKind = "manual" | "workboard" | "session";

/** Trusted source input projected from the currently loaded release generation. */
export type SystemChangeSessionSource = {
  sourceAnchorPath: string;
  sourceTreeObject: string;
  codexAuthority: SessionCodexSystemAuthority;
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
  /**
   * Restricts creation to a clean primary checkout at one exact local object.
   * System-change worktrees never fetch or provision ignored source files.
   */
  systemChange?: boolean;
  // Running .openclaw/worktree-setup.sh executes repo-local code, so callers reachable from
  // less-privileged surfaces (write-scoped session worktrees) opt out; admin paths keep it on.
  runSetupScript?: boolean;
};

export type RemoveManagedWorktreeResult = {
  removed: boolean;
  snapshotRef?: string;
  snapshotError?: string;
};

export type ManagedWorktreeGcResult = {
  removed: string[];
  orphansDeleted: number;
  snapshotsPruned: number;
};
