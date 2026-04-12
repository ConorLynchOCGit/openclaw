# Current Slice

## Active slice

Broad runtime-core refactor follow-through

Latest structural runtime follow-through:

- canonical profile-registry consolidation for family-era runtime tables
- shared submission/profile routing helpers for canonical and legacy metadata
- shared lifecycle/semantic metadata builders across tool-submit and
  ordinary-turn capture
- extracted managed normalization from `candidate-submit.ts` into a dedicated
  stage module
- extracted managed ingest-resolution and transcript-context recovery from
  `candidate-submit.ts` into a dedicated stage module
- replaced the front-end ordinary-turn detector forests with explicit detector
  registries plus a shared runner
- moved candidate-submission persistence planning out of `db/queries.ts`
- centralized retrieval scope semantics and project-family classification into
  shared helpers instead of letting query and retrieval seams carry private
  copies
- reduced remaining inline literal policy branching in
  `candidate-submit.ts` and `ordinary-turn-auto-capture.ts` into closed helper
  tables where the runtime behavior was already shared
- derived active-memory slot normalization from approved canonical memory
  records as a shared runtime truth layer
- rebased native file projections onto active-memory slots instead of compiling
  directly from raw approved objects
- added compiled user/project memory packs through `before_prompt_build` so
  approved memory can affect default turn assembly without rewriting the
  harness
- added prompt-report and soak-telemetry visibility for attached memory packs
- added a closed-loop outcome proof tracker that records:
  - pack attachment
  - response observation
  - turn-boundary survival without repeat correction
  - repeated corrections against previously attached approved memory
  - learned-guidance alignment with already attached approved sources
- added prompt-artifact diagnostics that split:
  - full final system prompt
  - base non-memory prompt
  - attached memory-pack segment
  - injected workspace/skills/tool artifacts
- surfaced those prompt-artifact diagnostics through `/context detail` so
  cache-relevant prompt churn is visible without raw trace inspection
- added session-level prompt-artifact drift classification so a run can now say:
  - what changed versus the previous run
  - whether only the tail changed
  - whether the stable prefix is still reusable for cache planning
- extended soak summaries from attached-pack counts to attached-pack outcome
  rates so later soak analysis can judge effectiveness instead of raw volume
- hardened active-memory slot phrasing so supported response-style memory lands
  as stronger canonical directives instead of softer paraphrase variants
- tightened pack selection so weaker paraphrases are suppressed in favor of the
  stronger surviving constraint rather than only exact selection-key dedupe
- upgraded attached-pack outcomes to distinguish:
  - proxy next-turn survival without a clear application signal
  - explicit application alignment with attached approved memory
  - explicit application misses where a run used different guidance
  - survival after explicit application
  - contradiction after explicit application

## Objective

Bridge durable memory into normal turn assembly through normalized slots and
compiled packs while preserving the existing Postgres-ledger and native-file
projection model.

## What is now landed

### Native memory projection tranche

- projection-surface inventory hardening
- approved-only destination eligibility
- deterministic generated-zone compiler scaffolding
- shared `USER.md`, `TOOLS.md`, and compact `MEMORY.md` projections
- canonical `memory/YYYY-MM-DD.md` continuity compiled from raw dated leaves
- project-local `projects/<slug>/MEMORY.md` projections plus top-level digest
  pointers
- projection audit / omission / drift reporting
- explicit circularity protection in native file indexing
- metadata-first shared/project/agent scope classification
- first specialized-agent projection tranche for real specialized workspaces
- explicit allowlisted project rollout for real workspace project folders
- project-local projections now target real allowlisted `projects/<slug>/INDEX.md`
  docs by default, with `MEMORY.md` only as a compatibility fallback
- operator-facing projection summary output alongside machine-readable audit
- daily operator-review integration for projection state
- host-cron scheduled projection refresh plus a hardened manual sync command
- broader specialized-agent rollout for `x-manager` and `web-researcher`
- metadata-first project precedence for project-scoped agent memory
- stale-aware host-side projection orchestration and status reporting
- no schema change was required for the broader native-file tranche
- active-memory slot compilation from approved durable memory records and
  validated procedures
- shared middleware context-control-plane port that compiles:
  - user memory packs
  - project memory packs
  - optional procedure packs
- middleware `before_prompt_build` injection of approved durable-memory packs
- session prompt-report parsing of compiled memory-pack sections
- soak-telemetry counters for memory-pack attachment volume
- session-local outcome-proof telemetry for attached-pack follow-through and
  repeated-correction proxies

