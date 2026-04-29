import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
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

function buildCodexSseSuccessResponse(params: {
  model: string;
  outputText: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
}): Response {
  const responseId = "resp_test_codex";
  const body = [
    `event: response.created\ndata: ${JSON.stringify({
      type: "response.created",
      response: {
        id: responseId,
        object: "response",
        model: params.model,
        status: "in_progress",
      },
    })}\n`,
    `event: response.output_text.delta\ndata: ${JSON.stringify({
      type: "response.output_text.delta",
      delta: params.outputText,
    })}\n`,
    `event: response.completed\ndata: ${JSON.stringify({
      type: "response.completed",
      response: {
        id: responseId,
        object: "response",
        model: params.model,
        status: "completed",
        output_text: params.outputText,
        ...(params.usage ? { usage: params.usage } : {}),
      },
    })}\n`,
  ].join("\n");
  return new Response(body, { status: 200 });
}

function buildCodexSseDeltaOnlyResponse(params: { model: string; deltas: string[] }): Response {
  const responseId = "resp_test_codex_delta_only";
  const body = [
    `event: response.created\ndata: ${JSON.stringify({
      type: "response.created",
      response: {
        id: responseId,
        object: "response",
        model: params.model,
        status: "in_progress",
      },
    })}\n`,
    ...params.deltas.map(
      (delta) =>
        `event: response.output_text.delta\ndata: ${JSON.stringify({
          type: "response.output_text.delta",
          delta,
        })}\n`,
    ),
    `event: response.completed\ndata: ${JSON.stringify({
      type: "response.completed",
      response: {
        id: responseId,
        object: "response",
        model: params.model,
        status: "completed",
      },
    })}\n`,
  ].join("\n");
  return new Response(body, { status: 200 });
}

