---
summary: "Replacement architecture for MMV2-native recall, retrieval packs, projection digests, context injection, and retrieval telemetry."
title: "Memory Retrieval Runtime"
---

# Memory Retrieval Runtime

## Status

Status: current read-side hardening architecture as of 2026-04-23.

2026-04-23 implementation update:

- retrieval metrics now emit `emptyRetrievalReason` so operators can
  distinguish no candidates, candidates found but excluded, threshold
  suppression, stale/conflict suppression, provider/schema failure, and
  timeout/pool-pressure classes when those surfaces report them
- projection exclusions now distinguish stale, conflicted, inactive, and
  hash-invalid derived artifacts
- metrics include read-time ranking feature summaries for fielded, lexical,
  source-lineage, projection-digest, conflict-lane, temporal, scope, stale,
  conflict, and inactive suppression signals
- `memory_existed_but_excluded` remains the diagnostic shape for durable
  memories or projections that existed but were filtered out
- projection digest preference remains read-time only and only applies to
  fresh projection digests backed by active MMV2 source memory ids

The MMV2-native write path and durable SQL truth are live, but the clean soak
hit a read-side wall:

- ordinary-turn capture can create MMV2 durable rows/events
- correction and supersession did not reliably control what recall saw
- fresh-session recall leaned on projection/context artifacts rather than a
  directly recorded retrieval run
- `runtime_context.retrieval_requests` did not prove the recall path
- root workspace files and compiled projections could still carry stale memory
  text unless the read layer applies source weighting and active-state filters

This spec replaces the current flat retrieval/projection posture with a
Memory Retrieval Runtime between canonical MMV2 storage and OpenClaw context
assembly.

## Core decision

Canonical memory remains the source of truth.

Projections are compiled views.

Memory packs are task-specific runtime bundles.

The runtime flow is:

```text
current task / turn
  -> retrieval plan
  -> candidate recall from multiple indexes
  -> filtering, reranking, and conflict checks
  -> memory pack assembly
  -> context injection or projection compilation
  -> telemetry back into retrieval quality
```

The canonical write path remains:

```text
RawMemoryCaptureEvent
  -> extraction
  -> CanonicalCandidate
  -> AdmissionDecision
  -> DurableMemoryRecord
  -> events / edges / indexes
  -> retrieval
  -> memory pack
  -> context
```

The projection path remains derived:

```text
DurableMemoryRecord + MemoryEvent + MemoryEdge
  -> projection compiler
  -> entity / project / procedure / source / profile pages
  -> projection digest
  -> projection indexes
  -> retrieval as needed
```

Projections must never bypass admission. A projection may suggest candidate
updates, but those updates must re-enter the same ingestion, admission, and
reconciliation pipeline.

## Strict Model Routing Posture

Strict MMV2 capture/ingest paths default to
`openai-codex/gpt-5.4-mini` after the live nano route failed strict structured
output at the provider boundary. Retrieval interpretation may keep its own
explicit override, but any route that feeds canonical admission must prove the
actual strict schema contract before it becomes the default.

Nano remains available for explicit low-risk lanes such as deterministic
ranking/filtering, benchmark-only comparisons, or non-admission first-pass
work. It must not silently become the default strict canonical admission route
until it passes strict-schema, no-empty-response, and evidence-validation
gates.

## Layer model

The retrieval runtime has six layers.

| Layer                  | Responsibility                                                                      | Truth posture                        |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| Canonical memory store | durable claims, directives, source refs, episodes, composites, events, edges        | semantic truth                       |
| Retrieval indexes      | fielded, lexical, vector, graph, temporal, source, projection digest, usage/quality | derived lookup surfaces              |
| Retrieval planner      | chooses corpora, indexes, filters, pack types, budgets                              | runtime decision, not semantic truth |
| Memory pack assembler  | converts candidates into bounded cited packs                                        | runtime bundle                       |
| Context injector       | inserts selected packs into prompt additions, context messages, or tool hints       | transient runtime context            |
| Projection compiler    | creates pages, digests, dashboards, and human-readable views                        | compiled view                        |

