---
summary: "Comprehensive human prompt pack for deployment, workspace-topology, rescue-migration, and model-memory validation on the live stack."
title: "Final Human Validation Prompts"
---

# Final Human Validation Prompts

This is the full human prompt pack for the restored live stack.

Use it when you want one operator-facing script that covers:

- deployment topology
- workspace topology
- rescue migration / restored runtime behavior
- model-memory
- full-stack operator-visible behavior

Before running the browser-facing selector checks in this pack, capture the
current live non-browser proof snapshot first:

```bash
node scripts/operator-ui-proof.mjs --json
```

That helper confirms live gateway/session/build truth, but it does not replace
the browser checks below.

Cross-project canonical inventory:

- [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)
- [Operator UI Validation Results 2026-04](/projects/qa-program/operator-ui-validation-results-2026-04)
- [Authenticated Operator Prompt Harness Spec](/projects/deployment-topology/authenticated-operator-prompt-harness-spec)
- [Authenticated Operator Prompt Harness Proof](/projects/deployment-topology/authenticated-operator-prompt-harness-proof)

## Current April 19, 2026 state

The sanctioned authenticated prompt-execution harness now exists for the
approved Tailnet Control UI path.

That means:

- prompt-driven Main and specialist checks are no longer blocked on missing
  browser execution infrastructure
- the matrix and result ledger already record current pass/fail state for those
  rows
- this prompt pack should now be used for targeted reruns of failing seams or
  for future release revalidation, not as the first place where those checks
  are discovered

## Stage labels

- `pre_commit`: should be checked before a landing commit for the touched slice
- `pre_push`: must be checked against the live deployment before push
- `post_push_monitoring`: can be watched after push
- `memory_soak`: part of the deeper model-memory soak rather than the minimum
  deployment gate

## Deployment and workspace topology

| Surface                        | Prompt or operator action                                                                                                                              | Expected result                                                                       | Evidence to collect        | Failure sign                                                                   | Stage      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ---------- |
| Published readiness            | Open or curl the published `/readyz` route                                                                                                             | Returns a real readiness response, not the control UI shell                           | response body              | HTML shell or unhealthy response without real incident                         | `pre_push` |
| Fresh Main bootstrap           | Start a new Main session with `/new`                                                                                                                   | Normal greeting, no truncation warning, no untrusted-note takeover                    | first turn transcript      | bootstrap truncation warning or malformed startup                              | `pre_push` |
| Session selector labels        | Open the session selector after startup                                                                                                                | Intended visible sessions only, with stable labels                                    | screenshot or written note | raw ids, hidden/internal labels, or unknown junk sessions                      | `pre_push` |
| Session selector hygiene       | Re-open the selector after several tests and cron runs                                                                                                 | Heartbeat/internal/Telegram-only sessions stay hidden                                 | screenshot or written note | hidden/internal sessions visible                                               | `pre_push` |
| Operator-review session labels | Open the session selector after running the daily and weekly operator-review jobs                                                                      | `Daily Operator Review` and `Weekly Operator Review` appear as named sessions         | screenshot or written note | the named operator-review sessions are missing or use raw ids                  | `pre_push` |
| Canonical topology explanation | Ask Main: `Explain the difference between workspace topology and deployment topology in this repo.`                                                    | Clear distinction between authored structure and live rollout/runtime shape           | transcript                 | collapses the two projects or gives a vague answer                             | `pre_push` |
| Canonical project visibility   | Ask Main: `List the current canonical project workspaces currently tracked in this repo and give one sentence on each.`                                | Returns the current canonized project set accurately                                  | transcript                 | misses imported projects or invents archive-only projects                      | `pre_push` |
| Repo/container path adoption   | Ask Main: `Which canonical project workspaces are now present in the live runtime container, and why does that matter operationally?`                  | Explains repo-vs-container adoption truth accurately                                  | transcript                 | stale answer that still claims missing projects in-container                   | `pre_push` |
| Path-resolution behavior       | Ask Main: `When a runbook names docs/** or ops/**, how should runtime path resolution behave now?`                                                     | Explains canonical repo-first read behavior and explicit write locations              | transcript                 | vague answer or workspace-only path guessing                                   | `pre_push` |
| Workspace project alias map    | Ask Main: `Which legacy workspace project paths are now compatibility aliases into canonical docs/projects, and which one remains writable by design?` | Names the alias set and identifies `projects/ops` as the justified writable exception | transcript                 | still describes two competing project registries or misses the `ops` exception | `pre_push` |

