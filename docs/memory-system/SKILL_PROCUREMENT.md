# Skill Procurement And Vetting

## Purpose

This document defines the repo-native procurement and vetting workflow for
third-party skills used by the memory-system effort.

It exists so external skills can be evaluated as bounded accelerators without
displacing the repo's existing memory architecture or relying on ad hoc chat
judgment.

## Scope

This workflow applies to:

- ClawHub skills
- GitHub or imported skills
- any externally sourced skill considered for the memory-system build

This workflow does not install skills automatically.

## Core policy

Skill Vetter is the first mandatory approval gate before any third-party skill
is treated as approved for normal use.

That requirement applies to:

- ClawHub skills
- GitHub or imported skills
- any other externally sourced skill

No third-party skill reaches normal approval without recorded Skill Vetter
findings.

## Authority posture

Third-party skills are accelerators only.

They do not replace:

- the repo's existing memory architecture
- `extensions/memory-core`
- `extensions/memory-lancedb`
- the custom middleware design under `extensions/memory-middleware`

Until the custom middleware is implemented, the existing repo memory
architecture remains authoritative.

## Standard lifecycle

Every external skill under consideration should move through these states:

1. `discovered`
2. `under_review`
3. `vetted`
4. `approved_limited`
5. `approved_normal`
6. `rejected`
7. `quarantined`

### `discovered`

Meaning:

- the skill has been identified as potentially useful
- no approval or installation implication exists yet

### `under_review`

Meaning:

- procurement review has started
- Skill Vetter review is required and may still be incomplete

### `vetted`

Meaning:

- the minimum vetting output exists
- the skill has enough documented review to support an approval decision

### `approved_limited`

Meaning:

- the skill may be used only in bounded, explicitly constrained evaluation
- it is not approved for normal use

### `approved_normal`

Meaning:

- the skill has passed Skill Vetter review
- blockers are resolved
- the skill is approved for normal use within the documented scope

### `rejected`

Meaning:

- the skill is not acceptable for use
- it should not be installed or promoted further

### `quarantined`

Meaning:

- the skill has unresolved risk, suspicious behavior, or unclear provenance
- it should be treated as blocked pending further investigation

## Minimum required vetting outputs

Every reviewed third-party skill must produce a written record containing:

- `source`
- `scope`
- `permissions_risk`
- `suspicious_patterns`
- `operational_fit`
- `approval_recommendation`

### `source`

Capture:

- where the skill came from
- publisher or maintainer identity if known
- version or revision being evaluated
- import path or marketplace reference

### `scope`

Capture:

- what the skill claims to do
- intended usage boundaries
- whether it overlaps with existing repo-native capabilities

### `permissions_risk`

Capture:

- required permissions
- external access expectations
- write, network, secret, or execution risk
- whether the requested capability is compatible with current policy posture

### `suspicious_patterns`

Capture:

- red flags
- unclear provenance
- hidden external calls
- unexpected install behavior
- autonomy or persistence concerns

### `operational_fit`

Capture:

- whether the skill fits the memory-system roadmap
- whether it conflicts with existing memory architecture
- whether it should remain limited even if technically acceptable

### `approval_recommendation`

Capture:

- proposed lifecycle state
- install recommendation or explicit no-install recommendation
- blockers that must be cleared before any promotion

## Required review criteria

At minimum, procurement review must answer:

1. Is the source trustworthy enough to continue review?
2. Does the skill overlap with or attempt to replace repo-native memory
   architecture?
3. Does the skill require permissions or behavior outside current policy?
4. Are there suspicious or unclear implementation patterns?
5. Is the skill operationally useful for the current roadmap?
6. Should the skill be rejected, quarantined, approved for limited use, or
   approved for normal use?

## Install blockers

A third-party skill must not be installed or treated as approved for normal use
if any of the following are true:

- Skill Vetter review has not been completed
- the minimum vetting outputs are missing
- the approval recommendation is not recorded
- the skill attempts to replace the repo's existing memory architecture
- unresolved red flags remain
- required permissions are incompatible with current policy posture
- the skill is still only `discovered`, `under_review`, `rejected`, or
  `quarantined`
- the skill is only `approved_limited` and the intended use exceeds that scope

## Where findings should be recorded

Canonical procurement findings should be recorded in:

- `docs/memory-system/SKILL_PROCUREMENT.md` for the workflow and approval policy
- `docs/memory-system/STATUS.md` for current slice progress and implementation
  posture
- `docs/memory-system/DECISIONS.md` for stable policy decisions
- `docs/memory-system/OPEN_QUESTIONS.md` for unresolved blockers or approval
  questions

Skill-specific evaluation notes can later be added in a dedicated memory-system
subtree if the review volume justifies it, but this workflow document remains
the canonical policy source.

## Internal handoff bridge

Bounded internal `skill_candidates` created by the memory middleware may be
prepared for procurement using the advisory-only tool:

- `memory_skill_candidate_procurement_plan`

That tool does not invoke Skill Vetter or install skills.

Its role is only to prepare structured handoff context aligned to the minimum
procurement fields:

- `source`
- `scope`
- `permissions_risk`
- `suspicious_patterns`
- `operational_fit`
- `approval_recommendation`

Any later vetting or install slice must still follow the documented lifecycle,
mandatory Skill Vetter gate, and install blockers in this document.

The bounded proactive planning surface:

- `memory_proactive_plan`

may point out that a skill candidate needs governance follow-up, but it does
not invoke Skill Vetter, create procurement records, change approval state, or
install anything.

The bounded proactive execution surface:

- `memory_proactive_execute`

does not execute any procurement, vetting, approval, or install follow-up.
In this slice it may:

- execute the low-risk `run_drift_check` class by delegating to the existing
  bounded drift-check executor
