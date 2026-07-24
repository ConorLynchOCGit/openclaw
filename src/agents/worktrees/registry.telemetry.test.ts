// Managed worktree telemetry remains an opt-in read over native registry and lock owners.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeOpenClawStateDatabaseForTest } from "../../state/openclaw-state-db.js";
import { acquireWorktreeRunLease } from "./run-lease.js";
import { IDLE_GC_MS, ManagedWorktreeService, SNAPSHOT_RETENTION_MS } from "./service.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}

describe("managed worktree registry telemetry", () => {
  let root: string;
  let repo: string;
  let env: NodeJS.ProcessEnv;
  let now: number;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "openclaw-wt-telemetry-"));
    repo = path.join(root, "repo");
    env = {
      ...process.env,
      HOME: path.join(root, "home"),
      OPENCLAW_STATE_DIR: path.join(root, "state"),
    };
    now = 1_800_000_000_000;
    await fs.mkdir(repo, { recursive: true });
    await git(repo, "init", "--initial-branch=main");
    await git(repo, "config", "user.email", "test@example.com");
    await git(repo, "config", "user.name", "OpenClaw Test");
    await fs.writeFile(path.join(repo, "README.md"), "base\n", "utf8");
    await git(repo, "add", "README.md");
    await git(repo, "commit", "-m", "base");
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("keeps ordinary listing cheap and reports native lock, size, and retention state on demand", async () => {
    const service = new ManagedWorktreeService({ env, now: () => now });
    const record = await service.create({
      repoRoot: repo,
      name: "telemetry",
      ownerKind: "session",
      ownerId: "agent:coding:session:telemetry",
    });
    await fs.writeFile(path.join(record.path, "change.txt"), "changed\n", "utf8");

    const plain = await service.list();
    expect(plain[0]?.telemetry).toBeUndefined();

    now += IDLE_GC_MS + 1;
    const telemetryOnly = (await service.list({ includeTelemetry: true }))[0]?.telemetry;
    expect(telemetryOnly).toMatchObject({
      sizeStatus: "not_requested",
      lockState: "none",
      activityState: "idle",
      runLeaseActive: false,
      cleanupKind: "idle_gc",
      cleanupEligibleNow: true,
    });
    expect(telemetryOnly?.cleanupEligibleAt).toBe(record.lastActiveAt + IDLE_GC_MS);

    const withSize = (await service.list({ includeSize: true }))[0]?.telemetry;
    expect(withSize?.sizeStatus).toBe("measured");
    expect(withSize?.sizeBytes).toBeGreaterThan(0);

    const lease = await acquireWorktreeRunLease(record.id, { env });
    try {
      const active = (await service.list({ includeTelemetry: true }))[0]?.telemetry;
      expect(active).toMatchObject({
        lockState: "live",
        activityState: "active_run",
        runLeaseActive: true,
        cleanupEligibleNow: false,
      });
    } finally {
      await lease.release();
    }

    const removed = await service.remove({ id: record.id, reason: "telemetry-test" });
    expect(removed).toMatchObject({ removed: true });
    expect(removed.snapshotRef).toBeTruthy();

    const retained = (await service.list({ includeTelemetry: true }))[0]?.telemetry;
    expect(retained).toMatchObject({
      sizeStatus: "not_live",
      lockState: "none",
      activityState: "snapshot_retained",
      runLeaseActive: false,
      cleanupKind: "snapshot_prune",
      cleanupEligibleNow: false,
    });
    expect(retained?.cleanupEligibleAt).toBe(now + SNAPSHOT_RETENTION_MS);
  });
});
