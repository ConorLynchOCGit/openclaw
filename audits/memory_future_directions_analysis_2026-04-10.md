# Memory Future Directions Analysis

Date: 2026-04-10

## Executive summary

OpenClaw should not adopt a second large memory architecture.

The clean path is to keep Postgres as the canonical durable substrate, keep
native files as projections and operator-facing products, and selectively adopt
only the parts of Claude-style memory, LLM wiki, and graph-memory thinking that
reduce retrieval ambiguity, improve browseability, or improve compilation of
knowledge that already exists.

The strongest near-term candidate is not a graph database or a wiki-first
memory rewrite. It is a tighter metadata-first scoped-memory model for shared,
project, and agent memory, with specificity-aware retrieval and bounded
agent-local projections.

The second strongest candidate is a compiled knowledge product layer for
research- or project-heavy work: generated topic pages or wiki-like outputs
derived from canonical memory plus source material, but explicitly not treated
as canonical memory.

Graph-like benefits are real, especially for contradiction handling,
entity-resolution, temporal change, and agent/project inheritance. But the
right first move is relational and metadata-first inside the current Postgres
substrate, not a new graph system.

## What was reviewed

### OpenClaw local docs

- `docs/memory-system/README.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/specs/long-prompt-capture-and-overflow.md`
- `docs/memory-system/specs/native-openclaw-memory-integration.md`
- `docs/memory-system/specs/per-agent-and-per-project-memory-integration.md`
- `docs/memory-system/specs/source-of-truth-and-precedence.md`

