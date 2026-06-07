import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXECUTION_AGENT_IDS = [
  "execution-coding",
  "execution-context-scout",
  "execution-validation-scout",
] as const;

const REQUIRED_DURABLE_AGENT_FILES = [
  "index.md",
  "Identity.md",
  "Startup.md",
  "Tools.md",
  "Permissions.md",
  "Skills.md",
  "Status.md",
] as const;

const REQUIRED_RUNTIME_SOURCE_FILES = [
  "AGENTS.md",
  "BOOTSTRAP.md",
  "IDENTITY.md",
  "MEMORY.md",
  "TOOLS.md",
] as const;

const EXECUTION_SKILL_NAMES = [
  "execution-node-workflow",
  "execution-context-scout",
  "execution-validation-scout",
] as const;

const ALLOWED_HOME_NODE_RUNTIME_ALIAS_SOURCES = new Set(["src/config/runtime-source-record.ts"]);
const RUNTIME_EXECUTION_PLATFORM_DOC_ROOT =
  "/root/.openclaw/workspace/docs/projects/execution-platform";

function repoPath(...parts: string[]): string {
  return path.join(REPO_ROOT, ...parts);
}

function toRepoRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function listFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git"].includes(entry.name)) {
        return [];
      }
      return listFiles(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
}

function readYaml(relativePath: string): unknown {
  return YAML.parse(fs.readFileSync(repoPath(relativePath), "utf8")) as unknown;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  expect(typeof value, key).toBe("string");
  return value as string;
}

