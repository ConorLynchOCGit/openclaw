# Canonical Four-Kind Memory Migration

## Purpose

This spec replaces the implicit “keep adding bounded families forever” posture
with an explicit canonical target:

- `User`
- `Feedback`
- `Project`
- `Reference`

These 4 kinds are the target durable storage model.

The current family-heavy system remains real and live, but it is now
transitional. Existing family-specific behavior should survive as metadata,
derived views, and compatibility adapters instead of permanent top-level memory
kinds.

## Implementation Status

The canonical-core tranche is now landed in repo code.

Implemented now:

- canonical memory record/envelope types on the public plugin-SDK surface
- canonical facet/metadata contracts
- family-policy compatibility builders
- ingestion-side compatibility adapters that can emit canonical-core-compatible
  records from current resolved family outputs
- canonical ingestion candidate contracts on the public plugin-SDK surface
- ordinary-turn resolver-backed capture paths emitting canonical candidates
- canonical retrieval-plan contracts on the public plugin-SDK surface
- retrieval hint/control adapters that populate canonical retrieval plans while
  preserving current behavior

Still not implemented:

- planner/routing migration onto canonical records
- learned-guidance and hybrid retrieval cutover onto canonical retrieval plans
- migration of the remaining family-native capture and retrieval seams
- retirement of the current family-heavy runtime flow

## Why This Migration Is Mandatory

The repo has now proven:

- live Main routing for workflow-preflight guidance
- live hybrid retrieval and live learned-guidance execution
- trustworthy routing observability for those paths
- bounded multi-memory capture within the current system

The remaining scaling problem is not “one more family gap.” It is that memory
meaning is still spread across:

- family lists
- lesson-key switches
- template switches
- retrieval hint tables
- lifecycle-specific branches
- capture-class-specific metadata builders

That shape does not scale cleanly to broader capture, broader retrieval, or a
smaller set of canonical memory concepts.

## Non-Goals

This spec does not authorize:

- deleting the current compatibility system in one batch
- a big-bang migration
- reckless expansion of memory authority
- replacing bounded safety or approval gates with vague semantic behavior

## Canonical Storage Model

Each durable memory record should converge on a shared canonical envelope.

Required core fields:

- `kind`
  - `user`
  - `feedback`
  - `project`
  - `reference`
- `subject`
- `statement`
- `scope`
  - `global`
  - `project`
  - `mixed`
- `projectId?`
- `confidence`
- `validationStatus`
- `stability`
- `recency`
- `provenance`
- `tags`
- `facets`
- `applicability`

Recommended facets:

- `interactionSurface`
- `behaviorMode`
- `workflowMode`
- `resourceType`
- `correctionMode`
- `procedureShape`
- `guidancePattern`
- `toolKey`
- `lessonKey`
- `subjectKey`
- `clusterKey`
- `rankingHints`

Recommended provenance fields:

- `captureSeam`
- `captureProfile`
- `sourceAgent`
- `sourceSession`
- `sourceEvent`
- `reviewState`
- `reviewHistory`

Recommended temporal fields:

- `observedAt`
- `confirmedAt`
- `lastAppliedAt`
- `expiresAt?`

## Canonical Kind Definitions

### User

Stores durable user-specific information such as:

- preferences
- role
- communication style
- stable constraints
- goals
- habits

Likely facets:

- `preference`
- `response_style`
- `constraint`
- `goal`
- `role`

### Feedback

Stores validated approaches, corrections, do/don’t rules, and learned
workflow behavior.

Likely facets:

- `correction`
- `validated_approach`
- `procedure`
- `workflow_guidance`
- `rule`
- `anti_pattern`

### Project

Stores ongoing active context for a project such as:

- decisions
- deadlines
- active work
- current project facts
- missing capabilities
- project-scoped state

Likely facets:

- `decision`
- `fact`
- `deadline`
- `active_context`
- `open_need`
- `project_reference`

### Reference

Stores stable external lookup-oriented material such as:

- URLs
- commands
- API references
- docs pointers
- authority-ranked sources

Likely facets:

- `url`
- `command`
- `api_reference`
- `documentation`
- `external_authority`

## Current Family To Canonical Mapping

### `response_style`

- Canonical kind: `User`
- Why: these are user-owned preferences/requirements
- Required surviving facets:
  - `response_style`
  - `format`
  - `language`
  - `conciseness`

### `project_fact`

- Canonical kind: `Project`
- Special case:
  - facts whose primary role is a stable external pointer should also carry a
    `reference` facet such as `url` or `docs_pointer`
- Required surviving facets:
  - `fact`
  - `field_key`
  - `project_scope`

