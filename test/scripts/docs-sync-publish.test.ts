import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSyncTargetIsSafe, buildSyncMetadata } from "../../scripts/docs-sync-publish.mjs";

const tempDirs = [];

function createTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("scripts/docs-sync-publish", () => {
  it("rejects nested publish targets inside the source repo", () => {
    const nestedTarget = path.join(process.cwd(), ".artifacts", "docs-sync-test-target");
    tempDirs.push(nestedTarget);
    fs.mkdirSync(nestedTarget, { recursive: true });

    expect(() => assertSyncTargetIsSafe(nestedTarget)).toThrow(/outside the source repo worktree/u);
  });

  it("accepts a standalone output directory outside the source repo", () => {
    expect(() => assertSyncTargetIsSafe(createTempDir("openclaw-docs-sync-"))).not.toThrow();
  });

  it("writes stable bundle metadata without volatile timestamps", () => {
    expect(
      buildSyncMetadata({
        target: "/tmp/docs-bundle",
        sourceRepo: "ConorLynchOCGit/openclaw-platform",
        sourceSha: "abc123",
        releaseTag: "v1.2.3",
      }),
    ).toEqual({
      mode: "same-repo-bundle",
      repository: "ConorLynchOCGit/openclaw-platform",
      sha: "abc123",
      releaseTag: "v1.2.3",
    });
  });
});
