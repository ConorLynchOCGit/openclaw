---
summary: "Operational status of the legacy standalone memory reporting cron lane after model-memory cutover."
title: "Model Memory Ops Reporting Lane"
---

# Model Memory Ops Reporting Lane

## Current judgment

The old standalone host-scheduled memory reporting cron lane remains retired.

That specifically includes the former standalone cron jobs for:

- memory soak DB reporting
- memory performance reporting
- standalone memory projection reporting

## Why

- `model-memory` is now the active canonical memory architecture
- the legacy standalone reporting cron jobs were part of the old workspace ops
  layer and are no longer the primary observability contract
- current memory truth lives in the `model-memory` project docs, evidence, and
  runtime status surfaces

## Important distinction

Repo-owned review-support scripts may still generate bounded memory evidence for
operator-review context assembly. That does not revive the old standalone cron
lane as the primary reporting model.

## Rule

- keep the standalone legacy memory reporting cron jobs retired
- keep `model-memory` project evidence and runtime seams as the primary memory
  truth
