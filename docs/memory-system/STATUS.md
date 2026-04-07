# Status

## Overall state

Planning complete at high level.
Feature inventory completed for the remaining memory roadmap, explicitly
separating built-live, built-off-production-or-partial, and not-built
families.
Implementation-ready spec pack completed for the remaining major not-built
and not-yet-productionized memory families.
In-repo durable handoff pack initialized.
Repo reconciliation completed at the architecture level.
Initial middleware scaffold and immediate skill-onboarding preparation completed.
Third-party skill procurement governance defined for the memory-system effort.
Self-improving-agent integration posture defined at the documentation level.
Skill Vetter installed via the existing Codex skill-install mechanism.
Formal vetting completed for `self-improving-agent`.
Constrained adoption plan completed for `self-improving-agent`.
Reduced-profile fork specification completed for `self-improving-agent`.
Reduced-profile self-improving adaptation surface completed as a bounded
candidate-only middleware seam.
Memory-middleware plugin base scaffold and DB access skeleton completed.
Schema placement and migration naming completed for the memory middleware backend.
Schema-v1 migration draft completed for the memory middleware backend.
Schema-v1 review and refinement completed for the memory middleware backend.
First candidate-only tool surface completed for the memory middleware backend.
DB-backed validation completed for the first candidate-only submission path.
Candidate query surface completed for candidate-only inspection.
Candidate review mutation surface completed for bounded candidate-only review recording.
Manual promotion planning surface completed for reviewed candidates.
Bounded memory-promotion write path completed for eligible reviewed candidates.
Bounded procedure-draft promotion write path completed for eligible reviewed
procedure candidates.
Security and retrieval migration draft completed for the memory middleware
backend.
Validated-procedure planning surface completed for bounded draft procedures.
Validated-procedure write path completed for eligible bounded draft procedures.
Skill-candidate planning surface completed for bounded validated procedures.
Skill-candidate write path completed for eligible validated procedures.
Procurement handoff planning surface completed for bounded skill candidates.
Manual procurement or vetting record write path completed for bounded skill
candidates.
Bounded live retrieval surface completed for approved memory objects,
explicitly requested candidate objects, and validated procedures.
Bounded hybrid retrieval upgrade completed for ranked text search over
approved memory objects and explicitly requested validated procedures.
First family-aware semantic retrieval routing slice completed for nearby
recurring-procedure asks under bounded validated-procedure-only fallback.
Second family-aware semantic retrieval routing slice completed for approved
environment-constraint guidance under bounded approved-only project-scoped
fallback.
Third family-aware semantic retrieval routing slice completed for approved
workflow-improvement tool-gotcha guidance under bounded approved-only
project-scoped fallback for the supported `vitest_wrapper_required` and
`scripts_committer_required` lesson keys only.
Controlled validation completed for the drafted security and retrieval
substrate on top of schema-v1 in a disposable local Postgres lane.
Runtime adoption completed for the validated retrieval substrate in the live
memory-middleware read layer.
Formalized policy-aware retrieval surface completed for the bounded live
memory-middleware read layer.
Bounded session-memory read and update surface completed for active sessions.
Bounded compaction-planning surface completed for context-pressure response
selection.
Bounded microcompaction execution surface completed for persisted tool-result
preview clearing.
Bounded session-memory-backed compaction execution surface completed for
planner-eligible session-memory reuse.
Bounded full-fallback compaction execution surface completed for
planner-eligible final fallback artifacts.
Bounded consolidation and drift planning surface completed for approved
durable memory and optionally included validated procedures.
Bounded consolidation execution surface completed for conservative duplicate
and stale-superseded hygiene actions over approved durable memory.
Bounded drift-check execution surface completed for overdue approved durable
memory and validated procedures.
Safe advisory-only proactivity planning surface completed for bounded internal
memory-middleware follow-up opportunities.
Bounded proactive execution surface completed for the low-risk
`run_drift_check` action class only.
Bounded background-job scheduling surface completed for low-risk internal
`proactive_plan` and `proactive_execute_run_drift_check` classes only.
Bounded background-job scheduling surface extended for advisory
`consolidation_plan` jobs only.
Bounded background-job scheduling surface extended for safe
`consolidation_execute` jobs only.
Concrete production adoption plan completed for moving the memory middleware
from disposable validation into a real runtime environment.
First staging-like rehearsal for memory-middleware production adoption
completed in the disposable local Docker validation lane.
First real non-disposable non-production passive runtime and read-only
retrieval rollout completed for memory-middleware.
First real non-disposable non-production bounded write rollout completed for
`memory_candidate_submit` only.
Second real non-disposable non-production bounded write rollout completed for
`memory_candidate_review` in addition to `memory_candidate_submit`.
Third real non-disposable non-production bounded write rollout completed for
candidate promotion planning plus bounded memory promotion.
Fourth real non-disposable non-production bounded write rollout completed for
bounded procedure-draft promotion in addition to submit, review, and bounded
memory promotion.
Fifth real non-disposable non-production bounded write rollout completed for
bounded procedure validation in addition to submit, review, bounded memory
promotion, and bounded procedure-draft promotion.
Sixth real non-disposable non-production bounded write rollout completed for
bounded skill-candidate planning and creation in addition to submit, review,
bounded memory promotion, bounded procedure-draft promotion, and bounded
procedure validation.
Seventh real non-disposable non-production bounded write rollout completed for
bounded procurement planning and internal procurement-record creation in
addition to submit, review, bounded memory promotion, bounded
procedure-draft promotion, bounded procedure validation, and bounded
skill-candidate planning or creation.
Eighth real non-disposable non-production bounded write rollout completed for
bounded manual Skill Vetter handoff preparation and internal vetting-result
recording in addition to submit, review, bounded memory promotion, bounded
procedure-draft promotion, bounded procedure validation, bounded
skill-candidate planning or creation, and bounded procurement state.
Ninth real non-disposable non-production bounded write rollout completed for
bounded approval planning and internal approval-state recording in addition to
submit, review, bounded memory promotion, bounded procedure-draft promotion,
bounded procedure validation, bounded skill-candidate planning or creation,
bounded procurement state, and bounded manual vetting state.
Tenth real non-disposable non-production bounded write rollout completed for
bounded manual install handoff and internal install-record creation in
addition to submit, review, bounded memory promotion, bounded
procedure-draft promotion, bounded procedure validation, bounded
skill-candidate planning or creation, bounded procurement state, bounded
manual vetting state, and bounded approval state.
Production-readiness review completed for the current bounded real-environment
governance posture before any automation enablement.
First live execute-class automation rollout completed for
`proactive_execute_run_drift_check` only in the persistent local
non-production target.
Live advisory scheduler rollout completed for `consolidation_plan` in the
persistent local non-production target.
First live execute-class scheduler rollout completed for low-risk
`consolidation_execute` in the persistent local non-production target.
Post-maintenance automation readiness review completed for the current live
advisory plus execute-class maintenance boundary in the persistent local
non-production target.
Operational runbook and observability hardening completed for the current
enabled memory-middleware posture in the persistent local non-production
target.
Shared-environment rehearsal reconciliation completed for the current
approved memory-middleware posture, and no actual shared non-production
target was available from the current repo or host context.
Shared non-production target discovery completed for the current approved
memory-middleware posture, and the smallest viable next step is explicit
provisioning of a dedicated shared runtime plus dedicated shared Postgres
target because no repo-wired shared target exists today.
Concrete provisioning planning completed for the missing shared
non-production memory-middleware rehearsal target, including the proposed
shared runtime shape, dedicated shared Postgres shape, exact config posture,
ownership model, validation checklist, and rollback checklist.
Shared non-production target wiring completed using the already-installed
Supabase project on the server as the dedicated middleware Postgres target,
with the shared Dockerized OpenClaw runtime restarted on the unchanged
approved posture after both existing middleware migrations were applied.
Shared non-production rehearsal completed for the current approved
memory-middleware posture, including passive startup, bounded governance
flows, bounded advisory and execute-class background-job scheduling, runner
ownership enforcement, and rollback checks.
Production-surface inventory, backup, and exact rollout-diff planning
completed for the live Docker Compose OpenClaw runtime on this VPS, without
applying the production rollout.
Production-runtime designation completed for the live Docker Compose OpenClaw
runtime on this VPS, and the exact minimal production rollout patch is now
resolved without being applied.
First production rollout completed for `memory-middleware` on the confirmed
live Docker Compose OpenClaw runtime on this VPS, using only the approved
runner-owner plus DB-secret parity patch and the already-rehearsed bounded
feature boundary.
Production rollout validation completed on the live Docker Compose OpenClaw
runtime on this VPS, including runtime health, passive startup, retrieval,
bounded candidate submit, approved advisory and execute-class background-job
execution, wrong-runner blocking, and bounded disablement plus restore checks.
First production soak review completed for the approved live
`memory-middleware` boundary on the VPS Docker Compose runtime, with no
rollback or disablement required and no unexpected durable write growth
outside one bounded advisory job-row idempotence probe.
Bounded ordinary live interaction -> candidate capture is now proven on the
approved live production boundary via one fresh `chief` session that created
one candidate submission event plus one matching candidate memory object in
Postgres while leaving review and promotion manual.
First quick-win governance productionization tranche completed for
validated-procedure retrieval, candidate procedure promotion, and procedure
validation on the approved live production boundary, with explicit production
proof, runbook coverage, and no downstream skill, procurement, vetting,
approval, or install growth.
Second quick-win governance productionization tranche completed for
skill-candidate planning and creation plus procurement planning and internal
procurement-record creation on the approved live production boundary, with
explicit production proof, runbook coverage, no downstream vetting,
approval, or install growth, and no retrieval broadening.
First user-experience-focused semantic response-style slice completed on the
approved live production boundary for its intended scope, with bounded
semantic detection, candidate confirmation without manual review,
conversational repair or forget for supported response-style subjects,
checked-in messy-language eval coverage, and narrow production proof without
broader automation enablement.
Second user-experience-focused semantic project-memory slice completed on the
approved live production boundary for its intended scope, with bounded
explicit named-project fact detection, candidate confirmation without manual
review for supported project facts, correction or supersede for supported
project-fact subjects, field-aware approved retrieval, and narrow production
proof without broader automation enablement.
Third user-experience-focused recurring-procedure semantic slice completed on
the approved live production boundary for its intended scope, with bounded
named-checklist detection, candidate confirmation without manual review for
medium-confidence recurring procedures, correction or supersede for supported
recurring checklist subjects, validated-procedure retrieval for clear checklist
asks, and narrow production proof without broader automation enablement.
Fourth user-experience-focused recurring-procedure behavior slice completed on
the approved live production boundary for its intended scope, with
procedure-key-aware validated-procedure retrieval for nearby deploy, release,
triage, and investigation asks, explicit suggestion-first prompt guidance for
nearby advice asks, preserved direct-use only on clear checklist asks, and
narrow production proof without broader automation enablement.
Fifth user-experience-focused workflow-improvement slice completed on the
approved live production boundary for its intended scope, with bounded
tool-gotcha detection, candidate confirmation without manual review for
supported repeated repo-operating lessons, approved-only guidance retrieval,
and narrow production proof without broader automation enablement.
Sixth user-experience-focused workflow-improvement slice completed on the
approved live production boundary for its intended scope, with bounded
environment-constraint detection, candidate confirmation without manual review
for supported host and runtime constraints, approved-only guidance retrieval,
and narrow production proof without broader automation enablement.
Seventh user-experience-focused workflow-improvement slice completed on the
approved live production boundary for its intended scope, with bounded API
workaround detection, candidate confirmation without manual review for the
first supported provider-troubleshooting lessons, approved-only hybrid
guidance retrieval, and narrow production proof without broader automation
enablement.
Eighth user-experience-focused project-memory slice completed on the approved
live production boundary for its intended scope, with bounded repository and
deployment URL capture, candidate confirmation without manual review for the
new URL fields, project-scoped lifecycle or duplicate enforcement, direct
approved retrieval for later project questions, and narrow production proof
without broader automation enablement.
Ninth user-experience-focused project-memory slice completed on the approved
live production boundary for its intended scope, with bounded documentation
and runbook URL capture, candidate confirmation without manual review for the
new support URL fields, direct approved retrieval for later project
questions, and narrow isolated plus production proof without broader
automation enablement.
Tenth user-experience-focused workflow-improvement slice completed on the
approved live production boundary for its intended scope, with bounded
workflow simplification and proof-readiness guidance detection, candidate
confirmation without manual review for the new supported lessons,
approved-only hybrid retrieval, and narrow isolated plus production proof
without broader automation enablement.
First generalized supervised lesson learning slice completed on the approved
live production boundary for its intended scope, with broader repo-local
workflow guidance capture beyond hand-authored lesson keys, normalized
guidance-only candidate shapes, review-first lifecycle control for the new
broader path, approved-only hybrid retrieval without new per-lesson routing,
and isolated plus narrow production proof including explicit no-write
ambiguity evidence.
Fifth family-aware semantic retrieval routing slice completed on the approved
live production boundary for its intended scope, with approved-only
project-scoped semantic fallback for `git_stash_unsafe`, approved source
embedding writes during confirmation promotion, and narrow isolated plus
production proof without broader retrieval broadening.
Pre-feature delivery enablement tranche specified for the remaining memory
program so repeated proof and rollout friction is now treated as roadmap work
instead of ad hoc cleanup.
First delivery enablement slice completed with a shared memory runtime
bootstrap helper that resolves memory command SecretRefs through the supported
gateway snapshot path, ensures built-in memory embedding providers are
registered, and is already reused by the current memory CLI proof-facing path.
Second delivery enablement slice completed with a repo-owned memory proof
runner v1 that reuses the shared bootstrap helper, runs bounded capture or
retrieval proof plans, and emits structured JSON with ids, matched fields, and
gateway health snapshots for isolated and production-style rehearsals.
Third delivery enablement slice completed with a repo-global clean-landing
assertion that now fails `scripts/committer` when the requested landing paths
stay dirty after commit and fails push helper paths when the post-push tree is
dirty or local `HEAD` no longer matches the pushed upstream ref.
Fourth delivery enablement slice completed with Docker health/readiness
alignment so repo Docker surfaces now track `/readyz` as readiness while
`/healthz` remains the shallow liveness signal for proof and rollout
interpretation.

