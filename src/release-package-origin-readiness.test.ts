import { describe, expect, it } from "vitest";
import { createReleaseManifestFixture } from "../test/helpers/release-manifest-fixture.js";
import { parseReleaseManifestBytes, serializeReleaseManifest } from "./release-manifest.js";
import {
  evaluateReleasePackageOriginReadiness,
  type ReleasePluginOriginEvidence,
} from "./release-package-origin-readiness.js";

function origin(
  pluginId: "browser" | "codex",
  overrides: Partial<ReleasePluginOriginEvidence> = {},
): ReleasePluginOriginEvidence {
  const bundled = pluginId === "browser";
  return {
    pluginId,
    packageName: bundled ? "openclaw" : "@openclaw/codex",
    packageVersion: "2026.7.19-b1.1",
    pluginManifestSha256: bundled ? "c".repeat(64) : "d".repeat(64),
    compatibilityRange: ">=2026.7.19-b1.1",
    originKind: bundled ? "bundled" : "global",
    packageArtifactSha256: bundled ? "e".repeat(64) : "f".repeat(64),
    installedRoot: bundled
      ? "/opt/openclaw/lib/node_modules/openclaw"
      : "/srv/openclaw-next/state/extensions/codex",
    ...overrides,
  };
}

describe("release package-origin readiness", () => {
  const manifest = parseReleaseManifestBytes(
    Buffer.from(serializeReleaseManifest(createReleaseManifestFixture())),
  );

  it("passes only the exact receipt-bound enabled origin set", () => {
    const accepted = [origin("browser"), origin("codex")];
    expect(
      evaluateReleasePackageOriginReadiness({
        manifest,
        accepted,
        observed: structuredClone(accepted),
      }),
    ).toEqual({ ready: true, errors: [] });
  });

  it("reports mixed generations, shadow origins, missing plugins, and extras", () => {
    const result = evaluateReleasePackageOriginReadiness({
      manifest,
      accepted: [origin("browser"), origin("codex")],
      observed: [
        origin("browser", { packageArtifactSha256: "0".repeat(64) }),
        { ...origin("codex"), pluginId: "shadow", originKind: "workspace" },
      ],
    });

    expect(result.ready).toBe(false);
    expect(result.errors.join("\n")).toContain("browser.packageArtifactSha256 mismatch");
    expect(result.errors).toContain("required plugin codex is not loaded");
    expect(result.errors).toContain("loaded origin contains unaccepted plugin shadow");
  });

  it("rejects accepted metadata that disagrees with the manifest package owner", () => {
    const result = evaluateReleasePackageOriginReadiness({
      manifest,
      accepted: [origin("browser"), origin("codex", { packageName: "@openclaw/not-codex" })],
      observed: [origin("browser"), origin("codex")],
    });

    expect(result.ready).toBe(false);
    expect(result.errors.join("\n")).toContain("codex.packageName does not match manifest");
  });

  it("rejects receipt-bound workspace or config origins for release-owned plugins", () => {
    const accepted = [origin("browser"), origin("codex", { originKind: "workspace" })];
    const result = evaluateReleasePackageOriginReadiness({
      manifest,
      accepted,
      observed: structuredClone(accepted),
    });

    expect(result.ready).toBe(false);
    expect(result.errors).toContain(
      "codex.originKind is not package-owned: accepted=workspace required=global",
    );
  });
});
