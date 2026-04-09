# Memory Middleware Shared Non-Production Provisioning Plan

## Purpose

This document turns the current shared-environment gap into a concrete
provisioning plan for `memory-middleware`.

It now records the smallest viable shared non-production setup that was
actually wired to replay the current approved middleware posture unchanged.

It does not:

- touch production
- expand automation
- change the approved middleware allowlists
- change runtime behavior

## Target shape

The smallest viable shared non-production setup is:

1. one dedicated shared OpenClaw runtime
2. one shared Supabase-backed Postgres target using schema
   `memory_middleware`
3. one named shared scheduler runner owner
4. one named disablement owner
5. one named backup or restore owner

## Shared targets

### Shared OpenClaw runtime target

Use the existing shared Dockerized OpenClaw gateway on the server.

Provisioned target:

- container: `openclaw-upgrade-2026324-openclaw-gateway-1`
- image: `openclaw:local`
- ports:
  - `28789`
  - `28790`
- role: shared rehearsal runtime for the current approved middleware posture

### Shared Postgres target

Use the existing Supabase project on the server for the middleware schema.

Provisioned target:

- project ref: `wvfcvuwsnhupalpxfttc`
- pooler host: `aws-1-us-east-1.pooler.supabase.com`
- logical database name: `postgres`
- schema name: `memory_middleware`
- required extensions:
  - `pgcrypto`
  - `pg_trgm`
  - `vector`
- isolation rule: must not share production data or credentials

This first shared target reuses the existing Supabase installation because it
already satisfies the middleware requirements and avoids provisioning a second
database surface.

Retired local-rollout note:

- the earlier persistent local Docker Postgres target
  `memory-middleware-readonly-rollout-pg` is no longer part of the intended
  runtime posture
- local Docker Postgres should now be treated as disposable integration-test
  or bounded rehearsal infrastructure only

## Topology

- shared runtime:
  - one Docker container: `openclaw-upgrade-2026324-openclaw-gateway-1`
- shared database:
  - one Supabase-backed Postgres database: `postgres`
  - one middleware schema: `memory_middleware`
- plugin:
  - bundled plugin `memory-middleware`
- plugin config:
  - `plugins.entries.memory-middleware.enabled = true`
  - `plugins.entries.memory-middleware.config.*`
- scheduler ownership:
  - one named runner id for all shared-environment maintenance execution
- operational ownership:
  - one disablement owner
  - one backup or restore owner

## Required config and secret placement

### Required plugin config

The shared target must preserve the current approved posture unchanged:

```json
{
  "plugins": {
    "entries": {
      "memory-middleware": {
        "enabled": true,
        "config": {
          "database": {
            "driver": "postgres",
            "url": "<literal DB URL copied from MEMORY_MIDDLEWARE_DATABASE_URL>",
            "schema": "memory_middleware"
          },
          "candidateIngress": {
            "mode": "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
          },
          "memoryObjectQuery": {
            "mode": "read-only"
          },
          "backgroundJobs": {
            "inspectionMode": "enabled",
            "advisorySchedulingMode": "enabled",
            "executeSchedulingMode": "enabled",
            "advisoryJobClasses": ["proactive_plan", "consolidation_plan"],
            "executeJobClasses": ["proactive_execute_run_drift_check", "consolidation_execute"],
            "runnerOwnerId": "shared-nonprod-runner-1"
          }
        }
      }
    }
  }
}
```

### Required secrets

The minimum secret set is:

- `MEMORY_MIDDLEWARE_DATABASE_URL`
  - Postgres connection string for the shared non-production middleware DB
- `OPENCLAW_GATEWAY_TOKEN`
  - existing gateway auth secret for the shared runtime, if required by the
    deployment surface

### Secret placement rule

The middleware DB URL is placed in:

- `~/.openclaw/.env`
  - `MEMORY_MIDDLEWARE_DATABASE_URL`

Current deviation:

- the current middleware checkpoint still requires
  `plugins.entries.memory-middleware.config.database.url` to be a literal
  string
- the shared runtime therefore carries a non-production operator-managed copy
  of the DB URL in `~/.openclaw/openclaw.json`
- this slice does not change the plugin contract; it records the current live
  requirement honestly

## Ownership model

The shared target must name these owners before rehearsal begins:

- runner owner:
  - owns `backgroundJobs.runnerOwnerId`
  - provisioned id: `shared-nonprod-runner-1`
- disablement owner:
  - owns immediate rollback and config narrowing
- backup or restore owner:
  - owns pre-rehearsal backup confirmation and any DB restore

The current docs should treat the rehearsal as blocked until all three roles
are named.

## Provisioning sequence

