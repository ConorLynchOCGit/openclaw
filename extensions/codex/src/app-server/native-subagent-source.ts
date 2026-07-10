import type { CodexSessionSource, CodexSubAgentThreadSpawnSource, JsonObject } from "./protocol.js";
import { isJsonObject } from "./protocol.js";

type CodexSourceLike = CodexSessionSource | JsonObject | null | undefined;

export function readCodexSubagentThreadSpawnSource(
  source: CodexSourceLike,
  parentThreadId?: string,
): CodexSubAgentThreadSpawnSource | undefined {
  const subagent = readCodexSubagentSource(source);
  const spawn = isJsonObject(subagent?.thread_spawn) ? subagent.thread_spawn : undefined;
  if (!spawn || typeof spawn.parent_thread_id !== "string") {
    return undefined;
  }
  if (parentThreadId !== undefined && spawn.parent_thread_id !== parentThreadId) {
    return undefined;
  }
  return spawn as CodexSubAgentThreadSpawnSource;
}

export function readCodexSubagentThreadSpawnSourceFromThread(
  thread: JsonObject | null | undefined,
  parentThreadId?: string,
): CodexSubAgentThreadSpawnSource | undefined {
  const source = isJsonObject(thread?.source) ? thread.source : undefined;
  return readCodexSubagentThreadSpawnSource(source, parentThreadId);
}

function readCodexSubagentSource(source: CodexSourceLike): JsonObject | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const sourceRecord = source as JsonObject;
  return (
    (isJsonObject(sourceRecord.subAgent) ? sourceRecord.subAgent : undefined) ??
    (isJsonObject(sourceRecord.subagent) ? sourceRecord.subagent : undefined)
  );
}
