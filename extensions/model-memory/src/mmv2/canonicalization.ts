import { createHash } from "node:crypto";
import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import { shouldComponentEnterStandaloneLane } from "./composite-policy.ts";
import {
  CanonicalCandidateBatchSchema,
  type AtomicCandidate,
  type AtomicExtractionBatch,
  type CanonicalCandidate,
  type CanonicalCandidateBatch,
  type CompositeCandidate,
  type CompositeExtractionBatch,
  type RawIngestEvent,
  type SegmentedIngestEvent,
  type SegmentedIngestSegment,
} from "./contracts.ts";
import {
  buildCanonicalizationPrompt,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import { ensureSentence, normalizeWhitespace } from "./text-normalization.ts";

type CanonicalizationInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  atomicBatch: AtomicExtractionBatch;
  compositeBatch: CompositeExtractionBatch;
  responseMode?: MmV2PromptResponseMode;
};

export type RuntimeCanonicalizationInput = CanonicalizationInput & {
  segmented: SegmentedIngestEvent;
};

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "canonical_candidates.v1",
      event_id: "",
      canonical_candidates: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function normalizeCanonicalPayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "canonical_candidates.v1",
      event_id: eventId,
      canonical_candidates: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "canonical_candidates.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

function validateCanonical(
  batch: CanonicalCandidateBatch,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  batch.canonical_candidates.forEach((candidate, index) => {
    if (candidate.kind && candidate.unit_type === "composite") {
      errors.push({
        path: `canonical_candidates.${index}.kind`,
        message: "composite candidates must not declare an atomic kind",
      });
    }
    if (candidate.unit_type === "composite" && candidate.artifact_type === null) {
      errors.push({
        path: `canonical_candidates.${index}.artifact_type`,
        message: "composite candidates must declare an artifact_type",
      });
    }
    if (
      (candidate.unit_type === "atomic" || candidate.unit_type === "component") &&
      candidate.artifact_type !== null
    ) {
      errors.push({
        path: `canonical_candidates.${index}.artifact_type`,
        message: "atomic and component candidates must not declare artifact_type",
      });
    }
  });
  return errors;
}

function shouldRetainCanonicalCandidate(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return shouldComponentEnterStandaloneLane(candidate);
}

function enforceCompositePromotionPolicy(batch: CanonicalCandidateBatch): CanonicalCandidateBatch {
  return {
    ...batch,
    canonical_candidates: batch.canonical_candidates.filter(shouldRetainCanonicalCandidate),
  };
}

function buildCompositeLookup(compositeBatch: CompositeExtractionBatch) {
  const byCandidateId = new Map<string, CompositeCandidate>();
  const bySegmentId = new Map<string, CompositeCandidate>();
  for (const candidate of compositeBatch.composite_candidates) {
    byCandidateId.set(candidate.candidate_id, candidate);
    bySegmentId.set(candidate.source_segment_id, candidate);
  }
  return { byCandidateId, bySegmentId };
}

function overlayCompositeStructure(
  candidate: CanonicalCandidate,
  compositeLookup: ReturnType<typeof buildCompositeLookup>,
): CanonicalCandidate {
  if (candidate.unit_type !== "composite") {
    return candidate;
  }

  const extracted =
    compositeLookup.byCandidateId.get(candidate.candidate_id) ??
    compositeLookup.bySegmentId.get(candidate.source.segment_id);
  if (!extracted) {
    return {
      ...candidate,
      kind: null,
      promotion: "not_applicable",
    };
  }

  const evidenceQuote =
    candidate.source.evidence_quote.trim().length > 0
      ? candidate.source.evidence_quote
      : extracted.evidence_quote;

  return {
    ...candidate,
    kind: null,
    artifact_type: candidate.artifact_type ?? extracted.artifact_type,
    promotion: "not_applicable",
    source: {
      ...candidate.source,
      segment_id: candidate.source.segment_id || extracted.source_segment_id,
      evidence_quote: evidenceQuote,
    },
    payload: {
      ...candidate.payload,
      title: extracted.title,
      purpose: extracted.purpose,
      summary: extracted.summary,
      activation_triggers: extracted.activation_triggers,
      components: extracted.components,
    },
  };
}

