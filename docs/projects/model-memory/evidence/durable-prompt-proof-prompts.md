# Session Turn Proof Prompts

## 1. High Level Responses And Exact Blockers

- Prompt ID: durable-001-high-level-and-blockers
- Selection reason: Stable response-style and reporting preferences that should behave like durable user guidance.

```text
For work in the openclaw repo, keep explanations high level by default unless I ask for more detail. Use repo-root relative file references in reports. If a required gate fails, report the exact blocker and command instead of guessing.
```

## 2. Landing Gate Policy

- Prompt ID: durable-002-landing-gates
- Selection reason: Persistent repo operating rules with clear durable procedural value.

```text
When changing code on main in openclaw, run pnpm check before landing. If the touched surface affects build output or module boundaries, also run pnpm build. Do not claim a clean landing if required gates are red.
```

## 3. Nano Defaults For Model Memory

- Prompt ID: durable-003-nano-defaults
- Selection reason: Concrete long-lived operating defaults for the active clean-room memory lane.

```text
For model-memory work, use openrouter/openai/gpt-5.4-nano for both pass 1 and pass 2 by default. Do not use openrouter/auto as the default lane. Keep max words per window at 1500 and request timeout at 180000 unless explicitly changed and reported.
```

## 4. Clean Room Boundary

- Prompt ID: durable-004-clean-room-boundary
- Selection reason: Stable project-scope boundary instruction that should persist across turns.

```text
Do not modify legacy extensions/memory-middleware while working on the clean-room model-memory system. Keep new memory work inside extensions/model-memory and src/agents/model-memory files unless there is a justified runtime boundary seam.
```

## 5. Preserve Unrelated Worktree Changes

- Prompt ID: durable-005-safe-worktree-policy
- Selection reason: Durable safety constraints for repository operations.

```text
Preserve unrelated worktree changes. Do not revert unrelated files. Do not use destructive git commands like git reset --hard or git checkout -- unless I explicitly ask.
```

## 6. Evidence And Reporting Discipline

- Prompt ID: durable-006-evidence-discipline
- Selection reason: Persistent procedural guidance about proof artifacts and honesty requirements.

```text
For model-memory proof runs, produce durable JSON and Markdown artifacts under docs/projects/model-memory/evidence. Do not hand-edit evidence artifacts. Report exact commands, counts, and blockers honestly.
```

## 7. Shared Two Pass Requirement

- Prompt ID: durable-007-shared-two-pass-rule
- Selection reason: Architectural constraint for the active prompt-only ingestion lane.

```text
Prompt-only ordinary-turn capture should reuse the same shared two-pass ingestion framework as document ingestion. Do not keep a separate degraded extraction path for prompts.
```

## 8. Active Only Runtime Reads

- Prompt ID: durable-008-active-only-runtime-reads
- Selection reason: Stable runtime policy that should produce durable rule-like memory.

```text
Default runtime reads in model-memory should surface active objects only. Do not leak provisional or conflict_hold objects into ordinary retrieval and context assembly by default.
```

## 9. Operator Surface Constraint

- Prompt ID: durable-009-operator-surface
- Selection reason: Durable operator policy for the newly exposed document-ingestion tool surface.

```text
For document ingestion from OpenClaw, keep the operator surface explicit and constrained. Use operator or admin tool invocation rather than autonomous background ingestion by default.
```

## 10. Full Docs URLs

- Prompt ID: durable-010-doc-links
- Selection reason: Simple long-lived docs-formatting preference that should be easy to capture if the prompt lane is useful.

```text
When I ask for documentation links, return full https://docs.openclaw.ai URLs instead of root-relative paths.
```
