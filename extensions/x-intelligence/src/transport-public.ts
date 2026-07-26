import { Client } from "@xdevplatform/xdk";
import type { KeyedAsyncQueue } from "openclaw/plugin-sdk/keyed-async-queue";
import {
  appendFields,
  assertXRecentWindow,
  boundedFields,
  boundedId,
  boundedQuery,
  boundedString,
  collectionOptions,
  countOptions,
  MAX_PAGE_SIZE,
  postFieldOptions,
  postSearchOptions,
  relationshipOptions,
  timelineOptions,
  trendOptions,
  userFieldOptions,
  userSearchOptions,
  XTransportError,
  type XCountInput,
  type XPostBatchInput,
  type XPostByIdInput,
  type XPostCollectionInput,
  type XPostSearchInput,
  type XPublicMetricsInput,
  type XReadResult,
  type XRelationshipInput,
  type XRequestOptions,
  type XTimelineInput,
  type XTrendInput,
  type XUsageInput,
  type XUserBatchInput,
  type XUserIdentityInput,
  type XUserSearchInput,
} from "./transport-contracts.js";
import { XHttpReader, type XdkRawRequestOptions, type XdkReadClient } from "./transport-http.js";

const X_ARCHIVE_SEARCH_MIN_INTERVAL_MS = 1_000;

type XArchiveSearchGate = {
  tail: Promise<void>;
  nextDispatchAt: number;
};

type XPublicReadTransportOptions = Readonly<{
  baseUrl: string;
  publicCredential: string;
  timeoutMs?: number;
  requestQueue: KeyedAsyncQueue;
  reader: XHttpReader;
}>;

const ARCHIVE_SEARCH_GATES = new Map<string, XArchiveSearchGate>();

export class XPublicReadTransport {
  readonly posts: {
    recent: (input: XPostSearchInput) => Promise<XReadResult>;
    archive: (input: XPostSearchInput) => Promise<XReadResult>;
    exact: (input: XPostByIdInput) => Promise<XReadResult>;
    batch: (input: XPostBatchInput) => Promise<XReadResult>;
    thread: (input: XPostCollectionInput) => Promise<XReadResult>;
    quotes: (input: XPostCollectionInput) => Promise<XReadResult>;
    replies: (input: XPostCollectionInput) => Promise<XReadResult>;
  };
  readonly counts: {
    recent: (input: XCountInput) => Promise<XReadResult>;
    all: (input: XCountInput) => Promise<XReadResult>;
  };
  readonly users: {
    search: (input: XUserSearchInput) => Promise<XReadResult>;
    identity: (input: XUserIdentityInput) => Promise<XReadResult>;
    identityBatch: (input: XUserBatchInput) => Promise<XReadResult>;
    followers: (input: XRelationshipInput) => Promise<XReadResult>;
    following: (input: XRelationshipInput) => Promise<XReadResult>;
  };
  readonly timelines: {
    authored: (input: XTimelineInput) => Promise<XReadResult>;
    reverseChronological: (input: XTimelineInput) => Promise<XReadResult>;
  };
  readonly trends: {
    byLocation: (input: XTrendInput & { woeid: number }) => Promise<XReadResult>;
    personalized: (input?: XTrendInput) => Promise<XReadResult>;
  };
  readonly metrics: {
    public: (input: XPublicMetricsInput) => Promise<XReadResult>;
    usage: (input?: XUsageInput) => Promise<XReadResult>;
  };

  private readonly publicClient: XdkReadClient;
  private readonly baseUrl: string;
  private readonly requestQueue: KeyedAsyncQueue;
  private readonly reader: XHttpReader;
  private readonly inFlightPublicReads = new Map<string, Promise<XReadResult>>();
  private readonly signalIds = new WeakMap<AbortSignal, number>();
  private nextSignalId = 1;

