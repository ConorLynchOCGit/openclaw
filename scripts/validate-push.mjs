#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { runPnpmStep } from "./root-gate-runtime.mjs";

const VALIDATION_PIPELINE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "scripts/check-root-gate.mjs",
  "scripts/build-root-gate.mjs",
  "scripts/test-root-gate.mjs",
  "scripts/test-projects.mjs",
  "scripts/test-domain-lane.mjs",
  "scripts/validate-push.mjs",
]);

function listChangedFiles(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveChangedFiles() {
  return Array.from(
    new Set([
      ...listChangedFiles(["diff", "--name-only", "--diff-filter=ACMRT", "origin/main...HEAD"]),
      ...listChangedFiles(["diff", "--name-only", "--diff-filter=ACMRT"]),
      ...listChangedFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]),
    ]),
  ).toSorted((a, b) => a.localeCompare(b));
}

function isValidationPipelineChange(filePath) {
  return (
    VALIDATION_PIPELINE_FILES.has(filePath) ||
    filePath.startsWith("test/vitest/") ||
    filePath.startsWith("docs/projects/turborepo/")
  );
}

function runChangedFileGate() {
  const changedFiles = resolveChangedFiles();
  if (changedFiles.length === 0) {
    runPnpmStep(["test:changed"]);
    return;
  }

  if (changedFiles.some(isValidationPipelineChange)) {
    console.error(
      "[validate:push] validation pipeline files changed; running focused validation/domain lanes instead of expanding root config edits into the exhaustive changed shard graph.",
    );
    runPnpmStep(["test:model-memory"]);
    runPnpmStep(["test:gateway-memory"]);
    runPnpmStep(["test:retrieval"]);
    return;
  }

  runPnpmStep(["test:changed"]);
}

runChangedFileGate();
for (const step of ["check", "build"]) {
  runPnpmStep([step]);
}
