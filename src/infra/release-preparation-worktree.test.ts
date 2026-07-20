import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRegistryWorktree } from "../agents/worktrees/registry.js";
import { ManagedWorktreeService } from "../agents/worktrees/service.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import {
  prepareSystemChangeWorktree,
  type ReleaseSecretScanner,
} from "./release-preparation-worktree.js";

const execFileAsync = promisify(execFile);
const RELEASE_DIGEST = "a".repeat(64);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return stdout.trim();
}

const cleanScanner: ReleaseSecretScanner = async ({ changedPaths }) => ({
  scanner: "gitleaks",
  scannerVersion: "test",
  policyDigest: `${changedPaths.length}`.padStart(64, "0"),
  verdict: "clean",
});

describe("release preparation worktree transaction", () => {
  let root: string;
  let repo: string;
  let env: NodeJS.ProcessEnv;
  let service: ManagedWorktreeService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "openclaw-release-prepare-"));
    repo = path.join(root, "repo");
    await fs.mkdir(repo, { recursive: true });
    await git(repo, "init", "-b", "main");
    await git(repo, "config", "user.name", "OpenClaw Test");
    await git(repo, "config", "user.email", "openclaw-test@example.invalid");
    await fs.writeFile(path.join(repo, "change.txt"), "base\n");
    await fs.writeFile(path.join(repo, "delete.txt"), "delete me\n");
    await git(repo, "add", "change.txt", "delete.txt");
    await git(repo, "commit", "-m", "base");
    repo = await fs.realpath(repo);
    env = { ...process.env, OPENCLAW_STATE_DIR: path.join(root, "state") };
    service = new ManagedWorktreeService({ env });
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function createWorktree() {
    return await service.create({
      repoRoot: repo,
      name: "release-candidate",
      ownerKind: "session",
      ownerId: "agent:coding:release",
    });
  }

  it("scans exact changed bytes, uses the native snapshot, and verifies its tree", async () => {
    const worktree = await createWorktree();
    await fs.writeFile(path.join(worktree.path, "change.txt"), "candidate\n");
    await fs.rm(path.join(worktree.path, "delete.txt"));
    await fs.writeFile(path.join(worktree.path, "new.txt"), "new\n", { mode: 0o755 });
    await fs.chmod(path.join(worktree.path, "new.txt"), 0o755);

    const prepared = await prepareSystemChangeWorktree({
      worktreeId: worktree.id,
      expectedOwnerId: "agent:coding:release",
      expectedBaseRef: worktree.baseRef,
      expectedReleaseManifestDigest: RELEASE_DIGEST,
      env,
      scanner: cleanScanner,
      service,
    });

    expect(prepared.changedPaths.map((entry) => [entry.path, entry.kind, entry.mode])).toEqual([
      ["change.txt", "file", "100644"],
      ["delete.txt", "deleted", null],
      ["new.txt", "file", "100755"],
    ]);
    expect(prepared.nativeSnapshotRef).toBe(`refs/openclaw/snapshots/${worktree.id}`);
    expect(prepared.sourceTreeObject).toMatch(/^[0-9a-f]{40}$/u);
    expect(prepared.pathSetDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(getRegistryWorktree(env, worktree.id)?.removedAt).toBeTypeOf("number");
    await expect(fs.stat(worktree.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, "show", `${prepared.nativeSnapshotRef}:change.txt`)).toBe("candidate");
    expect(await git(repo, "show", `${prepared.nativeSnapshotRef}:new.txt`)).toBe("new");
  });

  it("preserves the live worktree when secret scanning rejects the source delta", async () => {
    const worktree = await createWorktree();
    await fs.writeFile(path.join(worktree.path, "change.txt"), "credential fixture\n");
    await expect(
      prepareSystemChangeWorktree({
        worktreeId: worktree.id,
        expectedOwnerId: "agent:coding:release",
        expectedBaseRef: worktree.baseRef,
        expectedReleaseManifestDigest: RELEASE_DIGEST,
        env,
        scanner: async () => {
          throw new Error("secret finding");
        },
        service,
      }),
    ).rejects.toThrow("secret finding");
    expect(getRegistryWorktree(env, worktree.id)?.removedAt).toBeUndefined();
    await expect(fs.readFile(path.join(worktree.path, "change.txt"), "utf8")).resolves.toBe(
      "credential fixture\n",
    );
  });

  it("restores the native worktree when bytes change after admission", async () => {
    const worktree = await createWorktree();
    await fs.writeFile(path.join(worktree.path, "change.txt"), "admitted\n");
    await expect(
      prepareSystemChangeWorktree({
        worktreeId: worktree.id,
        expectedOwnerId: "agent:coding:release",
        expectedBaseRef: worktree.baseRef,
        expectedReleaseManifestDigest: RELEASE_DIGEST,
        env,
        scanner: async (params) => {
          await fs.writeFile(path.join(worktree.path, "change.txt"), "changed later\n");
          return await cleanScanner(params);
        },
        service,
      }),
    ).rejects.toThrow("native snapshot bytes do not match admitted source path");
    expect(getRegistryWorktree(env, worktree.id)?.removedAt).toBeUndefined();
    await expect(fs.readFile(path.join(worktree.path, "change.txt"), "utf8")).resolves.toBe(
      "changed later\n",
    );
  });

  it("rejects a worktree not owned by the settled Coding session before mutation", async () => {
    const worktree = await createWorktree();
    await fs.writeFile(path.join(worktree.path, "change.txt"), "candidate\n");
    await expect(
      prepareSystemChangeWorktree({
        worktreeId: worktree.id,
        expectedOwnerId: "agent:coding:other",
        expectedBaseRef: worktree.baseRef,
        expectedReleaseManifestDigest: RELEASE_DIGEST,
        env,
        scanner: cleanScanner,
        service,
      }),
    ).rejects.toThrow("authority does not match");
    expect(getRegistryWorktree(env, worktree.id)?.removedAt).toBeUndefined();
  });
});