describe("source/runtime unification inventory", () => {
  it("keeps first-party execution agent docs as repo-owned source", () => {
    for (const agentId of EXECUTION_AGENT_IDS) {
      for (const fileName of REQUIRED_DURABLE_AGENT_FILES) {
        expect(
          fs.existsSync(repoPath("docs", "agents", agentId, fileName)),
          `${agentId}/${fileName}`,
        ).toBe(true);
      }
      for (const fileName of REQUIRED_RUNTIME_SOURCE_FILES) {
        expect(
          fs.existsSync(repoPath("docs", "agents", agentId, "runtime", fileName)),
          `${agentId}/runtime/${fileName}`,
        ).toBe(true);
      }
    }
  });

  it("keeps first-party execution skills as repo-owned source", () => {
    for (const skillName of EXECUTION_SKILL_NAMES) {
      expect(
        fs.existsSync(repoPath("skills", skillName, "SKILL.md")),
        `${skillName}/SKILL.md`,
      ).toBe(true);
    }
  });

  it("records execution agents with canonical projectRoot and runtime alias status", () => {
    const registry = asRecord(readYaml("docs/agents/registry.yaml"));
    const agents = asList(registry.agents);
    for (const agentId of EXECUTION_AGENT_IDS) {
      const entry = agents.find((candidate) => candidate.id === agentId);
      expect(entry, agentId).toBeTruthy();
      expect(entry?.projectRoot, `${agentId}.projectRoot`).toBe(
        "/root/services/openclaw-roles/live",
      );
      expect(entry?.runtimeSurfacePath, `${agentId}.runtimeSurfacePath`).toBe(
        `/root/.openclaw/agents/${agentId}/agent`,
      );
      expect(entry?.runtimeSurfaceAliasPath, `${agentId}.runtimeSurfaceAliasPath`).toBe(
        `/home/node/.openclaw/agents/${agentId}/agent`,
      );
    }
  });

  it("records live agent runtime surfaces with /home/node only as an explicit alias", () => {
    const durableRegistry = asRecord(readYaml("docs/agents/registry.yaml"));
    for (const entry of asList(durableRegistry.agents)) {
      const agentId = stringField(entry, "id");
      expect(stringField(entry, "runtimeSurfacePath"), `${agentId}.runtimeSurfacePath`).toMatch(
        /^\/root\/\.openclaw\/agents\//u,
      );
      if (entry.runtimeSurfaceAliasPath) {
        expect(
          stringField(entry, "runtimeSurfaceAliasPath"),
          `${agentId}.runtimeSurfaceAliasPath`,
        ).toMatch(/^\/home\/node\/\.openclaw\/agents\//u);
      }
    }

    const systemRegistry = asRecord(readYaml("docs/system/registries/agents.yaml"));
    expect(systemRegistry.runtimeRoots).toEqual(
      expect.arrayContaining([
        "live-runtime:/root/.openclaw",
        "live-runtime-alias:/home/node/.openclaw",
      ]),
    );
    const liveRuntimeSource = asRecord(systemRegistry.liveRuntimeSource);
    expect(liveRuntimeSource).toEqual(
      expect.objectContaining({
        runtimeHome: "/root/.openclaw",
        runtimeHomeAliasPath: "/home/node/.openclaw",
        configPath: "/root/.openclaw/openclaw.json",
        configAliasPath: "/home/node/.openclaw/openclaw.json",
        aliasStatus: "compatibility_alias_only",
      }),
    );
    for (const entry of asList(systemRegistry.liveRuntimeAgents)) {
      const agentId = stringField(entry, "id");
      expect(stringField(entry, "workspacePath"), `${agentId}.workspacePath`).toMatch(
        /^\/root\/\.openclaw\//u,
      );
      expect(stringField(entry, "sessionStorePath"), `${agentId}.sessionStorePath`).toMatch(
        /^\/root\/\.openclaw\/agents\//u,
      );
      expect(stringField(entry, "workspaceAliasPath"), `${agentId}.workspaceAliasPath`).toMatch(
        /^\/home\/node\/\.openclaw\//u,
      );
      expect(
        stringField(entry, "sessionStoreAliasPath"),
        `${agentId}.sessionStoreAliasPath`,
      ).toMatch(/^\/home\/node\/\.openclaw\/agents\//u);
    }
  });

  it("keeps a machine-readable Phase 0 source/runtime manifest", () => {
    const manifest = asRecord(readYaml("docs/system/registries/source-runtime-unification.yaml"));
    const canonical = asRecord(manifest.canonical);
    expect(manifest.status).toBe("phase0_active_blocking_worker_agent_refactor");
    expect(canonical.projectRoot).toBe("/root/services/openclaw-roles/live");
    expect(canonical.executionPlatformDocsRoot).toBe(
      "/root/services/openclaw-roles/live/docs/projects/execution-platform",
    );
    expect(canonical.runtimeHome).toBe("/root/.openclaw");
    expect(canonical.sourceRuntimeRecordPath).toBe(
      "/root/.openclaw/source-runtime/materialization-records.json",
    );
    expect(canonical.forkTransitionReadinessPath).toBe(
      "/root/.openclaw/source-runtime/fork-transition-readiness.json",
    );
    expect(canonical.dirtyWorktreeReconciliationPath).toBe(
      "/root/.openclaw/source-runtime/dirty-worktree-reconciliation.json",
    );

    const githubTopology = asRecord(manifest.githubTopology);
    const currentGithubTopology = asRecord(githubTopology.current);
    expect(asRecord(currentGithubTopology.origin)).toEqual(
      expect.objectContaining({
        remoteName: "origin",
        nameWithOwner: "ConorLynchOCGit/openclaw",
        isFork: true,
        parent: "openclaw/openclaw",
        status: "canonical_writable_fork_origin",
      }),
    );
    expect(asRecord(currentGithubTopology.platformLegacy)).toEqual(
      expect.objectContaining({
        remoteName: "platform-legacy",
        nameWithOwner: "ConorLynchOCGit/openclaw-platform",
        push: "DISABLED",
        status: "preserved_fetch_only_legacy_origin",
      }),
    );
    const readinessRef = asRecord(currentGithubTopology.readiness);
    expect(readinessRef).toEqual(
      expect.objectContaining({
        recordPath: "/root/.openclaw/source-runtime/fork-transition-readiness.json",
        dirtyWorktreeReconciliationPath:
          "/root/.openclaw/source-runtime/dirty-worktree-reconciliation.json",
        dynamicStateOwner: "runtime_home_records",
        statusSource: "/root/.openclaw/source-runtime/fork-transition-readiness.json",
        countSource: "/root/.openclaw/source-runtime/dirty-worktree-reconciliation.json",
      }),
    );
    expect(readinessRef).not.toHaveProperty("dirtyEntryCount");
    expect(readinessRef).not.toHaveProperty("unclassifiedEntryCount");
    expect(readinessRef).not.toHaveProperty("actionCounts");

    const runtimeReadinessFile = asRecord(
      readJson("/root/.openclaw/source-runtime/fork-transition-readiness.json"),
    );
    const runtimeReadiness = asRecord(runtimeReadinessFile.readiness);
    expect(runtimeReadiness).toEqual(
      expect.objectContaining({
        status: "migrated_with_preserved_dirty_worktree",
        unclassifiedDirtyEntryCount: 0,
      }),
    );
    expect(typeof runtimeReadiness.dirtyEntryCount).toBe("number");
    expect(runtimeReadiness.dirtyEntryCount).toBeGreaterThan(0);

    const aliases = asList(manifest.runtimeAliases);
    expect(aliases).toContainEqual({
      aliasPath: "/home/node/.openclaw",
      canonicalPath: "/root/.openclaw",
      label: "container-runtime-home-alias",
      status: "compatibility_alias_only",
    });

    const agentMaterializations = asList(manifest.executionAgentMaterializations);
    for (const agentId of EXECUTION_AGENT_IDS) {
      expect(agentMaterializations).toContainEqual(
        expect.objectContaining({
          agentId,
          projectRoot: "/root/services/openclaw-roles/live",
          runtimePath: `/root/.openclaw/agents/${agentId}/agent`,
          runtimeAliasPath: `/home/node/.openclaw/agents/${agentId}/agent`,
          runtimeFileClass: "source_materialized",
          recordMode: "materialized",
        }),
      );
    }

    const skillMaterializations = asList(manifest.executionSkillMaterializations);
    for (const skillName of EXECUTION_SKILL_NAMES) {
      expect(skillMaterializations).toContainEqual(
        expect.objectContaining({
          skillName,
          projectRoot: "/root/services/openclaw-roles/live",
          sourcePath: `skills/${skillName}/SKILL.md`,
          runtimeFileClass: "source_materialized",
          recordMode: "materialized",
        }),
      );
    }
  });

  it("does not treat /home/node runtime paths as canonical in production source", () => {
    const productionFiles = [
      ...listFiles(repoPath("src")),
      ...listFiles(repoPath("extensions", "execution-platform", "src")),
    ].filter((filePath) => {
      const relative = toRepoRelative(filePath);
      return (
        /\.(ts|tsx|js|mjs)$/u.test(relative) && !/\.(test|spec)\.(ts|tsx|js|mjs)$/u.test(relative)
      );
    });
    const offenders = productionFiles
      .map((filePath) => ({
        relative: toRepoRelative(filePath),
        text: fs.readFileSync(filePath, "utf8"),
      }))
      .filter(
        (entry) =>
          entry.text.includes("/home/node/.openclaw") &&
          !ALLOWED_HOME_NODE_RUNTIME_ALIAS_SOURCES.has(entry.relative),
      )
      .map((entry) => entry.relative);

    expect(offenders).toEqual([]);
  });

  it("does not use Runtime Home execution-platform docs as production source truth", () => {
    const productionFiles = [
      ...listFiles(repoPath("src")),
      ...listFiles(repoPath("extensions", "execution-platform", "src")),
    ].filter((filePath) => {
      const relative = toRepoRelative(filePath);
      return (
        /\.(ts|tsx|js|mjs)$/u.test(relative) && !/\.(test|spec)\.(ts|tsx|js|mjs)$/u.test(relative)
      );
    });
    const offenders = productionFiles
      .map((filePath) => ({
        relative: toRepoRelative(filePath),
        text: fs.readFileSync(filePath, "utf8"),
      }))
      .filter((entry) => entry.text.includes(RUNTIME_EXECUTION_PLATFORM_DOC_ROOT))
      .map((entry) => entry.relative);

    expect(offenders).toEqual([]);
  });
});
