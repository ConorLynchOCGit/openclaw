# Status

- state: active
- pack_type: canonical_project_workspace
- canonical_registry: yes
- canonical_repo_entry: `docs/projects/github/index.md`
- role: GitHub digest, webhook, auth, and reporting project workspace

## 2026-04-24 Downstream Docs Bundle Workflows

- workflows:
  - `.github/workflows/docs-sync-publish.yml`
  - `.github/workflows/docs-translate-trigger-release.yml`
- canonical downstream source repo is now `ConorLynchOCGit/openclaw-platform`
- clean upstream integration repo is now `ConorLynchOCGit/openclaw-integration`
- retained legacy fork is `ConorLynchOCGit/openclaw`, but it is no longer the
  canonical work or workflow home
- downstream docs no longer target `openclaw/docs`
- cross-repo publish credentials are no longer required for the current
  downstream posture
- `.github/workflows/docs-sync-publish.yml` now builds a same-repo docs bundle
  artifact on docs changes
- `.github/workflows/docs-translate-trigger-release.yml` now builds a
  release-tagged same-repo docs bundle artifact on published releases
- `scripts/docs-sync-publish.mjs` now materializes a bundle directory and
  writes `.openclaw-docs-build/source.json` metadata instead of cloning and
  pushing to another repository
- downstream docs hosting remains intentionally undecided; bundle artifacts are
  the safe current output until an owned host is chosen
- functionality-loss audit result for this migration lane:
  - no accidental regression found in the current downstream docs path
  - intentional retirements:
    - cross-repo publish to `openclaw/docs`
    - cross-repo locale dispatch on release
  - preserved current capability:
    - same-repo docs bundle generation on docs changes
    - same-repo release-tagged docs bundle generation on releases

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
- next bounded follow-on after the migration-residue cleanup closes is Slice 3:
  UI ghost-stream fix and local worktree cleanup, not the full stability gate
