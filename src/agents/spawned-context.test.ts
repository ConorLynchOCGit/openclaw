import { describe, expect, it } from "vitest";
import {
  mapToolContextToSpawnedRunMetadata,
  normalizeSpawnedRunMetadata,
  isGatewayVisibleSourceWorkspaceDir,
  resolveGatewayVisibleSpawnedWorkspaceDir,
  resolveIngressWorkspaceOverrideForSpawnedRun,
  resolveSpawnedWorkspaceInheritance,
} from "./spawned-context.js";

describe("normalizeSpawnedRunMetadata", () => {
  it("trims text fields and drops empties", () => {
    expect(
      normalizeSpawnedRunMetadata({
        spawnedBy: "  agent:main:subagent:1 ",
        groupId: "  group-1 ",
        groupChannel: "  slack ",
        groupSpace: " ",
        workspaceDir: " /tmp/ws ",
      }),
    ).toEqual({
      spawnedBy: "agent:main:subagent:1",
      groupId: "group-1",
      groupChannel: "slack",
      workspaceDir: "/tmp/ws",
    });
  });
});

describe("mapToolContextToSpawnedRunMetadata", () => {
  it("maps agent group fields to run metadata shape", () => {
    expect(
      mapToolContextToSpawnedRunMetadata({
        agentGroupId: "g-1",
        agentGroupChannel: "telegram",
        agentGroupSpace: "topic:123",
        workspaceDir: "/tmp/ws",
      }),
    ).toEqual({
      groupId: "g-1",
      groupChannel: "telegram",
      groupSpace: "topic:123",
      workspaceDir: "/tmp/ws",
    });
  });
});

describe("resolveSpawnedWorkspaceInheritance", () => {
  const config = {
    agents: {
      list: [
        { id: "main", workspace: "/tmp/workspace-main" },
        { id: "ops", workspace: "/tmp/workspace-ops" },
      ],
    },
  };

  it("prefers explicit workspaceDir when provided", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config,
      requesterSessionKey: "agent:main:subagent:parent",
      explicitWorkspaceDir: " /tmp/explicit ",
    });
    expect(resolved).toBe("/tmp/explicit");
  });

  it("prefers targetAgentId over requester session agent for cross-agent spawns", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config,
      targetAgentId: "ops",
      requesterSessionKey: "agent:main:subagent:parent",
    });
    expect(resolved).toBe("/tmp/workspace-ops");
  });

  it("prefers target projectRoot over runtime workspace for cross-agent spawns", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config: {
        agents: {
          list: [
            {
              id: "execution-coding",
              workspace: "/root/.openclaw/workspace",
              projectRoot: "/root/services/openclaw-roles/live",
            },
            {
              id: "execution-context-scout",
              workspace: "/home/node/.openclaw/workspace",
              projectRoot: "/root/services/openclaw-roles/live",
            },
          ],
        },
      },
      targetAgentId: "execution-context-scout",
      requesterSessionKey: "agent:execution-coding:node:nrun_test",
    });
    expect(resolved).toBe("/root/services/openclaw-roles/live");
  });

  it("keeps explicit inherited projectRoot when parent and target share source root", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config: {
        agents: {
          list: [
            {
              id: "execution-coding",
              workspace: "/root/.openclaw/workspace",
              projectRoot: "/root/services/openclaw-roles/live",
            },
            {
              id: "execution-context-scout",
              workspace: "/home/node/.openclaw/workspace",
              projectRoot: "/root/services/openclaw-roles/live",
            },
          ],
        },
      },
      targetAgentId: "execution-context-scout",
      requesterSessionKey: "agent:execution-coding:node:nrun_test",
      explicitWorkspaceDir: " /root/services/openclaw-roles/live ",
    });
    expect(resolved).toBe("/root/services/openclaw-roles/live");
  });

  it("preserves explicit inherited workspace for cross-agent spawns on the same workspace root", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config: {
        agents: {
          list: [
            { id: "main", workspace: "/tmp/workspace-main" },
            { id: "ops", workspace: "/tmp/workspace-main" },
          ],
        },
      },
      targetAgentId: "ops",
      requesterSessionKey: "agent:main:subagent:parent",
      explicitWorkspaceDir: " /tmp/workspace-main ",
    });
    expect(resolved).toBe("/tmp/workspace-main");
  });

  it("falls back to requester session agent when targetAgentId is missing", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config,
      requesterSessionKey: "agent:main:subagent:parent",
    });
    expect(resolved).toBe("/tmp/workspace-main");
  });

  it("returns undefined for missing requester context", () => {
    const resolved = resolveSpawnedWorkspaceInheritance({
      config,
      requesterSessionKey: undefined,
      explicitWorkspaceDir: undefined,
    });
    expect(resolved).toBeUndefined();
  });
});

