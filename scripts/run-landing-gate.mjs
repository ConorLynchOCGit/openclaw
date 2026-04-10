#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { writeGateMetricArtifact } from "./lib/gate-metrics.mjs";

const GATE_PLANS = {
  feature: [["pnpm", ["check:fast"]]],
  integration: [
    ["pnpm", ["check"]],
    ["pnpm", ["test"]],
  ],
  production: [
    ["pnpm", ["check"]],
    ["pnpm", ["test"]],
    ["pnpm", ["build"]],
  ],
};

export function resolveLandingGatePlan(tier) {
  const normalizedTier = String(tier ?? "")
    .trim()
    .toLowerCase();
  const plan = GATE_PLANS[normalizedTier];
  if (!plan) {
    throw new Error("usage: node scripts/run-landing-gate.mjs <feature|integration|production>");
  }
  return {
    tier: normalizedTier,
    steps: plan.map(([command, args]) => ({ command, args })),
  };
}

async function runStep(command, args) {
  const startedAtMs = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${String(code)}`}`,
        ),
      );
    });
  });
  return {
    command,
    args,
    elapsedMs: Date.now() - startedAtMs,
  };
}

async function main() {
  const startedAtMs = Date.now();
  const { tier, steps } = resolveLandingGatePlan(process.argv[2]);
  let status = "failed";
  let failureMessage = null;
  const results = [];

  try {
    for (const step of steps) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await runStep(step.command, step.args));
    }
    status = "success";
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const finishedAtMs = Date.now();
    writeGateMetricArtifact(
      "landing-gate",
      {
        tier,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        elapsedMs: finishedAtMs - startedAtMs,
        status,
        steps: results,
        ...(failureMessage ? { failureMessage } : {}),
      },
      {
        latestKey: `landing-gate-${tier}`,
        historyKey: `landing-gate-${tier}`,
      },
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
