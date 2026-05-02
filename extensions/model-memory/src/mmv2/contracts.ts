import { z } from "zod";

export const RawIngestMetadataSchema = z
  .object({
    locale: z.string(),
    channel: z.string(),
    project_id: z.string().nullable(),
    workspace_id: z.string().nullable(),
    conversation_title: z.string().nullable(),
    sensitivity_hint: z.enum([
      "none",
      "personal",
      "credentials_possible",
      "health_possible",
      "financial_possible",
      "legal_possible",
      "unknown",
    ]),
  })
  .strict();

export const RawIngestEventSchema = z
  .object({
    event_id: z.string(),
    schema_version: z.literal("memory_ingest.v1"),
    tenant_id: z.string(),
    user_id: z.string(),
    session_id: z.string(),
    source_type: z.enum([
      "chat_message",
      "conversation_turn",
      "meeting_transcript",
      "document",
      "email",
      "task_log",
      "manual_note",
      "api_event",
    ]),
    source_id: z.string(),
    speaker: z.enum(["user", "assistant", "system", "developer", "third_party", "unknown"]),
    created_at: z.string().datetime(),
    timezone: z.string(),
    raw_text: z.string().min(1),
    metadata: RawIngestMetadataSchema,
  })
  .strict();

export type RawIngestEvent = z.infer<typeof RawIngestEventSchema>;

export const SegmentedIngestSegmentSchema = z
  .object({
    segment_id: z.string(),
    start_char: z.number().int().min(0),
    end_char: z.number().int().min(1),
    text: z.string(),
    detected_shape: z.enum([
      "sentence",
      "paragraph",
      "bullet",
      "numbered_item",
      "numbered_list_block",
      "bullet_list_block",
      "heading_plus_body",
      "table_row",
      "code_block",
      "quote_block",
      "transcript_turn",
      "unknown",
    ]),
    local_context_before: z.string(),
    local_context_after: z.string(),
  })
  .strict();

export const SegmentedIngestEventSchema = z
  .object({
    event_id: z.string(),
    schema_version: z.literal("segmented_ingest.v1"),
    raw_text_sha256: z.string(),
    segments: z.array(SegmentedIngestSegmentSchema),
  })
  .strict();

export type SegmentedIngestSegment = z.infer<typeof SegmentedIngestSegmentSchema>;
export type SegmentedIngestEvent = z.infer<typeof SegmentedIngestEventSchema>;

export const CaptureRoutingDecisionSchema = z
  .object({
    segment_id: z.string(),
    route: z.enum(["ignore", "atomic_candidate", "composite_candidate", "needs_more_context"]),
    candidate_summary: z.string().max(280),
    memory_likelihood: z.number().min(0).max(1),
    durability_likelihood: z.number().min(0).max(1),
    composite_likelihood: z.number().min(0).max(1),
    reason_codes: z.array(
      z.enum([
        "explicit_user_preference",
        "assistant_behavior_instruction",
        "durable_project_fact",
        "durable_user_fact",
        "source_pointer",
        "decision_or_commitment",
        "event_or_outcome",
        "ordered_steps",
        "checklist",
        "workflow_or_runbook",
        "temporary_context",
        "explicit_no_store",
        "privacy_opt_out",
        "smalltalk",
        "ambiguous",
        "sensitive",
        "not_memory",
      ]),
    ),
    evidence_quote: z.string(),
    confidence: z.number().min(0).max(1),
    allow_multiple_top_level_atomic: z.boolean().default(false),
  })
  .strict();

export const CaptureRoutingBatchSchema = z
  .object({
    schema_version: z.literal("capture_routing.v1"),
    event_id: z.string(),
    routing_decisions: z.array(CaptureRoutingDecisionSchema),
  })
  .strict();

export type CaptureRoutingDecision = z.infer<typeof CaptureRoutingDecisionSchema>;
export type CaptureRoutingBatch = z.infer<typeof CaptureRoutingBatchSchema>;

export const RoutedCandidateSchema = SegmentedIngestSegmentSchema.extend({
  source_route: z.enum(["atomic_candidate", "composite_candidate"]),
  candidate_summary: z.string().max(280),
  memory_likelihood: z.number().min(0).max(1),
  durability_likelihood: z.number().min(0).max(1),
  composite_likelihood: z.number().min(0).max(1),
  reason_codes: CaptureRoutingDecisionSchema.shape.reason_codes,
  evidence_quote: z.string(),
  confidence: z.number().min(0).max(1),
  allow_multiple_top_level_atomic: z.boolean().default(false),
}).strict();

