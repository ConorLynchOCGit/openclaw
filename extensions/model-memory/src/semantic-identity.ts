import { createHash } from "node:crypto";
import type { ModelMemoryObject } from "./semantic-schema.ts";

export type MemoryIdentityDescriptor = {
  identityKey: string;
  slotKey?: string;
  scopeKey: string;
  normalizedSubject?: string;
  normalizedTitle?: string;
  normalizedSearchText: string;
};

export type DecisiveFieldAgreementDetail = {
  field: string;
  fieldRole: "core_claim" | "packaging";
  objectValue?: string;
  candidateValue?: string;
  comparable: boolean;
  matches: boolean;
};

export type DecisiveFieldAgreement = {
  kind: ModelMemoryObject["kind"];
  decisiveFields: string[];
  matchingFields: string[];
  mismatchedFields: string[];
  hasComparableFields: boolean;
  comparableFieldCount: number;
  matchingComparableFieldCount: number;
  allComparableFieldsMatch: boolean;
  details: DecisiveFieldAgreementDetail[];
  summary: string;
};

export type SameClaimConfidence = "high" | "medium" | "low";

export type StructuralDeltaClass =
  | "packaging_only_drift"
  | "additive_operational_delta"
  | "unresolved";

export type PackagingDriftType =
  | "subject_drift"
  | "field_packing_drift"
  | "broader_narrower"
  | "extra_constraint"
  | "value_wrapper_drift";

export type StructuralSameClaimDelta = {
  isNonAdditive: boolean;
  deltaClass: StructuralDeltaClass;
  sameClaimLeaning: boolean;
  sameClaimConfidence: SameClaimConfidence;
  packagingDriftType?: PackagingDriftType;
  summary: string;
};

export type ClaimFieldComparison = {
  kind: ModelMemoryObject["kind"];
  details: DecisiveFieldAgreementDetail[];
  coreClaimDetails: DecisiveFieldAgreementDetail[];
  packagingDetails: DecisiveFieldAgreementDetail[];
  coreClaimFields: string[];
  packagingFields: string[];
  hasComparableCoreClaimFields: boolean;
  coreComparableFieldCount: number;
  matchingCoreClaimFields: string[];
  blockingCoreClaimFields: string[];
  matchingPackagingFields: string[];
  blockingPackagingFields: string[];
  coreClaimMatch: boolean;
  coreClaimSummary: string;
  packagingSummary: string;
  summary: string;
};

export type FactValueMatchProfile = {
  comparable: boolean;
  exact: boolean;
  strong: boolean;
  wrapper: boolean;
  candidateContainsObjectValue: boolean;
  objectContainsCandidateValue: boolean;
  overlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
};

export type RuleActionBundleMatchProfile = {
  comparable: boolean;
  exact: boolean;
  strong: boolean;
  moderate: boolean;
  overlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
  containsOther: boolean;
};

export type FamilyRecallDecision = "yes_now" | "yes_later" | "no";

export type FamilyRecallSignature = {
  kind: ModelMemoryObject["kind"];
  decision: FamilyRecallDecision;
  decisiveFieldNames: string[];
  bundleText?: string;
  bundleTokens: string[];
  bundleFingerprints: string[];
  secondarySubjectText?: string;
  secondarySubjectTokens: string[];
  fieldFingerprints: Record<string, string[]>;
};

export type FamilyRecallMatch = {
  kind: ModelMemoryObject["kind"];
  comparable: boolean;
  decision: FamilyRecallDecision;
  bundleOverlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
  containsOther: boolean;
  fieldFingerprintOverlapCount: number;
  strong: boolean;
  moderate: boolean;
  summary: string;
};

type ComparableMemoryShape = {
  kind: string;
  payload: Record<string, unknown>;
};

const SAME_SLOT_KINDS = new Set<ModelMemoryObject["kind"]>(["preference", "fact"]);
const RECALL_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "then",
  "this",
  "to",
  "use",
  "using",
  "when",
  "with",
]);
const FAMILY_RECALL_DECISIONS: Record<ModelMemoryObject["kind"], FamilyRecallDecision> = {
  rule: "yes_now",
  fact: "yes_now",
  procedure: "yes_now",
  preference: "yes_now",
  reference: "yes_later",
};

function hashValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeIdentityText(value: string): string {
  const trimmed = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  try {
    const url = new URL(trimmed);
    url.hash = "";
    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => normalizeIdentityText(value));
}

function normalizeOptionalComparableValue(value: unknown): string | undefined {
  return typeof value === "string" ? normalizeIdentityText(value) : undefined;
}

function normalizeComparableStringArray(value: unknown, options: { ordered: boolean }): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => normalizeOptionalComparableValue(entry))
    .filter((entry): entry is string => Boolean(entry));
  return options.ordered
    ? normalized
    : [...normalized].sort((left, right) => left.localeCompare(right));
}

