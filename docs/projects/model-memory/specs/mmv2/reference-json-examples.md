---
summary: "Reference object examples and example JSON shapes captured from the GPT MMV2 ingestion proposal."
title: "MMV2 Reference JSON Examples"
---

# MMV2 Reference JSON Examples

This document captures the example object shapes from the GPT notes that sit
adjacent to the formal phase schemas. They are useful because they show intended
usage, not just allowed fields.

## Example derived directive from a preference claim

```json
{
  "kind": "directive",
  "content": "Default to concise answers unless the user asks for detail.",
  "authority": "user",
  "strength": "soft_default",
  "target": "assistant_response_style",
  "trigger": "general_response",
  "exceptions": ["when the user asks for extensive detail"],
  "explicitness": "derived_from_claim",
  "derived_from": ["mem_claim_123"]
}
```

## Example preference claim

```json
{
  "kind": "claim",
  "content": "The user prefers concise answers.",
  "claim_type": "preference_state",
  "subject": "user",
  "predicate": "prefers",
  "object": "concise answers",
  "confidence": "high",
  "source": "explicit_user_statement"
}
```

## Example composite procedure artifact

```json
{
  "unit_type": "composite",
  "artifact_type": "procedure",
  "title": "Debug failing production job",
  "purpose": "Triage and resolve failed production jobs safely.",
  "activation_triggers": ["production job failed", "cron failure", "pipeline failure"],
  "scope": "production operations",
  "components": [
    {
      "component_id": "step_1",
      "role": "step",
      "content": "Check the job dashboard for the failing run ID.",
      "embedded_atomic_kind": "directive"
    },
    {
      "component_id": "step_2",
      "role": "step",
      "content": "Open logs for the run ID before changing code.",
      "embedded_atomic_kind": "directive"
    },
    {
      "component_id": "ref_1",
      "role": "reference",
      "content": "Runbook is in /ops/runbooks/jobs.md.",
      "embedded_atomic_kind": "source_ref"
    },
    {
      "component_id": "guardrail_1",
      "role": "guardrail",
      "content": "Do not restart production workers without user approval.",
      "embedded_atomic_kind": "directive",
      "promotion": "global"
    }
  ],
  "version": 1,
  "source_span": "raw_text:chars_882_1460"
}
```

## Shared envelope example for an atomic memory

```json
{
  "id": "mem_...",
  "unit_type": "atomic",
  "kind": "claim",
  "content": "The user prefers concise answers.",
  "scope": {
    "user_id": "user",
    "project_id": null,
    "environment": "global"
  },
  "source": {
    "origin": "raw_text",
    "speaker": "user",
    "timestamp": "2026-04-18T00:00:00-04:00",
    "span": {
      "start": 120,
      "end": 154
    }
  },
  "validity": {
    "valid_at": "2026-04-18T00:00:00-04:00",
    "invalid_at": null,
    "ttl": null
  },
  "confidence": 0.92,
  "promotion": "global",
  "parent_id": null,
  "payload": {
    "claim_type": "preference_state",
    "subject": "user",
    "predicate": "prefers",
    "object": "concise answers"
  }
}
```

## Shared envelope example for a directive

```json
{
  "unit_type": "atomic",
  "kind": "directive",
  "content": "Default to concise answers unless the user asks for detail.",
  "payload": {
    "directive_type": "response_style",
    "strength": "soft_default",
    "authority": "user",
    "target": "assistant",
    "trigger": "general_response",
    "exceptions": ["user asks for detail"],
    "overridable": true
  }
}
```

## Shared envelope example for a composite artifact

```json
{
  "unit_type": "composite",
  "artifact_type": "procedure",
  "title": "Release checklist",
  "purpose": "Safely release a new version.",
  "activation_triggers": ["release", "deploy", "ship version"],
  "components": [
    {
      "component_id": "c1",
      "role": "step",
      "content": "Run the test suite.",
      "embedded_atomic_kind": "directive",
      "promotion": "embedded_only"
    },
    {
      "component_id": "c2",
      "role": "guardrail",
      "content": "Do not deploy without user approval.",
      "embedded_atomic_kind": "directive",
      "promotion": "global"
    }
  ]
}
```

## Why these examples matter

The formal phase schemas define validation shape.

These examples define intended semantics:

- how a preference should remain descriptive
- how a soft default can derive from a descriptive claim
- how procedures retain internal order and promotion semantics
- how the envelope is expected to carry scope, validity, and provenance
