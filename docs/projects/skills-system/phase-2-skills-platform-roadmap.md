---
summary: "Milestone roadmap for the proactivity-integrated OpenClaw Skills Platform."
title: "Phase 2 Skills Platform Roadmap"
---

# Phase 2 Skills Platform Roadmap

This roadmap defines the implementation order for the Skills Platform after the
Milestone 1 docs/spec pass.

The platform target is not "more skills." It is a proactivity-integrated,
cross-runtime, partially autonomous skill lifecycle system with bounded safety
and rollback.

The Phase 2 target is also explicit parity or better with mature skill-system
patterns:

- Gbrain-style quality control: properly skilled packages require skill
  contracts, tests, integration tests, LLM evals, resolver triggers, resolver
  evals, reachability/overlap checks, E2E, and filing/ownership coverage.
- Hermes-style learning loop: observe repeated work, distill reusable skills,
  reuse them when relevant, refine from feedback, and keep install/edit
  behavior controllable.

OpenClaw's version of that target must preserve the model-owned judgment
boundary. Deterministic code may run tests, check files, verify hashes, enforce
destination rules, and apply canary/rollback state. It must not decide
skill-worthiness, skill-vs-plan classification, semantic usefulness, promotion,
retirement, or usage-based improvement without bounded model review or operator
approval.

Skill and proactivity UX now targets a canonical `Work Queue` rather than
chat-only cards. The cross-project product contract is recorded in
[Proactivity And Skills UX Product Brief](/projects/model-memory/specs/proactivity-and-skills-ux-product-brief).
Skill candidates and existing-skill enhancements remain first-class proactivity
objects, but durable draft artifacts, revision state, finalized Codex-ready
prompts, evidence, and future execution records belong in the Work Queue object
detail rather than transient chat or heartbeat UI.

The surface allocation contract is recorded in
[Work Queue Information Architecture](/projects/model-memory/specs/work-queue-information-architecture):
skills share one canonical Work Queue with build plans, tooling, user-review
tasks, and future agent work; the `Skills` lane supplies filters and grouping,
not a second queue; skill details own `SKILL.md` draft summaries,
trigger/resolver notes, safety boundaries, tests/evals checklist, integration
notes, provenance, and finalized Codex-ready prompts.

The shared lifecycle contract is recorded in
[Work Queue Interaction And Lifecycle State Model](/projects/model-memory/specs/work-queue-interaction-lifecycle-state-model):
skill candidates and skill enhancements use the same visible lifecycle shell as
other work objects, but with skill-specific artifact payloads. Finalized skill
drafts expose review-only Codex-ready prompts and manual completion tracking;
install, promotion, and autonomous execution remain hidden until their
milestones exist.

The first implementation slice is recorded in
[Work Queue UX Implementation Plan](/projects/model-memory/specs/work-queue-ux-implementation-plan):
the Skills lane should be rendered through the shared Work Queue adapter and
detail view, with full skill draft artifacts, version history, prompt copy, and
hidden diagnostics rather than a separate skill queue.

## Milestone 1 - Specs and autonomy policy

- Objective: define the canonical lifecycle, autonomy ladder, risk tiers,
  proactivity integration, packaging, destination authority, rollback, and
  roadmap contracts.
- Scope: docs/specs/decisions only.
- Non-goals: no runtime ledger, Skillifier, UI, or installers.
- Proof: docs validation and coherent cross-project links.
- Safety gate: no change to runtime authority.
- User-facing behavior: none yet; contract only.

## Milestone 2 - Skill candidate ledger integrated with proactivity

- Objective: create typed `skill_candidate` records inside the existing
  proactivity system.
- Scope: bounded candidate extraction from real work, deterministic ids,
  dedupe, persisted ledger state, lifecycle states, and shared surface ids.
- Non-goals: no auto-promotion or broad installer work.
- Proof: same real work event creates one canonical skill candidate visible
  across inline, heartbeat, inbox, and handoff.
- Safety gate: no raw transcript persistence; no executable promotion; no
  broad destination writes.
- User-facing behavior: recurring work starts surfacing as skill opportunities.

Milestone 2 acceptance details:

- `skill_candidate` is a first-class proactivity opportunity kind
- candidate creation uses bounded distilled evidence, not raw transcripts
- the ledger is the canonical skill-candidate state
- the same canonical id must survive across inline, heartbeat, inbox, and
  handoff
- recurring work updates an existing candidate when explicit structural keys or
  model-reviewed canonical intent keys match instead of piling up duplicates
- candidate generation quality and live usefulness are the success gate

## Milestone 3 - Skillifier MVP scaffold/check/report

- Objective: convert a canonical `skill_candidate` into one bounded draft
  package with one `SKILL.md`, one deterministic check report, one provenance
  report, one rollback plan, and one stable `skillPackageId`.
