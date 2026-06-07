import { describe, expect, it } from "vitest";
import { createResolveOpenClawPathTool } from "./tools/resolve-openclaw-path-tool.js";

describe("resolve_openclaw_path tool", () => {
  it("uses manifest-derived project root and workspace root when no tool roots are provided", async () => {
    const tool = createResolveOpenClawPathTool();

    const result = await tool.execute("resolve-path", {
      path: "docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
      actorProfile: "repo-executor",
    });

    const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
    const parsed = JSON.parse(text);
    expect(parsed.canonicalOwner).toBe("product_repo");
    expect(parsed.canonicalPath).toBe(
      "/root/services/openclaw-roles/live/docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
    );
    expect(parsed.safeWorkspaceSearchExample).toContain("'/root/.openclaw/workspace'");
  });

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

  it("uses explicit operator workspace scope for project documents", async () => {
    const tool = createResolveOpenClawPathTool({
      workspaceDir: "/root/.openclaw/workspace",
    });

    const result = await tool.execute("resolve-path", {
      path: "docs/projects",
      scope: "operator_workspace",
    });

    const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
    const parsed = JSON.parse(text);
    expect(parsed.canonicalOwner).toBe("operator_workspace");
    expect(parsed.canonicalPath).toBe("/root/.openclaw/workspace/docs/projects");
    expect(parsed.allowedEditSurface).toBe("direct");
  });
});
