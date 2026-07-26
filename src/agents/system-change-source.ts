import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";

export const SYSTEM_SOURCE_ANCHOR_ENV = "OPENCLAW_SOURCE_TREE_PATH";

export type LoadedSystemSource = {
  sourceAnchorPath: string;
  sourceCommit: string;
};

async function readLoadedSourceCommit(packageRoot: string): Promise<string> {
  const buildInfoPath = path.join(packageRoot, "dist", "build-info.json");
  const parsed = JSON.parse(await fs.readFile(buildInfoPath, "utf8")) as { commit?: unknown };
  const commit = typeof parsed.commit === "string" ? parsed.commit.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(
      `loaded package build info does not contain an exact source commit: ${buildInfoPath}`,
    );
  }
  return commit;
}

/** Resolve the source object from the immutable package that is executing this process. */
export async function resolveLoadedSystemSource(options?: {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  readLoadedSourceCommit?: (packageRoot: string) => string | Promise<string>;
}): Promise<LoadedSystemSource> {
  const env = options?.env ?? process.env;
  const sourceAnchor = env[SYSTEM_SOURCE_ANCHOR_ENV]?.trim();
  if (!sourceAnchor || !path.isAbsolute(sourceAnchor)) {
    throw new Error(`${SYSTEM_SOURCE_ANCHOR_ENV} must name an absolute source anchor`);
  }
  const sourceAnchorPath = path.resolve(sourceAnchor);
  const packageRoot =
    options?.packageRoot ??
    (await resolveOpenClawPackageRoot({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
    }));
  if (!packageRoot) {
    throw new Error("loaded OpenClaw package root is unavailable");
  }
  const sourceCommit = await (options?.readLoadedSourceCommit ?? readLoadedSourceCommit)(
    packageRoot,
  );
  return { sourceAnchorPath, sourceCommit };
}
