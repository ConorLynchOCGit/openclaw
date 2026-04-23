import { execFileSync } from "node:child_process";

function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/").trim();
}

function listGitLines(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((line) => normalizeRepoPath(line))
    .filter((line) => line.length > 0);
}

export function listChangedWorktreePaths(cwd = process.cwd()) {
  const changed = new Set();
  for (const filePath of listGitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"], cwd)) {
    changed.add(filePath);
  }
  for (const filePath of listGitLines(
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    cwd,
  )) {
    changed.add(filePath);
  }
  for (const filePath of listGitLines(["ls-files", "--others", "--exclude-standard"], cwd)) {
    changed.add(filePath);
  }
  return [...changed].toSorted((left, right) => left.localeCompare(right));
}