export const AtomicRoutedCandidateSchema = RoutedCandidateSchema.extend({
  source_route: z.literal("atomic_candidate"),
}).strict();

export const CompositeRoutedCandidateSchema = RoutedCandidateSchema.extend({
  source_route: z.literal("composite_candidate"),
}).strict();

export const RoutedCandidateBatchSchema = z
  .object({
    schema_version: z.literal("capture_routing.v1"),
    event_id: z.string(),
    routed_candidates: z.array(RoutedCandidateSchema),
  })
  .strict();

export type RoutedCandidate = z.infer<typeof RoutedCandidateSchema>;
export type AtomicRoutedCandidate = z.infer<typeof AtomicRoutedCandidateSchema>;
export type CompositeRoutedCandidate = z.infer<typeof CompositeRoutedCandidateSchema>;
export type RoutedCandidateBatch = z.infer<typeof RoutedCandidateBatchSchema>;

export const CandidateScopeSchema = z
  .object({
    subject_type: z.enum([
      "user",
      "assistant",
      "project",
      "workspace",
      "organization",
      "external_entity",
      "system",
      "unknown",
    ]),
    subject_id: z.string().nullable(),
    project_id: z.string().nullable(),
    workspace_id: z.string().nullable(),
    applies_to: z.enum([
      "global",
      "current_project",
      "current_workspace",
      "specific_entity",
      "current_session_only",
      "unknown",
    ]),
  })
  .strict();

const ClaimPayloadSchema = z
  .object({
    payload_type: z.literal("claim"),
    claim_type: z.enum([
      "preference_state",
      "identity",
      "relationship",
      "project_fact",
      "tool_fact",
      "environment_fact",
      "decision",
      "capability",
      "constraint_state",
      "other",
    ]),
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
    qualifiers: z.array(z.string()),
    temporal_status: z.enum(["currently_true", "historically_true", "future_intent", "unknown"]),
  })
  .strict();

const DirectivePayloadSchema = z
  .object({
    payload_type: z.literal("directive"),
    directive_type: z.enum([
      "response_style",
      "tool_use",
      "workflow_behavior",
      "safety_constraint",
      "communication",
      "coding_style",
      "formatting",
      "privacy",
      "project_rule",
      "other",
    ]),
    authority: z.enum([
      "user",
      "system",
      "developer",
      "organization",
      "assistant_inferred",
      "unknown",
    ]),
    target: z.enum(["assistant", "user", "project", "team", "tool", "system", "unknown"]),
    strength: z.enum([
      "hard_constraint",
      "soft_default",
      "situational_instruction",
      "style_preference",
      "unknown",
    ]),
    trigger: z.string(),
    action: z.string(),
    exceptions: z.array(z.string()),
    overridable: z.boolean(),
    derived_from_claim_candidate_ids: z.array(z.string()),
  })
  .strict();

const SourceRefPayloadSchema = z
  .object({
    payload_type: z.literal("source_ref"),
    ref_type: z.enum([
      "url",
      "file_path",
      "repo_path",
      "document_title",
      "ticket",
      "person",
      "email_thread",
      "calendar_event",
      "database_record",
      "unknown",
    ]),
    locator: z.string(),
    label: z.string(),
    access_hint: z.string().nullable(),
    when_to_use: z.string(),
  })
  .strict();

const EpisodePayloadSchema = z
  .object({
    payload_type: z.literal("episode"),
    event_type: z.enum([
      "decision_made",
      "task_completed",
      "task_failed",
      "preference_changed",
      "instruction_given",
      "meeting_happened",
      "artifact_created",
      "artifact_updated",
      "other",
    ]),
    actor: z.string(),
    action: z.string(),
    object: z.string(),
    outcome: z.string(),
    event_time: z.string().datetime().nullable(),
  })
  .strict();

