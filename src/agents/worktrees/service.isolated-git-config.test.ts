import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { listRegistryWorktrees } from "./registry.js";
import { ManagedWorktreeService } from "./service.js";

const execFileAsync = promisify(execFile);

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

describe("ManagedWorktreeService isolated Git configuration", () => {
  let root: string;
  let repo: string;
  let env: NodeJS.ProcessEnv;
  let service: ManagedWorktreeService;

  beforeEach(async () => {
    root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "openclaw-isolated-git-config-"),
    );
    repo = await initializeRepository(root);
    env = { ...process.env, OPENCLAW_STATE_DIR: path.join(root, "openclaw-state") };
    service = new ManagedWorktreeService({ env });
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects branch-conditional executable configuration before checkout", async () => {
    const includePath = path.join(root, "isolated-branch-config");
    await fs.writeFile(includePath, '[filter "branch-owned"]\n\tsmudge = /bin/false\n');
    const name = "isolated-conditional-config";
    const branch = `openclaw-system/inspect/${name}`;
    await git(repo, "config", `includeIf.onbranch:${branch}.path`, includePath);
    const sourceCommit = await git(repo, "rev-parse", "HEAD");

    await expect(
      service.create({
        repoRoot: repo,
        name,
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("contains executable Git configuration");

    expect(listRegistryWorktrees(env)).toEqual([]);
    expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(name);
    expect(await git(repo, "branch", "--list", branch)).toBe("");
  });

  it("rejects executable worktree-specific configuration on reuse", async () => {
    await git(repo, "config", "extensions.worktreeConfig", "true");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-worktree-config",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await git(created.path, "config", "--worktree", "core.fsmonitor", "/bin/false");

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-worktree-config",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("contains executable Git configuration");
  });

  it("rejects executable source-anchor configuration before checkout", async () => {
    const filterMarker = path.join(root, "checkout-filter-env");
    const filterScript = path.join(root, "reject-checkout.sh");
    await fs.writeFile(
      filterScript,
      [
        "#!/bin/sh",
        `printf "%s" "\${OPENAI_API_KEY-unset}" > "${filterMarker}"`,
        "cat >/dev/null",
        "exit 9",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    await fs.writeFile(path.join(repo, ".gitattributes"), "README.md filter=reject-checkout\n");
    await git(repo, "config", "filter.reject-checkout.clean", "cat");
    await git(repo, "config", "filter.reject-checkout.smudge", filterScript);
    await git(repo, "config", "filter.reject-checkout.required", "true");
    await git(repo, "add", ".gitattributes");
    await git(repo, "commit", "-m", "add rejecting checkout filter");
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    service = new ManagedWorktreeService({
      env: { ...env, OPENAI_API_KEY: "must-not-reach-checkout-filter" },
    });

    await expect(
      service.create({
        repoRoot: repo,
        name: "isolated-executable-config",
        baseRef: sourceCommit,
        setupMode: "isolated",
        runSetupScript: false,
      }),
    ).rejects.toThrow("contains executable Git configuration");

    await expect(fs.stat(filterMarker)).rejects.toMatchObject({ code: "ENOENT" });
    expect(listRegistryWorktrees(env)).toEqual([]);
  });

  it("disables repository-owned hooks for every isolated Git transaction", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const hookMarker = path.join(root, "isolated-hook-ran");
    const hooksDir = path.join(root, "source-hooks");
    await fs.mkdir(hooksDir);
    for (const hookName of ["post-checkout", "reference-transaction"]) {
      await fs.writeFile(
        path.join(hooksDir, hookName),
        `#!/bin/sh\ntouch "${hookMarker}"\nexit 0\n`,
        { mode: 0o755 },
      );
    }
    await git(repo, "config", "core.hooksPath", hooksDir);

    const created = await service.create({
      repoRoot: repo,
      name: "isolated-no-hooks",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await fs.writeFile(path.join(created.path, "README.md"), "edited\n");
    await service.remove({ id: created.id, reason: "hook-proof" });
    await service.restore({ id: created.id });

    await expect(fs.stat(hookMarker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects executable configuration added before lossless cleanup", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-cleanup-config",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    const fsmonitorMarker = path.join(root, "fsmonitor-ran");
    const fsmonitor = path.join(root, "fsmonitor.sh");
    await fs.writeFile(fsmonitor, `#!/bin/sh\ntouch "${fsmonitorMarker}"\nexit 0\n`, {
      mode: 0o755,
    });
    await git(repo, "config", "core.fsmonitor", fsmonitor);

    await expect(service.removeIfLossless(created.id)).rejects.toThrow(
      "contains executable Git configuration",
    );

    await expect(fs.stat(fsmonitorMarker)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(created.path)).resolves.toBeDefined();
    expect(listRegistryWorktrees(env)).toHaveLength(1);
  });

  it("refuses to remove history rewritten away from the loaded generation", async () => {
    const sourceCommit = await git(repo, "rev-parse", "HEAD");
    const created = await service.create({
      repoRoot: repo,
      name: "isolated-rewritten-history",
      baseRef: sourceCommit,
      setupMode: "isolated",
      runSetupScript: false,
    });
    await fs.writeFile(path.join(created.path, "README.md"), "rewritten\n");
    await git(created.path, "add", "README.md");
    await git(created.path, "commit", "--amend", "-m", "rewrite generation root");

    await expect(
      service.remove({ id: created.id, reason: "must-remain-restorable" }),
    ).rejects.toThrow("isolated worktree generation mismatch");

    await expect(fs.stat(created.path)).resolves.toBeDefined();
    const records = listRegistryWorktrees(env);
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(created.id);
    expect(records[0]?.removedAt).toBeUndefined();
  });
});
