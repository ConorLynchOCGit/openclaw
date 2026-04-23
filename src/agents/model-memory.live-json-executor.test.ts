import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildModelMemoryStrictPreflightRequests,
  ModelMemoryLiveExecutionError,
  OpenAICompatibleLiveJsonExecutor,
} from "./model-memory.live-json-executor.js";
import { createModelMemoryProviderScorecardStore } from "./model-memory.provider-scorecard.js";

function parseRequestBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") {
    throw new TypeError(`Expected JSON string request body, received ${typeof init.body}`);
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("model-memory live json executor", () => {
  it("sends openai-compatible JSON requests and returns the first text choice", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "anthropic/claude-sonnet-4-6",
            choices: [
              {
                message: {
                  content: '{"action":"ignore"}',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    const result = await executor.execute({
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "openrouter/anthropic/claude-sonnet-4-6",
      },
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
    });

    expect(result).toEqual({
      outputText: '{"action":"ignore"}',
      resolvedModelId: "anthropic/claude-sonnet-4-6",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json",
      "HTTP-Referer": "https://openclaw.ai",
      "X-Title": "OpenClaw model-memory",
    });
    expect(parseRequestBody(init)).toMatchObject({
      model: "anthropic/claude-sonnet-4-6",
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    });
    expect(init.signal).toBeDefined();
  });

  it("supports openai-codex refs through the same boundary", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-5.4",
            choices: [
              {
                message: {
                  content: [{ type: "text", text: '{"action":"capture","objects":[]}' }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex:default",
      }),
    });

    const result = await executor.execute({
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "openai-codex/gpt-5.4",
      },
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
    });

    expect(result.outputText).toBe('{"action":"capture","objects":[]}');
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [url] = call as unknown as [string];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("sends strict json_schema and require_parameters when requested for openrouter", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.4-nano",
            choices: [
              {
                message: {
                  content:
                    '{"schema_version":"capture_routing.v1","event_id":"evt-001","routing_decisions":[]}',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    await executor.execute({
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "mmv2-capture-routing-v1",
        modelId: "openrouter/openai/gpt-5.4-nano",
      },
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "capture_routing_batch",
          strict: true,
          schema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
            },
            required: ["schema_version"],
            additionalProperties: false,
          },
        },
        provider: {
          requireParameters: true,
        },
      },
    });

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call as unknown as [string, RequestInit];
    expect(parseRequestBody(init)).toMatchObject({
      model: "openai/gpt-5.4-nano",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "capture_routing_batch",
          strict: true,
          schema: {
            type: "object",
            properties: {
              schema_version: { type: "string" },
            },
            required: ["schema_version"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
    });
  });

  it("accepts request timeout from the environment when no explicit override is provided", async () => {
    const originalTimeout = process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS;
    process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS = "345000";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    try {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              choices: [
                {
                  message: {
                    content: '{"action":"ignore"}',
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      );
      const executor = new OpenAICompatibleLiveJsonExecutor({
        fetchImpl,
        resolveAuth: async () => ({
          apiKey: "sk-test",
          mode: "api-key",
          source: "test",
        }),
      });

      await executor.execute({
        contract: {
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "openrouter/google/gemini-2.5-flash-lite",
        },
        systemPrompt: "raw-system-secret",
        userPrompt: "raw-user-secret",
        responseFormat: "json",
      });

      expect(timeoutSpy).toHaveBeenCalledWith(345000);
    } finally {
      timeoutSpy.mockRestore();
      if (originalTimeout === undefined) {
        delete process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS;
      } else {
        process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it("accepts request seed from the environment when present", async () => {
    const originalSeed = process.env.MODEL_MEMORY_REQUEST_SEED;
    process.env.MODEL_MEMORY_REQUEST_SEED = "7";

    try {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "gpt-5-mini",
              choices: [
                {
                  message: {
                    content: '{"action":"ignore"}',
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      );
      const executor = new OpenAICompatibleLiveJsonExecutor({
        fetchImpl,
        resolveAuth: async () => ({
          apiKey: "sk-test",
          mode: "api-key",
          source: "test",
        }),
      });

      await executor.execute({
        contract: {
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "openrouter/openai/gpt-5-mini",
        },
        systemPrompt: "raw-system-secret",
        userPrompt: "raw-user-secret",
        responseFormat: "json",
      });

      const call = fetchImpl.mock.calls[0];
      expect(call).toBeDefined();
      const [, init] = call as unknown as [string, RequestInit];
      expect(parseRequestBody(init)).toMatchObject({
        model: "openai/gpt-5-mini",
        seed: 7,
      });
      expect(executor.getRequestSeed()).toBe(7);
    } finally {
      if (originalSeed === undefined) {
        delete process.env.MODEL_MEMORY_REQUEST_SEED;
      } else {
        process.env.MODEL_MEMORY_REQUEST_SEED = originalSeed;
      }
    }
  });

  it("prefers an explicit request seed over the environment", async () => {
    const originalSeed = process.env.MODEL_MEMORY_REQUEST_SEED;
    process.env.MODEL_MEMORY_REQUEST_SEED = "7";

    try {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "gpt-5.4-nano-20260317",
              choices: [
                {
                  message: {
                    content: '{"action":"ignore"}',
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      );
      const executor = new OpenAICompatibleLiveJsonExecutor({
        fetchImpl,
        requestSeed: 19,
        resolveAuth: async () => ({
          apiKey: "sk-test",
          mode: "api-key",
          source: "test",
        }),
      });

      await executor.execute({
        contract: {
          contractName: "semantic_extraction",
          contractVersion: "v1",
          modelId: "openrouter/openai/gpt-5.4-nano",
        },
        systemPrompt: "raw-system-secret",
        userPrompt: "raw-user-secret",
        responseFormat: "json",
      });

      const call = fetchImpl.mock.calls[0];
      expect(call).toBeDefined();
      const [, init] = call as unknown as [string, RequestInit];
      expect(parseRequestBody(init)).toMatchObject({
        model: "openai/gpt-5.4-nano",
        seed: 19,
      });
      expect(executor.getRequestSeed()).toBe(19);
    } finally {
      if (originalSeed === undefined) {
        delete process.env.MODEL_MEMORY_REQUEST_SEED;
      } else {
        process.env.MODEL_MEMORY_REQUEST_SEED = originalSeed;
      }
    }
  });

  it("surfaces non-ok provider responses with compact trace details", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Provider returned error",
              metadata: {
                raw: JSON.stringify({
                  error: {
                    message: "response_format json_object is not supported for this request",
                  },
                }),
              },
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    await expect(
      executor.execute({
        contract: {
          contractName: "retrieval_request",
          contractVersion: "v1",
          modelId: "openrouter/openai/gpt-5.4-nano",
        },
        systemPrompt: "raw-system-secret",
        userPrompt: "raw-user-secret",
        responseFormat: "json",
      }),
    ).rejects.toMatchObject({
      name: "ModelMemoryLiveExecutionError",
      trace: {
        contractName: "retrieval_request",
        contractVersion: "v1",
        requestedModelId: "openrouter/openai/gpt-5.4-nano",
        provider: "openrouter",
        providerModel: "openai/gpt-5.4-nano",
        httpStatus: 400,
        responseOk: false,
        responseBodyReceived: true,
        failureStage: "request_time",
        errorMessage: "response_format json_object is not supported for this request",
      },
    });
  });

  it("preflights provider health with a tiny bounded request", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.4-nano",
            choices: [
              {
                message: {
                  content: '{"ok":true}',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    const result = await executor.preflightModel("openrouter/openai/gpt-5.4-nano");

    expect(result).toMatchObject({
      ok: true,
      provider: "openrouter",
      providerModel: "openai/gpt-5.4-nano",
      httpStatus: 200,
    });
    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call as unknown as [string, RequestInit];
    expect(parseRequestBody(init)).toMatchObject({
      model: "openai/gpt-5.4-nano",
      temperature: 0,
      max_tokens: 16,
      response_format: { type: "json_object" },
    });
  });

  it("preflights the actual strict schema contract instead of generic json_object", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.4-nano",
            choices: [{ message: { content: '{"schema_version":"capture_routing.v1"}' } }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    const result = await executor.preflightContract({
      contract: {
        contractName: "capture_routing",
        contractVersion: "mmv2-capture-routing-v1",
        modelId: "openrouter/openai/gpt-5.4-nano",
      },
      systemPrompt: "system prompt must not be sent during preflight",
      userPrompt: "user prompt must not be sent during preflight",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "capture_routing_batch",
          strict: true,
          schema: { type: "object", properties: {}, additionalProperties: false },
        },
        provider: { requireParameters: true },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      contractName: "capture_routing",
      contractVersion: "mmv2-capture-routing-v1",
      schemaName: "capture_routing_batch",
      strictSchema: true,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.stringify(parseRequestBody(init))).not.toContain("user prompt must not be sent");
    expect(parseRequestBody(init)).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "capture_routing_batch",
          strict: true,
        },
      },
      provider: {
        require_parameters: true,
      },
    });
  });

  it("classifies unsupported strict-schema preflight as provider_json_boundary and records a scorecard", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "response_format json_schema is not supported" } }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const scorecardStore = createModelMemoryProviderScorecardStore({
      baseDir: await mkdtemp(path.join(tmpdir(), "openclaw-scorecard-")),
    });
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      scorecardStore,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    const result = await executor.preflightContract(
      buildModelMemoryStrictPreflightRequests("openrouter/openai/gpt-5.4-nano")[0],
    );
    const events = await scorecardStore.readEvents();

    expect(result).toMatchObject({
      ok: false,
      failureClass: "provider_json_boundary",
      schemaName: "capture_routing_batch",
      strictSchema: true,
    });
    expect(events[0]).toMatchObject({
      status: "failed",
      failureClass: "provider_json_boundary",
      schemaName: "capture_routing_batch",
      rawContentPersisted: false,
      containsPromptText: false,
      containsTranscript: false,
      containsRawToolLog: false,
    });
    expect(JSON.stringify(events[0])).not.toContain("preflight-only");
  });

  it("sends prompt-cache key metadata and returns cache usage when provided", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-5.4-mini",
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 50,
              prompt_tokens_details: { cached_tokens: 800 },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex:default",
      }),
    });

    const result = await executor.execute({
      contract: {
        contractName: "mmv2-extraction",
        contractVersion: "v1",
        modelId: "openai-codex/gpt-5.4-mini",
      },
      systemPrompt: "stable static prefix",
      userPrompt: "dynamic source tail",
      responseFormat: "json",
      responseOptions: {
        promptCache: {
          key: "mmv2-extraction-v1-prefix",
          retention: "short",
        },
      },
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(parseRequestBody(init)).toMatchObject({
      prompt_cache_key: "mmv2-extraction-v1-prefix",
      prompt_cache_retention: "short",
    });
    expect(result.usage).toMatchObject({
      promptTokens: 1000,
      outputTokens: 50,
      cachedInputTokens: 800,
      promptCacheKey: "mmv2-extraction-v1-prefix",
    });
  });

  it("sends low-latency reasoning, verbosity, and service-tier options when requested", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-5.4-mini",
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex:default",
      }),
    });

    await executor.execute({
      contract: {
        contractName: "mmv2-benchmark",
        contractVersion: "v1",
        modelId: "openai-codex/gpt-5.4-mini",
      },
      systemPrompt: "stable static prefix",
      userPrompt: "dynamic source tail",
      responseFormat: "json",
      responseOptions: {
        reasoningEffort: "none",
        verbosity: "low",
        serviceTier: "priority",
      },
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(parseRequestBody(init)).toMatchObject({
      reasoning_effort: "none",
      verbosity: "low",
      service_tier: "priority",
    });
  });

  it("records token and cache metrics in the provider scorecard for model calls", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-5.4-mini",
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 50,
              prompt_tokens_details: { cached_tokens: 800 },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const scorecardStore = createModelMemoryProviderScorecardStore({
      baseDir: await mkdtemp(path.join(tmpdir(), "openclaw-scorecard-")),
    });
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      scorecardStore,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex:default",
      }),
    });

    await executor.execute({
      contract: {
        contractName: "semantic_extraction",
        contractVersion: "mmv2-extraction-v1",
        modelId: "openai-codex/gpt-5.4-mini",
      },
      systemPrompt: "stable static prefix",
      userPrompt: "dynamic source tail",
      responseFormat: "json",
      responseOptions: {
        promptCache: {
          key: "mmv2-extraction-v1-prefix",
          retention: "short",
        },
      },
    });
    const summary = await scorecardStore.buildSummary();

    expect(summary.totalCalls).toBe(1);
    expect(summary.byProviderModelContract[0]).toMatchObject({
      provider: "openai-codex",
      providerModel: "gpt-5.4-mini",
      calls: 1,
      successes: 1,
      promptTokens: 1000,
      outputTokens: 50,
      cachedTokens: 800,
      cacheHitRate: 1,
    });
    expect(JSON.stringify(await scorecardStore.readEvents())).not.toContain("dynamic source tail");
  });

  it("preflights provider credit failures without starting extraction work", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    const result = await executor.preflightModel("openrouter/openai/gpt-5.4-nano");

    expect(result).toMatchObject({
      ok: false,
      provider: "openrouter",
      providerModel: "openai/gpt-5.4-nano",
      httpStatus: 402,
      failureStage: "request_time",
      errorMessage: "Insufficient credits",
    });
  });

  it("classifies non-json provider success bodies as provider_parse failures", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not-json-at-all", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    const traces: Array<Record<string, unknown>> = [];
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      onTrace: (trace) => traces.push(trace),
      resolveAuth: async () => ({
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    let thrown: unknown;
    try {
      await executor.execute({
        contract: {
          contractName: "retrieval_request",
          contractVersion: "v1",
          modelId: "openrouter/openai/gpt-5.4-nano",
        },
        systemPrompt: "raw-system-secret",
        userPrompt: "raw-user-secret",
        responseFormat: "json",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ModelMemoryLiveExecutionError);
    expect((thrown as ModelMemoryLiveExecutionError).trace).toMatchObject({
      httpStatus: 200,
      responseOk: true,
      responseBodyReceived: true,
      failureStage: "provider_parse",
    });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      responseOk: true,
      failureStage: "provider_parse",
    });
    expect(JSON.stringify(traces[0]?.requestBody)).not.toContain("raw-system-secret");
    expect(JSON.stringify(traces[0]?.requestBody)).not.toContain("raw-user-secret");
    expect(traces[0]?.requestBody).toMatchObject({
      messages: [
        { role: "system", content_chars: "raw-system-secret".length },
        { role: "user", content_chars: "raw-user-secret".length },
      ],
    });
  });
});
