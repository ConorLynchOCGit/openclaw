import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireMainRepoWriteLease,
  createMainRepoHashManifest,
  diffMainRepoHashManifests,
  releaseMainRepoWriteLease,
  renewMainRepoWriteLease,
} from "./index.ts";

const roots: string[] = [];

async function tempRoot() {
  const root = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), "main-repo-change-evidence-test-")),
  );
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("main repo change evidence", () => {
  it("records advisory write leases without claiming lifecycle ownership", () => {
    const lease = acquireMainRepoWriteLease({
      runtimeJobId: "job-1",
      repoRoot: "/repo",
      approvedScopeRefs: ["src"],
      now: new Date("2026-05-11T00:00:00.000Z"),
      leaseId: "lease-1",
    });
    const renewed = renewMainRepoWriteLease({
      lease,
      now: new Date("2026-05-11T00:05:00.000Z"),
    });
    const released = releaseMainRepoWriteLease({
      lease: renewed,
      now: new Date("2026-05-11T00:06:00.000Z"),
    });

    expect(lease.advisoryOnly).toBe(true);
    expect(renewed.status).toBe("renewed");
    expect(released.status).toBe("released");
    expect(released.rawLogsStored).toBe(false);
  });

  it("detects modified, created, deleted, and untracked files in approved scopes", async () => {
    const repo = await tempRoot();
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src/a.ts"), "one\n", "utf8");
    await writeFile(path.join(repo, "src/delete.ts"), "delete\n", "utf8");

    const before = await createMainRepoHashManifest({
      repoRoot: repo,
      approvedScopeRefs: ["src"],
      manifestId: "before",
    });
    await writeFile(path.join(repo, "src/a.ts"), "two\n", "utf8");
    await writeFile(path.join(repo, "src/new.ts"), "new\n", "utf8");
    await rm(path.join(repo, "src/delete.ts"));
    const after = await createMainRepoHashManifest({
      repoRoot: repo,
      approvedScopeRefs: ["src"],
      manifestId: "after",
    });
    const diff = diffMainRepoHashManifests({ before, after });

    expect(diff.changedFiles.map((file) => [file.fileRef, file.changeKind])).toEqual([
      ["src/a.ts", "modified"],
      ["src/delete.ts", "deleted"],
      ["src/new.ts", "created"],
    ]);
    expect(diff.reasonCodes).toContain("main_repo_pre_post_hash_manifest_detected_changes");
    expect(diff.rawLogsStored).toBe(false);
    await expect(readFile(path.join(repo, "src/a.ts"), "utf8")).resolves.toBe("two\n");
  });

  it("rejects unsafe scope refs", async () => {
    const repo = await tempRoot();
    await expect(
      createMainRepoHashManifest({ repoRoot: repo, approvedScopeRefs: ["../secrets"] }),
    ).rejects.toThrow("main_repo_unsafe_file_ref");
  });
});
