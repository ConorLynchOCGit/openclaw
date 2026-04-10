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
  projectSlug?: string;
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
  return resolveProjectScope(record) !== undefined;
}

function resolveProjectScope(record: MemoryObjectRecord): string | undefined {
  const canonical = readCanonicalMemoryRecordFromMetadata(record.metadata);
  const value =
    (typeof canonical?.facets.projectScope === "string"
      ? canonical.facets.projectScope
      : undefined) ??
    readCanonicalFirstMetadataString(record.metadata, [
      "candidateMetadata",
      "autoCapture",
      "projectScope",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, [
      "promotionMetadata",
      "autoPromotion",
      "projectScope",
    ]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoCapture", "projectScope"]) ??
    readCanonicalFirstMetadataString(record.metadata, ["autoPromotion", "projectScope"]) ??
    (typeof record.projectId === "string" && record.projectId.trim().length > 0
      ? record.projectId
      : undefined) ??
    (record.memoryKind === "project" ? "project" : undefined);
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveNativeMemoryProjectionScope(
  record: MemoryObjectRecord,
): NativeMemoryProjectionScope {
  const agentKey = normalizeAgentKey(resolveProjectionAgentKey(record));
  const projectScoped = isProjectScoped(record);
  const projectSlug = resolveProjectScope(record);
  const sessionKey = resolveSessionKey(record);

  if (isSessionContinuityTagged(record)) {
    return {
      kind: "session",
      ...(agentKey ? { agentKey } : {}),
      projectScoped,
      ...(projectSlug ? { projectSlug } : {}),
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  if (agentKey && !SHARED_WORKSPACE_AGENT_KEYS.has(agentKey)) {
    return {
      kind: "agent",
      agentKey,
      projectScoped,
      ...(projectSlug ? { projectSlug } : {}),
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  if (projectScoped) {
    return {
      kind: "project",
      projectScoped,
      ...(projectSlug ? { projectSlug } : {}),
      ...(agentKey ? { agentKey } : {}),
      ...(sessionKey ? { sessionKey } : {}),
    };
  }

  return {
    kind: "shared",
    projectScoped: false,
    ...(projectSlug ? { projectSlug } : {}),
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

export function isEligibleForProjectProjection(scope: NativeMemoryProjectionScope): boolean {
  return scope.kind !== "session" && scope.projectScoped;
}