describe("resolveIngressWorkspaceOverrideForSpawnedRun", () => {
  it("forwards workspace only for spawned runs", () => {
    expect(
      resolveIngressWorkspaceOverrideForSpawnedRun({
        spawnedBy: "agent:main:subagent:parent",
        workspaceDir: "/tmp/ws",
      }),
    ).toBe("/tmp/ws");
    expect(
      resolveIngressWorkspaceOverrideForSpawnedRun({
        spawnedBy: "",
        workspaceDir: "/tmp/ws",
      }),
    ).toBeUndefined();
  });
});

describe("resolveGatewayVisibleSpawnedWorkspaceDir", () => {
  it("maps canonical repo workspaces to the gateway-visible repo mount", () => {
    expect(
      resolveGatewayVisibleSpawnedWorkspaceDir(
        "/root/services/openclaw-roles/live/extensions/execution-platform",
        {
          OPENCLAW_HOST_OPERATOR_REPO_ROOT: "/home/node/.openclaw/host-operator/openclaw-live",
        },
      ),
    ).toBe("/home/node/.openclaw/host-operator/openclaw-live/extensions/execution-platform");
  });

  it("maps canonical operator workspaces to the gateway-visible workspace mount", () => {
    expect(
      resolveGatewayVisibleSpawnedWorkspaceDir("/root/.openclaw/workspace/docs", {
        OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT: "/home/node/.openclaw/workspace",
      }),
    ).toBe("/home/node/.openclaw/workspace/docs");
  });

  it("leaves unrelated workspaces unchanged", () => {
    expect(resolveGatewayVisibleSpawnedWorkspaceDir("/tmp/agent-work", {})).toBe("/tmp/agent-work");
  });

  it("honors explicit host-operator runtime roots from environment", () => {
    expect(
      resolveGatewayVisibleSpawnedWorkspaceDir("/canonical/repo/src", {
        OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT: "/canonical/repo",
        OPENCLAW_HOST_OPERATOR_REPO_ROOT: "/runtime/repo",
      }),
    ).toBe("/runtime/repo/src");
  });
});

describe("isGatewayVisibleSourceWorkspaceDir", () => {
  it("identifies the gateway-visible source root and descendants", () => {
    expect(
      isGatewayVisibleSourceWorkspaceDir("/home/node/.openclaw/host-operator/openclaw-live", {
        OPENCLAW_HOST_OPERATOR_REPO_ROOT: "/home/node/.openclaw/host-operator/openclaw-live",
      }),
    ).toBe(true);
    expect(
      isGatewayVisibleSourceWorkspaceDir(
        "/home/node/.openclaw/host-operator/openclaw-live/extensions/execution-platform",
        {
          OPENCLAW_HOST_OPERATOR_REPO_ROOT: "/home/node/.openclaw/host-operator/openclaw-live",
        },
      ),
    ).toBe(true);
  });

  it("honors host-operator source root overrides", () => {
    expect(
      isGatewayVisibleSourceWorkspaceDir("/runtime/repo/src", {
        OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT: "/canonical/repo",
        OPENCLAW_HOST_OPERATOR_REPO_ROOT: "/runtime/repo",
      }),
    ).toBe(true);
  });

  it("rejects unrelated workspaces", () => {
    expect(isGatewayVisibleSourceWorkspaceDir("/home/node/.openclaw/workspace")).toBe(false);
  });
});
