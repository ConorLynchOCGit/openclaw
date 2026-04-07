# Full Ingestion Control Plane

## Purpose

Define one ingestion control plane for all six landed families so transcript
capture and tool-side candidate submission stop carrying separate family
resolution systems.

## Why this exists

After flattening batch v3, workflow lessons, project rules, and unmet needs
share one resolver, but response style, project facts, and recurring
procedures still do not.

That means the repo still has more than one ingestion architecture.

## Target outcome

One ingestion control plane should accept:

- transcript text
- tool-submitted content
- raw-turn fallbacks
- optional project scope
- family hints when explicitly provided

It should emit:

- resolved family id
- canonical parsed payload
- review mode
- provenance
- correction intent
- evidence and confidence
- source-of-decision metadata

## Shared ingestion flow

1. normalize source input
2. determine eligible families from registry policy and the caller surface
3. run deterministic family adapters
4. run approved phrase-pattern matching only for eligible families
5. run semantic family adapters
6. normalize correction intent if present
7. choose one resolution outcome:
   - capture
   - correction
   - forget
   - clarify
   - ignore
8. emit canonical ingestion decision with provenance

## Family adapter contract

Each family adapter must define:

- deterministic parser
- phrase-pattern matcher eligibility
- semantic parser
- correction-intent rules
- provenance annotations
- canonical field mapping
- review-mode policy
- ambiguity policy

The control plane should own orchestration.
The adapter should own only family-specific parsing and policy details that are
actually different.

## Transcript vs tool-side unification

The same control plane must serve:

- `ordinary-turn-auto-capture.ts`
- `tools/candidate-submit.ts`

Those callers may supply different source surfaces or explicit family hints, but
they should not run separate family-resolution stacks.

## What remains intentionally family-specific

- response-style forget semantics
- project-fact stricter truth posture
- recurring-procedure clear named-checklist recognition
- workflow-family lesson-family mapping details where still meaningful
- phrase eligibility
- different review modes where justified

## What this slice must delete

Once parity is proven, delete:

- separate response-style transcript/tool parsing stacks
- separate project-fact transcript/tool parsing stacks
- separate recurring-procedure transcript/tool parsing stacks
- duplicated workflow-family mapping helpers outside the registry/control plane

## Rollout rule

This control plane should land incrementally by family adapter migration, but
the target architecture is one control plane for all six families, not a
permanent “workflow resolver plus everything else” design.

## Proof requirements

Prove:

1. transcript and tool submission for the same family now share the same
   canonical ingestion decision path
2. deterministic parsing, phrase matching, semantic parsing, and correction
   normalization preserve behavior
3. false-positive protection still holds for at least:
   - response style
   - project facts
   - recurring procedures

## Non-goals

- broadening capture scope
- enabling new families
- enabling self-improving capture
