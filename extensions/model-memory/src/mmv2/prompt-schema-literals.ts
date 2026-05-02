export const CAPTURE_ROUTING_BATCH_PROMPT_SCHEMA = {
  $id: "CaptureRoutingBatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "routing_decisions"],
  properties: {
    schema_version: {
      type: "string",
      const: "capture_routing.v1",
    },
    event_id: {
      type: "string",
    },
    routing_decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "segment_id",
          "route",
          "candidate_summary",
          "memory_likelihood",
          "durability_likelihood",
          "composite_likelihood",
          "reason_codes",
          "evidence_quote",
          "confidence",
        ],
        properties: {
          segment_id: {
            type: "string",
          },
          route: {
            type: "string",
            enum: ["ignore", "atomic_candidate", "composite_candidate", "needs_more_context"],
          },
          candidate_summary: {
            type: "string",
            maxLength: 280,
          },
          memory_likelihood: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          durability_likelihood: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          composite_likelihood: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          reason_codes: {
            type: "array",
            items: {
              type: "string",
              enum: [
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
                "smalltalk",
                "ambiguous",
                "sensitive",
                "not_memory",
              ],
            },
          },
          evidence_quote: {
            type: "string",
            description: "Exact substring from the segment text.",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          allow_multiple_top_level_atomic: {
            type: "boolean",
            description:
              "Set true only when one routed atomic segment contains multiple independent durable facts, preferences, decisions, or scoped tasks that should be extracted as separate top-level atomic candidates.",
          },
        },
      },
    },
  },
} as const;

export const ATOMIC_EXTRACTION_BATCH_PROMPT_SCHEMA = {
  $id: "AtomicExtractionBatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "atomic_candidates"],
  properties: {
    schema_version: {
      type: "string",
      const: "atomic_extraction.v1",
    },
    event_id: {
      type: "string",
    },
    atomic_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "source_segment_id",
          "kind",
          "raw_statement",
          "normalized_statement",
          "evidence_quote",
          "source_grounding",
          "scope",
          "payload",
          "confidence",
          "risk_flags",
        ],
        properties: {
          candidate_id: {
            type: "string",
          },
          source_segment_id: {
            type: "string",
          },
          kind: {
            type: "string",
            enum: ["claim", "directive", "source_ref", "episode"],
          },
          raw_statement: {
            type: "string",
            description: "Close paraphrase or direct statement from the source.",
          },
          normalized_statement: {
            type: "string",
            description: "Single durable memory sentence.",
          },
          evidence_quote: {
            type: "string",
            description: "Exact substring from source segment.",
          },
          source_grounding: {
            type: "string",
            enum: ["explicit", "strongly_implied", "weakly_implied"],
          },
          scope: {
            type: "object",
            additionalProperties: false,
            required: ["subject_type", "subject_id", "project_id", "workspace_id", "applies_to"],
            properties: {
              subject_type: {
                type: "string",
                enum: [
                  "user",
                  "assistant",
                  "project",
                  "workspace",
                  "organization",
                  "external_entity",
                  "system",
                  "unknown",
                ],
              },
              subject_id: {
                type: ["string", "null"],
              },
              project_id: {
                type: ["string", "null"],
              },
              workspace_id: {
                type: ["string", "null"],
              },
              applies_to: {
                type: "string",
                enum: [
                  "global",
                  "current_project",
                  "current_workspace",
                  "specific_entity",
                  "current_session_only",
                  "unknown",
                ],
              },
            },
          },
          payload: {
            oneOf: [
              {
                $ref: "#/$defs/ClaimPayload",
              },
              {
                $ref: "#/$defs/DirectivePayload",
              },
              {
                $ref: "#/$defs/SourceRefPayload",
              },
              {
                $ref: "#/$defs/EpisodePayload",
              },
            ],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          risk_flags: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "contains_pii",
                "contains_secret",
                "health_data",
                "financial_data",
                "legal_data",
                "credential_like",
                "safety_sensitive",
                "low_confidence",
                "none",
              ],
            },
          },
        },
      },
    },
  },
  $defs: {
    ClaimPayload: {
      type: "object",
      additionalProperties: false,
      required: [
        "payload_type",
        "claim_type",
        "subject",
        "predicate",
        "object",
        "qualifiers",
        "temporal_status",
      ],
      properties: {
        payload_type: {
          type: "string",
          const: "claim",
        },
        claim_type: {
          type: "string",
          enum: [
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
          ],
        },
        subject: {
          type: "string",
        },
        predicate: {
          type: "string",
        },
        object: {
          type: "string",
        },
        qualifiers: {
          type: "array",
          items: {
            type: "string",
          },
        },
        temporal_status: {
          type: "string",
          enum: ["currently_true", "historically_true", "future_intent", "unknown"],
        },
      },
    },
    DirectivePayload: {
      type: "object",
      additionalProperties: false,
      required: [
        "payload_type",
        "directive_type",
        "authority",
        "target",
        "strength",
        "trigger",
        "action",
        "exceptions",
        "overridable",
        "derived_from_claim_candidate_ids",
      ],
      properties: {
        payload_type: {
          type: "string",
          const: "directive",
        },
        directive_type: {
          type: "string",
          enum: [
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
          ],
        },
        authority: {
          type: "string",
          enum: ["user", "system", "developer", "organization", "assistant_inferred", "unknown"],
        },
        target: {
          type: "string",
          enum: ["assistant", "user", "project", "team", "tool", "system", "unknown"],
        },
        strength: {
          type: "string",
          enum: [
            "hard_constraint",
            "soft_default",
            "situational_instruction",
            "style_preference",
            "unknown",
          ],
        },
        trigger: {
          type: "string",
        },
        action: {
          type: "string",
        },
        exceptions: {
          type: "array",
          items: {
            type: "string",
          },
        },
        overridable: {
          type: "boolean",
        },
        derived_from_claim_candidate_ids: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    },
    SourceRefPayload: {
      type: "object",
      additionalProperties: false,
      required: ["payload_type", "ref_type", "locator", "label", "access_hint", "when_to_use"],
      properties: {
        payload_type: {
          type: "string",
          const: "source_ref",
        },
        ref_type: {
          type: "string",
          enum: [
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
          ],
        },
        locator: {
          type: "string",
        },
        label: {
          type: "string",
        },
        access_hint: {
          type: ["string", "null"],
        },
        when_to_use: {
          type: "string",
        },
      },
    },
    EpisodePayload: {
      type: "object",
      additionalProperties: false,
      required: [
        "payload_type",
        "event_type",
        "actor",
        "action",
        "object",
        "outcome",
        "event_time",
      ],
      properties: {
        payload_type: {
          type: "string",
          const: "episode",
        },
        event_type: {
          type: "string",
          enum: [
            "decision_made",
            "task_completed",
            "task_failed",
            "preference_changed",
            "instruction_given",
            "meeting_happened",
            "artifact_created",
            "artifact_updated",
            "other",
          ],
        },
        actor: {
          type: "string",
        },
        action: {
          type: "string",
        },
        object: {
          type: "string",
        },
        outcome: {
          type: "string",
        },
        event_time: {
          type: ["string", "null"],
          format: "date-time",
        },
      },
    },
  },
} as const;

