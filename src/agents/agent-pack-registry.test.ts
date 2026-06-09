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
      runtimeSourcePath: "docs/agents/execution-coding/runtime",
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: ["execution-node-workflow"],
      allowedChildAgents: ["execution-context-scout", "execution-validation-scout"],
      toolBudget: {
        readDefaultLineLimit: 80,
        readMaxBytes: 12_288,
      },
      requiredTools: [
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "read",
        "update_plan",
        "read_todo",
        "task",
      ],
      forbiddenTools: expect.arrayContaining(["list", "grep", "exec", "sessions_spawn"]),
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
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: ["execution-context-scout"],
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
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: ["execution-validation-scout"],
      toolBudget: {
        readDefaultLineLimit: 220,
        readMaxBytes: 24_576,
        discoveryDefaultMaxResults: 80,
        discoveryDefaultMaxMatches: 80,
        discoveryDefaultMaxFiles: 1_500,
      },
      requiredTools: ["read", "list", "glob", "grep", "exec"],
      forbiddenTools: expect.arrayContaining(["write", "openclaw_resource_read", "node_finish"]),
    });
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
