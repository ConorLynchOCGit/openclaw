---
summary: "Pre-pipeline MMV2 classifier guidance and prompt-adjacent instruction blocks captured from the first GPT response."
title: "MMV2 Classifier Instructions Baseline"
---

# MMV2 Classifier Instructions Baseline

This document captures the prompt-adjacent instruction layer from the first GPT
response. These are not the phase-by-phase prompts from the later pipeline
rewrite. They are the classifier guidance, semantic role tests, and
representation rules that frame how Nano is expected to behave before the
pipeline is broken into routing, extraction, canonicalization, and admission.

## Base schema recommendation

The GPT proposal explicitly rejects the live-style flat enum:

- `fact`
- `reference`
- `rule`
- `user preference`
- `procedure`

Reason given:

- it mixes semantic role
- subject matter
- and granularity

The recommended base schema is:

Atomic kinds:

- `claim`
- `directive`
- `source_ref`
- `episode`

Composite artifacts:

- `artifact`
  - `procedure`
  - `checklist`
  - `project_state`
  - `profile`
  - `decision_record`
  - `source_bundle`

## Preference versus rule instruction baseline

The first GPT response makes an explicit top-level rule:

- do not make `user_preference` a top-level kind

Representation rule:

- descriptive preference becomes `claim`, usually
  `claim_type = preference_state`
- behavioral instruction becomes `directive`
- when a descriptive preference implies a future default, emit:
  - a `claim`
  - and optionally a derived `directive`

Examples preserved from the GPT notes:

- `I like concise answers.` -> `claim`, subtype `preference_state`
- `Keep answers concise by default.` -> `directive`, strength
  `soft_default`
- `Never send emails without asking me first.` -> `directive`, strength
  `hard_constraint`
- `I prefer TypeScript, but Python is okay for data work.` -> `claim` plus
  optional derived `directive`

## Procedure and multi-component instruction baseline

The first GPT response makes another explicit top-level rule:

- do not classify `procedure` as an atomic kind

Instead:

- store a parent composite artifact
- store child components with role and promotion metadata

Promotion values preserved from the GPT notes:

- `embedded_only`
- `global`
- `both`
- `blocked`

The intended behavior is:

- default procedure steps to `embedded_only`
- promote only independently useful global rules or references
- suppress child leakage into global memory unless promotion justifies it

## Pass-shaping instructions before the later phase prompt stack

The first GPT response proposed a two-pass extraction concept before the later
nine-stage rewrite:

1. span routing
2. atomic or composite extraction
3. admission control

Important pre-pipeline routing guidance:

- route numbered or ordered steps into composite handling
- use deterministic regex and structure signals before asking the model to infer
  procedure-ness
- composite spans should be detected before standalone atomic extraction

## Exact "Practical classifier instructions for Nano" block

```text
Do not use "preference" as a top-level kind.

Classify by semantic role:
- claim: describes something true/false.
- directive: tells the assistant/system/user how to behave in the future.
- source_ref: points to a resource to consult.
- episode: records something that happened.
- composite: contains multiple dependent components and must be represented as an artifact.

A user preference stated as "I like/prefer/want X" is usually a claim about the user.
A user preference stated as "Use/default/always/avoid X" is a directive.
If a descriptive preference should guide behavior, emit a claim and optionally a derived directive, linked by derived_from.

Never emit child steps of a procedure as standalone global memories unless the child is useful outside the procedure.
For composite spans, create a parent artifact and mark child components as embedded_only, global, both, or blocked.
```

## Semantic role tests from the first GPT response

Atomic routing tests preserved from the first response:

- `claim`
  - test: can you say `It is true that ...`?
- `directive`
  - test: can you say `The assistant/user/system should/must/default to ...`?
- `source_ref`
  - main value is a locator, document, URL, file path, repo path, ticket,
    person, or source to consult
- `episode`
  - records something that happened at a time, in a session, or as an outcome

Composite routing signals preserved from the first response:

- numbered or ordered steps
- bullets under a heading
- words like `procedure`, `process`, `workflow`, `runbook`, `playbook`,
  `checklist`
- `first / then / after / finally`
- `when X happens, do A, then B`
- multiple imperative clauses with sequence dependency

## Storage and retrieval layer guidance from the first response

These were not presented as executable prompts, but they are part of the design
baseline that shaped the prompt draft.

The GPT notes separate:

- hard directives
  - always-loaded policy or instruction layer
- soft defaults
  - user profile or preference layer
- claims
  - semantic store or entity records
- source refs
  - reference index
- episodes
  - daily or session log
- procedures
  - skill or playbook store
- composite profiles or project states
  - curated state files or structured records

## Recommended prompt stack from the first response

The first GPT response already argued against using one giant prompt.

Recommended call split:

- call 1: capture routing
- call 2A: atomic extraction
- call 2B: composite extraction
- call 3: canonicalization
- call 4: admission scoring
- call 5: reconciliation

This becomes the conceptual baseline that the later detailed pipeline turned
into phase-specific schemas and prompts.

## Main invariants preserved from the first response

1. No evidence, no memory.
2. No exact source span, no durable write.
3. Procedure or list blocks route before atomic extraction.
4. Procedure steps default to `embedded_only`.
5. `user_preference` is never a top-level kind.
6. Descriptive preference is not the same as a directive.
7. Derived directive must be soft and linked to a source claim.
8. Scope defaults narrow, not global.
9. Sensitive or credential-like content cannot become active memory.
10. Active memories must reconcile before write.
11. Superseded memories stay in history, not standard retrieval.
12. Conflicted memories are not silently injected.
13. Nano proposes; deterministic code disposes.
