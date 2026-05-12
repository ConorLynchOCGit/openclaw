import { randomUUID } from "node:crypto";

export type MainRepoWriteLease = {
  artifactKind: "main_repo_write_lease";
  leaseId: string;
  runtimeJobId: string;
  repoRoot: string;
  approvedScopeRefs: string[];
  acquiredAt: string;
  expiresAt: string;
  renewedAt: string | null;
  status: "acquired" | "renewed" | "released" | "expired";
  advisoryOnly: true;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export function acquireMainRepoWriteLease(input: {
  runtimeJobId: string;
  repoRoot: string;
  approvedScopeRefs: string[];
  now?: Date;
  ttlMs?: number;
  leaseId?: string;
}): MainRepoWriteLease {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 30 * 60_000;
  return {
    artifactKind: "main_repo_write_lease",
    leaseId: input.leaseId ?? `main-repo-write-lease-${randomUUID()}`,
    runtimeJobId: input.runtimeJobId,
    repoRoot: input.repoRoot,
    approvedScopeRefs: input.approvedScopeRefs,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    renewedAt: null,
    status: "acquired",
    advisoryOnly: true,
    reasonCodes: ["main_repo_write_lease_acquired_advisory"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function renewMainRepoWriteLease(input: {
  lease: MainRepoWriteLease;
  now?: Date;
  ttlMs?: number;
}): MainRepoWriteLease {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 30 * 60_000;
  return {
    ...input.lease,
    renewedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    status: "renewed",
    reasonCodes: [...input.lease.reasonCodes, "main_repo_write_lease_renewed_advisory"],
  };
}

export function releaseMainRepoWriteLease(input: {
  lease: MainRepoWriteLease;
  now?: Date;
}): MainRepoWriteLease {
  return {
    ...input.lease,
    renewedAt: input.lease.renewedAt ?? (input.now ?? new Date()).toISOString(),
    status: "released",
    reasonCodes: [...input.lease.reasonCodes, "main_repo_write_lease_released"],
  };
}
