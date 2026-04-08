# Learned Guidance Advisory Planning

## Purpose / user problem

Once approved lessons become broader and more reliable, the next user-visible
value is not immediate autonomy. It is bounded advisory planning that can
notice:

- a relevant remembered lesson before work goes wrong
- a likely mistake to avoid
- a preferred repo-local path for the current scope

This spec defines the later advisory-only planning posture for approved learned
guidance.

## Why this belongs in the memory system

Proactivity should not be built as a separate intelligence system.

It should be the downstream use of already-approved, already-retrievable,
already-auditable learned guidance.

## Current live posture

Live today:

- approved lessons can influence retrieval and replies in bounded families
- an inline learned-guidance advisory planner now exists behind
  `learnedGuidanceAdvisoryPlanning.mode = inline-only`
- the first live tranche is approved-only, workflow-guidance-only, and
  advisory-only
- it now has explicit rollout family-scope control through
  `learnedGuidanceAdvisoryPlanning.allowedLessonFamilies`
- it now has an explicit bounded default suggestion budget through
  `learnedGuidanceAdvisoryPlanning.defaultMaxSuggestions`
- conflicting workflow guidance is suppressed instead of silently collapsed
- structured advisory observability now exposes surfaced, suppressed,
  filtered, disabled, and no-guidance outcomes, including approximate prompt
  cost
- Main prompt/profile guidance now distinguishes workflow-preflight asks from
  direct workflow lookup asks when the learned-guidance tool is actually
  available
- `memory_learned_guidance_plan` now only registers when an explicit
  `off-production` or `production-canary` rollout target enables the bounded
  seam

Not live today:

- broader approved learned-guidance coverage beyond the bounded workflow
  tranche
- learned guidance influencing proactive plan suggestions
- production enablement by default
- automatic widening beyond the current bounded rollout scope
- Main production-canary transcript proof that eligible workflow-preflight
  prompts now actually call the advisory planner after the routing fix

## Non-goals

- direct autonomous execution from learned lessons
- silent plan mutation
- tool invocation or external follow-through from generic learned guidance
- candidate-driven proactivity
- install, approval, procurement, or messaging automation from learned lessons

## Preconditions

This phase must come after all of the following are real:

1. generalized lesson auto-review is stable
2. approved generic lesson retrieval/application is stable
3. phrase induction has improved matching for the relevant family when needed
4. repair and supersede behavior is predictable enough that stale lessons do
   not stay active invisibly

## Domain model

### Advisory learned-guidance signal

An advisory learned-guidance signal is an ephemeral planning hint derived from:

- an approved lesson
- the current task or operating context
- explicit project scope

It is not a new durable memory object by default.

### Advisory output shape

A bounded advisory output should include:

- source approved lesson id
- scope
- why the lesson is relevant now
- suggested action or caution
- confidence or priority

## Allowed use cases

The first advisory planning slice may support only:

- preflight reminders
- "use X instead of Y here" suggestions
- "trust X for this scope" reminders
- "avoid Y here" warnings

It should surface them as guidance, not commands.

## Retrieval and application rule

Only approved lessons are eligible.

Candidate, held, rejected, or expired lessons must not influence advisory
planning.

The advisory planner should read through the same approved retrieval layer used
for normal prompt application, not a hidden special store.

## Prompt/application posture

The first advisory posture should be:

- suggestion-first
- easy to ignore
- attributable to one or more approved lessons

It may say:

- "remembered guidance for this repo suggests ..."

It must not say or imply:

- "I already changed the plan because of this lesson"
- "I will do this automatically from now on"

## Conflict handling

If multiple approved lessons compete:

- prefer the most specific project-scoped lesson
- prefer explicit supersede lineage
- otherwise omit or ask a clarification rather than surfacing contradictory
  guidance as one recommendation

## Safety boundary

The first learned-guidance advisory planner must not:

- enqueue jobs
- invoke `memory_proactive_execute`
- create review rows
- create install or approval artifacts
- send external messages

This is a read-and-suggest layer only.

## Rollout posture

- off-production first
- narrow to one advisory use case
- proof with explicit attribution
- no shared background scheduling requirement in the first slice
- explicit family-scope and suggestion-budget controls
- explicit `off-production` / `production-canary` rollout-target control
- observability strong enough to judge usefulness, suppression, and prompt
  cost

The safest first proof is inline advisory planning during repo-operating asks,
not background execution.

That rollout-proof slice is now landed.

Recent Main production-canary transcript evidence also showed that workflow-
preflight asks were initially falling back to retrieval/search instead of the
advisory planner.

The current accepted follow-through is:

- keep the seam bounded and rollout-gated
- make the learned-guidance tool visible only when the bounded seam is
  explicitly enabled
- teach Main to prefer learned-guidance planning only for workflow-preflight
  asks that fit the current advisory slice
- keep direct lookup asks retrieval-first
- require a fresh Main transcript/tool rerun before claiming the advisory seam
  is proven in production-canary UX

The current accepted reevaluation result is still:

- stay narrow
- keep the planner default-off
- require an explicit `off-production` or `production-canary` rollout target
  before activation
- use automated eval first, then gather rollbackable production-canary
  evidence before widening
- keep relying on approved strong packet shapes instead of widening vague
  shorthand guidance automatically

## Proof requirements

The first implementation slice for this spec must prove:

1. an approved learned lesson can surface as advisory guidance in a later task
2. the advisory remains guidance-only
3. an irrelevant approved lesson does not create advisory noise
4. conflicting lessons do not silently collapse into one wrong recommendation
5. no new action-taking path appears

## Risks / failure modes

- advice feels like hidden policy instead of remembered guidance
- too many advisory reminders create prompt clutter
- operators assume advisory planning implies execution authority
- scoped workflow guidance still costs too many prompt tokens under repeated
  inline use

## Open questions

- what off-production evidence threshold should justify widening beyond the
  current workflow-guidance advisory slice?
- is the current prompt-cost observability sufficient, or does later rollout
  need one thinner runtime token-cost measurement surface?
- should the next bounded enablement focus first on the explicit docs/file
  packet shapes that now retrieve more coherently after consolidation?
