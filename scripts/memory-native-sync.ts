import { parseArgs } from "node:util";
import { resolveDefaultAgentId } from "openclaw/plugin-sdk/memory-core";
import { syncDailyContinuityFile } from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import type { OpenClawPluginApi, PluginLogger } from "../extensions/memory-middleware/api.js";
import { createMemoryMiddlewareRuntime } from "../extensions/memory-middleware/runtime-api.js";
import { syncSharedBootstrapProjections } from "../extensions/memory-middleware/src/native-memory-projection-shared.js";
import { resolveAgentWorkspaceDir } from "../src/agents/agent-scope.js";
import { readBestEffortConfig } from "../src/config/config.js";

type CliOptions = {
  agentId?: string;
  date?: string;
  write: boolean;
  syncShared: boolean;
  syncDaily: boolean;
};

function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      date: { type: "string" },
      write: { type: "boolean", default: false },
      "skip-shared": { type: "boolean", default: false },
      "skip-daily": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  return {
    ...(values.agent ? { agentId: values.agent.trim() } : {}),
    ...(values.date ? { date: values.date.trim() } : {}),
    write: values.write ?? false,
    syncShared: !(values["skip-shared"] ?? false),
    syncDaily: !(values["skip-daily"] ?? false),
  };
}

function createLogger(): PluginLogger {
  const write = (level: string, value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    process.stderr.write(`[memory-native-sync:${level}] ${text}\n`);
  };
  return {
    debug: (value) => write("debug", value),
    info: (value) => write("info", value),
    log: (value) => write("log", value),
    warn: (value) => write("warn", value),
    error: (value) => write("error", value),
  };
}

function resolveMemoryMiddlewarePluginConfig(
  cfg: Record<string, unknown>,
): Record<string, unknown> {
  const entries = (cfg.plugins as { entries?: Record<string, { config?: unknown }> } | undefined)
    ?.entries;
  const config = entries?.["memory-middleware"]?.config;
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const config = await readBestEffortConfig();
  const logger = createLogger();
  const runtime = createMemoryMiddlewareRuntime({
    logger,
    pluginConfig: resolveMemoryMiddlewarePluginConfig(config as Record<string, unknown>),
  } as OpenClawPluginApi);
  const agentId = options.agentId ?? resolveDefaultAgentId(config);
  const workspaceDir = resolveAgentWorkspaceDir(config, agentId);
  if (!workspaceDir) {
    throw new Error(`Could not resolve workspace for agent ${agentId}`);
  }

  const generatedAt = new Date().toISOString();
  const report: Record<string, unknown> = {
    agentId,
    workspaceDir,
    generatedAt,
    write: options.write,
  };

  if (options.syncShared) {
    report.shared = await syncSharedBootstrapProjections({
      db: runtime.db,
      workspaceDir,
      write: options.write,
    });
  }

  if (options.syncDaily) {
    const date = options.date ?? generatedAt.split("T")[0];
    report.daily = await syncDailyContinuityFile({
      workspaceDir,
      date,
      generatedAt,
      write: options.write,
    });
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
