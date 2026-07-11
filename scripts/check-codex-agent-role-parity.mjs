#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REQUIRED_AGENT_IDS = [
  "project_explorer",
  "implementation_planner",
  "implementer",
  "test_engineer",
  "native_fit_reviewer",
  "architect_reviewer",
  "code_reviewer",
  "creative_quality_reviewer",
  "docs_researcher",
  "codex_reviewer",
];

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const repoRoot = process.cwd();
const configPath = path.join(repoRoot, ".codex", "config.toml");
const agentsDir = path.join(repoRoot, ".codex", "agents");
const registryPath = path.join(repoRoot, ".agents", "codex-agents.json");

const errors = [];
const warnings = [];

const config = readCodexConfig(configPath);
const agents = readCodexAgents(agentsDir);
const registry = readRegistry(registryPath);
const registryAgents = Array.isArray(registry?.agents) ? registry.agents : [];
const registryIds = new Set(
  registryAgents
    .map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
    .filter(Boolean),
);
const agentIds = new Set(agents.map((agent) => agent.id));

if (!config.present) {
  errors.push(`Missing ${repoPath(configPath)}.`);
}
if (!config.multiAgentV2) {
  errors.push(".codex/config.toml must enable [features.multi_agent_v2] enabled = true.");
}
if (
  config.maxConcurrentThreadsPerSession === undefined ||
  config.maxConcurrentThreadsPerSession < 2
) {
  errors.push(
    ".codex/config.toml must set [features.multi_agent_v2] max_concurrent_threads_per_session >= 2.",
  );
}
if (config.hideSpawnAgentMetadata !== false) {
  errors.push(".codex/config.toml must expose v2 purpose-role metadata.");
}
if (!config.nonCodeModeOnly) {
  errors.push(
    ".codex/config.toml must expose v2 collaboration directly to the model, outside Code Mode.",
  );
}
if (config.toolNamespace !== "agents") {
  errors.push('.codex/config.toml must use the non-reserved v2 tool namespace "agents".');
}
if (
  config.legacyMultiAgent !== undefined ||
  config.legacyMaxThreads !== undefined ||
  config.legacyMaxDepth !== undefined
) {
  errors.push(".codex/config.toml must not mix legacy v1 multi-agent keys into the v2 contract.");
}

if (!fs.existsSync(agentsDir)) {
  errors.push(`Missing ${repoPath(agentsDir)}.`);
}
for (const requiredId of REQUIRED_AGENT_IDS) {
  if (!agentIds.has(requiredId)) {
    errors.push(`Missing Codex custom agent ${requiredId}.`);
  }
  if (!registryIds.has(requiredId)) {
    errors.push(`Missing ${requiredId} from .agents/codex-agents.json.`);
  }
}

for (const agent of agents) {
  if (agent.id !== agent.fileId) {
    errors.push(
      `${repoPath(agent.path)} name (${agent.id}) must match file basename (${agent.fileId}).`,
    );
  }
  if (agent.fileId.includes("-")) {
    errors.push(`${repoPath(agent.path)} must use underscore agent id naming, not hyphen naming.`);
  }
}

for (const entry of registryAgents) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  const tomlPath = typeof entry?.tomlPath === "string" ? entry.tomlPath.trim() : "";
  if (!id) {
    errors.push(".agents/codex-agents.json contains an agent entry without id.");
    continue;
  }
  if (!agentIds.has(id)) {
    errors.push(`.agents/codex-agents.json references ${id}, but no matching .codex agent exists.`);
  }
  if (!tomlPath) {
    errors.push(`.agents/codex-agents.json entry ${id} is missing tomlPath.`);
  } else if (!fs.existsSync(path.join(repoRoot, tomlPath))) {
    errors.push(`.agents/codex-agents.json entry ${id} points to missing ${tomlPath}.`);
  }
}

const registryRuntime =
  registry?.runtime && typeof registry.runtime === "object" ? registry.runtime : {};
