# Generalized Lesson Auto-Review And Promotion

## Purpose / user problem

The first generalized lesson-learning slice can create normalized reviewed
workflow-lesson candidates without pre-registering lesson keys.

This spec defines the first repo-native path that converts broader reviewed
lesson candidates into durable approved lessons or bounded rejections without
depending on indefinite human review.

## Why this belongs in the memory system

This is the missing bridge between:

- broader candidate formation
- broader normalized lesson shapes
- actual durable learning that later retrieval can use

Without this step, generalized learning remains a candidate collector instead
of a system that can learn usefully from normal operation.

## Current live posture

Live today:

- broader repo-local workflow lessons can normalize into:
  - `lessonFamily = generalized_workflow_lesson`
  - `template = workflow_generalized_guidance`
  - normalized `subject`
  - `guidancePattern`
  - optional `recommendedAction`
  - optional `avoidAction`
  - optional `rationale`
- those broader lessons now enter `hold_for_more_evidence`
- duplicate restatements cluster onto the same candidate
- compatible repeated evidence can auto-promote without manual review as the
  normal path
- stale held clusters can auto-reject
- stronger newer conflicting clusters can supersede older approved generic
  lessons on the same scoped subject
- approved generic lessons can retrieve later through approved-only hybrid

Not live today:

- phrase induction for approved generic lessons
- broader project-rule learning on the same generic pipeline
- semantic fallback for generic lessons

## Non-goals

- autonomous execution from generalized lessons
- automatic promotion of blocked domains such as procurement, install,
  approval, or vetting
- candidate retrieval in normal user-facing behavior
- semantic retrieval broadening for generic lessons in the same slice
- silent mutation of policies, plans, or control files

## Architecture fit

This spec sits after:

- generalized lesson candidate formation
- bounded canonicalization
- duplicate suppression and clustering

It feeds:

- approved lesson retrieval through the normal approved-only hybrid path
- later phrase induction for approved generic lessons
- later bounded advisory planning from approved lessons

It must reuse:

- existing candidate ingress and candidate review substrate
- project scope rules
- duplicate handling
- audit metadata

It must not create a separate parallel promotion system.

## Domain model

### Input candidate class

The first auto-review slice operates only on candidates that already satisfy:

- `lessonFamily = generalized_workflow_lesson`
- `template = workflow_generalized_guidance`
- project-scoped provenance
- reviewable normalized lesson shape

### Candidate evidence cluster

Each candidate should be evaluated as a normalized evidence cluster, not as one
isolated transcript row.

The cluster key is the normalized tuple:

- project scope
- `lessonFamily`
- `template`
- normalized `subject`
- `guidancePattern`
- normalized `recommendedAction` when present
- normalized `avoidAction` when present

`rationale` may help compatibility checks, but it should not create a distinct
cluster when the main guidance tuple is otherwise identical.

### Auto-review outcomes

The v1 machine decision should resolve each eligible candidate cluster to one
of:

1. `approve`
2. `hold_for_more_evidence`
3. `reject`
4. `supersede_existing`

The decision may be persisted as review metadata inside the existing review
surface rather than as a new top-level table family, as long as auditability is
preserved.

## Eligibility rules

Only candidates are eligible when all of the following are true:

- the lesson is explicitly repo-local or environment-local
- the normalized subject is concrete enough to distinguish future retrieval
  scope
- the lesson has meaningful guidance content:
  - `recommendedAction`
  - or `avoidAction`
  - or both
- the lesson is guidance-only
- the lesson does not fall into blocked domains:
  - procurement
  - install
  - vetting
  - approval
  - external messaging
  - secret handling
  - policy overwrite

Ineligible candidates must resolve to `reject`, not indefinite hold.

## Approval thresholds

### Default v1 threshold

Approve only when all of the following are true:

1. the normalized shape is stable across at least two compatible evidence
   events
2. the evidence events are not exact duplicates of the same transcript write
3. there is no active contradiction for the same project-scoped subject
4. there is no stronger existing approved lesson that already covers the same
   normalized cluster
5. the lesson passes blocked-domain and likely-secret checks
6. the subject is specific enough that later hybrid retrieval can plausibly
   use it

### Compatibility threshold

Two evidence rows are compatible when:

- `guidancePattern` matches
- normalized `subject` matches after canonicalization
- normalized `recommendedAction` matches when present
- normalized `avoidAction` matches when present
- `rationale` is identical or absent, or differs only by additive explanatory
  detail

### Stronger evidence signal

The landed implementation counts one explicit repeated instructional
restatement from a later turn as the second compatible evidence event.

It does not require a different session in v1, but it does require a
different event id and the existing minimum-age gate on the held cluster.

