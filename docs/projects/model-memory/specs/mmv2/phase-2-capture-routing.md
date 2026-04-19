---
summary: "MMV2 Phase 2 capture routing schema and control rules."
title: "MMV2 Phase 2 Capture Routing"
---

# MMV2 Phase 2 Capture Routing

## Purpose

Run the first model call. Route spans into:

- `ignore`
- `atomic_candidate`
- `composite_candidate`
- `needs_more_context`

This phase does not extract durable memories yet.

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact schema

```json
{
  "$id": "CaptureRoutingBatch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "routing_decisions"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "capture_routing.v1"
    },
    "event_id": {
      "type": "string"
    },
    "routing_decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "segment_id",
          "route",
          "candidate_summary",
          "memory_likelihood",
          "durability_likelihood",
          "composite_likelihood",
          "reason_codes",
          "evidence_quote",
          "confidence"
        ],
        "properties": {
          "segment_id": {
            "type": "string"
          },
          "route": {
            "type": "string",
            "enum": ["ignore", "atomic_candidate", "composite_candidate", "needs_more_context"]
          },
          "candidate_summary": {
            "type": "string",
            "maxLength": 280
          },
          "memory_likelihood": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "durability_likelihood": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "composite_likelihood": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "reason_codes": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
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
                "not_memory"
              ]
            }
          },
          "evidence_quote": {
            "type": "string",
            "description": "Exact substring from the segment text."
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          }
        }
      }
    }
  }
}
```

## Deterministic validator rules

- JSON must validate
- every `segment_id` must exist
- `evidence_quote` must be an exact substring of that segment
- if `detected_shape` is `numbered_list_block` or `bullet_list_block` and the
  model emits `atomic_candidate`, override to `composite_candidate` unless
  confidence is very high and ordered-step reasoning is absent
- if route is `ignore` but reason codes include ordered-step or workflow signals,
  force review or repair
- if confidence is below `0.5`, downgrade to `needs_more_context` or quarantine
