import { deriveMemoryIdentity } from "../semantic-identity.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";

export type ObjectComparisonResult = {
  pass: boolean;
  reasons: string[];
  matchedObjectCount: number;
  expectedObjectCount: number;
  actualObjectCount: number;
  extraObjectCount: number;
  missingObjectCount: number;
};

function normalizeScope(scope: ModelMemoryObject["scope"] | undefined): string {
  return JSON.stringify(scope ?? {});
}

function isValidProvenance(object: ModelMemoryObject): boolean {
  return (
    object.provenance.length > 0 &&
    object.provenance.every((span) => Array.isArray(span.headingPath))
  );
}

type NormalizedObjectEntry = {
  object: ModelMemoryObject;
  identityKey: string;
  scope: string;
};

function normalizeObject(object: ModelMemoryObject): NormalizedObjectEntry {
  return {
    object,
    identityKey: deriveMemoryIdentity(object).identityKey,
    scope: normalizeScope(object.scope),
  };
}

export function compareCanonicalObjects(
  actual: ModelMemoryObject[],
  expected: ModelMemoryObject[],
): ObjectComparisonResult {
  const normalizedActual = actual.map(normalizeObject);
  const normalizedExpected = expected.map(normalizeObject);
  const actualByIdentity = new Map(
    normalizedActual.map((entry) => [entry.identityKey, entry] as const),
  );
  const expectedByIdentity = new Map(
    normalizedExpected.map((entry) => [entry.identityKey, entry] as const),
  );
  const reasons: string[] = [];
  let matchedObjectCount = 0;

  for (const expectedEntry of normalizedExpected) {
    const actualEntry = actualByIdentity.get(expectedEntry.identityKey);
    if (!actualEntry) {
      reasons.push(`missing_object:${expectedEntry.identityKey}`);
      continue;
    }

    const entryReasonsBefore = reasons.length;
    if (actualEntry.object.canonicalClass !== expectedEntry.object.canonicalClass) {
      reasons.push(
        `canonical_class_mismatch:${actualEntry.identityKey}:${actualEntry.object.canonicalClass}:${expectedEntry.object.canonicalClass}`,
      );
    }
    if (actualEntry.object.kind !== expectedEntry.object.kind) {
      reasons.push(
        `kind_mismatch:${actualEntry.identityKey}:${actualEntry.object.kind}:${expectedEntry.object.kind}`,
      );
    }
    if (actualEntry.scope !== expectedEntry.scope) {
      reasons.push(
        `scope_mismatch:${actualEntry.identityKey}:${actualEntry.scope}:${expectedEntry.scope}`,
      );
    }
    if (actualEntry.object.reviewMode !== expectedEntry.object.reviewMode) {
      reasons.push(
        `review_mode_mismatch:${actualEntry.identityKey}:${actualEntry.object.reviewMode}:${expectedEntry.object.reviewMode}`,
      );
    }
    if (!isValidProvenance(actualEntry.object)) {
      reasons.push(`invalid_provenance:${actualEntry.identityKey}`);
    }
    if (reasons.length === entryReasonsBefore) {
      matchedObjectCount += 1;
    }
  }

  for (const actualEntry of normalizedActual) {
    const expectedEntry = expectedByIdentity.get(actualEntry.identityKey);
    if (!expectedEntry) {
      reasons.push(`extra_object:${actualEntry.identityKey}`);
    }
  }

  const missingObjectCount = normalizedExpected.length - matchedObjectCount;
  const extraObjectCount = normalizedActual.length - matchedObjectCount;

  return {
    pass: reasons.length === 0,
    reasons,
    matchedObjectCount,
    expectedObjectCount: normalizedExpected.length,
    actualObjectCount: normalizedActual.length,
    extraObjectCount,
    missingObjectCount,
  };
}