## Compact checkpoint

If you need to rebuild memory context quickly after switching to another
project, start with this checkpoint instead of rereading the full doc pack.

Current compact state:

- the first bounded production soak is closed as passed for its intended scope
- that soak proved:
  - read-only retrieval
  - bounded governance writes
  - bounded scheduler classes
  - runner ownership enforcement
  - bounded durable-growth behavior
- quick-win governance phase is now production-proven as internal manual
  workflow coverage for:
  - validated-procedure retrieval when explicitly requested
  - candidate procedure promotion
  - procedure validation
  - skill-candidate planning and creation
  - procurement planning and internal procurement-record creation
- first semantic response-style UX slice is now live for its intended scope
- supported semantic response-style subjects now include:
  - plain English / avoid jargon
  - bullet points
  - concise replies
  - numbered steps when giving instructions
  - no tables unless asked
- semantic response-style capture now supports:
  - natural preference statements
  - bounded conversational corrections
  - medium-confidence candidate confirmation without manual review
  - targetable conversational forget for supported subjects
  - weak ambiguous ignore instead of dead candidate backlog
- first semantic project-memory UX slice is now live for its intended scope
- supported semantic project-fact subjects now include:
  - default branch
  - staging branch
  - repository URL
  - deployment URL
  - documentation URL
  - runbook URL
  - primary package manager
  - primary environment name
- semantic project-memory capture now supports:
  - explicit named-project fact statements
  - medium-confidence candidate confirmation without manual review
  - bounded project-fact correction or supersede
  - weak ambiguous ignore instead of dead candidate backlog
  - field-aware approved retrieval for direct project questions
  - project-scoped lifecycle and duplicate enforcement for supported fields
- first recurring-procedure semantic UX slice is now live for its intended
  scope
- supported recurring-procedure subjects now include:
  - deploy checklist
  - release checklist
  - triage checklist
  - investigation checklist
- semantic recurring-procedure capture now supports:
  - explicit reusable named-checklist statements
  - medium-confidence candidate confirmation without manual review
  - bounded recurring-procedure correction or supersede
  - validated-procedure retrieval for clear checklist asks
  - validated-procedure retrieval for nearby deploy/release/triage or
    investigation asks
  - suggestion-first behavior guidance for nearby advice asks
  - weak ambiguous ignore instead of dead candidate backlog
- workflow-improvement UX slices are now live for their intended scope
- supported workflow-improvement subjects now include:
  - `pnpm test -- <path-or-filter>` instead of raw Vitest
  - `scripts/committer "<msg>" <file...>` instead of manual
    `git add` + `git commit`
  - avoiding `git stash` in this multi-agent repo
  - using `pnpm check:fast` for docs-only or process-only work instead of
    replaying broader gates
  - using `pnpm memory:proof` for bounded memory proof instead of bespoke
    host-side proof setup
  - trusting `/readyz` for readiness while treating `/healthz` as liveness
  - Python command unavailable on this host or environment
  - gateway `POST /tools/invoke` forbidden in this environment
  - OpenAI embeddings need a configured `OPENAI_API_KEY` or another embeddings
    provider; `openai-codex` OAuth profiles do not satisfy OpenClaw's
    embeddings path directly
  - Anthropic `Extra usage is required for long context requests` means the
    credential is not eligible for `context1m`; use an eligible billed API key
    or keep a fallback model posture
- semantic workflow-improvement capture now supports:
  - repeated bounded repo-operating tool-gotcha statements
  - repeated bounded workflow simplification statements
  - repeated bounded host or runtime constraint statements
  - repeated bounded provider-troubleshooting API workaround statements
  - broader explicit repo-local workflow guidance statements normalized into
    reviewed generic lesson shapes
  - medium-confidence candidate confirmation without manual review
  - review-first lifecycle control for generalized workflow lessons
  - approved-only guidance retrieval for later repo-operating or
    provider-troubleshooting asks
  - weak ambiguous ignore instead of dead candidate backlog on the transcript
    assist seam
  - no action-taking or silent plan mutation
- family-aware semantic retrieval routing is now live for:
  - nearby recurring-procedure asks under explicit validated-procedure scope
  - approved environment-constraint guidance under approved-only project scope
  - approved workflow-improvement tool-gotcha guidance under approved-only
    project scope for:
    - `vitest_wrapper_required`
    - `scripts_committer_required`
    - `git_stash_unsafe`
  - approved API workaround guidance under approved-only project scope for:
    - `openai_embeddings_api_key_required`
    - `anthropic_context1m_eligible_credential_required`
- semantic retrieval remains hybrid-first for:
  - response-style memory
  - explicit named project facts
- latest semantic response-style proof timestamp:
  - `2026-04-05T16:38:19.403Z`
- latest semantic response-style production proof artifacts:
  - `projectId = a3eddcc3-58cb-412f-a19b-ddc1cc20c65e`
  - `agentId = f275b481-e49b-4a83-8c2a-8896d2848036`
  - `sessionId = 7a2ce36a-ed01-4b80-9364-bc4d27487c61`
  - `candidateId = cfe86364-440a-44f5-8dab-97d7004cbb1f`
  - `candidateEventId = 208cd978-c7f7-4b1f-ac92-98cece6824f8`
  - `cleanupReviewId = 11abf604-e12e-4d4a-b1bf-c20ea9980f3c`
- latest semantic response-style production proof delta:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0` before cleanup
  - ambiguous follow-up caused `+0` additional writes
  - final approved-only retrieval for the seeded proof project remained empty
- latest semantic project-memory production proof artifacts:
  - `projectId = 00c98f31-5783-4ac9-9ea0-186e939987a4`
  - `candidateId = d277ee41-dc0d-4c82-ac3c-09ba3953f9c5`
  - `candidateEventId = 9f3be059-999c-4344-9543-feeca0fbf22f`
  - `approvedObjectId = 4c493fe1-df27-4e60-8de7-a26885b88b5b`
  - `reviewId = f2bed2c1-aa85-4496-8e86-d2e2bad1845e`
- latest recurring-procedure production proof artifacts:
  - `projectId = c5120fe9-b48c-411e-9fe9-c10757a0ac9a`
  - `agentId = 4635a71e-fe43-4175-ab33-27c4e2a65809`
  - `sessionId = 7a211d26-f80f-4a17-b078-abf3b0bd00d5`
  - `candidateId = 80d1acb9-394d-4c8f-aab5-e4e29b06373b`
  - `candidateEventId = ca9cb5a6-85a7-44ac-b989-c76ee7ac48bb`
  - `reviewId = ec1d7a9e-791d-4dae-b3b8-8698f7e0140d`
  - `validatedProcedureId = ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
  - `procedureRunId = f6968b5c-d814-4968-80ad-4f6cb44b955d`
- latest recurring-procedure production proof delta:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +1`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +0`
  - `background_jobs +0`
- latest recurring-procedure behavior proof timestamp:
  - `2026-04-05T19:39:00Z`
- latest recurring-procedure behavior production proof artifacts:
  - `projectId = c5120fe9-b48c-411e-9fe9-c10757a0ac9a`
  - `agentId = 4635a71e-fe43-4175-ab33-27c4e2a65809`
  - `sessionId = 7a211d26-f80f-4a17-b078-abf3b0bd00d5`
  - `validatedProcedureId = ed5dd44a-6ea9-4055-88d0-2e6d7bc05017`
  - `rollbackTag = openclaw:pre-recurring-procedure-behavior-20260405T193900Z`
- latest recurring-procedure behavior production proof delta:
  - retrieval-only proof
  - `skill_candidates +0`
  - `background_jobs +0`
  - production health remained `ok`
