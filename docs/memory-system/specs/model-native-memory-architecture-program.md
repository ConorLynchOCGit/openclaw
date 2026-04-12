# Model-Native Memory Architecture Program

## Purpose

Record the full model-native memory architecture program as an execution-ready
multi-pass plan without lowering the ambition of the original do-everything
pass.

This document exists because the target architecture is still the same:

- structural normalization is purely structural
- semantic interpretation is model-native
- capture lanes share one semantic boundary
- prompt and context assembly use shared model-native memory semantics
- cache and compaction are redesigned around canonical normalized and model
  artifacts
- benchmarking is based on live-model evaluation and gold judgments, not
  rule-based semantic surrogates
- detector-family semantic classification is removed from normal runtime
- the repo lands green and ends clean

The change is execution posture, not ambition.

The full program is too large to land honestly as one uninterrupted pass from
the current repo state. It must be executed as three ordered passes with hard
acceptance bars.

## Problem Statement

The current tree is materially better than the earlier family-heavy and
detector-heavy memory runtime, but it is still transitional:

- normalization still carries semantic-ish policy
- the planner still performs pre-model block typing
- comparison and benchmark surfaces still include heuristic-era scaffolding
- document ingestion and ordinary-turn capture still diverge too early
- context assembly, prompt assembly, cache ownership, compaction, and outcome
  proof still reflect mixed-era architecture
- code growth from the transition pass has not yet been repaid by deletion of
  obsolete heuristic and lane-local semantic code

The target program therefore remains necessary.

What changes here is the landing shape:

- keep the full slice set
- keep the strict end-state
- split the work into coherent passes that can be implemented, validated, and
  landed honestly

## Goals

- preserve the full model-native target architecture
- define the complete slice set and their required order
- group those slices into coherent landing passes
- define acceptance bars that prevent partial-success storytelling
- document which current seams are rewrite targets and which are likely
  deletion targets
- keep the program visible from the normal memory-doc handoff path

## Non-Goals

- reducing the architecture target because the program is hard
- calling a partially model-first runtime "done enough"
- keeping rule-based semantic surrogates as the main proof surface
- preserving obsolete detector-era code simply because it already exists
- authorizing broad bulk ingestion or soak before the required upstream passes
  are complete

## Current Architecture Truth

The current tree already contains the first generation of shared-normalization
and model-first work:

- `shared-source-normalization-and-block-typing` exists as a substrate spec
- `model-driven-semantic-interpretation` exists as the model-first semantic
  spec
- normal document and ordinary-turn paths now have a shared model-driven seam
  in some hot paths
- the runtime still contains detector-era semantic residue, heuristic block
  typing, and benchmark scaffolding that prevent the system from being
  honestly described as fully model-native

This program picks up from that intermediate state.

## Documentation Requirements For The Full Program

Every future implementation pass in this program must do all of the following:

- write or expand dedicated specs in `docs/memory-system/specs/` for the slices
  being executed
- keep each spec concrete enough to guide:
  - implementation
  - tests
  - migration
  - deletion
- include, for each slice where applicable:
  - problem statement
  - goals
  - non-goals
  - architecture boundary
  - proposed data contracts
  - runtime ownership
  - migration strategy
  - validation strategy
  - risks and open questions
  - explicit rewrite targets
  - explicit deletion targets
- update the key visibility docs as the pass progresses:
  - `docs/memory-system/CURRENT_SLICE.md`
  - `docs/memory-system/STATUS.md`
  - `docs/memory-system/DECISIONS.md`
  - `docs/memory-system/memory-roadmap.md`
  - `docs/memory-system/specs/README.md`

## Execution Rules For The Full Program

Every future implementation pass in this program must follow these rules:

- implement slices in the required order documented here
- use fast-lane validation only between slices
- do not run `pnpm check`, `pnpm test`, or `pnpm build` during the slice loop
- run the full landing bar only after the pass's slices are complete
- commit and push only after the full landing bar is green
- end each pass with a clean worktree
- if a pass ends with material heuristic semantic dependency in normal runtime
  where that pass intended to remove it, that pass is not done
