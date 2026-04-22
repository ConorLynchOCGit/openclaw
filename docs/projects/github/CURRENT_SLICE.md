# Current Slice

- keep GitHub project docs canonical under `docs/projects/github/`
- keep executable assets and live workflow payloads routed to `ops/github/` and `ops/telegram/`
- repair Docs Sync Publish Repo auth by installing
  `OPENCLAW_DOCS_SYNC_TOKEN` with Contents read/write on `openclaw/docs`, then
  rerun the workflow and verify the publish push succeeds
