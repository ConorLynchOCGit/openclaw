# Work Queue Execution Truth

Runtime jobs remain lifecycle truth. Work Queue remains projection, readback, and bounded control.

## Dedicated Runtime DB Boundary

Live Work Queue projection/control/readback state now lives in the dedicated
Execution Platform database:

- runtime substrate: `postgres-database://execution_platform`
- config source: `config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`
- boundary: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage: enabled

The Model Memory database remains Model Memory's database. It is not the
Execution Platform live Work Queue substrate unless a future explicitly shared
runtime DB architecture is approved and labeled.

## Runtime Toolification Readback Gate

Before the next Product/Spec Planning live proof, Work Queue readback must
consume runtime tool-call traces and app-server progress as first-class
bounded projection evidence.

For active graph work, readback must show:

- accepted decomposition graph status.
- current runtime tool operation.
- active node, role, model, worker, and capability.
- why this node was selected under cost-aware utility policy.
- target refs, file refs, command refs, and validation state.
- Mission Ledger commitments advanced by the node.
- evidence refs produced and evidence claims awaiting model sufficiency
  review.
- open commitments, blockers, next scheduler decision, limitations, and ELI5
  progress.

The Work Queue must not close or mark a Product/Spec proof successful from
process completion, degraded/system closeout, generic artifacts, static graph
injection, or app-server heartbeat alone. Accepted Closeout Capsules may
update planning/readback status only when blocking Mission Ledger commitments
have accepted evidence.

For Product/Spec Planning, Work Queue owner readback displays:

- workflow and planning mode
- Planning Capsule refs, ResearchBrief refs, research influence refs, and stale external assumptions
- human planning decision request refs, decision refs, and decision state
- ActionGraphProposal refs, child proposal summaries, and compile-readiness state
- validation refs, Mission Ledger status, closeout refs, limitations, and ELI5 progress
- runtime graph children, edges, role progress, and active scheduler progress
