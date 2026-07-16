import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOwnedMetricsCredentialAtRuntime,
  resolveOwnedMetricsCredential,
  resolvePublicCredential,
  XCredentialError,
  X_BEARER_TOKEN_ENV,
  X_OWNED_METRICS_TOKEN_ENV,
} from "./auth.js";
import { createXReadTransport, XTransportError } from "./transport.js";

const TOKEN = "public-token-must-not-leak";
let server: Server | undefined;

afterEach(async () => {
  server?.close();
  server = undefined;
});

async function startServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ baseUrl: string }> {
  server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock server did not bind a TCP address");
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

function transport(baseUrl: string) {
  return createXReadTransport({
    baseUrl,
    env: { [X_BEARER_TOKEN_ENV]: TOKEN },
    timeoutMs: 1_000,
  });
}

describe("XReadTransport", () => {
  it("resolves only the fixed public env reference and never falls back for owned metrics", () => {
    const env = {
      [X_BEARER_TOKEN_ENV]: TOKEN,
      [X_OWNED_METRICS_TOKEN_ENV]: "owned-token",
    };

    expect(
      resolvePublicCredential({ source: "env", provider: "default", id: X_BEARER_TOKEN_ENV }, env)
        .status,
    ).toBe("available");
    expect(
      resolvePublicCredential({ source: "env", provider: "default", id: "OTHER_TOKEN" }, env)
        .status,
    ).toBe("unavailable");
    expect(
      resolvePublicCredential({ source: "file", provider: "vault", id: "x/token" }, env).status,
    ).toBe("unavailable");
    expect(resolveOwnedMetricsCredential(undefined).status).toBe("missing");
    expect(resolveOwnedMetricsCredential(undefined, env)).toEqual({
      status: "available",
      value: "owned-token",
      source: "env",
    });
    expect(
      resolveOwnedMetricsCredential(
        { source: "env", provider: "default", id: X_OWNED_METRICS_TOKEN_ENV },
        env,
      ).status,
    ).toBe("available");
    expect(
      resolveOwnedMetricsCredential({
        source: "env",
        provider: "default",
        id: X_BEARER_TOKEN_ENV,
      }).status,
    ).toBe("unavailable");
  });

  it("resolves the dedicated owned credential through the native SecretRef runtime", async () => {
    const resolved = await resolveOwnedMetricsCredentialAtRuntime({
      configured: {
        source: "env",
        provider: "default",
        id: X_OWNED_METRICS_TOKEN_ENV,
      },
      config: {
        secrets: { providers: { default: { source: "env" } } },
      },
      env: { [X_OWNED_METRICS_TOKEN_ENV]: "owned-runtime-token" },
    });
    const publicRef = await resolveOwnedMetricsCredentialAtRuntime({
      configured: { source: "env", provider: "default", id: X_BEARER_TOKEN_ENV },
      config: {
        secrets: { providers: { default: { source: "env" } } },
      },
      env: { [X_BEARER_TOKEN_ENV]: TOKEN },
    });

    expect(resolved).toEqual({
      status: "available",
      value: "owned-runtime-token",
      source: "secret_ref",
    });
    expect(publicRef.status).toBe("unavailable");
  });

  it("makes the first bounded XDK GET request and retains selected receipt headers", async () => {
    const mock = await startServer((request, response) => {
      expect(request.method).toBe("GET");
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets/search/recent");
      expect(url.searchParams.get("query")).toBe("openclaw");
      expect(url.searchParams.get("max_results")).toBe("25");
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
      response.writeHead(200, {
        "content-type": "application/json",
        "x-rate-limit-limit": "300",
        "x-rate-limit-remaining": "299",
        "x-rate-limit-reset": "123456",
        "x-resource-id": "tweets.search.recent",
      });
      response.end(JSON.stringify({ data: [{ id: "1" }], meta: { result_count: 1 } }));
    });

    const result = await transport(mock.baseUrl).posts.recent({ query: "openclaw" });

    expect(result.data).toEqual({ data: [{ id: "1" }], meta: { result_count: 1 } });
    expect(result.receipt).toEqual({
      status: 200,
      rateLimit: { limit: "300", remaining: "299", reset: "123456" },
      resourceId: "tweets.search.recent",
      requestId: undefined,
    });
  });

  it("uses the official XDK transport with bearer auth for current user search", async () => {
    const mock = await startServer((request, response) => {
      expect(request.method).toBe("GET");
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/users/search");
      expect(url.searchParams.get("query")).toBe("nuclear energy");
      expect(url.searchParams.get("max_results")).toBe("10");
      expect(url.searchParams.get("next_token")).toBe("next-page");
      expect(url.searchParams.get("expansions")).toBe("pinned_tweet_id");
      expect(url.searchParams.get("user.fields")).toBe("description,public_metrics");
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "1", username: "example" }] }));
    });
    const client = transport(mock.baseUrl);

    const result = await client.users.search({
      query: "nuclear energy",
      maxResults: 10,
      paginationToken: "next-page",
      expansions: ["pinned_tweet_id"],
      userFields: ["description", "public_metrics"],
    });

    expect(result.receipt.status).toBe(200);
    expect(result.data).toMatchObject({ data: [{ id: "1", username: "example" }] });
  });

  it("rejects unsupported user-search syntax before provider execution", async () => {
    const client = createXReadTransport({
      apiKey: TOKEN,
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 100,
    });

    let error: unknown;
    try {
      client.users.search({ query: "(nuclear OR uranium)", maxResults: 10 });
    } catch (value) {
      error = value;
    }

    expect(error).toBeInstanceOf(XTransportError);
    expect(error.kind).toBe("bad_request");
  });

  it("reads bounded project usage through the official XDK usage client", async () => {
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/usage/tweets");
      expect(url.searchParams.get("days")).toBe("7");
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
      response.writeHead(200, {
        "content-type": "application/json",
        "x-resource-id": "usage.tweets",
      });
      response.end(JSON.stringify({ data: { project_usage: 12, project_cap: 1000 } }));
    });

    const result = await transport(mock.baseUrl).metrics.usage({ days: 7 });

    expect(result.data).toEqual({ data: { project_usage: 12, project_cap: 1000 } });
    expect(result.receipt.resourceId).toBe("usage.tweets");
  });

  it("propagates a supplied pagination token and reports a terminal response", async () => {
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.searchParams.get("pagination_token")).toBe("next-token");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [], meta: { result_count: 0 } }));
    });

    const result = await transport(mock.baseUrl).posts.quotes({
      id: "1",
      paginationToken: "next-token",
      maxResults: 10,
    });

    expect(result.nextToken).toBeUndefined();
  });

  it.each([
    [400, "bad_request"],
    [401, "authentication"],
    [403, "authentication"],
    [429, "rate_limited"],
    [503, "server"],
  ] as const)("maps HTTP %i to the bounded %s error", async (status, kind) => {
    const mock = await startServer((_request, response) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "x-rate-limit-remaining": "0",
      });
      response.end(JSON.stringify({ message: TOKEN }));
    });

    const error = await transport(mock.baseUrl)
      .posts.recent({ query: "openclaw" })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(XTransportError);
    expect(error.kind).toBe(kind);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it("maps malformed JSON without exposing the response body", async () => {
    const mock = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`{ "message": "${TOKEN}"`);
    });

    const error = await transport(mock.baseUrl)
      .posts.recent({ query: "openclaw" })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(XTransportError);
    expect(error.kind).toBe("malformed_response");
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it("honors abort signals", async () => {
    const mock = await startServer((_request, response) => {
      setTimeout(() => response.end(JSON.stringify({ data: [] })), 100);
    });
    const controller = new AbortController();
    const pending = transport(mock.baseUrl).posts.recent({
      query: "openclaw",
      signal: controller.signal,
    });
    controller.abort();

    const error = await pending.catch((value: unknown) => value);
    expect(error).toBeInstanceOf(XTransportError);
    expect(error.kind).toBe("aborted");
  });

  it("redacts configured credentials from successful data and never substitutes the public token for owned metrics", async () => {
    const mock = await startServer((request, response) => {
      if (request.url?.startsWith("/2/tweets/search/recent")) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: { echoed: TOKEN } }));
        return;
      }
      response.statusCode = 500;
      response.end();
    });
    const client = transport(mock.baseUrl);

    const result = await client.posts.recent({ query: "openclaw" });
    const ownedError = await client.metrics
      .owned({
        tweetIds: ["1"],
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-02T00:00:00Z",
        granularity: "day",
        requestedMetrics: ["impressions"],
      })
      .catch((value: unknown) => value);

    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(ownedError).toBeInstanceOf(XCredentialError);
    expect(JSON.stringify(ownedError)).not.toContain(TOKEN);
  });

  it("reports personalized trends as unavailable authentication, not network failure", async () => {
    const client = createXReadTransport({ apiKey: TOKEN });

    const personalizedTrendsError = await client.trends
      .personalized()
      .catch((value: unknown) => value);

    expect(personalizedTrendsError).toBeInstanceOf(XTransportError);
    expect(personalizedTrendsError.kind).toBe("authentication");
  });

  it("rejects owned-metric windows longer than 30 days before provider execution", async () => {
    const client = createXReadTransport({
      apiKey: TOKEN,
      ownedMetricsApiKey: "owned-token-must-not-leak",
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 100,
    });

    const error = await client.metrics
      .owned({
        tweetIds: ["1"],
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-02-01T00:00:01Z",
        granularity: "day",
        requestedMetrics: ["impressions"],
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(XTransportError);
    expect(error.kind).toBe("bad_request");
    expect(JSON.stringify(error)).not.toContain("owned-token-must-not-leak");
  });
});
