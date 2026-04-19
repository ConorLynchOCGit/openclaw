import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, "docs/agents/registry.yaml");

const requiredHeadingMap = new Map([
  [
    "Identity.md",
    [
      "## Mission",
      "## Optimize For",
      "## In Bounds",
      "## Out Of Bounds",
      "## Escalation",
      "## Quality Bar",
    ],
  ],
  ["Startup.md", ["## Required Context", "## First Reads", "## Stop Conditions"]],
  ["Tools.md", ["## Preferred Tools", "## Constraints"]],
  ["Permissions.md", ["## Allowed", "## Escalate", "## Forbidden"]],
  ["Skills.md", ["## Required Skills", "## Optional Skills"]],
  ["Status.md", ["## Maturity", "## Gaps", "## Follow-Up"]],
]);

function fail(message) {
  console.error(`check-agent-packs: ${message}`);
  process.exitCode = 1;
}

function assertFileExists(relativePath, label) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${label} missing at ${relativePath}`);
    return false;
  }
  return true;
}

if (!fs.existsSync(registryPath)) {
  fail("missing docs/agents/registry.yaml");
  process.exit(process.exitCode ?? 1);
}

const registry = YAML.parse(fs.readFileSync(registryPath, "utf8"));
const requiredPackFiles = Array.isArray(registry?.requiredPackFiles)
  ? registry.requiredPackFiles
  : [];
const agents = Array.isArray(registry?.agents) ? registry.agents : [];

if (requiredPackFiles.length === 0) {
  fail("registry missing requiredPackFiles");
}
if (agents.length === 0) {
  fail("registry has no agents");
}

const seenIds = new Set();

for (const agent of agents) {
  const agentId = typeof agent?.id === "string" ? agent.id : "";
  if (!agentId) {
    fail("agent entry missing id");
    continue;
  }
  if (seenIds.has(agentId)) {
    fail(`duplicate agent id ${agentId}`);
    continue;
  }
  seenIds.add(agentId);

  const durablePath = typeof agent?.durablePath === "string" ? agent.durablePath : "";
  if (!durablePath) {
    fail(`agent ${agentId} missing durablePath`);
    continue;
  }
  const durableAbsolutePath = path.join(repoRoot, durablePath);
  if (!fs.existsSync(durableAbsolutePath)) {
    fail(`agent ${agentId} durable path missing at ${durablePath}`);
    continue;
  }
  if (path.basename(durableAbsolutePath) !== agentId) {
    fail(`agent ${agentId} durable path basename does not match id: ${durablePath}`);
  }

  const hasRuntimeSourcePath = typeof agent?.runtimeSourcePath === "string";
  const hasSharedRuntimeSourcePath = typeof agent?.sharedRuntimeSourcePath === "string";
  if (!hasRuntimeSourcePath && !hasSharedRuntimeSourcePath) {
    fail(`agent ${agentId} missing runtimeSourcePath/sharedRuntimeSourcePath`);
  }
  if (hasRuntimeSourcePath) {
    assertFileExists(agent.runtimeSourcePath, `agent ${agentId} runtimeSourcePath`);
  }
  if (hasSharedRuntimeSourcePath) {
    assertFileExists(agent.sharedRuntimeSourcePath, `agent ${agentId} sharedRuntimeSourcePath`);
  }

  if (typeof agent?.runtimeSurfacePath !== "string" || agent.runtimeSurfacePath.length === 0) {
    fail(`agent ${agentId} missing runtimeSurfacePath`);
  }

  for (const relativeFile of requiredPackFiles) {
    const relativePath = path.join(durablePath, relativeFile);
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`agent ${agentId} missing required pack file ${relativePath}`);
      continue;
    }
    const headings = requiredHeadingMap.get(relativeFile);
    if (!headings) {
      continue;
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    for (const heading of headings) {
      if (!content.includes(heading)) {
        fail(`agent ${agentId} file ${relativePath} missing required heading ${heading}`);
      }
    }
  }

  const computedComplete = requiredPackFiles.every((relativeFile) =>
    fs.existsSync(path.join(repoRoot, durablePath, relativeFile)),
  );
  if (Boolean(agent?.basePackComplete) !== computedComplete) {
    fail(`agent ${agentId} basePackComplete does not match files on disk`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `check-agent-packs: ok (${agents.length} agents, ${requiredPackFiles.length} required pack files each)`,
);
