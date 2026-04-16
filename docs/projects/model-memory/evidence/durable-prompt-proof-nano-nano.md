# Session Turn Proof

- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Prompts attempted: 10
- Prompts completed: 10
- Prompts failed: 0
- Captured claims: 14
- Ignored windows: 0
- Rejected windows: 0

The ordinary-turn lane now reuses the shared two-pass ingestion framework.
These artifacts therefore show pass-1 candidate extraction, optional pass-1 repair, pass-2 canonicalization, optional pass-2 repair, plus any write-path collision events that actually occurred.

## Prompt Results

| Prompt                                | Status    | Windows | Captured | Decisions    | Trace Summary                                                                                                    | Rejects |
| ------------------------------------- | --------- | ------: | -------: | ------------ | ---------------------------------------------------------------------------------------------------------------- | ------- |
| durable-001-high-level-and-blockers   | completed |       1 |        3 | {"write":3}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-002-landing-gates             | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-003-nano-defaults             | completed |       1 |        2 | {"write":2}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-004-clean-room-boundary       | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-005-safe-worktree-policy      | completed |       1 |        2 | {"write":2}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-006-evidence-discipline       | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-007-shared-two-pass-rule      | completed |       1 |        1 | {"ignore":1} | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-008-active-only-runtime-reads | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-009-operator-surface          | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| durable-010-doc-links                 | completed |       1 |        1 | {"write":1}  | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |

## Final Snapshot

- Sources: 10
- Source windows: 10
- Memory objects: 13
- Support items: 13
- Write events: 14
- Lifecycle counts: {"active":13}
