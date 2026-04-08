# Correction Policy Cleanup

## Purpose

Finish the move from partially shared correction plumbing to a declarative
correction policy substrate.

## Current landed state

Flattening batch v5 landed the main bounded version of this cleanup:

- correction plans now carry explicit execution kinds
- family policy now declares target kind and whether an existing target is
  required
- recurring procedures now use a validated-procedure supersede path instead of
  pretending all executable correction is memory-object supersede
- held correction for unmet needs remains policy, not an accidental omission

This is a real declarative correction substrate for the current six families.

It is still not the final authority model:

- registry authority cleanup still remains
- later family expansion should not treat the current registry surfaces as the
  finished control plane yet

## Why this exists

The current correction engine is materially better than before, but it still
contains legacy stringly/runtime-coupled gating and still treats some families
as incomplete fits.

That is not the right base for later self-improving capture.

## Target model

Correction policy should define:

- correction mode
- trigger types
- immediate-versus-held posture
- target-selection rules
- lineage requirements
- proof requirements

## Declarative policy fields

Each family policy should declare:

- whether explicit correction is required
- which target fields are correction-relevant
- whether immediate supersede is allowed
- whether held correction remains the right posture
- which lineage records are mandatory

## Immediate versus held correction

Immediate correction is appropriate only when:

- family policy permits it
- the target is explicit enough
- approved target resolution is strong enough

Held correction remains appropriate when:

- target ambiguity remains meaningful
- the family posture is intentionally conservative

## Family fit

### Response style

- bounded correction
- can remain immediate when targeted and policy allows

### Project facts

- bounded correction
- can remain immediate when targeted and policy allows

### Workflow-family guidance

- may still use held or cluster-driven review depending on family policy

### Unmet needs

- conservative posture may remain justified
- should still be represented declaratively rather than implicitly

### Recurring procedures

- should fit the redesigned staged substrate
- procedure correction must preserve validated artifact semantics

## Target selection / lineage

The control plane should own:

- target selection rules
- target validation rules
- supersede lineage writing requirements
- proof-visible rationale codes

## Non-goals

- flattening all families to the same correction posture
- silent mutation of approved memories

## Proof requirements

Prove:

1. legacy profile strings are no longer the actual correction gate
2. two families with different correction postures still use one declarative
   substrate
3. lineage stays explicit and auditable

## Current bridge state

Support batch v1 landed the first bounded part of this cleanup.

Flattening batch v5 completed the main declarative control-plane landing for
the six current families.
