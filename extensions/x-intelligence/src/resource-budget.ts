import { createHash } from "node:crypto";
import type { PluginStateKeyedStore } from "openclaw/plugin-sdk/plugin-state-runtime";

const DEFAULT_REQUEST_LIMIT = 24;
const BUDGET_TTL_MS = 6 * 60 * 60 * 1_000;

export type XResearchPurpose =
  | "question_research"
  | "topic_pulse"
  | "influence_map"
  | "format_study"
  | "source_verification"
  | "owned_performance";

export type XEpisodeBudgetLimits = Partial<Record<XResearchPurpose, number>>;

type StoredBudget = Readonly<{
  used: number;
  updatedAt: number;
}>;

export type XEpisodeBudgetReceipt = Readonly<{
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
}>;

const queues = new Map<string, Promise<void>>();

function normalizedLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_REQUEST_LIMIT;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("X episode request budgets must be integers from 1 to 100.");
  }
  return value;
}

function keyFor(sessionKey: string, purpose: XResearchPurpose): string {
  return createHash("sha256").update(`${sessionKey}\0${purpose}`).digest("hex");
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const settled = current.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  try {
    return await current;
  } finally {
    if (queues.get(key) === settled) {
      queues.delete(key);
    }
  }
}

export function createEpisodeRequestBudget(params: {
  store: PluginStateKeyedStore<StoredBudget>;
  limits?: XEpisodeBudgetLimits;
  now?: () => number;
}) {
  const limits = Object.fromEntries(
    Object.entries(params.limits ?? {}).map(([purpose, value]) => [
      purpose,
      normalizedLimit(value),
    ]),
  ) as XEpisodeBudgetLimits;
  const now = params.now ?? Date.now;

  return {
    reserve(input: {
      sessionKey: string;
      purpose: XResearchPurpose;
    }): Promise<XEpisodeBudgetReceipt> {
      const limit = normalizedLimit(limits[input.purpose]);
      const key = keyFor(input.sessionKey, input.purpose);
      return serialized(key, async () => {
        const stored = await params.store.lookup(key);
        const used =
          stored && Number.isSafeInteger(stored.used) && stored.used >= 0 ? stored.used : 0;
        if (used >= limit) {
          return { allowed: false, limit, used, remaining: 0 };
        }
        const nextUsed = used + 1;
        await params.store.register(
          key,
          { used: nextUsed, updatedAt: now() },
          { ttlMs: BUDGET_TTL_MS },
        );
        return {
          allowed: true,
          limit,
          used: nextUsed,
          remaining: Math.max(0, limit - nextUsed),
        };
      });
    },
  };
}
