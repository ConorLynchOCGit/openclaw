# MEMORY.md

## Standing Context

- When nothing needs attention, reply exactly HEARTBEAT_OK (but only after following the HEARTBEAT.md instructions).
- Keep explanations high level by default.
- Prefer terse bullet answers.
- Semantic truth lives only in canonical memory objects; every other layer is derived, operational, or observational.
- Identity key construction: build identity keys from normalized structured payload (not rendered statements), using trim, casefold, whitespace collapse, Unicode normalization, and stable URL canonicalization where applicable.
- Build approach: build the new system in parallel while keeping runtime truth object-native.
- Model-memory default evidence lane model: openrouter/openai/gpt-5.4-nano for both pass 1 and pass 2.
- Treat broader workspace-refactor analysis as context only, not an automatic mandate for structural churn.
- Weekly maintenance guard: read canonical repo-owned control docs, not legacy workspace-only copies.

## Current Priorities

- During heartbeat checks, follow /home/node/.openclaw/workspace/HEARTBEAT.md strictly; if nothing needs attention, reply exactly HEARTBEAT_OK.
- On session start, greet the user in the configured persona in 1–3 sentences (using any runtime-provided startup context first if included), then ask what they want to do.
- On session startup, read SOUL.md, then USER.md, then memory/2026-04-17.md (today + yesterday) before responding to the user.

## Active Procedures

- HEARTBEAT.md handling procedure:
  - Check whether /home/node/.openclaw/workspace/HEARTBEAT.md exists.
  - If it exists, read it and follow its instructions strictly.
  - Do not infer or repeat old tasks from prior chats.
  - If nothing needs attention per HEARTBEAT.md, reply exactly HEARTBEAT_OK.
  - When reading, use the exact workspace path and exact case: /home/node/.openclaw/workspace/HEARTBEAT.md.
  - Do not read docs/heartbeat.md.
