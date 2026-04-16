# Model Memory Retrieval Trace

- Probe: probe-gateway-protocol
- Query: What should I consult for gateway protocol contracts?
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
  "systemPrompt": "Interpret retrieval requests for model-memory.\nReturn only valid JSON for structured retrieval intent.\nReturn exactly one of these JSON shapes and no other top-level shape:\n{\"action\":\"skip\"}\n{\"action\":\"retrieve\",\"request\":{\"goal\":\"...\",\"canonicalClasses\":[\"user\"|\"feedback\"|\"project\"|\"reference\"],\"kinds\":[\"preference\"|\"fact\"|\"rule\"|\"procedure\"|\"reference\"],\"scopeConstraints\":{\"key\":\"value\"},\"subjectHints\":[\"...\"],\"contentHints\":[\"...\"],\"desiredResultCount\":1,\"requestConfidence\":\"weak\"|\"medium\"|\"strong\"}}\nDo not return fields like intent, queryText, requestPurpose, scope, or maxResults at the top level.\nUse canonical classes and kinds only when supported by the query.\nPrefer broad filters over invented specifics.",
  "userPrompt": "{\n  \"queryText\": \"What should I consult for gateway protocol contracts?\",\n  \"requestPurpose\": \"reference_lookup\",\n  \"scope\": {},\n  \"maxResults\": 5\n}",
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
        "content": "Interpret retrieval requests for model-memory.\nReturn only valid JSON for structured retrieval intent.\nReturn exactly one of these JSON shapes and no other top-level shape:\n{\"action\":\"skip\"}\n{\"action\":\"retrieve\",\"request\":{\"goal\":\"...\",\"canonicalClasses\":[\"user\"|\"feedback\"|\"project\"|\"reference\"],\"kinds\":[\"preference\"|\"fact\"|\"rule\"|\"procedure\"|\"reference\"],\"scopeConstraints\":{\"key\":\"value\"},\"subjectHints\":[\"...\"],\"contentHints\":[\"...\"],\"desiredResultCount\":1,\"requestConfidence\":\"weak\"|\"medium\"|\"strong\"}}\nDo not return fields like intent, queryText, requestPurpose, scope, or maxResults at the top level.\nUse canonical classes and kinds only when supported by the query.\nPrefer broad filters over invented specifics."
      },
      {
        "role": "user",
        "content": "{\n  \"queryText\": \"What should I consult for gateway protocol contracts?\",\n  \"requestPurpose\": \"reference_lookup\",\n  \"scope\": {},\n  \"maxResults\": 5\n}"
      }
    ],
    "response_format": {
      "type": "json_object"
    }
  },
  "httpStatus": 200,
  "responseOk": true,
  "responseBodyReceived": true,
  "responseBodyExcerpt": "{\"id\":\"gen-1776225982-XwjwzohYpgeV6F1x5Foz\",\"object\":\"chat.completion\",\"created\":1776225982,\"model\":\"openai/gpt-5.4-nano-20260317\",\"provider\":\"OpenAI\",\"system_fingerprint\":null,\"service_tier\":\"default\",\"choices\":[{\"index\":0,\"logprobs\":null,\"finish_reason\":\"stop\",\"native_finish_reason\":\"completed\",\"message\":{\"role\":\"assistant\",\"content\":\"{\\\"action\\\":\\\"retrieve\\\",\\\"request\\\":{\\\"goal\\\":\\\"Determine...",
  "resolvedModelId": "openai/gpt-5.4-nano-20260317",
  "outputTextExcerpt": "{\"action\":\"retrieve\",\"request\":{\"goal\":\"Determine what the user should consult for gateway protocol contracts.\",\"canonicalClasses\":[\"reference\"],\"kinds\":[\"reference\"],\"scopeConstraints\":{},\"subjectHints\":[\"gateway protocol contracts\"],\"contentHints\":[\"contracts\",\"gateway protocol\",\"where to consult\"],\"desiredResultCount\":1,\"requestConfidence\":\"weak\"}}"
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
- Ordered segments: 21
- Estimated tokens: 17620
- Pruning used: true
- Retrieval pack included: true
- Stable hash: 2abbf71ef1014dabaa9c2e603c2021c9a4b5e87a81fd2c851f32378e92482dc2
- Semi-stable hash: aaac6916ffdfbf62e4ca7aa641ed9f17f904d70ff5ab97aea3fdb4dbd00f5be7
- Volatile hash: 3a8d60741dfbc5eed7e622bf0b1d5aee44717a7ea2d7a4d2eabd4f754170af72
