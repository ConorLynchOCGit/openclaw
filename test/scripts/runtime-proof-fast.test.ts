import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseRuntimeProofFastArgs,
  resolveRuntimeProofBuildDecision,
  waitForHttpReady,
} from "../../scripts/runtime-proof-fast.mjs";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve(undefined));
        }),
    ),
  );
});

describe("runtime proof fast", () => {
  it("parses explicit CLI flags", () => {
    expect(
      parseRuntimeProofFastArgs([
        "--skip-build",
        "--reset",
        "--port",
        "29001",
        "--timeout-ms",
        "9000",
        "--interval-ms",
        "250",
        "--probe-path",
        "/readyz",
      ]),
    ).toMatchObject({
      skipBuild: true,
      reset: true,
      port: 29001,
      timeoutMs: 9000,
      intervalMs: 250,
      probePath: "/readyz",
    });
  });

  it("reuses a green unchanged-tree fast runtime build when present", () => {
    expect(
      resolveRuntimeProofBuildDecision({
        skipBuild: false,
        reusableBuildArtifact: {
          recordedAt: "2026-04-11T00:00:00.000Z",
          elapsedMs: 26150,
          status: "success",
          treeFingerprint: "same-tree",
        },
      }),
    ).toMatchObject({
      shouldBuild: false,
      reason: "unchanged-tree-reuse",
      reuseMetadata: {
        reused: true,
        reusedFrom: {
          latestKey: "build-runtime-fast",
          elapsedMs: 26150,
        },
      },
    });
  });

  it("honors --skip-build even without a reusable runtime build artifact", () => {
    expect(
      resolveRuntimeProofBuildDecision({
        skipBuild: true,
        reusableBuildArtifact: null,
      }),
    ).toEqual({
      shouldBuild: false,
      reuseMetadata: null,
      reason: "skip-build-flag",
    });
  });

  it("waits until an endpoint becomes ready", async () => {
    let ready = false;
    const server = http.createServer((req, res) => {
      res.statusCode = ready && req.url === "/readyz" ? 200 : 503;
      res.end(ready ? "ok" : "not-ready");
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected TCP server address");
    }
    setTimeout(() => {
      ready = true;
    }, 150);

    const result = await waitForHttpReady(`http://127.0.0.1:${String(address.port)}/readyz`, {
      timeoutMs: 5000,
      intervalMs: 50,
    });

    expect(result.lastStatus).toBe(200);
    expect(result.attempts).toBeGreaterThan(1);
  });
});
