import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  materializeAgentExecutionWorkspace,
  removeAgentExecutionWorkspaceAfterFailedAdmission,
  resolveAgentExecutionWorkspaceConfig,
} from "./execution-workspace.js";
import type { ManagedWorktreeRecord } from "./worktrees/types.js";

function config(access?: "inspect" | "modify"): OpenClawConfig {
  return {
    agents: {
      list: [
        {
          id: "worker",
          ...(access ? { executionWorkspace: { type: "loaded-source" as const, access } } : {}),
        },
      ],
    },
  };
}

function worktree(): ManagedWorktreeRecord {
  return {
    id: "wt-1",
    name: "source-worker",
    repoFingerprint: "repo",
    repoRoot: "/srv/source",
    path: "/srv/state/worktrees/source-worker",
    branch: "openclaw-system/inspect/source-worker",
    baseRef: "a".repeat(40),
    ownerKind: "session",
    ownerId: "agent:worker:subagent:1",
    createdAt: 1,
    lastActiveAt: 1,
  };
}

describe("agent execution workspace", () => {
  it("does nothing for ordinary agent workspaces", async () => {
    const resolveSource = vi.fn();
    const createWorktree = vi.fn();

    await expect(
      materializeAgentExecutionWorkspace({
        cfg: config(),
        agentId: "worker",
        ownerSessionKey: "agent:worker:subagent:1",
        deps: {
          resolveLoadedSystemSource: resolveSource,
          createWorktree,
        },
      }),
    ).resolves.toBeUndefined();
    expect(resolveSource).not.toHaveBeenCalled();
    expect(createWorktree).not.toHaveBeenCalled();
  });

  it.each([
    ["inspect", false],
    ["modify", true],
  ] as const)(
    "materializes exact loaded-source %s through isolated native setup",
    async (access, runSetupScript) => {
      const signal = new AbortController().signal;
      const created = worktree();
      const resolveSource = vi.fn(async () => ({
        sourceAnchorPath: "/srv/source",
        sourceCommit: "a".repeat(40),
      }));
      const createWorktree = vi.fn(async () => created);

      const result = await materializeAgentExecutionWorkspace({
        cfg: config(access),
        agentId: "worker",
        request: { type: "loaded-source", access },
        ownerSessionKey: "agent:worker:subagent:1",
        signal,
        deps: {
          resolveLoadedSystemSource: resolveSource,
          createWorktree,
        },
      });

      expect(resolveAgentExecutionWorkspaceConfig(config(access), "worker")).toEqual({
        type: "loaded-source",
        access,
      });
      expect(createWorktree).toHaveBeenCalledWith({
        repoRoot: "/srv/source",
        baseRef: "a".repeat(40),
        ownerKind: "session",
        ownerId: "agent:worker:subagent:1",
        setupMode: "isolated",
        runSetupScript,
        signal,
      });
      expect(result).toEqual({
        config: { type: "loaded-source", access },
        worktree: created,
      });
    },
  );

  it("rejects a request that exceeds the target role authorization", async () => {
    await expect(
      materializeAgentExecutionWorkspace({
        cfg: config("inspect"),
        agentId: "worker",
        request: { type: "loaded-source", access: "modify" },
        ownerSessionKey: "agent:worker:subagent:1",
      }),
    ).rejects.toThrow("worker is not authorized for modify loaded-source work");
  });

  it("uses native forced removal for a worktree whose session admission failed", async () => {
    const removeWorktree = vi.fn(async () => ({ removed: true }));

    await removeAgentExecutionWorkspaceAfterFailedAdmission("wt-1", { removeWorktree });

    expect(removeWorktree).toHaveBeenCalledWith({
      id: "wt-1",
      reason: "spawn-admission-failed",
      force: true,
    });
  });
});
