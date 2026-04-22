import { normalizeAgentId, parseAgentSessionKey } from "../../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import type { SessionEntry, SessionRetentionClass, SessionVisibilityClass } from "./types.js";

const PROOF_SESSION_KEY_PREFIX = "codex-";
const PROOF_SESSION_KEY_PREFIX_ALT = "proof-";
const PROOF_SESSION_KEY_PREFIX_VALIDATION = "validation-";
const SYSTEM_SESSION_SUFFIX = ":heartbeat";
const PROOF_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const INTERNAL_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const SYSTEM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const INTERNAL_SURFACE_HINTS = new Set(["internal", "background", "subagent", "system"]);
const PROOF_SURFACE_HINTS = new Set(["proof", "codex", "validation", "test"]);

export function hasUserFacingSessionMetadata(
  entry?: Pick<SessionEntry, "displayName" | "subject" | "label"> | null,
): boolean {
  return Boolean(
    normalizeOptionalString(entry?.displayName) ||
    normalizeOptionalString(entry?.subject) ||
    normalizeOptionalString(entry?.label),
  );
}

function matchesProofSessionKey(requestKey: string): boolean {
  return (
    requestKey.startsWith(PROOF_SESSION_KEY_PREFIX) ||
    requestKey.startsWith(PROOF_SESSION_KEY_PREFIX_ALT) ||
    requestKey.startsWith(PROOF_SESSION_KEY_PREFIX_VALIDATION)
  );
}

function deriveOriginSurface(entry?: SessionEntry): string {
  return normalizeLowercaseStringOrEmpty(entry?.origin?.surface ?? "");
}

function isProofHintedEntry(entry?: SessionEntry): boolean {
  const surface = deriveOriginSurface(entry);
  if (PROOF_SURFACE_HINTS.has(surface)) {
    return true;
  }
  const label = normalizeLowercaseStringOrEmpty(entry?.label ?? "");
  if (label === "proof" || label === "codex") {
    return true;
  }
  const displayName = normalizeLowercaseStringOrEmpty(entry?.displayName ?? "");
  const originLabel = normalizeLowercaseStringOrEmpty(entry?.origin?.label ?? "");
  if (displayName.startsWith("codex-") || displayName.startsWith("proof-")) {
    return true;
  }
  return originLabel.startsWith("codex-") || originLabel.startsWith("proof-");
}

function isInternalEntry(entry?: SessionEntry): boolean {
  if (!entry) {
    return false;
  }
  if (entry.spawnedBy || entry.subagentRole === "leaf") {
    return true;
  }
  const surface = deriveOriginSurface(entry);
  return INTERNAL_SURFACE_HINTS.has(surface);
}

export function deriveSessionVisibilityClass(params: {
  key: string;
  entry?: SessionEntry;
}): SessionVisibilityClass {
  const existing = params.entry?.visibilityClass;

  const loweredKey = normalizeLowercaseStringOrEmpty(params.key);
  if (
    loweredKey === "global" ||
    loweredKey === "unknown" ||
    loweredKey.endsWith(SYSTEM_SESSION_SUFFIX) ||
    params.entry?.heartbeatIsolatedBaseSessionKey
  ) {
    return "system";
  }

  const parsed = parseAgentSessionKey(params.key);
  const requestKey = normalizeLowercaseStringOrEmpty(parsed?.rest ?? "");
  const isCanonicalMainSession =
    parsed && normalizeAgentId(parsed.agentId) === "main" && requestKey === "main";
  if (isCanonicalMainSession) {
    return "operator";
  }
  const staleStoredProofForUserFacingMainSession =
    existing === "proof" &&
    parsed &&
    normalizeAgentId(parsed.agentId) === "main" &&
    hasUserFacingSessionMetadata(params.entry) &&
    !matchesProofSessionKey(requestKey) &&
    !isProofHintedEntry(params.entry);
  if (staleStoredProofForUserFacingMainSession) {
    return "operator";
  }
  const legacyOperatorProofMismatch =
    existing === "operator" &&
    params.entry?.retentionClass === "standard" &&
    params.entry?.systemSent === true;
  if (
    parsed &&
    normalizeAgentId(parsed.agentId) === "main" &&
    (matchesProofSessionKey(requestKey) ||
      isProofHintedEntry(params.entry) ||
      legacyOperatorProofMismatch) &&
    !hasUserFacingSessionMetadata(params.entry)
  ) {
    return "proof";
  }

  if (existing) {
    return existing;
  }

  if (
    parsed &&
    normalizeAgentId(parsed.agentId) !== "main" &&
    isInternalEntry(params.entry) &&
    !hasUserFacingSessionMetadata(params.entry)
  ) {
    return "internal";
  }

  return "operator";
}

export function deriveSessionRetentionClass(params: {
  key: string;
  entry?: SessionEntry;
}): SessionRetentionClass {
  const existing = params.entry?.retentionClass;
  const visibilityClass = deriveSessionVisibilityClass(params);
  const staleStoredOperatorRetention = existing === "standard" && visibilityClass !== "operator";
  const staleStoredNonOperatorRetention =
    existing !== undefined && existing !== "standard" && visibilityClass === "operator";
  if (existing && !staleStoredOperatorRetention && !staleStoredNonOperatorRetention) {
    return existing;
  }
  switch (visibilityClass) {
    case "proof":
      return "proof_short";
    case "internal":
      return "internal_short";
    case "system":
      return "system_short";
    default:
      return "standard";
  }
}

export function resolveSessionRetentionMs(params: {
  key: string;
  entry?: SessionEntry;
  defaultMs: number;
}): number {
  switch (deriveSessionRetentionClass(params)) {
    case "proof_short":
      return Math.min(params.defaultMs, PROOF_RETENTION_MS);
    case "internal_short":
      return Math.min(params.defaultMs, INTERNAL_RETENTION_MS);
    case "system_short":
      return Math.min(params.defaultMs, SYSTEM_RETENTION_MS);
    default:
      return params.defaultMs;
  }
}

export function shouldHideSessionFromOperatorSelector(params: {
  key: string;
  entry?: SessionEntry;
}): boolean {
  const visibilityClass = deriveSessionVisibilityClass(params);
  return (
    visibilityClass === "proof" || visibilityClass === "internal" || visibilityClass === "system"
  );
}

export function normalizeSessionVisibilityMetadata(params: {
  key: string;
  entry: SessionEntry;
}): SessionEntry {
  const visibilityClass = deriveSessionVisibilityClass(params);
  const retentionClass = deriveSessionRetentionClass(params);
  if (
    params.entry.visibilityClass === visibilityClass &&
    params.entry.retentionClass === retentionClass
  ) {
    return params.entry;
  }
  return {
    ...params.entry,
    visibilityClass,
    retentionClass,
  };
}