type ComparableTextMatchDescriptor = {
  exact: boolean;
  strong: boolean;
  overlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
  containsOther: boolean;
};

function buildComparableTokenSet(value: string): Set<string> {
  return new Set(
    normalizeIdentityText(value)
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3),
  );
}

function buildRecallTokens(value: string): string[] {
  return normalizeIdentityText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !RECALL_STOP_WORDS.has(token));
}

function buildRecallFingerprints(tokens: string[]): string[] {
  if (tokens.length === 0) {
    return [];
  }

  const fingerprints = new Set(tokens);
  if (tokens.length >= 2) {
    for (let index = 0; index < tokens.length - 1; index += 1) {
      fingerprints.add(hashValue(`${tokens[index]} ${tokens[index + 1]}`).slice(0, 12));
    }
  }
  return [...fingerprints];
}

function overlapSets(
  leftValues: string[],
  rightValues: string[],
): {
  overlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
} {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const smallerSize = Math.min(left.size, right.size);
  const largerSize = Math.max(left.size, right.size);
  if (smallerSize === 0 || largerSize === 0) {
    return {
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
    };
  }

  let overlapCount = 0;
  for (const value of left) {
    if (right.has(value)) {
      overlapCount += 1;
    }
  }

  return {
    overlapCount,
    smallerCoverage: overlapCount / smallerSize,
    largerCoverage: overlapCount / largerSize,
  };
}

function buildFamilyRecallBundle(object: ComparableMemoryShape): {
  decisiveFieldNames: string[];
  decisiveFieldTexts: Record<string, string>;
  bundleText?: string;
  secondarySubjectText?: string;
} {
  switch (object.kind) {
    case "fact": {
      const value = normalizeOptionalComparableValue(object.payload.value);
      return {
        decisiveFieldNames: value ? ["value"] : [],
        decisiveFieldTexts: value ? { value } : {},
        bundleText: value,
        secondarySubjectText: normalizeOptionalComparableValue(object.payload.subject),
      };
    }
    case "preference": {
      const instruction = normalizeOptionalComparableValue(object.payload.instruction);
      const operation = normalizeOptionalComparableValue(object.payload.operation);
      const decisiveFieldTexts = Object.fromEntries(
        [
          instruction ? ["instruction", instruction] : undefined,
          operation ? ["operation", operation] : undefined,
        ].filter((entry): entry is [string, string] => Boolean(entry)),
      );
      const bundleText = [instruction, operation].filter(Boolean).join(" | ") || undefined;
      return {
        decisiveFieldNames: Object.keys(decisiveFieldTexts),
        decisiveFieldTexts,
        bundleText,
        secondarySubjectText: normalizeOptionalComparableValue(object.payload.subject),
      };
    }
    case "rule": {
      const recommendedAction = normalizeOptionalComparableValue(object.payload.recommendedAction);
      const avoidAction = normalizeOptionalComparableValue(object.payload.avoidAction);
      const neededCapability = normalizeOptionalComparableValue(object.payload.neededCapability);
      const decisiveFieldTexts = Object.fromEntries(
        [
          recommendedAction ? ["recommendedAction", recommendedAction] : undefined,
          avoidAction ? ["avoidAction", avoidAction] : undefined,
          neededCapability ? ["neededCapability", neededCapability] : undefined,
        ].filter((entry): entry is [string, string] => Boolean(entry)),
      );
      const bundleText =
        [recommendedAction, avoidAction, neededCapability].filter(Boolean).join(" | ") || undefined;
      return {
        decisiveFieldNames: Object.keys(decisiveFieldTexts),
        decisiveFieldTexts,
        bundleText,
        secondarySubjectText: normalizeOptionalComparableValue(object.payload.subject),
      };
    }
    case "procedure": {
      const steps = normalizeComparableStringArray(object.payload.steps, { ordered: true });
      const successShape = normalizeOptionalComparableValue(object.payload.successShape);
      const failureShape = normalizeOptionalComparableValue(object.payload.failureShape);
      const decisiveFieldTexts = Object.fromEntries(
        [
          steps.length > 0 ? ["steps", steps.join(" -> ")] : undefined,
          successShape ? ["successShape", successShape] : undefined,
          failureShape ? ["failureShape", failureShape] : undefined,
        ].filter((entry): entry is [string, string] => Boolean(entry)),
      );
      const bundleText =
        [steps.join(" -> "), successShape, failureShape]
          .filter((value) => value && value.length > 0)
          .join(" | ") || undefined;
      return {
        decisiveFieldNames: Object.keys(decisiveFieldTexts),
        decisiveFieldTexts,
        bundleText,
        secondarySubjectText: normalizeOptionalComparableValue(object.payload.title),
      };
    }
    case "reference": {
      const task = normalizeOptionalComparableValue(object.payload.task);
      const primaryResource = normalizeOptionalComparableValue(object.payload.primaryResource);
      const companionResources = normalizeComparableStringArray(object.payload.companionResources, {
        ordered: false,
      });
      const decisiveFieldTexts = Object.fromEntries(
        [
          task ? ["task", task] : undefined,
          primaryResource ? ["primaryResource", primaryResource] : undefined,
          companionResources.length > 0
            ? ["companionResources", companionResources.join(" | ")]
            : undefined,
        ].filter((entry): entry is [string, string] => Boolean(entry)),
      );
      const bundleText =
        [task, primaryResource, companionResources.join(" | ")]
          .filter((value) => value && value.length > 0)
          .join(" | ") || undefined;
      return {
        decisiveFieldNames: Object.keys(decisiveFieldTexts),
        decisiveFieldTexts,
        bundleText,
        secondarySubjectText: undefined,
      };
    }
    default:
      return {
        decisiveFieldNames: [],
        decisiveFieldTexts: {},
        bundleText: undefined,
        secondarySubjectText: undefined,
      };
  }
}

