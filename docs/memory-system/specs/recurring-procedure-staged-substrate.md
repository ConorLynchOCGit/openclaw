# Recurring Procedure Staged Substrate

## Purpose

Redesign recurring procedures so they preserve real product-policy differences
without retaining more historical subsystem shape than necessary.

## Current landed state

Flattening batch v5 landed the first honest version of this substrate:

- transcript capture and tool submission now share one staged transition helper
- the candidate -> draft -> validated transition is explicit in runtime code
- validated-procedure supersede now plugs into that staged transition instead
  of forcing procedure correction back through the memory-object path

This is a real landing, not just a naming cleanup.

It is still not the end of all procedure-related work:

- validated procedures remain a distinct artifact
- later artifact / read-model convergence is still optional follow-up work
- registry authority cleanup is now landed

## What is genuinely different

These differences are real and should remain:

- procedures are `suggestion_first`
- direct use is allowed only on clear checklist / procedure asks
- procedures culminate in a validated artifact rather than only an approved
  memory object

## What is historical inertia

These parts are not inherently required to remain as a separate subsystem:

- separate ingestion architecture
- largely separate lifecycle plumbing
- largely separate correction/supersede plumbing
- largely separate proof plumbing
- more retrieval branching than the actual product-policy difference requires

## Staged model

Recurring procedures should be modeled as:

1. family-specific candidate ingestion and canonicalization
2. shared candidate/lifecycle substrate where honest
3. validated procedure artifact stage
4. `suggestion_first` application stage

This is different from flattening procedures into ordinary memory objects.
It is also different from keeping them as a quasi-separate product.

## Shared substrate reuse points

Procedures should share:

- ingestion control plane
- correction-policy control plane where honest
- retrieval/routing control plane where honest
- proof adapter substrate
- registry authority

## Distinct procedure points

Procedures should keep distinct:

- validated artifact target
- clear-ask direct-use threshold
- suggestion-first application mode
- validation-specific artifact evidence where needed

## Lifecycle implications

The staged design should make explicit:

- candidate stage
- validation transition
- validated artifact stage
- supersede lineage for validated artifacts

## Retrieval implications

The redesign should keep:

- clear checklist ask wins
- explicit validated-procedure scope
- no broad candidate leakage into user-facing retrieval

But it should reduce:

- separate retrieval logic that exists only because the substrate is still
  historically split

## Proof implications

Proofing should reflect:

- shared lifecycle/control-plane behavior where procedures actually share it
- distinct validated artifact evidence where procedures are truly different

## Proof requirement

Prove that the redesigned procedure substrate:

1. preserves `suggestion_first`
2. preserves clear-ask direct use
3. reduces real duplicated subsystem logic rather than only renaming it