- turn skill-governance follow-up into conversational prompts that ask the
  user whether the next bounded governance-planning step should be inspected

It still does not invoke Skill Vetter, create procurement records, mutate
approval state, or install anything.

The bounded background-job scheduling surfaces:

- `memory_background_job_enqueue`
- `memory_background_job_run_next`

also do not schedule or run any procurement, vetting, approval, or install
workflow. In this slice they may handle only:

- `proactive_plan`
- `proactive_execute_run_drift_check`

Bounded internal procurement records may now also be persisted using:

- `memory_skill_candidate_procurement_record_create`

That write path remains internal-only. It does not invoke Skill Vetter,
advance approval state, or install skills. Its purpose is only to persist the
structured handoff package so a later human-reviewed procurement slice can pick
it up.

That bounded procurement-record path has now also been proven in the current
real non-production rollout posture alongside submit, review, promotion,
procedure validation, and skill-candidate creation, while actual Skill
Vetter invocation, vetting-result recording, approval-state mutation,
installation, and self-improving capture remained disabled. Proactive
execution may now surface conversational governance prompts, but it still does
not perform those external or manual-governance steps.

Bounded manual Skill Vetter handoff preparation and bounded manual
vetting-result recording have now also been proven in the current real
non-production rollout posture. These surfaces remain manual and internal
only: they do not invoke Skill Vetter automatically, they do not advance
approval state, and they do not prepare or trigger installation. The new
conversational governance prompts are only a user-facing follow-up bridge into
the existing bounded planning surfaces, not an automation bypass around those
external checkpoints.

Bounded internal skill candidates with procurement records may now also be
prepared for manual Skill Vetter review using:

- `memory_skill_candidate_skill_vetter_handoff`

That planning path remains advisory-only. It does not invoke Skill Vetter,
advance approval state, or install skills. Its purpose is only to return the
structured manual handoff package, required gates, and install guardrails that
a later human-reviewed Skill Vetter slice would need.

Bounded internal skill candidates with procurement records and manual handoff
eligibility may now also persist one internal vetting-result record using:

- `memory_skill_candidate_vetting_result_record`

That write path remains internal-only. It does not invoke Skill Vetter,
advance approval state, or install skills. Its purpose is only to persist the
manual review decision and structured vetting result fields so a later
human-reviewed lifecycle slice can consume them.

Bounded internal skill candidates with procurement records and recorded manual
vetting results may now also be inspected for advisory approval or install
planning using:

- `memory_skill_candidate_approval_plan`

That planning path remains read-only. It does not invoke Skill Vetter, mutate
approval state, or install skills. Its purpose is only to return bounded
limited-use, normal-use, internal-only, or blocked outcomes plus required
gates, install guardrails, and remaining blockers for a later explicit
lifecycle slice.

That bounded approval-planning path has now also been proven in the current
real non-production rollout posture alongside submit, review, promotion,
procedure validation, skill-candidate creation, procurement, and manual
vetting, while install, scheduler, proactive execution, and
self-improving capture remained disabled.

Bounded internal skill candidates that are eligible under that advisory
approval plan may now also persist one bounded internal approval-state record
using:

- `memory_skill_candidate_approve`

That write path remains internal-only. It does not invoke Skill Vetter,
install skills, or trigger downstream automation. Its purpose is only to
record bounded limited-use or normal-use approval state plus preserved
procurement and vetting lineage so a later explicit install slice can inspect
it.

Bounded internal skill candidates that are eligible under that advisory
approval planner may now also persist one internal approval-state record using:

- `memory_skill_candidate_approve`

That write path remains internal-only. It does not invoke Skill Vetter or
install skills. Its purpose is only to persist bounded limited-use or
normal-use approval state, preserved install guardrails, and approval lineage
so a later explicit install-related slice can inspect them.

Approved bounded skill candidates may now also be prepared for a separate
manual install step using:

- `memory_skill_candidate_install_handoff`

That planning path remains advisory-only. It does not install skills or mutate
installed-skill state. Its purpose is only to return a bounded install handoff
package with approval scope, rationale, remaining blockers, install
guardrails, and explicit manual steps for a later explicit install slice.

Approved bounded skill candidates that are eligible under that advisory
install-handoff planner may now also persist one internal install record using:

- `memory_skill_candidate_install_record_create`

That write path remains internal-only. It does not install skills or mutate
runtime skill state. Its purpose is only to persist a manual installation
outcome, installed scope, preserved guardrails, and approval or procurement or
vetting lineage so a later explicit inspection slice can read it.

That bounded install-handoff and install-record path has now also been proven
in the current real non-production rollout posture alongside submit, review,
promotion, procedure validation, skill-candidate creation, procurement,
manual vetting, and approval, while actual installation, scheduler, proactive
execution, and self-improving capture remained disabled.

The production-readiness review now keeps scheduler, proactive, actual
installation, automatic Skill Vetter invocation, and self-improving capture
disabled until explicit operational safeguards are documented for any future
automation rollout.

## Immediate priorities

Immediate procurement priorities are:

1. Skill Vetter
2. `self-improving-agent`

Proactive Agent remains deferred and gated.

## Current execution posture

This document defines governance and handoff posture for external-skill review.

It does not:

- install `self-improving-agent`
- invoke Skill Vetter automatically
- install third-party skills automatically
- approve any third-party skill for normal use by default
- alter memory runtime behavior

## Implementation notes

Defined in this slice:

- lifecycle states for externally sourced skills
- required vetting outputs
- mandatory Skill Vetter gate
- install blockers
- canonical recording locations for findings

Still pending:

- actual `self-improving-agent` installation
- any limited-use approvals
- any normal-use approvals