export function familyRecallDecisionForKind(kind: ModelMemoryObject["kind"]): FamilyRecallDecision {
  return FAMILY_RECALL_DECISIONS[kind];
}

export function buildFamilyRecallSignature(object: ComparableMemoryShape): FamilyRecallSignature {
  const bundle = buildFamilyRecallBundle(object);
  const fieldFingerprints = Object.fromEntries(
    Object.entries(bundle.decisiveFieldTexts).map(([field, value]) => [
      field,
      buildRecallFingerprints(buildRecallTokens(value)),
    ]),
  );
  const bundleTokens = bundle.bundleText ? buildRecallTokens(bundle.bundleText) : [];
  const secondarySubjectTokens = bundle.secondarySubjectText
    ? buildRecallTokens(bundle.secondarySubjectText)
    : [];

  return {
    kind: object.kind as ModelMemoryObject["kind"],
    decision: familyRecallDecisionForKind(object.kind as ModelMemoryObject["kind"]),
    decisiveFieldNames: bundle.decisiveFieldNames,
    bundleText: bundle.bundleText,
    bundleTokens,
    bundleFingerprints: buildRecallFingerprints(bundleTokens),
    secondarySubjectText: bundle.secondarySubjectText,
    secondarySubjectTokens,
    fieldFingerprints,
  };
}

export function describeFamilyRecallMatch(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): FamilyRecallMatch {
  if (object.kind !== candidate.kind) {
    return {
      kind: object.kind as ModelMemoryObject["kind"],
      comparable: false,
      decision: familyRecallDecisionForKind(object.kind as ModelMemoryObject["kind"]),
      bundleOverlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
      containsOther: false,
      fieldFingerprintOverlapCount: 0,
      strong: false,
      moderate: false,
      summary: "kind mismatch",
    };
  }

  const objectSignature = buildFamilyRecallSignature(object);
  const candidateSignature = buildFamilyRecallSignature(candidate);
  const bundleOverlap = overlapSets(
    objectSignature.bundleFingerprints,
    candidateSignature.bundleFingerprints,
  );
  const fieldFingerprintOverlapCount = Object.keys(objectSignature.fieldFingerprints).reduce(
    (count, field) => {
      const objectFingerprints = objectSignature.fieldFingerprints[field] ?? [];
      const candidateFingerprints = candidateSignature.fieldFingerprints[field] ?? [];
      const overlap = overlapSets(objectFingerprints, candidateFingerprints);
      return overlap.overlapCount > 0 ? count + 1 : count;
    },
    0,
  );
  const containsOther =
    Boolean(objectSignature.bundleText) &&
    Boolean(candidateSignature.bundleText) &&
    (objectSignature.bundleText!.includes(candidateSignature.bundleText!) ||
      candidateSignature.bundleText!.includes(objectSignature.bundleText!));
  const strong =
    (bundleOverlap.overlapCount >= 4 &&
      bundleOverlap.smallerCoverage >= 0.7 &&
      bundleOverlap.largerCoverage >= 0.45) ||
    (containsOther && bundleOverlap.overlapCount >= 3 && bundleOverlap.smallerCoverage >= 0.7);
  const moderate =
    strong ||
    (bundleOverlap.overlapCount >= 3 &&
      bundleOverlap.smallerCoverage >= 0.55 &&
      (bundleOverlap.largerCoverage >= 0.35 || containsOther)) ||
    (fieldFingerprintOverlapCount > 0 &&
      bundleOverlap.overlapCount >= 2 &&
      bundleOverlap.smallerCoverage >= 0.45);

  return {
    kind: object.kind as ModelMemoryObject["kind"],
    comparable:
      objectSignature.bundleFingerprints.length > 0 &&
      candidateSignature.bundleFingerprints.length > 0,
    decision: objectSignature.decision,
    bundleOverlapCount: bundleOverlap.overlapCount,
    smallerCoverage: bundleOverlap.smallerCoverage,
    largerCoverage: bundleOverlap.largerCoverage,
    containsOther,
    fieldFingerprintOverlapCount,
    strong,
    moderate,
    summary:
      objectSignature.bundleFingerprints.length === 0 ||
      candidateSignature.bundleFingerprints.length === 0
        ? "no family recall bundle available"
        : `bundle_overlap=${bundleOverlap.overlapCount}; smaller=${bundleOverlap.smallerCoverage.toFixed(2)}; larger=${bundleOverlap.largerCoverage.toFixed(2)}; field_overlap=${fieldFingerprintOverlapCount}`,
  };
}

