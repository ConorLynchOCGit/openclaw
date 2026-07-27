import { describe, expect, it } from "vitest";
import type { CodexThreadStartResponse } from "./protocol.js";
import { readCodexThreadAuthorityResponse } from "./thread-authority-readback.js";

const WORKTREE = "/tmp/openclaw-state/worktrees/system-change-a";

function response(overrides: Partial<CodexThreadStartResponse> = {}): CodexThreadStartResponse {
  return {
    thread: { id: "thread-a", turns: [] },
    cwd: WORKTREE,
    model: "gpt-5.6-codex",
    modelProvider: "openai",
    activePermissionProfile: { id: ":workspace" },
    runtimeWorkspaceRoots: [WORKTREE],
    instructionSources: [],
    ...overrides,
  };
}

describe("Codex system generation authority", () => {
  it("accepts native confirmation of one managed-worktree authority", () => {
    expect(
      readCodexThreadAuthorityResponse(response(), {
        cwd: WORKTREE,
        permissionProfile: ":workspace",
        requireSystemProfileReadback: true,
      }),
    ).toEqual({
      cwd: WORKTREE,
      runtimeWorkspaceRoots: [WORKTREE],
      instructionSources: [],
      permissionProfile: ":workspace",
    });
  });

  it("rejects a different cwd or additional runtime workspace root", () => {
    expect(() =>
      readCodexThreadAuthorityResponse(response({ cwd: "/tmp/other" }), {
        cwd: WORKTREE,
        permissionProfile: ":workspace",
        requireSystemProfileReadback: true,
      }),
    ).toThrow("managed-worktree cwd");
    expect(() =>
      readCodexThreadAuthorityResponse(
        response({ runtimeWorkspaceRoots: [WORKTREE, "/tmp/other"] }),
        {
          cwd: WORKTREE,
          permissionProfile: ":workspace",
          requireSystemProfileReadback: true,
        },
      ),
    ).toThrow("sole managed-worktree runtime root");
  });

  it("rejects editable worktree instructions on start or resume", () => {
    expect(() =>
      readCodexThreadAuthorityResponse(
        response({ instructionSources: [`${WORKTREE}/AGENTS.md`] }),
        {
          cwd: WORKTREE,
          permissionProfile: ":workspace",
          requireSystemProfileReadback: true,
        },
      ),
    ).toThrow("loaded editable worktree instructions");
  });

  it("observes ordinary native threads without imposing the Coding boundary", () => {
    expect(
      readCodexThreadAuthorityResponse(
        response({
          cwd: "/tmp/ordinary",
          runtimeWorkspaceRoots: ["/tmp/ordinary", "/tmp/reference"],
          instructionSources: ["/tmp/ordinary/AGENTS.md"],
        }),
        {
          cwd: "/tmp/ordinary",
          requireSystemProfileReadback: false,
        },
      ),
    ).toMatchObject({
      cwd: "/tmp/ordinary",
      runtimeWorkspaceRoots: ["/tmp/ordinary", "/tmp/reference"],
      instructionSources: ["/tmp/ordinary/AGENTS.md"],
    });
  });
});
