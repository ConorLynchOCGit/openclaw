import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listLegacyFallbackSurfaces } from "../../legacy-fallback-registry.ts";

const repoRoot = resolve(import.meta.dirname, "../../../../..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function expectNoLegacySemanticForestValueImports(source: string, file: string): void {
  const importDeclarations = [
    ...source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/gu),
  ];
  for (const [, importBody, importPath] of importDeclarations) {
    const isTypeOnly = importBody.trimStart().startsWith("type ");
    if (isTypeOnly) {
      continue;
    }
    expect(`${file}:${importPath}`).not.toMatch(/semantic-identity\.ts$/u);
    expect(`${file}:${importPath}`).not.toMatch(/semantic-collision-adjudication\.ts$/u);
  }
  expect(source, file).not.toMatch(/from\s+["'][^"']*database-memory-object-store\.ts["']/u);
  expect(source, file).not.toContain("FamilyRecall");
}

describe("semantic forest quarantine", () => {
  it("keeps default retrieval runtime free of legacy semantic-family modules", () => {
    const retrievalFiles = [
      "extensions/model-memory/src/retrieval-request-interpreter.ts",
      "extensions/model-memory/src/runtime-read-models.ts",
      "extensions/model-memory/src/runtime/retrieval/candidate-recall.ts",
      "extensions/model-memory/src/runtime/retrieval/pack-assembler.ts",
      "extensions/model-memory/src/runtime/context/retrieval-packs.ts",
    ];

    for (const file of retrievalFiles) {
      const source = readRepoFile(file);
      expectNoLegacySemanticForestValueImports(source, file);
    }
  });

  it("keeps default MMV2 write hot paths free of legacy semantic-family modules", () => {
    const writeHotPathFiles = [
      "extensions/model-memory/src/live-document-ingestion-service.ts",
      "extensions/model-memory/src/live-ordinary-turn-capture-service.ts",
      "extensions/model-memory/src/live-daily-continuity-recovery-service.ts",
      "extensions/model-memory/src/admin/document-ingestion-runner-service.ts",
      "extensions/model-memory/src/admin/replay-service.ts",
      "src/agents/model-memory.database.ts",
    ];

    for (const file of writeHotPathFiles) {
      const source = readRepoFile(file);
      expectNoLegacySemanticForestValueImports(source, file);
    }
  });

  it("keeps the document-ingest operator tool from constructing legacy collision fallback by default", () => {
    const source = readRepoFile("extensions/model-memory/src/document-ingestion-tool.ts");

    expectNoLegacySemanticForestValueImports(
      source.replace(
        /await import\(["']\.\/semantic-collision-adjudication\.ts["']\)/gu,
        'await import("./explicit-fallback-collision.ts")',
      ),
      "extensions/model-memory/src/document-ingestion-tool.ts",
    );
    expect(source).toContain("isLegacyCapturedObjectWriteFallbackEnabled");
    expect(source).toContain('await import("./semantic-collision-adjudication.ts")');
  });

  it("keeps legacy semantic/collision exports off default public runtime surfaces", () => {
    for (const file of [
      "extensions/model-memory/src/index.ts",
      "extensions/model-memory/src/runtime-api.ts",
    ]) {
      const source = readRepoFile(file);
      expect(source).not.toContain('export * from "./semantic-collision-adjudication.ts"');
      expect(source).not.toContain('export * from "./semantic-identity.ts"');
      expect(source).not.toContain('export * from "./write-policy.ts"');
      expect(source).not.toContain('export * from "./db/database-memory-object-store.ts"');
      expect(source).toContain('export * from "./legacy-fallback-registry.ts"');
    }
    const legacySource = readRepoFile("extensions/model-memory/src/legacy-admin-api.ts");
    expect(legacySource).toContain('export * from "./semantic-collision-adjudication.ts"');
    expect(legacySource).toContain('export * from "./semantic-identity.ts"');
    expect(legacySource).toContain('export * from "./write-policy.ts"');
    expect(legacySource).toContain('export * from "./db/database-memory-object-store.ts"');
  });

  it("keeps legacy write-policy on neutral structural identity rather than semantic-family identity", () => {
    const source = readRepoFile("extensions/model-memory/src/write-policy.ts");

    expect(source).toContain('from "./structural-identity.ts"');
    expect(source).not.toContain('from "./semantic-identity.ts"');
  });

  it("classifies every retained fallback surface as non-default", () => {
    const surfaces = listLegacyFallbackSurfaces();

    expect(surfaces.map((surface) => surface.surface)).toEqual(
      expect.arrayContaining([
        "legacy captured-object write fallback",
        "semantic-collision-adjudication.ts",
        "semantic-identity.ts",
        "runtime-api.ts / index.ts broad legacy exports",
        "write-policy.ts legacy semantic identity dependency",
        "plugin loader memory-core assumptions",
        "memory_search / memory_get tools",
        "status/doctor/config legacy memory surfaces",
        "session-memory continuity contract",
      ]),
    );
    expect(surfaces.every((surface) => !surface.defaultLivePathAllowed)).toBe(true);
    expect(
      surfaces
        .filter((surface) => surface.status === "explicit_fallback_only")
        .every(
          (surface) => typeof surface.rollbackFlag === "string" && surface.rollbackFlag.length > 0,
        ),
    ).toBe(true);
  });
});
