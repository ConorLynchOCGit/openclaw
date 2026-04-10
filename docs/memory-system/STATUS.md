# Status

## Current status snapshot

The memory system has now completed:

- practical family parity across the six current families
- flattening batches v1-v6
- the pre-capture hardening tranche
- the first functional self-improving and learned-guidance batch

Core flattening is landed.

Pre-capture hardening is landed.

The first bounded self-improving and inline advisory functionality is now
implemented on the shared substrate.

The bounded rollout-proof and reevaluation batch is now also landed.

The Main-session reminder isolation and memory-consolidation follow-through
batch is now also landed.

The bounded promotion and off-production rollout-enablement batch is now also
landed.

The automated eval and production-canary controls batch is now also landed.

The Main advisory-routing diagnosis batch is now also landed.

The Main memory-tool bypass diagnosis batch is now also landed.

The multi-memory per-turn capture and rigid-replacement architecture-spec batch
is now also landed.

The canonical-core tranche of rigid-surface replacement is now also landed.

The critical refactor-review and canonicalization batch is now also landed.

The retirement tranche proper batch v1 is now also landed.

The canonical write/promotion unification tranche v1 is now also landed.

The canonical write/promotion follow-through batch v1 is now also landed.

The canonical correction/supersession retirement batch v1 is now also landed
locally.

The canonical de-archaicization tranche v1 is now also landed locally.

The canonical profile-registry and write-lane batch v1 is now also landed
locally.

The runtime-target consolidation batch is now also landed locally.

The runtime-target consolidation and final flattening batch v1 is now also
landed locally.

The native OpenClaw file-integration tranche is now also landed locally
through:

- shared bootstrap projections
- canonical daily continuity compilation
- project-local projections and top-level pointer integration
- projection audit / omission / drift reporting
- explicit circularity protection in native file indexing
- metadata-first scope classification for shared/project/agent projection lanes
- a first specialized-agent projection tranche

The next native-file rollout tranche is now also landed locally through:

- an explicit allowlist for project-local projection targets
- operator-facing projection summaries on top of the machine-readable audit
- daily operator-review integration for projection state
- daily host-cron projection refresh before daily review prep
- a hardened manual sync command with explicit scope selection, summary output,
  and host-workspace targeting

The broader native-file follow-through tranche is now also landed locally
through:

- project-local projections into the real allowlisted project `INDEX.md` docs,
  with `MEMORY.md` only as a compatibility fallback
- explicit specialized-agent projection rollout for `x-manager` and
  `web-researcher`
- metadata-first project precedence for project-scoped agent memory
- stale-aware host-side projection status and refresh orchestration
- confirmation that no schema change was required for this tranche

The repo-local landing-test wrapper now also has a constrained-host safe mode
for full repo runs, so low-memory hosts default to narrower unit batches,
serial top-level execution, and a larger worker heap budget instead of
rediscovering the old worker-OOM path manually.

The long-prompt ordinary-turn capture expansion tranche is now also landed
locally through:

- larger bounded long-prompt segmentation for candidate-bearing turns
- ranked candidate-pool selection instead of first-hit-only acceptance
- posture-aware total immediate caps plus per-family immediate caps
- persistent deferred-overflow evidence for lower-ranked valid candidates
- repeated-prompt promotion for deferred overflow candidates
- an explicit stronger bulk posture for multi-preference and multi-fact prompt
  shapes
- confirmation that no schema change was required for this tranche

## What is live now

Live families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Live substrate properties:

- approved durable memory objects and validated procedures
- approved-only hybrid retrieval
- shared family registry and shared family-policy SDK seam
- staged recurring-procedure substrate
- declarative correction policy
- adapterized proof execution
- shared write-path action stages in the touched capture/submit seams
- request-path hardening for pooled access and shared semantic fallback work
- compact prompt-facing durable-memory application shaping
- reduced-profile self-improving capture proof support
- reduced-profile self-improving capture first tranche
- inline learned-guidance advisory planning first tranche
- Main-session internal reminder isolation for cron / exec reminder turns
- stronger docs-localization project-rule normalization
- stronger file-reference response-style normalization and retrieval hinting
- bounded promotion follow-through for explicit docs-localization and
  file-reference packet shapes
