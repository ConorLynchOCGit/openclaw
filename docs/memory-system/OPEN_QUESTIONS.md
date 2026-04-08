# Open Questions

## Active questions after the first self-improving and advisory batch

These are the remaining real open questions now that the core flattening
sequence, pre-capture hardening, and the first bounded self-improving and
inline-advisory slices are landed.

They are no longer about whether the seams can be implemented. They are about
how far they should be enabled and widened.

1. What exact rollout metrics should the first self-improving tranche prove
   before it is enabled more broadly?
2. Should the first self-improving tranche stay limited to the explicit
   workflow-guidance source, or should one additional bounded input source be
   allowed later?
3. Should the learned-guidance planner stay inline-only, or is there later
   evidence that it should feed an existing advisory planner after inline proof
   is complete?
4. How much later artifact / read-model convergence is still truly needed now
   that the functional tranche is landed on the shared substrate?

## Later-phase questions that remain intentionally later

These stay open, but they are not the next implementation phase:

1. Which cross-domain family should land first after rollout proof for the new
   functional seams?
2. Which later artifact/read-model cleanup, if any, should happen before the
   first new cross-domain family tranche?