export const COMPOSITE_EXTRACTION_BATCH_PROMPT_SCHEMA = {
  $id: "CompositeExtractionBatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "composite_candidates"],
  properties: {
    schema_version: {
      type: "string",
      const: "composite_extraction.v1",
    },
    event_id: {
      type: "string",
    },
    composite_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "source_segment_id",
          "artifact_type",
          "title",
          "purpose",
          "activation_triggers",
          "summary",
          "evidence_quote",
          "components",
          "scope",
          "confidence",
          "risk_flags",
        ],
        properties: {
          candidate_id: {
            type: "string",
          },
          source_segment_id: {
            type: "string",
          },
          artifact_type: {
            type: "string",
            enum: [
              "procedure",
              "checklist",
              "profile",
              "project_state",
              "decision_record",
              "source_bundle",
              "lesson_pack",
            ],
          },
          title: {
            type: "string",
          },
          purpose: {
            type: "string",
          },
          activation_triggers: {
            type: "array",
            items: {
              type: "string",
            },
          },
          summary: {
            type: "string",
          },
          evidence_quote: {
            type: "string",
          },
          components: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "component_id",
                "order_index",
                "role",
                "content",
                "embedded_atomic_kind",
                "promotion",
                "evidence_quote",
                "required",
                "conditions",
                "outputs",
              ],
              properties: {
                component_id: {
                  type: "string",
                },
                order_index: {
                  type: "integer",
                  minimum: 0,
                },
                role: {
                  type: "string",
                  enum: [
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
                  ],
                },
                content: {
                  type: "string",
                },
                embedded_atomic_kind: {
                  type: "string",
                  enum: ["claim", "directive", "source_ref", "episode", "none"],
                },
                promotion: {
                  type: "string",
                  enum: ["embedded_only", "global", "both", "blocked"],
                },
                evidence_quote: {
                  type: "string",
                },
                required: {
                  type: "boolean",
                },
                conditions: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
                outputs: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
          scope: {
            type: "object",
            additionalProperties: false,
            required: ["subject_type", "subject_id", "project_id", "workspace_id", "applies_to"],
            properties: {
              subject_type: {
                type: "string",
                enum: [
                  "user",
                  "assistant",
                  "project",
                  "workspace",
                  "organization",
                  "external_entity",
                  "system",
                  "unknown",
                ],
              },
              subject_id: {
                type: ["string", "null"],
              },
              project_id: {
                type: ["string", "null"],
              },
              workspace_id: {
                type: ["string", "null"],
              },
              applies_to: {
                type: "string",
                enum: [
                  "global",
                  "current_project",
                  "current_workspace",
                  "specific_entity",
                  "current_session_only",
                  "unknown",
                ],
              },
            },
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          risk_flags: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "contains_pii",
                "contains_secret",
                "health_data",
                "financial_data",
                "legal_data",
                "credential_like",
                "safety_sensitive",
                "low_confidence",
                "none",
              ],
            },
          },
        },
      },
    },
  },
} as const;

