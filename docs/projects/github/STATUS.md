# Status

- state: active
- pack_type: canonical_project_workspace
- canonical_registry: yes
- canonical_repo_entry: `docs/projects/github/index.md`
- role: GitHub digest, webhook, auth, and reporting project workspace

## 2026-04-22 Docs Sync Publish Repo

- workflow: `.github/workflows/docs-sync-publish.yml`
- target publish repo: `openclaw/docs`
- failing runs reviewed: `24781943718`, `24783896280`
- root cause: the publish push reached `https://github.com/openclaw/docs.git/`
  but GitHub rejected credentials with `Invalid username or token`; password
  auth is not supported
- current repo secret status: `OPENCLAW_DOCS_SYNC_TOKEN` is not present on
  `ConorLynchOCGit/openclaw`
- current operator account status: authenticated as `ConorLynchOCGit`, but
  `gh repo view openclaw/docs` reports READ permission only
- workflow hardening landed:
  - fail fast when `OPENCLAW_DOCS_SYNC_TOKEN` is missing
  - clone the publish repo without embedding a token in the remote URL
  - configure token auth as a local Git extra header only inside the runner
  - verify read access and push dry-run before generating the publish commit
- remaining required external fix:
  - add `OPENCLAW_DOCS_SYNC_TOKEN` to `ConorLynchOCGit/openclaw`
  - preferred: GitHub App installation token scoped to `openclaw/docs`
  - acceptable: fine-grained PAT scoped only to `openclaw/docs`
  - required permission: Contents read/write
  - do not print, log, or commit the token
