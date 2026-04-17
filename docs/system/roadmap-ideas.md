---
summary: "Canonical holding layer for loose roadmap ideas that do not yet justify full project workspaces."
title: "System Roadmap Ideas"
---

# System Roadmap Ideas

This file preserves real roadmap detail that is not yet strong enough to justify
its own project workspace.

Promotion rule:

- promote an idea into `docs/projects/<project-id>/` when it has a clear owner,
  active implementation slice, or enough execution detail that the work should
  be tracked as a project instead of a loose direction

Each idea keeps:

- problem
- desired outcome
- rough scope
- dependencies
- promotion trigger
- current status

## Onboarding And Setup Reliability

**Problem**

OpenClaw still has a meaningful first-run reliability burden. Users encounter
auth, permission, workspace, and restart complexity early.

**Desired outcome**

The default setup path becomes more reliable and easier to complete without
hiding critical security decisions.

**Rough scope**

- onboarding wizard improvements
- setup reliability fixes
- first-run UX hardening

**Dependencies**

- runtime bootstrap canonicalization
- gateway/operator docs quality

**Promotion trigger**

Promote this into a dedicated project workspace when the work becomes a
multi-slice execution program rather than a background product priority.

**Current status**

Loose roadmap idea sourced from `VISION.md` and `CONTRIBUTING.md`.

## Provider Breadth And Reliability

**Problem**

OpenClaw wants strong support across major model providers, but the work is
currently represented mostly as broad product direction rather than one bounded
project.

**Desired outcome**

Major providers work reliably with predictable operator behavior and without
accumulating ad hoc compatibility debt.

**Rough scope**

- major provider breadth
- provider reliability hardening
- operator-facing provider ergonomics

**Dependencies**

- plugin boundary quality
- provider auth and status surfaces

**Promotion trigger**

Promote when provider work is organized into a dedicated execution roadmap
rather than dispersed fixes.

**Current status**

Loose roadmap idea sourced from `VISION.md`.

## Channel Reliability And Priority Expansions

**Problem**

Support for major messaging channels remains a continuing product priority, but
the remaining work is spread across many channel-specific surfaces.

**Desired outcome**

High-demand channels are reliable, and carefully chosen expansions happen
without destabilizing shared routing/runtime behavior.

**Rough scope**

- WhatsApp and Telegram edge-case reliability
- major channel quality improvements
- a few high-demand channel additions

**Dependencies**

- channel/plugin boundaries
- routing and onboarding stability

**Promotion trigger**

Promote when a cross-channel execution program or bounded expansion initiative
becomes active.

**Current status**

Loose roadmap idea sourced from `VISION.md` and `CONTRIBUTING.md`.

## CLI And Web Ergonomics

**Problem**

OpenClaw still carries usability rough edges across CLI and web surfaces, but
the effort is broader than a single local bug lane.

**Desired outcome**

Common operator flows feel more coherent across CLI, dashboard, and Control UI.

**Rough scope**

- CLI ergonomics
- web frontend ergonomics
- status, onboarding, and workflow clarity

**Dependencies**

- runtime/bootstrap clarity
- docs and operator inventory coherence

**Promotion trigger**

Promote when the work becomes a focused multi-slice UX program.

**Current status**

Loose roadmap idea sourced from `VISION.md`.

## Companion App Expansion

**Problem**

Companion apps across macOS, iOS, Android, Windows, and Linux remain strategic
priorities, but not all of that work is currently organized into one canonical
project workspace.

**Desired outcome**

Cross-platform companion-app work is prioritized deliberately instead of being
tracked only as broad vision text.

**Rough scope**

- macOS
- iOS
- Android
- Windows
- Linux

**Dependencies**

- gateway/runtime stability
- onboarding and pairing quality

**Promotion trigger**

Promote when cross-platform work is scheduled as a coherent program rather than
separate app-local efforts only.

**Current status**

Loose roadmap idea sourced from `VISION.md`.

## Maintainer And Contributor Growth

**Problem**

Maintainer growth and contributor guidance are currently described in
`CONTRIBUTING.md`, but the work is not organized as a project.

**Desired outcome**

The maintainer funnel and contributor growth path stay visible without
pretending they are an active execution project today.

**Rough scope**

- maintainer onboarding expectations
- contributor pipeline clarity
- review/process transparency

**Dependencies**

- stable repo workflow
- docs and PR/process quality

**Promotion trigger**

Promote only if this becomes a dedicated internal program.

**Current status**

Loose roadmap idea sourced from `CONTRIBUTING.md`.
