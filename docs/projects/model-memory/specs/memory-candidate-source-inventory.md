---
summary: "Source inventory and authority contract for model-owned MMV2 memory candidate capture."
title: "Memory Candidate Source Inventory"
---

# Memory Candidate Source Inventory

This inventory is the pre-Milestone-4 contract for which runtime sources may
generate MMV2 memory candidates after deterministic semantic judgment removal.

## Capture Contract

- Semantic capture routing, extraction, admission, reconciliation, and collision
  adjudication are model-owned.
- Deterministic code may select source/recency/contiguous windows, cap fields,
  redact secrets or private markers, summarize raw tool logs mechanically, and
  attach refs, hashes, source authority, and schemas.
- Deterministic code must not prune packets for interestingness, usefulness,
  semantic relevance, memory-worthiness, skill-worthiness, or proactivity value.
- Routed schema/code-like text is not skipped before model review. If the model
  extracts unsupported, unsafe, malformed, or ungrounded output from that text,
  deterministic validation rejects or quarantines the output after the model
  step.
- Missing or invalid model output after bounded repair yields
  `pending_review`, `quarantine`, or `blocked`; it does not restore a
  deterministic semantic fallback.
- Memory capture and retrieval routes default to `openai-codex/gpt-5.4-mini`.
  Skill/proactivity candidate review uses the separate full
  `openai-codex/gpt-5.4` route.

## Source Inventory

| Source                                                          | Authority Tier                                                 | Model Route                                                       | Write Eligibility                                                                    | Durable Artifact                                              | Unavailable Model Behavior                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| OpenClaw user ordinary turn                                     | `user_authoritative`                                           | MMV2 capture chain                                                | Validated model candidates may write                                                 | Sanitized source packet, refs, hashes, validation/report rows | Pending/quarantine/block                                         |
| OpenClaw assistant final                                        | lower-authority assistant evidence unless user-approved        | MMV2 capture chain                                                | May write only as lower-authority evidence/candidate                                 | Sanitized packet, source authority, refs, hashes              | Pending/quarantine/block                                         |
| Document ingestion                                              | source-profile dependent                                       | MMV2 capture chain                                                | Validated candidates may write subject to source authority                           | Sanitized document packet/window, refs, hashes, closeout      | Pending/quarantine/block                                         |
| MMV2 document shadow ingestion                                  | source-profile dependent                                       | MMV2 capture chain                                                | Shadow/proof writes only when explicitly routed to durable storage                   | Sanitized packet, shadow report, validation report            | Pending/quarantine/block                                         |
| Tool result proof capture                                       | tool-grounded evidence                                         | MMV2 capture chain when promoted from proof source                | Validated candidates may write only if source profile allows                         | Command family/status/failure summary, refs, hashes           | Pending/quarantine/block                                         |
| Tool result persistence                                         | tool-grounded evidence                                         | MMV2 capture chain when explicitly enabled                        | Validated candidates may write if safe and source-authorized                         | Bounded tool summary, no raw logs                             | Pending/quarantine/block                                         |
| Proof/corpus ingestion                                          | curated/proof authority by source profile                      | MMV2 capture chain                                                | Validated candidates may write only to intended proof/durable lane                   | Bounded corpus packet, refs, hashes                           | Pending/quarantine/block                                         |
| Deep document ingestion                                         | curated source-profile dependent                               | MMV2 capture chain                                                | Validated candidates may write through runner safeguards                             | Checkpoint, bounded source packet, failed-source class        | Quarantine failed source and stop systemic retries               |
| Recovery/maintenance loops                                      | control-plane evidence                                         | MMV2 capture chain only when explicitly routed                    | Usually evidence-only; validated candidates may write when source-authorized         | Maintenance report, refs, hashes                              | Pending/quarantine/block                                         |
| Live shadow adapters                                            | adapter/source-profile dependent                               | MMV2 capture chain                                                | Validated candidates may write only on durable lane                                  | Shadow artifact, refs, hashes                                 | Pending/quarantine/block                                         |
| Codex user turn                                                 | `user_authoritative`                                           | MMV2 capture chain                                                | Validated model candidates may write                                                 | Sanitized contiguous Codex window, refs, hashes               | Pending/quarantine/block or degraded unavailable report          |
| Codex assistant final                                           | lower-authority assistant evidence                             | MMV2 capture chain                                                | Validated lower-authority candidates may write                                       | Sanitized contiguous Codex window, refs, hashes               | Pending/quarantine/block or degraded unavailable report          |
| Codex command/tool summary                                      | tool evidence                                                  | MMV2 capture chain when attached to Codex source window           | Validated tool-grounded candidates may write                                         | Command family/status/failure class, no raw logs              | Pending/quarantine/block or degraded unavailable report          |
| Codex validation/proof failure                                  | tool-grounded evidence                                         | MMV2 capture chain                                                | Validated candidates may write when useful as model-owned memory                     | Bounded validation failure summary, refs, hashes              | Pending/quarantine/block or degraded unavailable report          |
| Daily summary file (`Memory-MM-DD.md` / `memory/YYYY-MM-DD.md`) | workspace note evidence unless explicitly source-authoritative | MMV2 document capture chain when enabled                          | Validated candidates may write with file refs/hashes; otherwise startup-context-only | Sanitized document windows, file path, hash, source profile   | Pending/quarantine/block or documented startup-context-only skip |
| Heartbeat/system event                                          | control-plane evidence                                         | Evidence-only unless explicitly routed through MMV2 capture chain | No direct write without model capture output                                         | Event metadata, refs, hashes                                  | No candidate/pending                                             |

