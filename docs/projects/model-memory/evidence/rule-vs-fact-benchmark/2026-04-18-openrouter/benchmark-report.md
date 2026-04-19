---
summary: "Stage-by-stage benchmark results for rule-vs-fact document-ingest variants."
title: "Rule Vs Fact Benchmark Results"
---

# Rule Vs Fact Benchmark Results

Generated at: 2026-04-18T15:09:48.500Z

Model: `openrouter/openai/gpt-5.4-nano`
Candidate model: `openrouter/openai/gpt-5.4-nano`
Request seed: `7`
Request timeout: `120000` ms
Max words per window: `1500`

## Corpus

- `docs/system/memory.md`
  - why: System recall index with explicit memory-layer policy and workspace inventory.
  - semantic mix: Topology facts plus durable memory-layer rules.
  - expected dominant kinds: fact, rule, reference
  - must capture: System Memory is the workspace recall index for OpenClaw. | Generated memory must not flatten authored docs. | The memory layers include human-owned sources, DB-backed model-memory projection, and daily memory files as an ingestion layer.
- `docs/system/deployment.md`
  - why: Deployment policy surface with strong normative language and stable operational facts.
  - semantic mix: Rules first, then deployment facts and references.
  - expected dominant kinds: rule, fact, reference
  - must capture: OpenClaw should converge toward one canonical repo checkout, runtime container, and runtime image. | Deployment sprawl is drift, not harmless clutter. | Active runtime assets must not be pruned casually.
- `docs/projects/model-memory/specs/architecture-overview.md`
  - why: Core model-memory architecture doc that mixes descriptive pipeline facts with explicit non-goals.
  - semantic mix: Architecture facts plus some boundary rules.
  - expected dominant kinds: fact, rule, reference
  - must capture: The runtime pipeline is identical for supported source types after source adaptation. | Semantic truth lives only in canonical memory objects. | Detector-era modules and family registries are non-goals.
- `docs/projects/model-memory/specs/kind-primary-schema-migration.md`
  - why: Direct test of class-vs-kind semantics and migration rules.
  - semantic mix: Schema migration rules with supporting facts.
  - expected dominant kinds: rule, fact
  - must capture: Kind should become the primary semantic discriminator. | CanonicalClass should be secondary or derived. | Phase 2 should begin by keeping both fields while demoting class logically.
- `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`
  - why: Strong normative contract around read-vs-ingest arbitration with bounded scope rules.
  - semantic mix: Rules, procedures, and system-behavior facts.
  - expected dominant kinds: rule, procedure, fact
  - must capture: Use the paginated reader first for immediate answerability. | Trigger ingest only when there is clear value beyond the current answer. | The current implementation only applies to host-side reads inside the active workspace root.
- `docs/projects/workspace-topology/runtime-project-surfaces.md`
  - why: Topology policy with canonical project list and compatibility-alias rules.
  - semantic mix: Project-structure facts and resolution rules.
  - expected dominant kinds: fact, rule, reference
  - must capture: Docs/projects surfaces are the only canonical project workspaces. | Workspace projects should usually be import-backed compatibility aliases. | Projects/ops is the justified writable exception.
- `docs/projects/deployment-topology/github-automation.md`
  - why: Automation lane with stable asset references and live-contract rules.
  - semantic mix: Automation facts and operational rules.
  - expected dominant kinds: fact, rule, reference
  - must capture: The GitHub digest lane is scoped to openclaw/openclaw. | The live webhook-ingest workflow is published and active on the public Funnel endpoint. | Future restoration work should extend this lane from committed assets rather than runtime-only host survival.
- `docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md`
  - why: Dense normative contract with explicit required fields and required sections.
  - semantic mix: Rules first, with some reference facts.
  - expected dominant kinds: rule, reference
  - must capture: Every external skill review must end in a durable operator-facing report. | The report must live under docs/projects/skills-system/skill-vetting/reports. | Runtime surface proof must record availability and proof commands for openclaw and clawhub surfaces.
