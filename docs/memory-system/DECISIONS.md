# Decisions

## Current active architectural decisions

This file records the currently active architecture decisions that govern the
memory roadmap after flattening batch v6, substrate support batch v1, and the
accepted post-v3 architecture review.

## 2026-04 — multi-memory capture is now required baseline behavior

Current accepted framing:

- one long turn may yield multiple distinct bounded candidates
- first-hit single-candidate transcript capture is no longer acceptable as the
  steady-state ingestion posture
- duplicate suppression and review safety still remain mandatory
- per-turn capture remains intentionally capped

## 2026-04 — the current family-heavy memory architecture is transitional

Current accepted framing:

- the six landed families were useful for getting bounded behavior live
- they are not the final durable ontology
- current family-specific tools, lesson keys, and retrieval hints should be
  treated as transitional adapters or derived views where possible

## 2026-04 — canonical storage converges on four kinds

Current accepted framing:

- the target durable storage model is:
  - `User`
  - `Feedback`
  - `Project`
  - `Reference`
- specialized workflow/style/procedure/rule surfaces should survive as facets,
  metadata, and derived planners rather than permanent top-level kinds
- migration should be adapter-first and rollbackable

## 2026-04 — canonical core lands before generic ingestion and retrieval cutover

Current accepted framing:

- canonicalization does not start with deleting family modules
- it starts with a shared canonical record/envelope, shared facet model, and
  explicit compatibility builders
- current family-owned seams may remain active temporarily, but they should now
  target the canonical core instead of inventing a new local substrate again
- generic ingestion and retrieval should build on that canonical core rather
  than inventing a second compatibility format

## 2026-04 — practical parity was enough to enter flattening, not enough to move on

Practical parity across the six landed families was accepted as sufficient to
start flattening.

It was not accepted as proof that:

- the substrate was already flat enough for reduced-profile self-improving
  capture
- the substrate was already flat enough for new memory families

## 2026-04 — the current docs were too optimistic after batch v3

The earlier roadmap/status/current-slice framing that reduced the remaining
work to one narrow closeout slice is no longer accepted.

The accepted review conclusion is that multiple more flatten/refactor slices
are still warranted before later phases.

## 2026-04 — preserve real family-policy differences

The substrate work must preserve:

- procedures as `suggestion_first` and direct-use only on clear ask
- project facts as explicit, scoped, and stricter than generic guidance
- response style as bounded reply-shaping memory rather than broad personality
  memory
- unmet needs as recommendation-only
- semantic routing as hybrid-first and family-gated
- phrase induction as family-eligible rather than universal

## 2026-04 — collapse accidental parallel systems before self-improving capture

The next substrate work must collapse accidental duplication across:

- transcript and tool-side ingestion
- retrieval intent and semantic routing
- application selection and suppression
- recurring-procedure subsystem shape
- correction-policy control flow
- proof-runner structure
- registry authority
- memory-family contract boundaries

## 2026-04 — application selection is partial and proofing is adapterized

Current accepted framing:

- the repo now has prompt-facing application selection with selected items,
  suppressed items, and rendering hints
- it is not yet the final retrieval-fed per-memory-item selection substrate
- proofing is now adapter-driven
- registry authority still remains before proof policy can be called fully
  centralized

## 2026-04 — registry authority cleanup is now landed

Current accepted framing:

- workflow-family mapping now derives from the registry
- phrase proof-family ownership now derives from the registry
- the registry is now honest enough to be called the main family policy control
  plane for the six current families
- adapters still remain the honest boundary for parser bodies and query bodies

## 2026-04 — reduced-profile self-improving capture waits for stronger substrate work

Before reduced-profile self-improving capture, the repo must land:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

Those blockers are now landed.

Reduced-profile self-improving capture still remains intentionally deferred
until the post-v6 reevaluation proves the stronger substrate can carry it
without creating new parallel systems.