## Operational memory and knowledge projections

The runtime must preserve the split between operating memory and knowledge
projection.

Operational memory controls how the assistant should behave. Knowledge
projection describes what is true about projects, entities, people, sources,
meetings, ideas, and timelines.

| Memory                                            | Canonical record                                     | Projection posture                   |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| "Never send email without asking first."          | `directive`                                          | may appear in an agent-ops dashboard |
| "User prefers concise technical answers."         | `claim.preference_state` and optional soft directive | user profile projection              |
| "Alice is CEO of Acme."                           | `claim`                                              | entity pages for Alice and Acme      |
| "Release process: run tests, build, tag, deploy." | `composite.procedure`                                | procedure page / skill projection    |
| "On Apr 20, build failed because X."              | `episode`                                            | project timeline                     |
| "Docs are in `/docs/billing.md`."                 | `source_ref`                                         | source index / project page link     |
| "Project decided to use Postgres."                | `claim.decision` or decision episode                 | project decision log                 |

Operational preferences must not clutter world-knowledge pages. World/entity
knowledge must not be flattened into a generic assistant-memory list.

## Source weighting and root-file posture

MMV2 durable SQL is primary semantic truth.

Root workspace `USER.md` and `MEMORY.md` remain human-owned bootstrap/source
inputs, not generated model-memory projection targets. They can contribute
context, but they cannot satisfy MMV2 recall proof by themselves.

The first implementation should use this authority order for memory-aware
context:

1. hard directives from active MMV2 canonical records
2. active MMV2 canonical records selected by the retrieval runtime
3. fresh MMV2-derived projection digests with active `source_memory_ids`
4. lower-authority human-owned bootstrap files such as root `USER.md` and
   `MEMORY.md`
5. lower-authority daily notes and episode continuity inputs
6. session transcript/context, only for current-session working state

This is not a rule that projections are weak. Fresh projections can be faster
and more robust than raw DB retrieval for project/entity overviews, but they
must carry source memory ids, freshness metadata, and active-state exclusions.

Daily notes under `memory/YYYY-MM-DD.md` remain writable through the session
memory path. They should be ingested by content hash as lower-authority
`daily_continuity` sources and should not override active directives,
preference slots, or canonical decisions without admission.

Phase 2 retrieval is authority-aware. Retrieval candidates and packs should
carry `authorityTier` and `sourceProfileId` when available.

Authority tiers are defined in
[Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority):

- `user_authoritative`
- `curated_authoritative`
- `tool_grounded`
- `cited_soft`
- `inspection_only`

Authority affects both admission and retrieval. Confidence and authority remain
separate.

## Runtime primitives

The first implementation should introduce typed runtime contracts without a DB
migration. Store records through the existing `runtime_context.retrieval_*`,
`context_artifacts`, and projection-version surfaces until the runtime shape is
proven.

Implementation note, 2026-04-22:

- retrieval DB access is the highest-priority model-memory DB lane
- capture and rebuild lanes may defer under pool pressure rather than
  consuming connections needed for user-facing retrieval/context assembly
- provider preflight for retrieval interpretation now uses the actual
  strict-schema contract instead of generic JSON-object health checks
- provider/model scorecards may record retrieval interpretation schema status,
  latency, token counts, cached-token counts, and failure class as safe
  operational metadata only
- these changes are availability/observability controls; ranking remains
  read-time only and does not mutate MMV2 truth

Implementation note, 2026-04-23 pre-Phase-2 gate:

- all 10 rich projection types can now be materialized into the live projection
  artifact index from active MMV2 runtime records
- retrieval candidate recall excludes stale, inactive, and conflicted
  projection digests from normal packs
- selected projection digests carry reason codes including
  `projection_type:<type>`
- retrieval-pack assembly records selected projection ids and backing source
  memory ids, then exposes eligible projection digest packs to context
  assembly
- projection-backed context is valid only when the selected digest is backed by
  active MMV2 source memory ids; workspace-file-only context is still not
  recall proof
