export function parseDockerPluginKeepList(value: unknown): Set<string>;
export function collectDockerPluginKeepIds(env?: NodeJS.ProcessEnv): Set<string>;
export function pruneDockerPluginDist(params?: {
  cwd?: string;
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}): string[];
