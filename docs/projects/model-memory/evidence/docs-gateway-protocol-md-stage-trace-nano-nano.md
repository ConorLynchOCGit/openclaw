# AGENTS.md Stage Trace

- Source: docs/gateway/protocol.md
- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Previous collision model calls: 18
- Current collision model calls: 0
- Collision model call reduction: 18
- Residual batch request count: 0
- Residual batch candidate count: 0
- Zero-candidate skips: 6
- Admitted to residual batch: 0
- Candidate-pruned objects: 3
- Resolved model ids: openai/gpt-5.4-nano-20260317

|  t+ms | Event                | Window                               | Stage                   | Detail                                                                                             |
| ----: | -------------------- | ------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------- |
|   810 | source_windows_ready | all                                  | n/a                     | totalWindows=1                                                                                     |
|   813 | stage_begin          | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_candidate        | model=openrouter/openai/gpt-5.4-nano promptChars=13550                                             |
|  1666 | http_request         | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_candidate        | submitted=true method=POST                                                                         |
|  2151 | http_response        | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_candidate        | status=200 ok=true                                                                                 |
|  6176 | executor_success     | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_candidate        | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=1749                                        |
|  6177 | interpreter_result   | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_candidate        | action=capture objects=6                                                                           |
|  6180 | stage_begin          | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_repair           | model=openrouter/openai/gpt-5.4-nano promptChars=15667                                             |
|  6181 | http_request         | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_repair           | submitted=true method=POST                                                                         |
|  6461 | http_response        | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_repair           | status=200 ok=true                                                                                 |
| 10322 | executor_success     | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_repair           | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=1774                                        |
| 10322 | interpreter_result   | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_1_repair           | action=capture objects=6                                                                           |
| 10324 | stage_begin          | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_2_canonicalization | model=openrouter/openai/gpt-5.4-nano promptChars=8758                                              |
| 10325 | http_request         | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_2_canonicalization | submitted=true method=POST                                                                         |
| 11057 | http_response        | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_2_canonicalization | status=200 ok=true                                                                                 |
| 16704 | executor_success     | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_2_canonicalization | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=3171                                        |
| 16704 | interpreter_result   | ca4a695f-9d9f-5dd5-8692-78159463177e | pass_2_canonicalization | action=capture objects=6                                                                           |
| 17245 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-0 disposition=zero_candidate_skip raw=0 kept=0 pruned=0 object=project/fact    |
| 17543 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-1 disposition=zero_candidate_skip raw=0 kept=0 pruned=0 object=user/preference |
| 17835 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-2 disposition=zero_candidate_skip raw=0 kept=0 pruned=0 object=project/rule    |
| 18126 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-3 disposition=zero_candidate_skip raw=1 kept=0 pruned=1 object=project/rule    |
| 18422 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-4 disposition=zero_candidate_skip raw=2 kept=0 pruned=2 object=project/rule    |
| 18715 | collision_gate       | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | candidate=candidate-5 disposition=zero_candidate_skip raw=1 kept=0 pruned=1 object=project/fact    |
| 19065 | window_result        | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | action=capture objects=6 rejects=0                                                                 |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct                                    |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden             |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden             |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden             |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden             |
| 19065 | write_result         | ca4a695f-9d9f-5dd5-8692-78159463177e | n/a                     | decision=write codes=write_structural_accept,collision_distinct                                    |
| 19427 | final_summary        | all                                  | n/a                     | captured=6 writes=6 objects=6 supports=6                                                           |
