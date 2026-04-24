# Current Slice

- canonical downstream repo is now `ConorLynchOCGit/openclaw-platform`
- clean upstream integration repo is now `ConorLynchOCGit/openclaw-integration`
- keep the legacy public fork `ConorLynchOCGit/openclaw` only as a disabled
  rollback/reference surface during transition, not as the canonical work repo
- keep GitHub project docs canonical under `docs/projects/github/`
- keep executable assets and live workflow payloads routed to `ops/github/` and `ops/telegram/`
- keep docs-sync workflow auth on the GitHub App path first:
  `OPENCLAW_DOCS_SYNC_APP_ID` + `OPENCLAW_DOCS_SYNC_APP_PRIVATE_KEY`
- keep `OPENCLAW_DOCS_SYNC_TOKEN` only as the stopgap fallback
- keep docs-sync and docs-translate workflows runnable only from
  `ConorLynchOCGit/openclaw-platform`
- keep docs publish retries fresh-clone based so `.openclaw-sync/source.json`
  metadata updates do not rebase-conflict on a stale publish clone
- remaining external blocker:
  provision the docs-sync secrets on `ConorLynchOCGit/openclaw-platform`, then
  rerun Docs Sync Publish Repo and Docs Trigger Locale Translate On Release
