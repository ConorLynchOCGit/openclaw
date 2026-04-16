---
summary: "Runtime boundary and optional shadow-mode plan for model-memory."
title: "Runtime Integration And Shadow Mode"
---

# Runtime Integration And Shadow Mode

## V1 runtime posture

The system is standalone.

That means:

- no legacy cutover
- no legacy write replacement
- no production dependency from unrelated surfaces
- one package first, with internal module boundaries

The project may later split into sibling packages if that improves separation between the memory layer and the context/runtime layers.

## OpenClaw harness integration

The clean-room architecture is intended to live inside the OpenClaw harness as four cooperating pillars:

- harness
- context engine
- memory layer
- usage and cache layer

Integration rules:

- the memory layer remains the only semantic source of truth
- the context engine consumes derived runtime read models and artifacts
- usage and cache accounting observes runtime behavior without taking semantic authority
- bootstrap projections are downstream consumers of memory truth, not memory truth themselves

## Optional shadow mode

Shadow mode is planned but not required for the first implementation slice.

Shadow mode means:

- mirror live document or turn inputs into `model-memory`
- store results in the new logical database
- do not affect existing user-visible memory behavior

## Shadow-mode requirements

- explicit feature flag
- clear source tagging
- isolated telemetry
- no write-back into legacy memory

## Integration rules

The new package may expose:

- standalone CLI/admin entrypoints
- internal service APIs
- later shadow adapters
- later projection and context-engine entrypoints

It must not depend on legacy memory semantic code for meaning.

## Bootstrap integration boundary

Runtime-generated bootstrap and project files are not repo-tracked source-of-truth docs.

They are runtime-owned derived artifacts.

The compiler may project into controlled generated zones inside runtime workspace files, but repo-tracked docs remain human/spec/project records unless a later explicit decision changes that.

The canonical runtime-generated artifact root is `.openclaw/model-memory/`.