### Landing-gate hardening

- constrained full-repo safe mode for local low-memory hosts
- smaller full-repo unit batches
- serial top-level execution in constrained safe mode
- higher default worker heap budget in constrained safe mode
- planner output now makes the safe-mode decision visible

### Long-prompt memory-capture expansion tranche

- ordinary-turn auto-capture now scans a larger bounded segment pool for long
  prompts instead of the old fixed 12-segment ceiling
- capture now builds and ranks a bounded candidate pool before deciding what
  gets immediate acceptance
- immediate acceptance is still bounded, but now uses posture-aware total caps
  plus per-family caps
- lower-ranked valid candidates now persist as deferred overflow evidence
  instead of being dropped on the floor
- repeated prompts can promote deferred overflow candidates instead of
  resubmitting only the strongest already-approved candidates forever
- explicit multi-preference and multi-fact packets can enter a stronger bulk
  posture while ordinary shorter prompts stay on the tighter default posture
- no schema change was required for the deferred-overflow tranche

## Current emphasis

- the current execution slice is Pass 1 of the model-native completion program
  in `/memory-system/specs/model-native-memory-architecture-program`
- land the Pass 1 slice pack directly:
  - `/memory-system/specs/structural-normalization-cleanup`
  - `/memory-system/specs/unified-source-envelope-contract`
  - `/memory-system/specs/shared-provenance-model`
  - `/memory-system/specs/model-interpretation-contract-v2`
  - `/memory-system/specs/live-model-benchmark-harness`
  - `/memory-system/specs/gold-judgment-corpus`
  - `/memory-system/specs/model-calibration-lane`
  - `/memory-system/specs/heuristic-block-typing-retirement`
- treat normalization as structural-only and push semantic class ownership to
  the model interpretation seam
- treat live-model benchmarking plus the maintained gold corpus as the primary
  truth surface for Pass 1 acceptance, not rule-based semantic surrogate tests
- keep runtime semantic cutover, broader heuristic retirement, context-planner
  convergence, prompt/cache/compaction redesign, DB-native ingestion, and soak
  proof deferred to Pass 2 and Pass 3
- pause the bounded conversational lane for soak instead of widening the
  runtime again immediately
- watch whether the sharpened packs are now specific enough to change behavior
  instead of merely surviving as soft guidance
- watch whether explicit application signals now track useful memory or expose
  persistent misses and contradictions
- keep prompt-artifact hashes and segment sizes truthful so soak conclusions
  can still explain prompt churn instead of guessing
- keep wider memory classes, corpus ingestion, and broader agent-scoped memory
  deferred until this soak says the current bridge is genuinely earning them
- keep the next architecture step visible in
  `/memory-system/specs/shared-source-normalization-and-block-typing`:
  shared source normalization and candidate block typing ahead of the canonical
  resolver family, so document ingestion and ordinary-turn capture stop
  diverging too early
- keep the model-first semantic follow-on visible in
  `/memory-system/specs/model-driven-semantic-interpretation` if the lane
  chooses to replace heuristic first-pass semantic detectors instead of merely
  reshaping their inputs
- keep the full three-pass model-native completion program visible in
  `/memory-system/specs/model-native-memory-architecture-program` so the repo
  does not lose the complete end-state just because it now needs staged
  landing discipline

## What the soak period is for

- verify whether the currently landed capture, retrieval, projection, and
  operator surfaces are behaving well under real usage
- record enough evidence to judge which future memory features are actually
  worth building next
- avoid pretending the remaining roadmap items are already scheduled next
  phases before soak evidence exists

## What evidence should be collected during soak

- long-prompt capture counts:
  - candidate-plan counts
  - `default` vs `bulk` posture usage
  - immediate acceptance counts
  - deferred overflow counts
  - per-family immediate distribution
- repeated-prompt follow-through:
  - deferred overflow promotions
  - duplicate suppression behavior
  - observed starvation cases, if any
- retrieval/application outcomes:
  - when attached memory was only present versus explicitly applied
  - when explicit application aligned with the attached approved memory
  - when explicit application missed the attached memory
  - when a run survived after explicit application
  - when a run was contradicted after explicit application
  - when the wrong memory shape dominated
- operator burden:
  - false-positive candidates
  - low-value captures
  - missing observability or confusing logs
- performance:
  - capture-heavy prompt cost
  - any obvious DB/query or memory-tool hot spots

## What tracking exists today

Directly instrumented today:

