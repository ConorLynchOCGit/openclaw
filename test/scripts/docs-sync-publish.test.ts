import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSyncTargetIsSafe } from "../../scripts/docs-sync-publish.mjs";

const tempDirs = [];

function createTempGitDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".git"));
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
    fs.mkdirSync(path.join(nestedTarget, ".git"), { recursive: true });

    expect(() => assertSyncTargetIsSafe(nestedTarget)).toThrow(/outside the source repo worktree/u);
  });

  it("requires the target to be a git worktree root", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-docs-sync-no-git-"));
    tempDirs.push(dir);

    expect(() => assertSyncTargetIsSafe(dir)).toThrow(/git worktree root/u);
  });

  it("accepts a separate clone outside the source repo", () => {
    expect(() => assertSyncTargetIsSafe(createTempGitDir("openclaw-docs-sync-"))).not.toThrow();
  });
});