function normalizeCanonicalBatch(
  batch: CanonicalCandidateBatch,
  compositeBatch: CompositeExtractionBatch,
): CanonicalCandidateBatch {
  const compositeLookup = buildCompositeLookup(compositeBatch);
  return {
    ...batch,
    canonical_candidates: batch.canonical_candidates.map((candidate) =>
      overlayCompositeStructure(candidate, compositeLookup),
    ),
  };
}

function sentenceCase(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return normalized;
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function lowerInitial(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return normalized;
  }
  return normalized[0].toLowerCase() + normalized.slice(1);
}

function articleizeSubject(subject: string): string {
  const normalized = normalizeWhitespace(subject);
  if (normalized.length === 0) {
    return "It";
  }
  if (/^(?:the|a|an|this|that|these|those)\b/iu.test(normalized)) {
    return sentenceCase(normalized);
  }
  if (/^(?:user|assistant|project|workspace|organization|system)$/iu.test(normalized)) {
    return `The ${normalized.toLowerCase()}`;
  }
  return sentenceCase(normalized);
}

function buildQualifierSuffix(qualifiers: unknown): string {
  if (!Array.isArray(qualifiers)) {
    return "";
  }
  const parts = qualifiers
    .filter((value): value is string => typeof value === "string")
    .map(normalizeWhitespace)
    .filter((value) => value.length > 0);
  if (parts.length === 0) {
    return "";
  }
  return ` (${parts.join("; ")})`;
}

function stripTrailingPunctuation(text: string): string {
  return normalizeWhitespace(text).replace(/[.!?]+$/u, "");
}

function buildClaimCanonicalText(candidate: AtomicCandidate): string {
  if (candidate.payload.payload_type !== "claim") {
    return ensureSentence(candidate.normalized_statement);
  }
  const subject = articleizeSubject(candidate.payload.subject);
  const predicate = stripTrailingPunctuation(candidate.payload.predicate);
  const object = stripTrailingPunctuation(candidate.payload.object);
  const qualifierSuffix = buildQualifierSuffix(candidate.payload.qualifiers);
  if (candidate.payload.claim_type === "preference_state" && object.length > 0) {
    return ensureSentence(`${subject} prefers ${object}${qualifierSuffix}`);
  }
  if (predicate.length > 0 && object.length > 0) {
    return ensureSentence(`${subject} ${predicate} ${object}${qualifierSuffix}`);
  }
  return ensureSentence(candidate.normalized_statement || candidate.raw_statement);
}

function buildDirectiveCanonicalText(candidate: AtomicCandidate): string {
  if (candidate.payload.payload_type !== "directive") {
    return ensureSentence(candidate.normalized_statement);
  }
  const action = stripTrailingPunctuation(candidate.payload.action)
    .replace(/^(?:default to)\s+/iu, "")
    .trim();
  const trigger = stripTrailingPunctuation(candidate.payload.trigger)
    .replace(/^(?:when|whenever|if)\s+/iu, "")
    .trim();
  const actionSentence = sentenceCase(action);
  const defaultAction = lowerInitial(action);
  const imperativeAction =
    /^(?:use|avoid|prefer|keep|run|check|open|write|record|capture|list|format)\b/iu.test(action);
  if (/^(?:do not|never|always)\b/iu.test(action)) {
    return ensureSentence(actionSentence);
  }
  if (candidate.payload.strength === "hard_constraint") {
    return ensureSentence(actionSentence);
  }
  if (trigger.length > 0 && !/^general(?:_response)?$/iu.test(trigger)) {
    if (imperativeAction) {
      if (/^(?:during|while)\b/iu.test(trigger)) {
        return ensureSentence(`${actionSentence} ${trigger}`);
      }
      return ensureSentence(`${actionSentence} when ${trigger}`);
    }
    if (/^(?:during|while)\b/iu.test(trigger)) {
      return ensureSentence(`Default to ${defaultAction} ${trigger}`);
    }
    return ensureSentence(`Default to ${defaultAction} when ${trigger}`);
  }
  if (/^(?:use|avoid|prefer|keep|run|check|open|write|record|capture)\b/iu.test(action)) {
    return ensureSentence(actionSentence);
  }
  return ensureSentence(`Default to ${defaultAction}`);
}

