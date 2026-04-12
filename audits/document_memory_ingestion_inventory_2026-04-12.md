# Document Memory Ingestion Inventory

Date: 2026-04-12

## Purpose

Inventory the broader document corpus that should feed the later bulk document-to-memory ingestion pass.

This is not the ingestion run itself. It is the source-selection and risk-classification artifact for that later run.

## Evidence Reviewed

Roots reviewed on the live host:

- canonical operator workspace root
- workspace curated import manifest and import aliases
- current engineering product repo
- current live product role root
- config / disaster-recovery repo
- runtime-state-adjacent agent workspace roots

Representative evidence gathered:

- canonical workspace identity/bootstrap set: 6 files
- workspace core markdown docs: 9 files
- workspace projects markdown docs: 52 files
- workspace runbooks markdown docs: 5 files
- workspace daily/session memory markdown docs: 20 non-index files
- agent-workspace identity/bootstrap files: 20 files
- config/DR repo markdown docs: 22 files, including 16 agent-workspace identity/bootstrap files
- current engineering repo `docs/memory-system`: 156 markdown docs
- current engineering repo `docs/`: 866 markdown/mdx docs total
- current live product role `docs/`: 664 markdown/mdx docs total

## Ingestion Profiles To Use

The new document-ingestion service now supports these reusable profiles:

- `identity`
- `project_operating`
- `workflow_runbook`
- `strategic_memory`
- `reference_review`

Later bulk ingestion should group sources by those profiles instead of path-specific bespoke logic.

## Recommended First-Wave Ingestion Groups

### 1. Canonical workspace bootstrap and identity files

Priority: highest

Representative sources:

- workspace `AGENTS.md`
- workspace `USER.md`
- workspace `TOOLS.md`
- workspace `SOUL.md`
- workspace `IDENTITY.md`
- workspace `MEMORY.md`

Why first:

- these files currently shape behavior directly
- they carry durable user, operator, and behavior constraints
- they should not remain file-only truth if Postgres is intended to be canonical

Recommended profile:

- `identity`

Expected memory classes:

- user response preferences
- durable operator constraints
- workflow lessons that are stable enough to become memory

### 2. Agent-workspace identity files

Priority: highest

Approximate volume:

- live agent workspaces: 20 identity/bootstrap files
- config/DR agent-workspace seeds: 16 identity/bootstrap files

Why first:

- these are role-specific standing instructions that later retrieval and pack compilation should be able to honor from DB memory
- they also provide direct test material for scoped identity/behavior ingestion

Recommended profile:

- `identity`

Important caution:

- prefer the live agent-workspace set as the primary truth
- treat config/DR copies as seed/reference material unless they differ intentionally
- avoid double-ingesting near-duplicate seed and live copies without dedupe

### 3. Workspace core operating docs

Priority: high

Approximate volume:

- 9 markdown docs

Representative files:

- operating model
- workspace structure
- reentry/session handoff
- allowed actions matrix
- roadmap

Recommended profile:

- `strategic_memory`

Expected memory classes:

- durable operating constraints
- workflow lessons
- project rules about how the host/workspace is meant to be used

### 4. Workspace runbooks

Priority: high

Approximate volume:

- 5 markdown docs

Representative files:

- main OpenClaw runbook
- webhook gateway runbook
- maintenance sweep runbook
- build/runtime hygiene runbook

Recommended profile:

- `workflow_runbook`

Expected memory classes:

- recurring procedures
- workflow lessons
- explicit project rules
- bounded unmet-need statements where runbooks document missing support

### 5. High-signal workspace project docs

Priority: high

Approximate volume by subtree:

- `maintenance`: 6 docs
- `roles`: 7 docs
- `ops`: 5 docs
- `workflows`: 5 docs
- `channel_identity`: 4 docs
- `intake`: 4 docs
- `web_stack`: 3 docs
- `github`: 2 docs
- `build-performance`: 1 doc
- `live_app_patches`: 13 docs

Recommended profiles:

- `project_operating` for stable project notes, explicit facts, and project rules
- `workflow_runbook` for procedure-heavy project docs
- `strategic_memory` for roadmaps/specs that describe durable operating constraints

Use first-wave focus on:

- `projects/maintenance/MEMORY_PUSH_SPEC.md`
- `projects/maintenance/DEBT_REGISTER.md`
- `projects/maintenance/WORKSPACE_REFACTOR_FOUNDATION.md`
- `projects/roles/**`
- `projects/workflows/**`
- `projects/channel_identity/**`
- high-signal `projects/ops/**` docs that are not generated snapshots

Defer or down-rank in first wave:

