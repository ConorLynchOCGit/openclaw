import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { withTempHome } from "openclaw/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./agent-command.test-mocks.js";
import { ensureAgentWorkspace } from "../agents/workspace.js";
import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import { managedWorktrees } from "../agents/worktrees/service.js";
import { clearSessionStoreCacheForTest, saveSessionStore } from "../config/sessions/store.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import { testing as agentCommandTesting } from "./agent.js";
import { createThrowingTestRuntime } from "./test-runtime-config-helpers.js";

const configIoMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readConfigFileSnapshotForWrite: vi.fn(),
}));
const pluginRegistryMocks = vi.hoisted(() => ({
  ensurePluginRegistryLoaded: vi.fn(),
}));

vi.mock("../config/io.js", () => ({
  getRuntimeConfig: configIoMocks.loadConfig,
  loadConfig: configIoMocks.loadConfig,
  readConfigFileSnapshotForWrite: configIoMocks.readConfigFileSnapshotForWrite,
}));

vi.mock("../plugins/runtime/runtime-registry-loader.js", () => ({
  ensurePluginRegistryLoaded: pluginRegistryMocks.ensurePluginRegistryLoaded,
}));

const execFileAsync = promisify(execFile);
const runtime = createThrowingTestRuntime();
const sessionKey = "agent:main:worktree-race";

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

async function initializeRepository(root: string): Promise<string> {
  const repo = path.join(root, "repo");
  await fs.mkdir(repo, { recursive: true });
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.name", "OpenClaw Test");
  await git(repo, "config", "user.email", "openclaw-test@example.invalid");
  await fs.writeFile(path.join(repo, "README.md"), "base\n");
  await git(repo, "add", "README.md");
  await git(repo, "commit", "-m", "initial");
  return await fs.realpath(repo);
}

function mockConfig(home: string, storePath: string): OpenClawConfig {
  const cfg = {
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-6" },
        models: { "anthropic/claude-opus-4-6": {} },
        workspace: path.join(home, "openclaw"),
      },
    },
    session: { store: storePath, mainKey: "main" },
  } as OpenClawConfig;
  configIoMocks.loadConfig.mockReturnValue(cfg);
  return cfg;
}

async function seedSession(
  storePath: string,
  spawnedCwd: string,
  worktree?: { id: string; branch: string; repoRoot: string },
): Promise<void> {
  await saveSessionStore(storePath, {
    [sessionKey]: {
      sessionId: "session-worktree-race",
      updatedAt: Date.now(),
      spawnedCwd,
      ...(worktree ? { worktree } : {}),
    } as SessionEntry,
  });
  clearSessionStoreCacheForTest();
}

async function createSessionWorktree(
  home: string,
): Promise<{ id: string; path: string; branch: string; repoRoot: string }> {
  const repo = await initializeRepository(home);
  const created = await managedWorktrees.create({
    repoRoot: repo,
    name: "race-session",
    ownerKind: "session",
    ownerId: sessionKey,
  });
  return { id: created.id, path: created.path, branch: created.branch, repoRoot: created.repoRoot };
}

describe("agent command worktree admission", () => {
  beforeEach(() => {
    vi.mocked(ensureAgentWorkspace).mockClear();
    vi.mocked(ensureAgentWorkspace).mockResolvedValue({ dir: "" });
    clearSessionStoreCacheForTest();
  });

  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("holds the lease through workspace preparation so a racing removal is rejected", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      mockConfig(home, storePath);
      const created = await createSessionWorktree(home);
      const nested = path.join(created.path, "workspace");
      await fs.mkdir(nested);
      await seedSession(storePath, nested);

      let releasePause = () => {};
      const paused = new Promise<void>((resolve) => {
        releasePause = resolve;
      });
      let reachPause = () => {};
      const pauseReached = new Promise<void>((resolve) => {
        reachPause = resolve;
      });
      vi.mocked(ensureAgentWorkspace).mockImplementationOnce(async (params) => {
        reachPause();
        await paused;
        return { dir: params?.dir ?? "" };
      });

      const preparing = agentCommandTesting.prepareAgentCommandExecution(
        { message: "resume in worktree", sessionKey },
        runtime,
      );
      await pauseReached;

      await expect(managedWorktrees.remove({ id: created.id, reason: "idle-gc" })).rejects.toThrow(
        "worktree is busy",
      );
      await expect(fs.stat(nested)).resolves.toBeDefined();

      releasePause();
      const prepared = await preparing;
      await prepared.runLease?.release();

      await expect(
        managedWorktrees.remove({ id: created.id, reason: "idle-gc" }),
      ).resolves.toMatchObject({ removed: true });
    });
  });

  it("fails closed before workspace setup when the session worktree was removed", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      mockConfig(home, storePath);
      const created = await createSessionWorktree(home);
      const nested = path.join(created.path, "workspace");
      await fs.mkdir(nested);
      await seedSession(storePath, nested, {
        id: created.id,
        branch: created.branch,
        repoRoot: created.repoRoot,
      });
      await managedWorktrees.remove({ id: created.id, reason: "manual-delete", force: true });
      expect(getRegistryWorktree(process.env, created.id)?.removedAt).toBeDefined();

      await expect(
        agentCommandTesting.prepareAgentCommandExecution(
          { message: "resume in worktree", sessionKey },
          runtime,
        ),
      ).rejects.toThrow("managed worktree was removed");
      expect(ensureAgentWorkspace).not.toHaveBeenCalled();
    });
  });
});
