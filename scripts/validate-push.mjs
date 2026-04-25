#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { runPnpmStep } from "./root-gate-runtime.mjs";

const MODE = process.argv[2] ?? "normal";
const VALID_MODES = new Set(["fast", "normal", "full"]);

const VALIDATION_PIPELINE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "scripts/check-root-gate.mjs",
  "scripts/build-root-gate.mjs",
  "scripts/root-gate-runtime.mjs",
  "scripts/test-root-gate.mjs",
  "scripts/test-projects.mjs",
  "scripts/test-projects.test-support.mjs",
  "scripts/test-domain-lane.mjs",
  "scripts/validate-push.mjs",
]);

const LINTABLE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

if (!VALID_MODES.has(MODE)) {
  console.error(`Usage: pnpm validate:push[:fast|:full]\nUnknown mode: ${MODE}`);
  process.exit(1);
}

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

function hasExtension(filePath, extensions) {
  const index = filePath.lastIndexOf(".");
  return index >= 0 && extensions.has(filePath.slice(index));
}

function isValidationPipelineChange(filePath) {
  return (
    VALIDATION_PIPELINE_FILES.has(filePath) ||
    filePath.startsWith("test/vitest/") ||
    filePath.startsWith("docs/projects/turborepo/")
  );
}

function isModelMemoryChange(filePath) {
  return (
    filePath.startsWith("extensions/model-memory/") ||
    filePath.startsWith("docs/projects/model-memory/") ||
    filePath === "scripts/model-memory-bootstrap-projection.test.ts" ||
    filePath.startsWith("src/agents/model-memory") ||
    filePath === "src/plugins/model-memory-tool-surface.test.ts"
  );
}

function isGatewayMemoryChange(filePath) {
  if (filePath === "src/gateway/server.sessions-send.test.ts") {
    return true;
  }
  if (!filePath.startsWith("src/gateway/")) {
    return false;
  }
  const basename = filePath.slice(filePath.lastIndexOf("/") + 1).toLowerCase();
  return basename.includes("memory") || basename.includes("session");
}

function isRetrievalChange(filePath) {
  if (!filePath.startsWith("extensions/model-memory/src/")) {
    return false;
  }
  return (
    filePath.startsWith("extensions/model-memory/src/runtime/retrieval/") ||
    filePath.startsWith("extensions/model-memory/src/runtime/context/") ||
    filePath.startsWith("extensions/model-memory/src/proof/") ||
    /(?:retrieval|capsule|graph|derived-artifact|runtime-read-model)/.test(filePath)
  );
}

function isKnownChangedShardTrap(filePath) {
  return (
    filePath === "test/vitest/vitest.extension-bluebubbles.config.ts" ||
    filePath.startsWith("extensions/bluebubbles/")
  );
}

function isRootOrConfigChange(filePath) {
  return (
    !filePath.includes("/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith("test/") ||
    filePath.startsWith(".github/") ||
    filePath.startsWith("config/") ||
    filePath.startsWith("docs/")
  );
}

function classifyChangedFiles(changedFiles) {
  const domains = {
    validationPipeline: false,
    modelMemory: false,
    gatewayMemory: false,
    retrieval: false,
    knownChangedShardTrap: false,
    rootOrConfig: false,
  };

  for (const filePath of changedFiles) {
    domains.validationPipeline ||= isValidationPipelineChange(filePath);
    domains.modelMemory ||= isModelMemoryChange(filePath);
    domains.gatewayMemory ||= isGatewayMemoryChange(filePath);
    domains.retrieval ||= isRetrievalChange(filePath);
    domains.knownChangedShardTrap ||= isKnownChangedShardTrap(filePath);
    domains.rootOrConfig ||= isRootOrConfigChange(filePath);
  }

  return domains;
}

function selectTestCommands(changedFiles, domains) {
  const commands = new Set();
  let usesChangedLane = false;

  if (changedFiles.length === 0) {
    commands.add("test:changed");
    usesChangedLane = true;
    return {
      commands: [...commands],
      usesChangedLane,
      fallbackReason: "no changed files detected",
    };
  }

  if (domains.validationPipeline) {
    commands.add("test:model-memory:push");
  }

  if (domains.modelMemory) {
    commands.add("test:model-memory:push");
  } else {
    if (domains.gatewayMemory) {
      commands.add("test:gateway-memory");
    }
    if (domains.retrieval) {
      commands.add("test:retrieval");
    }
  }

  if (commands.size > 0) {
    return { commands: [...commands], usesChangedLane, fallbackReason: null };
  }

  if (domains.knownChangedShardTrap || domains.rootOrConfig) {
    commands.add("test:model-memory:push");
    return {
      commands: [...commands],
      usesChangedLane,
      fallbackReason:
        "root/config or known slow-shard change; avoiding broad changed-root expansion",
    };
  }

  commands.add("test:changed");
  usesChangedLane = true;
  return { commands: [...commands], usesChangedLane, fallbackReason: "ordinary changed-file lane" };
}

function runCommand(label, command, args) {
  console.error(`[validate:push] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDiffCheck() {
  runCommand("whitespace", "git", ["diff", "--check"]);
}

function runJsonParseIfNeeded(changedFiles) {
  const jsonFiles = changedFiles.filter(
    (filePath) => filePath.endsWith(".json") && existsSync(filePath),
  );
  if (jsonFiles.length === 0) {
    return;
  }
  runCommand("json parse", process.execPath, [
    "-e",
    "const fs=require('node:fs'); for (const file of process.argv.slice(1)) JSON.parse(fs.readFileSync(file, 'utf8'));",
    ...jsonFiles,
  ]);
}

function runChangedOxlint(changedFiles) {
  const lintableFiles = changedFiles.filter(
    (filePath) => existsSync(filePath) && hasExtension(filePath, LINTABLE_EXTENSIONS),
  );
  if (lintableFiles.length === 0) {
    return;
  }
  runPnpmStep(["exec", "oxlint", ...lintableFiles]);
}

function printPlan(changedFiles, domains, selectedTests) {
  const enabledDomains = Object.entries(domains)
    .filter(([, value]) => value)
    .map(([name]) => name);
  const broadSteps = MODE === "fast" ? [] : ["check", "build"];
  console.error(`[validate:push] mode=${MODE}`);
  console.error(`[validate:push] changed files=${changedFiles.length}`);
  console.error(
    `[validate:push] domains=${enabledDomains.length > 0 ? enabledDomains.join(", ") : "none"}`,
  );
  if (selectedTests.fallbackReason) {
    console.error(`[validate:push] selection=${selectedTests.fallbackReason}`);
  }
  console.error(
    `[validate:push] test plan=${selectedTests.commands.map((command) => `pnpm ${command}`).join(" && ")}`,
  );
  console.error(
    `[validate:push] static/build plan=${
      MODE === "fast"
        ? "git diff --check + oxlint/json for changed files"
        : broadSteps.map((step) => `pnpm ${step}`).join(" && ")
    }`,
  );
}

const changedFiles = resolveChangedFiles();
const domains = classifyChangedFiles(changedFiles);
const selectedTests = selectTestCommands(changedFiles, domains);

printPlan(changedFiles, domains, selectedTests);

for (const command of selectedTests.commands) {
  runPnpmStep([command]);
}

if (MODE === "fast") {
  runDiffCheck();
  runJsonParseIfNeeded(changedFiles);
  runChangedOxlint(changedFiles);
} else {
  for (const step of ["check", "build"]) {
    runPnpmStep([step]);
  }
}
