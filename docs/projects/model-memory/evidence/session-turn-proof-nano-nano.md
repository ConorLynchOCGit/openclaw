# Session Turn Proof

- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Prompts attempted: 10
- Prompts completed: 10
- Prompts failed: 0
- Captured claims: 2
- Ignored windows: 8
- Rejected windows: 0

The ordinary-turn lane now reuses the shared two-pass ingestion framework.
These artifacts therefore show pass-1 candidate extraction, optional pass-1 repair, pass-2 canonicalization, optional pass-2 repair, plus any write-path collision events that actually occurred.

## Prompt Results

| Prompt                                 | Status    | Windows | Captured | Decisions   | Trace Summary                                                                                                    | Rejects |
| -------------------------------------- | --------- | ------: | -------: | ----------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| prompt-001-ingestion-quality-phase     | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-002-agents-stage-visibility     | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=1            |         |
| prompt-003-bounded-collision-question  | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-004-batched-residual-spec       | completed |       1 |        1 | {"write":1} | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| prompt-005-priority-top10              | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-006-nano-default                | completed |       1 |        1 | {"write":1} | stage:pass_1_candidate=1, stage:pass_1_repair=1, stage:pass_2_canonicalization=1, http_ok=3, ignore=0, capture=1 |         |
| prompt-007-updated-proof-standard      | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-008-remaining-121               | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-009-tool-surface-question       | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |
| prompt-010-tool-and-turn-proof-request | completed |       1 |        0 | {}          | stage:pass_1_candidate=1, http_ok=1, ignore=1                                                                    |         |

## Final Snapshot

- Sources: 10
- Source windows: 10
- Memory objects: 2
- Support items: 2
- Write events: 2
- Lifecycle counts: {"active":2}
