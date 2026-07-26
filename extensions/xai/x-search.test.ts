// Xai tests cover x search plugin behavior.
import { withFetchPreconnect } from "openclaw/plugin-sdk/test-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createXSearchTool } from "./x-search.js";

const XAI_DOCUMENTED_HANDLE_LIMIT = 20;

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function installXSearchFetch(payload?: Record<string, unknown>) {
  const mockFetch = vi.fn((_input?: unknown, _init?: unknown) =>
    Promise.resolve(
      jsonResponse(
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
    ),
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

function createConfiguredXSearchTool() {
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
  if (!tool) {
    throw new Error("expected x_search tool to be configured");
  }
  return tool;
}

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
  });

  it("publishes xAI handle-filter constraints in the tool schema", () => {
    const tool = createConfiguredXSearchTool();
    const parameters = tool.parameters as {
      properties?: Record<string, { description?: string; maxItems?: number }>;
    };

    for (const [key, counterpart] of [
      ["allowed_x_handles", "excluded_x_handles"],
      ["excluded_x_handles", "allowed_x_handles"],
    ] as const) {
      expect(parameters.properties?.[key]?.maxItems).toBe(XAI_DOCUMENTED_HANDLE_LIMIT);
      expect(parameters.properties?.[key]?.description).toContain(counterpart);
    }
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
                  maxTotalResults: 17,
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
          parameters: { engine: "native", max_total_results: 17 },
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
      usage: {
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
        webSearchRequests: 2,
        costUsd: 0.0123,
      },
      xSearchCallCount: 1,
      citations: [{ url: "https://x.com/example/status/123" }],
    });
    expect(result?.details).not.toHaveProperty("responseId");
    expect(result?.details).not.toHaveProperty("responseModel");
    expect(result?.details).not.toHaveProperty("xSearchCalls");
  });

  it("never sends OpenRouter credentials to an inherited xAI base URL", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                webSearch: {
                  baseUrl: "https://api.x.ai/inherited/v1/",
                },
                xSearch: {
                  provider: "openrouter",
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

    await tool?.execute?.("x-search:provider-endpoint", { query: "current X discussion" });

    expect(firstFetchUrl(mockFetch)).toBe("https://openrouter.ai/api/v1/responses");
    expect(firstAuthorizationHeader(mockFetch)).toBe("Bearer openrouter-profile-key");
  });

  it("propagates native tool cancellation to the provider request", async () => {
    let providerSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        providerSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          providerSignal?.addEventListener(
            "abort",
            () => reject(providerSignal?.reason ?? new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                xSearch: {
                  provider: "openrouter",
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
    const controller = new AbortController();
    const request = tool?.execute?.(
      "x-search:abort",
      { query: "abort propagation probe 8d40a7" },
      controller.signal,
    );

    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort(new Error("cancelled by task"));

    await expect(request).rejects.toThrow(/cancelled by task|aborted/i);
    expect(providerSignal?.aborted).toBe(true);
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
                xSearch: { maxTurns: 2 },
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
    expect(body.model).toBe("grok-4.3");
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "none" });
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
    expect(
      (result?.details as { citations?: Array<{ url: string }> } | undefined)?.citations,
    ).toEqual([{ url: "https://x.com/openclaw/status/1" }]);
  });

  it("rejects combined allow and exclude handle filters before calling xAI", async () => {
    const mockFetch = installXSearchFetch();
    const tool = createConfiguredXSearchTool();

    await expect(
      tool.execute("x-search:combined-handle-filters", {
        query: "dinner recipes",
        allowed_x_handles: ["openclaw"],
        excluded_x_handles: ["spam"],
      }),
    ).rejects.toThrow("allowed_x_handles and excluded_x_handles cannot be used together");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(["allowed_x_handles", "excluded_x_handles"] as const)(
    "accepts the xAI limit for %s",
    async (key) => {
      const mockFetch = installXSearchFetch();
      const tool = createConfiguredXSearchTool();
      const handles = Array.from(
        { length: XAI_DOCUMENTED_HANDLE_LIMIT },
        (_, index) => `${key}-${index}`,
      );

      await tool.execute(`x-search:${key}:limit`, {
        query: `${key} boundary`,
        [key]: handles,
      });

      expect(parseFirstRequestBody(mockFetch).tools).toEqual([
        { type: "x_search", [key]: handles },
      ]);
    },
  );

  it.each(["allowed_x_handles", "excluded_x_handles"] as const)(
    "rejects %s above the xAI limit before calling xAI",
    async (key) => {
      const mockFetch = installXSearchFetch();
      const tool = createConfiguredXSearchTool();
      const handles = Array.from(
        { length: XAI_DOCUMENTED_HANDLE_LIMIT + 1 },
        (_, index) => `${key}-${index}`,
      );

      await expect(
        tool.execute(`x-search:${key}:over-limit`, {
          query: `${key} over limit`,
          [key]: handles,
        }),
      ).rejects.toThrow(`${key} cannot contain more than ${XAI_DOCUMENTED_HANDLE_LIMIT} handles`);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );
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
      },
      xSearchCallCount: 2,
      mediaUnderstandingCallCount: 2,
      providerErrorCount: 1,
    });
    expect(details.citations).toEqual([
      { url: "https://x.com/openclaw/status/1?ref=full" },
      { url: "https://x.com/openclaw/status/2?ref=annotation" },
    ]);
    expect(details).not.toHaveProperty("responseId");
    expect(details).not.toHaveProperty("responseModel");
    expect(details).not.toHaveProperty("responseStatus");
    expect(details).not.toHaveProperty("responseTermination");
    expect(details).not.toHaveProperty("incompleteReason");
    expect(details).not.toHaveProperty("xSearchCalls");
    expect(details).not.toHaveProperty("mediaUnderstandingCalls");
    expect(details).not.toHaveProperty("inlineCitations");
    expect(details).not.toHaveProperty("providerErrors");
    expect((details.xFilters as Record<string, unknown>).applied).toBeUndefined();
    expect(JSON.stringify(details)).not.toContain("provider-secret");
    expect(JSON.stringify(details)).not.toContain("xai-secret-token");
    expect(JSON.stringify(details)).not.toContain("xs_call_1");
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
    expect(details.xSearchCallsTruncated).toBe(true);
    expect(details.mediaUnderstandingCallCount).toBe(21);
    expect(details.mediaUnderstandingCallsTruncated).toBe(true);
    expect(details.citationCount).toBe(100);
    expect(details.citations as unknown[]).toHaveLength(100);
    expect(details.citationsTruncated).toBe(true);
    expect(details).not.toHaveProperty("xSearchCalls");
    expect(details).not.toHaveProperty("mediaUnderstandingCalls");
    expect(details).not.toHaveProperty("inlineCitations");
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
      Promise.resolve(
        new Response("{ nope", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
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

    await expect(
      tool?.execute?.("x-search:malformed-json", {
        query: "malformed x_search response probe",
      }),
    ).rejects.toThrow("xAI X search failed: malformed JSON response");
  });

  it("rejects x_search success JSON without answer text", async () => {
    const mockFetch = vi.fn((_input?: unknown, _init?: unknown) =>
      Promise.resolve(jsonResponse({ output: [] })),
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

    await expect(
      tool?.execute?.("x-search:missing-text", {
        query: "malformed x_search missing text probe",
      }),
    ).rejects.toThrow("xAI X search failed: malformed JSON response");
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

    let failure: unknown;
    try {
      await tool?.execute?.("x-search:failed-response", { query: "provider failure" });
    } catch (error) {
      failure = error;
    }
    const message = failure instanceof Error ? failure.message : String(failure);

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
});
