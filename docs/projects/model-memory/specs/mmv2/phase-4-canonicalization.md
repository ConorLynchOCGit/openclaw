---
summary: "MMV2 Phase 4 canonicalization schema and wording constraints."
title: "MMV2 Phase 4 Canonicalization"
---

# MMV2 Phase 4 Canonicalization

## Purpose

Normalize extracted candidates into stable canonical wording and quality scores
without inventing new evidence.

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact schema

```json
{
  "$id": "CanonicalCandidateBatch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "canonical_candidates"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "canonical_candidates.v1"
    },
    "event_id": {
      "type": "string"
    },
    "canonical_candidates": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
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
          "content_hash"
        ],
        "properties": {
          "candidate_id": {
            "type": "string"
          },
          "unit_type": {
            "type": "string",
            "enum": ["atomic", "composite", "component"]
          },
          "kind": {
            "type": ["string", "null"],
            "enum": ["claim", "directive", "source_ref", "episode", null]
          },
          "artifact_type": {
            "type": ["string", "null"],
            "enum": [
              "procedure",
              "checklist",
              "profile",
              "project_state",
              "decision_record",
              "source_bundle",
              "lesson_pack",
              null
            ]
          },
          "canonical_text": {
            "type": "string"
          },
          "search_text": {
            "type": "string"
          },
          "source": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "event_id",
              "source_type",
              "source_id",
              "speaker",
              "created_at",
              "segment_id",
              "start_char",
              "end_char",
              "evidence_quote"
            ],
            "properties": {
              "event_id": {
                "type": "string"
              },
              "source_type": {
                "type": "string"
              },
              "source_id": {
                "type": "string"
              },
              "speaker": {
                "type": "string"
              },
              "created_at": {
                "type": "string",
                "format": "date-time"
              },
              "segment_id": {
                "type": "string"
              },
              "start_char": {
                "type": "integer"
              },
              "end_char": {
                "type": "integer"
              },
              "evidence_quote": {
                "type": "string"
              }
            }
          },
          "scope": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "tenant_id",
              "user_id",
              "project_id",
              "workspace_id",
              "subject_type",
              "subject_id",
              "applies_to"
            ],
            "properties": {
              "tenant_id": {
                "type": "string"
              },
              "user_id": {
                "type": "string"
              },
              "project_id": {
                "type": ["string", "null"]
              },
              "workspace_id": {
                "type": ["string", "null"]
              },
              "subject_type": {
                "type": "string"
              },
              "subject_id": {
                "type": ["string", "null"]
              },
              "applies_to": {
                "type": "string"
              }
            }
          },
          "validity": {
            "type": "object",
            "additionalProperties": false,
            "required": ["valid_at", "invalid_at", "ttl_seconds", "temporal_status"],
            "properties": {
              "valid_at": {
                "type": ["string", "null"],
                "format": "date-time"
              },
              "invalid_at": {
                "type": ["string", "null"],
                "format": "date-time"
              },
              "ttl_seconds": {
                "type": ["integer", "null"]
              },
              "temporal_status": {
                "type": "string",
                "enum": ["current", "historical", "future", "unknown"]
              }
            }
          },
          "payload": {
            "type": "object"
          },
          "parent_candidate_id": {
            "type": ["string", "null"]
          },
          "component_candidate_id": {
            "type": ["string", "null"]
          },
          "promotion": {
            "type": "string",
            "enum": ["global", "embedded_only", "both", "blocked", "not_applicable"]
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "quality": {
            "type": "object",
            "additionalProperties": false,
            "required": ["atomicity", "specificity", "durability", "actionability", "grounding"],
            "properties": {
              "atomicity": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "specificity": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "durability": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "actionability": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "grounding": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              }
            }
          },
          "risk_flags": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "content_hash": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## Deterministic fill and validation rules

- application code fills event IDs, scope IDs, hashes, and exact offsets
- `content_hash` derives from normalized canonical text plus kind and scope
- parent-child references must validate
- `unit_type = component` plus `promotion = embedded_only` cannot become
  standalone memory
- canonical wording must not drift modality:
  - `likes/prefers` must not become `must`
  - `should/default` must not become `always/never`
