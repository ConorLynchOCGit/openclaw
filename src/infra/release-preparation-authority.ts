import fs from "node:fs/promises";
import { resolveLoadedSystemChangeSessionSource } from "../agents/system-change-source.js";
import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import type { ManagedWorktreeRecord } from "../agents/worktrees/types.js";
import { resolveStorePath } from "../config/sessions/paths.js";
import { loadSessionStore, resolveSessionStoreEntry } from "../config/sessions/store.js";
import type { SessionEntry } from "../config/sessions/types.js";
import {
  readLoadedReleaseIdentity,
  type LoadedReleaseIdentity,
} from "../release-manifest-readback.js";
import { getTaskById, listTaskRecords, type TaskRecord } from "../tasks/runtime-internal.js";
import { isTerminalTaskStatus } from "../tasks/task-executor-policy.js";
import { resolveOpenClawPackageRootSync } from "./openclaw-root.js";

const CODING_AGENT_IDS = new Set(["coding", "execution-coding"]);

export type ReleasePreparationAuthority = {
  task: TaskRecord;
  childSessionKey: string;
  sessionEntry: SessionEntry;
  worktree: ManagedWorktreeRecord;
  packageRoot: string;
  loadedRelease: LoadedReleaseIdentity;
};

type ReleasePreparationAuthorityDeps = {
  getTask: (taskId: string) => TaskRecord | undefined;
  listTasks: () => TaskRecord[];
  getSessionEntry: (params: {
    agentId: string;
    childSessionKey: string;
    env: NodeJS.ProcessEnv;
  }) => SessionEntry | undefined;
  getWorktree: (env: NodeJS.ProcessEnv, id: string) => ManagedWorktreeRecord | undefined;
  resolvePackageRoot: () => string | null;
  readLoadedRelease: (packageRoot: string) => LoadedReleaseIdentity;
  resolveSystemSource: (params: {
    env: NodeJS.ProcessEnv;
    packageRoot: string;
  }) => ReturnType<typeof resolveLoadedSystemChangeSessionSource>;
  realpath: (candidate: string) => Promise<string>;
};

function defaultGetSessionEntry(params: {
  agentId: string;
  childSessionKey: string;
  env: NodeJS.ProcessEnv;
}): SessionEntry | undefined {
  const storePath = resolveStorePath(undefined, { agentId: params.agentId, env: params.env });
  const store = loadSessionStore(storePath, {
    skipCache: true,
    hydrateSkillPromptRefs: false,
  });
  return resolveSessionStoreEntry({ store, sessionKey: params.childSessionKey }).existing;
}

function defaultDeps(): ReleasePreparationAuthorityDeps {
  return {
    getTask: getTaskById,
    listTasks: listTaskRecords,
    getSessionEntry: defaultGetSessionEntry,
    getWorktree: getRegistryWorktree,
    resolvePackageRoot: () =>
      resolveOpenClawPackageRootSync({
        moduleUrl: import.meta.url,
        argv1: process.argv[1],
        cwd: process.cwd(),
      }),
    readLoadedRelease: readLoadedReleaseIdentity,
    resolveSystemSource: ({ env, packageRoot }) =>
      resolveLoadedSystemChangeSessionSource({ env, packageRoot }),
    realpath: fs.realpath,
  };
}

function isActive(status: TaskRecord["status"]): boolean {
  return !isTerminalTaskStatus(status);
}

function taskDescendsFrom(params: {
  task: TaskRecord;
  parentTaskId: string;
  byId: ReadonlyMap<string, TaskRecord>;
}): boolean {
  const visited = new Set<string>();
  let current = params.task.parentTaskId;
  while (current) {
    if (current === params.parentTaskId) {
      return true;
    }
    if (visited.has(current)) {
      throw new Error("task lineage contains a cycle");
    }
    visited.add(current);
    current = params.byId.get(current)?.parentTaskId;
  }
  return false;
}

