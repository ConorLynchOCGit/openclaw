# Open Questions

## Active questions inside the stronger substrate plan

These are the remaining real open questions after the accepted post-v3 review.

They are narrower than the earlier roadmap questions because the high-level
sequence is now accepted.

1. For the full ingestion control plane, how much adapter logic should live in:
   - registry-declared typed policy
   - adapter modules
   - or both
2. For the application-selection layer, should suppression reason codes be:
   - shared across families
   - or shared with a small family-specific extension vocabulary
3. For retrieval/routing control-plane flattening, how much approved,
   candidate, and validated-procedure planning can honestly converge without
   obscuring real storage differences?
4. For registry authority cleanup, which policy surfaces should be generated
   from registry definitions versus hand-authored adapter declarations?
5. For memory-family contract boundary cleanup, what should become the
   core-owned/shared memory-family contract without over-exposing middleware
   internals?

## Should-fix-soon questions

1. What exact unit seams will reduce the most integration-test pressure first:
   - retrieval intent
   - application selection
   - semantic fallback
2. How much approved-versus-candidate SQL scaffolding can be shared before the
   retrieval/routing control plane lands?
3. Which remaining stringly control-flow points should be upgraded first to
   reduce rollout risk most cheaply?

## Later-phase questions that remain intentionally later

These stay open, but are not part of the current docs/spec replanning slice:

1. What exact bounded input set should the first reduced-profile
   self-improving capture source consume once registry authority cleanup is
   landed strongly enough?
2. What exact advisory posture should learned-guidance planning take once both
   the stronger substrate work and reduced-profile self-improving capture are
   live?
3. Which cross-domain family should land first after the stronger substrate
   work, self-improving capture, and advisory planning?
