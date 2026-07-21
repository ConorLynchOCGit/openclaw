import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { getRegistryWorktree } from "./registry.js";
import { IDLE_GC_MS, ManagedWorktreeService, SNAPSHOT_RETENTION_MS } from "./service.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  });
  return stdout.trim();
}

async function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = execFile("git", ["-C", cwd, ...args], { encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(new Error(error.message, { cause: error }));
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin?.end(input);
  });
}

async function initializeRepository(root: string, name = "repo"): Promise<string> {
  const repo = path.join(root, name);
  await fs.mkdir(repo, { recursive: true });
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.name", "OpenClaw Test");
  await git(repo, "config", "user.email", "openclaw-test@example.invalid");
  await fs.writeFile(path.join(repo, "README.md"), "base\n");
  await git(repo, "add", "README.md");
  await git(repo, "commit", "-m", "initial");
  return await fs.realpath(repo);
}

async function readSystemChangeSource(repo: string) {
  const commit = await git(repo, "rev-parse", "HEAD");
  return { commit };
}

async function addRemote(root: string, repo: string): Promise<string> {
  const remote = path.join(root, "remote.git");
  await execFileAsync("git", ["clone", "--bare", repo, remote]);
  await git(repo, "remote", "add", "origin", remote);
  await git(repo, "push", "-u", "origin", "main");
  await git(repo, "remote", "set-head", "origin", "-a");
  return remote;
}

