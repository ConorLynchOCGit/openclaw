# Model Interpretation Contract V2

## Problem statement

The earlier interpretation contract was still too narrow. It could express a
candidate or ignore decision, but it did not cleanly carry:

- the full durable-memory class set
- structured procedures
- durable routing or context memories
- scope interpretation
- provenance grounding
- explicit rationale that later deterministic validation can audit

## Goals

- create one richer interpretation contract suitable for both capture and later
  context-engine use
- support all four durable-memory classes plus routing or context memories and
  ignore decisions
- make the model own the semantic decision while deterministic code validates
  admissibility afterward

## Non-goals

- full runtime cutover for every capture lane in Pass 1
- replacing deterministic validation

## Architecture boundary

The model interpretation contract is the semantic seam. The model decides class
and canonical meaning. Deterministic code checks schema, confidence,
provenance, admissibility, dedupe posture, and resolver compatibility.

## Proposed data contracts

- `MemorySemanticClass`
  - `stable_user_preference`
  - `durable_operator_correction`
  - `reusable_procedure`
  - `recurring_project_or_workflow_fact`
  - `durable_routing_or_context_memory`
  - `ignore`
- `MemorySemanticScopeInterpretation`
- `MemorySemanticCanonicalProcedure`
- `MemorySemanticProvenanceReference`
- richer candidate, forget, and ignore decisions with:
  - canonical statement
  - canonical procedure
  - confidence
  - rationale
  - durability rationale
  - scope interpretation
  - provenance

## Runtime ownership

- `memory-semantic-interpretation.ts` owns prompt and parse contracts
- `memory-model-semantic-interpreter.ts` owns model execution against that
  contract
- `memory-semantic-validation.ts` owns admissibility checks and compatibility
  mapping

## Migration strategy

1. widen the interpretation schema
2. keep compatibility fallback parsing only where current tests still depend on
   legacy `candidateText`
3. shift validation to read canonical statements or procedures from the new
   contract
4. use Pass 2 to finish runtime cutover onto the richer contract everywhere

## Validation strategy

- targeted contract-shape tests
- targeted planner tests
- targeted benchmark tests using the v2 contract

## Risks and open questions

- compatibility shims can linger too long if not explicitly retired in Pass 2
- deterministic validation must stay validation-only and not become a second
  semantic planner

## Rewrite targets

- `extensions/memory-middleware/src/memory-semantic-interpretation.ts`
- `extensions/memory-middleware/src/memory-semantic-validation.ts`
- planner consumers that assumed narrower candidate text fields

## Deletion targets

- ad hoc semantic side channels used only because the earlier contract could
  not express durable meaning directly
