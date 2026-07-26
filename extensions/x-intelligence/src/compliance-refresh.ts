import { randomUUID } from "node:crypto";
import type { OpenClawPluginService } from "openclaw/plugin-sdk/plugin-entry";
import type { XContentCache, XContentCacheActiveEntry } from "./content-cache.js";
import type { XComplianceEventV1, XComplianceEventV1Input } from "./contracts.js";
import type { XEvidenceArtifactWriteResult } from "./evidence-store.js";
import { writeComplianceEvent } from "./evidence-store.js";
import { XTransportError, type XJson, type XReadResult, type XReadTransport } from "./transport.js";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_MAX_IDS_PER_PASS = 100;

type ComplianceTransport = Readonly<{
  posts: Pick<XReadTransport["posts"], "exact">;
  users: Pick<XReadTransport["users"], "identity">;
}>;

type ComplianceEventWriter = (
  input: XComplianceEventV1Input,
) => Promise<XEvidenceArtifactWriteResult<XComplianceEventV1>>;

export type XComplianceRefreshSummary = Readonly<{
  inspected: number;
  unchanged: number;
  edited: number;
  tombstoned: number;
  skipped: number;
  failed: number;
  aborted: boolean;
}>;

function asRecord(value: XJson): Record<string, XJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, XJson>)
    : undefined;
}

function sourceObject(result: XReadResult): Record<string, XJson> | undefined {
  const root = asRecord(result.data);
  const data = root?.data;
  if (Array.isArray(data)) {
    return data[0] === undefined ? undefined : asRecord(data[0]);
  }
  return asRecord(data ?? result.data);
}

function sourceText(entry: XContentCacheActiveEntry, result: XReadResult): string | undefined {
  const source = sourceObject(result);
  if (!source) {
    return undefined;
  }
  const field = entry.key.startsWith("post:") ? source.text : source.description;
  return typeof field === "string" ? field : undefined;
}

function subjectFor(entry: XContentCacheActiveEntry): {
  kind: "post" | "profile";
  id: string;
} | null {
  const separator = entry.key.indexOf(":");
  if (separator < 1 || separator === entry.key.length - 1) {
    return null;
  }
  const kind = entry.key.slice(0, separator);
  if (kind !== "post" && kind !== "profile") {
    return null;
  }
  return { kind, id: entry.key.slice(separator + 1) };
}

async function recordComplianceEvent(params: {
  writeEvent: ComplianceEventWriter;
  type: XComplianceEventV1Input["type"];
  subject: { kind: "post" | "profile"; id: string };
  reasonCodes: readonly string[];
  now: number;
}) {
  return await params.writeEvent({
    eventId: `x-compliance-${randomUUID()}`,
    type: params.type,
    occurredAt: new Date(params.now).toISOString(),
    subject: { kind: params.subject.kind, ids: [params.subject.id] },
    reasonCodes: params.reasonCodes,
  });
}

