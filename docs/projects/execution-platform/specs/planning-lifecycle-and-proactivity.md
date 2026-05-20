# Planning Lifecycle And Proactivity

Product/Spec Planning lifecycle:

0. The canonical workflow definition and
   `workflow-plugin.agent_team.product_spec_planning.v1` resolve through the
   Runtime Workflow Graph Engine with scheduler executor coverage.
1. `planning_orchestrator` decomposes the owner objective into bounded nodes.
2. Optional `web_research` produces bounded ResearchBrief evidence with source refs, citations, assumptions, freshness/staleness flags, and no raw page/provider/tool storage.
3. `planning_capsule_draft` and `planning_capsule_revision` produce model-authored capsule refs with owner constraints, system facts, research influence, assumptions, implementation sequence, risks, validation strategy, decisions, and limitations.
4. Optional `human_planning_decision` records bounded decision/request/resume refs without granting authority. Owner readback distinguishes pending, accepted, rejected, and not-required planning decision states and surfaces bounded option summaries, response shape, deadline, blocking graph refs, resume refs, bounded response refs, and decision refs.
5. `action_graph_proposal` emits proposal-only child actions with dependencies, workflows, roles, evidence expectations, authority requirements, context refs, validation expectations, and closeout requirements.
6. `compile_runtime_plan` validates compile readiness without executing proposed children.
7. `planning_closeout` produces model-authored closeout only after accepted runtime evidence.

Opportunity/proactivity seeds may be included in the capsule or closeout, but they remain bounded follow-up refs and do not imply execution.
