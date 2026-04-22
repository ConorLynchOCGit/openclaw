import { createHash } from "node:crypto";
import type { SemanticExtractionPrompt } from "../semantic-interpreter.ts";
import type {
  AtomicRoutedCandidate,
  CanonicalCandidate,
  ExistingMemorySummary,
  ReconciliationInput,
  RawIngestEvent,
} from "./contracts.ts";
import { buildPromptRawEventMetadata } from "./prompt-contracts.ts";

export type MmV2PromptNormalizationSummary = {
  applied: boolean;
  rawPayloadHash: string | null;
  normalizedPayloadHash: string | null;
  normalizedInputHash: string | null;
  changedPaths: string[];
  semanticChangedPaths: string[];
  placeholderCounts: {
    eventIds: number;
    sourceIds: number;
    segmentIds: number;
    candidateIds: number;
    memoryIds: number;
    timestamps: number;
  };
  sortedCollections: string[];
  requestedSanitizedPrompt: boolean;
  deliveryMode: "original" | "sanitized";
  guardAllowed: boolean;
  guardBlockedPaths: string[];
};

export type PreparedProofPrompt = {
  prompt: SemanticExtractionPrompt;
  normalization: MmV2PromptNormalizationSummary | null;
  restoreParsedOutput: (value: unknown) => unknown;
};

export type PrepareProofPromptOptions = {
  deliverSanitizedContracts?: ReadonlySet<string>;
};

type StringMap = Map<string, string>;

type PlaceholderMaps = {
  eventIds: StringMap;
  sourceIds: StringMap;
  segmentIds: StringMap;
  candidateIds: StringMap;
  memoryIds: StringMap;
  timestamps: StringMap;
};

type PromptNormalizationContext = {
  maps: PlaceholderMaps;
  sortedCollections: Set<string>;
};

const STABLE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function createPlaceholderMaps(): PlaceholderMaps {
  return {
    eventIds: new Map<string, string>(),
    sourceIds: new Map<string, string>(),
    segmentIds: new Map<string, string>(),
    candidateIds: new Map<string, string>(),
    memoryIds: new Map<string, string>(),
    timestamps: new Map<string, string>(),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function prettyStableJson(value: unknown): string {
  return JSON.stringify(stableNormalizeKeys(value), null, 2);
}

function stableNormalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalizeKeys(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableNormalizeKeys(entryValue)]),
    );
  }
  return value;
}

function placeholderFor(map: StringMap, original: string, prefix: string): string {
  const existing = map.get(original);
  if (existing) {
    return existing;
  }
  const placeholder = `${prefix}-${map.size}`;
  map.set(original, placeholder);
  return placeholder;
}

function sanitizeTimestamp(
  value: string | undefined,
  context: PromptNormalizationContext,
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  return placeholderFor(context.maps.timestamps, value, "timestamp").replace(
    /^timestamp-\d+$/u,
    STABLE_TIMESTAMP,
  );
}

function sanitizeRawEvent(
  rawEvent: RawIngestEvent,
  context: PromptNormalizationContext,
): RawIngestEvent {
  return {
    ...rawEvent,
    event_id: placeholderFor(context.maps.eventIds, rawEvent.event_id, "event"),
    source_id: placeholderFor(context.maps.sourceIds, rawEvent.source_id, "source"),
    created_at: sanitizeTimestamp(rawEvent.created_at, context) ?? rawEvent.created_at,
  };
}

function sortStrings<T extends string>(
  values: T[],
  collectionPath: string,
  context: PromptNormalizationContext,
): T[] {
  const sorted = [...values].toSorted((left, right) => left.localeCompare(right));
  if (sorted.some((value, index) => value !== values[index])) {
    context.sortedCollections.add(collectionPath);
  }
  return sorted;
}

function sanitizeAtomicRoutedCandidates(
  routedCandidates: AtomicRoutedCandidate[],
  context: PromptNormalizationContext,
): AtomicRoutedCandidate[] {
  return routedCandidates.map((candidate) => ({
    ...candidate,
    segment_id: placeholderFor(context.maps.segmentIds, candidate.segment_id, "segment"),
    reason_codes: sortStrings(candidate.reason_codes, "routed_candidates.reason_codes", context),
  }));
}

