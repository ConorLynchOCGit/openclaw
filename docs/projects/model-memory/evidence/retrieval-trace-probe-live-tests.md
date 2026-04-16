# Model Memory Retrieval Trace

- Probe: probe-live-tests
- Query: How do I run live tests in OpenClaw?
- Current corpus: true
- Model: openrouter/openai/gpt-5.4-nano
- Timeout ms: 180000
- Seed: 7
- Failure stage: none
- Parse/validation failed after successful provider response: false

## Prompt

```json
{
  "contractName": "retrieval_request_interpretation",
  "contractVersion": "v1",
  "modelId": "openrouter/openai/gpt-5.4-nano",
  "systemPrompt": "Interpret retrieval requests for model-memory.\nReturn only valid JSON for structured retrieval intent.\nReturn exactly one of these JSON shapes and no other top-level shape:\n{\"action\":\"skip\"}\n{\"action\":\"retrieve\",\"request\":{\"goal\":\"...\",\"canonicalClasses\":[\"user\"|\"feedback\"|\"project\"|\"reference\"],\"kinds\":[\"preference\"|\"fact\"|\"rule\"|\"procedure\"|\"reference\"],\"scopeConstraints\":{\"key\":\"value\"},\"subjectHints\":[\"...\"],\"contentHints\":[\"...\"],\"desiredResultCount\":1,\"requestConfidence\":\"weak\"|\"medium\"|\"strong\"}}\nUse skip only when the query clearly cannot benefit from stored memory or reference knowledge.\nFor documentation lookup, workflow guidance, architecture lookup, operator help, or project/reference questions, prefer retrieve.\nDo not return fields like intent, queryText, requestPurpose, scope, or maxResults at the top level.\nUse canonical classes and kinds only when supported by the query.\nPrefer broad filters over invented specifics.",
  "userPrompt": "{\n  \"queryText\": \"How do I run live tests in OpenClaw?\",\n  \"requestPurpose\": \"operator_help\",\n  \"scope\": {},\n  \"maxResults\": 5\n}",
  "responseFormat": "json"
}
```

## Provider Trace

```json
{
  "contractName": "retrieval_request_interpretation",
  "contractVersion": "v1",
  "requestedModelId": "openrouter/openai/gpt-5.4-nano",
  "provider": "openrouter",
  "providerModel": "openai/gpt-5.4-nano",
  "requestUrl": "https://openrouter.ai/api/v1/chat/completions",
  "requestBody": {
    "model": "openai/gpt-5.4-nano",
    "temperature": 0,
    "seed": 7,
    "messages": [
      {
        "role": "system",
        "content": "Interpret retrieval requests for model-memory.\nReturn only valid JSON for structured retrieval intent.\nReturn exactly one of these JSON shapes and no other top-level shape:\n{\"action\":\"skip\"}\n{\"action\":\"retrieve\",\"request\":{\"goal\":\"...\",\"canonicalClasses\":[\"user\"|\"feedback\"|\"project\"|\"reference\"],\"kinds\":[\"preference\"|\"fact\"|\"rule\"|\"procedure\"|\"reference\"],\"scopeConstraints\":{\"key\":\"value\"},\"subjectHints\":[\"...\"],\"contentHints\":[\"...\"],\"desiredResultCount\":1,\"requestConfidence\":\"weak\"|\"medium\"|\"strong\"}}\nUse skip only when the query clearly cannot benefit from stored memory or reference knowledge.\nFor documentation lookup, workflow guidance, architecture lookup, operator help, or project/reference questions, prefer retrieve.\nDo not return fields like intent, queryText, requestPurpose, scope, or maxResults at the top level.\nUse canonical classes and kinds only when supported by the query.\nPrefer broad filters over invented specifics."
      },
      {
        "role": "user",
        "content": "{\n  \"queryText\": \"How do I run live tests in OpenClaw?\",\n  \"requestPurpose\": \"operator_help\",\n  \"scope\": {},\n  \"maxResults\": 5\n}"
      }
    ],
    "response_format": {
      "type": "json_object"
    }
  },
  "httpStatus": 200,
  "responseOk": true,
  "responseBodyReceived": true,
  "responseBodyExcerpt": "{\"id\":\"gen-1776226185-hyIrOZLO9u963fiw8wI5\",\"object\":\"chat.completion\",\"created\":1776226185,\"model\":\"openai/gpt-5.4-nano-20260317\",\"provider\":\"OpenAI\",\"system_fingerprint\":null,\"service_tier\":\"default\",\"choices\":[{\"index\":0,\"logprobs\":null,\"finish_reason\":\"stop\",\"native_finish_reason\":\"completed\",\"message\":{\"role\":\"assistant\",\"content\":\"{\\\"action\\\":\\\"retrieve\\\",\\\"request\\\":{\\\"goal\\\":\\\"Find inst...",
  "resolvedModelId": "openai/gpt-5.4-nano-20260317",
  "outputTextExcerpt": "{\"action\":\"retrieve\",\"request\":{\"goal\":\"Find instructions for running live tests in OpenClaw, including prerequisites, steps/commands, configuration, and how to interpret results.\",\"canonicalClasses\":[\"reference\",\"project\",\"feedback\",\"user\"],\"kinds\":[\"procedure\",\"reference\",\"rule\"],\"scopeConstraints\":{},\"subjectHints\":[\"OpenClaw\",\"live tests\",\"test runner\",\"integration testing\"],\"contentHints\":..."
}
```

## Retrieval

- Action: retrieve
- Selected count: 1
- Matching kinds: 1
- Matching classes: 0
- Active-only: true

## Context

- Attempted: true
- Ordered segments: 22
- Estimated tokens: 17672
- Pruning used: true
- Retrieval pack included: true
- Stable hash: 2abbf71ef1014dabaa9c2e603c2021c9a4b5e87a81fd2c851f32378e92482dc2
- Semi-stable hash: 4475fbf20ce9df1897ee5e589a3fef7164c8fb08c8ea12af227b34ed4b4a5d25
- Volatile hash: 4cf2799b6df0f875c3c3390839805fb1bae6d03942f4e2843cd4dd3852e0773f
