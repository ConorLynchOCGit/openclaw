---
summary: "MMV2 Phase 3B composite extraction schema and artifact promotion rules."
title: "MMV2 Phase 3B Composite Extraction"
---

# MMV2 Phase 3B Composite Extraction

## Purpose

Capture procedures and other multi-component memory objects as composite
artifacts rather than flattening them into standalone atomic memories.

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact schema

```json
{
  "$id": "CompositeExtractionBatch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "composite_candidates"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "composite_extraction.v1"
    },
    "event_id": {
      "type": "string"
    },
    "composite_candidates": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
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
          "risk_flags"
        ],
        "properties": {
          "candidate_id": {
            "type": "string"
          },
          "source_segment_id": {
            "type": "string"
          },
          "artifact_type": {
            "type": "string",
            "enum": [
              "procedure",
              "checklist",
              "profile",
              "project_state",
              "decision_record",
              "source_bundle",
              "lesson_pack"
            ]
          },
          "title": {
            "type": "string"
          },
          "purpose": {
            "type": "string"
          },
          "activation_triggers": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "summary": {
            "type": "string"
          },
          "evidence_quote": {
            "type": "string"
          },
          "components": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "component_id",
                "order_index",
                "role",
                "content",
                "embedded_atomic_kind",
                "promotion",
                "evidence_quote",
                "required",
                "conditions",
                "outputs"
              ],
              "properties": {
                "component_id": {
                  "type": "string"
                },
                "order_index": {
                  "type": "integer",
                  "minimum": 0
                },
                "role": {
                  "type": "string",
                  "enum": [
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
                    "other"
                  ]
                },
                "content": {
                  "type": "string"
                },
                "embedded_atomic_kind": {
                  "type": "string",
                  "enum": ["claim", "directive", "source_ref", "episode", "none"]
                },
                "promotion": {
                  "type": "string",
                  "enum": ["embedded_only", "global", "both", "blocked"]
                },
                "evidence_quote": {
                  "type": "string"
                },
                "required": {
                  "type": "boolean"
                },
                "conditions": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "outputs": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              }
            }
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
                "contacret",
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
  }
}
```

## Key artifact rules

- do not emit child steps as standalone top-level memories here
- preserve order with contiguous `order_index`
- `embedded_only` is the default for steps and local details
- `global` and `both` are only for independently useful rules or references
- composite ownership should suppress overlapping atomic candidates unless the
  child is intentionally promoted

## Fidelity note

The enum value `contacret` in `risk_flags` is preserved from the GPT source
draft even though it appears to be a typo. The alignment review records that as
source fidelity rather than silent cleanup.
