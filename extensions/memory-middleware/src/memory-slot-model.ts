import type { MemoryObjectKind } from "./db/runtime.js";
import type { CanonicalMemoryIngestionCandidateMetadataView } from "./memory-canonical-compat.js";

export type ActiveMemorySlotScopeKind = "shared" | "project" | "agent" | "session";

export type ActiveMemorySlotCategory =
  | "user_preference"
  | "user_correction"
  | "tool_preference"
  | "project_fact"
  | "project_rule"
  | "workflow_guidance"
  | "unmet_need"
  | "procedure"
  | "reference";

const SHARED_WORKSPACE_AGENT_KEYS = new Set(["main", "chief"]);

function hasTag(tags: readonly string[] | undefined, expected: string): boolean {
  return Array.isArray(tags) && tags.some((tag) => tag === expected);
}

export function normalizeActiveMemorySlotKeyToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeActiveMemorySlotAgentKey(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveActiveMemorySlotCategoryFromMemoryKind(params: {
  memoryKind: MemoryObjectKind;
  tags: readonly string[];
}): ActiveMemorySlotCategory {
  if (params.memoryKind === "reference" || params.memoryKind === "policy") {
    return "reference";
  }
  if (params.memoryKind === "project") {
    if (hasTag(params.tags, "project_rule")) {
      return "project_rule";
    }
    if (
      hasTag(params.tags, "workflow_improvement") ||
      hasTag(params.tags, "workflow_guidance") ||
      hasTag(params.tags, "validated_approach")
    ) {
      return "workflow_guidance";
    }
    if (hasTag(params.tags, "unmet_need") || hasTag(params.tags, "open_need")) {
      return "unmet_need";
    }
    return "project_fact";
  }
  if (params.memoryKind === "user") {
    return "user_preference";
  }
  if (params.memoryKind === "feedback") {
    if (
      hasTag(params.tags, "requirement_correction") ||
      hasTag(params.tags, "operator_correction") ||
      hasTag(params.tags, "correction")
    ) {
      return "user_correction";
    }
    if (hasTag(params.tags, "workflow_guidance")) {
      return "workflow_guidance";
    }
    if (hasTag(params.tags, "tool_preference")) {
      return "tool_preference";
    }
    return "user_preference";
  }
  return "reference";
}

export function resolveActiveMemorySlotCategoryFromCanonicalCandidate(
  candidate: CanonicalMemoryIngestionCandidateMetadataView | null,
): ActiveMemorySlotCategory | null {
  if (!candidate?.record.kind) {
    return null;
  }
  if (candidate.record.kind === "procedure") {
    return "procedure";
  }
  return resolveActiveMemorySlotCategoryFromMemoryKind({
    memoryKind: candidate.record.kind as MemoryObjectKind,
    tags: candidate.record.tags,
  });
}

export function resolveActiveMemorySlotScopeKind(params: {
  agentKey?: string;
  projectSlug?: string;
  sessionKey?: string;
  forceSession?: boolean;
}): ActiveMemorySlotScopeKind {
  if (params.forceSession && params.sessionKey) {
    return "session";
  }
  if (params.agentKey && !SHARED_WORKSPACE_AGENT_KEYS.has(params.agentKey)) {
    return "agent";
  }
  if (params.projectSlug) {
    return "project";
  }
  return "shared";
}

export function buildActiveMemorySlotKey(params: {
  dedupeKey?: string;
  clusterKey?: string;
  subjectKey?: string;
  subject?: string;
  statement?: string;
  fallbackText: string;
}): string {
  const canonicalIdentity =
    params.dedupeKey ??
    params.clusterKey ??
    params.subjectKey ??
    params.subject ??
    params.statement ??
    params.fallbackText;

  return normalizeActiveMemorySlotKeyToken(canonicalIdentity);
}

export function buildActiveMemorySlotSemanticKey(params: {
  scopeKind: ActiveMemorySlotScopeKind;
  projectSlug?: string;
  agentKey?: string;
  sessionKey?: string;
  dedupeKey?: string;
  clusterKey?: string;
  subjectKey?: string;
  subject?: string;
  statement?: string;
  fallbackText: string;
}): string {
  const canonicalIdentity = buildActiveMemorySlotKey({
    dedupeKey: params.dedupeKey,
    clusterKey: params.clusterKey,
    subjectKey: params.subjectKey,
    subject: params.subject,
    statement: params.statement,
    fallbackText: params.fallbackText,
  });

  return [
    params.scopeKind,
    params.projectSlug ?? "",
    params.agentKey ?? "",
    params.sessionKey ?? "",
    canonicalIdentity,
  ].join("|");
}

export function buildCategorizedActiveMemorySlotKey(params: {
  category: ActiveMemorySlotCategory;
  scopeKind: ActiveMemorySlotScopeKind;
  projectSlug?: string;
  agentKey?: string;
  sessionKey?: string;
  dedupeKey?: string;
  clusterKey?: string;
  subjectKey?: string;
  subject?: string;
  statement?: string;
  fallbackText: string;
}): string {
  const semanticKey = buildActiveMemorySlotSemanticKey({
    scopeKind: params.scopeKind,
    projectSlug: params.projectSlug,
    agentKey: params.agentKey,
    sessionKey: params.sessionKey,
    dedupeKey: params.dedupeKey,
    clusterKey: params.clusterKey,
    subjectKey: params.subjectKey,
    subject: params.subject,
    statement: params.statement,
    fallbackText: params.fallbackText,
  });
  return [params.category, semanticKey].join("|");
}

export function buildActiveMemorySlotSelectionKey(params: {
  category: ActiveMemorySlotCategory;
  scopeKind: ActiveMemorySlotScopeKind;
  projectSlug?: string;
  agentKey?: string;
  sessionKey?: string;
  subjectKey?: string;
  fieldKey?: string;
  guidancePattern?: string;
  toolKey?: string;
  subject?: string;
  statement?: string;
  fallbackText: string;
}): string {
  const semanticIdentity = normalizeActiveMemorySlotKeyToken(
    params.fieldKey ??
      params.subjectKey ??
      params.toolKey ??
      params.subject ??
      params.statement ??
      params.fallbackText,
  );

  return [
    params.category,
    params.scopeKind,
    normalizeActiveMemorySlotKeyToken(params.projectSlug ?? ""),
    normalizeActiveMemorySlotKeyToken(params.agentKey ?? ""),
    normalizeActiveMemorySlotKeyToken(params.sessionKey ?? ""),
    normalizeActiveMemorySlotKeyToken(params.guidancePattern ?? ""),
    semanticIdentity,
  ].join("|");
}