function sanitizeCanonicalSource(
  source: CanonicalCandidate["source"],
  context: PromptNormalizationContext,
): CanonicalCandidate["source"] {
  return {
    ...source,
    event_id: placeholderFor(context.maps.eventIds, source.event_id, "event"),
    source_id: placeholderFor(context.maps.sourceIds, source.source_id, "source"),
    created_at: sanitizeTimestamp(source.created_at, context) ?? source.created_at,
    segment_id: placeholderFor(context.maps.segmentIds, source.segment_id, "segment"),
  };
}

function sanitizeCanonicalCandidate(
  candidate: CanonicalCandidate,
  context: PromptNormalizationContext,
): CanonicalCandidate {
  return {
    ...candidate,
    candidate_id: placeholderFor(context.maps.candidateIds, candidate.candidate_id, "candidate"),
    source: sanitizeCanonicalSource(candidate.source, context),
    parent_candidate_id:
      typeof candidate.parent_candidate_id === "string"
        ? placeholderFor(context.maps.candidateIds, candidate.parent_candidate_id, "candidate")
        : candidate.parent_candidate_id,
    component_candidate_id:
      typeof candidate.component_candidate_id === "string"
        ? placeholderFor(context.maps.candidateIds, candidate.component_candidate_id, "candidate")
        : candidate.component_candidate_id,
    risk_flags: sortStrings(candidate.risk_flags, "canonical_candidates.risk_flags", context),
  };
}

function sanitizeExistingMemorySummary(
  memory: ExistingMemorySummary,
  context: PromptNormalizationContext,
): ExistingMemorySummary {
  return {
    ...memory,
    memory_id: placeholderFor(context.maps.memoryIds, memory.memory_id, "neighbor"),
  };
}

function renderAtomicUserPrompt(payload: {
  raw_event: RawIngestEvent;
  routed_candidates: AtomicRoutedCandidate[];
}): string {
  return [
    "Extract atomic durable memory candidates from these routed candidates.",
    "",
    "Raw event metadata:",
    prettyStableJson(buildPromptRawEventMetadata(payload.raw_event)),
    "",
    "Atomic routed candidates:",
    prettyStableJson(payload.routed_candidates),
    "",
    "Return only the atomic extraction JSON.",
  ].join("\n");
}

function renderAdmissionUserPrompt(payload: {
  raw_event: RawIngestEvent;
  canonical_candidates: CanonicalCandidate[];
}): string {
  return [
    "Decide admission for these canonical memory candidates.",
    "",
    "Raw event metadata:",
    prettyStableJson(buildPromptRawEventMetadata(payload.raw_event)),
    "",
    "Canonical candidates:",
    prettyStableJson(payload.canonical_candidates),
    "",
    "Return only admission decision JSON.",
  ].join("\n");
}

function renderReconciliationUserPrompt(payload: ReconciliationInput): string {
  return [
    "Reconcile this candidate with existing memory neighbors.",
    "",
    "Reconciliation input:",
    prettyStableJson(payload),
    "",
    "Return only reconciliation decision JSON.",
  ].join("\n");
}

function collectChangedPaths(
  before: unknown,
  after: unknown,
  path = "",
  out: string[] = [],
): string[] {
  if (out.length >= 32) {
    return out;
  }
  if (Object.is(before, after)) {
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before.length, after.length);
    for (let index = 0; index < maxLength && out.length < 32; index += 1) {
      collectChangedPaths(before[index], after[index], `${path}[${index}]`, out);
    }
    return out;
  }
  if (
    before &&
    typeof before === "object" &&
    after &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).toSorted();
    for (const key of keys) {
      collectChangedPaths(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        out,
      );
      if (out.length >= 32) {
        break;
      }
    }
    return out;
  }
  out.push(path || "$");
  return out;
}