function assertTaskSettlement(task: TaskRecord, tasks: readonly TaskRecord[]): void {
  if (task.status !== "succeeded" || task.terminalOutcome === "blocked") {
    throw new Error("release preparation requires a successfully settled Coding task");
  }
  const byId = new Map(tasks.map((entry) => [entry.taskId, entry]));
  const activeDescendant = tasks.find(
    (candidate) =>
      candidate.taskId !== task.taskId &&
      isActive(candidate.status) &&
      taskDescendsFrom({ task: candidate, parentTaskId: task.taskId, byId }),
  );
  if (activeDescendant) {
    throw new Error(`release preparation task has active descendant ${activeDescendant.taskId}`);
  }
  if (
    tasks.some(
      (candidate) =>
        candidate.taskId !== task.taskId &&
        isActive(candidate.status) &&
        candidate.childSessionKey === task.childSessionKey,
    )
  ) {
    throw new Error("release preparation Coding session still owns an active task");
  }
}

export async function resolveReleasePreparationAuthority(
  params: {
    codingTaskId: string;
    env?: NodeJS.ProcessEnv;
  },
  overrides: Partial<ReleasePreparationAuthorityDeps> = {},
): Promise<ReleasePreparationAuthority> {
  const env = params.env ?? process.env;
  const deps = { ...defaultDeps(), ...overrides };
  const taskId = params.codingTaskId.trim();
  if (!taskId) {
    throw new Error("release preparation requires a Coding task ID");
  }
  const task = deps.getTask(taskId);
  if (!task) {
    throw new Error(`release preparation Coding task does not exist: ${taskId}`);
  }
  const agentId = task.agentId?.trim().toLowerCase();
  if (!agentId || !CODING_AGENT_IDS.has(agentId)) {
    throw new Error("release preparation task is not owned by Coding");
  }
  const childSessionKey = task.childSessionKey?.trim();
  if (!childSessionKey) {
    throw new Error("release preparation Coding task has no child session");
  }
  assertTaskSettlement(task, deps.listTasks());

  const sessionEntry = deps.getSessionEntry({ agentId, childSessionKey, env });
  const binding = sessionEntry?.worktree;
  if (!sessionEntry || binding?.kind !== "system-change") {
    throw new Error("release preparation Coding session has no system-change worktree");
  }
  const worktree = deps.getWorktree(env, binding.id);
  if (!worktree || (worktree.removedAt !== undefined && !worktree.snapshotRef)) {
    throw new Error("release preparation system-change worktree is unavailable");
  }
  if (
    worktree.ownerKind !== "session" ||
    worktree.ownerId !== childSessionKey ||
    worktree.branch !== binding.branch ||
    worktree.repoRoot !== binding.repoRoot ||
    worktree.baseRef !== binding.baseRef
  ) {
    throw new Error("release preparation session and worktree registry authority disagree");
  }

  const packageRoot = deps.resolvePackageRoot();
  if (!packageRoot) {
    throw new Error("release preparation cannot resolve the loaded OpenClaw package");
  }
  const loadedRelease = deps.readLoadedRelease(packageRoot);
  const systemSource = deps.resolveSystemSource({ env, packageRoot });
  if (
    binding.releaseManifestDigest !== loadedRelease.releaseManifestDigest ||
    systemSource.releaseManifestDigest !== loadedRelease.releaseManifestDigest ||
    binding.baseRef !== loadedRelease.sourceSnapshotRef ||
    systemSource.sourceSnapshotRef !== loadedRelease.sourceSnapshotRef ||
    systemSource.sourceTreeObject !== loadedRelease.sourceTreeObject
  ) {
    throw new Error("release preparation Coding task does not descend from the loaded generation");
  }
  const [registryRoot, sourceRoot] = await Promise.all([
    deps.realpath(worktree.repoRoot),
    deps.realpath(systemSource.sourceAnchorPath),
  ]);
  if (registryRoot !== sourceRoot) {
    throw new Error("release preparation worktree is not anchored to the loaded source repository");
  }

  return {
    task,
    childSessionKey,
    sessionEntry,
    worktree,
    packageRoot,
    loadedRelease,
  };
}
