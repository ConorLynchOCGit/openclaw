---
summary: "MMV2 terminal post-write audit schema and integrity rules."
title: "MMV2 Phase 8 Post-Write Audit"
---

# MMV2 Phase 8 Post-Write Audit

## Purpose

Run a final integrity pass after recording and quarantine failures if the write
result violates the contract.

## Exact schema

```json
{
  "$id": "PostWriteAudit.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "event_id",
    "audit_status",
    "checked_memory_ids",
    "errors",
    "warnings"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "post_write_audit.v1"
    },
    "event_id": {
      "type": "string"
    },
    "audit_status": {
      "type": "string",
      "enum": ["pass", "pass_with_warnings", "fail"]
    },
    "checked_memory_ids": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "errors": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["memory_id", "error_code", "message"],
        "properties": {
          "memory_id": {
            "type": ["string", "null"]
          },
          "error_code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["memory_id", "warning_code", "message"],
        "properties": {
          "memory_id": {
            "type": ["string", "null"]
          },
          "warning_code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## Audit checks from the draft

- active atomic memory must have `kind != null` and `artifact_type = null`
- active composite memory must have `kind = null` and `artifact_type != null`
- every `evidence_quote` must appear in the original raw text
- every source span must match the quoted evidence
- every child link must point to an existing parent
- no active memory can retain `promotion = blocked`
- no `embedded_only` component may survive as standalone active memory
- superseded or conflicted memory must not inject into normal retrieval without
  the right guardrails
- no credential-like memory may remain active