- explicit off-production rollout-target gating for self-improving capture and
  learned-guidance advisory planning
- automated rollout eval runner for the bounded seams and promotion-eligible
  explicit docs/file packet shapes
- explicit production-canary rollout-target gating for self-improving capture
  and learned-guidance advisory planning
- a central candidate-ingress capability resolver now owns the old
  submit/review/promotion ladder so advanced runtime ports no longer fan the
  long historical mode string back out independently
- candidate-ingress config now normalizes that historical ladder into smaller
  stage names such as `conversational-review`, `promote-memory`,
  `validate-procedure`, and `skill-governance`-adjacent stages while still
  accepting the older long-form aliases for backward-compatible config parsing
- approved-over-candidate cluster preference for bounded retrieval of stronger
  explicit docs/file packet shapes
- rollout-aligned registration for `memory_learned_guidance_plan`
- rollout-aligned registration for `memory_candidate_review_prompt`
- prompt/profile routing that distinguishes workflow-preflight advisory asks
  from direct workflow lookup asks
- Main-only OpenAI/Codex tool-choice steering for strong workflow-preflight
  and direct repo-lookup prompt classes
- bounded multi-memory capture from a single long user turn when multiple
  distinct strong candidates are present
- bounded long-prompt capture that can inspect materially more candidates than
  the original three-memory path while still keeping immediate acceptance
  bounded
- deferred-overflow candidate metadata that preserves lower-ranked valid
  candidates for later confirmation instead of silently discarding them
- canonical memory record/envelope types on the public plugin-SDK surface
- canonical facet/metadata contracts for the 4-kind target model
- transitional family-policy builders that emit canonical-core-compatible
  records without replacing the active family runtime yet
- canonical-first hybrid retrieval execution under the canonical control
  surface
- a shared canonical-first metadata reader used by retrieval control and
  candidate submission instead of legacy `autoCapture` reads
- a dedicated Main canonical-memory planner surface in
  `src/agents/main-memory-routing.ts`
- thinner OpenAI wrapper routing that applies the planner decision instead of
  owning the planner logic
- canonical-family-aware write-stage routing for tool submission
- one shared reviewed phrase-induction adapter seam for workflow and
  response-style phrase patterns
- flatter project-fact and workflow-ingestion resolver internals
- one generic project-workflow semantic-embedding promotion helper instead of
  three lesson-key-specific branches
- ingestion resolver mode/detector selection driven by explicit canonical
  profiles rather than more open-coded family branching
- canonical candidate stamping on the remaining response-style tool-submission
  fallback path
- canonical dedupe identity reads in the managed duplicate guard
- narrower write-stage family inference with template-only legacy routing
  removed
- semantic retrieval and learned-guidance now keep one mixed-era metadata
  bridge instead of a broader old-record fallback ladder
- write-stage routing now requires canonical candidate stamping instead of
  inferring family from legacy category/capture metadata
- workflow-guidance mixed-era reads now flow through one shared
  canonical-shaped compatibility seam
- workflow cluster correction planning in candidate-submit now resolves family
  from canonical submission metadata instead of lesson-family mapping
- family-policy capture-metadata helpers now read narrow compatibility maps
  instead of broad family definitions
- the active capture path now also uses one internal canonical capture-class
  metadata table for workflow/project/procedure capture routing instead of
  consulting the broader family-policy registry at runtime
- workflow auto-review supersession now uses the shared canonical correction
  engine instead of a separate workflow-owned promotion sequence
- approved workflow-guidance retrieval/planning is now canonical-only instead
  of rehydrating mixed-era approved rows from `autoCapture`
- ordinary-turn and self-improving workflow capture no longer depend on
  workflow-lesson-family runtime lookup helpers
- the response-style ordinary-turn profile now accepts semantic
  `requirement_correction` captures
- approved workflow-guidance planning now infers self-improving provenance
  from canonical record provenance instead of relying on legacy facet-only
  markers
- legacy workflow-guidance proof/eval inserts now seed canonical approved
  records instead of raw `autoCapture`-only rows
