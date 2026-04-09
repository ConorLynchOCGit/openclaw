import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { OpenClawPluginApi, PluginLogger } from "../extensions/memory-middleware/api.js";
import { createMemoryMiddlewareRuntime } from "../extensions/memory-middleware/runtime-api.js";
import {
  runAutomatedRolloutEval,
  seedAutomatedRolloutEvalContext,
  type AutomatedRolloutEvalReport,
} from "../extensions/memory-middleware/src/automated-rollout-eval.js";

type CliOptions = {
  outputPath?: string;
  pretty: boolean;
  keepContainer: boolean;
  rolloutTarget: "off-production" | "production-canary";
};

type DbEnvironment = {
  containerName: string;
  connectionString: string;
};

type CliReport = AutomatedRolloutEvalReport & {
  generatedBy: "scripts/memory-rollout-eval.ts";
  environment: {
    containerName: string;
  };
};

function summarizeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function docker(args: string[]): string {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `docker ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForContainerReady(containerName: string): Promise<void> {
  const timeoutAt = Date.now() + 30_000;

  while (Date.now() < timeoutAt) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres", "-d", "memory_middleware_eval"],
      { stdio: "ignore" },
    );
    if (result.status === 0) {
      return;
    }
    await sleep(500);
  }

  throw new Error(`Postgres container ${containerName} did not become ready in time`);
}

async function applyMigrations(connectionString: string): Promise<void> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const schemaV1MigrationSql = await readFile(
      new URL(
        "../extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const securityRetrievalMigrationSql = await readFile(
      new URL(
        "../extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(schemaV1MigrationSql);
    await client.query(securityRetrievalMigrationSql);
  } finally {
    await client.end();
  }
}

async function startPostgresEvalEnvironment(): Promise<DbEnvironment> {
  const containerName = `memory-rollout-eval-pg-${process.pid}-${Date.now()}`;
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=memory_middleware_eval",
    "-P",
    "pgvector/pgvector:pg16",
  ]);

  try {
    await waitForContainerReady(containerName);
    const hostPort = docker([
      "inspect",
      "--format",
      '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      containerName,
    ]);
    const connectionString = `postgresql://postgres@127.0.0.1:${hostPort}/memory_middleware_eval`;
    await applyMigrations(connectionString);
    return { containerName, connectionString };
  } catch (error) {
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
    throw error;
  }
}

function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: "string" },
      pretty: { type: "boolean", default: true },
      "keep-container": { type: "boolean", default: false },
      "rollout-target": { type: "string" },
    },
    allowPositionals: false,
  });

  const rolloutTarget =
    values["rollout-target"] === "production-canary" ? "production-canary" : "off-production";

  return {
    ...(values.out ? { outputPath: path.resolve(values.out) } : {}),
    pretty: values.pretty ?? true,
    keepContainer: values["keep-container"] ?? false,
    rolloutTarget,
  };
}

function createEvalLogger(): PluginLogger {
  const write = (level: string, value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    process.stderr.write(`[memory-rollout-eval:${level}] ${text}\n`);
  };
  return {
    debug: (value) => write("debug", value),
    info: (value) => write("info", value),
    log: (value) => write("log", value),
    warn: (value) => write("warn", value),
    error: (value) => write("error", value),
  };
}

function createEvalRuntime(
  connectionString: string,
  rolloutTarget: "off-production" | "production-canary",
) {
  const logger = createEvalLogger();
  const api = {
    logger,
    pluginConfig: {
      database: {
        driver: "postgres",
        url: connectionString,
        schema: "memory_middleware",
      },
      candidateIngress: {
        mode: "candidate-only",
      },
      memoryObjectQuery: {
        mode: "candidate-only",
      },
      backgroundJobs: {
        inspectionMode: "disabled",
        advisorySchedulingMode: "disabled",
        executeSchedulingMode: "disabled",
        advisoryJobClasses: ["proactive_plan"],
        executeJobClasses: ["proactive_execute_run_drift_check"],
      },
      autoPromotion: {
        profile: "explicit-user-preference-v1",
        allowedAgents: ["chief", "main"],
      },
      selfImprovingCapture: {
        mode: "candidate-only",
        rolloutTarget,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
      },
      learnedGuidanceAdvisoryPlanning: {
        mode: "inline-only",
        rolloutTarget,
        allowedLessonFamilies: ["generalized_workflow_lesson"],
        defaultMaxSuggestions: 3,
      },
    },
  } as unknown as OpenClawPluginApi;
  return createMemoryMiddlewareRuntime(api);
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const env = await startPostgresEvalEnvironment();
  try {
    const runtime = createEvalRuntime(env.connectionString, opts.rolloutTarget);
    const context = await seedAutomatedRolloutEvalContext({
      connectionString: env.connectionString,
      schema: runtime.config.database.schema,
    });
    const report: CliReport = {
      ...(await runAutomatedRolloutEval({
        runtime,
        connectionString: env.connectionString,
        context,
        schema: runtime.config.database.schema,
      })),
      generatedBy: "scripts/memory-rollout-eval.ts",
      environment: {
        containerName: env.containerName,
      },
    };
    const output = JSON.stringify(report, null, opts.pretty ? 2 : 0);
    if (opts.outputPath) {
      await writeFile(opts.outputPath, `${output}\n`, "utf8");
    }
    process.stdout.write(`${output}\n`);
    if (!report.summary.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (!opts.keepContainer) {
      spawnSync("docker", ["rm", "-f", env.containerName], { stdio: "ignore" });
    }
  }
}

void main().catch((error) => {
  process.stderr.write(`${summarizeError(error)}\n`);
  process.exitCode = 1;
});