- latest workflow-improvement production proof artifacts:
  - `projectId = 2fbcec81-165d-4207-ac0d-3653800bdda1`
  - `agentId = 73e7e59a-6eaa-42bf-b442-43ebfc4b128c`
  - `sessionId = 1dab970c-7507-460b-9352-5443d60d91eb`
  - `candidateId = 06401172-641a-49ff-a3f6-ebe8d8e82b6e`
  - `candidateEventId = 239353d7-cbd0-4085-8ea7-61dee3ec6d3a`
  - `approvedObjectId = 7091f421-9f5e-46b4-a561-80b3ac9548a0`
  - `reviewId = 70e9d2b9-8fd6-4939-badf-6c77d3a2fa54`
- latest workflow-improvement production proof delta:
  - `memory_events +1`
  - `memory_objects +2`
  - `memory_reviews +1`
  - repeated confirming evidence caused `+0` additional writes
  - weak ambiguous workflow complaint caused `+0` additional writes
  - `procedures +0`
  - `skill_candidates +0`
  - `background_jobs +0`
- latest environment-constraint proof timestamp:
  - `2026-04-06T00:59:05.632Z`
- latest environment-constraint production proof artifacts:
  - `projectId = fe109afb-fce1-44d6-b5df-78060f900968`
  - `agentId = e5d69dc9-8821-4f1f-8ae0-68b7546660eb`
  - `sessionId = 865f237a-0a64-41fc-ae92-8a5f97e8d595`
  - `candidateId = 6e38707c-f018-446d-979c-7838c9ffe4c8`
  - `candidateEventId = a483d7c8-3d74-4ad8-8b2c-7d0bdbcc1139`
  - `approvedObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
  - `reviewId = bedb5d45-4b5f-4674-b405-98de96e06885`
  - `cleanupReviewId = a383f9aa-9e07-497a-8f09-f6fdf6e4afa0`
  - `rollbackTag = openclaw:pre-environment-constraint-20260406T005126Z`
- latest environment-constraint production proof delta:
  - `memory_events +1`
  - `memory_objects +2`
  - `memory_reviews +1`
  - repeated confirming evidence caused `+0` additional writes
  - transcript-seam ambiguous follow-up caused `+0` additional writes
  - `procedures +0`
  - `skill_candidates +0`
  - `background_jobs +0`
- latest API workaround proof timestamp:
  - `2026-04-06T11:55:43.393255+00`
- latest API workaround production proof artifacts:
  - `projectId = a2b0e2f6-71fd-4bff-a153-522ff4d0d3a4`
  - `agentId = 7670fe60-e1bb-4fd1-a50d-2b0fccac5180`
  - `sessionId = b21351e3-3f5f-411a-a162-dcc8033da53e`
  - `candidateId = 78c552c8-7cdd-46bb-ba0f-44112c54bd7c`
  - `candidateEventId = 2e3bf0a2-150a-45cf-b2a9-f4c0fdb9bacc`
  - `approvedObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
  - `reviewId = 1c8333ce-ce36-4f2b-9d81-6eca35eae970`
  - `cleanupReviewId = a8d02bf9-3d15-4dec-b169-fa4743273494`
  - `rollbackTag = openclaw:pre-api-workaround-20260406T114704Z`
- latest API workaround production proof delta:
  - `memory_reviews +2`
  - repeated confirming evidence caused `+0` additional writes
  - exact workaround retrieval ranked the approved lesson first with
    `auto_capture_lesson_match`, `fts_search_document`, and
    `trigram_similarity`
  - explicit ambiguous manual note submission still hit the broader generic
    `memory_candidate_submit` path and was immediately rejected as proof
    cleanup, so no dead candidate backlog remained
  - `skill_candidates +0`
  - `background_jobs +0`
- latest semantic retrieval routing v2 proof timestamp:
  - `2026-04-06T03:43:15.629278+00`
- latest semantic retrieval routing v2 production proof artifacts:
  - `projectId = fe109afb-fce1-44d6-b5df-78060f900968`
  - `approvedObjectId = 040d161c-7cf9-4ec0-8138-574d9677e9ee`
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
  - `rollbackTag = openclaw:pre-semantic-retrieval-routing-v2-20260406T031528Z`
- latest semantic retrieval routing v2 production proof delta:
  - exact environment-constraint ask stayed hybrid-first
  - conceptual environment-constraint ask gained
    `semantic_embedding` + `semantic_fallback`
  - candidate semantic retrieval stayed disabled
  - health remained `ok`
- latest semantic retrieval routing v3 proof timestamp:
  - `2026-04-06T04:10:25.789589+00`
- latest semantic retrieval routing v3 production proof artifacts:
  - `projectId = db5fdd6d-927e-4a1d-a3a8-edd0d4690c25`
  - `approvedObjectId = 50ef7dea-9216-4bfc-9ad4-745b6d52436d`
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
- latest semantic retrieval routing v3 production proof delta:
  - exact tool-gotcha ask stayed hybrid-first
  - conceptual tool-gotcha ask gained
    `semantic_embedding` + `semantic_fallback`
  - `git_stash_unsafe` remained semantic-out-of-scope
  - approved API workaround guidance remained hybrid-first only
  - candidate semantic retrieval stayed disabled
  - health remained `ok`
- latest semantic retrieval routing v4 proof timestamp:
  - `2026-04-06T17:00:46.525Z`
- latest semantic retrieval routing v4 production proof artifacts:
  - `projectId = a2b0e2f6-71fd-4bff-a153-522ff4d0d3a4`
  - `approvedObjectId = e4e1e2e1-cb77-4242-b53b-84ad18c8105b`
  - `embeddingModel = text-embedding-3-small`
  - `embeddingVersion = c53a957db9784cf10e1b59c12d8766b670f2861e286ecb700894032b4b532e9d`
  - `rollbackTag = openclaw:pre-semantic-retrieval-routing-v4-20260406T170719Z`
- latest semantic retrieval routing v4 production proof delta:
  - exact API workaround ask stayed hybrid-first
  - conceptual API workaround ask gained
    `semantic_embedding` + `semantic_fallback`
  - candidate semantic retrieval stayed disabled
  - health remained `ok`
- latest semantic retrieval routing v5 proof timestamp:
  - `2026-04-06T21:47:50.790Z`
- latest semantic retrieval routing v5 production proof artifacts:
  - `projectId = 3b715f5d-4ca5-472d-a7c2-c6de06936878`
  - `agentId = e7878b71-290b-4e17-a91d-9aa87a106e07`
  - `sessionId = 1ff34ca9-b9db-48b6-b859-5fbd187d2080`
  - `candidateId = dd93537b-ac26-4abe-a544-068b73124e26`
  - `candidateEventId = 19fd2e89-4b07-4260-b1e4-9e9fa5b9d29f`
  - `approvedObjectId = 284e9f91-366f-4ed8-8b1e-a4cc623b099f`
  - `reviewId = ccb0394a-237c-40f2-a26b-eeb71cfa91b3`
  - `embeddingId = 24b65709-e925-463b-ad33-0370cb53fc79`
  - `rollbackTag = openclaw:pre-semantic-retrieval-routing-v5-20260406T212451Z`
- latest semantic retrieval routing v5 production proof delta:
  - first-seen `git_stash_unsafe` evidence entered pending confirmation
  - later confirming evidence auto-promoted the approved workflow lesson
  - approved source memory wrote one `semantic_retrieval_routing_v5` embedding
  - short stash-safety ask and loose conceptual stash-safety ask both gained
    `semantic_embedding` + `semantic_fallback`
  - candidate semantic retrieval stayed disabled
  - health remained `ok`
- isolated proof additionally proved:
  - transcript-seam semantic capture for all supported subjects
  - bullet candidate confirmation with later auto-promotion
  - overlap-aware retrieval choosing numbered steps correctly
  - targetable conversational forget superseding the no-tables preference
- latest semantic project-memory proof timestamp:
  - `2026-04-06T23:40:54.170Z`
- latest semantic project-memory production proof artifacts:
  - `projectId = 2fbcec81-165d-4207-ac0d-3653800bdda1`
  - `agentId = 73e7e59a-6eaa-42bf-b442-43ebfc4b128c`
  - `sessionId = 1dab970c-7507-460b-9352-5443d60d91eb`
  - `candidateId = 34f7cddc-5c2e-4aac-950e-701ad172cd9e`
  - `candidateEventId = 6c49f66f-c42a-4301-b985-82e110978278`
  - `approvedObjectId = 7dee1db4-0d72-457b-8867-83cb568989f8`
  - `reviewId = a961a211-7f39-40c1-843e-03204426abd0`
- latest semantic project-memory production proof delta:
  - `memory_events +1`
  - `memory_objects +2`
  - `memory_reviews +1`
  - duplicate follow-up caused `+0` additional writes
- isolated project-memory proof additionally proved:
  - documentation URL confirmation into approved memory
  - field-aware retrieval ranking the right support URL first
  - transcript-seam ambiguity ignore for unsupported generic `docs` phrasing
  - duplicate suppression for explicit project-fact URL replays
- latest quick-win production proof timestamp:
  - `2026-04-05T15:18:19.270Z`
- latest quick-win production proof artifacts:
  - `eventId = c3f085b5-387d-4fc9-b3ae-9e4b2e8ec580`
  - `candidateId = daba868a-9e0a-4099-ab83-952b3d4513f4`
  - `reviewId = 62b5bbba-47fe-4158-b298-498f68a2ac36`
  - `procedureId = fefa54a7-3169-4595-bef2-44fb8342a73a`
  - `procedureRunId = f90116f5-503c-4497-95dc-33bf89659e17`
  - `skillCandidateId = 63a32b7f-5665-44d2-970f-7f3dca6267f6`
  - `procurementRecordId = 8f62046d-18f0-43be-af5a-c28122e19474`
- latest quick-win production proof delta:
  - `memory_events +2`
  - `memory_objects +1`
  - `memory_reviews +1`
  - `memory_links +1`
  - `memory_sources +1`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +1`
  - `background_jobs +0`
  - `skill_candidate.procurement_record +1`
  - `skill_candidate.vetting_result +0`
  - `skill_candidate.approval +0`
  - `skill_candidate.install_record +0`
- ordinary live agent-turn capture was not the original soak target
- bounded ordinary live interaction -> candidate capture is now separately
  proven on the approved live production boundary
- fresh proof timestamp:
  - `2026-04-04T02:43:36.765Z`
- fresh proof artifacts:
  - `eventId = c3c336fa-baac-4886-b8b1-a78a1e7abac4`
  - `memoryObjectId = 98833f6a-4305-48bf-8492-31f7b95f987d`
- first semantic response-style UX production report now lives in:
  - `docs/memory-system/PRODUCTION_RESPONSE_STYLE_UX_REPORT.md`
- recurring-procedure behavior production report now lives in:
  - `docs/memory-system/PRODUCTION_RECURRING_PROCEDURE_BEHAVIOR_REPORT.md`
- workflow-improvement production report now lives in:
  - `docs/memory-system/PRODUCTION_WORKFLOW_IMPROVEMENT_UX_V2_REPORT.md`
  - `docs/memory-system/PRODUCTION_ENVIRONMENT_CONSTRAINT_UX_REPORT.md`
  - `docs/memory-system/PRODUCTION_API_WORKAROUND_UX_REPORT.md`
- fresh proof delta:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_reviews +0`
  - `background_jobs +0`
