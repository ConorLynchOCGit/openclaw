import { describe, expect, it } from "vitest";
import { KimiFileImplementationAdapter } from "./kimi-file-implementation-adapter.ts";

function adapter(responseText: string | null, validationStatus: "passed" | "failed" = "passed") {
  const applied: Array<{ path: string; content: string }> = [];
  return {
    applied,
    adapter: new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits() {
          return {
            modelRunRef: "kimi-run-1",
            responseText,
            responseHash: "hash",
            latencyMs: 25,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      validationRunner: {
        async run(commandRef: string) {
          return {
            validationRef: `validation://${commandRef}`,
            status: validationStatus,
            summary: "bounded validation summary",
          };
        },
      },
      async applyFile(_repoRoot, edit, allowedFileRefs) {
        if (!allowedFileRefs.includes(edit.path)) {
          throw new Error(`kimi_patch_out_of_scope:${edit.path}`);
        }
        applied.push(edit);
        return { changed: true, beforeHash: "before", afterHash: "after" };
      },
    }),
  };
}

describe("Kimi file implementation adapter", () => {
  it("applies valid structured file edits in approved scope and validates", async () => {
    const harness = adapter(
      JSON.stringify({
        fileEdits: [
          {
            path: "extensions/execution-platform/src/workflows/example.ts",
            content: "export {};\n",
          },
        ],
      }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement a small scoped edit.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: ["context-pack://one"],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
    expect(result.diffHash).toBeTruthy();
    expect(result.rawProviderLogStored).toBe(false);
  });

  it("rejects out-of-scope patch proposals", async () => {
    const harness = adapter(
      JSON.stringify({ fileEdits: [{ path: "src/unsafe.ts", content: "export {};\n" }] }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Out of scope.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes[0]).toMatch(/out_of_scope/u);
    expect(result.changedFileRefs).toEqual([]);
  });

  it("does not treat role reports without file edits as implementation success", async () => {
    const harness = adapter(JSON.stringify({ summary: "I looked at the task." }));
    const result = await harness.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("kimi_no_patch_file_edit_output");
    expect(result.escalatedToCodexBridgeRecommended).toBe(true);
  });

  it("records needs_review when validation fails", async () => {
    const harness = adapter(
      JSON.stringify({
        fileEdits: [
          {
            path: "extensions/execution-platform/src/workflows/example.ts",
            content: "export {};\n",
          },
        ],
      }),
      "failed",
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("kimi_patch_validation_needs_review");
  });
});
