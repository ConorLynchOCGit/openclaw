---
summary: "MMV2 Phase 5 admission schema, scoring axes, and threshold posture."
title: "MMV2 Phase 5 Admission"
---

# MMV2 Phase 5 Admission

## Purpose

Decide whether canonical candidates should become durable memory, remain embedded
only, reject, or quarantine.

The exact prompt draft is preserved in
[Prompt Pack](/projects/model-memory/specs/mmv2/prompt-pack).

## Exact schema

```json
{
  "$id": "AdmissionDecisionBatch.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "event_id", "decisions"],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "admission_decision.v1"
    },
    "event_id": {
      "type": "string"
    },
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "candidate_id",
          "decision",
          "scores",
          "reason_codes",
          "rationale",
          "recommended_ttl_seconds",
          "requires_reconciliation"
        ],
        "properties": {
          "candidate_id": {
            "type": "string"
          },
          "decision": {
            "type": "string",
            "enum": ["admit", "reject", "quarantine", "embed_only"]
          },
          "scores": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "future_utility",
              "durability",
              "confidence",
              "novelty",
              "scope_clarity",
              "sensitivity_safety",
              "specificity"
            ],
            "properties": {
              "future_utility": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "durability": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "novelty": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "scope_clarity": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "sensitivity_safety": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "specificity": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              }
            }
          },
          "reason_codes": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
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
                "not_memory"
              ]
            }
          },
          "rationale": {
            "type": "string"
          },
          "recommended_ttl_seconds": {
            "type": ["integer", "null"]
          },
          "requires_reconciliation": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

## Deterministic threshold posture

Automatic rejection when:

- `sensitivity_safety < 0.5`
- `confidence < 0.55`
- `durability < 0.45`
- `specificity < 0.45`
- `scope_clarity < 0.45`
- `promotion = blocked`
- `unit_type = component` with `promotion = embedded_only`

Automatic admit when all hold:

- `future_utility >= 0.65`
- `durability >= 0.6`
- `confidence >= 0.7`
- `specificity >= 0.6`
- `sensitivity_safety >= 0.8`
- `scope_clarity >= 0.6`

Kind-specific posture:

- hard directives need high-confidence explicit authority
- preference-state claims admit only when explicit and durable
- source refs require a locator and durable future utility
- episodes admit only for meaningful changes, decisions, outcomes, or artifact
  creation/update