- Scope: scaffold/check/report only; no install or promotion.
- Also includes: code-level enforcement of the destination capability matrix for
  draft/install target selection.
- Non-goals: no full automation ladder yet; no broad installer flow; no
  Skills Studio UI.
- Proof: one live `skill_candidate` can produce one bounded skill package
  draft and one deterministic report without creating a parallel review queue.
- Safety gate: artifact generation only; no live enablement; no forbidden
  destination writes.
- User-facing behavior: a live skill candidate can become draft-ready inside
  the existing proactivity workflow.

Milestone 3 acceptance details:

- Skillifier MVP consumes canonical `skill_candidate` records
- draft skill packages are bounded draft artifacts, not installed or promoted
  skills
- one canonical `skillPackageId` links candidate, draft package, and reports
- scaffold generation uses bounded distilled evidence only
- draft generation respects the destination capability matrix
- default draft targets are limited and explicit
- `skills/<name>/` remains branch/worktree-only, never silent `main` mutation
- live usefulness and draft reviewability are the success gate

## Milestone 4 - Skill quality parity gate v1

Precondition:

- proactive and skill-candidate surfaces must render through a typed
  `UserFacingProactivityBrief`
- primary chat, inbox, heartbeat, and handoff copy must be concise decision
  surfaces, not raw ledger packet projections
- malformed reverse prompts and noisy skill transformation titles must be
  rewritten or demoted before Milestone 4 evals measure skill behavior
- deterministic presentation cleanup must be supplemented by bounded
  model-authored brief rewrite/evaluation, because structurally clean source
  fragments can still be unclear to an operator

Pre-Milestone-4 repair:

- add the shared presentation adapter
- move why-now, evidence, source refs, provenance, ids, timestamps,
  limitations, and diagnostics behind disclosure
- distinguish new skill, existing-skill enhancement, merge/extend, and
  non-skill-worthy candidates with explicit metadata
- add regression fixtures for noisy card and reverse-prompt examples
- add a GPT-5.4 model-authored `UserFacingProactivityBrief` pass with strict
  JSON output, medium reasoning by default, and deterministic validators after
  model output
- demote generic, repetitive, clipped, schema-invalid, or unsafe cards instead
  of surfacing vague fallback copy
- shift candidate review before Milestone 4 from frequent atomic extraction to
  infrequent high-context episode review: heartbeat/operator briefing, every 3
  assistant finals by default, session/compaction boundary, and a future manual
  review hook
- use larger capped `episodeTurns`, first-class Codex activity, a higher-quality
  reviewer route, and a 0-3 high-impact proposal limit so weak cleanup
  candidates are demoted rather than surfaced
- keep model route isolation explicit: trigger evaluation, candidate review,
  presentation briefs, model-memory capture/retrieval, and default chat remain
  separate configurable routes with separate schemas
- add local deterministic-semantic-judgment audit and golden-corpus candidate
  review validation before live gateway rebuilds; Milestone 4 should start from
  packet/reviewer/validator/card paths that already pass function-level checks

- Objective: prove skills are chosen correctly and followed correctly.
- Scope: generated and hand-authored evals, trigger/resolver tests,
  check-resolvable-style reachability and overlap reporting, review-only
  package E2E, decisioning, avoid, ambiguous/cofire, compliance,
  workflow-contract, prompt-injection, sandbox, and cross-runtime fixture
  coverage.
- Non-goals: no broad auto-promotion.
- Proof: deterministic CI-safe eval runner over declared fixtures, model-owned
  eval fixture generation for semantic cases, check-resolvable-style health
  report, package E2E proof for draft packages, plus opt-in live evals.
- Safety gate: eval evidence is guardrail and promotion evidence, not
  deterministic semantic authority.
- User-facing behavior: higher confidence that shipped skills are actually
  usable.

Milestone 4 acceptance details:

- every new skill candidate that reaches draft-ready state has generated eval
  fixtures or explicit no-eval rationale by risk tier
- positive, negative, ambiguous/cofire, compliance, workflow-contract,
  prompt-injection, sandbox, and cross-runtime fixture families exist where
  applicable
- trigger/resolver tests prove declared user-language triggers reach the
  intended skill and unrelated prompts do not route to it
- check-resolvable-style report identifies orphaned skills, missing resolver
  metadata, trigger overlap, intent gaps, missing evals, missing E2E, missing
  rollback, and package integrity drift where enforced
- review-only draft packages pass package E2E in fixture or shadow mode:
  loader sees the package, resolver considers it, agent reads `SKILL.md`, the
  expected output artifact is produced, and rollback/disable path is recorded
- model-owned review decides semantic eval fixture quality, ambiguous trigger
  intent, skill-vs-plan classification, and whether observed usage suggests
  improvement, merge, demotion, or no action
- deterministic code may execute fixtures, compare expected ids/routes,
  validate package files, and emit reports, but it must not infer semantic
  usefulness from scores, keywords, or telemetry

