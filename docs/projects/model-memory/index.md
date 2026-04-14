---
summary: "Clean-room model-memory project workspace."
title: "Model Memory"
---

# Model Memory

`model-memory` is a clean-room memory system project being built in parallel to the legacy memory stack.

The project goals are strict:

- maximum model leverage
- minimum hand-written semantic logic
- one unified semantic pipeline for document ingestion and ordinary-turn user capture
- no detector-era architecture
- no keyword or phrase routing as semantic authority
- no compatibility categories in runtime truth

The target system inside OpenClaw has four pillars:

- harness
- context engine
- memory layer
- usage/cache layer

This project is intentionally isolated from the legacy memory implementation. It will be specified, built, validated, and only later considered for cutover.

Current status:

- slices 1 through 15 are implemented in `extensions/model-memory/`
- the live logical database `model_memory` is provisioned on the shared Supabase/Postgres server
- the initial package migration has been applied to that logical database
- the package is still standalone and not cut over
- the next phase is pre-cutover evidence work, starting with large-document ingestion testing and inventory expansion
- remaining work is production-readiness evidence, legacy-content migration tooling, cutover execution planning, retirement, and deletion

## Project docs

1. [Roadmap](/projects/model-memory/roadmap)
2. [Status](/projects/model-memory/STATUS)
3. [Decisions](/projects/model-memory/DECISIONS)
4. [Current Slice](/projects/model-memory/CURRENT_SLICE)
5. [Spec Index](/projects/model-memory/specs)
6. [Spec Closure Review](/projects/model-memory/SPEC_CLOSURE_REVIEW)
7. [Build Plan](/projects/model-memory/build-plan)
8. [Proof Corpus Plan](/projects/model-memory/proof-corpus-plan)
9. [Large Document Ingestion Inventory](/projects/model-memory/document-ingestion-inventory)
10. [Implementation Guardrails](/projects/model-memory/implementation-guardrails)
11. [Validation Loop](/projects/model-memory/validation-loop)
12. [Implementation Slices 1 Through 5 Checklist](/projects/model-memory/implementation-slices-1-5-checklist)
13. [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)
14. [Cutover And Retirement Plan](/projects/model-memory/cutover-retirement-plan)

## Scope

Initial implementation scope:

- document ingestion
- ordinary-turn user capture
- standalone runtime with optional shadow mode
- same Supabase/Postgres server, new logical database
- runtime read-model, projection, context-engine, and usage/cache architecture specified before implementation

Deferred to roadmap:

- migration/cutover
- production-readiness evidence and large-document ingestion validation
- cutover, retirement, and deletion execution
