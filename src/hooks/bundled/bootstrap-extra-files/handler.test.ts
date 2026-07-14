// Bootstrap extra files hook tests cover extra file context injection.
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../../test-helpers/workspace.js";
import type { AgentBootstrapHookContext } from "../../hooks.js";
import { createHookEvent } from "../../hooks.js";
import handler from "./handler.js";

function createBootstrapExtraConfig(paths: string[]): OpenClawConfig {
  return {
    hooks: {
      internal: {
        entries: {
          "bootstrap-extra-files": {
            enabled: true,
            paths,
          },
        },
      },
    },
  };
}

async function createBootstrapContext(params: {
  workspaceDir: string;
  cfg: OpenClawConfig;
  sessionKey: string;
  rootFiles: Array<{ name: string; content: string }>;
}): Promise<AgentBootstrapHookContext> {
  const bootstrapFiles = (await Promise.all(
    params.rootFiles.map(async (file) => ({
      name: file.name,
      path: await writeWorkspaceFile({
        dir: params.workspaceDir,
        name: file.name,
        content: file.content,
      }),
      content: file.content,
      missing: false,
    })),
  )) as AgentBootstrapHookContext["bootstrapFiles"];
  return {
    workspaceDir: params.workspaceDir,
    bootstrapFiles,
    cfg: params.cfg,
    sessionKey: params.sessionKey,
  };
}

