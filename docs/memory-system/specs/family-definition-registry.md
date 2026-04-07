# Family Definition Registry

## Purpose

The family-definition registry remains the central policy declaration surface
for the memory substrate.

It exists so the repo stops scattering family policy across capture, lifecycle,
retrieval, prompting, semantic routing, and proofing.

## Current landed value

The registry is live and already useful:

- six landed families are declared there
- runtime seams already consume it
- it reduced some family-specific branching

## Why this spec is now explicitly partial

The accepted post-v3 review concluded that the registry is not yet
authoritative enough to be called the full control plane honestly.

The current gaps include:

- proof definitions still modeled separately
- workflow-family mapping still duplicated outside the registry in some seams
- semantic-routing policy not yet fully runtime-authoritative
- some application/search/capture policy still duplicated outside the registry

## What the registry should own

The registry should eventually be authoritative for:

- family identity
- storage kinds
- scope model
- canonical fields
- lifecycle policy
- correction policy
- phrase policy
- retrieval policy
- application policy
- semantic-routing policy
- proof policy
- family mapping metadata used across ingestion and proofing

## What the registry should not own

The registry should not absorb:

- parser implementation bodies
- SQL bodies
- prompt prose
- full adapter code

It should own policy and adapter selection, not every implementation detail.

## Relationship to the next cleanup

The next authority work is specified in:

- `/memory-system/specs/registry-authority-cleanup`

That spec defines how the current registry becomes authoritative enough to
support later self-improving capture and family expansion honestly.

## Implementation rule

Do not describe the registry as “the control plane” unless the duplicate policy
surfaces called out above are actually removed or generated from it.
