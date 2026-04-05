# Messy-Language Evaluation

## Purpose / user problem

The system should be validated against the way users actually phrase things,
not just curated exact matches.

## Why this belongs in the memory system

Without a formal eval framework, semantic-detection work can claim success
while still missing typo-heavy or indirect real-world phrasing.

## Non-goals

- exhaustive benchmark competition
- public model-quality leaderboard

## Architecture fit

This is a validation harness for:

- semantic event detection
- ambiguity behavior
- phrase induction
- behavior application

It does not define new runtime behavior.

## Domain model / concepts

Each eval case should record:

- source turn
- context
- expected event family
- expected canonical subject
- expected ambiguity outcome
- expected later behavior effect if applicable

## Bounded scope for first implementation

Start with corpora covering:

- user correction
- response-style requirement
- recurring procedure
- workflow improvement

The canonical corpus should live as checked-in repo fixtures/tests in v1.

DB-backed replay cases can be added later, but they are not the primary source
of truth for the first gate.

## Exact input / output behavior

The eval harness should score:

- detection correctness
- canonicalization correctness
- ambiguity outcome correctness
- later behavior application correctness where relevant

## Candidate vs approved behavior

The eval must explicitly distinguish:

- acceptable candidate-only result
- incorrect approved-like overreach

## Provenance / metadata requirements

Keep:

- case id
- source pattern family
- whether the case is:
  - typo
  - grammar
  - fragment
  - indirect correction
  - paraphrase
  - conflicting context
  - false-positive trap

## Retrieval / application behavior

Later-stage evals should confirm not just capture, but whether approved memory
changes visible behavior correctly.

## Ambiguity / abstain / clarify rules

The harness must explicitly include abstain/clarify expectations.

## User repair / supersede / forgetting implications

Include cases where the right behavior is successful repair rather than naive
new learning.

## Observability / metrics / audit requirements

Report:

- per-family precision/recall
- abstain/clarify rates
- false-positive rate
- application success rate

## Evaluation / proof requirements

This spec is itself the evaluation requirement.

No semantic-detection slice should be called complete without:

- a saved eval corpus
- reproducible results
- explicit failure review

## Rollout posture

- build off-production
- use as a gate before production acceptance of semantic families

## Risks / failure modes

- eval corpus is too clean
- no false-positive traps
- scores are collected once and then ignored

## Open questions

- how much real transcript-derived fuzz data should be curated into the checked-in
  corpus before the first semantic families are considered production-ready?
