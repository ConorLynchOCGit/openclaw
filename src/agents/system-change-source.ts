import path from "node:path";
import { resolveOpenClawPackageRootSync } from "../infra/openclaw-root.js";
import { readLoadedReleaseIdentity } from "../release-manifest-readback.js";
import type { SystemChangeSessionSource } from "./worktrees/types.js";

export const OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV = "OPENCLAW_SYSTEM_SOURCE_ANCHOR";

/** Resolve trusted system-change inputs from service topology and loaded bytes. */
export function resolveLoadedSystemChangeSessionSource(options?: {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
}): SystemChangeSessionSource {
  const env = options?.env ?? process.env;
  const sourceAnchor = env[OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]?.trim();
  if (!sourceAnchor || !path.isAbsolute(sourceAnchor)) {
    throw new Error(`${OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV} must name an absolute source anchor`);
  }
  const packageRoot =
    options?.packageRoot ??
    resolveOpenClawPackageRootSync({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    });
  if (!packageRoot) {
    throw new Error("loaded OpenClaw package root is unavailable");
  }
  const identity = readLoadedReleaseIdentity(packageRoot);
  return {
    sourceAnchorPath: path.resolve(sourceAnchor),
    sourceSnapshotRef: identity.sourceSnapshotRef,
    sourceTreeObject: identity.sourceTreeObject,
    releaseManifestDigest: identity.releaseManifestDigest,
  };
}