function buildSourceRefCanonicalText(candidate: AtomicCandidate): string {
  if (candidate.payload.payload_type !== "source_ref") {
    return ensureSentence(candidate.normalized_statement);
  }
  const label = stripTrailingPunctuation(candidate.payload.label || candidate.payload.locator);
  const locator = stripTrailingPunctuation(candidate.payload.locator);
  if (label.length > 0 && locator.length > 0 && label !== locator) {
    return ensureSentence(`${label} is located at ${locator}`);
  }
  return ensureSentence(locator);
}

function buildEpisodeCanonicalText(candidate: AtomicCandidate): string {
  if (candidate.payload.payload_type !== "episode") {
    return ensureSentence(candidate.normalized_statement);
  }
  const actor = stripTrailingPunctuation(candidate.payload.actor || "Someone");
  const action = stripTrailingPunctuation(candidate.payload.action);
  const object = stripTrailingPunctuation(candidate.payload.object);
  const outcome = stripTrailingPunctuation(candidate.payload.outcome);
  const eventTime =
    typeof candidate.payload.event_time === "string" && candidate.payload.event_time.length > 0
      ? ` at ${candidate.payload.event_time}`
      : "";
  const objectSuffix = object.length > 0 ? ` ${object}` : "";
  const outcomeSuffix = outcome.length > 0 ? ` with outcome ${outcome}` : "";
  return ensureSentence(
    `${sentenceCase(actor)} ${action}${objectSuffix}${outcomeSuffix}${eventTime}`,
  );
}

function buildAtomicCanonicalText(candidate: AtomicCandidate): string {
  if (candidate.kind === "claim") {
    return buildClaimCanonicalText(candidate);
  }
  if (candidate.kind === "directive") {
    return buildDirectiveCanonicalText(candidate);
  }
  if (candidate.kind === "source_ref") {
    return buildSourceRefCanonicalText(candidate);
  }
  if (candidate.kind === "episode") {
    return buildEpisodeCanonicalText(candidate);
  }
  return ensureSentence(candidate.normalized_statement || candidate.raw_statement);
}

function buildCompositeCanonicalText(candidate: CompositeCandidate): string {
  const artifactLabel = sentenceCase(candidate.artifact_type.replace(/_/gu, " "));
  const title = stripTrailingPunctuation(candidate.title);
  const summary = stripTrailingPunctuation(candidate.summary);
  if (title.length > 0 && !/^structured\s+/iu.test(title)) {
    return ensureSentence(`${artifactLabel}: ${title}`);
  }
  if (summary.length > 0) {
    return ensureSentence(`${artifactLabel}: ${summary}`);
  }
  if (title.length > 0) {
    return ensureSentence(`${artifactLabel}: ${title}`);
  }
  return ensureSentence(`${artifactLabel} with ${candidate.components.length} retained components`);
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return normalizeWhitespace(
    parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" "),
  );
}

function mapAtomicTemporalStatus(
  candidate: AtomicCandidate,
): CanonicalCandidate["validity"]["temporal_status"] {
  if (candidate.payload.payload_type === "claim") {
    if (candidate.payload.temporal_status === "currently_true") {
      return "current";
    }
    if (candidate.payload.temporal_status === "historically_true") {
      return "historical";
    }
    if (candidate.payload.temporal_status === "future_intent") {
      return "future";
    }
  }
  return "unknown";
}

function buildAtomicValidity(candidate: AtomicCandidate): CanonicalCandidate["validity"] {
  return {
    valid_at:
      candidate.payload.payload_type === "episode" && candidate.payload.event_time
        ? candidate.payload.event_time
        : null,
    invalid_at: null,
    ttl_seconds: candidate.scope.applies_to === "current_session_only" ? 3600 : null,
    temporal_status: mapAtomicTemporalStatus(candidate),
  };
}

