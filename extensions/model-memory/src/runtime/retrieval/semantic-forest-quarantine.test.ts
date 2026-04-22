import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
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
      expect(source, file).not.toMatch(/from\s+["'][^"']*semantic-identity\.ts["']/u);
      expect(source, file).not.toContain("semantic-collision-adjudication");
      expect(source, file).not.toContain("database-memory-object-store");
      expect(source, file).not.toContain("FamilyRecall");
    }
  });
});
