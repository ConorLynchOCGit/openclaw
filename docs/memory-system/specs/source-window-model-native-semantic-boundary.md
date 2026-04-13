# Source-Window Model-Native Semantic Boundary

## Problem statement

The earlier model-first planner cutover was still not first-principles
model-native.

The remaining architectural problems were:

- semantic interpretation still defaulted to one normalized block at a time
- the core model contract still carried detector-era fields and canonical
  string payloads
- the validator still acted like a second semantic interpreter
- renderable strings and candidate forms were still too close to semantic
  truth
- local benchmark surfaces still leaned on scripted semantic matching instead
  of explicit replayed object outputs
- ordinary-turn fallback logic still existed outside the new planner seam

That shape was too expensive for live proof, too rigid for future semantic
growth, and too easy to misread as “model-native enough” while legacy semantic
ownership still survived in several layers.

## Goals

- make source-window interpretation the normal semantic entry boundary
- make the primary model contract object-native rather than detector-native
- keep normalization structural-only
- reduce validation to admissibility, governance, and safety
- move render/candidate derivation into an explicit downstream materializer
- split benchmark usage into:
  - cheap deterministic replay for local development
  - explicit live-proof runs for audited real-model evidence
- tighten provenance by preventing window assembly from merging across sibling
  headings
- make remaining legacy semantic fallback paths explicit quarantine surfaces

## Non-goals

- full retirement of every legacy ordinary-turn detector in this tranche
- final Pass 2 runtime cutover claims
- final Pass 3 context/prompt/cache/compaction convergence
- removing all canonical compatibility builders in this tranche

## Architecture boundary

The boundary after this tranche is:

1. normalization
   - structural only
   - emits blocks, scope envelopes, provenance, and source windows
2. semantic interpretation
   - model reads a source window
   - model returns semantic objects directly
3. validation
   - checks admissibility only
   - does not reconstruct meaning
4. materialization
   - derives candidate/retrieval/review renderings from validated objects
5. lane orchestration
   - document ingestion and ordinary-turn capture decide submission posture and
     runtime handling

## Data contracts

### Input

- `MemorySourceEnvelope`
- `NormalizedMemoryBlock`
- `NormalizedMemorySourceWindow`

### Model output

- `MemorySemanticInterpretationDecision`
  - `action: "ignore"` with confidence and rationale
  - `action: "capture"` with `objects[]`
- `MemorySemanticObject`
  - `kind`
  - `scope`
  - `durability`
  - `provenanceSpans`
  - `confidence`
  - `rationale`
  - object-specific payload

### Validation output

- `ValidatedMemorySemanticDecision`
- `ValidatedMemorySemanticObject`

### Materialization output

- `MaterializedMemorySemanticResult`
  - `action: "forget"` with response-style forget ingestion
  - `action: "capture"` with canonical downstream ingestion

## Runtime ownership

### Normalization owns

- headings
- list and checklist structure
- parent-context carriage
- provenance regions and anchors
- source-window assembly

### Interpretation owns

- deciding whether durable memory exists
- deciding which semantic object kind is present
- returning the object payload directly

### Validation owns

- schema sanity
- confidence gating
- provenance support checks
- review posture
- admissibility and governance

Validation must not decide:

- what class something “really” is
- what the canonical meaning “really” is
- what the procedure “really” is

### Materialization owns

- candidate records
- retrieval units
- prompt-facing renderings
- review tasks

Rendered strings are derived outputs, not semantic truth.

## Source-window rules

- one source window may contain multiple semantic objects
- windows are provenance-aware and structurally assembled
- windows must not merge across sibling headings just to reduce call count
- document and ordinary-turn lanes both target the same source-window seam
- larger sources should use a bounded number of coherent windows rather than
  one model call per tiny block

## Benchmark split

### Local replay lane

- deterministic
- cheap enough for targeted local iteration
- replays object-native model outputs against the gold corpus
- does not require live embedded-agent execution per test run

### Live proof lane

- uses the real model seam
- runs against audited sources/windows
- stores artifacts under `audits/`
- exists to prove real-model behavior, not to power every local iteration

## Current landed implementation in this tranche

- `memory-source-windowing.ts` now provides the shared source-window seam
- the semantic interpreter boundary now uses `interpretSourceWindow(...)`
- the primary semantic contract now centers on `objects[]`
- the semantic contract now carries explicit canonical classes:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- detector-era primary fields such as `captureCategoryHint`,
  `canonicalStatement`, and `canonicalProcedure` are removed from the normal
  interpretation boundary
- `memory-semantic-validation.ts` now acts as governance/admissibility logic
  instead of semantic reconstruction
- `memory-semantic-materialization.ts` now derives downstream canonical
  ingestion forms after validation
- reference-routing materialization now produces a direct reference canonical
  candidate instead of reusing workflow profile authority
- document ingestion now batches by source window
- the ordinary-turn semantic path now batches by source window before planner
  interpretation
- local benchmark tests now use an explicit replay helper for object-native
  outputs instead of scripted semantic heuristics
- the live-proof runner now uses the direct provider completion path for
  audited model evidence

## Remaining fenced legacy surfaces

The ordinary-turn coordinator still carries a degraded compatibility path, but
the normal runtime no longer reaches it by default.

Current accepted fence:

- the normal runtime controller injects the shared semantic interpreter and
  stops after model-native interpretation plus governance / ignore
- legacy fallback requires explicit degraded-mode opt-in
- Pass 2 should delete that degraded path rather than treating it as parity

`memory-semantic-comparison.ts` also remains an explicit comparison surface for
baseline-versus-model evaluation. It is diagnostic scaffolding, not the target
runtime planner boundary.

## Validation strategy

- targeted runtime tests:
  - document ingestion service
  - ordinary-turn auto-capture
- targeted benchmark tests:
  - live benchmark matcher behavior
  - gold corpus loading
  - comparison surface behavior
- targeted typecheck because the contract rewrite crosses shared runtime types

## Deletion targets

This tranche already deleted:

- block-level model interpretation as the normal path
- validator-owned semantic reconstruction in the rewritten validator seam

Later passes must still delete:

- ordinary-turn fallback semantic ownership below the new planner seam
- remaining heuristic-comparison scaffolding once model-native proof is
  sufficient
- obsolete canonical compatibility bridges after downstream consumers no
  longer need them

## Acceptance bar for this tranche

This tranche is only considered landed when:

- source-window interpretation is the normal semantic path
- document and ordinary-turn semantic entry both use source windows
- validation is governance-only
- materialization happens after interpretation/validation
- local benchmark tests use replayed object-native outputs
- live-proof runs no longer depend on one-model-call-per-block behavior
- remaining legacy semantic surfaces are visible and fenced instead of hidden
