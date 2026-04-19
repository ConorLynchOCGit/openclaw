---
summary: "MMV2 Phase 6 reconciliation input, output, and decision rules."
title: "MMV2 Phase 6 Reconciliation"
---

# MMV2 Phase 6 Reconciliation

## Purpose

Compare an admitted candidate against existing memory neighbors before any
durable write.

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact input schema

```json
{
  "$id": "ReconciliationInput.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "candidate", "neighbors"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "reconciliation_input.v1"
    },
    "event_id": {
      "type": "string"
    },
    "candidate": {
      "$ref": "#/$defs/CanonicalCandidate"
    },
    "neighbors": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/ExistingMemorySummary"
      }
    }
  },
  "$defs": {
    "CanonicalCandidate": {
      "type": "object",
      "additionalProperties": true
    },
    "ExistingMemorySummary": {
      "type": "object",
      "additionalProperties": false,
      "required": [
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
        "updated_at"
      ],
      "properties": {
        "memory_id": {
          "type": "string"
        },
        "unit_type": {
          "type": "string"
        },
        "kind": {
          "type": ["string", "null"]
        },
        "artifact_type": {
          "type": ["string", "null"]
        },
        "canonical_text": {
          "type": "string"
        },
        "scope": {
          "type": "object"
        },
        "payload": {
          "type": "object"
        },
        "validity": {
          "type": "object"
        },
        "confidence": {
          "type": "number"
        },
        "created_at": {
          "type": "string",
          "format": "date-time"
        },
        "updated_at": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  }
}
```

## Exact output schema

```json
{
  "$id": "ReconciliationDecision.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "event_id",
    "candidate_id",
    "decision",
    "target_memory_ids",
    "merged_canonical_text",
    "conflict_type",
    "supersedes_memory_ids",
    "rationale",
    "confidence"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "reconciliation_decision.v1"
    },
    "event_id": {
      "type": "string"
    },
    "candidate_id": {
      "type": "string"
    },
    "decision": {
      "type": "string",
      "enum": [
        "insert_new",
        "merge_with_existing",
        "supersede_existing",
        "keep_existing_ignore_candidate",
        "record_as_conflict",
        "quarantine"
      ]
    },
    "target_memory_ids": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "merged_canonical_text": {
      "type": ["string", "null"]
    },
    "conflict_type": {
      "type": "string",
      "enum": [
        "none",
        "direct_contradiction",
        "preference_changed",
        "scope_narrowing",
        "scope_broadening",
        "version_update",
        "duplicate",
        "ambiguous"
      ]
    },
    "supersedes_memory_ids": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "rationale": {
      "type": "string"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    }
  }
}
```

## Deterministic reconciliation rules

- exact duplicates should merge or ignore rather than insert
- source refs with the same locator should merge
- same directive target plus trigger plus action should merge unless strength
  changes materially
- newer explicit preference changes can supersede older inferred preferences
- different scopes should not collapse into false duplicates
- if certainty is low, quarantine rather than invent a resolution
