import fs from "node:fs/promises";
import path from "node:path";
import { createXReadTransport, XTransportError, type XReadResult } from "../src/transport.js";

type ProbeStatus = "complete" | "unsupported" | "unavailable" | "failed" | "skipped";

type ProbeResult = {
  operation: string;
  status: ProbeStatus;
  durationMs: number;
  providerStatus?: number;
  resourceId?: string;
  resultCount?: number;
  responseKeys?: string[];
  hasContinuation?: boolean;
  rateLimit?: { limit?: string; remaining?: string; reset?: string };
  errorKind?: string;
};

const ALLOW_LIVE_FLAG = "--allow-live";
const OUTPUT_FLAG = "--output";
const MAX_RESULTS = 10;

function outputPath(): string | undefined {
  const index = process.argv.indexOf(OUTPUT_FLAG);
  const candidate = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return candidate || undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function resultCount(data: unknown): number | undefined {
  const root = objectRecord(data);
  const meta = objectRecord(root?.meta);
  if (typeof meta?.result_count === "number") {
    return meta.result_count;
  }
  if (Array.isArray(root?.data)) {
    return root.data.length;
  }
  return root?.data === undefined ? undefined : 1;
}

function firstDataId(data: unknown): string | undefined {
  const root = objectRecord(data);
  const payload = root?.data;
  const first = Array.isArray(payload) ? objectRecord(payload[0]) : objectRecord(payload);
  return typeof first?.id === "string" ? first.id : undefined;
}

function successful(operation: string, durationMs: number, result: XReadResult): ProbeResult {
  const root = objectRecord(result.data);
  return {
    operation,
    status: "complete",
    durationMs,
    providerStatus: result.receipt.status,
    ...(result.receipt.resourceId ? { resourceId: result.receipt.resourceId } : {}),
    ...(resultCount(result.data) !== undefined ? { resultCount: resultCount(result.data) } : {}),
    responseKeys: root ? Object.keys(root).toSorted().slice(0, 24) : [],
    hasContinuation: Boolean(result.nextToken),
    rateLimit: result.receipt.rateLimit,
  };
}

function failed(operation: string, durationMs: number, error: unknown): ProbeResult {
  if (error instanceof XTransportError) {
    const unsupported =
      error.receipt?.status === 401 ||
      error.receipt?.status === 403 ||
      error.receipt?.status === 404;
    return {
      operation,
      status:
        error.kind === "authentication" && !error.receipt
          ? "unavailable"
          : unsupported
            ? "unsupported"
            : "failed",
      durationMs,
      ...(error.receipt?.status ? { providerStatus: error.receipt.status } : {}),
      ...(error.receipt?.resourceId ? { resourceId: error.receipt.resourceId } : {}),
      ...(error.receipt?.rateLimit ? { rateLimit: error.receipt.rateLimit } : {}),
      errorKind: error.kind,
    };
  }
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "unknown";
  return {
    operation,
    status: code === "credential_unavailable" ? "unavailable" : "failed",
    durationMs,
    errorKind: code,
  };
}

async function probe(
  results: ProbeResult[],
  operation: string,
  invoke: () => Promise<XReadResult>,
): Promise<XReadResult | undefined> {
  const startedAt = Date.now();
  try {
    const result = await invoke();
    results.push(successful(operation, Date.now() - startedAt, result));
    return result;
  } catch (error) {
    results.push(failed(operation, Date.now() - startedAt, error));
    return undefined;
  }
}

async function main() {
  if (!process.argv.includes(ALLOW_LIVE_FLAG)) {
    throw new Error(`Refusing live X requests without ${ALLOW_LIVE_FLAG}.`);
  }
  const startedAt = new Date().toISOString();
  const transport = createXReadTransport({ timeoutMs: 30_000 });
  const results: ProbeResult[] = [];
  const recent = await probe(results, "posts.recent", () =>
    transport.posts.recent({
      query: "from:XDevelopers -is:retweet",
      maxResults: MAX_RESULTS,
      sortOrder: "recency",
      tweetFields: ["id", "created_at", "public_metrics", "attachments"],
      expansions: ["attachments.media_keys"],
      mediaFields: ["media_key", "type"],
    }),
  );
  await probe(results, "posts.archive", () =>
    transport.posts.archive({
      query: "from:XDevelopers -is:retweet",
      maxResults: MAX_RESULTS,
      sortOrder: "recency",
      tweetFields: ["id", "created_at"],
    }),
  );
  await probe(results, "counts.recent", () =>
    transport.counts.recent({ query: "open source", granularity: "hour" }),
  );
  await probe(results, "counts.all", () =>
    transport.counts.all({ query: "open source", granularity: "day" }),
  );
  const identity = await probe(results, "users.identity", () =>
    transport.users.identity({
      username: "XDevelopers",
      userFields: ["id", "username", "created_at", "public_metrics", "verified"],
    }),
  );
  await probe(results, "users.search", () =>
    transport.users.search({ query: "X Developers", maxResults: MAX_RESULTS }),
  );
  const userId = identity ? firstDataId(identity.data) : undefined;
  if (userId) {
    await probe(results, "users.following", () =>
      transport.users.following({ id: userId, maxResults: MAX_RESULTS }),
    );
    await probe(results, "timelines.authored", () =>
      transport.timelines.authored({
        id: userId,
        maxResults: MAX_RESULTS,
        tweetFields: ["id", "created_at", "public_metrics"],
      }),
    );
  } else {
    results.push(
      ...["users.following", "timelines.authored"].map((operation) => ({
        operation,
        status: "skipped" as const,
        durationMs: 0,
        errorKind: "identity_prerequisite_missing",
      })),
    );
  }
  const postId = recent ? firstDataId(recent.data) : undefined;
  if (postId) {
    await probe(results, "posts.exact", () =>
      transport.posts.exact({ id: postId, tweetFields: ["id", "created_at", "public_metrics"] }),
    );
    await probe(results, "posts.thread", () =>
      transport.posts.thread({ id: postId, maxResults: MAX_RESULTS }),
    );
    await probe(results, "posts.quotes", () =>
      transport.posts.quotes({ id: postId, maxResults: MAX_RESULTS }),
    );
    await probe(results, "posts.replies", () =>
      transport.posts.replies({ id: postId, maxResults: MAX_RESULTS }),
    );
    await probe(results, "metrics.public", () => transport.metrics.public({ ids: [postId] }));
    await probe(results, "metrics.owned", () =>
      transport.metrics.owned({
        tweetIds: [postId],
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
        endTime: new Date().toISOString(),
        granularity: "hour",
        requestedMetrics: ["impressions", "engagements"],
      }),
    );
  } else {
    results.push(
      ...["posts.exact", "posts.thread", "posts.quotes", "posts.replies", "metrics.public"].map(
        (operation) => ({
          operation,
          status: "skipped" as const,
          durationMs: 0,
          errorKind: "post_prerequisite_missing",
        }),
      ),
    );
  }
  await probe(results, "trends.by_location", () =>
    transport.trends.byLocation({ woeid: 1, maxResults: MAX_RESULTS }),
  );
  await probe(results, "trends.personalized", () => transport.trends.personalized());
  await probe(results, "usage", () => transport.metrics.usage({ days: 7 }));

  const report = {
    schema: "openclaw.x_capability_probe.v1",
    purpose: "bounded_validation",
    startedAt,
    completedAt: new Date().toISOString(),
    transport: "official-xdk",
    xdkVersion: "0.5.0",
    mutationOperationsRegistered: 0,
    requestCap: results.length,
    resultCapPerOperation: MAX_RESULTS,
    results,
    summary: Object.fromEntries(
      ["complete", "unsupported", "unavailable", "failed", "skipped"].map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ]),
    ),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const target = outputPath();
  if (target) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}

await main();