export const AtomicCandidateSchema = z
  .object({
    candidate_id: z.string(),
    source_segment_id: z.string(),
    kind: z.enum(["claim", "directive", "source_ref", "episode"]),
    raw_statement: z.string(),
    normalized_statement: z.string(),
    evidence_quote: z.string(),
    source_grounding: z.enum(["explicit", "strongly_implied", "weakly_implied"]),
    scope: CandidateScopeSchema,
    payload: z.discriminatedUnion("payload_type", [
      ClaimPayloadSchema,
      DirectivePayloadSchema,
      SourceRefPayloadSchema,
      EpisodePayloadSchema,
    ]),
    confidence: z.number().min(0).max(1),
    risk_flags: z.array(
      z.enum([
        "contains_pii",
        "contains_secret",
        "health_data",
        "financial_data",
        "legal_data",
        "credential_like",
        "safety_sensitive",
        "low_confidence",
        "none",
      ]),
    ),
  })
  .strict();

export const AtomicExtractionBatchSchema = z
  .object({
    schema_version: z.literal("atomic_extraction.v1"),
    event_id: z.string(),
    atomic_candidates: z.array(AtomicCandidateSchema),
  })
  .strict();

export type AtomicCandidate = z.infer<typeof AtomicCandidateSchema>;
export type AtomicExtractionBatch = z.infer<typeof AtomicExtractionBatchSchema>;

export const CompositeComponentSchema = z
  .object({
    component_id: z.string(),
    source_segment_id: z.string().optional(),
    order_index: z.number().int().min(0),
    role: z.enum([
      "step",
      "substep",
      "guardrail",
      "precondition",
      "postcondition",
      "decision_point",
      "reference",
      "fact",
      "rationale",
      "example",
      "owner",
      "open_question",
      "other",
    ]),
    content: z.string(),
    embedded_atomic_kind: z.enum(["claim", "directive", "source_ref", "episode", "none"]),
    promotion: z.enum(["embedded_only", "global", "both", "blocked"]),
    evidence_quote: z.string(),
    required: z.boolean(),
    conditions: z.array(z.string()),
    outputs: z.array(z.string()),
  })
  .strict();

export const CompositeCandidateSchema = z
  .object({
    candidate_id: z.string(),
    source_segment_id: z.string(),
    artifact_type: z.enum([
      "procedure",
      "checklist",
      "profile",
      "project_state",
      "decision_record",
      "source_bundle",
      "lesson_pack",
    ]),
    title: z.string(),
    purpose: z.string(),
    activation_triggers: z.array(z.string()),
    summary: z.string(),
    evidence_quote: z.string(),
    components: z.array(CompositeComponentSchema).min(1),
    scope: CandidateScopeSchema,
    confidence: z.number().min(0).max(1),
    risk_flags: z.array(
      z.enum([
        "contains_pii",
        "contains_secret",
        "health_data",
        "financial_data",
        "legal_data",
        "credential_like",
        "safety_sensitive",
        "low_confidence",
        "none",
      ]),
    ),
  })
  .strict();

export const CompositeExtractionBatchSchema = z
  .object({
    schema_version: z.literal("composite_extraction.v1"),
    event_id: z.string(),
    composite_candidates: z.array(CompositeCandidateSchema),
  })
  .strict();

export type CompositeComponent = z.infer<typeof CompositeComponentSchema>;
export type CompositeCandidate = z.infer<typeof CompositeCandidateSchema>;
export type CompositeExtractionBatch = z.infer<typeof CompositeExtractionBatchSchema>;

export const CanonicalSourceSchema = z
  .object({
    event_id: z.string(),
    source_type: z.string(),
    source_id: z.string(),
    speaker: z.string(),
    created_at: z.string().datetime(),
    segment_id: z.string(),
    start_char: z.number().int(),
    end_char: z.number().int(),
    evidence_quote: z.string(),
  })
  .strict();

export const CanonicalScopeSchema = z
  .object({
    tenant_id: z.string(),
    user_id: z.string(),
    project_id: z.string().nullable(),
    workspace_id: z.string().nullable(),
    subject_type: z.string(),
    subject_id: z.string().nullable(),
    applies_to: z.string(),
  })
  .strict();
export type CanonicalScope = z.infer<typeof CanonicalScopeSchema>;

export const CanonicalValiditySchema = z
  .object({
    valid_at: z.string().datetime().nullable(),
    invalid_at: z.string().datetime().nullable(),
    ttl_seconds: z.number().int().nullable(),
    temporal_status: z.enum(["current", "historical", "future", "unknown"]),
  })
  .strict();
export type CanonicalValidity = z.infer<typeof CanonicalValiditySchema>;

