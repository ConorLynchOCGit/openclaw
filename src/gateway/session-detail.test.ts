import { describe, expect, it } from "vitest";
import { buildGatewaySessionDetailProjection } from "./session-detail.js";
import type { GatewaySessionRow } from "./session-utils.types.js";

describe("buildGatewaySessionDetailProjection", () => {
  it("projects enriched Codex session evidence at top level while preserving the legacy nested session", () => {
    const row = {
      key: "agent:coding:subagent:proof",
      agentId: "coding",
      kind: "direct",
      updatedAt: Date.parse("2026-07-10T02:50:00.000Z"),
      sessionId: "coding-session-id",
      status: "done",
      spawnedWorkspaceDir: "/home/node/.openclaw/workspace",
      spawnedCwd: "/home/node/.openclaw/workspace",
      finalAssistantText: "substrate proof complete",
      activeProgress: null,
      promptContext: {
        codexNativeSurface: {
          owner: "codex_app_server",
          openclawDynamicTools: { count: 0, names: [] },
          workbenchCapability: {
            workspaceRoot: "/home/node/.openclaw/workspace",
            sourceRoot: "/home/node/.openclaw/workspace/src/openclaw",
            workbenchRoot: "/home/node/.openclaw/workspace",
            pluginRoot:
              "/home/node/.openclaw/workspace/src/openclaw/.agents/plugins/plugins/openclaw-coding-workbench",
          },
        } as NonNullable<GatewaySessionRow["promptContext"]>["codexNativeSurface"],
      },
      codexExecutionEvidence: {
        source: "trajectory",
        ref: "trajectory:coding-session-id",
        derivedBy: "readCodexExecutionEvidenceProjection",
        bounded: true,
        observedEventCount: 12,
        toolCallCount: 4,
        toolResultCount: 4,
        workspaceDirs: ["/home/node/.openclaw/workspace"],
        mcpTools: [
          {
            server: "openclaw_repo_workbench",
            tool: "repo_search_many",
            count: 1,
            completed: 1,
            roots: ["/home/node/.openclaw/workspace"],
          },
        ],
      },
      codexNativeChildRuns: [
        {
          source: "codex-native",
          taskId: "child-1",
          childThreadId: "thread-child",
          role: "codex_reviewer",
          objective: "review substrate proof evidence",
          status: "completed",
        },
      ],
    } satisfies GatewaySessionRow;

    const result = buildGatewaySessionDetailProjection({
      row,
      requestedSessionKey: "agent:coding:subagent:proof",
      agentId: "coding",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.detail.promptContext?.codexNativeSurface).toMatchObject({
      owner: "codex_app_server",
      openclawDynamicTools: { count: 0, names: [] },
    });
    expect(result.detail.promptContext?.codexNativeSurface?.workbenchCapability).toMatchObject({
      workspaceRoot: "/home/node/.openclaw/workspace",
      sourceRoot: "/home/node/.openclaw/workspace/src/openclaw",
      workbenchRoot: "/home/node/.openclaw/workspace",
    });
    expect(result.detail.codexExecutionEvidence?.mcpTools?.[0]).toMatchObject({
      server: "openclaw_repo_workbench",
      tool: "repo_search_many",
    });
    expect(result.detail.codexNativeChildRuns?.[0]).toMatchObject({
      role: "codex_reviewer",
      objective: "review substrate proof evidence",
    });
    expect(result.detail.spawnedWorkspaceDir).toBe("/home/node/.openclaw/workspace");
    expect(result.detail.spawnedCwd).toBe("/home/node/.openclaw/workspace");
    expect(result.detail.session.promptContext?.codexNativeSurface).toBe(
      result.detail.promptContext?.codexNativeSurface,
    );
    expect(result.detail.session.codexExecutionEvidence).toBe(result.detail.codexExecutionEvidence);
    expect(result.detail.session.codexNativeChildRuns).toBe(result.detail.codexNativeChildRuns);
  });
});
