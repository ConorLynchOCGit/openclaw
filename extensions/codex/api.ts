// Public Codex plugin health surface loaded by OpenClaw bundled doctor checks.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HealthCheck, HealthFinding, registerHealthCheck } from "openclaw/plugin-sdk/health";
import { buildCodexRuntimeReadinessReport } from "./src/app-server/readiness.js";

type CodexDoctorRegistrationHost = {
  readonly registerHealthCheck: typeof registerHealthCheck;
};

let registered = false;
const CODEX_PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));

function readCodexPluginConfig(cfg: unknown): unknown {
  if (!cfg || typeof cfg !== "object") {
    return undefined;
  }
  const plugins = (cfg as { plugins?: unknown }).plugins;
  if (!plugins || typeof plugins !== "object") {
    return undefined;
  }
  const entries = (plugins as { entries?: unknown }).entries;
  if (!entries || typeof entries !== "object") {
    return undefined;
  }
  const codex = (entries as { codex?: unknown }).codex;
  if (!codex || typeof codex !== "object") {
    return undefined;
  }
  return (codex as { config?: unknown }).config;
}

function readinessStatusToSeverity(
  status: "ready" | "warning" | "error",
): HealthFinding["severity"] {
  return status === "error" ? "error" : status === "warning" ? "warning" : "info";
}

const codexAppServerRuntimeCheck: HealthCheck = {
  id: "codex/doctor/app-server-runtime",
  kind: "plugin",
  description: "Codex bundled app-server runtime dependency and startup policy are ready.",
  source: "codex",
  async detect(ctx) {
    const report = await buildCodexRuntimeReadinessReport({
      pluginRoot: ctx.plugin?.id === "codex" ? ctx.plugin.rootDir : CODEX_PLUGIN_ROOT,
      pluginConfig: readCodexPluginConfig(ctx.cfg),
      config: ctx.cfg,
      cwd: ctx.cwd,
    });
    return report.checks
      .filter((check) => check.status !== "ready")
      .map(
        (check): HealthFinding => ({
          checkId: "codex/doctor/app-server-runtime",
          severity: readinessStatusToSeverity(check.status),
          message: check.message,
          path: check.path ?? "plugins.entries.codex.config.appServer",
          source: check.id,
          fixHint:
            check.status === "error"
              ? "Rebuild OpenClaw with the bundled Codex runtime dependency, or configure an explicit operator override only as a temporary escape hatch."
              : "Use the managed bundled Codex app-server path for normal deployments.",
        }),
      );
  },
};

export function registerCodexDoctorChecks(host: CodexDoctorRegistrationHost): void {
  if (registered) {
    return;
  }
  registered = true;
  host.registerHealthCheck(codexAppServerRuntimeCheck);
}
