import type { EmbeddedRunAttemptParams } from "openclaw/plugin-sdk/agent-harness-runtime";
import { isCodexAppServerStartupError } from "./attempt-timeouts.js";
import { isCodexAppServerBrokenPipeError, isCodexAppServerRequestTimeoutError } from "./client.js";

export function shouldClearSharedClientAfterStartupAbandon(error: unknown): boolean {
  return isCodexAppServerStartupError(error);
}

export function shouldClearSharedClientAfterStartupRace(error: unknown): boolean {
  return (
    shouldClearSharedClientAfterStartupAbandon(error) || isCodexAppServerRequestTimeoutError(error)
  );
}

export function shouldClearSharedClientAfterStartupFailure(params: {
  error: unknown;
  spawnedBy: EmbeddedRunAttemptParams["spawnedBy"];
}): boolean {
  if (!(params.error instanceof Error)) {
    return !params.spawnedBy;
  }
  if (isCodexAppServerBrokenPipeError(params.error)) {
    return true;
  }
  return !params.spawnedBy;
}
