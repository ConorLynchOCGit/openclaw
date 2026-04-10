import type { MemoryObjectRecord } from "./db/runtime.js";
import {
  readCanonicalFirstMetadataString,
  readCanonicalMemoryRecordFromMetadata,
} from "./memory-canonical-compat.js";
import { resolveProjectionAgentKey } from "./native-memory-projection-routing.js";

export type NativeMemoryProjectionScopeKind = "shared" | "project" | "agent" | "session";

export type NativeMemoryProjectionScope = {
  kind: NativeMemoryProjectionScopeKind;
  agentKey?: string;
  projectScoped: boolean;
  sessionKey?: string;
};

const SHARED_WORKSPACE_AGENT_KEYS = new Set(["main", "chief"]);

function normalizeAgentKey(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveSessionKey(record: MemoryObjectRecord): string | undefined {
  return (
    readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "sessionKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "sessionKey",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "sessionKey"]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "sessionKey"])
  );
}

function isSessionContinuityTagged(record: MemoryObjectRecord): boolean {
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  const tags = new Set(canonical?.tags ?? []);
  return (
    tags.has("session_continuity") ||
    tags.has("session_memory") ||
    tags.has("daily_continuity") ||
    canonical?.facets.scopeType === "session"
  );
}

function isProjectScoped(record: MemoryObjectRecord): boolean {
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  return (
    record.memoryKind === "project" ||
    (typeof record.projectId === "string" && record.projectId.length > 0) ||
    typeof canonical?.facets.projectScope === "string" ||
    typeof readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "projectScope",
    ]) === "string" ||
    typeof readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "projectScope",
    ]) === "string" ||
    typeof readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "projectScope"]) ===
      "string" ||
    typeof readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "projectScope"]) ===
      "string"
  );
}

export function resolveNativeMemoryProjectionScope(
  record: MemoryObjectRecord,
): NativeMemoryProjectionScope {
  const agentKey = normalizeAgentKey(resolveProjectionAgentKey(record));
  const projectScoped = isProjectScoped(record);
  const sessionKey = resolveSessionKey(record);

  if (isSessionContinuityTagged(record)) {
    return {
      kind: "session",
      ...(agentKey ? { agentKey } : {}),
      projectScoped,
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  if (agentKey && !SHARED_WORKSPACE_AGENT_KEYS.has(agentKey)) {
    return {
      kind: "agent",
      agentKey,
      projectScoped,
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  if (projectScoped) {
    return {
      kind: "project",
      projectScoped,
      ...(agentKey ? { agentKey } : {}),
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  return {
    kind: "shared",
    projectScoped: false,
    ...(agentKey ? { agentKey } : {}),
    ...(sessionKey ? { sessionKey } : {}),
  };
}

export function isSharedProjectionScope(scope: NativeMemoryProjectionScope): boolean {
  return scope.kind === "shared";
}

export function isProjectProjectionScope(scope: NativeMemoryProjectionScope): boolean {
  return scope.kind === "project";
}

export function isAgentProjectionScope(scope: NativeMemoryProjectionScope): boolean {
  return scope.kind === "agent" && typeof scope.agentKey === "string" && scope.agentKey.length > 0;
}
