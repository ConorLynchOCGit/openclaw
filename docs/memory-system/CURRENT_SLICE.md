# Current Slice

## Active slice

Reviewed phrase induction for approved generic lessons

## Objective

Reduce future misses for approved generic workflow lessons by turning repeated
approved phrasing into reviewed deterministic trigger expansions.

The previous slice just landed:

- generalized workflow-lesson auto-review and promotion
- bounded machine resolution into:
  - `approve`
  - `hold_for_more_evidence`
  - `reject`
  - `supersede_existing`
- duplicate clustering and stale-held rejection
- approved durable lesson retrieval through the existing hybrid-first path
  without new per-lesson routers
- explicit proof that a non-keyed lesson can become approved without manual
  review in both isolated and narrow production proof

## Required work

1. Propose reviewed deterministic trigger phrases from approved generic
   lessons.
2. Keep approved-generic phrase induction scoped to the same family and
   approved-only retrieval posture.
3. Preserve hybrid-first retrieval as the main path while reducing misses from
   messy recurring phrasing.
4. Keep phrase induction auditable and bounded instead of turning it into a
   hidden second semantic detector.
5. Prove that approved generic lessons become easier to match later without
   broadening into generic semantic routing.

## Out of scope

- broader project-rule learning
- unmet-need planning
- generic semantic fallback for generalized lessons
- autonomous remediation or silent plan mutation
- production pairing/auth changes

## Acceptance criteria

- approved generalized workflow lessons can seed reviewed deterministic phrase
  proposals
- approved generic lessons become easier to match later without per-lesson
  router growth
- phrase induction remains reviewable, bounded, and guidance-only
- the older keyed lessons and the new generic path stay part of the same
  layered workflow-learning system

## Notes

The post-pivot pipeline now has its first closed supervised-learning loop for
generic workflow guidance:

1. generalized lesson capture
2. generalized lesson auto-review and promotion
3. phrase induction for approved generic lessons
4. generic retrieval/application expansion
5. broader project-rule and unmet-need families on the same pipeline
6. reduced-profile self-improving capture as another candidate source
7. later advisory planning from approved learned lessons

The next implementation slice should be:

- reviewed phrase induction for approved generic lessons