### `recurring_procedure`

- Canonical kind: `Feedback`
- Why: validated procedures are validated approaches, not a separate memory
  ontology
- Required surviving facets:
  - `procedure`
  - `validated_approach`
  - `procedure_key`
  - `procedure_title`
  - `procedure_steps`

### `workflow_improvement`

- Canonical kind: `Feedback`
- Why: these are learned approaches, warnings, and validated workflow do/don’t
  guidance
- Required surviving facets:
  - `workflow_guidance`
  - `lesson_key`
  - `tool_key`
  - `guidance_pattern`

### `project_rule`

- Canonical kind: `Feedback`
- Project-scoped facet:
  - `project_rule`
- Why: these are project-scoped validated approaches/rules, not a separate
  storage kind

### `unmet_need`

- Canonical kind: `Project`
- Why: unmet needs are active project context about missing capability or
  missing support
- Required surviving facets:
  - `open_need`
  - `need_category`
  - `recommendation_mode`

### Phrase pattern families

- `workflow_phrase_pattern`
- `response_style_phrase_pattern`

These should not survive as top-level durable memory kinds.

They should become:

- `Reference`-like retrieval artifacts only if still needed, or
- implementation-owned induction artifacts behind canonical memories

## Derived Views And Compatibility Surfaces

The following product surfaces should become derived views instead of canonical
top-level family ownership:

- learned-guidance advisory planning
- hybrid retrieval family shaping
- procedure suggestion-first behavior
- project-rule retrieval posture
- response-style shaping
- phrase induction eligibility

### Learned-guidance

`memory_learned_guidance_plan` should become a planner over canonical memories,
primarily:

- `Feedback`
- `Project`

It should query canonical records plus facets, then decide whether to render:

- inline guidance
- conflict suppression
- no-guidance

### Hybrid retrieval

`memory_object_search_hybrid` should remain a retrieval strategy, not a memory
kind. Under the canonical model it should query:

- canonical kinds
- scopes
- facets
- validation state
- recency / stability

### Procedures

Procedures should remain behaviorally special where execution/validation is
honestly distinct, but their durable semantic meaning should live under
`Feedback` with a `procedure` facet.

## Generic Ingestion Contract

Canonical ingestion should accept one turn and emit zero to N candidate memory
records.

Input:

- raw text
- structured tool outputs when present
- attribution
- session context
- project context
- existing canonical memory policy

Output:

- canonical candidates
- candidate kind
- confidence
- validation mode
- dedupe signature
- facets
- provenance

Rules:

- one turn may yield multiple candidates
- candidates must be materially distinct
- duplicate signatures must collapse
- quality thresholds stay bounded

## Generic Retrieval Contract

Canonical retrieval should query by:

- `kind[]`
- `scope`
- `projectId?`
- `facets`
- `validationStatus`
- `stability`
- `recency`
- `query`
- `rankingIntent`

This replaces most family-specific hint routing with:

- kind filters
- facet filters
- explicit ranking intents

Examples:

- workflow advice:
  - kinds `feedback`, `project`
  - facets `workflow_guidance`, `project_rule`, `open_need`
- user-style shaping:
  - kind `user`
  - facets `response_style`
- reference lookup:
  - kind `reference`
  - facets `docs_pointer`, `command`, `api_reference`

## Generic Ranking Contract

Ranking should combine:

- lexical relevance
- semantic relevance
- scope match
- subject match
- facet match
- validation strength
- provenance trust
- recency
- stability
- contradiction suppression

This should replace:

- family-specific feature-weight tables as the primary substrate
- lesson-key-to-fallback-family switches
- query-hint tables as the main meaning carrier

## Multi-Memory Capture In The Canonical Model

The newly landed bounded multi-memory capture behavior should become the first
compatibility proof point for canonical ingestion.

Canonical ingestion should keep these rules:

- distinctness is key-based and subject/facet-aware
- near-duplicates collapse
- weak candidates stay out
- per-turn capture remains capped

The canonical model should eventually make multi-capture easier because the
capture path will emit canonical records directly instead of routing through
family-specific handlers first.

## Migration Program

### Phase O1 — canonical envelope and adapters

Add a canonical record envelope and adapter helpers without deleting current
family-specific writes.

### Phase O2 — ingestion rebasing

Replace family-owned auto-capture and tool-ingestion outputs with canonical
candidate emission plus adapters into the legacy family system.

### Phase O3 — retrieval rebasing

Move retrieval intent, ranking, and control decisions to canonical kind/facet
queries.

### Phase O4 — planner rebasing

