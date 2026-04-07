# Retrieval SQL Scaffolding Reduction

## Purpose

Reduce duplicated SQL scaffolding between approved and candidate read surfaces
without pretending the whole retrieval control plane is already unified.

## Why this exists

The current retrieval feature framework flattened some score composition, but
approved and candidate read surfaces still duplicate a large amount of SQL
expression scaffolding.

This is worth reducing, but it should not outrun the larger retrieval/routing
control-plane rewrite.

## Share-now targets

Safe bounded sharing targets:

- repeated metadata expression scaffolding
- repeated feature-input extraction
- repeated matched-field scaffolding
- repeated projection shape when the read surfaces already align

## Wait-for-later targets

These should wait for the retrieval/routing control-plane work:

- deep unification of approved, candidate, and validated-procedure query plans
- aggressive score-model normalization
- total elimination of surface-specific SQL

## Constraints

- preserve approved-only default behavior
- preserve explicit candidate-scope requirements
- preserve explicit validated-procedure-scope requirements
- do not hide real storage/read-model differences behind fake SQL reuse

## Proof requirements

Prove:

1. scaffolding duplication was actually reduced
2. retrieval behavior did not shift silently
3. the work did not overreach into control-plane decisions that should wait for
   the larger retrieval/routing slice