## Live progress and replay UI

| Surface                       | Prompt or operator action                                                                                                                                           | Expected result                                                                                 | Evidence to collect                  | Failure sign                                                                | Stage                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ---------------------- |
| Foreground live progress      | In Main, start a deliberately long-running task such as: `Run a bounded document-ingest or benchmark task and keep me posted through normal runtime progress only.` | Chat shows bounded `Queued:` or `Working:` updates while the task is still active               | transcript plus screenshot if useful | chat looks dead until final answer, or only internal tool rows move         | `pre_push`             |
| Lifecycle progress visibility | Start a task likely to cross fallback or lifecycle transitions                                                                                                      | Chat-visible progress shows lifecycle labels rather than silent waiting                         | transcript                           | long pause with no bounded progress labels                                  | `pre_push`             |
| Detached replay on return     | Start a long-running task, navigate away or wait until it detaches/backgrounds, then return to the same Main session and send: `Status?`                            | Next active turn replays bounded current-state status from task or reply-run state              | transcript, screenshot if useful     | no replay, stale replay, or only final completion appears                   | `pre_push`             |
| Completed replay recap        | Let a detached task finish before returning, then send a small follow-up in the same session                                                                        | One bounded `Completed:` recap appears once on return                                           | transcript                           | no recap, repeated duplicate recap, or raw log dump                         | `pre_push`             |
| Replay dedupe                 | After the bounded replay appears, send another small follow-up without new work                                                                                     | The same replay state is not emitted again                                                      | transcript                           | repeated duplicate `Working:` or `Completed:` replay on each turn           | `pre_push`             |
| Session UI vs chat parity     | While a long-running task is active, compare the session UI task/chokepoint view with the chat transcript                                                           | Chat and session UI agree on whether work is queued/running/completed                           | screenshot or operator notes         | session UI shows active work while chat provides no bounded replay/progress | `pre_push`             |
| Non-session work boundary     | Inspect a native cron run or background job that never attached to the current direct chat                                                                          | Operator understands that status is visible through artifacts/session surfaces, not chat replay | operator note                        | expectation mismatch where chat is assumed broken instead of out-of-scope   | `post_push_monitoring` |

## Restored browsing and delegation

| Surface                   | Prompt or operator action                                                                                                                        | Expected result                                                 | Evidence to collect          | Failure sign                                            | Stage      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- | ---------- |
| Browser path              | Ask Main: `Open https://example.com in the browser tool and tell me the page title only.`                                                        | Uses browser path and returns the title only                    | transcript                   | falls back to fetch/search or wrong title               | `pre_push` |
| Brave path                | Ask Main: `Use Brave search to find the official OpenClaw plugin docs page and give me the exact URL.`                                           | Uses Brave-backed search and returns official URL               | transcript                   | wrong provider or wrong URL                             | `pre_push` |
| Firecrawl/fetch path      | Ask Main: `Use Firecrawl or the canonical fetch path to read https://docs.openclaw.ai/tools/plugin and list the first three top-level sections.` | Returns live page sections                                      | transcript                   | empty output or clearly wrong page handling             | `pre_push` |
| Delegated research        | Ask Main: `Compare the OpenClaw plugin docs architecture pages with Mintlify navigation docs and cite sources.`                                  | Delegates cleanly to the research lane without leaked self-chat | transcript and selector note | no delegation when expected, or leaked internal chatter | `pre_push` |
| Web-researcher cold start | Start a fresh delegated research task                                                                                                            | `web-researcher` starts and reads its pack cleanly              | transcript                   | `EACCES`, missing pack, or no usable researcher session | `pre_push` |

## Specialist packs and restored lanes