function describeComparableTextMatch(
  objectValue: string | undefined,
  candidateValue: string | undefined,
): ComparableTextMatchDescriptor {
  if (objectValue === undefined || candidateValue === undefined) {
    return {
      exact: false,
      strong: false,
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
      containsOther: false,
    };
  }
  if (objectValue === candidateValue) {
    return {
      exact: true,
      strong: true,
      overlapCount: buildComparableTokenSet(objectValue).size,
      smallerCoverage: 1,
      largerCoverage: 1,
      containsOther: true,
    };
  }

  const leftTokens = buildComparableTokenSet(objectValue);
  const rightTokens = buildComparableTokenSet(candidateValue);
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  const largerSize = Math.max(leftTokens.size, rightTokens.size);
  if (smallerSize === 0 || largerSize === 0) {
    return {
      exact: false,
      strong: false,
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
      containsOther: false,
    };
  }

  let overlapCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlapCount += 1;
    }
  }

  const smallerCoverage = overlapCount / smallerSize;
  const largerCoverage = overlapCount / largerSize;
  const containsOther =
    objectValue.includes(candidateValue) || candidateValue.includes(objectValue);
  const strong = overlapCount >= 4 && smallerCoverage >= 0.9 && largerCoverage >= 0.7;

  return {
    exact: false,
    strong,
    overlapCount,
    smallerCoverage,
    largerCoverage,
    containsOther,
  };
}

function hasStrongComparableTextMatch(
  objectValue: string | undefined,
  candidateValue: string | undefined,
): boolean {
  return describeComparableTextMatch(objectValue, candidateValue).strong;
}

function hasStrongComparableArrayMatch(
  objectValue: string[] | undefined,
  candidateValue: string[] | undefined,
): boolean {
  if (!objectValue || !candidateValue) {
    return false;
  }
  if (objectValue.length !== candidateValue.length) {
    return false;
  }
  return objectValue.every((value, index) =>
    hasStrongComparableTextMatch(value, candidateValue[index]),
  );
}

function formatComparableValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value.join(" | ") : value;
}

function buildRuleActionBundle(payload: Record<string, unknown>): string | undefined {
  const parts = [
    normalizeOptionalComparableValue(payload.recommendedAction),
    normalizeOptionalComparableValue(payload.avoidAction),
    normalizeOptionalComparableValue(payload.neededCapability),
  ].filter((value): value is string => Boolean(value));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(" | ");
}

export function hasStrongRuleActionBundleRecallMatch(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): boolean {
  return describeRuleActionBundleMatchProfile(object, candidate).strong;
}

export function describeRuleActionBundleMatchProfile(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): RuleActionBundleMatchProfile {
  if (object.kind !== "rule" || candidate.kind !== "rule") {
    return {
      comparable: false,
      exact: false,
      strong: false,
      moderate: false,
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
      containsOther: false,
    };
  }
  const objectBundle = buildRuleActionBundle(object.payload);
  const candidateBundle = buildRuleActionBundle(candidate.payload);
  const match = describeComparableTextMatch(objectBundle, candidateBundle);
  const strong =
    match.strong ||
    (match.overlapCount >= 5 &&
      match.smallerCoverage >= 0.85 &&
      match.largerCoverage >= 0.5 &&
      match.containsOther);
  const moderate =
    strong ||
    (match.overlapCount >= 4 &&
      match.smallerCoverage >= 0.6 &&
      (match.largerCoverage >= 0.35 || match.containsOther)) ||
    (match.overlapCount >= 3 && match.smallerCoverage >= 0.5 && match.containsOther);

  return {
    comparable: objectBundle !== undefined && candidateBundle !== undefined,
    exact: match.exact,
    strong,
    moderate,
    overlapCount: match.overlapCount,
    smallerCoverage: match.smallerCoverage,
    largerCoverage: match.largerCoverage,
    containsOther: match.containsOther,
  };
}

