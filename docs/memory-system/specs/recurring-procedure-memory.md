# Recurring Procedure Memory

## Purpose

Recurring procedure memory stores durable repeatable procedures and named
checklists without turning them into silent autonomous behavior.

## Current live posture

Live now:

- bounded recurring-procedure capture for supported named checklists
- bounded generic named-checklist lane
- explicit correction / supersede
- validated-procedure retrieval
- suggestion-first application for nearby advice asks
- direct-use only on clear checklist asks

## Intentional product-policy boundaries

Recurring procedures are intentionally different from guidance families.

They remain:

- `suggestion_first`
- direct-use only on clear checklist asks
- explicitly non-autonomous

## Updated flattening posture

The repo now accepts that recurring procedures still retain too much historical
subsystem shape.

That does not mean flattening procedures into ordinary memory objects.
It means redesigning them as a staged family on shared substrate.

## Shared substrate targets

Procedures should ultimately share:

- full ingestion control plane
- retrieval/routing control plane where honest
- declarative correction-policy substrate where honest
- proof adapter substrate
- authoritative family registry

## What remains intentionally family-specific

- validated artifact target
- clear direct-use threshold
- suggestion-first application posture

## Read with

- `/memory-system/specs/recurring-procedure-staged-substrate`
- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
