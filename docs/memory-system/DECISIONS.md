# Decisions

## Finalized decisions

### 1. Architecture split

The system is split into:

- context plane
- knowledge plane

Reason:
These are different jobs and should not be modeled as one undifferentiated memory layer.

---

### 2. Canonical backend

Supabase/Postgres is the canonical structured backend for the memory system.

Reason:
The system needs structured provenance, promotion state, policy gating, and secure retrieval.

---

### 3. File-backed docs remain important

Repo docs and optional workspace mirrors remain part of the design.

Reason:
The build should not rely on transient chat context. Inspectability matters.

---

### 4. Promotion model

Promotion path is:
event -> candidate memory -> approved memory -> procedure draft -> validated procedure -> skill candidate -> vetted skill -> installed skill

Reason:
Reusable behavior should be evidence-based and reviewable.

---

### 5. Third-party skill posture

Third-party skills are allowed as accelerators, but not as the canonical architecture.

Reason:
Core orchestration, policy, and provenance should remain in-house.

---

### 6. Intended third-party skills

Current intended sequence:

1. Skill Vetter
2. self-improving-agent
3. Proactive Agent later and gated

Reason:
This balances acceleration with control.

---

### 6A. Immediate third-party skill priority

Immediate onboarding preparation should prioritize:

1. Skill Vetter
2. `self-improving-agent`

Reason:
These two skills are the current near-term accelerators for procurement control
and learning-oriented improvement, while Proactive Agent remains intentionally
deferred.

---

### 7. Retrieval model

Retrieval should be hybrid:

- metadata/exact
- FTS/trigram
- vector
- provenance/graph reranking
- policy-aware filtering

Reason:
Vector-only retrieval is too weak for exact identifiers and policy-oriented retrieval.

---

### 8. Codex handoff model

The architecture should live in repo docs, with `AGENTS.md` as a dispatcher, and implementation should proceed in bounded slices.

Reason:
This reduces dependence on chat context and avoids context-window fragility.

---

### 9. Docs placement

The architecture pack should remain under `docs/memory-system/`.

Reason:
The repo already uses `docs/` as the canonical documentation tree, and the requested memory-system pack now exists there without conflicting with the current public docs layout.

---

### 10. Native plugin placement

The memory middleware should reuse the bundled plugin tree under `extensions/`.

Reason:
Bundled native plugins in this repo live under `extensions/<id>/` with `openclaw.plugin.json`, `package.json`, `index.ts`, and local `api.ts` or `runtime-api.ts` barrels where needed. A new top-level plugin directory would violate current repo structure.

---

### 10A. Final scaffold id for this effort

The scaffold extension id and path for this effort should be:

- plugin id: `memory-middleware`
- path: `extensions/memory-middleware`
- package name: `@openclaw/memory-middleware`

Reason:
This matches existing bundled plugin naming conventions better than the longer
`openclaw-memory-middleware` label while preserving the architecture name in
docs.

---

### 11. Companion skills placement

Companion internal skills should reuse plugin-relative `skills/` directories inside the owning bundled plugin package.

Reason:
This repo already supports plugin-local skills via manifest metadata and existing extension-owned examples. `.agents/skills` is for Codex or maintainer workflow skills, and root `skills/` is a separate published skill surface.

---

### 11A. Third-party skill authority posture

Skill Vetter and `self-improving-agent` are accelerators only.

Reason:
The repo's existing memory architecture remains authoritative until the custom
middleware is implemented. Third-party skills must not replace that substrate
or bypass approval and vetting.

---

### 11B. Mandatory first gate for external skills

Skill Vetter is the first mandatory gate before any externally sourced skill is
treated as approved for normal use.

Reason:
Normal approval requires a consistent repo-native vetting step across ClawHub,
GitHub or imported, and other externally sourced skills.

---

### 11B1. Skill Vetter install mechanism

The correct installation mechanism for external skills in this runtime context
is the existing Codex skill installer, which installs into `$CODEX_HOME/skills`.

Reason:
This reuses the supported agent skill path instead of inventing a repo-local or
plugin-local install mechanism for external skills.

---

### 11B2. Skill Vetter install state

Skill Vetter is installed as the first approved external skill for this effort.

Reason:
The procurement workflow now has its mandatory first gate available before
`self-improving-agent` or any other external skill is considered for normal
use.

---

### 11C. Third-party skill lifecycle

The standard lifecycle for externally sourced skills is:

- `discovered`
- `under_review`
- `vetted`
- `approved_limited`
- `approved_normal`
- `rejected`
- `quarantined`

Reason:
The memory-system effort needs explicit state transitions so installation,
limited trials, rejection, and quarantine are not handled informally.

---

### 11D. Minimum vetting outputs

Every third-party skill review must record:

- `source`
- `scope`
- `permissions_risk`
- `suspicious_patterns`
- `operational_fit`
- `approval_recommendation`

Reason:
Approval decisions need a consistent minimum evidence pack before any external
skill can move toward normal use.

---

### 11E. Install blocker policy

No third-party skill may be installed or treated as approved for normal use
while mandatory vetting is incomplete, unresolved red flags remain, or the
skill conflicts with the repo's authoritative memory architecture.

Reason:
Procurement policy must block unsafe or premature onboarding, not just describe
ideal review behavior.

---

### 11F. Self-improving-agent role

`self-improving-agent` is the first intended external learning-oriented skill,
but only in a bounded accelerator role.

Reason:
It can help propose learnings, corrections, and procedure candidates without
becoming the memory system of record.

---

### 11G. Self-improving-agent allowed outputs

The intended outputs from `self-improving-agent` are:

- candidate learnings
- correction capture suggestions
- procedure suggestions
- improvement notes

Reason:
These outputs fit the promotion pipeline as candidate material without granting
direct authority over durable memory or policy.

---

### 11H. Proactive execution must start with one low-risk action class only

The first proactive execution slice must execute only:

- `run_drift_check`

It may do so only by routing through the already-bounded drift-check execution
surface.

It must not execute:

- candidate review follow-ups
- procedure validation follow-ups
- skill-candidate governance follow-ups
- procurement or install follow-ups
- external messaging or any other external actions

---

### 11I. First real procurement enablement stays internal-only

The first real non-production procurement enablement step may expose only:

- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`

It must not expose:

- Skill Vetter handoff
- vetting-result recording
- approval-state mutation
- install handoff or install records
- scheduler, proactive, or self-improving execution

Reason:
The first procurement rollout should prove the bounded internal handoff pack
and one persisted procurement record before any later lifecycle or external
review surface is allowed in a real environment.

---

### 11J. First real vetting enablement stays pre-approval and manual-only

The first real non-production vetting enablement step may expose only:

- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`

It must not expose:

- approval planning or approval writes
- install handoff or install records
- scheduler, proactive, or self-improving execution
- automatic Skill Vetter invocation

Reason:
The first vetting rollout should prove the bounded manual handoff package and
one persisted manual vetting-result record before any approval or install
surface is allowed in a real environment.

Reason:
This preserves a narrow autonomy boundary and reuses an already-reviewed
low-risk write path before considering any broader proactive execution.

---

### 11H. Repo-native proactive planning posture

Any first proactive surface in the memory middleware must remain advisory-only.

That means it may:

- inspect bounded internal middleware state
- suggest explicit next-step follow-up opportunities
- identify affected ids, rationale, priority, action class, and approval class

It must not:

- execute follow-up actions automatically
- create rows, events, approvals, or install records
- message anyone
- invoke Skill Vetter
- install skills

Reason:
The memory system should support follow-through planning without broadening
into uncontrolled autonomy or hidden writes.

---

### 11H. Self-improving-agent guardrails

`self-improving-agent` must not:

- directly overwrite policy memory
- become the sole durable memory store
- bypass vetting or review
- introduce broad autonomous behavior

Reason:
The external skill should accelerate bounded distillation work, not redefine
policy, durable storage, or autonomy posture.

---

### 11I. Self-improving-agent vetting outcome

`self-improving-agent` is approved for limited use only.

Reason:
The reviewed candidate appears useful and not obviously malicious, but its
default posture is too broad for normal approval because it assumes direct file
logging, promotion into control files, optional hook usage, and a file-first
learning loop.

---

### 11J. Self-improving-agent install state after vetting

`self-improving-agent` remains uninstalled after vetting.

Reason:
The limited-use outcome does not justify immediate installation under the
current procurement policy and architecture guardrails.

---

### 11K. Wrapper-guidance sufficiency

Wrapper guidance alone is not sufficient for safe adoption of the raw upstream
`self-improving-agent` skill.

Reason:
The upstream package carries its own hook posture, file-promotion model, and
file-first learning loop assumptions. Installing it raw would still place those
behaviors on disk even if repo docs tried to narrow them later.

---

### 11L. Adoption recommendation

The adoption recommendation for `self-improving-agent` is:

- defer until the custom memory middleware plugin base exists

Reason:
The plugin base is the right repo-native seam for candidate-only capture and
reviewed promotion. Before that seam exists, raw installation is too broad and
wrapper guidance alone is too weak.

---

### 11M. Expected future adoption shape

If `self-improving-agent` is adopted later, it will likely require a reduced
profile fork or adaptation rather than raw upstream installation.

Reason:
The acceptable subset is narrower than the upstream default posture and should
exclude direct file-authority, hook-default, and control-file-promotion
behavior.

---

### 11N. Reduced-profile outputs

If `self-improving-agent` is later forked or adapted, the retained outputs
should be limited to:

- candidate learnings
- correction capture suggestions
- procedure suggestions
- improvement notes

Reason:
These are the only outputs that fit the intended accelerator role without
granting direct authority over durable memory, policy, or skill promotion.

---

### 11O. Reduced-profile write posture

If `self-improving-agent` is later forked or adapted, it should write only to
future candidate-only seams owned by the custom memory middleware plugin base.

Reason:
Direct writes to control files, policy surfaces, or durable memory authority
targets would reintroduce the same architectural problems found in the raw
upstream skill.

---

### 11P. Required upstream removals

Any later fork or adaptation of `self-improving-agent` must remove or
neutralize:

- `.learnings/` as the primary durable storage model
- control-file promotion guidance
- hook enablement as default workflow
- skill-extraction behavior as default adjacent behavior

Reason:
Those behaviors are the core reasons raw upstream installation is not acceptable
in this repo architecture.

---

### 11Q. First reduced-profile adaptation shape

The first repo-native reduced-profile self-improving implementation should be a
middleware-owned adapter that emits only candidate-state artifacts.

Reason:
This preserves the useful learning-oriented subset without installing the raw
upstream skill or creating ambiguity about which workflow is authoritative.

---

### 11R. Reduced-profile adaptation provenance posture

The reduced-profile self-improving adapter should preserve explicit provenance
inside candidate metadata showing that the candidate came from the bounded
repo-native adaptation.

Reason:
Reviewers need to distinguish ordinary candidate submissions from candidate
material that originated in the constrained self-improving path.

---

### 11Q. Plugin-base posture

The `memory-middleware` plugin base must remain a regular non-exclusive bundled
plugin during scaffold work.

Reason:
This preserves the existing memory runtime architecture and avoids claiming the
exclusive memory slot before the new middleware is implemented and reviewed.

