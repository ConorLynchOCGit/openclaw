---
summary: "Stable decisions for the model-memory clean-room project."
title: "Model Memory Decisions"
---

# Model Memory Decisions

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