- if a benchmark still depends primarily on rule-based semantic surrogates
  where that pass intended to replace them, that pass is not done

## Full Slice Inventory

The complete program retains all of the original slices.

### Pass 1 — Substrate And Evaluation Truth

This pass removes the biggest remaining architectural lie:

- semantic heuristics living inside normalization
- benchmark scaffolding pretending to prove model-native wins while still
  relying on heuristic or rule-based semantic proxies

#### Slice 7 — Structural normalization cleanup

Goal:

- make `memory-source-normalization.ts` purely structural

Required result:

- remove semantic-ish block typing and scope-meaning guesses from the
  normalization substrate
- keep only structural parsing:
  - headings
  - lists
  - block boundaries
  - provenance
  - parent-context carriage
- document exactly what normalization is and is not allowed to decide

Rewrite targets:

- `extensions/memory-middleware/src/memory-source-normalization.ts`
- callers that currently depend on semantic typing embedded in normalization

Deletion targets:

- semantic-ish normalization helpers that classify meaning instead of structure

#### Slice 8 — Unified source envelope contract

Goal:

- define one shared source envelope for document blocks, transcript turns,
  tool results, summaries, workspace excerpts, and retrieved memory objects

Required result:

- one explicit source-envelope contract exists
- all major context-bearing sources can be represented through the same
  top-level model

Rewrite targets:

- shared normalization types
- any per-lane source-shape wrappers that invent bespoke source contracts

Deletion targets:

- duplicated source-shape contracts that become redundant after envelope
  unification

#### Slice 9 — Shared provenance model

Goal:

- unify provenance across capture, retrieval, context assembly, compaction,
  and prompt reporting

Required result:

- one provenance model exists across memory and context surfaces
- prompt, report, compaction, and capture speak the same provenance vocabulary

Rewrite targets:

- provenance-carrying memory types
- prompt report and soak report adapters
- retrieval and compaction seams that use local provenance meanings

Deletion targets:

- lane-local provenance aliases that duplicate shared semantics

#### Slice 10 — Model interpretation contract v2

Goal:

- replace the current narrow interpretation contract with one contract that
  can classify, canonicalize, route, and ignore across all four durable-memory
  classes plus context-routing decisions

Required result:

- interpretation contract v2 exists
- it supports:
  - stable user preferences
  - durable operator corrections
  - reusable procedures
  - recurring project or workflow facts
  - durable routing or context memories
  - ignore decisions

Rewrite targets:

- `extensions/memory-middleware/src/memory-semantic-interpretation.ts`
- interpreter and validation consumers

Deletion targets:

- narrow contract fields that force ad hoc semantic side channels

#### Slice 11 — Live-model benchmark harness

Goal:

- replace rule-based comparison tests with replayable live-model evaluation
  over frozen fixtures and audited real documents

Required result:

- benchmark harness can run the real model path against a frozen corpus
- rule-based semantic surrogates are no longer the primary benchmark surface

Rewrite targets:

- `extensions/memory-middleware/src/memory-semantic-comparison.ts`
- `extensions/memory-middleware/src/memory-semantic-comparison.test.ts`
- benchmark scripts and fixtures

Deletion targets:

- rule-based benchmark paths that pretend to stand in for real model wins

#### Slice 12 — Gold judgment corpus

Goal:

- create a maintained corpus of hand-judged documents, turns, corrections,
  procedures, project facts, routing cases, and expected omissions

Required result:

- gold corpus exists in-repo in a maintainable form
- all major durable-memory classes are covered

Rewrite targets:

- benchmark fixtures
- audit artifacts and corpus loaders

Deletion targets:

- weak count-only fixtures that do not support semantic judgment

#### Slice 13 — Model calibration lane

Goal:

- tune prompt, schema, confidence policy, and rationale requirements against
  the gold corpus until the live model materially beats the old heuristic path

Required result:

- calibration loop exists
- confidence and rationale policies are evidence-based

