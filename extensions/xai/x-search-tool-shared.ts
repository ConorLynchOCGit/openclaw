// Xai plugin module implements x search tool shared behavior.
import type { AgentToolResult } from "openclaw/plugin-sdk/agent-core";
import { Type } from "typebox";
import {
  XAI_X_SEARCH_RESEARCH_PROFILES,
  XAI_X_SEARCH_RESEARCH_STAGES,
} from "./src/x-search-shared.js";

export function buildMissingXSearchApiKeyPayload(provider: "xai" | "openrouter" = "xai") {
  if (provider === "openrouter") {
    return {
      error: "missing_openrouter_api_key",
      message:
        "x_search is configured for OpenRouter and needs OpenRouter credentials. Configure the OpenRouter provider or set OPENROUTER_API_KEY in the Gateway environment.",
      docs: "https://openrouter.ai/docs/guides/features/server-tools/web-search",
    };
  }
  return {
    error: "missing_xai_api_key",
    message:
      "x_search needs xAI credentials. Run `openclaw onboard --auth-choice xai-oauth` to sign in with Grok, run `openclaw onboard --auth-choice xai-api-key`, set `XAI_API_KEY` in the Gateway environment, or configure `plugins.entries.xai.config.webSearch.apiKey`.",
    docs: "https://docs.openclaw.ai/tools/web",
  };
}

export function createXSearchToolDefinition(
  execute: (
    toolCallId: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<AgentToolResult<unknown>>,
) {
  return {
    label: "X Search",
    name: "x_search",
    description:
      "Search X (formerly Twitter) using Grok's native X search, including targeted post or thread lookups. For exact identity, post hydration, counts, or metrics, use the corresponding raw X source tool.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Natural-language instruction sent to the Grok X-search agent. Must be meaningful and non-empty.",
      }),
      allowed_x_handles: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          description: "Only include posts from these X handles.",
        }),
      ),
      excluded_x_handles: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          description: "Exclude posts from these X handles.",
        }),
      ),
      from_date: Type.Optional(
        Type.String({ description: "Only include posts on or after this date (YYYY-MM-DD)." }),
      ),
      to_date: Type.Optional(
        Type.String({ description: "Only include posts on or before this date (YYYY-MM-DD)." }),
      ),
      enable_image_understanding: Type.Optional(
        Type.Boolean({ description: "Allow xAI to inspect images attached to matching posts." }),
      ),
      enable_video_understanding: Type.Optional(
        Type.Boolean({ description: "Allow xAI to inspect videos attached to matching posts." }),
      ),
      research_profile: Type.Optional(
        Type.Union(
          XAI_X_SEARCH_RESEARCH_PROFILES.map((profile) => Type.Literal(profile)),
          {
            description:
              "Closed v2 research profile. Provide together with research_stage; it can only select the built-in provider limits.",
          },
        ),
      ),
      research_stage: Type.Optional(
        Type.Union(
          XAI_X_SEARCH_RESEARCH_STAGES.map((stage) => Type.Literal(stage)),
          {
            description:
              "Closed v2 research stage. It selects fixed request, search-result, and cost controls and cannot widen them.",
          },
        ),
      ),
      subject_key: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 128,
          description:
            "Immutable normalized subject key used to isolate ordinary research cache entries.",
        }),
      ),
    }),
    execute,
  };
}
