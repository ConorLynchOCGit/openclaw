# Phase 1 Architecture Closure Before Phase 2

## Problem statement

This spec recorded the hard gate between Pass 1 and Phase 2.

That closure is now landed locally.

The tree now satisfies the closure bar through:

- explicit canonical classes in the semantic contract:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- governance-only validation
- object-native benchmark scoring
- ordinary-turn default runtime cut over to model-native interpretation with
  degraded fallback off by default
- compatibility collapse far enough that benchmark truth and semantic truth no
  longer depend on legacy projection as authority
- stored live-proof artifacts, including a passing closure artifact on
  `openrouter/openai/gpt-5.4`:
  - `audits/memory_live_model_benchmark_2026-04-13T01-34Z.json`
  - `audits/memory_live_model_benchmark_2026-04-13T01-34Z.md`

Phase 2 may now start from this seam rather than reopening Phase 1.

## Closure judgment

### Core ontology

- `captureCategoryHint`, `canonicalStatement`, and `canonicalProcedure` are no
  longer the primary model contract
- the primary contract now centers on:
  - action
  - canonical class
  - object kind
  - scope
  - durability
  - provenance
  - confidence
  - rationale
  - object-local payload
- internal kinds are now explicitly documented as the decomposition under the
  four canonical classes, not a replacement for them

### Validator boundary

- `extensions/memory-middleware/src/memory-semantic-validation.ts` now acts as
  admissibility and governance only
- semantic reconstruction no longer lives in the validator boundary

### Benchmark truth

- live proof now uses the direct model completion path
- the matcher compares object-native results and canonical-class counts
- proof-critical matching now blocks on primary semantic truth rather than
  auxiliary phrasing or compatibility projection

### Legacy-path fencing

- ordinary-turn default runtime no longer silently falls through to
  detector-era semantics
- managed submission is on the model-native seam
- remaining heuristic helpers are replay scaffolding only, not semantic proof

## Why Pass 1 had been intermediate before closure

Current evidence in the runtime:

- the model contract had legacy steering fields
- the validator reconstructed meaning after the model
- live proof existed architecturally before it existed as stored evidence
- normal runtime still carried ordinary-turn fallback residue in the default
  path

This spec exists so the repo does not lose that historical bar just because the
bar is now satisfied.

## Goals

- make Phase 1 acceptance truthful before Phase 2 starts
- replace detector-shaped semantic contract fields with first-principles
  durable-memory object fields
- constrain the validator to admissibility, governance, and routing only
- make live-model benchmark evidence durable and reviewable
- strengthen the corpus and matcher enough to expose ontology and validator
  residue honestly
- classify every remaining legacy semantic path as rewrite, fence, or delete

## Non-goals

- claiming the current Phase 1 runtime is already finished if it is not
- widening into full Phase 2 runtime cutover work
- preserving detector-era ontology as an acceptable final contract
- preserving validator-owned semantic reconstruction as an acceptable final
  control plane

## Target first-principles semantic architecture

The target architecture for the end of Phase 1 closure is:

1. structural normalization only
2. one model-owned semantic object contract
3. one admissibility-only validator
4. one benchmark truth surface backed by live-model evidence and a gold corpus
5. explicit classification of all remaining non-cutover runtime seams

The target semantic read should answer:

- should this be ignored, forgotten, or captured
- if captured, what durable memory object is it
- what scope does it live in
- what grounded provenance supports it
- how confident is the model and why

The target semantic read should not answer:

- which detector family should own this
- which legacy compatibility profile should canonicalize it
- which regex pattern should re-derive it later

## Target model contract

### Fields that should be removed

- `captureCategoryHint`
- any field whose main job is to steer downstream legacy family routing
- narrow legacy-shaped category hints that encode old detector assumptions

### Fields that can survive conceptually

- action: `capture | ignore | forget`
- confidence
- rationale
- provenance grounding
- scope interpretation

### Fields that should replace the legacy detector furniture

- `memoryKind`
  - `preference`
  - `correction`
  - `procedure`
  - `fact`
  - `routing`
- `canonical`
  - statement-form object for non-procedure memories
  - structured procedure object for procedures
- `scope`
  - project
  - workflow
  - user
  - contextual dependencies
  - explicitness markers
- `provenance`
  - grounded source references only
- `reviewSignals`
  - novelty
  - risk
  - ambiguity

### Structured procedure shape

Procedures should be model-owned structured outputs with:

- `name`
- `steps`
- optional `successShape`
- optional `failureShape`

The validator must not reconstruct those from titled lists later.

### Routing memory shape

Routing or companion-doc guidance should be expressed as a durable routing
object, not as a workflow-family alias or a generic reference catch-all.

## Target validator boundary

### The validator is allowed to do

- schema validation
- provenance reference validation
- confidence threshold policy
- review routing policy
- novelty and risk gating
- dedupe and supersession checks
- quota and policy allowlist checks

### The validator is forbidden to do

- regex-derived semantic reconstruction
- template-based subject and value inference
- project-scope reconstruction from canonical text
- titled-list parsing to rebuild procedures
- workflow/project-rule/unmet-need canonicalization from raw strings
- class relabeling based on legacy family assumptions