- initial bounded live interaction capture soak evidence now exists from two
  additional fresh production sessions:
  - `chief` at `2026-04-04T03:00:00.831Z`
    - `eventId = b8e63c36-b2eb-4c97-b988-8b67b83d99c1`
    - `memoryObjectId = 57f45b20-84ac-4ca4-890d-e01456c41dff`
  - `main` at `2026-04-04T03:00:03.241Z`
    - `eventId = c9f3424a-33a9-422b-9326-318341180b0a`
    - `memoryObjectId = d0e3bb7d-c0ef-4524-bf9d-3cfbed55a6de`
- cumulative delta from that initial bounded live-interaction soak window:
  - `memory_events +2`
  - `memory_objects +2`
  - `memory_reviews +0`
  - `background_jobs +0`
- observed behavior of those fresh sessions:
  - `main` captured a softer "for future reference" standing preference
  - `chief` captured an explicit "please remember" stable preference
  - both stayed within bounded candidate-only writes
- current active slice:
  - environment-constraint UX v1 is now landed for its intended scope
- still intentionally disabled:
  - self-improving capture in production
  - automatic Skill Vetter invocation
  - procurement or install automation
  - actual installation
  - contradiction execution
  - consolidation-driven drift remediation
  - memory-slot takeover
- broader proactive classes beyond the current bounded live set
- fresh-session planning entrypoints now exist for the post-Slice-7 roadmap:
  - `docs/memory-system/feature-inventory.md`
  - `docs/memory-system/specs/README.md`
  - `docs/memory-system/specs/implementation-sequencing.md`
  - `docs/memory-system/specs/premortem.md`

Fast re-entry reading order:

1. `docs/memory-system/STATUS.md`
2. `docs/memory-system/CURRENT_SLICE.md`
3. `docs/memory-system/PRODUCTION_SOAK_REPORT.md`
4. `docs/memory-system/memory-roadmap.md`
5. `docs/memory-system/DECISIONS.md`
6. `docs/memory-system/OPEN_QUESTIONS.md`

## Completed so far

- advisory-only proactive planning now inspects bounded middleware state to
  suggest internal next-step follow-up opportunities without executing them
- proactive planning now supports:
  - `follow_up_candidate_review`
  - `follow_up_procedure_validation`
  - `follow_up_skill_candidate_governance`
  - `revisit_stale_memory`
  - `run_drift_check`
  - `review_consolidation_findings`
  - `no_action`
- proactive planning now returns bounded rationale, affected ids, priority,
  action class, approval class, and an explicit advisory-only note
- focused tests added for proactive planning outputs, no-action behavior,
  disabled behavior, not-configured behavior, unavailable-db behavior, and
  no-write advisory behavior against live Postgres
- proactive execution now supports only:
  - `run_drift_check`
- proactive execution may derive the current advisory `run_drift_check` action
  from `memory_proactive_plan` or accept an explicit bounded selected target id
  set for that action
- proactive execution now routes only through the existing
  `memory_drift_check_execute` seam
- unsupported proactive action classes now return blocked results without
  writes
- repeated proactive drift-check execution now reuses the existing bounded
  drift-check idempotence behavior
- focused tests added for proactive drift-check execution, blocked non-drift
  behavior, repeated execution safety, disabled behavior, not-configured
  behavior, unavailable-db behavior, and bounded side-effect checks against
  live Postgres
- bounded background-job scheduling now supports only:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
- bounded background-job enqueue now persists internal `maintenance` jobs in
  `background_jobs` with middleware-owned `jobClass` and fingerprint metadata
- repeated enqueue for the same bounded payload now resolves to the existing
  queued or running job instead of creating duplicates
- bounded background-job run-next now claims one ready queued job at a time
  using conservative lock-safe selection
- proactive-plan jobs now execute only the existing advisory planner and mark
  bounded job state without writing memory artifacts
- proactive drift-check jobs now execute only through the existing
  `memory_proactive_execute` and `memory_drift_check_execute` seams
- focused tests added for enqueue behavior, run-next behavior, repeat and lock
  safety, disabled behavior, not-configured behavior, unavailable-db
  behavior, and bounded side-effect checks against live Postgres
- bounded background-job scheduling now also supports:
  - `consolidation_plan`
- consolidation-plan jobs now execute only the existing advisory
  `memory_consolidation_plan` seam
- bounded consolidation-plan jobs now preserve repeat-safe dedupe and update
  only job-row state plus execution metadata on `background_jobs`
- focused tests added for consolidation-plan enqueue behavior, run-next
  advisory planning behavior, and no-side-effect checks beyond the job row
- bounded background-job scheduling now also supports:
  - `consolidation_execute`
- consolidation-execute jobs now require an explicit safe approved subset and
  may execute only:
  - `duplicate_merge_review`
  - `stale_superseded_review`
- scheduled consolidation execution still blocks:
  - `contradiction_review`
  - `drift_check_review`
- bounded consolidation-execute jobs now route only through the existing
  `memory_consolidation_execute` seam and preserve repeat-safe dedupe
- focused tests added for consolidation-execute enqueue behavior, blocked
  unsafe enqueue behavior, bounded run-next execution behavior, and no-side-
  effect checks outside the existing consolidation execution path
- concrete production adoption planning is now documented in
  `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`
- the adoption plan now defines:
  - environment assumptions
  - migration sequencing
  - required runtime configuration posture
  - staged rollout phases
  - rollback order
- the first real shared non-production target now exists and is wired as:
  - shared runtime:
    - Docker service `openclaw-upgrade-2026324-openclaw-gateway-1`
    - image `openclaw:local`
    - host ports `28789` and `28790`
  - shared Postgres target:
    - existing Supabase project `wvfcvuwsnhupalpxfttc`
    - database `postgres`
    - schema `memory_middleware`
    - required extensions confirmed:
      - `pgcrypto`
      - `pg_trgm`
      - `vector`
- the shared runtime now mounts the unchanged approved middleware posture:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
  - `memoryObjectQuery.mode = read-only`
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
  - `backgroundJobs.runnerOwnerId = shared-nonprod-runner-1`
- both middleware migrations have now been applied successfully to the shared
  Supabase target:
  - `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`
  - `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`
- the shared runtime now starts healthy on the rebuilt image that includes the
  current middleware plugin manifest schema
- the shared non-production rehearsal has now passed for the approved
  middleware boundary after one shared-target DB URL compatibility correction:
  - `uselibpqcompat=true&sslmode=require`
- passive startup in the shared target remained write-free
- shared retrieval remained healthy through the repo-native runtime against
  the shared Supabase target
- the shared bounded governance flow succeeded for:
  - submit
  - review
  - candidate promotion planning
  - bounded memory promotion
  - bounded procedure promotion
  - bounded procedure validation
  - bounded skill-candidate planning and creation
  - bounded procurement planning and record creation
  - bounded manual Skill Vetter handoff
  - bounded manual vetting-result recording
  - bounded approval planning and approval-state write
  - bounded manual install handoff
  - bounded install-record creation
- shared background-job inspection, enqueue, run-next, and get checks now
  pass for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
  - `consolidation_execute`
- wrong-runner execution remains blocked in the shared target for:
  - `shared-nonprod-runner-wrong`
- shared disablement rollback was verified by:
  - setting `backgroundJobs.executeSchedulingMode = disabled`
  - narrowing `backgroundJobs.advisoryJobClasses` to `[proactive_plan]`
  - confirming blocked enqueue for
    `proactive_execute_run_drift_check` and `consolidation_plan`
  - restoring the approved posture successfully
- shared-target operational differences from the earlier local lane are now
  explicit:
  - bearer-auth HTTP `/tools/invoke` is not usable for this rehearsal
  - repo-native runtime plus gateway health checks were used instead
  - optional project, session, and agent ids must be omitted unless they map
    to real shared-environment references
  - `memory_procedure_validate_plan` remains disabled even while
    `memory_procedure_validate` is enabled
- the only configuration deviation from the earlier provisioning plan is:
  - `MEMORY_MIDDLEWARE_DATABASE_URL` was placed successfully in
    `~/.openclaw/.env`
  - the current middleware checkpoint still requires
    `plugins.entries.memory-middleware.config.database.url` to be a literal
    string
  - the shared runtime therefore currently stores the DB URL literal in
    `~/.openclaw/openclaw.json` as an operator-managed non-production secret
    copy instead of an env-backed SecretRef
  - default-disabled features
  - recommended first-enable bounded features
  - observability and validation checkpoints
- this slice does not apply migrations, change runtime behavior, or enable
  production automation
- the first staging-like rehearsal now records:
  - environment: disposable local Docker `pgvector/pgvector:pg16`
  - config posture:
    - `database.driver = postgres`
    - `database.schema = memory_middleware`
    - `candidateIngress.mode = candidate-only`
  - successful application of:
    - `20260401_000001_memory_middleware_schema_v1.sql`
    - `20260401_000002_memory_middleware_security_retrieval.sql`
  - successful passive runtime startup with no automatic writes
  - successful read-only retrieval sanity check through
    `reviewable_candidates_view`
  - successful bounded candidate-ingress write sanity check with only:
    - `memory_events +1`
    - `memory_objects +1`
    - `memory_sources +1`
  - successful rollback-disablement analogue with no additional writes
- the rehearsal reported no failed checks
- the rehearsal still did not enable:
  - production rollout
  - shared managed staging
  - broad schedulers
  - proactive automation
  - procurement or install workflows
  - Skill Vetter invocation
  - self-improving-agent activation
  - runtime memory-slot takeover
- the first real non-disposable rollout now uses:
  - persistent local Docker Postgres
  - container `memory-middleware-readonly-rollout-pg`
  - volume `memory-middleware-readonly-rollout-data`
  - database `memory_middleware_rollout`
- the first real rollout config posture is now:
  - `candidateIngress.mode = disabled`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the first real rollout successfully validated:
  - both migrations in the persistent target
  - passive runtime startup with no automatic writes
  - approved-memory list and get
  - bounded basic and hybrid search
  - explicit candidate and validated-procedure scope behavior
  - disabled write, scheduler, proactive, and query-disablement checks
  - bounded rollback or disablement via config disablement plus container
    stop or start recovery
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-only`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the first real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded write
  - one successful `memory_candidate_submit` learning write
  - candidate visibility only through explicit candidate scope
  - disabled candidate review, background-job scheduling, proactive execution,
    and self-improving capture in `submit-only` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the real bounded write rollout wrote only:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_sources +1`
- the real bounded write rollout did not write:
  - `memory_reviews`
  - `procedures`
  - `procedure_runs`
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-only`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the second real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded submit plus review
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_review` accepted review write
  - disabled candidate promotion planning, background-job scheduling,
    proactive execution, and self-improving capture in
    `submit-review-only` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the second real bounded write rollout wrote only:
  - `memory_events +1`
  - `memory_objects +1`
  - `memory_sources +1`
  - `memory_reviews +1`
