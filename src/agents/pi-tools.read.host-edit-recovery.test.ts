import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawLspService } from "./openclaw-lsp-service.js";
import { wrapEditToolWithRecovery } from "./pi-tools.host-edit.js";
import { REQUIRED_PARAM_GROUPS, wrapToolParamValidation } from "./pi-tools.params.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import type { SandboxFsBridge, SandboxFsStat } from "./sandbox/fs-bridge.js";

function createInMemoryBridge(root: string, files: Map<string, string>): SandboxFsBridge {
  const resolveAbsolute = (filePath: string, cwd?: string) =>
    path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd ?? root, filePath);

  const readStat = (absolutePath: string): SandboxFsStat | null => {
    const content = files.get(absolutePath);
    if (typeof content !== "string") {
      return null;
    }
    return {
      type: "file",
      size: Buffer.byteLength(content, "utf8"),
      mtimeMs: 0,
    };
  };

  return {
    resolvePath: ({ filePath, cwd }) => {
      const absolutePath = resolveAbsolute(filePath, cwd);
      return {
        hostPath: absolutePath,
        relativePath: path.relative(root, absolutePath),
        containerPath: absolutePath,
      };
    },
    readFile: async ({ filePath, cwd }) => {
      const absolutePath = resolveAbsolute(filePath, cwd);
      const content = files.get(absolutePath);
      if (typeof content !== "string") {
        throw new Error(`ENOENT: ${absolutePath}`);
      }
      return Buffer.from(content, "utf8");
    },
    writeFile: async ({ filePath, cwd, data }) => {
      const absolutePath = resolveAbsolute(filePath, cwd);
      files.set(absolutePath, typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
    },
    mkdirp: async () => {},
    remove: async ({ filePath, cwd }) => {
      files.delete(resolveAbsolute(filePath, cwd));
    },
    rename: async ({ from, to, cwd }) => {
      const fromPath = resolveAbsolute(from, cwd);
      const toPath = resolveAbsolute(to, cwd);
      const content = files.get(fromPath);
      if (typeof content !== "string") {
        throw new Error(`ENOENT: ${fromPath}`);
      }
      files.set(toPath, content);
      files.delete(fromPath);
    },
    stat: async ({ filePath, cwd }) => readStat(resolveAbsolute(filePath, cwd)),
  };
}