export const CanonicalQualitySchema = z
  .object({
    atomicity: z.number().min(0).max(1),
    specificity: z.number().min(0).max(1),
    durability: z.number().min(0).max(1),
    actionability: z.number().min(0).max(1),
    grounding: z.number().min(0).max(1),
  })
  .strict();
export type CanonicalQuality = z.infer<typeof CanonicalQualitySchema>;

export const CanonicalCandidateSchema = z
  .object({
    candidate_id: z.string(),
    unit_type: z.enum(["atomic", "composite", "component"]),
    kind: z.enum(["claim", "directive", "source_ref", "episode"]).nullable(),
    artifact_type: z
      .enum([
        "procedure",
        "checklist",
        "profile",
        "project_state",
        "decision_record",
        "source_bundle",
        "lesson_pack",
      ])
      .nullable(),
    canonical_text: z.string(),
    search_text: z.string(),
    source: CanonicalSourceSchema,
    scope: CanonicalScopeSchema,
    validity: CanonicalValiditySchema,
    payload: z.record(z.string(), z.unknown()),
    parent_candidate_id: z.string().nullable(),
    component_candidate_id: z.string().nullable(),
    promotion: z.enum(["global", "embedded_only", "both", "blocked", "not_applicable"]),
    confidence: z.number().min(0).max(1),
    quality: CanonicalQualitySchema,
    risk_flags: z.array(z.string()),
    content_hash: z.string(),
  })
  .strict();

export const CanonicalCandidateBatchSchema = z
  .object({
    schema_version: z.literal("canonical_candidates.v1"),
    event_id: z.string(),
    canonical_candidates: z.array(CanonicalCandidateSchema),
  })
  .strict();

export type CanonicalCandidate = z.infer<typeof CanonicalCandidateSchema>;
export type CanonicalCandidateBatch = z.infer<typeof CanonicalCandidateBatchSchema>;

export const AdmissionDecisionSchema = z
  .object({
    candidate_id: z.string(),
    decision: z.enum(["admit", "reject", "quarantine", "embed_only"]),
    scores: z
      .object({
        future_utility: z.number().min(0).max(1),
        durability: z.number().min(0).max(1),
        confidence: z.number().min(0).max(1),
        novelty: z.number().min(0).max(1),
        scope_clarity: z.number().min(0).max(1),
        sensitivity_safety: z.number().min(0).max(1),
        specificity: z.number().min(0).max(1),
      })
      .strict(),
    reason_codes: z.array(
      z.enum([
        "durable",
        "useful_future_context",
        "explicit_user_statement",
        "clear_instruction",
        "canonical_source",
        "important_decision",
        "temporary",
        "explicit_no_store",
        "privacy_opt_out",
        "duplicate_likely",
        "too_vague",
        "low_confidence",
        "sensitive",
        "embedded_component_only",
        "scope_unclear",
        "not_actionable",
        "not_memory",
      ]),
    ),
    rationale: z.string(),
    recommended_ttl_seconds: z.number().int().nullable(),
    requires_reconciliation: z.boolean(),
  })
  .strict();

export const AdmissionDecisionBatchSchema = z
  .object({
    schema_version: z.literal("admission_decision.v1"),
    event_id: z.string(),
    decisions: z.array(AdmissionDecisionSchema),
  })
  .strict();

export type AdmissionDecision = z.infer<typeof AdmissionDecisionSchema>;
export type AdmissionDecisionBatch = z.infer<typeof AdmissionDecisionBatchSchema>;

