# Memory Roadmap

## Current roadmap summary

The memory program has reached practical parity across the six landed
families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Practical parity means:

- the major user-facing family gaps were reduced enough to proceed
- the six families now behave like one broader memory system at the product
  level

Practical parity does not mean:

- all six families share one identical product-policy posture
- the implementation substrate is already flat enough to scale cleanly
- reduced-profile self-improving capture and learned-guidance planning are
  ready to widen automatically
- the old candidate-ingress ladder is an honest long-term control model
- hidden operator review is gone as a product dependency and must stay
  replaced by explicit conversational or policy-driven follow-up

That remains the central roadmap fact.

The retirement tranche proper is now underway and has real landed code, not
just review notes.

The latest follow-through work also clarified the product boundary:

- the historical candidate-ingress ladder is now centralized behind one
  capability resolver
- candidate follow-up can now flow through a conversational review prompt in
  chat instead of assuming hidden operator review
- proactive follow-up can now prepare that conversational review prompt
  directly instead of stopping at a blocked advisory result
- proactive procedure-validation and skill-governance follow-up can now also
  prepare conversational prompts instead of assuming operator-only review
- learned-guidance advisory now prefers approved workflow guidance but can
  surface candidate guidance as provisional advice when no stronger approved
  guidance exists
- advanced review/promotion/procedure/skill-governance tools are now exposed
  only when the active runtime posture actually enables them

## Live baseline

The current live boundary includes:

- bounded response-style memory with bounded generic lanes and reviewed phrase
  patterns
- bounded project-fact memory with typed facts plus bounded generic reference
  facts
- bounded recurring procedures with validated-procedure retrieval and
  suggestion-first posture
- generalized workflow lessons with auto-review and approved-only retrieval
- conversational candidate review follow-up for pending candidate-state memory
  objects
- proactive candidate-review execution that turns pending candidates into
  user-facing approve/reject/revise prompts
- proactive procedure-validation follow-up that turns eligible draft
  procedures into user-facing validation prompts
- proactive skill-governance follow-up that turns bounded skill candidates
  into user-facing governance prompts for the next procurement-planning step
- generalized project rules with approved-only retrieval
- bounded unmet needs with recommendation-only retrieval

## Why flattening still comes before future expansion

The repo still should not move on to broad self-improving expansion or new
families yet.

The reason is no longer “missing family features.” It is that the substrate is
still only partially flattened, and some advanced follow-up surfaces are still
bounded governance flows rather than autonomous product behavior.

After the accepted post-v3 architecture review, the roadmap now treats the
remaining work as several more flatten/refactor tranches, not one narrow
cleanup slice.

## Phase A — existing-family parity

This phase is complete enough to proceed.

Conclusion:

- the six landed families are at practical parity
- practical parity was enough to enter flattening
- practical parity was not enough to justify broader family expansion

## Phase B — flattening batches v1-v4 plus support batch v1

This phase already landed meaningful shared substrate work.

### Landed through batch v1

- family-definition registry for the six landed families
- unified ingestion resolver for workflow lessons, project rules, and unmet
  needs across transcript and tool submission
- unified clustered lifecycle inspection for response style, project facts, and
  workflow improvements

### Landed through batch v2

- shared correction / supersede planning for bounded correction and workflow
  supersede paths
- shared phrase-pattern engine for workflow lessons and response style
- retrieval feature framework for approved-memory hybrid ranking across several
  families

### Landed through batch v3

- shared behavior-profile prompt-support layer
- registry-driven proof-family definitions plus shared proof helpers
- reviewable-candidate retrieval framework bridge
- validated-procedure subject-match retrieval framework bridge

### Landed through support batch v1

- stronger unit seams for retrieval intent, prompt-facing application planning,
  and semantic fallback eligibility
- shared hybrid SQL scaffolding for approved and reviewable-candidate
  memory-object search
- typed correction-promotion policy inside the correction engine

### Landed through batch v4

- one ingestion control plane now serves all six families
- prompt-facing application selection now emits selected items, suppressed
  items, and rendering hints