## Hold rules

Resolve to `hold_for_more_evidence` when:

- the lesson shape is plausible but only one compatible evidence event exists
- the normalized subject is somewhat narrow but still likely useful
- there is mild uncertainty about whether the lesson is durable versus one-off
- the evidence is not contradictory, blocked, or obviously low quality

Held candidates must not linger forever.

### Hold expiration

The landed implementation defines bounded stale resolution:

- stale held clusters should auto-reject or auto-expire after a bounded window
- the audit trail should remain
- stale clusters should stop surfacing as active pending review work

The default product posture remains "bounded queue," not "background
graveyard."

## Rejection rules

Resolve to `reject` when any of the following are true:

- the content is vague operational chatter
- the normalized subject is too broad to guide future retrieval
- the candidate contains likely secret material
- the lesson falls into blocked autonomy or governance domains
- the candidate conflicts with a stronger already-approved lesson and does not
  justify supersede
- the cluster never gathers enough stable evidence before the stale window
  expires

## Supersede rules

Resolve to `supersede_existing` only when:

- an already-approved generalized lesson exists for the same scoped subject
- the new evidence cluster is incompatible with the existing approved lesson
- the new cluster has stronger or fresher compatible evidence than the old
  lesson
- the newer lesson still stays guidance-only and inside allowed domains

Supersede must create explicit lineage between:

- the older approved lesson
- the superseding approved lesson
- the review decision that caused the change

Automatic destructive deletion is not allowed.

The landed implementation records explicit `supersedes` lineage between the
older approved object and the newer approved object.

## Duplicate and clustering behavior

Auto-review must evaluate the cluster, not every raw candidate row
independently.

That means:

- duplicate restatements should increase evidence count
- they should not create multiple separate review decisions
- stale duplicates should age with the cluster, not as standalone backlog items

## Contradiction handling

Contradiction blocks approval by default.

Contradiction means:

- same project-scoped subject
- incompatible recommended or avoided action
- materially different trust target for the same scope

On contradiction:

- block `approve`
- prefer `hold_for_more_evidence` if the conflict is unresolved
- prefer `supersede_existing` only when the newer cluster clearly wins
- otherwise `reject` the weaker cluster

## Backlog-control rules

This system is explicitly meant to prevent human review backlog.

Required v1 controls:

- dedupe by normalized cluster
- bounded stale resolution
- auto-reject obviously weak or blocked candidates early
- no manual-review dependency for normal resolution of generic lessons

The operator should still be able to inspect decisions later, but the normal
product loop must resolve candidates without human intervention.

## Operator visibility and audit

Every auto-review decision should preserve:

- candidate ids and event ids considered
- normalized cluster key
- evidence count
- contradiction count
- resolution outcome
- rule or threshold bucket that drove the decision

Operators should be able to answer:

- why this lesson was approved
- why this lesson was rejected
- why this lesson is still waiting
- what older lesson it superseded

## Retrieval interaction

Only approved lessons produced by this auto-review path may shape later normal
retrieval and prompt behavior.

Held or rejected generic candidates must not shape user-facing behavior by
default.

This slice does not change retrieval policy by itself. It only broadens which
lessons can become approved inputs to the already-approved retrieval layer.

## Repair and user correction

User repair must outrank passive auto-review counts.

If a later conversational turn clearly says:

- this lesson is wrong
- stop using this lesson
- use X instead of Y now

that repair signal should feed the same normalized cluster system and may:

- block approval
- trigger supersede
- or reject a stale or wrong cluster

## Proof requirements

The first implementation slice for this spec must prove:

1. a broader generalized lesson can auto-promote without manual review
2. the lesson was not pre-registered as a hard-coded key
3. duplicate restatements cluster rather than spray new review work
4. one weak or vague generalized lesson is auto-rejected or expires cleanly
5. an approved lesson later retrieves through the normal approved-only hybrid
   path
6. no action-taking or candidate retrieval was broadened

## Rollout posture

- isolated proof first
- narrow production proof second
- cleanup-backed if the proof writes durable review state
- production should start with generalized workflow lessons only
- do not broaden to project-rule learning or unmet-need planning in the same
  rollout

## Risks / failure modes

- approval thresholds too weak create noisy durable lessons
- thresholds too strict recreate the manual-review bottleneck
- contradiction handling picks the wrong winner
- stale lessons linger because hold logic never resolves
- generic approved lessons increase retrieval clutter if subject normalization
  is weak

## Open questions

- should the first approval threshold require two evidence events, or should a
  narrower high-confidence single-evidence fast path exist for explicit
  imperative lessons?
- what stale window best balances evidence gathering against backlog hygiene
  for generalized lessons?
