import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReleasePreparationAuthority } from "./release-preparation-authority.js";
import {
  buildReleasePreparationEnvironment,
  buildReleasePreparationSystemdArgs,
  startReleasePreparationHandoff,
} from "./release-preparation-handoff.js";
import { deriveReleasePreparationOperationId } from "./release-preparation-store.js";

const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all([...tempDirs].map((dir) => fs.rm(dir, { force: true, recursive: true })));
  tempDirs.clear();
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-release-handoff-"));
  tempDirs.add(root);
  const packageRoot = path.join(root, "package");
  const releaseStoreRoot = path.join(root, "releases");
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, "openclaw.mjs"), "export {};\n");
  const authority = {
    packageRoot,
    worktree: { id: "worktree-1" },
    loadedRelease: { releaseManifestDigest: "a".repeat(64) },
  } as unknown as ReleasePreparationAuthority;
  const env = {
    HOME: path.join(root, "home"),
    XDG_RUNTIME_DIR: path.join(root, "run"),
    OPENCLAW_RELEASE_STORE_ROOT: releaseStoreRoot,
    OPENCLAW_SYSTEM_SOURCE_ANCHOR: path.join(root, "source"),
    OPENCLAW_RELEASE_TAG_REMOTE: "origin",
    PROVIDER_API_KEY: "must-not-pass",
  };
  return { root, packageRoot, releaseStoreRoot, authority, env };
}

describe("release preparation handoff", () => {
  it("builds a transient service rather than a scope or shell command", () => {
    const args = buildReleasePreparationSystemdArgs({
      unitName: "openclaw-release-prepare-test.service",
      packageRoot: "/opt/openclaw",
      nodePath: "/usr/bin/node",
      openclawEntryPath: "/opt/openclaw/openclaw.mjs",
      envPath: "/usr/bin/env",
      codingTaskId: "task-1",
      serviceEnv: { PATH: "/usr/bin:/bin", HOME: "/srv/openclaw-next" },
    });
    expect(args).toContain("--service-type=exec");
    expect(args).toContain("--no-block");
    expect(args).not.toContain("--scope");
    expect(args.slice(-7)).toEqual([
      "/usr/bin/node",
      "/opt/openclaw/openclaw.mjs",
      "release",
      "prepare",
      "--coding-task",
      "task-1",
      "--json",
    ]);
  });

  it("starts one deterministic service with a default-deny command environment", async () => {
    const { authority, env } = await fixture();
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes("show")) {
        return { code: 1, stdout: "LoadState=not-found\n", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });
    const result = await startReleasePreparationHandoff(
      { codingTaskId: "task-1", env },
      {
        resolveAuthority: vi.fn(async () => authority),
        readResult: vi.fn(async () => null),
        runCommand,
        access: vi.fn(async () => undefined),
      },
    );
    const operationId = deriveReleasePreparationOperationId({
      codingTaskId: "task-1",
      worktreeId: "worktree-1",
      loadedReleaseManifestDigest: "a".repeat(64),
    });
    expect(result).toEqual({
      status: "started",
      operationId,
      unitName: `openclaw-release-prepare-${operationId.slice(0, 40)}.service`,
    });
    const launch = runCommand.mock.calls.find((call) => call[0] === "/usr/bin/systemd-run");
    expect(launch).toBeDefined();
    expect(launch?.[1]).toContain("-i");
    expect(launch?.[1].join("\n")).not.toContain("PROVIDER_API_KEY");
  });

  it("returns the immutable accepted result without launching another unit", async () => {
    const { authority, env } = await fixture();
    const operationId = deriveReleasePreparationOperationId({
      codingTaskId: "task-1",
      worktreeId: "worktree-1",
      loadedReleaseManifestDigest: "a".repeat(64),
    });
    const runCommand = vi.fn();
    const result = await startReleasePreparationHandoff(
      { codingTaskId: "task-1", env },
      {
        resolveAuthority: vi.fn(async () => authority),
        readResult: vi.fn(async () => ({
          schema: "openclaw.release.prepare.result.v1",
          operationId,
          codingTaskId: "task-1",
          worktreeId: "worktree-1",
          nativeSnapshotRef: "refs/openclaw/snapshots/1",
          sourceTreeObject: "b".repeat(40),
          acceptedReleaseReceiptId: "c".repeat(64),
          candidateEvidenceRef: "evidence.json",
          candidateEvidenceDigest: "d".repeat(64),
          status: "accepted",
          completedAt: "2026-07-20T00:00:00.000Z",
        })),
        runCommand,
      },
    );
    expect(result.status).toBe("accepted");
    expect(result.acceptedReleaseReceiptId).toBe("c".repeat(64));
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("keeps required native paths while dropping unrelated credentials", async () => {
    const { env, releaseStoreRoot } = await fixture();
    const projected = buildReleasePreparationEnvironment(env);
    expect(projected.OPENCLAW_RELEASE_STORE_ROOT).toBe(releaseStoreRoot);
    expect(projected.OPENCLAW_SYSTEM_SOURCE_ANCHOR).toBe(env.OPENCLAW_SYSTEM_SOURCE_ANCHOR);
    expect(projected.PROVIDER_API_KEY).toBeUndefined();
    expect(projected.NPM_CONFIG_CACHE).toBe(path.join(releaseStoreRoot, "cache", "npm"));
  });
});
