# Memory Middleware Production Surface Inventory And Diff

## Purpose

This document inventories the actual live OpenClaw runtime on this VPS and
records the exact diff that was closed for the first `memory-middleware`
production rollout.

It records:

- the exact live runtime and config surfaces found
- the backup artifact created before any rollout
- the exact `memory-middleware` posture now running on that runtime
- the minimal diff that was required to move that runtime to the
  already-rehearsed approved posture
- the rollback plan tied to the backup artifact

## Inventory date

- `2026-04-03`

## Live runtime identified

The only live OpenClaw runtime identified on this VPS during this slice was:

- Docker Compose project: `openclaw-upgrade-2026324`
- config file:
  - `/root/services/openclaw-upgrade-2026.3.24/docker-compose.yml`
- active service:
  - `openclaw-gateway`
- active container:
  - `openclaw-upgrade-2026324-openclaw-gateway-1`
- image:
  - `openclaw:local`
- published ports:
  - `28789 -> 18789`
  - `28790 -> 18790`
- container command:
  - `node dist/index.js gateway --bind lan --port 18789`

Additional findings:

- `docker compose ls` showed no second OpenClaw Compose project
- `systemctl` showed no separate OpenClaw systemd service
- the container is labeled as created from this checkout's
  `docker-compose.yml`
- the runtime is therefore server-hosted Docker Compose on this VPS

## Production designation decision

`openclaw-upgrade-2026324-openclaw-gateway-1` is the actual production
runtime on this VPS.

Evidence:

- it is the only active OpenClaw Compose project on the host
- it is the only active OpenClaw container on the canonical OpenClaw ports:
  - `28789`
  - `28790`
- it uses the canonical host state tree:
  - `/root/.openclaw`
- the older operator repo at `/root/services/openclaw` is not running:
  - `docker compose -f /root/services/openclaw/docker-compose.yml ps` returned
    no active services
- earlier server runbooks and freeze notes for the private admin surface on
  `srv1425839.tailbcf154.ts.net` point to `127.0.0.1:28789`, which is the
  same published port now owned by this container

This slice therefore resolves the runtime-identity blocker. No separate
production-scoped OpenClaw runtime was identified on this VPS.

## Live config surfaces identified

The active container bind-mounts:

- `/root/.openclaw -> /home/node/.openclaw`
- `/root/.openclaw/workspace -> /home/node/.openclaw/workspace`

The current live config surfaces relevant to the rollout are:

- `/root/.openclaw/.env`
- `/root/.openclaw/openclaw.json`
- `/root/.openclaw/workspace`
- `/root/services/openclaw-upgrade-2026.3.24/docker-compose.yml`

No compose override file was identified in use for this runtime.

## Backup artifact created

Backup snapshot created before any rollout patching:

- backup directory:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z`
- config archive:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/openclaw-config.tgz`
- compose file copy:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/docker-compose.yml`
- rendered compose config:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/docker-compose.rendered.yaml`
- container metadata:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/openclaw-gateway.inspect.json`
- runtime inventory:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/docker-compose-ls.txt`
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/docker-ps.txt`
- artifact checksums:
  - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/SHA256SUMS`

Observed backup size:

- backup directory: about `265M`

## Current live memory-middleware posture

The live runtime currently has `memory-middleware` enabled with:

- `database.driver = postgres`
- `database.schema = memory_middleware`
- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = production-runner-1`

Additional live details:

- `memory-middleware` is already enabled in `openclaw.json`
- the literal `database.url` in `openclaw.json` already includes:
  - `uselibpqcompat=true&sslmode=require`
- the `.env` copy of `MEMORY_MIDDLEWARE_DATABASE_URL` now includes:
  - `uselibpqcompat=true&sslmode=require`
- runtime health check passed:
  - `GET /healthz -> {"ok":true,"status":"live"}`

## Approved target posture to replay in production

The already-rehearsed approved boundary remains:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = production-runner-1`

Still disabled:

- `memory_procedure_validate_plan`
- direct proactive execution outside scheduler-owned jobs
- direct consolidation execution outside scheduler-owned jobs
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory or execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Exact diff that was closed for production

The feature boundary is already aligned. No broader feature enablement change
is required.

The production rollout closed exactly two production-scoped config diffs:

1. Runner owner id
   - file:
     - `/root/.openclaw/openclaw.json`
   - previous:
     - `shared-nonprod-runner-1`
   - live:
     - `production-runner-1`

2. Secret parity
   - file:
     - `/root/.openclaw/.env`
   - previous:
     - `MEMORY_MIDDLEWARE_DATABASE_URL=...postgres?sslmode=require`
   - live:
     - `MEMORY_MIDDLEWARE_DATABASE_URL=...postgres?uselibpqcompat=true&sslmode=require`

No compose-file diff was required.

No plugin manifest diff was required.

## Validation summary

The production rollout validation passed.

Confirmed during this slice:

- runtime health check passed after restart
- passive startup stayed bounded
- retrieval succeeded
- bounded candidate submit succeeded
- approved advisory class `proactive_plan` queued and ran
- wrong-runner claims stayed blocked
- approved execute class `proactive_execute_run_drift_check` queued and ran
- temporary disablement checks blocked removed classes as expected
- the approved posture was restored and health rechecked successfully

## Minimal rollout patch applied

1. Updated the production-scoped DB secret copy in `/root/.openclaw/.env` so
   it matches the proven shared URL shape.
2. Updated `plugins.entries.memory-middleware.config.backgroundJobs.runnerOwnerId`
   in `/root/.openclaw/openclaw.json` from `shared-nonprod-runner-1` to
   `production-runner-1`.
3. Rechecked the `memory-middleware` posture and confirmed no other feature
   boundary fields changed.
4. Restarted only `openclaw-upgrade-2026324-openclaw-gateway-1`.
5. Ran the existing production rollout validation sequence from the runbook.

Minimal config-only patch shape:

```json
{
  "plugins": {
    "entries": {
      "memory-middleware": {
        "enabled": true,
        "config": {
          "database": {
            "driver": "postgres",
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
            "runnerOwnerId": "production-runner-1"
          }
        }
      }
    }
  }
}
```

## Rollback plan tied to the backup

If the production rollout needs to be abandoned or reversed:

1. stop changing config
2. restore the saved config tree from:
   - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/openclaw-config.tgz`
3. restore the saved compose file copy if needed from:
   - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/docker-compose.yml`
4. verify artifact integrity against:
   - `/root/backups/memory-middleware-production-surface-inventory-20260403T004555Z/SHA256SUMS`
5. restart the same runtime only after the config tree is restored
6. recheck:
   - `GET /healthz`
   - the current plugin posture in `openclaw.json`
   - background-job modes and runner owner id

## Exact next step for the real production rollout

The next step is not another config search.

The exact next step is:

1. patch `/root/.openclaw/.env` so `MEMORY_MIDDLEWARE_DATABASE_URL` includes
   `uselibpqcompat=true&sslmode=require`
2. patch `/root/.openclaw/openclaw.json` so
   `backgroundJobs.runnerOwnerId = production-runner-1`
3. apply only that minimal config diff
4. restart the intended production runtime
5. execute the validation sequence already defined in
   `docs/memory-system/OPERATIONAL_RUNBOOK.md`