- `memory-family-policy.ts` no longer exposes `workflowLessonFamilies` on the
  family-definition surface
- the remaining bounded environment/provider workflow cases now live as
  explicit semantic detectors inside `workflow-improvement-semantic.ts`
  instead of a separate compatibility catalog
- project-fact semantic detection now uses a profile-registered detector
  registry instead of open-coded paired semantic detectors
- middleware runtime seams now consume an internal runtime-policy table
  that preserves the active lifecycle/correction/retrieval/routing posture
  without reading live policy from `memory-family-policy.ts`
- write-stage routing now supports canonical lanes so submit-path stages can
  target semantic write lanes directly
- hybrid read scaffolding no longer falls back through `lessonFamily` to
  classify project-family reads
- repo/process workflow guidance for `vitest`, `scripts/committer`, and
  `git stash` now flows through generalized workflow guidance instead of
  staying named compatibility lessons
- the normal runtime database target is now one shared Supabase-backed
  Postgres target using schema `memory_middleware`
- the earlier persistent local rollout Postgres container is now retired from
  normal operational posture and remains historical proof baggage only
- disposable `pgvector/pgvector:pg16` containers are now documented as
  integration-test or bounded-rehearsal infrastructure only
- the touched semantic detector paths now share one registry-style resolver
  helper instead of repeating project-fact / recurring-procedure / workflow
  detector loops
- the write substrate now executes one explicit canonical write operation
  directly instead of centering on ad hoc submit-path branching or a fake
  multi-operation scaffold
- hybrid read family classification no longer infers project-family identity
  from `factFamily` or `fieldKey`
- candidate follow-up now has a bounded conversational review path: the agent
  can inspect a pending candidate, ask the user to approve/reject/revise it in
  chat, and then route the answer through the existing review tool
- proactive candidate-review follow-up now prepares those conversational review
  prompts directly instead of returning a blocked execution result
- proactive procedure-validation follow-up now prepares conversational
  validation prompts instead of pointing at hidden manual validation review
- proactive skill-governance follow-up now prepares conversational governance
  prompts instead of pointing at hidden manual governance review
- proactive stale-memory and consolidation-review follow-up now also prepare
  conversational hygiene prompts instead of surfacing `manual_review` planner
  approvals
- learned-guidance advisory now treats approved workflow guidance as the
  authority while allowing candidate workflow guidance as provisional inline
  advice when no better approved record exists
- advanced candidate/promotion/procedure/skill-governance tools are now only
  registered when the active runtime posture actually enables them, instead of
  always appearing and then failing as disabled no-ops

## What is live but still bounded

The newly landed functional surfaces are intentionally bounded:

- `selfImprovingCapture.mode = candidate-only`
- `learnedGuidanceAdvisoryPlanning.mode = inline-only`

Current live bounds:

- self-improving capture is workflow-guidance-only
- self-improving capture is candidate-only
- self-improving capture has no direct approval authority
- self-improving capture now has an explicit generalized workflow-guidance
  rollout scope defined by bounded workflow-guidance capture classes
- self-improving capture now also requires an explicit `off-production` or
  `production-canary` rollout target before it activates
- learned-guidance planning stays workflow-guidance-only
- learned-guidance planning prefers approved workflow guidance
- learned-guidance planning may now surface candidate workflow guidance as
  provisional inline advice
- learned-guidance planning is inline-only and advisory-only
- learned-guidance planning suppresses conflicting guidance instead of guessing
- learned-guidance planning now has an explicit generalized workflow-guidance
  scope and a bounded default suggestion budget
- learned-guidance planning now also requires an explicit `off-production` or
  `production-canary` rollout target before it activates
- candidate follow-up no longer assumes hidden operator review; the bounded
  path is now conversational review in chat
- reduced-profile self-improving capture is still candidate-only, but it no
  longer depends on hidden operator review to be practically useful because
  candidate guidance can surface provisionally and proactive follow-up can ask
  the user in chat
- procedure validation and skill governance remain bounded follow-up/governance
  surfaces rather than autonomous product behavior, but they no longer depend
  on hidden operator-only review because the system can ask the user about the
  next follow-up step in chat