## Retrieval Boundary

Hybrid retrieval may still use deterministic lexical search, vector recall,
graph/projection cues, recency, source-lineage, explicit refs, scopes, classes,
windows, and structural pack assembly to gather candidates. Final semantic
inclusion in context packs, capsules, and context injection is model-owned.

## Regular Codex Capture Runner

Regular Codex capture uses the same MMV2 path validated by long-prompt proof:

- `MODEL_MEMORY_CODEX_CAPTURE_ENABLED` gates the runner and defaults on; set it
  to `false`, `0`, `no`, or `off` to disable regular capture.
- `MODEL_MEMORY_CODEX_CAPTURE_CADENCE` may be `manual`, `heartbeat`,
  `session_boundary`, or `closeout`; initial runtime use should prefer manual
  or closeout/heartbeat hooks behind the disabled-by-default gate.
- `MODEL_MEMORY_CODEX_CAPTURE_MAX_ACTIVITIES`,
  `MODEL_MEMORY_CODEX_CAPTURE_MAX_CHARS_PER_ACTIVITY`,
  `MODEL_MEMORY_CODEX_CAPTURE_MAX_WORDS_PER_WINDOW`,
  `MODEL_MEMORY_CODEX_CAPTURE_COOLDOWN_MS`, and
  `MODEL_MEMORY_CODEX_CAPTURE_MAX_PER_RUN` bound each run.
- The runner selects Codex activity structurally by session/recency/ref, skips
  already-ingested refs/hashes, preserves contiguous activities where possible,
  and invokes MMV2 model-owned capture per bounded activity/window.
- Long Codex user prompts are document-like user-authoritative sources.
  Assistant finals are lower-authority assistant evidence. Command and
  validation summaries are tool-grounded evidence with raw logs omitted.

## Quality Recall Validation

Before gateway/UI wiring, the non-UI memory capture paths must be validated
with richer fixtures and stage-level qualitative recall accounting:

- Codex user-turn-rich sessions must include several substantial user asks, at
  least one long document-like prompt, scoped project decisions, temporary/TTL
  decisions, and no-memory controls. The regular runner must preserve source
  windows, route counts, extraction counts, authority tiers, and idempotency by
  refs/hashes.
- Codex mixed sessions must include user asks, assistant finals, command
  failures, validation/proof failures, touched files/work areas, and successful
  reruns. Assistant evidence remains lower-authority, command evidence remains
  tool-grounded, and raw logs are not persisted.
- Daily summary files are document-like daily-continuity sources when durably
  ingested. Large fixtures should include durable decisions, preferences,
  project state, temporary TODOs, stale notes, private/no-capture markers, and
  instructions that must not execute.
- Independent daily-note bullets may be routed by the model as separate atomic
  candidates; coherent project-state, checklist, or procedure notes may be
  routed as one composite artifact. Quality recall reports must score composite
  component coverage separately from top-level memory count.
- Assistant/tool positive evidence tests should prove lower-authority evidence
  can admit or quarantine through model-owned admission. Negative controls
  should produce zero writes or pending/quarantine without deterministic
  fallback capture.
- The qualitative recall audit records raw source candidate estimate, bounded
  packet candidate estimate, model output count, admitted/quarantined/rejected
  counts, and the loss point. These estimates are proof/human/model review
  artifacts only; they are not runtime deterministic judgment.