- the second real bounded write rollout did not write:
  - `procedures`
  - `procedure_runs`
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the third real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded submit, review,
    and memory-promotion flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_review` accepted review write
  - one successful `memory_candidate_promote_plan` advisory result
  - one successful `memory_candidate_promote_memory` durable-memory promotion
  - disabled candidate procedure promotion, procedure validation,
    background-job scheduling, proactive execution, and self-improving
    capture in `submit-review-promote-memory` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the third real bounded write rollout wrote only:
  - `memory_events +1`
  - `memory_objects +2`
  - `memory_reviews +1`
  - `memory_sources +3`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the fourth real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - bounded promotion planning for both the learning and procedure candidates
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - disabled procedure validation, skill-candidate creation,
    background-job scheduling, proactive execution, and self-improving
    capture in `submit-review-promote-memory-procedure` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the fourth real bounded write rollout added only:
  - `memory_events +2`
  - `memory_objects +3`
  - `memory_reviews +2`
  - `procedures +1`
  - `memory_links +2`
  - `memory_sources +4`
- the fourth real bounded write rollout did not add:
  - `procedure_runs`
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the fifth real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - one successful `memory_procedure_validate` write
  - disabled procedure validation planning, skill-candidate planning,
    skill-candidate creation, background-job scheduling, proactive
    execution, and self-improving capture in
    `submit-review-promote-memory-procedure-validate` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the fifth real bounded write rollout added only:
  - `memory_events +2`
  - `memory_objects +3`
  - `memory_reviews +2`
  - `procedures +1`
  - `procedure_runs +1`
  - `memory_links +2`
  - `memory_sources +4`
- the fifth real bounded write rollout did not add:
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the sixth real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - one successful `memory_procedure_validate` write
  - one successful `memory_skill_candidate_plan` advisory result
  - one successful `memory_skill_candidate_create` write
  - disabled procurement planning, Skill Vetter handoff, approval
    planning, install handoff, background-job scheduling, proactive
    execution, and self-improving capture in
    `submit-review-promote-memory-procedure-validate-skill` mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the sixth real bounded write rollout added only:
  - `memory_events +2`
  - `memory_objects +3`
  - `memory_reviews +2`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +1`
  - `memory_links +2`
  - `memory_sources +4`
- the sixth real bounded write rollout did not add:
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the seventh real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - one successful `memory_procedure_validate` write
  - one successful `memory_skill_candidate_plan` advisory result
  - one successful `memory_skill_candidate_create` write
  - one successful `memory_skill_candidate_procurement_plan` advisory result
  - one successful
    `memory_skill_candidate_procurement_record_create` write
  - disabled Skill Vetter handoff, vetting-result recording, approval
    planning, install handoff, background-job scheduling, proactive
    execution, and self-improving capture in
    `submit-review-promote-memory-procedure-validate-skill-procurement`
    mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the seventh real bounded write rollout added only:
  - `memory_events +3`
  - `memory_objects +3`
  - `memory_reviews +2`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +1`
  - `memory_links +2`
  - `memory_sources +4`
- the seventh real bounded write rollout did not add:
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the eighth real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - one successful `memory_procedure_validate` write
  - one successful `memory_skill_candidate_plan` advisory result
  - one successful `memory_skill_candidate_create` write
  - one successful `memory_skill_candidate_procurement_plan` advisory result
  - one successful
    `memory_skill_candidate_procurement_record_create` write
  - one successful `memory_skill_candidate_skill_vetter_handoff` advisory
    result
  - one successful `memory_skill_candidate_vetting_result_record` write
  - disabled approval planning, install handoff, background-job scheduling,
    proactive execution, and self-improving capture in
    `submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
    mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the eighth real bounded write rollout added only:
  - `memory_events +4`
  - `memory_objects +3`
  - `memory_reviews +2`
  - `procedures +1`
  - `procedure_runs +1`
  - `skill_candidates +1`
  - `memory_links +2`
  - `memory_sources +4`
- the eighth real bounded write rollout did not add:
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the next real rollout in that same persistent target now uses:
  - `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
  - `memoryObjectQuery.mode = read-only`
  - scheduler disabled
  - proactive execution disabled
- the tenth real bounded write rollout successfully validated:
  - passive runtime startup with no automatic writes
  - approved-memory retrieval before and after the bounded flow
  - one successful `memory_candidate_submit` learning write
  - one successful `memory_candidate_submit` procedure write
  - two successful `memory_candidate_review` accepted review writes
  - one successful `memory_candidate_promote_memory` write
  - one successful `memory_candidate_promote_procedure` write
  - one successful `memory_procedure_validate` write
  - one successful `memory_skill_candidate_plan` advisory result
  - one successful `memory_skill_candidate_create` write
  - one successful `memory_skill_candidate_procurement_plan` advisory result
  - one successful
    `memory_skill_candidate_procurement_record_create` write
  - one successful `memory_skill_candidate_skill_vetter_handoff` advisory
    result
  - one successful `memory_skill_candidate_vetting_result_record` write
  - one successful `memory_skill_candidate_approval_plan` advisory result
  - one successful `memory_skill_candidate_approve` write
  - one successful `memory_skill_candidate_install_handoff` advisory result
  - one successful `memory_skill_candidate_install_record_create` write
  - disabled actual installation, background-job scheduling, proactive
    execution, and self-improving capture in
    `submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
    mode
  - bounded rollback or disablement by switching candidate ingress back to
    `disabled`
- the tenth real bounded write rollout added only:
  - `memory_events +8`
  - `memory_objects +5`
  - `memory_reviews +2`
  - `procedures +2`
  - `procedure_runs +1`
  - `skill_candidates +1`
  - `memory_links +2`
  - `memory_sources +4`
- the tenth real bounded write rollout did not add:
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- the production-readiness review now documents:
  - what is already proven safe in the current real non-production posture
  - what remains manual by design
  - which automation classes are lowest-risk candidates for first enablement
  - which observability, runner-ownership, disablement, and rollback controls
    are still missing
  - which config gates should exist before any scheduler or proactive rollout
- the production-readiness review recommends:
  - keep all automation disabled for now
  - treat `proactive_plan`-only scheduling as the first candidate after the
    missing safeguards are documented and wired
- the automation-safeguards slice now adds:
  - separate config gates for background-job inspection, advisory scheduling,
    and execute-class scheduling
  - optional single-runner ownership enforcement for
    `memory_background_job_run_next`
  - bounded `memory_background_job_list` and `memory_background_job_get`
    inspection surfaces
  - immediate disablement through config without changing retrieval or manual
    governance posture
- the first live automation rollout now also confirms that:
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [proactive_plan]`
  - `backgroundJobs.executeSchedulingMode = disabled`
  - `backgroundJobs.runnerOwnerId` may enforce a single live runner
  - `memory_background_job_enqueue`, `memory_background_job_list`,
    `memory_background_job_get`, and `memory_background_job_run_next` may be
    enabled for `proactive_plan` only in the real non-production target
  - `proactive_execute_run_drift_check`, `consolidation_plan`, and
    `consolidation_execute` stay blocked in that posture
  - retrieval and the already-enabled bounded governance path remain healthy
- the next live execute-class rollout now also confirms that:
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [proactive_plan]`
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
  - `memory_background_job_enqueue`, `memory_background_job_list`,
    `memory_background_job_get`, and `memory_background_job_run_next` may be
    enabled for `proactive_plan` plus
    `proactive_execute_run_drift_check` only in the real non-production
    target
  - `proactive_execute_run_drift_check` runs only through the existing
    bounded drift-check seam and stays repeat-safe on rerun
  - `consolidation_plan` and `consolidation_execute` stay blocked in that
    posture
  - retrieval and the already-enabled bounded governance path remain healthy
- the next live advisory rollout now also confirms that:
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [consolidation_plan, proactive_plan]`
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check]`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
  - `memory_background_job_enqueue`, `memory_background_job_list`,
    `memory_background_job_get`, and `memory_background_job_run_next` may be
    enabled for `consolidation_plan`, `proactive_plan`, and
    `proactive_execute_run_drift_check` only in the real non-production
    target
  - `consolidation_plan` now runs only through the existing bounded
    advisory consolidation-planning seam and writes no consolidation
    execution artifacts
  - `consolidation_execute` stays blocked in that posture
  - retrieval and the already-enabled bounded governance path remain healthy
- the next live execute-class rollout now also confirms that:
  - `backgroundJobs.inspectionMode = enabled`
  - `backgroundJobs.advisorySchedulingMode = enabled`
  - `backgroundJobs.advisoryJobClasses = [consolidation_plan, proactive_plan]`
  - `backgroundJobs.executeSchedulingMode = enabled`
  - `backgroundJobs.executeJobClasses = [consolidation_execute, proactive_execute_run_drift_check]`
  - `backgroundJobs.runnerOwnerId = rollout-runner-1`
  - `memory_background_job_enqueue`, `memory_background_job_get`, and
    `memory_background_job_run_next` may now be enabled for
    `consolidation_execute` low-risk scheduling in the real non-production
    target
  - scheduled `consolidation_execute` now materializes only conservative
    low-risk duplicate or stale-superseded writes through the existing
    bounded consolidation-execution seam
  - the live rollout observed only:
    - `memory_reviews +1`
    - `memory_links +1`
  - `memory_events`, `procedure_runs`, `skill_candidates`, `agent_state`,
    `tool_results`, and `compaction_events` remained unchanged during the
    scheduled consolidation-execution run
  - contradiction and drift consolidation actions remain blocked by the
    bounded safe-subset contract
- high-level architecture defined
- context-plane vs knowledge-plane split defined
- memory taxonomy defined
- promotion pipeline defined
- Postgres schema v1 drafted
- plugin tool contract drafted
- promotion scoring rules drafted
- RLS/security and hybrid retrieval design drafted
- Codex handoff approach defined
- initial repo doc pack drafted
- repo structure and conventions audited
- existing memory subsystem overlap identified
- final placement recommendations drafted for docs, plugin, skills, migrations, tests, and workspace mirrors
- final scaffold extension id chosen: `memory-middleware`
- extension scaffold created under `extensions/memory-middleware`
- plugin-local skills area created under `extensions/memory-middleware/skills`
- immediate onboarding posture documented for Skill Vetter and `self-improving-agent`
- dedicated procurement and vetting workflow documented
- third-party skill lifecycle states defined
- minimum vetting outputs defined
- install blockers documented
- mandatory Skill Vetter gate documented for ClawHub, GitHub or imported, and
  other externally sourced skills
- dedicated self-improving-agent integration plan documented
- allowed and prohibited role for `self-improving-agent` defined
- candidate learning, correction capture, procedure suggestion, and improvement
  note outputs defined
- self-improving-agent guardrails documented to prevent memory-substrate
  takeover or policy bypass
- Skill Vetter installed as the first approved external skill for this effort
- external-skill installation mechanism confirmed as the Codex skill installer
  into `$CODEX_HOME/skills`