## Milestone 5 - Vetting, risk, and provenance integration

- Objective: classify generated or acquired skills by risk and promotion scope.
- Scope: scanner integration, dependency review, provenance, install policy,
  and blocked classes.
- Non-goals: no hidden broad enablement.
- Proof: generated reports include tier, autonomy ceiling, approval rules, and
  rollback plan.
- Safety gate: blocked classes fail closed.
- User-facing behavior: skill proposals come with a meaningful safety posture.

## Milestone 6 - Auto-draft and auto-test loop

- Objective: remove the user as bottleneck for low-risk draft generation and
  quality-gate execution.
- Scope: candidate-triggered branch/worktree draft generation, automatic
  vet/test/eval runs, generated eval additions from model-reviewed failures,
  and package E2E smoke runs.
- Non-goals: no broad install by default.
- Proof: low-risk candidate automatically drafts a package and returns green or
  red status.
- Safety gate: no live install or enablement without matching autonomy policy.
- User-facing behavior: fewer manual review steps before a candidate is ready.

## Milestone 7 - Canary and shadow mode

- Objective: exercise drafted skills in bounded scopes before wider promotion.
- Scope: session, agent, workspace, or shadow-only enablement with explicit
  canary metrics, disable path, and rollback artifact.
- Non-goals: no broad default rollout.
- Proof: canary results attach to the same canonical candidate/package id.
- Safety gate: automatic disable or demotion on failed canaries.
- User-facing behavior: new skills can prove themselves without wide blast
  radius.

## Milestone 8 - Low-risk auto-promotion

- Objective: allow some low-risk skills to promote without human review.
- Scope: instruction-only, no-script, no-network, no-credential,
  limited-scope promotion.
- Non-goals: no medium-risk or high-risk auto-promotion.
- Proof: passing tests, evals, resolver/trigger tests, check-resolvable-style
  health report, package E2E, vetting, and canary can auto-enable a low-risk
  skill in a limited scope with rollback metadata.
- Safety gate: broad/global enablement still gated.
- User-facing behavior: routine skill improvements appear automatically where
  safe.

## Milestone 9 - Codex/OpenClaw cross-runtime install

- Objective: keep one source-of-truth skill package and install it into both
  runtimes.
- Scope: OpenClaw workspace/shared/plugin adapters and Codex skills adapters.
- Non-goals: no unsafe wrapper divergence.
- Proof: same skill package is discoverable, triggerable, evaled, E2E-tested,
  and rollbackable in both runtimes with preserved provenance.
- Safety gate: compatibility checks and path recording required.
- User-facing behavior: successful skills travel between Codex and OpenClaw.

## Milestone 10 - Autonomous skill maintenance

- Objective: close the usage-based self-improvement loop while keeping semantic
  improvement judgment model-owned or operator-owned.
- Scope: bounded usage/failure/correction observation, model-reviewed repair or
  no-action decisions, stale candidate pruning, metadata drift repair, eval
  additions from failures, unused skill retirement proposals, merge/demotion
  proposals, and health reports.
- Non-goals: no silent high-risk mutation.
- Proof: maintenance jobs create bounded artifacts and repair opportunities.
- Safety gate: human-authored content is not auto-deleted.
- User-facing behavior: less skill rot and duplicate clutter.

Milestone 10 acceptance details:

- usage telemetry and feedback can trigger model review by structural cadence
  or explicit events, but cannot deterministically infer usefulness, promotion,
  retirement, merge, or repair
- each improvement proposal includes source refs, failure/use evidence, model
  rationale, changed evals or package patch, expected quality gate, and
  rollback path
- no-op/no-action is a valid model-reviewed outcome when evidence is weak
- successful maintenance changes rerun evals, resolver tests,
  check-resolvable-style report, package E2E, and canary checks before any
  promotion

## Milestone 11 - Skills Studio UI

- Objective: give one operator-facing place to inspect candidates, packages,
  risk, tests, canaries, and rollback.
- Scope: candidate list, status cards, provenance, install targets, and action
  controls.
- Non-goals: no new runtime authority model.
- Proof: same canonical ids across chat, heartbeat, inbox, and studio.
- Safety gate: diagnostics stay secondary to actionable surfaces.
- User-facing behavior: skill lifecycle becomes inspectable without digging
  through logs.

## Milestone 12 - Higher-autonomy review pass

- Objective: decide which lessons from skills automation can apply to broader
  runtime areas.
- Scope: review of autonomy ladder outcomes, failure modes, and safety posture.
- Non-goals: no automatic expansion by assumption.
- Proof: evidence-backed recommendation on broader automation.
- Safety gate: continue to forbid broad autonomous sending and unreviewed risky
  runtime mutation.
- User-facing behavior: none unless a later approved milestone expands scope.