export function describeFactValueMatchProfile(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): FactValueMatchProfile {
  if (object.kind !== "fact" || candidate.kind !== "fact") {
    return {
      comparable: false,
      exact: false,
      strong: false,
      wrapper: false,
      candidateContainsObjectValue: false,
      objectContainsCandidateValue: false,
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
    };
  }

  const objectValue = normalizeOptionalComparableValue(object.payload.value);
  const candidateValue = normalizeOptionalComparableValue(candidate.payload.value);
  if (objectValue === undefined || candidateValue === undefined) {
    return {
      comparable: false,
      exact: false,
      strong: false,
      wrapper: false,
      candidateContainsObjectValue: false,
      objectContainsCandidateValue: false,
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
    };
  }

  const match = describeComparableTextMatch(objectValue, candidateValue);
  const strongFactValueMatch =
    match.strong ||
    (match.containsOther &&
      match.overlapCount >= 4 &&
      match.smallerCoverage >= 0.9 &&
      match.largerCoverage >= 0.55);
  return {
    comparable: true,
    exact: match.exact,
    strong: strongFactValueMatch,
    wrapper: strongFactValueMatch && match.containsOther && !match.exact,
    candidateContainsObjectValue:
      candidateValue.includes(objectValue) && candidateValue !== objectValue,
    objectContainsCandidateValue:
      objectValue.includes(candidateValue) && objectValue !== candidateValue,
    overlapCount: match.overlapCount,
    smallerCoverage: match.smallerCoverage,
    largerCoverage: match.largerCoverage,
  };
}

function compareDecisiveField(
  field: string,
  fieldRole: "core_claim" | "packaging",
  objectValue: string | string[] | undefined,
  candidateValue: string | string[] | undefined,
): DecisiveFieldAgreementDetail {
  const comparable = objectValue !== undefined || candidateValue !== undefined;
  const matches =
    comparable &&
    Array.isArray(objectValue) === Array.isArray(candidateValue) &&
    (Array.isArray(objectValue) && Array.isArray(candidateValue)
      ? hasStrongComparableArrayMatch(objectValue, candidateValue)
      : describeComparableTextMatch(
          typeof objectValue === "string" ? objectValue : undefined,
          typeof candidateValue === "string" ? candidateValue : undefined,
        ).strong);
  return {
    field,
    fieldRole,
    objectValue: formatComparableValue(objectValue),
    candidateValue: formatComparableValue(candidateValue),
    comparable,
    matches,
  };
}

function summarizeFieldComparisons(details: DecisiveFieldAgreementDetail[]): string {
  if (details.length === 0) {
    return "no comparable fields";
  }
  return details
    .map((detail) => {
      if (detail.matches) {
        return `${detail.field}=match`;
      }
      return `${detail.field}=diff(${detail.objectValue ?? "missing"} -> ${detail.candidateValue ?? "missing"})`;
    })
    .join("; ");
}