- live projection behavior proof covers `user_profile_page`, `project_page`,
  `procedure_page`, `source_page`, `decision_log`, `timeline_page`,
  `entity_page`, `dashboard`, `agent_digest`, and `projection_digest`; each
  proof records the selected projection id, source memory ids, artifact path,
  and a model response using the projection context

Implementation note, 2026-04-21:

- the first no-migration runtime now carries typed `RetrievalPlan`,
  `RetrievalCandidate`, `MemoryPack`, `ProjectionDigest`, and `RetrievalRun`
  contracts
- `ProjectionDigest` now covers the full v1 projection catalog and includes
  source memory ids, source event ids, source edge ids, content hash,
  freshness, stale markers, conflict markers, and source weight
- memory pack/run telemetry now reports selected ids, excluded ids, exclusion
  reason counts, stale/superseded/deleted/conflicted/inactive filter counts,
  selected projection ids, selected source memory ids, empty-retrieval state,
  injected count, and estimated token count
- this remains read-time behavior only; ranking and projection digest selection
  do not mutate canonical MMV2 truth

## Projection catalog

The v1 projection registry defines these compiled-view types:

| Projection type     | Human-readable | Machine-facing | Retrieval role            |
| ------------------- | -------------- | -------------- | ------------------------- |
| `user_profile_page` | yes            | yes            | user profile              |
| `project_page`      | yes            | yes            | project state             |
| `procedure_page`    | yes            | yes            | procedure                 |
| `source_page`       | yes            | yes            | source reference          |
| `decision_log`      | yes            | yes            | project state             |
| `timeline_page`     | yes            | yes            | episode continuity        |
| `entity_page`       | yes            | yes            | entity/world              |
| `dashboard`         | yes            | no             | conflict/dashboard review |
| `agent_digest`      | no             | yes            | digest index              |
| `projection_digest` | no             | yes            | digest index              |

All retrieval-facing digests require active MMV2 `source_memory_ids`.
Conflicted memories may be surfaced only through conflict-aware projection
sections or conflict packs. Deleted and superseded memories are excluded from
normal projection digests by default.

### `RetrievalPlan`

```ts
interface RetrievalPlan {
  plan_id: string;
  schema_version: "retrieval_plan.v1";
  run_id: string;
  session_id?: string | null;
  user_id?: string | null;
  project_id?: string | null;
  intent: string;
  corpora: RetrievalCorpus[];
  pack_types: MemoryPackType[];
  queries: RetrievalPlanQuery[];
  budget: RetrievalBudget;
  hard_requirements: Array<{
    requirement: "hard_directives_checked" | "active_only_default" | "conflict_aware";
    satisfied: boolean;
  }>;
}
```

Planner rules:

- always check hard directives in current user/project/workspace scope
- query narrow scope before broad scope
- retrieve procedures only when activation triggers match
- prefer projection digests for project/entity overviews
- prefer source refs over copied source content when tools can read files
- prefer recent episodes for continuity, but never above hard directives
- exclude superseded/deleted memories by default
- never silently inject unresolved conflicts
- produce one exclusion reason for every candidate dropped after recall

### `RetrievalCandidate`

```ts
interface RetrievalCandidate {
  candidate_id: string;
  memory_id?: string;
  projection_id?: string;
  source:
    | "fielded"
    | "lexical"
    | "vector"
    | "graph"
    | "projection_digest"
    | "recent_session"
    | "manual_id";
  raw_score: number;
  rank: number;
  kind?: string | null;
  artifact_type?: string | null;
  scope_match: "current_project" | "current_workspace" | "user_global" | "broad" | "none";
  status: "active" | "historical" | "superseded" | "conflicted" | "quarantined" | "deleted";
  authority?: string | null;
  confidence?: number | null;
  features: Record<string, number | string | boolean | null>;
}
```

### `MemoryPack`

