# Open Questions

## Active questions after flattening batch v6

These are the remaining real open questions now that the core flattening
sequence is landed.

They are no longer about whether registry authority and boundary cleanup should
happen. They are about what the next post-flattening phase should do on top of
the stronger substrate.

1. For reduced-profile self-improving capture, what exact bounded input set
   should the first tranche consume without recreating a second family policy
   path?
2. Which provenance and review posture should the first reduced-profile
   self-improving capture tranche require so that later learned pressure stays
   auditable?
3. Should the first reduced-profile self-improving capture tranche write into
   existing family surfaces only, or does it need any narrower gating before
   that is honest?
4. How much later artifact / read-model convergence is still truly needed now
   that registry authority, boundary cleanup, and the bounded retrieval SQL
   cleanup are landed?

## Later-phase questions that remain intentionally later

These stay open, but they are not the next implementation phase:

1. What exact advisory posture should learned-guidance planning take once
   reduced-profile self-improving capture is live and proven?
2. Which cross-domain family should land first after the stronger substrate,
   reduced-profile self-improving capture, and advisory planning?
3. Which later artifact/read-model cleanup, if any, should happen before the
   first new cross-domain family tranche?