export function describeClaimFieldComparison(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): ClaimFieldComparison {
  const details: DecisiveFieldAgreementDetail[] = [];

  switch (object.kind) {
    case "fact":
      details.push(
        compareDecisiveField(
          "value",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.value),
          normalizeOptionalComparableValue(candidate.payload.value),
        ),
        compareDecisiveField(
          "subject",
          "packaging",
          normalizeOptionalComparableValue(object.payload.subject),
          normalizeOptionalComparableValue(candidate.payload.subject),
        ),
      );
      break;
    case "preference":
      details.push(
        compareDecisiveField(
          "instruction",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.instruction),
          normalizeOptionalComparableValue(candidate.payload.instruction),
        ),
        compareDecisiveField(
          "operation",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.operation),
          normalizeOptionalComparableValue(candidate.payload.operation),
        ),
        compareDecisiveField(
          "subject",
          "packaging",
          normalizeOptionalComparableValue(object.payload.subject),
          normalizeOptionalComparableValue(candidate.payload.subject),
        ),
      );
      break;
    case "rule":
      details.push(
        compareDecisiveField(
          "recommendedAction",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.recommendedAction),
          normalizeOptionalComparableValue(candidate.payload.recommendedAction),
        ),
        compareDecisiveField(
          "avoidAction",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.avoidAction),
          normalizeOptionalComparableValue(candidate.payload.avoidAction),
        ),
        compareDecisiveField(
          "neededCapability",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.neededCapability),
          normalizeOptionalComparableValue(candidate.payload.neededCapability),
        ),
        compareDecisiveField(
          "actionBundle",
          "core_claim",
          buildRuleActionBundle(object.payload),
          buildRuleActionBundle(candidate.payload),
        ),
        compareDecisiveField(
          "subject",
          "packaging",
          normalizeOptionalComparableValue(object.payload.subject),
          normalizeOptionalComparableValue(candidate.payload.subject),
        ),
      );
      break;
    case "procedure":
      details.push(
        compareDecisiveField(
          "steps",
          "core_claim",
          normalizeComparableStringArray(object.payload.steps, { ordered: true }),
          normalizeComparableStringArray(candidate.payload.steps, { ordered: true }),
        ),
        compareDecisiveField(
          "title",
          "packaging",
          normalizeOptionalComparableValue(object.payload.title),
          normalizeOptionalComparableValue(candidate.payload.title),
        ),
      );
      break;
    case "reference":
      details.push(
        compareDecisiveField(
          "task",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.task),
          normalizeOptionalComparableValue(candidate.payload.task),
        ),
        compareDecisiveField(
          "primaryResource",
          "core_claim",
          normalizeOptionalComparableValue(object.payload.primaryResource),
          normalizeOptionalComparableValue(candidate.payload.primaryResource),
        ),
        compareDecisiveField(
          "companionResources",
          "core_claim",
          normalizeComparableStringArray(object.payload.companionResources, { ordered: false }),
          normalizeComparableStringArray(candidate.payload.companionResources, {
            ordered: false,
          }),
        ),
      );
      break;
    default:
      break;
  }

  const coreClaimDetails = details.filter((detail) => detail.fieldRole === "core_claim");
  const packagingDetails = details.filter((detail) => detail.fieldRole === "packaging");
  const ruleBundleMatch =
    object.kind === "rule" &&
    coreClaimDetails.find((detail) => detail.field === "actionBundle")?.matches === true;
  const comparableCoreClaimDetails = ruleBundleMatch
    ? coreClaimDetails.filter((detail) => detail.field === "actionBundle")
    : coreClaimDetails.filter((detail) => detail.comparable && detail.field !== "actionBundle");
  const comparablePackagingDetails = packagingDetails.filter((detail) => detail.comparable);

  const matchingCoreClaimFields = comparableCoreClaimDetails
    .filter((detail) => detail.matches)
    .map((detail) => detail.field);
  const blockingCoreClaimFields = comparableCoreClaimDetails
    .filter((detail) => !detail.matches)
    .map((detail) => detail.field);
  const matchingPackagingFields = comparablePackagingDetails
    .filter((detail) => detail.matches)
    .map((detail) => detail.field);
  const blockingPackagingFields = comparablePackagingDetails
    .filter((detail) => !detail.matches)
    .map((detail) => detail.field);

  const coreClaimSummary = summarizeFieldComparisons(comparableCoreClaimDetails);
  const packagingSummary = summarizeFieldComparisons(comparablePackagingDetails);

  return {
    kind: object.kind as ModelMemoryObject["kind"],
    details,
    coreClaimDetails,
    packagingDetails,
    coreClaimFields: coreClaimDetails.map((detail) => detail.field),
    packagingFields: packagingDetails.map((detail) => detail.field),
    hasComparableCoreClaimFields: comparableCoreClaimDetails.length > 0,
    coreComparableFieldCount: comparableCoreClaimDetails.length,
    matchingCoreClaimFields,
    blockingCoreClaimFields,
    matchingPackagingFields,
    blockingPackagingFields,
    coreClaimMatch: comparableCoreClaimDetails.length > 0 && blockingCoreClaimFields.length === 0,
    coreClaimSummary,
    packagingSummary,
    summary: `core=${coreClaimSummary}; packaging=${packagingSummary}`,
  };
}

export function describeDecisiveFieldAgreement(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): DecisiveFieldAgreement {
  const comparison = describeClaimFieldComparison(object, candidate);
  const details = comparison.coreClaimDetails;
  const ruleBundleMatch =
    object.kind === "rule" &&
    details.find((detail) => detail.field === "actionBundle")?.matches === true;
  const comparableDetails = ruleBundleMatch
    ? details.filter((detail) => detail.field === "actionBundle")
    : details.filter((detail) => detail.comparable && detail.field !== "actionBundle");
  const matchingFields = comparableDetails
    .filter((detail) => detail.matches)
    .map((detail) => detail.field);
  const mismatchedFields = comparableDetails
    .filter((detail) => !detail.matches)
    .map((detail) => detail.field);
  const summary = summarizeFieldComparisons(comparableDetails);

  return {
    kind: object.kind as ModelMemoryObject["kind"],
    decisiveFields: details.map((detail) => detail.field),
    matchingFields,
    mismatchedFields,
    hasComparableFields: comparableDetails.length > 0,
    comparableFieldCount: comparableDetails.length,
    matchingComparableFieldCount: matchingFields.length,
    allComparableFieldsMatch: comparableDetails.length > 0 && mismatchedFields.length === 0,
    details,
    summary,
  };
}

