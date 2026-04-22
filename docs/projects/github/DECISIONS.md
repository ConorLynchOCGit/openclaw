# Decisions

## 2026-04-22 - Docs sync publish auth uses scoped external credential

- Docs Sync Publish Repo should publish to `openclaw/docs` using a credential
  scoped to that publish repo, not the source repo's default `GITHUB_TOKEN`.
- Preferred credential: GitHub App installation token with Contents read/write
  on `openclaw/docs`.
- Acceptable credential: fine-grained PAT stored as
  `OPENCLAW_DOCS_SYNC_TOKEN` on `ConorLynchOCGit/openclaw`, scoped only to
  `openclaw/docs`, Contents read/write, with expiration/rotation.
- Workflow hardening should fail fast on missing/invalid token and avoid
  token-bearing remote URLs.

## 2026-04-18 - workspace operator packs are not canonical repo projects

- This folder remains workspace-owned.
- It exists for operator coordination and re-entry.
- It must not be treated as the authoritative implementation source when a canonical repo project exists.
