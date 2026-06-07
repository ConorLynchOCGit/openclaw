import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  filterToolsByPolicy,
  isToolAllowedByPolicyName,
  resolveEffectiveToolPolicy,
  resolveEffectiveToolPolicyAccess,
  resolveSubagentToolPolicy,
  resolveSubagentToolPolicyForSession,
} from "./pi-tools.policy.js";
import { createStubTool } from "./test-helpers/pi-tool-stubs.js";

describe("pi-tools.policy", () => {
  it("treats * in allow as allow-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { allow: ["*"] });
    expect(filtered.map((tool) => tool.name)).toEqual(["read", "exec"]);
  });

  it("treats * in deny as deny-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { deny: ["*"] });
    expect(filtered).toEqual([]);
  });

  it("supports wildcard allow/deny patterns", () => {
    expect(isToolAllowedByPolicyName("web_fetch", { allow: ["web_*"] })).toBe(true);
    expect(isToolAllowedByPolicyName("web_search", { deny: ["web_*"] })).toBe(false);
  });

  it("keeps apply_patch when write is allowlisted", () => {
    expect(isToolAllowedByPolicyName("apply_patch", { allow: ["write"] })).toBe(true);
  });

  it("blocks apply_patch when write is denylisted", () => {
    expect(isToolAllowedByPolicyName("apply_patch", { deny: ["write"] })).toBe(false);
  });

  it("keeps read_todo with the native update_plan surface", () => {
    expect(isToolAllowedByPolicyName("read_todo", { allow: ["update_plan"] })).toBe(true);
  });

  it("blocks read_todo when update_plan is denylisted", () => {
    expect(isToolAllowedByPolicyName("read_todo", { deny: ["update_plan"] })).toBe(false);
  });
});

