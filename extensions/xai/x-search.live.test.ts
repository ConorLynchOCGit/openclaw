// Xai tests cover x search plugin behavior.
import { isBillingErrorMessage } from "openclaw/plugin-sdk/test-live";
import { describe, expect, it } from "vitest";
import { createXSearchTool } from "./x-search.js";

const liveProvider = process.env.OPENROUTER_API_KEY?.trim() ? "openrouter" : "xai";
const liveEnabled =
  process.env.OPENCLAW_LIVE_TEST === "1" &&
  ((process.env.OPENROUTER_API_KEY ?? "").trim().length > 0 ||
    (process.env.XAI_API_KEY ?? "").trim().length > 0);

const describeLive = liveEnabled ? describe : describe.skip;

describeLive("xai x_search live", () => {
  it("queries X through the selected semantic provider", async () => {
    const tool = createXSearchTool({
      config: {
        plugins: {
          entries: {
            xai: {
              config: {
                xSearch: {
                  enabled: true,
                  provider: liveProvider,
                  model: liveProvider === "openrouter" ? "x-ai/grok-4.5" : "grok-4.3",
                  maxTurns: 1,
                  maxTotalResults: 5,
                },
              },
            },
          },
        },
      },
    });

    if (!tool) {
      throw new Error("expected x_search tool to be registered");
    }
    let result: Awaited<ReturnType<typeof tool.execute>>;
    try {
      result = await tool.execute("x-search:live", {
        query: "Find one recent official @OpenAIDevs post about Codex and cite its exact X URL.",
        allowed_x_handles: ["OpenAIDevs"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isBillingErrorMessage(message)) {
        console.warn(`[xai:x-search:live] skip: billing drift: ${message}`);
        return;
      }
      throw error;
    }

    const details = (result.details ?? {}) as {
      provider?: string;
      model?: string;
      content?: string;
      citations?: string[];
      inlineCitations?: unknown[];
      error?: string;
      message?: string;
    };

    const errorMessage =
      details.error && details.message
        ? `${details.error} ${details.message}`
        : details.error || details.message || "";
    if (isBillingErrorMessage(errorMessage)) {
      console.warn(`[xai:x-search:live] skip: billing drift: ${errorMessage}`);
      return;
    }

    expect(details.error, details.message).toBeUndefined();
    expect(details.provider).toBe(liveProvider);
    expect(details.content?.trim().length ?? 0).toBeGreaterThan(0);

    const citationCount =
      (Array.isArray(details.citations) ? details.citations.length : 0) +
      (Array.isArray(details.inlineCitations) ? details.inlineCitations.length : 0);
    expect(citationCount).toBeGreaterThan(0);
    console.log(
      JSON.stringify({
        schema: "openclaw.x_search_capability_probe.v1",
        status: "complete",
        provider: details.provider,
        model: (result.details as Record<string, unknown> | undefined)?.model,
        providerRouting: (result.details as Record<string, unknown> | undefined)?.providerRouting,
        responseStatus: (result.details as Record<string, unknown> | undefined)?.responseStatus,
        citationCount,
        citations: Array.isArray(details.citations) ? details.citations.slice(0, 5) : [],
        usage: (result.details as Record<string, unknown> | undefined)?.usage,
        contentPersisted: false,
      }),
    );
  }, 75_000);
});