---

### 11R. Initial tool posture

The initial `memory-middleware` tool registry should remain empty.

Reason:
The current slice is establishing code structure only. Registering agent tools
before the runtime, review, and database flows exist would create accidental
behavior instead of a bounded scaffold.

---

### 11S. Initial DB posture

The initial DB access layer should be a typed query skeleton only.

Reason:
The repo needs a stable seam for future database-backed work, but this slice
must not introduce durable writes, migration execution, or hidden runtime
behavior.

---

### 11T. Candidate-only seam posture

Future external learning emitters should target candidate-only ingress seams
owned by the `memory-middleware` plugin base.

Reason:
This preserves the distinction between accelerator outputs and canonical memory
state while giving later integrations a stable repo-native entry point.

---

### 11U. Canonical DB ownership

Database-backed work for the memory system should live under the
`memory-middleware` extension subtree.

Canonical path:

- `extensions/memory-middleware/db/`

Reason:
There is no existing repo-wide SQL or Supabase migration convention to reuse,
and the DB work belongs to the same bounded ownership surface as the native
memory middleware plugin.

---

### 11V. Canonical migration root

The canonical migration directory for the memory middleware backend should be:

- `extensions/memory-middleware/db/migrations/`

Reason:
This keeps migrations colocated with the plugin-owned DB access layer and avoids
inventing a misleading top-level backend system before one actually exists.

---

### 11W. Migration naming convention

The migration naming convention for memory middleware backend work should be:

- `YYYYMMDD_HHMMSS_memory_middleware_schema_v1.sql`
- `YYYYMMDD_HHMMSS_memory_middleware_security_retrieval.sql`

Reason:
Timestamp ordering is explicit and review-friendly, and the stable
`memory_middleware_*` slug keeps migration purpose clear.

---

### 11X. Initial migration posture

This slice should create placement and naming only, not executable migration
SQL.

Reason:
The repo did not previously contain a migration convention for this backend, so
it is better to establish the location first and avoid locking in bad SQL
assumptions prematurely.

---

### 11Y. Schema namespace

The memory middleware backend tables should live in the dedicated
`memory_middleware` Postgres schema namespace.

Reason:
The schema-v1 foundation includes generic table names such as `projects`,
`agents`, and `sessions`. A dedicated namespace avoids collisions with future
repo-wide backend work while keeping the migration executable.

---

### 11Z. First migration draft scope

The first executable migration draft should include only schema-v1 foundation:

- core enums
- foundation tables
- supporting indexes
- helper trigger and function support

It should exclude:

- RLS
- auth helper tables
- retrieval RPCs or search functions
- pgvector embeddings

Reason:
This keeps the first migration aligned with the agreed schema-v1 boundary and
avoids pulling later security and retrieval work into the initial foundation
draft.

---

### 11ZA. Candidate event naming

Candidate-originated event rows should use the generic event label
`candidate_submission` rather than a learning-specific event label.

Reason:
The first candidate-only tool surface is expected to handle learnings,
corrections, procedure suggestions, and improvement notes. A generic event kind
fits that surface better and avoids premature enum sprawl.

---

### 11ZB. Schema-v1 readiness for candidate-only ingress

After the schema review and refinement pass, schema-v1 is considered ready for
the first candidate-only tool surface.

Reason:
The remaining changes were minor and focused: candidate-event naming,
provenance/link constraints, and review-oriented indexes. No deeper table split
or new table family was required before tool work can begin.

---

### 12. Test placement

Plugin-specific tests should stay colocated with the owning extension package.

Reason:
The repo convention is colocated `*.test.ts`, and existing bundled plugins already follow that pattern.

---

### 13. Migration posture

There is no existing Supabase or Postgres migration tree to reuse.

Reason:
Current memory infrastructure is file-backed and SQLite or LanceDB based. Any DB-backed memory middleware work will introduce a new backend subtree and should do so deliberately instead of pretending a migration convention already exists.

---

### 14. Existing memory overlap

The new middleware must be designed against the existing memory surfaces:

- `extensions/memory-core`
- `extensions/memory-lancedb`
- `packages/memory-host-sdk`
- `docs/concepts/memory.md`
- the bundled `session-memory` hook

Reason:
This repo already has a real memory architecture. The new middleware is not being added into an empty space.

---

### 15. First candidate-only tool surface

The first implemented middleware tool surface is:

- `memory_candidate_submit`

Reason:
The first live seam should be explicitly candidate-only and should not overload
the later stable tool contract for broader memory capture or review flows.

---

### 15A. First candidate-only tool scope

`memory_candidate_submit` accepts only:

- candidate learnings
- correction suggestions
- procedure suggestions
- improvement notes

Reason:
These are the bounded submission kinds already approved for candidate-only
acceleration and they avoid creating approved memory or review side effects.

---

### 15B. First candidate-only write posture

The first candidate-only tool surface must not create approved memory or bypass
review. It may only target candidate-state persistence seams.

Reason:
The first real ingress path should be safe for future internal or external
emitters without granting any memory-authority shortcut.

---

### 15C. First candidate-only DB fallback behavior

When the memory middleware DB runtime is unavailable, the candidate-only tool
surface should return explicit non-success outcomes:

- `not_configured` when no DB URL exists
- `failed` when DB configuration exists but the database cannot be reached or a
  constraint-safe insert cannot complete

Reason:
The first ingress seam should fail clearly instead of pretending persistence
succeeded or silently dropping candidate data.

---

### 15D. First live candidate-only write path

The first real database-backed candidate submission path should write only:

- one `memory_events` row
- one `memory_objects` row with `review_state = candidate`
- one `memory_sources` row linking the memory object back to the event

Reason:
This is the least-authoritative durable shape that still gives the middleware a
real candidate-only ingress seam with provenance.

---

### 15E. First live candidate-only validation environment

The controlled validation environment for the first live candidate-only write
path should be a disposable Docker `postgres:16` container driven by extension
integration tests.

Reason:
The repo does not have a shared Postgres harness, local `psql` is not required
for the extension, and the first validation slice should stay self-contained.

---

### 15F. First candidate-only query surface

The first implemented middleware candidate query tools are:

- `memory_candidate_list`
- `memory_candidate_get`

Reason:
The first read surface should stay narrowly aligned with the candidate-only
submission seam so submitted candidates can be inspected without turning the
middleware into a general retrieval API.

---

### 15G. Candidate-only query posture

The candidate query surface must expose only candidate-state rows linked to
`candidate_submission` events.

Reason:
The first read tools are meant for inspection of unapproved candidate material,
not for approved-memory access, retrieval ranking, or broader memory authority.

---

### 15H. First candidate-only read mapping

The first candidate-only read path should read from:

- `memory_objects`
- joined to `memory_events`
- with provenance remaining attributable through `memory_sources`

Reason:
This is the least-authoritative safe read shape that matches the first live
candidate-only write path and keeps candidate inspection aligned with the
existing schema-v1 table boundaries.

---

### 15I. First candidate review mutation surface

The first implemented middleware candidate review tool is:

- `memory_candidate_review`

Reason:
The first review mutation surface should stay tightly bounded to candidate-only
review handling and should not trigger promotion, retrieval, or broader memory
authority changes.

---

### 15J. Supported candidate review outcomes

The first candidate review mutation surface supports only:

- `accepted`
- `rejected`
- `needs_revision`

Reason:
These outcomes are enough to record bounded review decisions without opening
the full approved-memory or promotion workflow surface.

---

### 15K. Accepted review posture

An `accepted` candidate review records a review outcome, but it does not change
the memory object's durable state to `approved` in this slice.

Reason:
The slice must not create approved memory. Review acceptance is therefore
record-only until a later approved-memory or promotion slice explicitly exists.

---

### 15L. Rejected and needs-revision posture

`rejected` and `needs_revision` candidate reviews may move the memory object out
of active candidate state, while still remaining bounded to review-only
handling.

Reason:
Those outcomes need to remove or downgrade candidate material without creating
approved memory or follow-on artifacts.

---

### 15M. First candidate review write mapping

The first candidate review mutation path should write:

- one `memory_reviews` row for every recorded review outcome
- an updated `memory_objects.review_state` only for:
  - `rejected`
  - `needs_revision`

Reason:
This is the least-authoritative safe mutation shape that preserves rationale
and provenance without triggering promotion.

---

### 15N. First manual promotion planning surface

The first implemented middleware manual promotion planning tool is:

- `memory_candidate_promote_plan`

Reason:
The first promotion-related surface should stay advisory-only so reviewed
candidates can be assessed without creating approved memory, procedures, or
skills.

---

### 15O. Supported manual promotion planning outcomes

The first manual promotion planning surface supports only:

- `remain_candidate_only`
- `propose_memory_promotion`
- `propose_procedure_draft`

Reason:
These outcomes are enough to describe likely next-step destinations without
opening any promotion-write behavior.

---

### 15P. Promotion-planning eligibility posture

Only candidates with an accepted review outcome are eligible for nontrivial
promotion planning targets in this slice.

Reason:
Unreviewed, rejected, or needs-revision candidates should stay advisory-only
and should not imply readiness for memory or procedure promotion.

---

### 15Q. Accepted reviewed planning shape

Accepted reviewed candidates may return advisory targets as follows:

- `procedure` candidates:
  - `propose_procedure_draft`
  - `remain_candidate_only`
- `learning`
  - `propose_memory_promotion`
  - `remain_candidate_only`
- `correction`
  - `propose_memory_promotion`
  - `remain_candidate_only`
- `improvement`
  - `propose_memory_promotion`
  - `remain_candidate_only`

Reason:
This keeps planning concrete enough for manual evaluation while still avoiding
any automatic or authoritative promotion.

---

### 15R. Promotion-planning read posture

The manual promotion planning surface must be read-only and should inspect:

- the candidate row
- its current review state
- its latest review outcome

Reason:
Planning should depend on existing candidate and review evidence, not create
new durable artifacts in this slice.

---

### 15S. First bounded promotion-write surface

The first implemented promotion-write tool is:

- `memory_candidate_promote_memory`

Reason:
The first promotion write should stay narrow and explicit: one reviewed
candidate may be promoted into bounded durable memory without opening
procedure, skill, or automatic downstream workflows.

---

### 15T. Bounded memory-promotion eligibility

Only accepted reviewed non-procedure candidates are eligible for the first
bounded memory-promotion write.

Reason:
This keeps the first write path aligned with the existing planning rules while
leaving procedure-draft work for a later slice.

---

### 15U. First bounded memory-promotion write mapping

The first bounded memory-promotion write should create:

- one approved durable-memory row in `memory_objects`
- one event provenance row in `memory_sources`
- one review provenance row in `memory_sources`
- one `derived_from` edge in `memory_links`

It should not mutate the original candidate row into approved state.

Reason:
Materializing a separate approved durable-memory row preserves the candidate
history, keeps provenance explicit, and avoids collapsing review capture with
promotion.

---

### 15V. Repeat-promotion safety posture

Repeated bounded promotion attempts for the same candidate should resolve to the
already promoted durable-memory row instead of creating duplicates.

Reason:
The first write path should be idempotent enough for safe manual use even
before richer promotion lifecycle controls exist.

