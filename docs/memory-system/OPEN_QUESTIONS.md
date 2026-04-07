# Open Questions

## Post-pivot learning questions

These are the highest-priority open questions after the generalized-learning
pivot.

1. The default generalized lesson auto-review threshold is now two compatible
   evidence events. Should a narrower single-evidence fast path exist later
   for explicit high-confidence imperative lessons?
2. The current generic `hold_for_more_evidence` cluster window is bounded.
   Should the first live default stay at the current three-day window, or be
   shortened after more production evidence?
3. When should contradiction between two generic lessons trigger:
   - `hold_for_more_evidence`
   - `reject`
   - `supersede_existing`
4. Should the first phrase-induction rollout feed only deterministic trigger
   expansion for already approved generic lessons, or may it also propose
   generic subject aliases?
5. What compact prompt representation should the application layer use for
   approved generic lessons so retrieval stays useful without causing prompt
   bloat?
6. What exact bounded unmet-need artifact shape should land first now that
   broader project-rule learning is live:
   - missing tool or capability recommendation
   - missing workflow support recommendation
   - or missing project artifact recommendation
7. What exact bounded input set should the first enabled reduced-profile
   self-improving capture source consume:
   - transcript-derived lesson candidates only
   - transcript plus feedback memory
   - or transcript plus bounded procedure-distillation context
8. Should later advisory planning from learned lessons begin inline during
   active repo-operating asks, or only after an explicit background-job proof?

## Cross-domain family expansion questions

1. After self-improving capture and learned-guidance advisory planning are
   live, which domain-neutral family should land first:
   - decision + rationale
   - observation / result / finding
   - terminology / ontology / canonical definition
   - entity profile
2. Should older software-shaped enumerated families such as:
   - external API failure lesson
   - recurring deployment/runtime constraint
   - recurring debugging preference
   - recurring review preference
     stay standalone, or be absorbed into broader domain-neutral families?
3. What exact line should separate:
   - fact vs observation
   - rule vs decision
   - risk vs workflow constraint
   - project fact vs entity profile
4. What non-project scopes should the first broader domain-neutral families
   support after the current project-heavy tranche:
   - client
   - audience
   - site
   - campaign
   - sample
   - instrument
5. When source materials disagree, should source trust / authority ranking land
   before broader hypothesis memory, or after it?

## Architecture reconciliation questions

1. Should the initial middleware plugin continue to coexist with the current
   `memory-core` plugin as a regular bundled plugin indefinitely, or is the
   intention to eventually replace the exclusive memory slot?
2. Should workspace mirrors be implemented immediately or deferred until the
   generalized-learning pipeline is more mature?
3. Should workspace mirrors reuse the existing workspace memory conventions
   (`MEMORY.md` and `memory/*.md`) or live in a separate system-managed
   workspace subtree?
4. Which parts of the current overlap across `memory-core`,
   `memory-lancedb`, `memory-host-sdk`, public docs, and `session-memory` are
   intended to remain first-class versus eventually be superseded?

## Security and retrieval questions

1. Will any authenticated UI need direct read access to durable memory tables
   in v1, or should the repo remain service-role-first for longer?
2. When should bounded retrieval move from curated read models to
   policy-aware RPCs or broader RLS-backed exposure?
3. Should validated procedures eventually receive their own curated semantic
   retrieval surface instead of reusing source-memory embeddings through
   lineage?

## Self-improving and third-party skill questions

1. Where should per-skill vetting records live once real reviews begin:
   appended to a dedicated memory-system review log, one file per candidate
   skill, or another repo-local review subtree?
2. What exact threshold should distinguish `approved_limited` from
   `approved_normal` for external skills in practice?
3. If broader adoption is revisited later, should the reduced-profile
   self-improving path stay a repo-native adaptation only, or should a
   separately packaged fork ever still exist?
4. Should `self-improving-agent` ever be allowed to propose policy-adjacent
   notes, or should policy stay entirely outside its suggestion surface?

## Later automation questions

1. If a future background-job or proactive-execution slice is ever considered,
   what approval class should be mandatory for each still-out-of-scope action
   type beyond `run_drift_check`?
2. What exact operator-visible query, dashboard, or script should become the
   canonical inspection surface for:
   - oldest queued maintenance job
   - failed jobs by `jobClass`
   - most recent `execution_metadata` by `jobClass`
3. How long should production remain on the current bounded automation
   boundary before any broader automation-expansion discussion is reopened?
