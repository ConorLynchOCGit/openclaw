---
summary: "Consolidated MMV2 repair, override, quarantine, and validator policy from the GPT draft."
title: "MMV2 Slippage And Repair Policy"
---

# MMV2 Slippage And Repair Policy

This document centralizes the non-semantic control layer from the GPT proposal.

Design stance:

- the model remains responsible for routing and extraction proposals
- deterministic logic is allowed to validate, repair, suppress, quarantine, or
  narrow candidates
- deterministic logic is not the semantic authority for memory meaning

## Slippage classes

### 1. Invalid JSON

Policy:

- use structured output where available
- validate every model response against the required schema
- repair once with an explicit validation-error prompt
- quarantine the batch if repair still fails

### 2. Evidence hallucination

Policy:

- `evidence_quote` must be an exact substring of the source segment
- source spans must match the quoted text
- unrepairable candidates are dropped rather than inferred into existence

### 3. Preference becomes rule

Policy:

- descriptive phrasing such as `I like`, `I prefer`, `I usually want` defaults
  to `claim.preference_state`
- imperative or default-behavior phrasing can become `directive`
- hard-constraint directives must not be derived from weak preference wording

### 4. Rule becomes preference

Policy:

- explicit imperative prohibitions or requirements remain `directive`
- `never`, `always`, `must`, `do not`, and approval-before-action language
  should not be softened into descriptive claims

### 5. Procedure not captured

Policy:

- composite-first routing
- list-block preservation in segmentation
- override numbered or bullet list blocks into `composite_candidate` unless a
  strong reason exists not to

### 6. Procedure child leakage

Policy:

- steps and substeps default to `embedded_only`
- only independently useful guardrails or references should become `global` or
  `both`

### 7. Over-admission

Policy:

- admission thresholds remain explicit and conservative
- vague, temporary, or low-utility items reject or quarantine
- not every captured candidate becomes durable memory

### 8. Weak inference

Policy:

- requests and questions are not durable preferences unless durability is
  explicit
- inferred user state should not pass as explicit memory without reduced
  confidence and likely quarantine

### 9. Scope leakage

Policy:

- default to the narrowest plausible scope
- project-scoped rules should not become global unless the source states they
  apply generally

### 10. Conflict mishandling

Policy:

- reconcile admitted candidates against existing neighbors before write
- prefer supersession or scoped coexistence over silent contradiction

## Deterministic guardrails from the GPT draft

- composite ownership suppresses overlapping atomic candidates from the same
  range unless promotion is `global` or `both`
- `embedded_only` components cannot become standalone active memory
- `promotion = blocked` prevents durable write
- weakly implied candidates cannot claim high confidence
- credential-like content cannot remain active durable memory
- conflicted or superseded memory must not inject silently into retrieval

## Open review point

This draft remains intentionally model-heavy. The deterministic layer here is a
validator, repair, and admission-control substrate, not a keyword detector
revival. Any future implementation should preserve that boundary explicitly.