---

### 15W. First bounded procedure-draft promotion-write surface

The first implemented procedure-draft promotion-write tool is:

- `memory_candidate_promote_procedure`

Reason:
Procedure candidates need a separate explicit path from durable-memory
promotion so draft procedures can be created without silently broadening into
validated procedures or skill-candidate creation.

---

### 15X. Bounded procedure-draft promotion eligibility

Only accepted reviewed procedure candidates are eligible for the first bounded
procedure-draft promotion write.

Reason:
This keeps the write path aligned with the existing planning rules and avoids
mixing non-procedure candidate kinds into the procedure layer.

---

### 15Y. First bounded procedure-draft promotion write mapping

The first bounded procedure-draft promotion write should create:

- one draft row in `procedures`
- one provenance edge in `memory_links` from the candidate to the procedure

It should record candidate, source-event, and accepted-review provenance in the
procedure metadata, and it should not create skill candidates or validated
procedures.

Reason:
This is the least-authoritative safe procedure write shape that preserves
review evidence while keeping later procedure validation and skill promotion
explicit.

---

### 15Z. First validated-procedure planning surface

The first implemented validated-procedure planning tool is:

- `memory_procedure_validate_plan`

Reason:
Validated-procedure planning should exist before any validation write path so
draft procedures can be evaluated with provenance and review context while the
workflow remains advisory-only.

---

### 15AA. Supported validated-procedure planning outcomes

The first validated-procedure planning surface supports only:

- `remain_draft_only`
- `propose_validated_procedure`

Reason:
These outcomes are enough to express whether a bounded draft is ready for a
later validation-write slice without opening skill promotion or downstream
automation.

---

### 15AB. Validated-procedure planning eligibility posture

Only draft procedures backed by an accepted reviewed procedure candidate and
preserved promotion provenance are eligible for `propose_validated_procedure`.

Reason:
This keeps the first planning surface grounded in bounded candidate review and
procedure-draft provenance instead of treating every draft procedure as
implicitly validation-ready.

---

### 15AC. Validated-procedure planning read posture

The validated-procedure planning surface must be read-only and should inspect:

- the draft procedure row
- the source candidate link
- the latest candidate review outcome
- accepted-review and source-event provenance carried forward from the bounded
  procedure-promotion path

Reason:
Planning should evaluate existing evidence only. It should not create
procedure runs, validated procedures, or skill candidates in this slice.

---

### 15AD. First bounded validated-procedure write surface

The first implemented validated-procedure write tool is:

- `memory_procedure_validate`

Reason:
The first validation write should stay narrow and explicit: one eligible draft
procedure may be marked validated without opening skill promotion or automatic
downstream workflows.

---

### 15AE. Bounded validated-procedure eligibility

Only draft procedures that are eligible for
`propose_validated_procedure` under the advisory planning rules are eligible
for the first bounded validated-procedure write.

Reason:
This keeps the first write path aligned with the existing planning rules and
prevents validation from bypassing candidate review and bounded procedure
provenance requirements.

---

### 15AF. First bounded validated-procedure write mapping

The first bounded validated-procedure write should create:

- one `passed` row in `procedure_runs`
- one `validated` status transition on `procedures`

It should preserve validation rationale in the procedure run and record bounded
validation metadata on the procedure row. It should not create skill
candidates or other follow-on artifacts.

Reason:
This is the least-authoritative safe validation shape that records evidence of
validation without silently widening into skill promotion or background
automation.

---

### 15AG. Repeat-validation safety posture

Repeated bounded validation attempts for the same procedure should resolve to
the existing validated procedure instead of creating duplicate validation runs.

Reason:
The first validation write path should be idempotent enough for safe manual use
before richer procedure lifecycle controls exist.

---

### 15AH. First skill-candidate planning surface

The first implemented skill-candidate planning tool is:

- `memory_skill_candidate_plan`

Reason:
Skill-candidate planning should exist before any skill-candidate write path so
validated procedures can be evaluated with evidence and provenance while the
workflow remains advisory-only.

---

### 15AI. Supported skill-candidate planning outcomes

The first skill-candidate planning surface supports only:

- `remain_validated_procedure_only`
- `propose_skill_candidate`

Reason:
These outcomes are enough to express whether a validated procedure is ready for
a later skill-candidate slice without opening installation or downstream
automation.

---

### 15AJ. Skill-candidate planning eligibility posture

Only validated procedures with preserved bounded candidate lineage and a passed
validation run are eligible for `propose_skill_candidate`.

Reason:
This keeps the first planning surface grounded in bounded validation evidence
instead of treating every validated procedure as automatically ready for skill
promotion.

---

### 15AK. Skill-candidate planning read posture

The skill-candidate planning surface must be read-only and should inspect:

- the validated procedure row
- preserved candidate lineage from the bounded procedure path
- the latest validation-run outcome

Reason:
Planning should evaluate existing evidence only. It should not create skill
candidates or installation artifacts in this slice.

---

### 15AL. First skill-candidate write surface

The first implemented skill-candidate write tool is:

- `memory_skill_candidate_create`

Reason:
Once the advisory planning surface exists, the next bounded step is a manual
write path that can materialize one reviewable `skill_candidates` row without
jumping straight to procurement or installation.

---

### 15AM. Skill-candidate creation eligibility posture

Only procedures that already qualify for `propose_skill_candidate` are
eligible for the bounded skill-candidate write path.

Reason:
The write path should reuse the existing advisory planner instead of inventing
a second eligibility model that could drift from the bounded validation and
provenance requirements.

---

### 15AN. Skill-candidate creation write posture

The first skill-candidate write path should:

- create one `candidate` row in `skill_candidates`
- preserve bounded procedure, candidate, review, event, and validation-run
  lineage in metadata
- return `already_created` on repeat creation for the same source procedure

Reason:
This is the least-authoritative safe write shape that records a reviewable
skill-candidate artifact without installing skills or triggering procurement
automation.

---

### 15AO. First procurement-handoff planning surface

The first implemented procurement-handoff planning tool is:

- `memory_skill_candidate_procurement_plan`

Reason:
Bounded internal `skill_candidates` need a repo-native bridge into the
documented procurement workflow before any explicit vetting or installation
slice is attempted.

---

### 15AP. Procurement-handoff planning outcomes

The first procurement-handoff planning surface supports only:

- `remain_internal_skill_candidate_only`
- `propose_procurement_handoff`

Reason:
These outcomes are enough to express whether a bounded internal skill candidate
is ready to enter the documented procurement workflow without triggering
automation.

---

### 15AQ. Procurement-handoff planning eligibility posture

Only bounded internal `skill_candidates` with preserved procedure, candidate,
review, event, and validation lineage are eligible for
`propose_procurement_handoff`.

Reason:
The procurement bridge should only hand off artifacts that remain traceable to
the bounded internal promotion flow and a passed validation run.

---

### 15AR. Procurement-handoff planning read posture

The procurement-handoff planning surface must be read-only and should inspect:

- the bounded `skill_candidates` row
- the source procedure link
- preserved lineage fields in skill-candidate metadata
- the latest validation-run outcome

Reason:
This slice prepares procurement context only. It should not invoke Skill
Vetter, mutate procurement state, or install skills.

---

### 15AS. Procurement handoff payload shape

Eligible procurement handoff plans should return structured fields aligned to
the documented procurement workflow:

- `source`
- `scope`
- `permissions_risk`
- `suspicious_patterns`
- `operational_fit`
- `approval_recommendation`

Reason:
The bridge should speak the same language as the procurement policy so later
vetting slices can reuse the handoff output instead of translating an ad hoc
planner format.

---

### 15AT. First procurement-record write surface

The first implemented procurement-record write tool is:

- `memory_skill_candidate_procurement_record_create`

Reason:
Once the procurement-handoff planner exists, the next bounded step is a manual
internal record write that can persist the handoff output without invoking
Skill Vetter or automating lifecycle changes.

---

### 15AU. Procurement-record write posture

The first procurement-record write path should:

- create one internal `memory_events` row
- use `event_name = skill_candidate.procurement_record`
- preserve the full structured handoff payload in event `payload`
- preserve bounded lineage and recorder metadata in event `metadata`
- return `already_created` on repeat creation for the same skill candidate

Reason:
This is the least-authoritative safe record shape that persists procurement
context without introducing a new schema table, install behavior, or approval
automation.

---

### 15AV. Procurement-record eligibility posture

Only skill candidates that already qualify for `propose_procurement_handoff`
are eligible for the bounded procurement-record write path.

Reason:
The write path should reuse the advisory procurement planner instead of
creating a second eligibility model that could drift from the documented
handoff rules.

---

### 15AW. First manual Skill Vetter handoff surface

The first implemented manual Skill Vetter handoff tool is:

- `memory_skill_candidate_skill_vetter_handoff`

Reason:
Once the bounded procurement record exists, the next safe step is an advisory
handoff surface that prepares manual Skill Vetter review without invoking the
skill automatically or changing approval state.

---

### 15AX. Manual Skill Vetter handoff outcomes

The first manual Skill Vetter handoff surface supports only:

- `remain_internal_only`
- `propose_skill_vetter_handoff`

Reason:
This keeps the handoff surface tightly bounded around whether a skill candidate
is ready for manual vetting review, without implying install or approval
progress.

---

### 15AY. Manual Skill Vetter handoff eligibility posture

Only bounded internal `skill_candidates` that:

- remain in `candidate` state
- preserve validated procedure, candidate, review, event, and validation
  lineage
- already have a persisted internal procurement record

are eligible for `propose_skill_vetter_handoff`.

Reason:
Manual Skill Vetter handoff should build on the existing procurement bridge and
should not bypass the internal procurement-record checkpoint.

---

### 15AZ. Manual Skill Vetter handoff read posture

The manual Skill Vetter handoff surface must be read-only and should inspect:

- the bounded `skill_candidates` row
- the source procedure link
- preserved lineage fields in skill-candidate metadata
- the latest validation-run outcome
- the latest internal procurement record event

Reason:
This slice prepares manual vetting context only. It should not invoke Skill
Vetter, mutate approval state, or install skills.

---

### 15BA. Manual Skill Vetter handoff package shape

Eligible manual Skill Vetter handoffs should return:

- the procurement record identifier and timestamp
- the preserved structured procurement handoff payload
- a `manualSkillVetterInputs` object aligned to the minimum vetting outputs
- explicit manual steps
- explicit install guardrails

Reason:
The handoff should be directly usable by a later human-reviewed Skill Vetter
slice without forcing another translation layer or losing bounded lineage.

---

### 15BB. First manual vetting-result write surface

The first implemented manual vetting-result write tool is:

- `memory_skill_candidate_vetting_result_record`

Reason:
Once the manual Skill Vetter handoff exists, the next bounded step is an
internal record write that can persist the manual review outcome without
invoking Skill Vetter again or mutating approval state.

---

### 15BC. Manual vetting-result write posture

The first manual vetting-result write path should:

- create one internal `memory_events` row
- use `event_name = skill_candidate.vetting_result`
- preserve the procurement record id and structured handoff package in event
  `payload`
- preserve the manual decision and structured vetting result fields in event
  `payload`