- hybrid retrieval/routing now reads shared control decisions for query hints,
  project-family shaping, and semantic fallback family routing

### What this phase achieved

- less family-specific duplication than before
- more shared substrate across capture, lifecycle, correction, phrase
  handling, retrieval, prompting, and proofing

### What this phase still did not finish

- recurring procedures still keep too much separate staged subsystem shape
- correction policy is still not fully declarative
- proofing is still not fully adapter-driven
- the registry is still not fully authoritative
- memory-family policy still crosses core/middleware/plugin seams awkwardly
- application selection is still prompt-facing rather than final
  retrieval-fed per-memory-item substrate

## Phase C — substrate control-plane flattening

This is now the real next roadmap phase.

It is broader than the previously documented “remaining flattening closeout.”

### Purpose

Finish the control-plane work that must exist before reduced-profile
self-improving capture can land on honest shared substrate.

### Landed in flattening batch v5

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup
3. proof-runner adapterization

### What this changed

- workflow cluster auto-review supersession now uses the shared correction
  engine instead of a separate workflow-owned sequence
- approved workflow-guidance retrieval and learned-guidance planning are now
  canonical-only on their hot paths
- runtime capture seams now rely less on workflow-lesson-family lookup helpers
- ordinary-turn response-style semantic correction capture is explicitly
  supported in the ordinary-turn profile

### Landed in canonical correction/supersession retirement batch v1

1. a shared supersede-executor hook in the canonical correction engine
2. workflow auto-review supersession moved onto that shared engine
3. deletion of the last workflow-guidance mixed-era record bridge from
   `memory-canonical-compat.ts`
4. canonical-only workflow-guidance reads in semantic retrieval and
   learned-guidance
5. further runtime removal of workflow-lesson-family family/capture lookup
   usage

### What this changed

- workflow correction and supersession now look more like one canonical
  promotion substrate
- mixed-era workflow-guidance approved-row rebuilding is no longer a default
  runtime behavior
- `memory-family-policy.ts` is smaller and more obviously compatibility-owned

### What still remains in this phase

- family-specific correction/supersession wrappers still remain in
  `candidate-submit.ts`
- lower-level detector internals still need more canonical-profile cleanup
- family policy still owns compatibility and derived-view mapping for the
  transitional six-family runtime

### Landed in canonical de-archaicization tranche v1

1. more workflow auto-review orchestration now keys off canonical capture
   category instead of repeated lesson-family branching
2. learned-guidance planning now reads self-improving provenance from
   canonical record provenance
3. workflow-guidance proof/eval inserts now seed canonical approved records
4. workflow lesson compatibility data is isolated in a dedicated compatibility
   catalog
5. `memory-family-policy.ts` shed another historical public field

### What this changed

- canonical approved workflow-guidance records are now the default proof
  substrate for advisory planning tests and eval
- the last provider/incident-specific supported lesson list is more honestly
  treated as compatibility data than as runtime control-plane logic
- `memory-family-policy.ts` is closer to compatibility and derived-view
  ownership only

### Landed in canonical retirement follow-through tranche v1

1. more workflow auto-review orchestration moved behind shared canonical
   workflow policy helpers
2. workflow detector routing moved further toward profile registration
3. middleware runtime seams now consume narrower family-policy-derived views
4. write-stage routing now reuses cached canonical classification data
5. hybrid read scaffolding now prefers canonical compatibility and
   `captureClass` ahead of lesson-era compatibility fields
6. three named workflow lessons were retired into generalized workflow
   semantics instead of remaining explicit compat entries

### What this changed

- `candidate-submit.ts` is less family-owned in workflow correction and
  supersession flow
- the resolver is flatter and more profile-driven
- `write-action-stages.ts` is closer to a canonical multi-candidate write
  substrate

### Landed in runtime-target consolidation batch v1

1. the persistent local rollout Postgres target was retired from normal
   operational posture
2. memory-system docs now treat Supabase-backed Postgres as the single real
   runtime database target
3. disposable Docker Postgres is now documented as test or bounded-rehearsal
   infrastructure only

