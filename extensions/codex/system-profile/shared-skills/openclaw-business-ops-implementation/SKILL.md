---
name: openclaw-business-ops-implementation
description: Use when Codex implements Business Ops templates, company/project artifacts, Workboard promotion boundaries, editorial or creative workflows, measurement, claims, approvals, or publication-readiness changes.
---

# OpenClaw Business Ops Implementation

Preserve the ownership chain while making Business Ops artifacts operationally
useful.

## Boundaries

- Business Ops owns source-backed domain, brand, claim, audience, campaign,
  creative, approval, and measurement context.
- Workboard owns durable commitments only after explicit reviewed creation.
- Tasks, sessions, runs, and Task Flow own execution evidence.
- Cron owns exact scheduling; Heartbeat only surfaces bounded priorities.
- Candidate, internal, unknown, forbidden, and unapproved states must remain
  explicit. Do not turn candidate claims or creative work into approved public
  statements.
- Do not publish, create external records, imply legal or securities approval,
  or use material non-public information without explicit authority.

Inspect reusable templates and the concrete company/project instantiation.
Prefer one reusable capability over company-specific hardcoding. When the work
has qualitative brand, message, genericity, claim, or publication risk, use an
explicit `creative_quality_reviewer` purpose agent and disposition its material
findings before closeout.

## Native Workboard Promotion

When a reviewed Business Ops candidate may become a commitment:

- keep generic `workboard_create` free of Business Ops-only provenance;
- use the dedicated promotion surface for preview and explicit approval;
- store only minimal candidate/source/project provenance, owner mode, target
  window, decision boundary, approval note, actor, and time on the card;
- represent dependencies with native parents, review/revision history with
  comments/events, completion evidence with proof/artifacts, and execution with
  task/session/run links;
- keep target windows as display metadata and never copy them into
  `scheduledAt`;
- make repeated promotion of the same project candidate update the same native
  card rather than create a duplicate;
- keep proposed learning as a reviewable linked proposal. Never mutate
  Business Ops domain truth automatically.

Do not copy expected outputs, blockers, requirements, proof lists, artifact
lists, reviewer lists, closeout lists, or learning lists into a parallel card
workflow schema when native card fields and linked artifacts already own them.

Do not create a second task database, markdown execution engine, scheduler,
runner, artifact parser, approval authority, or GBrain truth surface.
