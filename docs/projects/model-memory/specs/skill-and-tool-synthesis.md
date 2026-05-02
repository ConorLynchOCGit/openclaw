---
summary: "Phase 2 design for turning repeated successful traces into reviewable skill and tool candidates."
title: "Skill And Tool Synthesis"
---

# Skill And Tool Synthesis

## Status

This is an approved Phase 2 direction document.

The synthesis direction is approved with these boundaries:

- low-risk limited-scope skill promotion may later use the approved autonomy
  ladder after tests, vetting, and canary
- third-party skills must go through `skill-vetter`
- the recommendation flow is `install`, `inspire`, or `reject`
- approved install means real install, not a fake placeholder action

2026-04-22 MMV2 alignment:

- synthesis candidates must be grounded in MMV2 durable evidence, bounded tool
  proof, source refs, or reviewed operator artifacts
- repeated traces can suggest skills/tools, but generated candidates are
  review artifacts, not semantic truth or automatic behavior changes
- third-party skill candidates require `skill-vetter`; install/inspire/reject
  remains the review vocabulary
- tool-result capture may contribute bounded facts such as artifact paths,
  URLs, command status, docs/runbooks found, and non-sensitive error classes;
  raw logs and transcripts are forbidden inputs

2026-05-01 Phase 2 model-owned judgment and parity update:

- structural recurrence, explicit operator asks, validation failures, or
  session/heartbeat boundaries may trigger candidate review
- "three similar successful traces" is not a deterministic semantic rule. The
  runtime may count structurally related events or exact refs, but the reviewer
  model decides whether they represent the same reusable workflow, a new skill,
  an existing-skill enhancement, a tool candidate, a proactive plan, a merge,
  a demotion, or no candidate
- approved internal candidates promote to repo-local/workspace-local skills or
  specs first
- low-risk limited-scope skill promotion may later proceed without a human stop
  only after the Skills Platform autonomy, eval, vetting, canary, provenance,
  and rollback gates are implemented
- the skill parity gates now include eval generation/execution,
  resolver/trigger tests, check-resolvable-style reachability and overlap
  checks, package E2E, install/canary/rollback, usage-based self-improvement,
  approval-gated promotion, and cross-runtime install
- broad Codex or OpenClaw skill rollout remains a second explicit approval
- Phase 2 self-improvement drafts artifacts and proposals first; active
  behavior changes require the appropriate autonomy level or approval gate

2026-04-22 Phase 2 decision lock:

- skill and tool ideas should be proactively surfaced to the operator
- workflow opportunities are part of the same proactive synthesis surface
- heartbeat is the default persistent surfacing channel for pending candidates
- turn-level surfacing is allowed when a candidate is directly relevant to the
  current work
- candidate review can be triggered automatically by structural cadence or
  explicit events, but candidate creation/classification is model-owned or
  operator-owned; promotion, installation, privileged tool enablement, and
  standing workflow automation must still follow the autonomy ladder and risk
  policy

## Objective

Turn repeated successful interactions into reusable, auditable candidate skills
and tools.

The system should improve by accumulating reusable artifacts rather than relying
on hidden prompt drift or opaque behavior changes.

## Core rule

Self-improvement should promote auditable artifacts, not hidden behavior.

## Why this exists

The current system already has:

- canonical memory objects
- document ingest
- prompt-turn capture
- daily summary ingestion
- operator skills
- skill vetting support

Phase 2 should connect these into one synthesis pipeline so repeated successful
workflows can become:

- internal skill candidates
- internal tool candidates
- third-party skill adoption candidates

## Candidate sources

Candidate synthesis may draw from:

- repeated successful interaction traces
- repeated operator workflows
- repeated document-ingest or maintenance procedures
- frequently reused tool call sequences
- recurring workaround patterns
- successful third-party skill usage
- source-authority-aware memory evidence, including `tool_grounded` and
  `cited_soft` references when appropriate

## Candidate types

Suggested candidate types:

- `internal_skill_candidate`
- `internal_tool_candidate`
- `third_party_skill_candidate`
- `workflow_doc_candidate`
- `workflow_automation_candidate`
- `tooling_gap_candidate`

## Internal skill synthesis

The first synthesis target should be internal skills.

Pipeline:

1. structurally trigger bounded review from recurrence, explicit asks,
   validation failures, heartbeat/session boundaries, or usage events
2. preserve contiguous bounded evidence packets with refs and hashes
3. ask the reviewer model whether a reusable skill/tool/workflow candidate
   exists, or whether the outcome is an existing-skill enhancement, merge,
   demotion, proactive plan, or no candidate
4. compile a candidate draft only from accepted model/operator proposals
5. generate evals, resolver/trigger fixtures, provenance, and rollback plan
6. run replay, contract checks, resolver tests, package E2E, vetting, and
   check-resolvable-style health report
7. surface for operator review or approved low-risk autonomy
8. canary, promote, install, or no-op only through the approved autonomy or
   approval path

The output should be a real candidate artifact with:

- candidate name
- trigger conditions
- expected inputs
- expected outputs
- required tools
- safety notes
- replay evidence

## Internal tool synthesis

The system should also notice when a repeated workflow should not be a skill but
a real tool seam.

