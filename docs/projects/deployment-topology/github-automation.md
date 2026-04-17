---
summary: "Canonical home for the live GitHub digest automation lane and its committed ops assets."
title: "GitHub Automation"
---

# GitHub Automation

This lane is now canonically represented by:

- `ops/github/github_digest_telegram.sh`
- `ops/github/GITHUB_DIGEST_QUERY.sql`
- `ops/github/workflows/github_digest.json`
- `ops/github/workflows/github_webhook_ingest.json`
- `ops/telegram/send_chief_telegram.sh`

## Live contract

- the weekday GitHub digest remains a host cron entry
- the cron entry now targets the committed repo-owned digest script
- the digest still reads signed GitHub events from the live Postgres-backed
  intake lane
- the digest is now scoped to the canonical `openclaw/openclaw` repo instead
  of every signed GitHub event present in the shared intake database
- the digest still delivers through Chief to Telegram

## Current source-wiring truth

- the committed SQL and workflow export are correctly scoped to
  `openclaw/openclaw`
- the live GitHub webhook-ingest workflow is now published, active, and proven
  on the public Funnel endpoint
- the repaired public endpoint now accepts a correctly signed canonical
  `openclaw/openclaw` delivery and persists it in `inbound_events`
- the repair record and proof now live in
  [GitHub Digest Source Repair](/projects/deployment-topology/github-digest-source-repair)
- current judgment:
  - the repo-owned digest lane is canonized correctly
  - the live ingest path is now repaired and ready for organic canonical repo
    deliveries
  - the next natural `openclaw/openclaw` GitHub event should still be watched
    as a final external confirmation of repo-side webhook registration

## Why this matters

- runtime-only host survival no longer counts as the primary durable source
- the repo now owns the real SQL, workflow-export, and delivery-script assets
- future restoration work can extend this lane from committed assets instead of
  rediscovering them from the legacy workspace