  constructor(options: XPublicReadTransportOptions) {
    this.baseUrl = options.baseUrl;
    this.requestQueue = options.requestQueue;
    this.reader = options.reader;
    this.publicClient = new Client({
      baseUrl: options.baseUrl,
      bearerToken: options.publicCredential,
      ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
      retry: false,
    });

    this.posts = {
      recent: (input) => this.search("recent", input),
      archive: (input) => this.search("archive", input),
      exact: (input) => this.readPostById(input),
      batch: (input) => this.readPostsByIds(input),
      thread: (input) =>
        this.search("recent", {
          ...input,
          query: `conversation_id:${boundedId(input.id)}`,
          sortOrder: "recency",
        }),
      quotes: (input) => this.readPostCollection(input),
      replies: (input) =>
        this.search("recent", {
          ...input,
          query: `conversation_id:${boundedId(input.id)} is:reply`,
          sortOrder: "recency",
        }),
    };
    this.counts = {
      recent: (input) => this.count("recent", input),
      all: (input) => this.count("all", input),
    };
    this.users = {
      search: (input) => this.userSearch(input),
      identity: (input) => this.userIdentity(input),
      identityBatch: (input) => this.userIdentityBatch(input),
      followers: (input) => this.relationship("followers", input),
      following: (input) => this.relationship("following", input),
    };
    this.timelines = {
      authored: (input) => this.timeline("authored", input),
      reverseChronological: (input) => this.timeline("reverse_chronological", input),
    };
    this.trends = {
      byLocation: (input) => this.trendByLocation(input),
      personalized: (input = {}) => this.personalizedTrends(input),
    };
    this.metrics = {
      public: (input) => this.publicMetrics(input),
      usage: (input = {}) => this.usage(input),
    };
  }

  private search(kind: "recent" | "archive", input: XPostSearchInput): Promise<XReadResult> {
    const query = boundedQuery(input.query);
    const options = postSearchOptions(input);
    if (kind === "recent") {
      assertXRecentWindow(input);
      return this.readPublic(input, "posts.search.recent", (requestOptions) =>
        this.publicClient.posts.searchRecent(query, { ...options, requestOptions }),
      );
    }
    return this.scheduleArchiveSearch(input, () =>
      this.readPublic(input, "posts.search.archive", (requestOptions) =>
        this.publicClient.posts.searchAll(query, { ...options, requestOptions }),
      ),
    );
  }

  private count(kind: "recent" | "all", input: XCountInput): Promise<XReadResult> {
    const query = boundedQuery(input.query);
    const options = countOptions(input);
    if (kind === "recent") {
      assertXRecentWindow(input);
    }
    return this.dedupePublicRead(
      input.signal,
      `counts:${kind}:${query}:${JSON.stringify(options)}`,
      () =>
        this.readPublic(input, `posts.counts.${kind}`, (requestOptions) =>
          kind === "recent"
            ? this.publicClient.posts.getCountsRecent(query, { ...options, requestOptions })
            : this.publicClient.posts.getCountsAll(query, { ...options, requestOptions }),
        ),
    );
  }