export const ExistingMemorySummarySchema = z
  .object({
    memory_id: z.string(),
    unit_type: z.string(),
    kind: z.string().nullable(),
    artifact_type: z.string().nullable(),
    canonical_text: z.string(),
    scope: z.record(z.string(), z.unknown()),
    payload: z.record(z.string(), z.unknown()),
    validity: z.record(z.string(), z.unknown()),
    confidence: z.number(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const ReconciliationInputSchema = z
  .object({
    schema_version: z.literal("reconciliation_input.v1"),
    event_id: z.string(),
    candidate: CanonicalCandidateSchema,
    neighbors: z.array(ExistingMemorySummarySchema),
  })
  .strict();

export const ReconciliationDecisionSchema = z
  .object({
    schema_version: z.literal("reconciliation_decision.v1"),
    event_id: z.string(),
    candidate_id: z.string(),
    decision: z.enum([
      "insert_new",
      "merge_with_existing",
      "supersede_existing",
      "keep_existing_ignore_candidate",
      "record_as_conflict",
      "quarantine",
    ]),
    target_memory_ids: z.array(z.string()),
    merged_canonical_text: z.string().nullable(),
    conflict_type: z.enum([
      "none",
      "direct_contradiction",
      "preference_changed",
      "scope_narrowing",
      "scope_broadening",
      "version_update",
      "duplicate",
      "ambiguous",
    ]),
    supersedes_memory_ids: z.array(z.string()),
    rationale: z.string(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ExistingMemorySummary = z.infer<typeof ExistingMemorySummarySchema>;
export type ReconciliationInput = z.infer<typeof ReconciliationInputSchema>;
export type ReconciliationDecision = z.infer<typeof ReconciliationDecisionSchema>;

export const MemoryEventSchema = z
  .object({
    memory_event_id: z.string(),
    schema_version: z.literal("memory_event.v1"),
    event_type: z.enum([
      "candidate_captured",
      "candidate_rejected",
      "candidate_quarantined",
      "memory_inserted",
      "memory_merged",
      "memory_superseded",
      "memory_invalidated",
      "conflict_recorded",
      "component_embedded",
      "artifact_inserted",
      "artifact_updated",
    ]),
    occurred_at: z.string().datetime(),
    actor: z.enum(["system", "model", "human_reviewer"]),
    source_ingest_event_id: z.string(),
    candidate_id: z.string().nullable(),
    memory_id: z.string().nullable(),
    target_memory_ids: z.array(z.string()),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const DurableMemoryRecordSchema = z
  .object({
    memory_id: z.string(),
    schema_version: z.literal("durable_memory.v1"),
    status: z.enum(["active", "inactive", "superseded", "conflicted", "quarantined", "deleted"]),
    unit_type: z.enum(["atomic", "composite"]),
    kind: z.string().nullable(),
    artifact_type: z.string().nullable(),
    canonical_text: z.string(),
    search_text: z.string(),
    scope: CanonicalScopeSchema,
    payload: z.record(z.string(), z.unknown()),
    validity: CanonicalValiditySchema,
    confidence: z.number().min(0).max(1),
    quality: CanonicalQualitySchema,
    source_refs: z.array(
      z
        .object({
          source_ingest_event_id: z.string(),
          source_type: z.string(),
          source_id: z.string(),
          speaker: z.string(),
          created_at: z.string().datetime(),
          segment_id: z.string(),
          start_char: z.number().int(),
          end_char: z.number().int(),
          evidence_quote: z.string(),
        })
        .strict(),
    ),
    lineage: z
      .object({
        candidate_ids: z.array(z.string()),
        derived_from_memory_ids: z.array(z.string()),
        supersedes_memory_ids: z.array(z.string()),
        superseded_by_memory_id: z.string().nullable(),
        conflicts_with_memory_ids: z.array(z.string()),
        parent_memory_id: z.string().nullable(),
        child_memory_ids: z.array(z.string()),
      })
      .strict(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    last_accessed_at: z.string().datetime().nullable(),
    access_count: z.number().int().min(0),
    tags: z.array(z.string()),
  })
  .strict();

export const MemoryEdgeSchema = z
  .object({
    edge_id: z.string(),
    schema_version: z.literal("memory_edge.v1"),
    from_memory_id: z.string(),
    to_memory_id: z.string(),
    edge_type: z.enum([
      "parent_of",
      "child_of",
      "derived_from",
      "supersedes",
      "superseded_by",
      "conflicts_with",
      "supports",
      "duplicates",
      "references",
    ]),
    created_at: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .strict();

export const PostWriteAuditSchema = z
  .object({
    schema_version: z.literal("post_write_audit.v1"),
    event_id: z.string(),
    audit_status: z.enum(["pass", "pass_with_warnings", "fail"]),
    checked_memory_ids: z.array(z.string()),
    errors: z.array(
      z
        .object({
          memory_id: z.string().nullable(),
          error_code: z.string(),
          message: z.string(),
        })
        .strict(),
    ),
    warnings: z.array(
      z
        .object({
          memory_id: z.string().nullable(),
          warning_code: z.string(),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
export type DurableMemoryRecord = z.infer<typeof DurableMemoryRecordSchema>;
export type MemoryEdge = z.infer<typeof MemoryEdgeSchema>;
export type PostWriteAudit = z.infer<typeof PostWriteAuditSchema>;
