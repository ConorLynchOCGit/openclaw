/**
 * Projects enabled bundle MCP servers into Codex app-server thread config.
 * The projection keeps loopback approval defaults and header env placeholders
 * compatible with Codex's MCP config shape.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeOptionalLowercaseString } from "@openclaw/normalization-core/string-coerce";
import {
  loadEnabledBundleMcpConfig,
  type BundleMcpConfig,
  type BundleMcpServerConfig,
} from "../plugins/bundle-mcp.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { isRecord } from "../utils.js";
import {
  applyCommonServerConfig,
  decodeHeaderEnvPlaceholder,
  normalizeStringRecord,
} from "./cli-runner/bundle-mcp-adapter-shared.js";
import type {
  CodexBundleMcpThreadConfig,
  CodexMcpServersConfig,
  LoadCodexBundleMcpThreadConfigParams,
} from "./codex-mcp-config.types.js";
import { shouldCreateBundleMcpRuntimeForAttempt } from "./embedded-agent-runner/run/attempt-tool-construction-plan.js";

export type {
  CodexBundleMcpThreadConfig,
  CodexMcpServersConfig,
  LoadCodexBundleMcpThreadConfigParams,
} from "./codex-mcp-config.types.js";

function isOpenClawLoopbackMcpServer(name: string, server: BundleMcpServerConfig): boolean {
  return (
    name === "openclaw" &&
    typeof server.url === "string" &&
    /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/mcp(?:[?#].*)?$/.test(server.url)
  );
}

type CodexMcpToolApprovalMode = "auto" | "prompt" | "approve";
const OPENCLAW_CODING_WORKBENCH_MCP_SERVER_NAME = "openclaw_repo_workbench";
const OPENCLAW_CODING_WORKBENCH_PLUGIN_RELATIVE_ROOT = path.join(
  ".agents",
  "plugins",
  "plugins",
  "openclaw-coding-workbench",
);
const OPENCLAW_CODING_WORKBENCH_MCP_RELATIVE_SCRIPT = path.join(
  "mcp",
  "openclaw-repo-workbench.mjs",
);
const OPENCLAW_CODING_WORKBENCH_ENABLED_TOOLS = [
  "repo_search_many",
  "repo_read_many",
  "repo_glob_many",
  "git_inspect_many",
] as const;

const CODEX_MCP_TOOL_APPROVAL_MODES = new Set<CodexMcpToolApprovalMode>([
  "auto",
  "prompt",
  "approve",
]);

function readCodexProjectionConfig(server: BundleMcpServerConfig): Record<string, unknown> {
  return isRecord(server.codex) ? server.codex : {};
}

function normalizeCodexToolApprovalMode(value: unknown): CodexMcpToolApprovalMode | undefined {
  return typeof value === "string" &&
    CODEX_MCP_TOOL_APPROVAL_MODES.has(value as CodexMcpToolApprovalMode)
    ? (value as CodexMcpToolApprovalMode)
    : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function resolveCodexDefaultToolsApprovalMode(
  server: BundleMcpServerConfig,
): CodexMcpToolApprovalMode | undefined {
  const codex = readCodexProjectionConfig(server);
  return (
    normalizeCodexToolApprovalMode(codex.defaultToolsApprovalMode) ??
    normalizeCodexToolApprovalMode(codex.default_tools_approval_mode)
  );
}

/** Normalizes one bundle MCP server into Codex's mcp_servers shape. */
export function normalizeCodexMcpServerConfig(
  name: string,
  server: BundleMcpServerConfig,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  applyCommonServerConfig(next, server);
  const enabledTools = Array.isArray(server.enabled_tools)
    ? server.enabled_tools.filter((value): value is string => typeof value === "string")
    : undefined;
  if (enabledTools && enabledTools.length > 0) {
    next.enabled_tools = enabledTools;
  }
  const startupTimeoutSec = normalizePositiveInteger(server.startup_timeout_sec);
  if (startupTimeoutSec) {
    next.startup_timeout_sec = startupTimeoutSec;
  }
  const toolTimeoutSec = normalizePositiveInteger(server.tool_timeout_sec);
  if (toolTimeoutSec) {
    next.tool_timeout_sec = toolTimeoutSec;
  }
  const defaultToolsApprovalMode = resolveCodexDefaultToolsApprovalMode(server);
  if (defaultToolsApprovalMode) {
    next.default_tools_approval_mode = defaultToolsApprovalMode;
  } else if (isOpenClawLoopbackMcpServer(name, server)) {
    // OpenClaw's loopback MCP exposes local tools; Codex should ask for approval
    // unless plugin metadata explicitly selected another approval mode.
    next.default_tools_approval_mode = "approve";
  }
  const httpHeaders = normalizeStringRecord(server.headers);
  if (httpHeaders) {
    const staticHeaders: Record<string, string> = {};
    const envHeaders: Record<string, string> = {};
    for (const [nameLocal, value] of Object.entries(httpHeaders)) {
      const decoded = decodeHeaderEnvPlaceholder(value);
      if (!decoded) {
        staticHeaders[nameLocal] = value;
        continue;
      }
      if (decoded.bearer && normalizeOptionalLowercaseString(nameLocal) === "authorization") {
        // Codex has a dedicated bearer token env field for Authorization headers.
        next.bearer_token_env_var = decoded.envVar;
        continue;
      }
      envHeaders[nameLocal] = decoded.envVar;
    }
    if (Object.keys(staticHeaders).length > 0) {
      next.http_headers = staticHeaders;
    }
    if (Object.keys(envHeaders).length > 0) {
      next.env_http_headers = envHeaders;
    }
  }
  return next;
}