export async function refreshXComplianceCache(params: {
  cache: XContentCache;
  transport: ComplianceTransport;
  writeEvent: ComplianceEventWriter;
  maxIds?: number;
  now?: () => number;
  signal?: AbortSignal;
}): Promise<XComplianceRefreshSummary> {
  const maxIds = params.maxIds ?? DEFAULT_MAX_IDS_PER_PASS;
  if (!Number.isSafeInteger(maxIds) || maxIds < 1 || maxIds > 1_000) {
    throw new Error("compliance refresh maxIds must be between 1 and 1000");
  }
  const now = params.now ?? Date.now;
  const entries = await params.cache.listActive(maxIds);
  const summary = {
    inspected: 0,
    unchanged: 0,
    edited: 0,
    tombstoned: 0,
    skipped: 0,
    failed: 0,
    aborted: false,
  };

  for (const entry of entries) {
    if (params.signal?.aborted) {
      summary.aborted = true;
      break;
    }
    const subject = subjectFor(entry);
    if (!subject) {
      summary.skipped += 1;
      continue;
    }
    summary.inspected += 1;
    try {
      const result =
        subject.kind === "post"
          ? await params.transport.posts.exact({
              id: subject.id,
              signal: params.signal,
              tweetFields: ["id", "text"],
            })
          : await params.transport.users.identity({
              id: subject.id,
              signal: params.signal,
              userFields: ["id", "description"],
            });
      const nextText = sourceText(entry, result);
      if (nextText === undefined) {
        summary.skipped += 1;
        continue;
      }
      const previousText =
        subject.kind === "post" ? entry.record.postText : entry.record.profileText;
      if (nextText === previousText) {
        await recordComplianceEvent({
          writeEvent: params.writeEvent,
          type: "refresh",
          subject,
          reasonCodes: ["source-current"],
          now: now(),
        });
        summary.unchanged += 1;
        continue;
      }
      await recordComplianceEvent({
        writeEvent: params.writeEvent,
        type: "edit",
        subject,
        reasonCodes: ["source-content-changed"],
        now: now(),
      });
      await params.cache.replaceUntil(
        entry.key,
        subject.kind === "post" ? { postText: nextText } : { profileText: nextText },
        entry.record.expiresAt,
      );
      summary.edited += 1;
    } catch (error) {
      if (params.signal?.aborted) {
        summary.aborted = true;
        break;
      }
      const status = error instanceof XTransportError ? error.receipt?.status : undefined;
      // A 403 can mean a credential-wide authorization problem. Only a stable
      // not-found result is safe to translate into an item tombstone here.
      if (status === 404) {
        const event = await recordComplianceEvent({
          writeEvent: params.writeEvent,
          type: "tombstone",
          subject,
          reasonCodes: ["provider-404"],
          now: now(),
        });
        await params.cache.tombstone(entry.key, "source-unavailable", {
          eventId: event.artifact.eventId,
          type: "tombstone",
          occurredAt: event.artifact.occurredAt,
          reasonCodes: event.artifact.reasonCodes,
          manifestDigest: event.digest,
        });
        summary.tombstoned += 1;
      } else {
        summary.failed += 1;
      }
    }
  }
  return summary;
}

export function createXComplianceRefreshService(params: {
  getCache: (stateDir: string) => Promise<XContentCache>;
  createTransport: () => ComplianceTransport;
  intervalMs?: number;
  maxIdsPerPass?: number;
}): OpenClawPluginService {
  const intervalMs = params.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxIdsPerPass = params.maxIdsPerPass ?? DEFAULT_MAX_IDS_PER_PASS;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000) {
    throw new Error("compliance refresh interval must be at least one minute");
  }
  if (!Number.isSafeInteger(maxIdsPerPass) || maxIdsPerPass < 1 || maxIdsPerPass > 1_000) {
    throw new Error("compliance refresh maxIdsPerPass must be between 1 and 1000");
  }

  let initial: NodeJS.Immediate | undefined;
  let interval: NodeJS.Timeout | undefined;
  let controller: AbortController | undefined;
  let inFlight: Promise<void> | undefined;

  return {
    id: "x-intelligence-compliance-refresh",
    async start(ctx) {
      const activeController = new AbortController();
      controller = activeController;
      const cache = await params.getCache(ctx.stateDir);
      const run = () => {
        if (inFlight || controller?.signal.aborted) {
          return;
        }
        inFlight = refreshXComplianceCache({
          cache,
          transport: params.createTransport(),
          writeEvent: async (input) =>
            await writeComplianceEvent({ input, workspaceDir: ctx.workspaceDir }),
          maxIds: maxIdsPerPass,
          signal: activeController.signal,
        })
          .then((summary) => {
            ctx.logger.info(`x compliance refresh ${JSON.stringify(summary)}`);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "unknown failure";
            ctx.logger.warn(`x compliance refresh failed: ${message}`);
          })
          .finally(() => {
            inFlight = undefined;
          });
      };
      initial = setImmediate(() => {
        initial = undefined;
        run();
      });
      initial.unref?.();
      interval = setInterval(run, intervalMs);
      interval.unref?.();
    },
    async stop() {
      if (initial) {
        clearImmediate(initial);
        initial = undefined;
      }
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
      controller?.abort();
      await inFlight;
      controller = undefined;
    },
  };
}
