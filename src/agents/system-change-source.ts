import path from "node:path";
import { requireGit } from "./worktrees/git.js";
import type { SystemChangeSessionSource } from "./worktrees/types.js";

export const OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV = "OPENCLAW_SYSTEM_SOURCE_ANCHOR";

/** Resolve trusted system-change inputs from service topology and loaded bytes. */
export async function resolveLoadedSystemChangeSessionSource(options?: {
  env?: NodeJS.ProcessEnv;
}): Promise<SystemChangeSessionSource> {
  const env = options?.env ?? process.env;
  const sourceAnchor = env[OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]?.trim();
  if (!sourceAnchor || !path.isAbsolute(sourceAnchor)) {
    throw new Error(`${OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV} must name an absolute source anchor`);
  }
  const sourceAnchorPath = path.resolve(sourceAnchor);
  const sourceCommit = await requireGit(sourceAnchorPath, [
    "rev-parse",
    "--verify",
    "HEAD^{commit}",
  ]);
  return {
    sourceAnchorPath,
    sourceCommit,
  };
}
