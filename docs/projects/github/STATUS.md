# Status

- state: active
- pack_type: canonical_project_workspace
- canonical_registry: yes
- canonical_repo_entry: `docs/projects/github/index.md`
- role: GitHub digest, webhook, auth, and reporting project workspace

## 2026-04-24 Docs Sync Publish Repo

- workflow: `.github/workflows/docs-sync-publish.yml`
- target publish repo: `openclaw/docs`
- canonical downstream source repo is now `ConorLynchOCGit/openclaw-platform`
- clean upstream integration repo is now `ConorLynchOCGit/openclaw-integration`
- retained legacy fork is `ConorLynchOCGit/openclaw`, but it is no longer the
  canonical work or workflow home
- latest legacy-fork run reviewed: `24901253876` on `ConorLynchOCGit/openclaw`
- current failure class on that legacy fork run: missing docs-sync secrets at
  credential resolution time
- current repo secret status on `ConorLynchOCGit/openclaw-platform`: no Actions
  secrets are present
- current repo secret status on `ConorLynchOCGit/openclaw-integration`: no
  Actions secrets are present
- current repo secret status on `ConorLynchOCGit/openclaw`: no Actions secrets
  are present
- current local provisioning audit result:
  `OPENCLAW_DOCS_SYNC_APP_ID`,
  `OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY`, and `OPENCLAW_DOCS_SYNC_TOKEN` are not
  present in the live checkout env, `/root/.openclaw/.env`,
  `/root/.openclaw/openclaw.json`, or the current VPS repo `.env`
- upstream repo-side failure also inspected: `openclaw/openclaw` run
  `24901113806` authenticated successfully but failed by rebasing a stale clone
  into `.openclaw-sync/source.json` conflicts
- workflow hardening landed:
  - prefer GitHub App credentials:
    `OPENCLAW_DOCS_SYNC_APP_ID` + `OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY`
  - keep `OPENCLAW_DOCS_SYNC_TOKEN` as stopgap fallback only
  - fail fast when no docs-sync credential is present
  - clone the publish repo without embedding a token in the remote URL
  - configure token auth as a local Git extra header only inside the runner
  - verify read access with `git ls-remote`
  - verify push access with `git push --dry-run`
  - retry from a fresh publish clone instead of rebasing a stale local commit
  - keep `.openclaw-sync/source.json` stable with repository + sha only
  - run publish/translate jobs only from
    `ConorLynchOCGit/openclaw-platform`
- remaining required external fix:
  - add `OPENCLAW_DOCS_SYNC_APP_ID` and
    `OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY` to
    `ConorLynchOCGit/openclaw-platform`
  - fallback only if needed: `OPENCLAW_DOCS_SYNC_TOKEN`
  - required installation scope: `openclaw/docs`
  - required permission: Contents read/write
  - do not print, log, or commit the credential
  - exact next operator step:
    run `gh secret set OPENCLAW_DOCS_SYNC_APP_ID --repo ConorLynchOCGit/openclaw-platform`
    and
    `gh secret set OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY --repo ConorLynchOCGit/openclaw-platform`
    from a shell that actually has the GitHub App values available, then rerun
    Docs Sync Publish Repo and Docs Trigger Locale Translate On Release

## 2026-04-24 Repo Boundary Split

- this repo checkout now treats `ConorLynchOCGit/openclaw-platform` as the
  canonical downstream product/work repo
- the clean upstream integration surface is
  `ConorLynchOCGit/openclaw-integration`
- the old public fork `ConorLynchOCGit/openclaw` remains in place only as a
  temporary rollback/reference surface
- the old public fork is now also marked in GitHub metadata as:
  `Legacy rollback/reference fork after downstream repo split. Canonical downstream repo moved off this fork.`
- a full all-refs upstream mirror into the integration repo was attempted and
  rejected by GitHub with `pack exceeds maximum allowed size (2.00 GiB)`
- the safe fallback is a clean `main`-only integration seed from
  `openclaw/openclaw`, which is enough for normal upstream-sync and
  upstreamable-patch work without keeping the downstream product trapped in the
  fork network
- org transfer remains deferred because no GitHub organization access is
  currently visible from this environment
- next bounded follow-on is the migration regression audit and stale-reference
  cleanup slice, not UI cleanup or full-suite stabilization
