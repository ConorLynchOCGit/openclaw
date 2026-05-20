---
summary: "Stable decisions for the model-memory clean-room project."
title: "Model Memory Decisions"
---

# Model Memory Decisions

## 2026-05-17 - Memory toolification must be staged, not one-shot schema output

Decision:

- Model Memory capture, retrieval, context-pack assembly/insertion,
  compaction, and proactivity must use staged runtime tools.
- the model owns memory usefulness, durability, conflict/supersession,
  relevance, context-pack usefulness, compaction loss/risk, and opportunity
  quality judgments.
- runtime owns memory ids, source refs, context-pack refs, route budgets, MMV2
  write refs, Work Queue candidate refs, cooldowns, idempotency, raw-storage
  rejection, authority boundaries, lifecycle separation, and tool traces.
- memory and proactivity cannot grant authority, approval, deployment,
  outbound send permission, model promotion, runtime job success, or Work Queue
  lifecycle mutation.

Reasoning:

- the Execution Platform orchestration work proved that asking a model to
  hand-author runtime-owned envelopes creates schema choke and brittle repair
  loops.
- memory capture and retrieval are high-frequency, high-impact model-heavy
  surfaces, so they need the same staged working interface before being treated
  as maximally production-wired.
- using memory-specific tools over the Runtime Tool-Call Kernel preserves MMV2
  semantic truth while giving operators traceable capture, retrieval,
  context-pack, compaction, and proactivity evidence.

## 2026-05-16 - Runtime tools become the memory execution evidence layer

Decision:

- MMV2 SQL remains the semantic source of truth for durable memories.
- Execution Platform runtime jobs remain lifecycle truth for workflow
  execution.
- Runtime Tool-Call Kernel traces become the canonical evidence layer for
  memory capture, retrieval, context-pack assembly/insertion, compaction,
  proactivity extraction/adjudication, and Work Queue projection steps.
- Existing model-task and DB-operation refs must become compatibility facades
  over runtime tools or retire from production-primary memory evidence.
- Work Queue memory readback must cite runtime tool invocation refs and
  bounded artifacts, not only middleware refs.
- Deterministic code validates shape, refs, bounds, storage flags, authority,
  lifecycle separation, idempotency, and cooldowns. Model-authored or
  owner-authored review judges semantic usefulness.

Reasoning:

- the memory runtime was hardened before the Runtime Tool-Call Kernel existed,
  so it still has middleware-shaped evidence paths that can understate whether
  production execution is truly toolified
- keeping middleware as a parallel truth layer would recreate the same drift
  that the Execution Platform has been removing from Work Queue, closeout, and
  workflow execution
- memory and proactivity are high-value surfaces for owner context, so their
  production evidence must be traceable through the same runtime tool substrate
  as coding, planning, validation, and closeout work

## 2026-05-01 - Model-owned judgment is a standing Phase 2 rule

Decision:

- the deterministic-judgment cleanup is now a standing Phase 2 architecture
  boundary, not a temporary pre-Milestone-4 cleanup activity
- all remaining Phase 2 buckets must follow
  [Phase 2 Model-Owned Judgment Policy](/projects/model-memory/specs/phase-2-model-owned-judgment-policy)
- deterministic code may own ids, refs, hashes, schemas, caps, redaction,
  source authority, lifecycle state, cooldowns, exact structural dedupe,
  structural packet/window assembly, deterministic retrieval recall,
  structural graph/capsule/projection assembly from already-adjudicated inputs,
  route isolation, operational failure taxonomy, and post-model validation
- model or operator review owns memory-worthiness, semantic admission,
  correction/supersession/collision beyond exact refs, topic/entity/workflow
  identity, semantic graph edges, skill/proactivity classification, surfacing
  value, visible copy, usage-based skill improvement, and final context-pack or
  capsule inclusion
- every remaining Phase 2 build slice must prove that unavailable, invalid,
  ungrounded, or unsafe model output becomes pending, quarantined, blocked,
  demoted, or absent rather than falling back to deterministic semantic logic
- packet construction must remain contiguous and structural. It may cap,
  redact, segment, and preserve refs, but it must not prune for
  interestingness, usefulness, relevance, memory-worthiness, skill-worthiness,
  or proactivity value
- skill parity work must also follow this boundary: resolver checks, package
  shape, exact trigger fixtures, install paths, canary state, and rollback
  metadata may be deterministic, but skill-worthiness, skill-vs-plan choice,
  promotion recommendation, and self-improvement decisions are model-owned or
  operator-owned

Reasoning:

- the pruning pass proved that deterministic judgment can reappear in packet
  construction, proof fixtures, presentation copy, feedback loops, and helper
  wrappers unless the boundary is applied across every future Phase 2 slice
- graph, capsules, retrieval, planner surfacing, skills, and usage-based
  self-improvement all require semantic judgment; pushing that judgment back
  into deterministic keywords, scores, or telemetry would recreate the same
  debt under new names
- making the policy explicit lets Milestone 4 skill evals and later Phase 2
  memory work optimize model-owned behavior without legitimizing deterministic
  semantic shortcuts

## 2026-04-30 - Phase 2 needs model-owned semantic graph enrichment

Decision:

- Phase 2 includes graph/capsule/retrieval work, but the semantic graph
  enrichment layer must be an explicit build slice rather than an implied
  property of the structural runtime graph
- the existing graph substrate remains derived runtime state, not canonical
  memory truth
- a new Phase 2 semantic graph enrichment slice will add model-owned
  extraction and adjudication of topic, entity, subject, workflow, pattern, and
  relationship nodes from admitted MMV2 memories and bounded source packets
- deterministic graph code may build structural nodes and edges from ids, refs,
  source lineage, explicit memory edges, scopes, projects, documents,
  artifacts, hashes, and lifecycle state
- deterministic graph code must not decide topical sameness, semantic subject
  identity, pattern membership, workflow relationship, or same-entity truth from
  keywords, embeddings, or string overlap as final authority
- model-owned graph enrichment may propose `mentions`, `same_entity_as`,
  `supports`, `depends_on`, `used_in_workflow`, `uses_skill`, `refines`,
  `summarizes`, and topic/pattern membership edges when each proposal carries
  evidence refs into admitted memory/source windows
- deterministic validation may enforce schema shape, known node ids, allowed
  edge types, source refs, evidence quote anchoring, caps, provenance, source
  authority, safety, lifecycle eligibility, and explicit conflict/pending
  states
- ambiguous or weak model graph proposals remain probationary, pending review,
  or blocked; deterministic code must not promote them into durable semantic
  graph truth
- retrieval may use validated semantic graph nodes and edges as candidate
  recall signals, but final context-pack/capsule/context-injection inclusion
  remains model-owned
- this slice is Phase 2 scope, but it is not a pre-Milestone-4 requirement
  unless retrieval/capsule quality depends on semantic graph grouping before
  Milestone 4 prep

Reasoning:

- the current runtime graph can represent relationships, source lineage, and
  edge authority tiers, but it does not yet create a durable model-owned topic
  or entity map such as "Memory A and Memory F are both about agent
  delegation"
- leaving this implicit risks either underpowered graph retrieval or a later
  reintroduction of deterministic topic clustering
- making the slice explicit preserves the Phase 2 goal of richer graph/capsule
  retrieval while keeping semantic identity and pattern mapping model-owned

## 2026-04-30 - Schema/code-like source text must reach model-owned capture

Decision:

- MMV2 atomic extraction must not skip routed `code_block` or schema-like text
  before model review
- schema/code-heavy text can contain durable instructions, project facts,
  source references, or operational decisions, so memory-worthiness remains a
  model-owned decision
- deterministic code may still validate model output after the model responds:
  schema shape, supported payload type, exact source segment refs, exact
  evidence quote containment, caps, redaction, source authority, and unsafe
  output demotion
- if model output from schema/code-heavy text is malformed, ungrounded,
  unsupported, unsafe, or unrepaired, the result is empty/pending/quarantined by
  the existing validation path; deterministic code must not pre-judge the
  source text as not memory-worthy
- live proof for the model-owned memory replacement architecture follows local
  scripted validation and must exercise provider behavior plus real Codex source
  availability or report Codex as explicitly degraded

Reasoning:

- the deterministic-judgment pruning pass removed broad semantic fallback
  behavior, but a residual structural filter still hid schema/code-like routed
  candidates from the atomic model
- that filter was a potential packet-construction judgment layer: it could
  prevent valid model-owned capture before the model had a chance to decide
- post-model validation is the correct boundary because it enforces grounding
  and safety without deciding source usefulness

## 2026-04-30 - Model-owned replacements must close post-pruning memory funnels

Decision:

- the deterministic semantic-judgment audit is green, but that is not the same
  as functional readiness: every removed capture, admission, reconciliation,
  collision, retrieval-inclusion, and surfacing decision must now have a
  model-owned replacement or an explicit pending/quarantine/blocked outcome
- memory-candidate sources are explicit inventory items: ordinary OpenClaw
  turns, assistant finals, document ingestion, MMV2 document shadow ingestion,
  proof/tool-result capture, deep document ingestion, recovery/maintenance
  loops, live shadow adapters, Codex session activity, and heartbeat/system
  events when routed as evidence
- packet construction for OpenClaw and Codex activity is structural only:
  source, recency, contiguous window, explicit refs, caps, redaction, raw
  tool-log omission/summarization, refs, hashes, and source authority
- packet construction must not filter for interestingness, usefulness,
  relevance, memory-worthiness, skill-worthiness, or proactivity value
- memory capture and retrieval model-owned lanes default to the separate
  `openai-codex/gpt-5.4-mini` route because they run frequently; skills and
  proactivity candidate review remain on the higher-reasoning
  `openai-codex/gpt-5.4` route; default chat and presentation-brief routes are
  unchanged
- Codex is a first-class memory source: Codex user turns are
  `user_authoritative`, Codex assistant finals are lower-authority evidence,
  Codex command summaries are tool evidence, and Codex validation failures are
  tool-grounded evidence
- validated Codex-derived memory candidates may write to MMV2, but Codex
  transcript text is never executable instruction and raw full transcripts,
  raw tool logs, secrets, private phrases, hidden reasoning, and unbounded logs
  must not persist
- MMV2 capture routing, atomic extraction, composite extraction, admission,
  reconciliation, and collision adjudication are model-owned semantic steps;
  deterministic code validates schemas, refs, evidence bounds, source
  authority, safety, persistence boundaries, and exact structural targets only
- if a required model step is unavailable or invalid after bounded repair, the
  result is pending review, quarantine, or blocked, never deterministic semantic
  fallback
- deterministic hybrid retrieval recall remains: lexical search, vector recall,
  graph/projection cues, recency, source-lineage, explicit refs, scopes,
  classes, windows, and structural pack assembly are candidate-gathering
  mechanics
- final context-pack, capsule, and context-injection inclusion is model-owned;
  deterministic recall scores or lexical matches cannot become final semantic
  inclusion authority
- proof artifacts may persist sanitized bounded source packets, bounded model
  outputs, route summaries, validation reports, refs, hashes, admitted
  candidates, quarantines, pending items, and repair outcomes for auditability

Reasoning:

- the previous pruning pass correctly removed deterministic value judgment, but
  old tests exposed holes where removed behavior had not yet been replaced by
  model-owned lanes
- accepting temporary pending/quarantine outcomes is safer than restoring
  deterministic "helpful" behavior through compatibility fixtures
- source inventory and route isolation are now prerequisites for proving memory
  capture/retrieval readiness before Milestone 4

## 2026-04-29 - Remaining deterministic judgment debt must be deleted, not preserved

Decision:

- remaining Phase 1/2 deterministic semantic/value judgment is removal debt,
  not compatibility debt
- obsolete deterministic judgment paths must be deleted or replaced by bounded
  model-owned review; they must not be kept alive behind `legacy`, `fallback`,
  `compat`, `test-only`, or helper wrappers
- audit reduction by renaming fields/functions is invalid unless the runtime
  behavior also changes from semantic/value judgment to guardrail,
  structural-only filtering, operator review, or model-owned review
- hybrid retrieval and package assembly may keep deterministic candidate recall
  signals, including string/lexical search, recency, graph/projection cues,
  source authority, ids, refs, scopes, lifecycle, windows, and budgets
- those deterministic retrieval signals are recall inputs, not final value
  judgment; model-owned review or explicit operator review decides what belongs
  in any final context pack when semantic fit matters
- proactivity feedback may record explicit operator controls and safety
  suppression, but it must not infer usefulness or semantic truth from
  telemetry
- visible cards require model-authored title, purpose, and next-step copy; if
  that path is unavailable or invalid, the item is demoted rather than shown
  with deterministic fallback prose
- tests and proof scripts that assert old deterministic judgment behavior must
  be deleted or rewritten around model-owned judgment and deterministic
  guardrails
- strict audit passing is required but not sufficient; code review must confirm
  bad behavior was removed rather than renamed, moved, or packed into
  compatibility helpers
- intentional deletions of deterministic judgment compatibility paths should
  not be restored without a new decision record explaining why the restored
  behavior is guardrail-only or model-owned

Reasoning:

- prior repair passes repeatedly moved subjective judgment into new
  deterministic seams
- this pass should make the memory/proactivity codebase lighter and more stable
  by deleting obsolete paths, not adding scaffolding around them
- deterministic guardrails remain necessary, but deterministic value judgment
  is not scalable for memory capture, candidate discovery, retrieval relevance,
  or human-facing card quality

## 2026-04-29 - Deterministic semantic judgment requires audit and golden-corpus validation

Decision:

- deterministic code has not been stripped out of the whole memory stack, and
  it should not be
- deterministic guardrails remain correct for ids, hashes, schemas, caps,
  redaction, source authority, provenance, cooldowns, dedupe, persistence
  boundaries, projection materialization, and unsafe-output demotion
- deterministic code must be audited when it decides meaning, usefulness,
  candidate classification, ranking, or surfacing without model review
- the audit posture is aggressive, not neutral: runtime deterministic value
  judgment is presumed unsafe at scale unless proven to be an explicit guardrail
  or structural retrieval constraint
- audit classifications are:
  - `runtime_elimination_debt`
  - `test_enshrinement_debt`
  - `valid_guardrail`
  - `acceptable_structural_retrieval_logic`
  - `fixture_reference_noise`
- `runtime_elimination_debt` and `test_enshrinement_debt` are failing debt, not
  informational findings
- tests and proof scripts that assert deterministic semantic behavior are debt
  because they preserve the old architecture even when production code is moved
- audit reporting separates runtime elimination debt from test/fixture prose so
  the priority list targets production Phase 1/2 memory code, not scaffolding
- a strict audit mode may fail when deterministic value-judgment debt remains,
  so the team can make removal/model-routing work a real gate before further
  Phase 1/2 memory promotion
- skill/proactivity candidate validation must use a golden corpus of real
  OpenClaw and Codex episodes with expected candidates, expected demotions, and
  expected no-candidate outcomes
- each golden-corpus case must preserve the sanitized packet and ask whether
  packet assembly kept enough narrative context to recover the expected
  candidates
- validation must attribute misses to the failing seam: packet too thin, model
  missed the expected candidate, post-model validation suppressed the candidate,
  unexpected candidate, or no-candidate expected
- local function tests and golden-corpus validation run before any live gateway
  rebuild; the gateway is rebuilt only after the underlying packet, reviewer,
  validator, and presentation paths pass and the remaining question is UI
  wiring
- shadow-mode live review should later record sanitized packets, model
  proposals, demotions, surfaced items, and operator grading so false negatives
  can be traced to packet assembly, model review, validation/dedupe, or card
  presentation

Reasoning:

- model-reviewed candidate discovery cannot be declared correct from one live
  proof because failures can still occur before, inside, or after the model
  call
- auditing deterministic semantic judgment is different from removing
  deterministic safety controls
- prior repair passes repeatedly moved subjective judgment into new
  deterministic layers; the safe posture is to remove those value judgments,
  move them behind bounded model review, or replace them with explicit
  structural filters
- a golden corpus gives the team a repeatable way to test recall, precision,
  classification, and usefulness without repeatedly rebuilding the live
  gateway

## 2026-04-29 - Skill and proactivity candidate review uses high-context episodes

Decision:

- skill/proactivity candidate review is not memory capture and must not be
  optimized as frequent atomic extraction
- candidate-review packets must be contiguous work episodes; deterministic code
  must not select semantically "interesting" snippets as a substitute for model
  judgment
- OpenClaw review input preserves the last configurable number of full
  user/assistant turns, and Codex review input preserves a contiguous session
  window with user asks, assistant finals, command/validation summaries, touched
  areas, and outcomes where available
- live review runs less often by structural cadence: heartbeat/operator
  briefing, every 3 assistant finals by default, session/compaction boundary,
  and a future manual review hook
- the review packet uses larger capped `episodeTurns` so the reviewer can reason
  over coherent OpenClaw and Codex work episodes
- Codex session activity is first-class bounded input when available, because
  implementation and validation work often happens in Codex
- candidate review returns 0-3 high-impact proposals and prefers no candidate
  over marginal cleanup
- sanitized episode packet artifacts may be persisted for auditability, but raw
  full transcripts, raw prompts, raw model responses, raw tool logs, secrets,
  private phrases, hidden reasoning, and unbounded session logs remain
  forbidden
- model-reviewed candidates are proposals only; they cannot write canonical
  memory truth, install/promote skills, execute actions, send messages, or
  mutate files
- visible proactivity cards must use model-authored presentation copy. If the
  model-authored presentation route is disabled, unavailable, invalid, or
  unclear, deterministic fallback text must demote/hide the item rather than
  become visible primary copy.

## 2026-04-28 - Candidate discovery uses bounded model-reviewed episodes

Decision:

- candidate discovery for skills and proactive plans may use a two-stage
  model-reviewed episode workflow
- Stage 1 is deterministic and only decides whether it is worth asking a model
  to evaluate a recent-work window
- Stage 1 is structural only: assistant finals, heartbeat/session boundaries,
  validation/proof failures, and card-quality or dismissal events may start the
  review path, subject to budget and cooldown controls
- Stage 1 must not use skill/proactivity/candidate/workflow keywords,
  correction phrases, recurring-work phrases, topic labels, or turn-count
  thresholds as gates or hints
- Stage 2 is a bounded model trigger evaluator that chooses whether candidate
  review should run, which refs are included, and whether the goal is skills,
  proactivity, both, or none
- accepted trigger decisions build a bounded episode packet that may include
  capped recent user turns, assistant finals, card diagnostics, activity
  summaries, validation summaries, loaded skill metadata, candidate summaries,
  and Codex session excerpts/summaries
- a candidate-review model may propose proactive plans, new skill candidates,
  existing-skill enhancements, merge/extend candidates, and demotions
- deterministic code remains authority for allowed refs, caps, no-dark-data,
  cooldowns, max calls, schema, provenance, dedupe, and persistence eligibility
- model outputs are proposals, not semantic truth, and cannot mutate canonical
  memory, execute actions, install/promote skills, send messages, mutate files,
  or become fuzzy duplicate authority
- default chat, model-memory capture/retrieval, proactivity presentation, trigger
  evaluation, and candidate review must remain separate model routes

Reasoning:

- deterministic surfacing can detect some repeated structure, but it cannot
  reliably answer subjective usefulness questions such as what recurring work
  should become a skill or what next step would help now
- recent transcript context improved candidate quality because it preserved the
  actual work episode, including user critique and assistant outcomes
- no-dark-data is preserved by forbidding raw full transcript/tool-log
  persistence while allowing bounded live model inspection of recent work

## 2026-04-28 - Model-authored proactivity briefs are allowed as presentation-only output

Decision:

- `UserFacingProactivityBrief` primary copy may be authored by a bounded model
  rewrite/evaluation step when model-authored briefing is enabled
- the model receives typed bounded proactivity context only; raw prompts, full
  transcripts, raw tool logs, secrets, private phrases, and unbounded session
  text remain forbidden prompt input and persisted output
- the first model-backed runtime target is the separate proactivity
  presentation route `openai-codex/gpt-5.4` with strict JSON output, medium
  reasoning, low verbosity, bounded timeout, and small output limits; this does
  not change the strict MMV2 capture/retrieval defaults
- deterministic schema, no-dark-data, boundedness, repetition, generic-copy,
  and unsafe-claim validators remain mandatory after model output
- model-authored briefs are presentation-only and cannot mutate canonical
  ledger truth, dedupe state, supersession state, lifecycle state, memory,
  skill packages, install state, action execution, or outbound sending
- if the model cannot produce a clear title naming a capability, decision, or
  outcome; a purpose explaining what the item does or unlocks; and an
  actionable next step that does not repeat the title, the item is demoted
  rather than surfaced
- telemetry and proof may store prompt/response hashes, model id, elapsed time,
  validation status, and bounded reason codes, but not raw model prompts or raw
  responses

Reasoning:

- deterministic presentation rules are necessary safety guardrails, but they
  cannot reliably decide whether a card is intelligible to an operator
- this remains outside semantic forest behavior because the model output is not
  canonical truth and has no authority over retrieval, memory writes, dedupe,
  correction, or lifecycle state

## 2026-04-28 - Skills move forward as a proactivity-integrated lifecycle system

Decision:

- the Skills bucket now proceeds as a proactivity-integrated lifecycle system,
  not as a separate inbox or isolated install workflow
- skill candidates are bounded proactivity opportunities with shared canonical
  ids across inline surfacing, heartbeat, inbox, and handoff
- Codex sessions may be used as bounded distillation inputs for candidate
  creation, eval fixtures, and skill improvement proposals
- raw transcripts, full prompts, raw tool logs, secrets, and private phrases
  remain forbidden skill artifacts
- low-risk limited-scope skill automation may later auto-draft, auto-test,
  auto-canary, and in some cases auto-promote after passing the defined checks;
  medium-risk and high-risk changes remain approval-gated
- future skills implementation milestones must not claim success on docs-only
  or proof-only paths when live usefulness or runtime safety is still missing
- the first runtime slice is a canonical `skill_candidate` opportunity kind in
  the existing proactivity ledger, with deterministic ids, deterministic
  dedupe, bounded distilled evidence, and shared surface ids across inline,
  heartbeat, inbox, and handoff
- the next runtime slice is Skillifier MVP: one canonical `skill_candidate`
  must be able to produce one bounded draft skill package with one stable
  `skillPackageId`, one deterministic check report, one provenance report, and
  one rollback plan, all without broad install or promotion

Reasoning:

- the proactivity substrate now exists to surface bounded skill opportunities,
  so a second review queue would be redundant
- skills are the safest first domain for testing greater automation because
  they are versionable, scope-limited, and easy to disable or roll back

## 2026-04-28 - Proactivity surfaces must render user-facing briefs, not internal packets

Decision:

- proactivity ledgers may retain rich internal state, including why-now,
  evidence, provenance, source refs, lifecycle, ids, limitations, and
  diagnostics
- chat cards, inbox rows, heartbeat structured context, and handoff copy must
  render from a shared typed `UserFacingProactivityBrief`
- primary card copy shows a short title, kind label, one-line purpose, and
  recommended next step or primary action
- `why now`, evidence, provenance, source refs, ids, timestamps, lifecycle
  details, and presentation diagnostics move behind collapsed details or hidden
  context
- skill cards must distinguish new-skill candidates from existing-skill
  enhancements and merge/extend candidates using explicit skill metadata,
  existing candidate linkage, or prior candidate state
- reverse prompts that do not ask a complete useful question are demoted to
  diagnostics or self-healing repair signals

Reasoning:

- raw planning packet projection made skill and reverse-prompt cards noisy even
  when the underlying heartbeat briefing was clear