const codexResponsesConfig = {
  models: {
    providers: {
      "openai-codex": {
        baseUrl: "https://chatgpt.com/backend-api/v1",
        api: "openai-codex-responses",
        models: [],
      },
    },
  },
} satisfies OpenClawConfig;

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

  it("routes openai-codex refs through the configured responses transport", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4",
        outputText: '{"action":"capture","objects":[]}',
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
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
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer oauth-test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("originator")).toBe("openclaw");
    expect(headers.get("user-agent")).toMatch(/^openclaw\//);
    expect(parseRequestBody(init)).toMatchObject({
      model: "gpt-5.4",
      instructions: "system",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "JSON response required.\n\nuser",
            },
          ],
        },
      ],
      text: {
        format: { type: "json_object" },
      },
      store: false,
      stream: true,
    });
    expect(parseRequestBody(init)).not.toHaveProperty("max_output_tokens");
  });

  it("preserves leading spaces from openai-codex response deltas", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseDeltaOnlyResponse({
        model: "gpt-5.4",
        deltas: [
          '{"title":"Verify',
          " model",
          " route",
          " isolation",
          '","purpose":"Check',
          " that",
          " model",
          " routes",
          " stay",
          " isolated",
          '."}',
        ],
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex:default",
      }),
    });

    const result = await executor.execute({
      contract: {
        contractName: "candidate_route_spacing_probe",
        contractVersion: "v1",
        modelId: "openai-codex/gpt-5.4",
      },
      systemPrompt: "Return JSON with normal word spacing.",
      userPrompt: "Return a title and purpose.",
      responseFormat: "json",
    });

    expect(result.outputText).toBe(
      '{"title":"Verify model route isolation","purpose":"Check that model routes stay isolated."}',
    );
  });

  it("preflights openai-codex through the configured responses route and records the auth lane", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4-mini",
        outputText: '{"ok":true}',
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex",
        profileId: "default",
      }),
    });

    const result = await executor.preflightModel("openai-codex/gpt-5.4-mini");

    expect(result).toMatchObject({
      ok: true,
      provider: "openai-codex",
      providerModel: "gpt-5.4-mini",
      providerApi: "openai-codex-responses",
      requestUrl: "https://chatgpt.com/backend-api/codex/responses",
      responseFormatMode: "json_object",
      authSource: "profile:openai-codex",
      authMode: "oauth",
      authProfileId: "default",
      authLane: "profile:openai-codex:oauth:default",
    });
  });

  it("prefers the live agent models.json codex route when runtime config lacks the provider entry", async () => {
    const agentDir = await mkdtemp(path.join(tmpdir(), "openclaw-codex-route-"));
    await writeFile(
      path.join(agentDir, "models.json"),
      JSON.stringify(
        {
          providers: {
            "openai-codex": {
              baseUrl: "https://chatgpt.com/backend-api/v1",
              api: "openai-codex-responses",
              models: [],
            },
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4-mini",
        outputText: '{"ok":true}',
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: {},
      agentDir,
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex",
        profileId: "default",
      }),
    });

    const result = await executor.preflightModel("openai-codex/gpt-5.4-mini");

    expect(result).toMatchObject({
      ok: true,
      provider: "openai-codex",
      providerModel: "gpt-5.4-mini",
      providerApi: "openai-codex-responses",
      requestUrl: "https://chatgpt.com/backend-api/codex/responses",
      authLane: "profile:openai-codex:oauth:default",
    });
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
      authSource: "test",
      authMode: "api-key",
      authLane: "test:api-key",
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
      authSource: "test",
      authMode: "api-key",
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
      authLane: "test:api-key",
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

  it("lists provider model ids without persisting prompts or secrets", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "openai/gpt-5.4-nano",
                supported_parameters: ["max_tokens", "response_format", "structured_outputs"],
                context_length: 400000,
                top_provider: { max_completion_tokens: 128000 },
              },
              { id: "openai/gpt-5.4-mini", supported_parameters: ["max_tokens"] },
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

    const result = await executor.listProviderModels("openrouter");

    expect(result).toMatchObject({
      ok: true,
      provider: "openrouter",
      authSource: "test",
      authMode: "api-key",
      httpStatus: 200,
      modelIds: ["openai/gpt-5.4-mini", "openai/gpt-5.4-nano"],
    });
    expect(result.models?.find((model) => model.id === "openai/gpt-5.4-nano")).toMatchObject({
      supportedParameters: ["max_tokens", "response_format", "structured_outputs"],
      contextLength: 400000,
      maxCompletionTokens: 128000,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(init.method).toBe("GET");
    expect(JSON.stringify(result)).not.toContain("sk-test");
  });

  it("omits unsupported OpenRouter extras when require_parameters is enabled", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.4-nano",
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
        apiKey: "sk-test",
        mode: "api-key",
        source: "test",
      }),
    });

    await executor.execute({
      contract: {
        contractName: "benchmark",
        contractVersion: "v1",
        modelId: "openrouter/openai/gpt-5.4-nano",
      },
      systemPrompt: "stable static prefix",
      userPrompt: "dynamic tail",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "tiny",
          strict: true,
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
        provider: { requireParameters: true },
        promptCache: { key: "must-not-send-to-openrouter-require-parameters" },
        reasoningEffort: "none",
        verbosity: "low",
        serviceTier: "priority",
      },
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = parseRequestBody(init);
    expect(body).toMatchObject({
      model: "openai/gpt-5.4-nano",
      max_tokens: 4096,
      reasoning: {
        effort: "none",
        exclude: true,
      },
      response_format: {
        type: "json_schema",
      },
      provider: {
        require_parameters: true,
      },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("verbosity");
    expect(body).not.toHaveProperty("service_tier");
    expect(body).not.toHaveProperty("prompt_cache_key");
  });

  it("sends prompt-cache key metadata and returns cache usage when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4-mini",
        outputText: '{"ok":true}',
        usage: {
          input_tokens: 1000,
          output_tokens: 50,
          input_tokens_details: { cached_tokens: 800 },
        },
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
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
    expect(parseRequestBody(init)).toMatchObject({ store: false, stream: true });
    expect(parseRequestBody(init)).not.toHaveProperty("prompt_cache_key");
    expect(parseRequestBody(init)).not.toHaveProperty("prompt_cache_retention");
    expect(result.usage).toMatchObject({
      promptTokens: 1000,
      outputTokens: 50,
      cachedInputTokens: 800,
      promptCacheKey: "mmv2-extraction-v1-prefix",
    });
  });

  it("sends low-latency reasoning, verbosity, and service-tier options when requested", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4-mini",
        outputText: '{"ok":true}',
      }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
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
      text: {
        format: { type: "json_object" },
      },
      store: false,
      stream: true,
    });
    expect(parseRequestBody(init)).not.toHaveProperty("reasoning");
    expect(parseRequestBody(init)).not.toHaveProperty("service_tier");
  });

  it("records token and cache metrics in the provider scorecard for model calls", async () => {
    const fetchImpl = vi.fn(async () =>
      buildCodexSseSuccessResponse({
        model: "gpt-5.4-mini",
        outputText: '{"ok":true}',
        usage: {
          input_tokens: 1000,
          output_tokens: 50,
          input_tokens_details: { cached_tokens: 800 },
        },
      }),
    );
    const scorecardStore = createModelMemoryProviderScorecardStore({
      baseDir: await mkdtemp(path.join(tmpdir(), "openclaw-scorecard-")),
    });
    const executor = new OpenAICompatibleLiveJsonExecutor({
      fetchImpl,
      config: codexResponsesConfig,
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
      authLane: "test:api-key",
      httpStatus: 402,
      failureStage: "request_time",
      errorMessage: "Insufficient credits",
    });
  });

  it("classifies 429 mini preflight quota failures as provider_credit route failures", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "You exceeded your current quota." } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex",
        profileId: "default",
      }),
    });

    const result = await executor.preflightModel("openai-codex/gpt-5.4-mini");

    expect(result).toMatchObject({
      ok: false,
      provider: "openai-codex",
      providerModel: "gpt-5.4-mini",
      providerApi: "openai-codex-responses",
      failureClass: "provider_credit",
      failureStage: "request_time",
      authLane: "profile:openai-codex:oauth:default",
      httpStatus: 429,
    });
  });

  it("classifies 401 strict mini route failures as provider_connection", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "OAuth token invalid" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: codexResponsesConfig,
      fetchImpl,
      resolveAuth: async () => ({
        apiKey: "oauth-test",
        mode: "oauth",
        source: "profile:openai-codex",
        profileId: "default",
      }),
    });

    const result = await executor.preflightContract({
      contract: {
        contractName: "capture_routing",
        contractVersion: "mmv2-capture-routing-v1",
        modelId: "openai-codex/gpt-5.4-mini",
      },
      systemPrompt: "system",
      userPrompt: "user",
      responseFormat: "json",
      responseOptions: {
        transport: {
          type: "json_schema",
          name: "capture_routing_batch",
          strict: true,
          schema: { type: "object", properties: {}, additionalProperties: false },
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      provider: "openai-codex",
      providerModel: "gpt-5.4-mini",
      providerApi: "openai-codex-responses",
      failureClass: "provider_connection",
      failureStage: "request_time",
      authLane: "profile:openai-codex:oauth:default",
      httpStatus: 401,
      schemaName: "capture_routing_batch",
      strictSchema: true,
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
      authSource: "test",
      authMode: "api-key",
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
