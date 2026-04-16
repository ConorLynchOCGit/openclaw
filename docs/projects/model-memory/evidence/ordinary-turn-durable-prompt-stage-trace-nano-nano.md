# Ordinary Turn Durable Prompt Stage Trace

- Pass 1 model: openrouter/openai/gpt-5.4-nano
- Pass 2 model: openrouter/openai/gpt-5.4-nano
- Request seed: 7
- Request timeout ms: 180000
- Max words per window: 1500
- Window count: 1
- Captured claims: 4
- Window outcomes: {"capture":1}
- Write decisions: {"write":4}
- Persisted objects: 4
- Persisted support items: 4

## Prompt

```text
These are my standing instructions for work in the openclaw repo. Keep explanations high level by default unless I ask for more detail. Before landing changes in the openclaw project, run pnpm check. For model-memory work, do not use openrouter/auto as the default model lane. If a required gate fails, report the exact blocker instead of guessing.
```