Rebuild learned-guidance and prompt-facing application selection as planners
over canonical records.

### Phase O5 — compatibility collapse

Demote the current family-heavy branches into compatibility-only adapters, then
delete the surfaces that are no longer needed.

## Surfaces To Replace Entirely

These surfaces should be removed after canonical migration is complete:

- `extensions/memory-middleware/src/retrieval-intent.ts`
  - replace with generic kind/facet/ranking-intent inference
- `extensions/memory-middleware/src/retrieval-control-plane.ts`
  - replace with canonical retrieval planning
- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
  - replace bounded prompt-family routing with canonical routing intents
- family-specific semantic fallback selection switches in
  `extensions/memory-middleware/src/semantic-retrieval-routing.ts`

## Surfaces To Adapt Temporarily

- `src/plugin-sdk/memory-family-policy.ts`
- `extensions/memory-middleware/src/tools/registry.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/write-action-stages.ts`
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

These should become compatibility layers until the canonical substrate is real.

## Semantics That Must Survive As Facets

The following must not disappear just because the top-level family count
shrinks:

- subject keys
- cluster keys
- project scope
- response-style surface
- validated-procedure structure
- tool keys
- lesson keys
- guidance patterns
- recommendation-only vs guidance-only posture
- review and approval provenance
- semantic evidence and confidence

## Rigid Surface Inventory

### Confirmed current rigid surfaces

- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
  - role: Main memory routing
  - rigidity: bounded feature/rule router
  - replacement: canonical routing intent planner
- `src/plugin-sdk/memory-family-policy.ts`
  - role: family policy control plane
  - rigidity: family enumeration plus hand-tuned policy tables
  - replacement: canonical kind/facet policy registry
- `extensions/memory-middleware/src/tools/registry.ts`
  - role: tool exposure
  - rigidity: rollout-target family/tool gating
  - replacement: canonical capability exposure policy
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
  - role: transcript capture
  - rigidity: family-owned handlers and template-first parsing
  - replacement: canonical multi-candidate ingestion engine
- `extensions/memory-middleware/src/write-action-stages.ts`
  - role: staged write orchestration
  - rigidity: first-handled-stage and kind switch
  - replacement: canonical candidate pipeline stages
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
  - role: family-specific ingestion resolution
  - rigidity: family-by-family resolver branches
  - replacement: canonical ingestion resolver plus adapters
- `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
  - role: workflow guidance semantics
  - rigidity: lesson-key and tool-key tables
  - replacement: feedback facets and derived workflow views
- `extensions/memory-middleware/src/response-style-semantic.ts`
  - role: response-style capture semantics
  - rigidity: template-bound style categories
  - replacement: user facets and canonical preference semantics
- `extensions/memory-middleware/src/retrieval-intent.ts`
  - role: query hint inference
  - rigidity: explicit query string heuristics
  - replacement: routing intent planner over kinds and facets
- `extensions/memory-middleware/src/retrieval-control-plane.ts`
  - role: retrieval shaping
  - rigidity: family-specific selection and fallback logic
  - replacement: canonical retrieval planner
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
  - role: learned-guidance planner
  - rigidity: workflow-lesson-family allowlist
  - replacement: planner over canonical `Feedback` and `Project`
- `extensions/memory-middleware/src/self-improving-candidate-capture.ts`
  - role: self-improving capture
  - rigidity: tranche-specific family gates
  - replacement: canonical feedback/project candidate intake
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
  - role: explicit submission ingress
  - rigidity: kind switches and family-aware side effects
  - replacement: canonical candidate submission contract
- `extensions/memory-middleware/src/workflow-phrase-induction.ts`
  - role: phrase induction
  - rigidity: family-bounded induction targets
  - replacement: canonical induction artifacts behind feedback/user views

### Likely additional rigid surfaces needing deeper audit

- `extensions/memory-middleware/src/project-fact-semantic.ts`
- `extensions/memory-middleware/src/recurring-procedure-semantic.ts`
- `extensions/memory-middleware/src/project-rule-semantic.ts`
- `extensions/memory-middleware/src/unmet-need-semantic.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/phrase-pattern-engine.ts`
- lifecycle files under `extensions/memory-middleware/src/*-lifecycle.ts`

These likely also need migration, but the exact keep/adapt/delete boundary
should be confirmed during Phase O implementation.

## Rollback Boundaries

The migration should stay rollbackable by preserving:

- current live tools
- current family-specific storage readers
- current approval and audit surfaces
- current transcript and tool observability

The canonical model should be introduced behind adapters first, then moved onto
the primary path only after bounded proof.
