import type {
  AdmissionDecision,
  AtomicCandidate,
  CanonicalCandidate,
  CaptureRoutingDecision,
  CompositeCandidate,
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
  PostWriteAudit,
  ReconciliationDecision,
  SegmentedIngestSegment,
} from "./contracts.ts";

export type MmV2PhaseExpectation<T> = {
  mode: "strict" | "bounded";
  exactCount?: number;
  items: T[];
};

export type MmV2SegmentExpectation = {
  exactText?: string;
  textIncludes?: string;
  detectedShape?: SegmentedIngestSegment["detected_shape"];
  startChar?: number;
  endChar?: number;
  localContextBeforeIncludes?: string;
  localContextAfterIncludes?: string;
};

export type MmV2RoutingExpectation = {
  segmentTextIncludes?: string;
  route?: CaptureRoutingDecision["route"];
  reasonCodesInclude?: CaptureRoutingDecision["reason_codes"];
  evidenceQuote?: string;
  minConfidence?: number;
};

export type MmV2AtomicExpectation = {
  candidateId?: string;
  sourceSegmentTextIncludes?: string;
  evidenceQuote?: string;
  kind?: AtomicCandidate["kind"];
  normalizedStatement?: string;
  payloadSubset?: Record<string, unknown>;
  minConfidence?: number;
};

export type MmV2CompositeExpectation = {
  candidateId?: string;
  sourceSegmentTextIncludes?: string;
  evidenceQuote?: string;
  artifactType?: CompositeCandidate["artifact_type"];
  title?: string;
  summaryIncludes?: string;
  componentCount?: number;
  componentRolesInclude?: Array<CompositeCandidate["components"][number]["role"]>;
  embeddedOnlyEvidenceQuotes?: string[];
  promotedEvidenceQuotes?: string[];
};

export type MmV2SuppressionExpectation = {
  exactCount?: number;
  keptEvidenceQuotes?: string[];
  suppressedEvidenceQuotes?: string[];
};

export type MmV2CanonicalExpectation = {
  candidateId?: string;
  canonicalTextIncludes?: string;
  unitType?: CanonicalCandidate["unit_type"];
  kind?: CanonicalCandidate["kind"];
  artifactType?: CanonicalCandidate["artifact_type"];
  promotion?: CanonicalCandidate["promotion"];
  sourceEvidenceQuote?: string;
  payloadSubset?: Record<string, unknown>;
};

export type MmV2AdmissionExpectation = {
  candidateId?: string;
  canonicalTextIncludes?: string;
  decision?: AdmissionDecision["decision"];
  requiresReconciliation?: boolean;
  reasonCodesInclude?: AdmissionDecision["reason_codes"];
  minScores?: Partial<AdmissionDecision["scores"]>;
};

export type MmV2ReconciliationExpectation = {
  candidateId?: string;
  candidateCanonicalTextIncludes?: string;
  decision?: ReconciliationDecision["decision"];
  conflictType?: ReconciliationDecision["conflict_type"];
  targetMemoryIdsInclude?: string[];
  supersedesMemoryIdsInclude?: string[];
  rationaleIncludes?: string;
};

export type MmV2RecordingExpectation = {
  durableMemoryCount?: number;
  memoryEventTypesInclude?: Array<MemoryEvent["event_type"]>;
  memoryEdgeTypesInclude?: Array<MemoryEdge["edge_type"]>;
  durableKindsInclude?: Array<CanonicalCandidate["kind"] | CanonicalCandidate["artifact_type"]>;
};

export type MmV2AuditExpectation = {
  auditStatus?: PostWriteAudit["audit_status"];
  errorCodesInclude?: string[];
  warningCodesInclude?: string[];
};

export type MmV2ScriptedRoutingDecision = Omit<CaptureRoutingDecision, "segment_id"> & {
  segmentTextIncludes: string;
};

export type MmV2ScriptedAtomicCandidate = Omit<AtomicCandidate, "source_segment_id"> & {
  sourceSegmentTextIncludes: string;
};

export type MmV2ScriptedCompositeCandidate = Omit<CompositeCandidate, "source_segment_id"> & {
  sourceSegmentTextIncludes: string;
};

export type MmV2ScriptedCanonicalCandidate = Omit<CanonicalCandidate, "source"> & {
  sourceEvidenceQuote: string;
};

export type MmV2ScriptedReconciliationDecision = Omit<
  ReconciliationDecision,
  "schema_version" | "event_id" | "candidate_id"
