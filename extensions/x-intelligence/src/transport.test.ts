import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOwnedMetricsCredentialAtRuntime,
  resolveOwnedMetricsCredential,
  resolvePublicCredential,
  X_BEARER_TOKEN_ENV,
  X_OWNED_METRICS_TOKEN_ENV,
} from "./auth.js";
import { createXReadTransport, XTransportError } from "./transport.js";

const TOKEN = "public-token-must-not-leak";
const OWNED_TOKEN = "owned-token-must-not-leak";
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
    retrySleep: async () => undefined,
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
      retryAfter: undefined,
      resourceId: "tweets.search.recent",
      requestId: undefined,
      serializedBytes: expect.any(Number),
    });
  });

  it("rejects a stale recent window before dispatch while allowing archive reads", async () => {
    let requests = 0;
    const mock = await startServer((request, response) => {
      requests += 1;
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets/search/all");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [], meta: { result_count: 0 } }));
    });
    const client = transport(mock.baseUrl);
    const window = {
      query: "openclaw",
      startTime: "2020-01-01T00:00:00.000Z",
      endTime: "2020-01-02T00:00:00.000Z",
      maxResults: 10,
    };

    const recentError = (() => {
      try {
        void client.posts.recent(window);
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(recentError).toMatchObject({
      kind: "recent_window_outside_horizon",
      category: "request",
      requestCount: 0,
    });
    expect(requests).toBe(0);

    await expect(client.posts.archive(window)).resolves.toMatchObject({
      receipt: { status: 200 },
    });
    expect(requests).toBe(1);
  });

  it("paces concurrent archive-search dispatches at X's native one-per-second limit", async () => {
    const dispatchedAt: number[] = [];
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets/search/all");
      dispatchedAt.push(Date.now());
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [], meta: { result_count: 0 } }));
    });
    const client = transport(mock.baseUrl);

    await Promise.all(
      ["first", "second", "third"].map((query) => client.posts.archive({ query, maxResults: 10 })),
    );

    expect(dispatchedAt).toHaveLength(3);
    expect((dispatchedAt[1] ?? 0) - (dispatchedAt[0] ?? 0)).toBeGreaterThanOrEqual(900);
    expect((dispatchedAt[2] ?? 0) - (dispatchedAt[1] ?? 0)).toBeGreaterThanOrEqual(900);
  });

  it("retries transient responses from provider metadata and exposes retry telemetry", async () => {
    let requests = 0;
    const retryDelays: number[] = [];
    const mock = await startServer((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(429, {
          "content-type": "application/json",
          "retry-after": "7",
          "x-rate-limit-remaining": "0",
          "x-rate-limit-reset": String(Math.ceil(Date.now() / 1_000) + 2),
        });
        response.end(JSON.stringify({ title: "rate limited" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "recovered" }] }));
    });
    const client = createXReadTransport({
      baseUrl: mock.baseUrl,
      env: { [X_BEARER_TOKEN_ENV]: TOKEN },
      retrySleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
    });

    const result = await client.posts.recent({ query: "openclaw" });

    expect(requests).toBe(2);
    expect(retryDelays).toEqual([7_000]);
    expect(result.data).toEqual({ data: [{ id: "recovered" }] });
    expect(result.receipts?.map((receipt) => receipt.status)).toEqual([429, 200]);
    expect(result.retry).toEqual({
      attempts: 2,
      retries: [
        expect.objectContaining({
          attempt: 1,
          kind: "rate_limited",
          delayMs: 7_000,
          status: 429,
          retryAfter: "7",
        }),
      ],
      totalDelayMs: 7_000,
    });
  });

  it("deduplicates exact in-flight hydration and count reads while retaining partial data", async () => {
    const requestsByPath = new Map<string, number>();
    const mock = await startServer((request, response) => {
      const path = new URL(request.url ?? "", "http://x.invalid").pathname;
      requestsByPath.set(path, (requestsByPath.get(path) ?? 0) + 1);
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            path === "/2/tweets"
              ? {
                  data: [{ id: "post-1" }],
                  errors: [{ value: "post-2", detail: "not found" }],
                }
              : { data: [{ start: "2026-07-24T00:00:00Z", tweet_count: 3 }] },
          ),
        );
      }, 10);
    });
    const client = transport(mock.baseUrl);

    const [firstHydration, secondHydration] = await Promise.all([
      client.posts.batch({ ids: ["post-1", "post-2"] }),
      client.posts.batch({ ids: ["post-1", "post-2"] }),
    ]);
    await Promise.all([
      client.counts.recent({ query: "nuclear energy" }),
      client.counts.recent({ query: "nuclear energy" }),
    ]);

    expect(requestsByPath.get("/2/tweets")).toBe(1);
    expect(requestsByPath.get("/2/tweets/counts/recent")).toBe(1);
    expect(firstHydration).toBe(secondHydration);
    expect(firstHydration.data).toEqual({
      data: [{ id: "post-1" }],
      errors: [{ value: "post-2", detail: "not found" }],
    });
  });

  it("serializes concurrent reads within one provider endpoint lane", async () => {
    let active = 0;
    let maxActive = 0;
    const mock = await startServer((_request, response) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => {
        active -= 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [] }));
      }, 10);
    });
    const client = transport(mock.baseUrl);

    await Promise.all(["first", "second", "third"].map((query) => client.posts.recent({ query })));

    expect(maxActive).toBe(1);
  });

  it("does not retry terminal client failures", async () => {
    let requests = 0;
    const retryDelays: number[] = [];
    const mock = await startServer((_request, response) => {
      requests += 1;
      response.writeHead(400, {
        "content-type": "application/json",
        "retry-after": "1",
      });
      response.end(JSON.stringify({ title: "bad request" }));
    });
    const client = createXReadTransport({
      baseUrl: mock.baseUrl,
      env: { [X_BEARER_TOKEN_ENV]: TOKEN },
      retrySleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
    });

    const error = await client.posts.recent({ query: "invalid" }).catch((value: unknown) => value);

    expect(error).toMatchObject({ kind: "bad_request", requestCount: 1 });
    expect(requests).toBe(1);
    expect(retryDelays).toEqual([]);
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

  it("leaves user-search syntax and international names to the X endpoint", async () => {
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/users/search");
      expect(url.searchParams.get("query")).toBe("José Núñez (uranium)");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "1", username: "jose" }] }));
    });
    const client = transport(mock.baseUrl);

    const result = await client.users.search({ query: "José Núñez (uranium)", maxResults: 10 });

    expect(result.receipt.status).toBe(200);
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

  it("requests creation time with public metrics so age-normalized comparisons are possible", async () => {
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      expect(url.pathname).toBe("/2/tweets");
      expect(url.searchParams.get("ids")).toBe("post-1");
      expect(url.searchParams.get("tweet.fields")).toBe("author_id,created_at,public_metrics");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [
            {
              id: "post-1",
              author_id: "account-1",
              created_at: "2026-07-16T04:00:00.000Z",
              public_metrics: { impression_count: 10 },
            },
          ],
        }),
      );
    });

    await expect(
      transport(mock.baseUrl).metrics.public({ ids: ["post-1"] }),
    ).resolves.toMatchObject({ receipt: { status: 200 } });
  });

  it("derives owned identity from X, verifies post authors, and receipts every request", async () => {
    const requests: string[] = [];
    const mock = await startServer((request, response) => {
      const url = new URL(request.url ?? "", "http://x.invalid");
      requests.push(url.pathname);
      expect(request.headers.authorization).toBe(`Bearer ${OWNED_TOKEN}`);
      response.setHeader("content-type", "application/json");
      response.setHeader("x-resource-id", url.pathname);
      if (url.pathname === "/2/users/me") {
        expect(url.searchParams.get("user.fields")).toBe("id");
        response.end(JSON.stringify({ data: { id: "provider-account" } }));
        return;
      }
      if (url.pathname === "/2/tweets") {
        expect(url.searchParams.get("ids")).toBe("post-1,post-2");
        expect(url.searchParams.get("tweet.fields")).toBe("author_id");
        response.end(
          JSON.stringify({
            data: [
              { id: "post-1", author_id: "provider-account" },
              { id: "post-2", author_id: "provider-account" },
            ],
          }),
        );
        return;
      }
      expect(url.pathname).toBe("/2/tweets/analytics");
      response.end(
        JSON.stringify({
          data: [
            {
              id: "post-1",
              timestamped_metrics: [
                { timestamp: "2026-07-16T11:00:00Z", metrics: { impressions: 886 } },
              ],
            },
          ],
        }),
      );
    });
    const client = createXReadTransport({
      apiKey: TOKEN,
      ownedMetricsApiKey: OWNED_TOKEN,
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      retrySleep: async () => undefined,
    });

    const result = await client.metrics.owned({
      tweetIds: ["post-1", "post-2"],
      startTime: "2026-07-16T00:00:00Z",
      endTime: "2026-07-17T00:00:00Z",
      granularity: "hourly",
      requestedMetrics: ["impressions"],
    });

    expect(requests).toEqual(["/2/users/me", "/2/tweets", "/2/tweets/analytics"]);
    expect(result.trustedOwnership).toEqual({
      provider: "x",
      accountId: "provider-account",
      verifiedPostIds: ["post-1", "post-2"],
      verification: "authenticated_user_and_post_authors",
    });
    expect(result.trustedOwnedAnalytics).toEqual({
      provider: "x",
      providerMetricClass: "analytics",
      startTime: "2026-07-16T00:00:00Z",
      endTime: "2026-07-17T00:00:00Z",
      granularity: "hourly",
      requestedMetrics: ["impressions"],
    });
    expect(result.receipts?.map((receipt) => receipt.resourceId)).toEqual(requests);
    expect(result.receipts?.every((receipt) => (receipt.serializedBytes ?? 0) > 0)).toBe(true);
    expect(result.data).not.toHaveProperty("trustedOwnership");
  });

  it("fails owned analytics before the analytics request when a post author mismatches", async () => {
    let requests = 0;
    const mock = await startServer((request, response) => {
      requests += 1;
      const url = new URL(request.url ?? "", "http://x.invalid");
      response.setHeader("content-type", "application/json");
      if (url.pathname === "/2/users/me") {
        response.end(JSON.stringify({ data: { id: "provider-account" } }));
        return;
      }
      expect(url.pathname).toBe("/2/tweets");
      response.end(JSON.stringify({ data: [{ id: "post-1", author_id: "other-account" }] }));
    });
    const client = createXReadTransport({
      apiKey: TOKEN,
      ownedMetricsApiKey: OWNED_TOKEN,
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      retrySleep: async () => undefined,
    });

    const error = await client.metrics
      .owned({
        tweetIds: ["post-1"],
        startTime: "2026-07-16T00:00:00Z",
        endTime: "2026-07-17T00:00:00Z",
        granularity: "daily",
        requestedMetrics: ["impressions"],
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(XTransportError);
    expect(error).toMatchObject({
      kind: "owned_post_author_mismatch",
      category: "ownership",
      requestCount: 2,
    });
    expect(error.receipts).toHaveLength(2);
    expect(requests).toBe(2);
  });

  it("classifies an incomplete authenticated identity response as unsupported", async () => {
    const mock = await startServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: { username: "missing-stable-id" } }));
    });
    const client = createXReadTransport({
      apiKey: TOKEN,
      ownedMetricsApiKey: OWNED_TOKEN,
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      retrySleep: async () => undefined,
    });

    const error = await client.metrics
      .owned({
        tweetIds: ["post-1"],
        startTime: "2026-07-16T00:00:00Z",
        endTime: "2026-07-17T00:00:00Z",
        granularity: "daily",
        requestedMetrics: ["impressions"],
      })
      .catch((value: unknown) => value);

    expect(error).toMatchObject({
      kind: "owned_attribution_unsupported",
      category: "unsupported",
      requestCount: 1,
    });
  });

  it.each([
    [403, "owned_metrics_entitlement", "entitlement"],
    [404, "owned_attribution_unsupported", "unsupported"],
    [503, "server", "provider"],
  ] as const)("classifies owned identity HTTP %i as %s/%s", async (status, kind, category) => {
    const mock = await startServer((_request, response) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "bounded" }));
    });
    const client = createXReadTransport({
      apiKey: TOKEN,
      ownedMetricsApiKey: OWNED_TOKEN,
      baseUrl: mock.baseUrl,
      timeoutMs: 1_000,
      retrySleep: async () => undefined,
    });

    const error = await client.metrics
      .owned({
        tweetIds: ["post-1"],
        startTime: "2026-07-16T00:00:00Z",
        endTime: "2026-07-17T00:00:00Z",
        granularity: "daily",
        requestedMetrics: ["impressions"],
      })
      .catch((value: unknown) => value);

    const expectedRequests = kind === "server" ? 2 : 1;
    expect(error).toMatchObject({ kind, category, requestCount: expectedRequests });
    expect(error.receipts).toHaveLength(expectedRequests);
    if (kind === "server") {
      expect(error.retry).toMatchObject({
        attempts: 2,
        retries: [{ attempt: 1, kind: "server", status: 503 }],
      });
    }
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
    expect(ownedError).toBeInstanceOf(XTransportError);
    expect(ownedError).toMatchObject({
      kind: "owned_metrics_configuration",
      category: "configuration",
      requestCount: 0,
    });
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

  it("rejects unsupported owned-metric fields before resolving credentials or calling X", async () => {
    let credentialResolutions = 0;
    const client = createXReadTransport({
      apiKey: TOKEN,
      resolveOwnedMetricsApiKey: async () => {
        credentialResolutions += 1;
        return OWNED_TOKEN;
      },
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 100,
    });

    const error = await client.metrics
      .owned({
        tweetIds: ["1"],
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-02T00:00:00Z",
        granularity: "hourly",
        requestedMetrics: ["invented_metric"],
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(XTransportError);
    expect(error).toMatchObject({
      kind: "owned_metrics_unsupported_field",
      category: "request",
      requestCount: 0,
    });
    expect(credentialResolutions).toBe(0);
  });
});