export function assessStructuralSameClaimDelta(
  object: ComparableMemoryShape,
  candidate: ComparableMemoryShape,
): StructuralSameClaimDelta {
  const claimFieldComparison = describeClaimFieldComparison(object, candidate);
  if (!claimFieldComparison.hasComparableCoreClaimFields || !claimFieldComparison.coreClaimMatch) {
    return {
      isNonAdditive: false,
      deltaClass: "additive_operational_delta",
      sameClaimLeaning: false,
      sameClaimConfidence: "low",
      packagingDriftType: "extra_constraint",
      summary: "core claim fields differ or are not comparable",
    };
  }

  if (object.kind === "fact" && candidate.kind === "fact") {
    const valueMatch = describeFactValueMatchProfile(object, candidate);
    const subjectObject = normalizeOptionalComparableValue(object.payload.subject);
    const subjectCandidate = normalizeOptionalComparableValue(candidate.payload.subject);
    const subjectDrift =
      Boolean(subjectObject) && Boolean(subjectCandidate) && subjectObject !== subjectCandidate;

    if (valueMatch.exact && subjectDrift) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: "high",
        packagingDriftType: "subject_drift",
        summary: "same fact value with subject drift only",
      };
    }

    if (
      valueMatch.strong &&
      subjectDrift &&
      !valueMatch.candidateContainsObjectValue &&
      !valueMatch.objectContainsCandidateValue
    ) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: valueMatch.largerCoverage >= 0.7 ? "high" : "medium",
        packagingDriftType: "subject_drift",
        summary: "same fact value with subject drift and no broader-wrapper expansion",
      };
    }

    if (valueMatch.wrapper && valueMatch.overlapCount >= 4 && valueMatch.smallerCoverage >= 0.9) {
      return {
        isNonAdditive: !(
          valueMatch.candidateContainsObjectValue || valueMatch.objectContainsCandidateValue
        ),
        deltaClass:
          valueMatch.candidateContainsObjectValue || valueMatch.objectContainsCandidateValue
            ? "unresolved"
            : "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: valueMatch.largerCoverage >= 0.65 ? "high" : "medium",
        packagingDriftType:
          valueMatch.candidateContainsObjectValue || valueMatch.objectContainsCandidateValue
            ? "broader_narrower"
            : "value_wrapper_drift",
        summary: "same fact value with wrapper or broader/narrower phrasing drift",
      };
    }
  }

  if (object.kind === "rule" && candidate.kind === "rule") {
    const actionBundleMatchProfile = describeRuleActionBundleMatchProfile(object, candidate);
    const actionBundleMatch = actionBundleMatchProfile.strong;
    const ruleFieldDetails = claimFieldComparison.coreClaimDetails.filter((detail) =>
      ["recommendedAction", "avoidAction", "neededCapability"].includes(detail.field),
    );
    const hasPackingDrift =
      actionBundleMatch && ruleFieldDetails.some((detail) => detail.comparable && !detail.matches);
    if (hasPackingDrift) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: "high",
        packagingDriftType: "field_packing_drift",
        summary: "same rule action bundle with field packing drift",
      };
    }

    const subjectObject = normalizeOptionalComparableValue(object.payload.subject);
    const subjectCandidate = normalizeOptionalComparableValue(candidate.payload.subject);
    if (
      subjectObject &&
      subjectCandidate &&
      subjectObject !== subjectCandidate &&
      actionBundleMatch
    ) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: "high",
        packagingDriftType: "subject_drift",
        summary: "same rule action bundle with subject drift only",
      };
    }

    if (actionBundleMatchProfile.containsOther && actionBundleMatchProfile.smallerCoverage >= 0.9) {
      return {
        isNonAdditive: false,
        deltaClass: "unresolved",
        sameClaimLeaning: true,
        sameClaimConfidence: "medium",
        packagingDriftType: "broader_narrower",
        summary: "same rule family with broader or narrower action bundle packaging",
      };
    }
  }

  if (object.kind === "procedure" && candidate.kind === "procedure") {
    const titleObject = normalizeOptionalComparableValue(object.payload.title);
    const titleCandidate = normalizeOptionalComparableValue(candidate.payload.title);
    const successShapeObject = normalizeOptionalComparableValue(object.payload.successShape);
    const successShapeCandidate = normalizeOptionalComparableValue(candidate.payload.successShape);
    const failureShapeObject = normalizeOptionalComparableValue(object.payload.failureShape);
    const failureShapeCandidate = normalizeOptionalComparableValue(candidate.payload.failureShape);
    const auxiliaryOperationalDelta =
      ((successShapeObject ?? successShapeCandidate) !== undefined &&
        successShapeObject !== successShapeCandidate) ||
      ((failureShapeObject ?? failureShapeCandidate) !== undefined &&
        failureShapeObject !== failureShapeCandidate);

    if (auxiliaryOperationalDelta) {
      return {
        isNonAdditive: false,
        deltaClass: "additive_operational_delta",
        sameClaimLeaning: false,
        sameClaimConfidence: "low",
        packagingDriftType: "extra_constraint",
        summary: "same procedure steps but success/failure shape adds operational delta",
      };
    }
    if (titleObject && titleCandidate && titleObject !== titleCandidate) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: "high",
        packagingDriftType: "subject_drift",
        summary: "same ordered procedure steps with title drift only",
      };
    }
  }

  if (object.kind === "preference" && candidate.kind === "preference") {
    const subjectObject = normalizeOptionalComparableValue(object.payload.subject);
    const subjectCandidate = normalizeOptionalComparableValue(candidate.payload.subject);
    if (subjectObject && subjectCandidate && subjectObject !== subjectCandidate) {
      return {
        isNonAdditive: true,
        deltaClass: "packaging_only_drift",
        sameClaimLeaning: true,
        sameClaimConfidence: "medium",
        packagingDriftType: "subject_drift",
        summary: "same preference instruction with subject drift only",
      };
    }
  }

  if (object.kind === "reference" && candidate.kind === "reference") {
    return {
      isNonAdditive: false,
      deltaClass: "unresolved",
      sameClaimLeaning: true,
      sameClaimConfidence: "medium",
      packagingDriftType: "subject_drift",
      summary: "same reference task/resource with wording drift only",
    };
  }

  return {
    isNonAdditive: false,
    deltaClass: "unresolved",
    sameClaimLeaning: true,
    sameClaimConfidence: "medium",
    packagingDriftType: "subject_drift",
    summary: "core claim fields match but the remaining delta is not safely classified yet",
  };
}

