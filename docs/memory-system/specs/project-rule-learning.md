# Project Rule Learning

## Purpose

Project-rule learning stores durable named-project operating guidance without
forcing that guidance into project facts.

## Current live posture

Live now:

- named-project operating guidance capture
- clustered hold and auto-review on the generalized guidance path
- explicit correction / supersede
- approved-only hybrid retrieval

## Intentional product-policy boundaries

Project rules remain:

- project-scoped
- guidance-only
- separate from typed project facts

They must not become a backdoor for arbitrary new fact fields.

## Updated flattening posture

Project rules already benefited from the workflow-family resolver, but they
still depend on the broader unfinished substrate for:

- real application selection
- retrieval/routing control-plane unification
- proof adapterization
- registry authority

## What remains intentionally family-specific

- application mode remains `guidance_only`
- project scope remains required
- operating-rule semantics remain distinct from fact semantics

## Read with

- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
- `/memory-system/specs/proof-runner-adapterization`
