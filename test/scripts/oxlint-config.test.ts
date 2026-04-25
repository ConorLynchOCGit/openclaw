import fs from "node:fs";
import { describe, expect, it } from "vitest";

type OxlintConfig = {
  ignorePatterns?: string[];
  overrides?: Array<{
    files?: string[];
    rules?: Record<string, string>;
  }>;
};

type OxlintTsconfig = {
  include?: string[];
  exclude?: string[];
};

function readJson<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8")) as T;
}

describe("oxlint config", () => {
  it("includes bundled extensions in type-aware lint coverage", () => {
    const tsconfig = readJson<OxlintTsconfig>("tsconfig.oxlint.json");

    expect(tsconfig.include).toContain("extensions/**/*");
    expect(tsconfig.exclude ?? []).not.toContain("extensions");
  });

  it("includes scripts in root type-aware lint coverage", () => {
    const tsconfig = readJson<OxlintTsconfig>("tsconfig.oxlint.json");

    expect(tsconfig.include).toContain("scripts/**/*");
  });

  it("has a discoverable scripts tsconfig for type-aware linting", () => {
    const tsconfig = readJson<OxlintTsconfig>("scripts/tsconfig.json");

    expect(tsconfig.include).toContain("**/*.ts");
    expect(tsconfig.exclude ?? []).not.toContain("**/*.ts");
  });

  it("has a discoverable test tsconfig for type-aware linting", () => {
    const tsconfig = readJson<OxlintTsconfig>("test/tsconfig.json");

    expect(tsconfig.include).toContain("**/*.ts");
    expect(tsconfig.exclude ?? []).not.toContain("**/*.ts");
  });

  it("does not ignore the bundled extensions tree", () => {
    const config = readJson<OxlintConfig>(".oxlintrc.json");

    expect(config.ignorePatterns ?? []).not.toContain("extensions/");
  });

  it("keeps generated and vendored extension outputs ignored", () => {
    const config = readJson<OxlintConfig>(".oxlintrc.json");
    const ignorePatterns = config.ignorePatterns ?? [];

    expect(ignorePatterns).toContain("**/node_modules/**");
    expect(ignorePatterns).toContain("**/dist/**");
    expect(ignorePatterns).toContain("**/build/**");
    expect(ignorePatterns).toContain("**/coverage/**");
    expect(ignorePatterns).toContain("**/.cache/**");
  });

  it("limits the extension type-aware false-positive override to the bundled extensions tree", () => {
    const config = readJson<OxlintConfig>(".oxlintrc.json");
    const extensionOverride = (config.overrides ?? []).find((override) =>
      (override.files ?? []).includes("extensions/**/*.ts"),
    );

    expect(extensionOverride).toBeDefined();
    expect(extensionOverride?.files).toEqual(
      expect.arrayContaining(["extensions/**/*.ts", "extensions/**/*.tsx"]),
    );
    expect(extensionOverride?.rules).toMatchObject({
      "typescript/no-redundant-type-constituents": "off",
      "typescript/no-unnecessary-type-assertion": "off",
    });
  });
});
