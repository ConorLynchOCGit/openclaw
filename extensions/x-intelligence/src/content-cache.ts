// Bounded content cache: the only x-intelligence surface permitted to retain post/profile text.
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import {
  X_CONTENT_CACHE_V1,
  X_MAX_CACHE_TTL_MS,
  createContentCacheRecord,
  createContentCacheTombstone,
  type XContentCacheEntryV1,
  type XContentCacheInput,
  type XContentCacheRecordV1,
  type XContentCacheTombstoneV1,
} from "./contracts.js";

export { X_MAX_CACHE_TTL_MS } from "./contracts.js";

export type XContentCacheLookup =
  | Readonly<{ kind: "content"; record: XContentCacheRecordV1 }>
  | Readonly<{ kind: "tombstone"; record: XContentCacheTombstoneV1 }>
  | undefined;

export type XContentCacheActiveEntry = Readonly<{
  key: string;
  record: XContentCacheRecordV1;
}>;

export type XContentCache = Readonly<{
  hydrate: () => Promise<number>;
  put: (key: string, input: XContentCacheInput) => Promise<XContentCacheRecordV1>;
  replaceUntil: (
    key: string,
    input: XContentCacheInput,
    expiresAt: number,
  ) => Promise<XContentCacheRecordV1>;
  lookup: (key: string) => Promise<XContentCacheLookup>;
  listActive: (limit?: number) => Promise<readonly XContentCacheActiveEntry[]>;
  delete: (key: string) => Promise<boolean>;
  tombstone: (
    key: string,
    reasonCode: string,
    compliance?: XContentCacheTombstoneV1["compliance"],
  ) => Promise<XContentCacheTombstoneV1>;
}>;

export function createContentCache(params: {
  store: PluginStateKeyedStore<XContentCacheEntryV1>;
  ttlMs?: number;
  now?: () => number;
}): XContentCache {
  const ttlMs = params.ttlMs ?? X_MAX_CACHE_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > X_MAX_CACHE_TTL_MS) {
    throw new Error(`ttlMs must be between 1 and ${X_MAX_CACHE_TTL_MS}`);
  }
  const now = params.now ?? Date.now;
  const entries = new Map<string, XContentCacheEntryV1>();

  function assertKey(key: string): string {
    if (typeof key !== "string" || !key.trim() || key.length > 512) {
      throw new Error("content cache key must be a non-empty bounded string");
    }
    return key;
  }

  function usable(entry: XContentCacheEntryV1 | undefined): entry is XContentCacheEntryV1 {
    return Boolean(
      entry &&
      entry.schema === X_CONTENT_CACHE_V1 &&
      Number.isSafeInteger(entry.cachedAt) &&
      Number.isSafeInteger(entry.expiresAt) &&
      entry.expiresAt > now(),
    );
  }

  function toLookup(entry: XContentCacheEntryV1): XContentCacheLookup {
    return entry.state === "active"
      ? { kind: "content", record: entry }
      : { kind: "tombstone", record: entry };
  }

  async function load(key: string): Promise<XContentCacheEntryV1 | undefined> {
    const cached = entries.get(key);
    if (usable(cached)) {
      return cached;
    }
    if (cached) {
      entries.delete(key);
      await params.store.delete(key);
      return undefined;
    }
    const persisted = await params.store.lookup(key);
    if (!usable(persisted)) {
      if (persisted) {
        await params.store.delete(key);
      }
      return undefined;
    }
    entries.set(key, persisted);
    return persisted;
  }

  async function hydrate(): Promise<number> {
    entries.clear();
    const persisted = await params.store.entries();
    await Promise.all(
      persisted.map(async (entry) => {
        if (usable(entry.value)) {
          entries.set(entry.key, entry.value);
        } else {
          await params.store.delete(entry.key);
        }
      }),
    );
    return entries.size;
  }

  return {
    hydrate,
    async put(key, input) {
      const normalizedKey = assertKey(key);
      const record = createContentCacheRecord({ input, cachedAt: now(), ttlMs });
      await params.store.register(normalizedKey, record, { ttlMs });
      entries.set(normalizedKey, record);
      return record;
    },
    async replaceUntil(key, input, expiresAt) {
      const normalizedKey = assertKey(key);
      const current = await load(normalizedKey);
      if (!current || current.state !== "active") {
        throw new Error("content cache replacement requires an active entry");
      }
      const currentTime = now();
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= currentTime) {
        throw new Error("content cache replacement expiry must be a future safe integer");
      }
      if (expiresAt > current.expiresAt || expiresAt - currentTime > X_MAX_CACHE_TTL_MS) {
        throw new Error("content cache replacement cannot extend retention");
      }
      const remainingTtlMs = expiresAt - currentTime;
      const record = createContentCacheRecord({
        input,
        cachedAt: currentTime,
        ttlMs: remainingTtlMs,
      });
      await params.store.register(normalizedKey, record, { ttlMs: remainingTtlMs });
      entries.set(normalizedKey, record);
      return record;
    },
    async lookup(key) {
      const normalizedKey = assertKey(key);
      const entry = await load(normalizedKey);
      return entry ? toLookup(entry) : undefined;
    },
    async listActive(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
        throw new Error("content cache active-entry limit must be between 1 and 1000");
      }
      const active: XContentCacheActiveEntry[] = [];
      for (const key of Array.from(entries.keys()).toSorted()) {
        const entry = await load(key);
        if (entry?.state === "active") {
          active.push({ key, record: entry });
        }
        if (active.length >= limit) {
          break;
        }
      }
      return active;
    },
    async delete(key) {
      const normalizedKey = assertKey(key);
      entries.delete(normalizedKey);
      return await params.store.delete(normalizedKey);
    },
    async tombstone(key, reasonCode, compliance) {
      const normalizedKey = assertKey(key);
      const currentTime = now();
      const existing = await load(normalizedKey);
      const remainingTtlMs = existing ? Math.max(1, existing.expiresAt - currentTime) : ttlMs;
      const tombstone = createContentCacheTombstone({
        cachedAt: currentTime,
        ttlMs: remainingTtlMs,
        reasonCode,
        compliance,
      });
      await params.store.register(normalizedKey, tombstone, { ttlMs: remainingTtlMs });
      entries.set(normalizedKey, tombstone);
      return tombstone;
    },
  };
}
