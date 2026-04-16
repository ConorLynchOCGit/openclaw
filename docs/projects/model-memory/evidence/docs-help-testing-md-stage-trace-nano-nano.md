# AGENTS.md Stage Trace

- Source: docs/help/testing.md
- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Previous collision model calls: 18
- Current collision model calls: 1
- Collision model call reduction: 17
- Residual batch request count: 1
- Residual batch candidate count: 1
- Zero-candidate skips: 6
- Admitted to residual batch: 1
- Candidate-pruned objects: 5
- Resolved model ids: openai/gpt-5.4-nano-20260317

|  t+ms | Event                | Window                               | Stage                             | Detail                                                                                          |
| ----: | -------------------- | ------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------- |
|   748 | source_windows_ready | all                                  | n/a                               | totalWindows=2                                                                                  |
|   754 | stage_begin          | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_candidate                  | model=openrouter/openai/gpt-5.4-nano promptChars=18644                                          |
|  1780 | http_request         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_candidate                  | submitted=true method=POST                                                                      |
|  2142 | http_response        | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_candidate                  | status=200 ok=true                                                                              |
|  8585 | executor_success     | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_candidate                  | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=2942                                     |
|  8587 | interpreter_result   | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_candidate                  | action=capture objects=10                                                                       |
|  8590 | stage_begin          | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_repair                     | model=openrouter/openai/gpt-5.4-nano promptChars=22382                                          |
|  8591 | http_request         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_repair                     | submitted=true method=POST                                                                      |
|  8994 | http_response        | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_repair                     | status=200 ok=true                                                                              |
| 15177 | executor_success     | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_repair                     | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=2827                                     |
| 15178 | interpreter_result   | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_1_repair                     | action=capture objects=9                                                                        |
| 15180 | stage_begin          | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_2_canonicalization           | model=openrouter/openai/gpt-5.4-nano promptChars=10977                                          |
| 15180 | http_request         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_2_canonicalization           | submitted=true method=POST                                                                      |
| 15441 | http_response        | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_2_canonicalization           | status=200 ok=true                                                                              |
| 29462 | executor_success     | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_2_canonicalization           | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=5440                                     |
| 29462 | interpreter_result   | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | pass_2_canonicalization           | action=capture objects=9                                                                        |
| 29471 | stage_begin          | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_candidate                  | model=openrouter/openai/gpt-5.4-nano promptChars=11006                                          |
| 29472 | http_request         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_candidate                  | submitted=true method=POST                                                                      |
| 29771 | http_response        | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_candidate                  | status=200 ok=true                                                                              |
| 38694 | executor_success     | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_candidate                  | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=3540                                     |
| 38695 | interpreter_result   | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_candidate                  | action=capture objects=6                                                                        |
| 38697 | stage_begin          | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_repair                     | model=openrouter/openai/gpt-5.4-nano promptChars=16399                                          |
| 38700 | http_request         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_repair                     | submitted=true method=POST                                                                      |
| 38967 | http_response        | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_repair                     | status=200 ok=true                                                                              |
| 43201 | executor_success     | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_repair                     | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=2169                                     |
| 43201 | interpreter_result   | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_1_repair                     | action=capture objects=6                                                                        |
| 43202 | stage_begin          | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_2_canonicalization           | model=openrouter/openai/gpt-5.4-nano promptChars=8725                                           |
| 43203 | http_request         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_2_canonicalization           | submitted=true method=POST                                                                      |
| 43403 | http_response        | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_2_canonicalization           | status=200 ok=true                                                                              |
| 50277 | executor_success     | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_2_canonicalization           | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=3406                                     |
| 50277 | interpreter_result   | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | pass_2_canonicalization           | action=capture objects=6                                                                        |
| 51360 | collision_gate       | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | candidate=candidate-0 disposition=zero_candidate_skip raw=0 kept=0 pruned=0 object=project/fact |
| 51662 | collision_gate       | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | candidate=candidate-1 disposition=zero_candidate_skip raw=0 kept=0 pruned=0 object=project/rule |
| 51960 | collision_gate       | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | candidate=candidate-2 disposition=zero_candidate_skip raw=1 kept=0 pruned=1 object=project/rule |
| 52255 | collision_gate       | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | candidate=candidate-3 disposition=zero_candidate_skip raw=2 kept=0 pruned=2 object=project/rule |
| 52548 | collision_gate       | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | candidate=candidate-4 disposition=admitted_to_batch raw=3 kept=1 pruned=2 object=project/rule   |
| 52727 | collision_gate       | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | candidate=candidate-6 disposition=zero_candidate_skip raw=1 kept=0 pruned=1 object=project/fact |
| 53023 | collision_gate       | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | candidate=candidate-7 disposition=zero_candidate_skip raw=3 kept=0 pruned=3 object=project/rule |
| 53321 | collision_begin      | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | write_path_collision_adjudication | requests=1 candidates=1                                                                         |
| 53323 | http_request         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | write_path_collision_adjudication | submitted=true method=POST                                                                      |
| 53635 | http_response        | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | write_path_collision_adjudication | status=200 ok=true                                                                              |
| 53927 | executor_success     | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | write_path_collision_adjudication | resolvedModel=openai/gpt-5.4-nano-20260317 outputChars=67                                       |
| 53928 | collision_result     | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | write_path_collision_adjudication | candidate=candidate-4 relation=distinct                                                         |
| 54282 | window_result        | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | action=capture objects=5 rejects=0                                                              |
| 54282 | window_result        | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | action=capture objects=3 rejects=0                                                              |
| 54282 | write_result         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden          |
| 54282 | write_result         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden          |
| 54282 | write_result         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden          |
| 54282 | write_result         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden          |
| 54282 | write_result         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | decision=ignore codes=non_durable_ignored                                                       |
| 54282 | write_result         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | decision=write codes=write_structural_accept,collision_distinct                                 |
| 54282 | write_result         | ed9c548e-58e0-59df-ab0e-0c353c7e22d3 | n/a                               | decision=write codes=write_structural_accept,collision_distinct                                 |
| 54282 | write_result         | bb74a609-75e6-58fb-949b-e7c18ccfc6dd | n/a                               | decision=write codes=write_structural_accept,collision_distinct,review_mode_overridden          |
| 54758 | final_summary        | all                                  | n/a                               | captured=8 writes=8 objects=7 supports=7                                                        |