function isSemanticPath(path: string): boolean {
  return (
    /(?:^|\.)(?:text|evidence_quote|canonical_text|merged_canonical_text|title|summary|purpose|subject|predicate|object|scope|qualifiers|kind|artifact_type|decision|conflict_type|payload|components|activation_triggers)(?:$|[.[])/u.test(
      path,
    ) &&
    !/(?:^|\.)(?:segment_id|candidate_id|memory_id|event_id|source_id|created_at|updated_at|parent_candidate_id|component_candidate_id)(?:$|[.[])/u.test(
      path,
    )
  );
}

function invertMap(map: StringMap): StringMap {
  return new Map(Array.from(map.entries(), ([key, value]) => [value, key]));
}

function restoreMappedStrings(value: unknown, inverseMaps: PlaceholderMaps): unknown {
  if (typeof value === "string") {
    return (
      invertMap(inverseMaps.eventIds).get(value) ??
      invertMap(inverseMaps.sourceIds).get(value) ??
      invertMap(inverseMaps.segmentIds).get(value) ??
      invertMap(inverseMaps.candidateIds).get(value) ??
      invertMap(inverseMaps.memoryIds).get(value) ??
      invertMap(inverseMaps.timestamps).get(value) ??
      value
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => restoreMappedStrings(entry, inverseMaps));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        restoreMappedStrings(entryValue, inverseMaps),
      ]),
    );
  }
  return value;
}

function buildNormalizationSummary(input: {
  rawPayload: unknown;
  normalizedPayload: unknown;
  context: PromptNormalizationContext;
  normalizedUserPrompt: string;
}): MmV2PromptNormalizationSummary {
  const changedPaths = collectChangedPaths(input.rawPayload, input.normalizedPayload);
  return {
    applied: changedPaths.length > 0,
    rawPayloadHash: input.rawPayload === undefined ? null : stableHash(input.rawPayload),
    normalizedPayloadHash:
      input.normalizedPayload === undefined ? null : stableHash(input.normalizedPayload),
    normalizedInputHash: stableHash(input.normalizedUserPrompt),
    changedPaths,
    semanticChangedPaths: changedPaths.filter((path) => isSemanticPath(path)),
    placeholderCounts: {
      eventIds: input.context.maps.eventIds.size,
      sourceIds: input.context.maps.sourceIds.size,
      segmentIds: input.context.maps.segmentIds.size,
      candidateIds: input.context.maps.candidateIds.size,
      memoryIds: input.context.maps.memoryIds.size,
      timestamps: input.context.maps.timestamps.size,
    },
    sortedCollections: Array.from(input.context.sortedCollections).toSorted(),
    requestedSanitizedPrompt: false,
    deliveryMode: "original",
    guardAllowed: true,
    guardBlockedPaths: [],
  };
}

function finalizePreparedPrompt(input: {
  originalPrompt: SemanticExtractionPrompt;
  normalizedPrompt: SemanticExtractionPrompt;
  normalization: MmV2PromptNormalizationSummary;
  restoreParsedOutput: (value: unknown) => unknown;
  options?: PrepareProofPromptOptions;
}): PreparedProofPrompt {
  const requestedSanitizedPrompt =
    input.options?.deliverSanitizedContracts?.has(input.originalPrompt.contract.contractVersion) ??
    false;
  const guardBlockedPaths = [...input.normalization.semanticChangedPaths];
  const guardAllowed = guardBlockedPaths.length === 0;
  const deliveryMode = requestedSanitizedPrompt && guardAllowed ? "sanitized" : "original";

  return {
    prompt: deliveryMode === "sanitized" ? input.normalizedPrompt : input.originalPrompt,
    normalization: {
      ...input.normalization,
      requestedSanitizedPrompt,
      deliveryMode,
      guardAllowed,
      guardBlockedPaths,
    },
    restoreParsedOutput:
      deliveryMode === "sanitized" ? input.restoreParsedOutput : (value: unknown) => value,
  };
}