### What this changed

- the repo no longer presents a second persistent runtime database lane as a
  co-equal operating model
- runtime posture is clearer: one shared/runtime DB target, ephemeral test DBs
  only
- rollout history remains documented, but it is now explicitly historical

### Landed in runtime-target consolidation and final flattening batch v1

1. project-fact, recurring-procedure, and workflow ingestion moved onto one
   shared detector-registry helper
2. runtime policy-view and proof/type consumers moved further off the
   middleware family-registry bridge and onto public plugin-SDK policy seams
3. the write substrate gained an explicit candidate write plan and plan
   executor
4. hybrid read project-family classification stopped inferring family identity
   from `factFamily` or `fieldKey`

### What this changed

- the touched resolver area is now more honestly registry-driven
- `memory-family-policy.ts` is closer to being a pure public compatibility
  bridge rather than something middleware has to re-wrap broadly
- the write substrate is more honestly multi-candidate-shaped even though the
  live plan still emits one primary operation
- the active read path is less dependent on low-level mixed-era metadata
- the supported workflow compatibility catalog is smaller and more clearly
  bounded
- read/ranking classification lines up better with canonical capture-class
  semantics

### What still remains in this phase

- some correction/supersession wrappers still remain in `candidate-submit.ts`
- detector registration is not yet fully canonical-profile-only
- `memory-family-policy.ts` still exposes broad family definitions as a
  compatibility bridge
- the write substrate is not fully canonical multi-candidate end to end
- the remaining explicit workflow compatibility lessons still need a later
  delete-vs-generalize decision

### Landed in canonical profile-registry and write-lane batch v1

1. a narrower shared approved-memory correction-promotion helper now owns more
   of the correction/supersession execution path
2. project-fact semantic detection now runs through a profile-registered
   detector registry
3. narrow runtime-policy views now live inside the middleware runtime instead
   of being reconstructed from broad family definitions or read live from the
   plugin-SDK compatibility bridge
4. write-stage routing now understands canonical write lanes like
   `workflow_guidance`, `project_fact`, and `user_preference`
5. the last hybrid read `lessonFamily` fallback was removed from the active
   project-family read scaffolding
6. three repo/process workflow lessons were retired into generalized workflow
   guidance:
   - `vitest_wrapper_required`
   - `scripts_committer_required`
   - `git_stash_unsafe`

### What this changed

- `candidate-submit.ts` is less family-owned in correction/supersession flow
- the resolver is more honestly registry-driven in the touched semantic paths
- family policy is more clearly a compatibility/derived-view bridge instead of
  a broad runtime policy source
- write-stage routing now uses one honest canonical write operation instead of
  a fake multi-operation scaffold
- repo/process workflow guidance is less keyword-bound and less nostalgia-kept

### What still remains in this phase

- some correction/supersession wrappers still remain in `candidate-submit.ts`
- the detector story is still not one fully shared registry across every
  remaining family seam
