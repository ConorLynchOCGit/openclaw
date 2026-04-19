---
summary: "MMV2 Phase 0 raw ingest envelope captured from the GPT draft."
title: "MMV2 Phase 0 Raw Ingest Envelope"
---

# MMV2 Phase 0 Raw Ingest Envelope

## Purpose

Create the exact application-owned ingest object before any model call.

Key rule:

- no model runs in Phase 0
- preserve the original raw text for later span validation

## Exact schema

```json
{
  "$id": "RawIngestEvent.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "event_id",
    "schema_version",
    "tenant_id",
    "user_id",
    "session_id",
    "source_type",
    "source_id",
    "speaker",
    "created_at",
    "timezone",
    "raw_text",
    "metadata"
  ],
  "properties": {
    "event_id": {
      "type": "string",
      "description": "Unique id for this ingestion event."
    },
    "schema_version": {
      "type": "string",
      "const": "memory_ingest.v1"
    },
    "tenant_id": {
      "type": "string"
    },
    "user_id": {
      "type": "string"
    },
    "session_id": {
      "type": "string"
    },
    "source_type": {
      "type": "string",
      "enum": [
        "chat_message",
        "conversation_turn",
        "meeting_transcript",
        "document",
        "email",
        "task_log",
        "manual_note",
        "api_event"
      ]
    },
    "source_id": {
      "type": "string"
    },
    "speaker": {
      "type": "string",
      "enum": ["user", "assistant", "system", "developer", "third_party", "unknown"]
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "timezone": {
      "type": "string",
      "description": "IANA timezone, e.g. America/Toronto."
    },
    "raw_text": {
      "type": "string",
      "minLength": 1
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "locale",
        "channel",
        "project_id",
        "workspace_id",
        "conversation_title",
        "sensitivity_hint"
      ],
      "properties": {
        "locale": {
          "type": "string"
        },
        "channel": {
          "type": "string"
        },
        "project_id": {
          "type": ["string", "null"]
        },
        "workspace_id": {
          "type": ["string", "null"]
        },
        "conversation_title": {
          "type": ["string", "null"]
        },
        "sensitivity_hint": {
          "type": "string",
          "enum": [
            "none",
            "personal",
            "credentials_possible",
            "health_possible",
            "financial_possible",
            "legal_possible",
            "unknown"
          ]
        }
      }
    }
  }
}
```

## Deterministic checks

- reject empty `raw_text`
- normalize Unicode
- preserve original `raw_text` exactly for span validation
- assign stable character offsets
- strip transport artifacts only
- do not rewrite semantic content yet
