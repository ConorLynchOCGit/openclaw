import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import "./test-helpers/fast-coding-tools.js";
import "./test-helpers/fast-openclaw-tools.js";
import { createOpenClawCodingTools } from "./pi-tools.js";
import { expectReadWriteEditTools, getTextContent } from "./test-helpers/pi-tools-fs-helpers.js";

async function withTempWorkspace<T>(fn: (workspaceDir: string) => Promise<T>) {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-node-authority-"));
  try {
    await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceDir, "src", "allowed.ts"), "export const ok = true;\n");
    await fs.writeFile(
      path.join(workspaceDir, "src", "denied.ts"),
      "export const secret = true;\n",
    );
    return await fn(workspaceDir);
  } finally {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
}

describe("createOpenClawCodingTools node authority overlay", () => {
  it("allows execution-coding parent bounded editor navigation with read, grep, and glob", async () => {
    await withTempWorkspace(async (workspaceDir) => {
      await fs.mkdir(path.join(workspaceDir, ".openclaw", "runtime"), { recursive: true });
      await fs.writeFile(
        path.join(workspaceDir, ".openclaw", "runtime", "session.jsonl"),
        "state\n",
      );
      const tools = createOpenClawCodingTools({
        config: {
          agents: {
            list: [
              {
                id: "execution-coding",
                tools: {
                  deny: ["read", "list", "glob", "grep", "exec", "process", "write", "apply_patch"],
                },
              },
            ],
          },
        },
        agentId: "execution-coding",
        workspaceDir,
        modelProvider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        senderIsOwner: true,
        nodeAgentNativeTaskMode: {
          enabled: true,
          allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
          mutationToolName: "edit",
          runChildTask: async () => ({
            status: "error",
            foreground: true,
            childSessionKey: "agent:execution-context-scout:subagent:test",
            runId: "run-test",
            waitStatus: "error",
            resultDeliveredToParentContext: false,
          }),
        },
      });
      const toolNames = tools.map((tool) => tool.name);
      expect(toolNames).toContain("read");
      expect(toolNames).toContain("grep");
      expect(toolNames).toContain("glob");
      expect(toolNames).toContain("lsp");
      expect(toolNames).not.toContain("apply_patch");
      expect(toolNames).not.toContain("source_context_batch");
      expect(toolNames).not.toContain("list");
      expect(toolNames).not.toContain("exec");

      const readTool = tools.find((tool) => tool.name === "read");
      const grepTool = tools.find((tool) => tool.name === "grep");
      const globTool = tools.find((tool) => tool.name === "glob");
      expect(readTool).toBeDefined();
      expect(grepTool).toBeDefined();
      expect(globTool).toBeDefined();
      expect(grepTool?.description).toContain("regular expressions by default");
      expect(grepTool?.description).toContain("regex:false");
      expect(readTool?.description).toContain("truncated to 2000 lines or 50KB");
      expect(readTool?.description).not.toContain("execution-node parent mode");

      const editTool = tools.find((tool) => tool.name === "edit");
      expect(editTool?.description).toContain("Execution-node parent edit guidance");
      expect(editTool?.description).toContain(
        "If you have enough context to make even a small, medium-confidence edit",
      );
      expect(editTool?.description).toContain("edit before more lookup");
      expect(editTool?.description).toContain("Read before editing");

      const allowedRead = await readTool?.execute("node-parent-read", {
        path: "src/allowed.ts",
      });
      expect(getTextContent(allowedRead)).toContain("export const ok");
      expect(getTextContent(allowedRead)).not.toContain("<system-reminder>");

      const allowedGrep = await grepTool?.execute("node-parent-grep", {
        path: "src",
        query: "ok",
      });
      expect(getTextContent(allowedGrep)).toContain("src/allowed.ts:");
      expect(getTextContent(allowedGrep)).toContain("Line 1:");
      expect(getTextContent(allowedGrep)).not.toContain("<system-reminder>");

      const rootGrep = await grepTool?.execute("node-parent-grep-root", {
        path: ".",
        query: "ok",
      });
      expect(getTextContent(rootGrep)).toContain("src/allowed.ts:");
      expect(getTextContent(rootGrep)).toContain("Line 1:");

      const globbedGrep = await grepTool?.execute("node-parent-grep-glob", {
        path: "src",
        query: "ok",
        glob: "**/*.ts",
      });
      expect(getTextContent(globbedGrep)).toContain("src/allowed.ts:");
      expect(getTextContent(globbedGrep)).toContain("Line 1:");

      await fs.writeFile(
        path.join(workspaceDir, "src", "context.ts"),
        [
          "export const before = true;",
          "export const target = true;",
          "export const after = true;",
        ].join("\n") + "\n",
      );
      const grepWithoutContext = await grepTool?.execute("node-parent-grep-no-context", {
        path: "src/context.ts",
        query: "target",
      });
      expect(getTextContent(grepWithoutContext)).toContain("Line 2:");
      expect(getTextContent(grepWithoutContext)).toContain("1: export const before");
      expect(getTextContent(grepWithoutContext)).toContain("3: export const after");
      const filenameLookup = await globTool?.execute("node-parent-glob", {
        pattern: "src/*.ts",
      });
      expect(getTextContent(filenameLookup)).toContain("src/allowed.ts");
      expect(getTextContent(filenameLookup)).toContain("src/denied.ts");
      expect(getTextContent(filenameLookup)).not.toContain("<system-reminder>");

      const sixthSourceNavigation = await readTool?.execute("node-parent-read-sixth", {
        path: "src/allowed.ts",
      });
      expect(getTextContent(sixthSourceNavigation)).toContain("1: export const ok");
      expect(getTextContent(sixthSourceNavigation)).not.toContain("sourceWindowStatus:");
      expect(getTextContent(sixthSourceNavigation)).not.toContain("previousToolResultRef:");
      expect(getTextContent(sixthSourceNavigation)).not.toContain("<system-reminder>");

      await expect(
        grepTool?.execute("node-parent-grep-empty-query", {
          path: "src",
          query: "",
        }),
      ).rejects.toThrow(/grep query is required/);
      const oversizedLimitRead = await readTool?.execute("node-parent-read-large", {
        path: "src/allowed.ts",
        offset: 1,
        limit: 2001,
      });
      expect(getTextContent(oversizedLimitRead)).toContain("1: export const ok");
      await expect(
        globTool?.execute("node-parent-glob-runtime", {
          path: ".openclaw/runtime",
          pattern: "**/*.jsonl",
        }),
      ).rejects.toThrow(/cannot inspect OpenClaw runtime state/);
      await expect(
        readTool?.execute("node-parent-read-runtime", {
          path: ".openclaw/runtime/session.jsonl",
          offset: 1,
          limit: 10,
        }),
      ).rejects.toThrow(/cannot inspect OpenClaw runtime state/);
    });
  });

  it("returns actual requested source for overlapping reads", async () => {
    await withTempWorkspace(async (workspaceDir) => {
      const overlapPath = path.join(workspaceDir, "src", "overlap.ts");
      await fs.writeFile(
        overlapPath,
        Array.from(
          { length: 30 },
          (_unused, index) => `export const line${index + 1} = ${index + 1};`,
        ).join("\n") + "\n",
      );
      const tools = createOpenClawCodingTools({
        agentId: "execution-coding",
        workspaceDir,
        modelProvider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        senderIsOwner: true,
        nodeAgentNativeTaskMode: {
          enabled: true,
          allowedAgentIds: ["execution-context-scout", "execution-validation-scout"],
          mutationToolName: "edit",
          runChildTask: async () => ({
            status: "error",
            foreground: true,
            childSessionKey: "agent:execution-context-scout:subagent:test",
            runId: "run-test",
            waitStatus: "error",
            resultDeliveredToParentContext: false,
          }),
        },
      });
      const readTool = tools.find((tool) => tool.name === "read");
      const editTool = tools.find((tool) => tool.name === "edit");
      expect(readTool).toBeDefined();
      expect(editTool).toBeDefined();
      expect(tools.map((tool) => tool.name)).not.toContain("source_context_batch");

      const first = await readTool?.execute("coverage-read-1", {
        path: "src/overlap.ts",
        offset: 1,
        limit: 10,
      });
      expect(getTextContent(first)).toContain("1: export const line1");
      expect(getTextContent(first)).toContain("10: export const line10");

      const overlapping = await readTool?.execute("coverage-read-2", {
        path: "src/overlap.ts",
        offset: 5,
        limit: 10,
      });
      expect(getTextContent(overlapping)).toContain("5: export const line5");
      expect(getTextContent(overlapping)).toContain("11: export const line11");
      expect(getTextContent(overlapping)).toContain("14: export const line14");

      const alreadyAcquired = await readTool?.execute("coverage-read-3", {
        path: "src/overlap.ts",
        offset: 6,
        limit: 3,
      });
      expect(getTextContent(alreadyAcquired)).toContain("6: export const line6");
      expect(getTextContent(alreadyAcquired)).toContain("7: export const line7");
      expect(getTextContent(alreadyAcquired)).toContain("8: export const line8");
      expect(getTextContent(alreadyAcquired)).not.toContain("coverageStatus:");
      expect(getTextContent(alreadyAcquired)).not.toContain("sourceWindowStatus:");

      await editTool?.execute("coverage-edit-reset", {
        path: "src/overlap.ts",
        edits: [{ oldText: "export const line6 = 6;", newText: "export const line6 = 600;" }],
      });
      const afterEdit = await readTool?.execute("coverage-read-after-edit", {
        path: "src/overlap.ts",
        offset: 6,
        limit: 3,
      });
      expect(getTextContent(afterEdit)).toContain("6: export const line6 = 600;");
    });
  });

  it("narrows read/write/edit/apply_patch/exec to the current node snapshot authority", async () => {
    await withTempWorkspace(async (workspaceDir) => {
      const tools = createOpenClawCodingTools({
        workspaceDir,
        modelProvider: "openai",
        modelId: "gpt-5.1",
        exec: { host: "gateway", ask: "off", security: "full" },
        senderIsOwner: true,
        nodeAuthorityOverlay: {
          readablePathRefs: ["src/allowed.ts"],
          writablePathRefs: ["src/allowed.ts"],
          deniedPathRefs: ["src/denied.ts"],
          authorityRef: "node-execution-snapshot://authority-test",
        },
      });
      const { readTool, writeTool, editTool } = expectReadWriteEditTools(tools);
      const applyPatchTool = tools.find((tool) => tool.name === "apply_patch");
      const execTool = tools.find((tool) => tool.name === "exec");
      expect(applyPatchTool).toBeDefined();
      expect(execTool).toBeDefined();

      const allowedRead = await readTool.execute("node-authority-read", {
        path: "src/allowed.ts",
      });
      expect(getTextContent(allowedRead)).toContain("export const ok");

      await expect(
        readTool.execute("node-authority-read-denied", { path: "src/denied.ts" }),
      ).rejects.toThrow(/Node authority does not allow read/);

      await writeTool.execute("node-authority-write", {
        path: "src/allowed.ts",
        content: "export const ok = 'updated';\n",
      });
      expect(await fs.readFile(path.join(workspaceDir, "src", "allowed.ts"), "utf8")).toContain(
        "updated",
      );

      await expect(
        writeTool.execute("node-authority-write-denied", {
          path: "src/denied.ts",
          content: "export const secret = false;\n",
        }),
      ).rejects.toThrow(/Node authority does not allow write/);

      await expect(
        editTool.execute("node-authority-edit-denied", {
          path: "src/denied.ts",
          edits: [{ oldText: "true", newText: "false" }],
        }),
      ).rejects.toThrow(/Node authority does not allow write/);

      await expect(
        applyPatchTool?.execute("node-authority-patch-denied", {
          input: [
            "*** Begin Patch",
            "*** Update File: src/denied.ts",
            "@@",
            "-export const secret = true;",
            "+export const secret = false;",
            "*** End Patch",
          ].join("\n"),
        }),
      ).rejects.toThrow(/Node authority does not allow write/);

      await expect(
        execTool?.execute("node-authority-exec-denied", {
          command: "pwd",
          workdir: "src/denied.ts",
        }),
      ).rejects.toThrow(/Node authority does not allow exec workdir/);
    });
  });
});
