# Memory Middleware Shared Non-Production Provisioning Report

## Purpose

This report records the first actual shared non-production wiring for
`memory-middleware`.

It answers:

- whether the existing Supabase setup was suitable
- which shared runtime was used
- which database target was used
- whether the middleware secret and migrations succeeded
- which exact posture is now running there

## Provisioning date

- `2026-04-02`

## Supabase suitability result

The existing Supabase setup on the server was suitable and was used.

Confirmed target:

- project ref: `wvfcvuwsnhupalpxfttc`
- project name: `ConorLynchOCGit's Project`
- region: `East US (North Virginia)`
- pooler host: `aws-1-us-east-1.pooler.supabase.com`
- database: `postgres`
- middleware schema: `memory_middleware`

Confirmed required extensions:

- `pgcrypto`
- `pg_trgm`
- `vector`

## Shared runtime used

The shared runtime used was the existing server-hosted Dockerized OpenClaw
gateway:

- container: `openclaw-upgrade-2026324-openclaw-gateway-1`
- image: `openclaw:local`
- ports:
  - `28789`
  - `28790`

This slice reused the existing server-hosted runtime and did not touch
production.

## Secret placement result

Secret placement succeeded.

Placed secret:

- `MEMORY_MIDDLEWARE_DATABASE_URL`

Placement location:

- `~/.openclaw/.env`

Current runtime note:

- the secret is present in `.env`
- the current middleware checkpoint still requires
  `plugins.entries.memory-middleware.config.database.url` to be a literal
  string
- the shared runtime therefore currently carries the same DB URL literal in
  `~/.openclaw/openclaw.json`

This is a non-production operator-managed deviation from the earlier
env-backed SecretRef plan. It does not change the approved automation
boundary.

## Migration apply results

Applied successfully:

1. `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`
2. `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

Observed post-migration checks:

- current database: `postgres`
- middleware table count in `memory_middleware`: `23`
- required extensions installed:
  - `pgcrypto`
  - `pg_trgm`
  - `vector`

## Runtime config posture

The shared runtime is running the current approved posture unchanged:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = shared-nonprod-runner-1`

Still disabled:

- direct proactive execution outside the scheduler
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory job classes
- any additional execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Runtime restart result

The shared runtime was restarted successfully after:

- placing the DB secret
- applying both migrations
- rebuilding `openclaw:local`
- syncing `extensions/memory-middleware/openclaw.plugin.json` with the current
  middleware config surface

Healthy runtime check:

- `GET /healthz` returned `{"ok":true,"status":"live"}`
- container health reached `healthy`

## Blockers or deviations

There was one material deviation:

- the current middleware checkpoint did not accept the earlier planned
  env-backed SecretRef object for `database.url`

There was one small repo fix required to make the shared runtime accept the
already-approved posture:

- `extensions/memory-middleware/openclaw.plugin.json` was updated so its
  manifest schema matches the rollout-era middleware config surface already
  implemented in source

## Exact next step

The next step is not more provisioning.

The exact next step is to run the shared-environment rehearsal from the
provisioned target:

1. verify health:
   - `curl http://127.0.0.1:28789/healthz`
2. verify retrieval:
   - `memory_object_list`
3. inspect background jobs:
   - `memory_background_job_list`
   - `memory_background_job_get`
4. verify runner enforcement:
   - `memory_background_job_run_next` with a wrong runner id
   - `memory_background_job_run_next` with `shared-nonprod-runner-1`