| Surface                     | Prompt or operator action                                                                                                            | Expected result                                                  | Evidence to collect | Failure sign                                                                    | Stage      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------- | ---------- |
| Builder pack                | Start a bounded builder task: `Builder: propose the smallest implementation slice for a docs-only topology audit.`                   | Builder responds with implementation-oriented structure          | transcript          | generic response or missing specialist stance                                   | `pre_push` |
| Researcher pack             | Start a bounded researcher task: `Researcher: identify the three strongest primary sources for OpenClaw plugin architecture.`        | Researcher behaves as a bounded research lane                    | transcript          | generic response or pack/startup failure                                        | `pre_push` |
| Writer pack                 | Start a bounded writer task: `Writer: draft a concise release-style summary for the latest deployment-topology restoration work.`    | Writer behaves as a writing-focused lane                         | transcript          | generic response or missing specialist context                                  | `pre_push` |
| X-manager boundary          | Ask `x-manager` for a bounded supported-account approval-packaging task                                                              | Respects approval boundaries and account voice posture           | transcript          | no approval boundary or obviously generic behavior                              | `pre_push` |
| Operator-review retrieval   | Ask Main: `Summarize the daily and weekly operator-review lanes and name the canonical docs that define them.`                       | Uses canonized docs, not stale workspace lore                    | transcript          | stale grounding or inability to name docs                                       | `pre_push` |
| GitHub digest understanding | Ask Main: `What repo does the GitHub digest lane track now, and how was the upstream source repaired?`                               | Correctly names `openclaw/openclaw` and the repaired ingest lane | transcript          | legacy-repo answer or repo-only answer with no upstream repair truth            | `pre_push` |
| Skill-vetting lane          | Ask Main: `Summarize the canonical Skill Vetting workflow and explain when an external skill should be install, inspire, or reject.` | Names the repo-owned skills-system lane and the three outcomes   | transcript          | cannot name the workflow, or treats external skills as blind-install candidates | `pre_push` |

## Scheduled operator flows

| Surface                | Prompt or operator action                                                                                          | Expected result                                                                  | Evidence to collect             | Failure sign                                                                    | Stage                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| Daily operator review  | Run the daily prep and inspect the produced artifact                                                               | Fresh artifact exists and grounds on canonical docs and current summary memory   | artifact path and content notes | stale workspace grounding or missing artifact body                              | `pre_push`             |
| Weekly operator review | Run the weekly prep and Telegram preview path                                                                      | Fresh weekly artifact and preview path succeed                                   | artifact path and preview note  | sync/preview failure or stale grounding                                         | `pre_push`             |
| Weekly maintenance     | Run or inspect the weekly maintenance debt guard                                                                   | Output references canonized maintenance inputs                                   | artifact or transcript          | legacy workspace-only input usage                                               | `pre_push`             |
| GitHub digest lane     | Trigger or inspect the live digest lane if safe                                                                    | Digest reflects canonical repo events                                            | output or Telegram note         | still scoped to legacy repos or missing canonical events                        | `post_push_monitoring` |
| Daily memory artifact  | Start a fresh session that should trigger continuity capture, then inspect today’s `memory/YYYY-MM-DD.md` artifact | The canonical daily memory artifact is created or updated by the continuity hook | file path and timestamp note    | no daily artifact update, or the hook is clearly not producing continuity files | `pre_push`             |

## Model-memory pre-soak and capture

