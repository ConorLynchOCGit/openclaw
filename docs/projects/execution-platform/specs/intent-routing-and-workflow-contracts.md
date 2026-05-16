# Intent Routing And Workflow Contracts

## Runtime Toolification Boundary

Long implementation prompts should flow through:

```text
ordinary-chat allow gate
  -> advanced workflow route
  -> Mission Ledger
  -> scheduler decomposition tool calls
  -> tool-backed node execution
  -> evidence claims
  -> model-authored closeout
```

Routing should not duplicate Mission Ledger work. Safety constraints such as
"do not deploy" or "do not store raw logs" are mission constraints, not
workflow-route blockers unless the primary requested outcome itself is
prohibited.

Workflow contracts must expose executable capabilities with cost, strength,
context capacity, ideal task size, tool access, failure/escalation policy, and
required evidence shape. The orchestrator sees this manifest and selects the
cheapest sufficiently capable node that advances a commitment or reduces
uncertainty.

## Product/Spec Planning

`agent_team.product_spec_planning` is a first-class workflow contract for messy owner objectives that need bounded planning before execution.

Routing contract:

- use Product/Spec Planning for plan/spec/capsule/action-graph proposal work
- do not route it through the generic workflow queued runner
- generic workflow fallback must fail clearly with `product_spec_planning_requires_scheduler_backed_runner`
- proposed child actions require a later compile/authority boundary before runtime jobs or human tasks are created