## 2026-04 — new families wait for additional authority and scale cleanup

Before new memory families, the repo must also land:

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

Proof-runner adapterization, registry authority cleanup, and memory-family
contract / boundary cleanup are now landed.

## 2026-04 — the public family-policy SDK seam is now real

Current accepted framing:

- `src/plugin-sdk/memory-family-policy.ts` now owns the shared family policy
  contract directly
- `memory-core` no longer reaches that contract through a middleware
  implementation re-export
- later contract trimming may still happen, but the old boundary smell is no
  longer accepted as current state

## 2026-04 — post-v6 hardening scales through action stages, not family helpers

Current accepted framing:

- the next hardening tranche is not more core flattening
- it is also not a return to one helper per family as the scaling model
- request-path cost and prompt/token cost hardening remain shared-system work
- write-path decomposition should target finite shared action stages
- family variance should live in registry policy and bounded adapters unless a
  path is honestly structurally distinct

## 2026-04 — the pre-capture hardening tranche is now landed

Current accepted framing:

- request-path hardening is now live for shared semantic fallback work and
  pooled access in the touched direct callers
- prompt-facing durable-memory guidance is now intentionally compact and
  policy-shaped rather than a long static speech
- write-path orchestration now scales through explicit ordered stages in the
  touched submission, auto-capture, and proof seams
- reduced-profile self-improving capture reevaluation is now the next honest
  move, not more default substrate hardening

## 2026-04 — the first self-improving tranche is workflow-guidance-only

Current accepted framing:

- reduced-profile self-improving capture now lands through an explicit
  `selfImprovingCapture.mode = candidate-only` gate
- the first live tranche is bounded to workflow-guidance improvement candidates
- the seam remains candidate-only and provenance-explicit
- the first tranche must not write approved memory directly or bypass the
  shared review path

## 2026-04 — learned-guidance advisory planning is inline-only and approved-only

Current accepted framing:

- learned-guidance advisory planning now lands through an explicit
  `learnedGuidanceAdvisoryPlanning.mode = inline-only` gate
- the first live tranche reads only approved workflow guidance through the
  normal approved retrieval path
- it remains advisory-only, conflict-safe, and non-authoritative
- it must not enqueue work, execute actions, or silently redefine family
  policy

## 2026-04 — rollout proof is now the next honest move

Current accepted framing:

- the self-improving and learned-guidance implementation slices are now landed
- the next missing truth is rollout behavior, not shared substrate design
- the repo should not widen self-improving coverage or start new family work
  until rollout proof shows the bounded tranche is worth extending

## 2026-04 — rollout proof and reevaluation are now landed, but widening is not

Current accepted framing:

- self-improving capture now has explicit rollout family-scope control and
  structured outcome signals
- learned-guidance advisory planning now has explicit rollout family-scope
  control, bounded suggestion-budget control, and structured observability
- these rollout controls are enough to support bounded off-production evidence
  collection
- they are not themselves proof that either seam should widen now
- current accepted judgment is still:
  - self-improving capture stays narrow
  - learned-guidance advisory planning stays narrow

## 2026-04 — internal reminders must not leak into visible Main chat

Current accepted framing:

- internal-only cron / exec reminder execution is legitimate
- visible Main chat is not the right transcript surface for those internal
  reminder payloads
- the honest fix is typed/session-level isolation, not string-based hiding
- internal-only reminder turns should run on the isolated heartbeat session
  when they do not need user-visible delivery

## 2026-04 — explicit packet shapes can strengthen before vague ones widen

Current accepted framing:

- manual Main-session UX evidence showed that explicit natural wording works
  materially better than vague shorthand
- explicit docs-localization operating rules can now justify a bounded
  project-rule semantic lane
- explicit file-reference response-style guidance can now justify a bounded
  generalized response-style lane
- vague shorthand variants should remain candidate-heavy until stronger
  evidence exists
- widening should start from the strongest explicit packet shapes, not from the
  weakest paraphrases