describe("resolveSubagentToolPolicy depth awareness", () => {
  const baseCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
  } as unknown as OpenClawConfig;

  const deepCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 3 } } },
  } as unknown as OpenClawConfig;

  const leafCfg = {
    agents: { defaults: { subagents: { maxSpawnDepth: 1 } } },
  } as unknown as OpenClawConfig;

  it("applies subagent tools.alsoAllow to re-enable default-denied tools", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { alsoAllow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(true);
    expect(isToolAllowedByPolicyName("cron", policy)).toBe(false);
  });

  it("applies subagent tools.allow to re-enable default-denied tools", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { allow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(true);
  });

  it("merges subagent tools.alsoAllow into tools.allow when both are set", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: {
        subagents: { tools: { allow: ["sessions_spawn"], alsoAllow: ["sessions_send"] } },
      },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(policy.allow).toEqual(["sessions_spawn", "sessions_send"]);
  });

  it("keeps configured deny precedence over allow and alsoAllow", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: {
        subagents: {
          tools: {
            allow: ["sessions_send"],
            alsoAllow: ["sessions_send"],
            deny: ["sessions_send"],
          },
        },
      },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("sessions_send", policy)).toBe(false);
  });

  it("applies configured deny to memory tools even though they are allowed by default", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: {
        subagents: {
          tools: {
            deny: ["memory_search", "memory_get"],
          },
        },
      },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(isToolAllowedByPolicyName("memory_search", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("memory_get", policy)).toBe(false);
  });

  it("does not create a restrictive allowlist when only alsoAllow is configured", () => {
    const cfg = {
      agents: { defaults: { subagents: { maxSpawnDepth: 2 } } },
      tools: { subagents: { tools: { alsoAllow: ["sessions_send"] } } },
    } as unknown as OpenClawConfig;
    const policy = resolveSubagentToolPolicy(cfg, 1);
    expect(policy.allow).toBeUndefined();
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows subagents", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_list", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(true);
  });

  it("depth-1 orchestrator (maxSpawnDepth=2) allows sessions_history", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_history", policy)).toBe(true);
  });

  it("depth-1 orchestrator still denies gateway and cron but allows memory tools", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 1);
    expect(isToolAllowedByPolicyName("gateway", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("cron", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("memory_search", policy)).toBe(true);
    expect(isToolAllowedByPolicyName("memory_get", policy)).toBe(true);
  });

  it("depth-2 leaf denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-2 orchestrator (maxSpawnDepth=3) allows sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(deepCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("depth-3 leaf (maxSpawnDepth=3) denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(deepCfg, 3);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-2 leaf denies subagents", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(false);
  });

  it("depth-2 leaf denies sessions_list and sessions_history", () => {
    const policy = resolveSubagentToolPolicy(baseCfg, 2);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("sessions_history", policy)).toBe(false);
  });

  it("depth-1 leaf (maxSpawnDepth=1) denies sessions_spawn", () => {
    const policy = resolveSubagentToolPolicy(leafCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });

  it("depth-1 leaf (maxSpawnDepth=1) denies sessions_list", () => {
    const policy = resolveSubagentToolPolicy(leafCfg, 1);
    expect(isToolAllowedByPolicyName("sessions_list", policy)).toBe(false);
  });

  it("uses stored leaf role for flat depth-1 session keys", () => {
    const storePath = path.join(
      os.tmpdir(),
      `openclaw-subagent-policy-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          "agent:main:subagent:flat-leaf": {
            sessionId: "flat-leaf",
            updatedAt: Date.now(),
            spawnDepth: 1,
            subagentRole: "leaf",
            subagentControlScope: "none",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const cfg = {
      ...baseCfg,
      session: {
        store: storePath,
      },
    } as unknown as OpenClawConfig;

    const policy = resolveSubagentToolPolicyForSession(cfg, "agent:main:subagent:flat-leaf");
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("subagents", policy)).toBe(false);
    expect(isToolAllowedByPolicyName("memory_search", policy)).toBe(true);
    expect(isToolAllowedByPolicyName("memory_get", policy)).toBe(true);
  });

  it("defaults to leaf behavior when no depth is provided", () => {
    const policy = resolveSubagentToolPolicy(baseCfg);
    // Default depth=1, maxSpawnDepth=2 → orchestrator
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(true);
  });

  it("defaults to leaf behavior when depth is undefined and maxSpawnDepth is 1", () => {
    const policy = resolveSubagentToolPolicy(leafCfg);
    // Default depth=1, maxSpawnDepth=1 → leaf
    expect(isToolAllowedByPolicyName("sessions_spawn", policy)).toBe(false);
  });
});

describe("resolveEffectiveToolPolicy", () => {
  it("does not cap explicit agent tools.allow with global tools.profile", () => {
    const cfg = {
      tools: {
        profile: "messaging",
      },
      agents: {
        list: [
          {
            id: "execution-context-scout",
            tools: {
              allow: ["read", "list", "glob", "grep", "exec"],
            },
          },
        ],
      },
    } as OpenClawConfig;

    const access = resolveEffectiveToolPolicyAccess({
      config: cfg,
      agentId: "execution-context-scout",
      toolNames: ["read", "list", "glob", "grep", "exec"],
    });

    expect(access.map((entry) => [entry.toolName, entry.allowed])).toEqual([
      ["read", true],
      ["list", true],
      ["glob", true],
      ["grep", true],
      ["exec", true],
    ]);
    expect(access.every((entry) => entry.localPolicyExplicit)).toBe(true);
    expect(new Set(access.map((entry) => entry.effectiveProfileSource))).toEqual(new Set(["none"]));
    expect(access.flatMap((entry) => entry.blockedBy)).not.toContain("tools.profile");
  });

  it("lets explicit agent tools.profile override the global profile", () => {
    const cfg = {
      tools: {
        profile: "messaging",
      },
      agents: {
        list: [
          {
            id: "execution-coding",
            tools: {
              profile: "coding",
            },
          },
        ],
      },
    } as OpenClawConfig;

    const resolved = resolveEffectiveToolPolicy({
      config: cfg,
      agentId: "execution-coding",
    });
    const access = resolveEffectiveToolPolicyAccess({
      config: cfg,
      agentId: "execution-coding",
      toolNames: ["exec"],
    });

    expect(resolved.profile).toBe("coding");
    expect(resolved.effectiveProfileSource).toBe("agent");
    expect(resolved.localPolicyExplicit).toBe(true);
    expect(access[0]).toMatchObject({
      allowed: true,
      effectiveProfileSource: "agent",
      localPolicyExplicit: true,
    });
  });

  it("keeps global deny precedence over explicit agent allow", () => {
    const cfg = {
      tools: {
        deny: ["exec"],
      },
      agents: {
        list: [
          {
            id: "execution-coding",
            tools: {
              allow: ["read", "exec"],
            },
          },
        ],
      },
    } as OpenClawConfig;

    const [execAccess] = resolveEffectiveToolPolicyAccess({
      config: cfg,
      agentId: "execution-coding",
      toolNames: ["exec"],
    });

    expect(execAccess).toMatchObject({
      allowed: false,
      blockedBy: ["tools"],
      localPolicyExplicit: true,
    });
  });

  it("keeps provider deny precedence over explicit agent allow", () => {
    const cfg = {
      tools: {
        byProvider: {
          openrouter: {
            deny: ["exec"],
          },
        },
      },
      agents: {
        list: [
          {
            id: "execution-coding",
            tools: {
              allow: ["read", "exec"],
            },
          },
        ],
      },
    } as OpenClawConfig;

    const [execAccess] = resolveEffectiveToolPolicyAccess({
      config: cfg,
      agentId: "execution-coding",
      modelProvider: "openrouter",
      modelId: "moonshotai/kimi-k2",
      toolNames: ["exec"],
    });

    expect(execAccess).toMatchObject({
      allowed: false,
      blockedBy: ["tools.byProvider"],
      localPolicyExplicit: true,
    });
  });

  it("implicitly re-exposes exec and process when tools.exec is configured", () => {
    const cfg = {
      tools: {
        profile: "messaging",
        exec: { host: "sandbox" },
      },
    } as OpenClawConfig;
    const result = resolveEffectiveToolPolicy({ config: cfg });
    expect(result.profileAlsoAllow).toEqual(["exec", "process"]);
  });

  it("implicitly re-exposes read, write, and edit when tools.fs is configured", () => {
    const cfg = {
      tools: {
        profile: "messaging",
        fs: { workspaceOnly: false },
      },
    } as OpenClawConfig;
    const result = resolveEffectiveToolPolicy({ config: cfg });
    expect(result.profileAlsoAllow).toEqual(["read", "write", "edit"]);
  });

  it("merges explicit alsoAllow with implicit tool-section exposure", () => {
    const cfg = {
      tools: {
        profile: "messaging",
        alsoAllow: ["web_search"],
        exec: { host: "sandbox" },
      },
    } as OpenClawConfig;
    const result = resolveEffectiveToolPolicy({ config: cfg });
    expect(result.profileAlsoAllow).toEqual(["web_search", "exec", "process"]);
  });

  it("uses agent tool sections when resolving implicit exposure", () => {
    const cfg = {
      tools: {
        profile: "messaging",
      },
      agents: {
        list: [
          {
            id: "coder",
            tools: {
              fs: { workspaceOnly: true },
            },
          },
        ],
      },
    } as OpenClawConfig;
    const result = resolveEffectiveToolPolicy({ config: cfg, agentId: "coder" });
    expect(result.profileAlsoAllow).toEqual(["read", "write", "edit"]);
  });
});
