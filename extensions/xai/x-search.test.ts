// Xai tests cover x search plugin behavior.
import { withFetchPreconnect } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createXSearchTool } from "./x-search.js";

function installXSearchFetch(payload?: Record<string, unknown>) {
  const mockFetch = vi.fn((_input?: unknown, _init?: unknown) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          payload ?? {
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Found X posts",
                    annotations: [{ type: "url_citation", url: "https://x.com/openclaw/status/1" }],
                  },
                ],
              },
            ],
            citations: ["https://x.com/openclaw/status/1"],
          },
        ),
    } as Response),
  );
  global.fetch = withFetchPreconnect(mockFetch);
  return mockFetch;
}

function firstFetchCall(mockFetch: ReturnType<typeof installXSearchFetch>) {
  const [call] = mockFetch.mock.calls;
  if (!call) {
    throw new Error("expected x_search fetch call");
  }
  return call;
}

function firstFetchUrl(mockFetch: ReturnType<typeof installXSearchFetch>) {
  const [url] = firstFetchCall(mockFetch);
  return String(url);
}

function firstFetchInit(mockFetch: ReturnType<typeof installXSearchFetch>): RequestInit {
  const [, init] = firstFetchCall(mockFetch);
  if (!init || typeof init !== "object" || Array.isArray(init)) {
    throw new Error("expected x_search fetch init");
  }
  return init as RequestInit;
}

function firstAuthorizationHeader(mockFetch: ReturnType<typeof installXSearchFetch>) {
  const headers = firstFetchInit(mockFetch).headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("expected x_search request headers");
  }
  return (headers as Record<string, string>).Authorization;
}

function parseFirstRequestBody(mockFetch: ReturnType<typeof installXSearchFetch>) {
  const requestBody = firstFetchInit(mockFetch).body;
  return JSON.parse(typeof requestBody === "string" ? requestBody : "{}") as Record<
    string,
    unknown
  >;
}