- `docs/projects/web-stack/web_research_delegation_spec.md`
  - why: Delegation policy doc with clear when-to / when-not-to routing rules.
  - semantic mix: Delegation rules, procedural request shape, and a few reference facts.
  - expected dominant kinds: rule, procedure, reference
  - must capture: Web-researcher is the designated external public-web retrieval surface. | Explicit URL or read-this-page tasks should default to a fresh temporary web-researcher session. | Delegation requests should be bounded and include objective, required_fields, and desired_output_shape.
- `docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md`
  - why: Checklist-heavy document that should stress procedure capture and rule vs fact separation.
  - semantic mix: Procedures with some gating rules and deployment facts.
  - expected dominant kinds: procedure, rule, fact
  - must capture: The checklist must be executed in order with verification gates before proceeding. | Step 1 requires applying and verifying the intake routing schema SQL. | Step 2 requires importing the Intake Router workflow into n8n but not activating it yet.

## baseline

- hypothesis: Current live prompts and canonicalization behavior continue to undercapture rules relative to facts.
- simplification tested: None. This preserves the current live path.
- total windows: 10
- candidate counts by type: {"fact":25,"rule":76,"procedure":5}
- canonicalized counts by kind: {"fact":11,"rule":37}
- validation rejects: 0
- write decisions: {"write":48}
- adjudication outcomes: {"no_candidates":43,"direct_distinct":5}

| document                                                                              | windows | pass1 candidates                    | accepted kinds        | accepted classes | rejects | writes        | active delta          | memory projection        |
| ------------------------------------------------------------------------------------- | ------: | ----------------------------------- | --------------------- | ---------------- | ------: | ------------- | --------------------- | ------------------------ |
| `docs/system/memory.md`                                                               |       1 | `{"fact":2,"rule":12}`              | `{"fact":1,"rule":6}` | `{"project":7}`  |       0 | `{"write":7}` | `{"fact":1,"rule":6}` | `MEMORY.md (2 bullets)`  |
| `docs/system/deployment.md`                                                           |       1 | `{"rule":12}`                       | `{"rule":6}`          | `{"project":6}`  |       0 | `{"write":6}` | `{"fact":0,"rule":6}` | `MEMORY.md (2 bullets)`  |
| `docs/projects/model-memory/specs/architecture-overview.md`                           |       1 | `{"rule":4,"procedure":1}`          | `{"rule":2}`          | `{"project":2}`  |       0 | `{"write":2}` | `{"fact":0,"rule":2}` | `MEMORY.md (2 bullets)`  |
| `docs/projects/model-memory/specs/kind-primary-schema-migration.md`                   |       1 | `{"rule":2,"procedure":4,"fact":1}` | `{"rule":2}`          | `{"project":2}`  |       0 | `{"write":2}` | `{"fact":0,"rule":2}` | `MEMORY.md (2 bullets)`  |
| `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`            |       1 | `{"fact":6,"rule":8}`               | `{"fact":3,"rule":4}` | `{"project":7}`  |       0 | `{"write":7}` | `{"fact":3,"rule":4}` | `MEMORY.md (5 bullets)`  |
| `docs/projects/workspace-topology/runtime-project-surfaces.md`                        |       1 | `{"fact":7,"rule":4}`               | `{"fact":3,"rule":2}` | `{"project":5}`  |       0 | `{"write":5}` | `{"fact":3,"rule":2}` | `MEMORY.md (8 bullets)`  |
| `docs/projects/deployment-topology/github-automation.md`                              |       1 | `{"fact":6,"rule":2}`               | `{"fact":3,"rule":1}` | `{"project":4}`  |       0 | `{"write":4}` | `{"fact":3,"rule":1}` | `MEMORY.md (11 bullets)` |
| `docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md` |       1 | `{"rule":16,"fact":1}`              | `{"rule":6}`          | `{"project":6}`  |       0 | `{"write":6}` | `{"fact":0,"rule":6}` | `MEMORY.md (11 bullets)` |
| `docs/projects/web-stack/web_research_delegation_spec.md`                             |       1 | `{"fact":2,"rule":8}`               | `{"fact":1,"rule":4}` | `{"project":5}`  |       0 | `{"write":5}` | `{"fact":1,"rule":4}` | `MEMORY.md (12 bullets)` |
| `docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md`                    |       1 | `{"rule":8}`                        | `{"rule":4}`          | `{"project":4}`  |       0 | `{"write":4}` | `{"fact":0,"rule":4}` | `MEMORY.md (12 bullets)` |

