import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("Docker gateway healthcheck config", () => {
  it("uses readyz for the image healthcheck", () => {
    const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("http://127.0.0.1:18789/readyz");
    expect(dockerfile).not.toContain("http://127.0.0.1:18789/healthz').then");
  });

  it("uses readyz for the compose gateway healthcheck", () => {
    const composeFile = readFileSync(path.join(repoRoot, "docker-compose.yml"), "utf8");

    expect(composeFile).toContain("healthcheck:");
    expect(composeFile).toContain("http://127.0.0.1:18789/readyz");
    expect(composeFile).not.toContain("http://127.0.0.1:18789/healthz').then");
  });
});
