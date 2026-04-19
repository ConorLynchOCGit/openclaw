---
summary: "Baseline audit separating repo-local hardening truth from the still-running live container truth before rollout."
title: "Runtime Hardening Baseline Audit"
---

# Runtime Hardening Baseline Audit

## Repo baseline

- live repo root: `/root/services/openclaw-roles/live`
- branch: `main`
- HEAD at audit start: `c5cb769d9a81a7984ea44ef5016492f22a02db1d`
- ahead/behind vs `origin/main`: `0 / 0`

## Live runtime baseline

- running container: `openclaw-runtime`
- image tag: `openclaw:local`
- inspected image digest at audit start:
  `sha256:ba51e576f8040df40ff660fea50e9cb09d1788ba460f7ed53d4b197ceda38237`

## Drift proven before this sprint patch

Repo code had already gained selector cleanup logic, but the running container
did not contain it.

Exact proof used:

```bash
docker exec openclaw-runtime sh -lc 'grep -R "shouldHideInternalSelectorSession" -n /app/src /app/dist 2>/dev/null | head'
docker exec openclaw-runtime sh -lc 'grep -R "requestKey.startsWith(\"codex-\")" -n /app/src /app/dist 2>/dev/null | head'
```

Observed result:

- no matches in the running container

Meaning:

- repo-local truth and live gateway truth had diverged
- a repo patch could not be treated as “done” without container/runtime proof

## Operational consequence

This baseline is why the sprint now treats these as separate gates:

1. repo code changed
2. local validation passed
3. image rebuilt from the intended tree
4. live container recreated from that image
5. runtime-visible behavior or probe fingerprint proved the rollout