- procurement, vetting, approval, and install remain bounded governance
  surfaces because they preserve external-skill review checkpoints and do not
  yet have a safe autonomous execution story
- historical rollout reports and retired migration notes now live under
  `docs/memory-system/archive/`

## What is still not live by default

Still not live by default:

- production-enabled reduced-profile self-improving capture
- production-enabled learned-guidance advisory planning
- broader self-improving family coverage
- learned-guidance planning that feeds proactive execution or scheduling
- new cross-domain memory families
- the canonical 4-kind storage model migration
- generic flexible replacement of the current rigid family-first seams
- full retirement of the remaining family-heavy compatibility branches
- full removal of the last mixed-era approved-record fallback bridges
- full extraction of one canonical correction/supersession engine from the
  remaining candidate-submit family helpers
- full removal of the remaining family-specific correction/supersession
  wrappers in `candidate-submit.ts`
- full collapse of the remaining family-aware detector internals in
  `memory-ingestion-resolver.ts`
- full retirement or further generalization of the remaining bounded explicit
  environment/provider workflow semantic detectors in
  `workflow-improvement-semantic.ts`
- full removal of the remaining broad family-definition runtime reads where a
  narrower policy view should suffice
- full retirement of the remaining response-style-owned detector special case
  if a safe shared `forget`-capable registry path is later justified

## What the multi-memory and architecture-spec batch changed

This batch landed three real outcomes:

1. bounded multi-memory capture on the current transcript auto-capture path
2. a mandatory roadmap phase for rigid-surface replacement
3. a canonical 4-kind migration spec grounded in current repo seams

It concluded:

- one long turn can now yield multiple bounded distinct candidates on the
  current system
- the current family-heavy architecture is explicitly transitional
- the next major program is no longer rollout proof for current behavior; it
  is rigid-surface replacement and canonicalization around:
  - `User`
  - `Feedback`
  - `Project`
  - `Reference`

## What the canonical-core tranche changed

This tranche and the immediate follow-through slices have now landed:

1. canonical memory record/envelope contracts on the public SDK surface
2. a generic facet/metadata model for preserving current distinctions without
   keeping them all as top-level kinds
3. compatibility builders that let current family-owned seams produce
   canonical-core-compatible records
4. generic canonical ingestion candidate contracts
5. resolver-backed ordinary-turn capture emission of canonical candidates
6. generic canonical retrieval/ranking plan contracts with compatibility-driven
   population from the current retrieval hint/control layer
7. hybrid retrieval control decisions now derive their operative routing and
   semantic-fallback inputs from canonical retrieval plans first
8. learned-guidance planning now prefers canonical workflow-guidance records
   and canonical retrieval plans before legacy metadata fallbacks
9. the remaining critical tool/self-improving submission seams now stamp
   canonical ingestion candidates first, with family-native metadata preserved
   as compatibility state

It concluded:

- the canonical 4-kind target is now a real code seam, not just a doc plan
- the current family-heavy runtime remains active, but real ingestion,
  retrieval, guidance, and critical submission seams now have forward adapter
  paths into the canonical substrate

## What the canonical retirement follow-through tranche changed

This local-only tranche continued the retirement program on the current dirty
tree.

It landed:

1. a shared canonical workflow auto-review policy layer used by more of
   `candidate-submit.ts`
2. profile-registered workflow detector routing in
   `memory-ingestion-resolver.ts`
3. narrower runtime-policy views so middleware seams rely less directly on
   broad family definitions
4. cached canonical candidate classification in `write-action-stages.ts`
5. more capture-class-first retrieval/query classification in the hybrid read
   scaffolding
6. explicit workflow compatibility is now reduced to bounded detector-owned
   environment/provider cases instead of a separate compatibility catalog
7. a narrower shared correction-promotion helper plus more
   `candidate-submit.ts` follow-through onto it
8. project-fact semantic detection moved to a profile-registered detector
   registry
9. narrow runtime-policy views moved into the plugin-SDK family-policy seam
10. canonical write lanes now drive more of the submit-path stage matching
    and the fake multi-operation write scaffold is gone