- Skill Vetter availability verified from the installed skill directory after
  installation
- formal vetting record written for `self-improving-agent`
- `self-improving-agent` reviewed against source, scope, permissions, red
  flags, operational fit, and accelerator-versus-substrate policy
- `self-improving-agent` recommendation set to `approve for limited use`
- `self-improving-agent` remains uninstalled after vetting
- constrained adoption analysis completed for `self-improving-agent`
- raw installation judged unsafe under current architecture
- wrapper guidance alone judged insufficient
- recommended adoption path set to `defer until plugin base exists`
- reduced-profile fork spec written for `self-improving-agent`
- allowed outputs, forbidden outputs, and required removals from upstream
  behavior defined
- future candidate-only write targets and review gates defined
- future plugin-base mapping defined for candidate learnings, corrections,
  procedure suggestions, and improvement notes
- reduced-profile self-improving adaptation tool implemented as
  `memory_self_improving_capture_candidate`
- reduced-profile self-improving adaptation now stamps provenance showing
  repo-native reduced-profile origin and routes only through
  `memory_candidate_submit`-equivalent candidate ingress behavior
- forbidden non-candidate output postures are now blocked before any DB write
- no new tables or authority surfaces were added for the adaptation; it reuses
  the existing candidate submission path only
- plugin base scaffold created under `extensions/memory-middleware/src`
- local extension barrels added for plugin entry and runtime exports
- config schema and config normalization added for future database and
  candidate-ingress settings
- empty tool registration skeleton added to avoid runtime behavior changes
- inert plugin service added for future middleware ownership
- DB access and query skeleton added with typed `not_implemented` candidate
  submission results
- candidate-only ingress port types and mapping seams added for future external
  emitters
- scaffold integrity test added to confirm the plugin stays non-exclusive and
  registers no tools yet
- canonical DB subtree chosen under `extensions/memory-middleware/db`
- canonical migration root chosen as
  `extensions/memory-middleware/db/migrations/`
- schema and security docs linked to the extension-owned DB subtree
- migration naming convention chosen for schema v1 and security or retrieval
  follow-on work
- inert DB placement README added without creating executable migration SQL
- first executable schema-v1 migration drafted at
  `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`
- dedicated `memory_middleware` schema namespace chosen for the backend tables
- schema-v1 migration includes core enums, foundation tables, indexes, and
  updated-at trigger support
- schema-v1 migration explicitly excludes RLS, retrieval, pgvector, and hybrid
  search work
- schema-v1 reviewed against the first future candidate-only tool surface
- candidate event naming refined from a learning-specific label to the generic
  `candidate_submission`
- provenance and graph constraints tightened for `memory_sources` and
  `memory_links`
- review-queue and candidate-surface indexes added for memory objects,
  procedures, skill candidates, and event chronology
- schema-v1 is now considered ready for the first candidate-only tool surface
  with only normal implementation-time review remaining
- first candidate-only tool surface implemented as `memory_candidate_submit`
- candidate-only payload validation added for learnings, corrections,
  procedure suggestions, and improvement notes
- candidate submissions now route through the plugin-owned candidate-ingress
  seam instead of an inert placeholder
- DB query layer now returns explicit `not_configured` versus
  `configured-but-not-implemented` outcomes for candidate submissions
- candidate-only persistence planning now maps the first submission seam onto
  `memory_events`, `memory_objects`, and `memory_sources` while keeping review
  state at `candidate`
- focused tests added for candidate payload validation, ingress routing, query
  planning, and plugin registration
- real Postgres-backed candidate submission writes now exist for
  `memory_candidate_submit`
- schema-v1 migration validated in a controlled Docker `postgres:16`
  environment owned by the extension test path
- successful candidate submissions now write candidate-state rows into
  `memory_events`, `memory_objects`, and `memory_sources`
- foreign-key failures now roll back cleanly instead of leaving partial writes
- unavailable configured databases now return explicit failed results instead of
  planning-only `not_implemented` responses
- end-to-end integration tests added for the real tool path against a live
  Postgres container
- candidate query tools implemented as:
  - `memory_candidate_list`
  - `memory_candidate_get`
- candidate-only reads now route through the plugin-owned candidate-query seam
- DB query layer now supports candidate-only list and get operations against
  `memory_objects` joined to `memory_events`
- candidate inspection remains bounded to rows with candidate review state and
  `candidate_submission` provenance
- focused tests added for candidate query payload validation, query routing,
  disabled behavior, not-configured behavior, unavailable-db behavior, and live
  Postgres-backed list/get inspection
- candidate review mutation tool implemented as `memory_candidate_review`
- candidate reviews now route through a plugin-owned candidate-review seam
- DB query layer now supports bounded candidate review writes into
  `memory_reviews`
- `accepted` candidate reviews now record a review outcome without promoting the
  memory object into approved state
- `rejected` and `needs_revision` candidate reviews now move the memory object
  out of active candidate state while preserving review rationale
- focused tests added for candidate review validation, valid transitions,
  invalid-state behavior, disabled behavior, not-configured behavior,
  unavailable-db behavior, and live Postgres-backed review recording
- manual promotion planning tool implemented as `memory_candidate_promote_plan`
- promotion planning now routes through a plugin-owned advisory seam
- DB query layer now supports advisory-only promotion-planning reads using the
  candidate row plus its latest review record
- advisory planning now supports:
  - `remain_candidate_only`
  - `propose_memory_promotion`
  - `propose_procedure_draft`
- accepted reviewed candidates can now produce advisory-only next-step targets
  without triggering writes
- unreviewed, rejected, or needs-revision candidates remain in
  `remain_candidate_only` planning
- focused tests added for promotion-planning validation, eligible and ineligible
  outcomes, disabled behavior, not-configured behavior, unavailable-db
  behavior, and no-write advisory behavior against live Postgres
- bounded memory-promotion tool implemented as
  `memory_candidate_promote_memory`
- memory promotion now routes through a plugin-owned promotion seam
- DB query layer now supports the first bounded promotion write for eligible
  reviewed non-procedure candidates
- successful bounded memory promotion now materializes:
  - one approved durable-memory row in `memory_objects`
  - provenance rows in `memory_sources` for the original event and accepted
    review
  - a `derived_from` provenance edge in `memory_links`
- repeated bounded memory promotion for the same candidate now resolves to the
  existing approved durable-memory row instead of creating duplicates
- accepted procedure candidates remain planning-only and are explicitly
  ineligible for the bounded memory-promotion write path
- focused tests added for valid promotion writes, ineligible candidates,
  duplicate promotion handling, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no unintended procedure or skill side effects
- bounded procedure-draft promotion tool implemented as
  `memory_candidate_promote_procedure`
- procedure promotion now routes through the same plugin-owned promotion seam
- DB query layer now supports the first bounded procedure-draft promotion write
  for eligible reviewed procedure candidates
- successful bounded procedure promotion now materializes:
  - one draft row in `procedures`
  - one provenance edge in `memory_links` back to the source candidate
  - accepted review and source-event provenance in procedure metadata
- repeated bounded procedure promotion for the same candidate now resolves to
  the existing draft procedure instead of creating duplicates
- non-procedure candidates remain explicitly ineligible for the bounded
  procedure-draft promotion write path
- focused tests added for valid procedure-draft writes, ineligible candidates,
  duplicate promotion handling, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no unintended skill-candidate side effects
- second executable migration drafted at
  `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`
- security and retrieval substrate now drafted for:
  - internal principal and membership helpers
  - RLS helper functions and policies
  - curated internal approved-memory and reviewable-candidate views
  - FTS and trigram support on durable text surfaces
  - the `memory_embeddings` side table
  - embedding-oriented background-job indexing
- the security and retrieval migration remains drafted only and unexecuted in
  this slice
- no live retrieval tools or runtime retrieval wiring were added in this slice
- advisory procedure-validation planning tool implemented as
  `memory_procedure_validate_plan`
- procedure-validation planning now routes through a plugin-owned advisory seam
- DB query layer now supports advisory-only procedure-validation planning reads
  using:
  - the draft procedure row from `procedures`
  - the source candidate link from `procedures.source_memory_object_id`
  - the latest candidate review record from `memory_reviews`
- advisory procedure-validation planning now supports:
  - `remain_draft_only`
  - `propose_validated_procedure`
- accepted bounded procedure drafts with preserved review and event provenance
  can now produce advisory-only validated-procedure planning targets
- draft procedures missing bounded promotion provenance remain in
  `remain_draft_only`
- focused tests added for procedure-validation planning validation, eligible
  and ineligible outcomes, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write advisory behavior against live
  Postgres
- bounded validated-procedure tool implemented as `memory_procedure_validate`
- procedure validation now routes through a plugin-owned bounded write seam
- DB query layer now supports the first bounded procedure validation write for
  eligible reviewed draft procedures
- successful bounded procedure validation now materializes:
  - one `passed` row in `procedure_runs`
  - one `validated` status transition on `procedures`
  - bounded validation metadata on the procedure row
- repeated bounded procedure validation for the same procedure now resolves to
  the existing validated procedure instead of creating duplicate validation runs
- draft procedures without bounded promotion provenance remain explicitly
  ineligible for the validated-procedure write path
- focused tests added for valid procedure validation writes, ineligible
  procedures, duplicate validation handling, disabled behavior,
  not-configured behavior, unavailable-db behavior, and no unintended
  skill-candidate side effects
- advisory skill-candidate planning tool implemented as
  `memory_skill_candidate_plan`
- skill-candidate planning now routes through a plugin-owned advisory seam
- DB query layer now supports advisory-only skill-candidate planning reads
  using:
  - the validated procedure row from `procedures`
  - preserved candidate lineage from the bounded procedure path
  - the latest bounded validation run from `procedure_runs`
- advisory skill-candidate planning now supports:
  - `remain_validated_procedure_only`
  - `propose_skill_candidate`
- eligible validated procedures with preserved bounded provenance and a passed
  validation run can now produce advisory-only skill-candidate planning targets
- validated procedures without bounded candidate lineage remain in
  `remain_validated_procedure_only`
- focused tests added for skill-candidate planning validation, eligible and
  ineligible outcomes, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write advisory behavior against live
  Postgres
- bounded skill-candidate write tool implemented as
  `memory_skill_candidate_create`
- skill-candidate creation now routes through a plugin-owned bounded write seam
- DB query layer now supports the first bounded skill-candidate creation write
  for eligible validated procedures
- successful bounded skill-candidate creation now materializes:
  - one `candidate` row in `skill_candidates`
  - bounded procedure, candidate, review, source-event, and validation-run
    lineage in metadata
- repeated bounded skill-candidate creation for the same procedure now
  resolves to the existing skill-candidate row instead of creating duplicates
- validated procedures without bounded candidate lineage remain explicitly
  ineligible for the skill-candidate write path
- focused tests added for valid skill-candidate creation writes, ineligible
  procedures, duplicate creation handling, disabled behavior,
  not-configured behavior, unavailable-db behavior, and no unintended install
  or downstream side effects
