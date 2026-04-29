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
- model-reviewed proactive plans are also first-class proactivity opportunities;
  they must not be downgraded into generic follow-up rows before presentation
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
- visible primary card text must come from the model-authored brief path. The
  deterministic brief builder may provide hidden fallback input, diagnostics,
  and validator scaffolding only. If model-authored briefing is disabled,
  unavailable, schema-invalid, unsafe, generic, or unclear, the item is demoted
  or hidden rather than shown with deterministic copy.

## High-context model-reviewed candidate discovery

Presentation repair alone is not enough. The platform also needs model judgment
before a candidate enters the operator-visible path. This review is not memory
capture: memory wants many atomic facts, while skill/proactivity discovery wants
coherent work episodes and judgment.

Runtime rule:

- review runs infrequently by structural cadence: heartbeat/operator briefing,
  every 3 assistant finals by default, session/compaction boundary, and a
  future manual review hook
- keyword/topic/phrase checks must not act as trigger hints or gates
- candidate-review packets use larger capped contiguous `episodeTurns`, not
  short memory-shaped snippets, adjacency-selected refs, or role-balanced
  "interesting" fragments
- deterministic packet assembly may enforce recency, source, caps, redaction,
  refs, hashes, cooldown, and provenance only; it must not decide candidate
  usefulness by choosing semantically interesting snippets
- OpenClaw packet input should preserve the last configurable number of full
  user/assistant turns in order
- Codex packet input should preserve a contiguous session window with user asks,
  assistant finals, command intent/status, validation failures, touched areas,
  and outcomes where available
- candidate review proposes at most 0-3 high-impact proactive plans, new skill
  candidates, existing-skill enhancements, merge/extend candidates, or
  demotions from the high-context episode packet
- the reviewer must prefer no candidate over marginal candidates, require
  repeatability or large avoided cost, and reject tiny cleanup candidates
- deterministic validation, cooldowns, dedupe, provenance checks, no-dark-data
  checks, and write-eligibility checks still decide whether a proposal becomes
  or updates a canonical proactivity record
- deterministic guardrails remain allowed, but deterministic code that decides
  semantic usefulness, candidate classification, ranking, or surfacing must be
  audited rather than silently becoming candidate authority
- before any live UI proof or gateway rebuild, the candidate-review path should
  pass local golden-corpus validation covering expected skill candidates,
  existing-skill enhancements, proactive plans, demotions, and no-candidate
  episodes
- golden-corpus misses must be attributed to packet assembly, model review,
  post-model validation/dedupe, unexpected candidate surfacing, or an expected
  no-candidate outcome

Allowed live model input includes bounded recent user turns, assistant finals,
card diagnostics, activity summaries, validation summaries, loaded skill
metadata, candidate summaries, and Codex session excerpts or summaries. Codex
activity is first-class input where available because implementation/debugging
work often happens there.

Durable state must store only sanitized packets, capped episode turns, refs,
hashes, classification/proposal records, validation reports, packet hashes, and
route summaries. Raw full transcripts, raw prompts, raw model responses, raw
tool logs, hidden reasoning, secrets, private phrases, and unbounded
OpenClaw/Codex session logs are forbidden durable artifacts.

Sanitized episode packet artifacts may be persisted for auditability. They must
show source runtime, Codex adapter status, packet path/hash, proposal counts,
packet-quality diagnostics, and validation/demotion reasons without persisting
raw prompt/model response text. Packet-quality diagnostics should distinguish
healthy contiguous windows from loaded-but-low-signal inputs such as generic
command summaries, duplicated turns, missing touched areas, and missing
validation-failure detail.

Candidate-review output is proposal-only. It must not execute actions, install
or promote skills, send messages, mutate files, write canonical memory truth, or
become fuzzy duplicate authority.

Candidate-review route config is separate from chat, memory capture/retrieval,
and presentation-brief routes. The candidate reviewer should use a
GPT-5.4-class route with medium/high reasoning by default. Candidate review also
has explicit max-per-session/day and time-bounded cooldown controls so repeat
proof or heartbeat runs do not create a permanent suppression state.