describe("ManagedWorktreeService", () => {
  let root: string;
  let repo: string;
  let env: NodeJS.ProcessEnv;
  let now: number;
  let service: ManagedWorktreeService;

  beforeEach(async () => {
    const tempRoot = await fs.realpath(os.tmpdir());
    root = await fs.mkdtemp(path.join(tempRoot, "openclaw-managed-worktrees-"));
    repo = await initializeRepository(root);
    env = { ...process.env, OPENCLAW_STATE_DIR: path.join(root, "openclaw-state") };
    now = 1_700_000_000_000;
    service = new ManagedWorktreeService({ env, now: () => now });
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("creates from origin HEAD and returns the existing live named worktree", async () => {
    await addRemote(root, repo);
    const created = await service.create({ repoRoot: repo, name: "remote-task" });
    const repeated = await service.create({ repoRoot: repo, name: "remote-task" });

    expect(created.baseRef).toBe("origin/main");
    expect(created.branch).toBe("openclaw/remote-task");
    expect(created.path).toContain(path.join("worktrees", created.repoFingerprint, "remote-task"));
    expect(await git(created.path, "branch", "--show-current")).toBe(created.branch);
    expect(repeated).toEqual(created);
  });

  it("does not remove a concurrent successful create during remote fallback", async () => {
    await addRemote(root, repo);

    const results = await Promise.allSettled([
      service.create({ repoRoot: repo, name: "concurrent" }),
      service.create({ repoRoot: repo, name: "concurrent" }),
    ]);
    const created = results.find(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.create>>> =>
        result.status === "fulfilled",
    )?.value;

    expect(created).toBeDefined();
    if (!created) {
      throw new Error("expected one concurrent create to succeed");
    }
    expect(await git(repo, "worktree", "list", "--porcelain")).toContain(created.path);
    expect(await git(created.path, "branch", "--show-current")).toBe("openclaw/concurrent");
  });

  it("falls back to local HEAD when fetch fails", async () => {
    await git(repo, "remote", "add", "origin", path.join(root, "missing.git"));
    const created = await service.create({ repoRoot: repo, name: "offline" });
    expect(created.baseRef).toBe("HEAD");
    expect(await fs.readFile(path.join(created.path, "README.md"), "utf8")).toBe("base\n");
  });

  it("creates a system-change worktree from the exact local object without fetching", async () => {
    const fetchMarker = path.join(root, "fetch-used");
    const uploadPack = path.join(root, "upload-pack.sh");
    await fs.writeFile(uploadPack, `#!/bin/sh\ntouch ${JSON.stringify(fetchMarker)}\nexit 1\n`, {
      mode: 0o755,
    });
    await git(repo, "remote", "add", "origin", repo);
    await git(repo, "config", "remote.origin.uploadpack", uploadPack);
    const source = await readSystemChangeSource(repo);

    const created = await service.create({
      repoRoot: repo,
      name: "system-change",
      baseRef: source.commit,
      ownerKind: "session",
      ownerId: "agent:coding:subagent:test",
      systemChange: true,
    });

    expect(created.baseRef).toBe(source.commit);
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(source.commit);
    await expect(fs.stat(fetchMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps concurrent system-change heavy-check locks inside their own worktrees", async () => {
    const source = await readSystemChangeSource(repo);
    const first = await service.create({
      repoRoot: repo,
      name: "system-lock-a",
      baseRef: source.commit,
      ownerKind: "session",
      ownerId: "agent:coding:subagent:lock-a",
      systemChange: true,
    });
    const second = await service.create({
      repoRoot: repo,
      name: "system-lock-b",
      baseRef: source.commit,
      ownerKind: "session",
      ownerId: "agent:coding:subagent:lock-b",
      systemChange: true,
    });
    const commonDirRaw = await git(repo, "rev-parse", "--git-common-dir");
    const commonDir = path.resolve(repo, commonDirRaw);
    const commonMode = (await fs.stat(commonDir)).mode & 0o777;
    const probeUid = process.getuid?.() === 0 ? 65_534 : undefined;
    const probeGid = process.getgid?.() === 0 ? 65_534 : undefined;
    if (probeUid !== undefined && probeGid !== undefined) {
      for (const parent of [
        root,
        path.join(root, "openclaw-state"),
        path.join(root, "openclaw-state", "worktrees"),
        path.dirname(first.path),
      ]) {
        await fs.chmod(parent, 0o755);
      }
      await fs.chown(first.path, probeUid, probeGid);
      await fs.chown(second.path, probeUid, probeGid);
    }
    await fs.chmod(commonDir, 0o555);

    const lockRuntimeUrl = pathToFileURL(
      path.resolve("scripts/lib/local-heavy-check-runtime.mjs"),
    ).href;
    const probe = `
      import fs from "node:fs";
      import path from "node:path";
      import { acquireLocalHeavyCheckLockSync } from ${JSON.stringify(lockRuntimeUrl)};
      const [first, second, commonDir] = process.argv.slice(1);
      const env = {
        ...process.env,
        OPENCLAW_LOCAL_CHECK: "1",
        OPENCLAW_HEAVY_CHECK_LOCK_SCOPE: "worktree",
      };
      const releases = [];
      try {
        releases.push(acquireLocalHeavyCheckLockSync({ cwd: first, env, toolName: "test" }));
        releases.push(acquireLocalHeavyCheckLockSync({ cwd: second, env, toolName: "test" }));
        const locks = [first, second].map((worktree) =>
          path.join(worktree, ".artifacts", "openclaw-local-checks", "heavy-check.lock")
        );
        if (locks[0] === locks[1] || locks.some((lock) => !fs.existsSync(lock))) {
          throw new Error("worktree-local lock separation failed");
        }
        if (fs.existsSync(path.join(commonDir, "openclaw-local-checks"))) {
          throw new Error("heavy-check lock touched the shared Git common directory");
        }
        try {
          fs.writeFileSync(path.join(commonDir, "forbidden-write"), "blocked");
          throw new Error("shared Git common directory was writable");
        } catch (error) {
          if (!error || !["EACCES", "EPERM", "EROFS"].includes(error.code)) {
            throw error;
          }
        }
        process.stdout.write(JSON.stringify({ locks }));
      } finally {
        for (const release of releases.reverse()) release();
      }
    `;

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--input-type=module", "-e", probe, first.path, second.path, commonDir],
        {
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            OPENCLAW_LOCAL_CHECK: "1",
            OPENCLAW_HEAVY_CHECK_LOCK_SCOPE: "worktree",
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "safe.directory",
            GIT_CONFIG_VALUE_0: "*",
          },
          ...(probeUid !== undefined && probeGid !== undefined
            ? { uid: probeUid, gid: probeGid }
            : {}),
        },
      );
      const { locks } = JSON.parse(stdout) as { locks: string[] };
      expect(locks).toEqual([
        path.join(first.path, ".artifacts", "openclaw-local-checks", "heavy-check.lock"),
        path.join(second.path, ".artifacts", "openclaw-local-checks", "heavy-check.lock"),
      ]);
      expect(await fs.readdir(commonDir)).not.toContain("openclaw-local-checks");
    } finally {
      await fs.chmod(commonDir, commonMode);
      await fs.rm(path.join(commonDir, "forbidden-write"), { force: true });
    }
  });

  it("requires an exact local source commit independent of source-store HEAD", async () => {
    const sourceObject = await git(repo, "rev-parse", "HEAD");
    await expect(
      service.create({ repoRoot: repo, name: "missing-object", systemChange: true }),
    ).rejects.toThrow("require the loaded source commit");
    await expect(
      service.create({
        repoRoot: repo,
        name: "symbolic-object",
        baseRef: "HEAD",
        systemChange: true,
      }),
    ).rejects.toThrow("base must be the exact loaded source commit");
    await expect(
      service.create({
        repoRoot: repo,
        name: "missing-commit",
        baseRef: "a".repeat(sourceObject.length),
        systemChange: true,
      }),
    ).rejects.toThrow("source is not a local commit");
    await fs.writeFile(path.join(repo, "README.md"), "new generation\n");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "later-only/**\n");
    await git(repo, "add", "README.md", ".worktreeinclude");
    await git(repo, "commit", "-m", "new generation");
    await fs.writeFile(path.join(repo, "README.md"), "dirty source-store checkout\n");
    const created = await service.create({
      repoRoot: repo,
      name: "loaded-object",
      baseRef: sourceObject,
      systemChange: true,
      runSetupScript: false,
    });
    expect(created.baseRef).toBe(sourceObject);
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(sourceObject);
  });

  it("rejects .worktreeinclude for system-change worktrees", async () => {
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "cache/**\n");
    await git(repo, "add", ".worktreeinclude");
    await git(repo, "commit", "-m", "add worktree include");
    const source = await readSystemChangeSource(repo);

    await expect(
      service.create({
        repoRoot: repo,
        name: "forbidden-include",
        baseRef: source.commit,
        systemChange: true,
      }),
    ).rejects.toThrow("do not allow .worktreeinclude");
  });

  it("keeps registry operations anchored to the primary checkout", async () => {
    const linked = path.join(root, "linked-source");
    await git(repo, "worktree", "add", "-b", "linked-source", linked, "HEAD");
    const linkedRoot = await fs.realpath(linked);
    const created = await service.create({ repoRoot: linkedRoot, name: "linked-task" });
    expect(created.repoRoot).toBe(repo);
    await git(repo, "worktree", "remove", "--force", linkedRoot);

    await service.acquire(created.id);
    await service.release(created.id);
    await service.remove({ id: created.id, reason: "linked-source-removed" });
    const restored = await service.restore({ id: created.id });

    expect(await fs.readFile(path.join(restored.path, "README.md"), "utf8")).toBe("base\n");
  });

  it("retries worktree add from local HEAD when the resolved remote base is stale", async () => {
    await addRemote(root, repo);
    const blob = await git(repo, "rev-parse", "HEAD:README.md");
    const tooLongForCheckout = "x".repeat(300);
    const tree = await gitWithInput(
      repo,
      ["mktree"],
      `100644 blob ${blob}\t${tooLongForCheckout}\n`,
    );
    const remoteCommit = await git(repo, "commit-tree", tree, "-p", "HEAD", "-m", "bad remote");
    await git(repo, "push", "--force", "origin", `${remoteCommit}:refs/heads/main`);
    const created = await service.create({ repoRoot: repo, name: "stale-remote" });
    expect(created.baseRef).toBe("HEAD");
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(await git(repo, "rev-parse", "HEAD"));
  });

  it("preserves a pre-existing branch when a managed name collides", async () => {
    await addRemote(root, repo);
    await git(repo, "branch", "openclaw/existing-name", "HEAD");
    const branchTip = await git(repo, "rev-parse", "openclaw/existing-name");

    await expect(service.create({ repoRoot: repo, name: "existing-name" })).rejects.toThrow(
      "branch already exists",
    );

    expect(await git(repo, "rev-parse", "openclaw/existing-name")).toBe(branchTip);
  });

  it("copies only included ignored regular files without following symlinks", async () => {
    await fs.writeFile(path.join(repo, ".gitignore"), "cache/\nlinked\nlinked-dir/\n");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "cache/*.txt\nlinked\nlinked-dir/**\n");
    await fs.mkdir(path.join(repo, "cache"));
    await fs.writeFile(path.join(repo, "cache", "keep.txt"), "keep\n", { mode: 0o744 });
    await fs.writeFile(path.join(repo, "cache", "skip.bin"), "skip\n");
    const outside = path.join(root, "outside.txt");
    await fs.writeFile(outside, "secret\n");
    await fs.symlink(outside, path.join(repo, "linked"));
    const outsideDir = path.join(root, "outside-dir");
    await fs.mkdir(outsideDir);
    await fs.writeFile(path.join(outsideDir, "escape.txt"), "secret\n");
    await fs.symlink(outsideDir, path.join(repo, "linked-dir"));

    const created = await service.create({ repoRoot: repo, name: "includes" });
    const copied = path.join(created.path, "cache", "keep.txt");
    expect(await fs.readFile(copied, "utf8")).toBe("keep\n");
    expect((await fs.stat(copied)).mode & 0o777).toBe(0o744);
    await expect(fs.stat(path.join(created.path, "cache", "skip.bin"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(path.join(created.path, "linked"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.stat(path.join(created.path, "linked-dir", "escape.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never overwrites a base-ref file with an ignored source candidate", async () => {
    await fs.writeFile(path.join(repo, "collision.txt"), "from base\n");
    await git(repo, "add", "collision.txt");
    await git(repo, "commit", "-m", "base collision");
    await git(repo, "checkout", "-b", "source");
    await git(repo, "rm", "collision.txt");
    await fs.writeFile(path.join(repo, ".gitignore"), "collision.txt\n");
    await git(repo, "add", ".gitignore");
    await git(repo, "commit", "-m", "ignore local collision");
    await fs.writeFile(path.join(repo, "collision.txt"), "from source\n");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "collision.txt\n");

    const created = await service.create({
      repoRoot: repo,
      name: "no-overwrite",
      baseRef: "main",
    });

    expect(await fs.readFile(path.join(created.path, "collision.txt"), "utf8")).toBe("from base\n");
  });

  it("runs an executable setup script with source and worktree paths", async () => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    const script = path.join(repo, ".openclaw", "worktree-setup.sh");
    await fs.writeFile(
      script,
      '#!/bin/sh\nprintf "%s\\n%s\\n" "$OPENCLAW_SOURCE_TREE_PATH" "$OPENCLAW_WORKTREE_PATH" > setup-paths.txt\n',
      { mode: 0o755 },
    );
    const created = await service.create({ repoRoot: repo, name: "setup" });
    expect(
      (await fs.readFile(path.join(created.path, "setup-paths.txt"), "utf8")).split("\n"),
    ).toEqual([repo, created.path, ""]);
  });

  it("runs setup with a scrubbed environment", async () => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    const script = path.join(repo, ".openclaw", "worktree-setup.sh");
    await fs.writeFile(
      script,
      [
        "#!/bin/sh",
        'printf "setup-only" > "$HOME/setup-marker"',
        'printf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$PATH" "$HOME" "$OPENCLAW_SOURCE_TREE_PATH" "$OPENCLAW_WORKTREE_PATH" "${OPENAI_API_KEY-unset}" "${OPENROUTER_API_KEY-unset}" "${OPENCLAW_GATEWAY_TOKEN-unset}" "${DATABASE_URL-unset}" > setup-env.txt',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add setup script");
    const source = await readSystemChangeSource(repo);
    const callerPath = "/credential-bearing/bin";
    const fixedHome = path.join(root, "setup-home");
    service = new ManagedWorktreeService({
      env: {
        ...env,
        PATH: callerPath,
        HOME: fixedHome,
        OPENAI_API_KEY: "must-not-leak",
        OPENROUTER_API_KEY: "must-not-leak",
        OPENCLAW_GATEWAY_TOKEN: "must-not-leak",
        DATABASE_URL: "must-not-leak",
      },
      now: () => now,
    });

    const created = await service.create({
      repoRoot: repo,
      name: "scrubbed-setup",
      baseRef: source.commit,
      ownerKind: "session",
      ownerId: "agent:coding:subagent:test",
      systemChange: true,
    });
    const [
      setupPath,
      setupHome,
      sourcePath,
      worktreePath,
      providerSecret,
      unrelatedProviderSecret,
      gatewaySecret,
      databaseSecret,
      tail,
    ] = (await fs.readFile(path.join(created.path, "setup-env.txt"), "utf8")).split("\n");
    expect(setupPath).toBe("/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    expect(setupPath).not.toBe(callerPath);
    expect(setupHome).not.toBe(fixedHome);
    expect(path.basename(setupHome)).toMatch(/^openclaw-worktree-setup-home-/u);
    expect([
      sourcePath,
      worktreePath,
      providerSecret,
      unrelatedProviderSecret,
      gatewaySecret,
      databaseSecret,
      tail,
    ]).toEqual([created.path, created.path, "unset", "unset", "unset", "unset", ""]);
    await expect(fs.stat(setupHome)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the worktree and branch when setup fails", async () => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    const script = path.join(repo, ".openclaw", "worktree-setup.sh");
    const homeReceipt = path.join(root, "failed-setup-home.txt");
    await fs.writeFile(
      script,
      [
        "#!/bin/sh",
        `printf "%s" "$HOME" > ${JSON.stringify(homeReceipt)}`,
        "echo setup-broke >&2",
        "exit 9",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await expect(service.create({ repoRoot: repo, name: "broken-setup" })).rejects.toThrow(
      "setup-broke",
    );
    const setupHome = await fs.readFile(homeReceipt, "utf8");
    expect(path.basename(setupHome)).toMatch(/^openclaw-worktree-setup-home-/u);
    await expect(fs.stat(setupHome)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain("broken-setup");
    expect(await git(repo, "branch", "--list", "openclaw/broken-setup")).toBe("");
  });

  it("restores tracked and untracked state while reprovisioning ignored files", async () => {
    await fs.writeFile(path.join(repo, ".gitignore"), "ignored.txt\nprovisioned.env\n");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "provisioned.env\n");
    await git(repo, "add", ".gitignore", ".worktreeinclude");
    await git(repo, "commit", "-m", "configure worktree provisioning");
    await fs.writeFile(path.join(repo, "provisioned.env"), "source secret\n");
    const created = await service.create({ repoRoot: repo, name: "roundtrip" });
    const originalHead = await git(created.path, "rev-parse", "HEAD");
    await fs.writeFile(path.join(created.path, "README.md"), "changed\n");
    await fs.writeFile(path.join(created.path, "untracked.txt"), "untracked\n");
    await fs.writeFile(path.join(created.path, "ignored.txt"), "ignored\n");

    const removed = await service.remove({ id: created.id, reason: "test" });
    expect(removed).toMatchObject({ removed: true, snapshotRef: expect.any(String) });
    await expect(fs.stat(created.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, "show-ref", "--verify", removed.snapshotRef!)).not.toBe("");
    const snapshotFiles = await git(repo, "ls-tree", "-r", "--name-only", removed.snapshotRef!);
    expect(snapshotFiles).not.toContain("ignored.txt");
    expect(snapshotFiles).not.toContain("provisioned.env");

    now += IDLE_GC_MS + 1;
    const restored = await service.restore({ id: created.id });
    expect(restored.removedAt).toBeUndefined();
    expect(restored.lastActiveAt).toBe(now);
    expect((await service.gc()).removed).toEqual([]);
    expect(await git(restored.path, "branch", "--show-current")).toBe(created.branch);
    expect(await git(restored.path, "rev-parse", "HEAD")).toBe(originalHead);
    expect(await git(restored.path, "log", "--format=%s", created.branch)).not.toContain(
      "OpenClaw worktree snapshot",
    );
    expect(await fs.readFile(path.join(restored.path, "README.md"), "utf8")).toBe("changed\n");
    expect(await fs.readFile(path.join(restored.path, "untracked.txt"), "utf8")).toBe(
      "untracked\n",
    );
    expect(await fs.readFile(path.join(restored.path, "provisioned.env"), "utf8")).toBe(
      "source secret\n",
    );
    await expect(fs.stat(path.join(restored.path, "ignored.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await git(restored.path, "status", "--porcelain")).split("\n")).toEqual([
      "M README.md",
      "?? untracked.txt",
    ]);
    expect(await git(restored.path, "diff", "--cached", "--name-only")).toBe("");
    expect(await git(restored.path, "diff", "--name-only")).toBe("README.md");
  });

  it("refuses to overwrite a branch recreated before restore", async () => {
    const created = await service.create({ repoRoot: repo, name: "restore-collision" });
    await service.remove({ id: created.id, reason: "test" });
    await git(repo, "branch", created.branch, "HEAD");
    const branchTip = await git(repo, "rev-parse", created.branch);

    await expect(service.restore({ id: created.id })).rejects.toThrow("already exists");

    expect(await git(repo, "rev-parse", created.branch)).toBe(branchTip);
    await expect(fs.stat(created.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed when a nested repository cannot be captured in full", async () => {
    const created = await service.create({ repoRoot: repo, name: "nested-repository" });
    const nested = await initializeRepository(created.path, "nested");
    await fs.writeFile(path.join(nested, "untracked-secret.txt"), "do not lose\n");

    await expect(service.remove({ id: created.id, reason: "test" })).rejects.toThrow(
      "nested git repositories cannot be snapshotted losslessly",
    );

    expect(await fs.readFile(path.join(nested, "untracked-secret.txt"), "utf8")).toBe(
      "do not lose\n",
    );
    expect(getRegistryWorktree(env, created.id)?.removedAt).toBeUndefined();
  });

  it("rematerializes a named workboard checkout from its retained snapshot", async () => {
    const created = await service.create({
      repoRoot: repo,
      name: "wb-card",
      ownerKind: "workboard",
      ownerId: "card",
    });
    await fs.writeFile(path.join(created.path, "worker.txt"), "worker state\n");
    await service.remove({ id: created.id, reason: "run-end" });

    const reusedFromSource = await service.create({
      repoRoot: repo,
      name: "wb-card",
      baseRef: created.branch,
      ownerKind: "workboard",
      ownerId: "card",
    });

    expect(reusedFromSource.id).toBe(created.id);
    expect(await fs.readFile(path.join(reusedFromSource.path, "worker.txt"), "utf8")).toBe(
      "worker state\n",
    );
  });

  it("removes lossless run-end worktrees but keeps dirty and unpushed work", async () => {
    await addRemote(root, repo);
    const clean = await service.create({ repoRoot: repo, name: "clean" });
    await service.acquire(clean.id);
    expect(await service.removeIfLossless(clean.id)).toBe(true);

    const dirty = await service.create({ repoRoot: repo, name: "dirty" });
    await service.acquire(dirty.id);
    await fs.writeFile(path.join(dirty.path, "dirty.txt"), "dirty\n");
    expect(await service.removeIfLossless(dirty.id)).toBe(false);
    expect(
      (await service.list()).find((entry) => entry.id === dirty.id)?.removedAt,
    ).toBeUndefined();

    const committed = await service.create({ repoRoot: repo, name: "committed" });
    await service.acquire(committed.id);
    await fs.writeFile(path.join(committed.path, "commit.txt"), "commit\n");
    await git(committed.path, "add", "commit.txt");
    await git(committed.path, "commit", "-m", "unpushed");
    expect(await service.removeIfLossless(committed.id)).toBe(false);
  });

  it("exempts manual worktrees and garbage collects idle run-owned worktrees", async () => {
    const manual = await service.create({ repoRoot: repo, name: "manual-idle" });
    const created = await service.create({
      repoRoot: repo,
      name: "idle-dead",
      ownerKind: "workboard",
    });
    await git(repo, "worktree", "lock", "--reason", "openclaw pid=999999", created.path);
    now += IDLE_GC_MS + 1;

    const result = await service.gc();
    expect(result.removed).toEqual([created.id]);
    expect(getRegistryWorktree(env, created.id)?.snapshotRef).toBeTruthy();
    expect(getRegistryWorktree(env, manual.id)?.removedAt).toBeUndefined();
    expect(await fs.stat(manual.path)).toBeTruthy();
  });

  it("uses owner activity to protect only active idle session worktrees", async () => {
    const active = await service.create({
      repoRoot: repo,
      name: "active-session",
      ownerKind: "session",
      ownerId: "agent:main:active",
    });
    const inactive = await service.create({
      repoRoot: repo,
      name: "inactive-session",
      ownerKind: "session",
      ownerId: "agent:main:inactive",
    });
    now += IDLE_GC_MS + 1;
    const shouldProtectOwner = vi.fn(
      (_ownerKind: string, ownerId: string) => ownerId === "agent:main:active",
    );

    const result = await service.gc({ shouldProtectOwner });

    expect(result.removed).toEqual([inactive.id]);
    expect(shouldProtectOwner).toHaveBeenCalledWith("session", "agent:main:active");
    expect(shouldProtectOwner).toHaveBeenCalledWith("session", "agent:main:inactive");
    expect(getRegistryWorktree(env, active.id)?.removedAt).toBeUndefined();
    expect(getRegistryWorktree(env, inactive.id)?.removedAt).toBeDefined();
  });

  it("protects foreign locks during idle garbage collection", async () => {
    const created = await service.create({
      repoRoot: repo,
      name: "foreign-lock",
      ownerKind: "session",
    });
    await git(repo, "worktree", "lock", "--reason", "other-tool", created.path);
    now += IDLE_GC_MS + 1;

    expect((await service.gc()).removed).toEqual([]);
    expect(await fs.stat(created.path)).toBeTruthy();
  });

  it("continues garbage collection after one worktree cannot be snapshotted", async () => {
    const removable = await service.create({
      repoRoot: repo,
      name: "removable",
      ownerKind: "workboard",
    });
    now += 1;
    const nestedRecord = await service.create({
      repoRoot: repo,
      name: "nested-idle",
      ownerKind: "workboard",
    });
    await initializeRepository(nestedRecord.path, "nested");
    now += IDLE_GC_MS + 1;

    const result = await service.gc();

    expect(result.removed).toEqual([removable.id]);
    expect(getRegistryWorktree(env, nestedRecord.id)?.removedAt).toBeUndefined();
    await expect(fs.stat(removable.path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("continues garbage collection when one repository control path is missing", async () => {
    const otherRepo = await initializeRepository(root, "other-repo");
    const removable = await service.create({
      repoRoot: otherRepo,
      name: "other-removable",
      ownerKind: "session",
    });
    now += 1;
    const broken = await service.create({
      repoRoot: repo,
      name: "missing-control",
      ownerKind: "session",
    });
    await fs.rename(repo, path.join(root, "moved-repo"));
    now += IDLE_GC_MS + 1;

    const result = await service.gc();

    expect(result.removed).toEqual([removable.id]);
    expect(getRegistryWorktree(env, broken.id)?.removedAt).toBeUndefined();
  });

  it("deletes unregistered orphan debris but preserves git-listed worktrees", async () => {
    const debris = path.join(env.OPENCLAW_STATE_DIR!, "worktrees", "orphan-fingerprint", "debris");
    await fs.mkdir(debris, { recursive: true });
    await fs.writeFile(path.join(debris, "file"), "debris");
    const foreign = path.join(env.OPENCLAW_STATE_DIR!, "worktrees", "foreign-fingerprint", "live");
    await fs.mkdir(path.dirname(foreign), { recursive: true });
    await git(repo, "worktree", "add", "--detach", foreign, "HEAD");

    const result = await service.gc();
    expect(result.orphansDeleted).toBe(1);
    await expect(fs.stat(debris)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.stat(foreign)).toBeTruthy();
    await git(repo, "worktree", "remove", "--force", foreign);
  });

  it("prunes expired snapshot refs and registry rows", async () => {
    const created = await service.create({ repoRoot: repo, name: "expired" });
    const removed = await service.remove({ id: created.id, reason: "retention" });
    now += SNAPSHOT_RETENTION_MS + 1;

    const result = await service.gc();
    expect(result.snapshotsPruned).toBe(1);
    expect(getRegistryWorktree(env, created.id)).toBeUndefined();
    await expect(git(repo, "show-ref", "--verify", removed.snapshotRef!)).rejects.toThrow();
  });
});