```ts
type MemoryPackType =
  | "operating_pack"
  | "user_profile_pack"
  | "project_state_pack"
  | "procedure_pack"
  | "source_reference_pack"
  | "episode_continuity_pack"
  | "entity_world_pack"
  | "conflict_pack"
  | "projection_digest_pack";

interface MemoryPack {
  pack_id: string;
  schema_version: "memory_pack.v1";
  pack_type: MemoryPackType;
  run_id: string;
  session_id?: string | null;
  user_id?: string | null;
  project_id?: string | null;
  intent: string;
  generated_at: string;
  token_budget: number;
  estimated_tokens: number;
  sections: MemoryPackSection[];
  sources: Array<{
    memory_id?: string;
    projection_id?: string;
    evidence_id?: string;
    source_label: string;
  }>;
  exclusions: Array<{
    id: string;
    id_type: "memory" | "candidate" | "projection";
    reason:
      | "superseded"
      | "conflicted"
      | "duplicate"
      | "low_score"
      | "scope_mismatch"
      | "budget"
      | "sensitive"
      | "stale";
  }>;
  telemetry: {
    retrieval_plan_id: string;
    retrieval_run_id: string;
    candidate_count: number;
    selected_count: number;
    injected: boolean;
    injection_target: "systemPromptAddition" | "message" | "tool_hint" | "projection_only";
  };
}

interface MemoryPackSection {
  section_id: string;
  section_type:
    | "hard_directives"
    | "soft_preferences"
    | "project_state"
    | "procedure"
    | "source_refs"
    | "recent_episodes"
    | "entity_digest"
    | "conflicts"
    | "open_questions";
  priority: number;
  render_mode: "bullets" | "compact_json" | "markdown" | "table";
  items: MemoryPackItem[];
}

interface MemoryPackItem {
  item_id: string;
  memory_id?: string;
  projection_id?: string;
  kind?: string;
  text: string;
  scope_label: string;
  confidence?: number;
  authority?: string;
  source_label?: string;
  evidence_ids?: string[];
}
```

### `ProjectionDigest`

```ts
interface ProjectionDigest {
  projection_id: string;
  schema_version: "memory_projection_digest.v1";
  projection_type:
    | "entity_page"
    | "project_page"
    | "procedure_page"
    | "source_page"
    | "user_profile_page"
    | "decision_log"
    | "timeline_page"
    | "dashboard"
    | "agent_digest";
  slug: string;
  title: string;
  summary: string;
  source_memory_ids: string[];
  source_event_ids: string[];
  source_projection_ids: string[];
  claims: string[];
  procedures: string[];
  sources: string[];
  open_questions: string[];
  stale_claims: string[];
  conflicts: string[];
  content_hash: string;
  compiled_at: string;
  stale: boolean;
  stale_reason?: string | null;
}
```

### `RetrievalRun`

```ts
interface RetrievalRun {
  retrieval_run_id: string;
  schema_version: "retrieval_run.v1";
  run_id: string;
  session_id?: string | null;
  created_at: string;
  intent: string;
  query_text_hash: string;
  raw_query_persisted: false;
  corpora: RetrievalCorpus[];
  indexes_used: RetrievalIndexType[];
  candidate_count: number;
  selected_memory_ids: string[];
  injected_memory_ids: string[];
  selected_projection_ids: string[];
  excluded: Array<{ id: string; reason: string }>;
  pack_ids: string[];
  quality_signals: {
    later_user_correction?: boolean;
    tool_outcome_contradiction?: boolean;
    memory_used_in_answer?: boolean;
    relevant_memory_missing?: boolean;
  };
}
```

Raw prompt text, full transcripts, raw tool logs, and secrets must not be
persisted in retrieval telemetry.

## Pack types

### Operating pack

Always considered. Inject when relevant.

Contains hard directives, privacy/safety constraints, tool-use rules, response
style defaults, and project-scoped rules.

Rules:

- hard directives outrank every other memory type
- superseded/conflicted directives are never silently injected
- soft preferences are scoped and can be omitted under tight budgets
- `cited_soft` and `inspection_only` memories must not appear as hard operating
  directives

### User profile pack

Used when response style, personalization, user identity, preferences, or
accessibility context matters.

This pack must remain narrow and task-relevant. It must not become a biography
dump.

### Project state pack

