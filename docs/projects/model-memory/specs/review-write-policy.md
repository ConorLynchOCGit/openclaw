---
summary: "Review and write policy for model-memory v1."
title: "Review And Write Policy"
---

# Review And Write Policy

## Default v1 policy

All accepted captures auto-write for now.

The system still records `reviewMode` so policy can tighten later without schema churn.

In v1, the write path overrides execution to `auto_accept` for all structurally valid accepted captures.

If the model suggests `manual_review` or `suppress`, that suggestion may be recorded for audit and analysis, but it does not control v1 write execution.

## Intended policy model

Even though v1 auto-accepts, the semantic output should still carry:

- `confidence`
- `durability`
- `reviewMode`

This preserves later flexibility.

Audit metadata such as `rationaleCodes` may be stored, but it is explanatory only.

## Write decision responsibilities

The write policy may decide:

- write
- suppress as duplicate
- supersede previous object
- ignore invalid or non-durable objects

The write policy must not:

- reinterpret semantic meaning
- classify by keywords
- map back into legacy families
- use `rationaleCodes` as semantic authority

## Review-mode handling

In v1:

- non-`auto_accept` suggested review modes are advisory only
- accepted objects still auto-write
- the original suggested review mode may be persisted for observability

Later policy versions may begin honoring `reviewMode` without changing the object schema.

## Future tightening path

If false positives are too high, later policy versions may:

- auto-write only strong durable objects
- queue medium-confidence objects
- queue specific scopes or source classes

This must remain a policy change, not a semantic-interpretation rewrite.