> & {
  candidateId?: string;
  candidateCanonicalTextIncludes?: string;
};

export type MmV2DocumentProofCase = {
  id: string;
  sourceKind: "document";
  text: string;
  metadata?: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  scripted: {
    routing: MmV2ScriptedRoutingDecision[];
    atomic: MmV2ScriptedAtomicCandidate[];
    composite: MmV2ScriptedCompositeCandidate[];
    canonicalization: MmV2ScriptedCanonicalCandidate[];
    admission: AdmissionDecision[];
    reconciliation?: MmV2ScriptedReconciliationDecision[];
  };
  seededNeighbors?: ExistingMemorySummary[];
  seededNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
  expected: {
    segmentation?: MmV2PhaseExpectation<MmV2SegmentExpectation>;
    routing?: MmV2PhaseExpectation<MmV2RoutingExpectation>;
    atomic?: MmV2PhaseExpectation<MmV2AtomicExpectation>;
    composite?: MmV2PhaseExpectation<MmV2CompositeExpectation>;
    suppression?: MmV2SuppressionExpectation;
    canonicalization?: MmV2PhaseExpectation<MmV2CanonicalExpectation>;
    admission?: MmV2PhaseExpectation<MmV2AdmissionExpectation>;
    reconciliation?: MmV2PhaseExpectation<MmV2ReconciliationExpectation>;
    recording?: MmV2RecordingExpectation;
    audit?: MmV2AuditExpectation;
  };
};

function strictPhase<T>(items: T[], exactCount = items.length): MmV2PhaseExpectation<T> {
  return { mode: "strict", exactCount, items };
}

function boundedPhase<T>(items: T[], exactCount?: number): MmV2PhaseExpectation<T> {
  return { mode: "bounded", exactCount, items };
}