Used for project-specific tasks.

Contains current project facts, active decisions, constraints, known blockers,
owners, environment facts, recent relevant episodes, and source refs.

Project projections are useful here. Prefer a compiled project digest plus a
small number of supporting memory ids over injecting many atomic records.

Project-state packs may include `tool_grounded` and `cited_soft` facts,
references, and procedures when authority labels are preserved and the content
is not promoted into standing directives.

### Procedure pack

Used when activation triggers match.

Contains procedure title, activation conditions, preconditions, ordered steps,
guardrails, source refs, and expected outputs.

Procedure steps remain embedded inside the procedure pack. They must not become
standalone global memories.

### Source reference pack

Used when grounding, docs, code, tickets, reports, or prior artifacts matter.

Prefer locators over prose. The pack should tell the model where to look rather
than copy unbounded source content.

This is the default pack family for lower-authority cited research and
researcher-report material.

### Episode continuity pack

Used for "continue where we left off" and recent-history tasks.

Contains task outcomes, failures, last known state, unresolved follow-ups, and
recent user decisions. It should decay quickly unless an episode was admitted
as a durable decision/outcome.

### Entity/world pack

Used for people, companies, meetings, concepts, and original thinking.

This comes primarily from projections, GBrain-style pages, or a memory-wiki
layer rather than raw operational memory.

### Conflict pack

Only injected when relevant.

Contains unresolved conflicts, stale/superseded warnings, competing memories,
and the recommended interpretation when scope resolves the apparent conflict.

Soft-source conflicts should surface here rather than silently resolving
higher-authority memories.

## Retrieval corpora

The planner chooses from these corpora instead of querying everything every
time.

| Corpus         | Contents                                                    |
| -------------- | ----------------------------------------------------------- |
| `operational`  | directives, preferences, tool rules, privacy rules          |
| `user_profile` | stable profile/preference claims and communication defaults |
| `project`      | project facts, decisions, procedures, source refs           |
| `procedures`   | composite procedures, checklists, skills, runbooks          |
| `episodes`     | recent outcomes, task history, decisions, failures          |
| `sources`      | file paths, docs, URLs, tickets, reports                    |
| `world`        | entity/person/company/meeting/concept projections           |
| `session`      | current active conversation and compacted session summary   |
| `projections`  | compiled digests, pages, dashboards                         |

Example routing:

| User/task                        | Corpus plan                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| "How should you format replies?" | `operational`, `user_profile`                                 |
| "Deploy this repo."              | `operational`, `project`, `procedures`, `sources`, `episodes` |
| "Who is Alice?"                  | `world`, `projections`, `sources`                             |
| "Continue where we left off."    | `session`, `episodes`, `project`                              |
| "Find the billing docs."         | `sources`, `project`                                          |
| "Why did the last build fail?"   | `episodes`, `sources`, `project`                              |
| "What do we know about Acme?"    | `world`, `projections`, graph neighbors                       |

## Retrieval indexes

V1 must start with fielded filters, lexical matching, projection digests, and
status/scope/authority filtering. Vector, graph, and usage-quality signals can
be staged in after the runtime is proven.

Index families:

- fielded metadata: exact filtering by memory id, kind, artifact type, status,
  scope, subject, project/workspace/user, authority, confidence, source type,
  tags, valid/invalid time
- lexical: exact terms, file paths, package names, ticket ids, function names,
  error messages, named entities
- vector: conceptual matches and paraphrase retrieval after V1
- graph: edges such as parent/child, derived_from, supersedes, conflicts_with,
  references, same_entity_as, mentions, owns, depends_on, blocks
- projection digest: compact machine-readable digests before full page fetch
- usage/quality: retrieval count, injection count, correction after injection,
  last accessed, duplicate/conflict count, staleness
- authority/source profile: authority tier, source profile id, and source class
  filters

Hard filters:

- exclude `deleted`
- exclude `superseded` by default
- exclude `conflicted` unless conflict-aware retrieval is requested
- match current user/project/workspace scope before broad scope
- exclude sensitivity that is not allowed for the current context