- Milestone 4 skill evals need to evaluate usable decision surfaces, not
  source-fragment titles and fallback templates

## 2026-04-28 - Daily continuity requires an end-of-day finalizer and live proactivity gate

Decision:

- canonical daily memory remains `memory/YYYY-MM-DD.md`
- `archives/daily_memory_evidence/YYYY-MM-DD.md` is fallback evidence only and
  is not equivalent to the canonical daily note
- the retained `session-memory` hook on `/new` and `/reset` remains required,
  but hook firing alone is not sufficient for daily continuity reliability
- a repo-owned end-of-day finalizer must create a missing canonical daily note
  only when exact same-day durable evidence exists
- missing daily notes must not be backfilled from older DB artifacts, stale
  weekly summaries, inferred memory, raw transcripts, raw prompts, raw tool
  logs, secrets, or private phrases
- daily notes remain lower-authority continuity and ingestion surfaces, not
  semantic truth authority
- before moving from proactivity/daily continuity into Skills, a live
  `agent:main:main` gate must prove clean same-session item creation, inline
  surfacing, inbox, heartbeat, and handoff canonical-id parity, clean heartbeat
  visible copy, and duplicate collapse after related prompts

Reasoning:

- recent operator digests showed missing daily notes for multiple days even
  after the canonical hook repair, so the default OpenClaw daily memory workflow
  still lacked a reliable fallback
- proactivity was functionally present but still needed a strict live gate to
  prove the normal workflow is clean enough to stop iterating on this bucket

## 2026-04-27 - Proactivity becomes an ambient operating loop

Decision:

- OpenClaw proactivity is now an ambient operating loop, not just an
  inbox/queue layer
- heartbeat becomes an operating surface, not merely a prompt/check surface
- reverse prompting is first-class product behavior
- durable growth loops are first-class product behavior:
  - curiosity loop
  - repeated-pattern loop
  - outcome follow-up loop
  - delight/surprise loop
  - self-healing loop
- compaction/danger-zone recovery for proactivity is first-class product
  behavior
- bounded autonomous internal maintenance work is allowed in
  isolated/background paths when it produces internal planning,
  investigation, follow-up, continuity, or repair artifacts only
- self-healing diagnostics and repair plans are first-class product behavior
- approval boundaries remain mandatory for file edits, actions, and outbound
  sends
- provenance, no-dark-data enforcement, boundedness, deterministic ids/hashes,
  and rollback-safe behavior remain mandatory
- usefulness in normal workflow is the success gate, not proof-only plumbing

Reasoning:

- same-session assistant-final capture and surfacing fixed the baseline live
  failure, but the system still feels like surfaced queue infrastructure rather
  than an ambient proactive partner
- the remaining gap with `halthelobster/proactive-agent` is driven by missing
  reverse prompting, durable growth loops, continuity, bounded background
  maintenance, and self-healing, not by one more inbox or heartbeat formatting
  pass

## 2026-04-27 - Same-session proactivity must collapse duplicates and strip plumbing from surfaced copy

Decision:

- same-session assistant-derived opportunities must be pruned or collapsed
  deterministically before they reach primary actionable surfaces
- older duplicate assistant-derived items must not accumulate indefinitely in
  inbox, heartbeat, or inline chat surfacing
- primary user-facing fields such as title, why now, problem, and next step
  must exclude system text, sender metadata, timestamps, source refs, and
  control-plane scaffolding
- provenance remains available in secondary details only
- heartbeat must prioritize useful user-facing proactive work and may fall back
  to `HEARTBEAT_OK` if only polluted/control-plane candidates remain
- inline follow-up and heartbeat surfaces must stay visually coherent with the
  bounded chat layout
- success is measured by live usefulness and readability, not by merely
  surfacing more items

Reasoning:

- the live `agent:main:main` path now generates same-session opportunities, but
  the resulting UX still feels like queue/log replay because older same-session
  items keep stacking and primary fields still leak runtime/plumbing text
- heartbeat surfacing is only useful if ranking and displayed copy both prefer
  bounded user-facing work rather than internal system chatter

## 2026-04-27 - Same-session proactivity must capture only substantive assistant finals

Decision:

- authoritative transcript sync is the primary source for assistant-output
  proactivity generation in live workflow
- only substantive assistant final answers may persist as `assistant_turn`
  activity records for assistant-output-derived opportunities
- operational assistant messages such as `turn_activity`,
  `model_memory_activity`, and similar bounded runtime markers are not valid
  proactivity assistant-turn sources
- placeholder fallback summaries must not replace a real assistant final answer
- explicit `final_answer` phased text and ids are preferred whenever available
- success is measured in same-session live workflow correctness, not proof-only
  coverage

Reasoning:

- the real `agent:main:main` workflow showed substantive assistant answers in
  the transcript, but persisted proactivity state was dominated by operational
  noise and occasional placeholder assistant records
- heartbeat, inline surfacing, and same-session queue generation all depend on
  clean persisted assistant-final capture; proof-only coverage is not enough
  when the live path still fails

## 2026-04-25 - Comprehensive Phase 2 eval gates planner and proactive behavior

Decision:

- insert a retrieval integration/proof harness slice after the hierarchical
  retrieval substrate and before the comprehensive eval slice
- the integration harness should exercise object retrieval, projection digests,
  capsule shadow, gated capsule context, and hierarchical shadow in one
  structured runtime trace without promoting default behavior
- insert a comprehensive Phase 2 integration eval and no-dark-data proof slice
  before planner/proactivity
- the comprehensive eval must include structured capture/retrieval prompts and
  non-user-prompt ingestion sources: curated docs, repo docs, manual notes,
  tool-result capture, researcher report artifacts, cited assistant answers,
  daily continuity, raw prompt/transcript/tool-log rejection or
  `inspection_only`, and secret/private phrase hard reject

Reasoning:

- testing isolated substrates again is lower value until a single proof path can
  invoke the built retrieval, projection, capsule, context, and hierarchical
  surfaces together
- planner and proactive behavior should not depend on Phase 2 memory outputs
  until authority propagation, provenance, lifecycle exclusion, and no-dark-data
  behavior are proven across capture and retrieval

## 2026-04-25 - Projections and capsules share derived-artifact mechanics but keep separate roles

Decision:

- projections remain workspace/bootstrap/read-model artifacts
- capsules are the generation/context artifact family
- Phase 2 should add a shared derived-artifact core for provenance,
  deterministic ids/hashes, source refs, authority metadata, freshness,
  lifecycle exclusion, conflict markers, artifact writing, and read-only stores
- `project_state` capsule owns rich project-state generation/context
  compilation
- `project_page` projection must not remain a second independent project-state
  compiler; it is either an operator/report projection or a thin renderer over
  a fresh `project_state` capsule or capsule digest

Reasoning:

- projection and capsule code currently need many of the same safety mechanics,
  but they serve different product roles
- consolidating shared mechanics avoids divergent freshness, provenance,
  lifecycle, and no-dark-data behavior
- making `project_state` the rich project-state compiler prevents two parallel
  implementations from drifting or disagreeing

## 2026-04-25 - Phase 2 bucket set is locked

Decision:

- Phase 2 includes soft-source authority, corpus system, Memory Maintenance
  Loop, hybrid retrieval, graph knowledge, project-state capsules, proactivity
  and planner surfacing, skills/tools, gated self-improvement, operator
  UX/observability, and privacy/prompt-injection hardening
- broad capsule families, ungated global self-improvement, aggressive privacy
  enforcement, and automatic third-party installation remain out of the first
  Phase 2 implementation pass

Reasoning:

- the locked set covers the high-leverage behavior needed after MMV2 storage
  cutover while keeping the first derived-feature pass inspectable, reversible,
  and no-dark-data compliant

## 2026-04-25 - Soft-source authority admits useful non-user knowledge without promoting it to user truth

Decision:

- source authority tiers are `user_authoritative`, `curated_authoritative`,
  `tool_grounded`, `cited_soft`, and `inspection_only`
- explicit user turns and curated corpus inputs may admit durable facts,
  references, procedures, rules, and preferences according to their source
  profile
- researcher reports, cited assistant answers, daily continuity, and
  tool-grounded summaries may create usable lower-authority memories only with
  provenance and source profile metadata
- raw transcripts, raw prompts, raw tool logs, secrets, and private phrases are
  rejected or kept inspection-only according to safety policy
- authority promotion requires explicit user approval or replacement by a
  higher-authority source; corroboration may raise confidence but not authority

Reasoning:

- useful facts often arrive through agents, tools, and cited summaries, but
  treating them as equivalent to explicit user memory would collapse trust and
  make conflict handling unsafe

## 2026-04-25 - Memory Maintenance Loop owns derived maintenance cadence

Decision:

- the user-facing product term is Memory Maintenance Loop, not dreaming
- cadence is event-driven plus heartbeat plus daily review
- maintenance may consolidate derived and soft-source artifacts, surface
  candidates, report stale/conflict/cache issues, and propose planner or
  self-improvement actions
- maintenance must not mutate canonical MMV2 durable truth without an explicit
  approved write path
- maintenance candidates stay active for 30 days, archived for 90 days, and may
  be pinned

Reasoning:

- the system needs background consolidation and hygiene, but framing it as
  maintenance keeps behavior inspectable and separates derived work from
  semantic authority

## 2026-04-25 - Phase 2 retrieval, graph, capsules, planner, and self-improvement stay authority-aware and gated

Decision:

- deterministic retrieval runs before bounded hybrid expansion
- lower-authority soft sources are limited to research/reference,
  project-state, and conflict packs unless explicitly approved
- graph knowledge is derived `runtime_graph` state; inferred probationary edges
  are read-time only until promoted through an approved source path
- Phase 2 capsules start with `project_state` only, including labeled soft and
  conflict sections
- planner/proactivity surfaces maintenance and opportunity candidates through
  contextual one-liners, heartbeat, and artifacts
- skills/tools may trigger review from structural recurrence or one explicit
  ask plus one successful manual run, but semantic similarity, skill-worthiness,
  and skill-vs-plan classification are model-owned or operator-owned;
  repo-local/workspace-local proposals come first, and global Codex skill
  promotion requires a second approval

Reasoning:

- Phase 2 should increase retrieval quality and useful proactivity without
  silently changing behavior, installing automation, or elevating lower-trust
  evidence into operational directives

## 2026-04-23 - Closeout reports and retrieval miss telemetry are operational artifacts, not truth

Decision:

- shared ingestion closeout/quarantine reports are runtime-state/artifact
  outputs, not SQL semantic truth
- retrieval/projection miss diagnostics and ranking-feature telemetry remain
  read-time only
- hash-invalid, stale, conflicted, inactive, deleted, and superseded records
  are excluded from normal runtime packs unless explicitly requested for
  inspection

Reasoning:

- operators need to know whether memory existed but was excluded, which stage
  failed, and which provider/model/schema was involved
- writing these diagnostics into durable semantic tables would create a second
  truth layer and invite auto-fix pressure
- artifact-safe reports can be rotated/pruned without touching canonical MMV2
  memory rows

## 2026-04-23 - Mini remains strict capture default while the corrected Codex lane remains externally blocked

Decision:

- `openai-codex/gpt-5.4-mini` remains the strict MMV2 capture/ingest default
- nano remains explicit low-risk/benchmark-only until strict-schema and
  evidence-quality parity is proven
- current live validation evidence must record the actual provider/auth lane
  and be classified as externally blocked when the corrected native Codex
  route fails at the provider boundary (`403`) or does not complete inside the
  bounded live retry window

Reasoning:

- prior measured runs showed mini succeeds strict-schema capture while nano
  route quality remains unresolved for strict admission
- the earlier `429` evidence came from the wrong OpenAI chat-completions pipe;
  routing that traffic through the native Codex responses route is now fixed,
  so further failures must be judged against the corrected lane rather than the
  old wrong-pipe artifact
- a provider-route or auth-lane failure is not a source failure, not a
  model-quality result, and not permission to fake benchmark success

## 2026-04-23 - Warm skill-load state is session-snapshot truth

Decision:

- skill-status may report installed and discovered skills from the workspace
  and managed skill directories
- loaded/current/stale state is reported only from persisted session skill
  snapshots
- if no persisted snapshot exists, the diagnostic must say `not_available`
  with the exact reason

Reasoning:

- claiming warm-session loaded state without runtime evidence creates false
  operator confidence
- persisted session snapshots are the narrow truthful surface currently
  available without adding a live in-memory agent-inspection channel

## 2026-04-23 - Strict MMV2 admission defaults to mini after live nano boundary failures

Decision:

- default strict MMV2 capture/ingest model routing now resolves to
  `openai-codex/gpt-5.4-mini`
- keep explicit rollback/override through `MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID`
  and document-ingest-specific model env controls
- retain nano only for explicit low-risk/high-volume lanes such as
  deterministic classification, ranking/filtering, benchmark comparison, or
  other non-admission first-pass work
- do not let nano silently become the default strict canonical admission route
  unless it later passes strict-schema and evidence-quality gates

Reasoning:

- the measured configured nano route repeatedly failed strict structured-output
  contracts at the provider boundary
- mini was materially slower but passed the strict-schema capture/ingest
  quality bar; correctness is the higher-priority gate for canonical memory
  admission

Rollback:

- set `MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID` or
  `MODEL_MEMORY_DOCUMENT_INGEST_MODEL_ID` to the intended explicit route for a
  controlled run
- keep benchmark model routing independent so nano experiments do not alter
  live strict admission defaults

## 2026-04-23 - Main UX audit fixes are operational hardening, not semantic redesign

Decision:

- repair runtime-dirty filesystem ownership narrowly for gateway UID `1000`
- classify dirty-state permission/write failures as operational persistence
  failures instead of generic `other`
- capture durable operational preferences/directives about safe blocker
  handling through the general ordinary-turn directive/preference path
- capture tool-result operational blockers as bounded facts with no raw tool
  log persistence
- keep skill-vetting reports in the writable operator workspace report tree
  and keep host-operator skill installation explicit, audited, and redacted

Reasoning:

- the audited UX failures were mechanical capability and observability gaps:
  permission denial, poor tool-shape discoverability, weak operational fact
  capture, and unsafe log verbosity
- these fixes improve live operations without changing MMV2 semantic truth or
  adding a migration

Rollback:

- disable affected capture seams with their existing capture-seam/env kill
  switches
- restore prior model routes only through explicit env overrides
- disable host-operator writes with `OPENCLAW_HOST_OPERATOR_WRITE_ENABLED=false`
  if canonical skill/doc writes need to be paused

## 2026-04-23 - Live pre-Phase-2 gates use approved durable proof plus artifact-only benchmarks

Decision:

- run Pass 6 benchmarks with real provider/model calls, but keep all
  benchmark/eval output artifact-only
- use `openai-codex/gpt-5.4-mini` for strict-schema benchmark/capture routes
  until the configured nano route proves strict structured-output support
- treat `provider_json_boundary` from the configured nano route as an external
  route capability blocker, not a source/document failure
- use `reasoning_effort=none` for direct API benchmark calls and
  `reasoning_effort=low` for Codex app-server calls; do not force a paid
  priority/fast service tier unless explicitly configured
- prefer section-map plus candidate-hints for large documents after the
  measured `DECISIONS.md` run because it preserved original-source validation
  better than direct rigid capture
- allow exactly the operator-approved `MEMMECH-LIVE-2026-04-23` project fact
  to enter live durable memory as long-term workspace state
- keep all other proof, soak, benchmark, and projection artifacts out of the
  live durable-memory DB
- make capture job execution idempotent once a job is `written`; duplicate
  proof reruns must not regress job state to queued/failed
- keep generated projections under the projection artifact root and ignore
  repo-local `.openclaw/` artifacts in git

Reasoning:

- the mechanical path needed real latency/schema/failure evidence, but that
  evidence is operational telemetry, not semantic memory
- the approved durable payload is legitimate long-term project state, so it is
  the only safe live row proof payload for the clean MEMMECH soak
- strict-schema conformance matters more than raw latency for capture and
  retrieval-interpretation correctness
- Codex app-server currently exposes less token/cache telemetry than direct
  API routes, so cache-health reports should distinguish "zero reported
  cached tokens" from "provider definitely did not cache"

Rollback:

- disable capture seams globally with `MODEL_MEMORY_CAPTURE_SEAMS_ENABLED=false`
- disable Safe Level 1 execution with its global/per-action kill switches
- ignore/regenerate `.artifacts/model-memory/pass6-live-benchmark/`,
  `.artifacts/model-memory/large-doc-compression/`,
  `.artifacts/model-memory/projection-live-behavior/`, and
  `.artifacts/model-memory/memmech-proof/`
- keep the approved durable project fact as normal workspace state unless the
  operator explicitly asks for a semantic correction through the normal MMV2
  correction path

## 2026-04-22 - Pre-Phase-2 gates prefer artifact-safe proof over fake live DB writes

Decision:

- finish Pass 6 as a cache-aware benchmark/compression harness plus safe
  artifact reports, not as benchmark/eval durable memories
- materialize the full rich projection catalog from live MMV2 records into the
  projection artifact root only
- activate capture seams by policy only when the seam has production evidence,
  dedupe/no-dark-data tests, and global plus seam-specific kill switches
- keep `message:received` and `message:transcribed` fallback-only unless the
  primary `message:preprocessed` seam is unavailable
- enable Safe Level 1 Memory Ops auto-fix planning only for operational
  artifact/job/runtime-state actions
- keep semantic auto-fix, memory deletion, auto-supersession, semantic
  candidate repair, and fuzzy correction disabled
- treat the MEMMECH proof as mechanically clean only for artifact-safe gates;
  live durable ordinary-turn row proof needs an operator-approved durable
  payload or isolated/staging DB

Reasoning:

- benchmark/proof output is evaluation data, not durable semantic truth
- projections are derived context views; writing them under the projection
  artifact root is safe, writing them to root `USER.md` or `MEMORY.md` is not
- safe operational auto-fixes can reduce toil without mutating MMV2 semantic
  truth
- removing all legacy public exports would currently break the plugin SDK and
  older admin/proof scripts, so the correct near-term posture is quarantine
  plus default-hot-path import tests

Rollback:

- disable all capture seams with `MODEL_MEMORY_CAPTURE_SEAMS_ENABLED=false`
- disable individual seams with their `MODEL_MEMORY_CAPTURE_SEAM_*_ENABLED`
  env switches
- ignore or remove `.artifacts/model-memory/pass6-cache-aware-benchmark/` and
  `.artifacts/model-memory/memmech-proof/` if reports need regeneration
- remove or ignore `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` and
  `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/` to reset operational state
- keep semantic-truth auto-fix disabled; semantic changes require operator
  approval tickets

## 2026-04-22 - Pool, persistence, and provider telemetry stay operational

Decision:

- implement Passes 3-5 without a SQL migration
- use priority semaphores/queue lanes over separate physical DB pools for the
  first live hardening pass
- keep operational scorecards and pressure telemetry outside MMV2 semantic
  truth as runtime-state artifacts or in-memory snapshots
- classify `pool_pressure` as a retryable shared ingestion failure class
- allow capture/rebuild to defer under pressure while retrieval remains the
  highest-priority DB lane
- batch persistence where idempotency is already deterministic, and defer
  invalid candidates/edges with safe ids and reasons rather than rolling back
  valid siblings
- run document-ingest preflight against actual strict-schema contracts before
  corpus work; generic JSON-object provider health is not sufficient proof

Reasoning:

- multiplying physical pools would risk increasing total DB connection pressure
  before the live workload proves that separate pools are necessary
- the immediate availability problem is starvation and write amplification, so
  priority lanes plus circuit-breaker style deferral are lower risk and require
  no migration
- invalid candidates and bad edges are data-quality or persistence-boundary
  events; they should be inspectable without causing source-wide failure
- provider/model reliability needs scorecards, but scorecards are operational
  telemetry, not semantic memory

Rollback:

- reduce lane concurrency through the `MODEL_MEMORY_DB_*_LANE_CONCURRENCY`
  knobs
- raise or disable pressure sensitivity by adjusting
  `MODEL_MEMORY_DB_POOL_PRESSURE_*` thresholds
- keep document ingest paused if strict-schema preflight fails for any required
  contract
- ignore or delete runtime-state provider scorecard artifacts if operational
  telemetry needs a clean reset

## 2026-04-22 - Durable capture jobs use runtime-state spool, not MMV2 DB tables

Decision:

- implement Pass 1 durable capture jobs without a DB migration
- persist safe job snapshots and append-only job events under
  `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/`
- keep the semantic durable-memory DB reserved for MMV2 truth, not job queue
  bookkeeping
- store only safe metadata:
  - capture job id
  - session id/key
  - agent id
  - source kind
  - source hash/fingerprint
  - status
  - failure class/stage
  - retry count and next attempt time
  - timestamps
  - model/provider labels
  - safe related source/segment/memory/event/projection ids
- keep raw user turns, assistant turns, transcripts, and tool logs out of the
  durable job store
- make replay an inspection marker only unless a future approved design adds a
  source-preserving replay substrate with no raw-payload storage

Reasoning:

- this satisfies the storage gate without hiding an unapproved migration
- capture outcomes now survive process restarts for inspection/replay planning
  while raw turn payloads remain in-memory only during the immediate capture
  execution/retry
- later dirty-state scheduling, pool backoff, and MEMMECH proof can depend on
  stable capture job ids without coupling job state to MMV2 semantic truth

Rollback:

- remove or ignore the runtime-state capture job spool
- disable or reduce capture retries with `MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES`
- set `MODEL_MEMORY_CAPTURE_JOB_CONCURRENCY=1` for the current conservative
  default worker behavior

## 2026-04-22 - Runtime dirty state uses the runtime-state spool, not MMV2 SQL

Decision:

