---
summary: "Operator prompt set and evidence checklist for the post-ingest deep human soak of restored functionality and model-memory."
title: "Deep Memory Soak Human Tests"
---

# Deep Memory Soak Human Tests

## Objective

Provide the exact human-run prompt set and operator actions for the next phase:

- full imported-functionality validation
- deep `model-memory` soak across document ingest, prompt ingest, and daily
  summary ingestion

Use this after the deep document-ingest pass has been completed or completed
with explicit failures that were reviewed and accepted.

## Stage map

1. pre-ingest sanity checks
2. ingest run
3. immediate post-ingest retrieval checks
4. prompt-ingestion checks
5. daily-summary-ingestion checks
6. context, projection, and cache checks

## Matrix

| Stage                  | Surface                            | Prompt or operator action                                                                                                                              | Expected outcome                                                                                          | Evidence to collect                                           | Failure sign                                                                               | Depends on deep ingest substrate |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| pre_ingest             | runtime health                     | Check the published `/readyz` route and the live gateway session selector                                                                              | `/readyz` is healthy and the selector shows only the intended visible sessions                            | `/readyz` response, screenshot or notes from selector         | HTML shell on `/readyz`, or hidden/internal sessions visible                               | `no`                             |
| pre_ingest             | fresh bootstrap                    | Start a fresh Main session with `/new`                                                                                                                 | No bootstrap truncation warning; greeting is normal and not hijacked by untrusted notes                   | session transcript                                            | truncation warning or malformed startup context                                            | `no`                             |
| pre_ingest             | continuity hook artifact           | Trigger a continuity-producing fresh session and inspect today’s `memory/YYYY-MM-DD.md`                                                                | The retained session-memory hook creates or updates the canonical daily continuity artifact               | file timestamp, artifact contents                             | no daily artifact update or missing continuity file                                        | `no`                             |
| ingest                 | document-ingest pass               | Use the exact prompt from `docs/projects/model-memory/deep-document-ingest-runbook.md`                                                                 | Run reaches `completed` or `completed_with_failures` and writes the checkpoint plus summary artifacts     | final assistant reply, checkpoint JSON, summary Markdown/JSON | silent skips, missing checkpoint, or no durable summary artifact                           | `yes`                            |
| ingest                 | live ingest progress               | While the deep ingest is running, stay in the active Main session and observe the chat transcript                                                      | Chat shows bounded `Queued:` / `Working:` progress during ingest rather than only a final result          | transcript, screenshot if useful                              | ingest appears dead in chat while work is actually progressing internally                  | `yes`                            |
| ingest                 | detached ingest replay             | Let the ingest continue after navigating away or after it backgrounds, then return and send a small follow-up                                          | Next active turn replays bounded current ingest state or terminal outcome once                            | transcript                                                    | no replay, stale replay, or duplicate replay every turn                                    | `yes`                            |
| post_ingest            | project inventory retrieval        | Ask Main: `List the current canonical project workspaces currently tracked in this repo and give one sentence on each.`                                | Returns the rescued canonical projects with reasonable descriptions, including newer canonized workspaces | session transcript, later retrieval trace                     | misses core imported projects or invents stale ones                                        | `yes`                            |
| post_ingest            | workspace alias resolution         | Ask Main: `If I mention projects/web_stack, projects/channel_identity, or projects/memory, which canonical project docs should you actually read now?` | Resolves the legacy workspace names back to `web-stack`, `channel-identity`, and `model-memory`           | session transcript, later retrieval trace                     | treats the legacy names as separate authoritative project trees                            | `yes`                            |
| post_ingest            | topology distinction               | Ask Main: `Explain the difference between workspace topology and deployment topology in this repo.`                                                    | Gives the correct ownership boundary between authored structure and live rollout/runtime shape            | session transcript, later retrieval trace                     | collapses the two projects into one or gives a vague answer                                | `yes`                            |
| post_ingest            | operator-review retrieval          | Ask Main: `Summarize the daily and weekly operator-review lanes and name the canonical docs that define them.`                                         | Uses canonized deployment docs rather than stale workspace lore                                           | session transcript, later retrieval trace                     | answers from stale/legacy grounding or cannot name canonical docs                          | `yes`                            |
| post_ingest            | agent-pack retrieval               | Ask Main: `What are the specialist role boundaries for builder, researcher, writer, web-researcher, and x-manager?`                                    | Reflects the restored pack boundaries and main-vs-specialist split                                        | session transcript                                            | generic answer that ignores the canonized packs                                            | `yes`                            |
| post_ingest            | memory corpus delta                | Ask Main: `What changed between the old 221-source ingestion baseline and the new deep pass, and why were model-memory evidence artifacts excluded?`   | Can explain the old baseline, the broader restored topology coverage, and the explicit evidence exclusion | session transcript                                            | cannot distinguish the old and new corpora or treats evidence artifacts as corpus material | `yes`                            |
| prompt_ingest          | durable token capture              | In a fresh Main session, say: `Remember this exact token for a later retrieval test: marigold-signal-42.`                                              | The runtime attempts or performs ordinary-turn capture                                                    | session log, later DB query, later retrieval prompt           | no capture signal or no later retrieval path                                               | `no`                             |
| prompt_ingest          | durable preference capture         | In another fresh Main session, say: `For the rest of this test phase, remember that I prefer terse bullet answers.`                                    | The runtime attempts or performs ordinary-turn capture of a stable user preference                        | session log, later DB query                                   | no capture signal or later formatting ignores the preference                               | `no`                             |
| prompt_ingest          | later token retrieval              | In a later fresh Main session, ask: `What exact token did I ask you to remember earlier?`                                                              | Retrieves `marigold-signal-42` through the memory path                                                    | session transcript, retrieval trace, DB checks                | cannot retrieve the token or answers without memory evidence                               | `no`                             |
| prompt_ingest          | later preference retrieval         | In a later fresh Main session, ask: `How should you format answers for me during this test phase?`                                                     | Surfaces the terse-bullets preference from memory                                                         | session transcript, retrieval trace, DB checks                | no preference retrieval or obviously generic answer                                        | `no`                             |
| daily_summary          | canary summary write               | Put a unique canary line into the finalized daily memory file for the current day, for example: `Deep-soak canary: brass-harbor-9.`                    | The daily summary now contains a deterministic canary for later recovery testing                          | daily memory file path and line                               | no stable canary in the finalized daily summary                                            | `no`                             |
| daily_summary          | later daily-summary retrieval      | In a fresh Main session after the daily summary is eligible, ask: `What was the deep-soak canary from the finalized daily summary?`                    | Retrieves or references `brass-harbor-9` through the daily-summary lane                                   | session transcript, `daily_continuity` DB rows                | no daily-summary retrieval evidence                                                        | `no`                             |
| context                | cross-doc synthesis                | Ask Main: `What are the exact artifacts produced by the deep document-ingest run, and what does each prove?`                                           | Answer combines the runbook and verification-plan surfaces coherently                                     | session transcript, context trace                             | cannot connect the runbook artifacts to the verification artifacts                         | `yes`                            |
| context                | restored browsing explanation      | Ask Main: `Explain how Brave, Firecrawl, and browser were restored and how a human should verify each path.`                                           | Pulls from canonized deployment and validation docs rather than stale drift                               | session transcript                                            | wrong plugin/runtime story or missing verification details                                 | `yes`                            |
| projection             | canonized project recall           | Ask Main: `Which imported projects were canonized into docs/projects and why do they matter to runtime behavior?`                                      | Names the rescued projects and links them to runtime/operator significance                                | session transcript, context trace                             | misses major rescued projects or treats them as archive-only                               | `yes`                            |
| cache                  | repeated retrieval stability       | Ask the same retrieval question twice in close succession: `What is the difference between workspace topology and deployment topology?`                | Second answer stays semantically stable; later cache diff should show stable/semi-stable reuse            | both replies, cache-diff artifact                             | second answer drifts materially or cache diff shows no reuse path                          | `yes`                            |
| cache                  | near-duplicate retrieval stability | Ask a wording variant right after the previous test: `How do workspace topology and deployment topology differ operationally?`                         | Answer stays consistent while tolerating phrasing drift                                                   | both replies, retrieval trace, cache diff                     | variant prompt behaves like a cold unrelated query with no shared grounding                | `yes`                            |
| imported_functionality | direct browsing                    | Ask Main: `Open https://example.com in the browser tool and tell me the page title only.`                                                              | Uses the browser path and returns the title only                                                          | session transcript                                            | wrong tool path or wrong output                                                            | `no`                             |
| imported_functionality | Brave search                       | Ask Main: `Use Brave search to find the official OpenClaw plugin docs page and give me the exact URL.`                                                 | Uses the Brave-backed search path and returns the correct official URL                                    | session transcript                                            | wrong provider, unavailable path, or wrong URL                                             | `no`                             |
| imported_functionality | Firecrawl/fetch                    | Ask Main: `Use Firecrawl or the canonical fetch path to read https://docs.openclaw.ai/tools/plugin and list the first three top-level sections.`       | Returns real sections from the live page                                                                  | session transcript                                            | empty output or obvious non-page answer                                                    | `no`                             |
| imported_functionality | delegated research                 | Ask Main: `Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.`                                        | Main delegates cleanly without leaking internal conversation                                              | session transcript, session selector notes                    | no delegation or leaked hidden-session chatter                                             | `no`                             |

## Recommended evidence collection after the prompt set

After the document-ingest prompt and again after the later retrieval tests, run:

```bash
MODEL_MEMORY_RETRIEVAL_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-retrieval-trace.ts
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-context-trace.ts
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-cache-diff.ts
```

Then inspect:

- `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
- `docs/projects/model-memory/evidence/retrieval-trace-deep-pass-2026-04.md`
- `docs/projects/model-memory/evidence/context-trace-deep-pass-2026-04.md`
- `docs/projects/model-memory/evidence/cache-diff-report.md`
- live transcript lines showing bounded ingest progress or replay

## Notes on judgment

- passing the ingest run alone is not enough
- passing prompt capture alone is not enough
- passing retrieval alone is not enough
- the soak is credible only when document ingest, ordinary-turn capture, and
  daily-summary recovery all have visible evidence and later usable reads
- do not mark the ingest live-progress or detached-replay rows passing unless an
  active deep ingest or memory benchmark is actually running during the check
- do not substitute generic shell-task replay proof for ingest replay proof
- if Main cannot resolve the canonical ingest targets or bundled ingest skill
  path during the live check, record that as a blocking runtime/path-resolution
  failure rather than a soak pass