## variant_a_prompt_simplification

- hypothesis: Rule undercapture is primarily upstream and improves if candidate extraction and canonicalization treat kind as primary and normativity as first-class.
- simplification tested: Prompt-only simplification: classify by kind first, prefer rule for normative text, and treat canonicalClass as secondary bookkeeping.
- total windows: 10
- candidate counts by type: {"rule":108,"procedure":10,"fact":11,"preference":2}
- canonicalized counts by kind: {"fact":6,"rule":53,"preference":1}
- validation rejects: 0
- write decisions: {"write":60}
- adjudication outcomes: {"no_candidates":57,"local_conflict_hold_ambiguous":3}

| document                                                                              | windows | pass1 candidates                     | accepted kinds                       | accepted classes         | rejects | writes         | active delta                         | memory projection       |
| ------------------------------------------------------------------------------------- | ------: | ------------------------------------ | ------------------------------------ | ------------------------ | ------: | -------------- | ------------------------------------ | ----------------------- |
| `docs/system/memory.md`                                                               |       1 | `{"rule":14}`                        | `{"fact":1,"rule":6}`                | `{"project":7}`          |       0 | `{"write":7}`  | `{"fact":1,"rule":6}`                | `MEMORY.md (2 bullets)` |
| `docs/system/deployment.md`                                                           |       1 | `{"rule":18}`                        | `{"rule":9}`                         | `{"project":9}`          |       0 | `{"write":9}`  | `{"fact":0,"rule":9}`                | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/architecture-overview.md`                           |       1 | `{"rule":11}`                        | `{"rule":5}`                         | `{"project":5}`          |       0 | `{"write":5}`  | `{"fact":0,"rule":5}`                | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/kind-primary-schema-migration.md`                   |       1 | `{"rule":7,"procedure":4}`           | `{"rule":4}`                         | `{"project":4}`          |       0 | `{"write":4}`  | `{"fact":0,"rule":4}`                | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`            |       1 | `{"rule":10,"procedure":6}`          | `{"rule":5}`                         | `{"project":4,"user":1}` |       0 | `{"write":5}`  | `{"fact":0,"rule":5}`                | `MEMORY.md (2 bullets)` |
| `docs/projects/workspace-topology/runtime-project-surfaces.md`                        |       1 | `{"rule":10}`                        | `{"rule":5}`                         | `{"project":5}`          |       0 | `{"write":5}`  | `{"fact":0,"rule":2}`                | `MEMORY.md (2 bullets)` |
| `docs/projects/deployment-topology/github-automation.md`                              |       1 | `{"fact":8,"rule":2}`                | `{"fact":4,"rule":1}`                | `{"project":5}`          |       0 | `{"write":5}`  | `{"fact":4,"rule":1}`                | `MEMORY.md (6 bullets)` |
| `docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md` |       1 | `{"rule":22}`                        | `{"rule":11}`                        | `{"project":11}`         |       0 | `{"write":11}` | `{"fact":0,"rule":11}`               | `MEMORY.md (6 bullets)` |
| `docs/projects/web-stack/web_research_delegation_spec.md`                             |       1 | `{"fact":2,"preference":2,"rule":6}` | `{"fact":1,"preference":1,"rule":3}` | `{"project":4,"user":1}` |       0 | `{"write":5}`  | `{"fact":1,"rule":3,"preference":1}` | `MEMORY.md (8 bullets)` |
| `docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md`                    |       1 | `{"rule":8,"fact":1}`                | `{"rule":4}`                         | `{"user":4}`             |       0 | `{"write":4}`  | `{"fact":0,"rule":4,"preference":0}` | `MEMORY.md (8 bullets)` |

## variant_b_schema_plus_prompt_simplification

- hypothesis: A bounded canonicalization simplification helps beyond prompt-only changes by removing the model burden of class assignment and normalizing brittle rule payload output.
- simplification tested: Prompt simplification plus a canonicalization normalizer that derives canonicalClass from kind/sourceKind and repairs minimal rule payload shape.
- total windows: 10
- candidate counts by type: {"rule":116,"fact":9,"procedure":11}
- canonicalized counts by kind: {"rule":42,"fact":3,"procedure":1}
- validation rejects: 0
- write decisions: {"write":44,"attach_support":2}
- adjudication outcomes: {"no_candidates":40,"direct_attach_support":1,"local_conflict_hold_ambiguous":1,"direct_distinct":3}

| document                                                                              | windows | pass1 candidates                     | accepted kinds             | accepted classes             | rejects | writes                           | active delta                        | memory projection       |
| ------------------------------------------------------------------------------------- | ------: | ------------------------------------ | -------------------------- | ---------------------------- | ------: | -------------------------------- | ----------------------------------- | ----------------------- |
| `docs/system/memory.md`                                                               |       1 | `{"rule":14,"fact":1}`               | `{"rule":7}`               | `{"project":7}`              |       0 | `{"write":6,"attach_support":1}` | `{"rule":5}`                        | `MEMORY.md (2 bullets)` |
| `docs/system/deployment.md`                                                           |       1 | `{"rule":18}`                        | `{"rule":9}`               | `{"project":9}`              |       0 | `{"write":8,"attach_support":1}` | `{"rule":8}`                        | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/architecture-overview.md`                           |       1 | `{"rule":12}`                        | `{"rule":6}`               | `{"project":6}`              |       0 | `{"write":6}`                    | `{"rule":6}`                        | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/kind-primary-schema-migration.md`                   |       1 | `{"rule":4,"procedure":1}`           | `{}`                       | `{}`                         |       0 | `{}`                             | `{"rule":0}`                        | `MEMORY.md (2 bullets)` |
| `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`            |       1 | `{"rule":16,"procedure":2,"fact":1}` | `{"rule":8}`               | `{"project":8}`              |       0 | `{"write":8}`                    | `{"rule":8}`                        | `MEMORY.md (2 bullets)` |
| `docs/projects/workspace-topology/runtime-project-surfaces.md`                        |       1 | `{"rule":12}`                        | `{"rule":6}`               | `{"project":6}`              |       0 | `{"write":6}`                    | `{"rule":6}`                        | `MEMORY.md (2 bullets)` |
| `docs/projects/deployment-topology/github-automation.md`                              |       1 | `{"fact":6,"rule":8,"procedure":2}`  | `{"fact":3,"procedure":1}` | `{"project":3,"feedback":1}` |       0 | `{"write":4}`                    | `{"rule":0,"fact":3,"procedure":1}` | `MEMORY.md (4 bullets)` |
| `docs/projects/skills-system/skill-vetting/specs/operator-vetting-report-contract.md` |       1 | `{"rule":20}`                        | `{}`                       | `{}`                         |       0 | `{}`                             | `{"rule":0,"fact":0,"procedure":0}` | `MEMORY.md (4 bullets)` |
| `docs/projects/web-stack/web_research_delegation_spec.md`                             |       1 | `{"rule":8,"fact":1}`                | `{"rule":4}`               | `{"project":4}`              |       0 | `{"write":4}`                    | `{"rule":4,"fact":0,"procedure":0}` | `MEMORY.md (4 bullets)` |
| `docs/projects/intake-routing/ROUTING_IMPLEMENTATION_CHECKLIST.md`                    |       1 | `{"rule":4,"procedure":6}`           | `{"rule":2}`               | `{"project":2}`              |       0 | `{"write":2}`                    | `{"rule":2,"fact":0,"procedure":0}` | `MEMORY.md (4 bullets)` |
