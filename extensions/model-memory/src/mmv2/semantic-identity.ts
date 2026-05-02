import { createHash } from "node:crypto";
import type { CanonicalCandidate, ExistingMemorySummary } from "./contracts.ts";
import { normalizeComparisonText } from "./proof-compare-shared.ts";

export type ClaimSemanticIdentity = {
  claimType: string;
  subject: string;
  predicate: string;
  object: string;
};

type EffectiveScope = {
  applies_to: string;
  subject_type: string;
  subject_id: string | null;
  project_id: string | null;
  workspace_id: string | null;
};

function normalizeScopeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getEffectiveScope(scope: Record<string, unknown>): EffectiveScope {
  return {
    applies_to: typeof scope.applies_to === "string" ? scope.applies_to : "unknown",
    subject_type: typeof scope.subject_type === "string" ? scope.subject_type : "unknown",
    subject_id: normalizeScopeId(scope.subject_id),
    project_id: normalizeScopeId(scope.project_id),
    workspace_id: normalizeScopeId(scope.workspace_id),
  };
}

export function effectiveScopesEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const a = getEffectiveScope(left);
  const b = getEffectiveScope(right);
  return (
    a.applies_to === b.applies_to &&
    a.subject_type === b.subject_type &&
    a.subject_id === b.subject_id &&
    a.project_id === b.project_id &&
    a.workspace_id === b.workspace_id
  );
}

function scopeSpecificity(scope: EffectiveScope): number {
  const appliesToScore =
    scope.applies_to === "global"
      ? 0
      : scope.applies_to === "current_workspace"
        ? 1
        : scope.applies_to === "current_project"
          ? 2
          : scope.applies_to === "specific_entity"
            ? 3
            : scope.applies_to === "current_session_only"
              ? 4
              : 0;
  return (
    appliesToScore +
    (scope.subject_id ? 1 : 0) +
    (scope.project_id ? 1 : 0) +
    (scope.workspace_id ? 1 : 0)
  );
}

export function isNarrowerEffectiveScope(
  candidateScope: Record<string, unknown>,
  baselineScope: Record<string, unknown>,
): boolean {
  const candidate = getEffectiveScope(candidateScope);
  const baseline = getEffectiveScope(baselineScope);
  return (
    !effectiveScopesEqual(candidateScope, baselineScope) &&
    scopeSpecificity(candidate) > scopeSpecificity(baseline)
  );
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function normalizeSemanticIdentityValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return normalizeComparisonText(value).replace(/\s+/gu, " ").trim();
}

function sourceRefFamily(locator: string): string {
  const normalized = locator.replace(/\\/gu, "/").replace(/\/+/gu, "/");
  const rawParts = normalized.split("/").filter(Boolean);
  if (rawParts.length === 0) {
    return normalized;
  }
  const last = rawParts[rawParts.length - 1] ?? "";
  if (/^index(\.[a-z0-9]+)?$/iu.test(last) && rawParts.length > 1) {
    return normalizeSemanticIdentityValue(rawParts[rawParts.length - 2] ?? "");
  }
  return normalizeSemanticIdentityValue(last.replace(/\.[a-z0-9]+$/iu, ""));
}

export function sourceRefsShareFamily(leftLocator: string, rightLocator: string): boolean {
  const left = sourceRefFamily(leftLocator);
  const right = sourceRefFamily(rightLocator);
  return left.length > 0 && left === right;
}

function canonicalPayloadField(payload: Record<string, unknown>, key: string): string {
  return normalizeSemanticIdentityValue(payload[key]);
}

function buildClaimIdentity(input: { payload: Record<string, unknown> }): ClaimSemanticIdentity {
  return {
    claimType: canonicalPayloadField(input.payload, "claim_type"),
    subject: canonicalPayloadField(input.payload, "subject"),
    predicate: canonicalPayloadField(input.payload, "predicate"),
    object: canonicalPayloadField(input.payload, "object"),
  };
}

export function describeCanonicalClaimIdentity(
  candidate: CanonicalCandidate,
): ClaimSemanticIdentity {
  return buildClaimIdentity({
    payload: candidate.payload,
  });
}

export function describeExistingClaimIdentity(
  memory: ExistingMemorySummary,
): ClaimSemanticIdentity {
  return buildClaimIdentity({
    payload: memory.payload,
  });
}

export function createCanonicalSemanticKey(candidate: CanonicalCandidate): string {
  if (candidate.kind === "claim") {
    const claim = describeCanonicalClaimIdentity(candidate);
    return ["claim", claim.claimType, claim.subject, claim.predicate, claim.object].join(":");
  }
  if (candidate.kind === "directive") {
    return [
      "directive",
      canonicalPayloadField(candidate.payload, "directive_type"),
      canonicalPayloadField(candidate.payload, "target"),
      canonicalPayloadField(candidate.payload, "trigger"),
      canonicalPayloadField(candidate.payload, "action"),
    ].join(":");
  }
  if (candidate.kind === "source_ref") {
    return `source_ref:${canonicalPayloadField(candidate.payload, "locator")}`;
  }
  if (candidate.kind === "episode") {
    return [
      "episode",
      canonicalPayloadField(candidate.payload, "event_type"),
      canonicalPayloadField(candidate.payload, "actor"),
      canonicalPayloadField(candidate.payload, "action"),
      canonicalPayloadField(candidate.payload, "object"),
    ].join(":");
  }
  if (candidate.artifact_type) {
    return `${candidate.artifact_type}:${stableHash(candidate.content_hash || candidate.canonical_text)}`;
  }
  return `candidate:${stableHash(candidate.canonical_text)}`;
}

export function createExistingMemorySemanticKey(memory: ExistingMemorySummary): string {
  if (memory.kind === "claim") {
    const claim = describeExistingClaimIdentity(memory);
    return ["claim", claim.claimType, claim.subject, claim.predicate, claim.object].join(":");
  }
  if (memory.kind === "directive") {
    return [
      "directive",
      canonicalPayloadField(memory.payload, "directive_type"),
      canonicalPayloadField(memory.payload, "target"),
      canonicalPayloadField(memory.payload, "trigger"),
      canonicalPayloadField(memory.payload, "action"),
    ].join(":");
  }
  if (memory.kind === "source_ref") {
    return `source_ref:${canonicalPayloadField(memory.payload, "locator")}`;
  }
  if (memory.kind === "episode") {
    return [
      "episode",
      canonicalPayloadField(memory.payload, "event_type"),
      canonicalPayloadField(memory.payload, "actor"),
      canonicalPayloadField(memory.payload, "action"),
      canonicalPayloadField(memory.payload, "object"),
    ].join(":");
  }
  if (typeof memory.artifact_type === "string" && memory.artifact_type.length > 0) {
    return `${memory.artifact_type}:${stableHash(memory.canonical_text)}`;
  }
  return `memory:${stableHash(memory.canonical_text)}`;
}
