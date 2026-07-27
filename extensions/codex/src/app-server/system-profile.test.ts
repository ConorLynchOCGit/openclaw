import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "./client.js";
import {
  buildCodexUntrustedProjectConfig,
  loadCodexSystemProfileForAgent,
  resolveCodexSystemProfileDir,
} from "./system-profile.js";

const EXPECTED_PROFILE_ASSETS = [
  "project/.codex/agents/architect_reviewer.toml",
  "project/.codex/agents/code_reviewer.toml",
  "project/.codex/agents/codex_reviewer.toml",
  "project/.codex/agents/creative_quality_reviewer.toml",
  "project/.codex/agents/docs_researcher.toml",
  "project/.codex/agents/implementation_planner.toml",
  "project/.codex/agents/implementer.toml",
  "project/.codex/agents/native_fit_reviewer.toml",
  "project/.codex/agents/project_explorer.toml",
  "project/.codex/agents/test_engineer.toml",
  "project/.codex/config.toml",
  "shared-skills/agentic-architecture-review/SKILL.md",
  "shared-skills/agentic-architecture-review/agents/openai.yaml",
  "shared-skills/business-ops-onboarding-review/SKILL.md",
  "shared-skills/business-ops-onboarding-review/agents/openai.yaml",
  "shared-skills/codebase-claim-review/SKILL.md",
  "shared-skills/codebase-claim-review/agents/openai.yaml",
  "shared-skills/genericity-slop-risk-review/SKILL.md",
  "shared-skills/genericity-slop-risk-review/agents/openai.yaml",
  "shared-skills/openclaw-business-ops-implementation/SKILL.md",
  "shared-skills/openclaw-business-ops-implementation/agents/openai.yaml",
  "shared-skills/openclaw-codex-execution-review/SKILL.md",
  "shared-skills/openclaw-codex-execution-review/agents/openai.yaml",
  "shared-skills/openclaw-coding-validation/SKILL.md",
  "shared-skills/openclaw-coding-validation/agents/openai.yaml",
  "shared-skills/openclaw-coding-workbench/SKILL.md",
  "shared-skills/openclaw-coding-workbench/agents/openai.yaml",
  "shared-skills/openclaw-context-pack/SKILL.md",
  "shared-skills/openclaw-context-pack/agents/openai.yaml",
  "shared-skills/openclaw-creative-quality-review/SKILL.md",
  "shared-skills/openclaw-creative-quality-review/agents/openai.yaml",
  "shared-skills/openclaw-gbrain-native-architecture-review/SKILL.md",
  "shared-skills/openclaw-gbrain-native-architecture-review/agents/openai.yaml",
  "shared-skills/openclaw-implementation-critique/SKILL.md",
  "shared-skills/openclaw-implementation-critique/agents/openai.yaml",
  "shared-skills/openclaw-native-implementation/SKILL.md",
  "shared-skills/openclaw-native-implementation/agents/openai.yaml",
  "shared-skills/openclaw-operator-ui-validation/SKILL.md",
  "shared-skills/openclaw-operator-ui-validation/agents/openai.yaml",
  "shared-skills/openclaw-runtime-debugging/SKILL.md",
  "shared-skills/openclaw-runtime-debugging/agents/openai.yaml",
  "shared-skills/security-best-practices/LICENSE.txt",
  "shared-skills/security-best-practices/SKILL.md",
  "shared-skills/security-best-practices/agents/openai.yaml",
  "shared-skills/security-best-practices/references/golang-general-backend-security.md",
  "shared-skills/security-best-practices/references/javascript-express-web-server-security.md",
  "shared-skills/security-best-practices/references/javascript-general-web-frontend-security.md",
  "shared-skills/security-best-practices/references/javascript-jquery-web-frontend-security.md",
  "shared-skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md",
  "shared-skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md",
  "shared-skills/security-best-practices/references/javascript-typescript-vue-web-frontend-security.md",
  "shared-skills/security-best-practices/references/python-django-web-server-security.md",
  "shared-skills/security-best-practices/references/python-fastapi-web-server-security.md",
  "shared-skills/security-best-practices/references/python-flask-web-server-security.md",
  "shared-skills/source-evidence-quality-review/SKILL.md",
  "shared-skills/source-evidence-quality-review/agents/openai.yaml",
  "shared-skills/useful-proof-design/SKILL.md",
  "shared-skills/useful-proof-design/agents/openai.yaml",
  "tools/openclaw-repo-workbench-artifact.mjs",
  "tools/openclaw-repo-workbench-core.mjs",
  "tools/openclaw-repo-workbench-lsp.mjs",
  "tools/openclaw-repo-workbench-repository.mjs",
  "tools/openclaw-repo-workbench.mjs",
] as const;