## Candidate generation and reranking

Candidate generation should normalize all hits into `RetrievalCandidate`
records from:

- exact/fielded lookup
- lexical search
- vector search when enabled
- graph neighbors when enabled
- projection digest search
- recent/session state

Fusion should begin with reciprocal-rank fusion across available ranked lanes.
A simple deterministic scoring model is acceptable for V1:

```text
score =
  0.30 * fusion_score
+ 0.15 * scope_score
+ 0.12 * authority_score
+ 0.10 * confidence_score
+ 0.10 * kind_priority
+ 0.08 * recency_or_freshness
+ 0.07 * usage_success
+ 0.05 * graph_score
+ 0.03 * source_quality
- penalties
```

Penalties:

- `superseded`: exclude
- `deleted`: exclude
- `conflicted_without_resolution`: exclude or conflict-pack only
- `low_confidence`: penalize
- `sensitive_context_mismatch`: exclude
- `stale_source`: penalize
- `duplicate_near_identical`: keep best only
- `too_broad_scope_when_narrow_exists`: penalize

Kind priority depends on task:

- execution: directive, procedure, source_ref, project_state, episode, claim
- Q&A: source_ref, claim, projection, episode, directive
- personal style: hard directive, preference claim, soft directive, episode
- entity lookup: projection, claim, source_ref, episode, directive
- research/reference: source_ref, cited_soft claim, tool_grounded fact,
  projection, capsule

## Pack assembly

Pack assembly turns candidates into what the model sees.

Steps:

1. partition candidates by pack type
2. apply hard exclusions
3. resolve duplicates and supersession
4. merge related memories
5. choose concise render form
6. attach source/provenance labels
7. fit the token budget
8. emit exclusion reasons
9. record pack telemetry

Default budget envelope:

```json
{
  "total_memory_budget": 1800,
  "hard_directives": 250,
  "soft_preferences": 150,
  "project_state": 350,
  "procedures": 550,
  "source_refs": 250,
  "episodes": 150,
  "conflicts": 100
}
```

Budget envelopes should vary by intent. Execution tasks prioritize directives,
procedures, source refs, and recent episodes. Research/Q&A prioritizes source
refs, entity/world projections, and claims. Personalization prioritizes user
profile and operating directives. Continuation prioritizes episodes and session
summary.

## Context injection

Use `ContextEngine.assemble` as the primary insertion point.

Injection targets:

- `systemPromptAddition` for hard directives, critical project rules,
  safety/privacy constraints, and compact operating packs
- context message blocks for task-relevant facts, project state, procedures,
  source refs, and recent episodes
- tool hints for file paths, source refs, procedure ids, guardrails, and likely
  files

When a `cited_soft` or conflicting source materially affects an answer, the
ordinary response should expose enough citation or authority language for the
operator to understand the source class. Full authority details stay in trace
artifacts.

Keep a fallback prompt-build integration only for session types where
`assemble` is proven not to fire. The fallback must be telemetry-labeled and
must not become a parallel memory system.

## Projection architecture

Projection compiler outputs are compiled views over canonical memory.

Projection types:

- `entity_page`
- `project_page`
- `procedure_page`
- `source_page`
- `user_profile_page`
- `decision_log`
- `timeline_page`
- `dashboard`
- `agent_digest`

Projection triggers:

- memory write/update
- conflict or supersession event
- file/source content-hash change
- scheduled maintenance

Projection use in retrieval:

- search digest first
- fetch full page only when needed
- graph-expand related pages only under strict caps
- record source memory ids and freshness on every selected projection

Human edits to projection pages create candidate memories. They do not mutate
canonical memory directly.

## Conflict and supersession retrieval policy

Status handling:

| Status        | Default retrieval behavior                    |
| ------------- | --------------------------------------------- |
| `active`      | eligible                                      |
| `superseded`  | excluded by default                           |
| `conflicted`  | conflict-pack only unless explicit diagnostic |
| `quarantined` | excluded unless review/debug requested        |
| `deleted`     | never retrieved                               |
| `historical`  | history/timeline only                         |