- implement Pass 2 dirty state and rebuild scheduling without a DB migration
- store dirty snapshots/events under
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/`
- keep runtime dirty state operational only; MMV2 SQL remains semantic truth
- make ordinary-turn and bounded tool-result capture mark dirty and schedule or
  defer rebuilds instead of synchronously rebuilding runtime/projection tables
- coalesce rebuilds by write count or elapsed dirty age using:
  - `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED`
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES`
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY`
  - `MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES`
- preserve `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` as the explicit
  rollback flag for blocking advisory-lock behavior, while the default remains
  fail-fast try-lock behavior

Reasoning:

- dirty/rebuild status must survive process reloads better than an in-process
  marker, but it is operational scheduler state and does not belong in
  semantic durable memory
- capture jobs should not fail just because rebuild work is deferred, coalesced,
  disabled, or lock-busy
- runtime projections/read models are derived artifacts; delayed rebuilds must
  not mutate canonical truth or write generated projections back to root
  `USER.md` / `MEMORY.md`

Rollback:

- set `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED=false` to keep marking dirty while
  preventing automatic rebuild scheduling
- remove or ignore `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` if the
  runtime-state spool needs a clean scheduler reset
- set `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` only as a temporary
  compatibility rollback for older rebuild-lock behavior

## 2026-04-22 - Remaining capture/ingest mechanical repair is split into passes

Decision:

- treat the bounded capture hardening already landed as groundwork, not the
  full repair
- complete the remaining mechanical work in this order, with Pass 1 now
  complete and Pass 2 implemented in source:
  - durable capture job queue/retry/replay (completed with runtime-state spool)
  - durable dirty marker and coalesced rebuild scheduler (implemented with
    runtime-state spool)
  - DB pool lanes or priority semaphores with pool-pressure circuit breaker
  - batch persistence and candidate savepoints/deferred invalid reports
  - provider strict-schema preflight wiring and provider/model scorecards
  - cache-aware mini/nano and large-document compression benchmarks
  - final MEMMECH proof and current-runtime soak
- make durable capture jobs the first major implementation pass because later
  scheduling, pool backoff, replay, and proof surfaces need stable job ids and
  durable status first
- stop before implementation if durable job or dirty-state storage requires a
  SQL migration that has not been explicitly approved

Reasoning:

- live capture failures must be durable and inspectable before retry,
  scheduling, or pool-pressure behavior can be trusted
- rebuild coalescing and pool lanes need capture jobs as backpressure inputs
- batching/savepoints need durable failure records so valid/invalid candidate
  outcomes can be audited without raw source replay
- model benchmarks should wait until DB/rebuild mechanics stop dominating the
  observed latency/failure signal

## 2026-04-22 - Capture performance hardening is mechanical, not semantic

Decision:

- treat the failed current-runtime partial-corpus soak as a mechanical
  capture/ingest availability failure, not a reason to change MMV2 semantic
  truth
- keep user-facing turns non-blocking, but make background capture observable
  through safe job events and shared failure classes
- disable ordinary-turn synchronous runtime rebuild by default; capture writes
  mark runtime/projection state dirty and explicit admin/proof paths can still
  request rebuild
- prefer try-lock/fail-fast rebuild behavior over blocking
  `pg_advisory_xact_lock`, with
  `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` as rollback
- bound reconciliation by scope and projected columns for ordinary capture
  rather than decoding all durable memories on every turn
- validate edge endpoints with one batched lookup before FK-backed edge writes
- make DB pool sizing/timeouts configurable without a migration
- preflight actual strict-schema contracts, not only generic JSON-object
  provider health
- record prompt-cache keys, prefix/schema hashes, token usage, cached token
  counts, model/provider, and latency as bounded telemetry only
- redact ordinary-turn source-window content before persistence; keep only
  hashes, counts, safe metadata, and bounded evidence quotes used by admitted
  memory records

Reasoning:

- read-only DB timing shows the live DB is small enough that table size alone
  is not the root cause
- timeout logs point to contention, rebuild coupling, pool pressure, and
  provider/schema mechanics
- fixing this by semantic heuristics, fuzzy correction, or broader legacy
  fallback would make the memory system less trustworthy
- the durable repair is to decouple capture writes from rebuilds, make capture
  outcomes inspectable, reduce DB round trips, and prevent raw ordinary-turn
  text from becoming durable source data

## 2026-04-22 - Partial-corpus proof can proceed before full ingest completes

Decision:

- allow retrieval/projection proof against the already-ingested partial corpus
  while the full document ingest remains paused
- label that proof as partial-corpus/current-runtime evidence, not full
  post-ingest proof
- allow projection catalog materialization as artifact-only output under the
  projection artifact root, never as root `USER.md` or `MEMORY.md` write-back
- treat a final current-runtime soak as not clean if ordinary-turn durable
  capture does not produce durable rows, even when the UI prompt run itself
  completes

Reasoning:

- the paused corpus already has enough MMV2 source/segment/memory/event
  evidence to test retrieval and projection behavior without spending more
  provider credits
- partial proof is useful only if it is honestly labeled and cannot be
  explained by same-session transcript or root workspace memory files
- soak credibility depends on durable capture evidence, no-store rejection,
  retrieval/projection proof, and root no-write proof; a DB timeout in the
  async capture lane is a real blocker, not a cosmetic warning

## 2026-04-22 - Storage compatibility identity is structural only

Decision:

- keep `extensions/model-memory/src/mmv2/storage-compatibility.ts` as a
  temporary compatibility bridge only
- remove its dependency on legacy `semantic-identity.ts`
- derive compatibility identity keys only from MMV2 durable record fields:
  canonical class, kind, artifact type, scope, payload, canonical text, and
  source refs
- preserve rollback/read-shape compatibility without allowing legacy
  semantic-family identity to re-enter default MMV2 hot paths

Reasoning:

- storage compatibility still has transitional value for fallback/read-shape
  consumers
- legacy semantic identity is not acceptable write-path authority for MMV2
  truth
- a structural projection keeps the fallback slice reversible and testable
  without fuzzy collision/family behavior

## 2026-04-22 - Proof-runner candidate identity stays stable for single batches

Decision:

- preserve extraction candidate ids when document or ordinary-turn extraction
  uses a single atomic or composite batch
- reserve `atomic-<batch>:` / `composite-<batch>:` prefixes for true
  multi-batch collision protection only
- treat prefixed single-batch ids as a structural bug because admission,
  reconciliation-neighbor lookup, scripted proof fixtures, and operator
  evidence all use candidate ids as phase-to-phase correlation keys
- expand ordinary-turn proof coverage by reusing existing adjudicated MMV2
  proof cases rather than adding topic-specific parser fixtures

Reasoning:

- the proof-runner project-fact failures came from candidate-id rewriting, not
  from missing project-fact semantics
- fixing the structural id flow keeps MMV2 canonicalization/admission general
  and avoids semantic forests, fuzzy supersession, and marker/topic-specific
  shortcuts
- ordinary-turn coverage should fail if duplicate prevention, source-ref merge,
  scoped conflict, no-store/temp rejection, workspace scoping, or no-fuzzy
  behavior regresses

## 2026-04-22 - Shared ingestion funnel starts as contracts plus safe adapters

Decision:

- define one shared ingestion-funnel contract and failure taxonomy for
  document ingest, ordinary-turn capture, tool-result capture, daily recovery,
  bootstrap import, and future heartbeat/proactive capture
- make provider-boundary failures, prompt planning, retry decisions,
  candidate validation, persistence endpoint validation, and no-dark-data
  telemetry reusable instead of runner-only behavior
- route malformed capture-routing repair output to a safe skipped batch rather
  than failing the whole source/turn
- keep extraction/canonicalization truth semantics unchanged until the next
  deeper candidate-level quarantine slice can be implemented with proof-runner
  compatibility
- do not resume deep document ingest until the shared funnel has enough
  candidate-level quarantine/persistence coverage and provider credits pass
  preflight

Reasoning:

- the paused ingest failures repeat across memory paths, so a runner-only fix
  is insufficient
- the first safe slice is shared contracts, telemetry, provider boundaries,
  and persistence endpoint validation; a broad rewrite of extraction,
  admission, or reconciliation would risk silently changing MMV2 truth
- malformed repair output must be classified or quarantined, not retried in an
  unbounded loop
- the remaining proof-runner project-fact blocker should be fixed directly in
  the scripted MMV2 path; it must not be worked around with topic parsers,
  semantic forests, or fuzzy supersession

## 2026-04-22 - Docs sync auth requires a write-scoped external credential (historical, superseded)

Historical provenance only. Do not use this decision as the current downstream
operator path.

Decision:

- keep `.github/workflows/docs-sync-publish.yml` using
  `OPENCLAW_DOCS_SYNC_TOKEN` for publishing to `openclaw/docs`
- fail fast when the token is missing or cannot read/push the publish repo
- do not echo token-bearing remotes; configure the token as a local Git extra
  header inside the runner
- preferred credential is a GitHub App installation token scoped to
  `openclaw/docs` with Contents read/write
- acceptable fallback is a fine-grained PAT stored as
  `OPENCLAW_DOCS_SYNC_TOKEN` on the canonical downstream repo
  `ConorLynchOCGit/openclaw-platform`, scoped only to `openclaw/docs`,
  Contents read/write, with explicit expiration/rotation

Reasoning:

- the workflow reached the publish push step and failed because GitHub rejected
  credentials for `https://github.com/openclaw/docs.git/`
- the current source repo has no Actions secret and the current operator
  account only has READ permission on `openclaw/docs`
- workflow logic can be hardened locally, but successful publishing requires a
  credential owned by the organization/repo with write access to the docs repo

Superseded by the 2026-04-24 downstream same-repo docs bundle posture, which
also retires the old cross-repo locale-dispatch path.

## 2026-04-22 - Deep ingest failures require funnel hardening before resume

Decision:

- do not resume the paused 2026-04-22 deep-ingest corpus until provider
  health/credit preflight succeeds
- keep the runner failure circuit breaker enabled by default
- retry failed sources only by explicit failure class after the matching code
  path is fixed
- treat malformed repair output and provider JSON-boundary output as quarantine
  classes, not reasons to repeatedly re-query the provider
- validate MMV2 memory-edge endpoints before writing `memory_edges`; defer
  invalid edges into bounded event metadata rather than causing FK failures or
  mutating target state
- use progress/cost telemetry to stop expensive runs early when failure rate or
  circuit-breaker reason says the funnel is unhealthy

Reasoning:

- the paused run showed systemic provider/funnel failures, not isolated bad
  documents
- blindly retrying the failed set burns credits and hides true failure classes
- the right repair is better preflight, retry boundaries, quarantine reports,
  endpoint validation, and operator telemetry while preserving MMV2 truth
  semantics
- none of these hardening changes justify semantic forests, topic parsers,
  fuzzy write-path correction, or legacy collision fallback

## 2026-04-22 - Hardening landing accepted with explicit correction rerun evidence

Decision:

- treat `.artifacts/model-memory/soak-ui-validation/2026-04-22-hardening-land-soak/`
  as the hardening landing proof root for the current runtime
- accept the correction gate only from the targeted rerun:
  - correction memory `7b3811fb-9613-5443-bc73-dd6799f893f1`
  - event `9eb0cc1c-aa6a-54cc-8de4-4e7c8e42cb77`
  - supersession edge `0da10fcc-b5a7-5962-9d69-982d748755d6`
  - exact target memory `231bd0a5-2f7c-5f65-af75-397668a2e960`
- record the original correction attempt as a live capture timeout, not a
  semantic/reconciliation failure
- accept projection-backed recall evidence only when projection versions list
  the fresh active MMV2 ids as sources; do not count root `USER.md` /
  `MEMORY.md`, same-session transcript, or raw workspace-file context as proof
- keep retrieval timeout evidence visible as runtime availability debt; do not
  patch it with topic parsers, semantic forests, or fuzzy write-path matching
- document ingest remains paused and must be resumed later from the checkpoint
  with the `model-memory-deep-ingest` skill/runbook

Reasoning:

- the correction rerun proved the intended structural target behavior without
  inventing a topical match
- the first failed correction attempt exposed runtime DB/connectivity
  fragility, so the durable lesson is to improve availability/diagnostics, not
  to weaken memory semantics
- the hardening patchset can be landed as substrate progress while preserving
  the honest caveat that global recall quality and prompt-specific live
  retrieval availability are not solved

## 2026-04-22 - Live memory activity feed is telemetry, not capture

Decision:

- add a bounded main-feed memory activity mirror behind
  `MODEL_MEMORY_ACTIVITY_FEED_ENABLED`
- activity-feed messages may show retrieval request/result/pack ids, selected
  memory ids, projection ids, capture source/event ids, counts, and bounded
  status labels
- activity-feed messages must not contain raw prompt text, full transcripts,
  raw tool logs, secrets, or private phrases
- activity feed does not change MMV2 truth, capture admission, reconciliation,
  or retrieval ranking
- the 2026-04-22 deep ingest remains paused for overnight continuation from
  checkpoint `checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json`
- install `model-memory-deep-ingest` as both a repo-local OpenClaw skill and a
  Codex global skill so future deep-ingest pickup starts from the MMV2 runbook
  and checkpoint workflow rather than exploratory source spelunking

Reasoning:

- the older semantic-forest path made memory actions visible through tool
  calls; MMV2 moved memory work into internal runtime paths, which made normal
  turns opaque to the operator
- the scalable fix is explicit bounded telemetry in the live feed, not raw
  prompt/tool-log capture or semantic write-path heuristics
- ingestion failures from the paused corpus are provider/extraction/
  canonicalization work items and must not drive topic-specific parsers or
  fuzzy semantic fallbacks

## 2026-04-22 - Post-landing substrate hardening proceeds without semantic forests

Decision:

- the landed runtime-hardening state at `ee0c093c1a` is the baseline for the
  next memory pathway push
- bounded tool-result proof/capture is treated as landed, not future work, but
  remains constrained to bounded tool evidence and kill switches
- the next fallback quarantine slice is legacy captured-object write
  compatibility:
  - default MMV2 live paths must not silently construct legacy
    `DatabaseMemoryObjectStore`
  - rollback/fallback requires an explicit flag
  - tests must keep default write/retrieval hot paths away from legacy
    semantic-family and collision modules
- the 2026-04-22 deep-ingest substrate pass uses a curated 304-source corpus
  rooted at `.artifacts/model-memory/document-ingest/2026-04-22-corpus/`
- retrieval/projection quality hardening must stay read-time only:
  projection-digest preference, lexical/source-lineage/recency ranking,
  exclusion telemetry, and miss diagnostics cannot mutate canonical truth
- ordinary-turn eval hardening must fail if topic-specific parsers, fuzzy
  write-path supersession, duplicate capture, raw-data persistence, or root
  workspace-memory write-back returns

Reasoning:

- the user accepted the clean soak and runtime-boundary proof; the project now
  needs substrate depth and regression protection, not another narrow soak
  workaround
- fallback quarantine must be small and reversible because legacy
  compatibility still carries rollback value
- document ingestion is intentional durable memory ingestion when the corpus is
  curated docs/runbooks/specs/status material; proof artifacts, raw prompts,
  transcripts, raw tool logs, and Memory Ops JSONL remain excluded
- the scalable fix for retrieval misses is observable read-time diagnostics,
  not semantic forests or marker/topic heuristics

## 2026-04-21 - Runtime-boundary projection and hook-probe baseline accepted

Decision:

- the runtime-boundary proof rooted at
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/`
  is accepted as the post-clean-soak baseline for projection materialization
  and production hook probe evidence
- projection materialization is artifact-only under
  `/root/.openclaw/workspace/.openclaw/model-memory/projections/`
  and does not write generated content into root `USER.md` or root
  `MEMORY.md`
- runtime projection versions and materialized projection files must continue
  to match by content hash
- production hook evidence is distinct from synthetic/static registration:
  only hooks observed during real UI/gateway turns are eligible for capture
  seam wiring
- `message:preprocessed` remains routing/telemetry-only for now because it
  overlaps ordinary-turn capture and carries raw-prompt risk
- the first semantic capture expansion should be bounded tool-result
  proof/capture through `tool_result_persist` and `after_tool_call`, behind
  kill switches and with no raw tool-log persistence

Accepted evidence:

- projection validation:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/projection-db-validation-final.json`
- hook discovery:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/hook-discovery-final.json`
- hook/capture runtime evidence:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/hook-and-seam-evidence-rerun3.json`
- Memory Ops leakage scan:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/memory-ops-leakage-scan-final.json`
- root file hash proof:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/root-hashes-before-rerun3.txt`
  and
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/root-hashes-after-rerun3.txt`
- rollback image tag remains
  `openclaw:rollback-memory-soak-20260421T175907Z`

Reasoning:

- this separates projection artifact availability from canonical truth:
  MMV2 SQL remains truth, projections remain compiled views, and retrieval
  may use projection digests only when backed by active MMV2 ids
- this separates hook-health proof from capture wiring:
  production-observed hooks can be wired behind kill switches, synthetic-only
  hooks stay blocked
- bounded tool-result capture is safer than raw prompt capture because it can
  store artifact paths, file counts, command status, URLs, docs/runbooks, and
  error classes without persisting prompts, transcripts, or raw tool logs

## 2026-04-21 - SOAKQUAR accepted as clean MMV2 retrieval-runtime soak baseline

Decision:

- `SOAKQUAR-2026-04-21` is accepted as the first clean MMV2
  retrieval-runtime soak baseline
- the accepted artifact root is
  `.artifacts/model-memory/soak-ui-validation/2026-04-21-semantic-quarantine-soak/`
- the rollback image tag preserved for this baseline is
  `openclaw:rollback-memory-soak-20260421T175907Z`
- future memory-lane regressions should compare against this baseline rather
  than the earlier failed preflight/partial soak artifacts
- post-soak work may proceed in this order:
  - fallback compatibility removal/quarantine in small reversible slices
  - ordinary-turn MMV2 eval hardening
  - retrieval-runtime relevance/telemetry hardening
  - seeded file-pack/provider variance reporting
  - production-safe hook canaries
  - verified primary capture seam expansion behind kill switches

Accepted evidence:

- preference memory `992ee8e3-ce78-518f-87fa-defcb9457404` with event
  `e4feb0f6-d9bb-5561-a807-34c41509990f`
- directive memory `9f681bb4-0524-5972-8f2f-2e247b46d8b4` with event
  `83feef07-5548-547d-9e3c-c096c93f35bb`
- project fact memory `4720dede-c33d-5c5e-835e-7e1be6d3445d` with event
  `5da8d9ae-883e-5b6d-8d84-79d225c04b88`
- structural correction memory `e64c1528-d6c2-52b3-8674-38172dc4604a`
  with event `f31dcea6-5bc8-53d5-8743-2c19143b1f47`
- structural supersession edge
  `fa9a259f-330b-5f06-bf11-79f62a0ffe47` from the correction memory to
  the targeted preference memory
- fresh recall retrieval request
  `c9d9c67c-410a-5729-a02e-e5cf0a761b8e` selected fresh soak memory ids
  through direct retrieval telemetry/retrieval-pack evidence
- Memory Ops latest report
  `.openclaw-memory-ops/reports/latest.md` remained observe/report-only with
  auto-fix disabled and no raw prompt/transcript/tool-log/private phrase
  leakage
- root `USER.md` and root `MEMORY.md` did not mutate during ordinary UI
  soak prompts

Reasoning:

- the accepted bar is not perfect global recall quality
- the accepted bar is observable, bounded MMV2 behavior:
  canonical durable rows/events/edges, structural correction, relevant
  retrieval telemetry, no dark-data leakage, and no legacy semantic-family
  write-path inference
- this prevents the project from being trapped in endless optimization loops or
  solving soak failures through brittle semantic forests

## 2026-04-21 - Semantic forest quarantine before clean-soak acceptance

Decision:

- MMV2 live write paths must not use legacy fuzzy semantic-family collision,
  family recall, or same-source-family scoring by default
- correction and supersession are structural:
  - `memory_id` targets may supersede exactly the targeted active memory
  - unresolved or unsupported targets become inspectable unresolved-target
    correction records rather than inferred topical supersession
- explicit project-fact and correction prompts are temporary command-shaped
  capture contracts, not topic parsers
- retrieval relevance may use read-time ranking over lexical, fielded,
  recency, source-lineage, and projection-digest evidence, but retrieval never
  mutates canonical truth
- the clean soak acceptance bar is realistic:
  - capture/event evidence for preference, directive, and project fact
  - structural correction behavior or honest unresolved-target classification
  - temp/privacy no active durable memory
  - fresh recall backed by retrieval telemetry selecting relevant MMV2 ids or
    a projection digest backed by those ids
  - no raw prompt/transcript/tool-log leakage

Reasoning:

- the previous soak blockers were tempting to solve with narrow topic-specific
  patches
- those patches would recreate the old semantic forest and make the system
  brittle
- structural write-path rules and observable read-time ranking let the project
  move through soak without pretending recall quality is globally perfect

## 2026-04-21 - Memory Retrieval Runtime now blocks fallback removal and capture expansion

Decision:

- the next memory layer is a Memory Retrieval Runtime between canonical MMV2
  storage and OpenClaw context assembly
- canonical MMV2 durable records/events/edges remain semantic truth
- projections are compiled views, not write authority
- memory packs are runtime bundles, not durable memory records
- the first implementation should use existing `runtime_context`
  retrieval/context/projection tables and artifacts; do not add a DB migration
  for the first retrieval-runtime pass
- direct retrieval telemetry is required for clean-soak recall acceptance
- projection-backed recall is acceptable only when the retrieval runtime
  selects a fresh MMV2-derived projection/digest with active source memory ids
- root `USER.md`, root `MEMORY.md`, daily notes, and session transcript context
  cannot satisfy MMV2 recall proof by themselves
- compatibility fallback removal and primary capture seam expansion are blocked
  until the retrieval-runtime soak is clean

Reasoning:

- the MMV2-active soak proved capture/storage but failed the recall bar:
  fresh-session recall could be explained by projection/context artifacts and
  did not record direct retrieval requests
- the old V0 retrieval path is too flat: it lacks retrieval planning, pack
  typing, source weighting, conflict/supersession exclusion, projection digest
  selection, and reliable telemetry
- removing fallback or expanding capture before fixing recall would increase
  memory volume without proving the system can retrieve the right active truth
- projections can be faster and more robust than raw DB retrieval for some
  project/entity views, but only when they remain source-linked, fresh, and
  subordinate to canonical MMV2 state

## 2026-04-21 - MMV2 hot paths are native by default and legacy compatibility is soak-window fallback only

Decision:

- active live write paths should persist MMV2 live memory batches into
  MMV2-native durable SQL by default
- active runtime rebuild and the V0 read path should read MMV2 durable truth
  through native runtime records by default
- this decision is superseded for roadmap ordering by the Memory Retrieval
  Runtime decision above
- legacy-shaped captured-object and legacy-style read compatibility should
  remain present only as soak-window fallback/quarantine
- the next roadmap sequence is:
  - implement Memory Retrieval Runtime
  - rerun the clean retrieval-runtime soak
  - remove or further quarantine compatibility after that soak
  - add ordinary-turn MMV2 evaluation coverage
  - stabilize file-pack/provider variance
  - implement primary capture seam expansion
  - implement closed-loop memory ops instrumentation
  - then proceed to graph, capsules, hierarchical retrieval, planner, synthesis,
    and cache/projection policy

Reasoning:

- the storage cutover already made MMV2-native SQL the live semantic authority
- the post-cutover cleanup moved active write/read seams onto MMV2-native
  contracts
- keeping old compatibility on the normal path would preserve the wrong mental
  model and delay Phase 2 derived features
- capture and operational safety need to be complete before graph/capsule work
  consumes the live memory substrate more aggressively

## 2026-04-21 - MMV2-native durable storage is now the live semantic authority with archive-only legacy retention

Decision:

- live semantic truth for `model-memory` now lives in MMV2-native durable SQL
  tables:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- the old five-kind canonical tables are no longer live semantic authority
- the first-pass storage posture is:
  - MMV2-native durable write truth
  - temporary write-side compatibility adapter for non-MMV2 upstream seams
  - temporary read-side compatibility projection for rebuild/retrieval/runtime
    consumers
- the live reset is destructive by design:
  - no legacy row migration into MMV2
  - full DB backup first
  - archive-only preservation of legacy DB state
- rollback for the first soak cycle is operational, not a code revert:
  - restore the full DB backup
  - set `MODEL_MEMORY_STORAGE_ENGINE=legacy` if needed
  - restart `openclaw-gateway`

Reasoning:

- the old five-kind schema had become mostly heavy-ingest residue and was no
  longer the desired semantic truth contract
- MMV2 already carried the richer durable contract needed for first-class
  composites, conflicts, lineage, and scoped truth
- a destructive reset with explicit backup and one-soak fallback is cleaner
  than attempting lossy legacy-row migration into a new semantic contract
- temporary compatibility layers are acceptable only as a bounded bridge while
  the remaining upstream/read seams are rewired to MMV2 directly

## 2026-04-17 - Phase 2 uses kind-primary semantics, project-state capsules first, and operator-visible review surfacing

Decision:

- Phase 2 should treat `kind` as the preferred primary semantic axis
- `canonicalClass` should be treated as a secondary or derived facet
- the first capsule flavor should be `project_state`
- planner and synthesis review items must surface through ordinary OpenClaw
  workflow:
  - relevant turns
  - heartbeat
  - daily operator review
- surfacing should use three lanes:
  - `must_surface`
  - `context_surface`
  - `background_only`
- third-party skill recommendations should resolve to:
  - `install`
  - `inspire`
  - `reject`
- approved `install` means real install under the current unrestricted-skills
  posture

Reasoning:

- observed runtime behavior shows `kind` is more stable than `canonicalClass`
- project-state capsules are easier to verify than a generic subject capsule
- hidden review queues are operationally weak; surfacing must occur in the
  operator channels the user already consumes
- ClawHub evaluation needs a clear recommendation contract and explicit review
  before adoption

## 2026-04-15 - production cutover flip executed with native no-memory rollback

Decision:

- production now runs with:
  - `plugins.entries.model-memory.config.live.enabled = true`
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- the gateway/runtime was rebuilt and restarted on the live Docker Compose
  path
- rollback remains:
  - disable `model-memory`
  - keep legacy slot off
  - keep legacy search off
  - continue in native no-memory mode

Reasoning:

- the repo already had the required live-runtime seams
- the live cutover was blocked only by operational execution
- the remaining risks are better handled by a 72-hour watch and sampled review
  than by another pre-cutover duplicate-tuning sprint

## 2026-04-15 - aggressive cutover execution uses direct live runtime seams, not the legacy memory slot

Decision:

- the repo now executes cutover by wiring `model-memory` directly into the
  live runtime path
- `model-memory` live mode is controlled explicitly through:
  - `plugins.entries.model-memory.config.live.enabled`
  - optional env override `MODEL_MEMORY_LIVE_ENABLED`
- rollback does not restore the legacy memory stack
- the production cutover posture remains:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`

