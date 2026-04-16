import { describe, expect, it } from "vitest";
import { selectPopulationWaveSources } from "./model-memory.population-wave.ts";

describe("model-memory population wave source ordering", () => {
  it("preserves tier order, de-duplicates earlier picks, and chunks by 10", () => {
    const plan = selectPopulationWaveSources({
      tierOne: [
        {
          id: "tier1-agents",
          sourceKind: "document",
          relativePath: "AGENTS.md",
          absolutePath: "/repo/AGENTS.md",
          displayPath: "AGENTS.md",
          tier: "tier1_single_document_pilot",
          packId: "tier1",
          classification: "bootstrap_preservation_sensitive_input",
          purposes: ["rule_extraction"],
        },
        {
          id: "tier1-testing",
          sourceKind: "document",
          relativePath: "docs/help/testing.md",
          absolutePath: "/repo/docs/help/testing.md",
          displayPath: "docs/help/testing.md",
          tier: "tier1_single_document_pilot",
          packId: "tier1",
          classification: "primary_large_source_proof_input",
          purposes: ["procedure_extraction"],
        },
      ],
      tierTwo: [
        {
          id: "tier2-specs",
          sourceKind: "document",
          relativePath: "docs/projects/model-memory/specs/architecture-overview.md",
          absolutePath: "/repo/docs/projects/model-memory/specs/architecture-overview.md",
          displayPath: "docs/projects/model-memory/specs/architecture-overview.md",
          tier: "tier2_curated_repo_pack",
          packId: "docs/projects/model-memory/specs",
          classification: "primary_large_source_proof_input",
          purposes: ["architecture_fact_extraction"],
        },
        {
          id: "tier2-help",
          sourceKind: "document",
          relativePath: "docs/help/debugging.md",
          absolutePath: "/repo/docs/help/debugging.md",
          displayPath: "docs/help/debugging.md",
          tier: "tier2_curated_repo_pack",
          packId: "docs/help",
          classification: "primary_large_source_proof_input",
          purposes: ["procedure_extraction"],
        },
      ],
      tierThree: Array.from({ length: 9 }, (_, index) => ({
        id: `tier3-${index}`,
        sourceKind: "document" as const,
        relativePath: `extensions/model-memory/src/file-${index + 1}.ts`,
        absolutePath: `/repo/extensions/model-memory/src/file-${index + 1}.ts`,
        displayPath: `extensions/model-memory/src/file-${index + 1}.ts`,
        tier: "tier3_selected_code_and_doc_pack" as const,
        packId: "extensions/model-memory",
        classification: "primary_large_source_proof_input" as const,
        purposes: ["architecture_fact_extraction"],
      })),
      limit: 13,
      chunkSize: 10,
    });

    expect(plan.sources).toHaveLength(13);
    expect(plan.sources[0]?.relativePath).toBe("AGENTS.md");
    expect(plan.sources[1]?.relativePath).toBe("docs/help/testing.md");
    expect(plan.sources[2]?.relativePath).toBe(
      "docs/projects/model-memory/specs/architecture-overview.md",
    );
    expect(plan.sources[3]?.relativePath).toBe("docs/help/debugging.md");
    expect(plan.chunks).toHaveLength(2);
    expect(plan.chunks[0]?.sourcePaths).toHaveLength(10);
    expect(plan.chunks[1]?.sourcePaths).toHaveLength(3);
    expect(plan.sources[9]?.chunkIndex).toBe(1);
    expect(plan.sources[10]?.chunkIndex).toBe(2);
  });
});
