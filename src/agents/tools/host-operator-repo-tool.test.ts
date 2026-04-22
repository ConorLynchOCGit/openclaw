import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostOperatorRepoTool } from "./host-operator-repo-tool.js";

let tempRoot: string;
let repoRoot: string;
let canonicalRoot: string;
let importRoot: string;
let workspaceRoot: string;
let canonicalWorkspaceRoot: string;
let auditDir: string;

async function makeEnv(overrides: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  return {
    OPENCLAW_HOST_OPERATOR_REPO_ROOT: repoRoot,
    OPENCLAW_HOST_OPERATOR_CANONICAL_REPO_ROOT: canonicalRoot,
    OPENCLAW_HOST_OPERATOR_PRODUCT_IMPORT_ROOT: importRoot,
    OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT: workspaceRoot,
    OPENCLAW_HOST_OPERATOR_CANONICAL_WORKSPACE_ROOT: canonicalWorkspaceRoot,
    OPENCLAW_HOST_OPERATOR_AUDIT_DIR: auditDir,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function readJsonResult(
  result: Awaited<ReturnType<ReturnType<typeof createHostOperatorRepoTool>["execute"]>>,
) {
  const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-host-operator-"));
  repoRoot = path.join(tempRoot, "repo");
  canonicalRoot = "/root/services/openclaw-roles/live";
  importRoot = path.join(tempRoot, "import");
  workspaceRoot = path.join(tempRoot, "workspace");
  canonicalWorkspaceRoot = "/root/.openclaw/workspace";
  auditDir = path.join(tempRoot, "audit");
  await fs.mkdir(path.join(repoRoot, "docs/agents/web-researcher"), { recursive: true });
  await fs.mkdir(path.join(importRoot, "docs/agents/web-researcher"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "docs/agents/web-researcher"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "projects/ops"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "system/hostfs"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "docs/agents/web-researcher/README.md"),
    "canonical web researcher docs\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "docs/agents/web-researcher/Identity.md"),
    "workspace web researcher identity\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "projects/ops/CURRENT_SLICE.md"),
    "ops slice\n",
    "utf-8",
  );
  await fs.writeFile(path.join(workspaceRoot, "USER.md"), "private user profile\n", "utf-8");
  await fs.writeFile(path.join(workspaceRoot, "system/hostfs/secret.txt"), "secret\n", "utf-8");
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("host_operator_repo tool", () => {
  it("reports status while disabled but blocks repo reads", async () => {
    const tool = createHostOperatorRepoTool({ env: await makeEnv(), now: () => 1000 });

    const status = readJsonResult(await tool.execute("call-1", { action: "status" }));
    expect(status.enabled).toBe(false);
    expect(status.mounted).toBe(true);
    expect(status.roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "live_repo", mounted: true }),
        expect.objectContaining({ scope: "operator_workspace", mounted: true }),
      ]),
    );

    await expect(tool.execute("call-2", { action: "read", path: "README.md" })).rejects.toThrow(
      "host-operator mode is disabled",
    );
  });

  it("maps canonical and import paths to the scoped repo mount for reads", async () => {
    const tool = createHostOperatorRepoTool({
      env: await makeEnv({ OPENCLAW_HOST_OPERATOR_ENABLED: "1" }),
      now: () => 1000,
    });

    const fromCanonical = readJsonResult(
      await tool.execute("call-1", {
        action: "read",
        path: "/root/services/openclaw-roles/live/docs/agents/web-researcher/README.md",
      }),
    );
    const fromImport = readJsonResult(
      await tool.execute("call-2", {
        action: "read",
        path: path.join(importRoot, "docs/agents/web-researcher/README.md"),
      }),
    );

    expect(fromCanonical.content).toContain("canonical web researcher docs");
    expect(fromImport.content).toContain("canonical web researcher docs");
    expect(String(fromCanonical.auditPath)).toContain(auditDir);
  });

  it("maps canonical workspace docs to the scoped workspace mount for reads", async () => {
    const tool = createHostOperatorRepoTool({
      env: await makeEnv({ OPENCLAW_HOST_OPERATOR_ENABLED: "1" }),
      now: () => 1000,
    });

    const fromCanonical = readJsonResult(
      await tool.execute("call-1", {
        action: "read",
        path: "/root/.openclaw/workspace/docs/agents/web-researcher/Identity.md",
      }),
    );
    const fromExplicitScope = readJsonResult(
      await tool.execute("call-2", {
        action: "read",
        scope: "operator_workspace",
        path: "docs/agents/web-researcher/Identity.md",
      }),
    );

    expect(fromCanonical.scope).toBe("operator_workspace");
    expect(fromCanonical.content).toContain("workspace web researcher identity");
    expect(fromExplicitScope.canonicalPath).toBe(
      "/root/.openclaw/workspace/docs/agents/web-researcher/Identity.md",
    );
  });

  it("edits only when write kill switch is enabled and blocks path escapes", async () => {
    const readOnlyTool = createHostOperatorRepoTool({
      env: await makeEnv({ OPENCLAW_HOST_OPERATOR_ENABLED: "1" }),
    });
    await expect(
      readOnlyTool.execute("call-1", {
        action: "edit",
        path: "docs/agents/web-researcher/README.md",
        edits: [{ oldText: "canonical", newText: "updated" }],
      }),
    ).rejects.toThrow("host-operator writes are disabled");

    const writeTool = createHostOperatorRepoTool({
      env: await makeEnv({
        OPENCLAW_HOST_OPERATOR_ENABLED: "1",
        OPENCLAW_HOST_OPERATOR_WRITE_ENABLED: "1",
      }),
    });
    const edited = readJsonResult(
      await writeTool.execute("call-2", {
        action: "edit",
        path: "docs/agents/web-researcher/README.md",
        edits: [{ oldText: "canonical", newText: "updated" }],
      }),
    );
    await expect(
      writeTool.execute("call-3", { action: "read", path: "../outside" }),
    ).rejects.toThrow("path escapes");
    expect(edited.edited).toBe(true);
    await expect(
      fs.readFile(path.join(repoRoot, "docs/agents/web-researcher/README.md"), "utf-8"),
    ).resolves.toContain("updated web researcher docs");
  });

  it("edits approved workspace project docs but protects root human-owned memory files", async () => {
    const writeTool = createHostOperatorRepoTool({
      env: await makeEnv({
        OPENCLAW_HOST_OPERATOR_ENABLED: "1",
        OPENCLAW_HOST_OPERATOR_WRITE_ENABLED: "1",
      }),
    });

    const edited = readJsonResult(
      await writeTool.execute("call-1", {
        action: "edit",
        scope: "operator_workspace",
        path: "projects/ops/CURRENT_SLICE.md",
        edits: [{ oldText: "ops slice", newText: "ops updated" }],
      }),
    );

    expect(edited.scope).toBe("operator_workspace");
    await expect(
      fs.readFile(path.join(workspaceRoot, "projects/ops/CURRENT_SLICE.md"), "utf-8"),
    ).resolves.toContain("ops updated");
    await expect(
      writeTool.execute("call-2", {
        action: "edit",
        path: "/root/.openclaw/workspace/USER.md",
        edits: [{ oldText: "private", newText: "changed" }],
      }),
    ).rejects.toThrow("protected");
  });

  it("blocks noisy or sensitive workspace mirrors", async () => {
    const tool = createHostOperatorRepoTool({
      env: await makeEnv({ OPENCLAW_HOST_OPERATOR_ENABLED: "1" }),
    });

    await expect(
      tool.execute("call-1", {
        action: "read",
        path: "/root/.openclaw/workspace/system/hostfs/secret.txt",
      }),
    ).rejects.toThrow("not approved");
  });

  it("runs only allowlisted commands when exec kill switch is enabled", async () => {
    const disabled = createHostOperatorRepoTool({
      env: await makeEnv({ OPENCLAW_HOST_OPERATOR_ENABLED: "1" }),
    });
    await expect(
      disabled.execute("call-1", { action: "exec", command: ["git", "status", "--short"] }),
    ).rejects.toThrow("host-operator exec is disabled");

    const enabled = createHostOperatorRepoTool({
      env: await makeEnv({
        OPENCLAW_HOST_OPERATOR_ENABLED: "1",
        OPENCLAW_HOST_OPERATOR_EXEC_ENABLED: "1",
      }),
    });
    const result = readJsonResult(
      await enabled.execute("call-2", { action: "exec", command: ["pwd"] }),
    );
    expect(result.exitCode).toBe(0);

    await expect(
      enabled.execute("call-3", { action: "exec", command: ["sh", "-lc", "echo unsafe"] }),
    ).rejects.toThrow("command is not allowed");
    await expect(
      enabled.execute("call-4", {
        action: "exec",
        scope: "operator_workspace",
        command: ["pwd"],
      }),
    ).rejects.toThrow("exec is allowed only in live_repo");
  });
});
