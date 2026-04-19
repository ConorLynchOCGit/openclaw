---
summary: "MMV2 Phase 3A atomic extraction schema and rules."
title: "MMV2 Phase 3A Atomic Extraction"
---

# MMV2 Phase 3A Atomic Extraction

## Purpose

Extract candidate atomic durable memories from segments already routed as
`atomic_candidate`.

Allowed kinds:

- `claim`
- `directive`
- `source_ref`
- `episode`

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact schema

```json
{
  "$id": "AtomicExtractionBatch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "atomic_candidates"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "atomic_extraction.v1"
    },
    "event_id": {
      "type": "string"
    },
    "atomic_candidates": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
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
          "risk_flags"
        ],
        "properties": {
          "candidate_id": {
            "type": "string"
          },
          "source_segment_id": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": ["claim", "directive", "source_ref", "episode"]
          },
          "raw_statement": {
            "type": "string",
            "description": "Close paraphrase or direct statement from the source."
          },
          "normalized_statement": {
            "type": "string",
            "description": "Single durable memory sentence."
          },
          "evidence_quote": {
            "type": "string",
            "description": "Exact substring from source segment."
          },
          "source_grounding": {
            "type": "string",
            "enum": ["explicit", "strongly_implied", "weakly_implied"]
          },
          "scope": {
            "type": "object",
            "additionalProperties": false,
            "required": ["subject_type", "subject_id", "project_id", "workspace_id", "applies_to"],
            "properties": {
              "subject_type": {
                "type": "string",
                "enum": [
                  "user",
                  "assistant",
                  "project",
                  "workspace",
                  "organization",
                  "external_entity",
                  "system",
                  "unknown"
                ]
              },
              "subject_id": {
                "type": ["string", "null"]
              },
              "project_id": {
                "type": ["string", "null"]
              },
              "workspace_id": {
                "type": ["string", "null"]
              },
              "applies_to": {
                "type": "string",
                "enum": [
                  "global",
                  "current_project",
                  "current_workspace",
                  "specific_entity",
                  "current_session_only",
                  "unknown"
                ]
              }
            }
          },
          "payload": {
            "oneOf": [
              {
                "$ref": "#/$defs/ClaimPayload"
              },
              {
                "$ref": "#/$defs/DirectivePayload"
              },
              {
                "$ref": "#/$defs/SourceRefPayload"
              },
              {
                "$ref": "#/$defs/EpisodePayload"
              }
            ]
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "risk_flags": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "contains_pii",
                "contains_secret",
                "health_data",
                "financial_data",
                "legal_data",
                "credential_like",
                "safety_sensitive",
                "low_confidence",
                "none"
              ]
            }
          }
        }
      }
    }
  },
  "$defs": {
    "ClaimPayload": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "payload_type",
        "claim_type",
        "subject",
        "predicate",
        "object",
        "qualifiers",
        "temporal_status"
      ],
      "properties": {
        "payload_type": {
          "type": "string",
          "const": "claim"
        },
        "claim_type": {
          "type": "string",
          "enum": [
            "preference_state",
            "identity",
            "relationship",
            "project_fact",
            "tool_fact",
            "environment_fact",
            "decision",
            "capability",
            "constraint_state",
            "other"
          ]
        },
        "subject": {
          "type": "string"
        },
        "predicate": {
          "type": "string"
        },
        "object": {
          "type": "string"
        },
        "qualifiers": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "temporal_status": {
          "type": "string",
          "enum": ["currently_true", "historically_true", "future_intent", "unknown"]
        }
      }
    },
    "DirectivePayload": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "payload_type",
        "directive_type",
        "authority",
        "target",
        "strength",
        "trigger",
        "action",
        "exceptions",
        "overridable",
        "derived_from_claim_candidate_ids"
      ],
      "properties": {
        "payload_type": {
          "type": "string",
          "const": "directive"
        },
        "directive_type": {
          "type": "string",
          "enum": [
            "response_style",
            "tool_use",
            "workflow_behavior",
            "safety_constraint",
            "communication",
            "coding_style",
            "formatting",
            "privacy",
            "project_rule",
            "other"
          ]
        },
        "authority": {
          "type": "string",
          "enum": ["user", "system", "developer", "organization", "assistant_inferred", "unknown"]
        },
        "target": {
          "type": "string",
          "enum": ["assistant", "user", "project", "team", "tool", "system", "unknown"]
        },
        "strength": {
          "type": "string",
          "enum": [
            "hard_constraint",
            "soft_default",
            "situational_instruction",
            "style_preference",
            "unknown"
          ]
        },
        "trigger": {
          "type": "string"
        },
        "action": {
          "type": "string"
        },
        "exceptions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "overridable": {
          "type": "boolean"
        },
        "derived_from_claim_candidate_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "SourceRefPayload": {
      "type": "object",
      "additionalProperties": false,
      "required": ["payload_type", "ref_type", "locator", "label", "access_hint", "when_to_use"],
      "properties": {
        "payload_type": {
          "type": "string",
          "const": "source_ref"
        },
        "ref_type": {
          "type": "string",
          "enum": [
            "url",
            "file_path",
            "repo_path",
            "document_title",
            "ticket",
            "person",
            "email_thread",
            "calendar_event",
            "database_record",
            "unknown"
          ]
        },
        "locator": {
          "type": "string"
        },
        "label": {
          "type": "string"
        },
        "access_hint": {
          "type": ["string", "null"]
        },
        "when_to_use": {
          "type": "string"
        }
      }
    },
    "EpisodePayload": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "payload_type",
        "event_type",
        "actor",
        "action",
        "object",
        "outcome",
        "event_time"
      ],
      "properties": {
        "payload_type": {
          "type": "string",
          "const": "episode"
        },
        "event_type": {
          "type": "string",
          "enum": [
            "decision_made",
            "task_completed",
            "task_failed",
            "preference_changed",
            "instruction_given",
            "meeting_happened",
            "artifact_created",
            "artifact_updated",
            "other"
          ]
        },
        "actor": {
          "type": "string"
        },
        "action": {
          "type": "string"
        },
        "object": {
          "type": "string"
        },
        "outcome": {
          "type": "string"
        },
        "event_time": {
          "type": ["string", "null"],
          "format": "date-time"
        }
      }
    }
  }
}
```

## Deterministic controls

- `payload.payload_type` must equal `kind`
- `normalized_statement` must be a single sentence
- reject weakly implied candidates with high confidence
- reject directives without `trigger` or `action`
- reject source refs without a locator
- reject episodes without both action and outcome
- downgrade descriptive preferences back to claims if the prompt over-upgrades
  them into directives without imperative wording