function prepareAtomicPrompt(
  prompt: SemanticExtractionPrompt,
  options?: PrepareProofPromptOptions,
): PreparedProofPrompt | null {
  const payload = prompt.promptPayload as
    | { raw_event: RawIngestEvent; routed_candidates: AtomicRoutedCandidate[] }
    | undefined;
  if (!payload) {
    return null;
  }
  const context: PromptNormalizationContext = {
    maps: createPlaceholderMaps(),
    sortedCollections: new Set<string>(),
  };
  const normalizedPayload = {
    raw_event: sanitizeRawEvent(payload.raw_event, context),
    routed_candidates: sanitizeAtomicRoutedCandidates(payload.routed_candidates, context),
  };
  const normalizedPrompt = {
    ...prompt,
    promptPayload: normalizedPayload,
    userPrompt: renderAtomicUserPrompt(normalizedPayload),
  };
  return finalizePreparedPrompt({
    originalPrompt: prompt,
    normalizedPrompt,
    normalization: buildNormalizationSummary({
      rawPayload: payload,
      normalizedPayload,
      context,
      normalizedUserPrompt: renderAtomicUserPrompt(normalizedPayload),
    }),
    restoreParsedOutput: (value: unknown) => restoreMappedStrings(value, context.maps),
    options,
  });
}

function prepareAdmissionPrompt(
  prompt: SemanticExtractionPrompt,
  options?: PrepareProofPromptOptions,
): PreparedProofPrompt | null {
  const payload = prompt.promptPayload as
    | { raw_event: RawIngestEvent; canonical_candidates: CanonicalCandidate[] }
    | undefined;
  if (!payload) {
    return null;
  }
  const context: PromptNormalizationContext = {
    maps: createPlaceholderMaps(),
    sortedCollections: new Set<string>(),
  };
  const normalizedPayload = {
    raw_event: sanitizeRawEvent(payload.raw_event, context),
    canonical_candidates: payload.canonical_candidates.map((candidate) =>
      sanitizeCanonicalCandidate(candidate, context),
    ),
  };
  const normalizedPrompt = {
    ...prompt,
    promptPayload: normalizedPayload,
    userPrompt: renderAdmissionUserPrompt(normalizedPayload),
  };
  return finalizePreparedPrompt({
    originalPrompt: prompt,
    normalizedPrompt,
    normalization: buildNormalizationSummary({
      rawPayload: payload,
      normalizedPayload,
      context,
      normalizedUserPrompt: renderAdmissionUserPrompt(normalizedPayload),
    }),
    restoreParsedOutput: (value: unknown) => restoreMappedStrings(value, context.maps),
    options,
  });
}

function prepareReconciliationPrompt(
  prompt: SemanticExtractionPrompt,
  options?: PrepareProofPromptOptions,
): PreparedProofPrompt | null {
  const payload = prompt.promptPayload as ReconciliationInput | undefined;
  if (!payload) {
    return null;
  }
  const context: PromptNormalizationContext = {
    maps: createPlaceholderMaps(),
    sortedCollections: new Set<string>(),
  };
  const normalizedPayload: ReconciliationInput = {
    ...payload,
    event_id: placeholderFor(context.maps.eventIds, payload.event_id, "event"),
    candidate: sanitizeCanonicalCandidate(payload.candidate, context),
    neighbors: payload.neighbors.map((neighbor) =>
      sanitizeExistingMemorySummary(neighbor, context),
    ),
  };
  const normalizedPrompt = {
    ...prompt,
    promptPayload: normalizedPayload,
    userPrompt: renderReconciliationUserPrompt(normalizedPayload),
  };
  return finalizePreparedPrompt({
    originalPrompt: prompt,
    normalizedPrompt,
    normalization: buildNormalizationSummary({
      rawPayload: payload,
      normalizedPayload,
      context,
      normalizedUserPrompt: renderReconciliationUserPrompt(normalizedPayload),
    }),
    restoreParsedOutput: (value: unknown) => restoreMappedStrings(value, context.maps),
    options,
  });
}

export function prepareProofPrompt(
  prompt: SemanticExtractionPrompt,
  options?: PrepareProofPromptOptions,
): PreparedProofPrompt {
  const contractVersion = prompt.contract.contractVersion;
  const prepared =
    (contractVersion === "mmv2-atomic-extraction-v1" && prepareAtomicPrompt(prompt, options)) ||
    (contractVersion === "mmv2-admission-v1" && prepareAdmissionPrompt(prompt, options)) ||
    (contractVersion === "mmv2-reconciliation-v1" &&
      prepareReconciliationPrompt(prompt, options)) ||
    null;

  if (!prepared) {
    return {
      prompt,
      normalization: null,
      restoreParsedOutput: (value: unknown) => value,
    };
  }

  return prepared;
}
