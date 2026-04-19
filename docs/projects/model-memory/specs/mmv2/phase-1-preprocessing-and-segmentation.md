---
summary: "MMV2 Phase 1 deterministic preprocessing and segmentation contract."
title: "MMV2 Phase 1 Preprocessing And Segmentation"
---

# MMV2 Phase 1 Preprocessing And Segmentation

## Purpose

Transform the raw ingest envelope into exact candidate spans before routing.

The GPT draft is explicit here:

- do this mostly in code
- preserve exact offsets
- allow overlapping spans
- keep composite-looking blocks intact

## Exact schema

```json
{
  "$id": "SegmentedIngestEvent.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["event_id", "schema_version", "raw_text_sha256", "segments"],
  "properties": {
    "event_id": {
      "type": "string"
    },
    "schema_version": {
      "type": "string",
      "const": "segmented_ingest.v1"
    },
    "raw_text_sha256": {
      "type": "string"
    },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "segment_id",
          "start_char",
          "end_char",
          "text",
          "detected_shape",
          "local_context_before",
          "local_context_after"
        ],
        "properties": {
          "segment_id": {
            "type": "string"
          },
          "start_char": {
            "type": "integer",
            "minimum": 0
          },
          "end_char": {
            "type": "integer",
            "minimum": 1
          },
          "text": {
            "type": "string"
          },
          "detected_shape": {
            "type": "string",
            "enum": [
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
              "unknown"
            ]
          },
          "local_context_before": {
            "type": "string"
          },
          "local_context_after": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

## Segmentation rules from the draft

Composite-looking span signals:

- numbered list markers
- bullet list markers
- ordered language such as `first`, `then`, `after that`, `finally`
- headings such as `procedure`, `process`, `workflow`, `runbook`, `checklist`,
  `playbook`, `steps`
- multiple imperative clauses in sequence
- `When X happens, do A, then B`
- `To do X: A; B; C`

Recommended segmentation policy:

- keep a numbered list together as one composite candidate
- keep a heading plus following bullets together
- do not split steps into standalone atomic spans yet
- allow overlapping spans:
  - paragraph span
  - contained sentence span
  - list-block span
