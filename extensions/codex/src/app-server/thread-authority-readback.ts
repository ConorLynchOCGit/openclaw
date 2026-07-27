import path from "node:path";
import type { CodexThreadResumeResponse, CodexThreadStartResponse } from "./protocol.js";
import type {
  CodexStartOrResumeThreadParams,
  CodexThreadAuthorityReadback,
} from "./thread-lifecycle-types.js";

/** Captures native thread authority and enforces the immutable Coding profile boundary. */
export function readCodexThreadAuthorityResponse(
  response: CodexThreadStartResponse | CodexThreadResumeResponse,
  params: Pick<
    CodexStartOrResumeThreadParams,
    "cwd" | "permissionProfile" | "requireSystemProfileReadback"
  >,
): CodexThreadAuthorityReadback {
  const readback = {
    cwd: response.cwd,
    runtimeWorkspaceRoots: [...response.runtimeWorkspaceRoots],
    instructionSources: [...response.instructionSources],
    ...(response.activePermissionProfile?.id
      ? { permissionProfile: response.activePermissionProfile.id }
      : {}),
  };
  if (!params.requireSystemProfileReadback) {
    return readback;
  }
  const expectedCwd = path.resolve(params.cwd);
  if (path.resolve(response.cwd) !== expectedCwd) {
    throw new Error("Codex Coding thread did not confirm its managed-worktree cwd");
  }
  if (
    response.runtimeWorkspaceRoots.length !== 1 ||
    path.resolve(response.runtimeWorkspaceRoots[0] ?? "") !== expectedCwd
  ) {
    throw new Error("Codex Coding thread did not confirm its sole managed-worktree runtime root");
  }
  if (response.instructionSources.length > 0) {
    throw new Error("Codex Coding thread loaded editable worktree instructions");
  }
  return readback;
}
