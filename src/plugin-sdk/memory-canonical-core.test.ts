import { describe, expect, it } from "vitest";
import {
  CANONICAL_MEMORY_KINDS,
  CANONICAL_MEMORY_RECOMMENDED_FACET_KEYS,
  createCanonicalMemoryRecord,
  mergeCanonicalMemoryFacets,
} from "./memory-canonical-core.js";

describe("memory-canonical-core", () => {
  it("defines the four canonical memory kinds", () => {
    expect(CANONICAL_MEMORY_KINDS).toEqual(["user", "feedback", "project", "reference"]);
    expect(CANONICAL_MEMORY_RECOMMENDED_FACET_KEYS).toContain("lessonKey");
  });

  it("creates bounded canonical records with normalized tags and defaults", () => {
    const record = createCanonicalMemoryRecord({
      kind: "feedback",
      subject: "  lazy loading boundary  ",
      statement: "  open the affected path once after the import change  ",
      scope: { kind: "project", projectId: "atlas-forge" },
      tags: ["workflow_guidance", "feedback", "workflow_guidance"],
      facets: {
        workflow_guidance: true,
        lessonKey: "lazy_loading_boundary",
      },
    });

    expect(record).toMatchObject({
      kind: "feedback",
      subject: "lazy loading boundary",
      statement: "open the affected path once after the import change",
      validationStatus: "observed",
      stability: "bounded",
      tags: ["feedback", "workflow_guidance"],
      facets: {
        workflow_guidance: true,
        lessonKey: "lazy_loading_boundary",
      },
    });
  });

  it("merges facet maps without keeping stale values from earlier drafts", () => {
    expect(
      mergeCanonicalMemoryFacets(
        {
          workflow_guidance: true,
          toolKey: "pnpm",
        },
        {
          toolKey: "vitest",
          rankingHints: ["semantic", "project_scoped"],
        },
      ),
    ).toEqual({
      workflow_guidance: true,
      toolKey: "vitest",
      rankingHints: ["semantic", "project_scoped"],
    });
  });
});
