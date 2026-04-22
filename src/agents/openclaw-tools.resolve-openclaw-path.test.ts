import { describe, expect, it } from "vitest";
import { createResolveOpenClawPathTool } from "./tools/resolve-openclaw-path-tool.js";

describe("resolve_openclaw_path tool", () => {
  it("blocks mirror edits by default", async () => {
    const tool = createResolveOpenClawPathTool({
      workspaceDir: "/root/.openclaw/workspace",
    });

    const result = await tool.execute("resolve-path", {
      path: "/root/.openclaw/workspace/imports/product_live/content/docs/agents/web-researcher/README.md",
    });

    const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
    const parsed = JSON.parse(text);
    expect(parsed.canonicalOwner).toBe("product_repo");
    expect(parsed.allowedEditSurface).toBe("repo_executor_required");
    expect(parsed.requiredEscalation).toBe("needs repo executor / host write bridge");
  });
});