describe("bootstrap-extra-files hook", () => {
  it("appends extra bootstrap files from configured patterns", async () => {
    const tempDir = await makeTempWorkspace("openclaw-bootstrap-extra-");
    const extraDir = path.join(tempDir, "packages", "core");
    await fs.mkdir(extraDir, { recursive: true });
    await fs.writeFile(path.join(extraDir, "AGENTS.md"), "extra agents", "utf-8");

    const cfg = createBootstrapExtraConfig(["packages/*/AGENTS.md"]);
    const context = await createBootstrapContext({
      workspaceDir: tempDir,
      cfg,
      sessionKey: "agent:main:main",
      rootFiles: [{ name: "AGENTS.md", content: "root agents" }],
    });

    const event = createHookEvent("agent", "bootstrap", "agent:main:main", context);
    await handler(event);

    const injected = context.bootstrapFiles.filter((f) => f.name === "AGENTS.md");
    expect(injected).toHaveLength(2);
    expect(injected.map((f) => path.relative(tempDir, f.path))).toContain(
      path.join("packages", "core", "AGENTS.md"),
    );
  });

  it("re-applies subagent bootstrap allowlist after extras are added", async () => {
    const tempDir = await makeTempWorkspace("openclaw-bootstrap-extra-subagent-");
    const extraDir = path.join(tempDir, "packages", "persona");
    await fs.mkdir(extraDir, { recursive: true });
    await fs.writeFile(path.join(extraDir, "SOUL.md"), "evil", "utf-8");

    const cfg = createBootstrapExtraConfig(["packages/*/SOUL.md"]);
    const context = await createBootstrapContext({
      workspaceDir: tempDir,
      cfg,
      sessionKey: "agent:main:subagent:abc",
      rootFiles: [
        { name: "AGENTS.md", content: "root agents" },
        { name: "TOOLS.md", content: "root tools" },
      ],
    });

    const event = createHookEvent("agent", "bootstrap", "agent:main:subagent:abc", context);
    await handler(event);
    expect(context.bootstrapFiles.map((f) => f.name).toSorted()).toEqual(["AGENTS.md", "TOOLS.md"]);
  });

  it("appends agent-scoped bootstrap files only for the matching agent", async () => {
    const tempDir = await makeTempWorkspace("openclaw-bootstrap-extra-agent-");
    await fs.mkdir(path.join(tempDir, "docs", "agents", "planning"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "docs", "agents", "reviewer"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "docs", "agents", "planning", "AGENTS.md"),
      "planning agents",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempDir, "docs", "agents", "reviewer", "AGENTS.md"),
      "reviewer agents",
      "utf-8",
    );

    const cfg: OpenClawConfig = {
      hooks: {
        internal: {
          entries: {
            "bootstrap-extra-files": {
              enabled: true,
              agentPaths: {
                planning: ["docs/agents/planning/AGENTS.md"],
                reviewer: ["docs/agents/reviewer/AGENTS.md"],
              },
            },
          },
        },
      },
    };
    const context = await createBootstrapContext({
      workspaceDir: tempDir,
      cfg,
      sessionKey: "agent:planning:main",
      rootFiles: [{ name: "AGENTS.md", content: "root agents" }],
    });
    context.agentId = "planning";

    const event = createHookEvent("agent", "bootstrap", "agent:planning:main", context);
    await handler(event);

    const relativePaths = context.bootstrapFiles.map((f) => path.relative(tempDir, f.path));
    expect(relativePaths).toContain(path.join("docs", "agents", "planning", "AGENTS.md"));
    expect(relativePaths).not.toContain(path.join("docs", "agents", "reviewer", "AGENTS.md"));
  });

  it("appends runtime prompt files from the target agent contract pack", async () => {
    const tempDir = await makeTempWorkspace("openclaw-bootstrap-extra-contract-pack-");
    await fs.mkdir(path.join(tempDir, "docs", "agents", "planning"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "docs", "agents", "planning", "AGENTS.md"),
      "planning agents",
      "utf-8",
    );
    await fs.writeFile(
      path.join(tempDir, "docs", "agents", "planning", "TOOLS.md"),
      "planning tools",
      "utf-8",
    );

    const cfg: OpenClawConfig = {
      hooks: {
        internal: {
          entries: {
            "bootstrap-extra-files": {
              enabled: true,
            },
          },
        },
      },
      agents: {
        list: [
          {
            id: "planning",
            contractPack: "docs/agents/planning",
            runtimePromptFiles: ["AGENTS.md", "TOOLS.md"],
          },
        ],
      },
    };
    const context = await createBootstrapContext({
      workspaceDir: tempDir,
      cfg,
      sessionKey: "agent:planning:main",
      rootFiles: [{ name: "AGENTS.md", content: "root agents" }],
    });
    context.agentId = "planning";

    const event = createHookEvent("agent", "bootstrap", "agent:planning:main", context);
    await handler(event);

    const relativePaths = context.bootstrapFiles.map((f) => path.relative(tempDir, f.path));
    expect(relativePaths).toContain(path.join("docs", "agents", "planning", "AGENTS.md"));
    expect(relativePaths).toContain(path.join("docs", "agents", "planning", "TOOLS.md"));
  });

  it("retains configured root maps for subagent contract packs", async () => {
    const tempDir = await makeTempWorkspace("openclaw-bootstrap-extra-contract-roots-");
    const contractDir = path.join(tempDir, "docs", "agents", "codebase-researcher");
    await fs.mkdir(contractDir, { recursive: true });
    await fs.writeFile(path.join(contractDir, "AGENTS.md"), "researcher agents", "utf-8");
    await fs.writeFile(path.join(contractDir, "TOOLS.md"), "researcher tools", "utf-8");
    await fs.writeFile(path.join(contractDir, "ROOTS.md"), "researcher roots", "utf-8");

    const cfg: OpenClawConfig = {
      hooks: {
        internal: {
          entries: {
            "bootstrap-extra-files": {
              enabled: true,
            },
          },
        },
      },
      agents: {
        list: [
          {
            id: "codebase-researcher",
            contractPack: "docs/agents/codebase-researcher",
            runtimePromptFiles: ["AGENTS.md", "TOOLS.md", "ROOTS.md"],
          },
        ],
      },
    };
    const context = await createBootstrapContext({
      workspaceDir: tempDir,
      cfg,
      sessionKey: "agent:codebase-researcher:subagent:task-1",
      rootFiles: [
        { name: "AGENTS.md", content: "root agents" },
        { name: "TOOLS.md", content: "root tools" },
        { name: "SOUL.md", content: "root persona" },
      ],
    });
    context.agentId = "codebase-researcher";

    const event = createHookEvent(
      "agent",
      "bootstrap",
      "agent:codebase-researcher:subagent:task-1",
      context,
    );
    await handler(event);

    const relativePaths = context.bootstrapFiles.map((file) => path.relative(tempDir, file.path));
    expect(relativePaths).toContain(path.join("docs", "agents", "codebase-researcher", "ROOTS.md"));
    expect(context.bootstrapFiles.map((file) => file.name)).not.toContain("SOUL.md");
  });
});
