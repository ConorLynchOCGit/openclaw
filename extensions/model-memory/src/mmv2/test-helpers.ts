import type {
  InterpreterSourceWindow,
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import { adaptDocumentSource } from "../source-adapters/document-source-adapter.ts";
import type {
  AdmissionDecision,
  AtomicCandidate,
  AtomicRoutedCandidate,
  CanonicalCandidate,
  CompositeRoutedCandidate,
  CompositeCandidate,
  ExistingMemorySummary,
  RawIngestEvent,
  SegmentedIngestEvent,
} from "./contracts.ts";
import { createRawIngestEvent } from "./raw-ingest.ts";
import { segmentRawIngestEvent } from "./segmentation.ts";

export function createMmV2TestSource(text: string): {
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  sourceWindow: InterpreterSourceWindow;
  sourceId: string;
} {
  const envelope = adaptDocumentSource({
    externalSourceId: "doc-test-001",
    text,
    maxWordsPerWindow: Number.MAX_SAFE_INTEGER,
    sourceKind: "document",
  });
  const rawEvent = createRawIngestEvent({
    sourceId: envelope.source.id,
    rawText: envelope.normalizedText,
    createdAt: envelope.source.createdAt,
    sourceType: "document",
    metadata: {
      channel: "document_ingest_shadow",
      locale: "en",
      project_id: null,
      workspace_id: null,
      conversation_title: null,
      sensitivity_hint: "unknown",
    },
  });
  const segmented = segmentRawIngestEvent(rawEvent);
  return {
    rawEvent,
    segmented,
    sourceWindow: envelope.windows[0],
    sourceId: envelope.source.id,
  };
}

export function createScriptedMmV2Interpreter(
  handlers: Record<
    string,
    (
      input: SemanticInterpreterInput,
    ) => SemanticInterpreterResult | Promise<SemanticInterpreterResult>
  >,
): SemanticInterpreter {
  return {
    interpret(input) {
      const handler = handlers[input.prompt.contract.contractVersion];
      if (!handler) {
        throw new Error(`No MMV2 handler for ${input.prompt.contract.contractVersion}`);
      }
      return Promise.resolve(handler(input));
    },
  };
}

export function captureOne(object: unknown): SemanticInterpreterResult {
  return { action: "capture", objects: [object] };
}

export function buildAtomicCandidate(
  segmentId: string,
  evidenceQuote: string,
  overrides: Partial<AtomicCandidate> = {},
): AtomicCandidate {
  return {
    candidate_id: overrides.candidate_id ?? "candidate-001",
    source_segment_id: segmentId,
    kind: overrides.kind ?? "claim",
    raw_statement: overrides.raw_statement ?? evidenceQuote,
    normalized_statement: overrides.normalized_statement ?? "The user prefers concise answers.",
    evidence_quote: evidenceQuote,
    source_grounding: overrides.source_grounding ?? "explicit",
    scope: overrides.scope ?? {
      subject_type: "user",
      subject_id: "user",
      project_id: null,
      workspace_id: null,
      applies_to: "global",
    },
    payload: overrides.payload ?? {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: "concise answers",
      qualifiers: [],
      temporal_status: "currently_true",
    },
    confidence: overrides.confidence ?? 0.92,
    risk_flags: overrides.risk_flags ?? ["none"],
  };
}

export function buildAtomicRoutedCandidate(
  segment: SegmentedIngestEvent["segments"][number],
  overrides: Partial<AtomicRoutedCandidate> = {},
): AtomicRoutedCandidate {
  return {
    ...segment,
    source_route: "atomic_candidate",
    candidate_summary: overrides.candidate_summary ?? "Atomic routed candidate",
    memory_likelihood: overrides.memory_likelihood ?? 0.8,
    durability_likelihood: overrides.durability_likelihood ?? 0.8,
    composite_likelihood: overrides.composite_likelihood ?? 0.05,
    reason_codes: overrides.reason_codes ?? ["durable_user_fact"],
    evidence_quote: overrides.evidence_quote ?? segment.text,
    confidence: overrides.confidence ?? 0.9,
    allow_multiple_top_level_atomic: overrides.allow_multiple_top_level_atomic ?? false,
  };
}

export function buildCompositeCandidate(
  segmentId: string,
  evidenceQuote: string,
  overrides: Partial<CompositeCandidate> = {},
): CompositeCandidate {
  return {
    candidate_id: overrides.candidate_id ?? "composite-001",
    source_segment_id: segmentId,
    artifact_type: overrides.artifact_type ?? "procedure",
    title: overrides.title ?? "Release checklist",
    purpose: overrides.purpose ?? "Safely release a new version.",
    activation_triggers: overrides.activation_triggers ?? ["release"],
    summary: overrides.summary ?? "Release checklist with ordered steps.",
    evidence_quote: evidenceQuote,
    components: overrides.components ?? [
      {
        component_id: "c1",
        order_index: 0,
        role: "step",
        content: "Run the test suite.",
        embedded_atomic_kind: "directive",
        promotion: "embedded_only",
        evidence_quote: "Run the test suite.",
        required: true,
        conditions: [],
        outputs: [],
      },
    ],
    scope: overrides.scope ?? {
      subject_type: "project",
      subject_id: "project",
      project_id: "project-001",
      workspace_id: null,
      applies_to: "current_project",
    },
    confidence: overrides.confidence ?? 0.88,
    risk_flags: overrides.risk_flags ?? ["none"],
  };
}

export function buildCompositeRoutedCandidate(
  segment: SegmentedIngestEvent["segments"][number],
  overrides: Partial<CompositeRoutedCandidate> = {},
): CompositeRoutedCandidate {
  return {
    ...segment,
    source_route: "composite_candidate",
    candidate_summary: overrides.candidate_summary ?? "Composite routed candidate",
    memory_likelihood: overrides.memory_likelihood ?? 0.8,
    durability_likelihood: overrides.durability_likelihood ?? 0.8,
    composite_likelihood: overrides.composite_likelihood ?? 0.95,
    reason_codes: overrides.reason_codes ?? ["ordered_steps"],
    evidence_quote: overrides.evidence_quote ?? segment.text,
    confidence: overrides.confidence ?? 0.9,
    allow_multiple_top_level_atomic: false,
  };
}

export function buildCanonicalCandidate(
  rawEvent: Pick<RawIngestEvent, "event_id" | "tenant_id" | "user_id"> & Partial<RawIngestEvent>,
  segmentId: string,
  evidenceQuote: string,
  overrides: Partial<CanonicalCandidate> = {},
): CanonicalCandidate {
  return {
    candidate_id: overrides.candidate_id ?? "canonical-001",
    unit_type: overrides.unit_type ?? "atomic",
    kind: Object.prototype.hasOwnProperty.call(overrides, "kind")
      ? (overrides.kind ?? null)
      : "claim",
    artifact_type: Object.prototype.hasOwnProperty.call(overrides, "artifact_type")
      ? (overrides.artifact_type ?? null)
      : null,
    canonical_text: overrides.canonical_text ?? "The user prefers concise answers.",
    search_text: overrides.search_text ?? "user prefers concise answers",
    source: overrides.source ?? {
      event_id: rawEvent.event_id,
      source_type: rawEvent.source_type ?? "document",
      source_id: rawEvent.source_id ?? "test-source",
      speaker: rawEvent.speaker ?? "user",
      created_at: rawEvent.created_at ?? "2026-04-21T00:00:00.000Z",
      segment_id: segmentId,
      start_char: 0,
      end_char: evidenceQuote.length,
      evidence_quote: evidenceQuote,
    },
    scope: overrides.scope ?? {
      tenant_id: rawEvent.tenant_id,
      user_id: rawEvent.user_id,
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "user",
      applies_to: "global",
    },
    validity: overrides.validity ?? {
      valid_at: rawEvent.created_at ?? "2026-04-21T00:00:00.000Z",
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    payload: overrides.payload ?? {
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: "concise answers",
    },
    parent_candidate_id: overrides.parent_candidate_id ?? null,
    component_candidate_id: overrides.component_candidate_id ?? null,
    promotion: overrides.promotion ?? "not_applicable",
    confidence: overrides.confidence ?? 0.9,
    quality: overrides.quality ?? {
      atomicity: 0.9,
      specificity: 0.8,
      durability: 0.85,
      actionability: 0.6,
      grounding: 0.95,
    },
    risk_flags: overrides.risk_flags ?? ["none"],
    content_hash: overrides.content_hash ?? "hash-001",
  };
}

export function buildAdmissionDecision(
  candidateId: string,
  overrides: Partial<AdmissionDecision> = {},
): AdmissionDecision {
  return {
    candidate_id: candidateId,
    decision: overrides.decision ?? "admit",
    scores: overrides.scores ?? {
      future_utility: 0.8,
      durability: 0.8,
      confidence: 0.9,
      novelty: 0.7,
      scope_clarity: 0.8,
      sensitivity_safety: 0.95,
      specificity: 0.8,
    },
    reason_codes: overrides.reason_codes ?? ["durable", "explicit_user_statement"],
    rationale: overrides.rationale ?? "Durable explicit candidate.",
    recommended_ttl_seconds: overrides.recommended_ttl_seconds ?? null,
    requires_reconciliation: overrides.requires_reconciliation ?? false,
  };
}

export function buildExistingMemorySummary(
  canonical: CanonicalCandidate,
  overrides: Partial<ExistingMemorySummary> = {},
): ExistingMemorySummary {
  return {
    memory_id: overrides.memory_id ?? "memory-001",
    unit_type: overrides.unit_type ?? canonical.unit_type,
    kind: overrides.kind ?? canonical.kind,
    artifact_type: overrides.artifact_type ?? canonical.artifact_type,
    canonical_text: overrides.canonical_text ?? canonical.canonical_text,
    scope: overrides.scope ?? canonical.scope,
    payload: overrides.payload ?? canonical.payload,
    validity: overrides.validity ?? canonical.validity,
    confidence: overrides.confidence ?? canonical.confidence,
    created_at: overrides.created_at ?? canonical.source.created_at,
    updated_at: overrides.updated_at ?? canonical.source.created_at,
  };
}