- advisory procurement-handoff planning tool implemented as
  `memory_skill_candidate_procurement_plan`
- procurement handoff planning now routes through a plugin-owned advisory seam
- DB query layer now supports advisory-only procurement-handoff planning reads
  using:
  - the bounded `skill_candidates` row
  - the source procedure link
  - preserved candidate, review, event, and validation lineage from metadata
  - the latest validation outcome from `procedure_runs`
- advisory procurement handoff planning now supports:
  - `remain_internal_skill_candidate_only`
  - `propose_procurement_handoff`
- eligible bounded skill candidates can now produce structured procurement
  handoff information aligned with:
  - `source`
  - `scope`
  - `permissions_risk`
  - `suspicious_patterns`
  - `operational_fit`
  - `approval_recommendation`
- this slice remains read-only and does not invoke Skill Vetter or install
  skills
- focused tests added for procurement-handoff planning validation, eligible
  and ineligible outcomes, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write advisory behavior against live
  Postgres
- bounded procurement-record write tool implemented as
  `memory_skill_candidate_procurement_record_create`
- procurement-record creation now routes through a plugin-owned bounded write
  seam
- DB query layer now supports the first bounded procurement-record write for
  eligible bounded `skill_candidates`
- successful bounded procurement-record creation now materializes:
  - one internal `memory_events` row with
    `event_name = skill_candidate.procurement_record`
  - the full structured procurement handoff payload in event `payload`
  - bounded lineage and recorder metadata in event `metadata`
- repeated procurement-record creation for the same skill candidate now
  resolves to the existing internal record instead of creating duplicates
- ineligible skill candidates remain explicitly blocked from procurement-record
  creation
- focused tests added for valid procurement-record writes, ineligible skill
  candidates, duplicate creation handling, disabled behavior,
  not-configured behavior, unavailable-db behavior, and no unintended install
  or downstream side effects
- advisory manual Skill Vetter handoff tool implemented as
  `memory_skill_candidate_skill_vetter_handoff`
- manual Skill Vetter handoff planning now routes through a plugin-owned
  advisory seam
- DB query layer now supports advisory-only manual Skill Vetter handoff reads
  using:
  - the bounded `skill_candidates` row
  - the source procedure link
  - preserved candidate, review, event, and validation lineage from metadata
  - the latest validation outcome from `procedure_runs`
  - the latest internal `skill_candidate.procurement_record` event from
    `memory_events`
- advisory manual Skill Vetter handoff planning now supports:
  - `remain_internal_only`
  - `propose_skill_vetter_handoff`
- eligible bounded skill candidates with procurement records can now produce a
  structured manual Skill Vetter handoff package with explicit manual steps
  and install guardrails
- skill candidates without procurement records remain explicitly blocked from
  manual Skill Vetter handoff planning
- focused tests added for valid manual Skill Vetter handoff outputs,
  ineligible skill candidates, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no unintended write side effects
- bounded manual vetting-result write tool implemented as
  `memory_skill_candidate_vetting_result_record`
- manual vetting-result creation now routes through a plugin-owned bounded
  write seam
- DB query layer now supports the first bounded manual vetting-result write for
  eligible bounded `skill_candidates`
- successful bounded manual vetting-result creation now materializes:
  - one internal `memory_events` row with
    `event_name = skill_candidate.vetting_result`
  - the procurement record id and preserved handoff package in event `payload`
  - the manual decision plus structured vetting result fields in event
    `payload`
  - bounded lineage plus reviewer metadata in event `metadata`
- repeated vetting-result creation for the same skill candidate now resolves
  to the existing internal record instead of creating duplicates
- ineligible skill candidates remain explicitly blocked from vetting-result
  creation until procurement-record-backed manual handoff exists
- focused tests added for valid vetting-result writes, ineligible skill
  candidates, duplicate creation handling, disabled behavior,
  not-configured behavior, unavailable-db behavior, and no unintended install
  or downstream side effects
- advisory approval and install planning tool implemented as
  `memory_skill_candidate_approval_plan`
- approval and install planning now routes through a plugin-owned advisory
  seam
- DB query layer now supports the first bounded approval and install planning
  read path for eligible bounded `skill_candidates`
- advisory approval and install planning now inspects:
  - the bounded `skill_candidates` row
  - the linked source procedure
  - the latest validation evidence from `procedure_runs`
  - the latest internal `skill_candidate.procurement_record` event from
    `memory_events`
  - the latest internal `skill_candidate.vetting_result` event from
    `memory_events`
- advisory approval and install planning now supports:
  - `remain_internal_only`
  - `propose_approved_for_limited_use`
  - `propose_approved_for_normal_use`
  - `remain_blocked`
- eligible bounded skill candidates with recorded manual vetting results can
  now produce explicit approval-planning rationale, required gates, remaining
  blockers, and install guardrails without mutating approval state or
  installing skills
- focused tests added for valid approval-planning outputs, blocked or
  ineligible skill candidates, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write advisory behavior against live
  Postgres
- bounded approval-state write tool implemented as
  `memory_skill_candidate_approve`
- approval-state recording now routes through a plugin-owned bounded write
  seam
- DB query layer now supports the first bounded approval-state write for
  eligible bounded `skill_candidates`
- successful bounded approval-state writes now materialize:
  - one internal `memory_events` row with
    `event_name = skill_candidate.approval`
  - a bounded `skill_candidates.status` transition to either
    `approved_limited` or `approved_normal`
  - bounded approval linkage, scope, and install guardrails in skill-candidate
    metadata
- repeated approval attempts for the same skill candidate now resolve to the
  existing approval record instead of creating duplicates
- blocked or ineligible skill candidates remain explicitly prevented from
  approval-state writes
- focused tests added for valid approval writes, blocked or ineligible skill
  candidates, duplicate approval handling, disabled behavior,
  not-configured behavior, unavailable-db behavior, and no unintended install
  or downstream side effects
- advisory manual install handoff tool implemented as
  `memory_skill_candidate_install_handoff`
- manual install handoff planning now routes through a plugin-owned advisory
  seam
- DB query layer now supports the first bounded manual install handoff read
  path for approved bounded `skill_candidates`
- advisory manual install handoff planning now inspects:
  - the approved `skill_candidates` row
  - the latest internal `skill_candidate.approval` event from `memory_events`
  - the latest internal `skill_candidate.procurement_record` event from
    `memory_events`
  - the latest internal `skill_candidate.vetting_result` event from
    `memory_events`
  - the linked source procedure plus the latest validation evidence from
    `procedure_runs`
- advisory manual install handoff planning now supports:
  - `remain_approved_internal_only`
  - `propose_manual_install_handoff`
- approved bounded skill candidates can now produce a structured manual
  install handoff package with approval scope, rationale, remaining blockers,
  install guardrails, and explicit manual steps without installing skills
- focused tests added for valid install-handoff outputs, blocked or
  ineligible skill candidates, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write advisory behavior against live
  Postgres
- bounded live retrieval tools implemented as:
  - `memory_object_list`
  - `memory_object_get`
  - `memory_object_search_basic`
- live retrieval now routes through a plugin-owned bounded object-query seam
- DB query layer now supports the first bounded live retrieval read paths for:
  - approved durable `memory_objects` by default
  - candidate `memory_objects` only when an explicit retrieval scope requests
    them
  - validated `procedures` only when an explicit retrieval scope requests them
- the first live retrieval surface now supports:
  - bounded list
  - exact get by id
  - basic text search over memory-object content and validated procedure text
- focused tests added for valid retrieval outputs, hidden candidate behavior,
  validated-procedure reads, disabled behavior, not-configured behavior,
  unavailable-db behavior, and no-write read-only behavior against live
  Postgres
- ranked retrieval tool implemented as:
  - `memory_object_search_hybrid`
- the live retrieval seam now supports bounded ranked text search over:
  - approved `memory_objects`
  - validated `procedures` when an explicit retrieval scope requests them
  - candidate `memory_objects` only when an explicit candidate scope requests
    them
- hybrid retrieval ranking now uses bounded exact, prefix, and substring
  matching with title-aware weighting for validated procedures
- focused tests added for ranked ordering, explicit scope behavior, disabled
  behavior, unavailable-db behavior, and no-write behavior against live
  Postgres
- both drafted migrations now apply successfully together in the disposable
  validation environment
- the disposable validation lane now runs on a pgvector-capable Postgres image
  so the drafted `vector` extension and `memory_embeddings` side table can be
  validated instead of stubbed out
- controlled validation now confirms the drafted security and retrieval
  substrate for:
  - helper auth and membership tables
  - RLS enablement and policy creation
  - curated internal views
  - generated search-document columns
  - retrieval indexes
  - the `memory_embeddings` side table
  - helper principal-resolution and access-check functions
- the existing bounded middleware write and read paths still pass against the
  combined validated schema
- the live retrieval layer now uses the validated substrate where appropriate:
  - approved-only get and list now read through
    `memory_middleware.internal_approved_memory_v`
  - basic search now uses generated `search_document` columns for approved
    memory objects and validated procedures, with bounded text fallback
  - ranked search now uses bounded FTS plus trigram-style scoring instead of
    the earlier exact or substring-only ranking
- explicit scope rules remain unchanged:
  - approved memory is still the default visible retrieval surface
  - candidate memory still requires explicit candidate scope
  - validated procedures still require explicit validated-procedure scope
- focused retrieval tests now assert validated substrate signals such as
  approved-view population and `fts_search_document` matches in ranked search
- the live retrieval layer now exposes more formal read discipline:
  - approved memory objects resolve through the curated
    `internal_approved_memory_v` surface
  - explicitly requested candidate reads resolve through the curated
    `internal_reviewable_candidates_v` surface
  - explicitly requested validated procedures resolve through a stable
    validated-procedure read model
- retrieval records now identify the bounded read surface that produced them:
  - `approved_memory_view`
  - `reviewable_candidates_view`
  - `validated_procedure_read_model`

## In progress

- next bounded implementation slice selection

## Not started

- runtime implementation inside the middleware extension
- backend subtree creation for Postgres or Supabase, if approved
- additional tool implementation
- RLS migration
- retrieval implementation
- full hybrid retrieval implementation
- `self-improving-agent` installation
- reduced-profile `self-improving-agent` implementation
- migration execution
- any runtime enablement of external skills

## Current risks

1. The repo already has an active memory architecture built around workspace files, `memory-core`, `memory-lancedb`, and `memory_search` or `memory_get`; the new middleware must coexist with or deliberately supersede that model instead of silently duplicating it.
2. Bundled plugins already use the exclusive `kind: "memory"` slot for memory backends, so the middleware plugin should not claim that slot by default unless replacement is intentional.
3. There is no existing Supabase or Postgres migration tree in this repo, so any DB-backed implementation will introduce a new convention and must do so deliberately.
4. Public docs in `docs/` normally use Mintlify frontmatter and user-facing structure; `docs/memory-system/` is acceptable as an internal architecture pack, but it should not be mistaken for finished public docs.
5. Workspace mirrors must reconcile with the existing workspace memory model (`MEMORY.md`, `memory/*.md`, and the bundled `session-memory` hook) rather than inventing a second opaque mirror system.
6. `self-improving-agent` is not rejected, but its default file-promotion and hook posture is too broad for normal approval under the current architecture.
7. A future review-record storage pattern for per-skill findings is still not finalized beyond the current canonical policy and the self-improving-agent procurement docs.
8. The plugin base now exists and the first candidate-only seam is in place,
   but constrained external adoption still depends on future DB execution and
   review flow work.
