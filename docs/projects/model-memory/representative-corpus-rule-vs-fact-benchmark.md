---
summary: "Fixed 10-document benchmark corpus for rule-vs-fact capture evaluation."
title: "Representative Corpus Rule Vs Fact Benchmark"
---

# Representative Corpus Rule Vs Fact Benchmark

This is the fixed corpus for the next capture and document-ingest evaluation
tranche.

The goal is not to maximize file count. The goal is to create a repeatable set
of documents that stress:

- descriptive facts
- durable rules
- procedures and checklists
- reference-like pointer material
- docs where fact and rule are easy to confuse

## Corpus

### 1. `docs/system/memory.md`

Why:

- system recall index
- memory-layer policy surface
- mixes descriptive structure with durable memory rules

Expected dominant kinds:

- `fact`
- `rule`
- `reference`

Must-capture or should-capture claims:

- `docs/system/memory.md` is the workspace recall index for OpenClaw.
- generated memory must not flatten authored docs.
- daily memory files are an episodic layer and an ingestion surface.

### 2. `docs/system/deployment.md`

Why:

- canonical deployment policy
- strong normative language

Expected dominant kinds:

- `rule`
- `fact`
- `reference`

Must-capture or should-capture claims:

- OpenClaw should converge toward one canonical repo checkout, runtime
  container, and runtime image.
- deployment sprawl is treated as drift.
- active runtime assets must not be pruned casually.

### 3. `docs/projects/model-memory/specs/architecture-overview.md`

Why:

- high-value architecture doc
- mixes runtime pipeline facts with explicit non-goals

Expected dominant kinds:

- `fact`
- `rule`
- `reference`

Must-capture or should-capture claims:

- semantic truth lives only in canonical memory objects.
- the runtime pipeline is identical across supported source types after source
  adaptation.
- detector-era modules and family registries are non-goals.

### 4. `docs/projects/model-memory/specs/kind-primary-schema-migration.md`

Why:

- directly exercises kind-vs-class semantics

Expected dominant kinds:

- `rule`
- `fact`

Must-capture or should-capture claims:

- `kind` should become the primary semantic discriminator.
- `canonicalClass` should be secondary or derived.
- Phase 2 should begin by keeping both fields while demoting class logically.

### 5. `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`

Why:

- rule-heavy contract with procedural implications

Expected dominant kinds:

- `rule`
- `procedure`
- `fact`

Must-capture or should-capture claims:

- use the paginated reader first for immediate answerability.
- trigger ingest only when there is clear value beyond the current answer.
- current scope is host-side reads inside the active workspace root.

### 6. `docs/projects/workspace-topology/runtime-project-surfaces.md`

Why:

- topology facts and resolution rules in the same doc

Expected dominant kinds:

- `fact`
- `rule`
- `reference`

Must-capture or should-capture claims:

- canonical project workspaces live under `docs/projects/*`.
- most workspace project paths should be compatibility aliases.
- `projects/ops` is the justified writable exception.

### 7. `docs/projects/deployment-topology/github-automation.md`

Why:

- stable automation facts plus live-contract rules

Expected dominant kinds:

- `fact`
- `rule`
- `reference`

Must-capture or should-capture claims:

- the digest lane is scoped to `openclaw/openclaw`.
- the live webhook-ingest workflow is published and active.
- future extension should come from committed assets, not runtime-only host
  survival.

### 8. `docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md`

Why:

- dense normative contract with required fields and required sections

Expected dominant kinds:

- `rule`
- `reference`

Must-capture or should-capture claims:

- every external skill review must end in a durable operator-facing report.
- reports belong under `docs/projects/skills-system/skill-vetting/reports/`.
- runtime surface proof must record availability and proof commands for
  `openclaw` and `clawhub`.

### 9. `docs/projects/web-stack/web_research_delegation_spec.md`

Why:

- delegation policy with clear when-to and when-not-to rules

Expected dominant kinds:

- `rule`
- `procedure`
- `reference`

Must-capture or should-capture claims:

- `web-researcher` is the designated external public-web retrieval surface.
- explicit URL reads should default to a fresh temporary `web-researcher`
  session.
- delegation requests should be bounded and carry the standard request fields.

### 10. `docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md`

Why:

- checklist-heavy document that should stress procedure capture

Expected dominant kinds:

- `procedure`
- `rule`
- `fact`

Must-capture or should-capture claims:

- the checklist must be executed in order with verification gates.
- Step 1 requires applying and verifying the routing schema SQL.
- Step 2 requires importing the Intake Router workflow but not activating it
  yet.

## Why this corpus shape matters

A fact-heavy corpus would make the current skew impossible to diagnose. This
corpus deliberately includes:

- architecture docs
- policy docs
- contracts
- checklists
- topology docs

That gives the benchmark multiple places where normative language should be
captured as `rule` instead of being flattened into `fact`.
