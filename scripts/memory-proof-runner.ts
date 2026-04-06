import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { bootstrapMemoryCoreRuntime, type OpenClawConfig } from "openclaw/plugin-sdk/memory-core";
import type { OpenClawPluginApi, PluginLogger } from "../extensions/memory-middleware/api.js";
import { createMemoryMiddlewareRuntime } from "../extensions/memory-middleware/runtime-api.js";
import {
  parseMemoryProofPlan,
  runMemoryProofPlan,
  type MemoryProofRunResult,
} from "../extensions/memory-middleware/src/proof-runner.js";
import { loadRuntimeDotEnvFile } from "../src/infra/dotenv.js";

type CliOptions = {
  planPath: string;
  configPath?: string;
  envFilePath?: string;
  gatewayBaseUrl?: string;
  outputPath?: string;
  pretty: boolean;
};

type MemoryProofCliReport = MemoryProofRunResult & {
  generatedAt: string;
  configPath?: string;
  envFilePath?: string;
  gatewayBaseUrl?: string;
  bootstrap: {
    diagnostics: string[];
    registeredBuiltinProviderIds: string[];
    availableBuiltinProviderIds: string[];
  };
};

function summarizeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      plan: { type: "string" },
      config: { type: "string" },
      "env-file": { type: "string" },
      "gateway-base-url": { type: "string" },
      out: { type: "string" },
      pretty: { type: "boolean", default: true },
    },
    allowPositionals: false,
  });

  const planPath = values.plan?.trim();
  if (!planPath) {
    throw new Error("--plan is required");
  }

  return {
    planPath: path.resolve(planPath),
    ...(values.config ? { configPath: path.resolve(values.config) } : {}),
    ...(values["env-file"] ? { envFilePath: path.resolve(values["env-file"]) } : {}),
    ...(values["gateway-base-url"] ? { gatewayBaseUrl: values["gateway-base-url"] } : {}),
    ...(values.out ? { outputPath: path.resolve(values.out) } : {}),
    pretty: values.pretty ?? true,
  };
}

function createProofLogger(): PluginLogger {
  const write = (level: string, value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    process.stderr.write(`[memory-proof:${level}] ${text}\n`);
  };
  return {
    debug: (value) => write("debug", value),
    info: (value) => write("info", value),
    log: (value) => write("log", value),
    warn: (value) => write("warn", value),
    error: (value) => write("error", value),
  };
}

function resolveMemoryMiddlewarePluginConfig(cfg: OpenClawConfig): Record<string, unknown> {
  const config = cfg.plugins?.entries?.["memory-middleware"]?.config;
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function createProofRuntime(cfg: OpenClawConfig, logger: PluginLogger) {
  // The memory-middleware runtime factory only reads logger + pluginConfig here.
  const api = {
    logger,
    pluginConfig: resolveMemoryMiddlewarePluginConfig(cfg),
  } as unknown as OpenClawPluginApi;
  return createMemoryMiddlewareRuntime(api);
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.envFilePath) {
    loadRuntimeDotEnvFile(opts.envFilePath, { quiet: false });
  }
  if (opts.configPath) {
    process.env.OPENCLAW_CONFIG_PATH = opts.configPath;
  }

  const planRaw = JSON.parse(await fs.readFile(opts.planPath, "utf8")) as unknown;
  const plan = parseMemoryProofPlan(planRaw);
  const bootstrap = await bootstrapMemoryCoreRuntime({
    commandName: "memory proof",
  });
  const logger = createProofLogger();
  const runtime = createProofRuntime(bootstrap.config, logger);
  const result = await runMemoryProofPlan({
    plan,
    cfg: bootstrap.config,
    runtime,
    logger,
    ...(opts.gatewayBaseUrl ? { gatewayBaseUrl: opts.gatewayBaseUrl } : {}),
  });

  const report: MemoryProofCliReport = {
    ...result,
    generatedAt: new Date().toISOString(),
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
    ...(opts.envFilePath ? { envFilePath: opts.envFilePath } : {}),
    ...(opts.gatewayBaseUrl ? { gatewayBaseUrl: opts.gatewayBaseUrl } : {}),
    bootstrap: {
      diagnostics: bootstrap.diagnostics,
      registeredBuiltinProviderIds: bootstrap.registeredBuiltinProviderIds,
      availableBuiltinProviderIds: bootstrap.availableBuiltinProviderIds,
    },
  };
  const output = JSON.stringify(report, null, opts.pretty ? 2 : 0);
  if (opts.outputPath) {
    await fs.writeFile(opts.outputPath, `${output}\n`, "utf8");
  }
  process.stdout.write(`${output}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${summarizeError(error)}\n`);
  process.exitCode = 1;
});