1. Confirm the existing shared Supabase target is suitable.
   - project ref `wvfcvuwsnhupalpxfttc`
   - confirm `pgcrypto`, `pg_trgm`, and `vector`
2. Place runtime secrets.
   - add `MEMORY_MIDDLEWARE_DATABASE_URL` to `~/.openclaw/.env`
3. Configure the plugin posture.
   - enable `plugins.entries.memory-middleware`
   - set `database.driver = postgres`
   - set `database.url` to the current required literal string
   - set `database.schema = memory_middleware`
   - set the current approved `candidateIngress`, `memoryObjectQuery`, and
     `backgroundJobs` posture unchanged
4. Name operators.
   - assign one runner owner id
   - assign one disablement owner
   - assign one backup or restore owner
5. Confirm DB prerequisites before migration.
   - confirm extension availability
   - confirm backup or restore posture
6. Apply the existing middleware migrations explicitly.
7. Rebuild the shared runtime image so it includes the current middleware
   plugin manifest schema.
8. Restart the shared runtime with the unchanged posture.
9. Execute the shared rehearsal from `docs/memory-system/OPERATIONAL_RUNBOOK.md`.

## Exact next rehearsal step once provisioned

Once the runtime and database exist and the plugin config above is in place,
the exact next step is:

1. verify the shared runtime is healthy:
   - `curl http://127.0.0.1:28789/healthz`
2. run the first operator health check from the runbook:
   - `memory_object_list`
3. run the first background-job inspection checks:
   - `memory_background_job_list`
   - `memory_background_job_get`
4. verify runner enforcement with:
   - `memory_background_job_run_next`
     using a wrong runner id first
   - `memory_background_job_run_next`
     using `shared-nonprod-runner-1` second

Recommended config commands after the shared target exists:

```bash
openclaw plugins enable memory-middleware
openclaw config set plugins.entries.memory-middleware.config.database.driver postgres
openclaw config set plugins.entries.memory-middleware.config.database.schema memory_middleware
openclaw config set plugins.entries.memory-middleware.config.candidateIngress.mode submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install
openclaw config set plugins.entries.memory-middleware.config.memoryObjectQuery.mode read-only
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.inspectionMode enabled
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.advisorySchedulingMode enabled
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.executeSchedulingMode enabled
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.advisoryJobClasses '["proactive_plan","consolidation_plan"]' --strict-json
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.executeJobClasses '["proactive_execute_run_drift_check","consolidation_execute"]' --strict-json
openclaw config set plugins.entries.memory-middleware.config.backgroundJobs.runnerOwnerId shared-nonprod-runner-1
```

Then copy the `MEMORY_MIDDLEWARE_DATABASE_URL` value into
`plugins.entries.memory-middleware.config.database.url` for the current
checkpoint, as documented above.

## Validation checklist

Before the rehearsal is considered ready:

- the shared Docker runtime exists and is reachable
- the shared Supabase-backed Postgres target exists
- `pgcrypto`, `pg_trgm`, and `vector` are present
- `MEMORY_MIDDLEWARE_DATABASE_URL` is placed as a secret
- the plugin is enabled
- the config posture matches the current approved local non-production posture
- the named runner owner is configured
- disablement owner is documented
- backup or restore owner is documented
- migrations apply cleanly
- startup is passive after restart

## Rollback and teardown checklist

If rehearsal must stop:

1. stop manual `memory_background_job_run_next` usage
2. set `backgroundJobs.executeSchedulingMode = disabled`
3. set `backgroundJobs.advisorySchedulingMode = disabled`
4. keep `memoryObjectQuery.mode = read-only` unless retrieval itself is the
   issue
5. disable the plugin only if the issue is broader than maintenance
6. preserve the database for inspection
7. restore from backup only if DB-level rollback is required

If the entire shared rehearsal target must be removed:

1. disable the plugin
2. remove the middleware DB secret from the shared runtime
3. archive any needed inspection output
4. stop or remove the shared Docker runtime
5. drop the non-production database only after backup confirmation

## Blocking conditions

Do not start the shared rehearsal if any of these remain unresolved:

- no dedicated shared runtime exists
- no dedicated shared Postgres target exists
- any required DB extension is missing
- no named runner owner
- no named disablement owner
- no named backup or restore owner
- pressure to widen the allowlists during provisioning

## Conclusion

The shared non-production target is now provisioned concretely enough to begin
the rehearsal without changing the approved middleware boundary.

The next real step is not more provisioning. It is:

- one shared-environment rehearsal from the provisioned shared runtime plus
  Supabase target
- one explicit disablement owner assignment
- one explicit backup or restore owner assignment

After that, the next operational step is to replay the current approved
rehearsal posture unchanged and record the result.
