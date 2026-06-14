import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { resolveRuntimeAgentWorkspaceRoots } from "./runtime-workspace-locator.js";

async function createExecutionRepo(root: string): Promise<void> {
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "extensions", "execution-platform"), { recursive: true });
}

describe("runtime workspace locator", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the native agent runtime as four caller-visible roots", async () => {
    const runtimeRepo = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-agent-roots-"));
    const runtimeState = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-agent-state-"));
    await createExecutionRepo(runtimeRepo);
    vi.stubEnv("OPENCLAW_STATE_DIR", runtimeState);
    vi.stubEnv("OPENCLAW_HOST_OPERATOR_REPO_ROOT", runtimeRepo);
    const config = {
      agents: {
        list: [
          {
            id: "execution-orchestrator",
            projectRoot: "/unmounted/source/repo",
          },
        ],
      },
    } as OpenClawConfig;

    expect(
      resolveRuntimeAgentWorkspaceRoots({
        config,
        agentId: "execution-orchestrator",
      }),
    ).toEqual({
      agentId: "execution-orchestrator",
      canonicalSourceRoot: path.resolve(runtimeRepo),
      runtimeWorkspaceDir: path.resolve(runtimeRepo),
      transcriptRoot: path.join(
        runtimeState,
        "runtime",
        "native-execution",
        "agents",
        "execution-orchestrator",
        "sessions",
      ),
      artifactRoot: path.join(runtimeState, "runtime", "native-execution", "artifacts"),
      resolutionSource: "host_operator_repo_root",
    });
  });

  it("keeps native transcripts under runtime state even when agent assets are source-backed", async () => {
    const runtimeRepo = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-agent-source-"));
    const runtimeState = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-agent-source-state-"));
    await createExecutionRepo(runtimeRepo);
    vi.stubEnv("OPENCLAW_STATE_DIR", runtimeState);
    const config = {
      agents: {
        list: [
          {
            id: "execution-orchestrator",
            projectRoot: runtimeRepo,
          },
        ],
      },
    } as OpenClawConfig;

    const roots = resolveRuntimeAgentWorkspaceRoots({
      config,
      agentId: "execution-orchestrator",
    });

    expect(roots.canonicalSourceRoot).toBe(path.resolve(runtimeRepo));
    expect(roots.runtimeWorkspaceDir).toBe(path.resolve(runtimeRepo));
    expect(roots.transcriptRoot).not.toContain(path.join(runtimeRepo, "agents"));
    expect(roots.transcriptRoot).toContain(path.join(runtimeState, "runtime", "native-execution"));
  });
});
