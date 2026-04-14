---
summary: "Stable decisions for the model-memory clean-room project."
title: "Model Memory Decisions"
---

# Model Memory Decisions

## 2026-04-13 - canonical project docs area is `docs/projects/`

Decision:

- create `docs/projects/` as the canonical repo-tracked top-level area for project workspaces
- create this project at `docs/projects/model-memory/`

Reasoning:

- the live repo did not already have a canonical project-docs area
- the project must be tracked in the main repo and linked from the central docs index
- this keeps clean-room project records separate from legacy memory docs

## 2026-04-13 - code location is `extensions/model-memory`

Decision:

- the clean-room implementation will live at `extensions/model-memory`

Reasoning:

- it stays parallel to the legacy memory package
- it remains visible in the main repo
- it avoids entangling the new architecture with legacy runtime modules

## 2026-04-13 - four-pillar architecture is adopted

Decision:

- the target architecture inside OpenClaw is:
  - harness
  - context engine
  - memory layer
  - usage/cache layer

Reasoning:

- the memory layer alone is not enough to support real runtime behavior
- the surrounding runtime layers must be specified explicitly without turning them into semantic truth

## 2026-04-13 - initial scope is document ingestion and ordinary-turn user capture only

Decision:

- v1 covers:
  - document ingestion
  - ordinary-turn user capture

Deferred:

- retrieval implementation
- live context injection integration
- advisory planning
- review tooling
- migration/cutover

## 2026-04-13 - ontology is canonical-class-first with minimal internal kinds

Decision:

- canonical classes remain:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- internal kinds are exactly:
  - `preference`
  - `fact`
  - `rule`
  - `procedure`
  - `reference`

Reasoning:

- this is the smallest clean decomposition that still supports the required memory behavior
- it removes detector-era naming and category drift from runtime truth

## 2026-04-13 - activation, projection, context, and usage layers are derived layers

Decision:

- runtime read models, workspace projections, dynamic packs, context assembly, and usage/cache ledgers are all derived layers
- none of those layers may extend or replace the canonical semantic contract

Reasoning:

- this preserves one semantic source of truth
- it prevents the runtime stack from becoming a second hidden ontology

## 2026-04-13 - `ruleSubtype` is removed from v1

Decision:

- v1 does not include `ruleSubtype`

Reasoning:

- rule meaning is carried by canonical class, kind, payload, scope, and provenance
- a subtype field would likely become a new hidden family registry
- if a subtype is ever needed later, it must be justified by downstream behavior that cannot be derived from the base rule object

## 2026-04-13 - `rationaleCodes` is optional audit metadata only

Decision:

- `rationaleCodes` remains in the schema as optional audit metadata
- it must use closed generic codes only
- it is forbidden as runtime semantic authority

Forbidden uses:

- semantic interpretation
- canonical class or kind assignment
- dedupe
- supersession
- retrieval truth
- write policy
- review policy

Reasoning:

- the system needs traceability for handling decisions
- freeform or semantically meaningful rationale would recreate hidden memory scaffolding
- keeping it audit-only preserves observability without adding ontology sprawl

## 2026-04-13 - v1 runtime is standalone with optional shadow mode later

Decision:

- no live cutover or replacement in v1
- build standalone first
- optional shadow mode is specified for later implementation
- keep one package first and revisit splitting memory and context layers later if needed

## 2026-04-13 - v1 records `reviewMode` but overrides execution to auto-accept

Decision:

- `reviewMode` stays in the schema
- the model may emit any supported `reviewMode`
- v1 write execution overrides accepted objects to `auto_accept`
- the original suggested `reviewMode` may be persisted for audit and analysis

Reasoning:

- this preserves forward compatibility for stricter later policy
- it honors the current product decision to auto-accept valid captures in v1
- it avoids conflating schema design with current write-policy strictness

## 2026-04-13 - runtime projections are first-class downstream consumers

Decision:

- bootstrap file generation is part of the architecture
- generated bootstrap and project files remain downstream consumers of memory truth
- repo-tracked docs are not the default runtime output surface
- `.openclaw/model-memory/` is the canonical runtime-generated artifact root

Reasoning:

- projections are needed for practical runtime use
- treating them as derived artifacts avoids polluting semantic truth or turning repo docs into volatile cache surfaces

## 2026-04-13 - existing `MEMORY.md` and `USER.md` content must be ingested before replacement

Decision:

- current human-authored `MEMORY.md` and `USER.md` content must be audited and ingested where appropriate before generated projections replace them

Reasoning:

- the project must not erase existing memory content that is not yet in canonical storage
- migration of meaning must happen before projection replacement

## 2026-04-13 - storage uses the same server with a new logical database

Decision:

- reuse the same Supabase/Postgres server
- create a separate logical database for `model-memory`

Reasoning:

- strong isolation from legacy schema and data
- shared operational environment without schema-level cross-contamination

## 2026-04-13 - prompt contract may use placeholder examples only

Decision:

- prompt examples may use placeholder-only examples such as `<subject>` and `<value>`
- prompt examples may not contain concrete memory content

## 2026-04-13 - every model-owned contract is versioned

Decision:

- every model-owned step must record:
  - `contractName`
  - `contractVersion`
  - `modelId`

Reasoning:

- extraction is not the only place where model drift can affect behavior
- retrieval interpretation, reranking, and later session-summary generation must not become unversioned blind spots