Rewrite targets:

- model prompt builder
- contract schema
- validation thresholds

Deletion targets:

- acceptance logic that assumes current model output quality without measured
  evidence

#### Slice 14 — Heuristic block-typing retirement

Goal:

- delete `typeNormalizedMemoryBlock(...)` as a semantic decision point and keep
  only structural suppression where absolutely necessary

Required result:

- semantic block typing is removed from normal runtime
- semantic class decisions belong to the model path

Rewrite targets:

- `extensions/memory-middleware/src/memory-semantic-planner.ts`
- normalization consumers

Deletion targets:

- `typeNormalizedMemoryBlock(...)` as a semantic routing seam

### Pass 1 acceptance bar

Pass 1 is done only if:

- normalization is structural-only
- `typeNormalizedMemoryBlock(...)` is no longer a semantic decision point in
  normal runtime
- live-model benchmarking is the primary benchmark path
- a gold judgment corpus exists and covers all four canonical classes plus
  omissions
- the model materially beats the old heuristic path on the audited corpus
- rule-based semantic surrogates are no longer the main proof surface

### Pass 2 — Runtime Semantic Cutover

This pass removes lane-local semantic ownership and moves live runtime capture
onto one model-native semantic path.

#### Slice 15 — Lane-agnostic semantic planner

Goal:

- make one semantic planner for all capture sources, not separate document and
  turn flavors

Required result:

- one planner exists for all capture sources
- lane-specific logic becomes orchestration only

Rewrite targets:

- `extensions/memory-middleware/src/memory-semantic-planner.ts`
- document and ordinary-turn planner entrypoints

Deletion targets:

- lane-local semantic planning branches that duplicate shared planning

#### Slice 16 — Canonical memory-object unification

Goal:

- ensure every capture source lands into one shared canonical candidate or
  object path with no lane-specific semantic forks

Required result:

- one canonical object path exists
- document, turn, correction, and adjacent capture sources all land the same
  way

Rewrite targets:

- canonical compatibility builders
- candidate submission path
- ingestion-result shapers

Deletion targets:

- lane-specific semantic forks at submission time

#### Slice 17 — Review-policy redesign

Goal:

- make review posture depend on model confidence, provenance strength, class
  risk, and novelty, not detector family quirks

Required result:

- review policy is evidence-based

Rewrite targets:

- review posture logic
- candidate routing and review metadata

Deletion targets:

- detector-family-specific review heuristics

#### Slice 18 — Dedupe and supersession redesign

Goal:

- move dedupe and supersession to operate on canonical model outputs and
  normalized provenance, not detector-family artifacts

Required result:

- dedupe and supersession are model-native

Rewrite targets:

- overlap resolution
- correction and supersession seams

Deletion targets:

- detector-era identity assumptions in dedupe and supersession

#### Slice 19 — Model-native procedure extraction

Goal:

- treat procedures as structured model outputs over blocks, not list heuristics
  plus resolver tricks

Required result:

- procedures are first-class structured model outputs

Rewrite targets:

- procedure semantic and canonicalization seams
- document and turn procedure capture paths

Deletion targets:

- list-heuristic procedure assembly as the primary semantic path

#### Slice 20 — Model-native preference and correction capture

Goal:

- make terse reply-form preferences and operator corrections fully model-owned
  with contextual envelope support

Required result:

- implied-scope corrections and preferences are model-native

Rewrite targets:

- ordinary-turn capture
- contextual envelope handling for correction and preference capture

Deletion targets:

- detector-era reply-form preference and correction forests

#### Slice 21 — Model-native routing / reference interpretation

Goal:

- add a disciplined model-owned decision for durable routing or context memory
  versus reference-only text

Required result:

- routing or context memories are captured intentionally
- reference-only material stays out

Rewrite targets:

- routing capture and reference exclusion logic
- relevant document-ingestion profile rules

Deletion targets:

- noisy catch-all reference heuristics

#### Slice 22 — Capture-service convergence

Goal:

