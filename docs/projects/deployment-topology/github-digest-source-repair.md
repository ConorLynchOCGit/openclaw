---
summary: "Root cause, repair, and proof for the live GitHub digest source lane."
title: "GitHub Digest Source Repair"
---

# GitHub Digest Source Repair

## Prior broken state

- the repo-owned digest assets were already scoped to `openclaw/openclaw`
- the live `inbound_events` table still only contained legacy repo rows:
  - `ConorLynchOCGit/openclaw-workspace`
  - `ConorLynchOCGit/automation-webhooks`
- the public ingress endpoint at
  `https://srv1425839.tailbcf154.ts.net:8443/webhook/github` did not behave as
  a live production webhook

## Root cause

The substantive break was in the live webhook-ingest path, not in the digest
SQL.

- the `GitHub Webhook Ingest` workflow existed in n8n
- the workflow definition and digest query were present
- the live production webhook route was not actually serving signed GitHub
  traffic until the workflow was published, activated, and n8n was restarted

That left the digest lane canonized in repo but effectively disconnected from
fresh canonical GitHub deliveries.

## Systems touched

- live n8n workflow state for `GitHub Webhook Ingest`
- live n8n process restart
- public Funnel ingress at `:8443`
- Supabase/Postgres `inbound_events`
- weekly review prep context that reports canonical versus non-canonical GitHub
  evidence

## Repair performed

1. verified the repo-owned digest query and workflow export were already scoped
   to `openclaw/openclaw`
2. proved the public webhook path was not serving the production workflow
3. published and activated the live `GitHub Webhook Ingest` workflow in n8n
4. restarted the n8n container so the production webhook registry was rebuilt
5. re-probed the local and public `/webhook/github` route until both returned
   `401 invalid_signature` for a bad HMAC
6. sent a correctly signed canonical test delivery for
   `openclaw/openclaw` through the public Funnel endpoint
7. verified the canonical delivery persisted in `inbound_events`

## Proof

### Production route proof

- local n8n production route:
  `POST http://127.0.0.1:35678/webhook/github`
- local Caddy route:
  `POST http://127.0.0.1:38080/webhook/github`
- public Funnel route:
  `POST https://srv1425839.tailbcf154.ts.net:8443/webhook/github`

All three now reject a bad signature with the same boundary response:

- `401 {"ok":false,"error":"invalid_signature"}`

### Canonical delivery proof

A correctly signed public test delivery for `openclaw/openclaw` now lands in
the live database:

- `openclaw/openclaw|ping|probe|987654321|local-openclaw-1776387233933|2026-04-17 00:53:55.328+00`

That proves the repaired public source path can carry canonical repo events
into the digest source table.

## Remaining caveat

This sprint repaired and proved the live ingress and storage path directly.
GitHub-side webhook registration for the upstream repository was not audited via
GitHub admin APIs from this host, so the next organic `openclaw/openclaw` event
should still be watched in the digest lane as a final external confirmation.