function preferenceNeighbor(input: {
  memoryId: string;
  canonicalText: string;
  object: string;
  appliesTo?: ExistingMemorySummary["scope"]["applies_to"];
  projectId?: string | null;
}): ExistingMemorySummary {
  return {
    memory_id: input.memoryId,
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text: input.canonicalText,
    scope: {
      tenant_id: "tenant-001",
      user_id: "user-001",
      project_id: input.projectId ?? null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "user",
      applies_to: input.appliesTo ?? "global",
    },
    payload: {
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: input.object,
    },
    validity: {
      valid_at: "2026-04-19T00:00:00.000Z",
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: 0.9,
    created_at: "2026-04-19T00:00:00.000Z",
    updated_at: "2026-04-19T00:00:00.000Z",
  };
}

function sourceRefNeighbor(memoryId: string, locator: string): ExistingMemorySummary {
  return {
    memory_id: memoryId,
    unit_type: "atomic",
    kind: "source_ref",
    artifact_type: null,
    canonical_text: `Billing docs live at ${locator}.`,
    scope: {
      tenant_id: "tenant-001",
      user_id: "user-001",
      project_id: null,
      workspace_id: null,
      subject_type: "project",
      subject_id: "project",
      applies_to: "current_project",
    },
    payload: {
      payload_type: "source_ref",
      ref_type: "file_path",
      locator,
      label: "Billing docs",
      access_hint: null,
      when_to_use: "Use for billing implementation questions.",
    },
    validity: {
      valid_at: "2026-04-19T00:00:00.000Z",
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: 0.92,
    created_at: "2026-04-19T00:00:00.000Z",
    updated_at: "2026-04-19T00:00:00.000Z",
  };
}

function scopedFactNeighbor(memoryId: string): ExistingMemorySummary {
  return {
    memory_id: memoryId,
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text: "The deployment region is us-east-1.",
    scope: {
      tenant_id: "tenant-001",
      user_id: "user-001",
      project_id: null,
      workspace_id: null,
      subject_type: "project",
      subject_id: "project",
      applies_to: "global",
    },
    payload: {
      claim_type: "project_fact",
      subject: "deployment region",
      predicate: "is",
      object: "us-east-1",
    },
    validity: {
      valid_at: "2026-04-19T00:00:00.000Z",
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: 0.85,
    created_at: "2026-04-19T00:00:00.000Z",
    updated_at: "2026-04-19T00:00:00.000Z",
  };
}

export const MMV2_DOCUMENT_PROOF_CASES: MmV2DocumentProofCase[] = [
  {
    id: "mmv2-doc-001-preference-claim",
    sourceKind: "document",
    text: "I prefer concise answers.",
    metadata: {
      title: "Preference stays descriptive",
      description:
        "Descriptive user preference remains a claim and survives the full shadow funnel.",
      tags: ["preference", "claim", "strict"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "I prefer concise answers.",
          route: "atomic_candidate",
          candidate_summary: "User preference",
          memory_likelihood: 0.9,
          durability_likelihood: 0.9,
          composite_likelihood: 0.05,
          reason_codes: ["explicit_user_preference"],
          evidence_quote: "I prefer concise answers.",
          confidence: 0.95,
        },
      ],
      atomic: [
        {
          candidate_id: "candidate-preference-001",
          sourceSegmentTextIncludes: "I prefer concise answers.",
          kind: "claim",
          raw_statement: "I prefer concise answers.",
          normalized_statement: "The user prefers concise answers.",
          evidence_quote: "I prefer concise answers.",
          source_grounding: "explicit",
          scope: {
            subject_type: "user",
            subject_id: "user",
            project_id: null,
            workspace_id: null,
            applies_to: "global",
          },
          payload: {
            payload_type: "claim",
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "concise answers",
            qualifiers: [],
            temporal_status: "currently_true",
          },
          confidence: 0.94,
          risk_flags: ["none"],
        },
      ],
      composite: [],
      canonicalization: [
        {
          candidate_id: "candidate-preference-001",
          unit_type: "atomic",
          kind: "claim",
          artifact_type: null,
          canonical_text: "The user prefers concise answers.",
          search_text: "user prefers concise answers",
          sourceEvidenceQuote: "I prefer concise answers.",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: null,
            workspace_id: null,
            subject_type: "user",
            subject_id: "user",
            applies_to: "global",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "concise answers",
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.92,
          quality: {
            atomicity: 0.9,
            specificity: 0.8,
            durability: 0.8,
            actionability: 0.6,
            grounding: 0.95,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-001",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-preference-001",
          decision: "admit",
          scores: {
            future_utility: 0.8,
            durability: 0.85,
            confidence: 0.94,
            novelty: 0.7,
            scope_clarity: 0.85,
            sensitivity_safety: 0.98,
            specificity: 0.82,
          },
          reason_codes: ["durable", "explicit_user_statement"],
          rationale: "Explicit durable user preference.",
          recommended_ttl_seconds: null,
          requires_reconciliation: false,
        },
      ],
    },
    expected: {
      segmentation: strictPhase([
        {
          exactText: "I prefer concise answers.",
          detectedShape: "paragraph",
          startChar: 0,
          endChar: 25,
        },
      ]),
      routing: strictPhase([
        {
          segmentTextIncludes: "I prefer concise answers.",
          route: "atomic_candidate",
          reasonCodesInclude: ["explicit_user_preference"],
          evidenceQuote: "I prefer concise answers.",
          minConfidence: 0.9,
        },
      ]),
      atomic: strictPhase([
        {
          candidateId: "candidate-preference-001",
          evidenceQuote: "I prefer concise answers.",
          kind: "claim",
          normalizedStatement: "The user prefers concise answers.",
          payloadSubset: {
            claim_type: "preference_state",
            object: "concise answers",
          },
        },
      ]),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 1,
        keptEvidenceQuotes: ["I prefer concise answers."],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-preference-001",
          canonicalTextIncludes: "prefers concise answers",
          unitType: "atomic",
          kind: "claim",
          sourceEvidenceQuote: "I prefer concise answers.",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-preference-001",
          decision: "admit",
          reasonCodesInclude: ["durable", "explicit_user_statement"],
          minScores: {
            confidence: 0.9,
            durability: 0.8,
          },
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-preference-001",
          decision: "insert_new",
          conflictType: "none",
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["memory_inserted"],
        memoryEdgeTypesInclude: [],
        durableKindsInclude: ["claim"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-002-procedure-composite",
    sourceKind: "document",
    text: "1. Run the test suite.\n2. Ship the build.",
    metadata: {
      title: "Ordered list stays composite",
      description:
        "Procedure capture routes through composite extraction and keeps steps embedded.",
      tags: ["procedure", "composite", "strict"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "1. Run the test suite.",
          route: "composite_candidate",
          candidate_summary: "Ordered procedure",
          memory_likelihood: 0.85,
          durability_likelihood: 0.82,
          composite_likelihood: 0.97,
          reason_codes: ["ordered_steps"],
          evidence_quote: "1. Run the test suite.",
          confidence: 0.93,
        },
      ],
      atomic: [],
      composite: [
        {
          candidate_id: "candidate-procedure-001",
          sourceSegmentTextIncludes: "1. Run the test suite.",
          artifact_type: "procedure",
          title: "Release checklist",
          purpose: "Safely ship the build.",
          activation_triggers: ["release"],
          summary: "Release checklist with ordered steps.",
          evidence_quote: "1. Run the test suite.\n2. Ship the build.",
          components: [
            {
              component_id: "component-step-001",
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
            {
              component_id: "component-step-002",
              order_index: 1,
              role: "step",
              content: "Ship the build.",
              embedded_atomic_kind: "directive",
              promotion: "embedded_only",
              evidence_quote: "Ship the build.",
              required: true,
              conditions: [],
              outputs: [],
            },
          ],
          scope: {
            subject_type: "project",
            subject_id: "project",
            project_id: "project-001",
            workspace_id: null,
            applies_to: "current_project",
          },
          confidence: 0.9,
          risk_flags: ["none"],
        },
      ],
      canonicalization: [
        {
          candidate_id: "candidate-procedure-001",
          unit_type: "composite",
          kind: null,
          artifact_type: "procedure",
          canonical_text: "Release checklist with ordered steps.",
          search_text: "release checklist ordered steps",
          sourceEvidenceQuote: "1. Run the test suite.\n2. Ship the build.",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: "project-001",
            workspace_id: null,
            subject_type: "project",
            subject_id: "project",
            applies_to: "current_project",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            payload_type: "composite_artifact",
            artifact_type: "procedure",
            title: "Release checklist",
            components: [
              {
                component_id: "component-step-001",
                role: "step",
                promotion: "embedded_only",
              },
              {
                component_id: "component-step-002",
                role: "step",
                promotion: "embedded_only",
              },
            ],
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.89,
          quality: {
            atomicity: 0.5,
            specificity: 0.88,
            durability: 0.8,
            actionability: 0.95,
            grounding: 0.93,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-002",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-procedure-001",
          decision: "admit",
          scores: {
            future_utility: 0.87,
            durability: 0.78,
            confidence: 0.88,
            novelty: 0.72,
            scope_clarity: 0.86,
            sensitivity_safety: 0.98,
            specificity: 0.9,
          },
          reason_codes: ["durable"],
          rationale: "Reusable procedure artifact.",
          recommended_ttl_seconds: null,
          requires_reconciliation: false,
        },
      ],
    },
    expected: {
      segmentation: strictPhase([
        {
          textIncludes: "1. Run the test suite.",
          detectedShape: "numbered_list_block",
        },
      ]),
      routing: strictPhase([
        {
          segmentTextIncludes: "1. Run the test suite.",
          route: "composite_candidate",
          reasonCodesInclude: ["ordered_steps"],
        },
      ]),
      atomic: strictPhase([], 0),
      composite: strictPhase([
        {
          candidateId: "candidate-procedure-001",
          artifactType: "procedure",
          title: "Release checklist",
          componentCount: 2,
          componentRolesInclude: ["step"],
          embeddedOnlyEvidenceQuotes: ["Run the test suite.", "Ship the build."],
        },
      ]),
      suppression: {
        exactCount: 0,
        keptEvidenceQuotes: [],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-procedure-001",
          canonicalTextIncludes: "ordered steps",
          unitType: "composite",
          artifactType: "procedure",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-procedure-001",
          decision: "admit",
          minScores: {
            specificity: 0.9,
          },
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-procedure-001",
          decision: "insert_new",
          conflictType: "none",
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["artifact_inserted"],
        memoryEdgeTypesInclude: [],
        durableKindsInclude: ["procedure"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-003-ignore",
    sourceKind: "document",
    text: "Thanks for the update.",
    metadata: {
      title: "No durable memory",
      description: "Transient chatter should not survive the funnel.",
      tags: ["ignore", "bounded"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "Thanks for the update.",
          route: "ignore",
          candidate_summary: "Transient chatter",
          memory_likelihood: 0.1,
          durability_likelihood: 0.05,
          composite_likelihood: 0,
          reason_codes: ["smalltalk"],
          evidence_quote: "Thanks for the update.",
          confidence: 0.91,
        },
      ],
      atomic: [],
      composite: [],
      canonicalization: [],
      admission: [],
    },
    expected: {
      segmentation: boundedPhase(
        [
          {
            exactText: "Thanks for the update.",
            detectedShape: "paragraph",
          },
        ],
        1,
      ),
      routing: strictPhase([
        {
          segmentTextIncludes: "Thanks for the update.",
          route: "ignore",
        },
      ]),
      atomic: strictPhase([], 0),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 0,
        keptEvidenceQuotes: [],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([], 0),
      admission: strictPhase([], 0),
      reconciliation: strictPhase([], 0),
      recording: {
        durableMemoryCount: 0,
        memoryEventTypesInclude: [],
        memoryEdgeTypesInclude: [],
        durableKindsInclude: [],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-004-duplicate-seeded",
    sourceKind: "document",
    text: "I prefer concise answers.",
    metadata: {
      title: "Exact duplicate seeded reconciliation",
      description: "A seeded identical preference should trigger the duplicate shortcut.",
      tags: ["reconciliation", "duplicate", "seeded"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "I prefer concise answers.",
          route: "atomic_candidate",
          candidate_summary: "User preference",
          memory_likelihood: 0.9,
          durability_likelihood: 0.9,
          composite_likelihood: 0.05,
          reason_codes: ["explicit_user_preference"],
          evidence_quote: "I prefer concise answers.",
          confidence: 0.95,
        },
      ],
      atomic: [
        {
          candidate_id: "candidate-duplicate-001",
          sourceSegmentTextIncludes: "I prefer concise answers.",
          kind: "claim",
          raw_statement: "I prefer concise answers.",
          normalized_statement: "The user prefers concise answers.",
          evidence_quote: "I prefer concise answers.",
          source_grounding: "explicit",
          scope: {
            subject_type: "user",
            subject_id: "user",
            project_id: null,
            workspace_id: null,
            applies_to: "global",
          },
          payload: {
            payload_type: "claim",
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "concise answers",
            qualifiers: [],
            temporal_status: "currently_true",
          },
          confidence: 0.94,
          risk_flags: ["none"],
        },
      ],
      composite: [],
      canonicalization: [
        {
          candidate_id: "candidate-duplicate-001",
          unit_type: "atomic",
          kind: "claim",
          artifact_type: null,
          canonical_text: "The user prefers concise answers.",
          search_text: "user prefers concise answers",
          sourceEvidenceQuote: "I prefer concise answers.",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: null,
            workspace_id: null,
            subject_type: "user",
            subject_id: "user",
            applies_to: "global",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "concise answers",
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.92,
          quality: {
            atomicity: 0.9,
            specificity: 0.8,
            durability: 0.8,
            actionability: 0.6,
            grounding: 0.95,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-004",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-duplicate-001",
          decision: "admit",
          scores: {
            future_utility: 0.8,
            durability: 0.85,
            confidence: 0.94,
            novelty: 0.2,
            scope_clarity: 0.85,
            sensitivity_safety: 0.98,
            specificity: 0.82,
          },
          reason_codes: ["durable", "duplicate_likely"],
          rationale: "Explicit durable preference with duplicate review.",
          recommended_ttl_seconds: null,
          requires_reconciliation: true,
        },
      ],
    },
    seededNeighborsByCandidateId: {
      "candidate-duplicate-001": [
        preferenceNeighbor({
          memoryId: "existing-pref-001",
          canonicalText: "The user prefers concise answers.",
          object: "concise answers",
        }),
      ],
    },
    expected: {
      segmentation: boundedPhase(
        [
          {
            exactText: "I prefer concise answers.",
            detectedShape: "paragraph",
          },
        ],
        1,
      ),
      routing: strictPhase([
        {
          segmentTextIncludes: "I prefer concise answers.",
          route: "atomic_candidate",
        },
      ]),
      atomic: strictPhase([
        {
          candidateId: "candidate-duplicate-001",
          kind: "claim",
          evidenceQuote: "I prefer concise answers.",
        },
      ]),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 1,
        keptEvidenceQuotes: ["I prefer concise answers."],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-duplicate-001",
          canonicalTextIncludes: "prefers concise answers",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-duplicate-001",
          decision: "admit",
          requiresReconciliation: true,
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-duplicate-001",
          decision: "keep_existing_ignore_candidate",
          conflictType: "duplicate",
          targetMemoryIdsInclude: ["existing-pref-001"],
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["memory_inserted"],
        memoryEdgeTypesInclude: [],
        durableKindsInclude: ["claim"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-005-preference-change-seeded",
    sourceKind: "document",
    text: "I prefer detailed technical explanations.",
    metadata: {
      title: "Preference change supersedes older preference",
      description:
        "A seeded older preference should be superseded by the explicit newer preference.",
      tags: ["reconciliation", "supersede", "preference-change"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "I prefer detailed technical explanations.",
          route: "atomic_candidate",
          candidate_summary: "Updated user preference",
          memory_likelihood: 0.91,
          durability_likelihood: 0.88,
          composite_likelihood: 0.02,
          reason_codes: ["explicit_user_preference"],
          evidence_quote: "I prefer detailed technical explanations.",
          confidence: 0.96,
        },
      ],
      atomic: [
        {
          candidate_id: "candidate-preference-change-001",
          sourceSegmentTextIncludes: "I prefer detailed technical explanations.",
          kind: "claim",
          raw_statement: "I prefer detailed technical explanations.",
          normalized_statement: "The user prefers detailed technical explanations.",
          evidence_quote: "I prefer detailed technical explanations.",
          source_grounding: "explicit",
          scope: {
            subject_type: "user",
            subject_id: "user",
            project_id: null,
            workspace_id: null,
            applies_to: "global",
          },
          payload: {
            payload_type: "claim",
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "detailed technical explanations",
            qualifiers: [],
            temporal_status: "currently_true",
          },
          confidence: 0.95,
          risk_flags: ["none"],
        },
      ],
      composite: [],
      canonicalization: [
        {
          candidate_id: "candidate-preference-change-001",
          unit_type: "atomic",
          kind: "claim",
          artifact_type: null,
          canonical_text: "The user prefers detailed technical explanations.",
          search_text: "user prefers detailed technical explanations",
          sourceEvidenceQuote: "I prefer detailed technical explanations.",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: null,
            workspace_id: null,
            subject_type: "user",
            subject_id: "user",
            applies_to: "global",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            claim_type: "preference_state",
            subject: "user",
            predicate: "prefers",
            object: "detailed technical explanations",
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.94,
          quality: {
            atomicity: 0.9,
            specificity: 0.88,
            durability: 0.84,
            actionability: 0.7,
            grounding: 0.96,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-005",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-preference-change-001",
          decision: "admit",
          scores: {
            future_utility: 0.85,
            durability: 0.83,
            confidence: 0.94,
            novelty: 0.72,
            scope_clarity: 0.86,
            sensitivity_safety: 0.99,
            specificity: 0.88,
          },
          reason_codes: ["durable", "explicit_user_statement"],
          rationale: "Explicit newer preference.",
          recommended_ttl_seconds: null,
          requires_reconciliation: true,
        },
      ],
    },
    seededNeighborsByCandidateId: {
      "candidate-preference-change-001": [
        preferenceNeighbor({
          memoryId: "existing-pref-002",
          canonicalText: "The user prefers concise answers.",
          object: "concise answers",
        }),
      ],
    },
    expected: {
      segmentation: boundedPhase(
        [
          {
            exactText: "I prefer detailed technical explanations.",
            detectedShape: "paragraph",
          },
        ],
        1,
      ),
      routing: strictPhase([
        {
          segmentTextIncludes: "I prefer detailed technical explanations.",
          route: "atomic_candidate",
        },
      ]),
      atomic: strictPhase([
        {
          candidateId: "candidate-preference-change-001",
          kind: "claim",
          payloadSubset: {
            object: "detailed technical explanations",
          },
        },
      ]),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 1,
        keptEvidenceQuotes: ["I prefer detailed technical explanations."],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-preference-change-001",
          canonicalTextIncludes: "detailed technical explanations",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-preference-change-001",
          decision: "admit",
          requiresReconciliation: true,
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-preference-change-001",
          decision: "supersede_existing",
          conflictType: "preference_changed",
          supersedesMemoryIdsInclude: ["existing-pref-002"],
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["memory_inserted"],
        memoryEdgeTypesInclude: ["supersedes"],
        durableKindsInclude: ["claim"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-006-source-ref-merge-seeded",
    sourceKind: "document",
    text: "The billing docs live at /docs/billing.md.",
    metadata: {
      title: "Source ref merge by locator",
      description:
        "A seeded source reference with the same locator should merge rather than supersede.",
      tags: ["reconciliation", "source-ref", "merge"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "/docs/billing.md",
          route: "atomic_candidate",
          candidate_summary: "Source reference",
          memory_likelihood: 0.82,
          durability_likelihood: 0.8,
          composite_likelihood: 0.01,
          reason_codes: ["source_pointer"],
          evidence_quote: "/docs/billing.md",
          confidence: 0.93,
        },
      ],
      atomic: [
        {
          candidate_id: "candidate-source-ref-001",
          sourceSegmentTextIncludes: "/docs/billing.md",
          kind: "source_ref",
          raw_statement: "The billing docs live at /docs/billing.md.",
          normalized_statement: "Billing docs live at /docs/billing.md.",
          evidence_quote: "/docs/billing.md",
          source_grounding: "explicit",
          scope: {
            subject_type: "project",
            subject_id: "project",
            project_id: "project-001",
            workspace_id: null,
            applies_to: "current_project",
          },
          payload: {
            payload_type: "source_ref",
            ref_type: "file_path",
            locator: "/docs/billing.md",
            label: "Billing docs",
            access_hint: null,
            when_to_use: "Use for billing implementation questions.",
          },
          confidence: 0.92,
          risk_flags: ["none"],
        },
      ],
      composite: [],
      canonicalization: [
        {
          candidate_id: "candidate-source-ref-001",
          unit_type: "atomic",
          kind: "source_ref",
          artifact_type: null,
          canonical_text: "Billing docs live at /docs/billing.md.",
          search_text: "billing docs /docs/billing.md",
          sourceEvidenceQuote: "/docs/billing.md",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: "project-001",
            workspace_id: null,
            subject_type: "project",
            subject_id: "project",
            applies_to: "current_project",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            payload_type: "source_ref",
            ref_type: "file_path",
            locator: "/docs/billing.md",
            label: "Billing docs",
            access_hint: null,
            when_to_use: "Use for billing implementation questions.",
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.92,
          quality: {
            atomicity: 0.9,
            specificity: 0.94,
            durability: 0.88,
            actionability: 0.88,
            grounding: 0.95,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-006",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-source-ref-001",
          decision: "admit",
          scores: {
            future_utility: 0.82,
            durability: 0.83,
            confidence: 0.92,
            novelty: 0.6,
            scope_clarity: 0.89,
            sensitivity_safety: 0.99,
            specificity: 0.95,
          },
          reason_codes: ["canonical_source"],
          rationale: "Useful locator with clear future utility.",
          recommended_ttl_seconds: null,
          requires_reconciliation: true,
        },
      ],
    },
    seededNeighborsByCandidateId: {
      "candidate-source-ref-001": [
        sourceRefNeighbor("existing-source-ref-001", "/docs/billing.md"),
      ],
    },
    expected: {
      segmentation: boundedPhase([
        {
          textIncludes: "/docs/billing.md",
          detectedShape: "paragraph",
        },
      ]),
      routing: strictPhase([
        {
          segmentTextIncludes: "/docs/billing.md",
          route: "atomic_candidate",
        },
      ]),
      atomic: strictPhase([
        {
          candidateId: "candidate-source-ref-001",
          kind: "source_ref",
          payloadSubset: {
            locator: "/docs/billing.md",
          },
        },
      ]),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 1,
        keptEvidenceQuotes: ["/docs/billing.md"],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-source-ref-001",
          canonicalTextIncludes: "/docs/billing.md",
          kind: "source_ref",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-source-ref-001",
          decision: "admit",
          requiresReconciliation: true,
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-source-ref-001",
          decision: "merge_with_existing",
          conflictType: "duplicate",
          targetMemoryIdsInclude: ["existing-source-ref-001"],
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["memory_inserted"],
        memoryEdgeTypesInclude: [],
        durableKindsInclude: ["source_ref"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
  {
    id: "mmv2-doc-007-scoped-conflict-seeded",
    sourceKind: "document",
    text: "For project alpha, the deployment region is us-east-1.",
    metadata: {
      title: "Scoped conflict uses model reconciliation path",
      description:
        "A scoped project fact should avoid exact duplicate collapse and surface an explicit scoped conflict outcome.",
      tags: ["reconciliation", "scope", "conflict"],
    },
    scripted: {
      routing: [
        {
          segmentTextIncludes: "deployment region is us-east-1",
          route: "atomic_candidate",
          candidate_summary: "Project fact",
          memory_likelihood: 0.82,
          durability_likelihood: 0.8,
          composite_likelihood: 0,
          reason_codes: ["durable_project_fact"],
          evidence_quote: "deployment region is us-east-1",
          confidence: 0.9,
        },
      ],
      atomic: [
        {
          candidate_id: "candidate-scoped-fact-001",
          sourceSegmentTextIncludes: "deployment region is us-east-1",
          kind: "claim",
          raw_statement: "For project alpha, the deployment region is us-east-1.",
          normalized_statement: "The deployment region is us-east-1.",
          evidence_quote: "deployment region is us-east-1",
          source_grounding: "explicit",
          scope: {
            subject_type: "project",
            subject_id: "project-alpha",
            project_id: "project-alpha",
            workspace_id: null,
            applies_to: "current_project",
          },
          payload: {
            payload_type: "claim",
            claim_type: "project_fact",
            subject: "deployment region",
            predicate: "is",
            object: "us-east-1",
            qualifiers: ["project alpha"],
            temporal_status: "currently_true",
          },
          confidence: 0.9,
          risk_flags: ["none"],
        },
      ],
      composite: [],
      canonicalization: [
        {
          candidate_id: "candidate-scoped-fact-001",
          unit_type: "atomic",
          kind: "claim",
          artifact_type: null,
          canonical_text: "The deployment region is us-east-1.",
          search_text: "deployment region us-east-1 project alpha",
          sourceEvidenceQuote: "deployment region is us-east-1",
          scope: {
            tenant_id: "tenant-001",
            user_id: "user-001",
            project_id: "project-alpha",
            workspace_id: null,
            subject_type: "project",
            subject_id: "project-alpha",
            applies_to: "current_project",
          },
          validity: {
            valid_at: null,
            invalid_at: null,
            ttl_seconds: null,
            temporal_status: "current",
          },
          payload: {
            claim_type: "project_fact",
            subject: "deployment region",
            predicate: "is",
            object: "us-east-1",
          },
          parent_candidate_id: null,
          component_candidate_id: null,
          promotion: "not_applicable",
          confidence: 0.88,
          quality: {
            atomicity: 0.88,
            specificity: 0.9,
            durability: 0.8,
            actionability: 0.55,
            grounding: 0.93,
          },
          risk_flags: ["none"],
          content_hash: "mmv2-doc-007",
        },
      ],
      admission: [
        {
          candidate_id: "candidate-scoped-fact-001",
          decision: "admit",
          scores: {
            future_utility: 0.78,
            durability: 0.8,
            confidence: 0.88,
            novelty: 0.62,
            scope_clarity: 0.78,
            sensitivity_safety: 0.99,
            specificity: 0.9,
          },
          reason_codes: ["durable", "useful_future_context"],
          rationale: "Scoped durable project fact.",
          recommended_ttl_seconds: null,
          requires_reconciliation: true,
        },
      ],
      reconciliation: [
        {
          candidateId: "candidate-scoped-fact-001",
          decision: "record_as_conflict",
          target_memory_ids: ["existing-scoped-fact-001"],
          merged_canonical_text: null,
          conflict_type: "scope_narrowing",
          supersedes_memory_ids: [],
          rationale:
            "Project-scoped fact narrows an existing broader fact and needs explicit review.",
          confidence: 0.81,
        },
      ],
    },
    seededNeighborsByCandidateId: {
      "candidate-scoped-fact-001": [scopedFactNeighbor("existing-scoped-fact-001")],
    },
    expected: {
      segmentation: boundedPhase(
        [
          {
            textIncludes: "deployment region is us-east-1",
            detectedShape: "paragraph",
          },
        ],
        1,
      ),
      routing: strictPhase([
        {
          segmentTextIncludes: "deployment region is us-east-1",
          route: "atomic_candidate",
        },
      ]),
      atomic: strictPhase([
        {
          candidateId: "candidate-scoped-fact-001",
          kind: "claim",
          payloadSubset: {
            claim_type: "project_fact",
            object: "us-east-1",
          },
        },
      ]),
      composite: strictPhase([], 0),
      suppression: {
        exactCount: 1,
        keptEvidenceQuotes: ["deployment region is us-east-1"],
        suppressedEvidenceQuotes: [],
      },
      canonicalization: strictPhase([
        {
          candidateId: "candidate-scoped-fact-001",
          canonicalTextIncludes: "deployment region is us-east-1",
        },
      ]),
      admission: strictPhase([
        {
          candidateId: "candidate-scoped-fact-001",
          decision: "admit",
          requiresReconciliation: true,
        },
      ]),
      reconciliation: strictPhase([
        {
          candidateId: "candidate-scoped-fact-001",
          decision: "record_as_conflict",
          conflictType: "scope_narrowing",
          targetMemoryIdsInclude: ["existing-scoped-fact-001"],
          rationaleIncludes: "needs explicit review",
        },
      ]),
      recording: {
        durableMemoryCount: 1,
        memoryEventTypesInclude: ["memory_inserted"],
        memoryEdgeTypesInclude: ["conflicts_with"],
        durableKindsInclude: ["claim"],
      },
      audit: {
        auditStatus: "pass",
      },
    },
  },
];