export const CANONICAL_CANDIDATE_BATCH_PROMPT_SCHEMA = {
  $id: "CanonicalCandidateBatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "canonical_candidates"],
  properties: {
    schema_version: {
      type: "string",
      const: "canonical_candidates.v1",
    },
    event_id: {
      type: "string",
    },
    canonical_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "unit_type",
          "kind",
          "artifact_type",
          "canonical_text",
          "search_text",
          "source",
          "scope",
          "validity",
          "payload",
          "parent_candidate_id",
          "component_candidate_id",
          "promotion",
          "confidence",
          "quality",
          "risk_flags",
          "content_hash",
        ],
        properties: {
          candidate_id: {
            type: "string",
          },
          unit_type: {
            type: "string",
            enum: ["atomic", "composite", "component"],
          },
          kind: {
            type: ["string", "null"],
            enum: ["claim", "directive", "source_ref", "episode", null],
          },
          artifact_type: {
            type: ["string", "null"],
            enum: [
              "procedure",
              "checklist",
              "profile",
              "project_state",
              "decision_record",
              "source_bundle",
              "lesson_pack",
              null,
            ],
          },
          canonical_text: {
            type: "string",
          },
          search_text: {
            type: "string",
          },
          source: {
            type: "object",
            additionalProperties: false,
            required: [
              "event_id",
              "source_type",
              "source_id",
              "speaker",
              "created_at",
              "segment_id",
              "start_char",
              "end_char",
              "evidence_quote",
            ],
            properties: {
              event_id: {
                type: "string",
              },
              source_type: {
                type: "string",
              },
              source_id: {
                type: "string",
              },
              speaker: {
                type: "string",
              },
              created_at: {
                type: "string",
                format: "date-time",
              },
              segment_id: {
                type: "string",
              },
              start_char: {
                type: "integer",
              },
              end_char: {
                type: "integer",
              },
              evidence_quote: {
                type: "string",
              },
            },
          },
          scope: {
            type: "object",
            additionalProperties: false,
            required: [
              "tenant_id",
              "user_id",
              "project_id",
              "workspace_id",
              "subject_type",
              "subject_id",
              "applies_to",
            ],
            properties: {
              tenant_id: {
                type: "string",
              },
              user_id: {
                type: "string",
              },
              project_id: {
                type: ["string", "null"],
              },
              workspace_id: {
                type: ["string", "null"],
              },
              subject_type: {
                type: "string",
              },
              subject_id: {
                type: ["string", "null"],
              },
              applies_to: {
                type: "string",
              },
            },
          },
          validity: {
            type: "object",
            additionalProperties: false,
            required: ["valid_at", "invalid_at", "ttl_seconds", "temporal_status"],
            properties: {
              valid_at: {
                type: ["string", "null"],
                format: "date-time",
              },
              invalid_at: {
                type: ["string", "null"],
                format: "date-time",
              },
              ttl_seconds: {
                type: ["integer", "null"],
              },
              temporal_status: {
                type: "string",
                enum: ["current", "historical", "future", "unknown"],
              },
            },
          },
          payload: {
            type: "object",
          },
          parent_candidate_id: {
            type: ["string", "null"],
          },
          component_candidate_id: {
            type: ["string", "null"],
          },
          promotion: {
            type: "string",
            enum: ["global", "embedded_only", "both", "blocked", "not_applicable"],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          quality: {
            type: "object",
            additionalProperties: false,
            required: ["atomicity", "specificity", "durability", "actionability", "grounding"],
            properties: {
              atomicity: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              specificity: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              durability: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              actionability: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              grounding: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
            },
          },
          risk_flags: {
            type: "array",
            items: {
              type: "string",
            },
          },
          content_hash: {
            type: "string",
          },
        },
      },
    },
  },
} as const;