Signals include:

- repeated deterministic shell or script flows
- stable argument extraction from user intent
- repeated planner proposals pointing to the same missing capability
- high-value operator workflow bottlenecks

The system may draft a tool proposal, but implementation remains a reviewed
engineering action.

## Third-party skill adoption

Phase 2 should cover third-party skills explicitly.

The pipeline should be:

1. notice a capability gap
2. evaluate internal synthesis options
3. evaluate ClawHub options
4. run `skill-vetter` on any third-party candidate
5. run bounded local evaluation
6. produce a recommendation:
   - `install`
   - `inspire`
   - `reject`
7. surface the recommendation through normal OpenClaw review channels
8. on approval:
   - `install` -> install it
   - `inspire` -> produce a project spec or candidate draft
   - `reject` -> record rejection rationale

## Meaning of recommendation outcomes

### `install`

The third-party skill appears worth direct adoption.

It still requires:

- `skill-vetter`
- bounded local evaluation
- explicit operator approval

### `inspire`

The skill is useful as design inspiration but should not be installed directly.

Next output:

- a repo-owned project spec or candidate draft

### `reject`

The capability should not proceed through that third-party option.

The system should preserve the reason so the same poor fit is not rediscovered
as if it were new.

## Current install semantics

The current agent posture is effectively unrestricted skill visibility.

That means approved `install` should be read honestly as:

- install and make available

It is not a staged or quarantined install unless a future staging layer is
added.

Phase 2 should therefore keep approval explicit and visible before any
third-party install action.

## Promotion gates

Promotion must be evidence-gated.

Required checks before promotion:

- replay on representative traces
- contract verification
- generated and hand-authored eval execution
- resolver/trigger tests
- check-resolvable-style reachability, overlap, gap, orphan, and missing-gate
  report
- package E2E in the declared runtime or canary target
- scope and permission review
- privacy and egress review
- source authority review
- canary result and rollback proof where applicable
- either explicit operator approval or a valid low-risk autonomy path
- if third-party:
  - `skill-vetter`
  - local bounded evaluation
  - explicit human approval

## Preferred promotion targets

### Internal candidate

First promotion target:

- repo-owned draft artifact
- repo-local or workspace-local skill before any broader rollout

This keeps the first promotion auditable and reviewable.

Broad Codex or OpenClaw skill rollout requires a second approval after
repo-local or workspace-local proof.

### Third-party candidate

First promotion target:

- review artifact only until approval

Only after approval should the system install it.

## Review surfacing

The review surface must appear inside OpenClaw’s ordinary operator workflow.

Required surfacing:

- turn-level surfacing when a candidate is locally relevant
- heartbeat when pending candidates exist
- daily operator review summary

Skill, tool, and workflow candidates should not wait for manual discovery.
Once a repeated workflow, tool gap, or reusable operator pattern crosses the
evidence threshold, the system should produce a stable candidate artifact and
surface it through heartbeat until it is installed, used as inspiration,
rejected, or expired.

For skills specifically, this review surface should reuse the same proactivity
ids and lanes as inline cards, heartbeat, inbox, and handoff rather than
creating a second skills-only queue.

## Relationship to memory objects

Skill and tool candidates are not canonical memory truth.

They should be stored as reviewable artifacts with evidence links.

However, the memory system should still capture facts such as:

- this workflow recurs often
- this workaround succeeded repeatedly
- this candidate was approved or rejected

Those are canonicalizable facts about the operating system, not the same thing
as the candidate artifact itself.

## Relationship to graph runtime

The graph layer should connect:

- candidate skills
- candidate tools
- repeated trajectories
- source documents
- operator lanes
- existing tools and skills

This makes it possible to answer:

- what does this candidate replace?
- what existing workflow does it overlap?
- which documents and subjects justify it?

## Relationship to memory-system evolution

Phase 2 should allow the system to evolve its own memory-management workflows.

However, first-pass implementation should focus on:

- candidate generation
- replay-backed evaluation
- review gating

and not on autonomous live mutation of the memory pipeline itself.

## Prompt injection and privacy

No external document, web page, or third-party skill page should directly drive
promotion.

All external capability sources must be treated as untrusted until they pass:

- structured extraction
- vetting
- replay checks
- approval

If candidate generation uses prior sessions or memory files, the pipeline must
ensure no sensitive or secret-bearing content gets packaged into a candidate
artifact by default.

## Non-goals

This spec does not authorize:

- autonomous third-party skill installation
- autonomous tool enablement
- autonomous runtime prompt mutation
- direct publish-to-ClawHub behavior from live memory traces
- hidden parameter-level self-improvement

## Rollout

1. candidate extraction only
2. replay and contract validation
3. proactive surfacing in heartbeat, turn context, and daily operator review
4. operator-approved internal skill promotion to repo-owned draft artifacts
5. operator-approved workflow documentation or workflow automation proposal
6. operator-approved third-party `install` or `inspire` outcomes
7. only later consider staging or quarantine layers if the product needs them

## Related specs

- [Skill And Tool Candidate Evaluation](/projects/model-memory/specs/skill-and-tool-candidate-evaluation)
- [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