if (registryRuntime.multiAgentVersion !== "v2") {
  errors.push('.agents/codex-agents.json runtime.multiAgentVersion must be "v2".');
}
if (
  registryRuntime.maxConcurrentThreadsPerSession !== undefined &&
  registryRuntime.maxConcurrentThreadsPerSession !== config.maxConcurrentThreadsPerSession
) {
  errors.push(
    ".agents/codex-agents.json runtime.maxConcurrentThreadsPerSession diverges from .codex/config.toml.",
  );
}
if (
  registryRuntime.toolNamespace !== undefined &&
  registryRuntime.toolNamespace !== config.toolNamespace
) {
  errors.push(".agents/codex-agents.json runtime.toolNamespace diverges from .codex/config.toml.");
}

for (const file of agents.map((agent) => path.basename(agent.path))) {
  if (!file.endsWith(".toml")) {
    warnings.push(`Ignoring non-TOML Codex agent file ${file}.`);
  }
}

const report = {
  ok: errors.length === 0,
  repoRoot,
  config,
  requiredAgentIds: REQUIRED_AGENT_IDS,
  agentIds: [...agentIds].sort((left, right) => left.localeCompare(right)),
  registryAgentIds: [...registryIds].sort((left, right) => left.localeCompare(right)),
  errors,
  warnings,
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (report.ok) {
  process.stdout.write(
    `Codex agent role parity OK (${report.agentIds.length} agents, v2 concurrency=${config.maxConcurrentThreadsPerSession}, namespace=${config.toolNamespace}).\n`,
  );
} else {
  process.stderr.write(
    `Codex agent role parity failed:\n${errors.map((err) => `- ${err}`).join("\n")}\n`,
  );
}

process.exit(report.ok ? 0 : 1);

function readCodexConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return { present: false };
  }
  const content = fs.readFileSync(filePath, "utf8");
  return {
    present: true,
    multiAgentV2: readTomlBoolean(content, "features.multi_agent_v2", "enabled"),
    maxConcurrentThreadsPerSession: readTomlNumber(
      content,
      "features.multi_agent_v2",
      "max_concurrent_threads_per_session",
    ),
    hideSpawnAgentMetadata: readTomlBoolean(
      content,
      "features.multi_agent_v2",
      "hide_spawn_agent_metadata",
    ),
    nonCodeModeOnly: readTomlBoolean(content, "features.multi_agent_v2", "non_code_mode_only"),
    toolNamespace: readTomlStringInSection(content, "features.multi_agent_v2", "tool_namespace"),
    legacyMultiAgent: readTomlBoolean(content, "features", "multi_agent"),
    legacyMaxThreads: readTomlNumber(content, "agents", "max_threads"),
    legacyMaxDepth: readTomlNumber(content, "agents", "max_depth"),
  };
}

function readCodexAgents(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      const content = fs.readFileSync(filePath, "utf8");
      const fileId = entry.name.replace(/\.toml$/u, "");
      return {
        id: readTomlString(content, "name") ?? fileId,
        fileId,
        path: filePath,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readRegistry(filePath) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing ${repoPath(filePath)}.`);
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`Failed to parse ${repoPath(filePath)}: ${formatError(error)}`);
    return undefined;
  }
}

function readTomlBoolean(content, section, key) {
  const value = readTomlScalar(content, section, key);
  return value === "true" ? true : value === "false" ? false : undefined;
}

function readTomlNumber(content, section, key) {
  const value = readTomlScalar(content, section, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readTomlString(content, key) {
  const match = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "mu").exec(content);
  return match?.[1]?.trim() || undefined;
}

function readTomlStringInSection(content, section, key) {
  return readTomlScalar(content, section, key);
}

function readTomlScalar(content, section, key) {
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*([^\\s#]+)`, "u");
  let inSection = false;
  for (const line of content.split(/\r?\n/u)) {
    const sectionMatch = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
    if (sectionMatch) {
      inSection = sectionMatch[1]?.trim() === section;
      continue;
    }
    if (!inSection) {
      continue;
    }
    const keyMatch = keyPattern.exec(line);
    const value = keyMatch?.[1]?.trim();
    if (value) {
      return value.replace(/^"|"$/gu, "");
    }
  }
  return undefined;
}

function repoPath(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