export const ADMISSION_DECISION_BATCH_PROMPT_SCHEMA = {
  $id: "AdmissionDecisionBatch.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "decisions"],
  properties: {
    schema_version: {
      type: "string",
      const: "admission_decision.v1",
    },
    event_id: {
      type: "string",
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidate_id",
          "decision",
          "scores",
          "reason_codes",
          "rationale",
          "recommended_ttl_seconds",
          "requires_reconciliation",
        ],
        properties: {
          candidate_id: {
            type: "string",
          },
          decision: {
            type: "string",
            enum: ["admit", "reject", "quarantine", "embed_only"],
          },
          scores: {
            type: "object",
            additionalProperties: false,
            required: [
              "future_utility",
              "durability",
              "confidence",
              "novelty",
              "scope_clarity",
              "sensitivity_safety",
              "specificity",
            ],
            properties: {
              future_utility: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              durability: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              novelty: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              scope_clarity: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              sensitivity_safety: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              specificity: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
            },
          },
          reason_codes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "durable",
                "useful_future_context",
                "explicit_user_statement",
                "clear_instruction",
                "canonical_source",
                "important_decision",
                "temporary",
                "duplicate_likely",
                "too_vague",
                "low_confidence",
                "sensitive",
                "embedded_component_only",
                "scope_unclear",
                "not_actionable",
                "not_memory",
              ],
            },
          },
          rationale: {
            type: "string",
          },
          recommended_ttl_seconds: {
            type: ["integer", "null"],
          },
          requires_reconciliation: {
            type: "boolean",
          },
        },
      },
    },
  },
} as const;

export const RECONCILIATION_INPUT_PROMPT_SCHEMA = {
  $id: "ReconciliationInput.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "event_id", "candidate", "neighbors"],
  properties: {
    schema_version: {
      type: "string",
      const: "reconciliation_input.v1",
    },
    event_id: {
      type: "string",
    },
    candidate: {
      $ref: "#/$defs/CanonicalCandidate",
    },
    neighbors: {
      type: "array",
      items: {
        $ref: "#/$defs/ExistingMemorySummary",
      },
    },
  },
  $defs: {
    CanonicalCandidate: {
      type: "object",
      additionalProperties: true,
    },
    ExistingMemorySummary: {
      type: "object",
      additionalProperties: false,
      required: [
        "memory_id",
        "unit_type",
        "kind",
        "artifact_type",
        "canonical_text",
        "scope",
        "payload",
        "validity",
        "confidence",
        "created_at",
        "updated_at",
      ],
      properties: {
        memory_id: {
          type: "string",
        },
        unit_type: {
          type: "string",
        },
        kind: {
          type: ["string", "null"],
        },
        artifact_type: {
          type: ["string", "null"],
        },
        canonical_text: {
          type: "string",
        },
        scope: {
          type: "object",
        },
        payload: {
          type: "object",
        },
        validity: {
          type: "object",
        },
        confidence: {
          type: "number",
        },
        created_at: {
          type: "string",
          format: "date-time",
        },
        updated_at: {
          type: "string",
          format: "date-time",
        },
      },
    },
  },
} as const;

export const RECONCILIATION_DECISION_PROMPT_SCHEMA = {
  $id: "ReconciliationDecision.schema.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "event_id",
    "candidate_id",
    "decision",
    "target_memory_ids",
    "merged_canonical_text",
    "conflict_type",
    "supersedes_memory_ids",
    "rationale",
    "confidence",
  ],
  properties: {
    schema_version: {
      type: "string",
      const: "reconciliation_decision.v1",
    },
    event_id: {
      type: "string",
    },
    candidate_id: {
      type: "string",
    },
    decision: {
      type: "string",
      enum: [
        "insert_new",
        "merge_with_existing",
        "supersede_existing",
        "keep_existing_ignore_candidate",
        "record_as_conflict",
        "quarantine",
      ],
    },
    target_memory_ids: {
      type: "array",
      items: {
        type: "string",
      },
    },
    merged_canonical_text: {
      type: ["string", "null"],
    },
    conflict_type: {
      type: "string",
      enum: [
        "none",
        "direct_contradiction",
        "preference_changed",
        "scope_narrowing",
        "scope_broadening",
        "version_update",
        "duplicate",
        "ambiguous",
      ],
    },
    supersedes_memory_ids: {
      type: "array",
      items: {
        type: "string",
      },
    },
    rationale: {
      type: "string",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
} as const;