  private async scheduleArchiveSearch(
    input: XRequestOptions,
    dispatch: () => Promise<XReadResult>,
  ): Promise<XReadResult> {
    const gate = archiveSearchGate(this.baseUrl);
    const preceding = gate.tail;
    let release = () => {};
    gate.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    let request: Promise<XReadResult>;
    try {
      while (gate.nextDispatchAt > Date.now()) {
        await waitForArchiveDispatch(gate.nextDispatchAt - Date.now(), input.signal);
      }
      gate.nextDispatchAt = Date.now() + X_ARCHIVE_SEARCH_MIN_INTERVAL_MS;
      request = dispatch();
    } finally {
      release();
    }
    try {
      return await request;
    } catch (error) {
      if (error instanceof XTransportError && error.kind === "rate_limited") {
        const resetSeconds = Number(error.receipt?.rateLimit.reset);
        if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
          gate.nextDispatchAt = Math.max(gate.nextDispatchAt, resetSeconds * 1_000 + 1);
        }
      }
      throw error;
    }
  }

  private readPostById(input: XPostByIdInput): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = postFieldOptions(input);
    return this.readPublic(input, "posts.lookup", (requestOptions) =>
      this.publicClient.posts.getById(id, { ...options, requestOptions }),
    );
  }

  private readPostsByIds(input: XPostBatchInput): Promise<XReadResult> {
    if (input.ids.length < 1 || input.ids.length > MAX_PAGE_SIZE) {
      throw new XTransportError("bad_request");
    }
    const ids = input.ids.map(boundedId);
    if (new Set(ids).size !== ids.length) {
      throw new XTransportError("bad_request");
    }
    const options = postFieldOptions(input);
    return this.dedupePublicRead(
      input.signal,
      `posts.batch:${ids.join(",")}:${JSON.stringify(options)}`,
      () =>
        this.readPublic(input, "posts.lookup", (requestOptions) =>
          this.publicClient.posts.getByIds(ids, { ...options, requestOptions }),
        ),
    );
  }

  private readPostCollection(input: XPostCollectionInput): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = collectionOptions(input);
    return this.readPublic(input, "posts.quoted", (requestOptions) =>
      this.publicClient.posts.getQuoted(id, { ...options, requestOptions }),
    );
  }

  private userSearch(input: XUserSearchInput): Promise<XReadResult> {
    const query = boundedString(input.query, "user search query", 50);
    const options = userSearchOptions(input);
    const params = new URLSearchParams({ query, max_results: String(options.maxResults) });
    if (options.paginationToken) {
      params.set("next_token", options.paginationToken);
    }
    appendFields(params, "user.fields", options.userFields);
    appendFields(params, "expansions", options.expansions);
    appendFields(params, "tweet.fields", options.tweetFields);
    // XDK 0.5's generated users.search metadata omits current app-only Bearer
    // auth. Keep the official XDK client/HTTP path and supply the endpoint's
    // documented security requirement through its generic request method.
    return this.readPublic(input, "users.search", (requestOptions) =>
      this.publicClient.request<Response>("GET", `/2/users/search?${params.toString()}`, {
        ...requestOptions,
        security: [{ BearerToken: [] }],
      }),
    );
  }

  private userIdentity(input: XUserIdentityInput): Promise<XReadResult> {
    if (Boolean(input.id) === Boolean(input.username)) {
      throw new XTransportError("bad_request");
    }
    const options = userFieldOptions(input);
    return this.readPublic(input, "users.lookup", (requestOptions) =>
      input.id
        ? this.publicClient.users.getById(boundedId(input.id), { ...options, requestOptions })
        : this.publicClient.users.getByUsername(boundedId(input.username as string), {
            ...options,
            requestOptions,
          }),
    );
  }

  private userIdentityBatch(input: XUserBatchInput): Promise<XReadResult> {
    if (Boolean(input.ids) === Boolean(input.usernames)) {
      throw new XTransportError("bad_request");
    }
    const values = (input.ids ?? input.usernames ?? []).map(boundedId);
    if (
      values.length < 1 ||
      values.length > MAX_PAGE_SIZE ||
      new Set(values).size !== values.length
    ) {
      throw new XTransportError("bad_request");
    }
    const options = userFieldOptions(input);
    return this.readPublic(input, "users.lookup", (requestOptions) =>
      input.ids
        ? this.publicClient.users.getByIds(values, { ...options, requestOptions })
        : this.publicClient.users.getByUsernames(values, { ...options, requestOptions }),
    );
  }

  private relationship(
    kind: "followers" | "following",
    input: XRelationshipInput,
  ): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = relationshipOptions(input);
    return this.readPublic(input, `users.relationship.${kind}`, (requestOptions) =>
      kind === "followers"
        ? this.publicClient.users.getFollowers(id, { ...options, requestOptions })
        : this.publicClient.users.getFollowing(id, { ...options, requestOptions }),
    );
  }

  private timeline(
    kind: "authored" | "reverse_chronological",
    input: XTimelineInput,
  ): Promise<XReadResult> {
    const id = boundedId(input.id);
    const options = timelineOptions(input);
    return this.readPublic(input, `users.timeline.${kind}`, (requestOptions) =>
      kind === "authored"
        ? this.publicClient.users.getPosts(id, { ...options, requestOptions })
        : this.publicClient.users.getTimeline(id, { ...options, requestOptions }),
    );
  }

  private trendByLocation(input: XTrendInput & { woeid: number }): Promise<XReadResult> {
    if (!Number.isSafeInteger(input.woeid) || input.woeid < 1) {
      throw new XTransportError("bad_request");
    }
    const options = trendOptions(input);
    return this.readPublic(input, "trends.location", (requestOptions) =>
      this.publicClient.trends.getByWoeid(input.woeid, { ...options, requestOptions }),
    );
  }

  private personalizedTrends(input: XTrendInput): Promise<XReadResult> {
    const personalizedTrendFields = boundedFields(input.trendFields);
    return this.readPublic(input, "trends.personalized", (requestOptions) =>
      this.publicClient.trends.getPersonalized({ personalizedTrendFields, requestOptions }),
    );
  }

  private publicMetrics(input: XPublicMetricsInput): Promise<XReadResult> {
    if (input.ids.length < 1 || input.ids.length > MAX_PAGE_SIZE) {
      throw new XTransportError("bad_request");
    }
    const ids = input.ids.map(boundedId);
    return this.dedupePublicRead(input.signal, `metrics.public:${ids.join(",")}`, () =>
      this.readPublic(input, "posts.lookup", (requestOptions) =>
        this.publicClient.posts.getByIds(ids, {
          tweetFields: ["author_id", "created_at", "public_metrics"],
          requestOptions,
        }),
      ),
    );
  }

  private usage(input: XUsageInput): Promise<XReadResult> {
    const days = input.days ?? 7;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new XTransportError("bad_request");
    }
    return this.readPublic(input, "usage", (requestOptions) =>
      this.publicClient.usage.get({ days, requestOptions }),
    );
  }

  private readPublic(
    options: XRequestOptions,
    lane: string,
    request: (requestOptions: XdkRawRequestOptions) => Promise<Response>,
  ): Promise<XReadResult> {
    return this.requestQueue.enqueue(lane, () => this.reader.read(request, options));
  }

  private signalScope(signal: AbortSignal | undefined): string {
    if (!signal) {
      return "none";
    }
    const existing = this.signalIds.get(signal);
    if (existing !== undefined) {
      return String(existing);
    }
    const id = this.nextSignalId++;
    this.signalIds.set(signal, id);
    return String(id);
  }

  private dedupePublicRead(
    signal: AbortSignal | undefined,
    key: string,
    read: () => Promise<XReadResult>,
  ): Promise<XReadResult> {
    const scopedKey = `${this.signalScope(signal)}:${key}`;
    const existing = this.inFlightPublicReads.get(scopedKey);
    if (existing) {
      return existing;
    }
    const current = read();
    this.inFlightPublicReads.set(scopedKey, current);
    const cleanup = () => {
      if (this.inFlightPublicReads.get(scopedKey) === current) {
        this.inFlightPublicReads.delete(scopedKey);
      }
    };
    void current.then(cleanup, cleanup);
    return current;
  }
}

function archiveSearchGate(baseUrl: string): XArchiveSearchGate {
  const existing = ARCHIVE_SEARCH_GATES.get(baseUrl);
  if (existing) {
    return existing;
  }
  const gate = { tail: Promise.resolve(), nextDispatchAt: 0 };
  ARCHIVE_SEARCH_GATES.set(baseUrl, gate);
  return gate;
}

async function waitForArchiveDispatch(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new XTransportError("aborted", { category: "provider", requestCount: 0 });
  }
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new XTransportError("aborted", { category: "provider", requestCount: 0 }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
