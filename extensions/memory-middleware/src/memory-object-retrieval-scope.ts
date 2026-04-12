import type { MemoryObjectSearchScope, MemoryObjectSemanticSearchScope } from "./db/runtime.js";

export function normalizeMemoryObjectScope(
  scope: MemoryObjectSearchScope | undefined,
): MemoryObjectSearchScope {
  return scope ?? "approved_only";
}

export function normalizeMemoryObjectSemanticScope(
  scope: MemoryObjectSemanticSearchScope | undefined,
): MemoryObjectSemanticSearchScope {
  return scope ?? "approved_only";
}

export function scopeIncludesCandidates(scope: MemoryObjectSearchScope): boolean {
  return scope === "include_candidates" || scope === "include_candidates_and_validated_procedures";
}

export function scopeIncludesValidatedProcedures(scope: MemoryObjectSearchScope): boolean {
  return (
    scope === "include_validated_procedures" ||
    scope === "include_candidates_and_validated_procedures"
  );
}
