import { describe, expect, it } from "vitest";
import { deriveReleaseVersion, parseArgs } from "../../scripts/prepare-native-release-set.mjs";

describe("prepare-native-release-set", () => {
  it("derives one deterministic npm-valid correction version from release inputs", () => {
    const first = deriveReleaseVersion("2026.7.1", "a".repeat(40), "b".repeat(64));
    const repeated = deriveReleaseVersion("2026.7.1", "a".repeat(40), "b".repeat(64));
    const changed = deriveReleaseVersion("2026.7.1", "c".repeat(40), "b".repeat(64));

    expect(first).toBe(repeated);
    expect(first).not.toBe(changed);
    expect(first.startsWith("2026.7.1-")).toBe(true);
    expect([...first.slice("2026.7.1-".length)].every((char) => char >= "0" && char <= "9")).toBe(
      true,
    );
  });

  it("requires exact input and output paths", () => {
    expect(parseArgs(["--input", "in.json", "--output", "out.json"])).toMatchObject({
      inputPath: expect.stringContaining("in.json"),
      outputPath: expect.stringContaining("out.json"),
    });
    expect(() => parseArgs(["--input", "in.json"])).toThrow("usage:");
    expect(() => parseArgs(["--unknown", "value"])).toThrow("unknown argument");
  });

  it("rejects non-native base versions", () => {
    expect(() => deriveReleaseVersion("latest", "a".repeat(40), "b".repeat(64))).toThrow(
      "cannot derive",
    );
  });
});