/** Build Codex `mcp_servers` config from normalized bundle MCP config. */
export function buildCodexMcpServersConfig(config: BundleMcpConfig): CodexMcpServersConfig {
  return Object.fromEntries(
    Object.entries(config.mcpServers).map(([name, server]) => [
      name,
      normalizeCodexMcpServerConfig(name, server),
    ]),
  );
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function fingerprintCodexMcpServersConfig(config: CodexMcpServersConfig): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableJsonValue(config)))
    .digest("hex");
}

function isCodingAgentId(agentId: string | undefined): boolean {
  return agentId ? normalizeAgentId(agentId) === "coding" : false;
}

function resolveCodingWorkbenchPaths(workspaceDir: string):
  | {
      workbenchRoot: string;
      sourceRoot?: string;
      pluginRoot: string;
      mcpScript: string;
    }
  | undefined {
  const workspace = path.resolve(workspaceDir);
  const candidates = [
    {
      workbenchRoot: workspace,
      sourceRoot: workspace,
      pluginRoot: path.join(workspace, OPENCLAW_CODING_WORKBENCH_PLUGIN_RELATIVE_ROOT),
    },
    {
      workbenchRoot: workspace,
      sourceRoot: path.join(workspace, "src", "openclaw"),
      pluginRoot: path.join(
        workspace,
        "src",
        "openclaw",
        OPENCLAW_CODING_WORKBENCH_PLUGIN_RELATIVE_ROOT,
      ),
    },
  ];
  for (const candidate of candidates) {
    const mcpScript = path.join(
      candidate.pluginRoot,
      OPENCLAW_CODING_WORKBENCH_MCP_RELATIVE_SCRIPT,
    );
    const sourceRoot = candidate.sourceRoot;
    if (
      fs.existsSync(path.join(sourceRoot, "openclaw.mjs")) &&
      fs.existsSync(path.join(sourceRoot, "package.json")) &&
      fs.existsSync(path.join(candidate.pluginRoot, ".codex-plugin", "plugin.json")) &&
      fs.existsSync(mcpScript)
    ) {
      return { ...candidate, mcpScript };
    }
  }
  return undefined;
}

function workspaceCodexConfigDeclaresCodingWorkbench(workspaceDir: string): boolean {
  try {
    const config = fs.readFileSync(path.join(workspaceDir, ".codex", "config.toml"), "utf8");
    return /^\s*\[mcp_servers\.openclaw_repo_workbench\]\s*$/mu.test(config);
  } catch {
    return false;
  }
}

function buildCodingWorkbenchMcpServer(
  params: LoadCodexBundleMcpThreadConfigParams,
): BundleMcpServerConfig | undefined {
  if (!isCodingAgentId(params.agentId)) {
    return undefined;
  }
  if (workspaceCodexConfigDeclaresCodingWorkbench(params.workspaceDir)) {
    return undefined;
  }
  const paths = resolveCodingWorkbenchPaths(params.workspaceDir);
  if (!paths) {
    return undefined;
  }
  return {
    command: "node",
    args: [paths.mcpScript],
    cwd: paths.pluginRoot,
    env: {
      OPENCLAW_REPO_WORKBENCH_ROOT: paths.workbenchRoot,
      ...(paths.sourceRoot && paths.sourceRoot !== paths.workbenchRoot
        ? { OPENCLAW_REPO_WORKBENCH_SOURCE_ROOT: paths.sourceRoot }
        : {}),
    },
    codex: {
      defaultToolsApprovalMode: "approve",
    },
    enabled_tools: [...OPENCLAW_CODING_WORKBENCH_ENABLED_TOOLS],
    startup_timeout_sec: 10,
    tool_timeout_sec: 30,
  };
}

/** Load bundle MCP config for one Codex app-server thread. */
export function loadCodexBundleMcpThreadConfig(
  params: LoadCodexBundleMcpThreadConfigParams,
): CodexBundleMcpThreadConfig {
  const codingWorkbenchServer = buildCodingWorkbenchMcpServer(params);
  const shouldCreateRuntime = shouldCreateBundleMcpRuntimeForAttempt({
    toolsEnabled: params.toolsEnabled ?? true,
    disableTools: params.disableTools,
    toolsAllow: params.toolsAllow,
  });
  if (!shouldCreateRuntime && !codingWorkbenchServer) {
    return {
      diagnostics: [],
      evaluated: true,
    };
  }
  const bundleMcp = shouldCreateRuntime
    ? loadEnabledBundleMcpConfig({
        workspaceDir: params.workspaceDir,
        cfg: params.cfg,
      })
    : { config: { mcpServers: {} }, diagnostics: [] };
  const mergedConfig: BundleMcpConfig = {
    mcpServers: {
      ...bundleMcp.config.mcpServers,
      ...(codingWorkbenchServer
        ? { [OPENCLAW_CODING_WORKBENCH_MCP_SERVER_NAME]: codingWorkbenchServer }
        : {}),
    },
  };
  const mcpServers = buildCodexMcpServersConfig(mergedConfig);
  if (Object.keys(mcpServers).length === 0) {
    return {
      diagnostics: bundleMcp.diagnostics,
      evaluated: true,
    };
  }
  return {
    configPatch: {
      mcp_servers: mcpServers,
    },
    diagnostics: bundleMcp.diagnostics,
    evaluated: true,
    fingerprint: fingerprintCodexMcpServersConfig(mcpServers),
  };
}
