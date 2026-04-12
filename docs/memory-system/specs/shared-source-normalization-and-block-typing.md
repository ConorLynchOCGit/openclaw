# Shared Source Normalization And Block Typing

## Purpose

Capture the next architecture step after the current heuristic detector
hardening.

The current system is materially better than the earlier per-path or
per-sentence detector shape:

- document ingestion and ordinary-turn capture now share the resolver family
- recurring-procedure detection is materially stronger
- contextual scope recovery exists in both lanes

That is real progress, but it is still an intermediate architecture.

The remaining problem is upstream of the resolver family:

- document ingestion and ordinary-turn capture still normalize source material
  differently
- titled lists, heading scope, and contextual scope inheritance are still
  assembled differently between the two lanes
- the same semantic resolver can therefore succeed in one lane and fail in the
  other

This spec defines the next shared architecture layer:

- one normalization stage ahead of the resolvers
- one block-typing stage ahead of the resolvers
- lane-specific orchestration only after those shared stages
- a source-shaping substrate that can support either deterministic or
  model-driven semantic interpretation

The model-first interpretation variant now has its own companion spec in
`/memory-system/specs/model-driven-semantic-interpretation`.

## Problem Statement

The current detector quality is no longer the main ambiguity.

The current ambiguity is architectural:

- source segmentation still diverges too early
- structured lists and titled blocks are not normalized through one contract
- contextual scope is still represented differently between document and turn
  capture
- provenance is rich in document ingestion and thinner in ordinary-turn capture
- the resolver family therefore receives semantically similar inputs in
  inconsistent shapes

That means the system still depends too much on local heuristics in the caller
before the canonical family resolvers get a chance to work.

This is especially visible for the four canonical durable-memory classes:

1. stable user preferences
2. durable operator corrections
3. reusable procedures with clear success/failure shapes
4. recurring project/workflow facts that matter later

If normalization stays split, the same class can be overcaptured in one lane,
undercaptured in another, or only work when the sentence restates its own scope
explicitly.

## Goals

- create one shared normalization pipeline before family resolution
- create one shared candidate block-typing model before family resolution
- keep the existing resolver family as the canonical classification seam
- let document ingestion and ordinary-turn capture differ only where the
  orchestration genuinely differs
- produce one normalized source contract that can feed stronger semantic
  interpretation later without each lane inventing its own pre-shaping logic

## Non-Goals

- replacing the current family resolvers in this tranche
- redesigning the canonical DB schema in this tranche
- widening into bulk ingestion rollout, soak execution, or new memory classes
- treating every reference sentence as memory-worthy routing guidance

This spec intentionally does not decide whether the semantic interpretation
layer above normalized blocks is heuristic, model-assisted, or model-first.
That design choice is captured separately in
`/memory-system/specs/model-driven-semantic-interpretation`.

## Proposed Architecture

### 1. Source Normalization

Inputs can come from either:

- transcript text
- document text

The normalization output should be a shared block stream with explicit context.

Each normalized block should carry:

- block text
- title or heading context
- list structure
- parent scope
- provenance region
- explicit versus contextual scope markers
- source kind metadata

The key rule is that both lanes must produce the same conceptual block shape
before semantic resolution.

### 2. Candidate Block Typing

After normalization, a shared typing stage should classify each block as one of:

- `response_style_candidate`
- `project_fact_candidate`
- `procedure_candidate`
- `workflow_routing_candidate`
- `ignore`

This stage is intentionally earlier than full family resolution.

Its job is to answer:

- what kind of durable statement this block appears to contain
- whether the block should be suppressed before expensive family resolution
- whether a structured block should stay whole instead of being flattened into
  sentence-sized fragments

### 3. Shared Family Resolvers

The current resolver family remains the canonical classification seam for the
current implementation path.

That means:

- response-style resolution remains where response-style meaning is finalized
- project-fact and project-rule resolution remain where project semantics are
  finalized
- recurring-procedure resolution remains where named multi-step procedures are
  finalized
- workflow/routing resolution remains where workflow-guidance semantics are
  finalized

The new shared normalization and typing stages feed those resolvers a more
truthful input shape. They do not replace the resolvers.

If the lane later moves to model-first semantic interpretation, the same
normalized blocks and contextual scope contracts still remain the upstream
source-of-truth input shape.

### 4. Lane-Specific Orchestration

Only after shared normalization and shared block typing should the lanes differ.

Document ingestion remains responsible for:

- bulk planning
- document-level provenance
- profile-driven source posture
- import planning and reporting

Ordinary-turn capture remains responsible for:

- review mode
- submission cadence
- context envelope assembly
- immediate versus deferred posture

The architecture target is:

- same normalization
- same block typing
- same resolver family
- different orchestration only at the edges

## Data Contracts

The exact code signatures can change during implementation, but the next tranche
should introduce practical contracts close to this shape:

```ts
type NormalizedMemorySource = {
  kind: "document" | "transcript";
  sourceId: string;
  path?: string;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  text: string;
};

type MemoryProvenanceRegion = {
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
  messageId?: string;
  turnIndex?: number;
};

type MemoryScopeEnvelope = {
  projectScope?: string;
  workflowScope?: string;
  parentHeadingPath: string[];
  parentMessageKinds: Array<"system" | "user" | "assistant" | "tool">;
  explicitScopeMarkers: string[];
  contextualScopeMarkers: string[];
};

type NormalizedMemoryBlock = {
  id: string;
  source: NormalizedMemorySource;
  title?: string;
  headingPath: string[];
  listKind: "none" | "ordered" | "unordered" | "checklist";
  blockText: string;
  blockLines: string[];
  structuredChildren: string[];
  scope: MemoryScopeEnvelope;
  provenance: MemoryProvenanceRegion;
};

type MemoryBlockType =
  | "response_style_candidate"
  | "project_fact_candidate"
  | "procedure_candidate"
  | "workflow_routing_candidate"
  | "ignore";

type CandidateBlockTypingDecision = {
  type: MemoryBlockType;
  why: string[];
  confidence: "strong" | "medium" | "weak";
};
```

These contracts matter because they make it explicit where:

- structure gets preserved
- contextual scope gets inherited
- provenance stays attached
- early ignore decisions are made

## Canonical-Class Implications

### Stable User Preferences

Shared normalization should let both lanes preserve:

- terse correction replies
- heading-grouped preference blocks
- list-based response defaults

without requiring every line to restate “for future replies” or equivalent
scope.

### Durable Operator Corrections

Shared scope inheritance should let both lanes recognize:

- reply-form corrections
- system-response-qualified corrections
- workflow-lane corrections

as durable operator guidance instead of under-scoped fragments.

### Reusable Procedures

Shared block typing should preserve:

- titled ordered lists
- named checklist blocks
- gate sequences
- recurring success/failure instructions

as procedure candidates before sentence flattening destroys the procedure
boundary.

### Recurring Project Or Workflow Facts

Shared normalization should let both lanes carry:

- active project scope
- document heading scope
- reply-context scope
- environment or branch facts

so the resolvers can classify durable facts even when the current sentence is
short and contextual.

## Why Shared Normalization Matters

Without a shared normalization stage:

- document ingestion has to keep inventing structure-aware patches
- ordinary-turn capture has to keep inventing context-aware patches
- benchmark wins in one lane do not guarantee wins in the other
- performance work remains fragmented because every lane keeps doing its own
  pre-resolution heuristics

With a shared normalization stage:

- titled-list handling becomes one implementation concern
- contextual scope inheritance becomes one implementation concern
- provenance assembly becomes one implementation concern
- cross-lane benchmarks become meaningful because both paths feed the same
  semantic resolver shape

## Migration Plan

1. Extract shared normalization primitives for headings, list structure, parent
   scope, and provenance.
2. Make document ingestion consume those primitives without changing its bulk
   planning contract.
3. Make ordinary-turn capture consume the same primitives without changing its
   review and submission posture.
4. Introduce one shared candidate block-typing layer ahead of the resolver
   family.
5. Keep the current resolver family in place while both lanes migrate.
6. Add cross-lane benchmarks that use equivalent source material in document and
   transcript form.
7. Remove obsolete lane-specific segmentation and titled-block helpers once both
   lanes are on the shared path.

If the lane later adopts the model-first design, that cutover should happen
after steps 1-3 have made source normalization trustworthy across both lanes.

## Open Questions And Risks

- how rich the first normalized block model needs to be before it becomes
  overbuilt
- where contextual scope inheritance should stop so the system does not smear
  scope across unrelated text
- whether `reference_routing` remains a narrow subtype or later becomes part of
  a broader workflow/routing family contract
- how aggressively structured child lines should collapse into one procedure
  block
- how to preserve provenance fidelity when the turn lane uses parent messages as
  context rather than as direct candidate text
- how to keep the shared normalization path cheap enough for ordinary-turn
  capture

## Recommended Next Implementation Tranche

The next implementation pass for this spec should run in this order:

1. introduce `NormalizedMemorySource`, `NormalizedMemoryBlock`,
   `MemoryScopeEnvelope`, and `MemoryProvenanceRegion`
2. extract shared heading/list/scope normalization helpers out of document
   ingestion
3. extract shared turn-context normalization helpers out of ordinary-turn
   capture
4. add a shared block-typing stage that routes blocks to the existing resolver
   family
5. migrate recurring-procedure handling first, because it benefits most from
   preserving titled structured blocks
6. add cross-lane expected-vs-actual benchmarks for:
   - a titled procedure block
   - a terse scoped correction
   - a contextual project fact
   - a routing/reference instruction that should remain narrow
7. delete the lane-local segmentation helpers made obsolete by the shared path

## Implementation Rule

Do not treat the current heuristic hardening as the final generic semantic
architecture.

The current state is a stronger bridge.
The target state is a shared normalization and block-typing model that feeds
the same canonical resolver family across both document and transcript capture.