- preserve bounded lineage and reviewer metadata in event `metadata`
- return `already_created` on repeat creation for the same skill candidate

Reason:
This is the least-authoritative safe record shape that persists manual vetting
results without introducing install behavior, approval automation, or a new
schema table.

---

### 15BD. Manual vetting-result eligibility posture

Only skill candidates that already qualify for
`propose_skill_vetter_handoff` are eligible for the bounded manual
vetting-result write path.

Reason:
The write path should reuse the manual Skill Vetter handoff planner instead of
creating a second eligibility model that could drift from the documented
handoff rules.

---

### 15BE. First approval and install planning surface

The first implemented approval and install planning tool is:

- `memory_skill_candidate_approval_plan`

Reason:
Once the bounded manual vetting-result record exists, the next safe step is an
advisory planning surface that can inspect bounded vetting context and decide
whether later limited-use or normal-use approval could be proposed without
mutating approval state or installing skills.

---

### 15BF. Approval and install planning outcomes

The first approval and install planning surface supports only:

- `remain_internal_only`
- `propose_approved_for_limited_use`
- `propose_approved_for_normal_use`
- `remain_blocked`

Reason:
This keeps the surface tightly bounded around whether a skill candidate is
ready for later approval or install consideration, without implying that any
approval-state mutation or installation has already happened.

---

### 15BG. Approval and install planning eligibility posture

Only bounded internal `skill_candidates` that:

- remain in `candidate` state
- preserve validated procedure, candidate, review, event, and validation
  lineage
- already have a persisted internal procurement record
- already have a persisted internal manual vetting-result record with a
  supported bounded approval recommendation

are eligible for limited-use or normal-use approval planning.

Reason:
Approval planning should build on the existing procurement and manual vetting
checkpoints instead of bypassing them or inventing a separate eligibility
model.

---

### 15BH. Approval and install planning read posture

The approval and install planning surface must be read-only and should inspect:

- the bounded `skill_candidates` row
- the source procedure link
- preserved lineage fields in skill-candidate metadata
- the latest validation-run outcome
- the latest internal procurement record event
- the latest internal vetting-result event

Reason:
This slice prepares later approval or install decisions only. It should not
mutate approval state, invoke Skill Vetter, or install skills.

---

### 15BI. First bounded approval-state write surface

The first implemented approval-state write tool is:

- `memory_skill_candidate_approve`

Reason:
Once advisory approval planning exists, the next safe step is a bounded write
surface that can persist internal approval state without implying install or
downstream automation.

---

### 15BJ. Approval-state write posture

The first approval-state write path should:

- create one internal `memory_events` row
- use `event_name = skill_candidate.approval`
- update `skill_candidates.status` to either `approved_limited` or
  `approved_normal`
- preserve approval scope, approver identity, install guardrails, and bounded
  procurement and vetting lineage
- return `already_approved` on repeat approval for the same bounded skill
  candidate

Reason:
This is the least-authoritative safe write shape that persists internal
approval state without installing skills or automating the next lifecycle
step.

---

### 15BK. Approval-state eligibility posture

Only skill candidates that already qualify for:

- `propose_approved_for_limited_use`, or
- `propose_approved_for_normal_use`

under the advisory approval planning rules are eligible for the bounded
approval-state write path.

Reason:
The write path should reuse the bounded approval planner instead of inventing a
second eligibility model that could drift from the documented approval rules.

---

### 15BL. First manual install handoff surface

The first implemented manual install handoff tool is:

- `memory_skill_candidate_install_handoff`

Reason:
Once bounded internal approval state exists, the next safe step is an
advisory-only handoff surface that can prepare a separate manual install step
without installing skills or mutating installed-skill state.

---

### 15BM. Manual install handoff outcomes

The first manual install handoff surface supports only:

- `remain_approved_internal_only`
- `propose_manual_install_handoff`

Reason:
This keeps the surface tightly bounded around whether an approved internal
skill candidate is ready for a separate manual install step, without implying
that installation has already happened.

---

### 15BN. Manual install handoff eligibility posture

Only bounded internal `skill_candidates` that:

- are in `approved_limited` or `approved_normal` state
- preserve validated procedure and bounded lineage context
- already have procurement and manual vetting records
- already have a bounded approval record with explicit install guardrails

are eligible for `propose_manual_install_handoff`.

Reason:
Manual install handoff should build on the existing bounded approval flow and
should not bypass internal approval-state recording.

---

### 15BO. Manual install handoff read posture

The manual install handoff surface must be read-only and should inspect:

- the approved `skill_candidates` row
- the latest internal approval record event
- the latest internal procurement and vetting events
- the source procedure link
- the latest validation-run outcome

Reason:
This slice prepares manual install context only. It should not install skills
or mutate installed-skill state.

---

### 15BP. First bounded live retrieval surface

The first implemented live retrieval tools are:

- `memory_object_list`
- `memory_object_get`
- `memory_object_search_basic`

Reason:
The middleware now has enough bounded durable state to justify a first
read-only retrieval surface without jumping to full hybrid retrieval.

---

### 15BQ. First bounded live retrieval posture

The first live retrieval surface should support:

- approved durable `memory_objects` by default
- candidate `memory_objects` only when an explicit retrieval scope requests
  them
- validated `procedures` only when an explicit retrieval scope requests them
- exact get, bounded list, and basic text search only

Reason:
This keeps the first retrieval slice narrow, inspectable, and compatible with
the earlier bounded candidate and promotion work.

---

### 15BR. First bounded live retrieval implementation posture

The first live retrieval surface should remain direct plugin-owned reads over
the existing schema instead of waiting for hybrid retrieval RPCs.

Reason:
The repo now needs a real read path over stored bounded objects, and the
security/retrieval migration is still drafted only. A direct bounded read seam
lets implementation move forward without pretending the future RPC layer
already exists.

---

### 15BS. Candidate and validated-procedure exposure rule

Candidate objects and validated procedures must remain hidden unless the caller
explicitly requests a retrieval scope that includes them.

Reason:
Approved durable memory is the safe default surface. Candidate and
procedure-specific reads should require explicit intent.

---

### 15BT. First bounded ranked retrieval upgrade

The first bounded ranked retrieval tool is:

- `memory_object_search_hybrid`

Reason:
The middleware needed a better-ranked search path without changing the basic
search semantics that already existed.

---

### 15BU. First bounded ranked retrieval posture

The ranked retrieval upgrade should:

- rank approved durable memory objects by bounded text heuristics
- optionally include validated procedures when explicitly requested
- keep candidate rows behind the same explicit retrieval-scope rule
- remain read-only and non-semantic

Reason:
This improves usefulness without pretending the full security-aware hybrid
retrieval design is already implemented.

---

### 15BV. First bounded ranked retrieval implementation rule

The first ranked retrieval pass should use bounded exact, prefix, and
substring-style weighting instead of the drafted FTS, trigram, or vector
substrate.

Reason:
The security/retrieval migration is still drafted only. A bounded SQL ranking
layer lets retrieval improve now without executing that migration early.

---

### 16. Second migration placement and naming

The second migration draft for this backend should be:

- `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

Reason:
The canonical extension-owned migration subtree and timestamped
`memory_middleware_*` naming convention are already established, so the
security/retrieval substrate should follow the same ordering and ownership
pattern.

---

### 16A. Security and retrieval substrate scope

The second migration should include only substrate for later safe access and
hybrid retrieval, including:

- helper principal and membership tables
- RLS helper functions and policies
- curated internal views
- FTS and trigram support
- the `memory_embeddings` side table
- embedding-oriented background-job support

Reason:
These pieces establish protected access patterns and retrieval foundations
without prematurely wiring runtime retrieval tools.

---

### 16B. Second migration execution posture

The second migration remains drafted only in this slice and is not executed.

Reason:
This slice is for durable placement and reviewable SQL drafting only. Live
execution and validation belong in a later controlled database-validation
slice.

---

### 16C. Controlled validation posture for the second migration

The security and retrieval migration should be validated only in a disposable
local Postgres environment before any production execution is considered.

Reason:
This keeps the substrate testable and reviewable without changing production
runtime behavior or claiming the memory slot.

---

### 16D. Disposable validation environment choice

The disposable validation lane should run on a pgvector-capable Postgres image.

Reason:
The drafted second migration includes `create extension if not exists vector`
and a real `memory_embeddings` side table, so the local validation environment
must be able to apply that substrate as drafted.

---

### 16E. Validation scope for the second migration

Controlled validation of the second migration should confirm:

- helper auth and membership tables
- RLS enablement and policy creation
- curated internal view creation
- generated search-document columns and retrieval indexes
- helper principal-resolution and access-check functions
- the `memory_embeddings` side table
- continued compatibility with the existing bounded middleware read and write
  paths

Reason:
The goal of this slice is to validate the drafted substrate and catch narrow
migration issues before later runtime or retrieval work depends on it.

---

### 16F. Runtime retrieval adoption posture

Once the second migration is validated locally, the bounded live retrieval
layer should adopt the validated substrate incrementally instead of continuing
to rely only on direct table reads and ad hoc text matching.

Reason:
The curated approved-memory view, generated `search_document` columns, and
validated FTS plus trigram indexes already express the intended safe retrieval
shape for the current bounded tool set.

---

### 16G. Approved-only retrieval source

Approved-only `memory_object_get` and `memory_object_list` should read through
`memory_middleware.internal_approved_memory_v`.

Reason:
That view is the validated curated surface for approved durable memory and it
aligns the live retrieval path with the documented security posture.

---

### 16H. Bounded search substrate

`memory_object_search_basic` and `memory_object_search_hybrid` should use the
validated FTS and trigram substrate for approved memory and explicitly
requested validated procedures while keeping candidate scope explicit.

Reason:
This improves retrieval consistency and ranking quality without introducing
vector or semantic retrieval in the current slice.

---

### 16I. Formalized bounded retrieval surfaces

The live bounded retrieval layer should expose three explicit read surfaces:

- `approved_memory_view`
- `reviewable_candidates_view`
- `validated_procedure_read_model`

Reason:
The runtime should make it clear which safe surface each retrieval result came
from instead of collapsing approved memory, candidate inspection, and validated
procedures into one implicit table-reading path.

---

### 16J. Candidate retrieval posture

Explicit candidate retrieval should read through
`memory_middleware.internal_reviewable_candidates_v`, but remain bounded to
candidate-state rows in the current tool surface.

Reason:
This adopts the validated curated review surface without silently widening the
existing `include_candidates` scope into corrected or rejected review rows.

---

### 16K. Validated procedure retrieval posture

Validated procedures should continue to use a stable query-owned read model
until a dedicated validated-procedure curated view or RPC is introduced.

Reason:
The validated substrate currently provides curated approved-memory and
reviewable-candidate views, but not a validated-procedure view. A stable
read-model query is the narrowest safe bridge in this slice.

---

### 16L. First semantic retrieval input shape

The first semantic retrieval slice should accept a caller-supplied embedding
vector plus explicit `embeddingModel` and `embeddingVersion` values.

Reason:
The validated schema already provides `memory_embeddings`, but this slice does
not include embedding generation. Requiring the caller to provide the query
vector and the model/version gate avoids inventing a production embedding
pipeline or comparing across mixed embedding families.

---

### 16M. First semantic retrieval scope

The first semantic retrieval slice should search approved memory objects by
default and allow validated procedures only when explicitly requested. It
should not include candidate semantic retrieval.

Reason:
This keeps semantic reads aligned with the current explicit visibility posture
and avoids widening candidate access through the new vector path.

---

### 16N. Validated procedure semantic lineage

Validated procedure semantic retrieval should read through procedure rows, but
rank them by embeddings attached to the preserved `source_memory_object_id`
lineage.

Reason:
The current schema attaches embeddings to `memory_objects`, not directly to
`procedures`. Reusing the preserved source-memory lineage is the narrowest safe
bridge for the prototype.

---

### 16O. First installed-skill record surface

The first implemented installed-skill record tool is:

- `memory_skill_candidate_install_record_create`

Reason:
Once bounded approval and manual install handoff exist, the next narrow step is
an internal record write that can persist a manual installation outcome without
performing installation or mutating runtime skill state.

---

### 16P. Installed-skill record eligibility posture

Only skill candidates that already qualify for
`propose_manual_install_handoff` under the advisory install-handoff rules are
eligible for the bounded install-record write path.

Reason:
The write path should reuse the existing bounded install-handoff planner
instead of introducing a second eligibility model that could drift from the
documented approval and guardrail requirements.

---

### 16Q. Installed-skill record write posture

The first installed-skill record write path should:

- create one internal `memory_events` row
- use `event_name = skill_candidate.install_record`
- derive `installedScope` from the bounded approval record
- preserve install guardrails, manual steps, approval lineage, procurement
  lineage, and vetting lineage
- return `already_created` on repeat creation for the same skill candidate

Reason:
This is the least-authoritative safe record shape that persists manual install
outcomes without installing skills, changing runtime skill state, or launching
follow-on automation.

---

### 16R. First persisted tool-result surfaces

The first implemented context-plane tool-result surfaces are:

- `memory_tool_result_persist`
- `memory_tool_result_get`

Reason:
The context plane needs a concrete bounded seam for oversized tool outputs
before microcompaction, session memory, or compaction fallback can be built on
top of it.

---

### 16S. Tool-result threshold posture

The first tool-result persistence slice should:

- return an inline preview contract when the payload stays at or below the
  bounded threshold
- persist the full payload only when the payload exceeds the threshold or the
  caller explicitly forces persistence

Reason:
This keeps the first context-plane write path cheap and predictable while
still proving the durable oversized-output path. It avoids writing every tool
result to the database before there is any compaction or session-memory layer
that actually depends on that volume.

---

### 16T. Tool-result storage posture

The first tool-result persistence slice should:

- use `tool_results` as the canonical full-payload store
- emit one provenance `memory_events` row only when a tool result is actually
  persisted
- avoid writing any `memory_objects`, `memory_sources`, or compaction records

Reason:
`tool_results` already exists in schema-v1 for context-plane payload storage.
Using it directly is the narrowest safe implementation. One provenance event
preserves auditability without widening this slice into durable memory capture
or compaction orchestration.

---

### 16U. First preview-substitution contract

The first preview-substitution contract should return:

- a bounded preview text
- an explicit `shouldSubstitute` flag
- a stable `referenceToken` plus `memory_tool_result_get` retrieval handle only
  when the payload was actually persisted

Reason:
The caller needs one consistent prompt-safe preview shape, but only persisted
results should expose durable rehydration handles. Inline below-threshold
results should remain simple previews without pretending they were durably
stored.

---

### 16V. First microcompaction surface

The first implemented microcompaction surface is:

- `memory_tool_result_microcompact_plan`

Reason:
The next bounded context-plane step after persisted tool-result storage is a
deterministic planner that can decide which older persisted preview contracts
are eligible to be cleared from active prompt context without yet mutating any
state.

---

### 16W. First microcompaction trigger posture

The first microcompaction planner should support only bounded trigger inputs:

- idle gap threshold
- persisted-result count threshold
- explicit estimated prompt-token pressure

Reason:
These triggers are cheap, deterministic, and require no summarization or
session-memory model. They provide useful context-pressure relief planning
without widening this slice into heuristic orchestration or compaction
execution.

---

### 16X. First microcompaction preservation posture

The first microcompaction planner should:

- preserve a configurable recent floor
- operate only on persisted `tool_results`
- return a deterministic oldest-first clear list outside the preserved floor
- avoid writing `compaction_events` in this slice

Reason:
The current goal is to identify safe prompt-preview clearing candidates, not
to mutate state or imply compaction completion. Preserving a recent floor is
the minimum safe guardrail against clearing all recent context traces.

---

### 16Y. First session-memory surfaces

The first implemented bounded session-memory surfaces are:

- `memory_session_get`
- `memory_session_update`

Reason:
The context plane now has persisted tool-result storage and microcompaction
planning, so the next narrow primitive is a direct structured session-state
layer that can preserve current work without widening into transcript
summarization or full compaction fallback.

---

### 16Z. First session-memory storage posture

The first session-memory slice should:

- use `agent_state` with `state_key = session_memory` as the canonical store
- read and write directly through bounded middleware-owned get or update
  surfaces
- avoid `memory_events`, compaction records, and transcript-derived
  summarization in this slice

Reason:
`agent_state` already exists in schema-v1 for durable bounded agent or session
coordination state. Reusing it is the narrowest safe implementation for a
first session-memory layer.

---

### 16AA. First session-memory update semantics

The first session-memory updater should:

- preserve omitted fields
- replace provided scalar or array fields deterministically
- trim, dedupe, and cap bounded list fields
- return an explicit empty structured state when no session-memory row exists

Reason:
The current goal is a predictable manual session-state surface, not heuristic
merging or summarization. Deterministic replace-only updates keep the behavior
stable and auditable.

---

### 16AB. First compaction-planning surface

The first implemented bounded compaction-planning surface is:

- `memory_compaction_plan`

Reason:
The context plane now has persisted tool-result storage, microcompaction
planning, and direct session memory. The next bounded step is a read-only
planner that decides which of those context-pressure responses should be used
before any future full compaction execution exists.

---

### 16AC. First compaction-planning outcome posture

The first compaction planner should return only:

- `none`
- `use_microcompaction`
- `use_session_memory`
- `propose_full_compaction_fallback`

Reason:
These outcomes are sufficient to choose the next bounded response while
keeping the planner explicit and deterministic. The planner does not need to
execute anything in this slice.

---

### 16AD. First compaction-planning escalation posture

The first compaction planner should:

- prefer bounded microcompaction when persisted-preview pressure already
  exceeds bounded thresholds
- otherwise prefer session memory when prompt pressure is high and fresh
  sufficient session memory exists
- escalate to a proposed full compaction fallback only when prompt pressure is
  high and session memory is missing, stale, or insufficient

Reason:
This preserves the least-authoritative bounded response first and delays any
future transcript-level fallback until the existing cheaper context-plane
surfaces are no longer enough.

---

### 16AE. First microcompaction execution surface

The first implemented bounded microcompaction execution surface is:

- `memory_tool_result_microcompact_execute`

Reason:
The planner already identifies eligible persisted previews to clear. The next
bounded step is to apply that decision only to persisted preview state without
introducing transcript summarization, session-memory execution, or full
fallback compaction.

---

### 16AF. First microcompaction execution mutation posture

The first microcompaction executor should:

- operate only on `tool_results`
- clear preview state only for rows that are still `persisted`
- mark cleared rows as `compacted`
- keep full payloads rehydratable through `memory_tool_result_get`

Reason:
This is the narrowest safe execution path. Clearing preview state relieves
prompt pressure, while preserving payloads avoids widening this slice into
destructive deletion or summarization.

---

### 16AG. First microcompaction execution idempotence posture

The first microcompaction executor should:

- always respect the planner’s eligible clear set
- treat caller-supplied clear ids as a bounded subset, not an override
- return `no_op` when nothing remains eligible
- optionally record one bounded `compaction_events` row for auditability

Reason:
The planner owns recent-floor preservation. Reusing that eligible set keeps
the execution deterministic and idempotent while still allowing a caller to
request a smaller subset of the planner-approved candidates.

---

### 16AH. First session-memory-backed compaction execution surface

The first implemented bounded session-memory-backed compaction execution
surface is:

- `memory_session_compact_execute`

Reason:
The planner already distinguishes the cheaper `use_session_memory` path from
microcompaction and full fallback. The next bounded step is to execute only
that middle path without widening into transcript summarization.

---

### 16AI. First session-memory-backed compaction execution mutation posture

The first session-memory-backed compaction executor should:

- read the existing bounded `session_memory` row from `agent_state`
- produce a deterministic compacted session payload from those existing
  structured fields
- write at most one bounded `compaction_events` row for execution provenance
- not mutate `agent_state`
- not mutate `tool_results`
- not summarize the transcript
- not execute the future full fallback compaction path

Reason:
This reuses already curated session memory as the bounded substrate while
keeping the execution path narrow and reversible.

---

### 16AJ. First session-memory-backed compaction execution idempotence posture

Re-running the bounded session-memory-backed compaction executor for the same
session-memory state should behave idempotently:

- if the same `agent_state.id` and `updated_at` pair has already produced a
  bounded session-memory compaction event, return `already_executed`
- no second compaction event should be written for that unchanged
  session-memory state

Reason:
The session-memory row identity plus freshness point is enough to make this
execution path deterministic without mutating the underlying session memory.

---

### 16AK. First full-fallback compaction execution surface

The first implemented bounded full-fallback compaction execution surface is:

- `memory_full_compaction_fallback_execute`

Reason:
The compaction planner already reserves `propose_full_compaction_fallback` for
cases where microcompaction and session-memory reuse are not enough. The next
bounded step is to execute only that planner outcome without introducing
transcript summarization.

---

### 16AL. First full-fallback compaction execution substrate posture

The first bounded full-fallback executor should:

- execute only when the planner recommends
  `propose_full_compaction_fallback`
- build a deterministic fallback artifact from already available bounded
  inputs
- prefer existing structured session memory when it exists
- include planner rationale and substrate details in the artifact
- not summarize the transcript
- not mutate `agent_state`
- not mutate `tool_results`

Reason:
The fallback layer should stay aligned with the planner and the existing
context-plane substrate rather than inventing a broader transcript-level
compaction system in this slice.

---

### 16AM. First full-fallback compaction execution idempotence posture

Re-running the bounded full-fallback executor for the same bounded substrate
should behave idempotently:

- if the same deterministic fallback payload has already produced a completed
  `compaction_events` row, return `already_executed`
- no second full fallback compaction event should be written for that same
  payload

Reason:
The final bounded execution path should stay deterministic and safe for
retries without widening into mutable consolidation logic.

---

### 16AN. First consolidation and drift planning surface

The first implemented bounded consolidation and drift planning surface is:

- `memory_consolidation_plan`

Reason:
After the bounded context-plane execution stack exists, the next safe step is
to identify durable-memory cleanup and review pressure without mutating stored
memory.

---

### 16AO. First consolidation-planning signal posture

The first bounded consolidation planner should detect only narrow review
signals from already stored durable state:

- exact-content duplicate review
- contradiction review through shared bounded consolidation-key metadata
- stale or superseded review through bounded lifecycle metadata
- drift-check review through bounded due-at metadata

Reason:
The first slice should prefer deterministic, explainable signals instead of
speculative background intelligence or merge automation.

---

### 16AP. First consolidation-planning mutation posture

The first bounded consolidation planner should:

- read approved durable memory through existing bounded approved-memory read
  surfaces
- optionally read validated procedures when explicitly requested
- return only advisory findings with rationale, affected ids, confidence, and
  priority
- not mutate `memory_objects`
- not mutate `procedures`
- not mutate `skill_candidates`
- not mutate policy rows
- not archive, prune, merge, or remediate drift automatically

Reason:
The planning layer should formalize what needs review before any background
consolidation execution is authorized.

---

### 16AQ. First consolidation execution surface

The first implemented bounded consolidation execution surface is:

- `memory_consolidation_execute`

Reason:
After advisory consolidation planning exists, the next safe step is to
materialize only the lowest-risk durable-memory hygiene outcomes without
attempting broader cleanup automation.

---

### 16AR. First consolidation execution scope posture

The first bounded consolidation executor should only materialize:

- duplicate supersede handling for approved durable memory
- stale or superseded handling when an approved durable-memory target is
  already explicit in bounded metadata

These findings must remain advisory-only in this slice:

- `contradiction_review`
- `drift_check_review`

Reason:
Duplicate and explicit supersession are conservative state transitions that
fit the existing schema. Contradiction and drift need more review semantics
before safe automatic execution exists.

---

### 16AS. First consolidation execution mutation posture

The first bounded consolidation executor should:

- preserve provenance and reviewability through `memory_reviews`
- preserve lineage through `memory_links` with `link_kind = supersedes`
- move only approved durable memory into `review_state = superseded`
- avoid policy memory mutation
- remain deterministic and idempotent when the same bounded finding is retried

Reason:
The first execution layer should rely on existing review and lineage tables
instead of inventing a broader background-cleanup subsystem.

---

### 16AT. First drift-check execution surface

The first implemented bounded drift-check execution surface is:

- `memory_drift_check_execute`

Reason:
After advisory drift findings exist, the next safe step is to record overdue
freshness-review outcomes without broad remediation or fact rewriting.

---

### 16AU. First drift-check execution mutation posture

The first bounded drift-check executor should:

- execute only `drift_check_review` findings
- write one bounded drift-check artifact event per executed object
- refresh only bounded checked metadata on the target object
- not rewrite stored fact content or procedure bodies
- not mutate policy memory

Reason:
The first drift slice should capture review completion and freshness evidence
without changing the underlying fact model.

---

### 16AV. First drift-check execution idempotence posture

Re-running the bounded drift-check executor for the same overdue marker should
behave idempotently:

- if `driftCheckedAt` is already at or after the current `driftCheckDueAt`,
  return `already_executed`
- no second drift-check artifact should be written for that unchanged overdue
  marker

Reason:
The drift-check layer should stay deterministic and retry-safe while still
remaining narrower than full remediation.

---

### 16AW. First background-job scheduling surface

The first bounded background-job scheduling slice must support only:

- `proactive_plan`
- `proactive_execute_run_drift_check`

Reason:
This introduces the first internal scheduler without broadening into
procurement, approval, install, or messaging automation.

---

### 16AX. First background-job persistence posture

The first bounded scheduler must persist only `maintenance` rows in the
existing `background_jobs` table and keep the middleware-owned job class in
bounded payload and metadata fields.

Reason:
No schema extension is needed for this slice, and the scheduler should reuse
the existing backend-only job substrate conservatively.

---

### 16AY. First background-job runner posture

The first bounded runner may execute only:

- advisory proactive planning
- bounded proactive `run_drift_check` execution

It must not execute:

- candidate review
- procedure validation
- skill governance follow-up
- procurement, vetting, approval, or install workflows
- messaging or other external actions

Reason:
The runner should stay inside already-reviewed low-risk internal seams before
any broader automation is considered.

---

### 16AZ. Consolidation planning is the next allowed scheduled advisory class

The bounded background-job scheduler may now also support:

- `consolidation_plan`

That class may run only the existing advisory consolidation-planning seam.

It must not:

- schedule consolidation execution
- auto-resolve contradictions
- schedule drift remediation

Reason:
Consolidation planning is read-only and low-risk, so it fits the bounded
scheduler before any broader maintenance automation is considered.

---

### 16BA. Scheduled consolidation execution must use an explicit safe subset only

The bounded background-job scheduler may now also support:

- `consolidation_execute`

That class must require an explicit approved subset limited to:

- `duplicate_merge_review`
- `stale_superseded_review`

It must not schedule or execute:

- `contradiction_review`
- `drift_check_review`

Reason:
The existing consolidation executor already has a low-risk bounded write path
for duplicate and stale-superseded durable memory, but contradiction and drift
execution still remain out of scope for scheduled automation.

---

### 16BB. Production adoption must remain phased and non-exclusive

The first real-environment rollout for `memory-middleware` must:

- keep the plugin as a regular bundled plugin
- keep `memory-core` and `memory-lancedb` unchanged
- apply migrations explicitly before runtime enablement
- start with bounded reads and low-risk writes
- keep scheduler execution manual or explicitly operator-triggered at first

It must not:

- claim the exclusive `memory` slot
- enable broad autonomous scheduler loops
- enable procurement, install, messaging, or other external workflows

Reason:
The middleware now has a meaningful bounded feature set, but first production
adoption should prove safe coexistence and operational control before any
takeover or broader automation is considered.

---

### 16BC. Production rollback should prefer operational disablement first

If the first real-environment rollout has to be reversed, rollback should
prefer:

1. stopping middleware write-path usage
2. stopping bounded background-job execution
3. disabling the plugin runtime
4. restoring from DB backup only when migration rollback is actually needed

Reason:
The current schema and runtime posture are additive. For the first production
adoption slice, fast operational disablement is safer and simpler than
assuming an immediate schema teardown path.

---

### 16BD. The first staging rehearsal uses the disposable repo-owned Docker lane

The first production-adoption rehearsal for `memory-middleware` should use the
currently available repo-owned staging-like environment:

- disposable local Docker
- image `pgvector/pgvector:pg16`
- ephemeral database `memory_middleware_test`

Reason:
That is the only staging-like environment currently available directly from the
repo and runtime context without touching shared or production systems.

---

### 16BE. The first staging rehearsal should prove disablement before shared rollback

The first rehearsal is sufficient if it proves:

- migrations apply cleanly
- passive runtime startup causes no automatic writes
- one bounded write path succeeds
- the same write path can be disabled again without new writes

It does not need to prove shared-environment backup and restore yet.

Reason:
Operational disablement is the safest first rollback posture to rehearse in a
disposable lane. Managed staging restore validation still belongs to a later
shared-environment slice.

---

### 16BF. Read-only retrieval needs its own mode separate from write ingress

The memory middleware now needs a distinct retrieval mode:

- `memoryObjectQuery.mode = read-only`

This mode may:

- enable bounded memory-object retrieval tools
- allow approved-memory access by default
- allow candidate or validated-procedure visibility only through explicit
  scope requests

It must not:

- enable candidate ingress
- enable background-job scheduling
- enable proactive execution

Reason:
The first real-environment rollout requires passive connectivity and
read-only retrieval while every middleware write surface remains disabled.

---

### 16BG. The first real non-disposable rollout may use a persistent local Docker target

When no shared managed staging or preproduction target is available from the
repo or runtime context, the first real non-disposable non-production rollout
may use:

- a named persistent local Docker Postgres container
- a named persistent Docker volume

Reason:
This is safer than blocking all rollout progress, still avoids production, and
is materially closer to a real environment than the disposable rehearsal lane.

---

### 16BH. The first real bounded write rollout should use submit-only ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`

