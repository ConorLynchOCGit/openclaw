---
summary: "Immediate Operator Experience slice."
title: "Operator Experience Current Slice"
---

# Current Slice

## Goal

Make OpenClaw feel operationally alive and inspectable without adding chat-feed noise or unsafe host access.

## Immediate Work

- Persistent elapsed-time status on the active working card. Status: first pass implemented.
- Cancel/retry affordances on working cards. Status: cancel wired where available; retry displays disabled reason until durable replay support lands.
- Memory/retrieval/capture chips in the run timeline. Status: first pass implemented from structured activity messages.
- Host-operator mode badge with scoped path and audit status. Status: first pass implemented with configured-mode badge; live status API remains pending.
- Copy diagnostic bundle action that excludes raw prompts, transcripts, raw tool logs, secrets, and private phrases by default. Status: first pass implemented.
- In-chat first-pass operator panel for run history, retrieval proof, projection artifact, and engineering command summaries. Status: first pass implemented.

## Acceptance

- Every queued/running prompt has visible status within one second of submission.
- Memory activity is visible as structured timeline/tool-like records, not assistant prose notes.
- The UI clearly indicates whether host-operator mode is inactive, read-only, write-enabled, or exec-enabled.
- Diagnostic bundles are bounded, redacted, and useful for debugging.

## Pending Follow-Up

- Dedicated durable run-history page.
- Backend-backed retrieval proof explorer API.
- Backend-backed projection artifact browser API.
- Full permission-mode switcher that reflects live tool-status telemetry.
- Queue manager with durable pause/resume/retry.
