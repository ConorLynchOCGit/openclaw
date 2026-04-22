---
summary: "Operator Experience roadmap."
title: "Operator Experience Roadmap"
---

# Operator Experience Roadmap

## Phase 1: Visible Work

- Add persistent elapsed-time status to the active working card. Status: first pass implemented.
- Add a reduced-motion-safe working animation. Status: first pass implemented through stable working-card spinner/pulse.
- Add cancel/retry affordances where backend lifecycle supports them. Status: cancel first pass implemented; retry disabled until durable replay lands.
- Keep queued prompts visible inline with queue position and timestamps. Status: implemented with elapsed time and edit/cancel affordances.
- Render memory/retrieval/capture activity as timeline chips/cards. Status: implemented for structured memory activity messages.

## Phase 2: Operator Diagnostics

- Add copy diagnostic bundle. Status: first pass implemented in chat/run cards.
- Add durable run-history page. Status: pending; in-chat summary implemented.
- Add run timeline filtering by memory, tools, filesystem, git, tests, and errors. Status: pending dedicated page; first-pass cards implemented.
- Add diff/test/build status cards with clear pass/fail/skipped state. Status: first-pass visible command classification implemented.
- Add artifact links for screenshots, logs, reports, and generated proofs.

## Phase 3: Knowledge and Memory Observability

- Add retrieval proof explorer. Status: first-pass event summary implemented; backend-backed explorer pending.
- Add projection artifact browser. Status: first-pass event summary implemented; backend-backed artifact browser pending.
- Add memory capture evidence viewer.
- Add no-dark-data scan status.
- Add activity-feed privacy mode that defaults to IDs and counts.

## Phase 4: Permission and Queue Control

- Add permission-mode switcher with ordinary, host-operator read-only, host-operator write-enabled, and exec-enabled states.
- Add host-operator audit viewer.
- Add queue manager with cancel, edit-before-start, retry, pause, and resume.
- Add background task list for long-running jobs.

## Phase 5: Operator Console

- Consolidate run history, queue, permissions, artifacts, memory observability, build status, git status, and diagnostics into an operator console.
