# Status

- state: active
- pack_type: canonical_project_workspace
- canonical_registry: yes
- canonical_repo_entry: `docs/projects/github/index.md`
- role: GitHub digest, webhook, auth, and reporting project workspace

## 2026-04-24 Docs Sync Publish Repo

- workflow: `.github/workflows/docs-sync-publish.yml`
- target publish repo: `openclaw/docs`
- latest fork run reviewed: `24901253876` on `ConorLynchOCGit/openclaw`
- current failure class on the fork: missing docs-sync secrets at credential
  resolution time
- current repo secret status on `ConorLynchOCGit/openclaw`: no Actions secrets
  are present
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
- remaining required external fix:
  - add `OPENCLAW_DOCS_SYNC_APP_ID` and
    `OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY` to `ConorLynchOCGit/openclaw`
  - fallback only if needed: `OPENCLAW_DOCS_SYNC_TOKEN`
  - required installation scope: `openclaw/docs`
  - required permission: Contents read/write
  - do not print, log, or commit the credential
