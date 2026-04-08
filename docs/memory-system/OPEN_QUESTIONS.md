# Open Questions

## Active questions after flattening batch v6 and the post-v6 deep review

These are the remaining real open questions now that the core flattening
sequence is landed.

They are no longer about whether registry authority and boundary cleanup should
happen. They are about what the next post-flattening phase should do on top of
the stronger substrate.

1. What is the smallest honest request-path cost hardening slice for database
   access and semantic fallback so normal retrieval does not get more expensive
   under self-improving capture pressure?
2. What is the smallest honest change that makes durable-memory application
   selection more query-aware and less prompt-heavy before capture reevaluation?
3. Which write-path actions should become the shared finite stages before
   self-improving capture adds more pressure to transcript auto-capture,
   candidate submit, and proof execution?
4. Which behaviors must remain family-specific even after that action-stage
   decomposition?
5. Only after the hardening tranche above, what exact bounded input set should
   the first reduced-profile self-improving capture tranche consume without
   recreating a second family policy path?
6. After the hardening tranche above, which provenance and review posture
   should the first reduced-profile self-improving capture tranche require so
   that later learned pressure stays auditable?
7. How much later artifact / read-model convergence is still truly needed now
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
