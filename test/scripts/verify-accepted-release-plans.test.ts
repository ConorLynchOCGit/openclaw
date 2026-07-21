import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  projectResolvedObjectSet,
  verifyAcceptedReleasePlans,
} from "../../scripts/verify-accepted-release-plans.mjs";
import {
  RESOLVED_OBJECT_SET_ALGORITHM,
  parseReleaseManifestBytes,
  serializeReleaseManifest,
} from "../../src/release-manifest.js";
import { createReleaseManifestFixture } from "../helpers/release-manifest-fixture.js";

const TEST_INTEGRITY = `sha512-${Buffer.alloc(64, 0xa5).toString("base64")}`;

function lockBytes(name: string, version: string, dependency: string): Buffer {
  return Buffer.from(
    `${JSON.stringify(
      {
        name,
        version,
        lockfileVersion: 3,
        packages: {
          "": { name, version },
          [`node_modules/${dependency}`]: {
            version: "1.2.3",
            resolved: `https://registry.npmjs.org/${dependency}/-/${dependency}-1.2.3.tgz`,
            integrity: TEST_INTEGRITY,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifestForLocks(rootLock: Buffer, pluginLock: Buffer) {
  const rootProjection = projectResolvedObjectSet(rootLock, "https://registry.npmjs.org/");
  const pluginProjection = projectResolvedObjectSet(pluginLock, "https://registry.npmjs.org/");
  const fixture = createReleaseManifestFixture();
  fixture.artifacts[0]!.installPlan = {
    registry: "https://registry.npmjs.org/",
    lockSha256: sha256(rootLock),
    resolvedObjectSetAlgorithm: RESOLVED_OBJECT_SET_ALGORITHM,
    resolvedObjectSetSha256: rootProjection.resolvedObjectSetSha256,
    resolvedObjectCount: rootProjection.resolvedObjectCount,
  };
  fixture.artifacts[1]!.installPlan = {
    registry: "https://registry.npmjs.org/",
    lockSha256: sha256(pluginLock),
    resolvedObjectSetAlgorithm: RESOLVED_OBJECT_SET_ALGORITHM,
    resolvedObjectSetSha256: pluginProjection.resolvedObjectSetSha256,
    resolvedObjectCount: pluginProjection.resolvedObjectCount,
  };
  return parseReleaseManifestBytes(Buffer.from(serializeReleaseManifest(fixture)));
}

describe("accepted release plan verification", () => {
  it("uses the specified bytewise object-set projection", () => {
    const lock = lockBytes("openclaw", "2026.7.19-b1.1", "zod");
    const result = projectResolvedObjectSet(lock, "https://registry.npmjs.org/");

    expect(result.projection).toBe(
      `1.2.3\thttps://registry.npmjs.org/zod/-/zod-1.2.3.tgz\t${TEST_INTEGRITY}\n`,
    );
    expect(result.resolvedObjectCount).toBe(1);
  });

  it("verifies every manifest artifact before returning a package set", () => {
    const rootLock = lockBytes("openclaw", "2026.7.19-b1.1", "zod");
    const pluginLock = lockBytes("@openclaw/codex", "2026.7.19-b1.1", "ws");
    const manifest = manifestForLocks(rootLock, pluginLock);

    expect(
      verifyAcceptedReleasePlans({
        manifest,
        locks: new Map([
          ["openclaw", rootLock],
          ["@openclaw/codex", pluginLock],
        ]),
      }),
    ).toMatchObject([
      { packageName: "openclaw", lockSha256: sha256(rootLock), resolvedObjectCount: 1 },
      {
        packageName: "@openclaw/codex",
        lockSha256: sha256(pluginLock),
        resolvedObjectCount: 1,
      },
    ]);
  });

  it("rejects missing packages, changed lock bytes, and alternate registries", () => {
    const rootLock = lockBytes("openclaw", "2026.7.19-b1.1", "zod");
    const pluginLock = lockBytes("@openclaw/codex", "2026.7.19-b1.1", "ws");
    const manifest = manifestForLocks(rootLock, pluginLock);

    expect(() =>
      verifyAcceptedReleasePlans({ manifest, locks: new Map([["openclaw", rootLock]]) }),
    ).toThrow("missing accepted locks: @openclaw/codex");

    const changed = Buffer.concat([rootLock, Buffer.from("\n")]);
    expect(() =>
      verifyAcceptedReleasePlans({
        manifest,
        locks: new Map([
          ["openclaw", changed],
          ["@openclaw/codex", pluginLock],
        ]),
      }),
    ).toThrow("lock digest mismatch");

    const alternate = Buffer.from(
      rootLock.toString("utf8").replaceAll("registry.npmjs.org", "registry.invalid"),
    );
    expect(() => projectResolvedObjectSet(alternate, "https://registry.npmjs.org/")).toThrow(
      "resolved outside accepted registry",
    );
  });

  it("reports independent artifact failures in one prebuild result", () => {
    const rootLock = lockBytes("openclaw", "2026.7.19-b1.1", "zod");
    const pluginLock = lockBytes("@openclaw/codex", "2026.7.19-b1.1", "ws");
    const manifest = manifestForLocks(rootLock, pluginLock);
    const changedRoot = Buffer.concat([rootLock, Buffer.from("\n")]);
    const changedPlugin = Buffer.concat([pluginLock, Buffer.from("\n")]);

    let message = "";
    try {
      verifyAcceptedReleasePlans({
        manifest,
        locks: new Map([
          ["openclaw", changedRoot],
          ["@openclaw/codex", changedPlugin],
        ]),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("openclaw: openclaw accepted install plan rejected");
    expect(message).toContain("@openclaw/codex: @openclaw/codex accepted install plan rejected");
    expect(message.split("lock digest mismatch")).toHaveLength(3);
  });

  it("rejects local, integrity-less, and mutable registry object references", () => {
    const accepted = lockBytes("openclaw", "2026.7.19-b1.1", "zod");
    const local = Buffer.from(
      accepted
        .toString("utf8")
        .replace("https://registry.npmjs.org/zod/-/zod-1.2.3.tgz", "file:../zod"),
    );
    expect(() => projectResolvedObjectSet(local, "https://registry.npmjs.org/")).toThrow(
      "resolved outside accepted registry",
    );

    const noIntegrity = Buffer.from(
      accepted.toString("utf8").replace(`"integrity": "${TEST_INTEGRITY}"`, '"other": true'),
    );
    expect(() => projectResolvedObjectSet(noIntegrity, "https://registry.npmjs.org/")).toThrow(
      ".integrity must be a non-empty string",
    );

    const query = Buffer.from(
      accepted.toString("utf8").replace("zod-1.2.3.tgz", "zod-1.2.3.tgz?mutable=true"),
    );
    expect(() => projectResolvedObjectSet(query, "https://registry.npmjs.org/")).toThrow(
      "resolved outside accepted registry",
    );

    const malformedIntegrity = Buffer.from(
      accepted.toString("utf8").replace(TEST_INTEGRITY, "sha512-YWNjZXB0ZWQ="),
    );
    expect(() =>
      projectResolvedObjectSet(malformedIntegrity, "https://registry.npmjs.org/"),
    ).toThrow("invalid npm integrity");
  });

  it("rejects a lock whose root package identity differs from the artifact", () => {
    const wrongRootLock = Buffer.from(
      lockBytes("openclaw", "2026.7.19-b1.1", "zod")
        .toString("utf8")
        .replaceAll('"name": "openclaw"', '"name": "not-openclaw"'),
    );
    const pluginLock = lockBytes("@openclaw/codex", "2026.7.19-b1.1", "ws");
    const manifest = manifestForLocks(wrongRootLock, pluginLock);

    expect(() =>
      verifyAcceptedReleasePlans({
        manifest,
        locks: new Map([
          ["openclaw", wrongRootLock],
          ["@openclaw/codex", pluginLock],
        ]),
      }),
    ).toThrow("lock package identity mismatch");
  });
});
