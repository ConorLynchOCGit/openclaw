# Open Questions

## Repo reconciliation questions

1. The repo already has `AGENTS.md`, and the memory-system section has been appended. No further merge question remains for this slice.
2. `docs/memory-system/` is acceptable for the internal handoff pack, but should these docs remain internal-only, or later be reshaped into Mintlify-style public docs with frontmatter and nav placement?
3. The bundled plugin tree under `extensions/` should be reused, and the scaffold id is now `memory-middleware`. Should any future public-facing naming still use the longer architecture label `openclaw-memory-middleware` in explanatory docs?
4. Plugin-relative `skills/` should be reused, but should any companion skill also have a root `skills/` counterpart if it becomes intentionally cross-plugin or user-facing?
5. There is no existing Supabase or Postgres migration structure to reuse. What backend subtree name should be introduced when DB-backed work starts?
6. Existing overlap is confirmed in `memory-core`, `memory-lancedb`, `memory-host-sdk`, public memory docs, and the `session-memory` hook. Which parts of that system are intended to remain first-class versus eventually be superseded?

## Implementation questions

1. Which exact operator or deployment unit should own the first shared
   scheduler runner beyond the already-proven local `rollout-runner-1`
   posture?
2. Should the initial middleware plugin continue to coexist with the current `memory-core` plugin as a regular bundled plugin indefinitely, or is the intention to eventually replace the exclusive memory slot?
3. Should workspace mirrors be implemented immediately or deferred until DB-backed flows exist?
4. Should workspace mirrors reuse the existing workspace memory conventions (`MEMORY.md` and `memory/*.md`) or live in a separate system-managed workspace subtree?
5. Which exact real environment should receive the first staged migration
   rehearsal, and who owns backup confirmation plus rollback execution?
6. Which exact deployment config source should own:
   - the advisory scheduler enablement flag
   - the execute-class scheduler enablement flag
   - the runner-owner id
     in shared environments?
7. Is there a managed shared staging database that can provide the next
   rehearsal step beyond the disposable Docker lane already proven here?
8. If a managed shared staging target appears next, should the first
   shared-environment automation rehearsal keep the current live allowlists
   unchanged:
   - `advisoryJobClasses = [proactive_plan, consolidation_plan]`
   - `executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
     with contradiction and drift consolidation actions still left off?
9. How long should the current single-runner real-environment soak period run
   before any broader automation class is considered?
10. What exact operator-visible query, dashboard, or script should become the
    canonical inspection surface for:
    - oldest queued maintenance job
    - failed jobs by `jobClass`
    - most recent `execution_metadata` by `jobClass`
      before any shared-environment automation rehearsal is authorized?
11. If the next slice stays docs or operations focused, should the runbook SQL
    in `OPERATIONAL_RUNBOOK.md` become a checked-in helper script, or should
    operators continue to use the documented queries directly until a shared
    environment exists?
12. Who will provide or approve the first actual shared non-production target
    for the unchanged current allowlists, given that the current repo and host
    context still expose only:
    - the disposable local validation lane
    - the persistent local non-production rollout lane

## Security questions

1. Will any authenticated UI need direct read access to durable memory tables in v1?
2. Should policy memory be completely backend-only in v1?
3. Will RLS be introduced immediately after schema integration, or after plugin tool implementation?
4. Should the first real-environment rollout allow any authenticated internal
   reader access, or should it stay service-role-only until staging proves the
   bounded read models under RLS?

## Retrieval questions

1. What embedding model and chunking strategy should be adopted first for
   actual embedding generation, now that the bounded semantic read path exists?
2. When should the bounded retrieval surfaces move from query-owned curated
   views or read-model surfaces to policy-aware RPCs or broader RLS-backed
   exposure?
3. Should validated procedures eventually receive their own curated semantic
   retrieval surface instead of reusing source-memory embeddings through
   lineage?

## Third-party skill questions

1. Where should per-skill vetting records live once real reviews begin: appended to a dedicated memory-system review log, one file per candidate skill, or another repo-local review subtree?
2. What exact threshold should distinguish `approved_limited` from `approved_normal` for external skills in practice?
3. The first repo-native reduced-profile adaptation seam now exists. If broader adoption is revisited later, should it stay a repo-native wrapper only, or should a separately packaged fork ever still exist?
4. Should Proactive Agent remain deferred until policy and approvals are fully operational?
5. If a future background-job or proactive-execution slice is ever considered,
   what approval class should be mandatory for each still-out-of-scope action
   type beyond `run_drift_check`?
6. What exact bounded inputs should `self-improving-agent` receive if a future constrained adoption slice is authorized: candidate memory only, candidate plus feedback memory, or procedure-distillation inputs as well?
7. Should `self-improving-agent` ever be allowed to propose policy-adjacent notes, or should policy stay entirely outside its suggestion surface?