- converge capture services so document, turn, correction, and adjacent
  surfaces rely on one semantic service

Required result:

- one semantic service boundary exists

Rewrite targets:

- capture service ports and runtime wiring

Deletion targets:

- duplicated semantic work across capture services

#### Slice 27 — Full heuristic semantic retirement

Goal:

- delete detector-family semantic classification from normal runtime

Required result:

- heuristic semantic classification is removed from normal runtime
- remaining deterministic code is governance, safety, or degraded-mode only

Rewrite targets:

- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- semantic detector modules
- any remaining runtime callers of detector-family semantic classification

Deletion targets:

- `response-style-semantic.ts` normal-runtime ownership
- `project-fact-semantic.ts` normal-runtime ownership
- `recurring-procedure-semantic.ts` normal-runtime ownership
- `workflow-improvement-semantic.ts` normal-runtime ownership
- rule forests inside `ordinary-turn-auto-capture.ts` that still act as a
  semantic engine

#### Slice 28 — Cross-lane replay harness

Goal:

- replay the same meaning through document, turn, workspace, and retrieval
  lanes and verify equivalent model-native outcomes

Required result:

- lane parity is evaluated on meaning, not only isolated fixtures

Rewrite targets:

- benchmark harness
- replay fixtures and parity assertions

Deletion targets:

- parity claims backed only by lane-local synthetic tests

### Pass 2 acceptance bar

Pass 2 is done only if:

- document and turn capture share one semantic planner
- canonical memory objects are lane-agnostic
- review posture is based on confidence, provenance, risk, and novelty
- procedures, preferences, corrections, and routing are model-owned
- heuristic semantic detectors are gone from normal runtime
- replay harness proves equivalent meaning reaches equivalent outcomes across
  lanes

### Pass 3 — Context, Prompt, Operational, And Landing Convergence

This pass takes the model-native memory runtime and makes context assembly,
prompt assembly, cache ownership, compaction, governance, DB ingestion, soak,
and cleanup align with it.

#### Slice 23 — Context-planner convergence

Goal:

- make memory, workspace excerpts, summaries, tool traces, and prompt segments
  all flow through one context planner with shared segment contracts

Required result:

- one context planner owns context assembly
- memory is no longer a side bridge

Rewrite targets:

- current context control plane
- prompt assembly entrypoints and report seams

Deletion targets:

- memory-side bridge logic that bypasses shared context planning

#### Slice 24 — Prompt cache redesign

Goal:

- cache normalized-context artifacts and model interpretation artifacts
  explicitly instead of caching lane-local prompt fragments

Required result:

- prompt cache ownership aligns with shared normalization and interpretation
  boundaries

Rewrite targets:

- prompt artifact cache seams
- planner and report adapters that still think in prompt-fragment terms

Deletion targets:

- stale lane-local fragment caching

#### Slice 25 — Context compaction redesign

Goal:

- use model-native consolidation for over-budget context and memory clusters,
  with deterministic storage and audit trails afterward

Required result:

- compaction aligns with canonical normalized and model-native units

Rewrite targets:

- session-memory compaction
- related compaction planning and fallback seams

Deletion targets:

- detector-era leftover budget and overflow logic where present

#### Slice 26 — Outcome-proof redesign

Goal:

- track not just attachment and survival, but model-produced rationale,
  accepted retrievals, later correction avoidance, and application evidence

Required result:

- outcome proof becomes more causal and less proxy-shaped

Rewrite targets:

- outcome tracker
- outcome proof
- soak telemetry and reporting

Deletion targets:

- counters that only survive as detector-era proxies when stronger evidence is
  available

#### Slice 29 — Cost and latency control plane

Goal:

- add batching, memoization, prompt compression, and cache policy so
  model-native interpretation is operationally viable

Required result:

- the model-native runtime is operationally credible

Rewrite targets:

- planner batching
- interpreter orchestration
- cache and reuse policy

Deletion targets:

- ad hoc cost controls that assume smaller detector-era semantics

