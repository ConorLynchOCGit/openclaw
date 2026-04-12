# Model-Driven Semantic Interpretation

## Purpose

Define the architecture variant where semantic interpretation is model-driven
as the first and only semantic pass.

This spec exists because the current detector family is materially better than
the earlier keyword-heavy shape, but still not at the target bar for strong
generic semantic recognition across the four canonical durable-memory classes.

The problem is no longer just “some heuristics are weak.” The deeper problem is
that heuristic semantic interpretation still tends to become:

- brittle around paraphrase and implied scope
- structurally sprawling as more edge cases get encoded
- uneven across document ingestion versus ordinary-turn capture
- hard to generalize without accreting more local rule forests

If the target architecture is strong generic semantic recognition across all
four classes, heuristics alone are probably not the final answer.

This spec defines the version of the architecture that removes heuristics as
the first-pass semantic filter and instead makes the model the first and only
semantic interpretation pass.

## Problem Statement

The current system still depends on deterministic semantic detectors to decide
what kind of durable memory a block contains.

That creates recurring pressure:

- each new paraphrase family wants another rule, pattern, or branch
- list-shaped and heading-scoped material often needs structure-specific
  heuristics to avoid undercapture
- reply-form conversational corrections still need carefully staged context
  recovery before the detector can recognize meaning
- document and transcript lanes can converge on the same resolver family yet
  still diverge semantically because their upstream assembly differs

Even when generalized well, heuristic semantic interpretation remains a local
approximation of meaning rather than a direct semantic reading of the block in
context.

If that remains the first-pass semantic engine, the system risks:

- ongoing rule sprawl
- brittle class coverage
- inconsistent behavior across lanes
- misleading soak conclusions because the DB corpus was captured through a
  detector stack that is still weak on important classes

## Goals

- make semantic interpretation model-driven as the first and only semantic pass
- feed that model one shared normalized source contract from both documents and
  transcripts
- classify and shape candidates across the four canonical classes from the same
  model-driven interpretation path
- keep deterministic validation, governance, provenance, and duplicate control
  after interpretation
- let document ingestion and ordinary-turn capture differ only in orchestration
  concerns, not in semantic interpretation logic

## Non-Goals

- redesigning the canonical DB schema in this tranche
- letting the model write directly into durable storage without deterministic
  validation
- replacing provenance, review, approval, or supersession governance with free
  text model output
- widening into broad bulk ingestion rollout or soak execution in this spec
- keeping heuristic semantic detectors as the normal first-pass path

## Why Model-Driven First Pass

The model should be the first semantic reader because that is where meaning
actually lives:

- implied scope
- paraphrase
- contrast between durable guidance and filler
- section-level procedure meaning
- routing statements that matter later but are not procedures
- terse correction replies that only make sense with parent context

Trying to recover all of that through deterministic semantic detectors creates
ongoing cost in both code size and fragility.

The deterministic layer should still exist, but after model interpretation:

- schema validation
- provenance checks
- scope consistency checks
- duplicate suppression
- confidence thresholds
- safe/noisy capture policy

That means the model owns semantic understanding, while deterministic code owns
governance and safety.

## Proposed Architecture

### 1. Shared Source Normalization

Both lanes must first produce the same normalized source contract described in
`/memory-system/specs/shared-source-normalization-and-block-typing`.

Inputs can come from:

- transcript text
- document text

Normalized output should preserve:

- heading and title context
- block boundaries
- ordered or checklist structure
- parent scope
- provenance region
- explicit versus contextual scope markers

This spec assumes that normalized blocks already exist before the model sees
them.

### 2. Model-Driven Semantic Interpretation

The model receives normalized blocks plus their contextual envelope and returns
one semantic interpretation decision per block or structured block group.

The model is responsible for deciding whether the block is:

- `stable_user_preference`
- `durable_operator_correction`
- `reusable_procedure`
- `recurring_project_or_workflow_fact`
- `ignore`

For non-ignored blocks, the model should also return:

- canonical class
- canonical statement or structured procedure
- confidence
- scope interpretation
- why the content is durable rather than ephemeral
- why the content is not merely reference-only text
- which provenance region(s) support the interpretation

The model should be able to interpret:

- reply-form corrections that inherit context from prior messages
- procedure blocks whose meaning spans a titled list instead of one sentence
- project facts that are only scoped by headings or nearby text
- routing guidance that points to companion docs in a durable, reusable way

### 3. Deterministic Validation And Governance

After model interpretation, deterministic code validates and gates the output.

That layer is responsible for:

- schema validation
- provenance completeness
- allowed class validation
- minimum confidence thresholds
- scope sanity checks
- duplicate and overlap suppression
- supersession checks
- routing noisy or borderline candidates into review instead of auto-approval

This layer does not reinterpret semantics. It validates whether the
model-produced semantic result is admissible.

### 4. Lane-Specific Orchestration

After interpretation and validation, the lanes may differ where they genuinely
should differ.

Document ingestion remains responsible for:

- source discovery
- bulk planning
- import posture
- document provenance reporting
- dry-run versus submission behavior

Ordinary-turn capture remains responsible for:

- context envelope assembly
- review mode
- submission cadence
- immediate versus deferred posture
- turn-local suppression and operator burden controls

