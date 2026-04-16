# Manual UI Smoke Pack

## Ordinary Turn Prompts

### High Level Responses And Exact Blockers

- Prompt ID: durable-001-high-level-and-blockers
- Why durable: It expresses stable response and reporting preferences rather than a one-off task.
- Expected memory kinds: preference, rule
- Expected outcome: At least one active preference or rule about response detail and exact blocker reporting.
- Operator checks:
  - Confirm the prompt turn completed instead of silently ignoring due to transport failure.
  - Check recent captured claims for a preference about high-level explanations or a rule about exact blockers.
  - Verify any resulting write is active and not leaking provisional state into default reads.

```text
For work in the openclaw repo, keep explanations high level by default unless I ask for more detail. Use repo-root relative file references in reports. If a required gate fails, report the exact blocker and command instead of guessing.
```

### Landing Gate Policy

- Prompt ID: durable-002-landing-gates
- Why durable: It is a persistent project operating rule with clear procedural semantics.
- Expected memory kinds: rule, procedure
- Expected outcome: One or more active rules about running pnpm check and pnpm build before landing.
- Operator checks:
  - Look for active claims that mention pnpm check and landing discipline.
  - Confirm the write path did not invent unrelated semantics from the same prompt.

```text
When changing code on main in openclaw, run pnpm check before landing. If the touched surface affects build output or module boundaries, also run pnpm build. Do not claim a clean landing if required gates are red.
```

### Nano Defaults For Model Memory

- Prompt ID: durable-003-nano-defaults
- Why durable: It contains stable operational defaults that should recur across many model-memory turns.
- Expected memory kinds: rule, fact
- Expected outcome: Active memory about nano/nano defaults and the explicit 1500-word and 180000-ms settings.
- Operator checks:
  - Check whether the system captured the nano/nano default rather than ignoring the prompt.
  - Confirm any captured rule stays within the clean-room policy and does not broaden into unrelated model policy.

```text
For model-memory work, use openrouter/openai/gpt-5.4-nano for both pass 1 and pass 2 by default. Do not use openrouter/auto as the default lane. Keep max words per window at 1500 and request timeout at 180000 unless explicitly changed and reported.
```

### Clean Room Boundary

- Prompt ID: durable-004-clean-room-boundary
- Why durable: It defines a long-lived codebase boundary, not a transient task request.
- Expected memory kinds: rule
- Expected outcome: An active rule keeping work in extensions/model-memory and src/agents/model-memory\*.
- Operator checks:
  - Check for a rule-like active object instead of many sibling duplicates.
  - Verify the write path did not produce a memory that authorizes legacy memory-middleware edits.

```text
Do not modify legacy extensions/memory-middleware while working on the clean-room model-memory system. Keep new memory work inside extensions/model-memory and src/agents/model-memory files unless there is a justified runtime boundary seam.
```

### Preserve Unrelated Worktree Changes

- Prompt ID: durable-005-safe-worktree-policy
- Why durable: It is a persistent git-safety policy that should be useful beyond one turn.
- Expected memory kinds: rule
- Expected outcome: An active rule about preserving unrelated worktree changes and avoiding destructive git commands.
- Operator checks:
  - Inspect recent write decisions for an active rule rather than ignore.
  - Check that the resulting memory is specific enough to be useful but not bloated into many near-duplicates.

```text
Preserve unrelated worktree changes. Do not revert unrelated files. Do not use destructive git commands like git reset --hard or git checkout -- unless I explicitly ask.
```

### Active Only Runtime Reads

- Prompt ID: durable-008-active-only-runtime-reads
- Why durable: It states a stable runtime rule for the current architecture.
- Expected memory kinds: rule
- Expected outcome: An active rule that provisional and conflict_hold objects should not appear in default retrieval or context assembly.
- Operator checks:
  - Check for an active rule tied to runtime reads rather than a vague summary.
  - Verify the memory stays object-native and does not collapse lifecycle terms incorrectly.

```text
Default runtime reads in model-memory should surface active objects only. Do not leak provisional or conflict_hold objects into ordinary retrieval and context assembly by default.
```

## Document Ingest UI Smoke

- Tool name: `model_memory_document_ingest`
- Source path: `docs/projects/model-memory/roadmap.md`
- Verification status: `verified_via_tool_smoke`
- Run ID: `model-memory-roadmap-ui-smoke-2`
- Record path: `checkpoints/model-memory/model-memory-roadmap-ui-smoke-2.json`
- Observed status: `completed`
- Observed totals: `{"docsAttempted":1,"docsCompleted":1,"docsFailed":0,"capturedClaimCount":6,"ignoredWindowCount":0,"rejectedWindowCount":0,"writeDecisionCounts":{"write":6},"rejectReasons":[]}`
- Smoke artifact JSON: `docs/projects/model-memory/evidence/roadmap-document-ingestion-tool-smoke-2.json`
- Smoke artifact Markdown: `docs/projects/model-memory/evidence/roadmap-document-ingestion-tool-smoke-2.md`

```json
{
  "sources": ["docs/projects/model-memory/roadmap.md"],
  "runId": "model-memory-roadmap-ui-smoke-2",
  "recordPath": "checkpoints/model-memory/model-memory-roadmap-ui-smoke-2.json",
  "chunkSize": 1,
  "maxConcurrency": 1,
  "resume": true,
  "modelId": "openrouter/openai/gpt-5.4-nano",
  "candidateModelId": "openrouter/openai/gpt-5.4-nano",
  "requestTimeoutMs": 180000,
  "requestSeed": 7,
  "maxWordsPerWindow": 1500
}
```

- Expected operator checks:
  - Verify the OpenClaw tool surface resolves model_memory_document_ingest.
  - Verify the run record is created at the declared checkpoints/model-memory path.
  - Check recent captured claims and write counts after ingesting docs/projects/model-memory/roadmap.md.
  - Confirm the run remains explicit and constrained: one source, chunkSize 1, maxConcurrency 1, nano/nano.
