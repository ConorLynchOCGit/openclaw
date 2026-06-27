// Codex app-server readiness checks shared by `/codex doctor` and OpenClaw doctor.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveCodexAppServerRuntimeOptions,
  type CodexAppServerRuntimeOptions,
} from "./config.js";
import {
  inspectManagedCodexAppServerRuntime,
  resolveManagedCodexAppServerStartOptions,
  type ManagedCodexAppServerRuntimeInspection,
} from "./managed-binary.js";

const CODEX_READINESS_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export type CodexReadinessStatus = "ready" | "warning" | "error";

export type CodexReadinessCheck = {
  id: string;
  status: CodexReadinessStatus;
  message: string;
  path?: string;
};

export type CodexRuntimeReadinessReport = {
  ok: boolean;
  pluginRoot: string;
  start: {
    transport: CodexAppServerRuntimeOptions["start"]["transport"];
    command: string;
    commandSource: string;
    args: string[];
  };
  appServer: {
    requestTimeoutMs: number;
    turnCompletionIdleTimeoutMs: number;
    postToolRawAssistantCompletionIdleTimeoutMs?: number;
    sandbox: CodexAppServerRuntimeOptions["sandbox"];
    approvalsReviewer: CodexAppServerRuntimeOptions["approvalsReviewer"];
    approvalPolicySource?: CodexAppServerRuntimeOptions["approvalPolicySource"];
  };
  managedRuntime?: ManagedCodexAppServerRuntimeInspection;
  checks: CodexReadinessCheck[];
};

export type CodexRuntimeReadinessOptions = {
  pluginConfig?: unknown;
  config?: NonNullable<Parameters<typeof resolveCodexAppServerRuntimeOptions>[0]>["config"];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  pluginRoot?: string;
  platform?: NodeJS.Platform;
  pathExists?: (filePath: string, platform: NodeJS.Platform) => Promise<boolean>;
};

export function resolveCodexPluginRootForReadiness(moduleDir = CODEX_READINESS_MODULE_DIR): string {
  const parent = path.dirname(moduleDir);
  const parentBaseName = path.basename(parent);
  if (path.basename(moduleDir) === "codex" && parentBaseName === "extensions") {
    return moduleDir;
  }
  if (path.basename(moduleDir) === "src") {
    return parent;
  }
  if (parentBaseName === "src") {
    const grandParent = path.dirname(parent);
    const grandParentBaseName = path.basename(grandParent);
    if (grandParentBaseName === "dist" || grandParentBaseName === "dist-runtime") {
      return path.dirname(grandParent);
    }
    return grandParent;
  }
  if (parentBaseName === "dist" || parentBaseName === "dist-runtime") {
    return path.dirname(parent);
  }
  return path.resolve(moduleDir, "..", "..");
}

