# Current Slice

## Active slice

Generalized lesson auto-review and promotion v1

Ready to start after the architecture/spec alignment pass

## Objective

Convert the first generalized workflow-guidance path from a review collector
into a real supervised learning loop.

This next slice should land:

- auto-review for eligible generalized workflow-lesson candidates
- bounded machine resolution into:
  - `approve`
  - `hold_for_more_evidence`
  - `reject`
  - `supersede_existing`
- duplicate and stale-review backlog control for broader reviewed lessons
- approved durable lesson retrieval through the existing hybrid-first path
  without new per-lesson routers
- explicit proof that a non-keyed lesson can become approved without manual
  review

## Required work

1. Resolve generalized workflow lessons without depending on manual review.
2. Define stable evidence thresholds for auto-approval, hold, reject, and
   supersede.
3. Keep broader lessons guidance-only and approved-only in later behavior.
4. Reuse the existing hybrid-first retrieval path instead of broadening
   semantic routing generically.
5. Prove both positive promotion and bounded no-backlog rejection behavior
   through the repo-owned proof runner.

## Out of scope

- broader project-rule learning
- unmet-need planning
- phrase induction runtime changes
- semantic fallback for generalized lessons
- autonomous remediation or silent plan mutation
- production pairing/auth changes

## Acceptance criteria

- a new repo-local workflow lesson can become approved without a pre-registered
  lesson key and without manual review
- broader reviewed lessons resolve through bounded machine outcomes instead of
  an indefinite review pile
- duplicate restatements cluster onto one lesson decision rather than creating
  review spray
- stale weak lessons resolve cleanly instead of lingering
- approved generalized workflow lessons still retrieve later through the normal
  approved-only hybrid path

## Notes

The roadmap pivot is no longer just "capture broader lessons." It is now one
staged supervised-learning pipeline:

1. generalized lesson capture
2. generalized lesson auto-review and promotion
3. phrase induction for approved generic lessons
4. generic retrieval/application expansion
5. broader project-rule and unmet-need families on the same pipeline
6. reduced-profile self-improving capture as another candidate source
7. later advisory planning from approved learned lessons

The next implementation slice after this docs/spec pass should be:

- generalized lesson auto-review and promotion v1
