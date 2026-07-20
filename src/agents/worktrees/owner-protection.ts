import {
  loadSessionStore,
  resolveSessionStoreEntry,
  resolveStorePath,
} from "../../config/sessions.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { IDLE_GC_MS } from "./service.js";
import type { ManagedWorktreeOwnerKind } from "./types.js";

export function createManagedWorktreeOwnerProtection(
  cfg: OpenClawConfig,
  now: () => number = Date.now,
): (ownerKind: ManagedWorktreeOwnerKind, ownerId: string) => boolean {
  return (ownerKind, ownerId) => {
    if (ownerKind !== "session") {
      return false;
    }
    try {
      const agentId = resolveAgentIdFromSessionKey(ownerId);
      const storePath = resolveStorePath(cfg.session?.store, { agentId });
      const store = loadSessionStore(storePath, { clone: false });
      const entry = resolveSessionStoreEntry({ store, sessionKey: ownerId }).existing;
      const activityAt = Math.max(entry?.lastInteractionAt ?? 0, entry?.updatedAt ?? 0);
      return activityAt > 0 && now() - activityAt <= IDLE_GC_MS;
    } catch {
      // GC is destructive. Unknown session state must defer cleanup instead of
      // turning a transient owner lookup failure into worktree removal.
      return true;
    }
  };
}
