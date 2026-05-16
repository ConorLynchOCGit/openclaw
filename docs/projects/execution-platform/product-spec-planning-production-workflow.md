# Product/Spec Planning Production Workflow

Product/Spec Planning is a scheduler-backed workflow surface for turning ambiguous owner intent into executable work proposals. Its workflow id is `agent_team.product_spec_planning`.

## Runtime Contract

The workflow must run through `RuntimeWorkGraphScheduler` and must not use the generic workflow runner or the coding-team runner as a substitute for planning behavior. The first executable node is `planning_orchestrator`.

Required planning node capabilities:

- `planning_orchestrator`
- `web_research`
- `planning_capsule_draft`
- `planning_capsule_revision`
- `human_planning_decision`
- `action_graph_proposal`
- `compile_runtime_plan`
- `planning_closeout`

## Planning Artifacts

Web research returns bounded ResearchBrief artifacts with source refs, retrieval date, bounded findings, confidence, limitations, stale-external-assumption warnings, and planning implications. Raw pages and raw provider output are not stored.

The Planning Capsule lifecycle is canonical. Capsules include owner objective, problem statement, non-goals, system facts and refs, research influence refs, stale assumptions, design constraints, workflow/runtime and data-model implications, UI/readback implications, authority constraints, validation and rollout plans, open decisions, human decision refs, action proposal refs, compile-readiness state, limitations, and ELI5 summary.

Human planning decisions are graph nodes with a bounded prompt summary, clear tradeoff/options, operator ref, deadline, blocking node refs, resume ref/hash, and owner-readable Work Queue readback.

ActionGraphProposal is proposal authority only. It can suggest child actions, dependencies, workflows, roles, validations, authority needs, context refs, risks, and rollback notes. It must not create runtime jobs by itself.

`compile_runtime_plan` validates schema, dependency graph, missing decisions, authority requirements, workflow and executor availability, storage safety, child feasibility, and Work Queue child-item creation policy before any execution boundary.

## Work Queue Readback

Readback must be human-readable first and refs second. It shows workflow, planning mode, graph id, current node, research refs and summary, Planning Capsule refs, human decision status, ActionGraphProposal refs, compile-readiness state, proposed child actions, blockers, validation refs, closeout refs, limitations, and ELI5 progress.

## Boundaries

No raw prompts, raw responses, transcripts, provider logs, tool logs, command logs, DB rows, secrets, or hidden reasoning are stored. Work Queue lifecycle is not mutated directly. Runtime jobs for proposed child work are not created unless a later approved compile boundary does so.

## Production Status

The production surface is scheduler-backed in source. `agent_team.product_spec_planning` is registered as a first-class workflow, the generic workflow runner rejects it with `product_spec_planning_requires_scheduler_backed_runner`, and Runtime Work Graph scheduler policy requires executable Product/Spec Planning work to start with `planning_orchestrator` before research, capsule, proposal, compiler, human-decision, or closeout nodes run.

Work Queue readback now projects planning mode, Planning Capsule refs, ResearchBrief refs, research influence refs, stale external assumptions, human planning decision request/decision state, ActionGraphProposal refs, child proposal summaries, compile-readiness state, validation refs, limitations, ELI5 progress, Mission Ledger status, runtime graph children, and active scheduler progress.

ResearchBrief validation requires bounded source refs, citation refs for claims, assumptions, freshness/staleness notes, and raw-storage flags. ActionGraphProposal validation remains proposal-only: dependency cycles, missing refs, raw-storage refs, invalid authority shape, and compile-readiness mismatch block compile readiness without executing proposed children.

Product/Spec Planning still does not execute proposed child actions. Child runtime jobs or human tasks require a later explicit compile/authority boundary.

Focused validation for this pass is `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`, which imports the Product/Spec Planning contract tests, generic-runner rejection test, and Runtime Work Graph scheduler guardrail tests.
