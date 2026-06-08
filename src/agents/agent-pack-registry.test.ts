import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findExecutionPlatformAgentPackEntry,
  loadAgentPackRegistryEntries,
  resolveAgentPackRuntimeSourceRoot,
} from "./agent-pack-registry.js";

describe("agent pack registry", () => {
  it("resolves execution platform source-backed runtime pack paths from docs/agents registry", async () => {
    const entries = await loadAgentPackRegistryEntries();
    const executionCoding = findExecutionPlatformAgentPackEntry({
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
      requiredTools: [
        "node_finish",
        "openclaw_resource_read",
        "edit",
        "update_plan",
        "read_todo",
        "task",
      ],
      forbiddenTools: expect.arrayContaining(["read", "grep", "exec", "sessions_spawn"]),
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
    const contextScout = findExecutionPlatformAgentPackEntry({
      entries,
      agentId: "execution-context-scout",
    });
    const validationScout = findExecutionPlatformAgentPackEntry({
      entries,
      agentId: "execution-validation-scout",
    });

    expect(contextScout).toMatchObject({
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: ["execution-context-scout"],
      requiredTools: ["read", "list", "glob", "grep"],
      forbiddenTools: expect.arrayContaining(["edit", "task", "node_finish"]),
    });
    expect(validationScout).toMatchObject({
      requiredDocs: ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
      primarySkills: ["execution-validation-scout"],
      requiredTools: ["read", "list", "glob", "grep", "exec"],
      forbiddenTools: expect.arrayContaining(["write", "openclaw_resource_read", "node_finish"]),
    });
  });

  it("does not classify ordinary main agent as an execution-platform pack", async () => {
    const entries = await loadAgentPackRegistryEntries();

    expect(
      findExecutionPlatformAgentPackEntry({
        entries,
        agentId: "main",
      }),
    ).toBeUndefined();
  });
});
