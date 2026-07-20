import { describe, expect, it } from "vitest";
import { createReleaseManifestFixture } from "../test/helpers/release-manifest-fixture.js";
import {
  parseReleaseManifestBytes,
  releaseManifestDigest,
  serializeReleaseManifest,
  type ReleaseManifest,
} from "./release-manifest.js";

describe("release manifest", () => {
  it("emits and accepts one deterministic byte representation", () => {
    const manifest = createReleaseManifestFixture();
    const first = serializeReleaseManifest(manifest);
    const second = serializeReleaseManifest(structuredClone(manifest));

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first.indexOf('"releaseProtocolVersion"')).toBeLessThan(first.indexOf('"source"'));
    expect(first.indexOf('"source"')).toBeLessThan(first.indexOf('"predecessor"'));
    expect(parseReleaseManifestBytes(Buffer.from(first))).toEqual(manifest);
    expect(releaseManifestDigest(first)).toBe(
      "309ebcbdb80876fe0f9c26a89e803f732c3e5c7e906e217ed4e7add2ad8fcd5e",
    );
  });

  it("rejects valid JSON whose bytes do not match protocol field order and whitespace", () => {
    const manifest = createReleaseManifestFixture();
    const reordered = `${JSON.stringify({ source: manifest.source, ...manifest })}\n`;

    expect(() => parseReleaseManifestBytes(Buffer.from(reordered))).toThrow(
      "field order, indentation, and trailing newline",
    );
  });

  it("keeps dormant package identities out of loaded readiness", () => {
    const manifest = createReleaseManifestFixture();
    const parsed = parseReleaseManifestBytes(Buffer.from(serializeReleaseManifest(manifest)));

    expect(parsed.artifacts[1]?.ownedPluginIds).toContain("dormant-codex-helper");
    expect(parsed.loadedReadiness.requiredPluginIds).not.toContain("dormant-codex-helper");
  });

  it("rejects duplicate ownership, unsorted artifacts, and unsupported receipt fields", () => {
    const duplicate = createReleaseManifestFixture();
    duplicate.artifacts[1]?.ownedPluginIds.push("browser");
    duplicate.artifacts[1]?.ownedPluginIds.sort();
    expect(() => serializeReleaseManifest(duplicate)).toThrow("already owned");

    const unsorted = createReleaseManifestFixture();
    unsorted.artifacts.push({
      ...structuredClone(unsorted.artifacts[1]!),
      packageName: "@openclaw/alpha",
      ownedPluginIds: ["alpha"],
    });
    expect(() => serializeReleaseManifest(unsorted)).toThrow("sorted bytewise");

    const unsupported = createReleaseManifestFixture() as ReleaseManifest & {
      acceptedTag?: string;
    };
    unsupported.acceptedTag = "mutable-tag";
    expect(() => serializeReleaseManifest(unsupported)).toThrow("unsupported acceptedTag");
  });

  it("rejects readiness identities without an artifact owner", () => {
    const manifest = createReleaseManifestFixture({
      requiredPluginIds: ["browser", "codex", "missing"],
    });
    expect(() => serializeReleaseManifest(manifest)).toThrow(
      "required plugin missing has no package artifact owner",
    );
  });

  it("rejects package versions outside strict npm semver", () => {
    const manifest = createReleaseManifestFixture();
    manifest.package.version = "2026.07.19";
    manifest.artifacts[0]!.packageVersion = "2026.07.19";

    expect(() => serializeReleaseManifest(manifest)).toThrow("npm-valid version");
  });

  it("uses the exact structural release-class vocabulary", () => {
    const bridgeRehost = createReleaseManifestFixture();
    bridgeRehost.migration = {
      class: "bootstrap_bridge_rehost",
      affectedPersistentRoots: ["/srv/openclaw-next/state"],
    };
    expect(() => serializeReleaseManifest(bridgeRehost)).not.toThrow();

    const legacyRehost = {
      ...createReleaseManifestFixture(),
      migration: { class: "rehost", affectedPersistentRoots: [] },
    };
    expect(() => serializeReleaseManifest(legacyRehost)).toThrow(
      "migration_free, migration_bearing, or bootstrap_bridge_rehost",
    );

    const traversingRoot = createReleaseManifestFixture();
    traversingRoot.migration = {
      class: "migration_bearing",
      affectedPersistentRoots: ["/srv/openclaw-next/state/../workspace"],
    };
    expect(() => serializeReleaseManifest(traversingRoot)).toThrow(
      "root must be absolute and normalized",
    );
  });

  it("requires one registry and non-empty ownership for every plugin package", () => {
    const mixedRegistry = createReleaseManifestFixture();
    mixedRegistry.artifacts[1]!.installPlan.registry = "https://registry.example.invalid/";
    expect(() => serializeReleaseManifest(mixedRegistry)).toThrow(
      "must equal the accepted release-set registry",
    );

    const ownerless = createReleaseManifestFixture();
    ownerless.artifacts[1]!.ownedPluginIds = [];
    ownerless.loadedReadiness.requiredPluginIds = ["browser"];
    expect(() => serializeReleaseManifest(ownerless)).toThrow(
      "plugin packages must own at least one plugin id",
    );
  });
});
