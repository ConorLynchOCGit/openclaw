---
summary: "Typed bounded candidate ledger contract for skill opportunities derived from OpenClaw and Codex work."
title: "Skill Candidate Ledger"
---

# Skill Candidate Ledger

## Objective

Define the future typed ledger for skill candidates.

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

## Storage rules

- raw transcripts are not stored
- candidates are not semantic truth
- example hashes may be stored, not raw examples
- provenance refs remain available for audit
- candidate history must be rollback-safe and version-aware
