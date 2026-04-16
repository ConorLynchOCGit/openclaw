---
summary: "Validation rules for model-memory semantic outputs."
title: "Validation"
---

# Validation

## Objective

Validation is a thin structural guardrail. It must reject malformed outputs without taking ownership of semantics.

## Allowed validation

- schema shape
- required fields by kind
- canonical class and kind consistency
- closed enum validation
- closed audit-code validation
- provenance span bounds
- confidence enum
- durability enum
- review mode enum

## Disallowed validation

- keyword-based semantic verification
- phrase-based category reconstruction
- field backfill from source wording
- semantic reinterpretation after the model response
- treating `rationaleCodes` as semantic evidence

## Result classes

Validation may result in:

- accept
- reject
- reject with repair retry eligible

## Provenance validation

Every provenance span must reference material inside the submitted source window.

Validation may check:

- block ids exist
- line ranges are in bounds
- heading paths correspond to the window structure
- structural heading-path references such as `headingPathRef` resolve to exact
  heading paths in the submitted source window before schema validation

Validation must not decide whether a span is semantically persuasive beyond those structural checks.

## Review-mode normalization

Validation may normalize review mode to a supported enum but must not change object meaning.

Validation must not reject a supported non-`auto_accept` review mode merely because v1 write policy is permissive.

## Audit metadata validation

Validation may verify that `rationaleCodes`:

- is absent or an array of closed generic codes
- contains no freeform prose
- contains no concrete memory content

Validation must not use `rationaleCodes` to accept or reject semantic meaning.