function normalizeScope(scope: ModelMemoryObject["scope"]): Record<string, unknown> {
  if (!scope) {
    return {};
  }

  const normalizedEntries = Object.entries(scope)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, normalizeStringArray(value)];
      }
      if (typeof value === "string") {
        return [key, normalizeIdentityText(value)];
      }
      return [key, value];
    })
    .sort((leftEntry, rightEntry) => String(leftEntry[0]).localeCompare(String(rightEntry[0])));

  return Object.fromEntries(normalizedEntries);
}

function buildIdentityParts(object: ModelMemoryObject): string[] {
  switch (object.kind) {
    case "preference":
      return [
        normalizeIdentityText(object.payload.subject),
        normalizeIdentityText(object.payload.instruction),
        normalizeIdentityText(object.payload.operation),
      ];
    case "fact":
      return [
        normalizeIdentityText(object.payload.subject),
        normalizeIdentityText(object.payload.value),
      ];
    case "rule":
      return [
        normalizeIdentityText(object.payload.subject),
        object.payload.recommendedAction
          ? normalizeIdentityText(object.payload.recommendedAction)
          : "",
        object.payload.avoidAction ? normalizeIdentityText(object.payload.avoidAction) : "",
        object.payload.neededCapability
          ? normalizeIdentityText(object.payload.neededCapability)
          : "",
      ];
    case "procedure":
      return [
        normalizeIdentityText(object.payload.title),
        ...object.payload.steps.map((step) => normalizeIdentityText(step)),
      ];
    case "reference":
      return [
        normalizeIdentityText(object.payload.task),
        normalizeIdentityText(object.payload.primaryResource),
        ...normalizeStringArray(object.payload.companionResources),
      ];
  }
}

function buildNormalizedSearchText(object: ModelMemoryObject): string {
  return buildIdentityParts(object)
    .filter((part) => part.length > 0)
    .join(" ");
}

export function deriveMemoryIdentity(object: ModelMemoryObject): MemoryIdentityDescriptor {
  const normalizedScope = normalizeScope(object.scope);
  const scopeKey = `scope_${hashValue(JSON.stringify(normalizedScope)).slice(0, 16)}`;
  const identityParts = [
    object.canonicalClass,
    object.kind,
    scopeKey,
    ...buildIdentityParts(object),
  ];
  const identityKey = `${object.kind}_${hashValue(identityParts.join("|")).slice(0, 24)}`;
  const normalizedSubject =
    "subject" in object.payload ? normalizeIdentityText(object.payload.subject) : undefined;
  const normalizedTitle =
    "title" in object.payload ? normalizeIdentityText(object.payload.title) : undefined;
  const slotKey =
    SAME_SLOT_KINDS.has(object.kind) && normalizedSubject
      ? `slot_${hashValue([object.canonicalClass, object.kind, scopeKey, normalizedSubject].join("|")).slice(0, 24)}`
      : undefined;

  return {
    identityKey,
    slotKey,
    scopeKey,
    normalizedSubject,
    normalizedTitle,
    normalizedSearchText: buildNormalizedSearchText(object),
  };
}

export function isDeterministicSameSlotSupersession(
  prior: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
  next: Pick<MemoryIdentityDescriptor, "identityKey" | "slotKey"> & {
    kind: ModelMemoryObject["kind"];
  },
): boolean {
  return (
    SAME_SLOT_KINDS.has(prior.kind) &&
    SAME_SLOT_KINDS.has(next.kind) &&
    prior.kind === next.kind &&
    !!prior.slotKey &&
    prior.slotKey === next.slotKey &&
    prior.identityKey !== next.identityKey
  );
}