const openRouterAuth = {
  hasAuthForProvider: (providerId: string) => providerId === "openrouter",
  resolveApiKeyForProvider: async (providerId: string) =>
    providerId === "openrouter" ? "openrouter-test-profile-key" : undefined, // pragma: allowlist secret
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("xai x_search tool", () => {
  it("describes query as the required instruction for the Grok X-search agent", () => {
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    const parameters = tool?.parameters as
      | { properties?: { query?: { description?: string } } }
      | undefined;
    const queryDescription = parameters?.properties?.query?.description;

    expect(queryDescription).toContain("Natural-language instruction");
    expect(queryDescription).toContain("Grok X-search agent");
    expect(queryDescription).toContain("meaningful and non-empty");
    expect(queryDescription).not.toContain("allowed_x_handles");
    const serializedParameters = JSON.stringify(tool?.parameters);
    expect(serializedParameters).not.toContain("research_profile");
    expect(serializedParameters).not.toContain("research_stage");
    expect(serializedParameters).not.toContain("research_cache_control");
    expect(serializedParameters).not.toContain("subject_key");
    expect(serializedParameters).not.toContain("timeoutSeconds");
  });

  it("enables x_search when runtime config carries the shared xAI key", () => {
    const tool = createXSearchTool({
      config: {},
      runtimeConfig: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "x-search-runtime-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    expect(tool?.name).toBe("x_search");
  });

  it("enables x_search from an xAI auth profile and uses it for requests", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {},
      auth: {
        hasAuthForProvider: (providerId) => providerId === "xai",
        resolveApiKeyForProvider: async (providerId) =>
          providerId === "xai" ? "xai-profile-key" : undefined, // pragma: allowlist secret
      },
    });

    expect(tool?.name).toBe("x_search");
    await tool?.execute?.("x-search:auth-profile", {
      query: "auth profile search",
    });

    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer xai-profile-key");
  });

  it("uses one OpenRouter-backed x_search surface without falling back to direct xAI", async () => {
    const mockFetch = installXSearchFetch({
      id: "resp_openrouter_x_1",
      model: "x-ai/grok-4.5",
      status: "completed",
      usage: {
        input_tokens: 80,
        output_tokens: 20,
        total_tokens: 100,
        cost: 0.0123,
        server_tool_use: { web_search_requests: 2 },
      },
      output: [
        {
          type: "web_search_call",
          id: "wsc_1",
          status: "completed",
          query: "American nuclear energy conversation",
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Grounded X synthesis.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://x.com/example/status/123",
                  title: "Example post",
                },
              ],
            },
          ],
        },
      ],
    });
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                xSearch: {
                  provider: "openrouter",
                  model: "x-ai/grok-4.5",
                  inlineCitations: true,
                },
              },
            },
          },
        },
      },
      auth: {
        hasAuthForProvider: (providerId) => providerId === "openrouter",
        resolveApiKeyForProvider: async (providerId) =>
          providerId === "openrouter" ? "openrouter-profile-key" : undefined, // pragma: allowlist secret
      },
    });

    const result = await tool?.execute?.("x-search:openrouter", {
      query: "Find current X discussion about American nuclear energy",
      allowed_x_handles: ["AmericanAtomics"],
      from_date: "2026-07-01",
      to_date: "2026-07-16",
      enable_image_understanding: true,
    });

    expect(firstFetchUrl(mockFetch)).toBe("https://openrouter.ai/api/v1/responses");
    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer openrouter-profile-key");
    expect(parseFirstRequestBody(mockFetch)).toMatchObject({
      model: "x-ai/grok-4.5",
      tools: [
        {
          type: "openrouter:web_search",
          parameters: { engine: "native" },
        },
      ],
      x_search_filter: {
        allowed_x_handles: ["AmericanAtomics"],
        from_date: "2026-07-01",
        to_date: "2026-07-16",
        enable_image_understanding: true,
      },
      provider: {
        order: ["xai/zdr"],
        allow_fallbacks: false,
      },
      store: false,
    });
    expect(result?.details).toMatchObject({
      provider: "openrouter",
      semanticProvider: "xai",
      providerRouting: { order: ["xai/zdr"], allowFallbacks: false },
      model: "x-ai/grok-4.5",
      responseId: "resp_openrouter_x_1",
      responseModel: "x-ai/grok-4.5",
      usage: {
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
        webSearchRequests: 2,
        costUsd: 0.0123,
      },
      xSearchCalls: [
        {
          type: "web_search_call",
          id: "wsc_1",
          status: "completed",
          query: "American nuclear energy conversation",
        },
      ],
      citations: ["https://x.com/example/status/123"],
      providerReceipt: {
        dispatches: 1,
        outputTokens: 20,
        providerCostUsd: 0.0123,
        providerRequestId: "resp_openrouter_x_1",
      },
    });
    expect(parseFirstRequestBody(mockFetch)).not.toHaveProperty("max_output_tokens");
  });

  it("forwards native tool cancellation to the provider request", async () => {
    const mockFetch = vi.fn((_input?: unknown, rawInit?: unknown) => {
      const init = rawInit as RequestInit | undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const reason = init.signal?.reason;
            reject(reason instanceof Error ? reason : new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    global.fetch = withFetchPreconnect(mockFetch);
    const controller = new AbortController();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "openrouter-cancellation-key" }, // pragma: allowlist secret
                xSearch: { provider: "openrouter" },
              },
            },
          },
        },
      },
      auth: openRouterAuth,
    });

    const execution = tool?.execute?.(
      "x-search:native-cancellation",
      {
        query: "Find current questions.",
      },
      controller.signal,
    );

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const forwardedSignal = firstFetchInit(mockFetch).signal;
    expect(forwardedSignal?.aborted).toBe(false);
    controller.abort();
    expect(forwardedSignal?.aborted).toBe(true);
    await expect(execution).resolves.toMatchObject({
      details: {
        status: "cancelled",
        error: {
          code: "provider_cancelled",
        },
      },
    });
  });

  it("returns a typed, redacted timeout terminal receipt without converting failure into a result", async () => {
    const timeoutError = Object.assign(new Error("Bearer provider-secret"), {
      name: "TimeoutError",
    });
    const mockFetch = vi.fn(() => Promise.reject(timeoutError));
    global.fetch = withFetchPreconnect(mockFetch);
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "openrouter-timeout-key" }, // pragma: allowlist secret
                xSearch: { provider: "openrouter" },
              },
            },
          },
        },
      },
      auth: openRouterAuth,
    });

    const result = await tool?.execute?.("x-search:timeout", {
      query: "Find current questions.",
    });

    expect(result?.details).toMatchObject({
      status: "timed_out",
      error: { code: "provider_timeout", source_layer: "transport", retryable: false },
      providerReceipt: {
        sourceLayer: "transport",
        status: "timed_out",
        code: "provider_timeout",
        dispatches: 1,
        maxRetries: 0,
        observedResults: "unknown",
        providerRequestId: "unknown",
        providerResponseStatus: "unknown",
        outputTokens: "unknown",
        providerCostUsd: "unknown",
      },
    });
    expect(JSON.stringify(result?.details)).not.toContain("provider-secret");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retains timeout classification and generation identity when response body reading aborts", async () => {
    const bodyTimeout = Object.assign(new Error("body read exceeded transport timeout"), {
      name: "BodyTimeoutError",
    });
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "x-generation-id": "gen_timeout_body_1" }),
        json: () => Promise.reject(bodyTimeout),
      } as Response),
    );
    global.fetch = withFetchPreconnect(mockFetch);
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "openrouter-body-timeout-key" }, // pragma: allowlist secret
                xSearch: { provider: "openrouter" },
              },
            },
          },
        },
      },
      auth: openRouterAuth,
    });

    const result = await tool?.execute?.("x-search:body-timeout", {
      query: "Find current questions.",
    });

    expect(result?.details).toMatchObject({
      status: "timed_out",
      error: {
        code: "provider_timeout",
        source_layer: "transport",
        message: "provider request timed out before its response body completed",
      },
      providerReceipt: {
        status: "timed_out",
        code: "provider_timeout",
        providerRequestId: "gen_timeout_body_1",
      },
    });
  });

  it("does not infer transport timeout from provider error prose", async () => {
    const mockFetch = vi.fn(() => Promise.reject(new Error("provider timeout quota exhausted")));
    global.fetch = withFetchPreconnect(mockFetch);
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "openrouter-provider-error-key" }, // pragma: allowlist secret
                xSearch: { provider: "openrouter" },
              },
            },
          },
        },
      },
      auth: openRouterAuth,
    });

    const result = await tool?.execute?.("x-search:provider-error", {
      query: "Find current questions.",
    });

    expect(result?.details).toMatchObject({
      status: "failed",
      error: { code: "provider_request_failed", source_layer: "provider", retryable: false },
      providerReceipt: {
        sourceLayer: "provider",
        status: "failed",
        code: "provider_request_failed",
        dispatches: 1,
      },
    });
  });

  it("enables x_search when the xAI plugin web search key is configured", () => {
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    expect(tool?.name).toBe("x_search");
  });

  it("uses the xAI Responses x_search tool with structured filters", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-config-test", // pragma: allowlist secret
                },
                xSearch: {
                  model: "grok-4-1-fast-non-reasoning",
                  maxTurns: 2,
                },
              },
            },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:1", {
      query: "dinner recipes",
      allowed_x_handles: ["openclaw"],
      from_date: "2026-03-01",
      to_date: "2026-03-20",
      enable_image_understanding: true,
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(firstFetchUrl(mockFetch)).toContain("api.x.ai/v1/responses");
    const body = parseFirstRequestBody(mockFetch);
    expect(body.model).toBe("grok-4-1-fast-non-reasoning");
    expect(body.max_turns).toBe(2);
    expect(body.tools).toEqual([
      {
        type: "x_search",
        allowed_x_handles: ["openclaw"],
        from_date: "2026-03-01",
        to_date: "2026-03-20",
        enable_image_understanding: true,
      },
    ]);
    expect((result?.details as { citations?: string[] } | undefined)?.citations).toEqual([
      "https://x.com/openclaw/status/1",
    ]);
  });

  it("projects bounded native x_search evidence without leaking provider secrets", async () => {
    const mockFetch = installXSearchFetch({
      id: "resp_x_search_123",
      model: "grok-4.5-2026-07-01",
      status: "incomplete",
      incomplete_details: { reason: "max_turns" },
      service_tier: "default",
      usage: {
        input_tokens: 101,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens: 22,
        output_tokens_details: { reasoning_tokens: 7 },
        total_tokens: 123,
        num_server_side_tools_used: 3,
        cost_in_usd_ticks: 37_756_000,
      },
      citations: ["https://x.com/openclaw/status/1?ref=full"],
      output: [
        {
          type: "x_search_call",
          id: "xsc_1",
          call_id: "xs_call_1",
          status: "completed",
          name: "x_semantic_search",
          arguments: JSON.stringify({
            query: "latest OpenClaw updates",
            allowed_x_handles: ["openclaw"],
            from_date: "2026-03-01",
            enable_image_understanding: true,
          }),
        },
        {
          type: "x_search_call",
          id: "xsc_2",
          call_id: "xs_call_2",
          status: "completed",
          name: "view_image",
          arguments: '{"url":"https://pbs.twimg.com/media/test.jpg"}',
        },
        {
          type: "view_x_video_call",
          id: "vid_1",
          status: "failed",
          error: {
            code: "tool_unavailable",
            type: "server_error",
            message: "Bearer provider-secret authorization=xai-secret-token",
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Found current posts.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://x.com/openclaw/status/2?ref=annotation",
                  title: "OpenClaw update",
                  start_index: 6,
                  end_index: 13,
                },
              ],
            },
          ],
        },
      ],
    });
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "xai-config-test" }, // pragma: allowlist secret
                xSearch: { inlineCitations: true, serviceTier: "priority" },
              },
            },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:evidence", {
      query: "latest OpenClaw updates",
      allowed_x_handles: ["openclaw"],
      from_date: "2026-03-01",
      enable_image_understanding: true,
      enable_video_understanding: true,
    });
    const details = result?.details as Record<string, unknown>;

    expect(parseFirstRequestBody(mockFetch).service_tier).toBe("priority");
    expect(details).toMatchObject({
      responseId: "resp_x_search_123",
      responseModel: "grok-4.5-2026-07-01",
      responseStatus: "incomplete",
      responseTermination: "max_turns",
      incompleteReason: "max_turns",
      serviceTier: { requested: "priority", applied: "default" },
      usage: {
        inputTokens: 101,
        cachedInputTokens: 40,
        freshInputTokens: 61,
        outputTokens: 22,
        reasoningTokens: 7,
        totalTokens: 123,
        serverSideToolCalls: 3,
        costInUsdTicks: 37_756_000,
      },
      xFilters: {
        requested: {
          allowedXHandles: ["openclaw"],
          fromDate: "2026-03-01",
          enableImageUnderstanding: true,
          enableVideoUnderstanding: true,
        },
        applied: [
          {
            allowedXHandles: ["openclaw"],
            fromDate: "2026-03-01",
            enableImageUnderstanding: true,
          },
        ],
      },
      xSearchCalls: [
        {
          id: "xsc_1",
          callId: "xs_call_1",
          status: "completed",
          name: "x_semantic_search",
          arguments:
            '{"query":"latest OpenClaw updates","allowed_x_handles":["openclaw"],"from_date":"2026-03-01","enable_image_understanding":true}',
          query: "latest OpenClaw updates",
          filters: {
            allowedXHandles: ["openclaw"],
            fromDate: "2026-03-01",
            enableImageUnderstanding: true,
          },
        },
        {
          id: "xsc_2",
          callId: "xs_call_2",
          status: "completed",
          name: "view_image",
        },
      ],
      xSearchCallCount: 2,
      mediaUnderstandingCalls: [
        {
          id: "xsc_2",
          callId: "xs_call_2",
          status: "completed",
          type: "x_search_call",
          name: "view_image",
        },
        { id: "vid_1", status: "failed", type: "view_x_video_call" },
      ],
      mediaUnderstandingCallCount: 2,
      inlineCitations: [
        {
          type: "url_citation",
          title: "OpenClaw update",
          startIndex: 6,
          endIndex: 13,
          outputIndex: 3,
          contentIndex: 0,
          url: "https://x.com/openclaw/status/2?ref=annotation",
        },
      ],
    });
    expect(details.citations).toEqual([
      "https://x.com/openclaw/status/1?ref=full",
      "https://x.com/openclaw/status/2?ref=annotation",
    ]);
    expect(details.providerErrors).toEqual([
      {
        source: "media_understanding",
        callId: "vid_1",
        code: "tool_unavailable",
        type: "server_error",
        message: expect.any(String),
      },
    ]);
    expect(JSON.stringify(details)).not.toContain("provider-secret");
    expect(JSON.stringify(details)).not.toContain("xai-secret-token");
  });

  it("caps model-visible x_search evidence while retaining total counts", async () => {
    const calls = Array.from({ length: 21 }, (_, index) => ({
      type: "x_search_call",
      id: `xsc_${index}`,
      status: "completed",
    }));
    const mediaCalls = Array.from({ length: 21 }, (_, index) => ({
      type: "view_image_call",
      id: `img_${index}`,
      status: "completed",
    }));
    const mockFetch = installXSearchFetch({
      output: [
        ...calls,
        ...mediaCalls,
        { type: "message", content: [{ type: "output_text", text: "Bounded evidence" }] },
      ],
      citations: Array.from({ length: 101 }, (_, index) => `https://x.com/status/${index}`),
      inline_citations: Array.from({ length: 101 }, (_, index) => ({
        start_index: index,
        end_index: index + 1,
        url: `https://x.com/status/${index}?annotation=true`,
      })),
    });
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "xai-config-test" },
                xSearch: { inlineCitations: true },
              },
            },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:capped-evidence", {
      query: "bounded x search evidence",
    });
    const details = result?.details as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(details.xSearchCallCount).toBe(21);
    expect(details.xSearchCalls as unknown[]).toHaveLength(20);
    expect(details.xSearchCallsTruncated).toBe(true);
    expect(details.mediaUnderstandingCallCount).toBe(21);
    expect(details.mediaUnderstandingCalls as unknown[]).toHaveLength(20);
    expect(details.mediaUnderstandingCallsTruncated).toBe(true);
    expect(details.citationCount).toBe(101);
    expect(details.citations as unknown[]).toHaveLength(100);
    expect(details.citationsTruncated).toBe(true);
    expect(details.inlineCitationCount).toBe(101);
    expect(details.inlineCitations as unknown[]).toHaveLength(100);
    expect(details.inlineCitationsTruncated).toBe(true);
  });

  it("reports cache status truthfully for a reused response", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: { config: { webSearch: { apiKey: "xai-config-test" } } }, // pragma: allowlist secret
          },
        },
      },
    });

    const args = { query: "x search cache-status evidence" };
    const first = await tool?.execute?.("x-search:cache-status-1", args);
    const second = await tool?.execute?.("x-search:cache-status-2", args);

    expect(first?.details).toMatchObject({ cacheStatus: "miss" });
    expect(second?.details).toMatchObject({ cacheStatus: "hit", cached: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("routes x_search through plugin-owned xSearch.baseUrl", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-config-test", // pragma: allowlist secret
                },
                xSearch: {
                  enabled: true,
                  baseUrl: "https://api.x.ai/xai-search/v1/",
                },
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:plugin-base-url", {
      query: "base url route",
    });

    expect(firstFetchUrl(mockFetch)).toBe("https://api.x.ai/xai-search/v1/responses");
  });

  it("falls back to Grok web search baseUrl for x_search", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        tools: {
          web: {
            search: {
              grok: {
                apiKey: "xai-legacy-key", // pragma: allowlist secret
                baseUrl: "https://api.x.ai/legacy/v1/",
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:legacy-grok-base-url", {
      query: "legacy base url route",
    });

    expect(firstFetchUrl(mockFetch)).toBe("https://api.x.ai/legacy/v1/responses");
  });

  it("shares plugin webSearch.baseUrl with x_search when xSearch.baseUrl is unset", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                  baseUrl: "https://api.x.ai/shared/v1/",
                },
                xSearch: {
                  enabled: true,
                },
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:web-search-base-url", {
      query: "shared base url route",
    });

    expect(firstFetchUrl(mockFetch)).toBe("https://api.x.ai/shared/v1/responses");
  });

  it("reuses the xAI plugin web search key for x_search requests", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:plugin-key", {
      query: "latest post from huntharo",
    });

    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer xai-plugin-key");
  });

  it("reports malformed x_search JSON as a provider error", async () => {
    const mockFetch = vi.fn((_input?: unknown, _init?: unknown) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      } as Response),
    );
    global.fetch = withFetchPreconnect(mockFetch);
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                },
                xSearch: {
                  enabled: true,
                },
              },
            },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:malformed-json", {
      query: "malformed x_search response probe",
    });

    expect(result?.details).toMatchObject({
      status: "failed",
      error: {
        code: "provider_request_failed",
        source_layer: "provider",
        retryable: false,
      },
      providerReceipt: { status: "failed", code: "provider_request_failed", dispatches: 1 },
    });
    const details = result?.details as { error?: { message?: string } } | undefined;
    expect(details?.error?.message).toContain("malformed JSON response");
  });

  it("rejects x_search success JSON without answer text", async () => {
    const mockFetch = vi.fn((_input?: unknown, _init?: unknown) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ output: [] }),
      } as Response),
    );
    global.fetch = withFetchPreconnect(mockFetch);
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-plugin-key", // pragma: allowlist secret
                },
                xSearch: {
                  enabled: true,
                },
              },
            },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:missing-text", {
      query: "malformed x_search missing text probe",
    });

    expect(result?.details).toMatchObject({
      status: "failed",
      error: {
        code: "provider_response_failed",
        source_layer: "provider",
        retryable: false,
      },
      providerReceipt: { status: "failed", code: "provider_response_failed", dispatches: 1 },
    });
    const details = result?.details as { error?: { message?: string } } | undefined;
    expect(details?.error?.message).toContain("malformed JSON response");
  });

  it("surfaces bounded redacted provider failure details when xAI returns no answer", async () => {
    installXSearchFetch({
      id: "resp_failed",
      status: "failed",
      error: {
        code: "server_error",
        message: `Authorization: Bearer provider-secret ${"x".repeat(1_000)}`,
      },
      output: [],
    });
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: { config: { webSearch: { apiKey: "xai-config-test" } } },
          },
        },
      },
    });

    const result = await tool?.execute?.("x-search:failed-response", {
      query: "provider failure",
    });
    const details = result?.details as { error?: { message?: string } } | undefined;
    const message = details?.error?.message ?? "";

    expect(message).toContain("status=failed");
    expect(message).toContain("code=server_error");
    expect(message).not.toContain("provider-secret");
    expect(message.length).toBeLessThanOrEqual(500);
  });

  it("prefers the active runtime config for shared xAI keys", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: { source: "env", provider: "default", id: "X_SEARCH_KEY_REF" },
                },
              },
            },
          },
        },
      },
      runtimeConfig: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "x-search-runtime-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:runtime-key", {
      query: "runtime key search",
    });

    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer x-search-runtime-key");
  });

  it("reuses the legacy grok web search key for x_search requests", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        tools: {
          web: {
            search: {
              grok: {
                apiKey: "xai-legacy-key", // pragma: allowlist secret
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:legacy-key", {
      query: "latest legacy-key post from huntharo",
    });

    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer xai-legacy-key");
  });

  it("uses migrated runtime auth when the source config still carries legacy x_search apiKey", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        tools: {
          web: {
            x_search: {
              apiKey: "legacy-x-search-key", // pragma: allowlist secret
              enabled: true,
            } as Record<string, unknown>,
          },
        },
      },
      runtimeConfig: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "migrated-runtime-key", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    await tool?.execute?.("x-search:migrated-runtime-key", {
      query: "migrated runtime auth",
    });

    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer migrated-runtime-key");
  });

  it("rejects invalid date ordering before calling xAI", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  apiKey: "xai-config-test", // pragma: allowlist secret
                },
              },
            },
          },
        },
      },
    });

    await expect(
      tool?.execute?.("x-search:bad-dates", {
        query: "dinner recipes",
        from_date: "2026-03-20",
        to_date: "2026-03-01",
      }),
    ).rejects.toThrow(/from_date must be on or before to_date/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects mutually exclusive and oversized X handle filters before calling xAI", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: { apiKey: "xai-config-test" }, // pragma: allowlist secret
              },
            },
          },
        },
      },
    });

    await expect(
      tool?.execute?.("x-search:both-handle-filters", {
        query: "invalid filters",
        allowed_x_handles: ["openclaw"],
        excluded_x_handles: ["spam"],
      }),
    ).rejects.toThrow(/cannot be used together/i);
    await expect(
      tool?.execute?.("x-search:too-many-handles", {
        query: "too many handles",
        allowed_x_handles: Array.from({ length: 21 }, (_, index) => `account-${index}`),
      }),
    ).rejects.toThrow(/at most 20 handles/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
