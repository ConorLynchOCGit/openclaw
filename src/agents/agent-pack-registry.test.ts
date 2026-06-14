import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntries,
  loadAgentPackRegistryEntriesSync,
  resolveAgentPackRuntimeSourceRoot,
} from "./agent-pack-registry.js";

describe("agent pack registry", () => {
  it("resolves source-backed runtime pack paths from the native docs/agents registry", async () => {
    const entries = await loadAgentPackRegistryEntries();
    const executionCoding = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-coding",
    });

    expect(executionCoding).toMatchObject({
      id: "execution-coding",
      classification: "execution_platform_agent",
      promptProfile: "execution_worker",
      runtimeSourcePath: "docs/agents/execution-coding/runtime",
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: [],
      allowedChildAgents: ["execution-context-scout", "execution-validation-scout"],
      toolBudget: {
        readDefaultLineLimit: 2_000,
        readMaxBytes: 51_200,
      },
      requiredTools: [
        "node_finish",
        "edit",
        "lsp",
        "read",
        "grep",
        "glob",
        "update_plan",
        "read_todo",
        "task",
      ],
      forbiddenTools: expect.arrayContaining(["apply_patch", "list", "exec", "sessions_spawn"]),
    });
    expect(
      resolveAgentPackRuntimeSourceRoot({
        entry: executionCoding!,
        defaultProjectRoot: process.cwd(),
      }),
    ).toBe(path.join(process.cwd(), "docs", "agents", "execution-coding", "runtime"));
  });

  it("resolves scout tool contracts from the native registry", async () => {
    const entries = await loadAgentPackRegistryEntries();
    const contextScout = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-context-scout",
    });
    const validationScout = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-validation-scout",
    });

    expect(contextScout).toMatchObject({
      promptProfile: "execution_context_scout",
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: [],
      toolBudget: {
        readDefaultLineLimit: 160,
        readMaxBytes: 16_384,
        discoveryDefaultMaxResults: 60,
        discoveryDefaultMaxMatches: 60,
        discoveryDefaultMaxFiles: 1_000,
      },
      requiredTools: ["read", "list", "glob", "grep"],
      forbiddenTools: expect.arrayContaining(["edit", "task", "node_finish"]),
    });
    expect(validationScout).toMatchObject({
      promptProfile: "execution_validation_scout",
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: [],
      toolBudget: {
        readDefaultLineLimit: 220,
        readMaxBytes: 24_576,
        discoveryDefaultMaxResults: 80,
        discoveryDefaultMaxMatches: 80,
        discoveryDefaultMaxFiles: 1_500,
      },
      requiredTools: ["read", "list", "glob", "grep", "exec"],
      forbiddenTools: expect.arrayContaining(["write", "node_finish"]),
    });
    expect(contextScout?.requiredTools).not.toContain("source_context_batch");
    expect(validationScout?.requiredTools).not.toContain("source_context_batch");
  });

  it("resolves execution orchestrator and critic packs from the native registry", async () => {
    const entries = await loadAgentPackRegistryEntries();
    const orchestrator = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-orchestrator",
    });
    const critic = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-critic",
    });

    expect(orchestrator).toMatchObject({
      promptProfile: "execution_orchestrator",
      allowedChildAgents: [
        "execution-coding",
        "execution-critic",
        "execution-context-scout",
        "execution-validation-scout",
      ],
    });
    expect(critic).toMatchObject({
      promptProfile: "execution_critic",
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: [],
      requiredTools: ["read", "grep", "glob", "lsp", "update_plan", "read_todo"],
      forbiddenTools: expect.arrayContaining(["edit", "apply_patch", "exec", "node_finish"]),
    });
    expect(
      resolveAgentPackRuntimeSourceRoot({
        entry: critic!,
        defaultProjectRoot: process.cwd(),
      }),
    ).toBe(path.join(process.cwd(), "docs", "agents", "execution-critic", "runtime"));
  });

  it("resolves execution tool budgets through the sync native registry path", () => {
    const entries = loadAgentPackRegistryEntriesSync();
    const contextScout = findAgentPackRegistryEntry({
      entries,
      agentId: "execution-context-scout",
    });

    expect(contextScout?.toolBudget).toEqual({
      readDefaultLineLimit: 160,
      readMaxBytes: 16_384,
      discoveryDefaultMaxResults: 60,
      discoveryDefaultMaxMatches: 60,
      discoveryDefaultMaxFiles: 1_000,
    });
  });

  it("resolves ordinary agents through the same native source-backed registry", async () => {
    const entries = await loadAgentPackRegistryEntries();
    const main = findAgentPackRegistryEntry({
      entries,
      agentId: "main",
    });

    expect(main).toMatchObject({
      id: "main",
      runtimeSourcePath: "docs/agents/main/runtime",
    });
    expect(
      resolveAgentPackRuntimeSourceRoot({
        entry: main!,
        defaultProjectRoot: "/unused",
      }),
    ).toBe(path.join(process.cwd(), "docs", "agents", "main", "runtime"));
  });
});
