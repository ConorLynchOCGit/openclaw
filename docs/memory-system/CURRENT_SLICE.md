# Current Slice

## Active slice

Main production-canary memory-tool bypass diagnosis and narrow Main tool-choice
follow-through

## Objective

Use the newly landed automated eval path, explicit production-canary controls,
and recent Main-session canary transcript evidence to decide why Main was
still bypassing memory tools entirely on workflow-preflight and direct lookup
asks after the advisory-routing fix, and whether a narrow Main-only tool-choice
fix is honest before any broader canary claim.

The current accepted answer is:

- both seams now have real rollout controls and structured observability
- both seams should stay narrow for now
- neither seam has earned broader authority or broader family coverage yet
- Main session no longer needs to leak internal reminder payloads into visible
  chat to support internal reminder execution
- explicit docs-localization rules and file-reference response-style packets
  now have bounded promotion follow-through evidence behind them
- the narrow self-improving and inline-advisory seams now require an explicit
  `off-production` or `production-canary` rollout target before they activate
- the repo now has a real automated eval runner for the narrow seams and
  promotion-eligible explicit packet shapes
- automated eval currently exposes three honest weak spots:
  - docs-localization explicit ranking / metadata is still incomplete in the
    mixed-corpus eval
  - file-reference explicit retrieval is still underpowered in that eval
  - native workflow guidance is still under-retrieved in that eval
- the next missing truth is not more rollout-control plumbing
- the latest Main production-canary rerun showed:
  - `memory_learned_guidance_plan`: 0 calls
  - `memory_object_search_hybrid`: 1 call
  - `memory_search`: 0 calls
  - most tested prompts using no memory tool at all
- the rerun also showed a mixed failure:
  - learned-guidance was not actually enabled in the live canary config, so
    `memory_learned_guidance_plan` was absent from Main
  - approved retrieval tools were present, but Main still often answered from
    direct model reasoning because the OpenAI/Codex path stayed on
    `tool_choice: auto`

This slice still does not answer production enablement by default.

It answers:

- whether Main should pin the advisory tool only for strong workflow-preflight
  asks when that tool is actually enabled
- whether Main should pin retrieval for strong direct repo-lookup asks instead
  of leaving those turns on `tool_choice: auto`
- whether the explicit docs/file and native-workflow weak spots observed in the
  automated eval remain acceptable watch items once the Main bypass is narrowed

The rollout still must avoid creating:

- a second memory authority
- silent policy mutation
- broader capture spray across families

## What just landed

### Slice 1 — Main-session reminder isolation

- internal-only cron / exec reminder execution no longer reuses the visible
  Main chat transcript path
- those reminder turns now isolate onto the heartbeat session instead of
  surfacing the system payload in Main
- ordinary user prompts and ordinary assistant replies remain visible in Main

### Slice 2 — docs and formatting memory consolidation

- explicit docs-localization policy phrasing now has a bounded project-rule
  semantic path when it includes clear project scope
- docs i18n / translation / `docs/zh-CN` rule queries now route more cleanly
  toward project-rule retrieval instead of falling back toward generic project
  facts
- file-reference response-style guidance now has a bounded generalized subject:
  `file references`
- file-reference retrieval now gets a subject-level ranking hint instead of
  relying only on loose text overlap

### Slice 3 — bounded rollout follow-through judgment

- explicit natural memory packet shapes are now strong enough to continue with
  bounded promotion follow-through
- vague shorthand packet shapes still have not earned broader normalization or
  broader promotion
- self-improving capture and learned-guidance advisory planning still stay
  narrow; this batch did not change that widening judgment

### Slice 4 — bounded promotion and off-production rollout enablement

- explicit docs-localization project-rule packets now promote and retrieve
  cleanly without being flattened into generic workflow memory
- explicit file-reference response-style packets now promote and retrieve
  cleanly without being flattened into project guidance
- within a shared subject cluster, stronger approved explicit memory now stays
  ahead of weaker nearby reviewable candidates during bounded retrieval
- self-improving capture and learned-guidance planning now stay default-off
  unless an explicit `off-production` rollout target is set
- mode alone no longer activates either seam

### Slice 5 — post-enablement judgment

- explicit docs-localization and file-reference packet shapes are now
  promotion-eligible under bounded follow-through
- vague shorthand docs/file variants still stay candidate-heavy
- self-improving capture and learned-guidance advisory planning still stay
  default-off and narrow outside explicit off-production rollout

### Slice 6 — automated eval and production-canary controls

- `pnpm memory:rollout-eval` now runs a real automated bounded eval over the
  promotion-eligible explicit docs/file packet shapes plus the narrow
  self-improving and learned-guidance seams
- the eval runner now supports explicit rollout targets:
  `off-production` and `production-canary`
- both narrow seams now distinguish `default-off`, `off-production`, and
  `production-canary` in rollout scope / observability instead of treating
  mode alone as activation
- automated eval currently reports three weak spots:
  docs-localization explicit ranking / metadata incompleteness,
  file-reference under-retrieval, and native workflow guidance under-retrieval
- production-canary controls are now real and default-off, but the current
  readiness judgment is still mixed

### Slice 7 — Main advisory routing diagnosis

- recent Main production-canary transcript evidence showed no
  `memory_learned_guidance_plan` calls for workflow-preflight prompts
- the durable-memory prompt/profile layer was steering workflow asks toward
  hybrid retrieval instead of teaching when to use learned-guidance advisory
  planning
- `memory_learned_guidance_plan` now only registers when an explicit
  `off-production` or `production-canary` rollout target actually enables the
  bounded seam
