import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import "./test-helpers/fast-openclaw-tools.js";
import { createOpenClawCodingTools } from "./pi-tools.js";
import { expectReadWriteEditTools, getTextContent } from "./test-helpers/pi-tools-fs-helpers.js";

describe("createOpenClawCodingTools", () => {
  it("applies first-party execution agent tool budgets by agent role", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-agent-tool-budget-"));
    try {
      const lines = Array.from({ length: 300 }, (_unused, index) => `line-${index + 1}`);
      await fs.writeFile(path.join(tmpDir, "target.ts"), lines.join("\n"), "utf8");
      for (let index = 0; index < 70; index += 1) {
        await fs.writeFile(path.join(tmpDir, `file-${String(index).padStart(2, "0")}.ts`), "x");
      }

      const tools = createOpenClawCodingTools({
        workspaceDir: tmpDir,
        agentId: "execution-context-scout",
      });
      const readTool = tools.find((tool) => tool.name === "read");
      const globTool = tools.find((tool) => tool.name === "glob");
      expect(readTool).toBeDefined();
      expect(globTool).toBeDefined();

      const readResult = await readTool?.execute("scout-budget-read", { path: "target.ts" });
      const readText = getTextContent(readResult);
      const readDetails = (readResult as { details?: { read?: Record<string, unknown> } }).details
        ?.read;
      expect(readText).toContain("160: line-160");
      expect(readText).not.toContain("161: line-161");
      expect(readDetails).toMatchObject({
        lineStart: 1,
        lineEnd: 160,
        totalLines: 300,
        returnedLines: 160,
        nextOffset: 161,
        maxBytes: 16 * 1024,
      });

      const globResult = await globTool?.execute("scout-budget-glob", { pattern: "*.ts" });
      expect((globResult as { details?: Record<string, unknown> }).details).toMatchObject({
        count: 60,
        truncated: true,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts canonical parameters for read/write/edit", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-canonical-"));
    try {
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const { readTool, writeTool, editTool } = expectReadWriteEditTools(tools);

      const filePath = "canonical-test.txt";
      const writeResult = await writeTool?.execute("tool-canonical-1", {
        path: filePath,
        content: "hello world",
      });
      expect(writeResult?.details).toMatchObject({
        changedFilePaths: [filePath],
        addedFilePaths: [filePath],
        modifiedFilePaths: [],
        bytesWritten: 11,
        fullFileReplacement: true,
      });

      const editResult = await editTool?.execute("tool-canonical-2", {
        path: filePath,
        edits: [{ oldText: "world", newText: "universe" }],
      });
      expect(editResult?.details).toMatchObject({
        firstChangedLine: 1,
      });
      expect((editResult?.details as { diff?: string } | undefined)?.diff).toContain("universe");

      const result = await readTool?.execute("tool-canonical-3", {
        path: filePath,
      });

      const textBlocks = result?.content?.filter((block) => block.type === "text") as
        | Array<{ text?: string }>
        | undefined;
      const combinedText = textBlocks?.map((block) => block.text ?? "").join("\n");
      expect(combinedText).toContain("hello universe");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("blocks ordinary assistant write/edit tools from mutating root workspace memory files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-protected-memory-"));
    try {
      await fs.writeFile(path.join(tmpDir, "USER.md"), "# USER\n", "utf8");
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const { writeTool, editTool } = expectReadWriteEditTools(tools);

      await expect(
        writeTool?.execute("tool-protected-write", {
          path: "USER.md",
          content: "# USER\n- generated\n",
        }),
      ).rejects.toThrow(/Direct writes to USER\.md or MEMORY\.md are blocked/);

      await expect(
        editTool?.execute("tool-protected-edit", {
          path: "USER.md",
          edits: [{ oldText: "# USER", newText: "# USER\n- generated" }],
        }),
      ).rejects.toThrow(/Direct writes to USER\.md or MEMORY\.md are blocked/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps daily memory notes writable for session-memory style writes", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-daily-memory-"));
    try {
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const { writeTool } = expectReadWriteEditTools(tools);

      await writeTool?.execute("tool-daily-memory-write", {
        path: "memory/2026-04-21.md",
        content: "# Daily\n\n- running context\n",
      });

      await expect(
        fs.readFile(path.join(tmpDir, "memory", "2026-04-21.md"), "utf8"),
      ).resolves.toContain("running context");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects non-edit legacy alias parameters while accepting OpenCode-style edit aliases", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-legacy-alias-"));
    try {
      await fs.writeFile(path.join(tmpDir, "legacy.txt"), "hello old value", "utf8");
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const { readTool, writeTool, editTool } = expectReadWriteEditTools(tools);

      await expect(
        writeTool?.execute("tool-legacy-write", {
          file: "legacy.txt",
          content: "hello old value",
        }),
      ).rejects.toThrow(/Missing required parameter: path/);

      const editSchema = editTool?.parameters as {
        properties?: Record<string, unknown>;
      };
      expect(editSchema.properties).toHaveProperty("filePath");
      expect(editSchema.properties).toHaveProperty("oldString");
      expect(editSchema.properties).toHaveProperty("newString");
      expect(editSchema.properties).toHaveProperty("replaceAll");
      expect(editSchema.properties).toHaveProperty("operations");
      expect(editSchema.properties).not.toHaveProperty("path");
      expect(editSchema.properties).not.toHaveProperty("oldText");
      expect(editSchema.properties).not.toHaveProperty("newText");
      expect(editSchema.properties).not.toHaveProperty("startLine");
      expect(editSchema.properties).not.toHaveProperty("endLine");
      expect(editSchema.properties).not.toHaveProperty("insertBeforeLine");
      expect(editSchema.properties).not.toHaveProperty("insertAfterLine");

      const editResult = await editTool?.execute("tool-opencode-style-edit", {
        filePath: "legacy.txt",
        oldString: "old",
        newString: "new",
      });
      expect(editResult?.details).toMatchObject({
        firstChangedLine: 1,
      });
      await expect(fs.readFile(path.join(tmpDir, "legacy.txt"), "utf8")).resolves.toContain(
        "hello new value",
      );

      await editTool?.execute("tool-operation-edit", {
        operations: [
          {
            type: "insert_after",
            filePath: "legacy.txt",
            line: 1,
            text: "inserted line\n",
          },
        ],
      });
      await expect(fs.readFile(path.join(tmpDir, "legacy.txt"), "utf8")).resolves.toContain(
        "hello new valueinserted line",
      );

      await expect(
        editTool?.execute("tool-missing-replacement", {
          filePath: "legacy.txt",
          oldString: "hello",
        }),
      ).rejects.toThrow(/Cannot apply edit: replacement text is missing/);

      await expect(
        readTool?.execute("tool-legacy-read", {
          file_path: "legacy.txt",
        }),
      ).rejects.toThrow(/Missing required parameter: path/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects structured content blocks for write", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-structured-write-"));
    try {
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const writeTool = tools.find((tool) => tool.name === "write");
      expect(writeTool).toBeDefined();

      await expect(
        writeTool?.execute("tool-structured-write", {
          path: "structured-write.js",
          content: [
            { type: "text", text: "const path = require('path');\n" },
            { type: "input_text", text: "const root = path.join(process.env.HOME, 'clawd');\n" },
          ],
        }),
      ).rejects.toThrow(/Missing required parameter: content/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies canonical operations batches atomically", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-operations-"));
    try {
      const filePath = "ops.txt";
      await fs.writeFile(path.join(tmpDir, filePath), "one\ntwo\nthree\nfour\n", "utf8");
      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const { editTool } = expectReadWriteEditTools(tools);

      await editTool?.execute("tool-operations-batch", {
        operations: [
          {
            type: "replace_lines",
            filePath,
            startLine: 2,
            endLine: 2,
            text: "TWO\n",
          },
          {
            type: "insert_before",
            filePath,
            line: 4,
            text: "before-four\n",
          },
          {
            type: "insert_after",
            filePath,
            line: 1,
            text: "after-one\n",
          },
        ],
      });

      await expect(fs.readFile(path.join(tmpDir, filePath), "utf8")).resolves.toBe(
        "one\nafter-one\nTWO\nthree\nbefore-four\nfour\n",
      );

      await expect(
        editTool?.execute("tool-overlapping-operations", {
          operations: [
            {
              type: "replace_lines",
              filePath,
              startLine: 2,
              endLine: 4,
              text: "replacement\n",
            },
            {
              type: "insert_after",
              filePath,
              line: 3,
              text: "overlap\n",
            },
          ],
        }),
      ).rejects.toThrow(/Overlapping line\/range edits rejected/);
      await expect(fs.readFile(path.join(tmpDir, filePath), "utf8")).resolves.toBe(
        "one\nafter-one\nTWO\nthree\nbefore-four\nfour\n",
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects structured edit payloads", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-structured-edit-"));
    try {
      const filePath = path.join(tmpDir, "structured-edit.js");
      await fs.writeFile(filePath, "const value = 'old';\n", "utf8");

      const tools = createOpenClawCodingTools({ workspaceDir: tmpDir });
      const editTool = tools.find((tool) => tool.name === "edit");
      expect(editTool).toBeDefined();

      await expect(
        editTool?.execute("tool-structured-edit", {
          path: "structured-edit.js",
          edits: [
            {
              oldText: [{ type: "text", text: "old" }],
              newText: [{ kind: "text", value: "new" }],
            },
          ],
        }),
      ).rejects.toThrow(
        /Missing required edit shape|Invalid edit operations|replacement text is missing/,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