If a superseded memory would otherwise score highly, emit telemetry:

```text
superseded_memory_would_have_matched
```

If two active memories appear to conflict but scopes resolve them, the pack
assembler must render the scoped resolution instead of silently picking one.

## Retrieval telemetry and closed-loop ops

Every injected memory pack must create retrieval telemetry.

Telemetry must answer:

- which memories were retrieved often but never used
- which memories were injected and then contradicted
- which relevant memories existed but were not retrieved
- which packs were too large
- which projection digests were stale
- which conflicts blocked injection
- which queries fell back to empty retrieval

This telemetry feeds `memory-ops-closed-loop` reports. It must obey the
no-dark-data rule: ids, hashes, counts, statuses, ranks, scores, source
pointers, and short redacted labels are allowed; raw prompts, full transcripts,
raw tool logs, secrets, and unbounded user content are not.

## Evaluation harness

Build retrieval evaluation before declaring the soak clean.

Minimum scenarios:

1. hard directive retrieval
2. scoped preference retrieval
3. procedure activation
4. procedure step non-leakage
5. project state retrieval
6. source ref exact path retrieval
7. entity projection retrieval
8. conflict exclusion
9. superseded memory exclusion
10. current-session vs durable distinction
11. world knowledge vs operational memory routing
12. compaction/session continuity
13. projection-backed recall with active source memory ids
14. root-file-only context rejection for MMV2 recall proof

Metrics:

- Recall@k
- Precision@k
- MRR
- pack token cost
- conflict leakage rate
- superseded injection rate
- procedure leakage rate
- hard-directive miss rate
- source-ref exact match rate
- user-correction-after-injection rate

The most important safety metrics are:

- `hard_directive_miss_rate`
- `superseded_or_conflicted_injection_rate`

Both should be near zero before fallback removal.

## Soak acceptance

A clean memory soak requires:

- MMV2 durable capture for durable preference, directive, project fact, and
  correction/supersession prompts
- temporary/session-only and explicit no-store prompts produce no active
  durable memory
- fresh-session recall excludes same-session transcript
- recall records direct retrieval telemetry
- any projection-backed recall is selected through the retrieval runtime,
  cites active MMV2 source memory ids, and records the selected projection id
- root `USER.md`, root `MEMORY.md`, daily notes, and transcript context do not
  satisfy MMV2 recall proof by themselves
- raw prompt text, full transcripts, raw tool logs, secrets, and privacy-test
  phrases do not appear in Memory Ops telemetry

Direct retrieval telemetry is the required acceptance bar. Projection-backed
recall may pass only as retrieval-selected MMV2-derived projection/context, not
as incidental workspace-file context.

## Implementation plan

### Phase 0: docs and authority

- add this spec as the canonical read-side architecture
- mark the older retrieval/context spec as V0 provenance
- update roadmap/current-slice/status docs so retrieval runtime replacement
  blocks fallback removal and primary capture expansion

### Phase 1: contracts and existing-storage telemetry

- add typed contracts for `RetrievalPlan`, `RetrievalCandidate`, `MemoryPack`,
  `ProjectionDigest`, and `RetrievalRun`
- use existing `runtime_context.retrieval_*`, `context_artifacts`, and
  projection-version surfaces
- do not add DB migrations in this first implementation slice
- stop persisting raw query text in retrieval artifacts; store hashes and
  redacted labels instead

### Phase 2: canonical candidate recall

- retrieve from MMV2-native runtime records
- remove normal-path dependence on legacy-compatible read records
- implement fielded filters, lexical matching, projection-digest lookup, and
  status/scope/authority filtering
- hard-check active directives before task-specific retrieval
- exclude superseded/deleted by default and send conflicts to conflict packs

### Phase 3: pack assembly and context injection

- build operating, user profile, project state, procedure, source reference,
  episode continuity, projection digest, and conflict packs
- integrate through `ContextEngine.assemble`
- emit `systemPromptAddition`, context message blocks, and tool hints by pack
  type
- record `RetrievalRun` and pack telemetry for every injection

### Phase 4: projection digests

