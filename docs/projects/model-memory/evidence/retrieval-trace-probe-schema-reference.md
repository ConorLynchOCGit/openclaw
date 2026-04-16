# Model Memory Retrieval Trace

- Probe: probe-schema-reference
- Query: Where is the model-memory schema and storage design documented?
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
  "userPrompt": "{\n  \"queryText\": \"Where is the model-memory schema and storage design documented?\",\n  \"requestPurpose\": \"architecture_lookup\",\n  \"scope\": {},\n  \"maxResults\": 5\n}",
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
        "content": "{\n  \"queryText\": \"Where is the model-memory schema and storage design documented?\",\n  \"requestPurpose\": \"architecture_lookup\",\n  \"scope\": {},\n  \"maxResults\": 5\n}"
      }
    ],
    "response_format": {
      "type": "json_object"
    }
  },
  "httpStatus": 200,
  "responseOk": true,
  "responseBodyReceived": true,
  "responseBodyExcerpt": "{\"id\":\"gen-1776226243-UZUEkJEkQMrArckffgD7\",\"object\":\"chat.completion\",\"created\":1776226243,\"model\":\"openai/gpt-5.4-nano-20260317\",\"provider\":\"OpenAI\",\"system_fingerprint\":null,\"service_tier\":\"default\",\"choices\":[{\"index\":0,\"logprobs\":null,\"finish_reason\":\"stop\",\"native_finish_reason\":\"completed\",\"message\":{\"role\":\"assistant\",\"content\":\"{\\\"action\\\":\\\"retrieve\\\",\\\"request\\\":{\\\"goal\\\":\\\"Locate do...",
  "resolvedModelId": "openai/gpt-5.4-nano-20260317",
  "outputTextExcerpt": "{\"action\":\"retrieve\",\"request\":{\"goal\":\"Locate documentation for the model-memory schema and storage design (where it is stored/defined, and how it works).\",\"canonicalClasses\":[\"project\",\"reference\"],\"kinds\":[\"reference\",\"fact\"],\"scopeConstraints\":{},\"subjectHints\":[\"model-memory schema\",\"storage design\",\"documentation location\"],\"contentHints\":[\"schema\",\"storage\",\"design doc\",\"architecture\"],\"..."
}
```

## Retrieval

- Action: retrieve
- Selected count: 1
- Matching kinds: 1
- Matching classes: 1
- Active-only: true

## Context

- Attempted: true
- Ordered segments: 23
- Estimated tokens: 17707
- Pruning used: true
- Retrieval pack included: true
- Stable hash: 2abbf71ef1014dabaa9c2e603c2021c9a4b5e87a81fd2c851f32378e92482dc2
- Semi-stable hash: 63f17978b97b7654e058b46b4b11f87267c33f4aa73899f68903bda8b30b29b8
- Volatile hash: 14d24aed3989d12067f59d6f83bcef389472dd778f43de9eea668a853735cd5a
