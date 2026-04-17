---
summary: "Audit of full repo visibility inside the canonical runtime container."
title: "Repo File Container Visibility Audit"
---

# Repo File Container Visibility Audit

## Goal

Answer the full repo-to-container question precisely by separating:

- the baked runtime subset under `/app`
- the canonical live repo import mount
- any real visibility gaps

## Valid container visibility modes

1. runtime-owned image content under `/app`
2. canonical repo import visibility through:
   `/home/node/.openclaw/workspace/imports/product_live/content`

## Evidence

### Host repo tracked files

- command:
  `git ls-files | wc -l`
- result:
  `14485`

### Runtime import-mount tracked files

- command:
  `docker exec openclaw-runtime sh -lc 'git -c safe.directory=/home/node/.openclaw/workspace/imports/product_live/content -C /home/node/.openclaw/workspace/imports/product_live/content ls-files | wc -l'`
- result:
  `14485`

### Host versus import-mount diff

- command:
  `comm -3 /tmp/live_repo_files.txt <(docker exec openclaw-runtime sh -lc 'git -c safe.directory=/home/node/.openclaw/workspace/imports/product_live/content -C /home/node/.openclaw/workspace/imports/product_live/content ls-files | sort')`
- result:
  empty output

### Runtime image subset

- `/app` is not a git checkout and should not be treated as the full-repo
  visibility surface
- it is the baked runtime subset used to execute the product
- evidence:
  `find /app -type f | wc -l`
- result:
  `104895`

## Current judgment

- all tracked repo files are accessible inside the canonical runtime container
  through the canonical repo import mount
- `/app` remains a runtime image subset, not the authoritative surface for full
  repo visibility
- no real repo-file visibility gap remains after the import-mount parity check

## Why the distinction matters

The runtime container does not need every repo file baked into `/app` as long
as the canonical live repo remains available through the intended import mount.
That is the correct topology for this deployment.
