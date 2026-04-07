# Unmet-Need Planning

## Purpose / user problem

When the same capability gap appears repeatedly, the system should remember the
need and surface it as recommendation-only planning instead of silently
forgetting it or jumping to installation.

## Why this belongs in the memory system

Repeated unmet needs are durable planning information and belong in the memory
system, but only as bounded recommendation artifacts.

## Current live posture

Live today:

- the first bounded unmet-need family now reuses the generalized learning
  pipeline instead of a bespoke planning queue
- the landed family is:
  - `lessonFamily = generalized_unmet_need`
  - `template = unmet_need_recommendation`
  - `needCategory = missing_workflow_support`
- capture accepts explicit named-project statements such as:
  - `For project Atlas, we need X for Y`
  - `For project Atlas, we're missing X for Y`
- the first compatible evidence enters `hold_for_more_evidence`
- later compatible evidence can auto-promote through the existing review and
  promotion substrate
- approved unmet-need artifacts retrieve through approved-only hybrid
- application remains recommendation-only

Not live today:

- procurement, install, vetting, or approval automation
- broader unmet-need families beyond named-project missing workflow support
- direct handoff into `skill_candidates`
- proactive planning from approved unmet-need artifacts

## Non-goals

- automatic procurement
- automatic approval
- automatic installation
- direct capability self-expansion
- candidate retrieval in normal user-facing behavior

## Architecture fit

This feature now fits inside the same post-pivot supervised-learning pipeline
as:

- generalized workflow guidance
- project-rule learning
- generic auto-review
- approved-only hybrid retrieval

It intentionally does not create:

- a parallel planning queue
- a separate approval engine
- a hidden procurement/install path

## Domain model

### Landed v1 artifact

The landed unmet-need artifact shape is:

- `lessonFamily = generalized_unmet_need`
- `template = unmet_need_recommendation`
- `captureClass = unmet_need_recommendation`
- `needCategory = missing_workflow_support`
- project scope
- normalized subject
- normalized needed capability
- recommendation-only metadata

### What v1 means by unmet need

The first family is intentionally narrow:

- explicit named-project missing workflow support

Examples:

- missing template
- missing checklist
- missing report shape
- missing evidence format

It does not yet include:

- procurement recommendation
- install recommendation
- plugin adoption recommendation
- generic tool absence outside the named-project workflow-support family

### What is not an unmet need

Do not treat these as unmet-need artifacts:

- ordinary workflow guidance
- project operating rules
- one-off complaints
- project facts
- blocked procurement or approval asks

## Candidate formation and normalization

Accept when all of the following are true:

- the statement explicitly names a project
- it expresses a missing capability or missing workflow support
- normalization can derive:
  - project scope
  - subject
  - needed capability
- the content stays recommendation-only

Ignore when:

- the statement is vague venting
- the scope is missing
- the subject is too broad to reuse later
- the text drifts into blocked governance or autonomy domains
- the content appears to include likely secret material

The landed v1 cluster key uses:

- normalized project scope
- `lessonFamily`
- `template`
- normalized subject
- normalized needed capability

The landed v1 subject key intentionally also includes normalized needed
capability so multiple distinct missing capabilities can coexist under the same
broader project workflow area instead of superseding each other accidentally.

## Candidate vs approved behavior

Unmet needs do not create a passive manual candidate queue.

The landed posture is:

1. first compatible evidence creates a held cluster
2. later compatible evidence can auto-promote it
3. stale weak clusters reject instead of lingering
4. approved artifacts become visible only through approved-only retrieval

This family reuses the same anti-backlog rule as the other generalized lesson
families:

- no indefinite manual queue
- bounded auto-resolution into hold, approve, or reject

## Auto-review posture

The landed v1 outcomes are:

- `hold_for_more_evidence`
- `approve`
- `reject`

`supersede_existing` remains rare for this family in v1 because the subject key
is capability-granular. That is intentional so distinct missing capabilities do
not overwrite each other.

Approval threshold:

- two compatible evidence events
- no blocked-domain or secret failure
- no duplicate-event reuse
- same normalized project scope
- same normalized subject
- same normalized needed capability

## Retrieval and application posture

Approved unmet-need artifacts reuse the same approved-only hybrid retrieval
path as the other generalized families.

The landed ranking boosts are:

- project-scope overlap
- subject overlap
- needed-capability overlap

The prompt layer now instructs the model to query this family for asks like:

- what a named project is still missing
- what a named project still needs
- what support a named project should have next

Application stays recommendation-only:

- mention the remembered missing capability when directly relevant
- do not trigger procurement, install, approval, or remediation

## Provenance / metadata requirements

Record:

- unmet-need category
- project scope
- subject
- needed capability
- evidence count
- auto-review outcome
- recommendation-only posture

## Ambiguity / abstain / clarify rules

- one isolated complaint does not become a durable unmet-need artifact
- vague roughness or frustration statements should be ignored
- if the missing capability is not specific enough to reuse later, ignore it

## User repair / supersede / forgetting implications

The landed v1 posture is conservative:

- users or operators can still repair or supersede through the normal memory
  correction or review substrate
- automatic unmet-need supersede is intentionally limited in v1
- later slices may add stronger resolved/stale handling once broader planning
  behavior exists

## Observability / metrics / audit requirements

Track:

- unmet-need artifact volume
- held-cluster volume
- approval rate
- rejection rate
- retrieval matches on scope, subject, and capability fields

## Evaluation / proof requirements

The landed slice had to prove:

1. repeated unmet needs create recommendation-only artifacts
2. no automatic install/procurement occurs
3. vague unmet-need chatter can be explicitly proven as ignored
4. approved unmet-need artifacts retrieve through approved-only hybrid

## Rollout posture

- isolated proof first
- narrow production proof second
- recommendation-only posture only
- no governance-family mutation

## Risks / failure modes

- single noisy complaint becomes a durable recommendation
- recommendation artifacts leak into direct execution
- multiple distinct missing capabilities collapse into one subject
- broader planning work gets smuggled into this family too early

## Open questions

- when later advisory planning is added, should approved unmet-need artifacts
  feed a lightweight planning surface directly, or remain purely retrieval
  inputs first?
