# Current Slice

- canonical downstream repo is now `ConorLynchOCGit/openclaw-platform`
- clean upstream integration repo is now `ConorLynchOCGit/openclaw-integration`
- keep the legacy public fork `ConorLynchOCGit/openclaw` only as a disabled
  rollback/reference surface during transition, not as the canonical work repo
- keep GitHub project docs canonical under `docs/projects/github/`
- keep executable assets and live workflow payloads routed to `ops/github/` and `ops/telegram/`
- retire the false cross-repo `openclaw/docs` publish assumption for the
  downstream repo
- keep docs workflows runnable only from `ConorLynchOCGit/openclaw-platform`
- keep docs workflows same-repo and artifact-only until a real owned
  downstream docs host is chosen
- keep the release workflow building a release-tagged same-repo docs bundle
  instead of dispatching locale jobs into an upstream-owned repo
- treat the following behaviors as intentionally retired for the downstream
  repo, not as missing follow-up work:
  - cross-repo publish to `openclaw/docs`
  - cross-repo locale dispatch on release
- keep `ConorLynchOCGit/openclaw` visibly marked as the legacy
  rollback/reference fork; do not treat it as the canonical work or workflow
  home
- there is no current docs-sync secret blocker because the downstream docs
  workflows no longer depend on external write credentials
- defer org transfer until org access exists; do not block stabilization on it
- next slice boundary:
  after the migration-residue cleanup closes, move to Slice 3: the UI
  ghost-stream fix and local worktree cleanup without broadening into the full
  stability gate yet
