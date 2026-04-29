---
summary: "Typed bounded candidate ledger contract for skill opportunities derived from OpenClaw and Codex work."
title: "Skill Candidate Ledger"
---

# Skill Candidate Ledger

## Objective

Define the typed ledger for skill candidates.

Candidates are reviewable platform records, not semantic truth and not raw
session logs.

## Primary record types

- `SkillCandidateRecord`
- `SkillCandidateSource`
- `SkillCandidateEvidenceSummary`
- `SkillCandidateLifecycleStatus`
- `SkillCandidateRiskTier`
- `SkillCandidateAutonomyLevel`
- `SkillCandidateInstallTarget`
- `SkillCandidateProactivityLink`
- `SkillCandidateRollbackPlan`
- `SkillCandidateEvalStatus`

## `SkillCandidateRecord`

Required fields:

- deterministic `skillCandidateId`
- `normalizedIntentKey`
- `sourceRuntime`
- `candidateType`
- bounded `evidenceSummary`
- `recurrenceCount`
- `recurrenceWindow`
- `exampleHashes`
- `suggestedSkillName`
- optional `suggestedExistingSkillName`
- `riskTier`
- `autonomyLevelCeiling`
- `lifecycleStatus`
- linked `proactivityOpportunityId`
- `installTargets`
- `evalStatus`
- `vettingStatus`
- `canaryStatus`
- `createdAt`
- `updatedAt`
- `provenanceRefs`
- `rollbackPlan`

Milestone 2 runtime contract:

- `skill_candidate` is a first-class proactivity opportunity kind
- the skill-candidate ledger is rebuilt from bounded distilled evidence and
  persisted through the existing proactivity state store
- the same canonical `skillCandidateId` and linked `proactivityOpportunityId`
  must survive reload and appear unchanged across inline chat, heartbeat,
  inbox, and handoff
- early lifecycle states are at minimum:
  - `detected`
  - `superseded`
  - `rejected`
  - `disabled`
- early eval, vetting, and canary state may remain `not_started`, but the
  fields must already be present

Milestone 3 draft-linkage contract:

- a canonical `skillCandidateId` may gain one linked `skillPackageId`
- the candidate remains the primary surface identity
- the linked package/report ids must stay deterministic across reload and
  follow-up surfacing
- draft linkage must not require a separate draft-only queue

Pre-Milestone-4 presentation contract:

- candidate ledger records remain internal state, not direct card copy
- chat cards, inbox rows, heartbeat context, and handoff copy render through
  `UserFacingProactivityBrief`
- the primary brief must say whether the item is a new skill, an existing-skill
  enhancement, a merge/extend candidate, or not skill-worthy
- visible `Improve skill` and `Merge skill` claims require explicit skill
  metadata, candidate linkage, or prior candidate state; uncertain matches stay
  in diagnostics
- why-now, source refs, provenance, ids, timestamps, evidence, limitations, and
  quality diagnostics belong in collapsed details or hidden context
- malformed source-fragment titles are rewritten or demoted before primary
  surfacing
- model-authored brief generation may rewrite/evaluate the primary copy from
  typed bounded candidate state, but it is presentation-only and cannot update
  candidate truth, dedupe, lifecycle, install targets, package ids, or memory
- deterministic validators remain mandatory after model output and must demote
  generic, repetitive, clipped, unsafe, schema-invalid, or unclear cards

Pre-Milestone-4 high-context model-reviewed discovery contract:

- deterministic candidate creation alone is not sufficient for subjective
  usefulness
- skill candidates may originate from a high-context model-reviewed episode
  packet when structural cadence and budget/cooldown controls allow review
- candidate review is not memory capture; it uses larger capped `episodeTurns`
  and coherent recent OpenClaw/Codex work windows rather than many short atomic
  snippets
- review cadence is heartbeat/operator briefing, every 3 assistant finals by
  default, session/compaction boundary, and a future manual review command
- each review returns at most 0-3 high-impact proposals and may return zero
  when the episode is weak, local-only, or marginal
- the model reviewer may classify a proposed item as:
  - `new_skill_candidate`
  - `existing_skill_enhancement`
  - `merge_or_extend_candidate`
  - `demote_existing_candidate`
- model-reviewed proposals must carry bounded evidence refs and hashes back to
  the episode packet, including Codex refs when Codex evidence contributed
- proposals must carry expected user value, high-impact rationale, and why the
  item is not merely small cleanup
- proposal text is candidate rationale, not semantic truth
- deterministic id generation, dedupe, lifecycle updates, no-dark-data checks,
  provenance checks, and surface eligibility remain runtime authority
- if an explicit existing skill match is present in loaded skill metadata or
  prior candidate linkage, the reviewer should prefer an enhancement proposal
  over a new skill; uncertain fuzzy matches remain diagnostic only

## `SkillCandidateSource`

Allowed source families:

- `openclaw_session`
- `codex_session`
- `operator_digest`
- `validation_lane`
- `user_request`
- `recurring_task`

Each source ref must be bounded and referential, not a raw transcript dump.

## `SkillCandidateEvidenceSummary`

Must include only bounded summaries such as:

- repeated task pattern summary
- repeated command sequence summary
- repeated user correction summary
- recurring validation failure summary
- successful workflow skeleton summary
- bounded before/after outcome summary

Forbidden:

- raw transcripts
- full prompts
- raw tool logs
- secrets
- private phrases

## Deduplication and lifecycle

Candidates must dedupe deterministically using bounded keys such as:

- `normalizedIntentKey`
- source family
- bounded evidence hashes
- suggested target skill family

Rejected or superseded candidates must not pile up in primary actionable
surfaces. Recurrence should update the canonical record rather than create a new
tail of near-duplicates.

Milestone 2 dedupe rules are deterministic only:

- `normalizedIntentKey`
- source family
- suggested target skill family
- bounded evidence hashes

No fuzzy semantic dedupe is allowed in the canonical record path.

## Storage rules

- raw transcripts are not stored
- candidates are not semantic truth
- example hashes may be stored, not raw examples
- provenance refs remain available for audit
- candidate history must be rollback-safe and version-aware

Milestone 2 acceptance gate:

- a real normal-session workflow can create a `skill_candidate`
- the candidate is bounded and no-dark-data safe
- recurrence updates the canonical record instead of piling up duplicates
- live usefulness is measured through inline, heartbeat, inbox, and handoff
  behavior rather than by artifact presence alone
