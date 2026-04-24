# Decisions

## 2026-04-22 - Docs sync publish auth uses scoped external credential

- Docs Sync Publish Repo should publish to `openclaw/docs` using a credential
  scoped to that publish repo, not the source repo's default `GITHUB_TOKEN`.
- Preferred credential: GitHub App installation token with Contents read/write
  on `openclaw/docs`.
- Acceptable credential: fine-grained PAT stored as
  `OPENCLAW_DOCS_SYNC_TOKEN` on the canonical downstream repo
  `ConorLynchOCGit/openclaw-platform`, scoped only to `openclaw/docs`,
  Contents read/write, with expiration/rotation.
- Workflow hardening should fail fast on missing/invalid token and avoid
  token-bearing remote URLs.

## 2026-04-24 - Docs sync publish retries from fresh clones with stable source metadata

- The docs publish workflow should not rebase a locally generated sync commit
  onto a moving `openclaw/docs` branch.
- Retry attempts should start from a fresh publish-repo clone, rerun the sync,
  then push directly.
- `.openclaw-sync/source.json` should record only the source repository and
  source sha so reruns do not create conflict-only timestamp churn.

## 2026-04-18 - workspace operator packs are not canonical repo projects

- This folder remains workspace-owned.
- It exists for operator coordination and re-entry.
- It must not be treated as the authoritative implementation source when a canonical repo project exists.

## 2026-04-24 - Downstream product repo must be split from upstream integration

- `ConorLynchOCGit/openclaw` is no longer the canonical repo because it mixes
  downstream/operator/platform work with upstream-derived harness code inside a
  fork identity.
- the canonical downstream repo is now
  `ConorLynchOCGit/openclaw-platform`
- the clean upstream integration surface is now
  `ConorLynchOCGit/openclaw-integration`
- the clean integration surface should remain a standalone non-fork repo so it
  can track upstream without keeping the downstream product inside the fork
  network
- the old public fork stays in place temporarily as a rollback/reference
  surface, but it should not receive normal product-work pushes
- docs-sync secrets, GitHub Apps, and publish-routing workflows belong on the
  downstream repo, not on the legacy fork or the clean integration repo
- the integration repo should stay thin: upstream sync, upstreamable patches,
  and short-lived compatibility work only

## 2026-04-24 - Submodule and subtree remain deferred until after Phase 2

- the immediate permanent fix is repo identity and governance, not vendoring
  surgery
- after the downstream/integration split:
  - keep the current two-repo posture by default
  - reconsider `git submodule` later only if strong upstream pinning,
    ownership separation, and explicit update commits become more valuable than
    operator simplicity
  - do not adopt `git subtree` unless a one-checkout workflow becomes worth
    the mixed history, larger vendor-update churn, and harder provenance line
    between upstream code and downstream platform work