| Surface                   | Prompt or operator action                                                                                                                                                    | Expected result                                                             | Evidence to collect                     | Failure sign                                                    | Stage         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------- | ------------- |
| Prompt capture token      | In a fresh Main session, choose a fresh unique token for this run and say: `For the rest of this test phase, remember this exact token for later retrieval: <unique-token>.` | Ordinary-turn capture attempts or records the token                         | transcript, later DB or retrieval proof | no visible capture path later                                   | `memory_soak` |
| Prompt capture preference | In another fresh Main session, say: `For the rest of this test phase, remember that I prefer terse bullet answers.`                                                          | Stable preference capture is attempted or recorded                          | transcript, later retrieval proof       | later formatting shows no recall                                | `memory_soak` |
| Daily summary canary      | Add a unique canary to the finalized daily summary, for example `Deep-soak canary: brass-harbor-9.`                                                                          | Daily summary contains a deterministic retrieval target                     | daily summary file note                 | no stable canary entry                                          | `memory_soak` |
| Document-ingest retrieval | After the deep ingest pass, ask: `What are the exact artifacts produced by the deep document-ingest run, and what does each prove?`                                          | Combines runbook and verification-plan knowledge coherently                 | transcript                              | cannot connect ingest artifacts to verification                 | `memory_soak` |
| Project retrieval         | Ask: `Which imported projects were canonized into docs/projects and why do they matter to runtime behavior?`                                                                 | Retrieves from the populated document substrate                             | transcript                              | misses major rescued projects                                   | `memory_soak` |
| Alias-aware retrieval     | Ask: `If I mention projects/web_stack or projects/channel_identity, what canonical project docs should you actually read now?`                                               | Resolves the legacy workspace names back to the canonical imported projects | transcript                              | treats the legacy names as separate authoritative project trees | `memory_soak` |

## Model-memory delayed retrieval and context behavior

| Surface                  | Prompt or operator action                                                                                                       | Expected result                                                    | Evidence to collect                   | Failure sign                                          | Stage         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------- | ------------- |
| Token retrieval          | In a later fresh Main session, ask: `What exact token did I ask you to remember during this test phase? Return the token only.` | Retrieves the same fresh unique token from this run through memory | transcript, retrieval trace           | cannot retrieve token                                 | `memory_soak` |
| Preference retrieval     | In a later fresh Main session, ask: `How should you format answers for me during this test phase?`                              | Recalls terse-bullet preference                                    | transcript, retrieval trace           | generic answer with no preference recall              | `memory_soak` |
| Daily summary retrieval  | In a later fresh Main session, ask: `What was the deep-soak canary from the finalized daily summary?`                           | Retrieves `brass-harbor-9` through the daily-summary lane          | transcript, daily continuity evidence | no daily-summary recall                               | `memory_soak` |
| Cross-doc synthesis      | Ask: `Explain how Brave, Firecrawl, and browser were restored and how a human should verify each path.`                         | Uses multiple canonized sources coherently                         | transcript, context trace             | wrong restoration story or missing verification steps | `memory_soak` |
| Retrieval stability      | Ask twice: `What is the difference between workspace topology and deployment topology?`                                         | Second answer stays semantically stable                            | two transcripts, cache diff           | material drift on the second answer                   | `memory_soak` |
| Near-duplicate stability | Immediately ask: `How do workspace topology and deployment topology differ operationally?`                                      | Answer stays consistent under phrasing drift                       | transcript, retrieval trace           | cold unrelated answer with no shared grounding        | `memory_soak` |

## Full-stack operator-facing behavior

| Surface                           | Prompt or operator action                                                                                                   | Expected result                                                                                 | Evidence to collect                   | Failure sign                                                                   | Stage           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| Canonical docs grounding          | Ask Main: `For daily and weekly operator review, what sources should grounding come from now?`                              | Names canonical docs under `docs/projects/`, `docs/system/`, and daily summaries where intended | transcript                            | references old `core/ROADMAP.md` or workspace `MEMORY.md` as primary grounding | `pre_push`      |
| Topology rule awareness           | Ask Main: `What is the canonical project root, and what is the canonical global durable-doc root?`                          | Correctly answers `docs/projects/` and `docs/system/`                                           | transcript                            | stale or inconsistent topology answer                                          | `pre_push`      |
| Ingest interruption understanding | Ask Main: `Why did the original deep ingest appear to be interrupted by heartbeat, and what was the real root cause?`       | Explains overlap-versus-cause distinction accurately                                            | transcript                            | says heartbeat simply canceled the run without mentioning rebuild collision    | `pre_push`      |
| Ingest hardening understanding    | Ask Main: `What changed so long-running model-memory ingest is safer now?`                                                  | Mentions serialized rebuilds and truthful interrupted checkpoints                               | transcript                            | vague answer or operator-superstition answer                                   | `pre_push`      |
| Root gate execution explanation   | Ask Main: `How do pnpm check, pnpm test, and pnpm build execute now after the Turbo decomposition work?`                    | Explains explicit Turbo-managed root stages plus package-owned stages accurately                | transcript                            | still describes one opaque root shell chain                                    | `pre_push`      |
| Root gate dry-run operator check  | Run `pnpm exec turbo run check:root:all --filter=openclaw --dry=json` and the same for `test:root:all` and `build:root:all` | Output shows explicit root-stage tasks rather than one monolithic command body                  | saved command output or operator note | dry-run only shows a single opaque root step                                   | `before_commit` |

