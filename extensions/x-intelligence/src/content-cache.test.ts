import type {
  PluginStateEntry,
  PluginStateKeyedStore,
} from "openclaw/plugin-sdk/plugin-state-runtime";
// Tests cover the cache's content-only retention boundary and plugin-state lifecycle.
import { describe, expect, it } from "vitest";
import { createContentCache } from "./content-cache.js";
import { X_CONTENT_CACHE_V1, X_MAX_CACHE_TTL_MS, type XContentCacheEntryV1 } from "./contracts.js";

function createMemoryStore(): {
  store: PluginStateKeyedStore<XContentCacheEntryV1>;
  values: Map<string, PluginStateEntry<XContentCacheEntryV1>>;
  ttlOptions: number[];
} {
  const values = new Map<string, PluginStateEntry<XContentCacheEntryV1>>();
  const ttlOptions: number[] = [];
  return {
    values,
    ttlOptions,
    store: {
      async register(key, value, options) {
        ttlOptions.push(options?.ttlMs ?? 0);
        values.set(key, { key, value, createdAt: 0, expiresAt: options?.ttlMs });
      },
      async registerIfAbsent(key, value, options) {
        if (values.has(key)) {
          return false;
        }
        await this.register(key, value, options);
        return true;
      },
      async lookup(key) {
        return values.get(key)?.value;
      },
      async consume(key) {
        const value = values.get(key)?.value;
        values.delete(key);
        return value;
      },
      async delete(key) {
        return values.delete(key);
      },
      async entries() {
        return Array.from(values.values());
      },
      async clear() {
        values.clear();
      },
    },
  };
}

describe("x content cache", () => {
  it("stores only bounded content/media records with the configured plugin-state TTL", async () => {
    const memory = createMemoryStore();
    const cache = createContentCache({ store: memory.store, ttlMs: 60_000, now: () => 100 });
    const record = await cache.put("post:1", {
      postText: "A bounded post body",
      profileText: "A bounded profile description",
      media: [
        {
          contentType: "image/jpeg",
          url: "https://cdn.example.test/image.jpg?token=discard",
          width: 640,
          height: 480,
        },
      ],
    });

    expect(record).toEqual({
      schema: X_CONTENT_CACHE_V1,
      state: "active",
      cachedAt: 100,
      expiresAt: 60_100,
      postText: "A bounded post body",
      profileText: "A bounded profile description",
      media: [
        {
          contentType: "image/jpeg",
          url: "https://cdn.example.test/image.jpg",
          width: 640,
          height: 480,
        },
      ],
    });
    expect(memory.ttlOptions).toEqual([60_000]);
    expect(Object.isFrozen(record)).toBe(true);
    const secret = "abcdefghijklmnopqrstuvwxyz012345";
    const redacted = await cache.put("post:redacted", {
      postText: `Authorization: Basic ${secret}`,
    });
    expect(redacted.postText).not.toContain(secret);
    await expect(cache.put("post:2", { postText: "x".repeat(16_001) })).rejects.toThrow(/16000/);
    await expect(
      cache.put("post:3", { postText: "ok", credentials: "never" } as never),
    ).rejects.toThrow(/forbidden/i);
  });

  it("rehydrates entries, removes expired values, and keeps tombstones explicit", async () => {
    const memory = createMemoryStore();
    let now = 100;
    const first = createContentCache({ store: memory.store, ttlMs: 50, now: () => now });
    await first.put("post:1", { postText: "original" });
    const second = createContentCache({ store: memory.store, ttlMs: 50, now: () => now });

    expect(await second.hydrate()).toBe(1);
    await expect(second.lookup("post:1")).resolves.toMatchObject({
      kind: "content",
      record: { postText: "original" },
    });
    await second.tombstone("post:1", "deleted-by-source");
    await expect(second.lookup("post:1")).resolves.toMatchObject({
      kind: "tombstone",
      record: { reasonCode: "deleted-by-source" },
    });
    expect(await second.delete("post:1")).toBe(true);
    await expect(second.lookup("post:1")).resolves.toBeUndefined();

    await first.put("post:expired", { postText: "old" });
    now = 151;
    const expired = createContentCache({ store: memory.store, ttlMs: 50, now: () => now });
    expect(await expired.hydrate()).toBe(0);
    expect(memory.values.has("post:expired")).toBe(false);
  });

  it("lists bounded active IDs and refreshes content without extending retention", async () => {
    const memory = createMemoryStore();
    let now = 100;
    const cache = createContentCache({ store: memory.store, ttlMs: 1_000, now: () => now });
    await cache.put("profile:2", { profileText: "second" });
    await cache.put("post:1", { postText: "first" });

    await expect(cache.listActive(1)).resolves.toEqual([
      { key: "post:1", record: expect.objectContaining({ postText: "first" }) },
    ]);
    now = 200;
    const replaced = await cache.replaceUntil("post:1", { postText: "edited" }, 1_100);
    expect(replaced).toMatchObject({ cachedAt: 200, expiresAt: 1_100, postText: "edited" });
    expect(memory.ttlOptions.at(-1)).toBe(900);
    await expect(cache.replaceUntil("post:1", { postText: "extended" }, 1_101)).rejects.toThrow(
      /cannot extend retention/,
    );
    await expect(cache.listActive(1_001)).rejects.toThrow(/between 1 and 1000/);
  });

  it("preserves terminal compliance evidence on a tombstone", async () => {
    const memory = createMemoryStore();
    let now = 100;
    const cache = createContentCache({ store: memory.store, ttlMs: 1_000, now: () => now });
    await cache.put("post:1", { postText: "before removal" });
    now = 200;
    const tombstone = await cache.tombstone("post:1", "source-unavailable", {
      eventId: "event-1",
      type: "tombstone",
      occurredAt: "2026-07-16T00:00:00.000Z",
      reasonCodes: ["provider-404"],
      manifestDigest: "sha256:manifest",
    });

    expect(tombstone).toMatchObject({
      expiresAt: 1_100,
      compliance: { eventId: "event-1", type: "tombstone" },
    });
    expect(memory.ttlOptions.at(-1)).toBe(900);
  });

  it("refuses TTLs beyond 24 hours", () => {
    const memory = createMemoryStore();
    expect(() =>
      createContentCache({ store: memory.store, ttlMs: X_MAX_CACHE_TTL_MS + 1 }),
    ).toThrow(/between 1 and/);
  });
});
