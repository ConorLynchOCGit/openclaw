import type { SessionEntry } from "./types.js";
import { normalizeSessionVisibilityMetadata } from "./visibility.js";

export function applySessionStoreMigrations(store: Record<string, SessionEntry>): void {
  // Best-effort migration: message provider → channel naming.
  for (const [key, entry] of Object.entries(store)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const rec = entry as unknown as Record<string, unknown>;
    if (typeof rec.channel !== "string" && typeof rec.provider === "string") {
      rec.channel = rec.provider;
      delete rec.provider;
    }
    if (typeof rec.lastChannel !== "string" && typeof rec.lastProvider === "string") {
      rec.lastChannel = rec.lastProvider;
      delete rec.lastProvider;
    }

    // Best-effort migration: legacy `room` field → `groupChannel` (keep value, prune old key).
    if (typeof rec.groupChannel !== "string" && typeof rec.room === "string") {
      rec.groupChannel = rec.room;
      delete rec.room;
    } else if ("room" in rec) {
      delete rec.room;
    }

    const normalized = normalizeSessionVisibilityMetadata({
      key,
      entry,
    });
    if (normalized !== entry) {
      store[key] = normalized;
    }
  }
}