- `memory-family-policy.ts` still exports the broad family-definition bridge
- four explicit compatibility lessons still remain because they are still
  bounded environment/provider cases:
  - `python_command_unavailable`
  - `gateway_tools_invoke_forbidden`
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`

- procedures now behave like a staged family instead of a quasi-separate
  product
- correction policy is now declarative enough for the current family set
- proofing no longer scales through central lifecycle/artifact switches

## Phase D — substrate authority and scale cleanup

This phase should land before the repo adds new memory families.

### Landed in flattening batch v6

1. registry authority cleanup
2. memory-family contract / boundary cleanup
3. deeper retrieval SQL normalization for approved-vs-reviewable-candidate
   simple memory-object reads

### What this changed

- the registry is now authoritative enough to be called the honest family
  policy control plane for the six current families
- memory-family policy now crosses the `memory-core` /
  `memory-middleware` / plugin-sdk boundary through a shared contract instead
  of a middleware implementation re-export
- the remaining approved-vs-reviewable-candidate `get` / `list` / `basic`
  memory-object SQL duplication is reduced

### What still remains later

- artifact / read-model convergence if later self-improving or family-expansion
  pressure shows the procedure-versus-memory-object split is still too awkward

## Phase D.5 — retirement tranche proper

This phase is now partially landed.

### Landed in retirement tranche proper batch v1

1. canonical-family-aware write-stage routing
2. phrase-induction convergence over one shared reviewed adapter seam
3. ingestion-resolver flattening for project facts and workflow guidance
4. reduction of lesson-key-specific promotion branching
5. smaller canonical compatibility output from family policy

### What this changed

- the repo now deletes old routing shortcuts instead of only wrapping them
- phrase induction is no longer two near-identical subsystems
- the candidate-submit path is less family-first at its entry and promotion
  edges
- one frozen response-style paraphrase fast lane is gone

### What still remains in this phase

- deeper canonical multi-candidate write-pipeline work
- more candidate-submit retirement work
- continued mixed-era semantic fallback reduction
- continued shrinkage of family-policy authority toward pure compatibility and
  derived-view ownership

### Landed in canonical write/promotion unification tranche v1

1. detector-profile routing replaced more open-coded family branching in the
   ingestion resolver
2. the remaining response-style tool fallback now emits canonical ingestion
   candidates
3. duplicate detection now keys off canonical candidate identity first
4. write-stage routing dropped template-only legacy family inference
5. `typedFastPaths` was removed from the public family-policy definition
   surface
6. semantic retrieval and learned-guidance reduced their old-record fallback
   ladders to one explicit mixed-era bridge

### What this changed

- the active write/promotion path is closer to one canonical pipeline
- old metadata copies created during promotion are no longer treated as the
  planner/retrieval default substrate
- family policy carries less dead old-world fast-path shape

### What still remains in this phase

- canonical promotion/correction still lives behind family-specific helpers in
  `candidate-submit.ts`
- mixed-era approved-record fallback still exists in a bounded form
- the resolver still has some family-aware semantic detector internals

### Landed in canonical write/promotion follow-through batch v1

1. workflow auto-review resolution now derives from capture-class canonical
   metadata instead of `lessonFamily` fallback or direct family-policy reads
2. write-stage routing no longer infers family from unstamped legacy category
   or capture-class metadata
3. response-style correction normalization now stamps canonical ingestion
   candidates before write-stage routing
4. workflow-guidance mixed-era reads now go through one shared
   canonical-shaped compatibility reader
5. family-policy capture-metadata helpers now use narrow compatibility maps

### What this changed

- the write path now depends more heavily on canonical stamping being present
- old-record workflow-guidance support is smaller and more centralized
- candidate-submit is less dependent on lesson-family lookups from family
  policy
- extension-side proof and phrase policy is now local to the memory middleware
  package instead of importing the broad family-policy surface
- workflow ingestion now carries canonical capture category through the active
  path and only maps back to family ids inside the explicit compat bridge
- the pure candidate/procedure/skill planning builders are no longer welded to
  `queries.ts`

### What still remains in this phase

- extraction of one canonical correction/supersession engine from the
  remaining family-specific candidate-submit helpers
- deletion of the final mixed-era workflow-guidance compatibility bridge once
  old approved records no longer require it
- deeper cleanup of remaining family-aware semantic detector internals in the
  resolver
- further `queries.ts` reduction beyond the now-extracted approval/install and
  vetter planning cluster that used to live beside SQL execution

### Focused follow-through cleanup

The latest follow-through slice did four concrete things:

1. split canonical compat builder logic out of `memory-canonical-compat.ts`
   so the compat bridge is more obviously a reader/adapter seam
2. isolated the last raw `autoCapture.family` fallback in
   `candidate-submit.ts` behind one explicit legacy helper
3. extracted the remaining pure approval/install/Skill Vetter planning logic
   from `queries.ts` into `db/governance-plan-builders.ts`
4. marked the broad family-era helpers in `memory-family-policy.ts` as
   compatibility-only API, not preferred runtime architecture

This means:

- the extension runtime is closer to zero direct family-policy dependence
- `queries.ts` is still large, but less of its skill-governance planning is
  entangled with SQL execution
- the remaining work is now mostly true bridge retirement and deeper
  correction-engine flattening, not the old mixed planner tangle

## Phase E — post-flattening hardening before reduced-profile self-improving capture

This phase is now landed.

The post-v6 deep review changed the next-step truth.

It landed because the post-v6 deep review found that the current code still
needed:

- request-path cost hardening for database access and semantic fallback
- application/token-efficiency hardening for durable-memory prompt behavior
- write-path action-stage decomposition for transcript auto-capture, candidate
  submit, and proof execution
- one bounded proof-step dispatch closeout slice

The accepted decomposition rule for that work is:

- finite shared action stages instead of one helper per family
- family variance in registry policy and bounded adapters
- special cases only where the runtime structure is honestly distinct

That hardening is now strong enough that:

- request-path cost is acceptable under higher capture and retrieval pressure
- application policy is structurally selected and cheap enough to render
- proof and orchestration behavior are not hidden regression traps

## Phase F — reduced-profile self-improving capture reevaluation

This phase is now landed.

It proved that reduced-profile self-improving capture can land on the hardened
substrate strongly enough that:

- self-improving candidates enter the same family substrate
- provenance stays explicit
- application policy is structurally selected, not just prompt-described
- retrieval/routing policy does not have to be re-implemented per family
- proofing can scale without bespoke family branches

## Phase G — reduced-profile self-improving capture bounded first tranche

This phase is now landed as a bounded first tranche.

Current tranche shape:

- default-off through `selfImprovingCapture.mode = candidate-only`
- workflow-guidance-only
- candidate-only
- explicit provenance
- duplicate/replay handling on the shared substrate

## Phase H — learned-guidance advisory planning

This phase is now landed as a bounded inline-only advisory slice.

Current tranche shape:

- default-off through `learnedGuidanceAdvisoryPlanning.mode = inline-only`
- approved-only retrieval
- explicit application selection
- advisory-only inline suggestions
- conflict suppression instead of silent collapse

## Phase I — bounded rollout proof and reevaluation

This phase is now landed.

It added:

- explicit rollout family-scope control for self-improving capture
- explicit rollout family-scope control for learned-guidance advisory planning
- explicit default suggestion-budget control for inline advisory planning
- structured self-improving outcome signals for created, blocked,
  replay-blocked, disabled, and failed decisions
- structured advisory observability for surfaced, suppressed, filtered, and
  no-guidance decisions, including approximate prompt cost

It concluded:

- self-improving capture should stay narrow for now
- learned-guidance advisory planning should stay narrow for now
- the next missing truth is real bounded rollout evidence, not more missing
  substrate implementation

## Phase J — Main-session reminder isolation and memory consolidation

This phase is now landed.

It added:

- structural isolation for internal-only cron / exec reminder turns so they do
  not leak visible system payloads into Main chat
- a bounded project-rule semantic lane for explicit docs-localization policy
  phrasing
- a bounded generalized response-style lane for explicit file-reference
  preferences
- retrieval intent and ranking support for docs i18n rule questions and
  file-reference style questions

It concluded:

- the strongest explicit docs/file packet shapes are now good enough for
  bounded promotion follow-through
- vague shorthand packet shapes should stay narrow
- the next missing truth is still bounded off-production evidence, but now on
  top of a cleaner Main-session boundary and cleaner explicit packet shapes

## Phase K — bounded promotion follow-through and off-production rollout enablement

This phase is now landed.

It added:

- bounded promotion follow-through proof for explicit docs-localization
  project-rule packet shapes
- bounded promotion follow-through proof for explicit file-reference
  response-style packet shapes
- retrieval control-plane preference for stronger approved explicit memory over
  weaker nearby reviewable candidates inside the same bounded subject cluster
- explicit `off-production` rollout-target gating for reduced-profile
  self-improving capture
- explicit `off-production` rollout-target gating for learned-guidance
  advisory planning

It concluded:

- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand docs/file packet shapes should stay candidate-heavy
- the narrow self-improving and learned-guidance seams remain default-off
  unless an explicit `off-production` rollout target is set
- the next missing truth is real bounded off-production usage evidence

## Phase L — automated eval and production-canary controls

This phase is now landed.

It added:

- `pnpm memory:rollout-eval` as a real automated bounded eval path
- explicit `production-canary` rollout-target control for reduced-profile
  self-improving capture
- explicit `production-canary` rollout-target control for learned-guidance
  advisory planning

It concluded:

- automated eval is now the honest pre-canary evidence path
- the self-improving candidate-only seam and learned-guidance advisory-only
  seam are control-ready for a narrow rollbackable production canary
- the current automated eval still exposes three weak spots:
  docs-localization ranking / metadata incompleteness,
  file-reference under-retrieval,
  and native workflow guidance under-retrieval

## Phase M — Main advisory-routing diagnosis

This phase is now landed as a narrow diagnosis-and-follow-through slice.

It added:

- transcript proof that recent Main production-canary workflow-preflight asks
  were not calling `memory_learned_guidance_plan`
- prompt/profile guidance that distinguishes workflow-preflight advisory asks
  from direct workflow lookup asks
- rollout-aligned registration for `memory_learned_guidance_plan`

It concluded:

- the Main failure was a profile/tool-selection gap, not a rollout-target bug
- the narrow routing fix is landed
- learned-guidance advisory planning is still not Main-proven in
  production-canary UX until a fresh transcript/tool rerun shows the planner
  actually firing

Recent follow-through evidence then showed a broader Main problem:

- the latest post-fix rerun still used no memory tool for most workflow-
  preflight and direct lookup prompts
- that rerun was also not actually advisory-enabled in live config, so
  `memory_learned_guidance_plan` was absent from Main
- a narrow Main-only OpenAI/Codex tool-choice wrapper is now landed so
  eligible workflow-preflight prompts can pin
  `memory_learned_guidance_plan` when enabled, and strong direct lookup
  prompts can pin `memory_object_search_hybrid`
- Main memory-tool selection is still not production-canary-proven until a
  fresh live transcript shows the right tools actually firing

## What comes next after Phase M

The next honest move is a narrow rollbackable production-canary Main-session
rerun with the learned-guidance rollout target actually enabled, focused on:

- workflow-preflight prompts that should hit
  `memory_learned_guidance_plan`
- strong direct lookup prompts that should hit
  `memory_object_search_hybrid`
- explicit watch items for docs/file/native-workflow weak spots

Only after that rerun should the repo make the next post-canary judgment.

After the repo finished proving the existing Main routing / learned-guidance /
retrieval functionality it already claimed to have, the next roadmap item was
reliable multi-memory handling within a single turn.

## Phase N — multi-memory per-turn capture and retrieval

This phase is now landed as the bounded next step after the Main proof work.

It focused on:

- reliably capturing more than one distinct memory candidate from one long
  turn when multiple durable lessons are genuinely present
- preserving bounded authority so one verbose turn does not become an
  unbounded ingestion sweep
- making multi-result retrieval feel intentional rather than incidental when a
  single query has several genuinely relevant approved memories
- adding observability strong enough to show:
  - how many candidate memories were detected from a turn
  - how many were suppressed or merged
  - how many were finally submitted / reviewed / promoted
  - how many retrieval records were surfaced vs actually used in the final
    answer

This phase concluded:

- a single long turn can yield multiple distinct candidate memories when the
  content truly supports that
- retrieval can return and report multiple relevant memories without losing
  bounded ranking discipline
- the repo has transcript- and tool-level proof for both multi-capture and
  multi-retrieval behavior

## Phase O — mandatory rigid-surface replacement and canonicalization

This phase is now the mandatory next program of work.

It exists because the repo has now proven the current bounded behavior well
enough that the main remaining scaling problem is architectural rigidity, not
missing one-off family patches.

This phase must:

- replace rigid family-first capture, retrieval, and application seams with
  generic adaptable contracts
- move the storage model toward 4 canonical memory kinds:
  - `User`
  - `Feedback`
  - `Project`
  - `Reference`
- preserve current useful semantics as facets, metadata, derived views, and
  compatibility adapters instead of permanent top-level families
- remove first-order dependence on:
  - family-specific registry switches
  - lesson-key switches
  - template-specific routing
  - hard-coded retrieval hint tables
  - first-hit write handling as the dominant substrate shape

Phase O should be sequenced as:

1. canonical record contract and adapter envelope
2. generic ingestion contract
3. generic retrieval and ranking contract
4. learned-guidance and hybrid retrieval re-based onto canonical memories
5. compatibility shims for old family-owned seams
6. staged retirement of rigid family-specific branches

Current tranche status:

- Steps 1-5 are now materially landed:
  - canonical record/envelope contracts exist in code
  - canonical facet/metadata scaffolding exists in code
  - family-policy compatibility builders can emit canonical-core-compatible
    records
  - generic ingestion contracts now exist in code
  - resolver-backed ordinary-turn capture now emits canonical candidates
  - generic retrieval/ranking contracts now exist in code
  - hybrid retrieval control decisions now consume canonical retrieval plans
    first
  - learned-guidance planning now prefers canonical workflow-guidance records
    and canonical retrieval plans first
  - critical tool-submission and self-improving capture seams now emit
    canonical candidates first
- Step 6 is now in progress:
  - hybrid retrieval execution now reads canonical metadata first under the
    canonical control surface
  - retrieval control and candidate submission now share one canonical-first
    metadata reader
  - ordinary-turn fallback capture now uses the shared canonical adapter seam
  - Main routing now uses a dedicated canonical-memory planner surface rather
    than hiding planner logic in the OpenAI wrapper layer
  - workflow retrieval hinting and hybrid ranking now speak in generic capture
    classes rather than relying on lesson-key routing
  - correction promotion in tool submission is now more fully delegated to the
    shared correction engine
  - canonical write-stage routing now supports honest multi-lane matching
- The next required retirement work after that is:
  - finish the remaining family-specific correction and supersession wrappers
    in `candidate-submit.ts`
  - continue collapsing detector families in
    `memory-ingestion-resolver.ts`
  - contain or generalize the hard-coded supported workflow lesson catalog in
    `workflow-improvement-semantic.ts`
  - keep shrinking `memory-family-policy.ts` until it is compatibility-only

Success for this phase should mean:

- the 4 canonical kinds are the durable storage model
- the current six-family substrate is clearly transitional rather than
  permanent
- current family-specific tools and policies can run as adapters while the
  canonical model takes over
- future scaling work no longer depends on adding another family-specific
  branch for each new memory behavior

## Phase P — cross-domain family expansion

Cross-domain family expansion resumes only after:

1. substrate control-plane flattening
2. substrate authority / scale cleanup
3. reduced-profile self-improving capture
4. learned-guidance advisory planning
5. bounded rollout proof and reevaluation for those new functional seams
6. bounded promotion follow-through, automated eval, and production-canary
   evidence review
7. multi-memory per-turn capture / retrieval proof
8. mandatory rigid-surface replacement / canonicalization

Recommended first tranche:

- decision + rationale
- observation / result / finding
- terminology / ontology / canonical definition
- entity profile

Recommended second tranche:

- risk / hazard / safety constraint
- metric / baseline / threshold
- hypothesis / open question
- audience / stakeholder model
- source trust / authority ranking
- exception / edge-case rule

## Should-fix-soon work

These items matter but do not necessarily need to block the first post-v3
substrate slice:

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

## Could-fix-later work

- more aggressive normalization of retrieval SQL generation once the
  control-plane rewrite is stronger
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## Roadmap guardrails

- do not treat flattening progress as proof that the substrate is already
  complete enough
- do not treat practical parity as full capability identity
- do not enable reduced-profile self-improving capture during the
  docs/spec/architecture-planning slice
- do not add new families before the rigid-surface replacement program is
  landed strongly enough
- do not erase real family-policy differences while flattening
