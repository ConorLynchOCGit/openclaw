---
summary: "Recorded outcomes from the first executed batch of final human validation prompts."
title: "Final Human Validation Results"
---

# Final Human Validation Results

Source session:

- Main session log: `.openclaw/agents/main/sessions/9196a3c3-7038-422d-960b-9f1ee4a13ada.jsonl` in the live operator home

Recorded batches:

- execution window: `2026-04-17 03:58 UTC` through `2026-04-17 04:23 UTC`

## Completed prompts

| Prompt surface                    | Prompt                                                                                                                                                                                                | Outcome | Notes                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topology distinction              | `Explain the difference between workspace topology and deployment topology in this repo.`                                                                                                             | `pass`  | Main distinguished repo structure ownership from live deployment/runtime ownership correctly.                                                                                                 |
| Canonical project set             | `List the eight canonical project workspaces currently tracked in this repo and give one sentence on each.`                                                                                           | `pass`  | Main returned the current eight-project canon and described each accurately.                                                                                                                  |
| Repo/container adoption           | `Which canonical project workspaces are now present in the live runtime container, and why does that matter operationally?`                                                                           | `pass`  | Main answered that all eight canonical project workspaces are present in the live runtime container and explained the operational impact coherently.                                          |
| Path resolution                   | `When a runbook names docs/** or ops/**, how should runtime path resolution behave now?`                                                                                                              | `pass`  | Main correctly described repo-canonical read resolution and separate writable artifact locations.                                                                                             |
| Canonical roots                   | `What is the canonical project root, and what is the canonical global durable-doc root?`                                                                                                              | `pass`  | Main answered `docs/projects/` and `docs/system/` correctly.                                                                                                                                  |
| Browser path                      | `Open https://example.com in the browser tool and tell me the page title only.`                                                                                                                       | `fail`  | The browser tool timed out. Main then fell back to fetch and still returned `Example Domain`, so the content answer was right but the tool-path requirement was not met.                      |
| Brave path                        | `Use Brave search to find the official OpenClaw plugin docs page and give me the exact URL.`                                                                                                          | `pass`  | Main used Brave search and returned `https://docs.openclaw.ai/tools/plugin`.                                                                                                                  |
| Firecrawl/fetch path              | `Use Firecrawl or the canonical fetch path to read https://docs.openclaw.ai/tools/plugin and list the first three top-level sections.`                                                                | `pass`  | Main used fetch and returned `Quick start`, `Plugin types`, and `Official plugins`.                                                                                                           |
| Builder pack behavior             | `Builder: propose the smallest implementation slice for a docs-only topology audit.`                                                                                                                  | `pass`  | Main produced a bounded implementation-oriented slice with explicit scope, artifact, and acceptance criteria.                                                                                 |
| Researcher pack behavior          | `Researcher: identify the three strongest primary sources for OpenClaw plugin architecture.`                                                                                                          | `fail`  | Main hit `Agent-to-agent messaging denied by tools.agentToAgent.allow.` and then answered itself. The answer content was useful, but the specialist-lane behavior was not actually exercised. |
| Writer pack behavior              | `Writer: draft a concise release-style summary for the latest deployment-topology restoration work.`                                                                                                  | `pass`  | Main returned a concise release-style summary covering the restored deployment-topology lane.                                                                                                 |
| Operator-review retrieval         | `Summarize the daily and weekly operator-review lanes and name the canonical docs that define them.`                                                                                                  | `pass`  | Main named the daily and weekly flow correctly and cited the canonical deployment-topology docs.                                                                                              |
| GitHub digest understanding       | `What repo does the GitHub digest lane track now, and how was the upstream source repaired?`                                                                                                          | `pass`  | Main correctly named `openclaw/openclaw` and described the webhook-ingest repair path.                                                                                                        |
| X-manager boundary                | `For the currently supported x-manager account, prepare an approval-only packaging brief for one short post about the latest OpenClaw deployment-topology restoration work. Do not publish anything.` | `pass`  | Main produced an approval-only packaging brief, kept the no-publish boundary, and grounded the output in the x-manager account context.                                                       |
| Operator-review grounding         | `For daily and weekly operator review, what sources should grounding come from now?`                                                                                                                  | `pass`  | Main answered with canonical `docs/projects/`, `docs/system/`, and current daily-summary evidence rather than stale workspace primaries.                                                      |
| Ingest interruption understanding | `Why did the original deep ingest appear to be interrupted by heartbeat, and what was the real root cause?`                                                                                           | `pass`  | Main correctly distinguished heartbeat overlap from the real rebuild-time duplicate-key collision.                                                                                            |
| Ingest hardening understanding    | `What changed so long-running model-memory ingest is safer now?`                                                                                                                                      | `pass`  | Main described serialized rebuilds and truthful interrupted checkpoint state.                                                                                                                 |
| Specialist role boundaries        | `What are the specialist role boundaries for builder, researcher, writer, web-researcher, and x-manager?`                                                                                             | `pass`  | Main returned the current specialist boundary split and cited the canonical agent docs.                                                                                                       |
| Corpus delta explanation          | `What changed between the old 221-source ingestion baseline and the new deep pass, and why were model-memory evidence artifacts excluded?`                                                            | `pass`  | Main explained the larger 304-source corpus and the intentional exclusion of generated evidence artifacts.                                                                                    |
| Ingest artifact explanation       | `What are the exact artifacts produced by the deep document-ingest run, and what does each prove?`                                                                                                    | `pass`  | Main named the checkpoint and summary artifacts and tied each one to a distinct proof role.                                                                                                   |
| Canonized imported projects       | `Which imported projects were canonized into docs/projects and why do they matter to runtime behavior?`                                                                                               | `pass`  | Main named the canonized project workspaces and linked them to runtime significance.                                                                                                          |
| Restored browsing explanation     | `Explain how Brave, Firecrawl, and browser were restored and how a human should verify each path.`                                                                                                    | `pass`  | Main explained the restoration posture and matched each lane to a human verification prompt.                                                                                                  |
| Retrieval stability               | `What is the difference between workspace topology and deployment topology?`                                                                                                                          | `pass`  | Main answered consistently with the earlier topology distinction answer.                                                                                                                      |
| Near-duplicate stability          | `How do workspace topology and deployment topology differ operationally?`                                                                                                                             | `pass`  | Main answered consistently under phrasing drift. This does not by itself prove cache reuse.                                                                                                   |

