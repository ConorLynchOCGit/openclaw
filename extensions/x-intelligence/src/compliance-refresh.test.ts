import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  PluginStateEntry,
  PluginStateKeyedStore,
} from "openclaw/plugin-sdk/plugin-state-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createXComplianceRefreshService, refreshXComplianceCache } from "./compliance-refresh.js";
import { createContentCache } from "./content-cache.js";
import type { XContentCacheEntryV1 } from "./contracts.js";
import { writeComplianceEvent } from "./evidence-store.js";
import { XTransportError, type XReadResult } from "./transport.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function memoryStore(): PluginStateKeyedStore<XContentCacheEntryV1> {
  const values = new Map<string, PluginStateEntry<XContentCacheEntryV1>>();
  return {
    async register(key, value, options) {
      values.set(key, { key, value, createdAt: Date.now(), expiresAt: options?.ttlMs });
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
  };
}

function result(data: Record<string, unknown>): XReadResult {
  return {
    data: { data } as never,
    receipt: { status: 200, rateLimit: {} },
  };
}

describe("x compliance refresh", () => {
  it("refreshes, replaces, and tombstones active cached IDs without extending retention", async () => {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-compliance-refresh-"));
    tempDirs.push(artifactsDir);
    let now = 100;
    const cache = createContentCache({ store: memoryStore(), ttlMs: 1_000, now: () => now });
    await cache.put("post:1", { postText: "unchanged" });
    await cache.put("post:2", { postText: "old" });
    await cache.put("profile:3", { profileText: "removed" });
    now = 200;

    const summary = await refreshXComplianceCache({
      cache,
      now: () => now,
      writeEvent: async (input) => await writeComplianceEvent({ input, artifactsDir }),
      transport: {
        posts: {
          exact: async ({ id }) =>
            id === "1" ? result({ id, text: "unchanged" }) : result({ id, text: "edited" }),
        },
        users: {
          identity: async () => {
            throw new XTransportError("unexpected_response", {
              receipt: { status: 404, rateLimit: {} },
              requestCount: 1,
            });
          },
        },
      },
    });

    expect(summary).toEqual({
      inspected: 3,
      unchanged: 1,
      edited: 1,
      tombstoned: 1,
      skipped: 0,
      failed: 0,
      aborted: false,
    });
    await expect(cache.lookup("post:2")).resolves.toMatchObject({
      kind: "content",
      record: { postText: "edited", expiresAt: 1_100 },
    });
    await expect(cache.lookup("profile:3")).resolves.toMatchObject({
      kind: "tombstone",
      record: {
        expiresAt: 1_100,
        compliance: { type: "tombstone", reasonCodes: ["provider-404"] },
      },
    });
    expect(await fs.readdir(artifactsDir)).toHaveLength(3);
  });

  it("does not infer item removal from a provider-wide authorization failure", async () => {
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), "x-compliance-auth-"));
    tempDirs.push(artifactsDir);
    const cache = createContentCache({ store: memoryStore(), ttlMs: 1_000, now: () => 100 });
    await cache.put("post:1", { postText: "retain" });

    const summary = await refreshXComplianceCache({
      cache,
      writeEvent: async (input) => await writeComplianceEvent({ input, artifactsDir }),
      transport: {
        posts: {
          exact: async () => {
            throw new XTransportError("authentication", {
              receipt: { status: 403, rateLimit: {} },
              requestCount: 1,
            });
          },
        },
        users: { identity: async () => result({ id: "unused", description: "unused" }) },
      },
    });

    expect(summary.failed).toBe(1);
    await expect(cache.lookup("post:1")).resolves.toMatchObject({
      kind: "content",
      record: { postText: "retain" },
    });
    expect(await fs.readdir(artifactsDir)).toEqual([]);
  });

  it("keeps the native service single-flight and aborts its in-flight request on stop", async () => {
    vi.useFakeTimers();
    const cache = createContentCache({ store: memoryStore(), ttlMs: 1_000, now: () => 100 });
    await cache.put("post:1", { postText: "pending" });
    let calls = 0;
    const service = createXComplianceRefreshService({
      getCache: async () => cache,
      intervalMs: 60_000,
      maxIdsPerPass: 1,
      createTransport: () => ({
        posts: {
          exact: async ({ signal }) => {
            calls += 1;
            return await new Promise<XReadResult>((_resolve, reject) => {
              signal?.addEventListener("abort", () => reject(new XTransportError("aborted")), {
                once: true,
              });
            });
          },
        },
        users: { identity: async () => result({ id: "unused", description: "unused" }) },
      }),
    });
    const context = {
      stateDir: "/tmp/state",
      workspaceDir: "/tmp/workspace",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      config: {},
    } as never;

    await service.start(context);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1);
    await service.stop?.(context);
    expect(calls).toBe(1);
  });
});
