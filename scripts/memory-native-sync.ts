import { parseArgs } from "node:util";
import { resolveDefaultAgentId } from "openclaw/plugin-sdk/memory-core";
import { syncDailyContinuityFile } from "openclaw/plugin-sdk/memory-core-host-runtime-files";
import type { OpenClawPluginApi, PluginLogger } from "../extensions/memory-middleware/api.js";
import { createMemoryMiddlewareRuntime } from "../extensions/memory-middleware/runtime-api.js";
import { syncAgentBootstrapProjections } from "../extensions/memory-middleware/src/native-memory-projection-agents.js";
import { buildNativeMemoryProjectionAuditReport } from "../extensions/memory-middleware/src/native-memory-projection-audit.js";
import { syncProjectLocalProjections } from "../extensions/memory-middleware/src/native-memory-projection-projects.js";
import { syncSharedBootstrapProjections } from "../extensions/memory-middleware/src/native-memory-projection-shared.js";
import { resolveAgentWorkspaceDir } from "../src/agents/agent-scope.js";
import { readBestEffortConfig } from "../src/config/config.js";

type CliOptions = {
  agentId?: string;
  date?: string;
  write: boolean;
  syncShared: boolean;
  syncProjects: boolean;
  syncAgents: boolean;
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
      "skip-projects": { type: "boolean", default: false },
      "skip-agents": { type: "boolean", default: false },
      "skip-daily": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  return {
    ...(values.agent ? { agentId: values.agent.trim() } : {}),
    ...(values.date ? { date: values.date.trim() } : {}),
    write: values.write ?? false,
    syncShared: !(values["skip-shared"] ?? false),
    syncProjects: !(values["skip-projects"] ?? false),
    syncAgents: !(values["skip-agents"] ?? false),
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

  let projectProjectionState: Awaited<ReturnType<typeof syncProjectLocalProjections>> | undefined;
  let agentProjectionState: Awaited<ReturnType<typeof syncAgentBootstrapProjections>> | undefined;

  if (options.syncProjects) {
    projectProjectionState = await syncProjectLocalProjections({
      db: runtime.db,
      workspaceDir,
      write: options.write,
    });
    report.projects = projectProjectionState;
  }

  if (options.syncShared) {
    report.shared = await syncSharedBootstrapProjections({
      db: runtime.db,
      workspaceDir,
      write: options.write,
      excludeSourceIds: projectProjectionState?.projectedSourceIds,
      extraMemoryDigestItems: projectProjectionState?.pointerItems,
    });
  }

  if (options.syncAgents) {
    agentProjectionState = await syncAgentBootstrapProjections({
      db: runtime.db,
      sharedWorkspaceDir: workspaceDir,
      write: options.write,
    });
    report.agents = agentProjectionState;
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

  const sharedState =
    report.shared &&
    typeof report.shared === "object" &&
    Array.isArray((report.shared as { results?: unknown }).results)
      ? (report.shared as Awaited<ReturnType<typeof syncSharedBootstrapProjections>>)
      : undefined;
  const sharedResults = sharedState?.results ?? [];
  const projectResults = Array.isArray(projectProjectionState?.results)
    ? projectProjectionState.results
    : [];
  const agentResults = Array.isArray(agentProjectionState?.results)
    ? agentProjectionState.results
    : [];
  const skipped = [
    ...(projectProjectionState?.skipped ?? []),
    ...(sharedState?.skipped ?? []),
    ...(agentProjectionState?.skipped ?? []),
  ];
  const audit = buildNativeMemoryProjectionAuditReport({
    shared: sharedResults.map((entry) => ({
      lane: "shared" as const,
      target: entry.target,
      relPath: entry.relPath,
      changed: entry.changed,
      changeKind: entry.changeKind,
      sourceCount: entry.sourceCount,
      selectedCount: entry.selectedCount,
      omittedCount: entry.omittedCount,
      selectedSourceIds: entry.selectedSourceIds,
      omittedSourceIds: entry.omittedSourceIds,
    })),
    projects: projectResults.map((entry) => ({
      lane: "project" as const,
      target: entry.target,
      projectSlug: entry.projectSlug,
      relPath: entry.relPath,
      changed: entry.changed,
      changeKind: entry.changeKind,
      sourceCount: entry.sourceCount,
      selectedCount: entry.selectedCount,
      omittedCount: entry.omittedCount,
      selectedSourceIds: entry.selectedSourceIds,
      omittedSourceIds: entry.omittedSourceIds,
    })),
    agents: agentResults.map((entry) => ({
      lane: "agent" as const,
      target: entry.target,
      agentKey: entry.agentKey,
      workspaceKind: entry.workspaceKind,
      relPath: entry.relPath,
      changed: entry.changed,
      changeKind: entry.changeKind,
      sourceCount: entry.sourceCount,
      selectedCount: entry.selectedCount,
      omittedCount: entry.omittedCount,
      selectedSourceIds: entry.selectedSourceIds,
      omittedSourceIds: entry.omittedSourceIds,
    })),
    skipped,
    unmatched: projectProjectionState?.unmatched ?? [],
  });
  report.audit = audit;
  report.auditSummary = audit.summary;

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
