import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KimiFileImplementationAdapter } from "./kimi-file-implementation-adapter.ts";

function adapter(
  responseText: string | null | string[],
  validationStatus: "passed" | "failed" = "passed",
) {
  const applied: Array<{ path: string; content: string | null }> = [];
  const modelInputs: unknown[] = [];
  const responses = Array.isArray(responseText) ? responseText : [responseText];
  return {
    applied,
    modelInputs,
    adapter: new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits(input) {
          modelInputs.push(input);
          return {
            modelRunRef: "kimi-run-1",
            responseText: responses[Math.min(modelInputs.length - 1, responses.length - 1)] ?? null,
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
        if (
          !allowedFileRefs.some(
            (allowedFileRef) =>
              allowedFileRef === edit.path ||
              (allowedFileRef.endsWith("/") && edit.path.startsWith(allowedFileRef)),
          )
        ) {
          throw new Error(`kimi_patch_out_of_scope:${edit.path}`);
        }
        applied.push(edit);
        return { changed: true, beforeHash: "before", afterHash: "after" };
      },
    }),
  };
}

describe("Kimi file implementation adapter", () => {
  function proposal(fileEdits: unknown[], overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      schemaVersion: "openclaw.kimi.patch-proposal.v1",
      status: "patch_proposed",
      fileEdits,
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      limitations: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      ...overrides,
    });
  }

  it("applies valid structured file edits in approved scope and validates", async () => {
    const harness = adapter(
      proposal([
        {
          path: "extensions/execution-platform/src/workflows/example.ts",
          operation: "replace_file",
          content: "export {};\n",
          rationale: "Add bounded example file.",
        },
      ]),
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
    expect(harness.modelInputs[0]).toMatchObject({
      attempt: 1,
      fileSnapshots: [
        {
          path: "extensions/execution-platform/src/workflows/example.ts",
          truncated: false,
        },
      ],
    });
  });

  it("uses target file refs for snapshots while preserving broader apply scope", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-kimi-target-snapshot-"));
    await mkdir(path.join(repoRoot, "extensions/execution-platform/src/work-queue"), {
      recursive: true,
    });
    await writeFile(
      path.join(repoRoot, "extensions/execution-platform/src/work-queue/target.ts"),
      "export const target = true;\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "extensions/execution-platform/src/work-queue/unrelated.ts"),
      "export const unrelated = true;\n",
      "utf8",
    );
    const harness = adapter(
      proposal([
        {
          path: "extensions/execution-platform/src/work-queue/target.ts",
          operation: "replace_file",
          content: "export const target = 'updated';\n",
          rationale: "Update only the targeted file.",
        },
      ]),
    );

    const result = await harness.adapter.run({
      taskSummary: "Implement a targeted scoped edit.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/work-queue/"],
      targetFileRefs: ["extensions/execution-platform/src/work-queue/target.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file target.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(harness.modelInputs[0]).toMatchObject({
      fileSnapshots: [
        {
          path: "extensions/execution-platform/src/work-queue/target.ts",
          boundedContent: "export const target = true;\n",
        },
      ],
      maxProviderAttempts: 2,
    });
  });

  it("passes a first-class implementation task packet to the model and diagnostics", async () => {
    const harness = adapter(
      proposal([
        {
          path: "extensions/execution-platform/src/workflows/example.ts",
          operation: "replace_file",
          content: "export const packet = true;\n",
          rationale: "Satisfy the packet target.",
        },
      ]),
    );
    const result = await harness.adapter.run({
      microtaskId: "impl-packet-1",
      microtaskTitle: "Packet-backed edit",
      exactEditObjective: "Add the packet-backed example export.",
      taskSummary: "Implement one packet-backed edit.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      targetCommitmentIds: ["commitment-1"],
      acceptanceCriteria: ["Example export exists."],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    const modelInput = harness.modelInputs[0] as {
      taskSummary: string;
      implementationTaskPacket?: {
        packetRef: string;
        targetFileRefs: string[];
        acceptanceCriteria: string[];
      };
    };
    expect(result.status).toBe("completed");
    expect(modelInput.implementationTaskPacket?.targetFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
    expect(modelInput.taskSummary).toContain("ImplementationTaskPacket v2");
    expect(result.attemptDiagnostics[0]).toMatchObject({
      targetRefsPresent: true,
      acceptanceCriteriaPresent: true,
      implementationPacketRef: modelInput.implementationTaskPacket?.packetRef,
    });
  });

  it("repairs after an invalid first Kimi response by retrying with bounded failure feedback", async () => {
    const harness = adapter([
      JSON.stringify({ summary: "I looked at the task." }),
      proposal([
        {
          path: "extensions/execution-platform/src/workflows/example.ts",
          operation: "replace_file",
          content: "export const repaired = true;\n",
          rationale: "Repair with a valid full-file edit.",
        },
      ]),
    ]);
    const result = await harness.adapter.run({
      taskSummary: "Implement after bad first response.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: ["context-pack://one"],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 2 },
    });

    expect(result.status).toBe("completed");
    expect(result.reasonCodes).toContain("kimi_patch_repaired_after_feedback");
    expect(harness.modelInputs).toHaveLength(2);
    expect(harness.modelInputs[1]).toMatchObject({
      attempt: 2,
    });
    expect(JSON.stringify(harness.modelInputs[1])).toContain("Rejection stage");
    expect(result.attemptDiagnostics[0]?.rejectionStage).toBe("schema_parse");
    expect(result.attemptDiagnostics[1]?.rejectionStage).toBeNull();
  });

  it("expands approved directory scopes into bounded concrete file snapshots", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-snapshots-"));
    const sourcePath = path.join(
      repoRoot,
      "extensions/execution-platform/src/work-queue/canonical-runtime-queue.ts",
    );
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const queue = 'runtime';\n", "utf8");
    const harness = adapter(
      proposal([
        {
          path: "extensions/execution-platform/src/work-queue/canonical-runtime-queue.ts",
          operation: "replace_file",
          content: "export const queue = 'canonical-runtime';\n",
          rationale: "Update bounded queue proof file.",
        },
      ]),
    );

    const result = await harness.adapter.run({
      taskSummary: "Update queue file.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/work-queue/"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file queue.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(harness.modelInputs[0]).toMatchObject({
      fileSnapshots: [
        {
          path: "extensions/execution-platform/src/work-queue/canonical-runtime-queue.ts",
          boundedContent: "export const queue = 'runtime';\n",
        },
      ],
    });
  });

  it("rejects out-of-scope patch proposals", async () => {
    const harness = adapter(
      proposal([
        {
          path: "src/unsafe.ts",
          operation: "replace_file",
          content: "export {};\n",
          rationale: "Unsafe path.",
        },
      ]),
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
    expect(result.attemptDiagnostics[0]?.rejectionStage).toBe("scope_check");
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
    expect(result.reasonCodes).toContain("kimi_patch_schema_invalid");
    expect(result.attemptDiagnostics[0]?.schemaFailureCategories).toContain(
      "normalization_no_edits",
    );
    expect(result.escalatedToCodexBridgeRecommended).toBe(true);
  });

  it("rejects patch-like output without a bounded target path", async () => {
    const harness = adapter(
      JSON.stringify({
        fileEdits: [
          {
            content: "export {};\n",
          },
        ],
      }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("kimi_patch_schema_invalid");
    expect(result.attemptDiagnostics[0]?.normalizedEditCount).toBe(0);
  });

  it("accepts relaxed structured edit envelopes when storage flags are absent", async () => {
    const harness = adapter(
      JSON.stringify({
        fileEdits: [
          {
            path: "extensions/execution-platform/src/workflows/example.ts",
            operation: "replace",
            content: "export const relaxed = true;\n",
            rationale: "Use a common edit envelope.",
          },
        ],
      }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement from a relaxed structured model envelope.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
  });

  it("accepts general snake_case edit aliases without treating absent storage flags as raw storage", async () => {
    const harness = adapter(
      JSON.stringify({
        edit_plan: "Make a tiny bounded update.",
        file_edits: [
          {
            path: "extensions/execution-platform/src/workflows/example.ts",
            operation: "replace_file",
            content: "export const snakeCaseEnvelope = true;\n",
            rationale: "Use common snake_case fields.",
          },
        ],
        validation_refs: ["pnpm test:file example.test.ts"],
      }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement from a snake_case structured model envelope.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
    expect(result.attemptDiagnostics[0]?.schemaFailureCategories).not.toContain(
      "raw_storage_claimed",
    );
    expect(result.attemptDiagnostics[0]?.schemaFailureCategories).toContain("storage_flags_absent");
  });

  it("accepts JSON5-style edit envelopes as structured patch proposals", async () => {
    const harness = adapter(`{
      schemaVersion: 'openclaw.kimi.patch-proposal.v1',
      status: 'patch_proposed',
      fileEdits: [{
        path: 'extensions/execution-platform/src/workflows/example.ts',
        operation: 'replace_file',
        content: 'export const json5Envelope = true;\\n',
        rationale: 'Use a JSON5-like envelope.',
      }],
      validationCommandRefs: ['pnpm test:file example.test.ts'],
      limitations: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }`);
    const result = await harness.adapter.run({
      taskSummary: "Implement from JSON5-ish structured output.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
    expect(result.attemptDiagnostics[0]?.hadJsonObject).toBe(true);
  });

  it("accepts a single fenced code block as a full-file edit only for a single target file", async () => {
    const harness = adapter(
      "Here is the complete file content.\n```ts\nexport const fromFencedBlock = true;\n```\n",
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement the exact target file.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/example.ts",
    ]);
    expect(result.attemptDiagnostics[0]).toMatchObject({
      hadJsonObject: false,
      normalizedEditCount: 1,
      rejectionStage: null,
    });
  });

  it("does not convert fenced code blocks when no single target file is available", async () => {
    const harness = adapter("```ts\nexport const ambiguous = true;\n```\n");
    const result = await harness.adapter.run({
      taskSummary: "Ambiguous fenced output.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 1 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("kimi_no_json_object");
    expect(result.attemptDiagnostics[0]?.normalizedEditCount).toBe(0);
  });

  it("accepts a single fenced unified diff for a single target file", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-fenced-diff-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits() {
          return {
            modelRunRef: "kimi-run-fenced-diff",
            responseText:
              "```diff\n" +
              "diff --git a/extensions/execution-platform/src/workflows/example.ts b/extensions/execution-platform/src/workflows/example.ts\n" +
              "--- a/extensions/execution-platform/src/workflows/example.ts\n" +
              "+++ b/extensions/execution-platform/src/workflows/example.ts\n" +
              "@@ -1 +1 @@\n" +
              "-export const value = 'before';\n" +
              "+export const value = 'after';\n" +
              "```\n",
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Patch one target file with a fenced diff.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([fileRef]);
    expect(result.attemptDiagnostics[0]).toMatchObject({
      hadFencedJson: true,
      hadJsonObject: false,
      normalizedEditCount: 1,
      rejectionStage: null,
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
  });

  it("applies supported unified diff proposals through the default patch boundary", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-unified-diff-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    const modelInputs: unknown[] = [];
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits(input) {
          modelInputs.push(input);
          return {
            modelRunRef: "kimi-run-unified-diff",
            responseText: proposal([
              {
                path: fileRef,
                operation: "patch",
                unifiedDiff:
                  "diff --git a/extensions/execution-platform/src/workflows/example.ts b/extensions/execution-platform/src/workflows/example.ts\n" +
                  "--- a/extensions/execution-platform/src/workflows/example.ts\n" +
                  "+++ b/extensions/execution-platform/src/workflows/example.ts\n" +
                  "@@ -1 +1 @@\n" +
                  "-export const value = 'before';\n" +
                  "+export const value = 'after';\n",
                rationale: "Patch the existing file.",
              },
            ]),
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });
    const result = await adapter.run({
      taskSummary: "Patch with unified diff.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([fileRef]);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
    expect(modelInputs).toHaveLength(1);
  });

  it("accepts patch operations that put unified diff text in the content field", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-content-diff-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits() {
          return {
            modelRunRef: "kimi-run-content-diff",
            responseText: proposal([
              {
                path: fileRef,
                operation: "patch",
                content:
                  "diff --git a/extensions/execution-platform/src/workflows/example.ts b/extensions/execution-platform/src/workflows/example.ts\n" +
                  "--- a/extensions/execution-platform/src/workflows/example.ts\n" +
                  "+++ b/extensions/execution-platform/src/workflows/example.ts\n" +
                  "@@ -1 +1 @@\n" +
                  "-export const value = 'before';\n" +
                  "+export const value = 'after';\n",
                rationale: "Patch the existing file using content as diff.",
              },
            ]),
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Patch with content diff.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([fileRef]);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
  });

  it("applies replace_text proposals using exact old and new snippets", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-replace-text-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      "export const label = 'before';\nexport const keep = true;\n",
      "utf8",
    );
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits() {
          return {
            modelRunRef: "kimi-run-replace-text",
            responseText: proposal([
              {
                path: fileRef,
                operation: "replace_text",
                oldText: "export const label = 'before';",
                newText: "export const label = 'after';",
                rationale: "Replace one exact snippet.",
              },
            ]),
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Replace one exact snippet.",
      repoRoot,
      allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([fileRef]);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(
      "export const label = 'after';\nexport const keep = true;\n",
    );
  });

  it("accepts a single-target search replace block as a replace_text edit", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-search-replace-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      "export const label = 'before';\nexport const keep = true;\n",
      "utf8",
    );
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits() {
          return {
            modelRunRef: "kimi-run-search-replace",
            responseText:
              "Use this exact edit:\n" +
              "<<<<<<< SEARCH\n" +
              "export const label = 'before';\n" +
              "=======\n" +
              "export const label = 'after';\n" +
              ">>>>>>> REPLACE\n",
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Replace one exact snippet with a search/replace block.",
      repoRoot,
      allowedFileRefs: [fileRef],
      targetFileRefs: [fileRef],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("completed");
    expect(result.changedFileRefs).toEqual([fileRef]);
    expect(result.attemptDiagnostics[0]).toMatchObject({
      hadJsonObject: false,
      hadPatchLikeContent: true,
      normalizedEditCount: 1,
      rejectionStage: null,
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe(
      "export const label = 'after';\nexport const keep = true;\n",
    );
  });

  it("rejects raw-storage claims even when patch-like content is present", async () => {
    const harness = adapter(
      JSON.stringify({
        fileEdits: [
          {
            path: "extensions/execution-platform/src/workflows/example.ts",
            operation: "replace_file",
            content: "export {};\n",
            rationale: "Unsafe storage flag.",
          },
        ],
        rawPromptStored: true,
      }),
    );
    const result = await harness.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000 },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("kimi_patch_schema_invalid");
    expect(result.attemptDiagnostics[0]?.schemaFailureCategories).toContain("raw_storage_claimed");
  });

  it("records needs_review when validation fails", async () => {
    const harness = adapter(
      proposal([
        {
          path: "extensions/execution-platform/src/workflows/example.ts",
          operation: "replace_file",
          content: "export {};\n",
          rationale: "Add bounded example file.",
        },
      ]),
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
    expect(result.reasonCodes).toContain(
      "kimi_patch_validation_needs_review_after_repair_attempts",
    );
    expect(result.attemptDiagnostics[0]?.rejectionStage).toBe("validation");
  });

  it("rolls back failed attempts before retrying a repaired patch", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-atomic-retry-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    let validationCalls = 0;
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits(input) {
          const firstAttempt = input.attempt === 1;
          return {
            modelRunRef: `kimi-run-atomic-${input.attempt}`,
            responseText: proposal([
              {
                path: fileRef,
                operation: "replace_text",
                oldText: "export const value = 'before';",
                newText: firstAttempt
                  ? "export const value = 'intermediate';"
                  : "export const value = 'after';",
                rationale: firstAttempt
                  ? "First attempt intentionally fails validation."
                  : "Repair from the original content after rollback.",
              },
            ]),
            responseHash: `hash-${input.attempt}`,
            latencyMs: 25,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      validationRunner: {
        async run(commandRef: string) {
          validationCalls += 1;
          return {
            validationRef: `validation://${commandRef}/${validationCalls}`,
            status: validationCalls === 1 ? "failed" : "passed",
            summary:
              validationCalls === 1
                ? "bounded first validation failure"
                : "bounded repaired validation pass",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Repair one exact snippet after validation failure.",
      repoRoot,
      allowedFileRefs: [fileRef],
      targetFileRefs: [fileRef],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 2 },
    });

    expect(result.status).toBe("completed");
    expect(result.reasonCodes).toContain("kimi_patch_repaired_after_feedback");
    expect(result.validationRefs).toHaveLength(2);
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
  });

  it("handles bounded context expansion before applying a repaired multi-step patch", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-context-expansion-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    const responses = [
      JSON.stringify({
        schemaVersion: "openclaw.kimi.patch-proposal.v1",
        status: "needs_review",
        contextRequests: [
          {
            requestId: "context-1",
            requestedFileRefs: [fileRef],
            reason: "Need the current helper snapshot before editing.",
            commitmentIds: ["commitment-source-edit"],
          },
        ],
        fileEdits: [],
        validationCommandRefs: ["pnpm test:file example.test.ts"],
        limitations: ["waiting for bounded context"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      JSON.stringify({
        schemaVersion: "openclaw.kimi.patch-proposal.v1",
        status: "patch_proposed",
        editSteps: [
          {
            stepId: "step-1",
            objective: "Replace the value constant.",
            targetFileRefs: [fileRef],
            validationExpectation: "Focused validation passes.",
            rollbackBoundary: "step",
            commitmentIdsAdvanced: ["commitment-source-edit"],
          },
        ],
        fileEdits: [
          {
            path: fileRef,
            operation: "replace_text",
            oldText: "export const value = 'before';",
            newText: "export const value = 'after';",
            rationale: "Apply the scoped helper update.",
          },
        ],
        validationCommandRefs: ["pnpm test:file example.test.ts"],
        limitations: [],
        evidenceClaims: [
          {
            commitmentId: "commitment-source-edit",
            evidenceRef: "runtime-work-graph://kimi/evidence/source-edit",
            claimSummary: "Changed the scoped helper and validation passed.",
            changedFileRefs: [fileRef],
            validationRefs: ["validation://pnpm test:file example.test.ts"],
            limitations: [],
            confidence: "high",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    ];
    const modelInputs: unknown[] = [];
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits(input) {
          modelInputs.push(input);
          return {
            modelRunRef: `kimi-run-context-${input.attempt}`,
            responseText: responses[input.attempt - 1] ?? responses.at(-1)!,
            responseHash: `hash-${input.attempt}`,
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
            status: "passed",
            summary: "bounded validation summary",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Use bounded context before editing.",
      repoRoot,
      allowedFileRefs: [fileRef],
      targetFileRefs: [fileRef],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      targetCommitmentIds: ["commitment-source-edit"],
      contextExpansion: {
        async provider(request) {
          return {
            providedContextRefs: [`context-pack://provided/${request.requestId}`],
          };
        },
      },
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 2 },
    });

    expect(result.status).toBe("completed");
    expect(result.contextExpansionRequests).toMatchObject([
      {
        requestId: "context-1",
        status: "provided",
        providedContextRefs: ["context-pack://provided/context-1"],
      },
    ]);
    expect(result.editPlanSteps[0]).toMatchObject({
      stepId: "step-1",
      commitmentIdsAdvanced: ["commitment-source-edit"],
    });
    expect(result.evidenceClaims[0]).toMatchObject({
      commitmentId: "commitment-source-edit",
      changedFileRefs: [fileRef],
    });
    expect(JSON.stringify(modelInputs[1])).toContain("context-pack://provided/context-1");
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
  });

  it("preserves enough bounded attempts for context expansion plus validation repair", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "kimi-context-validation-repair-"));
    const fileRef = "extensions/execution-platform/src/workflows/example.ts";
    const sourcePath = path.join(repoRoot, fileRef);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "export const value = 'before';\n", "utf8");
    const responses = [
      JSON.stringify({
        schemaVersion: "openclaw.kimi.patch-proposal.v1",
        status: "needs_review",
        contextRequests: [
          {
            requestId: "context-1",
            requestedFileRefs: [fileRef],
            reason: "Need the current helper snapshot before editing.",
            commitmentIds: ["commitment-source-edit"],
          },
        ],
        fileEdits: [],
        validationCommandRefs: ["pnpm test:file example.test.ts"],
        limitations: ["waiting for bounded context"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      proposal(
        [
          {
            path: fileRef,
            operation: "replace_text",
            oldText: "export const value = 'before';",
            newText: "export const value = 'intermediate';",
            rationale: "First patch is expected to fail validation.",
          },
        ],
        {
          editSteps: [
            {
              stepId: "step-1",
              objective: "Try the first scoped update.",
              targetFileRefs: [fileRef],
              validationExpectation: "Focused validation reports the mismatch.",
              rollbackBoundary: "step",
              commitmentIdsAdvanced: ["commitment-source-edit"],
            },
          ],
        },
      ),
      proposal(
        [
          {
            path: fileRef,
            operation: "replace_text",
            oldText: "export const value = 'before';",
            newText: "export const value = 'after';",
            rationale: "Repair from the original content after rollback.",
          },
        ],
        {
          editSteps: [
            {
              stepId: "step-2",
              objective: "Repair the scoped update after validation feedback.",
              targetFileRefs: [fileRef],
              validationExpectation: "Focused validation passes.",
              rollbackBoundary: "step",
              commitmentIdsAdvanced: ["commitment-source-edit"],
            },
          ],
          evidenceClaims: [
            {
              commitmentId: "commitment-source-edit",
              evidenceRef: "runtime-work-graph://kimi/evidence/source-edit-repaired",
              claimSummary: "Repaired the scoped helper after validation feedback.",
              changedFileRefs: [fileRef],
              validationRefs: ["validation://pnpm test:file example.test.ts/2"],
              limitations: [],
              confidence: "high",
              rawPromptStored: false,
              rawResponseStored: false,
            },
          ],
        },
      ),
    ];
    const modelInputs: unknown[] = [];
    let validationCalls = 0;
    const adapter = new KimiFileImplementationAdapter({
      modelClient: {
        async proposeFileEdits(input) {
          modelInputs.push(input);
          return {
            modelRunRef: `kimi-run-context-validation-${input.attempt}`,
            responseText: responses[input.attempt - 1] ?? responses.at(-1)!,
            responseHash: `hash-${input.attempt}`,
            latencyMs: 25,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      validationRunner: {
        async run(commandRef: string) {
          validationCalls += 1;
          return {
            validationRef: `validation://${commandRef}/${validationCalls}`,
            status: validationCalls === 1 ? "failed" : "passed",
            summary:
              validationCalls === 1
                ? "bounded first validation failure"
                : "bounded repaired validation pass",
          };
        },
      },
    });

    const result = await adapter.run({
      taskSummary: "Use bounded context, repair once after validation, and hand off evidence.",
      repoRoot,
      allowedFileRefs: [fileRef],
      targetFileRefs: [fileRef],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file example.test.ts"],
      targetCommitmentIds: ["commitment-source-edit"],
      contextExpansion: {
        async provider(request) {
          return {
            providedContextRefs: [`context-pack://provided/${request.requestId}`],
          };
        },
      },
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 4 },
    });

    expect(result.status).toBe("completed");
    expect(modelInputs).toHaveLength(3);
    expect(result.reasonCodes).toContain("kimi_patch_repaired_after_feedback");
    expect(result.validationRefs).toHaveLength(2);
    expect(result.editPlanSteps.map((step) => step.stepId)).toEqual(["step-1", "step-2"]);
    expect(result.evidenceClaims[0]).toMatchObject({
      commitmentId: "commitment-source-edit",
      changedFileRefs: [fileRef],
    });
    await expect(readFile(sourcePath, "utf8")).resolves.toBe("export const value = 'after';\n");
  });

  it("records no-content and prose diagnostics without storing raw responses", async () => {
    const noContent = adapter(null);
    const noContentResult = await noContent.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 1 },
    });

    expect(noContentResult.status).toBe("needs_review");
    expect(noContentResult.reasonCodes).toContain("kimi_provider_no_content");
    expect(noContentResult.attemptDiagnostics[0]).toMatchObject({
      responsePresent: false,
      rejectionStage: "provider_no_content",
      rawResponseStored: false,
    });

    const prose = adapter("I can do this, but here is a prose report instead of JSON.");
    const proseResult = await prose.adapter.run({
      taskSummary: "Implement.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/workflows/example.ts"],
      contextPackRefs: [],
      validationCommandRefs: [],
      budgetPolicy: { maxOutputTokens: 4_000, timeoutMs: 300_000, maxAttempts: 1 },
    });

    expect(proseResult.reasonCodes).toContain("kimi_no_json_object");
    expect(proseResult.attemptDiagnostics[0]).toMatchObject({
      responsePresent: true,
      hadJsonObject: false,
      rejectionStage: "json_parse",
      rawResponseStored: false,
    });
  });
});