### OpenClaw code surfaces

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/native-memory-projection-routing.ts`
- `extensions/memory-middleware/src/native-memory-projection-scope.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/memory-canonical-compat.ts`
- `src/plugin-sdk/memory-canonical-core-v1.ts`

### External inputs

- user-provided text of the Troy Hua Claude-memory X post
- user-provided text of the Karpathy LLM wiki X post
- Claude Code memory docs: <https://code.claude.com/docs/en/memory>
- Karpathy LLM wiki gist: <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
- LLM Wiki site: <https://llmwiki.app/>
- Zep paper: <https://arxiv.org/abs/2501.13956>
- Mem0 graph-memory docs: <https://docs.mem0.ai/platform/features/graph-memory>

## Current OpenClaw constraints that matter

- Postgres is the canonical durable memory store.
- Native files are one-way projections and human-facing control surfaces.
- The system is already in soak and should prefer evidence collection over
  speculative expansion.
- Metadata-first routing already exists in substance for shared, project,
  agent, and session projection scope.
- The canonical SDK scope surface is still coarse (`global`, `project`,
  `mixed`), so finer scope distinctions currently live in facets and
  provenance.
- A deeper simplification/refactor is likely soon, so ideas that create a
  parallel substrate or permanent compatibility maze should be rejected.

## Claude-style memory: what fits cleanly

### Strong fit

- concise startup digest plus deeper on-demand files
  - OpenClaw already has the start of this through compact top-level
    `MEMORY.md`, project-local projection, and bounded specialized-agent
    projection
  - the clean extension is more compiler-generated topical organization, not a
    new canonical store
- clearer ownership boundaries between policy, learned memory, and continuity
  - this already aligns with `AGENTS.md` policy-only, `SOUL.md` human-authored,
    `memory/YYYY-MM-DD.md` continuity-only, and DB memory as canonical
- project-local and agent-local browseable memory surfaces
  - these fit naturally as projections of canonical approved memory
- auditability and editability
  - human-zone / generated-zone separation is already the right pattern and
    should continue

### Medium fit

- background organization or consolidation
  - useful only if it compiles or repairs projections from canonical state
  - bad fit if it becomes a second memory-authoring path with its own truth
    semantics
- memory browsing and local editing affordances
  - useful if edits are treated as human-authored control inputs or promoted
    back through explicit review
  - bad if they silently fork the DB truth

### Bad fit

- a separate session-memory, dreaming, and file-memory architecture as a peer
  canonical system
- prompt-cache-specific compaction layers as a memory roadmap objective
  - those are agent-runtime context-management ideas, not the right center of
    gravity for OpenClaw durable memory
- silently auto-maintained memory files that function as truth rather than
  projection

### Why

Claude-style memory is strongest as an organization model:

- concise index
- deeper topical material
- scope boundaries
- visible editable artifacts

It is not a good reason for OpenClaw to duplicate canonical storage across DB
and auto-written markdown.

## LLM wiki / knowledge-base patterns: what fits cleanly

### Strong fit

- compiled knowledge pages built from raw sources plus approved memory
- operator-facing or project-facing topic pages
- filing useful outputs back into a maintained derived artifact
- linting passes for contradiction, staleness, orphan pages, or missing links

### Best placement in OpenClaw

The clean placement is:

- not canonical memory
- not a replacement for retrieval
- not a replacement for native projection
- instead, a neighboring compiled knowledge product built on top of:
  - canonical approved memory
  - approved raw source inputs
  - operator-reviewed generated summaries where useful

### Clean use cases

- research-heavy project folders
- project briefings
- topic digests that summarize many related facts and sources
- operator-facing review packs or daily/weekly compiled briefs

### Bad fit

- making the wiki itself the source of truth
- allowing arbitrary generated wiki content to re-enter the DB automatically
- creating per-topic markdown forests for every normal memory family

### Why

Karpathy's pattern is excellent for accumulated synthesized knowledge over a
bounded source corpus. That is different from OpenClaw's durable operational
memory substrate. The wiki idea fits as a compiled product, not as the core
memory database.

## Graph memory: what it would actually buy us

### Real problems it can help with

- entity resolution across repeated mentions
- multi-hop recall across related facts
- contradiction and supersession tracking
- temporal reasoning
  - what was true before
  - what is true now
  - when the change happened
- scope inheritance questions
  - shared memory inherited by projects
  - project memory inherited by agents
  - agent-local exceptions or overrides

### Memory areas most likely to benefit

- project facts with changing values over time
- workflow guidance with supersession or exceptions
- agent-specific operational knowledge
- research/topic knowledge with repeated entities and cross-links

### What current OpenClaw can likely do first without a graph system

- richer typed metadata
- explicit relation fields in canonical facets
- relation tables in Postgres
- stronger subject-key / entity-key normalization
- temporal metadata and supersession chains
- retrieval ranking that rewards applicable related facts
- projection/compiler layers that expose relations in human-readable form

### Why a full graph system is not justified now

- it adds another retrieval/indexing substrate
- it raises synchronization and correctness burden
- it complicates the upcoming simplification refactor
- current use cases do not yet prove that graph traversal is the limiting
  factor
- the likely first wins are relation-aware ranking and temporal lineage, both
  of which can be modeled inside the current Postgres substrate

### Recommendation

Do not adopt a standalone graph memory system near term.

Instead, if soak evidence shows relation-heavy failure modes, add a lightweight
relational/temporal layer first:

- typed entity keys
- typed edge rows or relation facets
- explicit supersedes / contradicts / derived-from links
- time-bounded validity where the family needs it

If that later proves insufficient, revisit a deeper graph substrate during the
larger simplification/refactor, not before.

## Near-term design for agent-specific memory capture and recall

### Design goal

Support useful agent-local memory without forking OpenClaw into duplicated
per-agent copies of shared knowledge.

### The clean scope model

Treat scope as specificity rather than a single flat ladder.

Recommended applicability layers:

- human policy / control surfaces
- session continuity only
- agent+project specific memory
- project-specific memory
- agent-specific memory
- shared/global memory

This is cleaner than forcing everything into a single linear precedence chain.

### What should be capturable as agent-specific

- role-local workflow habits
- role-local tool preferences or caveats
- recurring source preferences for a specialized agent
- role-local interpretation or formatting defaults
- agent-local operating constraints

Examples:

- `web-researcher` prefers primary sources and stable citations
- `x-manager` drafts shorter outbound copy with specific platform constraints
- a specialized agent knows a particular workspace subfolder or review pattern

### What should stay shared, project, or session instead

- global user preferences stay shared
- project facts and project rules stay project-scoped
- continuity of the current conversation stays session-only
- broad reusable workflow guidance stays shared or project, not agent, unless
  it is truly role-specific

### Capture rules

An agent-scoped memory should require at least one of:

- explicit applicability to a named agent or role
- clearly role-specific behavior or tool choice
- evidence that the guidance is not generally correct for all agents

Guardrails:

- do not create an agent-scoped memory if an equivalent shared or
  project-scoped memory already covers it
- if the candidate is simply a project fact seen by an agent, keep it
  project-scoped
- if the candidate is only useful for the current run, keep it session-only

### Retrieval rules

For a given agent request:

- always load applicable human policy first
- load session continuity separately from durable memory
- rank durable memory by specificity:
  - agent+project match
  - project match
  - agent match
  - shared match
- on conflict, prefer the more specific applicable memory
- prefer project facts over generic agent habits when the two disagree about
  project reality
- prefer explicit supersession/correction lineage over simple recency

### Storage recommendation

Near term, current metadata-first posture is enough.

Use the current canonical record plus facets/provenance for:

- `projectScope`
- `scopeType`
- `agentKey` or `appliesToAgent`
- relation and supersession hints where needed

No near-term schema change is required if:

- capture can stamp agent applicability clearly
- retrieval can filter and rank by specificity
- projections can render the scoped result honestly

### When schema change would become justified

Only if soak evidence shows that metadata-first scope handling causes one of:

- repeated retrieval ambiguity that cannot be fixed by ranking
- unacceptable SQL complexity for common queries
- inability to represent agent+project specificity cleanly
- poor auditability of scope lineage

If a future refactor touches canonical types anyway, extending canonical scope
semantics would be cleaner than growing an unbounded facet convention.

### Projection model

Keep agent projections narrow and allowlisted.

Recommended projection posture:

- concise agent-local digest
- only role-relevant memory
- pointers back to shared/project material rather than copied bulk content
- human-zone / generated-zone separation preserved

Do not dump shared memory wholesale into every agent workspace.

### Performance controls

- allowlist only real specialized agents
- keep retrieval caps bounded by scope and intent
- favor reference/inheritance over duplicated projection
- record scope-hit and scope-conflict telemetry
- keep agent-specific write volume bounded and deduped against broader scopes

### Governance controls

- every agent-scoped record should be auditable as to why it was not shared
- record the source agent and evidence
- suppress near-duplicate forked memories
- keep promotion/review surfaces able to collapse agent-local candidates back
  to project or shared scope when warranted

## Soak-period evidence to collect now

### Capture evidence

- candidate counts by family
- candidate counts by inferred scope
- accepted vs deferred vs dropped counts
- duplicate-suppression hits
- same-subject collision counts
- per-turn candidate-pool size distribution

### Retrieval evidence

- returned memory counts by scope
- applied memory counts by scope
- surfaced-but-unused counts by scope
- scope-conflict or scope-mismatch cases
- cases where a missing agent/project distinction caused the wrong memory to
  surface

### Review and operator evidence

- candidate-review burden by family and scope
- false-positive examples
- low-value agent-specific candidates that should have stayed broader or
  narrower
- cases where current audit output is insufficient to explain why a memory was
  chosen

### Projection evidence

- projection destinations updated per run
- agent/project projection size and churn
- repeated drift repair or generated-zone repair
- unmatched mapping counts

### Knowledge-product evidence

- repeated requests for synthesized project/topic briefings
- repeated filing of answers into operator docs
- repeated need to reconcile multiple related sources into one stable summary

### Relation / graph evidence

- repeated contradiction or supersession events on the same subject
- repeated multi-hop retrieval failures
- repeated entity-alias collisions
- temporal-change cases where old vs current truth was ambiguous

## Recommendation set

### A. Strong near-term candidates that fit OpenClaw naturally

- metadata-first agent-specific capture and recall with specificity-aware
  retrieval
- better browseability via concise index plus deeper generated topical/project
  and agent views
- richer soak telemetry for scope, conflict, relation, and projection behavior
- lightweight relation and temporal modeling inside Postgres if soak evidence
  shows repeated ambiguity

### B. Interesting ideas that should stay unscheduled for now

- compiled wiki or knowledge-product projections for research-heavy topics or
  projects
- broader topic-page generation from approved memory plus approved sources
- deeper relation-aware retrieval once telemetry shows where the current
  ranking model actually fails
- broader specialized-agent coverage only if real workspaces and usage justify
  it

### C. Ideas that sound attractive but would likely make the system worse

- a second canonical markdown memory system
- a graph database introduced before simpler relational fixes are exhausted
- auto-feeding generated wiki pages back into canonical DB memory
- per-agent full memory copies
- heavy background consolidation systems that own truth independently of the
  DB

## What should likely be the next scheduled tranche after soak

If soak evidence supports it, the cleanest next scheduled tranche is:

1. metadata-first agent-specific capture and recall hardening
2. specificity-aware retrieval ranking and conflict handling
3. narrow agent-local projection follow-through
4. relation and temporal metadata follow-through only if the first three still
   expose ambiguity

Compiled wiki / knowledge-product work should remain a neighboring later
candidate unless the soak period shows strong repeated operator demand for
synthesized project/topic briefs.

## Bottom line

OpenClaw already has the beginnings of the right shape:

- canonical DB memory
- bounded capture and overflow
- shared/project/agent/session distinctions in projection logic
- compact top-level memory projections with deeper project-local outputs

The next improvements should make those distinctions more explicit and more
useful, not introduce a second big memory architecture.
