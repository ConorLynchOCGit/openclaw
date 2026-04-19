---
summary: "MMV2 Phase 7 event log, durable record, and edge recording schemas."
title: "MMV2 Phase 7 Recording"
---

# MMV2 Phase 7 Recording

## Purpose

Persist the write decision after reconciliation using:

- append-only event history
- current durable memory records
- lineage edges

The GPT draft assumes multiple storage surfaces rather than a single table:

- `memory_events`
- `memories`
- `memory_edges`
- `memory_embeddings`
- `memory_sources`

## Exact event schema

```json
{
  "$id": "MemoryEvent.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "memory_event_id",
    "schema_version",
    "event_type",
    "occurred_at",
    "actor",
    "source_ingest_event_id",
    "candidate_id",
    "memory_id",
    "target_memory_ids",
    "payload"
  ],
  "properties": {
    "memory_event_id": {
      "type": "string"
    },
    "schema_version": {
      "type": "string",
      "const": "memory_event.v1"
    },
    "event_type": {
      "type": "string",
      "enum": [
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
        "artifact_updated"
      ]
    },
    "occurred_at": {
      "type": "string",
      "format": "date-time"
    },
    "actor": {
      "type": "string",
      "enum": ["system", "model", "human_reviewer"]
    },
    "source_ingest_event_id": {
      "type": "string"
    },
    "candidate_id": {
      "type": ["string", "null"]
    },
    "memory_id": {
      "type": ["string", "null"]
    },
    "target_memory_ids": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "payload": {
      "type": "object"
    }
  }
}
```

## Exact durable memory schema

```json
{
  "$id": "DurableMemoryRecord.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "memory_id",
    "schema_version",
    "status",
    "unit_type",
    "kind",
    "artifact_type",
    "canonical_text",
    "search_text",
    "scope",
    "payload",
    "validity",
    "confidence",
    "quality",
    "source_refs",
    "lineage",
    "created_at",
    "updated_at",
    "last_accessed_at",
    "access_count",
    "tags"
  ],
  "properties": {
    "memory_id": {
      "type": "string"
    },
    "schema_version": {
      "type": "string",
      "const": "durable_memory.v1"
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "superseded", "conflicted", "quarantined", "deleted"]
    },
    "unit_type": {
      "type": "string",
      "enum": ["atomic", "composite"]
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
      "type": "object"
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
    "source_refs": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "source_ingest_event_id",
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
          "source_ingest_event_id": {
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
      }
    },
    "lineage": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "candidate_ids",
        "derived_from_memory_ids",
        "supersedes_memory_ids",
        "superseded_by_memory_id",
        "conflicts_with_memory_ids",
        "parent_memory_id",
        "child_memory_ids"
      ],
      "properties": {
        "candidate_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "derived_from_memory_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "supersedes_memory_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "superseded_by_memory_id": {
          "type": ["string", "null"]
        },
        "conflicts_with_memory_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "parent_memory_id": {
          "type": ["string", "null"]
        },
        "child_memory_ids": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "last_accessed_at": {
      "type": ["string", "null"],
      "format": "date-time"
    },
    "access_count": {
      "type": "integer",
      "minimum": 0
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
```

## Exact edge schema

```json
{
  "$id": "MemoryEdge.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "edge_id",
    "schema_version",
    "from_memory_id",
    "to_memory_id",
    "edge_type",
    "created_at",
    "metadata"
  ],
  "properties": {
    "edge_id": {
      "type": "string"
    },
    "schema_version": {
      "type": "string",
      "const": "memory_edge.v1"
    },
    "from_memory_id": {
      "type": "string"
    },
    "to_memory_id": {
      "type": "string"
    },
    "edge_type": {
      "type": "string",
      "enum": [
        "parent_of",
        "child_of",
        "derived_from",
        "supersedes",
        "superseded_by",
        "conflicts_with",
        "supports",
        "duplicates",
        "references"
      ]
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "metadata": {
      "type": "object"
    }
  }
}
```

## Recording rules from the draft

- insert creates a new active durable record plus event history
- merge updates evidence and confidence without broadening semantics casually
- supersede invalidates the old record and links the new one with `supersedes`
- conflicts should not silently continue as normal retrieval truth
- composite parents always store the full component list
- `embedded_only` components live inside the parent payload, not as standalone
  memories