- durable soak lifecycle telemetry now writes bounded JSONL event history under
  `.local/memory-soak/events/YYYY-MM-DD.jsonl`
- durable soak summary artifacts now write:
  - `.local/memory-soak/latest-summary.json`
  - `.local/memory-soak/latest-summary.md`
  - `.local/memory-soak/history/summary-<timestamp>.json`
  - `.local/memory-soak/history/summary-<timestamp>.md`
- ordinary-turn soak events now capture:
  - candidate-plan counts
  - `default` vs `bulk` posture
  - accepted capture counts
  - deferred overflow counts
  - duplicate suppression and missing-attribution suppression
  - corpus-ingestion demand signals from long prompt shape
- retrieval/application soak events now capture:
  - hybrid retrieval result counts
  - approved vs candidate vs validated distribution
  - family and scope distribution
  - specificity override and wrong-shape dominance proxies
  - filtered-by-scope and suppressed-conflict counts from learned guidance
  - attached-pack outcomes:
    - response observation after attachment
    - next-turn proxy survival without repeat correction
    - explicit application alignment with attached approved sources
    - explicit application misses against attached approved sources
    - survival after explicit application
    - contradiction after explicit application
    - repeated corrections after attached memory
- review/promotion soak events now capture:
  - candidate review outcomes
  - deferred-overflow promotions
  - memory vs procedure promotion paths
- projection runs already report:
  - selected vs omitted items
  - unmatched project mappings
  - drift / generated-zone repair visibility
  - destination char-budget usage
- projection/orchestration soak events now capture:
  - native sync run posture and scopes
  - projection changed/omitted/skipped/unmatched counts
  - session-memory density and compaction-pressure demand signals
- operator-facing soak inspection now exists through:
  - `pnpm memory:soak:report`
  - `pnpm memory:native:sync --format summary`
  - the concise daily-brief line emitted from the soak summary

## What is still partial or proxy-based

Still not fully automatic or not fully certain:

- final answer use for generic hybrid retrieval remains proxy-only unless the
  application seam is explicit
- user acceptance is still inferred through bounded proxies such as later
  correction behavior rather than a dedicated acceptance event
- “missed useful memory” is still measured through truthful proxies such as
  no-guidance-despite-retrieval and stronger-scope-below-top retrievals
- alias/entity/relation problems are measured as demand signals, not through a
  separate graph layer
- corpus-ingestion demand is measured from prompt/session/compaction signals,
  not from an actual bulk-ingestion pipeline

So the soak period now has durable end-to-end evidence for the main deeper
questions around capture, retrieval, application, scope, review burden, and
future corpus-ingestion demand, while still keeping a few higher-judgment
questions explicitly proxy-based.

## What is live but still bounded

- Postgres remains canonical durable memory
- active-memory slots now sit between the Postgres ledger and both:
  - native compiled file projections
  - per-turn compiled memory packs
- native files remain one-way projections plus human-authored control surfaces
- shared top-level `MEMORY.md` stays compact and pointer-oriented
- project-local rollout starts from an explicit workspace allowlist rather than
  every project folder
- specialized per-agent projections stay narrow and only target justified
  workspaces
- raw daily leaves remain continuity inputs; the exact-day file is a compiled
  continuity view, not canonical durable memory
- scheduled projection refresh is daily host cron plus manual sync, not per-turn
  mutation
- stale-aware refresh is host-side and bounded; it is not native runtime cron
  and not per-turn mutation
- per-turn durable-memory use now goes through compiled packs injected at prompt
  build time, not raw ad hoc retrieval dumps
- ordinary-turn immediate acceptance is still intentionally bounded even in
  bulk posture
- deferred overflow is now durable evidence, but it is still a bounded queue
  rather than an unbounded write path
- repeated prompts can promote deferred overflow candidates, but this is still
  confirmation-based and not broad autonomous approval
- remaining future memory work is now intentionally unscheduled until the soak
  evidence says what is worth doing next

## What still waits until later

- all remaining future memory work now lives in the unscheduled potential
  actions block in `docs/memory-system/memory-roadmap.md`
- nothing in that block should be treated as a scheduled next phase until the
  soak period is complete
- after soak, and after any soak-found defects are fixed, the first candidate
  to schedule should be a separate corpus-ingestion-and-compilation capability
  for larger sources such as papers, repos, or research packs
- that corpus-ingestion capability is not an extension of the current bounded
  one-sentence conversational memory path
- fuller agent-scoped memory should be revisited during the upcoming
  multiagent architecture, delegation, and workflow tranche rather than
  scheduled ahead of it
