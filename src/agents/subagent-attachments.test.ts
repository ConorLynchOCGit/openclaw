import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { materializeSubagentAttachments } from "./subagent-attachments.js";

describe("subagent attachment materialization", () => {
  it("keeps attachments in the agent workspace when the task cwd is separate", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-attachments-"));
    const cfg = {
      tools: {
        sessions_spawn: {
          attachments: {
            enabled: true,
            maxFiles: 1,
            maxFileBytes: 1024,
            maxTotalBytes: 1024,
          },
        },
      },
    } as OpenClawConfig;

    try {
      const result = await materializeSubagentAttachments({
        config: cfg,
        targetAgentId: "codebase-researcher",
        workspaceDir,
        attachments: [{ name: "brief.txt", content: "bounded evidence" }],
        promptPathMode: "absolute",
      });

      expect(result?.status).toBe("ok");
      if (!result || result.status !== "ok") {
        throw new Error("attachment materialization failed");
      }
      expect(result.absDir.startsWith(path.join(workspaceDir, ".openclaw", "attachments"))).toBe(
        true,
      );
      expect(result.systemPromptSuffix).toContain(result.absDir);
      await expect(fs.readFile(path.join(result.absDir, "brief.txt"), "utf8")).resolves.toBe(
        "bounded evidence",
      );
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });
});
