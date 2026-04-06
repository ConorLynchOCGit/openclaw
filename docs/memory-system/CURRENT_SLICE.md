# Current Slice

## Active slice

Environment-constraint UX v1

## Objective

Land the first bounded environment-constraint memory slice so repeated host
and runtime constraints feel materially useful later without broadening into
autonomous remediation, noisy freeform note capture, or dead candidate
backlog.

This slice is about:

- preserving the already-landed response-style, project-memory, and
  recurring-procedure families
- landing one bounded repeated environment-constraint family inside workflow
  memory
- repeated environment constraints entering candidate confirmation instead of
  dead manual backlog
- later repo-operating asks surfacing approved environment constraints as
  bounded guidance
- preserving guidance-only behavior with no action-taking or silent plan
  mutation
- isolated proof plus narrow production proof
- updating the canonical memory docs to reflect what is now live

## Required work

1. Land one bounded workflow-improvement subject family:
   - repeated environment constraints for:
     - Python command unavailable on this host or environment
     - gateway `POST /tools/invoke` forbidden in this environment
2. Keep the locked v1 posture concrete:
   - first-seen supported lessons do not become approved memory by default
   - later confirming evidence can auto-promote
   - approved memories surface as guidance only
   - no action-taking or silent plan mutation
3. Preserve the already-landed behavior of the other memory families.
4. Run isolated proof and narrow production proof.
5. Update:

- `docs/memory-system/STATUS.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/specs/workflow-improvement-memory.md`
- `docs/memory-system/PRODUCTION_ENVIRONMENT_CONSTRAINT_UX_REPORT.md`

## Out of scope

- broader workflow-improvement memory beyond the supported environment
  constraints and tool gotchas
- repeated API failure workaround memory
- autonomous remediation or direct operational execution
- silent background application of stored procedures
- unmet-need planning
- phrase induction as live behavior
- self-improving capture enablement
- UI memory inspection surfaces
- production pairing/auth changes
- procurement, vetting, approval, or install automation

## Acceptance criteria

- repeated supported environment constraints can enter pending confirmation
- later confirming evidence can auto-promote them without manual review
- later repo-operating asks can retrieve the right approved environment
  constraint as bounded guidance
- weak ambiguous environment phrasing does not become durable write noise on
  the transcript assist seam
- duplicate suppression remains intact
- no action-taking or automation is introduced
- isolated proof and narrow production proof both exist
- canonical docs reflect the live boundary accurately

## Notes

This slice is now landed for its intended scope.

The next UX-focused memory slice has not been chosen yet.