const PURPOSE_AGENTS = [
  "architect_reviewer",
  "code_reviewer",
  "codex_reviewer",
  "creative_quality_reviewer",
  "docs_researcher",
  "implementation_planner",
  "implementer",
  "native_fit_reviewer",
  "project_explorer",
  "test_engineer",
] as const;

const tempRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map(async (root) => {
      await fs.rm(root, { recursive: true, force: true });
      tempRoots.delete(root);
    }),
  );
});

describe("immutable Codex Coding profile", () => {
  it("ships the accepted product assets and exact current-generation authorities", async () => {
    const profileDir = fileURLToPath(new URL("../../system-profile/", import.meta.url));
    const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const systemSkillSourceRoot = path.join(repoRoot, ".agents/skills");
    const systemSkillPaths = await listFiles(systemSkillSourceRoot);
    const systemSkillAssets = systemSkillPaths.map((entry) => `skills/${entry}`);
    const guidanceIndex = JSON.parse(
      await fs.readFile(path.join(profileDir, "contributor-guidance/index.json"), "utf8"),
    ) as {
      entries: Array<{ sourcePath: string; sha256: string; bytes: number }>;
    };
    const guidanceAssets = [
      "contributor-guidance/SKILL.md",
      "contributor-guidance/index.json",
      ...guidanceIndex.entries.map((entry) => `contributor-guidance/tree/${entry.sourcePath}`),
    ];
    expect(await listFiles(profileDir)).toEqual(
      [...EXPECTED_PROFILE_ASSETS, ...systemSkillAssets, ...guidanceAssets].toSorted(
        (left, right) => left.localeCompare(right),
      ),
    );
    for (const relativePath of systemSkillPaths) {
      expect(await fs.readFile(path.join(profileDir, "skills", relativePath))).toEqual(
        await fs.readFile(path.join(systemSkillSourceRoot, relativePath)),
      );
    }
    for (const entry of guidanceIndex.entries) {
      const source = await fs.readFile(path.join(repoRoot, entry.sourcePath));
      const packaged = await fs.readFile(
        path.join(profileDir, "contributor-guidance/tree", entry.sourcePath),
      );
      expect(packaged).toEqual(source);
      expect(entry.bytes).toBe(source.byteLength);
      expect(entry.sha256).toBe(createHash("sha256").update(source).digest("hex"));
    }
  });

  it("keeps project exploration on the native Workbench without skill discovery", async () => {
    const profileDir = fileURLToPath(new URL("../../system-profile/", import.meta.url));
    const explorerProfile = await fs.readFile(
      path.join(profileDir, "project/.codex/agents/project_explorer.toml"),
      "utf8",
    );

    expect(explorerProfile).toContain("Use the attached\n`openclaw_repo_workbench` MCP directly");
    expect(explorerProfile).toContain(
      "do not search the filesystem for a\n`openclaw-coding-workbench/SKILL.md`",
    );
    expect(explorerProfile).toContain(
      "When the brief supplies exact paths,\nread those paths directly",
    );
    expect(explorerProfile).not.toContain("The primary\nworkflow skill is");
  });

  it("uses the native plugin root and native config/read for Coding only", async () => {
    const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-profile-"));
    tempRoots.add(pluginRoot);
    const profileDir = path.join(pluginRoot, "system-profile");
    const projectDir = path.join(profileDir, "project");
    const dotCodexDir = path.join(projectDir, ".codex");
    const workbenchPath = path.join(profileDir, "tools", "openclaw-repo-workbench.mjs");
    await fs.mkdir(path.join(profileDir, "skills"), { recursive: true });
    await fs.mkdir(path.join(profileDir, "shared-skills"), { recursive: true });
    await fs.mkdir(path.join(profileDir, "contributor-guidance"), { recursive: true });
    await fs.mkdir(path.dirname(workbenchPath), { recursive: true });
    await fs.writeFile(workbenchPath, "#!/usr/bin/env node\n");

    const config = {
      project_doc_max_bytes: 0,
      default_permissions: ":workspace",
      developer_instructions: "Use the immutable Coding contract.",
      agents: Object.fromEntries(
        PURPOSE_AGENTS.map((name) => [name, { config_file: `agents/${name}.toml` }]),
      ),
      mcp_servers: {
        openclaw_repo_workbench: {
          command: "node",
          args: ["tools/openclaw-repo-workbench.mjs"],
        },
      },
    };
    const request = vi.fn().mockResolvedValue({
      layers: [
        {
          name: { type: "project", dotCodexFolder: dotCodexDir },
          version: "profile-v1",
          config,
        },
      ],
    });
    const client = { request } as unknown as CodexAppServerClient;

    await expect(
      loadCodexSystemProfileForAgent({
        client,
        pluginRoot,
        agentId: "planning",
        timeoutMs: 1_000,
      }),
    ).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();

    const profile = await loadCodexSystemProfileForAgent({
      client,
      pluginRoot,
      agentId: "coding",
      timeoutMs: 1_000,
    });
    expect(request).toHaveBeenCalledWith(
      "config/read",
      { cwd: projectDir, includeLayers: true },
      { timeoutMs: 1_000, signal: undefined },
    );
    if (!profile) {
      throw new Error("expected Coding to resolve the immutable system profile");
    }
    expect(profile.agentNames).toEqual(PURPOSE_AGENTS);
    expect(profile.developerInstructions).toBe("Use the immutable Coding contract.");
    expect(profile.permissionProfile).toBe(":workspace");
    expect(profile.selectedCapabilityRoots).toEqual([
      {
        id: "codex-system-skills",
        location: {
          type: "environment",
          environmentId: "local",
          path: path.join(profileDir, "skills"),
        },
      },
      {
        id: "openclaw-codex-product-profile",
        location: {
          type: "environment",
          environmentId: "local",
          path: path.join(profileDir, "shared-skills"),
        },
      },
      {
        id: "openclaw-contributor-guidance",
        location: {
          type: "environment",
          environmentId: "local",
          path: path.join(profileDir, "contributor-guidance"),
        },
      },
    ]);
    expect(
      (
        profile.config.mcp_servers as {
          openclaw_repo_workbench: { args: string[] };
        }
      ).openclaw_repo_workbench.args,
    ).toEqual([workbenchPath]);
  });

  it("marks the managed worktree untrusted through native Codex project config", () => {
    expect(buildCodexUntrustedProjectConfig("/repo/worktree")).toEqual({
      projects: {
        [path.resolve("/repo/worktree")]: {
          trust_level: "untrusted",
        },
      },
    });
  });

  it("fails closed when Coding has no native plugin root", () => {
    expect(() => resolveCodexSystemProfileDir(undefined)).toThrow(
      "Codex package root is unavailable",
    );
  });
});

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const child = path.posix.join(relative, entry.name);
      return entry.isDirectory() ? await listFiles(root, child) : [child];
    }),
  );
  return files.flat().toSorted((left, right) => left.localeCompare(right));
}