11. the last hybrid read `lessonFamily` fallback was removed
12. three more named workflow lessons were retired into generalized guidance:

- `vitest_wrapper_required`
- `scripts_committer_required`
- `git_stash_unsafe`

It concluded:

- workflow correction/supersession flow is flatter than before, though not yet
  fully canonical
- detector routing is more canonical-profile-driven
- family policy is more obviously a compatibility/derived-view seam
- the write-stage substrate now has a real cached canonical classification
  layer and one honest canonical write operation
- generic workflow guidance now owns some behavior that was previously kept as
  named compat lessons
- repo/process guidance is less keyword-bound and less overfit than before
- the next honest migration slice is the deeper runtime retirement work:
  write-stage canonicalization, phrase-induction convergence, staged
  candidate-submit reduction, and continued shrinkage of family-heavy
  compatibility branches

## What the retirement tranche proper batch v1 changed

This batch landed six real outcomes:

1. canonical-family-aware write-stage routing in the candidate-submit path
2. convergence of workflow and response-style phrase induction onto one shared
   adapter seam
3. deletion of the narrow response-style paraphrase-key fast lane
4. flatter project-fact and workflow-ingestion resolver internals
5. one generic workflow semantic-embedding promotion helper instead of three
   lesson-key-specific branches
6. reduced legacy leakage from `memory-family-policy` into canonical
   compatibility records

It concluded:

- `write-action-stages.ts` is no longer just a thin shell around kind/family
  dispatch from `candidate-submit`
- phrase induction is now one subsystem with family-specific adapters instead
  of two parallel subsystems
- the old frozen response-style paraphrase shim is gone
- canonical compatibility records no longer inherit obsolete `typedFastPaths`
- the next honest retirement work is deeper candidate-submit cleanup,
  write-pipeline generalization, and continued mixed-era fallback deletion

## What the canonical write/promotion unification tranche v1 changed

This tranche landed six real outcomes:

1. detector-profile routing is more canonical-first in the ingestion resolver
2. the remaining response-style tool fallback now stamps canonical ingestion
   metadata
3. duplicate detection now reads canonical dedupe identity
4. write-stage routing no longer infers family from template-only legacy
   metadata
5. `typedFastPaths` was removed from the public family-policy definition
   surface
6. semantic retrieval and learned-guidance now keep only one explicit
   mixed-era metadata bridge

It concluded:

- the write/promotion path is now more honestly one canonical pipeline with
  shrinking adapters behind it
- mixed-era promotion-time metadata ladders are no longer treated as default
  retrieval/planner substrate
- the next honest work is to collapse the remaining family-specific correction
  and promotion helpers behind one canonical write/promotion engine

## What the canonical write/promotion follow-through batch v1 changed

This tranche landed six real outcomes:

1. workflow family resolution in the ingestion resolver now derives from
   capture-class canonical metadata instead of `lessonFamily` fallback
2. write-stage routing now requires canonical stamping and no longer guesses
   from legacy category/capture metadata
3. response-style correction normalization now stamps canonical ingestion
   candidates before write-stage routing
4. candidate-submit promotion metadata now reads through canonical-first
   helpers instead of raw `autoCapture` objects
5. semantic retrieval and learned-guidance now share one mixed-era
   workflow-guidance compatibility reader
6. family-policy capture-metadata helpers now use narrow compatibility maps

It concluded:

- canonical write routing is stricter and less inference-heavy
- workflow-guidance mixed-era support is now one bounded adapter instead of
  duplicated fallback ladders
- candidate-submit is closer to one canonical submission/promotion pipeline,
  even though family-specific correction helpers still remain

## What the critical refactor-review and canonicalization batch changed

This batch landed five real outcomes:

1. a critical review that confirmed the repo still had a hidden two-systems
   problem between the memory substrate and Main routing
2. deeper hybrid retrieval execution now reading canonical metadata first
3. ordinary-turn fallback capture now using the shared canonical adapter seam
4. retrieval control and candidate submission now sharing one
   canonical-first metadata reader
5. Main routing moved onto a dedicated canonical-memory planner surface

It concluded:

- the repo is materially flatter than before this batch
- the OpenAI wrapper layer is no longer the real Main memory router
- compatibility metadata is now more clearly fallback rather than primary
  architecture
