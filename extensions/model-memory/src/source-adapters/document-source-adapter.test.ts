import { describe, expect, it } from "vitest";
import { adaptDocumentSource } from "./document-source-adapter.ts";

describe("document-source-adapter", () => {
  it("normalizes markdown-like documents into deterministic structural windows", () => {
    const text =
      "# Profile\r\nKeep answers concise.\r\n\r\n## Preferences\r\n- Use concise phrasing.\r\n- Prefer direct answers.\r\n";

    const first = adaptDocumentSource({
      externalSourceId: "doc-001",
      text,
      projectId: "project-001",
      maxWordsPerWindow: 100,
    });
    const second = adaptDocumentSource({
      externalSourceId: "doc-001",
      text,
      projectId: "project-001",
      maxWordsPerWindow: 100,
    });

    expect(first.source.id).toBe(second.source.id);
    expect(first.source.sourceKind).toBe("document");
    expect(first.windows).toHaveLength(1);
    expect(first.windows[0].headingPath).toEqual(["Profile"]);
    expect(first.windows[0].normalizedText).toBe(
      "# Profile\nKeep answers concise.\n\n## Preferences\n- Use concise phrasing.\n- Prefer direct answers.",
    );
    expect(first.windows[0].blockDescriptors.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list_item",
      "list_item",
    ]);
  });

  it("splits windows only on structural boundaries when the word budget is exceeded", () => {
    const text = "# Checklist\n1. run check-001\n2. record artifact-001\n3. ship package-001";

    const result = adaptDocumentSource({
      externalSourceId: "doc-002",
      text,
      maxWordsPerWindow: 4,
    });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].blockDescriptors.every((block) => block.kind !== "paragraph")).toBe(
      true,
    );
    expect(result.windows.map((window) => window.windowIndex)).toEqual([0, 1]);
  });
});
