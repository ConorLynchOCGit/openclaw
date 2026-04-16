import { deriveMemoryIdentity } from "./semantic-identity.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";

export type RuntimeWriteObservation = {
  decision: "ignore" | "attach_support" | "write" | "supersede";
  identityKey?: string;
  supersededIdentityKey?: string;
};

export type RuntimeObservation = {
  capturedObjects: ModelMemoryObject[];
  writeObservations?: RuntimeWriteObservation[];
};

export type RuntimeComparisonResult = {
  matchedIdentityKeys: string[];
  modelOnlyIdentityKeys: string[];
  legacyOnlyIdentityKeys: string[];
  duplicateDecisionDelta: number;
  supersessionDecisionDelta: number;
  omissionDivergence: boolean;
};

function toIdentityMap(objects: ModelMemoryObject[]): Map<string, ModelMemoryObject> {
  return new Map(
    objects.map((object) => [deriveMemoryIdentity(object).identityKey, object] as const),
  );
}

function countDecision(
  writeObservations: RuntimeWriteObservation[] | undefined,
  decision: RuntimeWriteObservation["decision"],
): number {
  return (writeObservations ?? []).filter((entry) => entry.decision === decision).length;
}

export function compareRuntimeObservations(
  modelMemory: RuntimeObservation,
  legacy: RuntimeObservation,
): RuntimeComparisonResult {
  const modelMap = toIdentityMap(modelMemory.capturedObjects);
  const legacyMap = toIdentityMap(legacy.capturedObjects);

  const matchedIdentityKeys = [...modelMap.keys()]
    .filter((identityKey) => legacyMap.has(identityKey))
    .toSorted((left, right) => left.localeCompare(right));
  const modelOnlyIdentityKeys = [...modelMap.keys()]
    .filter((identityKey) => !legacyMap.has(identityKey))
    .toSorted((left, right) => left.localeCompare(right));
  const legacyOnlyIdentityKeys = [...legacyMap.keys()]
    .filter((identityKey) => !modelMap.has(identityKey))
    .toSorted((left, right) => left.localeCompare(right));

  return {
    matchedIdentityKeys,
    modelOnlyIdentityKeys,
    legacyOnlyIdentityKeys,
    duplicateDecisionDelta:
      countDecision(modelMemory.writeObservations, "attach_support") -
      countDecision(legacy.writeObservations, "attach_support"),
    supersessionDecisionDelta:
      countDecision(modelMemory.writeObservations, "supersede") -
      countDecision(legacy.writeObservations, "supersede"),
    omissionDivergence:
      modelMemory.capturedObjects.length === 0 || legacy.capturedObjects.length === 0
        ? modelMemory.capturedObjects.length !== legacy.capturedObjects.length
        : false,
  };
}
