// Codex tests cover manifest plugin behavior.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION } from "./app-server/version.js";

type CodexPackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
};

const WORKBENCH_RUNTIME_DEPENDENCIES = {
  "@modelcontextprotocol/sdk": "1.29.0",
  typescript: "6.0.3",
} as const;

type CodexShrinkwrap = {
  packages?: Record<
    string,
    {
      dependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

describe("codex package manifest", () => {
  it("keeps runtime dependencies in the package manifest", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as CodexPackageManifest;

    expect(packageJson.devDependencies).toHaveProperty("@openclaw/plugin-sdk");
    expect(packageJson.files).toContain("system-profile/**");
    expect(packageJson.dependencies?.["@openai/codex"]).toBe(
      MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION,
    );
    expect(packageJson.dependencies).toMatchObject(WORKBENCH_RUNTIME_DEPENDENCIES);
  });

  it("keeps the managed Codex runtime pin aligned with npm shrinkwrap", () => {
    const shrinkwrap = JSON.parse(
      fs.readFileSync(new URL("../npm-shrinkwrap.json", import.meta.url), "utf8"),
    ) as CodexShrinkwrap;

    expect(shrinkwrap.packages?.[""]?.dependencies?.["@openai/codex"]).toBe(
      MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION,
    );
    expect(shrinkwrap.packages?.["node_modules/@openai/codex"]?.version).toBe(
      MANAGED_CODEX_APP_SERVER_PACKAGE_VERSION,
    );
    expect(shrinkwrap.packages?.[""]?.dependencies).toMatchObject(WORKBENCH_RUNTIME_DEPENDENCIES);
    expect(shrinkwrap.packages?.["node_modules/@modelcontextprotocol/sdk"]?.version).toBe(
      WORKBENCH_RUNTIME_DEPENDENCIES["@modelcontextprotocol/sdk"],
    );
    expect(shrinkwrap.packages?.["node_modules/typescript"]?.version).toBe(
      WORKBENCH_RUNTIME_DEPENDENCIES.typescript,
    );
  });
});