Reasoning:

- the previous repo state still treated `model-memory` as an operator/proof
  surface instead of the active runtime path
- a cutover-ready repo needs real seams for:
  - bootstrap/context injection
  - live assistant-turn capture
  - startup warmup
  - operator visibility
  - explicit disablement
- forcing `model-memory` through the old `memory-core` slot would preserve the
  legacy authority surface instead of retiring it

## 2026-04-15 - fallback candidate admission may tolerate structural drift, but final routing must stay local

Decision:

- for `raw_text_fallback` candidate admission only, exact:
  - `canonicalClass`
  - `kind`
  - `scopeKey`
    are no longer mandatory pre-adjudication filters
- those structural fields must instead travel into bounded adjudication as
  advisory features
- final write authority remains local and conservative
- when bounded adjudication selects a fallback candidate as
  `sameCoreMemory = yes` but meaningful structural drift remains, local routing
  should contain that case instead of auto-attaching support

Reasoning:

- the isolated `AGENTS.md` trace showed the earlier bottleneck clearly:
  every zero-candidate case did enter fallback, but all `24 / 24` ended with
  `adjudicationCandidateCount = 0` because structurally drifted neighbors were
  being excluded before adjudication
- after relaxing fallback admission, the same isolated AGENTS surface moved to:
  - `24` fallback cases total
  - `12` fallback cases with `adjudicationCandidateCount > 0`
  - `12` fallback cases with `adjudicationBatchAdmitted = true`
- admitted fallback candidates were often still structurally drifted:
  - different class = `9`
  - different scope = `12`
- local safety therefore still matters:
  - structurally drifted `sameCoreMemory=yes` matches now route to local
    `conflict_hold`
  - the remaining blocker is no longer silent under-admission
  - it is now post-adjudication conversion on drifted same-claim candidates

## 2026-04-15 - unresolved duplicate cases should use one bounded adjudication lane

Decision:

- unresolved duplicate cases should no longer split into:
  - one path for retained structural candidates
  - a separate special-case path for zero-candidate fallback
- instead, the write path should use one bounded adjudication contract after
  deterministic local logic fails to resolve a case confidently
- candidate-source priority is explicit:
  - retained structural candidates first
  - raw-text fallback candidates only when retained candidates are empty
- final write authority remains local:
  - `yes + non_additive => attach_support`
  - `yes + additive => local supersede/distinct`
  - `ambiguous => local conflict_hold`
  - `no => distinct`

Reasoning:

- the split zero-candidate lane had become a special box even though the real
  live blocker also included retained-candidate conversion failures
- one bounded contract is easier to inspect, measure, and keep conservative
- the unified lane proved technically clean on the labeled basket:
  - `overallConversionRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0`
- but the current-corpus reruns also showed the architectural cleanup is not
  the same thing as cutover readiness:
  - AGENTS still ended at `zero_candidate_skips = 24`
  - gateway/configuration retained cases mostly routed to `direct_distinct`
  - long-horizon proof still ended `not_ready`

## 2026-04-15 - zero-candidate recovery may use raw text search only as a bounded recovery substrate

Decision:

- when the normal write path retains zero candidates, `model-memory` may run a
  bounded zero-candidate recovery lane
- that lane may search prior objects by raw normalized-search-text similarity
- raw text search remains recovery substrate only:
  - it is not merge authority
  - it does not replace the normal path
- final routing still remains local and structural:
  - `sameCoreMemory = yes` and `deltaType = non_additive` may attach support
  - `sameCoreMemory = yes` and `deltaType = additive` must stay in local
    supersede-versus-distinct logic
  - `ambiguous` stays locally contained
  - `no` stays distinct

Reasoning:

- the zero-candidate text-search diagnostic showed that the reviewed
  same-claim neighbor was still top-ranked under raw text search on the tested
  basket
- the new labeled-basket recovery evaluation then showed the lane is locally
  useful:
  - `recoveryRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0.0625`
- that means the system can let the model answer a tiny sameness question only
  after the strict deterministic path already failed, without turning broad
  text similarity into write authority

## 2026-04-15 - zero-candidate recovery helps locally but does not clear the cutover bar

Decision:

- the zero-candidate recovery lane earns its keep as a bounded repair for
  reviewed zero-candidate misses
- it does not clear cutover readiness by itself
- cutover remains blocked while:
  - long-horizon reruns still create too many fresh active objects
  - the shared preserved-corpus review basket still contains six clear
    should-attach misses
  - the aligned benchmark still reports
    `attachSupportMissRateOnReruns = 0.3571`
  - dense rule sources such as `AGENTS.md` still show deterministic gate loss

Reasoning:

- the lane is clearly useful on the labeled basket and in some targeted traces:
  - `docs/gateway/configuration.md` improved to `attach_support = 5`,
    `conflict_hold = 0`
- but the preserved-corpus proof still ends `not_ready` because long-horizon
  duplicate pressure remains above bar:
  - `startingActiveObjects = 492`
  - `endingActiveObjects = 534`
  - `duplicateActiveObjectCount = 28`
- that means the remaining decision is no longer “does the lane work at all?”
  but “does it move enough real write-path volume to clear cutover?” and the
  current answer is still no

## 2026-04-15 - cutover-facing replay parity must use direct case identity

Decision:

- replay-versus-live parity must not rely on fuzzy token or summary matching as
  its primary comparison method
- cutover-facing parity must compare cases by a direct shared case identity
  emitted by both:
  - the live targeted trace surface
  - the replay-side audit surface
- when direct identity still fails to line up cases, the result must be
  reported as localized trace-identity drift rather than silently treated as
  close parity

Reasoning:

- the earlier parity lane mostly measured fuzzy trace matching rather than true
  write-path parity
- after switching to direct identity, the remaining divergence became more
  honest:
  - `close = 0`
  - `diverged = 6`
  - all divergence localized to `trace_match`
- that means the next parity question is no longer “did the fuzzy scorer pick
  the right trace row?” but “why do live and replay lanes still emit different
  case identities for the same reviewed source area?”

## 2026-04-15 - gateway-style fact same-value subject drift may count as packaging-only

Decision:

- for fact memories only, strong same-value agreement plus subject-only drift
  may classify as `packaging_only_drift` when:
  - class, kind, and scope already match
  - no broader-wrapper containment relationship exists between the values
  - no rival same-value candidate remains
- this remains a candidate-preference refinement, not broader merge authority

Reasoning:

- the latest focused pass showed that gateway-configuration fact cases improved
  materially when narrow same-value wrapper drift stopped blocking same-claim
  handling:
  - `attach_support = 0 -> 4`
  - `conflict_hold = 8 -> 1`
- the change stayed narrow:
  - no global threshold lowering
  - no broad value-similarity merge rule
  - no document-specific heuristic

## 2026-04-15 - cutover remains blocked while shared-basket misses and long-horizon pressure stay above bar

Decision:

- `model-memory` remains `not_ready_for_cutover` while all of the following are
  still true on the preserved current corpus:
  - the shared duplicate review basket still contains more than rare,
    explainable should-attach misses
  - the aligned benchmark still shows meaningfully non-trivial attach-support
    miss rates with wide uncertainty
  - long-horizon saturation reruns still create materially excessive fresh
    active objects
  - replay-versus-live parity is not yet proven close enough or localized to an
    operationally acceptable seam

Reasoning:

- the latest preserved-corpus evidence after the duplicate-conversion pass
  still shows:
  - review:
    - `clear_duplicate_should_attach = 6` out of `16`
  - aligned benchmark:
    - `attachSupportMissRateOnReruns = 0.3077`
    - interval lower/upper = `0.1268` / `0.5763`
  - proof:
    - active objects = `492`
    - duplicate active-object candidates = `17`
- support-only stability and retrieval/context boundedness are no longer the
  blocker, but those green lanes do not outweigh persistent duplicate-quality
  failures
- one more focused pass is justified only if it directly targets:
  - exact live-versus-replay case replay
  - conversion of recovered same-claim candidates in the batch lane
- broader complexity beyond that point is likely diminishing-return debt

## 2026-04-15 - same-claim eligibility must separate core claim fields from packaging drift

Decision:

- same-claim eligibility must be anchored first on core claim fields
- packaging or framing fields must not block support by themselves when:
  - class, kind, and normalized scope already match
  - core claim agreement is strong
  - the remaining structural delta is only `packaging_only_drift`
- `subject` remains lower-authority by default rather than globally decisive
  or globally irrelevant
- structural delta classification stays narrow and may only classify:
  - `packaging_only_drift`
  - `additive_operational_delta`
  - `unresolved`

Reasoning:

- the measured core-claim/delta pass showed that the safe expansion shape is
  real but narrow:
  - `2` clear should-attach misses were blocked by packaging fields
  - `0` legit-distinct controls became risky under the same
    core-claim-only-plus-packaging-only rule
- the same measurement also showed that most rerun escapes are not packaging
  drift at all; they are true core-claim disagreement or additive deltas
- that means the system should widen deterministic attach only for the
  packaging-only shape, not by globally demoting more fields

## 2026-04-15 - duplicate review and benchmark must share one stratified basket

Decision:

- qualitative duplicate review and duplicate benchmark must draw from the same
  sampled population
- that shared basket must report its composition explicitly by:
  - source family
  - kind
  - replay path
  - miss class
  - delta class
  - packaging drift type
- benchmark uncertainty must stay explicit through interval reporting rather
  than single-point cleanliness claims

Reasoning:

- earlier review and benchmark artifacts were talking about different baskets,
  which made disagreement harder to interpret
- after aligning them, the disagreement became clearer and more honest:
  - review still found `2` clear should-attach misses
  - the aligned benchmark also showed `attachSupportMissRateOnReruns = 0.25`
- shared sampling does not solve duplicate quality by itself, but it does stop
  the evidence surfaces from talking past each other

## 2026-04-15 - family recall must stay anti-ontology

Decision:

- family-level recall is allowed before object-level choice
- it must be derived from decisive-field text already present on the object
- it may use deterministic field-local fingerprints, decisive-field bundle
  fingerprints, and same-source neighborhoods
- it must not introduce a controlled vocabulary of tools, operation targets, or
  constraint classes
- it must not create a semantic router

Kind rollout:

- `rule = yes_now`
- `fact = yes_now`
- `procedure = yes_now`
- `preference = yes_now`
- `reference = yes_later`

Reasoning:

- the system needs better same-family recall, especially for dense rule
  restatements, but the earlier memory system failed by letting hand-written
  semantic categories quietly become truth
- decisive-field fingerprints preserve object-native semantics and scale better
  than a maintained catalog
- same-source neighborhoods are a bounded recall aid, not a new merge
  authority

## 2026-04-15 - proof-phase support-only churn must not fall back to mixed reruns

Decision:

- the proof runner must not reuse an arbitrary saturation source as a fake
  support-only probe when no true support-only source was observed
- proof artifacts must state the executed probe class explicitly
- if no true support-only source exists, the proof must report
  `support_only_probe_blocked_no_true_support_only_source`
- stable-surface churn claims must then be interpreted as:
  - true pure-attach support evidence
  - mixed same-source rerun evidence
  - whole-source reingest evidence
  - or transient retrieval-pack artifact growth

Reasoning:

- the earlier proof artifact could simultaneously say `Support-only source:
none observed` and still claim support-only churn
- that was a measurement bug, not trustworthy evidence of a pure attach-support
  problem
- proof honesty has to come before stable-surface diagnosis

## 2026-04-15 - proof may use deterministic synthetic existing-object replay for true support-only validation

Decision:

- when the preserved current corpus does not naturally produce a pure
  support-only source during the proof run, the proof may synthesize one by
  replaying a known active object with existing support
- that synthetic replay must:
  - use a deterministic source fingerprint and window identity
  - write through the real write path
  - exist only to exercise a true `pure_attach_support` probe
- the proof artifact must record the selected target object and mark the probe
  as synthetic existing-object replay

Reasoning:

- blocking forever on “no natural support-only source happened this run” is
  weaker than proving the support-only contract directly
- the earlier isolated diff already showed pure support-only stability; the
  broader proof lane now needs the same honest probe class
- deterministic synthetic replay keeps the probe reproducible without broad
  corpus mutation

## 2026-04-15 - duplicate evidence must separate preserved proof DBs from scratch trace DBs

Decision:

- clean-room proof runners must declare an explicit database mode
- full-corpus readiness evidence must run on `full_corpus_proof_db`
- targeted hinge traces and other disposable live probes must run on
  `targeted_trace_scratch_db`
- JSON and Markdown evidence artifacts must record both database mode and
  database name

Reasoning:

- the previous hinge-trace runner reset the same database later used by the
  duplicate audit and benchmark
- that made long-horizon duplicate percentages partly untrustworthy after any
  targeted live trace
- separating preserved proof DBs from scratch trace DBs fixes the evidence
  surface without changing write-path semantics

## 2026-04-15 - semantic duplicate benchmarks must survive corpus evolution

Decision:

- the duplicate benchmark must prefer semantic-fingerprint seeds over object-id
  seeds
- legacy reviewed case ids may remain as historical bootstrap hints, but they
  are not sufficient by themselves
- when prior semantic seeds and legacy bootstrap ids do not resolve, the
  benchmark may rebuild a bounded semantic-fingerprint seed set from the
  current preserved duplicate audit

Reasoning:

- repeated proof cycles change object ids and can legitimately change which
  rerun escapes exist in the current corpus
- a benchmark tied only to old object ids either crashes or silently goes empty
- semantic-fingerprint seeds keep the benchmark rerunnable while still making
  missing historical seeds explicit

## 2026-04-15 - decisive-field agreement may tolerate narrow field-local wording drift

Decision:

- deterministic recall and fast-attach may use decisive-field agreement that is
  stronger than exact string equality but still narrower than whole-object
  similarity
- this allowance is limited to field-local same-claim drift inside the payload
  fields that define the durable claim
- rule handling may treat the combined action-bearing field bundle as a same-
  claim signal when the content is materially the same but split across
  `recommendedAction`, `avoidAction`, and `neededCapability` differently

Reasoning:

- the duplicate audit showed that many remaining false-distinct reruns were not
  failing because the claim was absent, but because the same value/action/step
  content was phrased slightly differently inside the decisive field itself
- keeping equality literal-only still missed real same-claim restatements such
  as fact value drift from wrapper wording and rule action text split across
  adjacent fields
- allowing narrow field-local equivalence improves support attachment without
  turning broad object-level similarity into merge authority

## 2026-04-15 - broad retrieval requests stay on a deterministic-baseline guardrail

Decision:

- broad operator, workflow, reference, and architecture queries stay on a
  deterministic-baseline retrieval guardrail by default
- for those broad envelopes, the retrieval-request model step must not:
  - force canonical-class filters
  - force kind filters
  - shrink `desiredResultCount` below the envelope `maxResults`
  - invent abstract hint terms that are not grounded in the query text
- the model step is cutover-eligible only when retrieval-package review shows it
  is at least neutral against deterministic retrieval

Reasoning:

- the retrieval-package review originally showed `4 / 4` reviewed probes
  degrading under the model-shaped request lane
- the highest-leverage correction was not more provider work; it was preventing
  broad queries from being over-constrained below the deterministic baseline
- after the guardrail change, the same four probes became `4 / 4`
  `mostly_same_value_as_deterministic` and `0 / 4` degraded

## 2026-04-15 - deterministic fast-attach may prefer one active strong-match candidate over contained siblings

Decision:

- deterministic fast-attach may prefer one active retained candidate even when
  multiple strong same-claim candidates remain, but only when:
  - the chosen candidate is active
  - decisive payload fields still agree exactly
  - normalized scope, class, and kind still match
  - the overlap remains very high
  - every other strong same-claim candidate is already contained in a
    non-active lifecycle state

Reasoning:

- the duplicate benchmark and audit exposed a recurring shape where one active
  same-claim object already existed alongside contained `conflict_hold`
  siblings
- treating that shape as still ambiguous kept routing obvious reruns into the
  batch lane and let more duplicate active writes escape
- preferring the single active strong-match candidate in that contained-sibling
  shape is conservative because it does not create new merge authority across
  genuinely competing active objects

Status after the latest core-claim/delta pass:

- this earlier active-versus-contained preference is no longer the current
  fast-attach expansion shape
- the live lane now requires one unique dominant core-claim candidate plus
  `packaging_only_drift`
- contained-sibling preference without that unique dominance is no longer
  treated as deterministic-safe

## 2026-04-15 - deterministic fast-attach may expand to one dominant retained candidate

Decision:

- deterministic fast-attach is no longer limited to exactly one retained
  candidate
- fast-attach may also fire when multiple retained candidates remain but
  exactly one candidate has:
  - the same canonical class
  - the same kind
  - the same normalized scope
  - very high normalized-search overlap
  - exact agreement on the decisive non-subject payload fields for that kind
  - no same-slot supersession reason
- every other retained candidate must fail that stronger payload-agreement
  check

Reasoning:

- the duplicate-escape benchmark showed a large real false-distinct rate on
  reruns, but the misses were not random
- the common safe pattern was one dominant same-claim candidate plus weaker
  nearby objects
- expanding deterministic attach only for that dominant-candidate shape reduces
  duplicate growth without turning broad similarity into merge authority

## 2026-04-15 - retrieval-request modeling must justify itself against deterministic retrieval

Decision:

- retrieval-request modeling is not assumed to be beneficial just because it is
  model-owned
- proof must compare the deterministic pre-model candidate picture with the
  post-model interpreted request and final retrieval package
- when the model step over-constrains or degrades the retrieval package versus
  deterministic retrieval, that is a blocker

Reasoning:

- the qualitative retrieval-package review showed `4 / 4` current proof probes
  degrading under the model-interpreted request
- deterministic retrieval is currently carrying most of the useful signal
- cutover proof needs to know whether the model step is earning cost and
  complexity rather than treating it as architectural value by assumption

## 2026-04-15 - retrieval-request prompts must explicitly satisfy JSON-object provider requirements

Decision:

- retrieval-request prompts must explicitly mention JSON when using
  `response_format: { type: "json_object" }`
- retrieval-request prompts must specify the exact accepted top-level response
  schema
- retrieval-request prompts must reserve `skip` for clearly non-memory queries
  and prefer `retrieve` for documentation, workflow, architecture, operator,
  project, and reference questions

Reasoning:

- the live retrieval trace runner showed the first blocker was not retrieval
  ranking at all; it was a provider-side `400` because the prompt text did not
  explicitly mention JSON
- after that fix, the next blocker was parse-time because the prompt still
  allowed a different JSON shape
- once the prompt stated the exact schema and skip policy, the same nano lane
  began producing valid retrieval requests on the real populated corpus

## 2026-04-15 - pure support-only rebuild stability must be proven with a dedicated diff lane

Decision:

- support-only rebuild churn must be diagnosed with one explicit
  `attach_support` write, not inferred from broad source reruns
- the dedicated support-only diff lane is the authoritative diagnosis surface
  for pure attach-support stability
- proof-phase whole-source reruns may still be used for broader convergence
  testing, but not as the sole evidence for pure support-only churn

Reasoning:

- the broader proof runner still reported support-only projection and artifact
  churn after rerunning a whole source
- the dedicated diff runner then showed that a pure `attach_support` write left
  projection hashes, artifact hashes, and active slot/set membership unchanged
- that means the remaining churn blocker is in broader derived-surface behavior
  or proof-lane methodology, not in the attach-support write itself

## 2026-04-15 - collision gating may use fuller normalized search overlap before model adjudication

Decision:

- deterministic collision pruning may use fuller `normalizedSearchText`
  overlap instead of anchoring primarily on `normalizedSubject` or
  `normalizedTitle`
- scope, canonical class, and kind guards remain hard boundaries
- a deterministic fast-attach lane is allowed only when:
  - exactly one retained candidate remains
  - class, kind, and scope still match
  - normalized semantic text overlap is very high
  - no same-slot supersession case is present

Reasoning:

- hinge traces showed that raw candidate recall already existed, but
  deterministic pruning was dropping too many plausible same-claim candidates
  before model adjudication
- the fix needed to improve retention on close restatements without turning raw
  similarity into merge authority
- a narrow one-candidate fast-attach path reduces model cost on obvious
  near-restatements while leaving ambiguous cases in the model-owned lane

## 2026-04-15 - proof runners must contain live probe failures and emit evidence

Decision:

- clean-room proof runners must record downstream live probe failures as
  explicit artifact results instead of aborting the entire proof phase
- retrieval/context probe failures remain blockers, but they must appear as
  classified proof outcomes with owning seams and error text

Reasoning:

- the fresh proof rerun reached retrieval/context and then failed on live nano
  provider `400` responses
- aborting the phase hid already-completed ingestion, saturation, and runtime
  read-model evidence
- cutover readiness decisions require full-phase artifacts, even when later
  probes fail

## 2026-04-15 - prompt-only usefulness is judged on deliberate durable baskets, not incidental prompts alone

Decision:

- ordinary-turn usefulness must be judged on two distinct prompt lanes:
  - incidental real prompts from session history
  - deliberately durable prompts designed to express persistent guidance
- passing the deliberate durable basket is enough to keep expanding ordinary-turn
  proof even if incidental prompts remain sparse
- incidental prompt sparsity still blocks any claim that ordinary-turn capture is
  broadly solved

Reasoning:

- incidental prompts often mix planning, meta-instructions, and one-off control
  messages that are valid to omit
- a durable prompt basket is a better bar for whether prompt-only capture can
  persist stable user guidance through the shared two-pass lane
- the durable basket now captures stable claims often enough to justify further
  proof work, while the earlier session basket remains a weaker lane

## 2026-04-15 - ordinary-turn capture reuses the shared two-pass ingestion framework

Decision:

- ordinary-turn capture must use the same candidate-extraction plus
  canonicalization framework as document ingestion
- ordinary turns must not keep a separate degenerate single-pass path
- ordinary-turn tracing and proof must report the shared pass structure
  honestly:
  - `pass_1_candidate`
  - optional `pass_1_repair`
  - `pass_2_canonicalization`
  - optional `pass_2_repair`

Reasoning:

- the prior ordinary-turn path had drifted into calling canonicalization with
  no candidate set
- that made `ignore` the structurally expected result for prompt-only turns,
  which was a repo-owned bug rather than a provider limitation
- once the shared path was restored, prompt-only turns began producing real
  writes again on durable prompts and on at least one real prompt from the
  session basket

## 2026-04-15 - the document-ingestion operator surface is not a memory-slot plugin

Decision:

- expose clean-room document ingestion through the optional OpenClaw tool
  `model_memory_document_ingest`
- do not register `model-memory` as `kind: "memory"` for this operator surface
- keep the tool outside the active memory-slot selection mechanism

Reasoning:

- the goal of this surface is operator access to the clean-room runner/service,
  not silent replacement of the currently selected memory backend
- marking the plugin as `kind: "memory"` caused the loader to disable it when
  the slot remained on `memory-core`
- the operator/admin ingestion surface needs to coexist with the current slot
  posture while cutover is still deferred

## 2026-04-15 - aggressive cutover uses model-memory as primary and native no-memory as rollback

Decision:

- execute an aggressive full cutover from the legacy memory stack to
  `model-memory`
- do not preserve the legacy heuristic memory stack as the preferred rollback
  target
- rollback must disable `model-memory` and fall back to native no-memory
  behavior instead of restoring `memory-core` or QMD as semantic truth
- treat the current legacy memory stack as retirement debt, not a strategic
  coexistence path

Reasoning:

- the clean-room system is now materially stronger than the legacy memory stack
- the remaining issues are in the class of post-cutover monitoring and
  fast-follow fixes rather than architectural invalidation
- keeping the old system as the default fallback would preserve complexity we
  already intend to delete
- the safer long-term posture is:
  - one primary semantic authority
  - one explicit disablement path
  - no permanent dual-memory runtime

## 2026-04-15 - manual UI smoke should use the explicit operator tool contract

Decision:

- manual UI document-ingestion smoke should use the exact
  `model_memory_document_ingest` tool contract
- the canonical first manual UI smoke case is
  `docs/projects/model-memory/roadmap.md`
- the smoke payload should remain explicit and constrained:
  - `chunkSize = 1`
  - `maxConcurrency = 1`
  - `resume = true`
  - nano/nano models
  - explicit `runId` and `recordPath`

Reasoning:

- the operator surface is intended for explicit administrative ingestion, not a
  free-form autonomous background path
- the roadmap document is a clean high-signal manual UI smoke case because it
  already succeeds through the real tool surface
- recording the exact invocation contract reduces ambiguity when the user tests
  the UI manually

## 2026-04-15 - ordinary-turn proof must report the live lane honestly

Decision:

- ordinary-turn proof artifacts must report the actual live stage shape for the
  current lane
- proof artifacts must not relabel stages or collapse them into summary-only
  output
- when the lane changes, the evidence artifacts and readiness docs must be
  rerun and updated to match it

Reasoning:

- the first 10-prompt session proof initially mislabeled the live extraction
  stage
- stage visibility is only useful if it names the real pipeline that ran
- broader ordinary-turn proof decisions depend on knowing whether failures are
  transport, repair/canonicalization, or capture-usefulness issues

## 2026-04-14 - batch document ingestion is promoted to a first-class runner/service

Decision:

- batch document ingestion must no longer live only inside proof-script loops
- the clean-room system now owns a first-class runner/service with:
  - explicit source selection
  - sequential or bounded-concurrency queueing
  - durable run records
  - per-source failure containment
  - resumability by chunk
  - operator-visible status

Reasoning:

- the first-100 population wave proved the need for a reusable operational
  ingestion surface
- broader retrieval, context, rebuild, and cache proof should run on top of a
  stable operator path, not a throwaway script loop
- run records and resumability are operational concerns and should be explicit
  rather than hidden in proof helpers

## 2026-04-14 - heading-path refs are allowed as structural provenance helpers

Decision:

- prompt payloads may expose stable `headingPathRef` options for source windows
- model output may use `headingPathRef` in supporting spans or provenance
- local code must resolve refs back to exact heading arrays before validation
- stored runtime truth remains exact heading paths, not refs

Reasoning:

- recurring rejects in gateway and template docs were caused by long or
  deep heading arrays being replayed imperfectly
- short stable refs reduce structural transcription errors without moving
  semantic authority into local code
- the change is structural only and preserves strict provenance validation

## 2026-04-14 - audited proof admission now uses bounded semantic convergence

Decision:

- audited real-source proof admission no longer uses exact rerun candidate
  overlap or exact rerun object-set equality as the bar
- the current admission bar is:
  - structural validity
  - provenance quality
  - recurrence of the same core durable claims often enough to trust the case
  - bounded active-object growth across repeated runs
  - runtime cleanliness
  - honest source suitability

Reasoning:

- the accepted nano/nano lane does not deliver exact rerun identity stability
  on large real sources
- keeping exact overlap as the active bar would encode a known model
  limitation as a project blocker
- the claim-plus-support architecture exists specifically so some capture drift
  can be absorbed without turning every variation into a new active object
- the honest question is whether the system converges enough in aggregate to be
  trustworthy, not whether it replays the same object list exactly

## 2026-04-14 - nano and nano are the universal default model lane

Decision:

- the default pass 1 candidate-discovery model is
  `openrouter/openai/gpt-5.4-nano`
- the default pass 2 canonicalization model is
  `openrouter/openai/gpt-5.4-nano`
- `openrouter/openai/gpt-5-mini` is comparison-only and must never remain the
  silent default for any model-memory run lane

Reasoning:

- the current requirement is to keep the live default posture explicit,
  bounded, cheap, and consistent across ingestion, evidence, and proof runs
- `gpt-5-mini` may still be useful for explicit bounded comparisons, but those
  are experiments, not defaults
- the repo should not drift into mixed implicit defaults across scripts and docs

## 2026-04-14 - residual batched collision adjudication is good enough for now

Decision:

- keep the current deterministic-first plus batched-remainder collision path as
  the working baseline for broader ingestion proof
- do not keep blocking wider ingestion on further residual prompt tuning
- revisit residual close-case calibration later only if wider corpus runs show
  repeated attach-support misses or noisy distinct growth

Reasoning:

- the collision lane has already been reduced from one prompt per candidate to
  a small ambiguous remainder
- at least some real residual cases now resolve to `attach_support`
- the remaining question is no longer whether the residual prompt is perfect,
  but whether broader ingestion still shows material duplicate pollution or
  unresolved close-case drift

## 2026-04-14 - collision adjudication becomes deterministic-first and batched

Decision:

- collision recall must add a conservative deterministic gate before any
  model-owned collision adjudication runs
- obviously unrelated prior objects must be filtered out locally before they
  reach the adjudicator
- the unresolved remainder should be adjudicated in one batched model call per
  source write batch by default, not one prompt per object
- the collision lane should bias toward memory loss over junk when the remainder
  cannot be resolved safely

Reasoning:

- the AGENTS.md live trace showed that the current scorer still opened
  collision prompts for many clearly unrelated rule pairs
- that means the current cost is dominated by noisy candidate generation, not by
  true semantic ambiguity
- the claim-plus-support architecture can tolerate some missed support
  attachment better than it can tolerate duplicate-object junk and excessive
  collision-call churn
- batching the small ambiguous remainder preserves model-owned semantics while
  materially reducing write-path model volume

## 2026-04-13 - canonical project docs area is `docs/projects/`

Decision:

- create `docs/projects/` as the canonical repo-tracked top-level area for project workspaces
- create this project at `docs/projects/model-memory/`

Reasoning:

- the live repo did not already have a canonical project-docs area
- the project must be tracked in the main repo and linked from the central docs index
- this keeps clean-room project records separate from legacy memory docs

## 2026-04-13 - code location is `extensions/model-memory`

Decision:

- the clean-room implementation will live at `extensions/model-memory`

Reasoning:

- it stays parallel to the legacy memory package
- it remains visible in the main repo
- it avoids entangling the new architecture with legacy runtime modules

## 2026-04-13 - four-pillar architecture is adopted

Decision:

- the target architecture inside OpenClaw is:
  - harness
  - context engine
  - memory layer
  - usage/cache layer

Reasoning:

- the memory layer alone is not enough to support real runtime behavior
- the surrounding runtime layers must be specified explicitly without turning them into semantic truth

## 2026-04-13 - initial scope is document ingestion and ordinary-turn user capture only

Decision:

- v1 covers:
  - document ingestion
  - ordinary-turn user capture

Deferred:

- retrieval implementation
- live context injection integration
- advisory planning
- review tooling
- migration/cutover

## 2026-04-13 - ontology is canonical-class-first with minimal internal kinds

Decision:

- canonical classes remain:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- internal kinds are exactly:
  - `preference`
  - `fact`
  - `rule`
  - `procedure`
  - `reference`

Reasoning:

- this is the smallest clean decomposition that still supports the required memory behavior
- it removes detector-era naming and category drift from runtime truth

## 2026-04-13 - activation, projection, context, and usage layers are derived layers

Decision:

- runtime read models, workspace projections, dynamic packs, context assembly, and usage/cache ledgers are all derived layers
- none of those layers may extend or replace the canonical semantic contract

Reasoning:

- this preserves one semantic source of truth
- it prevents the runtime stack from becoming a second hidden ontology

## 2026-04-13 - `ruleSubtype` is removed from v1

Decision:

- v1 does not include `ruleSubtype`

Reasoning:

- rule meaning is carried by canonical class, kind, payload, scope, and provenance
- a subtype field would likely become a new hidden family registry
- if a subtype is ever needed later, it must be justified by downstream behavior that cannot be derived from the base rule object

## 2026-04-13 - `rationaleCodes` is optional audit metadata only

Decision:

- `rationaleCodes` remains in the schema as optional audit metadata
- it must use closed generic codes only
- it is forbidden as runtime semantic authority

Forbidden uses:

- semantic interpretation
- canonical class or kind assignment
- dedupe
- supersession
- retrieval truth
- write policy
- review policy

Reasoning:

- the system needs traceability for handling decisions
- freeform or semantically meaningful rationale would recreate hidden memory scaffolding
- keeping it audit-only preserves observability without adding ontology sprawl

## 2026-04-13 - v1 runtime is standalone with optional shadow mode later

Decision:

- no live cutover or replacement in v1
- build standalone first
- optional shadow mode is specified for later implementation
- keep one package first and revisit splitting memory and context layers later if needed

## 2026-04-13 - v1 records `reviewMode` but overrides execution to auto-accept

Decision:

- `reviewMode` stays in the schema
- the model may emit any supported `reviewMode`
- v1 write execution overrides accepted objects to `auto_accept`
- the original suggested `reviewMode` may be persisted for audit and analysis

Reasoning:

- this preserves forward compatibility for stricter later policy
- it honors the current product decision to auto-accept valid captures in v1
- it avoids conflating schema design with current write-policy strictness

## 2026-04-13 - runtime projections are first-class downstream consumers

Decision:

- bootstrap file generation is part of the architecture
- generated bootstrap and project files remain downstream consumers of memory truth
- repo-tracked docs are not the default runtime output surface
- `.openclaw/model-memory/` is the canonical runtime-generated artifact root

Reasoning:

- projections are needed for practical runtime use
- treating them as derived artifacts avoids polluting semantic truth or turning repo docs into volatile cache surfaces

## 2026-04-13 - existing `MEMORY.md` and `USER.md` content must be ingested before replacement

Decision:

- current human-authored `MEMORY.md` and `USER.md` content must be audited and ingested where appropriate before generated projections replace them

Reasoning:

- the project must not erase existing memory content that is not yet in canonical storage
- migration of meaning must happen before projection replacement

## 2026-04-13 - storage uses the same server with a new logical database

Decision:

- reuse the same Supabase/Postgres server
- create a separate logical database for `model-memory`

Reasoning:

- strong isolation from legacy schema and data
- shared operational environment without schema-level cross-contamination

## 2026-04-13 - prompt contract may use placeholder examples only

Decision:

- prompt examples may use placeholder-only examples such as `<subject>` and `<value>`
- prompt examples may not contain concrete memory content

## 2026-04-13 - every model-owned contract is versioned

Decision:

- every model-owned step must record:
  - `contractName`
  - `contractVersion`
  - `modelId`

Reasoning:

- extraction is not the only place where model drift can affect behavior
- retrieval interpretation, reranking, and later session-summary generation must not become unversioned blind spots

## 2026-04-13 - proof policy uses adjudicated objects plus optional stored real model outputs

Decision:

- primary proof mode: adjudicated expected structured objects
- secondary optional proof mode: stored real model outputs

Reasoning:

- expected objects remain the main truth surface
- stored model outputs are useful as replay evidence but do not become the only semantic authority

## 2026-04-13 - live persistence uses package-local ordered SQL migrations

Decision:

- `model-memory` uses package-local ordered SQL migrations under `extensions/model-memory/migrations/`
- the live repository path uses Postgres-compatible SQL with `pg` at runtime and `pg-mem` in tests

Reasoning:

- the repo did not already provide a package-local migration convention for this clean-room package
- the package needs executable schema now without borrowing legacy memory infrastructure
- the same boundary keeps canonical truth and derived runtime state explicit and testable

## 2026-04-13 - the live logical database is `model_memory`

Decision:

- the shared Supabase/Postgres server now hosts the clean-room logical database
  as `model_memory`
- the initial package migration is applied there from
  `extensions/model-memory/migrations/0001_model_memory_init.sql`
- non-default environments may still override the connection explicitly, but
  `model_memory` is the canonical live target name for this project

Reasoning:

- this removes ambiguity from provisioning and runtime wiring
- it preserves the earlier decision to isolate the clean-room schema from the
  legacy memory database
- it keeps environment override behavior explicit instead of implicit

## 2026-04-13 - harness integration crosses through a narrow runtime bridge

Decision:

- harness integration uses a narrow runtime bridge rather than turning projections or reports into truth
- bootstrap files, context assembly, retrieval-pack inclusion, and usage normalization remain downstream consumers

Reasoning:

- the memory layer must remain the only semantic authority
- the harness still needs an explicit attachment point to consume projections, packs, and ledger state
- a narrow bridge reduces the chance of core runtime seams reintroducing ontology or compatibility drift

## 2026-04-13 - bounded semantic equivalence is allowed in proof, not in writes

Decision:

- proof may allow bounded semantic equivalence
- writes must use deterministic normalized identity
- v1 forbids similarity-threshold or embedding-only merge in the live write path
- v1 allows bounded model-owned collision adjudication only after exact
  identity and bounded candidate recall

Reasoning:

- proof needs some tolerance for model drift
- storage must stay stable and conservative
- threshold-only fuzzy merge in runtime would recreate a semantic forest

## 2026-04-14 - finalized daily continuity recovery is a secondary capture lane

Decision:

- keep the existing daily continuity source shape at `memory/YYYY-MM-DD.md`
- allow a recovery ingestion lane over finalized daily continuity files
- treat that lane as candidate recovery only, not as independent semantic proof

Reasoning:

- primary turn and document capture may legitimately miss durable memories on
  the first pass
- finalized daily continuity gives the system a second recovery opportunity
- derived summaries must not inflate evidence strength for memories already
  captured from primary sources

## 2026-04-14 - durable memories are claims with multiple support items

Decision:

- a durable memory object is no longer modeled as one write from one source
  window
- one memory object may accumulate multiple support items from multiple source
  windows
- support weighting must distinguish independent reinforcement from same-source
  reruns and derived daily recovery

Reasoning:

- wording drift across reruns should collapse into one durable claim where the
  underlying memory is the same
- support/provenance should absorb capture variation without bloating the active
  memory set
- same-source reruns must not inflate confidence

## 2026-04-14 - live duplicate handling uses retrieve plus adjudicate plus attach-or-create

Decision:

- exact normalized identity remains the first dedupe mechanism
- when exact identity does not resolve a write, the live path may use bounded
  hybrid recall to find plausible prior objects
- hybrid recall is candidate generation only
- a constrained model-owned collision adjudication step decides among:
  - `attach_support`
  - `supersedes`
  - `distinct`
  - `conflict_hold`

Reasoning:

- strict exact-identity-only dedupe is insufficient for near-duplicate capture
  drift
- similarity thresholds alone are too weak to act as merge authority
- bounded adjudication keeps semantics model-owned while leaving policy and
  activation deterministic

## 2026-04-14 - lifecycle state separates active memory from provisional capture

Decision:

- memory objects may carry lifecycle states including:
  - `provisional`
  - `active`
  - `superseded`
  - `expired`
  - `conflict_hold`
- default runtime read models and projections operate on active memory only
- provisional visibility outside operator or experimental surfaces is deferred

Reasoning:

- the system needs a place for recovered or uncertain candidates without
  polluting the active runtime set
- low-quality edge cases can be bounded by expiry and reinforcement policy
- no human review queue should be required for basic operation

## 2026-04-13 - retrieval is model-planned and object-native

Decision:

- retrieval is part of the clean-room architecture and is now specified even though implementation remains deferred
- retrieval queries are interpreted into a structured retrieval request by the model
- candidate recall is deterministic and object-native
- optional reranking or packing may use the model, but retrieval truth stays attached to stored semantic objects and provenance
- retrieval must not depend on:
  - legacy family/category vocabularies
  - fixed memory strings
  - exact rendered statements
  - compatibility projections as query truth

Reasoning:

- the system is not complete as a memory architecture without a read path
- retrieval must stay aligned with the same first-principles semantic contract as writes
- deterministic candidate recall avoids creating a new fuzzy semantic forest in the read path

## 2026-04-22 - Phase 2 graph, capsule, planner, synthesis, and privacy decisions

Decision:

- graph runtime uses an authority trust ladder, not a review-only model
- deterministic structural graph edges are automatically usable for read-time
  retrieval when backed by MMV2 events, explicit edges, ids, source refs,
  scope, status, or source lineage
- inferred graph edges start as low-authority probationary read-time edges with
  TTL, telemetry, decay, and promotion only after repeated useful retrieval
  evidence
- capsule artifacts will materialize under
  `/root/.openclaw/workspace/.openclaw/knowledge/capsules/` after the derived
  knowledge root is documented in workspace topology
- hierarchical retrieval defaults to deterministic single-pass and escalates to
  bounded multi-pass only for broad or multi-objective prompts
- heartbeat becomes the primary proactive planner surface and should surface
  skill, tool, and workflow opportunities alongside derived maintenance signals
- skill, tool, and workflow candidate discovery may be proactive, but
  promotion, installation, privileged enablement, and standing automation remain
  approval-gated
- privacy and prompt-injection hardening uses automatic safe defaults instead
  of waiting indefinitely for manual review
- stale projection and capsule artifacts are excluded from normal injection
  unless explicitly requested for inspection

Reasoning:

- review-only behavior would leave most useful graph and privacy decisions
  unactioned because manual review is unlikely to happen consistently
- automatic use is acceptable only where it is read-time, reversible,
  provenance-backed, and unable to mutate canonical MMV2 truth
- heartbeat is the right first operator surface for proactive behavior because
  it can batch low-friction decisions without requiring a dedicated UI
- capsules belong to the derived knowledge graph layer, but they must remain
  compiled artifacts rather than a second truth store

## 2026-04-13 - generated workspace projections own fenced zones only

Decision:

- generated projection output may write only inside explicit generated zones
- human-owned content outside those zones must remain untouched

Reasoning:

- projections are downstream runtime artifacts, not permission to overwrite project docs wholesale
- the generated-zone boundary keeps bootstrap projection practical without turning workspace files into unsafe cache surfaces

## 2026-04-19 - curated workspace MEMORY.md stays human-owned

Decision:

- workspace `MEMORY.md` is no longer a live generated-zone target
- curated `MEMORY.md` remains fully human-owned and `no_overwrite`

Reasoning:

- the mixed-purpose file had become structurally wrong for a continuity surface
- generated standing context and recall scaffolding were crowding out the
  actual human-curated durable memory
- continuity ownership is clearer and safer when the workspace file is not also
  acting as a generated cache surface

## 2026-04-19 - memory-md bootstrap semantics survive as a separate generated artifact

Decision:

- `memory-md` remains a valid projection target
- its rendered output is injected into bootstrap context through the generated
  artifact path recorded in `canonicalArtifactPath`
- it is not written back into workspace `MEMORY.md`

Reasoning:

- startup grounding still needs the bounded stable packet that `memory-md`
  provides
- separating the generated projection artifact from the curated workspace file
  preserves both ownership and bootstrap semantics
- the artifact path itself keeps provenance visible at runtime

## 2026-04-13 - v1 context engine delegates compaction

Decision:

- the `model-memory` context engine assembles context and records usage/cache state
- compaction remains delegated to the OpenClaw runtime in the current implementation stage

Reasoning:

- this keeps the clean-room package focused on assembly and derived artifacts first
- it avoids premature growth of a second summarization subsystem before persistence and harness integration are proven

## 2026-04-13 - retrieval packs are explicit derived artifacts

Decision:

- retrieval results may be materialized into retrieval packs
- retrieval packs are included in assembly only when explicitly requested
- retrieval packs are never semantic truth

Reasoning:

- retrieval is a read-path packaging layer, not a second semantic layer
- explicit inclusion prevents retrieval from silently becoming always-on hidden authority

## 2026-04-13 - shadow comparison is observational and object-native only

Decision:

- shadow mode compares `model-memory` and legacy outputs by canonical object identity and write outcomes only
- shadow mode must not backfill, repair, or redefine `model-memory` truth from legacy outputs

Reasoning:

- comparison is needed to understand divergence before cutover
- allowing comparison to become a repair path would immediately reintroduce legacy semantic authority

## 2026-04-13 - context engine assembly is layered and compaction delegates in phase 1

Decision:

- context assembly uses:
  - stable bootstrap projections
  - semi-stable memory packs
  - volatile live context
- Phase 3 context assembly must work without retrieval
- phase 1 compaction remains delegated to the OpenClaw runtime

Reasoning:

- layered assembly supports token discipline and prompt-cache stability
- making assembly valid before retrieval keeps the roadmap executable and avoids fake retrieval shortcuts
- delegating compaction keeps the first implementation smaller and more auditable

## 2026-04-13 - usage/cache observability stores counters plus segment hashes

Decision:

- the usage/cache layer stores provider-normalized counters plus segment-level prompt-shape hashes

Reasoning:

- counters show total cost
- segment hashes show which layer changed, which helps explain cache misses and token growth without making observability a full prompt-text archive

## 2026-04-25 - Phase 2 production rollout requires typed config seam

Decision:

- Phase 2 graph reads, `project_state` capsule retrieval, capsule context,
  hierarchical retrieval, maintenance surfacing, soft-source runtime ingestion,
  and non-user-prompt ingestion must be controlled by a typed rollout config
  before any production enablement
- the rollout config resolves capability modes into the production gate policy
  and controlled retrieval-pack options
- default runtime behavior remains disabled or shadow-only
- controlled production requires passing Slice 8 retrieval integration proof,
  Slice 9 comprehensive eval/no-dark-data proof, and UI runtime proof coverage

Reasoning:

- proof artifacts show that a capability can behave safely, but they are not a
  live rollout control plane
- a typed config seam keeps eval/operator enablement, controlled production,
  and default promotion separate
- preserving no-dark-data, source authority, freshness, conflict, and
  inspection-only checks at config resolution prevents invalid rollout settings
  from reaching retrieval/context assembly

## 2026-04-25 - controlled Phase 2 config requires live UI proof before default promotion

Decision:

- controlled Phase 2 retrieval configuration must be proven through a
  Tailscale-safe UI/operator proof before any default live promotion