That rollout should use:

- `candidateIngress.mode = submit-only`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- candidate review and promotion
- procedure validation
- skill-candidate governance
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely expand from passive
read-only retrieval to one bounded ingress write without opening adjacent
write or automation surfaces.

---

### 16BI. The second real bounded write rollout should use submit-review-only ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`

That rollout should use:

- `candidateIngress.mode = submit-review-only`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- candidate promotion
- procedure validation
- skill-candidate governance
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely add bounded review recording
on top of bounded candidate submission without opening downstream promotion,
procedure, governance, or automation surfaces.

---

### 16BJ. The third real bounded write rollout should use submit-review-promote-memory ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- candidate procedure promotion
- procedure validation
- skill-candidate governance
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely add advisory promotion
planning plus bounded candidate-to-memory promotion without opening procedure,
governance, or automation surfaces.

---

### 16BK. The fourth real bounded write rollout should use submit-review-promote-memory-procedure ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- procedure validation
- skill-candidate governance
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely add bounded
candidate-to-procedure-draft promotion on top of submit, review, advisory
promotion planning, and bounded memory promotion without opening validation,
governance, or automation surfaces.

---

### 16BL. The fifth real bounded write rollout should use submit-review-promote-memory-procedure-validate ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- procedure validation planning
- skill-candidate governance
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely add bounded procedure
validation on top of submit, review, bounded promotion, and bounded
procedure-draft creation without opening skill governance, automation, or
runtime takeover surfaces.

---

### 16BM. The sixth real bounded write rollout should use submit-review-promote-memory-procedure-validate-skill ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- procurement, vetting, approval, and install workflows
- background-job scheduling
- proactive execution
- self-improving candidate capture

Reason:
The current real non-production target can safely add bounded skill-candidate
planning and creation on top of submit, review, bounded promotion, bounded
procedure validation, and preserved lineage without opening procurement,
vetting, approval, install, or automation surfaces.

---

### 16BN. The eighth real bounded write rollout should use submit-review-promote-memory-procedure-validate-skill-procurement-vetting ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`
- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- approval and install workflows
- background-job scheduling
- proactive execution
- self-improving candidate capture
- automatic Skill Vetter invocation

Reason:
The current real non-production target can safely add bounded manual Skill
Vetter handoff preparation and one internal vetting-result record on top of
submit, review, bounded promotion, bounded procedure validation, bounded
skill-candidate creation, and bounded procurement state without opening
approval, install, or automation surfaces.

---

### 16BO. The ninth real bounded write rollout should use submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`
- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`
- `memory_skill_candidate_approval_plan`
- `memory_skill_candidate_approve`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- install workflows
- background-job scheduling
- proactive execution
- self-improving candidate capture
- automatic Skill Vetter invocation

Reason:
The current real non-production target can safely add bounded approval
planning and one internal approval-state write on top of submit, review,
bounded promotion, bounded procedure validation, bounded skill-candidate
creation, bounded procurement state, and bounded manual vetting state without
opening install or automation surfaces.

---

### 16BP. The tenth real bounded write rollout should use submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install ingress

The next real-environment write posture should enable only:

- `memory_candidate_submit`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_memory`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`
- `memory_skill_candidate_skill_vetter_handoff`
- `memory_skill_candidate_vetting_result_record`
- `memory_skill_candidate_approval_plan`
- `memory_skill_candidate_approve`
- `memory_skill_candidate_install_handoff`
- `memory_skill_candidate_install_record_create`

That rollout should use:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`

