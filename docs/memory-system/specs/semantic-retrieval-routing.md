# Semantic Retrieval Routing

## Purpose / user problem

The memory system now uses bounded semantic detection for capture, but later-turn
retrieval into working context is still mostly driven by typed hybrid text
search.

That is correct for some memory families and incomplete for others.

This spec defines where semantic retrieval is:

- useful
- safe
- premature
- or actively the wrong default

The goal is to avoid two bad outcomes:

- leaving concept-heavy families stuck on brittle lexical recall
- overcorrecting into a generic embedding-first memory retriever

## Current live posture

Today the live working-context default is:

- `memory_object_search_hybrid` as the main bounded retrieval tool
- family-specific prompt guidance telling the model when to use hybrid search
- family-specific query-hint inference inside
  `extensions/memory-middleware/src/db/queries.ts`

The repo also already has a narrow semantic retrieval prototype:

- `memory_object_search_semantic`
- caller-supplied query embedding only
- explicit `embeddingModel` and `embeddingVersion`
- approved memory only by default
- validated procedures only when explicitly requested
- no candidate semantic retrieval
- no generic embedding-generation platform

The first live family-aware slice now also exists:

- nearby recurring-procedure asks can use semantic fallback through
  `memory_object_search_hybrid`
- clear checklist asks still stay hybrid-first
- validated procedure source memory objects can receive bounded semantic
  embeddings when that family validates or equivalent promotion completes
- validated procedures remain hidden unless the scope explicitly allows them

The second live family-aware slice now also exists:

- approved environment-constraint guidance can use semantic fallback through
  `memory_object_search_hybrid`
- strong typed environment-constraint matches still stay hybrid-first
- only approved project memory rows with the supported environment-constraint
  lesson keys are eligible
- approved environment-constraint source memory objects can receive bounded
  semantic embeddings when that family promotes or backfills them

This means semantic retrieval now exists both as a substrate and as a narrow
normal working-context strategy for one bounded family.

## Non-goals

- replacing hybrid retrieval with embedding-only search
- broad generic “semantic memory search everything” behavior
- candidate semantic retrieval
- semantic retrieval over internal governance lineage surfaces by default
- a generic embedding-generation platform
- changing capture semantics or candidate lifecycle rules

## Core principles

### 1. Hybrid stays the default baseline

Working-context retrieval should remain:

- typed
- scoped
- policy-aware
- explainable

Semantic retrieval is an additive ranking tool, not the new source of truth.

### 2. Family shape determines retrieval shape

Not every family benefits from semantic retrieval equally.

Some families are mostly:

- exact identifiers
- explicit field lookups
- stable canonical labels

Those should remain hybrid-first or hybrid-only.

Other families are more:

- concept-driven
- paraphrase-heavy
- nearby-intent dependent

Those are the right candidates for semantic reranking or semantic fallback.

### 3. Exact signals outrank pure conceptual similarity

When hybrid and semantic disagree, exact bounded signals should usually win:

- field key
- lesson key
- procedure key
- approved review state
- project scope
- validated lineage

Semantic retrieval may lift relevant results inside an eligible family, but it
must not routinely outrank a clearly better typed exact match.

### 4. Semantic retrieval should start as family-aware reranking

The safest initial posture is:

1. bounded kind and scope selection
2. hybrid retrieval first
3. semantic retrieval only for family-eligible cases
4. merge or rerank results under explicit family rules

This is safer than switching the default working-context path to the standalone
semantic tool.

## Family map

