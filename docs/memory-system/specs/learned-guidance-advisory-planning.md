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
- conflicting workflow guidance is suppressed instead of silently collapsed
- bounded proactive maintenance classes exist for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`

Not live today:

- broader approved learned-guidance coverage beyond the bounded workflow
  tranche
- learned guidance influencing proactive plan suggestions
- production enablement by default

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

The safest first proof is inline advisory planning during repo-operating asks,
not background execution.

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

## Open questions

- should the first learned-guidance advisory slice run only inline during
  active asks, or should it later feed the existing advisory background-job
  planner after inline behavior is proven?
