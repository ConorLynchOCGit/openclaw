import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.js";

function parseRequestJsonBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") {
    throw new Error("expected JSON request body to be a string");
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
    expect(parseRequestJsonBody(init)).toMatchObject({
      model: "anthropic/claude-sonnet-4-6",
      temperature: 0,
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
        systemPrompt: "system",
        userPrompt: "user",
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
        systemPrompt: "system",
        userPrompt: "user",
        responseFormat: "json",
      });

      const call = fetchImpl.mock.calls[0];
      expect(call).toBeDefined();
      const [, init] = call as unknown as [string, RequestInit];
      expect(parseRequestJsonBody(init)).toMatchObject({
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
        systemPrompt: "system",
        userPrompt: "user",
        responseFormat: "json",
      });

      const call = fetchImpl.mock.calls[0];
      expect(call).toBeDefined();
      const [, init] = call as unknown as [string, RequestInit];
      expect(parseRequestJsonBody(init)).toMatchObject({
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
});
