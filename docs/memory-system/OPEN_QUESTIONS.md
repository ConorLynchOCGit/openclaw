# Open Questions

## Active questions after multi-memory capture and the canonicalization spec

These are the remaining real open questions now that current Main behavior is
proven, bounded multi-memory capture is landed, and the repo has accepted the
4-kind canonical target.

They are no longer primarily rollout questions. They are now migration and
canonicalization questions.

1. Which current surfaces should be deleted entirely after migration, and
   which should remain as compatibility adapters for one transition phase?
2. How much of the current family-policy contract should survive as
   canonical kind/facet policy versus being dissolved into generic ingestion,
   retrieval, and application contracts?
3. Which current semantics must stay explicit facets:
   subject keys, cluster keys, lesson keys, tool keys, procedure shape,
   project scope, or recommendation/guidance mode?
4. What is the first canonical retrieval planner slice that can replace the
   current retrieval intent and control-plane hint tables without regressing
   bounded live behavior?
5. What is the first canonical ingestion slice that can replace the current
   family-specific transcript auto-capture handlers without losing existing
   review and promotion safeguards?
6. How long should the current family-heavy read/write surfaces remain
   available as compatibility adapters during migration?

## Later-phase questions that remain intentionally later

These stay open, but they are not the next implementation phase:

1. Which cross-domain tranche should resume first after the canonical 4-kind
   migration is real enough to stop adding rigid family-local seams?
2. Which later artifact/read-model cleanup, if any, should happen after the
   canonical migration but before cross-domain expansion?