It should keep disabled:

- actual skill installation
- background-job scheduling
- proactive execution
- self-improving candidate capture
- automatic Skill Vetter invocation

Reason:
The current real non-production target can safely add bounded manual install
handoff preparation and one internal install-record write on top of submit,
review, bounded promotion, bounded procedure validation, bounded
skill-candidate creation, bounded procurement state, bounded manual vetting
state, and bounded approval state without opening actual installation or
automation surfaces.

---

### 16BQ. No live automation should be enabled before explicit operational safeguards exist

After the tenth real bounded rollout, the middleware has proven a bounded
manual governance path in a real non-disposable non-production environment,
but it has not yet proven the operational controls required for live
automation.

Before any scheduler or proactive rollout, the following must exist:

- a documented scheduler-owner and single-runner posture
- a documented immediate disablement step
- documented inspection queries for queued, running, failed, and stale jobs
- config gates that separate advisory scheduling from execute-class behavior
- explicit confirmation that install, approval, procurement, messaging, and
  self-improving automation remain disabled

Reason:
The current remaining gaps are operational control gaps rather than missing
bounded seams.

---

### 16BR. The first automation candidate after safeguards should be proactive-plan scheduling only

If the required safeguards from 16BQ are added in a later slice, the first
live automation class to consider should be:

- scheduler for `proactive_plan` only

It should not initially include:

- `proactive_execute_run_drift_check`
- `consolidation_plan`
- `consolidation_execute`

Reason:
`proactive_plan` is advisory-only, does not write memory artifacts, and is the
lowest-risk live automation candidate among the already-implemented bounded
automation-adjacent seams.

---

### 16BS. Automation safeguards should be wired before any first live scheduler rollout

The first safeguard slice should add operational controls without enabling
live automation.

Required controls are:

- a separate config gate for background-job inspection
- a separate config gate for advisory job scheduling
- a separate config gate for execute-class job scheduling
- an optional single-runner ownership id for `memory_background_job_run_next`
- bounded inspection tools for listing and getting persisted job rows

Reason:
The bounded scheduler seams already exist. The remaining risk before first live
enablement is operational control, not missing planner or executor code.

---

### 16BT. The first live automation rollout should enable only proactive-plan scheduling

The first live scheduler rollout may enable only:

- background-job inspection
- advisory scheduling for `proactive_plan`
- single-runner `memory_background_job_run_next`

It should keep disabled:

- `proactive_execute_run_drift_check`
- `consolidation_plan`
- `consolidation_execute`
- procurement, vetting, approval, install, and self-improving automation

Reason:
`proactive_plan` is the only already-implemented automation class that stays
fully advisory and does not mutate durable memory state.

---

### 16BU. The first live execute-class rollout should enable only proactive drift-check execution

After the advisory-only scheduler rollout, the first live execute-class step
should enable only:

- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
- single-runner `memory_background_job_run_next`

It should keep disabled:

- `consolidation_plan`
- `consolidation_execute`
- direct proactive execution outside the background-job seam
- procurement, vetting, approval, install, and self-improving automation

Reason:
`proactive_execute_run_drift_check` is the lowest-risk already-implemented
execute-class path because it records bounded review artifacts without
rewriting stored facts and already has repeat-safe `already_executed`
behavior.

---

### 16BV. The next live advisory rollout may enable consolidation-plan scheduling only

After the advisory `proactive_plan` rollout and the bounded drift-check
execute rollout, the next live advisory step may enable only:

- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`

It should keep disabled:

- `consolidation_execute`
- additional execute-class jobs beyond `proactive_execute_run_drift_check`
- procurement, vetting, approval, install, and self-improving automation

Reason:
`consolidation_plan` is advisory-only, already implemented, and can be
constrained to bounded findings inspection while leaving every durable
consolidation mutation path disabled.

---

### 16BW. The first live consolidation execution rollout may enable only the already-bounded safe subset

After the advisory `consolidation_plan` rollout, the next live execute-class
step may enable:

- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`

Only for explicit approved findings limited to:

- `duplicate_merge_review`
- `stale_superseded_review`

It must keep disabled:

- `contradiction_review`
- `drift_check_review` through consolidation
- procurement, vetting, approval, install, and self-improving automation

Reason:
The bounded consolidation-execution seam already constrains those two
low-risk actions to conservative `memory_reviews` and `memory_links` writes,
while contradiction and drift consolidation actions remain materially broader
and should stay off.

---

### 16BX. After the first bounded maintenance loop is live, the automation boundary should hold as-is

After live rollout of:

- advisory `proactive_plan`
- advisory `consolidation_plan`
- execute-class `proactive_execute_run_drift_check`
- execute-class bounded safe `consolidation_execute`

the next live step should be:

- keep the current automation boundary unchanged

It should not immediately enable:

- additional advisory job classes
- additional execute-class job classes
- contradiction execution
- drift remediation through consolidation
- procurement or install automation
- self-improving capture

Reason:
The current live posture already spans both advisory and execute-class
maintenance in one real non-production target. The higher-value next step is
continued soak, inspection discipline, and shared-environment rehearsal, not
further automation expansion.

---

### 16BY. The current bounded maintenance loop now requires an operator runbook before any broader rehearsal

Before any shared-environment rehearsal or broader automation discussion, the
current live posture should have a concrete operator runbook that covers:

- retrieval health checks
- background-job inspection
- recent bounded-write inspection
- runner ownership verification
- quick disablement
- rollback order
- soak checklist
- shared-environment readiness checklist

Reason:
The current boundary is operationally acceptable only if operators can inspect
and stop it quickly without broadening authority or changing retrieval and
governance posture.

---

### 16BZ. A shared-environment rehearsal must use a real shared non-production target or be reported as unavailable

No simulated or local-only environment may be described as the shared
rehearsal target.

Reason:
The repo and operator docs must stay truthful about which rollout evidence is
actually shared and which evidence is still single-host only.

---

### 16CA. No shared rehearsal target exists yet

No existing shared non-production target is available from the current repo
or host context for `memory-middleware`.

Reason:
The repo exposes only:

- a disposable local validation lane
- a persistent local non-production Docker rollout lane
- generic repo deployment artifacts that do not by themselves prove a shared
  live runtime surface

None of those is already a shared rehearsal target for the current
memory-middleware posture.

---

### 16CB. The smallest viable shared rehearsal target is dedicated and isolated

The smallest viable shared rehearsal target is a dedicated shared
non-production OpenClaw runtime paired with a dedicated shared Postgres
database for `memory-middleware`, with the current approved middleware
allowlists replayed unchanged.

Reason:
This is the minimum shape that is:

- actually shared beyond one host
- still isolated from production
- compatible with the current runbook's runner-owner and disablement model
- small enough to provision without expanding the automation boundary

---

### 16CC. Shared-runtime planning should follow the actual server-hosted runtime surface, not repo-only deployment artifacts

The default shared runtime plan for the first real shared non-production
rehearsal should follow the actual server-hosted OpenClaw runtime surface on
the VPS.

Reason:
Diagnosis later confirmed the live runtime is Docker Compose plus the
operator-managed `~/.openclaw` config tree. Repo-only deployment artifacts can
exist without being the real operator path, so future rehearsal and production
planning should trace the live runtime first and only then document rollout
steps.

---

### 16CD. Shared rehearsal secrets should live in plugin config through an env-backed DB URL

The shared middleware DB connection should be supplied through
`plugins.entries.memory-middleware.config.database.url` using an env-backed
SecretRef, not committed plaintext config.

Reason:
The middleware config already exposes `database.url` as the canonical DB
connection path, and shared-environment rehearsal should keep credentials out
of checked-in config while still using the real plugin-owned surface.

If a later slice is asked to rehearse the current approved posture in a shared
environment, it must:

- use a real shared non-production target
- keep the current allowlists unchanged
- report the rehearsal as unavailable if no such target is actually wired

Reason:
The current repo and host context still prove only the disposable local lane
and the persistent local non-production lane. A fabricated shared rehearsal
would weaken the operational record instead of strengthening it.

---

### 16CE. The first shared non-production Postgres target reuses the existing server Supabase project

The first shared non-production Postgres target for `memory-middleware` is the
already-installed Supabase project on the server:

- project ref: `wvfcvuwsnhupalpxfttc`
- database: `postgres`
- middleware schema: `memory_middleware`
- required extensions confirmed:
  - `pgcrypto`
  - `pg_trgm`
  - `vector`

Reason:
This avoids provisioning a second database surface when the existing shared
Supabase installation already satisfies the middleware requirements and is
reachable from the shared runtime host.

---

### 16CF. The first shared non-production runtime reuses the existing shared Dockerized OpenClaw gateway on the server

The first shared non-production OpenClaw runtime for `memory-middleware`
rehearsal is the existing Dockerized gateway on the server:

- container: `openclaw-upgrade-2026324-openclaw-gateway-1`
- image: `openclaw:local`
- ports: `28789` and `28790`

Reason:
This is already a shared server-hosted runtime, it avoids inventing a second
deployment surface before the first shared rehearsal, and it is sufficient for
replaying the currently approved boundary unchanged.

---

### 16CG. The current middleware checkpoint still requires a literal database URL in live config

For the first shared non-production wiring slice, the DB secret may be placed
in `~/.openclaw/.env` as `MEMORY_MIDDLEWARE_DATABASE_URL`, but the running
middleware config must still carry a literal
`plugins.entries.memory-middleware.config.database.url` string.

Reason:
The current middleware checkpoint accepts a string `database.url` and the live
plugin manifest now matches the rollout-era config surface, but this checkpoint
does not yet support an env-backed SecretRef object for that field. The shared
runtime therefore uses an operator-managed literal copy in non-production until
that contract changes explicitly in a later slice.

---

### 16CH. The shared Supabase pooler target currently requires libpq-compatible SSL semantics

The current shared non-production middleware DB URL must include:

- `uselibpqcompat=true&sslmode=require`

Reason:
Without that compatibility flag, the current Node `pg` connection path in both
the shared runtime and repo-native rehearsal failed with
`self-signed certificate in certificate chain`.

---

### 16CI. Shared rehearsal uses the repo-native runtime plus gateway health checks

The current shared-environment rehearsal path is:

- repo-native runtime against the shared DB
- gateway health checks against the shared runtime

It is not:

- bearer-auth HTTP tool invocation over `/tools/invoke`

Reason:
The shared gateway currently rejects bearer-auth HTTP tool invocation for this
operator workflow, so the repo-native runtime is the reliable bounded
inspection and rehearsal path.

---

### 16CJ. Shared approved posture keeps procedure validation planning disabled

The approved shared posture keeps:

- `memory_procedure_validate` enabled

while keeping:

- `memory_procedure_validate_plan` disabled

Reason:
That is the actual live bounded surface proven in the shared environment, and
the runbook plus reports should reflect the real enabled and disabled seams.

---

### 16CK. Production rollout requires an actual writable production deployment surface

No first production rollout may be reported as complete unless this session can
reach and modify the real production deployment surface.

Reason:
The current host and repo context do not expose production deployment tooling,
production auth, or production DB connectivity, so claiming production success
without that access would weaken the rollout record.