- the prompt/profile layer now distinguishes workflow-preflight asks from
  direct lookup asks:
  workflow-preflight can prefer learned-guidance advisory when the tool is
  truly available, while direct fact/rule retrieval stays retrieval-first
- this narrows the Main advisory adoption gap, but does not itself prove Main
  advisory behavior until a fresh production-canary transcript shows the tool
  firing

### Slice 8 — Main memory-tool bypass diagnosis

- the latest Main production-canary rerun showed a broader failure than
  advisory non-selection:
  workflow-preflight prompts and most direct lookup prompts bypassed memory
  tools entirely
- the live rerun was not actually advisory-enabled because the Main canary
  config did not expose `memory_learned_guidance_plan`
- retrieval tools such as `memory_object_search_hybrid` were present in Main,
  but the OpenAI/Codex path still left prompt classes on `tool_choice: auto`,
  so Main often answered from direct model reasoning instead of using available
  repo-local memory tools
- Main now has a narrow OpenAI/Codex tool-choice wrapper:
  - strong workflow-preflight prompts pin
    `memory_learned_guidance_plan` when that tool is available
  - strong direct workflow lookup prompts pin
    `memory_object_search_hybrid`
  - only the Main agent gets this steering
  - turns already inside a tool loop are left alone
- this lands an honest narrow fix, but Main memory-tool behavior is still not
  canary-proven until a fresh live transcript shows the right tools actually
  firing

## What is now strong enough for bounded promotion follow-through

- explicit docs-localization operating rules with clear project scope
- explicit file-reference response-style guidance
- already-strong commit / test workflow lessons

These are strong enough for bounded promotion follow-through, not automatic
widening.

## What remains intentionally narrow

- vague shorthand workflow memories
- vague shorthand docs-localization memories
- vague shorthand file-formatting memories
- broader self-improving family coverage
- broader learned-guidance advisory coverage

## What remains intentionally disabled

Still intentionally disabled:

- direct approval from self-improving outputs
- direct phrase-pattern approval from self-improving outputs
- direct procedure validation from self-improving outputs
- broader self-improving family spray
- background-job learned-guidance planning
- advisory planning that writes memory or executes actions

## What is now live but still bounded

- reduced-profile self-improving capture exists as a default-off,
  workflow-guidance-only, candidate-only seam
- learned-guidance advisory planning exists as a default-off, approved-only,
  inline-only workflow-guidance seam
- both seams now require an explicit `off-production` or
  `production-canary` rollout target before the bounded runtime path activates
- Main now only sees `memory_learned_guidance_plan` when that explicit rollout
  target is actually active
- Main now also has bounded tool-choice steering for strong memory-informed
  prompt classes on the OpenAI/Codex path
- both seams now expose explicit rollout scope and structured evaluation /
  observability fields in their runtime results
- automated eval now exists as a real repeatable proof surface:
  `pnpm memory:rollout-eval`
- Main-session internal reminders now execute without leaking their system
  payloads into visible Main chat
- explicit docs/file packet shapes now have tighter semantic and retrieval
  control-plane support
- explicit docs/file packet shapes now have bounded promotion follow-through
  proof under their intended families

Live rollout controls now include:

- explicit allowed lesson-family scope for self-improving capture
- explicit allowed lesson-family scope for learned-guidance advisory planning
- explicit default suggestion-budget control for inline advisory planning
- explicit `off-production` rollout-target gating for self-improving capture
- explicit `production-canary` rollout-target gating for self-improving
  capture
- explicit `off-production` rollout-target gating for learned-guidance
  advisory planning
- explicit `production-canary` rollout-target gating for learned-guidance
  advisory planning

Live rollout signals now include:

- self-improving outcome codes for created, blocked, replay-blocked, disabled,
  and failed decisions
- self-improving review-burden and duplicate-outcome signals
- advisory outcome codes for surfaced, suppressed, disabled, and no-guidance
  decisions
- advisory record counts, filtered-by-scope counts, and estimated prompt cost

These are live substrate capabilities, not production-wide enablement.

## What is not next

Still not next:

- new memory families by default
- broad self-improving family expansion
- advisory planning that bypasses approved retrieval
- autonomy or scheduler-driven execution from learned guidance

## What must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## The next main implementation sequence

The next main implementation sequence should now be:

1. rerun a narrow rollbackable production-canary Main-session proof with the
   learned-guidance rollout target actually enabled
2. confirm from transcript/tool evidence that:
   - eligible workflow-preflight asks now hit
     `memory_learned_guidance_plan`
   - strong direct lookup prompts now hit
     `memory_object_search_hybrid`
   - prompts outside those strong classes are not forcibly routed
3. keep watching the three current weak spots explicitly:
   docs-localization ranking / metadata,
   file-reference retrieval,
   and native workflow guidance retrieval
4. only then make the post-canary judgment on what is actually ready, what
   still stays narrow, and what still should not widen
5. cross-domain family expansion only after those rollout answers are clear

Reason:

- the Main-session leak is fixed structurally
- the strongest manual-UX-backed docs/file packet shapes now promote cleanly
  under their intended families
- the narrow self-improving and inline-advisory seams now have explicit
  default-off versus off-production versus production-canary activation
  boundaries
- automated eval now exists and already surfaces the honest weak spots that
  the canary needs to watch explicitly
- the remaining missing truth is production-runtime behavior under a narrow
  rollbackable canary, not missing architecture or missing enablement control
- widening vague packet classes before evidence exists would risk promoting the
  wrong memories for the wrong reasons
