#!/usr/bin/env node

// Extracts timing and cost/usage labels from existing JSON artifacts only.
import fs from "node:fs";

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      numberOrNull(value.total) ?? numberOrNull(value.durationMs) ?? numberOrNull(value.elapsedMs)
    );
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function hasOwn(object, key) {
  return Boolean(object && typeof object === "object" && Object.hasOwn(object, key));
}

export function classifyCostLabel(artifact) {
  if (
    hasOwn(artifact, "cost") ||
    hasOwn(artifact, "costUsd") ||
    hasOwn(artifact, "costUSD") ||
    hasOwn(artifact?.usage, "costUsd")
  ) {
    return "cost-present";
  }
  if (hasOwn(artifact, "usage") || hasOwn(artifact, "usageSnapshots")) {
    return "usage-present";
  }
  if (
    hasOwn(artifact, "tokenUsage") ||
    hasOwn(artifact, "tokens") ||
    hasOwn(artifact?.usage, "tokens")
  ) {
    return "token-usage-present";
  }
  return "cost-not-recorded";
}

export function summarizeArtifact(artifact, artifactPath = null) {
  const checks = Array.isArray(artifact?.timingsMs?.checks) ? artifact.timingsMs.checks : [];
  const slowestChecks = checks
    .filter((check) => check && typeof check === "object")
    .map((check) => ({
      id: String(check.id ?? "unknown"),
      durationMs: numberOrNull(check.durationMs),
      status: check.status ?? null,
      exitCode: numberOrNull(check.exitCode),
    }))
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, 5);

  return {
    path: artifactPath,
    action: artifact?.action ?? null,
    schema: artifact?.schema ?? null,
    status: artifact?.status ?? artifact?.conclusion ?? null,
    durationMs: firstNumber(
      artifact?.timingsMs?.total,
      artifact?.timingsMs?.build,
      artifact?.durationMs,
      artifact?.timingMs,
    ),
    costLabel: classifyCostLabel(artifact),
    slowestChecks,
    authority:
      "after-action extraction from supplied artifact JSON only; no telemetry store or runtime truth",
  };
}

export function summarizeArtifactFiles(paths) {
  return paths.map((artifactPath) => {
    const raw = fs.readFileSync(artifactPath, "utf8");
    return summarizeArtifact(JSON.parse(raw), artifactPath);
  });
}

function parseArgs(argv) {
  const json = argv.includes("--json");
  const paths = argv.filter((arg) => arg !== "--json");
  return { json, paths };
}

function main() {
  const { json, paths } = parseArgs(process.argv.slice(2));
  if (paths.length === 0) {
    throw new Error("usage: after-action-artifact-summary.mjs [--json] <artifact.json>...");
  }
  const summaries = summarizeArtifactFiles(paths);
  if (json) {
    process.stdout.write(`${JSON.stringify({ artifacts: summaries }, null, 2)}\n`);
    return;
  }
  for (const summary of summaries) {
    const duration =
      summary.durationMs === null ? "duration=unknown" : `duration=${summary.durationMs}ms`;
    process.stdout.write(
      `${summary.path}: ${summary.action ?? summary.schema ?? "artifact"} ${duration} cost=${summary.costLabel}\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