9. The reduced-profile spec is now concrete, but it still depends on future plugin-base seams before any fork or adaptation can be implemented safely.
10. The first candidate-only DB path now exists, but the broader DB layer is
    still narrow and does not yet cover review, retrieval, or policy-aware
    workflows.
11. The migration location is now chosen, but the first real SQL files still need careful review because this repo did not previously have a backend migration convention.
12. The schema-v1 migration has now been validated against a disposable live
    Postgres instance, but only for the first candidate-only submission path.
13. The first candidate-only DB write path is working, but it is still a narrow
    insert seam and not yet a full middleware runtime.
14. Candidate inspection now exists, but it is still limited to candidate-state
    list/get behavior and does not yet cover review mutations, retrieval, or
    policy-aware access control.
15. Candidate review mutation now exists, but it is still intentionally bounded
    and does not create approved memory, procedure promotion, skill promotion,
    or policy-aware review workflows.
16. Promotion planning now exists, but procedure-draft planning is still
    advisory-only and still depends on later explicit promotion-write slices.
17. The first bounded durable-memory promotion write now exists, but it is
    limited to eligible reviewed non-procedure candidates and does not yet
    cover validated procedures, skill promotion, retrieval, or policy-aware
    access control.
18. The first bounded procedure-draft promotion write now exists, but it is
    limited to eligible reviewed procedure candidates and does not yet cover
    validated procedures, skill promotion, retrieval, or policy-aware access
    control.
19. The second migration now drafts the security and retrieval substrate, but
    those policies, views, indexes, and helper tables have not been executed
    against a live database in this slice.
20. Validated-procedure planning now exists, but it is still advisory-only and
    does not yet create validated procedures, procedure runs, skill
    candidates, or any automatic downstream workflows.
21. The first bounded validated-procedure write now exists, but it does not yet
    create skill candidates, perform retrieval work, or trigger any automatic
    downstream workflows.
22. Skill-candidate creation now exists, but it is still bounded to one
    reviewable `skill_candidates` row and does not yet execute vetting,
    installation, or automatic downstream workflows.
23. Procurement handoff planning now exists, but it is still advisory-only and
    does not invoke Skill Vetter, create vetting records automatically, or
    install skills.
24. Procurement-record creation now exists, but it is still bounded to one
    internal record event and does not invoke Skill Vetter, advance approval
    state, or install skills.
25. Manual Skill Vetter handoff planning now exists, but it is still
    advisory-only and does not invoke Skill Vetter, mutate approval state, or
    install skills.
26. Manual vetting-result creation now exists, but it is still bounded to one
    internal record event and does not invoke Skill Vetter, advance approval
    state, or install skills.
27. Approval and install planning now exists, but it is still advisory-only
    and does not mutate approval state, install skills, or automate any later
    procurement workflow.
28. Approval-state recording now exists, but it is still bounded to internal
    approval records and status transitions and does not install skills or
    automate any downstream workflow.
29. Manual install handoff planning now exists, but it is still advisory-only
    and does not install skills, mutate installed-skill state, or automate any
    downstream workflow.
30. The first live retrieval surface now exists, but it is still bounded to
    explicit list, get, and basic text search paths and does not yet provide
    policy-aware RPCs, RLS-backed exposure, or hybrid semantic retrieval.
31. The upgraded ranked retrieval surface now exists, but it is still limited
    to bounded exact, prefix, and substring matching and does not yet use the
    drafted FTS, trigram, or vector substrate.
32. The security and retrieval migration now validates in a disposable local
    lane, but production execution, policy-aware RPC exposure, and runtime use
    of the drafted substrate are still not implemented.
33. The first bounded family-aware semantic retrieval slice now exists as a
    live working-context path for nearby recurring-procedure asks, but it is
    still limited to validated procedures, keeps hybrid retrieval as the
    default baseline, exposes no candidate semantic retrieval, and does not
    broaden into generic embedding-first search across the other memory
    families.
34. The first bounded installed-skill record surface now exists, but it only
    records manual installation outcomes as internal middleware artifacts and
    does not perform installation, mutate runtime skill state, or trigger
    downstream workflows.
35. The first bounded context-plane persisted tool-result surface now exists,
    but it only persists oversized tool outputs with stable preview contracts
    and explicit rehydration, and it does not yet implement microcompaction,
    session memory, or compaction fallback.
36. The first bounded microcompaction planner now exists, but it is still
    planning-only over persisted tool-result previews and does not yet clear
    prompt state automatically, summarize stale outputs, write compaction
    records, or update session memory.
37. The first bounded session-memory layer now exists, but it is still a
    direct manual read or update surface over `agent_state`; it does not yet
    summarize transcripts, run background consolidation, or drive compaction
    fallback.
38. The first bounded compaction-planning surface now exists, but it is still
    advisory-only; it does not yet clear previews, summarize transcripts,
    write compaction records, or execute any full fallback compaction.
39. The first bounded microcompaction execution surface now exists, but it is
    still limited to clearing planner-eligible persisted preview state. It
    does not summarize transcripts, update session memory, or execute full
    fallback compaction.
40. The first bounded session-memory-backed compaction execution surface now
    exists, but it still depends on fresh sufficient session memory and does
    not summarize transcripts or execute the future full fallback path.
41. The first bounded full-fallback compaction execution surface now exists,
    but it still packages only already available bounded state. It does not
    summarize transcripts, run background consolidation, or broaden into
    runtime takeover.
42. The first bounded consolidation and drift planning surface now exists,
    but it is still advisory-only over approved durable memory and optional
    validated procedures. It does not merge duplicates, archive stale rows,
    remediate drift, or perform background consolidation execution.
43. The first bounded consolidation execution surface now exists, but it only
    materializes conservative supersede outcomes for duplicate and explicit
    stale-superseded durable memory. It does not auto-resolve contradictions,
    remediate drift, mutate policy memory, or run background-job automation.
44. The first bounded drift-check execution surface now exists, but it only
    records review artifacts and checked timestamps for overdue durable-memory
    or validated-procedure findings. It does not rewrite facts, rewrite
    policy, remediate drift, or automate background jobs.
45. The first live execute-class automation rollout now exists, but it is
    still limited to `proactive_execute_run_drift_check` under explicit
    advisory and execute allowlists plus single-runner ownership. It does not
    enable consolidation scheduling, procurement or install automation,
    self-improving capture, or any external action.
46. The first live advisory consolidation scheduling rollout now exists, but
    it is still limited to `consolidation_plan` under explicit advisory and
    execute allowlists plus single-runner ownership. It does not enable
    `consolidation_execute`, procurement or install automation,
    self-improving capture, or any external action.
47. The first live bounded consolidation-execution rollout now exists, but it
    is still limited to safe `duplicate_merge_review` and
    `stale_superseded_review` selections under explicit allowlists plus
    single-runner ownership. It does not enable contradiction execution,
    drift remediation through consolidation, procurement or install
    automation, self-improving capture, or any external action.
48. The post-maintenance automation readiness review now concludes that the
    current live automation boundary should hold as-is. No additional
    advisory or execute-class automation is justified yet beyond:
    - `proactive_plan`
    - `consolidation_plan`
    - `proactive_execute_run_drift_check`
    - bounded safe `consolidation_execute`
      until longer soak evidence, shared-environment ownership, and stronger
      inspection or rollback discipline are in place.
49. The current live posture now has an operator runbook with:
    - retrieval health checks
    - background-job inspection queries
    - recent bounded-write inspection queries
    - runner-ownership checks
    - quick disablement steps
    - rollback order
    - a soak checklist
    - a shared-environment readiness checklist
      This does not expand automation authority. It hardens operator confidence
      in the already-enabled posture only.
50. The earlier shared-environment rehearsal reconciliation showed the
    approved boundary was not yet proven in a real shared non-production
    target at that point in the rollout sequence. That gap was later closed by
    the shared provisioning and rehearsal slices.
51. The earlier attempted first production rollout did not execute because the
    production runtime identity was not yet resolved from this session.
52. The live VPS runtime surface has now been inventoried and backed up before
    any production rollout patch is applied. The confirmed active surface is:
    - Docker Compose project `openclaw-upgrade-2026324`
    - config file `docker-compose.yml`
    - container `openclaw-upgrade-2026324-openclaw-gateway-1`
    - host config root `~/.openclaw`
      The current live middleware posture is already on the approved feature
      boundary. The remaining rollout diff is narrow:
    - replace `shared-nonprod-runner-1` with `production-runner-1`
    - normalize the `.env` DB URL copy so it matches the proven live URL
      shape including `uselibpqcompat=true`
53. Runtime designation is now resolved. The actual production runtime on this
    VPS is:
    - container `openclaw-upgrade-2026324-openclaw-gateway-1`
      Evidence:
    - it is the only active OpenClaw Compose project on the host
    - it owns the canonical OpenClaw host ports `28789` and `28790`
    - it uses the canonical host state tree `~/.openclaw`
    - the older `/root/services/openclaw` Compose stack is not running
54. The exact minimal production rollout patch is now reduced to two config
    edits only:
    - `/root/.openclaw/openclaw.json`
      `backgroundJobs.runnerOwnerId: shared-nonprod-runner-1 -> production-runner-1`
    - `/root/.openclaw/.env`
      `MEMORY_MIDDLEWARE_DATABASE_URL`
      `?sslmode=require -> ?uselibpqcompat=true&sslmode=require`
55. The pre-rollout backup artifact for that live surface now exists at:
    - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z`
      with a restorable config archive, copied compose file, rendered compose
      config, container inspect output, runtime inventory text files, and
      checksums.
56. The first production rollout has now been applied on
    `openclaw-upgrade-2026324-openclaw-gateway-1` using only:
    - `backgroundJobs.runnerOwnerId: shared-nonprod-runner-1 -> production-runner-1`
    - `.env` DB URL normalization to
      `uselibpqcompat=true&sslmode=require`
57. The production rollout validation has now passed:
    - runtime health after restart
    - passive startup remained bounded
    - retrieval remained healthy
    - bounded candidate submit succeeded
    - approved advisory and execute-class jobs queued and ran successfully
    - wrong-runner claims stayed blocked
    - bounded disablement and restore checks succeeded
58. The approved production boundary is now live on the confirmed VPS runtime
    with no feature-boundary expansion.

## Next expected action

Choose the next bounded implementation slice for the memory middleware backend:
continue the current production soak and rollback-drill posture without
changing the feature boundary, or tighten the operator path and secret
contract so production validation no longer depends on direct in-container
middleware invocation plus duplicated DB URL placement.
