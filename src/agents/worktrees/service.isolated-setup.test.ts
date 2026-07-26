import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveExecutablePath } from "../../infra/executable-path.js";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { getRegistryWorktreeProvisionedPaths, listRegistryWorktrees } from "./registry.js";
import { ManagedWorktreeService } from "./service.js";

const execFileAsync = promisify(execFile);

function isolatedBranch(name: string, setup: boolean): string {
  return `openclaw-system/${setup ? "setup" : "inspect"}/${name}`;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return stdout.trim();
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

async function pause(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 25);
  });
}

async function waitForPath(target: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fs.access(target);
      return;
    } catch {
      await pause();
    }
  }
  throw new Error(`timed out waiting for path: ${target}`);
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        return;
      }
      throw error;
    }
    await pause();
  }
  throw new Error(`timed out waiting for process exit: ${pid}`);
}

describe("ManagedWorktreeService isolated setup", () => {
  let root: string;
  let repo: string;
  let env: NodeJS.ProcessEnv;
  let service: ManagedWorktreeService;

  beforeEach(async () => {
    root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "openclaw-isolated-worktree-"),
    );
    repo = await initializeRepository(root);
    env = { ...process.env, OPENCLAW_STATE_DIR: path.join(root, "openclaw-state") };
    service = new ManagedWorktreeService({ env });
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("creates from an exact local object without fetching or provisioning", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const fetchMarker = path.join(root, "fetch-used");
    const uploadPack = path.join(root, "upload-pack.sh");
    await fs.writeFile(uploadPack, `#!/bin/sh\ntouch ${JSON.stringify(fetchMarker)}\nexit 1\n`, {
      mode: 0o755,
    });
    await git(repo, "remote", "add", "origin", repo);
    await git(repo, "config", "remote.origin.uploadpack", uploadPack);
    await fs.writeFile(path.join(repo, ".gitignore"), "candidate.env\n");
    await fs.writeFile(path.join(repo, "candidate.env"), "must-not-copy\n");

    const created = await service.create({
      repoRoot: repo,
      name: "isolated-inspect",
      baseRef: sourceCommit,
      ownerKind: "session",
      ownerId: "session-inspect",
      setupMode: "isolated",
      runSetupScript: false,
    });

    expect(created.baseRef).toBe(sourceCommit);
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(sourceCommit);
    expect(getRegistryWorktreeProvisionedPaths(env, created.id)).toEqual([]);
    await expect(fs.stat(path.join(created.path, "candidate.env"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.stat(fetchMarker)).rejects.toMatchObject({ code: "ENOENT" });
    await fs.writeFile(path.join(created.path, "README.md"), "inspect edit\n");
    await service.remove({ id: created.id, reason: "inspect-restore" });
    const restored = await service.restore({ id: created.id });
    expect(await fs.readFile(path.join(restored.path, "README.md"), "utf8")).toBe("inspect edit\n");
    expect(await git(restored.path, "branch", "--show-current")).toBe(
      isolatedBranch("isolated-inspect", false),
    );
  });

  it("uses a branch namespace that can coexist with ordinary openclaw branches", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const ordinary = await service.create({
      repoRoot: repo,
      name: "isolated",
      runSetupScript: false,
    });
    const isolated = await service.create({
      repoRoot: repo,
      name: "system-change",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });

    expect(ordinary.branch).toBe("openclaw/isolated");
    expect(isolated.branch).toBe(isolatedBranch("system-change", false));
    expect(await git(repo, "show-ref", "--verify", `refs/heads/${ordinary.branch}`)).toContain(
      ordinary.branch,
    );
    expect(await git(repo, "show-ref", "--verify", `refs/heads/${isolated.branch}`)).toContain(
      isolated.branch,
    );
  });

  it("preserves ordinary upstream checkout state when registry insertion fails", async () => {
    await expect(
      service.create({
        repoRoot: repo,
        name: "generic-registry-failure",
        ownerKind: "invalid" as never,
        runSetupScript: false,
      }),
    ).rejects.toThrow();

    expect(
      await git(repo, "show-ref", "--verify", "refs/heads/openclaw/generic-registry-failure"),
    ).toContain("openclaw/generic-registry-failure");
    expect(await git(repo, "worktree", "list", "--porcelain")).toContain(
      path.join(env.OPENCLAW_STATE_DIR!, "worktrees"),
    );
  });

  it("allows non-executable local Git configuration", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await git(repo, "config", "credential.helper", "cache");
    await git(repo, "config", "alias.summary", "status --short");
    await git(repo, "config", "core.pager", "cat");

    const created = await service.create({
      repoRoot: repo,
      name: "isolated-benign-config",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });

    expect(await git(created.path, "rev-parse", "HEAD")).toBe(sourceCommit);
  });

  it.runIf(process.platform !== "win32")(
    "resolves Git before applying the scrubbed child environment",
    async () => {
      const sourceCommit = await git(repo, "rev-parse", "HEAD");
      const actualGit = resolveExecutablePath("git");
      if (!actualGit) {
        throw new Error("test requires Git");
      }
      const fakeBin = path.join(root, "non-fhs-bin");
      const marker = path.join(root, "resolved-git-used");
      await fs.mkdir(fakeBin);
      await fs.writeFile(
        path.join(fakeBin, "git"),
        `#!/bin/sh\n: > ${JSON.stringify(marker)}\nexec ${JSON.stringify(actualGit)} "$@"\n`,
        { mode: 0o755 },
      );
      const originalPath = process.env.PATH;
      process.env.PATH = fakeBin;
      try {
        await service.create({
          repoRoot: repo,
          name: "isolated-resolved-git",
          baseRef: sourceCommit,
          setupMode: "isolated",
          runSetupScript: false,
        });
      } finally {
        if (originalPath === undefined) {
          delete process.env.PATH;
        } else {
          process.env.PATH = originalPath;
        }
      }

      await expect(fs.stat(marker)).resolves.toBeDefined();
    },
  );

  it("ignores Git replacement refs for the selected generation", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await fs.writeFile(path.join(repo, "README.md"), "replacement\n");
    await git(repo, "add", "README.md");
    await git(repo, "commit", "-m", "replacement commit");
    const replacementCommit = await git(repo, "rev-parse", "HEAD");
    await git(repo, "replace", sourceCommit, replacementCommit);
    expect(await git(repo, "show", `${sourceCommit}:README.md`)).toBe("replacement");

    const created = await service.create({
      repoRoot: repo,
      name: "isolated-no-replace",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });

    expect(await fs.readFile(path.join(created.path, "README.md"), "utf8")).toBe("base\n");
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(sourceCommit);
  });

  it("rejects a promisor generation whose tree is not fully local without fetching", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const blob = await git(repo, "rev-parse", `${sourceCommit}:README.md`);
    const objectPath = path.resolve(
      repo,
      await git(repo, "rev-parse", "--git-path", `objects/${blob.slice(0, 2)}/${blob.slice(2)}`),
    );
    const savedObject = `${objectPath}.saved`;
    await fs.rename(objectPath, savedObject);
    const fetchMarker = path.join(root, "lazy-fetch-used");
    const uploadPack = path.join(root, "lazy-upload-pack.sh");
    await fs.writeFile(uploadPack, `#!/bin/sh\ntouch "${fetchMarker}"\nexit 1\n`, {
      mode: 0o755,
    });
    await git(repo, "remote", "add", "origin", repo);
    await git(repo, "config", "remote.origin.uploadpack", uploadPack);
    await git(repo, "config", "remote.origin.promisor", "true");
    await git(repo, "config", "remote.origin.partialclonefilter", "blob:none");

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-missing-object",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("source tree is not fully local");
    await expect(fs.stat(fetchMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires an exact primary-checkout commit", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-missing",
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("require an exact local source commit");
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-symbolic",
        baseRef: "HEAD",
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("require an exact local source commit");
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-unknown",
        baseRef: "a".repeat(sourceCommit.length),
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("is not an exact local commit");

    const linked = path.join(root, "linked-isolated-source");
    await git(repo, "worktree", "add", "-b", "linked-isolated-source", linked, sourceCommit);
    await expect(
      service.create({
        repoRoot: linked,
        name: "isolated-linked",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("require the primary source checkout");
  });

  it("rejects tracked .worktreeinclude in the isolated generation", async () => {
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "cache/**\n");
    await git(repo, "add", ".worktreeinclude");
    await git(repo, "commit", "-m", "add worktree include");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await fs.rm(path.join(repo, ".worktreeinclude"));

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-include",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("isolated source commit does not allow .worktreeinclude");
  });

  it("rejects .worktreeinclude in the source checkout", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), "candidate.env\n");

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-source-include",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("isolated source checkout does not allow .worktreeinclude");
  });

  it("serializes same-name isolated creates without removing the winner", async () => {
    const setupStarted = path.join(root, "setup-started");
    const setupRelease = path.join(root, "setup-release");
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(
      path.join(repo, ".openclaw", "worktree-setup.sh"),
      [
        "#!/bin/sh",
        `touch "${setupStarted}"`,
        `while [ ! -f "${setupRelease}" ]; do sleep 0.02; done`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add blocking setup");
    const setupCommit = await git(repo, "rev-parse", "HEAD");
    const first = service.create({
      repoRoot: repo,
      name: "isolated-concurrent",
      baseRef: setupCommit,
      setupMode: "isolated",
    });
    await waitForPath(setupStarted);
    let secondSettled = false;
    const second = service
      .create({
        repoRoot: repo,
        name: "isolated-concurrent",
        baseRef: setupCommit,
        setupMode: "isolated",
      })
      .finally(() => {
        secondSettled = true;
      });
    await pause();
    expect(secondSettled).toBe(false);
    await fs.writeFile(setupRelease, "");
    const results = await Promise.all([first, second]);

    expect(results[1]?.id).toBe(results[0]?.id);
    expect(await git(repo, "worktree", "list", "--porcelain")).toContain(results[0]?.path);
    expect(await git(results[0]!.path, "branch", "--show-current")).toBe(
      isolatedBranch("isolated-concurrent", true),
    );
  });

  it("rejects same-name reuse from another exact generation", async () => {
    const firstCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-generation",
      baseRef: firstCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await fs.writeFile(path.join(created.path, "README.md"), "worktree commit\n");
    await git(created.path, "add", "README.md");
    await git(created.path, "commit", "-m", "worktree commit");
    const worktreeCommit = await git(created.path, "rev-parse", "HEAD");
    const reused = await service.create({
      repoRoot: repo,
      name: "isolated-generation",
      baseRef: firstCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    expect(reused.id).toBe(created.id);
    expect(await git(reused.path, "rev-parse", "HEAD")).toBe(worktreeCommit);

    await fs.writeFile(path.join(repo, "README.md"), "next\n");
    await git(repo, "add", "README.md");
    await git(repo, "commit", "-m", "next generation");
    const nextCommit = await git(repo, "rev-parse", "HEAD");

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-generation",
        baseRef: nextCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("isolated worktree generation mismatch");
    expect(await git(created.path, "rev-parse", "HEAD")).toBe(worktreeCommit);
    expect(await fs.readFile(path.join(created.path, "README.md"), "utf8")).toBe(
      "worktree commit\n",
    );
  });

  it.each(["detached", "switched"] as const)(
    "rejects reuse after the checkout is %s",
    async (mode) => {
      const sourceCommit = await git(repo, "rev-parse", "HEAD");
      const created = await service.create({
        repoRoot: repo,
        name: `isolated-${mode}`,
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      });
      if (mode === "detached") {
        await git(created.path, "switch", "--detach");
      } else {
        await git(created.path, "switch", "-c", "unexpected");
      }

      await expect(
        service.create({
          repoRoot: repo,
          name: `isolated-${mode}`,
          baseRef: sourceCommit,
          setupMode: "isolated",
          runSetupScript: false,
        }),
      ).rejects.toThrow("isolated worktree changed branch");
    },
  );

  it("rejects setup-mode changes for live and restorable records", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const isolated = await service.create({
      repoRoot: repo,
      name: "isolated-mode",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-mode",
        baseRef: sourceCommit,
        runSetupScript: false,
      }),
    ).rejects.toThrow("worktree setup mode mismatch");
    await fs.writeFile(path.join(isolated.path, "README.md"), "preserve\n");
    await service.remove({ id: isolated.id, reason: "mode-test" });
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-mode",
        baseRef: sourceCommit,
        runSetupScript: false,
      }),
    ).rejects.toThrow("worktree setup mode mismatch");

    await service.create({
      repoRoot: repo,
      name: "repository-mode",
      baseRef: sourceCommit,
      runSetupScript: false,
    });
    await expect(
      service.create({
        repoRoot: repo,
        name: "repository-mode",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("worktree setup mode mismatch");
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinked isolated setup files and directories",
    async () => {
      const externalSetup = path.join(root, "external-setup.sh");
      await fs.writeFile(externalSetup, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      await fs.mkdir(path.join(repo, ".openclaw"));
      await fs.symlink(externalSetup, path.join(repo, ".openclaw", "worktree-setup.sh"));
      await git(repo, "add", ".openclaw/worktree-setup.sh");
      await git(repo, "commit", "-m", "add symlinked setup script");
      const scriptSymlinkCommit = await git(repo, "rev-parse", "HEAD");

      await expect(
        service.create({
          repoRoot: repo,
          name: "isolated-script-symlink",
          baseRef: scriptSymlinkCommit,
          setupMode: "isolated",
        }),
      ).rejects.toThrow("setup script is missing or not executable");

      await fs.rm(path.join(repo, ".openclaw"), { recursive: true, force: true });
      const externalSetupDir = path.join(root, "external-openclaw");
      await fs.mkdir(externalSetupDir);
      await fs.writeFile(path.join(externalSetupDir, "worktree-setup.sh"), "#!/bin/sh\nexit 0\n", {
        mode: 0o755,
      });
      await fs.symlink(externalSetupDir, path.join(repo, ".openclaw"));
      await git(repo, "add", "-A");
      await git(repo, "commit", "-m", "add symlinked setup directory");
      const directorySymlinkCommit = await git(repo, "rev-parse", "HEAD");

      await expect(
        service.create({
          repoRoot: repo,
          name: "isolated-directory-symlink",
          baseRef: directorySymlinkCommit,
          setupMode: "isolated",
        }),
      ).rejects.toThrow("setup script is missing or not executable");
    },
  );

  it("runs setup from the exact checkout with a scrubbed environment", async () => {
    const hookMarker = path.join(root, "checkout-hook-ran");
    const setupEnvReport = path.join(root, "setup-env.txt");
    const toolBin = path.join(root, "portable-toolchain");
    const nodeExecutable = resolveExecutablePath("node");
    const pnpmExecutable = resolveExecutablePath("pnpm");
    if (!nodeExecutable || !pnpmExecutable) {
      throw new Error("test requires node and pnpm");
    }
    await fs.mkdir(toolBin);
    await fs.symlink(nodeExecutable, path.join(toolBin, "node"));
    await fs.symlink(pnpmExecutable, path.join(toolBin, "pnpm"));
    await fs.writeFile(
      path.join(repo, ".git", "hooks", "post-checkout"),
      `#!/bin/sh\nprintf ran > "${hookMarker}"\n`,
      { mode: 0o755 },
    );
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(
      path.join(repo, ".openclaw", "worktree-setup.sh"),
      [
        "#!/bin/sh",
        `printf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$PWD" "$PATH" "$HOME" "$COREPACK_HOME" "$npm_config_store_dir" "$OPENCLAW_SOURCE_TREE_PATH" "$OPENCLAW_WORKTREE_PATH" "\${OPENAI_API_KEY-unset}" "\${OPENROUTER_API_KEY-unset}" "\${OPENCLAW_GATEWAY_TOKEN-unset}" "\${DATABASE_URL-unset}" > ${JSON.stringify(setupEnvReport)}`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add isolated setup");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    service = new ManagedWorktreeService({
      env: {
        ...env,
        PATH: toolBin,
        HOME: path.join(root, "service-home"),
        OPENAI_API_KEY: "must-not-leak",
        OPENROUTER_API_KEY: "must-not-leak",
        OPENCLAW_GATEWAY_TOKEN: "must-not-leak",
        DATABASE_URL: "must-not-leak",
      },
    });

    const created = await service.create({
      repoRoot: repo,
      name: "isolated-setup",
      baseRef: sourceCommit,
      ownerKind: "session",
      ownerId: "session-modify",
      setupMode: "isolated",
    });
    const [
      setupCwd,
      setupPath,
      setupHome,
      corepackHome,
      pnpmStorePath,
      sourcePath,
      worktreePath,
      providerSecret,
      unrelatedProviderSecret,
      gatewaySecret,
      databaseSecret,
      tail,
    ] = (await fs.readFile(setupEnvReport, "utf8")).split("\n");
    if (!setupHome) {
      throw new Error("isolated setup did not report its disposable HOME");
    }
    const packageCacheRoot = path.join(env.OPENCLAW_STATE_DIR!, "tools", "worktree-package-cache");
    expect(setupCwd).toBe(created.path);
    expect(setupPath).toBe(toolBin);
    expect(path.basename(setupHome)).toMatch(/^openclaw-worktree-setup-home-/u);
    expect(corepackHome).toBe(path.join(packageCacheRoot, "corepack"));
    expect(pnpmStorePath).toBe(path.join(packageCacheRoot, "pnpm-store"));
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
    await expect(fs.stat(hookMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the repository setup script usable without the isolated store override", async () => {
    const setupScript = path.join(repo, ".openclaw", "worktree-setup.sh");
    const fakeBin = path.join(root, "fake-bin");
    const pnpmArgs = path.join(root, "pnpm-args");
    await fs.mkdir(path.dirname(setupScript), { recursive: true });
    await fs.mkdir(fakeBin);
    await fs.copyFile(path.join(process.cwd(), ".openclaw", "worktree-setup.sh"), setupScript);
    await fs.chmod(setupScript, 0o755);
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.0.0" }),
    );
    await fs.writeFile(path.join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await fs.writeFile(
      path.join(fakeBin, "pnpm"),
      [
        "#!/bin/sh",
        'if [ "${1-}" = "--version" ]; then printf "10.0.0\\n"; exit 0; fi',
        'printf "%s\\n" "$@" > "$PNPM_ARGS_REPORT"',
        "mkdir -p node_modules/.bin",
        "touch node_modules/.bin/tsgo node_modules/.bin/vitest",
        "chmod +x node_modules/.bin/tsgo node_modules/.bin/vitest",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    await execFileAsync(setupScript, [], {
      cwd: repo,
      env: {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        PNPM_ARGS_REPORT: pnpmArgs,
      },
    });

    const args = (await fs.readFile(pnpmArgs, "utf8")).trim().split("\n");
    expect(args).toEqual(["install", "--frozen-lockfile", "--prefer-offline"]);
  });

  it("restores isolated edits after rerunning only the immutable setup script", async () => {
    const setupRuns = path.join(root, "setup-runs");
    const setupHeads = path.join(root, "setup-heads");
    const editedSetupRan = path.join(root, "edited-setup-ran");
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(
      path.join(repo, ".openclaw", "worktree-setup.sh"),
      ["#!/bin/sh", `printf x >> "${setupRuns}"`, `git rev-parse HEAD >> "${setupHeads}"`, ""].join(
        "\n",
      ),
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add restore setup");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-restore",
      baseRef: sourceCommit,
      setupMode: "isolated",
    });
    await fs.writeFile(path.join(created.path, "README.md"), "committed edit\n");
    await git(created.path, "add", "README.md");
    await git(created.path, "commit", "-m", "advance isolated branch");
    const advancedCommit = await git(created.path, "rev-parse", "HEAD");
    await fs.writeFile(path.join(created.path, "README.md"), "edited\n");
    await fs.writeFile(
      path.join(created.path, ".openclaw", "worktree-setup.sh"),
      `#!/bin/sh\ntouch "${editedSetupRan}"\n`,
      { mode: 0o755 },
    );

    const removed = await service.remove({ id: created.id, reason: "restore-test" });
    expect(removed.snapshotRef).toBeTruthy();
    const restored = await service.restore({ id: created.id });

    expect(await fs.readFile(setupRuns, "utf8")).toBe("xx");
    expect((await fs.readFile(setupHeads, "utf8")).trim().split("\n")).toEqual([
      sourceCommit,
      sourceCommit,
    ]);
    await expect(fs.stat(editedSetupRan)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(restored.path, "README.md"), "utf8")).toBe("edited\n");
    expect(
      await fs.readFile(path.join(restored.path, ".openclaw", "worktree-setup.sh"), "utf8"),
    ).toBe(`#!/bin/sh\ntouch "${editedSetupRan}"\n`);
    expect(await git(restored.path, "branch", "--show-current")).toBe(
      isolatedBranch("isolated-restore", true),
    );
    expect(await git(restored.path, "rev-parse", "HEAD")).toBe(advancedCommit);
    expect(getRegistryWorktreeProvisionedPaths(env, restored.id)).toEqual([]);
  });

  it("removes all create state when setup fails", async () => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(
      path.join(repo, ".openclaw", "worktree-setup.sh"),
      "#!/bin/sh\necho setup-broke >&2\nexit 9\n",
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add failing setup");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-failure",
        baseRef: sourceCommit,
        setupMode: "isolated",
      }),
    ).rejects.toThrow("setup-broke");
    expect(listRegistryWorktrees(env)).toEqual([]);
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain("isolated-failure");
    expect(await git(repo, "branch", "--list", isolatedBranch("isolated-failure", true))).toBe("");
  });

  it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
    "removes an isolated branch when git worktree add cannot create the checkout",
    async () => {
      const sourceCommit = await git(repo, "rev-parse", "HEAD");
      const probe = await service.create({
        repoRoot: repo,
        name: "isolated-parent-probe",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      });
      const worktreeParent = path.dirname(probe.path);
      await service.remove({ id: probe.id, reason: "test-fixture" });
      await fs.mkdir(worktreeParent, { recursive: true });
      await fs.chmod(worktreeParent, 0o500);
      try {
        await expect(
          service.create({
            repoRoot: repo,
            name: "isolated-add-failure",
            baseRef: sourceCommit,
            setupMode: "isolated",
            runSetupScript: false,
          }),
        ).rejects.toThrow("git worktree add failed");
      } finally {
        await fs.chmod(worktreeParent, 0o700);
      }

      expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(
        "isolated-add-failure",
      );
      expect(
        await git(repo, "branch", "--list", isolatedBranch("isolated-add-failure", false)),
      ).toBe("");
    },
  );

  it.each([
    {
      name: "head",
      expected: "setup changed HEAD",
      body: [
        'printf "setup commit\\n" > README.md',
        "git add README.md",
        'git -c user.name=OpenClaw -c user.email=openclaw@localhost commit -m "setup mutation" >/dev/null',
      ],
    },
    {
      name: "source",
      expected: "setup changed source files",
      body: ['printf "setup edit\\n" > README.md'],
    },
  ])("rejects isolated setup that changes $name state", async ({ name, expected, body }) => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(
      path.join(repo, ".openclaw", "worktree-setup.sh"),
      ["#!/bin/sh", "set -eu", ...body, ""].join("\n"),
      { mode: 0o755 },
    );
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", `add ${name} mutation setup`);
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const worktreeName = `isolated-setup-mutates-${name}`;

    await expect(
      service.create({
        repoRoot: repo,
        name: worktreeName,
        baseRef: sourceCommit,
        setupMode: "isolated",
      }),
    ).rejects.toThrow(expected);

    expect(listRegistryWorktrees(env)).toEqual([]);
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(worktreeName);
    expect(await git(repo, "branch", "--list", isolatedBranch(worktreeName, true))).toBe("");
  });

  it("preserves isolated commits even when a remote ref already contains them", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-remote-contained",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await fs.writeFile(path.join(created.path, "README.md"), "accepted elsewhere\n");
    await git(created.path, "add", "README.md");
    await git(created.path, "commit", "-m", "isolated work");
    const worktreeCommit = await git(created.path, "rev-parse", "HEAD");
    await git(repo, "update-ref", "refs/remotes/origin/accepted", worktreeCommit);

    await expect(service.removeIfLossless(created.id)).resolves.toBe(false);
    await expect(fs.stat(created.path)).resolves.toBeDefined();
  });

  it("removes the checkout when registry insertion fails", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-registry-failure",
        baseRef: sourceCommit,
        ownerKind: "invalid" as never,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow();

    expect(listRegistryWorktrees(env)).toEqual([]);
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(
      "isolated-registry-failure",
    );
    expect(
      await git(repo, "branch", "--list", isolatedBranch("isolated-registry-failure", false)),
    ).toBe("");
  });

  it.runIf(process.platform !== "win32")(
    "terminates background descendants when setup exits unsuccessfully",
    async () => {
      const childMarker = path.join(root, "failed-setup-child");
      await fs.mkdir(path.join(repo, ".openclaw"));
      await fs.writeFile(
        path.join(repo, ".openclaw", "worktree-setup.sh"),
        ["#!/bin/sh", "sleep 300 &", `printf "%s" "$!" > "${childMarker}"`, "exit 9", ""].join(
          "\n",
        ),
        { mode: 0o755 },
      );
      await git(repo, "add", ".openclaw/worktree-setup.sh");
      await git(repo, "commit", "-m", "add failing background setup");
      const sourceCommit = await git(repo, "rev-parse", "HEAD");

      await expect(
        service.create({
          repoRoot: repo,
          name: "isolated-background-failure",
          baseRef: sourceCommit,
          setupMode: "isolated",
        }),
      ).rejects.toThrow("worktree setup failed");
      const childPid = Number.parseInt(await fs.readFile(childMarker, "utf8"), 10);
      await waitForProcessExit(childPid);
      expect(listRegistryWorktrees(env)).toEqual([]);
    },
  );

  it.runIf(process.platform !== "win32")(
    "cancels the setup process tree before admitting the worktree",
    async () => {
      const startedMarker = path.join(root, "isolated-setup-started");
      await fs.mkdir(path.join(repo, ".openclaw"));
      await fs.writeFile(
        path.join(repo, ".openclaw", "worktree-setup.sh"),
        [
          "#!/bin/sh",
          "sleep 300 &",
          "child=$!",
          `printf "%s %s\\n" "$$" "$child" > "${startedMarker}"`,
          'wait "$child"',
          "",
        ].join("\n"),
        { mode: 0o755 },
      );
      await git(repo, "add", ".openclaw/worktree-setup.sh");
      await git(repo, "commit", "-m", "add cancellable setup");
      const sourceCommit = await git(repo, "rev-parse", "HEAD");
      const controller = new AbortController();
      const creation = service.create({
        repoRoot: repo,
        name: "isolated-cancelled",
        baseRef: sourceCommit,
        setupMode: "isolated",
        signal: controller.signal,
      });
      await waitForPath(startedMarker);
      const pids = (await fs.readFile(startedMarker, "utf8"))
        .trim()
        .split(/\s+/u)
        .map((value) => Number.parseInt(value, 10));
      controller.abort(new Error("setup cancelled"));
      await expect(creation).rejects.toThrow("worktree setup failed");
      await Promise.all(pids.map((pid) => waitForProcessExit(pid)));

      expect(listRegistryWorktrees(env)).toEqual([]);
      expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(
        "isolated-cancelled",
      );
      expect(await git(repo, "branch", "--list", isolatedBranch("isolated-cancelled", true))).toBe(
        "",
      );
    },
  );

  it("cleans creation when setup is already cancelled", async () => {
    await fs.mkdir(path.join(repo, ".openclaw"));
    await fs.writeFile(path.join(repo, ".openclaw", "worktree-setup.sh"), "#!/bin/sh\nexit 0\n", {
      mode: 0o755,
    });
    await git(repo, "add", ".openclaw/worktree-setup.sh");
    await git(repo, "commit", "-m", "add setup");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const controller = new AbortController();
    controller.abort(new Error("setup cancelled"));
    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-cancelled",
        baseRef: sourceCommit,
        setupMode: "isolated",
        signal: controller.signal,
      }),
    ).rejects.toThrow("setup cancelled");
    expect(listRegistryWorktrees(env)).toEqual([]);
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain("isolated-cancelled");
    expect(await git(repo, "branch", "--list", isolatedBranch("isolated-cancelled", true))).toBe(
      "",
    );
  });
});