The semantic interpretation path itself should stay shared.

## Data Contracts

The exact implementation types can evolve, but the architecture should be close
to this shape:

```ts
type ModelSemanticInterpretationClass =
  | "stable_user_preference"
  | "durable_operator_correction"
  | "reusable_procedure"
  | "recurring_project_or_workflow_fact"
  | "ignore";

type ModelSemanticInterpretationRequest = {
  source: NormalizedMemorySource;
  blocks: NormalizedMemoryBlock[];
  scope: MemoryScopeEnvelope;
  lane: "document_ingestion" | "ordinary_turn_capture";
};

type ModelSemanticInterpretationDecision = {
  blockIds: string[];
  class: ModelSemanticInterpretationClass;
  confidence: "strong" | "medium" | "weak";
  canonicalStatement?: string;
  canonicalProcedure?: {
    name: string;
    steps: string[];
    successShape?: string;
    failureShape?: string;
  };
  scopeInterpretation: {
    projectId?: string;
    workflowScope?: string;
    userScope?: string;
    contextualDependencies: string[];
  };
  durabilityRationale: string[];
  ignoreRationale?: string[];
  provenance: MemoryProvenanceRegion[];
};

type ModelSemanticInterpretationResult = {
  decisions: ModelSemanticInterpretationDecision[];
  modelId: string;
  promptVersion: string;
};
```

The important constraint is not the exact field names. It is the boundary:

- normalized input before semantics
- model-driven semantics
- deterministic validation after semantics

## Canonical-Class Implications

### 1. Stable User Preferences

A model-driven interpreter should better recognize:

- terse response-style corrections
- preference refinements stated in reply form
- grouped preference defaults expressed across several lines

without needing each sentence to carry an explicit “future preference” marker.

### 2. Durable Operator Corrections

A model-driven interpreter should better distinguish:

- durable corrections to repeated process behavior
- one-off situational corrections
- corrections whose meaning depends on the parent system or tool context

This is especially important for ordinary-turn capture.

### 3. Reusable Procedures

A model-driven interpreter should better treat titled ordered sections and
checklists as one reusable procedure with structured steps instead of as a pile
of single-sentence detector hits.

### 4. Recurring Project Or Workflow Facts

A model-driven interpreter should better recover:

- heading-scoped project facts
- recurring workflow facts
- companion-doc routing guidance with real downstream value

without demanding that every line restate the project or workflow scope.

## Prompting And Output Discipline

The model contract must be narrow and auditable.

The prompt should instruct the model to:

- classify only durable reusable memory
- ignore filler, narrative glue, historical one-offs, and low-signal reference
  text
- prefer omission over speculative capture
- preserve scope and provenance
- return compact canonical statements rather than paraphrase essays
- collapse paraphrase duplicates when one stronger canonical form exists

The output must be constrained by schema and rejected when it is malformed or
too weakly grounded.

## Evaluation Requirements

This architecture is only valid if it is benchmarked against explicit
expected-versus-actual evaluation across both lanes.

Required benchmark posture:

- real documents, not only synthetic fixtures
- ordinary-turn reply/correction cases, not only document ingestion
- expected-memory judgments written before trusting model output
- failure categories that can actually fail the system:
  - undercapture
  - overcapture
  - wrong class
  - weak canonical wording
  - duplicate clutter
  - provenance weakness

The model-first architecture should not be adopted because it “sounds smarter.”
It should be adopted only if it materially beats the heuristic path on honest
benchmarks across the four canonical classes.

## Migration Plan

1. finish the shared normalization and contextual block model
2. define the model request and response schema
3. build a benchmark harness that compares heuristic and model-driven
   interpretation against the same normalized blocks
4. validate the model path first on document ingestion dry-runs
5. validate the same model path on ordinary-turn capture benchmarks
6. introduce deterministic post-model validation and review gating
7. cut document ingestion over to the model-first semantic path
8. cut ordinary-turn capture over to the same model-first semantic path
9. remove the heuristic semantic detector path from normal runtime use
10. keep only deterministic validation, governance, and diagnostics around the
    model output

## Open Questions And Risks

- what latency and cost envelope is acceptable for ordinary-turn capture
- whether one model prompt can serve both lanes or whether lane-specific prompt
  wrappers are needed above the same schema
- how much structured context can be passed before provenance fidelity degrades
- how confidence should be calibrated for different classes
- how to keep canonical wording stable enough for supersession and duplicate
  logic
- what fallback posture should exist if the model is unavailable
- how much review burden borderline model output creates

## Recommended Next Implementation Sequence

1. land the shared normalization tranche first so both lanes feed the same
   block model
2. build the model interpretation contract and benchmark harness side-by-side
3. run the existing real-document and implied-scope conversational benchmarks
   against the model path
4. compare model-first output against the current heuristic path by class, not
   just by total count
5. only cut over normal runtime paths if the model materially improves class
   coverage, phrasing quality, and cross-lane consistency

## Implementation Rule

Do not implement this by sprinkling isolated model calls into existing
lane-local detector code.

If this architecture is pursued, the model call must sit behind one shared
interpretation boundary fed by one shared normalized block contract. Otherwise
the system will pay model cost without actually removing the duplicated
semantic-shaping problem.