- the proof may enable controlled config only in an explicit bounded eval path
- the proof must validate rollout config resolution, production gate decisions,
  read-only graph reads, `project_state` capsule retrieval, gated capsule
  context, default-off behavior, and no-dark-data status
- planner/proactivity remains deferred until controlled retrieval/context
  behavior has a separate green promotion decision

Reasoning:

- unit and proof harness coverage is necessary but not enough to prove the live
  operator path
- default promotion should be based on an operator-visible proof artifact, not
  on a code-level capability switch
- keeping the controlled config proof separate from default promotion preserves
  rollback clarity and prevents graph/capsule context from silently becoming
  production behavior

## 2026-04-25 - controlled production go-live requires scoped approval artifact

Decision:

- Phase 2 controlled production go-live requires an explicit validation report
  that reviews Slice 8, Slice 9, UI runtime coverage, and Slice 13 controlled
  config proof artifacts
- the first go-live approval may be scoped to live/operator sessions and
  projects, with capability-level approvals instead of broad default promotion
- graph reads, `project_state` capsule retrieval, and gated capsule context may
  be approved for the bounded scope when proof artifacts and live regression are
  clean
- hierarchical retrieval remains shadow-only until a separate controlled
  promotion proof approves it
- broad default promotion remains a separate decision after scoped production
  behavior has been observed

Reasoning:

- Slice 13 proved the controlled config path, but go-live needs a durable
  control-plane decision that binds proof artifacts to a rollout scope
- capability-level approval keeps rollback and partial approval explicit
- separating scoped production from broad default promotion prevents accidental
  context injection outside the intended operator/eval surface

## 2026-04-25 - scoped Phase 2 production rollout consumes approved go-live artifact

Decision:

- scoped Phase 2 production rollout must be enabled by a typed rollout profile
  derived from an approved go-live validation artifact
- the approved profile binds report id, rollout scope id, rollout config id,
  selected proof hashes, allowed sessions/projects/operators, capability modes,
  and rollback target modes
- live/runtime calls outside the approved scope continue to resolve to disabled
  or shadow-only behavior
- inside the approved scope, graph reads, `project_state` capsule retrieval, and
  gated capsule context may flow through controlled retrieval packs when the
  profile and production gates allow them
- hierarchical retrieval remains shadow-only, and broad default promotion
  remains a separate decision after scoped production observation is clean

Reasoning:

- the approved go-live artifact is the control-plane decision; the scoped
  rollout profile is the live-runtime mechanism that consumes it
- exact typed scope matching prevents accidental expansion from operator/eval
  proof into broad default behavior
- binding proof hashes and rollback modes into the profile keeps provenance and
  rollback auditable before any future default-promotion decision

## 2026-04-25 - proof-bound Phase 2 retrieval defaults

Decision:

- `runtime_graph_reads`, `project_state_capsule_retrieval`, and
  `project_state_capsule_context` may be promoted to default production only by
  a typed default-promotion decision bound to the approved go-live and scoped
  rollout observation artifacts
- promoted graph reads remain read-only retrieval support and are not semantic
  truth
- promoted `project_state` capsule retrieval and context must preserve source
  memory ids, source refs, source profile ids, authority tiers, content hashes,
  freshness/conflict markers, and proof hashes
- `MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED` is the rollback kill switch
  for the promoted retrieval defaults
- hierarchical retrieval remains shadow-only and moves next to a separate
  controlled promotion proof substrate; planner/proactivity remains deferred

Reasoning:

- the scoped rollout proof established that the selected capabilities work
  inside an approved scope; default promotion needs a distinct proof-bound
  decision with rollback and ordinary-path observation
- keeping the hierarchical retrieval work as a next-build readiness substrate
  prevents fan-out from becoming default behavior before its own proof gate

## 2026-04-26 - controlled hierarchical retrieval requires live proof

Decision:

- `hierarchical_retrieval` may move from shadow-only to live controlled
  operator/eval scope only after a typed controlled-promotion proof validates the
  default-promoted graph/capsule/context inputs
- outside the approved scope, hierarchical retrieval remains shadow-only
- controlled hierarchical retrieval must emit bounded subquery plan, merge and
  dedupe reasons, selected/excluded ids, authority tiers, source profile ids,
  source memory ids, lane usage, rollback status, and no-dark-data status
- `MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED` is the rollback switch
  for controlled hierarchical retrieval
- default promotion remains a separate decision after controlled live behavior
  is observed

Reasoning:

- hierarchical fan-out changes retrieval behavior materially, so live proof must
  demonstrate bounded planning and deterministic merge behavior before default
  promotion
- keeping the controlled proof separate from default promotion makes rollback
  and partial approval explicit

## 2026-04-26 - hierarchical retrieval default promotion is proof-bound

Decision:

- `hierarchical_retrieval` may become ordinary/default retrieval behavior only
  through a typed default-promotion decision bound to the controlled
  hierarchical proof artifact and the prior default graph/capsule/context
  promotion artifact
- default hierarchical retrieval must keep bounded subquery and merge budgets,
  preserve source memory ids/source refs/source profile ids/authority tiers, and
  expose deterministic merge/dedupe/exclusion telemetry
- exact recent evidence must continue to win over stale older evidence, and
  stale/conflicted/inspection-only material must remain excluded or visibly
  blocked
- `MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED` is the rollback switch
  that restores shadow/single-pass behavior
- planner/proactivity remains deferred

Reasoning:

- the controlled proof demonstrated that hierarchical retrieval can run inside
  approved operator/eval scope; default promotion needs a separate ordinary-path
  proof with rollback before fan-out can be treated as default retrieval
  behavior
- binding the decision to approved proof hashes prevents accidental promotion
  from unreviewed artifacts or partial evidence

## 2026-04-26 - operator ingestion and maintenance surfacing are operator-only

Decision:

- `maintenance_candidate_surfacing` may be live as operator-visible/report-only
  behavior with bounded candidate ids, source refs, authority tiers, source
  profile ids, lifecycle states, and no-dark-data status
- `soft_source_runtime_ingestion` and `non_user_prompt_ingestion` may be live
  only on approved operator paths that preserve source profile, authority tier,
  provenance/source refs, and lower-authority labeling
- tool-grounded, daily-continuity, and researcher/cited-soft sources may be
  admitted only through the typed source-authority profile rules
- assistant prose alone is not authority; raw prompts, full transcripts, raw
  tool logs, secrets, and private phrases remain rejected or inspection-only and
  excluded from normal retrieval
- `MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_DISABLED` is the rollback switch for
  the operator ingestion rollout path
- broad default ingestion remains gated pending additional live regression

Reasoning:

- the remaining Phase 2 capture/maintenance surfaces are useful only if
  operators can inspect the admission/rejection and lifecycle decisions that
  drive them
- keeping this rollout operator-only preserves provenance and no-dark-data
  guarantees while avoiding broad ingestion defaults before a separate proof

## 2026-04-26 - promoted retrieval requires production observability and rollback proof

Decision:

- default-promoted Phase 2 retrieval behavior must have operator-visible health
  reports before it is treated as operable production behavior
- production health reports must summarize graph reads, `project_state` capsule
  retrieval, `project_state` capsule context, hierarchical retrieval, fallback
  decisions, rollback decisions, latency/budget stats, selected/excluded ids,
  source profile ids, authority tiers, proof hashes, and no-dark-data status
- stale/conflict leakage, inspection-only leakage, missing provenance, budget
  overflow, stale-marker regressions, and missing rollback telemetry are
  explicit health alerts
- rollback proof must show graph/capsule/context/hierarchical retrieval can
  return to disabled or shadow-only modes and ordinary retrieval falls back to
  object-native single-pass behavior

Reasoning:

- live/default promotion is not enough; operators need bounded evidence that
  the promoted behavior remains safe over time and can be reversed quickly
- modeling rollback as a proof artifact keeps operational reversibility subject
  to the same no-dark-data and provenance rules as promotion

## 2026-04-26 - default ingestion promotion is proof-bound and source-profile limited

Decision:

- `tool_grounded_capture`, `daily_continuity_capture`,
  `researcher_cited_soft_capture`, and `cited_assistant_fact_capture` may be
  default-enabled only after the operator ingestion proof and production
  observability proof are both green
- cited assistant output is never authority as prose; only the underlying cited
  facts/source refs may be captured under the `cited_assistant_answer` profile
- soft-source and non-user-prompt ingestion default enablement must preserve
  source profile id, authority tier, source refs, lower-authority labels, and
  no-promotion-by-corroboration semantics
- raw prompts, full transcripts, raw tool logs, secrets, and private phrases
  remain rejected or inspection-only and excluded from normal retrieval
- `MODEL_MEMORY_PHASE2_DEFAULT_INGESTION_DISABLED` returns promoted ingestion
  paths to operator-enabled modes

Reasoning:

- default ingestion is higher risk than operator-only surfacing, so it depends
  on both the source-authority proof and live production observability
- keeping source types capability-scoped avoids turning broad ingestion into an
  implicit semantic authority path

## 2026-04-26 - planner readiness is broad evidence, report-only, and non-proactive

Decision:

- planner/proactivity readiness may consume bounded, provenance-bearing evidence
  from durable MMV2 memories, project docs, curated docs/manual notes,
  source-adapter outputs, tool-grounded artifacts, researcher/cited-soft
  artifacts, daily continuity artifacts, runtime graph summaries,
  `project_state` capsules, retrieval packs, hierarchical plans, maintenance
  reports, production observability reports, and rollout proof reports
- graph summaries, capsules, retrieval packs, hierarchical reports, project
  docs, and rollout reports are planner evidence/control-plane/read-model
  inputs, not semantic truth or external instructions
- planner-readiness output is operator-visible/report-only; proactive surfacing
  and planner action execution remain disabled
- planner candidates must preserve source refs, source profile ids, authority
  tiers, content/proof hashes, freshness/conflict markers, and no-dark-data
  status
- inspection-only, stale, conflicted, missing-provenance, budget-unsafe, or
  no-dark-data-failing inputs are blocked or labeled with deterministic reason
  codes

Reasoning:

- a useful future planner cannot be restricted to durable DB memory alone; it
  needs the same approved project/docs/artifact evidence operators already use
  to validate memory behavior
- keeping readiness report-only prevents a premature proactivity launch while
  still proving the evidence model, provenance propagation, and no-dark-data
  gates required for a later planner slice

## 2026-04-26 - controlled planner candidate plans require explicit operator/eval scope

Decision:

- planner readiness may advance to controlled operator/eval use only when the
  request matches an explicit approved scope
- inside approved scope, the planner may generate bounded candidate plans from
  durable memory plus approved project/docs/artifact evidence, but every plan
  remains report-only and non-actionable
- outside approved scope, planner candidate-plan generation remains disabled
  and readiness stays report-only
- candidate plans must preserve evidence bindings, source refs, source profile
  ids, authority tiers, content/proof hashes, no-dark-data status, and explicit
  evidence-not-instruction handling
- `MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED` rolls controlled planner
  candidate-plan generation back to readiness/report-only behavior
- no proactive user-facing message, user interruption, hidden chat injection, or
  planner action execution is permitted by this controlled scope

Reasoning:

- operator utility requires a requestable planner surface before any default
  promotion decision, but scope matching and rollback are required to avoid
  accidentally creating proactive behavior
- using the Slice 19 readiness report as the evidence source keeps the
  controlled planner path broad enough for project/docs/artifact evidence while
  preserving authority and no-dark-data gates

## 2026-04-26 - planner candidate reports may be default-visible to operators only

Decision:

- planner candidate reports may be promoted to ordinary/default operator-visible
  reports after the controlled planner proof is green
- this promotion is not user-facing proactivity: no proactive user message, user
  interruption, hidden normal-chat injection, or planner action execution is
  allowed
- default-visible planner reports must preserve evidence bindings, source refs,
  source profile ids, authority tiers, content/proof hashes, no-dark-data
  status, and evidence-not-instruction handling
- project docs, graph summaries, capsules, retrieval packs, hierarchical plans,
  and rollout/proof reports remain evidence/read-model inputs, not semantic
  truth or external instructions
- `MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED` rolls default-visible
  planner reports back to controlled/readiness report-only behavior

Reasoning:

- operators need planner candidate reports in ordinary operational flows before
  any later proactivity decision can be considered
- keeping the promotion operator-visible and non-actionable proves utility while
  preserving the action/proactivity boundary

## 2026-04-26 - proactivity action boundary is classified but non-executing

Decision:

- planner/proactivity outputs are classified as `report_only`,
  `suggestion_only`, `approval_required_action`, or `blocked_action`
- `approval_required_action` outputs may be staged only as operator-visible
  proposal artifacts; no action executes in this slice
- `blocked_action` outputs cannot be staged or executed and must carry
  deterministic reason codes
- external/docs/tool/report text remains evidence, never instruction
- missing provenance, inspection-only, stale/conflicted, lower-authority unsafe,
  or no-dark-data-failing inputs block or downgrade suggestion/actionability
- `MODEL_MEMORY_PHASE2_PROACTIVITY_BOUNDARY_DISABLED` rolls suggestions and
  staged proposals back to planner operator reports only
- proactive user-facing messages and action execution remain disabled

Reasoning:

- before any proactive rollout, the system needs a tested boundary between
  evidence-backed planning, suggestion, approval-required proposal, and blocked
  action
- proving this boundary without executing actions prevents a planner report from
  becoming an implicit automation channel

## 2026-04-26 - controlled proactivity suggestions require explicit operator/eval scope

Decision:

- proactivity suggestions may be generated only for explicit approved
  operator/eval scope
- controlled suggestions are operator-visible report artifacts only; they do
  not send proactive user-facing messages, inject hidden chat context, or
  execute actions
- suggestions must preserve evidence bindings, source refs, source profile
  ids, authority tiers, content/proof hashes, no-dark-data status, and
  evidence-not-instruction handling
- project docs, external reports, graph summaries, capsules, retrieval packs,
  planner reports, and boundary reports remain evidence/read-model inputs, not
  semantic truth or instructions
- `MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED` rolls
  controlled suggestions back to planner operator reports only

Reasoning:

- operators need a requestable suggestion surface before approval workflow or
  controlled execution can be useful
- keeping suggestions scoped, report-only, and rollbackable prevents planner
  outputs from becoming implicit user-facing proactivity or automation

## 2026-04-26 - staged action approval is auditable but non-executing

Decision:

- `approval_required_action` outputs may be staged as operator-visible proposal
  artifacts only when controlled proactivity suggestions and the action
  boundary proof are green
- operators may approve or reject staged proposals, and both paths must produce
  bounded audit entries with proposal ids, operator ids, evidence hashes, and
  deterministic reason codes
- approved proposals remain `approved_not_executed`; no tool, command,
  mutation, or user-facing proactive message executes in this slice
- `blocked_action` outputs cannot be staged or approved
- external/docs/tool/report text remains evidence, never instruction
- `MODEL_MEMORY_PHASE2_STAGED_ACTION_APPROVAL_DISABLED` rolls staging and
  approval back to controlled suggestions only

Reasoning:

- approval workflow has to be observable and auditable before any controlled
  execution proof is meaningful
- keeping approval separate from execution prevents approval artifacts from
  becoming an implicit automation channel

## 2026-04-26 - controlled action execution is limited to harmless proof artifacts

Decision:

- a narrow controlled execution path may execute only the
  `write_bounded_proof_artifact` action kind in explicit operator/eval scope
- execution requires an `approved_not_executed` staged proposal, explicit
  execution approval, provenance, no-dark-data pass, and inactive rollback
- unsafe action kinds such as external commands, network calls, DB mutations,
  and user-facing messages are blocked with deterministic reason codes
- controlled execution writes bounded proof/audit artifacts only and preserves
  proposal ids, approval report ids, operator ids, evidence hashes, source
  refs, source profiles, and authority tiers
- `MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXECUTION_DISABLED` rolls execution
  back to the staged approval workflow
- proactive user-facing messages and broad autonomous action execution remain
  disabled

Reasoning:

- proving one harmless approved action class validates the approval/execution
  boundary without creating a general automation channel
- keeping execution proof-only and rollbackable provides evidence for future
  controlled action expansion while preserving the non-user-facing proactivity
  posture

## 2026-04-26 - controlled action execution supports operator review notes

Decision:

- controlled action execution may also execute `create_operator_review_note`
  in explicit operator/eval scope
- operator review notes are bounded control-plane artifacts only; they do not
  send user-facing messages, call external tools, mutate DB state, or write
  unsafe files
- execution still requires an approved staged proposal, explicit execution
  approval, provenance, no-dark-data pass, and inactive rollback
- unsafe action kinds remain blocked with deterministic reason codes
- `MODEL_MEMORY_PHASE2_CONTROLLED_ACTION_EXPANSION_DISABLED` rolls expanded
  action execution back to the proof-artifact-only execution posture
- proactive user-facing messages and broad autonomous execution remain disabled

Reasoning:

- adding one additional harmless operator-visible action proves the action
  boundary can support useful operator workflow without becoming automation
- keeping the action artifact-only, approval-gated, and rollbackable preserves
  the safety properties proven in the initial controlled execution slice

## 2026-04-26 - approved action execution workflow may be default-visible to operators

Decision:

- ordinary operator surfaces may expose the controlled action execution workflow
  by default after Slice 25 and Slice 26 proof reports pass
- default-visible means operators can see and use the workflow; every execution
  still requires staged approval and explicit execution approval
- allowed executable action kinds remain `write_bounded_proof_artifact` and
  `create_operator_review_note`
- unsafe external command, network, DB mutation, user message, and unsafe file
  mutation actions remain blocked
- `MODEL_MEMORY_PHASE2_ACTION_EXECUTION_OPERATOR_DEFAULT_DISABLED` rolls the
  workflow back to controlled operator/eval-only visibility
- user-facing proactive messages and autonomous action execution remain disabled

Reasoning:

- making the approval-gated workflow visible by default gives operators live
  utility without changing the execution boundary
- the default-visible decision is proof-bound to the two harmless action classes
  and keeps all action execution explicit, audited, and rollbackable

## 2026-04-26 - first controlled user-facing proactive message path is proof-delivered

Decision:

- the first low-risk proactive message class is
  `operator_approved_suggestion_available`
- controlled message delivery requires an approved controlled suggestion,
  staged approval, explicit send approval, approved operator/eval scope,
  provenance, no-dark-data pass, and inactive rollback
- because no broad safe notification seam is being introduced here, delivery is
  represented as a bounded proof-delivery artifact rather than a default live
  user notification
- blocked message classes include unapproved suggestions, external-instruction
  messages, private/secret content, raw prompt/transcript content, and
  autonomous action requests
- `MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED` disables the
  controlled message proof path
- broad/default proactive user-facing messages and autonomous action execution
  remain disabled

Reasoning:

- proof-delivery validates the policy, approval, audit, and no-dark-data
  boundary without inventing a broad notification channel
- the message payload is intentionally narrow and contains only safe ids,
  source refs, source profile ids, authority tiers, hashes, and bounded display
  text

## 2026-04-26 - live proactive message delivery uses the gateway inject seam

Decision:

- the first live proactive message delivery seam uses the existing
  `chat.inject` gateway path for the single approved message class
  `operator_approved_suggestion_available`
- delivery is allowed only inside explicit operator/eval scope after an
  approved controlled suggestion, staged approval, explicit send approval,
  provenance, no-dark-data pass, and inactive rollback
- the delivered text is fixed bounded prose: "An approved operator suggestion
  is available."; detailed evidence remains in bounded reports as ids, source
  refs, source profile ids, authority tiers, and content/proof hashes
- blocked message classes, outside-scope requests, missing approvals, rollback,
  missing provenance, and no-dark-data failures do not reach the live delivery
  adapter
- `MODEL_MEMORY_PHASE2_LIVE_PROACTIVE_DELIVERY_DISABLED` rolls the live seam
  back to proof-delivery/artifact-only behavior
- broad/default proactive messaging, autonomous sending, and action execution
  during delivery remain disabled

Reasoning:

- `chat.inject` is already a narrow operator-visible transcript/broadcast seam,
  so it can prove live delivery without inventing broad notification
  infrastructure
- fixing delivered prose and keeping all evidence in reports prevents raw or
  private content from becoming a proactive user-facing message

## 2026-04-26 - proactive message send workflow may be default-visible to operators

Decision:

- ordinary operator surfaces may expose the proactive message review/approval/send
  workflow for `operator_approved_suggestion_available` by default
- default-visible means operators can see and use the workflow; every message
  still requires an approved suggestion, staged approval, explicit send
  approval, provenance, no-dark-data pass, and inactive rollback
- autonomous sending, broad/default user-facing proactivity, and action execution
  during delivery remain disabled
- blocked message classes include unapproved suggestions, external-instruction
  messages, private/secret content, raw prompt/transcript content, and
  autonomous action requests
- `MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_DISABLED` rolls the
  workflow back to controlled operator/eval-only visibility

Reasoning:

- the Slice 29 live gateway delivery seam proves actual delivery for the single
  low-risk class, so exposing the approval/send workflow to operators by default
  adds utility without authorizing automatic sends
- keeping the message class fixed and the send approval explicit preserves the
  user-facing proactivity boundary for later controlled expansion

## 2026-04-26 - controlled proactive messages support a second low-risk class

Decision:

- controlled user-facing proactivity now permits
  `operator_approved_follow_up_available` in explicit operator/eval scope
- `operator_approved_suggestion_available` remains the only message class in the
  Slice 30 default-visible operator send workflow
- both approved message classes require approved evidence, staged approval,
  explicit send approval, provenance, no-dark-data pass, and inactive rollback
- blocked/unknown message classes, external-instruction messages,
  raw/private/secret content, and autonomous action requests remain blocked
- `MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED`
  disables the expanded controlled message class and returns to the single
  operator-default message class
- broad/default proactive messaging and autonomous sending remain disabled

Reasoning:

- adding one second bounded class proves the message delivery model can expand
  without weakening the approval, provenance, no-dark-data, and rollback chain
- keeping the second class controlled-only prevents silent default promotion
  while preserving operator/eval utility

## 2026-04-26 - expanded proactive message send workflow may be default-visible to operators

Decision:

- ordinary operator surfaces may expose the proactive message
  review/approval/send workflow for both low-risk message classes by default:
  `operator_approved_suggestion_available` and
  `operator_approved_follow_up_available`
- default-visible means operators can see and use the workflow; every message
  still requires an approved suggestion, staged approval, explicit send
  approval, provenance, no-dark-data pass, and inactive rollback
- autonomous sending, broad/default user-facing proactivity, and action
  execution during delivery remain disabled
- blocked/unknown message classes, external-instruction messages,
  raw/private/secret content, and autonomous action requests remain blocked
- `MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_DISABLED`
  rolls the expanded workflow back to the single-message operator-default
  workflow

Reasoning:

- the Slice 30 operator-default proof and Slice 31 controlled expansion proof
  together prove both approved classes can pass the approval/send/provenance
  chain through the live delivery seam
- promoting only operator-visible workflow access maximizes safe functionality
  without authorizing automatic sends or broad/default proactive messaging

## 2026-04-26 - proactive delivery has operator-visible observability and abuse regression checks

Decision:

- proactive delivery now emits bounded operator-visible health reports for the
  two approved low-risk message classes:
  `operator_approved_suggestion_available` and
  `operator_approved_follow_up_available`
- health reports track delivery counts, send approvals, delivery ids, source
  refs, source profile ids, authority tiers, content/proof hashes,
  no-dark-data status, rollback state, latency, budget status, and blocked
  reason codes
- regression checks cover outside-scope delivery, missing approval, missing
  explicit send approval, blocked/unknown classes, raw/private leakage,
  external text treated as instruction, repeated/stale suggestions, missing
  provenance, and rollback bypass
