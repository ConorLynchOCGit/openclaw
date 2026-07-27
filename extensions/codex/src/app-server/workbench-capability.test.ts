import { describe, expect, it, vi } from "vitest";
import {
  CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
  publishCodexExecutionSessionProjection,
  readCodexExecutionSessionProjection,
  registerCodexExecutionSessionExtension,
} from "./session-execution-projection.js";
import type { CodexLoadedSystemProfile } from "./system-profile.js";
import type { CodexAppServerThreadLifecycleBinding } from "./thread-lifecycle-types.js";

const WORKTREE = "/tmp/openclaw-worktree";

function thread(): CodexAppServerThreadLifecycleBinding {
  return {
    threadId: "thread-1",
    cwd: WORKTREE,
    model: "gpt-5.6-codex",
    modelProvider: "openai",
    appServerRuntimeFingerprint: "sha256:runtime",
    lifecycle: {
      action: "started",
      authorityReadback: {
        cwd: WORKTREE,
        runtimeWorkspaceRoots: [WORKTREE],
        instructionSources: [],
        permissionProfile: ":workspace",
      },
    },
  };
}

function systemProfile(): CodexLoadedSystemProfile {
  return {
    profileDir: "/opt/openclaw/codex/system-profile",
    projectDir: "/opt/openclaw/codex/system-profile/project",
    configLayerVersion: "sha256:profile",
    config: {},
    developerInstructions: "immutable",
    permissionProfile: ":workspace",
    agentNames: ["architect_reviewer", "implementer", "test_engineer"],
    selectedCapabilityRoots: [
      {
        id: "codex-system-skills",
        location: {
          type: "environment",
          environmentId: "local",
          path: "/opt/openclaw/codex/system-profile/skills",
        },
      },
      {
        id: "openclaw-codex-product-profile",
        location: {
          type: "environment",
          environmentId: "local",
          path: "/opt/openclaw/codex/system-profile/shared-skills",
        },
      },
    ],
  };
}

describe("Codex native execution projection", () => {
  it("publishes bounded package/profile facts without app-server inventory probes", async () => {
    const entry: {
      sessionId: string;
      pluginExtensions: {
        codex: {
          sessionCatalog: { sourceThreadId: string };
          execution?: unknown;
        };
      };
    } = {
      sessionId: "session-1",
      pluginExtensions: {
        codex: {
          sessionCatalog: { sourceThreadId: "thread-1" },
        },
      },
    };
    const patchSessionEntry = vi.fn(
      async (params: { update: (value: typeof entry) => unknown }) => {
        const patch = params.update(entry) as {
          pluginExtensions: typeof entry.pluginExtensions & {
            codex: { execution: unknown };
          };
        };
        entry.pluginExtensions = patch.pluginExtensions;
        return entry;
      },
    );

    await publishCodexExecutionSessionProjection({
      runtime: { agent: { session: { patchSessionEntry } } } as never,
      sessionKey: "agent:coding:task",
      sessionId: "session-1",
      agentId: "coding",
      thread: thread(),
      systemProfile: systemProfile(),
      appServerVersion: "0.144.1",
    });

    expect(patchSessionEntry).toHaveBeenCalledOnce();
    expect(entry.pluginExtensions.codex.sessionCatalog).toEqual({
      sourceThreadId: "thread-1",
    });
    expect(entry.pluginExtensions.codex.execution).toEqual({
      schema: CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
      threadId: "thread-1",
      action: "started",
      cwd: WORKTREE,
      model: "gpt-5.6-codex",
      modelProvider: "openai",
      permissionProfile: ":workspace",
      runtimeWorkspaceRoots: [WORKTREE],
      instructionSources: [],
      appServerVersion: "0.144.1",
      runtimeFingerprint: "sha256:runtime",
      systemProfile: {
        layerVersion: "sha256:profile",
        purposeAgents: ["architect_reviewer", "implementer", "test_engineer"],
        capabilityRoots: ["codex-system-skills", "openclaw-codex-product-profile"],
        workbenchMcp: true,
      },
    });
  });

  it("registers the projection on OpenClaw's native session-extension surface", () => {
    const registerSessionExtension = vi.fn();
    registerCodexExecutionSessionExtension({
      session: { state: { registerSessionExtension } },
    } as never);

    expect(registerSessionExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "execution",
        description: expect.any(String),
        project: expect.any(Function),
      }),
    );
    const registration = registerSessionExtension.mock.calls[0]?.[0] as {
      project: (params: { state: unknown }) => unknown;
    };
    expect(
      registration.project({
        state: {
          schema: CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
          threadId: "thread-1",
          action: "resumed",
          cwd: WORKTREE,
          runtimeWorkspaceRoots: [WORKTREE],
          instructionSources: [],
        },
      }),
    ).toMatchObject({ threadId: "thread-1", action: "resumed" });
  });

  it("rejects malformed or unbounded persisted projections", () => {
    expect(readCodexExecutionSessionProjection({ schema: "other" })).toBeUndefined();
    expect(
      readCodexExecutionSessionProjection({
        schema: CODEX_EXECUTION_SESSION_EXTENSION_SCHEMA,
        threadId: "thread-1",
        action: "started",
        cwd: WORKTREE,
        runtimeWorkspaceRoots: Array.from({ length: 65 }, () => WORKTREE),
        instructionSources: [],
      }),
    ).toBeUndefined();
  });

  it("fails closed when the native session generation changed", async () => {
    await expect(
      publishCodexExecutionSessionProjection({
        runtime: {
          agent: {
            session: {
              patchSessionEntry: async (params: {
                update: (value: { sessionId: string }) => unknown;
              }) => {
                params.update({ sessionId: "new-session" });
                return null;
              },
            },
          },
        } as never,
        sessionKey: "agent:coding:task",
        sessionId: "session-1",
        thread: thread(),
      }),
    ).rejects.toThrow("session generation changed");
  });
});
