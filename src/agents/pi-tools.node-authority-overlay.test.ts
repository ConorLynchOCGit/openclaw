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
  it("allows execution-coding parent reads only for exact bounded source windows", async () => {
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
                  deny: ["read", "list", "glob", "grep", "exec", "process", "write"],
                },
              },
            ],
          },
        },
        agentId: "execution-coding",
        workspaceDir,
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
      expect(toolNames).not.toContain("grep");
      expect(toolNames).not.toContain("glob");
      expect(toolNames).not.toContain("list");
      expect(toolNames).not.toContain("exec");

      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const allowedRead = await readTool?.execute("node-parent-read", {
        path: "src/allowed.ts",
        offset: 1,
        limit: 20,
      });
      expect(getTextContent(allowedRead)).toContain("export const ok");

      await expect(
        readTool?.execute("node-parent-read-full", { path: "src/allowed.ts" }),
      ).rejects.toThrow(/requires explicit offset and limit/);
      await expect(
        readTool?.execute("node-parent-read-large", {
          path: "src/allowed.ts",
          offset: 1,
          limit: 301,
        }),
      ).rejects.toThrow(/limited to 300 lines/);
      await expect(
        readTool?.execute("node-parent-read-runtime", {
          path: ".openclaw/runtime/session.jsonl",
          offset: 1,
          limit: 10,
        }),
      ).rejects.toThrow(/cannot inspect OpenClaw runtime state/);
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
