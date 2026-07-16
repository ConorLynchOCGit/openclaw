import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";
import { describe, expect, it } from "vitest";
import { createEpisodeRequestBudget } from "./resource-budget.js";

function memoryStore<T>(): PluginStateKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async registerIfAbsent(key, value) {
      if (values.has(key)) {
        return false;
      }
      values.set(key, value);
      return true;
    },
    async lookup(key) {
      return values.get(key);
    },
    async consume(key) {
      const value = values.get(key);
      values.delete(key);
      return value;
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return Array.from(values, ([key, value]) => ({ key, value, createdAt: 0 }));
    },
    async clear() {
      values.clear();
    },
  };
}

describe("X episode request budget", () => {
  it("serializes parallel reservations and isolates purposes and sessions", async () => {
    const budget = createEpisodeRequestBudget({
      store: memoryStore(),
      limits: { topic_pulse: 2 },
      now: () => 1_700_000_000_000,
    });

    const receipts = await Promise.all(
      Array.from({ length: 3 }, () =>
        budget.reserve({ sessionKey: "agent:x-researcher:one", purpose: "topic_pulse" }),
      ),
    );
    expect(receipts.filter((receipt) => receipt.allowed)).toHaveLength(2);
    expect(receipts.at(-1)).toEqual({ allowed: false, limit: 2, used: 2, remaining: 0 });
    await expect(
      budget.reserve({ sessionKey: "agent:x-researcher:one", purpose: "format_study" }),
    ).resolves.toMatchObject({ allowed: true, used: 1 });
    await expect(
      budget.reserve({ sessionKey: "agent:x-researcher:two", purpose: "topic_pulse" }),
    ).resolves.toMatchObject({ allowed: true, used: 1 });
  });

  it("rejects invalid configured limits", () => {
    expect(() =>
      createEpisodeRequestBudget({ store: memoryStore(), limits: { topic_pulse: 0 } }),
    ).toThrow("integers from 1 to 100");
  });
});