- compile `project_page`, `procedure_page`, `source_page`, `user_profile_page`,
  and `agent_digest` outputs first
- search digests before full pages
- require source memory ids, event ids, content hash, and freshness metadata

### Phase 5: graph and world/entity retrieval

- add graph traversal only after fielded/lexical/projection retrieval passes
- start with `references`, `parent_of`, `child_of`, `supersedes`,
  `conflicts_with`, `same_entity_as`, and `mentions`
- add entity/world packs from projection pages
- semantic topic/entity/pattern graph recall depends on the Phase 2
  model-owned semantic graph enrichment slice; deterministic graph traversal may
  use already-validated graph nodes and edges as recall signals, but it must not
  create topical sameness, same-entity truth, or pattern membership from
  keyword/vector similarity as final authority
- final pack inclusion after graph recall remains model-owned

### Phase 6: closed-loop optimization

- use Memory Ops to report stale projections, missing retrievals, injected
  conflicts, superseded would-have-matched events, and pack-size problems
- keep auto-fix disabled until one clean observe-only soak cycle

## Non-goals

This spec does not authorize:

- DB migrations in the first retrieval-runtime pass
- semantic auto-fix
- primary capture expansion
- fallback compatibility removal before a clean soak
- vector search as the only retrieval mechanism
- projections as direct canonical truth
- root `USER.md` / `MEMORY.md` as MMV2 recall proof
- raw prompt, transcript, or tool-log persistence

## Research provenance and fidelity checklist

This spec preserves the architecture supplied in the Research Pro packet:

- six-layer architecture from canonical store through projection compiler
- canonical write path and projection path
- operational memory vs knowledge projection split
- pack types: operating, user profile, project state, procedure, source
  reference, episode continuity, entity/world, conflict
- retrieval corpora: operational, user profile, project, procedures, episodes,
  sources, world, session, projections
- index families: fielded, lexical, vector, graph, projection digest,
  usage/quality
- retrieval planner input/output, planner rules, and budget model
- candidate generation from exact, lexical, vector, graph, projection, and
  session lanes
- RRF-style fusion and deterministic feature weighting
- status-aware exclusion for superseded, conflicted, quarantined, deleted, and
  historical records
- memory pack schema, render modes, context targets, and source/exclusion
  accounting
- projection record/digest model, projection compilation triggers, and
  digest-first retrieval
- retrieval telemetry and evaluation metrics
- OpenClaw ContextEngine `assemble` as the primary integration point with a
  labeled fallback only where lifecycle evidence requires it
- phased rollout: canonical retrieval, projection digests, graph retrieval,
  GBrain-style knowledge layer, then closed-loop optimization

Provided source references from the research packet:

- <https://github.com/garrytan/gbrain/blob/master/docs/guides/brain-vs-memory.md>
- <https://github.com/garrytan/gbrain>
- <https://github.com/garrytan/gbrain/blob/master/README.md>
- <https://docs.openclaw.ai/concepts/context-engine>
- <https://docs.openclaw.ai/plugins/memory-wiki>
- <https://github.com/openclaw/openclaw/issues/54510>

## Related specs

- [Retrieval And Context Injection](/projects/model-memory/specs/retrieval-context-injection)
- [Runtime Read Models And Artifacts](/projects/model-memory/specs/runtime-read-models-and-artifacts)
- [Workspace Projections And Bootstrap Files](/projects/model-memory/specs/workspace-projections-bootstrap-files)
- [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
- [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)
- [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)

## Provider And Cache Preflight

Retrieval/capture providers must be preflighted against the actual structured
contracts they will execute, not only a generic JSON-object health check.

Contract preflight records should include:

- contract name/version
- schema name/version
- requested model/provider
- resolved model/provider
- strict-schema status
- OpenRouter `require_parameters` status when required
- latency
- failure class

Prompt-cache telemetry is operational only. It may record prompt-cache key,
prefix hash, schema hash, prompt tokens, cached tokens, output tokens, latency,
model, provider, and resolved model. It must not record raw prompt text or
source/window text.