## Started but not completed

| Prompt surface     | Prompt                                                                                                | Outcome      | Notes                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Delegated research | `Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.` | `incomplete` | Main issued the search/fetch calls, but the session log ended before a final answer was recorded. Treat this as not yet evaluated. |

## Net state after the recorded batches

- passed: `21`
- failed: `2`
- incomplete: `1`

## Repair reruns and DB-backed proof after the recorded batches

The earlier prompt batch is not the final truth for the repaired runtime.
Additional live reruns and DB-backed diagnostics were completed after the
recorded prompt window.

| Surface                                 | Outcome | Evidence                                                                       | Notes                                                                                                                                                                                                                                    |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh Main bootstrap                    | `pass`  | bare `/new` live rerun after the startup-context patch                         | Visible startup answer stayed clean and did not leak the bootstrap block.                                                                                                                                                                |
| Browser path                            | `pass`  | live browser prompt rerun                                                      | `Open https://example.com in the browser tool and tell me the page title only.` returned `Example Domain` through the browser path.                                                                                                      |
| Daily operator review current-day chain | `pass`  | host sync log + fresh artifact                                                 | `daily operator review artifact synced: /root/.openclaw/workspace/archives/daily_operator_reviews/2026-04-17.md`                                                                                                                         |
| Weekly operator review sync             | `pass`  | host sync log + synced artifact                                                | `weekly operator review artifact synced: /root/.openclaw/workspace/archives/weekly_operator_reviews/2026-W16.md`                                                                                                                         |
| Weekly operator review Telegram preview | `pass`  | host Telegram-preview log                                                      | `preview-only: summary generated at /root/.openclaw/workspace/projects/ops/generated_current/weekly_review_telegram_summary_current.txt`                                                                                                 |
| Weekly maintenance debt guard           | `pass`  | fresh native cron run at `2026-04-17 13:43:35 UTC`                             | The run returned the bounded `MD-013` debt report instead of unreadable-path failure.                                                                                                                                                    |
| Model-memory capture proof              | `pass`  | DB-backed live diagnostic session `codex-live-mm-write-diag-1776435267602`     | Produced current-timestamp `model_memory.sources`, `memory_objects`, `memory_support_items`, and `write_events` rows; write event id `140bf769-8248-5f61-9fe1-2f18e1ee7a0a`.                                                             |
| Model-memory retrieval/context proof    | `pass`  | DB-backed live diagnostic session `codex-live-mm-retrieval-diag-1776435619123` | Persisted `runtime_context.retrieval_requests`, `retrieval_result_sets`, and `retrieval_result_items`; top selected result was preference object `9d89ef85-f14e-5677-8970-5e7a403632d0`; retrieval pack was included in the context run. |

## Still not freshly re-proven in this pass

| Surface                            | Current status | Notes                                                                                                               |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Delegated research                 | `incomplete`   | The earlier delegated comparison prompt still has no final recorded answer and was not rerun in this pass.          |
| Researcher specialist-pack routing | `incomplete`   | The live allowlist issue was fixed, but the exact `Researcher:` prompt path was not rerun after that config change. |
| Daily-summary retrieval canary     | `incomplete`   | No fresh canary was seeded and re-proven in this pass.                                                              |

## Memory prompt caveat

The memory-phase prompts were run, but the transcript does **not** show valid
model-memory capture/retrieval proof yet.

| Prompt surface              | Prompt                                                                          | Outcome      | Notes                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| Prompt capture token        | `Remember this exact token for a later retrieval test: marigold-signal-42.`     | `not_proven` | The session shows a workspace `edit` to `memory/2026-04-17.md`, not a visible model-memory capture path.        |
| Prompt capture preference   | `For the rest of this test phase, remember that I prefer terse bullet answers.` | `not_proven` | The session shows a workspace `edit` to `memory/2026-04-17.md`, not a visible model-memory capture path.        |
| Prompt token retrieval      | `What exact token did I ask you to remember earlier?`                           | `not_proven` | Main answered correctly, but there was no visible memory retrieval or model-memory tool call before the answer. |
| Prompt preference retrieval | `How should you format answers for me during this test phase?`                  | `not_proven` | Main answered correctly, but there was no visible memory retrieval or model-memory tool call before the answer. |
| Daily-summary retrieval     | `What was the deep-soak canary from the finalized daily summary?`               | `fail`       | Main reported that no recorded canary was present yet.                                                          |

## Immediate follow-up

- rerun the delegated research prompt because the earlier log still does not contain a final answer
- rerun the researcher specialist-pack prompt now that the allowlist issue is fixed
- add the daily-summary canary, then rerun the daily-summary retrieval prompt
- treat the DB-backed diagnostics above as the authoritative model-memory proof for this pass rather than the earlier transcript-only memory prompts