#### Slice 30 — Failure-mode policy

Goal:

- define what happens when the model is unavailable, malformed, low-confidence,
  or too expensive

Required result:

- failure-mode policy is explicit
- fallback does not silently revive heuristic semantic ownership

Rewrite targets:

- runtime fallback seams
- review and quarantine routing

Deletion targets:

- implicit or hidden fallback behavior

#### Slice 31 — Governance and approval layer

Goal:

- make approval, quarantine, promotion, and audit trails explicit so
  model-native capture is safe at scale

Required result:

- governance is first-class and testable

Rewrite targets:

- governance ports
- approval and quarantine orchestration

Deletion targets:

- ad hoc governance hidden inside runtime branches

#### Slice 32 — DB-native ingestion cutover

Goal:

- switch bulk document ingestion into the DB on the model-native path

Required result:

- DB submission for document ingestion uses the canonical model-native path

Rewrite targets:

- document ingestion submission path
- DB-facing ingestion planning

Deletion targets:

- old heuristic-era document-ingestion submission paths

#### Slice 33 — Soak suite over genuine DB memory

Goal:

- run soak only once capture, retrieval, pack compilation, and prompt assembly
  are all evaluated on real ingested canonical memory

Required result:

- soak suite exists over genuine DB memory

Rewrite targets:

- soak harness
- retrieval and application proof tests

Deletion targets:

- soak assumptions that only hold for bounded synthetic or non-DB corpora

#### Slice 34 — Post-cutover code slimming tranche

Goal:

- delete obsolete resolvers, detector helpers, benchmark shims, transitional
  comparison scaffolding, and lane-local semantic residue

Required result:

- obsolete heuristic-era code is removed
- code volume drops materially

Rewrite targets:

- transitional shims and compatibility helpers that still survive after cutover

Deletion targets:

- obsolete resolvers
- detector helpers
- benchmark shims
- transitional comparison scaffolding
- lane-local semantic residue

### Pass 3 acceptance bar

Pass 3 is done only if:

- memory is no longer a side bridge and now lives inside one context planner
- prompt caching is based on canonical normalized and model artifacts
- compaction operates on canonical units rather than detector-era leftovers
- outcome proof measures usefulness and application, not only attachment
- model-native runtime has explicit cost, latency, failure, and governance
  controls
- DB ingestion uses the canonical model-native path
- soak runs against genuine DB-backed canonical memory
- obsolete detector-era code is materially deleted and code volume drops

## Pass Ordering Decision

The program should be executed in three passes, not one and not two.

Why not one:

- the combined blast radius is too large for honest one-pass landing
- benchmark truth, planner cutover, context convergence, DB ingestion, soak,
  and deletion are different kinds of risk

Why not two:

- pass one becomes too coupled if it mixes evaluation truth, planner cutover,
  and runtime retirement
- pass two becomes an operational mega-pass across context, prompt, cache,
  compaction, governance, DB ingestion, soak, and deletion

Why three:

- each pass has one coherent governing purpose
- each pass can have a hard acceptance bar
- each pass can end with a clean landing and clearer next-step choice

## Recommended Future Execution Order

1. Pass 1 — substrate and evaluation truth
2. Pass 2 — runtime semantic cutover
3. Pass 3 — context, prompt, operational, and landing convergence

## Open Questions

- how much of the current normalization surface can stay as reusable structure
  parsing without carrying semantic policy
- how expensive the live-model benchmark harness can be while still serving as
  a practical development gate
- how much of the current review and governance surface can be adapted versus
  replaced
- how much of prompt assembly can be converged without destabilizing adjacent
  non-memory prompt surfaces
- what degraded mode is acceptable when the model path is unavailable without
  silently reviving heuristic semantics

## Immediate Next Step

The next implementation pass should be Pass 1.

Do not start with DB cutover, soak, or code slimming.

Until Pass 1 lands:

- normalization remains too semantically heavy
- evaluation remains too contaminated by heuristic-era scaffolding
- later claims about model-native wins remain weaker than they should be
