import { describe, expect, it } from "vitest";
import type { ManagedWorktreeRecord } from "../agents/worktrees/types.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { LoadedReleaseIdentity } from "../release-manifest-readback.js";
import type { TaskRecord } from "../tasks/runtime-internal.js";
import { resolveReleasePreparationAuthority } from "./release-preparation-authority.js";

const MANIFEST_DIGEST = "a".repeat(64);
const SOURCE_OBJECT = "b".repeat(40);
const SNAPSHOT_REF = "refs/openclaw/snapshots/loaded";
const SESSION_KEY = "agent:coding:subagent:release";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: "coding-task",
    runtime: "subagent",
    requesterSessionKey: "agent:main:main",
    ownerKey: "agent:main:main",
    scopeKind: "session",
    childSessionKey: SESSION_KEY,
    agentId: "coding",
    task: "Implement the accepted system change",
    status: "succeeded",
    deliveryStatus: "delivered",
    notifyPolicy: "done_only",
    createdAt: 1,
    endedAt: 2,
    ...overrides,
  };
}

function worktree(): ManagedWorktreeRecord {
  return {
    id: "worktree-1",
    name: "system-change",
    repoFingerprint: "fingerprint",
    repoRoot: "/source-anchor",
    path: "/state/worktrees/system-change",
    branch: "openclaw/system-change",
    baseRef: SNAPSHOT_REF,
    ownerKind: "session",
    ownerId: SESSION_KEY,
    createdAt: 1,
    lastActiveAt: 2,
  };
}

function session(): SessionEntry {
  return {
    sessionId: "session-1",
    updatedAt: 2,
    worktree: {
      id: "worktree-1",
      branch: "openclaw/system-change",
      repoRoot: "/source-anchor",
      kind: "system-change",
      baseRef: SNAPSHOT_REF,
      releaseManifestDigest: MANIFEST_DIGEST,
    },
  };
}

function loadedRelease(): LoadedReleaseIdentity {
  return {
    releaseManifestDigest: MANIFEST_DIGEST,
    sourceSnapshotRef: SNAPSHOT_REF,
    sourceTreeObject: SOURCE_OBJECT,
    packageVersion: "2026.7.20-b3.1",
    packageShape: "prototype-b-native-release-set-v1",
    predecessorReleaseManifestDigest: "c".repeat(64),
    predecessorSourceTreeObject: "d".repeat(40),
    requiredPluginIds: [],
    codexCapabilityDigest: "e".repeat(64),
  };
}

function deps(tasks: TaskRecord[] = [task()]) {
  const record = worktree();
  return {
    getTask: (taskId: string) => tasks.find((candidate) => candidate.taskId === taskId),
    listTasks: () => tasks,
    getSessionEntry: () => session(),
    getWorktree: () => record,
    resolvePackageRoot: () => "/package",
    readLoadedRelease: () => loadedRelease(),
    resolveSystemSource: () => ({
      sourceAnchorPath: "/source-anchor",
      sourceSnapshotRef: SNAPSHOT_REF,
      sourceTreeObject: SOURCE_OBJECT,
      releaseManifestDigest: MANIFEST_DIGEST,
    }),
    realpath: async (candidate: string) => candidate,
  };
}

describe("release preparation authority", () => {
  it("derives the exact system-change worktree from a settled Coding task", async () => {
    const resolved = await resolveReleasePreparationAuthority(
      { codingTaskId: "coding-task", env: {} },
      deps(),
    );
    expect(resolved.childSessionKey).toBe(SESSION_KEY);
    expect(resolved.worktree.id).toBe("worktree-1");
    expect(resolved.loadedRelease.releaseManifestDigest).toBe(MANIFEST_DIGEST);
  });

  it("rejects active descendants", async () => {
    const tasks = [
      task(),
      task({
        taskId: "review-child",
        parentTaskId: "coding-task",
        childSessionKey: "agent:reviewer:subagent:one",
        agentId: "reviewer",
        status: "running",
      }),
    ];
    await expect(
      resolveReleasePreparationAuthority({ codingTaskId: "coding-task", env: {} }, deps(tasks)),
    ).rejects.toThrow("active descendant review-child");
  });

  it("rejects a non-system-change Coding session", async () => {
    await expect(
      resolveReleasePreparationAuthority(
        { codingTaskId: "coding-task", env: {} },
        { ...deps(), getSessionEntry: () => ({ sessionId: "session-1", updatedAt: 2 }) },
      ),
    ).rejects.toThrow("no system-change worktree");
  });

  it("rejects source lineage that differs from the loaded generation", async () => {
    await expect(
      resolveReleasePreparationAuthority(
        { codingTaskId: "coding-task", env: {} },
        {
          ...deps(),
          readLoadedRelease: () => ({ ...loadedRelease(), sourceSnapshotRef: "refs/other" }),
        },
      ),
    ).rejects.toThrow("does not descend from the loaded generation");
  });
});
