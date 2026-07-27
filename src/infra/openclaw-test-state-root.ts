// Resolves user-scoped OpenClaw test state roots.
import os from "node:os";
import path from "node:path";

function normalizeOwnerLabel(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "") || "unknown";
}

export function resolveOpenClawTestStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPENCLAW_TEST_STATE_ROOT?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const owner =
    uid !== undefined
      ? `uid-${uid}`
      : normalizeOwnerLabel(env.USER ?? env.USERNAME ?? env.LOGNAME ?? "unknown");
  return path.join(os.tmpdir(), "openclaw-test-state", owner);
}
