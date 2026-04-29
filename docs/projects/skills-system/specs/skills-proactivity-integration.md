---
summary: "Contract for surfacing skill candidates through the existing OpenClaw proactivity system."
title: "Skills Proactivity Integration"
---

# Skills Proactivity Integration

## Objective

Define how the Skills Platform uses existing proactivity surfaces instead of a
separate candidate inbox.

## Core decision

Skill candidates are proactivity opportunities.

They should surface through:

- inline chat follow-up cards
- heartbeat and operator briefing
- inbox and actionable views
- handoff flows
- a later Skills Studio UI

## Shared ids

Required linked ids:

- `skillCandidateId`
- `proactivityOpportunityId`
- optional `skillPackageId`
- optional `installOrCanaryId`
- optional `skillifierReportId`

The same canonical ids must remain stable across surfacing, drafting, canary,
promotion, disable, and rollback flows.

Milestone 2 runtime rule:

- the same `skillCandidateId` must be visible in the canonical ledger, inline
  chat surface, heartbeat surface, inbox item, and handoff metadata for the
  same live opportunity
- repeated same-intent work must update the existing candidate instead of
  creating a second actionable queue row

Milestone 3 runtime rule:

- Skillifier MVP must reuse the same canonical `skillCandidateId`
- draft-ready state must surface through the existing proactivity queue,
  heartbeat, inbox, and handoff flows
- `skillPackageId` and `skillifierReportId` may appear as secondary linked ids,
  but they must not replace the candidate as the primary surface identity

## Required statuses

- `detected`
- `drafted`
- `tested`
- `vetting_failed`
- `canarying`
- `promoted_limited`
- `promoted_broad`
- `superseded`
- `rejected`
- `disabled`
- `rolled_back`

## Surfacing rules

- skill candidates must not create a parallel queue
- repeated candidates should update one canonical record where possible
- evidence and provenance may be shown in secondary details
- primary user-facing copy must render from a typed
  `UserFacingProactivityBrief`, not from raw ledger fields
- primary cards should show only title, kind label, one-line purpose, and the
  recommended next step or primary action
- `why now`, source refs, provenance, ids, timestamps, lifecycle details,
  limitations, and diagnostics belong in collapsed details or hidden heartbeat
  context
- primary user-facing copy must remain bounded and actionable
- static seeded placeholders do not count as live skill opportunities
- destination capability policy may inform install-target metadata, but
  Milestone 2 does not broadly write skill packages into live destinations
- Milestone 3 may write bounded draft packages only into explicitly allowed
  workspace-local draft targets; it still must not broadly install or promote
  skills

## Presentation rules

Skill candidates need a user-facing kind before they are shown:

- `new_skill_candidate`
- `existing_skill_enhancement`
- `merge_or_extend_candidate`
- `not_skill_worthy`

The visible label may say `New skill`, `Improve skill`, or `Merge skill` only
when the claim comes from explicit skill metadata, candidate linkage, or prior
candidate state. Uncertain fits stay in diagnostics as possible existing fits.

Reverse prompts may surface only when the primary title is a complete useful
question that names the decision or uncertainty. Malformed titles such as
`Question worth asking before ...`, source-fragment grammar, repeated fallback
templates, and title/body duplication must be demoted from primary surfaces.

Failed presentation quality should create bounded diagnostics that can feed
self-healing repair work instead of adding clutter to the chat feed or inbox.

## Model-authored brief pass

After the typed brief boundary exists, skill-related proactivity may use a
bounded model-authored rewrite/evaluation step to produce the primary
`UserFacingProactivityBrief` fields.

Rules:

- the model receives only typed bounded state from the canonical candidate,
  draft, and proactivity records
- raw prompts, transcripts, tool logs, secrets, private phrases, and unbounded
  session text are forbidden model input and persisted output
- model-authored copy is presentation-only and cannot mutate candidate ids,
  normalized intent keys, lifecycle, dedupe, package ids, install state,
  promotion state, memory, sends, or actions
- deterministic validators run after model output and demote unclear, generic,
  repetitive, unsafe, or schema-invalid briefs
- the first runtime target is the separate `openai-codex/gpt-5.4`
  proactivity-presentation route with strict JSON output and medium reasoning by
  default
- generic Node/test processes keep this pass disabled unless explicitly
  enabled; the live gateway compose runtime enables it by default with
  `openai-codex/gpt-5.4`
- if the model cannot make the skill card say whether it is a new skill, an
  explicit existing-skill improvement, or a demoted weak candidate, it must
  choose demotion

## Model-reviewed candidate discovery

Presentation repair alone is not enough. The platform also needs model judgment
before a candidate enters the operator-visible path.

Runtime rule:

- Stage 1 deterministic prefilter decides only whether it is worth asking a
  model about candidate review
- Stage 1 is based on structural runtime events and budget/cooldown controls
  only. It must not use skill/proactivity/candidate/workflow keywords,
  correction phrases, recurring-work phrases, topic labels, or turn-count
  thresholds as gates or hints.
- Stage 2 model trigger evaluation decides whether a bounded recent-work
  episode has enough signal for candidate review and whether the goal is
  skills, proactivity, both, or none
- candidate review then proposes proactive plans, new skill candidates,
  existing-skill enhancements, merge/extend candidates, and demotions from a
  bounded episode packet
- deterministic validation, cooldowns, dedupe, provenance checks, no-dark-data
  checks, and write-eligibility checks still decide whether a proposal becomes
  or updates a canonical proactivity record

Allowed live model input includes bounded recent user turns, assistant finals,
card diagnostics, activity summaries, validation summaries, loaded skill
metadata, candidate summaries, and Codex session excerpts or summaries.

Durable state must store only bounded packets, capped excerpts, refs, hashes,
classification/proposal records, validation reports, and route summaries. Raw
full transcripts, raw prompts, raw tool logs, hidden reasoning, secrets, private
phrases, and unbounded OpenClaw/Codex session logs are forbidden durable
artifacts.

Candidate-review output is proposal-only. It must not execute actions, install
or promote skills, send messages, mutate files, write canonical memory truth, or
become fuzzy duplicate authority.

Candidate-review route config is separate from chat, memory capture/retrieval,
and presentation-brief routes. The trigger evaluator, candidate reviewer, and
presentation brief generator each report their model id/config family. Candidate
review also has explicit max-per-session and time-bounded cooldown controls so
repeat proof or heartbeat runs do not create a permanent suppression state.