export async function buildCodexRuntimeReadinessReport(
  options: CodexRuntimeReadinessOptions = {},
): Promise<CodexRuntimeReadinessReport> {
  const pluginRoot = options.pluginRoot ?? resolveCodexPluginRootForReadiness();
  const checks: CodexReadinessCheck[] = [];
  let runtimeOptions: CodexAppServerRuntimeOptions;
  try {
    runtimeOptions = resolveCodexAppServerRuntimeOptions({
      pluginConfig: options.pluginConfig,
      config: options.config,
      env: options.env,
    });
    checks.push({
      id: "codex.app_server.config",
      status: "ready",
      message: "Codex app-server config resolved.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      pluginRoot,
      start: {
        transport: "stdio",
        command: "codex",
        commandSource: "unresolved",
        args: [],
      },
      appServer: {
        requestTimeoutMs: 0,
        turnCompletionIdleTimeoutMs: 0,
        sandbox: "workspace-write",
        approvalsReviewer: "user",
      },
      checks: [
        {
          id: "codex.app_server.config",
          status: "error",
          message,
          path: "plugins.entries.codex.config.appServer",
        },
      ],
    };
  }

  let resolvedStart = runtimeOptions.start;
  let managedRuntime: ManagedCodexAppServerRuntimeInspection | undefined;
  if (
    runtimeOptions.start.transport === "stdio" &&
    runtimeOptions.start.commandSource === "managed"
  ) {
    managedRuntime = await inspectManagedCodexAppServerRuntime({
      pluginRoot,
      platform: options.platform,
      pathExists: options.pathExists,
    });
    if (managedRuntime.ok) {
      resolvedStart = await resolveManagedCodexAppServerStartOptions(runtimeOptions.start, {
        pluginRoot,
        platform: options.platform,
        pathExists: options.pathExists,
      });
      checks.push({
        id: "codex.app_server.managed_runtime",
        status: "ready",
        message: `Managed Codex app-server runtime resolved at ${resolvedStart.command}.`,
      });
    } else {
      checks.push({
        id: "codex.app_server.managed_runtime",
        status: "error",
        message:
          managedRuntime.error ??
          "Managed Codex app-server runtime dependency is missing or incomplete.",
      });
    }
  } else if (
    runtimeOptions.start.commandSource === "config" ||
    runtimeOptions.start.commandSource === "env"
  ) {
    checks.push({
      id: "codex.app_server.command_override",
      status: "warning",
      message:
        "Codex app-server is using an explicit operator command override; this is an escape hatch, not normal bundled runtime wiring.",
      path:
        runtimeOptions.start.commandSource === "config"
          ? "plugins.entries.codex.config.appServer.command"
          : "OPENCLAW_CODEX_APP_SERVER_BIN",
    });
  } else if (runtimeOptions.start.transport === "websocket") {
    checks.push({
      id: "codex.app_server.websocket",
      status: "warning",
      message:
        "Codex app-server is configured for websocket transport; bundled managed binary readiness does not apply.",
      path: "plugins.entries.codex.config.appServer.transport",
    });
  }

  checks.push({
    id: "codex.app_server.policy",
    status: "ready",
    message: `Codex app-server policy resolved with sandbox=${runtimeOptions.sandbox}, approvalsReviewer=${runtimeOptions.approvalsReviewer}.`,
  });

  return {
    ok: checks.every((check) => check.status !== "error"),
    pluginRoot,
    start: {
      transport: resolvedStart.transport,
      command: resolvedStart.command,
      commandSource: resolvedStart.commandSource ?? "unknown",
      args: resolvedStart.args,
    },
    appServer: {
      requestTimeoutMs: runtimeOptions.requestTimeoutMs,
      turnCompletionIdleTimeoutMs: runtimeOptions.turnCompletionIdleTimeoutMs,
      ...(runtimeOptions.postToolRawAssistantCompletionIdleTimeoutMs !== undefined
        ? {
            postToolRawAssistantCompletionIdleTimeoutMs:
              runtimeOptions.postToolRawAssistantCompletionIdleTimeoutMs,
          }
        : {}),
      sandbox: runtimeOptions.sandbox,
      approvalsReviewer: runtimeOptions.approvalsReviewer,
      ...(runtimeOptions.approvalPolicySource
        ? { approvalPolicySource: runtimeOptions.approvalPolicySource }
        : {}),
    },
    ...(managedRuntime ? { managedRuntime } : {}),
    checks,
  };
}

export function formatCodexRuntimeReadinessReport(report: CodexRuntimeReadinessReport): string {
  const lines = [
    `Codex doctor: ${report.ok ? "ready" : "not ready"}`,
    `Plugin root: ${report.pluginRoot}`,
    `App-server: ${report.start.transport} ${report.start.commandSource} ${report.start.command}`,
    `Policy: sandbox=${report.appServer.sandbox}, approvalsReviewer=${report.appServer.approvalsReviewer}`,
    "",
    "Checks:",
  ];
  for (const check of report.checks) {
    const prefix = check.status === "ready" ? "OK" : check.status.toUpperCase();
    lines.push(`- ${prefix} ${check.id}: ${check.message}`);
  }
  return lines.join("\n");
}