## 2026-04 — explicit docs/file packet shapes are now promotion-eligible

Current accepted framing:

- explicit docs-localization project-rule packets now have enough bounded
  follow-through evidence to promote under their intended family
- explicit file-reference response-style packets now have enough bounded
  follow-through evidence to promote under their intended family
- stronger approved explicit memory should outrank weaker nearby reviewable
  variants within the same bounded subject cluster
- vague shorthand docs/file variants still stay candidate-heavy until
  off-production evidence says otherwise

## 2026-04 — rollout targets must stay explicit and separate

Current accepted framing:

- self-improving capture staying in `candidate-only` mode is not enough by
  itself to activate the seam
- learned-guidance advisory planning staying in `inline-only` mode is not
  enough by itself to activate the seam
- both seams now require an explicit `off-production` or
  `production-canary` rollout target before their bounded runtime paths
  activate
- default-off remains the honest default posture until real automated-eval and
  canary evidence exists

## 2026-04 — automated eval replaces assumed manual non-production UX

Current accepted framing:

- manual non-production UX is not a hard prerequisite for the next rollout
  step
- the repo now has a real automated eval runner instead:
  `pnpm memory:rollout-eval`
- automated eval is enough to decide whether canary plumbing is ready and
  which weak spots still need explicit watch items

## 2026-04 — production canary can be control-ready before all packet lanes are strong

Current accepted framing:

- the production-canary control path can be real and still default-off
- the self-improving candidate-only seam and learned-guidance advisory-only
  seam can be control-ready without claiming broad semantic robustness
- the current automated eval already shows three weak spots that remain honest
  reasons to keep the canary narrow:
  docs-localization ranking / metadata incompleteness,
  file-reference under-retrieval,
  and native workflow guidance under-retrieval

## 2026-04 — Main advisory adoption is a routing problem before it is a widening problem

Current accepted framing:

- recent Main production-canary transcript evidence showed
  `memory_learned_guidance_plan` was not being selected for workflow-preflight
  asks
- the primary failure was a prompt/profile tool-selection gap, not a
  rollout-target bug
- the durable-memory prompt layer should distinguish workflow-preflight asks
  from direct workflow lookup asks
- `memory_learned_guidance_plan` should only be visible to Main when an
  explicit `off-production` or `production-canary` rollout target actually
  enables the bounded seam
- landing that routing fix is not by itself proof that Main advisory planning
  is now canary-proven; a fresh transcript/tool rerun is still required

## 2026-04 — Main memory-tool bypass is a mixed enablement-plus-tool-choice problem

Current accepted framing:

- the latest Main production-canary rerun used no memory tool for most tested
  workflow-preflight and direct lookup prompts
- that rerun was not actually learned-guidance-enabled in live config, so
  `memory_learned_guidance_plan` was absent from Main
- available retrieval tools such as `memory_object_search_hybrid` were still
  being bypassed because the Main OpenAI/Codex path left those turns on
  `tool_choice: auto`
- the honest narrow fix is Main-only tool-choice steering, not broad prompt
  bloat and not global forced-memory behavior
- the steering must stay bounded:
  - workflow-preflight can pin `memory_learned_guidance_plan` only when that
    tool is actually available
  - strong direct workflow lookup can pin
    `memory_object_search_hybrid`
  - prompts already inside a tool loop must be left alone
- landing that steering fix is still not by itself proof that Main memory-tool
  behavior is canary-proven; a fresh live transcript/tool rerun is still
  required

## 2026-04 — should-fix-soon cleanup is real but secondary

The following work is accepted as already-landed near-term cleanup:

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

These improved proofability and rollout safety, but they did not replace the
primary blocker sequence above while it was still open.

One later bounded retrieval cleanup also landed in flattening batch v6:

- approved-vs-reviewable-candidate `get` / `list` / `basic` memory-object SQL
  scaffolding reduction
