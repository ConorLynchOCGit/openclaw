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
- approved-over-candidate cluster preference for bounded retrieval of stronger
  explicit docs/file packet shapes
- rollout-aligned registration for `memory_learned_guidance_plan`
- prompt/profile routing that distinguishes workflow-preflight advisory asks
  from direct workflow lookup asks
- Main-only OpenAI/Codex tool-choice steering for strong workflow-preflight
  and direct repo-lookup prompt classes

## What is live but still bounded

The newly landed functional surfaces are intentionally bounded:

- `selfImprovingCapture.mode = candidate-only`
- `learnedGuidanceAdvisoryPlanning.mode = inline-only`

Current live bounds:

- self-improving capture is workflow-guidance-only
- self-improving capture is candidate-only
- self-improving capture has no direct approval authority
- self-improving capture now has explicit allowed lesson-family rollout scope
- self-improving capture now also requires an explicit `off-production` or
  `production-canary` rollout target before it activates
- learned-guidance planning reads approved retrieval only
- learned-guidance planning is inline-only and advisory-only
- learned-guidance planning suppresses conflicting guidance instead of guessing
- learned-guidance planning now has explicit allowed lesson-family scope and a
  bounded default suggestion budget
- learned-guidance planning now also requires an explicit `off-production` or
  `production-canary` rollout target before it activates

## What is still not live by default

Still not live by default:

- production-enabled reduced-profile self-improving capture
- production-enabled learned-guidance advisory planning
- broader self-improving family coverage
- learned-guidance planning that feeds proactive execution or scheduling
- new cross-domain memory families

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
