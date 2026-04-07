# Retrieval And Routing Control Plane

## Purpose

Define one control plane for:

- query-intent normalization
- retrieval feature computation
- approved / candidate / validated-procedure plan selection
- family suppression
- semantic fallback eligibility and routing

## Why this exists

The current retrieval feature framework flattened score composition, not the
whole retrieval control plane.

The repo still splits retrieval policy across:

- query heuristics
- SQL branches
- post-query reshaping
- semantic sidecar routing
- prompt/application behavior

## Target architecture

The retrieval/routing control plane should own:

1. query-intent normalization
2. family eligibility
3. retrieval surface planning
4. shared feature computation
5. ranking composition
6. semantic fallback eligibility
7. family suppression / adjacency policy
8. handoff to application selection

## Normalized query intent

The control plane should emit a structured intent such as:

- `response_style_lookup`
- `project_fact_lookup`
- `project_rule_lookup`
- `unmet_need_lookup`
- `workflow_guidance_lookup`
- `procedure_lookup`
- `generic_context_lookup`

The exact vocabulary may change, but it should be typed and shared across
retrieval and application.

## Retrieval plan

The control plane should explicitly choose:

- approved-memory search only
- approved + reviewable candidate search
- validated-procedure search
- combined plan where explicit scope allows it

This should be a plan decision, not an emergent result of multiple separate
query functions plus post-hoc sorting.

## Shared feature computation

Shared features should be computed once per candidate row where honest:

- typed exact match
- project scope match
- subject/value/action/capability overlap
- family-intent match
- guidance-pattern match
- text similarity

## Semantic fallback eligibility

Semantic routing must become part of this control plane.

The control plane should decide:

- whether a family/query combination is semantic-eligible
- whether hybrid results are already strong enough
- whether semantic results can merge or rerank
- which family-gated semantic policy applies

## Registry authority in this layer

The registry should become authoritative for:

- retrieval mode
- feature weights
- direct intent class
- adjacent-family suppression policy
- semantic-routing mode
- enabled query classes

## What remains intentionally family-gated

- semantic routing remains family-gated
- procedures remain distinct in application posture
- phrase eligibility remains family-limited
- typed fast-paths remain more important for project facts and procedures where
  exact signals are the correct winner

## SQL reduction goal

This control plane should reduce:

- project intent heuristics embedded in query functions
- approved-versus-candidate SQL scaffolding duplication
- family-specific reshaping after retrieval
- semantic fallback sidecars with separate policy logic

## Proof requirements

Prove:

1. approved, candidate, and validated-procedure retrieval plans are selected
   structurally
2. family suppression is no longer split across SQL, reshaping, and prompt text
3. semantic fallback behavior is governed from one control plane while staying
   family-gated
