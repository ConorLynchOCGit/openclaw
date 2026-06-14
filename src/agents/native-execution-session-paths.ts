import path from "node:path";
import { validateSessionId } from "../config/sessions/paths.js";
import { resolveRuntimeAgentWorkspaceRoots } from "./runtime-workspace-locator.js";

export function resolveNativeExecutionSessionTranscriptsDir(input: {
  agentId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  return resolveRuntimeAgentWorkspaceRoots({
    agentId: input.agentId,
    env: input.env,
  }).transcriptRoot;
}

export function resolveNativeExecutionSessionFilePath(input: {
  agentId: string;
  sessionId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  return path.join(
    resolveNativeExecutionSessionTranscriptsDir({
      agentId: input.agentId,
      env: input.env,
    }),
    `${validateSessionId(input.sessionId)}.jsonl`,
  );
}
