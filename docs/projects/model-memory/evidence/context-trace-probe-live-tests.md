# Model Memory Context Trace

- Probe: probe-live-tests
- Query: How do I run live tests in OpenClaw?
- Model: openrouter/openai/gpt-5.4-nano
- Session: context-trace-probe-live-tests-manual-1776229422183
- Retrieval action: retrieve
- Selected results: 1
- Ordered segments: 6
- Estimated input tokens: 1342
- Pruning used: false
- Stable hash: 0ac8c44de18bc1ce3598f2dbeb938b19d1620c308fa4b32a20a9a5d2905807d3
- Semi-stable hash: ab69944b472cc2b60aa8417a4ae27be9d45ca6d6016ff546ece653616b010456
- Volatile hash: 44c7a994da4c089cf2fbcdd74c22a40c3fe9c2bc028ad4a5ffd2a32150e398d4

## Top Results

- 7d098de1-c437-5857-8e7b-e5b03f742d0a: project/rule primary reasons=class_match,subject_match,rerank_selected

## Segments

| Order | Layer       | Type           | Reason                                                                      | Tokens | Dropped | Artifact                             | Projection | Preview                                                                                                                                      |
| ----- | ----------- | -------------- | --------------------------------------------------------------------------- | -----: | ------- | ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | stable      | bootstrap      | projection:agents-md                                                        |     41 | no      |                                      | agents-md  | ## Generated Memory Rules - No projected agent-visible rules. ## Generated Procedures - Auto-start the OpenClaw remote gateway SSH tunnel... |
| 1     | stable      | bootstrap      | projection:memory-md                                                        |    600 | no      |                                      | memory-md  | # MEMORY.md ## Standing Context - @openclaw/model-memory: version 2026.3.3 is marked as private - /tools/invoke authentication: /tools/in... |
| 2     | stable      | bootstrap      | projection:user-md                                                          |    400 | no      |                                      | user-md    | # USER.md ## Preferences - Apply HSTS at the single TLS termination point (typically the reverse proxy for internet-facing deployments).:... |
| 3     | semi_stable | user_pack      | artifact:user_memory_pack                                                   |    252 | no      | 64ca0a54-eb3b-55c2-8ae3-328af3133b37 |            | # User Memory Pack - Apply HSTS at the single TLS termination point (typically the reverse proxy for internet-facing deployments).: Set S... |
| 4     | semi_stable | retrieval_pack | artifact:retrieval_pack:context-trace-probe-live-tests-manual-1776229422183 |     40 | no      | 79a78e2b-c50e-5eb6-a14c-b47cdce32fd1 |            | Retrieval for operator_help: How do I run live tests in OpenClaw? 1. project/rule {"subject":"Running live tests","neededCapability":"Use... |
| 5     | volatile    | recent_turns   | current_turn_with_recent_history                                            |      9 | no      |                                      |            | user: How do I run live tests in OpenClaw?                                                                                                   |
