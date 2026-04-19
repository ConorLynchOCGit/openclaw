import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resolveDockerComposeGatewayPortOverride } from "./docker-compose-gateway-port.js";

describe("resolveDockerComposeGatewayPortOverride", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const next = tempRoots.pop();
      if (next) {
        fs.rmSync(next, { recursive: true, force: true });
      }
    }
  });

  function makeRepo(params: { envFile: string; nestedDir?: string }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-compose-port-"));
    tempRoots.push(root);
    fs.writeFileSync(
      path.join(root, "docker-compose.yml"),
      "services:\n  gateway:\n    image: test\n",
    );
    fs.writeFileSync(path.join(root, ".env"), params.envFile);
    const cwd = params.nestedDir ? path.join(root, params.nestedDir) : root;
    fs.mkdirSync(cwd, { recursive: true });
    return { root, cwd };
  }

  test("reads OPENCLAW_GATEWAY_PORT from the nearest compose root .env", () => {
    const repo = makeRepo({
      envFile: "OPENCLAW_GATEWAY_PORT=28789\n",
      nestedDir: "packages/live",
    });

    expect(
      resolveDockerComposeGatewayPortOverride({
        cwd: repo.cwd,
        env: {},
        allowTestEnvDiscovery: true,
      }),
    ).toBe(28789);
  });

  test("ignores invalid compose .env gateway ports", () => {
    const repo = makeRepo({
      envFile: "OPENCLAW_GATEWAY_PORT=not-a-port\n",
    });

    expect(
      resolveDockerComposeGatewayPortOverride({
        cwd: repo.cwd,
        env: {},
        allowTestEnvDiscovery: true,
      }),
    ).toBeUndefined();
  });

  test("skips repo env discovery in test mode unless explicitly allowed", () => {
    const repo = makeRepo({
      envFile: "OPENCLAW_GATEWAY_PORT=28789\n",
    });

    expect(
      resolveDockerComposeGatewayPortOverride({
        cwd: repo.cwd,
        env: { VITEST: "true" },
      }),
    ).toBeUndefined();
  });
});
