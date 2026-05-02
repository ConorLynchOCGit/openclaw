---
summary: "Contract for the OpenClaw Skillifier scaffold, check, and package builder."
title: "Skillifier Contract"
---

# Skillifier Contract

## Objective

Define the OpenClaw Skillifier contract inspired by GBrain and adapted to
OpenClaw/Codex cross-runtime needs.

Milestone 3 runtime focus:

- consume canonical `skill_candidate` records
- generate bounded draft packages only
- produce deterministic draft checks and reports
- preserve one canonical `skillPackageId`
- respect destination capability authority
- stay non-installing and non-promoting

## Milestone 3 draft package contract

Each Skillifier MVP draft must produce:

- one canonical `skillPackageId`
- one draft package path
- one generated `SKILL.md`
- one package metadata file
- one provenance report
- one rollback plan
- one deterministic check report
- optional placeholder support files only when explicitly justified by the
  bounded candidate evidence

The originating `skillCandidateId` and linked `proactivityOpportunityId` must
remain attached to the draft package and report artifacts.

## Outputs

The Skillifier should eventually produce:

- `SKILL.md`
- optional deterministic scripts
- optional references
- optional assets or templates
- OpenClaw metadata
- Codex compatibility metadata
- eval fixtures
- routing and decisioning fixtures
- compliance tests
- vetting report
- install plan
- rollback plan
- provenance report

Milestone 3 required outputs are narrower:

- `SKILL.md`
- package metadata
- provenance report
- rollback plan
- deterministic check report

Milestone 3 does not require executable scripts, eval fixtures, routing
fixtures, or production install metadata unless a later milestone adds them.

## Presentation contract before evals

Skillifier draft state must not be projected directly into primary card copy.
The originating candidate, draft package, and report may keep rich metadata, but
human-facing chat cards, inbox rows, heartbeat context, and handoff copy render
through `UserFacingProactivityBrief`.

Primary copy should show only:

- concise title
- skill/action kind
- one-line purpose
- recommended next step or primary action

Draft package paths, why-now text, provenance, source refs, ids, timestamps,
quality diagnostics, limitations, and lifecycle details belong in disclosure or
handoff context. A draft-ready item must not repeat the same action as both
`Skill worth creating` and `Draft ready` prose.

Draft-ready primary copy may be model-authored from typed bounded candidate and
draft state when enabled, but the model output is presentation-only. It cannot
install or promote skills, mutate draft files, mutate candidate state, update
semantic memory, send messages, or execute actions. Deterministic validators
must run after model output and demote generic, repetitive, clipped,
schema-invalid, or unsafe draft-ready cards.

Skillifier entry may consume candidates that originated from a model-reviewed
recent-work episode, but only after deterministic validation, dedupe, and
destination checks accept the candidate. The episode model may classify a
proposal as a new skill, existing-skill enhancement, merge/extend candidate, or
demotion; it cannot create a draft package, install a skill, promote a skill, or
mutate the candidate ledger by itself.

## Milestone 3 `SKILL.md` scaffold rules

Generated `SKILL.md` must stay bounded and reviewable.

Required sections:

- title
- purpose
- when to use
- when not to use
- safety boundaries
- expected inputs
- expected outputs
- workflow outline
- success checks
- open questions
- provenance summary

The scaffold must not fabricate deep implementation details that are not
supported by the bounded candidate evidence.

The scaffold must not include raw transcript snippets or raw tool logs.

## Properly skilled checklist

A skill is "properly skilled" only when all required items for its risk tier
exist. OpenClaw's checklist intentionally matches or exceeds the Gbrain-style
skillify/check-resolvable bar while preserving OpenClaw's model-owned judgment
boundary:

- `SKILL.md` contract exists with purpose, trigger conditions, when-not-to-use,
  safety boundaries, inputs, outputs, workflow, and success checks
- deterministic code or helper scripts exist where the workflow requires
  deterministic behavior
- unit tests cover deterministic helper/script behavior
- integration tests exercise real package/runtime seams where applicable
- LLM evals cover model judgment and model-output quality where applicable
- resolver trigger metadata exists using user-language trigger patterns
- resolver trigger evals prove intended prompts route to the skill and
  unrelated prompts do not
- check-resolvable-style report proves reachability, overlap/MECE posture, gap
  detection, orphan detection, package filing, and missing-gate reporting
- package E2E proves user intent to runtime behavior in each declared runtime
  or canary/shadow target
- compliance test verifies the agent reads and follows `SKILL.md`
- vetting passes for the risk tier
- cross-runtime packaging is valid when declared
- proactivity linkage exists back to the originating candidate/opportunity
- provenance, install target, canary, rollback, and disable records exist

Milestone 4 makes the eval, resolver, check-resolvable-style, and draft-package
E2E portions enforceable for review-only packages. Later milestones add
install/canary/rollback, cross-runtime install, and usage-based
self-improvement gates.

## Model-owned Skillifier boundary

The Skillifier may consume model-reviewed candidates and model-authored draft
content, but it must not reintroduce deterministic semantic judgment.

Allowed deterministic checks:

- required files and sections are present
- package metadata schema is valid
- refs, hashes, ids, source authority, and provenance are present
- declared trigger fixtures execute against expected ids/routes
- declared eval fixtures pass or fail
- package E2E command exits as expected
- destination paths and permissions match the capability matrix
- canary, install, rollback, and disable state are structurally valid

Forbidden deterministic checks:

- deciding whether the candidate is actually skill-worthy
- deciding whether the skill is semantically useful enough to promote
- deciding skill-vs-plan-vs-existing-enhancement classification
- inferring improvement, retirement, or merge from usage counts or feedback
- using keyword/title similarity as semantic duplicate or overlap authority

Those judgments require bounded model review, explicit operator approval, or an
approved low-risk autonomy policy that itself depends on model-reviewed
evidence plus passing structural gates.

## Design rules

- keep `SKILL.md` concise and push detailed material into references when needed
- do not generate unsafe wrappers merely to satisfy cross-runtime packaging
- do not package raw session content into examples
- make provenance and rollback first-class outputs, not afterthoughts
- preserve one source-of-truth package even when adapters differ by runtime
- keep Milestone 3 packages in review-only posture: non-promoted, bounded, and
  destination-compliant
