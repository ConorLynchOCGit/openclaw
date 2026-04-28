#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseArgs(argv) {
  return {
    hookDiscovery: argv.includes("--hook-discovery"),
    hookCanary: argv.includes("--hook-canary"),
    reportFixture: argv.includes("--report-fixture"),
    safeLevel1AutoFix: argv.includes("--safe-level1-autofix"),
    safeLevel1DryRun: argv.includes("--safe-level1-dry-run"),
    safeLevel1Execute: argv.includes("--safe-level1-execute"),
    baseDir: readArgValue(argv, "--base-dir") ?? ".openclaw-memory-ops",
    repoRoot: readArgValue(argv, "--repo-root") ?? getRepoRoot(),
  };
}

function fixtureSignals(api, nowIso) {
  return [
    api.createMemoryOpsSignal({
      signal_id: "fixture-injection-001",
      signal_type: "memory_injection_observed",
      observed_at: nowIso,
      session_id: "fixture-session",
      related_memory_ids: ["mem-active-001", "mem-active-002"],
      severity: "info",
      consumers: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
      payload: {
        injected_memory_statuses: [
          { memory_id: "mem-active-001", status: "active" },
          { memory_id: "mem-active-002", status: "active" },
        ],
        prompt_sha256: "fixture-prompt-hash",
      },
      retention: { policy: "bounded_audit", ttl_seconds: 30 * 24 * 60 * 60 },
      privacy: {
        contains_raw_text: false,
        contains_user_content: false,
        contains_prompt_content: false,
        contains_secret: false,
        redacted: false,
      },
      usage_contract: {
        used_by: ["retrieval_quality", "conflict_resolution", "cron_recommendation"],
        action: "Detect stale or conflicted memory injection and surface operator recommendations.",
      },
    }),
    api.createMemoryOpsSignal({
      signal_id: "fixture-duplicate-001",
      signal_type: "duplicate_hash_observed",
      observed_at: nowIso,
      severity: "warning",
      consumers: ["dedupe", "reconciliation", "cron_recommendation"],
      payload: {
        hash: "fixture-duplicate-hash",
        duplicate_count: 0,
        admitted_count: 1,
      },
      retention: { policy: "aggregate_only", ttl_seconds: 30 * 24 * 60 * 60 },
      privacy: {
        contains_raw_text: false,
        contains_user_content: false,
        contains_prompt_content: false,
        contains_secret: false,
        redacted: false,
      },
      usage_contract: {
        used_by: ["dedupe", "reconciliation", "cron_recommendation"],
        action: "Detect duplicate writes and recommend dedupe/reconciliation tuning.",
      },
    }),
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.hookDiscovery && !args.reportFixture) {
    args.hookDiscovery = true;
    args.reportFixture = true;
  }

  const api = await tsImport(
    path.join(args.repoRoot, "extensions/model-memory/src/ops-closed-loop/index.ts"),
    import.meta.url,
  );
  const config = { baseDir: args.baseDir };
  const nowIso = new Date().toISOString();
  const output = {};

  let discovery = null;
  if (args.hookDiscovery || args.hookCanary) {
    discovery = await api.discoverMemoryOpsHooksFromRepo({
      repoRoot: args.repoRoot,
      createdAt: nowIso,
    });
    if (args.hookCanary) {
      discovery = await api.runSafeHookFiringCanaries({
        artifact: discovery,
        repoRoot: args.repoRoot,
      });
    }
    discovery = await api.mergeProductionHookProbeEvidence({
      artifact: discovery,
      config,
    });
    output.hookDiscoveryPath = await api.writeHookDiscoveryArtifact({
      artifact: discovery,
      config,
    });
    output.hookDiscoverySummary = api.summarizeHookDiscovery(discovery);
  }

  if (args.reportFixture) {
    const sink = new api.JsonlMemoryOpsSink(config);
    const signals = fixtureSignals(api, nowIso);
    for (const signal of signals) {
      await sink.appendSignal(signal);
    }
    const recommendations = [
      ...api.buildRecommendationsFromSignals({ signals, nowIso }),
      ...(discovery ? api.buildHookHealthRecommendations({ discovery, nowIso }) : []),
    ];
    for (const recommendation of recommendations) {
      await sink.appendRecommendation(recommendation);
    }
    const report = await api.writeMemoryOpsHealthReport({
      signals,
      recommendations,
      generatedAt: nowIso,
      sourceLabel: "fixture-safe-observe-only",
      config,
    });
    output.signalPath = sink.signalPathForDay(nowIso.slice(0, 10));
    output.recommendationPath = sink.recommendationPathForDay(nowIso.slice(0, 10));
    output.reportPath = report.reportPath;
    output.latestReportPath = report.latestPath;
  }

  if (args.safeLevel1AutoFix || args.safeLevel1DryRun || args.safeLevel1Execute) {
    const plan = api.buildSafeLevel1AutoFixPlan({
      captureJobs: [
        { jobId: "fixture-timeout-job", status: "failed", failureClass: "timeout" },
        { jobId: "fixture-privacy-job", status: "failed", failureClass: "privacy_no_store" },
      ],
      runtimeDirtyStates: [{ dirtyId: "fixture-dirty-state", status: "dirty" }],
      projections: [
        {
          projectionId: "fixture-stale-projection",
          freshnessStatus: "stale",
          staleMarkers: ["source_hash_changed"],
          hashValid: true,
          activeSourceMemoryIdsValid: true,
        },
        {
          projectionId: "fixture-invalid-projection",
          freshnessStatus: "fresh",
          hashValid: false,
          activeSourceMemoryIdsValid: true,
        },
      ],
      providerRoutes: [
        {
          routeId: "fixture-failover-safe-route",
          failoverSafe: true,
          schemaSuccessRate: 0.5,
        },
      ],
      runtimeStateJsonlPaths: ["model-memory/capture-jobs/events.jsonl"],
      semanticTruthTouchRequested: [
        {
          ticketId: "fixture-semantic-truth-ticket",
          reason: "operator approval required for semantic truth mutation",
        },
      ],
    });
    const fs = await import("node:fs/promises");
    const planDir = path.join(args.baseDir, "auto-fix");
    await fs.mkdir(planDir, { recursive: true });
    const planPath = path.join(planDir, "safe-level1-plan.json");
    await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    output.safeLevel1AutoFixPlanPath = planPath;
    if (args.safeLevel1DryRun || args.safeLevel1Execute) {
      const execution = await api.executeSafeLevel1AutoFixPlan({
        plan,
        baseDir: args.baseDir,
        mode: args.safeLevel1Execute ? "execute" : "dry_run",
        enabled: true,
      });
      output.safeLevel1AutoFixExecutionPath = path.join(
        args.baseDir,
        "auto-fix/safe-level1-execution.json",
      );
      output.safeLevel1AutoFixExecuted = execution.executed_count;
      output.safeLevel1AutoFixDryRun = execution.dry_run_count;
      output.safeLevel1AutoFixSkipped = execution.skipped_count;
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
