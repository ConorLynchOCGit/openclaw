# Memory System Docs

## Purpose

This folder is the canonical in-repo handoff pack for the OpenClaw memory middleware build.

The goal is to prevent loss of architectural context across:

- ChatGPT threads
- Codex sessions
- long implementation timelines
- repo evolution

These docs are the source of truth for the memory-system build unless explicitly superseded in writing here.

## Reading order

Read these files in order:

1. `README.md`
2. `ARCHITECTURE.md`
3. `memory-roadmap.md`
4. `feature-inventory.md`
5. `specs/README.md`
6. `CURRENT_SLICE.md`

Then consult as needed:

- `STATUS.md`
- `DECISIONS.md`
- `OPEN_QUESTIONS.md`
- `feature-inventory.md`
- `SCHEMA.md`
- `PLUGIN_CONTRACT.md`
- `SECURITY_AND_RETRIEVAL.md`
- `specs/README.md`
- `specs/semantic-event-detector.md`
- `specs/semantic-retrieval-routing.md`
- `specs/ambiguity-and-clarification.md`
- `specs/phrase-induction.md`
- `specs/behavior-application.md`
- `specs/user-repair-and-memory-control.md`
- `specs/response-style-profile.md`
- `specs/recurring-procedure-memory.md`
- `specs/workflow-improvement-memory.md`
- `specs/project-memory-expansion.md`
- `specs/unmet-need-planning.md`
- `specs/messy-language-eval.md`
- `specs/governance-surface-productionization.md`
- `specs/implementation-sequencing.md`
- `specs/canonical-four-kind-memory-migration.md`
- `specs/premortem.md`
- `specs/architecture-fit-review.md`
- `PRODUCTION_ADOPTION_PLAN.md`
- `PRODUCTION_READINESS_REVIEW.md`
- `AUTOMATION_READINESS_REVIEW.md`
- `OPERATIONAL_RUNBOOK.md`
- `PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`
- `PRODUCTION_ROLLOUT_REPORT.md`
- `PRODUCTION_SOAK_REPORT.md`
- `SHARED_NONPROD_PROVISIONING_PLAN.md`
- `SHARED_NONPROD_PROVISIONING_REPORT.md`
- `SHARED_ENV_REHEARSAL_REPORT.md`
- `STAGING_REHEARSAL_REPORT.md`
- `REAL_ENV_PASSIVE_READONLY_ROLLOUT_REPORT.md`
- `REAL_ENV_CANDIDATE_SUBMIT_ROLLOUT_REPORT.md`
- `REAL_ENV_CANDIDATE_REVIEW_ROLLOUT_REPORT.md`
- `REAL_ENV_CANDIDATE_MEMORY_PROMOTION_ROLLOUT_REPORT.md`
- `REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`
- `REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`
- `REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`
- `REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`
- `REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`
- `REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`
- `REAL_ENV_SKILL_CANDIDATE_INSTALL_ROLLOUT_REPORT.md`
- `REAL_ENV_PROACTIVE_PLAN_SCHEDULER_ROLLOUT_REPORT.md`
- `REAL_ENV_PROACTIVE_EXECUTE_DRIFT_CHECK_ROLLOUT_REPORT.md`
- `REAL_ENV_CONSOLIDATION_PLAN_SCHEDULER_ROLLOUT_REPORT.md`
- `REAL_ENV_CONSOLIDATION_EXECUTE_SCHEDULER_ROLLOUT_REPORT.md`

## Design summary

This build combines:

- Claude Code-style context survival
- Hermes-style durable learning
- OpenClaw-native plugin/skill boundaries
- strict vetting for third-party skills

The architecture is intentionally split into two planes:

### Context plane

Keeps long-running sessions cheap and stable.
Includes:

- persisted oversized tool results
- preview substitution
- microcompaction
- session memory
- full compaction fallback

### Knowledge plane

Stores durable, typed memory and learned behavior.
Includes:

- canonical durable memory kinds:
  - user memory
  - feedback memory
  - project memory
  - reference memory
- derived or compatibility-owned surfaces:
  - procedures
  - policies
  - skill candidates
  - vetted/installable skills

## Current transition posture

The current live implementation still uses several family-heavy bounded
surfaces.

That family-heavy shape is now explicitly transitional.

The target architecture is:

- 4 canonical durable memory kinds:
  - `User`
  - `Feedback`
  - `Project`
  - `Reference`
- family-specific behavior preserved only as:
  - metadata and facets
  - derived views
  - retrieval/advisory projections
  - compatibility adapters during migration

The canonical-core tranche is now also landed in repo code:

- canonical memory record/envelope types now live on the public plugin SDK
  surface
- canonical facet/metadata scaffolding now exists in code
- current family policy can now emit canonical-core-compatible records through
  explicit compatibility builders
- canonical ingestion candidate contracts now exist on the public plugin SDK
  surface
- the ordinary-turn resolver-backed capture path now emits canonical candidates
  through explicit compatibility adapters
- canonical retrieval-plan contracts now exist on the public plugin SDK
  surface, with the current retrieval hint/control plane now populating them as
  a transitional adapter layer

Multi-memory capture is now part of the current bounded implementation, but the
next major program is replacing the remaining rigid family-first seams with
generic adaptable ones.

## Rules of engagement

- Do not try to implement the entire system in one pass.
- Work in bounded slices.
- Reconcile with the actual repo before adding new structure.
- Update status/decisions/open questions after every slice.
- Do not rely on chat history when these docs are present.

## Current intended major components

- custom native plugin: `openclaw-memory-middleware`
- internal skills for:
  - memory middleware usage
  - procedure distillation
  - policy checks
  - session memory updates
  - skill procurement/vetting flow
- Supabase/Postgres backend for canonical structured storage
- optional file mirrors for inspectability
- later hybrid retrieval via FTS + trigram + pgvector + provenance reranking

## Third-party skill posture

These are currently intended as part of the broader plan, but should not be auto-installed:

- Skill Vetter
- self-improving-agent
- Proactive Agent (later and gated)
- optional sandbox evaluation of memory-related skills/plugins

All third-party skills must go through vetting before installation or promotion into normal use.

## Current workflow expectation

At the start of a new implementation session:

1. read these docs
2. read `feature-inventory.md`
3. read `specs/README.md`
4. read the current slice
5. audit the actual repo layout if needed
6. implement only the active slice
7. update status/decisions/open questions
