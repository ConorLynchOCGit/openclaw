import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodeIntelligenceService } from "./code-intelligence-service.ts";

async function withFixture<T>(work: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "openclaw-code-intelligence-"));
  try {
    await writeFile(
      path.join(rootDir, "feature.ts"),
      [
        'import { describeFeature } from "./feature-helper";',
        "export interface FeatureContract {",
        "  featureId: string;",
        "}",
        "export function runFeature(contract: FeatureContract): string {",
        "  return describeFeature(contract.featureId);",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(rootDir, "feature-helper.ts"),
      [
        "export function describeFeature(featureId: string): string {",
        "  return `feature:${featureId}`;",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(rootDir, "feature.test.ts"),
      [
        'import { runFeature } from "./feature";',
        'it("runs feature", () => {',
        "  expect(runFeature({ featureId: 'alpha' })).toBe('feature:alpha');",
        "});",
      ].join("\n"),
      "utf8",
    );
    return await work(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

describe("CodeIntelligenceService", () => {
  it("finds TS/JS symbols, definitions, references, imports, and related tests with semantic backend refs", async () => {
    await withFixture(async (rootDir) => {
      const service = createCodeIntelligenceService({ rootDir });

      const symbols = await service.runTool("code.search_symbols", { query: "runFeature" });
      expect(symbols.status).toBe("succeeded");
      expect(symbols.semanticMode).toBe("typescript_semantic");
      expect(symbols.backendId).toBe("typescript_language_service");
      expect(symbols.fallbackUsed).toBe(false);
      expect(symbols.backendHealthRef).toMatch(
        /^code-intelligence-backend-health:\/\/typescript_language_service\//u,
      );
      expect(symbols.workspaceSnapshotRef).toMatch(/^code-intelligence-workspace:\/\//u);
      expect(symbols.symbolRefs).toEqual(
        expect.arrayContaining(["code-symbol://feature.ts:5:runFeature"]),
      );
      expect(symbols.rawToolLogStored).toBe(false);

      const definition = await service.runTool("code.get_definition", {
        symbolName: "describeFeature",
      });
      expect(definition.symbols[0]).toMatchObject({
        filePath: "feature-helper.ts",
        name: "describeFeature",
        kind: "function",
      });

      const references = await service.runTool("code.get_references", { symbolName: "runFeature" });
      expect(references.locations.map((location) => location.filePath)).toEqual(
        expect.arrayContaining(["feature.ts", "feature.test.ts"]),
      );

      const imports = await service.runTool("code.resolve_import_graph", {
        filePath: "feature.ts",
      });
      expect(imports.semanticMode).toBe("typescript_semantic");
      expect(imports.importGraph[0]).toMatchObject({
        fromFilePath: "feature.ts",
        toSpecifier: "./feature-helper",
        resolvedFilePath: "feature-helper.ts",
      });

      const tests = await service.runTool("code.find_related_tests", { filePath: "feature.ts" });
      expect(tests.relatedTestRefs).toEqual(
        expect.arrayContaining([expect.stringMatching(/^repo-file:\/\/feature\.test\.ts#/u)]),
      );
    });
  });

  it("supports explicit structural degraded mode without claiming semantic success", async () => {
    await withFixture(async (rootDir) => {
      const service = createCodeIntelligenceService({ rootDir, semanticMode: "structural" });
      const diagnostics = await service.runTool("code.get_diagnostics", { filePath: "feature.ts" });

      expect(diagnostics.status).toBe("succeeded");
      expect(diagnostics.semanticMode).toBe("structural");
      expect(diagnostics.backendId).toBe("structural_parser");
      expect(diagnostics.fallbackUsed).toBe(true);
      expect(diagnostics.limitations).toContain(
        "Structural parser is degraded mode and is not semantic parity.",
      );
      expect(diagnostics.reasonCodes).toContain("code_intelligence_structural_mode_used");
      expect(diagnostics.metadata.structuralModeDisclosure).toContain("LSP");
    });
  });

  it("uses target-scoped semantic files before falling back to workspace-wide warmup", async () => {
    await withFixture(async (rootDir) => {
      await writeFile(
        path.join(rootDir, "z-target.ts"),
        [
          "export function targetScopedBoundaryReplaySymbol(): string {",
          '  return "target-scoped";',
          "}",
        ].join("\n"),
        "utf8",
      );
      const service = createCodeIntelligenceService({ rootDir, maxFiles: 1 });

      const symbols = await service.runTool("code.search_symbols", {
        query: "targetScopedBoundaryReplaySymbol",
        filePaths: ["z-target.ts"],
      });

      expect(symbols.status).toBe("succeeded");
      expect(symbols.semanticMode).toBe("typescript_semantic");
      expect(symbols.backendId).toBe("typescript_language_service");
      expect(symbols.symbolRefs).toEqual(
        expect.arrayContaining(["code-symbol://z-target.ts:1:targetScopedBoundaryReplaySymbol"]),
      );
      expect(symbols.workspaceSnapshotRef).toMatch(/^code-intelligence-workspace:\/\//u);
    });
  });

  it("reports backend health through the same code tool surface", async () => {
    await withFixture(async (rootDir) => {
      const service = createCodeIntelligenceService({ rootDir });
      const status = await service.runTool("code.backend_status", {});

      expect(status.status).toBe("succeeded");
      expect(status.semanticMode).toBe("typescript_semantic");
      expect(status.backendId).toBe("typescript_language_service");
      expect(status.metadata.backendState).toBe("ready");
      expect(status.rawProviderLogStored).toBe(false);
    });
  });
});
