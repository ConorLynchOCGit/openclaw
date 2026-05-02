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
- `normalizedIntentKey` supplied by model-reviewed proposal or explicit
  structural metadata, not inferred by deterministic semantic text heuristics
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
- remaining deterministic candidate usefulness, classification, or visible-copy
  paths are removal debt. They must be deleted, narrowed to explicit
  structural/guardrail behavior, or moved to bounded model-owned review; they
  must not survive as renamed compatibility helpers.
- if an explicit existing skill match is present in loaded skill metadata or
  prior candidate linkage, the reviewer should prefer an enhancement proposal
  over a new skill; uncertain fuzzy matches remain diagnostic only
- new skill candidates should be bounded reusable capabilities, not broad
  activity labels. A strong new skill candidate has a trigger condition,
  repeatable inputs, a reusable procedure or checklist, a concrete output
  artifact, validation criteria, and evidence that it reduces repeated work
  across future sessions.
- broad review/check-before-release opportunities should usually become
  `proactive_plan` or `existing_skill_enhancement` unless the model can explain
  why the procedure is clearly skill-shaped.
- existing skill enhancement cards are legitimate surfaced cards when the
  evidence points to improving an already-known workflow, prompt, proof,
  validation checklist, or candidate-review method.
- skill-vs-plan-vs-enhancement classification remains model-owned. The runtime
  must not add deterministic validators that decide whether an opportunity is
  "really" skill-shaped.

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

Milestone 2 dedupe rules are structural only:

- `normalizedIntentKey`
- source family
- suggested target skill family
- bounded evidence hashes

No fuzzy semantic dedupe is allowed in the canonical record path. If the system
needs to decide that two differently worded candidates are the same reusable
workflow, an existing-skill enhancement, a merge, or a demotion, that is a
model-owned or operator-owned adjudication step. Deterministic code may then
apply the explicit model/operator decision by ids, refs, hashes, and lifecycle
state.

After the deterministic-debt pruning pass, candidate creation and visible
classification must not rely on activity-only token overlap or deterministic
source-fragment interpretation. Model-reviewed candidate proposals provide the
skill/proactivity judgment; deterministic ledger code may only apply exact
canonical keys, explicit ids/refs, bounded hashes, lifecycle status, safety
validation, and recurrence accounting.

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

Phase 2 skill parity gate:

- candidates that progress beyond draft-ready must connect to eval generation,
  resolver/trigger tests, check-resolvable-style reachability/overlap reports,
  package E2E, risk/vetting, canary/rollback, and eventual cross-runtime
  install records as defined in
  [Skill Quality Parity Gates](/projects/skills-system/specs/skill-quality-parity-gates)
- usage-based recurrence can trigger model review for improvement, merge,
  demotion, retirement, or no action; it must not deterministically infer
  semantic usefulness or promotion worthiness from feedback counts or repeated
  telemetry