function buildCompositeValidity(candidate: CompositeCandidate): CanonicalCandidate["validity"] {
  return {
    valid_at: null,
    invalid_at: null,
    ttl_seconds: candidate.scope.applies_to === "current_session_only" ? 3600 : null,
    temporal_status: "unknown",
  };
}

function buildAtomicQuality(candidate: AtomicCandidate): CanonicalCandidate["quality"] {
  const grounding =
    candidate.source_grounding === "explicit"
      ? 1
      : candidate.source_grounding === "strongly_implied"
        ? 0.82
        : 0.58;
  const specificity =
    candidate.kind === "source_ref"
      ? 0.92
      : candidate.kind === "directive"
        ? 0.8
        : candidate.kind === "episode"
          ? 0.74
          : candidate.payload.payload_type === "claim" && candidate.payload.object.length > 0
            ? 0.78
            : 0.62;
  const durability =
    candidate.scope.applies_to === "current_session_only"
      ? 0.2
      : candidate.kind === "directive"
        ? 0.72
        : candidate.kind === "source_ref"
          ? 0.78
          : candidate.kind === "episode"
            ? 0.55
            : candidate.payload.payload_type === "claim" &&
                candidate.payload.temporal_status === "future_intent"
              ? 0.48
              : 0.72;
  const actionability =
    candidate.kind === "directive"
      ? 0.95
      : candidate.kind === "source_ref"
        ? 0.72
        : candidate.kind === "claim"
          ? 0.55
          : 0.42;
  return {
    atomicity: 0.95,
    specificity,
    durability,
    actionability,
    grounding,
  };
}

function buildCompositeQuality(candidate: CompositeCandidate): CanonicalCandidate["quality"] {
  const retainedComponents = candidate.components.filter(
    (component) => component.promotion !== "blocked",
  );
  return {
    atomicity: 0.64,
    specificity: retainedComponents.length >= 3 ? 0.8 : 0.68,
    durability: candidate.scope.applies_to === "current_session_only" ? 0.2 : 0.76,
    actionability:
      candidate.artifact_type === "procedure" || candidate.artifact_type === "checklist"
        ? 0.9
        : 0.64,
    grounding: 0.92,
  };
}

function buildCanonicalScope(
  rawEvent: RawIngestEvent,
  scope: {
    subject_type: string;
    subject_id: string | null;
    project_id: string | null;
    workspace_id: string | null;
    applies_to: string;
  },
): CanonicalCandidate["scope"] {
  return {
    tenant_id: rawEvent.tenant_id,
    user_id: rawEvent.user_id,
    project_id: scope.project_id ?? rawEvent.metadata.project_id,
    workspace_id: scope.workspace_id ?? rawEvent.metadata.workspace_id,
    subject_type: scope.subject_type,
    subject_id: scope.subject_id,
    applies_to: scope.applies_to,
  };
}

function buildSegmentLookup(segmented: SegmentedIngestEvent): Map<string, SegmentedIngestSegment> {
  return new Map(segmented.segments.map((segment) => [segment.segment_id, segment]));
}

function deriveEvidenceRange(
  segment: SegmentedIngestSegment,
  evidenceQuote: string,
): { startChar: number; endChar: number; evidenceQuote: string } {
  const exactQuote = evidenceQuote.trim().length > 0 ? evidenceQuote : segment.text;
  const index = segment.text.indexOf(exactQuote);
  if (index >= 0) {
    return {
      startChar: segment.start_char + index,
      endChar: segment.start_char + index + exactQuote.length,
      evidenceQuote: exactQuote,
    };
  }
  return {
    startChar: segment.start_char,
    endChar: segment.end_char,
    evidenceQuote: segment.text,
  };
}

function buildCanonicalSource(
  rawEvent: RawIngestEvent,
  segment: SegmentedIngestSegment,
  evidenceQuote: string,
): CanonicalCandidate["source"] {
  const range = deriveEvidenceRange(segment, evidenceQuote);
  return {
    event_id: rawEvent.event_id,
    source_type: rawEvent.source_type,
    source_id: rawEvent.source_id,
    speaker: rawEvent.speaker,
    created_at: rawEvent.created_at,
    segment_id: segment.segment_id,
    start_char: range.startChar,
    end_char: range.endChar,
    evidence_quote: range.evidenceQuote,
  };
}