## Evidence follow-through after prompt execution

After running the memory-soak prompts, collect:

```bash
MODEL_MEMORY_RETRIEVAL_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-retrieval-trace.ts
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-context-trace.ts
MODEL_MEMORY_CONTEXT_PROBE_ID=deep-pass-2026-04 node --import tsx scripts/model-memory-cache-diff.ts
```

Inspect at minimum:

- `checkpoints/model-memory/model-memory-deep-pass-2026-04.json`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.md`
- `docs/projects/model-memory/evidence/deep-document-ingest-2026-04-run.json`
- `docs/projects/model-memory/evidence/retrieval-trace-deep-pass-2026-04.md`
- `docs/projects/model-memory/evidence/context-trace-deep-pass-2026-04.md`
- `docs/projects/model-memory/evidence/cache-diff-report.md`

For the replay and root-gate work, also inspect:

- live Main transcript showing bounded `Queued:` / `Working:` / `Completed:` UI text
- session UI screenshot while a long-running task is active
- `pnpm exec turbo run check:root:all --filter=openclaw --dry=json`
- `pnpm exec turbo run test:root:all --filter=openclaw --dry=json`
- `pnpm exec turbo run build:root:all --filter=openclaw --dry=json`

## Current observed gap notes

- The live gateway payload is now clean for the legacy validation-row leak:
  `node scripts/operator-ui-proof.mjs --json` reports `sessionsList.count = 31`
  and `codexRowCount = 0` after the rebuilt runtime rollout.
- Tailnet-native browser automation is now proven on the sanctioned path:
  - first visit can hit `PAIRING_REQUIRED` for a fresh secure browser device
  - the exact pending Control UI device can be approved through the repo-backed
    CLI path
  - reload of the same browser context reaches authenticated selector state
  - exact proof lives in:
    - [Tailnet Authenticated Browser Proof](/projects/deployment-topology/tailnet-authenticated-browser-proof)
- The replay prompts below remain the right strict checks, but this validation
  run did not prove bounded `Queued:` / `Working:` transcript updates for
  generic shell-backed long-running work. Tool rows and final completion were
  visible; bounded chat progress was not.
- Detached/background replay proved partially rather than ideally: one
  completion recap surfaced back into chat on return, and it did not duplicate
  on the second follow-up.
- Ingest-specific replay is still pending live proof. No deep ingest or memory
  benchmark run was active during this pass, and Main-side ingest validation is
  still blocked by canonical repo path resolution and bundled-skill path
  handling.

## Focused operator closeout checklist

Use this when you want the shortest human pass for the new replay and
root-gate work.

1. Start a deliberately long-running Main task and confirm chat shows bounded
   `Queued:` / `Working:` updates.
2. Leave and return to that session, send `Status?`, and confirm one bounded
   replay appears.
3. Send one more small follow-up and confirm the replay does not duplicate.
4. Compare the active session UI/chokepoint view against chat and confirm they
   agree.
5. Run:
   - `pnpm exec turbo run check:root:all --filter=openclaw --dry=json`
   - `pnpm exec turbo run test:root:all --filter=openclaw --dry=json`
   - `pnpm exec turbo run build:root:all --filter=openclaw --dry=json`
     and confirm each shows explicit root stages rather than one opaque root
     body.
6. During the next deep ingest or memory benchmark run, confirm live progress
   appears in chat and detached replay works after return.

## Use with the narrower checklists

This prompt pack complements:

- [Master Human UI Test Matrix](/projects/qa-program/master-human-ui-test-matrix)
- [Push Validation Human Checklist](/projects/deployment-topology/push-validation-human-checklist)
- [Deep Memory Soak Human Tests](/projects/model-memory/deep-memory-soak-human-tests)
