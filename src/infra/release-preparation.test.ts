import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedWorktreeRecord } from "../agents/worktrees/types.js";
import type { LoadedReleaseIdentity } from "../release-manifest-readback.js";
import type { TaskRecord } from "../tasks/runtime-internal.js";
import type { ReleasePreparationAuthority } from "./release-preparation-authority.js";
import type {
  PreparedReleaseWorktree,
  ReleaseWorktreeAdmissionEvidence,
} from "./release-preparation-worktree.js";
import { prepareAcceptedRelease, type AcceptedReleasePreparation } from "./release-preparation.js";

const LOADED_MANIFEST_DIGEST = "a".repeat(64);
const CANDIDATE_EVIDENCE_DIGEST = "b".repeat(64);
const ACCEPTED_RECEIPT_ID = "c".repeat(64);
const SOURCE_TREE = "d".repeat(40);

function worktree(overrides: Partial<ManagedWorktreeRecord> = {}): ManagedWorktreeRecord {
  return {
    id: "worktree-1",
    name: "system-change",
    repoFingerprint: "fingerprint",
    repoRoot: "/source-anchor",
    path: "/state/worktrees/system-change",
    branch: "openclaw/system-change",
    baseRef: "refs/openclaw/snapshots/loaded",
    ownerKind: "session",
    ownerId: "agent:coding:subagent:release",
    createdAt: 1,
    lastActiveAt: 2,
    ...overrides,
  };
}

function loadedRelease(): LoadedReleaseIdentity {
  return {
    releaseManifestDigest: LOADED_MANIFEST_DIGEST,
    sourceSnapshotRef: "refs/openclaw/snapshots/loaded",
    sourceTreeObject: "e".repeat(40),
    packageVersion: "2026.7.20-b3.1",
    packageShape: "prototype-b-native-release-set-v1",
    predecessorReleaseManifestDigest: "f".repeat(64),
    predecessorSourceTreeObject: "1".repeat(40),
    requiredPluginIds: [],
    codexCapabilityDigest: "2".repeat(64),
  };
}

function authority(record = worktree()): ReleasePreparationAuthority {
  return {
    task: {
      taskId: "coding-task",
      runtime: "subagent",
      requesterSessionKey: "agent:main:main",
      ownerKey: "agent:main:main",
      scopeKind: "session",
      childSessionKey: "agent:coding:subagent:release",
      agentId: "coding",
      task: "Implement the system change",
      status: "succeeded",
      deliveryStatus: "delivered",
      notifyPolicy: "done_only",
      createdAt: 1,
      endedAt: 2,
    } satisfies TaskRecord,
    childSessionKey: "agent:coding:subagent:release",
    sessionEntry: { sessionId: "session-1", updatedAt: 2 },
    worktree: record,
    packageRoot: "/package",
    loadedRelease: loadedRelease(),
  };
}

function admission(): ReleaseWorktreeAdmissionEvidence {
  return {
    changedPaths: [
      {
        path: "src/change.ts",
        kind: "file",
        mode: "100644",
        byteSize: 7,
        sha256: "3".repeat(64),
      },
    ],
    pathSetDigest: "4".repeat(64),
    secretScan: {
      scanner: "gitleaks",
      scannerVersion: "test",
      policyDigest: "5".repeat(64),
      verdict: "clean",
    },
  };
}

function prepared(): PreparedReleaseWorktree {
  return {
    worktreeId: "worktree-1",
    nativeSnapshotRef: "refs/openclaw/snapshots/worktree-1",
    sourceTreeObject: SOURCE_TREE,
    ...admission(),
  };
}

function accepted(): AcceptedReleasePreparation {
  return {
    acceptedReleaseReceiptId: ACCEPTED_RECEIPT_ID,
    candidateEvidenceRef: "evidence/candidate.json",
    candidateEvidenceDigest: CANDIDATE_EVIDENCE_DIGEST,
  };
}