function buildContentHash(input: {
  candidateId: string;
  unitType: CanonicalCandidate["unit_type"];
  kind: CanonicalCandidate["kind"];
  artifactType: CanonicalCandidate["artifact_type"];
  canonicalText: string;
  payload: Record<string, unknown>;
  scope: CanonicalCandidate["scope"];
  source: CanonicalCandidate["source"];
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function buildDeterministicAtomicCanonicalCandidate(input: {
  rawEvent: RawIngestEvent;
  segmentedById: Map<string, SegmentedIngestSegment>;
  candidate: AtomicCandidate;
}): CanonicalCandidate {
  const segment = input.segmentedById.get(input.candidate.source_segment_id);
  if (!segment) {
    throw new Error(
      `Missing segment ${input.candidate.source_segment_id} for atomic canonicalization`,
    );
  }
  const canonicalText = buildAtomicCanonicalText(input.candidate);
  const source = buildCanonicalSource(input.rawEvent, segment, input.candidate.evidence_quote);
  const scope = buildCanonicalScope(input.rawEvent, input.candidate.scope);
  const payload = input.candidate.payload as Record<string, unknown>;
  const searchText = buildSearchText([
    canonicalText,
    input.candidate.raw_statement,
    input.candidate.normalized_statement,
    payload.subject as string | undefined,
    payload.predicate as string | undefined,
    payload.object as string | undefined,
    payload.action as string | undefined,
    payload.trigger as string | undefined,
    payload.locator as string | undefined,
    ...(Array.isArray(payload.qualifiers)
      ? payload.qualifiers.filter((value): value is string => typeof value === "string")
      : []),
  ]);
  return {
    candidate_id: input.candidate.candidate_id,
    unit_type: "atomic",
    kind: input.candidate.kind,
    artifact_type: null,
    canonical_text: canonicalText,
    search_text: searchText,
    source,
    scope,
    validity: buildAtomicValidity(input.candidate),
    payload,
    parent_candidate_id: null,
    component_candidate_id: null,
    promotion: "global",
    confidence: input.candidate.confidence,
    quality: buildAtomicQuality(input.candidate),
    risk_flags: input.candidate.risk_flags,
    content_hash: buildContentHash({
      candidateId: input.candidate.candidate_id,
      unitType: "atomic",
      kind: input.candidate.kind,
      artifactType: null,
      canonicalText,
      payload,
      scope,
      source,
    }),
  };
}

function buildDeterministicCompositeCanonicalCandidate(input: {
  rawEvent: RawIngestEvent;
  segmentedById: Map<string, SegmentedIngestSegment>;
  candidate: CompositeCandidate;
}): CanonicalCandidate {
  const segment = input.segmentedById.get(input.candidate.source_segment_id);
  if (!segment) {
    throw new Error(
      `Missing segment ${input.candidate.source_segment_id} for composite canonicalization`,
    );
  }
  const canonicalText = buildCompositeCanonicalText(input.candidate);
  const source = buildCanonicalSource(input.rawEvent, segment, input.candidate.evidence_quote);
  const scope = buildCanonicalScope(input.rawEvent, input.candidate.scope);
  const payload = {
    title: input.candidate.title,
    purpose: input.candidate.purpose,
    summary: input.candidate.summary,
    activation_triggers: input.candidate.activation_triggers,
    components: input.candidate.components,
  };
  const searchText = buildSearchText([
    canonicalText,
    input.candidate.title,
    input.candidate.purpose,
    input.candidate.summary,
    ...input.candidate.activation_triggers,
    ...input.candidate.components.flatMap((component) => [component.role, component.content]),
  ]);
  return {
    candidate_id: input.candidate.candidate_id,
    unit_type: "composite",
    kind: null,
    artifact_type: input.candidate.artifact_type,
    canonical_text: canonicalText,
    search_text: searchText,
    source,
    scope,
    validity: buildCompositeValidity(input.candidate),
    payload,
    parent_candidate_id: null,
    component_candidate_id: null,
    promotion: "not_applicable",
    confidence: input.candidate.confidence,
    quality: buildCompositeQuality(input.candidate),
    risk_flags: input.candidate.risk_flags,
    content_hash: buildContentHash({
      candidateId: input.candidate.candidate_id,
      unitType: "composite",
      kind: null,
      artifactType: input.candidate.artifact_type,
      canonicalText,
      payload,
      scope,
      source,
    }),
  };
}

export function buildDeterministicCanonicalBatch(
  input: RuntimeCanonicalizationInput,
): CanonicalCandidateBatch {
  const segmentedById = buildSegmentLookup(input.segmented);
  const canonicalCandidates: CanonicalCandidate[] = [
    ...input.atomicBatch.atomic_candidates.map((candidate) =>
      buildDeterministicAtomicCanonicalCandidate({
        rawEvent: input.rawEvent,
        segmentedById,
        candidate,
      }),
    ),
    ...input.compositeBatch.composite_candidates.map((candidate) =>
      buildDeterministicCompositeCanonicalCandidate({
        rawEvent: input.rawEvent,
        segmentedById,
        candidate,
      }),
    ),
  ];
  const normalized = enforceCompositePromotionPolicy(
    normalizeCanonicalBatch(
      {
        schema_version: "canonical_candidates.v1",
        event_id: input.rawEvent.event_id,
        canonical_candidates: canonicalCandidates,
      },
      input.compositeBatch,
    ),
  );
  const errors = validateCanonical(normalized);
  if (errors.length > 0) {
    throw new Error(
      `Deterministic canonicalization produced invalid output: ${errors[0]?.message ?? "unknown error"}`,
    );
  }
  return normalized;
}

export async function canonicalizeCandidatesRuntime(
  input: RuntimeCanonicalizationInput,
): Promise<CanonicalCandidateBatch> {
  return buildDeterministicCanonicalBatch(input);
}

export async function repairCanonicalization(
  input: CanonicalizationInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<CanonicalCandidateBatch> {
  const prompt = buildRepairPrompt({
    modelId: input.modelId,
    contractVersion: "mmv2-canonicalization-repair-v1",
    originalPayload: input.previousPayload,
    validationErrors: input.validationErrors,
    expectedOutputShape: [
      'Top-level keys: "schema_version", "event_id", "canonical_candidates".',
      '"schema_version" must be "canonical_candidates.v1".',
      'Each canonical candidate must include "candidate_id", "unit_type", "kind", "artifact_type", "canonical_text", "search_text", "source", "scope", "validity", "payload", "parent_candidate_id", "component_candidate_id", "promotion", "confidence", "quality", "risk_flags", and "content_hash".',
    ].join("\n"),
    responseSchemaName: "canonical_candidate_batch",
    responseSchema: CanonicalCandidateBatchSchema,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CanonicalCandidateBatchSchema.safeParse(
    normalizeCanonicalPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 canonicalization repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  const normalized = enforceCompositePromotionPolicy(
    normalizeCanonicalBatch(parsed.data, input.compositeBatch),
  );
  const errors = validateCanonical(normalized);
  if (errors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 canonicalization repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return normalized;
}

export async function canonicalizeCandidates(
  input: CanonicalizationInput,
): Promise<CanonicalCandidateBatch> {
  const extractedCandidates = [
    ...input.atomicBatch.atomic_candidates,
    ...input.compositeBatch.composite_candidates,
  ];
  const prompt = buildCanonicalizationPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    extractedCandidates,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CanonicalCandidateBatchSchema.safeParse(
    normalizeCanonicalPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    return repairCanonicalization({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const normalized = enforceCompositePromotionPolicy(
    normalizeCanonicalBatch(parsed.data, input.compositeBatch),
  );
  const errors = validateCanonical(normalized);
  if (errors.length > 0) {
    return repairCanonicalization({
      ...input,
      previousPayload: normalized,
      validationErrors: errors,
    });
  }
  return normalized;
}
