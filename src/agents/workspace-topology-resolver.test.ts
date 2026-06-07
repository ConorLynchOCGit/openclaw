import { describe, expect, it } from "vitest";
import {
  buildSafeWorkspaceSearchCommand,
  resolveOpenClawPath,
  resolveOpenClawPathRoots,
} from "./workspace-topology-resolver.js";

const liveRepoRoot = "/root/services/openclaw-roles/live";
const workspaceRoot = "/root/.openclaw/workspace";

describe("workspace topology resolver", () => {
  it("derives default implementation and workspace roots from the source-runtime manifest", () => {
    const roots = resolveOpenClawPathRoots();
    const result = resolveOpenClawPath(
      "docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
      { actorProfile: "repo-executor" },
    );
    const command = buildSafeWorkspaceSearchCommand("native task worker");

    expect(roots).toEqual({
      liveRepoRoot: "/root/services/openclaw-roles/live",
      runtimeHome: "/root/.openclaw",
      workspaceRoot: "/root/.openclaw/workspace",
    });
    expect(result.canonicalOwner).toBe("product_repo");
    expect(result.canonicalPath).toBe(
      "/root/services/openclaw-roles/live/docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
    );
    expect(command).toContain("'/root/.openclaw/workspace'");
  });

  it("resolves curated product imports to the canonical live repo path", () => {
    const result = resolveOpenClawPath(
      "/root/.openclaw/workspace/imports/product_live/content/docs/agents/web-researcher/README.md",
      { liveRepoRoot, workspaceRoot },
    );

    expect(result.canonicalOwner).toBe("product_repo");
    expect(result.canonicalPath).toBe(
      "/root/services/openclaw-roles/live/docs/agents/web-researcher/README.md",
    );
    expect(result.writablePath).toBeNull();
    expect(result.allowedEditSurface).toBe("repo_executor_required");
    expect(result.requiredEscalation).toBe("needs repo executor / host write bridge");
  });

  it("lets host-operator mode target the live repo path without treating imports as writable", () => {
    const result = resolveOpenClawPath("Web Researcher agent pack docs", {
      liveRepoRoot,
      workspaceRoot,
      actorProfile: "host-operator",
    });

    expect(result.canonicalOwner).toBe("product_repo");
    expect(result.canonicalPath).toBe(
      "/root/services/openclaw-roles/live/docs/agents/web-researcher",
    );
    expect(result.writablePath).toBe(result.canonicalPath);
    expect(result.readOnlyMirrorPaths).toContain(
      "/root/.openclaw/workspace/imports/product_live/content/docs/agents/web-researcher",
    );
    expect(result.allowedEditSurface).toBe("direct");
  });

  it("resolves explicit operator workspace project surfaces", () => {
    const docsResult = resolveOpenClawPath("operator_workspace docs/projects", {
      liveRepoRoot,
      workspaceRoot,
      actorProfile: "host-operator",
    });
    const legacyProjectsResult = resolveOpenClawPath("projects", {
      liveRepoRoot,
      workspaceRoot,
      ownerHint: "operator_workspace",
    });

    expect(docsResult.canonicalOwner).toBe("operator_workspace");
    expect(docsResult.canonicalPath).toBe("/root/.openclaw/workspace/docs/projects");
    expect(docsResult.allowedEditSurface).toBe("direct");
    expect(legacyProjectsResult.canonicalOwner).toBe("operator_workspace");
    expect(legacyProjectsResult.canonicalPath).toBe("/root/.openclaw/workspace/projects");
  });

  it("identifies generated projection paths as generated non-truth artifacts", () => {
    const result = resolveOpenClawPath(
      "/root/.openclaw/workspace/.openclaw/model-memory/projections/memory-md-a.json",
      { liveRepoRoot, workspaceRoot, actorProfile: "host-operator" },
    );

    expect(result.canonicalOwner).toBe("generated_projection");
    expect(result.classification.generated).toBe(true);
    expect(result.writablePath).toBeNull();
    expect(result.allowedEditSurface).toBe("none");
  });

  it("keeps safe workspace search pruned away from hostfs and runtime artifacts", () => {
    const command = buildSafeWorkspaceSearchCommand("web researcher", workspaceRoot);

    expect(command).toContain("rg --hidden");
    expect(command).toContain("!system/hostfs/proc/**");
    expect(command).toContain("!**/.openclaw-memory-ops/**");
    expect(command).toContain("!**/.artifacts/**");
  });
});