| Family                                       | Current working-context retrieval                    | Semantic retrieval value                             | Safe posture                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Response-style memory                        | Hybrid with response-style template boosts           | Low for direct asks, medium for indirect paraphrases | Keep hybrid-first. Do not make semantic retrieval the default. Consider semantic rerank later only for indirect style asks after a bounded query canonicalizer exists. |
| Explicit named project facts                 | Hybrid with field-key boosts                         | Low                                                  | Keep hybrid-only for explicit fields like default branch, package manager, and environment name.                                                                       |
| Broader project memory expansion             | Not live yet                                         | Medium                                               | Use semantic retrieval only for later narrative or summary-style project artifacts, not for exact fields.                                                              |
| Recurring procedures on clear checklist asks | Hybrid with procedure-key boosts                     | Low to medium                                        | Keep hybrid-first and direct-use on clear asks.                                                                                                                        |
| Recurring procedures on nearby asks          | Hybrid with procedure-key inference                  | Medium                                               | Early safe semantic candidate. Add semantic rerank only for nearby procedural asks, while preserving suggestion-first behavior.                                        |
| Workflow-improvement tool gotchas            | Hybrid with lesson-key boosts                        | Medium                                               | Keep hybrid-first, with semantic rerank allowed when the ask is conceptually adjacent and lexical overlap is weak.                                                     |
| Environment constraints                      | Hybrid with lesson-key boosts plus semantic fallback | High                                                 | Live safe semantic family under approved-only project scope. Guidance-only posture remains and strong typed lesson matches still outrank semantic similarity.          |
| API failure workaround memory                | Not live yet                                         | High                                                 | Strong semantic-retrieval family once workaround artifacts exist. Error wording and user asks will drift heavily.                                                      |
| Broader workflow-improvement memory          | Not live yet                                         | High                                                 | Good semantic family after canonical lesson classes exist. Guidance-only posture must remain.                                                                          |
| Unmet-need / recommendation-only planning    | Not live yet                                         | Medium to high                                       | Semantic retrieval is useful only after typed unmet-need artifacts exist. Keep recommendation-only posture and do not spill into execution.                            |
| Governance manual/internal families          | Exact lineage and internal review surfaces           | Low and usually unsafe                               | Keep exact or hybrid typed retrieval only. Do not route these families through default semantic retrieval.                                                             |

## Recommended rollout order

### Phase 1: keep current live families hybrid-first

Do not change the default working-context posture yet for:

- response-style
- explicit named project facts
- clear recurring checklist asks
- current tool-gotcha lessons

These families already benefit from:

- exact bounded metadata
- query-hint inference
- FTS and trigram tolerance

### Phase 2: first family-aware semantic rerank targets

The first safe semantic-retrieval routing targets are:

- nearby recurring-procedure asks
- approved API workaround memory once that family exists

One of these is now live:

- approved environment-constraint guidance

Why these come first:

- users phrase them in conceptually varied ways
- hybrid lexical hits are still directionally useful
- the behavior posture is bounded and suggestion- or guidance-only

### Phase 3: later conceptual families

After the first semantic-routing slice is stable, expand to:

- broader workflow-improvement memory
- bounded narrative project memory
- unmet-need recommendation artifacts

These families should wait because:

- they need stronger canonical object shapes first
- semantic retrieval without that structure risks surfacing vague adjacent notes

## Working-context routing rules

### Query-family routing

The runtime or prompting layer should keep using bounded kind and scope
selection first:

- `feedback` for response-style
- `project` for project facts and workflow guidance
- `procedure` for validated procedures

Semantic retrieval should only be considered when:

- the family is marked semantic-eligible
- the query is conceptual, indirect, or nearby rather than a clear exact ask
- approved-only or explicit validated-procedure scope is acceptable
- embeddings exist for the target family and model/version

### Retrieval fusion rules

Safe fusion order:

1. exact typed matches
2. family-specific hybrid boosts
3. semantic rerank inside the already eligible family set
4. updated-at tiebreaking

Semantic retrieval must not:

- override project scoping
- surface candidates by default
- collapse procedure suggestion-first into direct-use
- turn workflow guidance into automatic execution

### Matched-field observability

Merged retrieval results should preserve why an item surfaced, for example:

- `auto_capture_template_match`
- `auto_capture_field_match`
- `auto_capture_lesson_match`
- `procedure_key_match`
- `fts_search_document`
- `trigram_similarity`
- `semantic_embedding`
- future family-aware markers such as `semantic_rerank`

## Family-specific rules

### Response-style

Use hybrid retrieval as the normal path.

Reason:

- supported subjects are already tightly bounded
- query-hint inference is strong
- false positives would directly shape how replies are written

Semantic retrieval is only worth considering later for indirect asks like:

- “talk more like a normal person”
- “less stiff”

Even then, it should be a rerank aid, not a new default.

### Explicit project facts

Keep explicit fields hybrid-only.

Reason:

- branch names
- package managers
- environment names

are not good first semantic problems.

### Recurring procedures

Split the family:

- clear checklist asks stay hybrid-first
- nearby asks are semantic-eligible

Semantic retrieval is useful here for conceptually similar phrasing such as:

- “how should we deploy this safely”
- “what do you recommend before release”

but the result must still respect:

- validated-only posture
- suggestion-first for nearby asks
- direct-use only for clear asks

Current live adoption:

- nearby recurring-procedure asks are now live as the first semantic fallback
  family
- the live path is hybrid-first plus procedure-only semantic fallback
- exact typed procedure matches still win over semantic similarity
- validated procedure source memory objects can receive bounded semantic
  embeddings for this family only

### Workflow-improvement and environment constraints

These are strong semantic families because user asks drift more than the stored
lesson labels.

Examples:

- users may not say `scripts/committer`
- users may describe `python_command_unavailable` in several different ways
- later API workaround memory will vary widely in wording

Safe posture:

- approved-only
- project-scoped when available
- guidance-only
- hybrid exact lesson matches still outrank pure semantic similarity

Current live adoption for environment constraints:

- approved environment-constraint guidance is now live as the second semantic
  fallback family
- live fallback is limited to the supported approved lesson keys:
  - `python_command_unavailable`
  - `gateway_tools_invoke_forbidden`
- the live path is hybrid-first plus approved-only semantic fallback
- strong typed lesson matches such as `auto_capture_lesson_match`,
  `title_exact`, `content_exact`, `title_prefix`, and `content_prefix` still
  outrank semantic similarity
- workflow-improvement tool gotchas still remain hybrid-first for now

### Unmet-need planning

Semantic retrieval is reasonable only after typed unmet-need artifacts exist.

Do not semantic-search:

- freeform complaints
- raw governance rows
- vague desire statements

Do semantic-search only:

- approved or explicitly reviewable unmet-need artifacts with canonical fields

## Prerequisites for live semantic-routing adoption

- approved memory remains the default visible surface
- embeddings exist for the target family
- embedding model/version are pinned
- family-scoped proof queries exist
- semantic routing preserves matched-field observability
- project and scope filters still apply before reranking

## Proof requirements

For every family that adopts semantic retrieval in normal working-context use,
prove:

1. a paraphrased or nearby ask that hybrid alone ranks weakly is improved
2. a clear exact ask still keeps the exact typed result on top
3. semantic retrieval does not surface candidate memory by default
4. project-local results still outrank adjacent global memory
5. suggestion-first or guidance-only posture is preserved where required
6. false-positive adjacent memories do not start winning because they are only
   conceptually similar

## Rollout posture

- do not switch the default prompt guidance from hybrid to semantic-first
- adopt semantic retrieval family by family
- start with approved-only rerank or fallback
- keep candidate semantic retrieval disabled
- keep any embedding-generation write path family-owned and narrowly scoped

## Current live slice

The live semantic-retrieval routing slices are:

- nearby recurring-procedure asks
- approved environment-constraint guidance

Exact live routing posture:

- `memory_object_search_hybrid` remains the default retrieval entrypoint
- semantic routing is additive and family-scoped
- semantic fallback is allowed only when:
  - `scope = include_validated_procedures`
  - `kind = procedure`
  - hybrid does not already have a strong typed procedure match
- exact `procedure_key_match`, `title_exact`, and `title_prefix` still outrank
  semantic similarity
- `approved_only` scope still hides validated procedures
- semantic fallback is also allowed for approved environment constraints when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed environment-constraint match
- exact `auto_capture_lesson_match`, `title_exact`, `content_exact`,
  `title_prefix`, and `content_prefix` still outrank semantic similarity for
  environment constraints
- candidate semantic retrieval remains disabled

## Recommended next implementation slice

The next recommended implementation slice for normal working-context semantic
retrieval is:

- approved workflow-improvement tool-gotcha guidance
- or approved API workaround guidance once that family exists

That next slice has:

- clear user value
- low automation risk
- bounded family registries
- strong explainability

## Open questions

- which embedding model should become the first normal query-embedding model for
  working-context retrieval?
- should family-aware semantic routing live as prompt guidance over the existing
  tools first, or as a new merged runtime search helper later?
- when broader project memory lands, what exact artifact subtypes should be
  semantic-eligible versus hybrid-only?