- `projects/live_app_patches/**` because much of it is patch-epoch status rather than durable standing truth
- generated-current ops rollups until a dedicated episodic/derived profile exists

### 6. Narrow memory-system strategic docs from the engineering repo

Priority: medium-high

Approximate volume:

- `docs/memory-system`: 156 docs total
- `docs/memory-system/specs`: 56 docs

Why not blindly first-wave everything:

- this tree mixes architecture truth, open questions, rollout reports, archived reports, and historical tranche plans
- much of it is reference and provenance material rather than durable memory truth

Recommended first-wave subset:

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/ARCHITECTURE.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- carefully selected active specs that still express current standing policy

Recommended profile:

- `strategic_memory`

### 7. Narrow config/DR operational docs

Priority: medium

Approximate volume:

- `README.md`
- `infrastructure/setup-notes.md`
- agent-workspace seed files noted above

Recommended profile:

- `strategic_memory` for rebuild guidance
- `identity` for role seed/bootstrap files

Use carefully:

- config/DR should remain narrow
- ingest stable rebuild/operating facts, not seed scaffolding noise

## Sources That Should Not Be Bulk-Ingested Blindly

### Full engineering repo docs tree

Reason:

- 866 markdown/mdx docs is too broad
- most of the tree is user docs, reference docs, or historical material
- broad ingestion would flood DB memory with reference content that should remain on-demand

Use instead:

- select targeted memory-system and operator-policy subsets only

### Full live product docs tree

Reason:

- 664 markdown/mdx docs
- substantial overlap with the engineering repo docs tree
- likely duplicate source material under the live role view

Use instead:

- treat the live role as operational verification/reference, not the primary ingestion root

### Workspace `archives/` and `audits/`

Reason:

- mostly historical evidence, snapshots, or post-hoc reports
- useful for provenance, not direct standing memory truth

Use instead:

- mine manually only when a specific durable lesson should be promoted

### Workspace `memory/` daily notes

Reason:

- 20 non-index markdown files are episodic continuity material, not automatically durable truth
- they need a separate episodic/recency-aware extraction policy

Use instead:

- defer until a dedicated episodic document profile exists

### Generated current ops files

Representative sources:

- `projects/ops/generated_current/*`

Reason:

- derivative snapshots
- high duplication risk
- likely to create stale or circular memory if bulk-ingested as standing truth

### Runtime-state, backups, and data-first imports

Representative imports:

- runtime-state
- backups
- n8n data

Reason:

- high sensitivity
- not primarily durable human-authored memory documents
- poor bulk-ingestion targets

### Generated/vendor trees

Representative sources:

- `dist/**`
- bundled `node_modules/**`
- generated translation/output trees

Reason:

- almost pure noise for DB memory

## Identity-Like Vs Project-Like Vs Reference-Like Classification

### Identity-like

Good ingestion targets:

- workspace bootstrap files
- agent-workspace `AGENTS.md`, `USER.md`, `TOOLS.md`, `SOUL.md`, `IDENTITY.md`
- role seed/bootstrap files in config/DR

What should come out:

- stable user preferences
- durable role/behavior constraints
- stable workflow habits and tool preferences

### Project-like

Good ingestion targets:

- workspace project docs
- runbooks
- core operating docs
- selected memory-system status/decision docs

What should come out:

- project facts
- project rules
- recurring procedures
- unmet needs
- durable workflow lessons

### Reference-like

Good ingestion targets only with review:

- selected architecture/spec docs
- selected help/plugin docs if they express durable operator constraints rather than public product reference

What should happen:

- use `reference_review` or `strategic_memory`
- filter aggressively
- do not flood DB memory with tutorial/reference content

## Recommended Later Bulk-Ingestion Sequence

1. Canonical workspace bootstrap/identity files
2. Live agent-workspace identity files
3. Workspace core + runbooks
4. High-signal workspace project docs
5. Narrow config/DR operating docs
6. Selected current memory-system strategic docs
7. Only after that: targeted review of episodic notes and broader reference trees

## What Probably Needs A Different Extraction Policy

- daily memory notes
- generated ops rollups
- historical tranche reports
- long spec/reference corpora
- public product docs meant for user help rather than durable operator memory

Those sources should not use the same first-wave extraction policy as identity and project-operating docs.

## Recommendation For The Later Bulk Import Turn

The later bulk-import turn should accept an explicit source manifest grouped by ingestion profile, for example:

- `identity` manifest
- `project_operating` manifest
- `workflow_runbook` manifest
- `strategic_memory` manifest
- deferred `reference_review` manifest

Do not drive the run by blind recursive discovery alone. Use this inventory as the coarse selection layer, then feed explicit source lists into the new ingestion service.