- the biggest remaining retirement targets are:
  - `extensions/memory-middleware/src/memory-canonical-compat.ts`
  - `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
  - `extensions/memory-middleware/src/db/queries.ts`
  - `src/plugin-sdk/memory-family-policy.ts`

## What the compatibility-retirement and 4-kind follow-through batch changed

This batch landed four real outcomes:

1. extension-side proof and phrase policy no longer imports
   `memory-family-policy.ts`; that policy now lives in a local
   `memory-proof-policy.ts` seam
2. `write-action-stages.ts` no longer routes on compatibility family ids and
   instead matches canonical kind, capture category, capture class, lanes, and
   derived views only
3. workflow ingestion and candidate-submit follow-through now use canonical
   workflow capture categories as the active routing signal, while
   `memory-canonical-compat.ts` remains the explicit family-compat bridge
4. `queries.ts` shed the reusable candidate/procedure/skill planning builders
   into `db/governance-plan-builders.ts`

It concluded:

- the only remaining extension import of `memory-family-policy.ts` is now the
  explicit canonical compatibility bridge
- the active write path is more honestly canonical-first and less mixed-era
- workflow durable-record construction now centers capture category first and
  only maps back to family ids at the compatibility bridge
- `queries.ts` is still large, but the pure governance planning cluster is no
  longer welded to the SQL layer
- the biggest remaining retirement targets are now:
  - correction/supersession cleanup in `candidate-submit.ts`
  - the broad compatibility-definition surface in
    `src/plugin-sdk/memory-family-policy.ts`
  - the approval/install planner cluster still living in
    `extensions/memory-middleware/src/db/queries.ts`

## What the focused compat-bridge and governance-planner cleanup changed

This batch landed four follow-through outcomes:

1. `memory-canonical-compat.ts` is now narrower because canonical
   record/candidate builder logic moved into a dedicated compat-builder module
2. `candidate-submit.ts` now isolates the last raw `autoCapture.family`
   fallback behind one explicit legacy compatibility helper
3. `queries.ts` shed the remaining pure skill-governance planning cluster for
   Skill Vetter handoff, approval planning, and install handoff into
   `db/governance-plan-builders.ts`
4. `src/plugin-sdk/memory-family-policy.ts` now explicitly marks its broad
   family-definition and family-projection helpers as compatibility-only

It concluded:

- the compat bridge is smaller and more obviously transitional
- candidate-submit is more clearly canonical-first, with the last family-era
  fallback isolated instead of blended into the main routing path
- approval/install planning is less welded to the SQL layer in `queries.ts`
- `memory-family-policy.ts` remains public for compatibility, but its role is
  now documented as a family-era bridge rather than a preferred runtime policy
  center

## What the final memory-path completion and gate-discipline batch changed

This batch landed five closing outcomes:

1. extension-side canonical compat record building now uses the local
   `memory-compatibility-family.ts` seam instead of importing
   `src/plugin-sdk/memory-family-policy.ts`
2. memory-core durable prompt guidance now reads local durable memory guidance
   families instead of the SDK family-definition registry
3. `candidate-submit.ts` removed the last meaningful raw family-id routing
   fallback and now only uses canonical metadata plus narrow compatibility
   hints for legacy unstamped workflow records
4. `queries.ts` shed the remaining skill-candidate, procurement, and vetting
   selector/transaction cluster into dedicated DB modules, while keeping
   `queries.ts` focused on the broader query-layer domains that still honestly
   belong there
5. repo-owned gate discipline now lives in `scripts/run-gate.mjs`, the root
   package scripts, `AGENTS.md`, and the workflow/testing docs so future
   sessions inherit the same lock, reuse, and timestamp behavior

It concluded:

- extension runtime code now has zero imports of
  `src/plugin-sdk/memory-family-policy.ts`
- `memory-family-policy.ts` remains only as a public backward-compatible SDK
  surface plus its own tests
- `memory-canonical-compat.ts` remains the explicit old-record translation
  seam, but it is now a small reader/adapter layer instead of a mixed
  architecture center
- `candidate-submit.ts` is now honestly canonical-first in active routing
- `queries.ts` is still large, but the remaining size is split across
  different domains rather than one leftover skill-governance planner island
- the memory-path compatibility-retirement roadmap line is complete; what
  remains after this batch is intentional compatibility surface, not active
  family-era architecture

## What the functional batch changed

The functional batch landed three real slices:

1. reduced-profile self-improving capture reevaluation
2. bounded reduced-profile self-improving capture first tranche
3. learned-guidance advisory planning

It removed or reduced:

- docs-only uncertainty about whether self-improving capture could fit the
  shared substrate
- the risk of creating a second parallel candidate/review system for the first
  self-improving tranche
- the need to hide learned guidance inside vague prompt prose instead of a
  structural runtime seam

It did not replace:

- production rollout proof
- wider self-improving input coverage
- new family expansion

## What the rollout-proof batch changed

The rollout-proof batch landed three real slices:

1. bounded self-improving capture rollout proof
2. bounded learned-guidance advisory rollout proof
3. post-rollout memory reevaluation

It added:

- explicit rollout family-scope controls for self-improving capture and inline
  advisory planning
- explicit advisory suggestion-budget control
- structured self-improving outcome signals for created, blocked,
  replay-blocked, disabled, and failed outcomes
- structured advisory observability for surfaced, suppressed, filtered, and
  no-guidance outcomes, including approximate prompt cost

It concluded:

- self-improving capture should stay narrow for now
- learned-guidance advisory planning should stay narrow for now
- the repo is now ready for bounded off-production evidence collection, not
  automatic widening

## What the reminder-isolation and consolidation batch changed

This batch landed three real slices:

1. Main-session reminder isolation
2. docs and formatting memory consolidation
3. bounded rollout follow-through judgment

It added:

- structural isolation for internal-only cron / exec reminder turns so they no
  longer leak visible system payloads into Main chat
- a bounded project-rule semantic lane for explicit docs-localization policy
  phrasing with project scope
- a bounded generalized response-style lane for file-reference preferences
- response-style subject hinting for file-reference retrieval
- sharper project-rule routing for docs i18n / translation / `docs/zh-CN`
  queries

It concluded:

- explicit docs-localization and file-reference packet shapes are now strong
  enough for bounded promotion follow-through
- vague shorthand packet shapes should stay narrow and candidate-heavy
- self-improving capture and learned-guidance advisory planning still do not
  earn broader widening yet

## What the promotion and off-production rollout batch changed

This batch landed three real slices:

1. bounded promotion follow-through
2. bounded off-production rollout enablement
3. post-enablement memory judgment

It added:

- promotion-follow-through proof that explicit docs-localization project-rule
  packets review, promote, and retrieve cleanly
- promotion-follow-through proof that explicit file-reference response-style
  packets review, promote, and retrieve cleanly
- retrieval control-plane preference for stronger approved explicit memory over
  weaker nearby reviewable candidates within the same bounded subject cluster
- explicit `off-production` rollout-target gating for self-improving capture
- explicit `off-production` rollout-target gating for learned-guidance
  advisory planning

It concluded:

- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand docs/file packet shapes should still stay candidate-heavy
- self-improving capture and learned-guidance advisory planning remain
  default-off and narrow outside explicit off-production rollout

## What the automated eval and production-canary batch changed

This batch landed three real slices:

1. automated off-production evaluation
2. rollbackable production-canary controls
3. post-canary-readiness judgment

It added:

- `pnpm memory:rollout-eval` as a real automated bounded eval path
- explicit `production-canary` rollout-target control for self-improving
  capture
- explicit `production-canary` rollout-target control for learned-guidance
  advisory planning
- structured automated-eval evidence for retrieval quality,
  approved-versus-candidate ranking, duplicate / replay behavior,
  suppression / conflict behavior, provenance, and prompt-cost estimates

It concluded:

- production-canary control plumbing is now real and default-off
- the self-improving candidate-only and learned-guidance advisory-only seams
  are control-ready for a narrow rollbackable production canary
- automated eval still shows three weak spots:
  docs-localization explicit ranking / metadata incompleteness,
  file-reference under-retrieval, and native workflow guidance
  under-retrieval
- broad “memory is strong now” claims would still be dishonest

## What the Main advisory-routing diagnosis batch changed

This batch landed three real slices:

1. transcript-backed Main advisory-routing diagnosis
2. narrow routing / tool-availability fix
3. post-diagnosis advisory judgment

It added:

- explicit transcript evidence that recent Main production-canary
  workflow-preflight prompts were not calling
  `memory_learned_guidance_plan`
- a prompt/profile distinction between workflow-preflight asks and direct
  workflow lookup asks
- rollout-aligned learned-guidance tool registration so Main only sees
  `memory_learned_guidance_plan` when the seam is explicitly enabled

It concluded:

- the recent Main failure was a profile/tool-selection gap, not a rollout
  target bug
- the narrow fix is honest and landed
- Main advisory planning is still not proven in production-canary UX until a
  fresh transcript/tool run shows the advisory tool actually firing

## What the Main memory-tool bypass diagnosis batch changed

This batch landed three real slices:

1. transcript-backed Main memory-tool bypass diagnosis
2. narrow Main/OpenAI tool-choice follow-through
3. post-diagnosis memory-tool-selection judgment

It added:

- explicit transcript evidence that the latest Main canary rerun used no
  memory tool for most tested workflow-preflight and direct lookup prompts
- an explicit diagnosis that the rerun mixed two failures:
  learned-guidance was not actually enabled in the live canary config, and
  available retrieval tools were still being bypassed on `tool_choice: auto`
- Main-only OpenAI/Codex tool-choice steering for strong prompt classes:
  workflow-preflight pins `memory_learned_guidance_plan` when enabled, and
  strong direct lookup pins `memory_object_search_hybrid`

It concluded:

- the latest Main failure was not just advisory non-selection
- a narrow repo-owned fix exists in the Main/OpenAI request path
- Main memory-tool selection is still not proven in production-canary UX until
  a fresh transcript/tool rerun shows the right tools actually firing

## What the canonical local retirement deep review batch changed

This local-only batch landed five real slices:

1. capture-class-driven retrieval/ranking follow-through
2. correction-engine follow-through in tool submission
3. workflow detector/review-mode flattening
4. family-policy compatibility shrink
5. canonical write-stage multi-lane matching

It added:

- capture-class-first SQL ranking for workflow retrieval hints
- another shared correction-engine helper path for workflow and project-fact
  correction promotion
- capture-class-driven workflow review-mode resolution in
  `memory-ingestion-resolver.ts`
- removal of dead compatibility fields from canonical compatibility:
  `typedFastPaths` and `workflowLessonFamilies`
- real `anyOf` stage matching in `write-action-stages.ts`, which fixed a dead
  duplicate-protection stage
- generic auth/profile/credential query hinting for API-workaround retrieval
  instead of provider-name routing

It concluded:

- the main hidden rigidity after the prior tranche was a second layer of
  lesson-key and provider-wording runtime behavior in retrieval/ranking
- the OpenAI/Anthropic-specific workflow lessons now remain mostly as semantic
  catalog data rather than control-plane architecture
- `candidate-submit.ts`, `memory-ingestion-resolver.ts`, and
  `workflow-improvement-semantic.ts` still remain the next honest retirement
  targets

## What happens next

The next major move is no longer another substrate refactor phase or another
enablement-plumbing slice.

The next major move should be:

1. rerun a narrow rollbackable production-canary Main-session proof with the
   learned-guidance rollout target actually enabled
2. confirm from transcript/tool evidence that eligible workflow-preflight asks
   hit `memory_learned_guidance_plan` and strong direct lookup prompts hit
   `memory_object_search_hybrid`
3. keep watching the three current weak spots during that rerun:
   docs-localization ranking / metadata, file-reference retrieval, and native
   workflow guidance retrieval
4. only then make the post-canary judgment on what is ready to stay live, what
   still stays default-off, and what must not widen yet

## What remains intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## Read next

- `/memory-system/CURRENT_SLICE`
- `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
- `/memory-system/memory-roadmap`
- `/memory-system/specs/implementation-sequencing`