- `MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK` proves all
  proactive delivery can be disabled for both approved classes
- autonomous sending, broad/default user-facing proactivity, and action
  execution during delivery remain disabled

Reasoning:

- default-visible operator workflows need continuous observability before any
  broader real-user rollout can be considered
- abuse/regression checks make approval, scope, provenance, and no-dark-data
  failures visible as deterministic reason codes instead of relying on manual
  inspection

## 2026-04-26 - controlled real user-facing proactive delivery may run in a narrow approved scope

Decision:

- proactive user-facing delivery may run for selected live users/projects/
  sessions only under a typed `controlled_user_scope` rollout
- the approved message classes remain limited to
  `operator_approved_suggestion_available` and
  `operator_approved_follow_up_available`
- delivery requires Slice 32 expanded operator-default proof, Slice 33 healthy
  observability, exact session/project/user/recipient/operator scope match,
  approved suggestion, staged approval, explicit send approval, provenance,
  no-dark-data pass, and inactive rollback
- wildcard/global scopes, outside-scope requests, missing proof, degraded
  observability, blocked message classes, missing send approval, missing
  provenance, no-dark-data failure, and rollback do not deliver
- `MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED`
  disables scoped real-user delivery and returns to operator-default-visible
  workflow only
- broad/default proactive messaging, autonomous sending, and action execution
  during delivery remain disabled

Reasoning:

- this is the first narrow real-user-facing proactive rollout and therefore
  must be exact-scope, proof-bound, observable, and rollbackable
- requiring a green observability report before scoped delivery prevents
  expanding delivery when approval, leakage, stale/repeat, provenance, or
  rollback regressions are visible

## 2026-04-26 - clean scoped proactivity telemetry can approve explicit scope expansion

Decision:

- the narrow Slice 34 real-user proactive delivery scope may expand only after
  Slice 34 scoped delivery proof and Slice 33 proactive delivery observability
  both validate cleanly
- expansion remains `expanded_controlled_user_scope`, not broad/default
  proactive messaging
- expansion is blocked by degraded or blocked observability, outside-scope
  delivery evidence, missing approval or send approval, blocked-class delivery,
  leakage alerts, external-instruction regressions, repeated/stale suggestion
  regressions, missing provenance, rollback bypass, or wildcard/global scope
- the approved message classes remain limited to
  `operator_approved_suggestion_available` and
  `operator_approved_follow_up_available`
- explicit send approval, provenance, no-dark-data pass, and rollback controls
  remain mandatory; autonomous sending and action execution during delivery
  remain disabled
- `MODEL_MEMORY_PHASE2_PROACTIVITY_SCOPE_EXPANSION_DISABLED` rolls expansion
  back to the single controlled real-user scope

Reasoning:

- the safest next step after first real-user delivery is a telemetry-gated
  expansion decision, not immediate default promotion
- expansion must be blocked by any regression that could imply leakage,
  missing authorization, stale/repeated delivery, or rollback bypass

## 2026-04-26 - controlled proactive delivery may roll out to an explicit multi-user cohort

Decision:

- proactive user-facing delivery may run for a bounded
  `controlled_multi_user_scope` cohort after the scope-expansion decision is
  approved and proactive delivery observability remains healthy
- cohort membership requires exact typed recipient, user, session, project, and
  operator matches; wildcard/global cohort scope is rejected
- each recipient requires its own explicit send approval before either approved
  low-risk message class can deliver
- non-cohort recipients, missing per-recipient send approval, degraded
  observability, missing provenance, no-dark-data failure, blocked message
  classes, and rollback do not deliver
- `MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED` disables
  cohort delivery and returns to the expansion-decision state
- broad/default proactive messaging, autonomous sending, and action execution
  during delivery remain disabled

Reasoning:

- moving from one real-user scope to a small cohort is the maximum safe live
  expansion while send approvals and exact recipient scoping remain mandatory
- per-recipient approvals prevent a cohort rollout from becoming implicit
  automatic or broadcast proactivity

## 2026-04-26 - proactive user-facing default promotion requires a readiness gate

Decision:

- user-facing proactive delivery is ready for a later default-promotion
  decision only when Slices 32-36 all pass and their proof ids/hashes are
  present in a bounded readiness report
- readiness requires healthy proactive delivery observability, scoped delivery
  proof, scope-expansion approval, controlled multi-user cohort proof, complete
  send approval coverage, blocked-class blocking, outside-scope blocking,
  rollback proof, provenance, no-dark-data pass, no leakage alerts, and
  stale/repeat suppression
- Slice 37 does not apply default promotion; it emits go/no-go evidence only
- autonomous sending and action execution during proactive delivery remain
  disabled
- rollback returns readiness use to the controlled multi-user scope state

Reasoning:

- default user-facing proactivity should not be considered from a single proof
  artifact; it needs aggregated evidence that approval, scope, rollback,
  provenance, leakage, and stale/repeat controls all remain green
- keeping Slice 37 report-only prevents readiness work from silently becoming a
  default-promotion change

## 2026-04-26 - low-risk proactive messages may be default-eligible for approved users

Decision:

- when Slice 37 readiness is green, the two approved low-risk proactive
  message classes may become `default_eligible_user_facing_delivery` for
  eligible users:
  `operator_approved_suggestion_available` and
  `operator_approved_follow_up_available`
- default-eligible does not mean automatic sending; every delivery still
  requires explicit send approval, provenance, no-dark-data pass, healthy
  observability, and eligible user scope
- non-eligible users, blocked/unknown classes, degraded observability, missing
  readiness, missing send approval, missing provenance, no-dark-data failure,
  autonomous-send enablement, action execution during delivery, and rollback do
  not deliver
- `MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED` returns
  delivery to controlled multi-user scope
- autonomous sending and delivery-triggered action execution remain disabled

Reasoning:

- the default-promotion decision can green-light the maximum safe user-facing
  message workflow only after the readiness gate aggregates successful
  operator-default, observability, scoped, expanded, and cohort proof
- keeping explicit send approval mandatory prevents default-eligible delivery
  from becoming broad autonomous proactivity

## 2026-04-26 - autonomous send remains report-only behind a boundary preflight

Decision:

- autonomous-send evaluation is limited to report-only boundary candidates with
  classifications `manual_send_required`,
  `approval_required_auto_send_candidate`, and `blocked_autonomous_send`
- the two approved low-risk proactive message classes may be evaluated as
  auto-send candidates, but no automatic message is emitted and manual send
  remains required
- urgency manipulation, external imperative text, unknown/blocked message
  classes, missing provenance, missing source profiles, inspection-only
  material, stale/conflicted evidence, no-dark-data failure, and rollback block
  autonomous-send candidacy
- `MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED` disables auto-send
  candidate generation and returns behavior to manual-send-required reports
- action execution during proactive delivery remains disabled

Reasoning:

- after user-facing delivery becomes default-eligible, the next safety boundary
  is proving that any future automatic-send work is observable as report-only
  candidates before any delivery policy can change
- explicit blocks for urgency and external imperatives prevent project docs,
  tools, or reports from escalating evidence into instructions

## 2026-04-26 - proactive suggestions must surface in normal product UX

Decision:

- default-eligible proactive messages now have a real product surfacing path:
  a pending proactive suggestions queue in the normal chat/operator UX
- queue items are built from approved user-facing proactivity default evidence
  and expose bounded display text, eligible scope, source refs, source profile
  ids, authority tiers, content/proof hashes, no-dark-data status, stale/
  conflict labels, and deterministic blocked reason codes
- explicit `Approve & Send` remains mandatory and uses the existing
  `chat.inject` gateway seam; dismiss and snooze are visible product controls
- the live scope is typed `product_operator_visible_queue` for the real
  live user/project/session/operator scope, not proof fixture scope
- `MODEL_MEMORY_PHASE2_PRODUCT_PROACTIVITY_SURFACING_DISABLED` rolls the
  product queue and send control back to proof/operator-only surfacing
- autonomous sending, broad uncontrolled proactivity, and delivery-triggered
  action execution remain disabled

Reasoning:

- prior slices proved the approval/send pipeline but did not make it useful in
  day-to-day UX because messages were visible only through proof/operator
  scripts
- surfacing a bounded queue in the normal product path lets the user encounter,
  inspect, approve, dismiss, or snooze proactive suggestions without weakening
  provenance, no-dark-data, or manual-send gates

## 2026-04-26 - proactive candidates must be generated from real memory signals

Decision:

- product proactive queue items may be fed by bounded real-memory/runtime
  signals: recent tasks, unresolved follow-ups, stale decisions, maintenance
  candidates, docs changes, project-state capsule evidence, and runtime graph/
  retrieval observations
- each candidate preserves source refs, source profile ids, authority tiers,
  content/proof hashes, stale/conflict labels, no-dark-data status, and
  deterministic suppression reason codes
- docs and project artifacts remain evidence, not instructions, and lower
  authority evidence cannot self-promote
- repeated suggestions are suppressed by deterministic ids/hashes only; no
  semantic-similarity truth, keyword routing, topic parser, or marker-specific
  runtime logic is introduced
- `MODEL_MEMORY_PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATES_DISABLED` rolls
  candidate generation back to product queueing from approved reports only
- explicit approve/send remains mandatory; autonomous sending and
  delivery-triggered action execution remain disabled

Reasoning:

- Slice 40 made proactive suggestions visible in the product, but a useful UX
  requires candidates that explain real memory/runtime state rather than a
  generic proof-success message
- deterministic signal evidence keeps the system observable and suppressible
  without treating project docs, reports, or graph/capsule outputs as semantic
  truth by themselves

## 2026-04-26 - approved proactive messages need product notification UX

Decision:

- approved/send-approved proactive messages are surfaced as bounded chat-banner
  notifications in the normal product UX, not only as injected transcript lines
- notifications render only after explicit approval/send approval and include
  why-this-appeared provenance: source refs, source profile ids, authority
  tiers, content/proof hashes, stale/conflict labels, and no-dark-data status
- pending, blocked, dismissed, snoozed, and rollback-disabled items do not
  render as deliverable notifications
- dismiss and snooze remain explicit user controls, while `chat.inject`
  transcript delivery stays available as delivery evidence
- `MODEL_MEMORY_PHASE2_PROACTIVITY_NOTIFICATION_UX_DISABLED` rolls the
  notification surface back to transcript/product-queue behavior
- autonomous sending and delivery-triggered action execution remain disabled

Reasoning:

- proactive UX is not useful if successful delivery is visible only as a
  transcript side effect; a small notification surface gives the user context,
  controls, and provenance without broadening authority or exposing raw content

## 2026-04-26 - personal workspace can be the default proactivity scope

Decision:

- the real personal workspace may use a typed `personal_default_scope` for
  proactive suggestions, bounded by exact user/recipient, project, session, and
  operator ids
- the personal default scope requires Slice 40 product surfacing, Slice 41 real
  memory candidates, and Slice 42 notification UX proof before enabling
- both approved low-risk message classes remain allowed, and every delivery
  still requires explicit approve/send
- wildcard/global scopes, missing provenance, degraded observability,
  no-dark-data failures, and missing send approval block personal default
  activation
- `MODEL_MEMORY_PHASE2_PERSONAL_DEFAULT_PROACTIVITY_DISABLED` rolls behavior
  back to operator-only/manual proof mode while preserving manual queue review
- autonomous sending and delivery-triggered action execution remain disabled

Reasoning:

- the feature only becomes useful day-to-day when the real workspace scope is
  default-active; exact typed scope keeps that promotion reversible and prevents
  accidental broad rollout

## 2026-04-26 - autonomous send readiness remains manual-override only

Decision:

- low-risk proactive messages may be classified as future auto-send readiness
  candidates only as report-only simulations
- the manual override controls are fixed to `always_require_approval`,
  `auto_approve_never`, and
  `future_scoped_auto_send_allowed_for_review_only`
- personal default scope and autonomous-send boundary proof are required before
  readiness candidates are emitted
- urgency manipulation, repeated suggestions, stale evidence, missing
  provenance, missing source profile, no-dark-data failure, external
  instruction text, rollback, and unknown/blocked classes block auto-send
  readiness
- `MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_DISABLED` disables readiness
  candidates while preserving the manual send workflow
- autonomous sending and delivery-triggered action execution remain disabled

Reasoning:

- automatic proactive messages should not be promoted from theoretical
  boundaries alone; the product now needs evidence about what would have sent
  while keeping the actual delivery path explicitly manual

## 2026-04-26 - auto-send simulations must be observable before controlled send

Decision:

- Slice 44 "what would have sent" candidates are exposed through a bounded
  simulation observability report before any controlled auto-send expansion
- reports compare `would_have_auto_sent` with the actual manual user/operator
  decision and track generated, approved, dismissed, snoozed, blocked,
  repeated, and stale usefulness signals
- urgency manipulation, stale/repeated suggestions, missing provenance, missing
  source profiles, no-dark-data failures, leakage, and external instruction
  text degrade or block simulation health with deterministic reason codes
- `MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED` disables
  simulation observability without enabling any automatic delivery
- automatic sending and delivery-triggered action execution remain disabled

Reasoning:

- controlled auto-send should be based on measurable product behavior rather
  than speculation; comparing simulations with manual decisions shows whether
  auto-send would be useful or noisy without sending automatically

## 2026-04-26 - low-risk auto-send is allowed only in explicit controlled scope

Decision:

- Slice 46 introduces a typed `controlled_auto_send_scope` for the single
  low-risk class `operator_approved_suggestion_available`
- controlled auto-send requires explicit per-scope opt-in, healthy Slice 45
  simulation observability, provenance, source profile metadata, no-dark-data
  pass, freshness/repeat suppression pass, exact user/recipient/project/session/
  operator scope match, and inactive rollback
- `operator_approved_follow_up_available` remains manual-send only, and unknown
  or external-instruction classes are blocked
- non-scoped sessions remain manual-send only; wildcard/global scopes are
  rejected
- `MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED` disables controlled
  auto-send and preserves the manual send workflow
- delivery-triggered action execution remains disabled

Reasoning:

- the first actual auto-send capability must be narrow enough to prove usefulness
  without creating broad autonomy; exact scope plus a kill switch keeps the
  rollout reversible and operationally bounded

## 2026-04-26 - controlled auto-send requires global kill switch observability

Decision:

- Slice 47 adds an operator-visible health and abuse-regression report for
  controlled auto-send attempts, deliveries, blocked reason codes, scope ids,
  source refs, source profile ids, authority tiers, content/proof hashes,
  no-dark-data status, rollback state, and latency placeholders
- `MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED` is the global kill switch for all
  auto-send behavior and must preserve the manual send workflow
- outside-scope sends, repeated sends, raw/private content, external instruction
  escalation, rollback bypass, missing provenance, missing source profile, and
  no-dark-data failures degrade or block health with deterministic reason codes
- delivery-triggered action execution remains disabled

Reasoning:

- a scoped auto-send proof is not operationally safe until operators can see
  attempts, failures, and an immediate global stop control that does not break
  manual review/send behavior

## 2026-04-26 - personal auto-send trial requires explicit opt-in and disable path

Decision:

- Slice 48 adds a capability decision for a personal auto-send trial limited to
  `operator_approved_suggestion_available`
- approval requires clean Slice 45 simulation telemetry, successful Slice 46
  controlled-scope proof, healthy Slice 47 kill-switch health, active personal
  default proactivity scope, explicit personal opt-in, visible UX controls,
  provenance/source profile metadata, no-dark-data pass, and inactive rollback
- `operator_approved_follow_up_available` remains manual-send only, and
  non-personal scopes remain manual-only
- `MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED` disables the personal
  trial and returns behavior to manual-send mode; the global
  `MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED` kill switch also disables the trial
- feedback or auto-send decisions do not create semantic truth or trigger action
  execution

Reasoning:

- a personal trial is useful only if the user can explicitly opt in, see and
  disable the behavior, and rely on the same kill-switch/abuse observability
  proven before the trial decision

## 2026-04-26 - proactivity feedback is control-plane quality signal only

Decision:

- Slice 49 adds explicit feedback controls for proactive suggestions: `useful`,
  `not_useful`, `too_repetitive`, `wrong_context`, and `unsafe_private`
- feedback records store only bounded metadata: feedback id, candidate id, queue
  item id, message class, selected reason code, source refs, source profile ids,
  authority tiers, content/proof hashes, and timestamp
- free-form/raw feedback text is rejected and is not persisted; raw prompts,
  transcripts, tool logs, secrets, and private phrases remain hard rejects
- feedback may affect suppression, ranking, and quality reporting only:
  `useful` is a quality signal, `not_useful`/`wrong_context` downrank future
  candidates, `too_repetitive` creates deterministic suppression, and
  `unsafe_private` blocks future surfacing pending review
- feedback must not create semantic truth, write memory corrections, self-promote
  authority, trigger delivery, or execute actions
- `MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED` disables feedback
  submission while preserving the product proactivity queue

Reasoning:

- proactive memory needs explicit user quality signals to become useful, but
  those signals are control-plane feedback about ranking/suppression, not new
  source-of-truth memory

## 2026-04-26 - personal auto-send trial must be visible and reversible in product UX

Decision:

- Slice 50 adds normal product UX state for the personal auto-send trial with
  visible modes: `manual_only`, `controlled_autosend_trial`, and
  `disabled_by_kill_switch`
- the only auto-send class shown as allowed is
  `operator_approved_suggestion_available`; `operator_approved_follow_up_available`
  remains visible as manual-only
- product UX exposes a Disable / Return to Manual control that preserves manual
  send behavior and does not weaken queue, approval, provenance, or no-dark-data
  requirements
- `MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED` and
  `MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED` must show disabled state
  and return delivery behavior to manual-only
- no action execution is triggered by the UX state or toggle

Reasoning:

- a personal auto-send trial is only acceptable if the user can see the current
  mode, understand the narrow allowed class, and immediately return to manual
  control from ordinary OpenClaw UX

## 2026-04-26 - personal auto-send trial continuation requires quality evidence

Decision:

- Slice 51 adds a bounded auto-send trial quality review before any continuation
  decision
- the review aggregates Slice 45 would-have-sent/manual-decision telemetry and
  Slice 49 feedback telemetry, then applies deterministic thresholds for false
  positives, repeated/stale candidates, wrong-context/not-useful feedback, and
  unsafe/private flags
- any leakage/private flag, missing provenance/source profile, no-dark-data
  failure, delivery-triggered action execution, or broad autonomous sending
  blocks quality continuation
- degraded quality evidence may support narrowing or pausing in Slice 52, but a
  blocked quality state must not continue personal auto-send unchanged

Reasoning:

- personal auto-send must be reviewed as a measured trial, not an indefinite
  experiment, and feedback evidence remains bounded control-plane metadata, not
  semantic truth or memory correction input

## 2026-04-26 - personal auto-send continuation is an explicit capability decision

Decision:

- Slice 52 consumes the Slice 50 product UX proof and Slice 51 quality review
  before deciding whether the personal auto-send trial may continue
- continuation outcomes are explicit: `continue_personal_autosend_trial`,
  `narrow_personal_autosend_trial`, `pause_personal_autosend_trial`, or
  `rollback_to_manual_only`
- green quality may continue the trial, degraded quality may narrow or pause,
  and blocked quality, leakage/private flags, unhealthy kill-switch state,
  missing provenance/source profile, no-dark-data failure, action execution, or
  broad autonomous sending force rollback to manual-only
- the allowed auto-send class remains exactly
  `operator_approved_suggestion_available`; `operator_approved_follow_up_available`
  remains manual-only
- rollback uses `MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED` or the
  global `MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED` kill switch and preserves the
  manual send workflow

Reasoning:

- a personal auto-send trial must be actively reviewed against quality and
  safety evidence; it should continue only when measured behavior is clean, and
  the safe default for blocked evidence is manual-only

## 2026-04-26 - follow-up auto-send remains preflight-only

Decision:

- Slice 53 evaluates `operator_approved_follow_up_available` only as a
  manual-only or future report-only auto-send candidate; it does not enable
  follow-up auto-send
- future candidacy requires freshness, non-repeat evidence, positive feedback,
  no wrong-context signal, provenance, source profile metadata, no-dark-data
  pass, inactive rollback, and no urgency or external-instruction escalation
- repeated nudges, stale follow-ups, wrong-context feedback, missing provenance,
  missing source profile, no-dark-data failure, urgency manipulation, external
  instruction text, rollback, semantic truth writes, or any attempted follow-up
  auto-send block the preflight
- feedback remains a quality signal only and must not create semantic truth or
  memory corrections
- `operator_approved_suggestion_available` remains the only class that may
  auto-send in controlled/personal trial scope; follow-up remains manual-send
  only

Reasoning:

- follow-up nudges are higher interruption risk than suggestion-available
  messages, so they need separate evidence and abuse regression before any
  future auto-send decision

## 2026-04-26 - proactive memory needs a normal review inbox

Decision:

- Slice 54 adds a product Proactivity Inbox / digest view that groups pending
  suggestions, sent items, snoozed/dismissed items, blocked items, auto-send
  simulations, feedback summaries, and why-this-appeared details
- inbox items preserve only bounded display text, report/candidate/queue ids,
  source refs, source profile ids, authority tiers, content/proof hashes,
  no-dark-data status, feedback counts, and deterministic blocked reason codes
- the inbox is surfaced through a read-only
  `modelMemory.proactivity.inbox` gateway method and normal chat/operator UX;
  it does not execute actions and does not create delivery by itself
- rollback via `MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED` hides/disables
  the inbox while preserving the underlying queue and notification surfaces
- proof artifact:
  `.artifacts/model-memory/phase2-proactivity-inbox-proof/20260426T225516284Z/2981e633-f6c7-5070-b335-4f6edcf27d23.phase2-proactivity-inbox.json`
  with content hash
  `7228ad08ac38bcb62632eac6e3b27b48c0eb646739b83dbc80c9e4a7f0dbaa86`
- broad autonomous sending remains disabled, personal auto-send remains subject
  to the Slice 52 continuation decision, and follow-up auto-send remains
  manual-only/preflight-only

Reasoning:

- proactive memory is not useful if evidence is scattered across banners and
  proof reports; a bounded inbox gives the user one normal place to inspect,
  filter, and manage proactive memory without weakening safety boundaries

## 2026-04-26 - proactivity must be compact, actionable, and drawer-visible

Decision:

- Slice 55 remediates the Proactivity Inbox UX by removing the always-open
  inbox rail from the chat workspace and prohibiting the full inbox from
  rendering inside `.chat-thread`
- normal chat UX now exposes a compact `Proactivity · N pending` entry point in
  persistent chat chrome; the full inbox opens in the existing side panel/drawer
  pattern instead of consuming transcript height
- actionable cards must show a candidate summary, suggested action, safe message
  preview, expected user value, why-this-appeared detail, and explicit
  Approve & Send, Dismiss, Snooze, and provenance controls
- rollback via `MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED`
  disables the compact entry point and preserves manual send/inbox data paths
- proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-ux-remediation-proof/<timestamp>/`
- broad autonomous sending remains disabled, action execution from delivery
  remains disabled, follow-up auto-send remains manual/preflight-only, and raw
  prompts/transcripts/tool logs/secrets/private phrases remain excluded from UI
  payloads, reports, telemetry, tests, and artifacts

Reasoning:

- proactive memory should not steal the primary chat workspace; users need a
  persistent low-friction entry point, clear information scent, and an explicit
  action path before any further proactivity expansion is useful

## 2026-04-26 - proactive suggestions require concrete safe preview content

Decision:

- Slice 56 promotes real suggestion content fields into a capability contract:
  `messagePreview`, `suggestedAction`, `candidateSummary`, and
  `expectedUserValue`
- actionable candidates must derive these fields from bounded memory evidence
  and preserve source refs, source profile ids, authority tiers, content/proof
  hashes, freshness/conflict labels, and no-dark-data status
- generic placeholder-only candidates such as “An approved suggestion is
  available” are blocked as non-actionable rather than shown as sendable UI
  suggestions
- missing provenance, missing source profile, missing authority, no-dark-data
  failure, stale/conflict evidence without labeling, external instruction
  escalation, or lower-authority self-promotion blocks actionable preview output
- rollback via `MODEL_MEMORY_PHASE2_REAL_SUGGESTION_CONTENT_DISABLED` returns to
  blocking generic/unsafe candidates while preserving manual review
- proof artifact target:
  `.artifacts/model-memory/phase2-real-suggestion-content-contract-proof/<timestamp>/`
- broad autonomous sending remains disabled and delivery-triggered action
  execution remains disabled

Reasoning:

- proactivity is only useful when the user can recognize the actual proposed
  message and understand why it is valuable before approving it

## 2026-04-26 - contextual proactivity surfaces only on typed active-context overlap

Decision:

- Slice 57 adds typed surfacing lanes for proactive suggestions:
  `must_surface`, `context_surface`, and `background_only`
- chat inline surfacing is compact and only allowed when bounded candidate
  evidence overlaps the active typed user/session/project/operator context
- non-matching, background-only, stale, repeated, dismissed, or snoozed
  candidates remain in the Proactivity Inbox/digest instead of reappearing as
  chat noise
- relevance explanations must state the typed match, for example “shown because
  this session matches project X / session Y”; fuzzy semantic matching and
  keyword/topic routers are not authority
- rollback via `MODEL_MEMORY_PHASE2_CONTEXTUAL_PROACTIVITY_DISABLED` disables
  inline contextual cards and returns to drawer-only review
- proof artifact target:
  `.artifacts/model-memory/phase2-contextual-proactivity-surfacing-proof/<timestamp>/`
- broad autonomous sending and delivery-triggered action execution remain
  disabled

Reasoning:

- proactivity should appear during normal work only when the current context
  makes the suggestion actionable; otherwise it belongs in the inbox/digest

## 2026-04-26 - proactivity enters daily review and heartbeat as bounded review work

Decision:

- Slice 58 feeds pending `must_surface` proactivity into the operator review /
  heartbeat surface with grouped counts for lower-priority/background items
- review items preserve the same `candidateId` and `queueItemId` used by chat
  contextual cards and the Proactivity Inbox
- review items include bounded candidate summary, message preview, suggested
  action, source refs, source profiles, authority tiers, and proof/content hashes
- the review surface provides a direct path to the Proactivity Inbox detail/send
  action, but it does not send messages or execute actions
- rollback via `MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED` returns
  proactivity to inbox-only review
- proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-daily-review-heartbeat-proof/<timestamp>/`
- broad autonomous sending and delivery-triggered action execution remain
  disabled

Reasoning:

- must-surface proactivity belongs in the operator loop where daily operational
  review already happens, while background items should remain summarized

## 2026-04-26 - proactivity usefulness tuning is control-plane only

Superseded on 2026-04-29:

- the deterministic usefulness-tuning runtime and proof were removed as
  deterministic value-judgment debt
- explicit feedback remains bounded control-plane metadata, but it may only
  drive explicit suppression/safety/operator-review behavior, not deterministic
  usefulness ranking or semantic truth
- the deleted runtime must not be restored behind compatibility helpers or
  renamed tuning fields

Decision:

- Slice 59 instruments bounded UX events for proactive suggestions: viewed,
  opened detail, approved, sent, dismissed, snoozed, ignored, marked useful, and
  marked not useful
- quality reports group behavior by signal type, source, message class,
  surfacing lane, and project/session scope
- noisy sources may be downranked and repeated candidates may be suppressed
  using deterministic reason codes
- "why not shown" diagnostics are exposed only in operator/debug proactivity
  detail, not as intrusive chat content
- feedback remains control-plane metadata only; it does not create semantic
  truth and does not write memory corrections
- rollback via `MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED`
  disables tuning effects and returns to neutral ranking while preserving queue
  and inbox behavior
- proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-usefulness-tuning-proof/<timestamp>/`
- broad autonomous sending and delivery-triggered action execution remain
  disabled

Reasoning:

- proactive UX should get less noisy from actual interaction behavior, but
  usefulness feedback is not a trusted memory source by itself

## 2026-04-27 - proactivity product correctness gates useful UX before capability expansion

Decision:

- Proactivity remediation is a product-correctness gate, not a capability
  expansion: broad autonomous sending remains disabled, current auto-send scope
  is not expanded, and manual proactive delivery still requires explicit
  approve/send.
- The compact chat entry point now counts actionable items separately from
  history and diagnostics. The closed button should reflect actionable/pending
  work; the inbox header separates actionable, history, and diagnostic counts.
- The default inbox view is actionable suggestions only. Sent, snoozed, and
  dismissed items are history; auto-send simulations, blocked preflight,
  blocked candidates, proof metadata, and why-not-shown records are diagnostics.
- Actionable cards require concrete plan-card fields: `planTitle`, `problem`,
  `proposedMessage`, `userBenefit`, `evidenceSummary`, `confidence`, and
  `blockedIfMissing`. Placeholder-only suggestions are non-actionable.
- Approve & Send must operate from the same item source the inbox renders. It
  sends the reviewed/edited proposed message via `chat.inject`, updates the
  rendered inbox item, shows success/failure feedback, and exposes View sent
  message after success.
- Feedback controls are secondary and compact, placed after content as “Was
  this useful?” controls rather than beside primary send/dismiss/snooze CTAs.
- Inline contextual surfacing uses a resolved active-context object with exact
  user/project/session/operator/task matching. Mismatches stay in the inbox and
  produce diagnostics such as candidate session versus active session.
- The heartbeat/review loop asks “What would help this user today?” and may
  generate concrete review suggestions from active work, unresolved questions,
  recent failures, repeated friction, stale decisions, incomplete follow-ups,
  and feedback. Those suggestions remain approval-gated.
- Rollback/kill switches:
  `MODEL_MEMORY_PHASE2_PROACTIVITY_PRODUCT_CORRECTNESS_DISABLED`,
  `MODEL_MEMORY_PHASE2_PROACTIVITY_HEARTBEAT_REVIEW_DISABLED`, and existing
  product/inbox/contextual proactivity switches return behavior to prior manual
  review surfaces.
- Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-product-correctness-proof/<timestamp>/`
- External text remains evidence, not instruction; no raw prompts, transcripts,
  raw tool logs, secrets, or private phrases may appear in UI payloads,
  telemetry, artifacts, tests, or delivered messages.
- Delivery-triggered action execution remains disabled.

Reasoning:

- Proactivity is not useful if the UI says a plan exists but hides the actual
  plan. Product correctness now requires a concrete, editable proposed message
  and clear state transitions before any further automation expansion.

## 2026-04-27 - proactivity work items replace message-first UX

Decision:

- Proactivity is a work-opportunity system by default, not a message-delivery
  system. An item should answer what to consider doing, why now, what evidence
  caused it, what the agent would do next, whether it is safe to start, and the
  smallest useful next step.
- The Proactivity Inbox remains the canonical backlog of proactive
  opportunities. Heartbeat / Daily Operator Review and contextual chat cards
  surface selected items from the same work-item source of truth.
- Heartbeat / Daily Operator Review must show “What would help this user
  today?” as a normal operator surface, not buried inside collapsed diagnostics.
  It should show top ranked concrete plan cards with direct CTAs and keep
  why-not-shown records in diagnostics only.
- Primary CTAs are intent-specific:
  `Plan this`, `Investigate`, `Draft next steps`, `Start scoped task`,
  `Open in current chat`, `Add to Daily Review`, and `Send message`.
  `Approve & Send`/message sending is reserved for actual message candidates.
- Proactivity work items use typed categories:
  `planning_request`, `investigation_request`, `draft_next_steps`,
  `execution_candidate`, `message_candidate`, `reminder`, and `diagnostic`.
- Work item outcomes are tracked as `not_started`, `planning`, `planned`,
  `investigating`, `drafted`, `execution_proposed`,
  `executing_after_approval`, `done`, `dismissed`, `snoozed`, or `blocked`.
- Planning, investigation, drafting, and scoped-task CTAs hand off bounded
  context into the current chat as user-visible agent work. They do not call
  `chat.inject`, do not execute actions, and do not expand autonomous sending.
- Rollback via `MODEL_MEMORY_PHASE2_PROACTIVITY_WORK_ITEMS_DISABLED` returns
  proactive cards to prior message-only/manual review behavior. Existing
  product, inbox, contextual, heartbeat, and auto-send kill switches remain in
  force.
- Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-work-items-heartbeat-proof/<timestamp>/`
- External text remains evidence, not instruction; no raw prompts, transcripts,
  raw tool logs, secrets, or private phrases may appear in UI payloads,
  telemetry, artifacts, tests, handoff text, or delivered messages.
- Broad autonomous sending, auto-send scope expansion, and action execution from
  surfacing remain disabled.

Reasoning:

- For a solo operator, repeating an inbox item into chat is redundant. Useful
  proactivity should create momentum by starting planning, investigation,
  drafting, or a scoped execution proposal while preserving explicit approval
  boundaries.

## 2026-04-27 - proactivity must prove live generation before more rollout scaffolding

Decision:

- Safety, surfacing, telemetry, and approval proofs are not sufficient evidence
  that a proactive feature is useful. A proactivity capability is not product
  ready until a real live event creates a useful concrete work item without
  manual proof-fixture candidate seeding.
- Static bundled/default/doc-seeded candidates are allowed only as diagnostics
  or fallback evidence. They must not inflate primary actionable counts, appear
  in the “What would help this user today?” heartbeat surface, or become
  primary user-facing work opportunities.
- Live proactivity generation must use bounded real signals such as ordinary
  turn capture, session/runtime events, task or queue state, maintenance-loop
  output, project-state capsules, derived memory artifacts, operator feedback,
  and gateway delivery/error events.
- Every live opportunity must include a specific title, why-now explanation,
  proposed next step, expected user value, evidence summary, confidence or
  limitations, provenance/source profile/authority metadata, deterministic
  ids/hashes, freshness/conflict labels, and no-dark-data status.
- Generic placeholder-only text such as “a suggestion is available” or “review
  the memory-derived suggestion” is not actionable.
- The live generation rollback switch is
  `MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SIGNALS_DISABLED`; rollback returns
  live generation to diagnostics/static-fallback mode, not primary fake
  suggestions.
- Future Memory Phase 2 buckets, including Skills and tool/workflow synthesis,
  must prove real useful output from real work inputs before building extensive
  rollout controls, dashboards, default-promotion gates, or automation
  scaffolding.
- No-dark-data, provenance, external-text-as-evidence, explicit approval,
  no autonomous-send expansion, and no action execution from surfacing remain
  mandatory.

Reasoning:

- The concrete failure was treating “can safely surface/deliver a proactive
  artifact” as equivalent to “can generate useful proactive opportunities from
  live work.” Candidate generation stayed mostly doc/default/proof-derived while
  the surrounding system accumulated gates, dashboards, controls, and proof
  paths. Product usefulness now requires generator-first proof before any
  further expansion.

## 2026-04-27 - proactivity live-usefulness acceptance sequence

Decision:

- Slices 60-64 are the usefulness acceptance sequence for proactive memory.
  They do not expand autonomous sending, auto-send scope, or delivery-triggered
  action execution.
- Slice 60 expands live signal coverage from normal OpenClaw work seams:
  ordinary chat turns, task state changes, gateway errors, failed commands,
  repeated user friction, unresolved questions, session/workflow transitions,
  heartbeat events, maintenance output, and project-state capsules. Each seam
  must emit typed source refs and explicit reason codes such as
  `ordinary_turn_has_open_loop`, `failed_command_observed`, and
  `unresolved_question_observed`.
- Slice 61 adds a signal quality/noise budget. Per-signal thresholds,
  cooldowns, deterministic dedupe windows, recurrence limits, and bounded
  feedback metadata decide whether a signal is surfaced, downranked, or shown
  only in why-not-shown diagnostics. Feedback remains control-plane metadata,
  not semantic truth.
- The Slice 61 live behavior is that repeated same-content signals, recurrence
  beyond threshold, and dismissed/snoozed/ignored/not-useful feedback suppress
  primary surfacing and create bounded diagnostics instead of adding more inbox
  noise. Rollback returns to neutral live-signal ranking.
- Slice 62 upgrades the planning/investigation/drafting handoff contract so
  `Plan this`, `Investigate`, and `Draft next steps` start bounded chat turns
  with goal, evidence, constraints, safety boundary, and expected output shape.
  Non-message handoffs do not call `chat.inject`.
- The Slice 62 live handoff text must tell the user what the agent will produce:
  a concise plan with options/risks/next steps, an investigation with evidence
  and uncertainty, a next-step draft, or an execution proposal only. The handoff
  may update work item status to planning/investigating/drafting, but it does
  not execute the proposed work.
- Slice 63 makes Heartbeat / Daily Operator Review a primary proactivity
  surface. It shows top live opportunities under “What would help this user
  today?”, but selection is structural: pending/actionable state, model-authored
  clean copy, recency, active-context membership, feedback/noise suppression,
  and shared work item ids. It does not deterministically rank expected user
  value.
- The Slice 63 heartbeat surface is considered failed if it is diagnostics-only,
  lacks a direct handoff CTA, loses the shared work item id, or cannot show a
  bounded title/why-now/next-step/value card. Suppressed/background items remain
  diagnostics.
- Slice 64 adds an acceptance gate. Live generation frequency,
  operator-positive/actioned feedback, low noise, heartbeat reliability, handoff
  quality, zero leakage, zero unsafe action execution, zero autonomous send
  expansion, and zero primary static fallback criteria are evidence for
  operator review, not authorization to move to Skills.
- The Slice 64 decision outcomes are
  `operator_review_required_before_skills`, `continue_tuning`,
  `pause_automation`, and `rollback_to_manual_only`. Green metrics are an
  evidence gate, not a semantic truth source or automation permission; broad
  autonomous sending and action execution from surfacing remain blocked after
  acceptance.
- Rollback switches:
  `MODEL_MEMORY_PHASE2_LIVE_SIGNAL_COVERAGE_DISABLED`,
  `MODEL_MEMORY_PHASE2_PROACTIVITY_NOISE_BUDGET_DISABLED`,
  `MODEL_MEMORY_PHASE2_PROACTIVE_HANDOFF_QUALITY_DISABLED`,
  `MODEL_MEMORY_PHASE2_HEARTBEAT_PROACTIVITY_RELIABILITY_DISABLED`, and
  `MODEL_MEMORY_PHASE2_PROACTIVITY_ACCEPTANCE_GATE_DISABLED`.

Reasoning:

- The remaining proactivity risk is not insufficient scaffolding. It is whether
  normal work generates useful opportunities often enough, with low enough
  noise, and whether engaging those opportunities creates useful agent work.
  Slices 60-64 therefore gate exit from the proactivity bucket on observed
  product usefulness rather than more rollout controls.

## 2026-04-27 - proactivity lifecycle hotfix makes planning a pure handoff

Decision:

- `Plan this` is a bounded chat handoff action, not a send-like action.
- One canonical work-item state must be visible at a time across inbox,
  heartbeat, contextual surfacing, and history.
- The main actionable card keeps one concise next-step line and must not
  duplicate `Suggested action` and `Proposed next step` when both restate the
  same planning handoff.
- Planning handoff text must render as a clean structured request with bounded
  context, evidence summary, expected output, and safety boundary rather than a
  raw concatenated plumbing template.
- Lifecycle must explicitly support `planning_started`, `planned`, `done`, and
  `reopened`.
- Once planning starts, the item leaves the actionable backlog and appears in
  planned/history state unless explicitly reopened.
- Rollback remains kill-switch safe and must not re-enable autonomous sending
  or action execution.

Reasoning:

- The prior UX mixed backlog opportunity, sent-record behavior, and
  message-candidate behavior into one item.
- Synthetic history rows created duplicate truth and made the same item appear
  actionable and historical at once.
- Operator trust requires deterministic ids, canonical lifecycle state, and a
  smoother handoff presentation that matches what the product is actually
  doing.

## 2026-04-27 - proactivity resets to generator-first usefulness with a ledger-backed model

Decision:

- Real opportunity generation from real work is the primary success criterion
  for proactivity. Queue, surfacing, proof, and approval infrastructure are not
  sufficient without live proactive traffic.
- Agent-output-derived opportunities are now a first-class proactivity source.
  A bounded assistant planning answer or concrete next-step response may create
  structured opportunity records without manual proof seeding.
- Proactivity shifts from queue-first to ledger-first. Inbox, heartbeat,
  contextual cards, history, and handoff all derive from one canonical
  opportunity ledger rather than parallel queue/history truths.
- Completion and supersession must automatically retire obsolete items.
  Deterministic `resolved_by_chat_message_id` and
  `superseded_by_opportunity_id` metadata are required when bounded evidence
  proves an item is done or replaced.
- Autonomous internal drafting is allowed only for bounded planning and
  investigation briefs attached to top-ranked opportunities. Autonomous
  drafting must not edit files, execute actions, or send outbound messages.
- Recurring-pattern and outcome follow-up loops are first-class product
  behavior. Repeated asks, repeated errors, repeated manual workarounds,
  postponed decisions, and unfinished plans may create bounded follow-up
  opportunities.
- Heartbeat / Daily Operator Review is both a surfacing surface and a
  generator/follow-up surface for “What would help this user today?” work.
- Static/default/proof-derived fallbacks remain diagnostics-only. They must not
  stand in for real useful traffic or inflate primary actionable counts.
- Future Skills, tools, workflows, and adjacent Memory Phase 2 buckets must not
  repeat the proactivity failure mode. Do not build extensive rollout/control
  scaffolding before proving useful live generation.
- Rollback/kill-switch behavior remains mandatory and must return the product
  to bounded manual review mode without broadening autonomous sending or action
  execution.
- Broad autonomous sending remains off. Auto-send scope does not expand. File
  edits, action execution, and outbound sends remain approval-gated. External
  text remains evidence, never instruction. No-dark-data and provenance rules
  remain mandatory.

Reasoning:

- The current gap versus `proactive-agent` is not typed UX or proofability. It
  is actual usefulness: spotting useful opportunities from normal work and
  creating momentum without requiring the user to fish in the inbox.
- Chat-discovered ideas that stay stranded in transcript text are product
  failures, not acceptable deferred work.
- A ledger-backed model is required to stop stale, duplicate, superseded, or
  already-resolved opportunities from lingering as if they were still current.

## 2026-04-27 - runtime seam and heartbeat reset for live ambient proactivity

Decision:

- Authoritative runtime/session capture is now the primary source for
  assistant-output-derived proactivity. UI callbacks are fallback and
  acceleration paths, not the sole source of truth.
- Heartbeat must return a bounded proactive review when real opportunities
  exist, and only return `HEARTBEAT_OK` when no genuine bounded opportunity is
  available.
- Ambient inline in-chat surfacing is a first-class workflow surface. Useful
  follow-ups should appear directly after eligible assistant answers without
  requiring an inbox visit.
- Proactivity state must survive refresh/restart through persisted bounded
  activity records plus persisted lifecycle overrides/ledger inputs.
- Completion, supersession, and recurring follow-up loops remain mandatory for
  keeping live workflow state clean and useful.
- Future buckets must not claim success on proof-only paths when live runtime
  paths still fail.

## 2026-04-29 - remaining deterministic judgment debt is removal debt

Decision:

- Phase 1/2 memory and proactivity code must not preserve deterministic
  semantic/value judgment through compatibility wrappers, fallback helpers, test
  fixtures, or renamed fields.
- Deterministic code remains authoritative for structure and safety: ids,
  hashes, refs, provenance, schema validation, caps, redaction, explicit-key
  dedupe, exact duplicate detection, explicit structural target refs, cooldowns,
  budgets, source authority, and persistence boundaries.
- Hybrid retrieval candidate recall and package assembly remain deterministic
  and structural. Lexical search, graph/projection cues, vector candidate
  recall, source-lineage, explicit refs, scopes, recency, and structural pack
  assembly are allowed recall mechanics.
- Final semantic selection and value judgment for memory admission,
  reconciliation beyond exact structural shortcuts, candidate usefulness,
  skill/proactivity classification, visible card copy, and final context-pack
  inclusion are model-owned or operator-owned.
- Proof/model plumbing may mention semantic fields when it builds model prompt
  contracts, resolves scripted model outputs, or compares proof artifacts, but
  it must not run as live semantic authority.
- Tests that preserve old deterministic semantic behavior are debt and must be
  removed or rewritten around model-owned boundaries.

Reasoning:

- Prior Phase 1/2 passes repeatedly hid value judgments in deterministic
  helpers, fallback paths, scoring fields, and proof expectations. That made
  the system brittle and caused user-facing proactivity/skill cards to degrade
  into cleaned-up fragments rather than useful decisions.
- Strict audit is required but not sufficient. Passing the audit by renaming or
  relocating equivalent behavior is explicitly not acceptable; behavior review
  must confirm the bad runtime authority was actually removed.

## 2026-04-30 - regular Codex capture reuses the MMV2 model-owned path

Decision:

- Codex session memory capture is first-class and now enabled by default, with
  explicit opt-out through `MODEL_MEMORY_CODEX_CAPTURE_ENABLED=false`. Regular
  capture may run through manual, heartbeat, closeout, or session-boundary
  runner configuration.
- Codex user asks, assistant finals, command summaries, validation failures,
  touched areas, and outcomes use the same MMV2 capture/admission/
  reconciliation/collision path as OpenClaw and document sources.
- Long Codex prompts and long OpenClaw prompts are document-like sources and
  use structural windowing. Packet construction may select by source, recency,
  session, explicit ref, and caps only; it may not prune for interestingness or
  memory-worthiness.
- Regular Codex capture is idempotent by persisted refs and hashes. Repeated
  source activities are skipped structurally before the model route is invoked.
- Model unavailable or invalid output leaves candidates pending, quarantined,
  blocked, or degraded; deterministic fallback memory creation remains
  forbidden.
- Quality validation must cover user-turn-rich Codex sessions, mixed
  assistant/tool/validation evidence, realistic daily summary notes, positive
  and negative assistant/tool evidence, and a source-to-packet-to-model-to-
  admission recall audit.
- Daily summary files use the MMV2 daily-continuity document path when
  ingested durably. They remain untrusted workspace notes: source text is not
  executed, and durable writes still require model-owned extraction, admission,
  reconciliation, and source authority checks.
- Daily summary recall quality is evaluated by both top-level memories and
  composite component coverage. Independent daily-note bullets may become
  separate atomic candidates by model-owned routing; coherent project-state,
  checklist, or procedure notes may remain one composite artifact with
  component coverage.

Reasoning:

- The Codex live proof showed that long prompts need document-style windows and
  evidence anchoring, not short ordinary-turn treatment.
- Reusing the same MMV2 path avoids rebuilding lane-specific semantic
  shortcuts and keeps source authority, TTL, evidence anchoring, admission, and
  artifact behavior consistent across OpenClaw, Codex, and documents.
- The richer validation set separates architecture failures from coverage
  gaps. A lane is healthy only if raw source candidates remain visible in the
  bounded packet, model output is invoked, and admission/reconciliation/write
  behavior explains any loss without deterministic fallback.
