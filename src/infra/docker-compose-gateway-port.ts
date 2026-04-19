import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const COMPOSE_FILENAMES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const;

type FsDeps = Pick<typeof fs, "existsSync" | "readFileSync">;

function parsePositivePort(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function shouldSkipRepoEnvDiscovery(env: NodeJS.ProcessEnv): boolean {
  return (
    env.OPENCLAW_TEST_FAST === "1" ||
    env.NODE_ENV === "test" ||
    env.VITEST === "true" ||
    fs.existsSync("/.dockerenv")
  );
}

function findNearestComposeRoot(startDir: string, deps: FsDeps): string | undefined {
  let current = path.resolve(startDir);
  for (;;) {
    const hasComposeFile = COMPOSE_FILENAMES.some((filename) =>
      deps.existsSync(path.join(current, filename)),
    );
    if (hasComposeFile && deps.existsSync(path.join(current, ".env"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveDockerComposeGatewayPortOverride(params?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fs?: FsDeps;
  allowTestEnvDiscovery?: boolean;
}): number | undefined {
  const cwd = params?.cwd ?? process.cwd();
  const env = params?.env ?? process.env;
  const deps = params?.fs ?? fs;

  if (!params?.allowTestEnvDiscovery && shouldSkipRepoEnvDiscovery(env)) {
    return undefined;
  }

  const root = findNearestComposeRoot(cwd, deps);
  if (!root) {
    return undefined;
  }

  try {
    const parsed = dotenv.parse(deps.readFileSync(path.join(root, ".env"), "utf8"));
    return parsePositivePort(parsed.OPENCLAW_GATEWAY_PORT);
  } catch {
    return undefined;
  }
}