---

### 16CL. Missing production deployment access is a rollout blocker, not a doc-only inconvenience

The following are explicit blockers for the first production rollout from this
session:

- no distinct production-scoped OpenClaw runtime surface was identified for
  this session beyond the shared non-production Docker Compose project
- no production-scoped `openclaw.json` or `.env` path was provided to this
  session
- no production DB or deployment secrets were exposed to this session

Reason:
Without those surfaces, the actual VPS-hosted production runtime cannot be
restarted, reconfigured, or validated from this environment.

---

### 16CM. Production rollout planning must inventory and back up the live VPS runtime before applying the first patch

Before the first production rollout patch is applied for `memory-middleware`,
operators must inventory the actual live OpenClaw runtime on the VPS and take
an explicit backup of the mounted config and Compose surfaces.

Reason:
The live runtime is server-hosted Docker Compose with `~/.openclaw` bind
mounts. That is the real rollback surface, and the first production patch
must be tied to a concrete restore artifact instead of an assumed deployment
platform.

---

### 16CN. The current live runtime already matches the approved feature boundary; the remaining production diff is operational

The currently inventoried live VPS runtime already matches the approved
feature boundary for `memory-middleware`.

The remaining production rollout diff is limited to:

- choosing the production runner owner id
- replacing `shared-nonprod-runner-1` with that production runner id
- normalizing the `.env` DB URL copy so it matches the proven live URL shape
- explicitly confirming whether the inventoried runtime is the production
  surface or identifying the separate production-scoped runtime first

Reason:
The live `openclaw.json` already carries the approved bounded candidate,
retrieval, advisory scheduling, and execute-class allowlists. No broader
feature enablement is required to reach the already-rehearsed boundary.

---

### 16CO. The actual production runtime on this VPS is the live upgrade Compose container

The actual production runtime on this VPS is:

- Docker Compose project `openclaw-upgrade-2026324`
- service `openclaw-gateway`
- container `openclaw-upgrade-2026324-openclaw-gateway-1`

Reason:
It is the only active OpenClaw runtime on the host, it owns the canonical
OpenClaw ports `28789` and `28790`, it uses the canonical persisted state tree
`~/.openclaw`, and the older `/root/services/openclaw` Compose stack is no
longer running.

---

### 16CP. The first production rollout patch is limited to runner-owner and DB-secret parity only

The exact minimal production rollout patch is:

- in `~/.openclaw/openclaw.json`
  - set `plugins.entries.memory-middleware.config.backgroundJobs.runnerOwnerId`
    to `production-runner-1`
- in `~/.openclaw/.env`
  - normalize `MEMORY_MIDDLEWARE_DATABASE_URL` so it includes
    `uselibpqcompat=true&sslmode=require`

Reason:
The live production runtime already matches the approved feature boundary.
Only the production runner identity and secret parity still need to be aligned
before restart and validation.

---

### 16CQ. The first production rollout is now live on the confirmed Docker Compose runtime with no feature-boundary expansion

The first production rollout is complete on:

- Docker Compose project `openclaw-upgrade-2026324`
- service `openclaw-gateway`
- container `openclaw-upgrade-2026324-openclaw-gateway-1`

using only:

- `backgroundJobs.runnerOwnerId = production-runner-1`
- DB URL parity including `uselibpqcompat=true&sslmode=require`

Reason:
The runtime restarted cleanly, retrieval remained healthy, the bounded
governance path remained healthy, approved advisory and execute classes ran
successfully, wrong-runner claims stayed blocked, and temporary disablement
checks succeeded before the approved posture was restored.

---

### 16CR. Production validation uses gateway health checks plus direct in-container middleware runtime invocation

The current production validation seam is:

- gateway health checks against the live container
- direct in-container `memory-middleware` runtime and tool invocation using
  the running container's built `dist` output

and not:

- bearer-auth HTTP `/tools/invoke`

Reason:
The current gateway bearer-auth HTTP surface blocks tool invocation, while
the direct in-container runtime seam provides truthful bounded middleware
validation against the live production config and database posture.

---

### 16CS. The approved production boundary remains stable after the first soak review and should remain unchanged

The first production soak review found the current approved
`memory-middleware` boundary stable enough to keep unchanged.

Reason:
Health stayed green, retrieval stayed healthy, recent maintenance jobs stayed
within the approved allowlists, wrong-runner blocking still worked, advisory
enqueue dedupe still worked, and the only observed durable growth from the
soak probe was one additional `background_jobs` row with no broader table
family drift.

---

### 16CT. No rollback or disablement is needed after the first production soak review

Rollback or disablement is not required after the first production soak
review.

Reason:
No middleware-specific anomaly required emergency narrowing, the runtime
remained healthy, and the current boundary stayed within the already-rehearsed
production posture.

---

### 16CU. The first bounded production soak is passed for its intended scope, not as proof of ordinary live-turn capture

The first bounded production soak is treated as passed for its intended
scope, but not as proof that ordinary live agent turns already create
candidate memory.

Reason:
The soak was designed to validate the bounded production posture:
retrieval, bounded governance writes, bounded scheduler classes, runner
ownership, and bounded durable-growth behavior. Ordinary live-turn capture was
a follow-on question, not the original soak target.

---

### 16CV. The next active live memory slice is bounded ordinary live interaction -> candidate capture

The next active live memory slice is bounded ordinary live interaction ->
candidate capture, while review and promotion remain manual and broader
automation stays deferred.

Reason:
The current live memory system is now proven to accept bounded candidate
submissions from a fresh-session production interaction without requiring
broader automation expansion. The next step is to soak and expand that slice
carefully before reopening self-improving capture or wider scheduler classes.

---

### 16CW. V1 semantic memory work uses conservative writes plus candidate-with-confirmation

The default v1 posture for broader semantic memory work is:

- conservative durable writes
- candidate-with-confirmation for plausible middle-confidence signals
- sparse clarify
- ignore weak ambiguous signals

Reason:
Manual review will not be the normal way candidates are resolved, so
`candidate_only` must mean "watch for confirming evidence" rather than "leave
this in a dead queue forever."

---

### 16CX. V1 recurring procedure use is suggestion-first, not silently applied

The default v1 posture for validated recurring procedures is:

- suggestion-first when a procedure looks relevant
- direct-use only on clear asks for the named or strongly equivalent procedure
- no silent background application

Reason:
This makes stored procedures feel useful without turning them into an
intrusive always-on behavior layer or causing loosely related requests to be
answered with the wrong remembered checklist.

---

### 16CY. V1 user memory repair is conversational-first

The default v1 posture for user memory repair is:

- conversational repair first
- no full memory inspection UI in v1
- no lightweight inspection command/tool required before the first semantic
  slices

Reason:
Users need a normal way to fix memory, but the first implementation should
optimize for a strong natural repair loop rather than delaying semantic memory
work behind a separate browsing or admin surface.

---

### 16CZ. Governance productionization is split into a quick-win tranche and a wait tranche

The governance backlog should not be productionized as one bundle.

Quick-win tranche to execute first:

- validated-procedure retrieval
- candidate procedure promotion
- procedure validation
- skill-candidate planning and creation
- procurement planning and internal procurement-record creation

Wait tranche to defer until after the next user-facing semantic work:

- manual Skill Vetter handoff preparation
- manual vetting-result recording
- approval planning and approval-state recording
- manual install handoff and install-record creation

Reason:
The quick-win tranche is already built, remains manual/internal, preserves
lineage, and stops short of approval/install semantics. The wait tranche is
closer to external review authority or downstream lifecycle state and is more
expensive to misunderstand or roll out casually.

---

### 16DA. No candidate-producing family may rely on an indefinite manual backlog

The default rule for future memory families is:

- no candidate-producing family may depend on an indefinite background manual
  review queue as its normal resolution path

Each candidate-producing family must explicitly choose one or more of:

- auto-confirm / auto-promote under bounded policy
- prompt-now while context is fresh
- expire or reject if neither of the above happens safely

Reason:
Manual review will not be the normal operating model for user-facing memory
quality, so unresolved candidate buildup would create memory trash instead of a
real product loop.

---

### 16DB. Generalized lesson learning is now the main scaling path for broader workflow memory

After the first generalized lesson-learning slice, the primary way to expand
workflow learning should be:

- broader normalized lesson capture
- bounded machine review or promotion
- approved-only retrieval and application

not repeated lesson-key expansion.

Reason:
The keyed path remains useful as a precision fast path, but it does not scale
into generally useful learning.

---

### 16DC. Generalized lesson auto-review should be the next implementation slice after the pivot

The next implementation step after generalized lesson capture should be:

- bounded machine auto-review and promotion for eligible generalized lessons

It should come before:

- phrase induction for approved generic lessons
- broader project-rule learning
- unmet-need planning
- reduced-profile self-improving capture enablement

Reason:
Broader candidate formation without broader candidate resolution would recreate
the same manual-review bottleneck under a more generic detector.

---

### 16DD. Approved generic lessons stay hybrid-first until proof shows a real retrieval gap

Approved generalized lessons should retrieve through the approved-only hybrid
path first.

Do not add generic semantic fallback until:

- auto-review is stable
- phrase induction exists for approved generic lessons
- hybrid-first retrieval has produced real measured miss evidence

Reason:
Generic semantic retrieval before stable normalization would hide unfinished
taxonomy work behind broader similarity search.

---

### 16DE. Reduced-profile self-improving capture is an input source into the same generalized lesson pipeline

If reduced-profile self-improving capture is enabled later, it should feed:

- the same candidate-only ingress
- the same normalized clustering
- the same auto-review or review rules

---

### 16DF. Broader project rules are a sibling generalized lesson family, not a project-fact field expansion

After the first project-rule slice, named-project operating rules should:

- reuse the generalized lesson pipeline
- stay guidance-only
- remain distinct from named project facts

Reason:
Project rules answer "how should this named project be operated" questions.
They should not be forced into the project-fact registry or back into the old
workflow lesson-key expansion path.

It must not create:

- a separate approval path
- a separate retrieval path
- a second durable memory authority

Reason:
The self-improving seam should broaden candidate coverage, not fragment the
learning architecture into parallel subsystems.

---

### 16DF. Learned-guidance proactivity must begin as advisory-only and only after approval plus retrieval maturity

Approved learned lessons may later inform bounded advisory planning, but only
after:

- generalized lesson auto-review is stable
- approved generic lesson retrieval and application are stable
- repair and supersede behavior are predictable enough to keep stale guidance
  from silently persisting

That later surface must remain:

- advisory-only
- read-only against approved lessons
- non-executing

Reason:
Proactivity should be a downstream use of already-trusted learned guidance, not
the mechanism that compensates for immature approval or retrieval quality.

## Provisional decisions pending implementation

- whether the new middleware should be a regular bundled plugin or eventually replace the exclusive `kind: "memory"` slot
- the exact backend subtree name for future Postgres or Supabase migrations
- the exact scope and format of workspace mirrors relative to existing workspace memory files
- the exact review-record storage pattern for individual third-party skill findings beyond the current policy docs
- the exact point at which `self-improving-agent` could move from deferred adoption to limited installation through the plugin base
- the exact packaging form for any later reduced-profile fork or adaptation
