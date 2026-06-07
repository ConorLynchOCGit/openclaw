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