## 2026-04-13 - proof policy uses adjudicated objects plus optional stored real model outputs

Decision:

- primary proof mode: adjudicated expected structured objects
- secondary optional proof mode: stored real model outputs

## 2026-04-13 - live persistence uses package-local ordered SQL migrations

Decision:

- `model-memory` uses package-local ordered SQL migrations under `extensions/model-memory/migrations/`
- the live repository path uses Postgres-compatible SQL with `pg` at runtime and `pg-mem` in tests

Reasoning:

- the repo did not already provide a package-local migration convention for this clean-room package
- the package needs executable schema now without borrowing legacy memory infrastructure
- the same boundary keeps canonical truth and derived runtime state explicit and testable

## 2026-04-13 - the live logical database is `model_memory`

Decision:

- the shared Supabase/Postgres server now hosts the clean-room logical database
  as `model_memory`
- the initial package migration is applied there from
  `extensions/model-memory/migrations/0001_model_memory_init.sql`
- non-default environments may still override the connection explicitly, but
  `model_memory` is the canonical live target name for this project

Reasoning:

- this removes ambiguity from provisioning and runtime wiring
- it preserves the earlier decision to isolate the clean-room schema from the
  legacy memory database
- it keeps environment override behavior explicit instead of implicit

## 2026-04-13 - harness integration crosses through a narrow runtime bridge

Decision:

- harness integration uses a narrow runtime bridge rather than turning projections or reports into truth
- bootstrap files, context assembly, retrieval-pack inclusion, and usage normalization remain downstream consumers

Reasoning:

- the memory layer must remain the only semantic authority
- the harness still needs an explicit attachment point to consume projections, packs, and ledger state
- a narrow bridge reduces the chance of core runtime seams reintroducing ontology or compatibility drift

Reasoning:

- expected objects remain the main truth surface
- stored model outputs are useful as replay evidence but do not become the only semantic authority

## 2026-04-13 - bounded semantic equivalence is allowed in proof, not in writes

Decision:

- proof may allow bounded semantic equivalence
- writes must use deterministic normalized identity
- v1 forbids fuzzy semantic merge in the live write path
- v1 forbids model merge adjudication in the live write path

Reasoning:

- proof needs some tolerance for model drift
- storage must stay stable and conservative
- fuzzy merge in runtime would recreate a semantic forest

## 2026-04-13 - retrieval is model-planned and object-native

Decision:

- retrieval is part of the clean-room architecture and is now specified even though implementation remains deferred
- retrieval queries are interpreted into a structured retrieval request by the model
- candidate recall is deterministic and object-native
- optional reranking or packing may use the model, but retrieval truth stays attached to stored semantic objects and provenance
- retrieval must not depend on:
  - legacy family/category vocabularies
  - fixed memory strings
  - exact rendered statements
  - compatibility projections as query truth

Reasoning:

- the system is not complete as a memory architecture without a read path
- retrieval must stay aligned with the same first-principles semantic contract as writes
- deterministic candidate recall avoids creating a new fuzzy semantic forest in the read path

## 2026-04-13 - generated workspace projections own fenced zones only

Decision:

- generated projection output may write only inside explicit generated zones
- human-owned content outside those zones must remain untouched

Reasoning:

- projections are downstream runtime artifacts, not permission to overwrite project docs wholesale
- the generated-zone boundary keeps bootstrap projection practical without turning workspace files into unsafe cache surfaces

## 2026-04-13 - v1 context engine delegates compaction

Decision:

- the `model-memory` context engine assembles context and records usage/cache state
- compaction remains delegated to the OpenClaw runtime in the current implementation stage

Reasoning:

- this keeps the clean-room package focused on assembly and derived artifacts first
- it avoids premature growth of a second summarization subsystem before persistence and harness integration are proven

## 2026-04-13 - retrieval packs are explicit derived artifacts

Decision:

- retrieval results may be materialized into retrieval packs
- retrieval packs are included in assembly only when explicitly requested
- retrieval packs are never semantic truth

Reasoning:

- retrieval is a read-path packaging layer, not a second semantic layer
- explicit inclusion prevents retrieval from silently becoming always-on hidden authority

## 2026-04-13 - shadow comparison is observational and object-native only

Decision:

- shadow mode compares `model-memory` and legacy outputs by canonical object identity and write outcomes only
- shadow mode must not backfill, repair, or redefine `model-memory` truth from legacy outputs

Reasoning:

- comparison is needed to understand divergence before cutover
- allowing comparison to become a repair path would immediately reintroduce legacy semantic authority

## 2026-04-13 - context engine assembly is layered and compaction delegates in phase 1

Decision:

- context assembly uses:
  - stable bootstrap projections
  - semi-stable memory packs
  - volatile live context
- Phase 3 context assembly must work without retrieval
- phase 1 compaction remains delegated to the OpenClaw runtime

Reasoning:

- layered assembly supports token discipline and prompt-cache stability
- making assembly valid before retrieval keeps the roadmap executable and avoids fake retrieval shortcuts
- delegating compaction keeps the first implementation smaller and more auditable

## 2026-04-13 - usage/cache observability stores counters plus segment hashes

Decision:

- the usage/cache layer stores provider-normalized counters plus segment-level prompt-shape hashes

Reasoning:

- counters show total cost
- segment hashes show which layer changed, which helps explain cache misses and token growth without making observability a full prompt-text archive