describe("release preparation operation", () => {
  let releaseStoreRoot: string;

  beforeEach(async () => {
    releaseStoreRoot = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "openclaw-release-operation-"),
    );
  });

  afterEach(async () => {
    await fs.rm(releaseStoreRoot, { recursive: true, force: true });
  });

  it("persists admission before packaging and publishes one accepted result", async () => {
    const record = worktree();
    const prepareWorktree = vi.fn(async (params) => {
      await params.persistAdmission?.(admission());
      return prepared();
    });
    const prepareRelease = vi.fn(async () => accepted());
    const resolveReceipt = vi.fn(async () => ({ id: ACCEPTED_RECEIPT_ID }) as never);

    const result = await prepareAcceptedRelease(
      { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
      {
        resolveAuthority: async () => authority(record),
        getWorktree: () => record,
        prepareWorktree,
        prepareAcceptedRelease: prepareRelease,
        resolveAcceptedReceipt: resolveReceipt,
        now: () => new Date("2026-07-20T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      status: "accepted",
      acceptedReleaseReceiptId: ACCEPTED_RECEIPT_ID,
      nativeSnapshotRef: "refs/openclaw/snapshots/worktree-1",
      completedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(prepareWorktree).toHaveBeenCalledOnce();
    expect(prepareRelease).toHaveBeenCalledOnce();
    expect(resolveReceipt).toHaveBeenCalledOnce();
  });

  it("returns the immutable result without rebuilding on an identical retry", async () => {
    const record = worktree();
    const prepareWorktree = vi.fn(async (params) => {
      await params.persistAdmission?.(admission());
      return prepared();
    });
    const prepareRelease = vi.fn(async () => accepted());
    const resolveReceipt = vi.fn(async () => ({ id: ACCEPTED_RECEIPT_ID }) as never);
    const deps = {
      resolveAuthority: async () => authority(record),
      getWorktree: () => record,
      prepareWorktree,
      prepareAcceptedRelease: prepareRelease,
      resolveAcceptedReceipt: resolveReceipt,
      now: () => new Date("2026-07-20T00:00:00.000Z"),
    };

    const first = await prepareAcceptedRelease(
      { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
      deps,
    );
    const second = await prepareAcceptedRelease(
      { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
      deps,
    );

    expect(second).toEqual(first);
    expect(prepareWorktree).toHaveBeenCalledOnce();
    expect(prepareRelease).toHaveBeenCalledOnce();
    expect(resolveReceipt).toHaveBeenCalledTimes(2);
  });

  it("resumes packaging from a verified native snapshot after process interruption", async () => {
    const active = worktree();
    const removed = worktree({
      removedAt: 3,
      snapshotRef: "refs/openclaw/snapshots/worktree-1",
    });
    let current = active;
    const prepareWorktree = vi.fn(async (params) => {
      await params.persistAdmission?.(admission());
      current = removed;
      throw new Error("simulated process interruption");
    });
    const verifySnapshot = vi.fn(async () => prepared());

    await expect(
      prepareAcceptedRelease(
        { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
        {
          resolveAuthority: async () => authority(current),
          getWorktree: () => current,
          prepareWorktree,
        },
      ),
    ).rejects.toThrow("simulated process interruption");

    const result = await prepareAcceptedRelease(
      { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
      {
        resolveAuthority: async () => authority(current),
        getWorktree: () => current,
        prepareWorktree,
        verifySnapshot,
        prepareAcceptedRelease: async () => accepted(),
        resolveAcceptedReceipt: async () => ({ id: ACCEPTED_RECEIPT_ID }) as never,
        now: () => new Date("2026-07-20T00:00:00.000Z"),
      },
    );

    expect(result.status).toBe("accepted");
    expect(verifySnapshot).toHaveBeenCalledOnce();
    expect(prepareWorktree).toHaveBeenCalledOnce();
  });

  it("rejects a removed worktree when no pre-snapshot admission was persisted", async () => {
    const removed = worktree({
      removedAt: 3,
      snapshotRef: "refs/openclaw/snapshots/worktree-1",
    });
    await expect(
      prepareAcceptedRelease(
        { codingTaskId: "coding-task", releaseStoreRoot, env: {} },
        {
          resolveAuthority: async () => authority(removed),
          getWorktree: () => removed,
        },
      ),
    ).rejects.toThrow("without pre-snapshot admission evidence");
  });
});