describe("edit tool recovery hardening", () => {
  let tmpDir = "";

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  function createRecoveredEditTool(params: {
    root: string;
    readFile: (absolutePath: string) => Promise<string>;
    writeFile?: (absolutePath: string, content: string) => Promise<void>;
    execute: AnyAgentTool["execute"];
    lspService?: OpenClawLspService;
  }) {
    const base = {
      name: "edit",
      execute: params.execute,
    } as unknown as AnyAgentTool;
    return wrapEditToolWithRecovery(base, {
      root: params.root,
      readFile: params.readFile,
      writeFile: params.writeFile,
      lspService: params.lspService,
    });
  }

  it("accepts OpenCode-style filePath and top-level oldString/newString", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export const value = 1;\n", "utf-8");
    const execute = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text" as const, text: "Edit applied successfully." }],
      details: { changedFilePaths: [filePath] },
    }));
    const tool = wrapToolParamValidation(
      createRecoveredEditTool({
        root: tmpDir,
        readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
        execute,
      }),
      REQUIRED_PARAM_GROUPS.edit,
    );

    await tool.execute(
      "call-1",
      {
        filePath,
        oldString: "export const value = 1;",
        newString: "export const value = 2;",
      },
      undefined,
    );

    expect(execute).toHaveBeenCalledWith(
      "call-1",
      {
        path: filePath,
        edits: [{ oldText: "export const value = 1;", newText: "export const value = 2;" }],
      },
      undefined,
      undefined,
    );
  });

  it("accepts OpenCode-style nested oldString/newString edits", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export const one = 1;\nexport const two = 2;\n", "utf-8");
    const execute = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text" as const, text: "Edit applied successfully." }],
      details: { changedFilePaths: [filePath] },
    }));
    const tool = wrapToolParamValidation(
      createRecoveredEditTool({
        root: tmpDir,
        readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
        execute,
      }),
      REQUIRED_PARAM_GROUPS.edit,
    );

    await tool.execute(
      "call-1",
      {
        path: filePath,
        edits: [
          { oldString: "export const one = 1;", newString: "export const one = 10;" },
          { oldText: "export const two = 2;", newText: "export const two = 20;" },
        ],
      },
      undefined,
    );

    expect(execute).toHaveBeenCalledWith(
      "call-1",
      {
        path: filePath,
        edits: [
          { oldText: "export const one = 1;", newText: "export const one = 10;" },
          { oldText: "export const two = 2;", newText: "export const two = 20;" },
        ],
      },
      undefined,
      undefined,
    );
  });

  it("supports OpenCode-style replaceAll by converting it to one full-file replacement", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "const label = 'old';\nconst other = 'old';\n", "utf-8");
    const execute = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text" as const, text: "Edit applied successfully." }],
      details: { changedFilePaths: [filePath] },
    }));
    const tool = wrapToolParamValidation(
      createRecoveredEditTool({
        root: tmpDir,
        readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
        execute,
      }),
      REQUIRED_PARAM_GROUPS.edit,
    );

    await tool.execute(
      "call-1",
      {
        filePath,
        oldString: "old",
        newString: "new",
        replaceAll: true,
      },
      undefined,
    );

    expect(execute).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        path: filePath,
        replaceAll: true,
        edits: [
          {
            oldText: "const label = 'old';\nconst other = 'old';\n",
            newText: "const label = 'new';\nconst other = 'new';\n",
          },
        ],
      }),
      undefined,
      undefined,
    );
  });

  it("explains accepted nested edit keys when edits[] uses the wrong shape", async () => {
    const tool = wrapToolParamValidation(
      {
        name: "edit",
        execute: async () => ({
          isError: false,
          content: [{ type: "text", text: "unexpected" }],
        }),
      } as unknown as AnyAgentTool,
      REQUIRED_PARAM_GROUPS.edit,
    );

    await expect(
      tool.execute(
        "call-1",
        {
          path: "demo.ts",
          edits: [{ old: "before", replacement: "after" }],
        },
        undefined,
      ),
    ).rejects.toThrow(/Accepted nested edit shapes are edits\[\]\.oldText\/newText/);
  });

  it("materializes line range edits into exact replacements before delegating", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export const one = 1;\nexport const two = 2;\n", "utf-8");
    const execute = vi.fn(async (_toolCallId, params) => {
      expect(params).toMatchObject({
        path: filePath,
        edits: [{ oldText: "export const two = 2;\n", newText: "export const two = 20;\n" }],
      });
      await fs.writeFile(filePath, "export const one = 1;\nexport const two = 20;\n", "utf-8");
      return {
        isError: false,
        content: [{ type: "text" as const, text: "Edit applied successfully." }],
        details: {},
      };
    });
    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute,
    });

    const result = await tool.execute(
      "call-1",
      { path: filePath, startLine: 2, endLine: 2, newText: "export const two = 20;" },
      undefined,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isError: false });
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
      "export const one = 1;\nexport const two = 20;\n",
    );
  });

  it("materializes insertAfterLine edits into exact replacements before delegating", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export const one = 1;\nexport const three = 3;\n", "utf-8");
    const execute = vi.fn(async (_toolCallId, params) => {
      expect(params).toMatchObject({
        edits: [
          {
            oldText: "export const one = 1;\n",
            newText: "export const one = 1;\nexport const two = 2;\n",
          },
        ],
      });
      await fs.writeFile(
        filePath,
        "export const one = 1;\nexport const two = 2;\nexport const three = 3;\n",
        "utf-8",
      );
      return {
        isError: false,
        content: [{ type: "text" as const, text: "Edit applied successfully." }],
        details: {},
      };
    });
    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute,
    });

    await tool.execute(
      "call-1",
      { path: filePath, insertAfterLine: 1, newText: "export const two = 2;" },
      undefined,
    );

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("applies per-edit path batches atomically without delegating to single-file edit", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const firstPath = path.join(tmpDir, "first.ts");
    const secondPath = path.join(tmpDir, "second.ts");
    await fs.writeFile(firstPath, "export const first = 1;\n", "utf-8");
    await fs.writeFile(secondPath, "export const second = 2;\n", "utf-8");
    const execute = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text" as const, text: "unexpected" }],
      details: {},
    }));
    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      writeFile: (absolutePath, content) => fs.writeFile(absolutePath, content, "utf-8"),
      execute,
    });

    const result = await tool.execute(
      "call-1",
      {
        edits: [
          { path: firstPath, startLine: 1, endLine: 1, newText: "export const first = 10;" },
          { path: secondPath, insertAfterLine: 1, newText: "export const third = 3;" },
        ],
      },
      undefined,
    );

    expect(execute).not.toHaveBeenCalled();
    expect((result.content[0] as { text?: string }).text).toContain(
      "Atomic edit batch applied across 2 file(s).",
    );
    await expect(fs.readFile(firstPath, "utf-8")).resolves.toBe("export const first = 10;\n");
    await expect(fs.readFile(secondPath, "utf-8")).resolves.toBe(
      "export const second = 2;\nexport const third = 3;\n",
    );
  });

  it("rolls back earlier files when an atomic multi-file write fails", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const firstPath = path.join(tmpDir, "first.ts");
    const secondPath = path.join(tmpDir, "second.ts");
    await fs.writeFile(firstPath, "export const first = 1;\n", "utf-8");
    await fs.writeFile(secondPath, "export const second = 2;\n", "utf-8");
    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      writeFile: async (absolutePath, content) => {
        if (absolutePath === secondPath) {
          throw new Error("simulated second write failure");
        }
        await fs.writeFile(absolutePath, content, "utf-8");
      },
      execute: vi.fn(),
    });

    await expect(
      tool.execute(
        "call-1",
        {
          edits: [
            { path: firstPath, startLine: 1, endLine: 1, newText: "export const first = 10;" },
            { path: secondPath, startLine: 1, endLine: 1, newText: "export const second = 20;" },
          ],
        },
        undefined,
      ),
    ).rejects.toThrow("simulated second write failure");
    await expect(fs.readFile(firstPath, "utf-8")).resolves.toBe("export const first = 1;\n");
  });

  it("adds bounded local repair guidance without dumping current file contents", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    await fs.writeFile(filePath, "actual current content", "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        throw new Error(
          "Could not find the exact text in demo.txt. The old text must match exactly including all whitespace and newlines.",
        );
      },
    });
    await expect(
      tool.execute(
        "call-1",
        { path: filePath, edits: [{ oldText: "missing", newText: "replacement" }] },
        undefined,
      ),
    ).rejects.toThrow(/Repair with one bounded local read around the target/);
    await expect(
      tool.execute(
        "call-1",
        { path: filePath, edits: [{ oldText: "actual current content", newText: "replacement" }] },
        undefined,
      ),
    ).rejects.toThrow(/Ready range edit shape/);
    await expect(
      tool.execute(
        "call-1",
        { path: filePath, edits: [{ oldText: "missing", newText: "replacement" }] },
        undefined,
      ),
    ).rejects.not.toThrow(/actual current content/);
  });

  it("retries a safe indentation-tolerant oldText match before failing", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "function demo() {\n  return 1;\n}\n", "utf-8");
    let calls = 0;

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async (_toolCallId, params) => {
        calls += 1;
        if (calls === 1) {
          throw new Error(
            "Could not find the exact text in demo.ts. The old text must match exactly including all whitespace and newlines.",
          );
        }
        expect(params).toMatchObject({
          edits: [
            {
              oldText: "function demo() {\n  return 1;\n}",
              newText: "function demo() {\n  return 2;\n}",
            },
          ],
        });
        await fs.writeFile(filePath, "function demo() {\n  return 2;\n}\n", "utf-8");
        return {
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          details: { changedFilePaths: [filePath] },
        };
      },
    });

    const result = await tool.execute(
      "call-1",
      {
        path: filePath,
        edits: [
          {
            oldText: "function demo() {\nreturn 1;\n}",
            newText: "function demo() {\n  return 2;\n}",
          },
        ],
      },
      undefined,
    );

    expect(calls).toBe(2);
    expect(result).toMatchObject({
      isError: false,
      details: { recoveredAfterTolerantMatch: true },
    });
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe(
      "function demo() {\n  return 2;\n}\n",
    );
  });

  it("does not retry ambiguous tolerant matches", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(
      filePath,
      "if (first) {\n  return 1;\n}\nif (second) {\n  return 1;\n}\n",
      "utf-8",
    );
    let calls = 0;

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        calls += 1;
        throw new Error(
          "Could not find the exact text in demo.ts. The old text must match exactly including all whitespace and newlines.",
        );
      },
    });

    await expect(
      tool.execute(
        "call-1",
        {
          path: filePath,
          edits: [{ oldText: "return 1;", newText: "return 2;" }],
        },
        undefined,
      ),
    ).rejects.toThrow(/Repair with one bounded local read around the target/);
    expect(calls).toBe(1);
  });

  it("recovers success after a post-write throw when CRLF output contains newText and oldText is only a substring", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    await fs.writeFile(filePath, 'const value = "foo";\r\n', "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, 'const value = "foobar";\r\n', "utf-8");
        throw new Error("Simulated post-write failure (e.g. generateDiffString)");
      },
    });
    const result = await tool.execute(
      "call-1",
      {
        path: filePath,
        edits: [
          {
            oldText: 'const value = "foo";\n',
            newText: 'const value = "foobar";\n',
          },
        ],
      },
      undefined,
    );

    expect(result).toMatchObject({ isError: false });
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text?: string }).text).toContain(
      `Successfully replaced text in ${filePath}.`,
    );
    expect((result.content[0] as { text?: string }).text).toContain("Diff:");
    expect(result.details).toMatchObject({
      changedFilePaths: [filePath],
      modifiedFilePaths: [filePath],
      editCount: 1,
      firstChangedLine: 1,
      recoveredAfterPostWriteFailure: true,
    });
    expect((result.details as { diff?: string }).diff).toContain("-1:");
    expect((result.details as { diff?: string }).diff).toContain("+1:");
  });

  it("does not recover false success when the file never changed", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    await fs.writeFile(filePath, "replacement already present", "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        throw new Error("Simulated post-write failure (e.g. generateDiffString)");
      },
    });
    await expect(
      tool.execute(
        "call-1",
        {
          path: filePath,
          edits: [{ oldText: "missing", newText: "replacement already present" }],
        },
        undefined,
      ),
    ).rejects.toThrow("Simulated post-write failure");
  });

  it("recovers deletion edits when the file changed and oldText is gone", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    await fs.writeFile(filePath, "before delete me after\n", "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, "before  after\n", "utf-8");
        throw new Error("Simulated post-write failure (e.g. generateDiffString)");
      },
    });
    const result = await tool.execute(
      "call-1",
      { path: filePath, edits: [{ oldText: "delete me", newText: "" }] },
      undefined,
    );

    expect(result).toMatchObject({ isError: false });
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text?: string }).text).toContain(
      `Successfully replaced text in ${filePath}.`,
    );
  });

  it("recovers multi-edit payloads after a post-write throw", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    await fs.writeFile(filePath, "alpha beta gamma delta\n", "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, "ALPHA beta gamma DELTA\n", "utf-8");
        throw new Error("Simulated post-write failure (e.g. generateDiffString)");
      },
    });
    const result = await tool.execute(
      "call-1",
      {
        path: filePath,
        edits: [
          { oldText: "alpha", newText: "ALPHA" },
          { oldText: "delta", newText: "DELTA" },
        ],
      },
      undefined,
    );

    expect(result).toMatchObject({ isError: false });
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text?: string }).text).toContain(
      `Successfully replaced 2 block(s) in ${filePath}.`,
    );
  });

  it("recovers tilde paths against the OS home even when OPENCLAW_HOME differs", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const osHome = path.join(tmpDir, "home");
    const openclawHome = path.join(tmpDir, "openclaw-home");
    await fs.mkdir(osHome, { recursive: true });
    await fs.mkdir(openclawHome, { recursive: true });

    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const previousOpenclawHome = process.env.OPENCLAW_HOME;
    process.env.HOME = osHome;
    process.env.USERPROFILE = osHome;
    process.env.OPENCLAW_HOME = openclawHome;

    try {
      const filePath = path.join(osHome, "demo.txt");
      await fs.writeFile(filePath, "before old text after\n", "utf-8");

      const tool = createRecoveredEditTool({
        root: tmpDir,
        readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
        execute: async () => {
          await fs.writeFile(filePath, "before new text after\n", "utf-8");
          throw new Error("Simulated post-write failure (e.g. generateDiffString)");
        },
      });
      const result = await tool.execute(
        "call-1",
        { path: "~/demo.txt", edits: [{ oldText: "old text", newText: "new text" }] },
        undefined,
      );

      expect(result).toMatchObject({ isError: false });
      expect(result.content[0]).toMatchObject({ type: "text" });
      expect((result.content[0] as { text?: string }).text).toContain(
        "Successfully replaced text in ~/demo.txt.",
      );
      await expect(fs.access(path.join(openclawHome, "demo.txt"))).rejects.toBeDefined();
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = previousUserProfile;
      }
      if (previousOpenclawHome === undefined) {
        delete process.env.OPENCLAW_HOME;
      } else {
        process.env.OPENCLAW_HOME = previousOpenclawHome;
      }
    }
  });

  it("applies the same recovery path to sandboxed edit tools", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.txt");
    const files = new Map<string, string>([[filePath, "before old text after\n"]]);

    const bridge = createInMemoryBridge(tmpDir, files);
    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: async (absolutePath: string) =>
        (await bridge.readFile({ filePath: absolutePath, cwd: tmpDir })).toString("utf8"),
      execute: async () => {
        files.set(filePath, "before new text after\n");
        throw new Error("Simulated post-write failure (e.g. generateDiffString)");
      },
    });
    const result = await tool.execute(
      "call-1",
      { path: filePath, edits: [{ oldText: "old text", newText: "new text" }] },
      undefined,
    );

    expect(result).toMatchObject({ isError: false });
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text?: string }).text).toContain(
      `Successfully replaced text in ${filePath}.`,
    );
  });

  it("adds model-visible diff and syntax diagnostics after normal successful edits", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export function demo() {\n  return 1;\n}\n", "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, "export function demo() {\n  return 2;\n}\n", "utf-8");
        return {
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          details: {},
        };
      },
    });

    const result = await tool.execute(
      "call-1",
      { path: filePath, edits: [{ oldText: "return 1;", newText: "return 2;" }] },
      undefined,
    );

    const text = (result.content[0] as { text?: string }).text ?? "";
    expect((result as { isError?: boolean }).isError).toBe(false);
    expect(text).toContain("Edit applied successfully.");
    expect(text).toContain("Diff:");
    expect(result.details).toMatchObject({
      additions: 1,
      deletions: 1,
      statsSource: "replacement_local",
      syntaxDiagnostics: [],
    });
  });

  it("reports replacement-local stats for small edits in large files", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "large.ts");
    const prefix = Array.from({ length: 1_200 }, (_, index) => `const filler${index} = ${index};`);
    const oldText = "export const target = {\n  one: 1,\n};";
    const newText = "export const target = {\n  one: 1,\n  two: 2,\n};";
    await fs.writeFile(filePath, `${prefix.join("\n")}\n${oldText}\n`, "utf-8");

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, `${prefix.join("\n")}\n${newText}\n`, "utf-8");
        return {
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          details: {},
        };
      },
    });

    const result = await tool.execute(
      "call-1",
      { path: filePath, edits: [{ oldText, newText }] },
      undefined,
    );

    const text = (result.content[0] as { text?: string }).text ?? "";
    expect(text).toContain("Diff:");
    expect(text).toContain("+1 -0");
    expect(text).not.toContain("+1220 -1193");
    expect(result.details).toMatchObject({
      additions: 1,
      deletions: 0,
      statsSource: "replacement_local",
    });
  });

  it("adds OpenClaw LSP diagnostics after successful edits when the service is available", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "demo.ts");
    await fs.writeFile(filePath, "export function demo() {\n  return 1;\n}\n", "utf-8");
    const touched: string[] = [];
    const lspService = {
      touchFile: async (absolutePath: string) => {
        touched.push(absolutePath);
      },
      diagnosticsForFile: async () => [
        {
          path: "demo.ts",
          severity: "ERROR" as const,
          line: 2,
          character: 10,
          message: "Type 'number' is not assignable to type 'string'.",
        },
      ],
    } as unknown as OpenClawLspService;

    const tool = createRecoveredEditTool({
      root: tmpDir,
      lspService,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute: async () => {
        await fs.writeFile(filePath, "export function demo(): string {\n  return 2;\n}\n", "utf-8");
        return {
          isError: false,
          content: [{ type: "text", text: "Edit applied successfully." }],
          details: {},
        };
      },
    });

    const result = await tool.execute(
      "call-lsp",
      { path: filePath, edits: [{ oldText: "return 1;", newText: "return 2;" }] },
      undefined,
    );

    const text = (result.content[0] as { text?: string }).text ?? "";
    expect(touched).toContain(filePath);
    expect(text).toContain("LSP diagnostics, next repair targets:");
    expect(text).toContain(`${filePath}:2:10 ERROR`);
    expect(result.details).toMatchObject({
      lspDiagnostics: [
        {
          severity: "ERROR",
          line: 2,
          character: 10,
        },
      ],
    });
  });

  it("rejects broad cross-section replacements before mutating large files", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-edit-recovery-"));
    const filePath = path.join(tmpDir, "large.ts");
    const filler = Array.from({ length: 1_100 }, (_, index) => `const filler${index} = ${index};`);
    const protectedBlock = [
      "export type One = {",
      "  value: string;",
      "};",
      "export type Two = {",
      "  value: string;",
      "};",
      "export type Three = {",
      "  value: string;",
      "};",
    ].join("\n");
    await fs.writeFile(filePath, `${filler.join("\n")}\n${protectedBlock}\n`, "utf-8");
    const execute = vi.fn(async () => ({
      isError: false,
      content: [{ type: "text" as const, text: "should not run" }],
      details: {},
    }));

    const tool = createRecoveredEditTool({
      root: tmpDir,
      readFile: (absolutePath) => fs.readFile(absolutePath, "utf-8"),
      execute,
    });

    await expect(
      tool.execute(
        "call-1",
        {
          path: filePath,
          edits: [
            {
              oldText: protectedBlock,
              newText: "export type One = { value: string };",
            },
          ],
        },
        undefined,
      ),
    ).rejects.toThrow(/Large or cross-section edit rejected before mutating/);
    expect(execute).not.toHaveBeenCalled();
  });
});
