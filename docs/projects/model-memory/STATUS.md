---
summary: "Current implementation status for model-memory."
title: "Model Memory Status"
---

# Model Memory Status

## Overall

State: `production_cutover_live_retirement_execution_in_progress`

The clean-room parallel package now exists at `extensions/model-memory/` with
implementation slices 1 through 19 completed on fast lanes. The package now
also has the direct live-runtime seams needed for production cutover:

- bootstrap/context overlay in the live harness
- assistant-turn capture on the live reply path
- explicit `model-memory` live enable/disable control
- gateway startup warmup for the live runtime
- status/doctor visibility for the cutover posture

The project has now moved out of “more duplicate tuning first” posture and into
the post-cutover stabilization window:

- `model-memory` is treated as materially stronger than the legacy memory stack
- the old memory stack is treated as retirement debt, not a strategic fallback
- the production flip is now complete
- rollback remains native no-memory behavior
- the active phase is now:
  - 72-hour observability window
  - daily sampled review
  - fast-follow fixes
  - time-bounded legacy retirement

The current pre-test preparation package is now also canonized:

- [Deep Document Ingest Targets 2026-04](/projects/model-memory/document-ingest-targets-2026-04-deep-pass)
- [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
- [Deep Ingest Verification Plan](/projects/model-memory/deep-ingest-verification-plan)
- [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
- bundled operator skill:
  - `skills/model-memory-deep-ingest/SKILL.md`

The first-pass post-soak Phase 2 conceptual spec pack now also exists:

- [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
- [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
- [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
- [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
- [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
- [Graph Schema And Runtime Dependencies](/projects/model-memory/specs/graph-schema-and-runtime-dependencies)
- [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
- [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
- [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
- [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)
- [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap)
- [Deep Ingest Interruption Root Cause](/projects/model-memory/deep-ingest-interruption-root-cause)

That spec pack carries the current reviewed posture:

- `kind` is the preferred primary semantic axis for Phase 2 review
- `canonicalClass` is under review as a secondary or derived facet
- the first capsule flavor is `project_state`
- self-improvement candidates must surface through ordinary OpenClaw operator
  channels rather than a hidden queue
- third-party synthesis recommendations now use:
  - `install`
  - `inspire`
  - `reject`
- privacy and trust metadata should be specified now but enforced gradually in a
  second pass after the base graph and capsule system is tested

The current runtime overlap between long-document reads and document ingest is
now narrower and explicit:

- [Document Read And Ingest Arbitration](/projects/model-memory/specs/document-read-and-ingest-arbitration)
- host-side workspace text reads can now auto-schedule deduped background
  ingest for capped, continued, or repeated reads
- the read result records `details.documentArbitration` for traceability

The current long-running ingest posture is now also clearer:

- the original Main-driven deep ingest interruption is recorded as a
  derived-runtime rebuild collision, not a generic heartbeat cancel
- derived-runtime rebuilds are now being serialized across overlapping lanes
- long-running ingest checkpoints are being hardened to persist `interrupted`
  state instead of being left at `running` after a rebuild crash

The current top-priority memory work is now:

- shared packet compiler design across bootstrap, dynamic, and retrieval packs
- `kind`-primary migration
- repair of live kind balance, especially the missing active `rule` class of
  memory objects

These are treated as one linked quality lane because packet usefulness depends
on corpus shape and packet shaping together.

The current proof obligations for that lane are now tracked in:

- [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
- [Memory Build Status And Next Steps](/projects/model-memory/memory-build-status-and-next-steps)

The current rule-vs-fact benchmark tranche now adds:

- [Document Ingest Pipeline Walkthrough](/projects/model-memory/document-ingest-pipeline-walkthrough)
- [Representative Corpus Rule Vs Fact Benchmark](/projects/model-memory/representative-corpus-rule-vs-fact-benchmark)
- [Rule Vs Fact Benchmark Scorecard](/projects/model-memory/rule-vs-fact-benchmark-scorecard)
- [Rule Vs Fact Variant Design](/projects/model-memory/rule-vs-fact-variant-design)
- [Rule Vs Fact Benchmark Findings](/projects/model-memory/rule-vs-fact-benchmark-findings)
- [Rule Vs Fact Next Change Recommendation](/projects/model-memory/rule-vs-fact-next-change-recommendation)

That benchmark currently supports this judgment:

- first-order skew is entering at pass-1 candidate extraction
- class-kind rigidity is a secondary amplifier rather than the dominant seam
- downstream collision/write behavior is not the main source of fact-heavy
  capture on the tested corpus
- the prompt-first production change has now shipped and become the live
  benchmark reference point
- the next production move is a narrow pass-2 canonicalization review, not
  schema rewrites or added deterministic compensation logic

The current evidence and residue boundary is now explicit:

- retained canonical evidence:
  - [Model Memory Evidence](/projects/model-memory/evidence)
- bounded cleanup and remaining debt:
  - [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
- explicit retirement execution / preservation docs:
  - [Legacy Memory Retirement Execution](/projects/model-memory/legacy-memory-retirement-execution)
  - [Continuity Preservation And Retirement](/projects/model-memory/continuity-preservation-and-retirement)
  - [USER.md And Projected Context Contract](/projects/model-memory/user-md-and-projected-context-contract)
  - [Legacy Continuity Export And Ingest](/projects/model-memory/legacy-continuity-export-and-ingest)
  - [Legacy Retirement Proof](/projects/model-memory/final-legacy-retirement-proof)

The first real repo-side retirement cuts and corrections now recorded are:

- bundled `session-memory` hook retained as a continuity producer for canonical
  daily markdown artifacts
- the hook repair now explicitly writes the canonical `memory/YYYY-MM-DD.md`
  surface instead of only slugged leaf notes
- `docs/automation/hooks.md` and `docs/cli/hooks.md` no longer advertise that
  hook as a semantic authority
- `docs/concepts/memory.md` and `docs/cli/memory.md` now describe the legacy
  stack as retired or retiring, not canonical
- gateway startup no longer falls back to QMD or plugin memory warmup when
  `model-memory` live runtime is off
- the repair record now lives in
  [Daily Memory Grounding Repair](/projects/model-memory/daily-memory-grounding-repair)
- same-day continuity now also has an explicit health-check lane:
  - `scripts/check-daily-memory-continuity.mjs` validates the canonical
    `memory/YYYY-MM-DD.md` artifact directly
  - the health contract now lives in
    [Daily Continuity Health](/projects/model-memory/daily-continuity-health)

Day-0 cutover verification:

- `openclaw status` now reports:
  - `Model memory = enabled`
  - `db = postgres`
  - `capture = on`
  - `context = on`
  - `legacy slot = off`
  - `legacy search = off`
- startup logs no longer show the previous `model-memory` migration warmup
  failure
- day-0 verification artifact:
  - [Cutover Day 0 Verification](/projects/model-memory/evidence/post-cutover/day-0-cutover-verification)
- active watch runbook:
  - [72 Hour Watch](/projects/model-memory/cutover-72h-watch)

The package has now also crossed the claim-plus-support architecture boundary:

- durable memory claims are no longer modeled as one-write-per-object only
- support items are now stored distinctly from durable objects
- lifecycle and activation state are now first-class storage/runtime concerns
- duplicate handling now uses exact identity first, bounded recall second, and constrained model-owned adjudication before deterministic write policy applies
- daily continuity recovery now exists as a secondary provisional candidate lane instead of pretending to be primary-source reinforcement
- default runtime reads now filter to active objects only

The latest write-path correction and proof rerun now add:

- deterministic collision pruning now leans on fuller
  `normalizedSearchText` overlap instead of subject/title anchoring alone
- a conservative single-candidate fast-attach lane now skips model
  adjudication for very high-overlap near-restatements
- the residual batch adjudication prompt now explicitly prefers
  `attach_support` over `conflict_hold` for one-candidate paraphrases
- the proof runner now records retrieval/context provider failures as probe
  errors instead of aborting the entire proof phase

The latest downstream-blocker diagnosis sprint now adds:

- a dedicated retrieval-request trace runner that captures prompt payload,
  contract version, provider request body shape, HTTP status, provider error
  excerpt, and request-time versus parse-time failure classification
- live executor error reporting that now exposes compact nested provider
  failures instead of generic `400 Provider returned error` messages
- retrieval prompt-contract fixes that:
  - explicitly mention JSON when requesting `json_object`
  - require the exact accepted retrieval-request schema
  - reserve `skip` for clearly non-memory queries
- a support-only rebuild diff runner that proves pure `attach_support` writes
  do not churn projections, context-artifact hashes, or active slot/set
  membership
- a current-corpus proof rerun that moves retrieval from `failing_or_unstable`
  to `proven`

The latest downstream-quality-and-dedupe sprint now adds:

- a duplicate-escape audit runner and adjudicated benchmark over real rerun
  cases instead of relying on raw object totals
- benchmark-driven deterministic attach expansion for one dominant retained
  candidate with decisive payload-field agreement
- decisive-field agreement is now shared across recall, deterministic attach,
  batch-prompt evidence, and duplicate-audit reporting instead of leaving those
  seams to infer sameness independently
- field-local same-claim wording drift inside decisive payload fields can now
  count as agreement when the overlap remains very strong
- rule action-bearing fields now allow a narrow same-claim bundle comparison so
  subject drift and field-packing drift do not automatically force a fresh
  sibling object
- a qualitative retrieval-package review that compares deterministic retrieval
  against the model-interpreted retrieval-request lane
- a fresh current-corpus proof rerun after the attach expansion
- the duplicate benchmark runner now tolerates stale seed-case drift instead of
  hard-failing when the audited corpus changes

The latest evidence-harness-and-duplicate-hinge sprint now adds:

- proof runners now use explicit database modes instead of one shared implicit
  evidence database:
  - `full_corpus_proof_db`
  - `targeted_trace_scratch_db`
- targeted hinge traces and narrow live probes now run on disposable scratch
  databases and write that DB mode into their artifacts
- full-corpus proof, duplicate audit, duplicate benchmark, and qualitative
  duplicate review now run on the preserved populated proof database and also
  record DB mode and database name in their artifacts
- the duplicate audit now classifies each rerun escape with:
  - `missClass`
  - `sameClaimConfidence`
  - `packagingDriftType`
- the duplicate benchmark now survives corpus evolution more honestly:
  - it still accepts prior semantic seeds when available
  - it still records missing legacy reviewed-case ids instead of pretending they
    resolved
  - when neither legacy ids nor prior semantic seeds resolve, it rebuilds a
    bounded semantic-fingerprint seed set directly from the current preserved
    audit
- a dedicated qualitative duplicate-review runner now emits a bounded
  human-review artifact for cutover decisions:
  - [Duplicate Escape Review](/projects/model-memory/evidence/duplicate-escape-review)
- duplicate hinge handling was tightened structurally rather than by lowering
  thresholds globally:
  - dense rule recall may use a stronger concatenated action-bundle anchor
  - fact attachment may prefer the narrower same-value candidate over a broader
    wrapper candidate
  - non-additive wrapper-only deltas now count as same-claim leaning evidence
  - the batch lane now receives explicit `candidateRankReason`,
    `dominantCandidateId`, and `sameClaimRisk`

The latest structural-recall-and-proof-honesty sprint now adds:

- an explicit anti-ontology family-recall spec:
  - [Structural Family Recall](/projects/model-memory/specs/structural-family-recall)
- family-level deterministic recall now comes from decisive-field text and
  same-source neighborhoods instead of any predefined semantic catalog
- current kind rollout is explicit:
  - `rule = yes_now`
  - `fact = yes_now`
  - `procedure = yes_now`
  - `preference = yes_now`
  - `reference = yes_later`
- proof-phase support-only reporting is now being corrected so the runner can
  no longer treat a mixed rerun as a true support-only probe when no
  support-only source was actually observed
- stable-surface diffs in the proof lane now expose changed projections,
  stable artifacts, and stable cache segments as content-level entries instead
  of only boolean hash mismatches

The latest final pre-cutover duplicate-and-proof sprint now adds:

- one more narrow AGENTS-only recall pass over the current surface
- stronger batch-lane rule evidence:
  - `sameClaimConfidence`
  - `packagingDriftType`
  - explicit wrapper/field-packing guidance for rule ambiguity
- a deterministic synthetic existing-object replay path so proof can run a true
  `pure_attach_support` probe on purpose
- content-level stable-surface reporting for that real support-only probe
- refreshed preserved-corpus duplicate audit, benchmark, and qualitative review
- a final binary cutover judgment based on:
  - AGENTS deterministic gate loss
  - true support-only probe stability
  - duplicate review quality
  - retrieval/context boundedness

The latest core-claim-delta-and-parity sprint now adds:

- a dedicated core-claim versus packaging measurement runner:
  - [Core Claim Delta Measurement](/projects/model-memory/evidence/core-claim-delta-measurement)
- deterministic attach now uses the measured-safe shape only:
  - one dominant core-claim candidate
  - `packaging_only_drift`
  - no same-slot supersession reason
  - no rival with equal core-claim agreement
- batch adjudication now receives explicit structural same-claim evidence:
  - dominant candidate id
  - core-claim match summary
  - blocking-field summary
  - delta class
  - packaging drift type
  - `sameClaimLeaning`
- duplicate review and benchmark now share one stratified basket instead of
  drifting across separate sample populations
- a small replay-versus-live parity lane now exists:
  - [Live Vs Replay Parity](/projects/model-memory/evidence/live-vs-replay-parity)
- proof now includes a modestly broader retrieval/context basket:
  - mixed work prompt
  - rule-heavy instruction
  - fact-heavy configuration
- the safe deterministic widening shape stayed narrow and evidence-backed:
  - packaging-blocked clear misses were real but rare
  - legit-distinct controls did not justify broader attach relaxation
- replay-versus-live parity now has an explicit case-identity surface instead of
  fuzzy token matching:
  - [Live Vs Replay Parity](/projects/model-memory/evidence/live-vs-replay-parity)

The latest duplicate-conversion-and-cutover-decision sprint now adds:

- direct case identity is now emitted into both the targeted hinge trace and
  replay-side audit surfaces instead of relying on fuzzy parity matching
- batch adjudication now receives stronger structural same-claim evidence for
  wrapper-versus-constraint rule ambiguity:
  - family-recall summary
  - rule action-bundle summary
  - stronger rule-specific same-claim guidance in the batch prompt
- fact-side structural delta handling now treats narrow same-value plus
  subject-only drift as `packaging_only_drift` when no broader-wrapper fact
  containment is present
- the shared qualitative review and benchmark basket was expanded to a larger
  preserved-corpus sample instead of staying on the earlier small basket
- the parity lane also stripped back low-value fuzzy scoring:
  - direct identity is now the only cutover-facing matching surface
  - unresolved parity is now localized honestly as trace-identity drift

The latest zero-candidate-recovery sprint now adds:

- a bounded recovery lane that activates only after the normal write path
  retained zero candidates
- raw `normalizedSearchText` similarity is now used as a recovery substrate
  only, not as merge authority
- the recovery lane asks the model only a narrow question:
  - `sameCoreMemory`
  - `matchedCandidateId`
  - `deltaType`
- final routing remains local and structural:
  - `yes + non_additive => attach_support`
  - `yes + additive => existing ambiguity lane`
  - `ambiguous => existing ambiguity lane`
  - `no => distinct`
- a labeled-basket evaluation runner now exists:
  - [Zero Candidate Recovery Eval](/projects/model-memory/evidence/zero-candidate-recovery-eval)
  - current reviewed positives were rescued without observed false merges on
    the evaluation basket

The latest unified-bounded-adjudication sprint now adds:

- the write path now uses one bounded adjudication lane for unresolved cases:
  - deterministic local resolution still runs first
  - retained structural candidates are the primary escalation input
  - raw-text retrieval remains fallback-only when retained candidates are empty
- final routing is now fully local after bounded adjudication:
  - `yes + non_additive => attach_support`
  - `yes + additive => local supersede/distinct`
  - `ambiguous => local conflict_hold`
  - `no => distinct`
- the labeled basket now measures the unified lane rather than zero-candidate
  fallback alone:
  - `overallConversionRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0`
  - retained-candidate-only success on the basket = `1.0`
  - raw-text fallback did not carry the current labeled basket
- targeted hinge traces now record bounded adjudication observations directly
  instead of treating everything as a zero-candidate side lane

The latest AGENTS-only fallback-admission drift-tolerance sprint now adds:

- raw-text fallback candidate admission no longer requires exact:
  - `canonicalClass`
  - `kind`
  - `scopeKey`
- those structural fields now travel into bounded adjudication as advisory
  candidate metadata:
  - `sameCanonicalClass`
  - `sameKind`
  - `sameScope`
  - `similarityScore`
- final write authority remains local and conservative:
  - structurally drifted fallback `sameCoreMemory=yes` matches now route to
    local `conflict_hold`
    instead of auto-attaching support
- the isolated `AGENTS.md` rerun confirms the original bottleneck was real:
  mandatory post-retrieval structural gating was suppressing plausible fallback
  candidates before adjudication

Latest live evidence after the AGENTS-only fallback-admission drift-tolerance sprint:

- [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
- [Support-Only Rebuild Diff](/projects/model-memory/evidence/support-only-rebuild-diff)
- [AGENTS Hinge Trace](/projects/model-memory/evidence/agents-md-collision-hinge-trace)
- [Gateway Configuration Hinge Trace](/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace)

Cutover planning docs now exist:

- [Cutover Plan](/projects/model-memory/cutover-plan)
- [Cutover Checklist](/projects/model-memory/cutover-checklist)
- [Cutover And Retirement Plan](/projects/model-memory/cutover-retirement-plan)

That evidence currently shows:

- proof rerun on the current corpus:
  - readiness remains `not_ready`
  - corpus totals now sit at:
    - canonical objects persisted: `686`
    - support items persisted: `688`
    - active objects: `580`
    - conflict-hold objects: `88`
  - long-horizon reruns are still too write-heavy:
    - run 1: `objectDelta=20`, `attach_support=6`, `distinct_write=19`
    - run 2: `objectDelta=13`, `attach_support=8`, `distinct_write=13`
    - run 3: `objectDelta=17`, `attach_support=16`, `distinct_write=15`
  - duplicate active-object candidates now sit at `29`
  - the support-only lane is now proven honestly and no longer blocked:
    - `Support probe class = pure_attach_support`
    - `Support-only projection churn = false`
    - `Support-only stable artifact churn = false`
    - stable/semi-stable/volatile cache layers after support-only write = `true`
  - retrieval/context remains green on a broader basket:
    - `7 / 7` probes remain active-only
    - `7 / 7` probes return `selectedCount = 5`
    - all `7 / 7` probes stay bounded at `segments = 6`,
      `estimatedTokens = 1281`
  - unchanged rebuild motion is still correctly classified as
    `transient_retrieval_artifact_growth`
- isolated pure-support evidence still agrees:
  - `support-only-rebuild-diff` classification = `pure_support_only_stable`
- the zero-candidate recovery evaluation shows the new lane is locally useful:
  - sample size: `16`
  - `known_legitimate_match = 6`
  - `legit_distinct_control = 6`
  - `ambiguity_control = 4`
  - `overallConversionRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0`
  - retained-candidate-only success rate = `1.0`
  - zero-candidate fallback success rate = `0`
- targeted hinge traces:
  - `AGENTS.md` is still the worst source on the current surface:
    - before the AGENTS-only fallback-admission change:
      - `zero_candidate_skips = 24`
      - `attach_support = 3`
      - fallback cases with `adjudicationCandidateCount > 0 = 0`
      - fallback cases with `adjudicationBatchAdmitted = true = 0`
      - `conflict_hold = 1`
    - current isolated result:
      - `zero_candidate_skips = 24`
      - `attach_support = 1`
      - fallback cases with `adjudicationCandidateCount > 0 = 12`
      - fallback cases with `adjudicationBatchAdmitted = true = 12`
      - `conflict_hold = 8`
    - selected fallback candidates admitted despite structural drift:
      - same class = `6`
      - different class = `9`
      - same kind = `13`
      - different kind = `2`
      - same scope = `3`
      - different scope = `12`
    - fallback route counts now show the seam moved:
      - `no_candidates = 12`
      - `direct_distinct = 6`
      - `local_conflict_hold_structural_drift = 5`
      - `local_conflict_hold_ambiguous = 1`
    - AGENTS no longer fails only because fallback admission is empty:
      the write path now admits drifted raw-text neighbors into adjudication
    - AGENTS is still blocked because too many newly admitted candidates still
      resolve to `direct_distinct` or conservative `conflict_hold`
  - `docs/help/testing.md` still shows broader non-AGENTS duplicate pressure:
    - `zero_candidate_skips = 19`
    - `attach_support = 0`
    - `admitted_to_batch = 4`
    - `conflict_hold = 0`
  - `docs/gateway/configuration.md` did not keep the earlier targeted gain:
    - `zero_candidate_skips = 3`
    - `attach_support = 0`
    - `admitted_to_batch = 7`
    - `conflict_hold = 0`
  - that means the unified lane cleaned up the architecture, but it did not yet
    produce a broad current-corpus duplicate-quality win
- preserved-corpus duplicate evidence is still not in rare-miss territory:
  - audit:
    - rerun escape cases: `490`
    - duplicate cluster cases: `28`
    - replay paths:
      - `deterministic_attach = 10`
      - `batched_adjudication = 254`
      - `distinct_write = 226`
    - miss classes:
      - `deterministic_attach_miss = 8`
      - `batch_attach_miss = 158`
      - `legit_distinct = 322`
      - `historical_supersede_miss = 2`
    - retained-candidate shape:
      - `zero = 226`
      - `one = 75`
      - `multiple = 189`
  - shared qualitative review basket:
    - sample size: `16`
    - `clear_duplicate_should_attach = 6`
    - `clear_distinct_should_stay_distinct = 6`
    - `true_ambiguity = 4`
  - aligned benchmark on that same basket:
    - `rerunSampleSize = 15`
    - `attachSupportMissRateOnReruns = 0.3571`
    - `falseDistinctRateOnReruns = 0.3571`
    - interval on attach-support misses remains wide:
      - lower = `0.1634`
      - upper = `0.6124`
- current cutover judgment remains `not_ready_for_cutover`
  - remaining blockers:
    - long-horizon duplicate pressure remains above the cutover bar
    - preserved-corpus duplicate review still contains too many clear
      should-attach misses
    - benchmark uncertainty remains too wide for a clean cutover call
    - AGENTS and other dense rule sources still show real deterministic gate
      loss
    - retained-candidate conversion is still failing on live current-corpus
      cases
  - current architecture still looks worth at most one more focused pass, but
    only if that pass directly targets:
    - calibration of retained-candidate bounded adjudication on real corpus
      cases
    - long-horizon fresh-object pressure rather than more broad recall logic
  - broader complexity beyond that point would have diminishing returns

Latest preserved-corpus evidence after the harness fix:

- [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
- [Duplicate Escape Audit](/projects/model-memory/evidence/duplicate-escape-audit)
- [Duplicate Escape Benchmark](/projects/model-memory/evidence/duplicate-escape-benchmark)
- [Duplicate Escape Review](/projects/model-memory/evidence/duplicate-escape-review)

That evidence currently shows:

- measured core-claim/delta safety on the preserved corpus:
  - measured cases: `319`
  - misses blocked by packaging fields: `2`
  - misses blocked by core-claim fields: `93`
  - clear misses that would flip under
    `core-claim-only + packaging_only_drift`: `2`
  - legit-distinct controls that would become risky under that rule: `0`
- duplicate audit over the preserved proof DB:
  - rerun escape cases: `319`
  - duplicate cluster cases: `4`
  - replay-path split:
    - `batched_adjudication = 167`
    - `distinct_write = 150`
    - `deterministic_attach = 2`
  - miss-class split:
    - `batch_attach_miss = 94`
    - `deterministic_attach_miss = 2`
    - `legit_distinct = 223`
- qualitative duplicate review over a bounded preserved-corpus sample:
  - reviewed sample size: `9`
  - `clear_duplicate_should_attach = 2`
  - `clear_distinct_should_stay_distinct = 4`
  - `true_ambiguity = 2`
  - `needs_policy_change = 1`
- semantic-fingerprint benchmark over that same stratified basket:
  - rerun reviewed cases: `9`
  - cluster corroboration cases: `0`
  - rerun labels:
    - `should_attach_support = 2`
    - `legit_distinct = 4`
    - `ambiguous_but_contained = 3`
  - attach-support miss rate on reruns is now `0.25`
  - false-distinct rate on reruns is now `0.25`
  - interval reporting is now explicit in the artifact
- replay-versus-live parity over a tiny sampled basket is still unresolved:
  - sample size: `5`
  - `close = 0`
  - `diverged_recall = 1`
  - `unresolved_trace_match = 4`

The latest validation pass also confirms:

- targeted type and unit gates are green on the updated duplicate-to-support
  seams
- live representative hinge traces show improvement without AGENTS-only
  heuristics
- `docs/help/testing.md` still resolves some same-claim reruns to
  `attach_support`
- `docs/gateway/configuration.md` still has mixed deterministic-gate and batch
  ambiguity misses
- `AGENTS.md` improved materially, but it remains the main under-attachment
  source

Current evidence posture:

- the earlier evidence contamination problem is now fixed structurally:
  - targeted traces no longer need to overwrite the preserved proof DB
  - artifacts now state which DB mode produced them
- the remaining evidence risk is not DB contamination or support-only
  instability
- the remaining evidence risk is duplicate under-attachment plus unproven
  replay-vs-live parity
- the blocker is now best described as mixed:
  - deterministic gate loss is still real
  - batch choice quality is also materially involved
- final current judgment:
  - `not_ready_for_cutover`

The live database lane is now materially complete for the current package
scope:

- the logical database `model_memory` now exists on the shared
  Supabase/Postgres server
- `extensions/model-memory/migrations/0001_model_memory_init.sql` has been
  applied there
- both canonical `model_memory` tables and derived `runtime_context` tables
  are present on that logical database

## Completed

- canonical project docs area chosen: `docs/projects/model-memory/`
- central docs index will link to `/projects`
- project index, roadmap, status, decisions, current slice, and spec index created
- pre-implementation pack created:
  - spec closure review
  - build plan
  - detailed database schema doc
  - proof corpus plan
  - implementation guardrails
  - validation loop
  - slices 1 through 5 execution checklist
  - bootstrap input audit
- legacy cutover and retirement planning now specified
- retrieval and context-injection design now specified at the architecture level
- four-pillar runtime architecture now specified:
  - harness
  - context engine
  - memory layer
  - usage/cache layer
- v1 scope locked:
  - document ingestion
  - ordinary-turn user capture
  - standalone runtime
  - optional shadow mode later
- database boundary locked:
  - same Postgres/Supabase server
  - new logical database
- ontology direction locked:
  - canonical classes: `user`, `feedback`, `project`, `reference`
  - internal kinds: `preference`, `fact`, `rule`, `procedure`, `reference`
- schema tightening locked:
  - `ruleSubtype` removed from v1
  - `rationaleCodes` retained only as optional audit metadata
- projection/runtime-layer direction locked:
  - runtime read models are derived, not semantic truth
  - generated bootstrap files are downstream consumers
  - usage/cache ledger stores counters plus segment hashes
- merge policy direction locked:
  - bounded semantic equivalence allowed in proof
  - deterministic normalized identity required on writes
  - no fuzzy merge in live write path for v1
- slices 1 through 5 implemented and validated:
  - semantic schema and validator
  - prompt-contract and storage contracts
  - document source adapter and ingestion flow
  - ordinary-turn source adapter and capture flow
  - deterministic identity, dedupe, supersession, and write policy
  - derived runtime read models and context artifacts
- slices 6 through 10 implemented and validated:
  - deterministic projection compiler and generated-zone file ownership
  - no-retrieval context engine plus usage/cache ledger
  - reusable audited proof runner and object-native benchmark harness
  - model-owned retrieval request interpretation with deterministic object-native retrieval
  - retrieval packs as derived context artifacts
  - observational-only shadow mode and runtime comparison reporting
- slices 11 through 15 implemented and validated:
  - executable `model_memory` and `runtime_context` SQL migrations
  - database-backed canonical and runtime-context repositories
  - database-backed write and retrieval stores for live paths
  - provider-agnostic real model execution boundaries for extraction and retrieval-request interpretation
  - live document and ordinary-turn ingestion services wired through persistence
  - deterministic rebuild orchestration for slots, sets, context artifacts, and projection versions
  - harness-facing integration for bootstrap projections, context assembly, retrieval-pack gating, and usage normalization
  - live shadow adapters for document and ordinary-turn surfaces
  - operator inspection, calibration reporting, and readiness-gate evaluation
- pre-cutover large-document ingestion inventory created for the next
  operational evidence phase
- Tier 1 large-document evidence rerun executed on 2026-04-14 through the live
  database-backed path with explicit small-model extraction:
  [Large Document Tier 1 Evidence](/projects/model-memory/evidence/large-document-tier1)
- the evidence lane now defaults to `openrouter/openai/gpt-5.4-nano`
  instead of `openrouter/auto`
- the default model posture is now nano/nano across model-memory run lanes:
  - pass 1 = `openrouter/openai/gpt-5.4-nano`
  - pass 2 = `openrouter/openai/gpt-5.4-nano`
  - `openrouter/openai/gpt-5-mini` remains comparison-only, not default
- all six Tier 1 documents were executed in the declared order on the explicit
  small model
- the most recent rerun materially improved structural validity again:
  - all six Tier 1 documents now persist canonical objects with structured
    provenance
  - the structural reject set for the remaining four documents was cleared by
    prompt-contract tightening plus a one-shot model-owned structural repair
    pass
- the new blocker is now bounded semantic convergence and proof admission
  quality:
  - every Tier 1 document still produced too much fresh active growth on rerun
    instead of bounded semantic convergence
  - bootstrap-sensitive and proof-contamination-sensitive sources still
    over-capture content that is not automatically admissible into audited proof
- no large real-source cases are admitted into the audited proof set yet
  because bounded-convergence failure and source sensitivity still block honest
  adjudication
- a seeded representative pass-1 model comparison was then executed on
  2026-04-14 against:
  - `docs/help/testing.md`
  - `docs/gateway/protocol.md`
  - control lane:
    - pass 1 = `openrouter/openai/gpt-5.4-nano`
    - pass 2 = `openrouter/openai/gpt-5.4-nano`
  - comparison lane:
    - pass 1 = `openrouter/openai/gpt-5-mini`
    - pass 2 = `openrouter/openai/gpt-5.4-nano`
  - fixed request seed = `7`
  - evidence artifact:
    [Representative Pass-1 Model Comparison](/projects/model-memory/evidence/representative-pass1-model-comparison-seed7)
- that mini comparison is retained only as historical comparison evidence; it
  does not define the current default lane
- that representative comparison materially clarified the current blocker:
  - pass-1-on-mini reduced coarse instability versus nano:
    - `docs/help/testing.md` held capture count at `9 / 9` instead of
      `9 / 7`
    - `docs/gateway/protocol.md` avoided the nano reject path and held at
      `9 / 8` instead of `0 / 6`
  - however, the comparison still did not establish bounded semantic
    convergence:
    - same-seed candidate overlap remained low on both representative
      documents, which is retained as historical evidence rather than the
      current bar
    - canonicalization still drifted because unstable candidate sets continued
      to feed pass 2
- no broader Tier 1 rerun was justified by that comparison sprint
- no real-source proof admissions were justified by that comparison sprint
- proof admission no longer uses exact candidate overlap or exact rerun object
  equality as the bar:
  - bounded semantic convergence is the required bar instead
  - bounded active-object growth is the required bar instead
  - runtime cleanliness and source honesty remain required
- repo-wide type lane blocker drift encountered during implementation was cleared in:
  - `extensions/llm-task/src/llm-task-tool.ts`
  - `src/tui/tui-session-actions.test.ts`
- claim-plus-support architecture changes implemented and validated:
  - storage now distinguishes durable `memory_objects` from `memory_support_items`
  - lifecycle state and activation basis are now persisted on memory objects
  - support attachment is now a first-class write outcome instead of pretending every duplicate is a new object
  - same-source reruns no longer count as independent reinforcement
  - daily continuity rediscovery no longer counts as independent reinforcement for primary captures
  - collision handling now supports bounded `attach_support`, `supersede`, `distinct`, and `conflict_hold` outcomes
  - provisional expiry is implemented for stale daily-recovery candidates
  - active-only filtering is now enforced in default runtime object reads
  - targeted validation is green on the new architecture:
    - `pnpm tsgo`
    - `pnpm test -- extensions/model-memory/src/db/migrations.test.ts extensions/model-memory/src/write-policy.test.ts extensions/model-memory/src/memory-object-store.test.ts extensions/model-memory/src/db/canonical-repository.test.ts extensions/model-memory/src/runtime-comparison.test.ts extensions/model-memory/src/runtime-read-models.test.ts extensions/model-memory/src/proof/proof-runner.test.ts src/agents/model-memory.large-document-evidence.test.ts`
- the ordered first-100 population wave was executed on 2026-04-14 through the
  real DB-backed path on explicit nano/nano:
  - evidence artifacts:
    - [First 100 Population Plan](/projects/model-memory/evidence/first-100-population-plan)
    - [First 100 Population Run](/projects/model-memory/evidence/first-100-population-run)
  - source selection:
    - all Tier 1 pilots in declared order
    - all Tier 2 packs in declared priority order
    - Tier 3 `extensions/model-memory` production files used to fill the
      remainder to 100 sources
  - observed totals:
    - docs attempted: `100`
    - docs completed: `98`
    - docs failed: `2`
    - canonical objects persisted: `312`
    - support items persisted: `316`
    - active objects: `294`
    - provisional objects: `0`
    - `conflict_hold` objects: `18`
    - write decisions:
      - `write = 312`
      - `attach_support = 4`
      - `ignore = 3`
  - contained failures:
    - `docs/help/faq.md` timed out on the live nano/nano lane
    - `extensions/model-memory/src/model-execution.ts` returned invalid JSON
      for semantic extraction
  - readiness judgment:
    - this wave is good enough to proceed into retrieval/context/rebuild/
      projection/cache testing on a meaningfully populated corpus
    - this wave alone does not admit any new real-source cases into audited
      proof
- downstream proof was then rerun on 2026-04-15 against the existing populated
  corpus without reset or ingestion:
  - evidence:
    - [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
    - [Proof Phase Adjudication](/projects/model-memory/evidence/proof-phase-adjudication)
    - [Retrieval Trace - Live Tests](/projects/model-memory/evidence/retrieval-trace-probe-live-tests)
    - [Retrieval Trace - Gateway Protocol](/projects/model-memory/evidence/retrieval-trace-probe-gateway-protocol)
    - [Retrieval Trace - Planning Guidance](/projects/model-memory/evidence/retrieval-trace-probe-planning-guidance)
    - [Retrieval Trace - Schema Reference](/projects/model-memory/evidence/retrieval-trace-probe-schema-reference)
    - [Support-Only Rebuild Diff](/projects/model-memory/evidence/support-only-rebuild-diff)
  - retrieval status:
    - the old live nano `400` blocker is fixed
    - all four proof probes now produce valid retrieval requests
    - all four proof probes now return active-only retrieval results and
      retrieval packs
  - current downstream blocker classification:
    - context assembly is still failing the proof bar because all four probes
      prune and still estimate `26763` to `26857` input tokens
    - unchanged projection hashes are stable, but proof-phase artifact churn is
      still polluted by retrieval-pack growth across proof runs
    - pure support-only writes are stable in the dedicated diff runner, so the
      remaining rebuild/cache blocker is not the attach-support write itself
    - cache stable and volatile layers now hold on unchanged runs, but
      semi-stable hashes still churn across repeated context runs
    - long-horizon duplicate pressure is still above the cutover bar:
      - active objects: `570`
      - support items: `657`
      - duplicate active-object count: `14`
  - updated readiness judgment:
    - retrieval is now `proven`
    - runtime read models remain `proven`
    - operator inspection is now `proven`
    - context assembly, projections/rebuild, cache usage, and long-horizon
      convergence remain blocking
    - cutover readiness remains `not_ready`
- duplicate quality and dedupe proof then advanced again on 2026-04-15 using
  the existing corpus and the current proof artifacts:
  - evidence:
    - [Duplicate Escape Audit](/projects/model-memory/evidence/duplicate-escape-audit)
    - [Duplicate Escape Benchmark](/projects/model-memory/evidence/duplicate-escape-benchmark)
    - [Retrieval Package Review](/projects/model-memory/evidence/retrieval-package-review)
    - [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
  - benchmark result:
    - rerun false-distinct rate in the adjudicated sample: `0.5`
    - rerun attach-support miss rate in the adjudicated sample: `0.5`
    - rerun false-supersede rate in the adjudicated sample: `1.0`
  - write-path correction applied from that benchmark:
    - deterministic fast-attach now allows one dominant retained candidate when
      decisive payload fields agree exactly and the remaining candidates fail
      that stronger check
  - post-fix proof result on the current corpus:
    - active objects: `589 -> 627`
    - support items: `732 -> 818`
    - duplicate active-object candidates: `35`
    - stable projection hashes remain unchanged
    - stable artifact hashes remain unchanged
    - stable and semi-stable cache hashes remain stable
    - volatile cache hashes still move across repeated proof runs
  - qualitative retrieval-package review result:
    - deterministic retrieval is still carrying most of the useful signal
    - the retrieval-request model step degraded `4 / 4` reviewed probes
    - one proof probe now collapses to zero on the model-interpreted path:
      - `probe-planning-guidance-primary-1776233164438`
  - updated readiness judgment:
    - projections/rebuild are no longer a primary blocker
    - retrieval quality has become a blocker again because the
      retrieval-request model step is not yet trustworthy enough
    - long-horizon duplicate pressure remains above the cutover bar
    - cutover readiness remains `not_ready`
- retrieval-quality and dedupe then advanced again on 2026-04-15 without reset
  or ingestion:
  - evidence:
    - [Retrieval Package Review](/projects/model-memory/evidence/retrieval-package-review)
    - [Duplicate Escape Audit](/projects/model-memory/evidence/duplicate-escape-audit)
    - [Duplicate Escape Benchmark](/projects/model-memory/evidence/duplicate-escape-benchmark)
    - [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
    - [Proof Phase Adjudication](/projects/model-memory/evidence/proof-phase-adjudication)
  - retrieval-request modeling correction:
    - broad operator/reference/workflow/architecture queries now stay on a
      deterministic-baseline guardrail
    - the model lane may not narrow broad queries down to one result or force
      class/kind filters unless the envelope really supports that
    - retrieval-package review is now `4 / 4`
      `mostly_same_value_as_deterministic`
    - retrieval-request modeling is now neutral instead of degrading:
      - `0 / 4` reviewed probes degrade versus deterministic retrieval
      - deterministic retrieval is still carrying most of the useful signal
      - the model step is not yet materially additive
  - benchmark-driven dedupe correction:
    - deterministic fast-attach still requires decisive field agreement
    - it may now also pick one active decisive-field-agreement candidate when
      the other strong matches are already contained non-active siblings
  - current-corpus proof rerun result:
    - active objects: `627 -> 645`
    - support items: `818 -> 895`
    - duplicate active-object candidates: `50`
    - all four proof probes now return `selectedCount = 5`
    - all four proof probes remain active-only
    - context probes now estimate `1309` tokens with pruning still visible but
      bounded
    - projection hashes remain stable
    - artifact hashes remain stable
    - support-only projection churn remains `false`
    - support-only artifact churn remains `false`
    - stable, semi-stable, and volatile cache hashes remain stable on the
      repeated and support-only checks
  - post-proof duplicate audit result:
    - rerun escape cases: `249`
    - duplicate cluster cases: `50`
    - replay-path counts:
      - deterministic attach: `4`
      - batched adjudication: `66`
      - distinct write: `179`
  - benchmark refresh note:
    - the adjudicated benchmark artifact still reflects the last successful
      curated sample (`falseDistinctRateOnReruns = 0.5`)
    - that runner currently anchors on specific rerun object ids, so it does
      not refresh cleanly after every new proof-generated rerun generation
  - updated readiness judgment:
    - retrieval is no longer a blocker
    - rebuild/projection remains proven enough
    - cache behavior remains proven enough on the current proof lane
    - long-horizon duplicate pressure remains the blocker
    - cutover readiness remains `not_ready`
- stabilization-and-operatorization work is now partially complete:
  - document ingestion now contains window-level interpreter failures instead of
    aborting the whole source on transient timeout or malformed-output errors
  - one retry is now allowed for transient `AbortError` or invalid-JSON
    interpreter failures before the window is rejected
  - prompt payloads now expose stable heading-path refs and validation resolves
    those refs back to exact heading arrays before strict provenance checks
  - the stale startup warnings for `plugins.entries.brave`,
    `plugins.entries.browser`, and `plugins.entries.firecrawl` are now removed
    from model-memory runner surfaces through runner-local sanitized config
  - runner-local sanitized config also removes the noisy future-version warning
  - the clean-room document-ingestion runner/service is now callable from the
    OpenClaw plugin tool surface through the optional operator/admin tool
    `model_memory_document_ingest`
  - the tool surface delegates to the real runner/service instead of owning a
    parallel ingestion path
  - the tool surface stays outside the memory-slot mechanism:
    - `model-memory` is not registered as a `kind: "memory"` plugin
    - the current `memory-core` slot remains unchanged
  - live operator smoke evidence now exists:
    - [Document Ingestion Tool Smoke](/projects/model-memory/evidence/document-ingestion-tool-smoke)
  - live smoke result on 2026-04-15:
    - `2 / 2` sources completed
    - `20` canonical claims persisted
    - `0` ignored windows
    - `0` rejected windows
  - prompt/turn proof against 10 real user prompts from this session now
    exists:
    - [Session Turn Proof Prompts](/projects/model-memory/evidence/session-turn-proof-prompts)
    - [Session Turn Proof](/projects/model-memory/evidence/session-turn-proof-nano-nano)
  - the ordinary-turn path has now been corrected to reuse the same shared
    two-pass ingestion framework as document ingestion:
    - `pass_1_candidate`
    - optional `pass_1_repair`
    - `pass_2_canonicalization`
    - optional `pass_2_repair`
  - the prior prompt-only all-ignore result was traced to a repo-owned bug:
    - ordinary-turn capture had drifted into calling canonicalization with no
      candidate set
    - that made `ignore` the structurally expected result on prompt-only turns
  - after restoring the shared path, the 10-prompt proof rerun improved from
    `0` writes to `1` active write:
    - all `10 / 10` prompts still completed
    - `1` captured claim persisted
    - `9` prompt windows still resolved to `ignore`
  - a dedicated durable-prompt stage trace now exists:
    - [Ordinary Turn Durable Prompt Stage Trace](/projects/model-memory/evidence/ordinary-turn-durable-prompt-stage-trace-nano-nano)
  - that durable-prompt trace proves prompt-only turns can now produce memory
    on the live lane:
    - `1` window
    - `4` captured claims
    - `4` active writes
    - pass 1 repair fired because nano returned numeric candidate confidence
      values before the repair pass normalized them
  - the next blocker for broader ordinary-turn proof is therefore prompt-turn
    usefulness and calibration, not a structurally broken extraction path:
    - prompt submission succeeded on all prompt-only probes
    - model responses returned successfully on all prompt-only probes
    - the remaining issue is selective omission on most real prompts, not a
      dead write path
  - a deliberate durable-prompt basket has now been executed on the same live
    ordinary-turn lane:
    - evidence artifacts:
      - [Durable Prompt Proof Prompts](/projects/model-memory/evidence/durable-prompt-proof-prompts)
      - [Durable Prompt Proof](/projects/model-memory/evidence/durable-prompt-proof-nano-nano)
    - observed totals:
      - `10 / 10` prompts completed
      - `14` captured claims
      - `13` active writes
      - `1` contained `ignore` write with decision code `non_durable_ignored`
      - `0` ignored windows
      - `0` rejected windows
    - judgment:
      - the prompt-only lane now captures deliberately durable instructions
        often enough to keep expanding proof
      - that is a stronger bar than the earlier single durable-prompt trace,
        but it does not yet prove broad ordinary-turn capture quality on
        incidental real prompts
  - one large real session prompt was then rerun in isolation with the same
    granular stage trace harness:
    - [Session Prompt 004 Batched Residual Spec Stage Trace](/projects/model-memory/evidence/session-prompt-004-batched-residual-spec-stage-trace-nano-nano)
    - observed totals:
      - `1` window
      - `2` captured claims
      - `2` active writes
      - `0` ignored windows
      - `0` rejected windows
    - judgment:
      - the earlier session-history basket likely understated prompt-only
        usefulness for at least some large durable prompts
      - incidental prompt proof should keep sampling richer prompts rather than
        treating the first 10-prompt basket as the final bar
  - a manual UI smoke pack now exists for human verification:
    - [Manual UI Smoke Pack](/projects/model-memory/evidence/manual-ui-smoke-pack)
    - it includes six prompt-only manual UI probes with expected memory types
      and operator checks
  - the document-ingestion operator surface has now also been smoke-verified on
    the exact roadmap doc the user wants to test manually:
    - [Roadmap Document Ingestion Tool Smoke](/projects/model-memory/evidence/roadmap-document-ingestion-tool-smoke-2)
    - the next broader operator-facing run is now explicitly packaged:
      - [Deep Document Ingest Runbook](/projects/model-memory/deep-document-ingest-runbook)
    - observed totals:
      - `1 / 1` docs completed
      - `6` captured claims on the latest rerun
      - `0` ignored windows
      - `0` rejected windows
    - the exact OpenClaw tool invocation contract is now recorded in that
      artifact and repeated in the manual UI smoke pack
  - operator-surface startup note:
    - the prior `tools.web.fetch.firecrawl` startup validation warning is now
      cleared on the roadmap tool smoke rerun
    - the remaining startup warning is the explicit stale
      `plugins.entries.memory-middleware` entry, which remains intentional
      retirement debt rather than a clean-room regression
  - `plugins.entries.memory-middleware` still appears as an explicit stale
    config warning in model-memory live runs
    - this remains retirement debt, not silently removed state
      from `meta.lastTouchedVersion` on temporary runner configs only
  - `plugins.entries.memory-middleware` remains visible as explicit retirement
    debt instead of being silently erased
  - a first-class clean-room document-ingestion runner/service now exists with:
    - explicit source selection
    - sequential or bounded-concurrency queueing
    - durable JSON run records
    - per-source failure containment
    - resumability by chunk
    - operator-visible status output
- focused reruns after stabilization now show:
  - `docs/help/faq.md` completes successfully on explicit nano/nano through the
    stage-trace lane
  - `extensions/model-memory/src/model-execution.ts` completes successfully on
    explicit nano/nano through the stage-trace lane
  - the affected gateway/template basket completes on the new runner with:
    - docs attempted: `5`
    - docs completed: `5`
    - docs failed: `0`
    - rejected windows: `0`
    - reject reasons: `none`
- the search/match/adjudicate hinge has now been rerun explicitly on the
  representative failure basket:
  - [AGENTS Collision Hinge Trace](/projects/model-memory/evidence/agents-md-collision-hinge-trace)
  - [Testing Collision Hinge Trace](/projects/model-memory/evidence/docs-help-testing-md-collision-hinge-trace)
  - [Gateway Configuration Collision Hinge Trace](/projects/model-memory/evidence/docs-gateway-configuration-md-collision-hinge-trace)
  - observed direction:
    - `docs/gateway/configuration.md` improved materially:
      - `attach_support` rose from `1` to `6`
      - `conflict_hold` dropped from `7` to `0`
    - `docs/help/testing.md` improved modestly:
      - `attach_support` rose from `1` to `3`
    - `AGENTS.md` remains under-attached:
      - `14` raw-candidate cases were still pruned to zero on the rerun
      - one-candidate residual handling still produced a `conflict_hold`
        outcome
- the fresh full proof phase now completes end-to-end and emits artifacts:
  - [Proof Phase Report](/projects/model-memory/evidence/proof-phase-report)
  - [Proof Phase Adjudication](/projects/model-memory/evidence/proof-phase-adjudication)
  - clean-run totals:
    - canonical objects persisted: `543`
    - support items persisted: `546`
    - active objects: `489`
    - `conflict_hold` objects: `52`
    - write decisions:
      - `write = 541`
      - `attach_support = 29`
      - `ignore = 18`
      - `supersede = 2`
  - fresh saturation signals:
    - run 1 = `objectDelta 41`, `attach_support 3`
    - run 2 = `objectDelta 16`, `attach_support 3`
    - run 3 = `objectDelta 32`, `attach_support 7`
  - compared with the pre-fix partial baseline:
    - run 1 had been `objectDelta 32`, `attach_support 0`
    - run 2 had been `objectDelta 36`, `attach_support 0`
  - readiness remains `not_ready`
    - current blockers:
      - retrieval probes fail with live nano provider `400` responses
      - context assembly remains unproven because retrieval did not complete
      - support-only rebuild/projection churn is still present
      - cache stability remains unproven

## In progress

- the next active phase is targeted downstream blocker proof:
  - diagnose why the nano retrieval-request lane returns provider `400`
    responses during clean-room proof probes
  - restore honest retrieval/context evidence on the populated corpus
  - determine why support-only writes still churn projections and context
    artifacts
  - determine whether cache-layer hashes stabilize once retrieval/context
    probes are operational again
  - keep tightening the collision hinge on the remaining `AGENTS.md`
    under-attachment cases without weakening merge authority
  - keep large real-source proof admission separate from population success
  - keep `memory-middleware` retirement debt explicit until legacy retirement is
    executed deliberately

## Not started

- migration/export tooling for legacy workspace memory
- cutover runbook
- rollback runbook
- VPS purge runbook
- large-document audited execution wave that persists admissible canonical
  objects

## Risks

- prompt quality can become the new hidden architecture if not treated as a versioned contract
- proof can regress into exact-text replay if fixture policy is not enforced
- identity rules can become a new semantic forest if fuzzy merge leaks into the write path
- projection or context layers can become a second ontology if they are not kept explicitly derived
- projection activation can still lose human-owned workspace content if the generated-zone boundary is weakened later
- cutover can accidentally promote projections, retrieval packs, or shadow reports into truth if the canonical-object boundary is not held
- live rollout can drift into indefinite coexistence if shadow-readiness evidence does not become an explicit gate for replacement and deletion
- retirement can drift into indefinite coexistence if the deletion phase is not treated as a hard exit criterion
- large-document ingestion can create false confidence if the test inventory
  stays too small, too synthetic, or too biased toward known-good internal
  wording
- live large-document extraction is no longer at total failure on Tier 1
  sources, but the rerun-created-new-objects behavior shows the project is
  still blocked on large-source bounded convergence, duplicate identity
  quality, and proof admission quality
- fixed request seeds do not currently yield stable large-document candidate
  sets even on the bounded `gpt-5-mini` comparison lane, but exact candidate
  stability is no longer treated as the proof bar; the live blocker is whether
  aggregate active growth, runtime cleanliness, and downstream usefulness stay
  bounded enough to trust real-source cases