### What must already be present in model output

- the semantic object kind
- canonical subject/value or structured procedure
- scope interpretation
- provenance grounding
- rationale
- ignore decision when appropriate

If the validator still needs to infer those, the contract is still wrong.

## Benchmark truth surface

Phase 1 closure requires:

- a real live-model run over the current gold corpus
- a stored benchmark artifact under `audits/`
- a matcher that compares richer canonical objects, not only statement snippets
- corpus cases that explicitly catch:
  - omissions
  - duplicate collapse failures
  - implied-scope failures
  - routing/reference confusion
  - validator semantic reconstruction

## Corpus strength bar

The gold corpus must cover:

- stable user preferences
- durable operator corrections
- reusable procedures
- recurring project or workflow facts
- durable routing or context memories
- ignore and borderline negatives
- paraphrase and duplicate cases
- implied-scope conversational cases
- mixed-signal documents
- at least one audited real live document

## Legacy path audit

| Surface                                                                         | Current role                                                 | Classification                       | Pre-Phase-2 action                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| `extensions/memory-middleware/src/memory-semantic-validation.ts`                | admissibility and governance only                            | closure landed                       | keep governance-only                                             |
| `extensions/memory-middleware/src/memory-semantic-interpretation.ts`            | canonical-class-aware model contract and prompt              | closure landed                       | carry into Pass 2                                                |
| `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`                | default runtime now model-native; degraded fallback explicit | fenced compatibility edge            | delete degraded path in later runtime retirement                 |
| `extensions/memory-middleware/src/tools/candidate-submit-managed-resolution.ts` | managed submission on the model-native seam                  | closure landed                       | carry into Pass 2                                                |
| `extensions/memory-middleware/src/memory-semantic-comparison.ts`                | heuristic baseline and model comparison                      | acceptable temporary diagnostic edge | keep diagnostic-only and do not present as primary proof surface |

## Rewrite targets

- `extensions/memory-middleware/src/memory-semantic-interpretation.ts`
- `extensions/memory-middleware/src/memory-model-semantic-interpreter.ts`
- `extensions/memory-middleware/src/memory-semantic-validation.ts`
- `extensions/memory-middleware/src/memory-live-benchmark.ts`
- `extensions/memory-middleware/src/memory-semantic-gold-corpus.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit-managed-resolution.ts`

## Deletion targets

- `extensions/memory-middleware/src/memory-semantic-compatibility.ts`
- validator-owned semantic reconstruction helpers
- ordinary-turn default semantic fallthrough

## Acceptance outcome

This gate is now satisfied locally.

Phase 2 may begin because:

- normal runtime semantic ownership is model-native
- benchmark truth is object-native
- live proof exists and passes on the frontier proof model for the audited
  closure set
- the four canonical memory classes remain explicit and explainable

- `captureCategoryHint` from the normal model contract
- regex and template semantic reconstruction helpers in
  `extensions/memory-middleware/src/memory-semantic-validation.ts`
- legacy family-owned semantic routing that survives only because the validator
  still outputs old shapes
- any acceptance language that says Pass 1 is complete before the above is true

## Tranche ordering to reach 100%

1. replace the model contract and prompt with a first-principles durable-memory
   object schema
2. replace validator semantic reconstruction with admissibility-only validation
3. rebuild canonical candidate construction directly from model-owned semantic
   objects
4. rerun the live-model benchmark over the strengthened corpus
5. classify the remaining runtime legacy paths as compatibility-only or rewrite
   targets and fence them explicitly
6. only then begin the broader Phase 2 runtime semantic cutover

## Acceptance bar before Phase 2

Phase 2 is blocked until all of the following are true:

- the core model contract no longer requires `captureCategoryHint`
- the core prompt no longer asks the model to think in detector-family buckets
- `extensions/memory-middleware/src/memory-semantic-validation.ts`
  no longer reconstructs semantic meaning
- deterministic post-model code performs admissibility and governance only
- the live-model benchmark runs over the strengthened gold corpus and stores a
  durable artifact
- the benchmark matcher compares canonical semantic objects, structured
  procedures, scope, provenance, and validation evidence
- remaining non-cutover runtime semantic paths are explicitly fenced and not
  overclaimed as already unified

## Proof requirements

- stored live benchmark artifact under `audits/`
- strengthened gold corpus and matcher landed in tree
- code references proving the old contract and validator seams were rewritten or
  deleted
- explicit decision docs stating whether Phase 2 is allowed to start

## Stop conditions

Do not start Phase 2 if any of the following remain true:

- the model contract is still detector-shaped
- the validator is still a second semantic interpreter
- benchmark proof still depends mainly on weak substring matching or scripted
  surrogates
- the live-model benchmark result is missing
- legacy runtime semantic paths are still being described as already unified

## Recommended next execution move

Use this closure spec as the gate between Pass 1 and Pass 2.

The next implementation tranche must target:

1. model contract replacement
2. validator semantic-reconstruction deletion
3. canonical object construction from model output rather than compatibility
   reconstruction

Without those changes, Phase 2 would start on top of the wrong architecture.
