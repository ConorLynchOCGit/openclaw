import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const pushScriptPath = path.join(process.cwd(), "scripts", "pr-lib", "push.sh");
const tempRepos: string[] = [];

function run(cwd: string, command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

function git(cwd: string, ...args: string[]) {
  return run(cwd, "git", args);
}

function createRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), "pr-push-test-"));
  tempRepos.push(repo);

  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test User");
  writeFileSync(path.join(repo, "seed.txt"), "seed\n");
  git(repo, "add", "seed.txt");
  git(repo, "commit", "-qm", "seed");

  return repo;
}

function callPushHelper(repo: string, snippet: string) {
  return execFileSync("bash", ["-lc", `source "${pushScriptPath}"; ${snippet}`], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function callPushHelperFailure(repo: string, snippet: string) {
  try {
    callPushHelper(repo, snippet);
    throw new Error("expected helper to fail");
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "")
        : String(error);
    return stderr;
  }
}

afterEach(() => {
  while (tempRepos.length > 0) {
    const repo = tempRepos.pop();
    if (repo) {
      rmSync(repo, { force: true, recursive: true });
    }
  }
});

describe("scripts/pr-lib/push.sh landing assertions", () => {
  it("accepts a clean landing worktree", () => {
    const repo = createRepo();
    expect(callPushHelper(repo, "assert_clean_landing_worktree")).toBe("");
  });

  it("rejects a dirty landing worktree with actionable output", () => {
    const repo = createRepo();
    writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");

    expect(callPushHelperFailure(repo, "assert_clean_landing_worktree")).toContain(
      "worktree/index is not clean after landing",
    );
  });

  it("rejects a mismatched local HEAD", () => {
    const repo = createRepo();
    expect(
      callPushHelperFailure(repo, "assert_local_head_matches_expected_sha deadbeef"),
    ).toContain("local HEAD does not match the pushed upstream ref");
  });
});
