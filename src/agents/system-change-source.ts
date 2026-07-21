import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";
import { runGit } from "./worktrees/git.js";
import type { LoadedSystemSource } from "./worktrees/types.js";

export const OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV = "OPENCLAW_SYSTEM_SOURCE_ANCHOR";

async function readLoadedSourceCommit(packageRoot: string): Promise<string> {
  const buildInfoPath = path.join(packageRoot, "dist", "build-info.json");
  const parsed = JSON.parse(await fs.readFile(buildInfoPath, "utf8")) as { commit?: unknown };
  const commit = typeof parsed.commit === "string" ? parsed.commit.trim().toLowerCase() : "";
  const isFullCommit =
    commit.length === 40 &&
    [...commit].every((character) => "0123456789abcdef".includes(character));
  if (!isFullCommit) {
    throw new Error(
      `loaded package build info does not contain an exact source commit: ${buildInfoPath}`,
    );
  }
  return commit;
}

/** Resolve trusted source inputs from the package that is executing this process. */
export async function resolveLoadedSystemSource(options?: {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  readLoadedSourceCommit?: (packageRoot: string) => string | Promise<string>;
}): Promise<LoadedSystemSource> {
  const env = options?.env ?? process.env;
  const sourceAnchor = env[OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]?.trim();
  if (!sourceAnchor || !path.isAbsolute(sourceAnchor)) {
    throw new Error(`${OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV} must name an absolute source anchor`);
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
  const resolved = await runGit(sourceAnchorPath, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${sourceCommit}^{commit}`,
  ]);
  const resolvedCommit = resolved.stdout.trim();
  if (resolved.code !== 0 || resolvedCommit !== sourceCommit) {
    throw new Error(
      `loaded source commit is unavailable in the source store: expected ${sourceCommit}, observed ${resolvedCommit}`,
    );
  }
  return {
    sourceAnchorPath,
    sourceCommit,
  };
}
